"""Cover-Audit's numbers on held-out cases, against Muse Glimmer and against code. Ported from Serve's jev/report.py.
   python3 ml/report.py --data ml/data/test --val-data ml/data/val --pred "name=test_preds.jsonl[,val_preds.jsonl]" ... --out results.json

For Glimmer itself: how often two of its answers to the same case agree (the ceiling for a student that copies it),
  how often it finds code's verdict, what one answer costs.
For each student (a predictions file from train.py --eval or eval_gguf.py):
  agreement with Glimmer: with each of its answers and with its majority answer;
  against code: the verdict right; the planted errors caught (recall: verdict not ok, picked not ok) and the false
    alarms (verdict ok, picked not ok);
  applies: precision and recall of the clauses it reads as applying (P >= 0.5) against the rule engine;
  selective: at each confidence threshold, the share of cases it answers (coverage) and its agreement there; the
    threshold is set on the validation cases as the lowest at which agreement with Glimmer there is at least Glimmer's
    agreement with itself;
  latency per forward pass, when measured.
Students are compared pairwise on the same cases with McNemar's exact test (code verdict right or not).
Every rate has a 95% Wilson interval.
"""
import argparse, collections, itertools, json, math, statistics as st, sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from prompt import label_of

def wilson(k, n, z=1.96):
    if not n: return [0, 0]
    p = k / n; d = 1 + z * z / n; c = p + z * z / (2 * n); h = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n))
    return [round((c - h) / d, 4), round((c + h) / d, 4)]

def rate(k, n): return {"rate": round(k / max(1, n), 4), "ci95": wilson(k, n), "k": k, "n": n}

def pct(xs, q):
    xs = sorted(xs); return xs[min(len(xs) - 1, int(q * len(xs)))] if xs else None

def mcnemar(a, b):
    """Exact two-sided McNemar on paired right/wrong: (b01, b10, p)."""
    b01 = sum(1 for x, y in zip(a, b) if not x and y); b10 = sum(1 for x, y in zip(a, b) if x and not y); n = b01 + b10
    if not n: return {"only_first_right": 0, "only_second_right": 0, "p": 1.0}
    k = min(b01, b10); p = min(1.0, 2 * sum(math.comb(n, i) for i in range(k + 1)) / 2 ** n)
    return {"only_first_right": b10, "only_second_right": b01, "p": round(p, 4)}

def load_teacher(d):
    cases = {c["id"]: c for c in map(json.loads, open(f"{d}/cases.jsonl", encoding="utf8"))}
    rows = [json.loads(l) for l in open(f"{d}/teacher.jsonl", encoding="utf8")] if os.path.exists(f"{d}/teacher.jsonl") else []
    labels = collections.defaultdict(list)
    for r in sorted(rows, key=lambda r: r["sample"]):
        y = label_of(r)
        if y is not None: labels[r["id"]].append(y)
    return cases, rows, dict(labels)

def majority(ys):
    c = collections.Counter(ys); y, n = c.most_common(1)[0]
    return y if n * 2 > len(ys) else None

def agreement(pick, labels):
    ks = ns = km = nm = 0
    for i, ys in labels.items():
        if i not in pick: continue
        ks += sum(y == pick[i] for y in ys); ns += len(ys)
        m = majority(ys)
        if m is not None: nm += 1; km += m == pick[i]
    return {"with_each_answer": rate(ks, ns), "with_majority": rate(km, nm)}

def against_code(pick, cases):
    ids = [i for i in pick if i in cases]
    right = sum(pick[i] == cases[i]["verdict"] for i in ids)
    bad = [i for i in ids if cases[i]["verdict"] != "ok"]; good = [i for i in ids if cases[i]["verdict"] == "ok"]
    per = {v: rate(sum(pick[i] == v for i in ids if cases[i]["verdict"] == v), sum(cases[i]["verdict"] == v for i in ids)) for v in sorted({cases[i]["verdict"] for i in ids})}
    return {"verdict": rate(right, len(ids)), "planted_caught": rate(sum(pick[i] != "ok" for i in bad), len(bad)), "false_alarm": rate(sum(pick[i] != "ok" for i in good), len(good)), "per_verdict": per}

def applies_pr(rows):
    tp = fp = fn = exact = 0
    for r in rows:
        P = {k for k, q in r["applies_p"].items() if q >= 0.5}; T = {k for k, v in r["applies"].items() if v}
        tp += len(P & T); fp += len(P - T); fn += len(T - P); exact += P == T
    return {"precision": rate(tp, tp + fp), "recall": rate(tp, tp + fn), "exact_cases": rate(exact, len(rows))}

def selective(preds, labels, ths=(0.0, 0.5, 0.6, 0.7, 0.8, 0.9, 0.95)):
    out = []
    for th in ths:
        used = [r for r in preds if max(r["probs"].values()) >= th]
        pick = {r["id"]: max(r["probs"], key=r["probs"].get) for r in used}
        a = agreement(pick, {i: labels[i] for i in pick if i in labels})
        out.append({"threshold": th, "coverage": round(len(used) / max(1, len(preds)), 4), "answered": len(used), "with_each_answer": a["with_each_answer"]["rate"]})
    return out

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", required=True); ap.add_argument("--val-data"); ap.add_argument("--pred", action="append", default=[]); ap.add_argument("--out", required=True)
    a = ap.parse_args()
    cases, rows, labels = load_teacher(a.data)
    pairs = [(x == y) for ys in labels.values() for x, y in itertools.combinations(ys, 2)]
    first = {i: ys[0] for i, ys in labels.items()}
    sec = [r["seconds"] for r in rows if r.get("answer")]; tok = [r["tokens"] for r in rows if r.get("tokens")]
    gap = [{"applies_p": {k: (1.0 if k.split(":")[0] in r["answer"]["applies"] else 0.0) for k in cases[r["id"]]["applies"]}, "applies": cases[r["id"]]["applies"]} for r in rows if r.get("answer")]
    G = {"cases": len(labels), "answers": len(rows), "self_agreement": rate(sum(pairs), len(pairs)), "against_code_first_answer": against_code(first, cases), "applies": applies_pr(gap) if gap else None,
         "seconds_p50": pct(sec, .5), "seconds_p95": pct(sec, .95), "prompt_tokens_mean": round(st.mean(t["prompt"] for t in tok)) if tok else None,
         "output_tokens_mean": round(st.mean(t["output"] for t in tok)) if tok else None, "errors": sum(1 for r in rows if r.get("error"))}
    out = {"data": a.data, "glimmer": G, "students": {}}
    vlabels = vG = None
    if a.val_data:
        _, _, vlabels = load_teacher(a.val_data)
        vp = [(x == y) for ys in vlabels.values() for x, y in itertools.combinations(ys, 2)]
        vG = round(sum(vp) / max(1, len(vp)), 4); out["val_glimmer_self_agreement"] = vG
    right = {}
    for spec in a.pred:
        name, files = spec.split("=", 1); fs = files.split(",")
        preds = [json.loads(l) for l in open(fs[0], encoding="utf8")]
        pick = {r["id"]: max(r["probs"], key=r["probs"].get) for r in preds}
        right[name] = {i: pick[i] == cases[i]["verdict"] for i in pick if i in cases}
        s = {"cases": len(preds), "agreement": agreement(pick, labels), "against_code": against_code(pick, cases), "applies": applies_pr(preds), "selective": selective(preds, labels)}
        ms = [r["ms"] for r in preds if "ms" in r]
        if ms: s["latency_ms"] = {"p50": pct(ms, .5), "p95": pct(ms, .95), "mean": round(st.mean(ms), 1), "tokens_p50": pct([r["tokens"] for r in preds], .5)}
        if len(fs) > 1 and vlabels:
            vpred = [json.loads(l) for l in open(fs[1], encoding="utf8")]
            sel = selective(vpred, vlabels, ths=[x / 100 for x in range(0, 100)])
            ok = [x for x in sel if x["with_each_answer"] >= vG and x["answered"] >= 20]
            th = ok[0]["threshold"] if ok else 0.99
            s["threshold"] = {"value": th, "rule": "lowest at which agreement with each Glimmer answer on the validation cases is at least Glimmer's self-agreement there",
                              "val": next(x for x in sel if x["threshold"] == th), "test": selective(preds, labels, ths=[th])[0]}
        out["students"][name] = s
    out["mcnemar"] = {f"{x} vs {y}": mcnemar([right[x][i] for i in sorted(set(right[x]) & set(right[y]))], [right[y][i] for i in sorted(set(right[x]) & set(right[y]))]) for x, y in itertools.combinations(right, 2)}
    json.dump(out, open(a.out, "w"), indent=1)
    print(json.dumps({"glimmer_self": G["self_agreement"]["rate"], "glimmer_vs_code": G["against_code_first_answer"]["verdict"]["rate"],
                      "students": {k: {"each": v["agreement"]["with_each_answer"]["rate"], "code": v["against_code"]["verdict"]["rate"], "caught": v["against_code"]["planted_caught"]["rate"],
                                       "false_alarm": v["against_code"]["false_alarm"]["rate"]} for k, v in out["students"].items()}, "mcnemar": out["mcnemar"]}, indent=1))

if __name__ == "__main__":
    main()
