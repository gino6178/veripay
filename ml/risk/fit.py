"""Done-Risk: for a job about to be agreed, the probability it ends in a dispute and the probability it runs over its
agreed price (a change order), so the platform can size the authorization's buffer and send risky jobs to review.
Not an LLM. Ported from Cover-Risk (D:\\paypal\\cover\\ml\\risk).

1. A synthetic job portfolio from a stated generator (GENERATOR below). Each job has its trade and task (ml/catalog.mjs
   tasks), the agreed price against the hirer's ceiling, the parts allowance, the window, the number of
   done-conditions and the gaps the scope review found (vague or uncheckable conditions), the pro's record (jobs done
   on the platform, rating, licence where the trade needs one), the hirer's history (first job, past disputes), and
   whether the scope came with a problem photo. Dispute and overrun are drawn from logistic models whose coefficients
   are stated, with hidden effects the baseline lacks (curves and interactions), so the truth is known.
2. A logistic-regression baseline on the same features.
3. LightGBM (binary) with monotone constraints where the direction is known: more scope gaps, a first-time hirer and
   past disputes never lower the risk; more completed jobs, a higher rating, a licence and a problem photo never
   raise it.
4. On a held-out portfolio: AUC (with bootstrap intervals and LightGBM minus baseline paired), the Brier score,
   calibration by decile, and SHAP (LightGBM's TreeSHAP) per feature.
5. Export: done_risk_<target>.json (trees, feature encodings, the logit link) for ml/risk/risk.mjs in Node.
   python ml/risk/fit.py --out ml/risk/out [--n 200000]
What these numbers show: that the model learnt the generator's assumptions. They are not platform experience.
"""
import argparse, json, os, math
import numpy as np, pandas as pd

TASKS = {  # id: (trade, labor low, high, part high, licensed trade)
    "faucet_cartridge": ("plumbing", 120, 220, 45, True), "toilet_fill_valve": ("plumbing", 110, 200, 35, True), "drain_clog": ("plumbing", 90, 180, 0, True),
    "disposal_replace": ("plumbing", 150, 260, 160, True), "water_heater": ("plumbing", 900, 1800, 900, True), "deep_clean": ("cleaning", 140, 260, 0, False),
    "move_out_clean": ("cleaning", 220, 380, 0, False), "tv_mount": ("handyman", 120, 220, 70, False), "furniture_assembly": ("handyman", 100, 200, 0, False),
    "drywall_patch": ("handyman", 110, 210, 55, False), "fence_repair": ("handyman", 300, 900, 250, False), "light_fixture": ("electrical", 120, 260, 120, True),
}
GENERATOR = {
    "dispute": "logit = -3.2 + 0.55 gaps + 0.35 (gaps>=2) + 0.6 first_time_hirer + 0.5 past_disputes + 0.9 (price/ceiling > 0.95) - 0.25 log1p(pro_jobs) - 0.8 (rating-4.5) "
               "- 0.4 licensed_if_needed + 0.5 unlicensed_in_licensed_trade - 0.3 problem_photo + 0.25 (window_days<=1) + 0.15 checks + trade (cleaning +0.3, electrical +0.2); hidden: rating below 4.2 x first-time hirer +0.5",
    "overrun": "logit = -2.6 + 0.4 gaps + 1.1 (parts_allowance/part_estimate < 0.8) + 0.002 (price-200) cap 1.5 - 0.2 log1p(pro_jobs) - 0.35 problem_photo + trade (plumbing +0.4 for water_heater +0.6, cleaning -0.5) "
               "+ 0.3 (window_days<=1); hidden: an old-home flag (age>40, unseen to the hirer's scope) +0.5 on plumbing",
}
TRADES = ["plumbing", "cleaning", "handyman", "electrical"]

def draw(r, n):
    ids = list(TASKS); task = r.choice(ids, n)
    trade = np.array([TASKS[t][0] for t in task]); lo = np.array([TASKS[t][1] for t in task]); hi = np.array([TASKS[t][2] for t in task]); part = np.array([TASKS[t][3] for t in task])
    lic_trade = np.array([TASKS[t][4] for t in task])
    est = lo + (hi - lo) * r.beta(2, 2, n) + part * r.uniform(0.5, 1.0, n)
    ceiling = np.round(est * r.uniform(0.85, 1.6, n) / 5) * 5; price = np.minimum(ceiling, np.round(est * r.uniform(0.85, 1.15, n) / 5) * 5)
    allowance = np.where(part > 0, np.round(part * r.uniform(0.6, 1.4, n)), 0)
    df = pd.DataFrame({"task": task, "trade": trade, "price": price, "ceiling": ceiling, "price_to_ceiling": price / ceiling, "parts_allowance": allowance,
                       "part_estimate": part, "allowance_to_parts": np.where(part > 0, allowance / np.maximum(part, 1), 1.0), "checks": r.integers(2, 7, n),
                       "gaps": r.choice([0, 0, 0, 1, 1, 2, 3], n), "window_days": r.choice([1, 1, 2, 3, 5, 7, 14], n), "pro_jobs": np.floor(r.exponential(25, n)).astype(int),
                       "pro_rating": np.clip(r.normal(4.6, 0.3, n), 3.0, 5.0).round(1), "pro_licensed": (r.random(n) < np.where(lic_trade, 0.8, 0.3)).astype(int), "licensed_trade": lic_trade.astype(int),
                       "first_time_hirer": (r.random(n) < 0.35).astype(int), "hirer_past_disputes": r.choice([0, 0, 0, 0, 0, 1, 2], n), "problem_photo": (r.random(n) < 0.6).astype(int),
                       "old_home": (r.random(n) < 0.3).astype(int)})
    return df

def truth(df):
    d = df; ss = lambda x: 1 / (1 + np.exp(-x))
    zd = (-3.2 + 0.55 * d.gaps + 0.35 * (d.gaps >= 2) + 0.6 * d.first_time_hirer + 0.5 * d.hirer_past_disputes + 0.9 * (d.price_to_ceiling > 0.95) - 0.25 * np.log1p(d.pro_jobs)
          - 0.8 * (d.pro_rating - 4.5) - 0.4 * (d.licensed_trade & d.pro_licensed) + 0.5 * (d.licensed_trade & (1 - d.pro_licensed)) - 0.3 * d.problem_photo + 0.25 * (d.window_days <= 1)
          + 0.15 * d.checks + 0.3 * (d.trade == "cleaning") + 0.2 * (d.trade == "electrical") + 0.5 * ((d.pro_rating < 4.2) & (d.first_time_hirer == 1)))
    zo = (-2.6 + 0.4 * d.gaps + 1.1 * (d.allowance_to_parts < 0.8) + np.minimum(1.5, 0.002 * (d.price - 200).clip(lower=0)) - 0.2 * np.log1p(d.pro_jobs) - 0.35 * d.problem_photo
          + 0.4 * (d.trade == "plumbing") + 0.6 * (d.task == "water_heater") - 0.5 * (d.trade == "cleaning") + 0.3 * (d.window_days <= 1) + 0.5 * ((d.old_home == 1) & (d.trade == "plumbing")))
    return ss(zd), ss(zo)

# the old-home flag is in the truth, not in the features: the platform doesn't know it (a hidden cause)
FEATURES = ["trade", "price", "price_to_ceiling", "parts_allowance", "allowance_to_parts", "checks", "gaps", "window_days", "pro_jobs", "pro_rating", "pro_licensed", "licensed_trade",
            "first_time_hirer", "hirer_past_disputes", "problem_photo"]
MONO = {"dispute": {"gaps": 1, "first_time_hirer": 1, "hirer_past_disputes": 1, "pro_jobs": -1, "pro_rating": -1, "problem_photo": -1},
        "overrun": {"gaps": 1, "pro_jobs": -1, "problem_photo": -1, "allowance_to_parts": -1}}

def X_of(df):
    X = df[FEATURES].copy(); X["trade"] = X["trade"].map({t: i for i, t in enumerate(TRADES)}).astype(int); return X

def auc(y, p):
    o = np.argsort(p); y = np.asarray(y)[o]; n1 = y.sum(); n0 = len(y) - n1
    ranks = np.arange(1, len(y) + 1); return float((ranks[y == 1].sum() - n1 * (n1 + 1) / 2) / (n1 * n0))

def export(name, booster, out):
    d = booster.dump_model()
    def node(t):
        if "leaf_value" in t: return {"v": t["leaf_value"]}
        dt = t["decision_type"]; th = t["threshold"]
        return {"f": t["split_feature"], **({"cat": [int(x) for x in str(th).split("||")]} if dt == "==" else {"t": th}), "dl": t["default_left"], "v": t.get("internal_value", 0), "l": node(t["left_child"]), "r": node(t["right_child"])}
    spec = {"target": name, "version": f"done-risk-{name}-r1", "link": "logit", "features": FEATURES, "encode": {f: ({"choice": TRADES} if f == "trade" else {"number": True}) for f in FEATURES},
            "monotone": MONO[name], "trees": [node(t["tree_structure"]) for t in d["tree_info"]], "generator": GENERATOR[name]}
    json.dump(spec, open(os.path.join(out, f"done_risk_{name}.json"), "w"), separators=(",", ":"))

def main():
    import lightgbm as lgb
    from sklearn.linear_model import LogisticRegression
    ap = argparse.ArgumentParser(); ap.add_argument("--out", required=True); ap.add_argument("--n", type=int, default=200000); ap.add_argument("--threads", type=int, default=3)
    a = ap.parse_args(); os.makedirs(a.out, exist_ok=True); r = np.random.default_rng(42)
    tr, te = draw(r, a.n), draw(r, a.n // 4); pd_tr, po_tr = truth(tr); pd_te, po_te = truth(te)
    Xtr, Xte = X_of(tr), X_of(te); report = {}
    for name, p_tr, p_te in [("dispute", pd_tr, pd_te), ("overrun", po_tr, po_te)]:
        y_tr = (r.random(len(tr)) < p_tr).astype(int); y_te = (r.random(len(te)) < p_te).astype(int)
        mono = [MONO[name].get(c, 0) for c in FEATURES]
        params = {"objective": "binary", "learning_rate": 0.05, "num_leaves": 31, "min_data_in_leaf": 200, "feature_fraction": 0.9, "bagging_fraction": 0.8, "bagging_freq": 1,
                  "monotone_constraints": mono, "monotone_constraints_method": "advanced", "verbose": -1, "num_threads": a.threads}
        cut = int(len(Xtr) * 0.85)
        b = lgb.train(params, lgb.Dataset(Xtr.iloc[:cut], y_tr[:cut], categorical_feature=["trade"]), 2000, valid_sets=[lgb.Dataset(Xtr.iloc[cut:], y_tr[cut:], categorical_feature=["trade"])],
                      callbacks=[lgb.early_stopping(100, verbose=False)])
        best = b.best_iteration; b = lgb.train(params, lgb.Dataset(Xtr, y_tr, categorical_feature=["trade"]), best)
        D = lambda X: pd.get_dummies(X.assign(trade=X["trade"].astype(str)), columns=["trade"], dtype=float)
        Dtr = D(Xtr); Dte = D(Xte).reindex(columns=Dtr.columns, fill_value=0.0); mu, sd = Dtr.mean(), Dtr.std().replace(0, 1)
        lr = LogisticRegression(max_iter=2000).fit((Dtr - mu) / sd, y_tr)
        p_l, p_g = b.predict(Xte), lr.predict_proba((Dte - mu) / sd)[:, 1]
        rr = np.random.default_rng(7); bs = {"lightgbm": [], "logistic": [], "diff": []}
        for _ in range(200):
            i = rr.integers(0, len(te), len(te)); a1, a2 = auc(y_te[i], p_l[i]), auc(y_te[i], p_g[i]); bs["lightgbm"].append(a1); bs["logistic"].append(a2); bs["diff"].append(a1 - a2)
        ci = {k: [round(float(np.percentile(v, 2.5)), 4), round(float(np.percentile(v, 97.5)), 4)] for k, v in bs.items()}
        o = np.argsort(p_l); parts = np.array_split(o, 10)
        contrib = b.predict(Xte, pred_contrib=True); shap = {c: round(float(np.abs(contrib[:, i]).mean()), 4) for i, c in enumerate(FEATURES)}
        viol = 0
        for c, sgn in MONO[name].items():
            X2 = Xte.iloc[:2000].copy(); X2[c] = X2[c] + (1 if X2[c].max() > 1.5 else 0.1); viol += int(((b.predict(X2) - p_l[:2000]) * sgn < -1e-9).sum())
        res = {"jobs_train": len(tr), "jobs_test": len(te), "base_rate_test": round(float(y_te.mean()), 4), "trees": best,
               "auc": {"lightgbm": round(auc(y_te, p_l), 4), "logistic": round(auc(y_te, p_g), 4), "true_probability": round(auc(y_te, p_te), 4)}, "auc_ci95": ci,
               "brier": {"lightgbm": round(float(np.mean((p_l - y_te) ** 2)), 5), "logistic": round(float(np.mean((p_g - y_te) ** 2)), 5), "true_probability": round(float(np.mean((p_te - y_te) ** 2)), 5)},
               "calibration_lightgbm": [{"decile": k + 1, "predicted": round(float(p_l[q].mean()), 4), "actual": round(float(y_te[q].mean()), 4)} for k, q in enumerate(parts)],
               "shap_mean_abs": dict(sorted(shap.items(), key=lambda x: -x[1])), "monotone_violations": viol, "generator": GENERATOR[name]}
        export(name, b, a.out)
        json.dump([{"job": {k: (v.item() if hasattr(v, "item") else v) for k, v in rec.items() if k in FEATURES}, "predicted": float(pp)} for rec, pp in zip(te.iloc[:50].to_dict("records"), p_l[:50])],
                  open(os.path.join(a.out, f"check_{name}.json"), "w"))
        report[name] = res
        print(name, json.dumps({k: res[k] for k in ("base_rate_test", "auc", "auc_ci95", "brier", "monotone_violations", "trees")}), flush=True)
    json.dump(report, open(os.path.join(a.out, "results.json"), "w"), indent=1)
    print("RISK_DONE")

if __name__ == "__main__":
    main()
