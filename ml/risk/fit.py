"""Cover-Risk (PLAN-cover.md 12.2): each policy's expected yearly claims, for pricing, with the reasons. Not an LLM.

1. A synthetic US portfolio from a stated actuarial generator (below, GENERATOR): for each product, policies with
   the product's own answers (api/src/products/*.json) and a ZIP prefix's five hazard levels (flood, wildfire,
   hurricane, earthquake, theft) exactly as api/src/zones.js zoneOf() gives them (zones.json; metro prefixes are
   drawn five times as often, for their population). Claim counts are Poisson(frequency x exposure), each claim's cost Gamma(shape k, mean severity).
   The true pure premium is the product's own factor table times hidden effects the tables don't have (curved ages
   and mileage, interactions such as a frame house x wildfire level 3), so a model can beat the tables, and its truth
   is known.
2. A GLM baseline, the actuaries' standard: Poisson frequency (log link, exposure offset) x Gamma severity (log link),
   on the same features (choices one-hot, numbers linear).
3. LightGBM, Tweedie loss on the yearly loss (weighted by exposure), with monotone constraints where the direction is
   known (an older home, more past claims, more miles, a higher hazard level never lower the price; a higher deductible
   or copay, or more years of driving, never raise it).
4. Scores on a held-out portfolio: normalised Gini (exposure-weighted Lorenz on the actual losses), calibration by
   decile (predicted against actual losses), the share of the true premium's Gini each model reaches, and SHAP
   (LightGBM's exact TreeSHAP, pred_contrib) mean |contribution| per feature.
5. Export: risk_<product>.json (the trees, the features' encodings, the link) that ml/risk/risk.mjs evaluates in Node.
   It is not wired into the app (quote.js's useRiskModel takes it when the app line wants it).
   python ml/risk/fit.py --out ml/risk/out [--n 200000]
What these numbers show: that the model learnt the generator's assumptions. They are not claims experience.
"""
import argparse, json, os, math
import numpy as np, pandas as pd

HERE = os.path.dirname(os.path.abspath(__file__))
PDIR = os.path.join(HERE, "..", "..", "api", "src", "products")
Z = json.load(open(os.path.join(HERE, "zones.json"), encoding="utf8"))
PERILS = Z["perils"]
PREFIXES = [x for x in Z["prefixes"] for _ in range(5 if x["metro"] else 1)]

# ---- the generator, stated: frequency per policy-year, mean severity in cents, Gamma shape, and the hidden effects
GENERATOR = {
    "renters": {"freq": 0.07, "shape": 1.2, "hidden": "contents scale as (contents/8000)^0.8 not linearly; theft level 3 x walk-up apartment on the ground floor x1.6; hurricane level 3 x ground floor x1.2; first-time claimants (claims3y 0) x0.85"},
    "home": {"freq": 0.06, "shape": 0.9, "hidden": "age curve exp(0.008 x age) in place of the age bands; frame house x wildfire level 3 x1.5; hurricane level 3 x age over 40 x1.3; flood level 3 x house x1.15 (sewer backup)"},
    "pet": {"freq": 0.45, "shape": 1.5, "hidden": "age curve exp(0.09 x ageYears) in place of the age bands; flat-faced breeds x1.2 more over age 6; chipped x0.95"},
    "car": {"freq": 0.12, "shape": 1.1, "hidden": "experience curve 1 + 0.6 x exp(-years/3) in place of the bands; (milesMonth/800)^0.5 in place of the linear mileage; telematics x0.85; street parking x theft level 3 x1.4; hurricane level 3 x1.1"},
}
PRODUCTS = {p: json.load(open(os.path.join(PDIR, f"{p}.json"), encoding="utf8")) for p in GENERATOR}

def bucket(table, v):
    k = str(v)
    if k in table: return k
    for key in table:
        a = key.replace("+", "-1000000").split("-")
        if len(a) == 2 and a[0].isdigit() and float(a[0]) <= float(v) <= float(a[1]): return key
    return None

def table_premium(p, a, z):
    """The product's own factor table (quote.js expected(), without add-ons): cents a year."""
    pr = PRODUCTS[p]["price"]; base = pr["base"][a["vehicle"]] if isinstance(pr["base"], dict) else pr["base"]; x = 1.0
    for q, t in pr.get("factors", {}).items():
        k = bucket(t, a.get(q))
        if k is not None and t[k] is not None: x *= t[k]
    for q, rule in pr.get("per", {}).items():
        if rule.get("only") and a.get("level") not in rule["only"]: continue
        x *= 1 + max(0, float(a.get(q, 0)) / rule["every"]) * rule["add"]
    for kind, on in pr.get("zone", {}).items():
        if on: x *= Z["factor"][kind][z[kind]]
    return base * x * pr.get("rateChange", 1)

def draw(p, r, n):
    """n policies: answers, district levels, exposure."""
    P = PRODUCTS[p]; rows = []
    for _ in range(n):
        a = {}
        for q in P["questions"]:
            if q["type"] == "choice": a[q["id"]] = q["options"][r.integers(len(q["options"]))]["v"]
            elif q["type"] == "number":
                lo, hi = q["min"], q["max"]
                if q["id"] in ("claims3y", "accidents3y"): a[q["id"]] = int(r.choice([0, 0, 0, 0, 0, 1, 1, 2, 3]))
                else: a[q["id"]] = int(round(lo + (hi - lo) * r.beta(1.6, 3.0)))
            elif q["type"] == "bool": a[q["id"]] = bool(r.random() < 0.5)
        z = PREFIXES[r.integers(len(PREFIXES))]
        rows.append({**a, **{f"z_{k}": z["levels"][k] for k in PERILS}, "zip3": z["prefix"], "state": z["state"], "exposure": float(r.uniform(0.25, 1.0))})
    return pd.DataFrame(rows)

def true_premium(p, df):
    out = np.zeros(len(df))
    for i, a in enumerate(df.to_dict("records")):
        z = {k: a[f"z_{k}"] for k in PERILS}
        t = table_premium(p, a, z)
        if p == "renters":
            t /= 1 + a["contents"] / 1000 * 0.06; t *= (1 + 8 * 0.06) * (a["contents"] / 8000) ** 0.8
            if z["theft"] == 3 and a["building"] == "apartment" and a["floor"] == "ground": t *= 1.6
            if z["hurricane"] == 3 and a["floor"] == "ground": t *= 1.2
            if a["claims3y"] == 0: t *= 0.85
        elif p == "home":
            ages = PRODUCTS["home"]["price"]["factors"]["age"]
            t *= math.exp(0.008 * a["age"]) / ages[bucket(ages, a["age"])] * 0.95
            if a["structure"] == "frame" and z["wildfire"] == 3: t *= 1.5
            if z["hurricane"] == 3 and a["age"] > 40: t *= 1.3
            if z["flood"] == 3 and a["kind"] == "house": t *= 1.15
        elif p == "pet":
            band = PRODUCTS["pet"]["price"]["factors"]["ageYears"][bucket(PRODUCTS["pet"]["price"]["factors"]["ageYears"], a["ageYears"])]
            t *= math.exp(0.09 * a["ageYears"]) / band * 0.8
            if a["breedSize"] == "flat" and a["ageYears"] > 6: t *= 1.2
            if a["chipped"]: t *= 0.95
        elif p == "car":
            yrs = PRODUCTS["car"]["price"]["factors"]["years"]
            t /= yrs[bucket(yrs, a["years"])] * (1 + max(0, a["milesMonth"]) / 100 * 0.025)
            t *= (1 + 0.6 * math.exp(-a["years"] / 3)) * (max(a["milesMonth"], 50) / 800) ** 0.5 * 1.6
            if a["telematics"]: t *= 0.85
            if a["parking"] == "street" and z["theft"] == 3: t *= 1.4
            if z["hurricane"] == 3: t *= 1.1
        out[i] = t
    return out

def simulate(p, df, r):
    g = GENERATOR[p]; pp = true_premium(p, df)
    freq = g["freq"] * np.clip(pp / np.median(pp), 0.2, 5) ** 0.5           # half the risk in how often...
    sev = pp / freq                                                            # ...the rest in how much
    n = r.poisson(freq * df["exposure"].values)
    loss = np.array([r.gamma(g["shape"], s / g["shape"], k).sum() if k else 0.0 for k, s in zip(n, sev)])
    return pp, n, loss

# ---- features
HAZ = {"z_flood": 1, "z_wildfire": 1, "z_hurricane": 1, "z_quake": 1, "z_theft": 1}  # a higher hazard level never lowers it
MONO = {  # +1: never lowers the premium as it grows, -1: never raises it
    "renters": {"contents": 1, "valuables": 1, "claims3y": 1, "deductible": -1, **HAZ},
    "home": {"age": 1, "rebuild": 1, "contents": 1, "claims3y": 1, "deductible": -1, **HAZ},
    "pet": {"ageYears": 1, "limit": 1, "copay": -1},
    "car": {"value": 1, "accidents3y": 1, "milesMonth": 1, "years": -1, **HAZ},
}
def features(p, df):
    """Numbers stay numbers; choices whose values are numbers (deductible, limit, copay) become numbers; other choices
    become category codes in the product's option order; booleans 0/1."""
    P = PRODUCTS[p]; X = pd.DataFrame(index=df.index); cats = {}
    for q in P["questions"]:
        if q["id"] not in df: continue
        v = df[q["id"]]
        if q["type"] == "number": X[q["id"]] = v.astype(float)
        elif q["type"] == "bool": X[q["id"]] = v.astype(float)
        elif q["type"] == "choice":
            vals = [o["v"] for o in q["options"]]
            if all(x.replace(".", "").isdigit() for x in vals): X[q["id"]] = v.astype(float)
            else: X[q["id"]] = v.map({x: i for i, x in enumerate(vals)}).astype(int); cats[q["id"]] = vals
    if p != "pet":  # every peril's level (the tables price only some; the hidden effects use others)
        for k in PERILS: X[f"z_{k}"] = df[f"z_{k}"].astype(float)
    return X, cats

def gini(actual, pred, w):
    """Normalised Gini of the losses ranked by the prediction (exposure-weighted Lorenz curve)."""
    def g(score):
        o = np.argsort(-score, kind="stable"); a = actual[o]; ww = w[o]
        cw = np.cumsum(ww) / ww.sum(); ca = np.cumsum(a) / a.sum()
        return np.sum(ca[1:] * cw[:-1] - ca[:-1] * cw[1:]) if len(a) > 1 else 0
    return g(pred) / g(actual)

def calibration(actual, pred, w, k=10):
    o = np.argsort(pred); parts = np.array_split(o, k)
    return [{"decile": i + 1, "predicted": round(float((pred[p] * w[p]).sum() / w[p].sum()), 1), "actual": round(float(actual[p].sum() / w[p].sum()), 1)} for i, p in enumerate(parts)]

def glm(Xtr, cats, df, n, loss, Xte):
    import statsmodels.api as sm
    def design(X):
        D = pd.get_dummies(X, columns=list(cats), drop_first=True, dtype=float)
        return sm.add_constant(D, has_constant="add")
    Dtr = design(Xtr); Dte = design(Xte).reindex(columns=Dtr.columns, fill_value=0.0)
    f = sm.GLM(n, Dtr, family=sm.families.Poisson(), offset=np.log(df["exposure"].values)).fit()
    m = n > 0
    s = sm.GLM(loss[m] / n[m], Dtr[m], family=sm.families.Gamma(sm.families.links.Log()), var_weights=n[m]).fit()
    return f.predict(Dte) * s.predict(Dte)

def export(p, booster, X, cats, out):
    """The trees as JSON for ml/risk/risk.mjs: features in order, how each answer becomes a number, and each tree's
    nodes (split feature, threshold or category set, the default direction, and every node's value for the reasons)."""
    d = booster.dump_model()
    def node(t):
        if "leaf_value" in t: return {"v": t["leaf_value"]}
        dt = t["decision_type"]; th = t["threshold"]
        return {"f": t["split_feature"], **({"cat": [int(x) for x in str(th).split("||")]} if dt == "==" else {"t": th}), "dl": t["default_left"], "v": t.get("internal_value", 0),
                "l": node(t["left_child"]), "r": node(t["right_child"])}
    spec = {"product": p, "version": f"cover-risk-{p}-us1", "link": "log", "unit": "cents a year", "init": 0.0, "features": list(X.columns),
            "encode": {c: ({"choice": cats[c]} if c in cats else {"number": True}) for c in X.columns},
            "monotone": MONO[p], "trees": [node(t["tree_structure"]) for t in d["tree_info"]], "generator": GENERATOR[p]}
    json.dump(spec, open(os.path.join(out, f"risk_{p}.json"), "w", encoding="utf8"), ensure_ascii=False, separators=(",", ":"))

def main():
    import lightgbm as lgb
    ap = argparse.ArgumentParser(); ap.add_argument("--out", required=True); ap.add_argument("--n", type=int, default=200000); ap.add_argument("--threads", type=int, default=4)
    a = ap.parse_args(); os.makedirs(a.out, exist_ok=True); report = {}
    for k, p in enumerate(GENERATOR):
        r = np.random.default_rng(1000 + k)
        tr, te = draw(p, r, a.n), draw(p, r, a.n // 4)
        pp_tr, n_tr, l_tr = simulate(p, tr, r); pp_te, n_te, l_te = simulate(p, te, r)
        Xtr, cats = features(p, tr); Xte, _ = features(p, te)
        w_tr, w_te = tr["exposure"].values, te["exposure"].values
        mono = [MONO[p].get(c, 0) for c in Xtr.columns]
        params = {"objective": "tweedie", "tweedie_variance_power": 1.5, "learning_rate": 0.05, "num_leaves": 31, "min_data_in_leaf": 200, "feature_fraction": 0.9, "bagging_fraction": 0.8, "bagging_freq": 1,
                  "monotone_constraints": mono, "monotone_constraints_method": "advanced", "verbose": -1, "num_threads": a.threads}
        dtr = lgb.Dataset(Xtr, l_tr / w_tr, weight=w_tr, categorical_feature=list(cats), free_raw_data=False)
        cut = int(len(Xtr) * 0.85)
        dfit = lgb.Dataset(Xtr.iloc[:cut], (l_tr / w_tr)[:cut], weight=w_tr[:cut], categorical_feature=list(cats))
        dval = lgb.Dataset(Xtr.iloc[cut:], (l_tr / w_tr)[cut:], weight=w_tr[cut:], categorical_feature=list(cats), reference=dfit)
        b = lgb.train(params, dfit, 2000, valid_sets=[dval], callbacks=[lgb.early_stopping(100, verbose=False)])
        best = b.best_iteration
        b = lgb.train(params, dtr, best)
        pred_l = b.predict(Xte); pred_g = np.asarray(glm(Xtr, cats, tr, n_tr, l_tr, Xte))
        table = np.array([table_premium(p, x, {kk: x[f"z_{kk}"] for kk in PERILS}) for x in te.to_dict("records")])
        # the GLM and the tables are put on the portfolio's level before comparing calibration (Gini doesn't need it)
        lvl = lambda pr: pr * (l_tr.sum() / w_tr.sum()) / np.average(pr, weights=w_te)
        contrib = b.predict(Xte, pred_contrib=True)
        shap = {c: round(float(np.abs(contrib[:, i]).mean()), 4) for i, c in enumerate(Xtr.columns)}
        # monotone check: raise each constrained feature one step on 2,000 test policies, the prediction must not move the other way
        viol = 0
        for c, s in MONO[p].items():
            if c not in Xte: continue
            X2 = Xte.iloc[:2000].copy(); X2[c] = X2[c] + (1 if X2[c].max() <= 10 else X2[c].std() / 2)
            viol += int(((b.predict(X2) - pred_l[:2000]) * s < -1e-9).sum())
        res = {"policies_train": len(tr), "policies_test": len(te), "claims_train": int(n_tr.sum()), "loss_per_year_train_usd": round(float(l_tr.sum() / w_tr.sum() / 100), 2), "trees": best,
               "gini": {"lightgbm": round(gini(l_te, pred_l, w_te), 4), "glm": round(gini(l_te, pred_g, w_te), 4), "product_tables": round(gini(l_te, table, w_te), 4), "true_premium": round(gini(l_te, pp_te, w_te), 4)},
               "rmse_to_true_premium_usd": {"lightgbm": round(float(np.sqrt(np.average((pred_l - pp_te) ** 2, weights=w_te))) / 100, 2), "glm": round(float(np.sqrt(np.average((pred_g - pp_te) ** 2, weights=w_te))) / 100, 2), "product_tables": round(float(np.sqrt(np.average((lvl(table) - pp_te) ** 2, weights=w_te))) / 100, 2)},
               "calibration_lightgbm": calibration(l_te, pred_l, w_te), "calibration_glm": calibration(l_te, pred_g, w_te),
               "predicted_over_actual_total": {"lightgbm": round(float((pred_l * w_te).sum() / l_te.sum()), 4), "glm": round(float((pred_g * w_te).sum() / l_te.sum()), 4)},
               "shap_mean_abs": dict(sorted(shap.items(), key=lambda x: -x[1])), "monotone_violations": viol, "generator": GENERATOR[p]}
        # the gap to the truth, with an interval: the Gini's spread over 200 bootstrap resamples of the test portfolio
        rr = np.random.default_rng(7); bs = {"lightgbm": [], "glm": []}
        for _ in range(200):
            i = rr.integers(0, len(te), len(te)); bs["lightgbm"].append(gini(l_te[i], pred_l[i], w_te[i])); bs["glm"].append(gini(l_te[i], pred_g[i], w_te[i]))
        res["gini_ci95"] = {k: [round(float(np.percentile(v, 2.5)), 4), round(float(np.percentile(v, 97.5)), 4)] for k, v in bs.items()}
        d = np.array(bs["lightgbm"]) - np.array(bs["glm"]); res["gini_lightgbm_minus_glm_ci95"] = [round(float(np.percentile(d, 2.5)), 4), round(float(np.percentile(d, 97.5)), 4)]
        export(p, b, Xtr, cats, a.out)
        # a few test policies with their predictions, for the Node module's check
        json.dump([{"answers": {k: (v.item() if hasattr(v, "item") else v) for k, v in rec.items() if k in Xtr.columns or k in [q["id"] for q in PRODUCTS[p]["questions"]]}, "zone": {kk: int(rec[f"z_{kk}"]) for kk in PERILS}, "predicted": float(pl)}
                   for rec, pl in zip(te.iloc[:50].to_dict("records"), pred_l[:50])], open(os.path.join(a.out, f"check_{p}.json"), "w", encoding="utf8"), ensure_ascii=False)
        report[p] = res
        print(p, json.dumps({k: res[k] for k in ("gini", "gini_ci95", "predicted_over_actual_total", "monotone_violations", "trees")}), flush=True)
    json.dump(report, open(os.path.join(a.out, "results.json"), "w", encoding="utf8"), ensure_ascii=False, indent=1)
    print("RISK_DONE")

if __name__ == "__main__":
    main()
