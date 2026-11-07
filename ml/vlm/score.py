"""Scores of ml/vlm/eval.py's answers (the app's "condition" task), by code, per model:
  condition: pass on the photo's own thing (confirms a true condition), and the money-relevant error: pass on a
             different thing ("wrong release"); valid replies; the share with confidence >= 0.9 and how often those are right
  same_spot: the same_spot field right (a shifted/re-lit copy is the same spot; another photo of the same kind is not)
  agreement with Glimmer's verdict, and latency per question on 6 CPU threads (p50, p95).
   python ml/vlm/score.py --dir ml/vlm/results_app
"""
import argparse, json, math, os, glob

def wilson(k, n, z=1.96):
    if not n: return [0, 0]
    p = k / n; d = 1 + z * z / n; c = p + z * z / (2 * n); h = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n))
    return [round((c - h) / d, 4), round((c + h) / d, 4)]
def rate(k, n): return {"rate": round(k / max(1, n), 4), "k": k, "n": n, "ci95": wilson(k, n)}
def pct(xs, q): xs = sorted(x for x in xs if x is not None); return round(xs[min(len(xs) - 1, int(q * len(xs)))]) if xs else None

def main():
    ap = argparse.ArgumentParser(); ap.add_argument("--dir", required=True); a = ap.parse_args()
    def rows(f):
        out = []
        for l in open(f, encoding="utf8"):
            try: out.append(json.loads(l))
            except Exception: pass   # a line cut off when the VM was stopped
        return out
    runs = {os.path.basename(f)[:-6]: rows(f) for f in glob.glob(os.path.join(a.dir, "*.jsonl"))}
    key = lambda x: (x["kind"], x["photo"], x["thing"], str(x["truth"]))
    g = {key(x): (x["answer"] or {}).get("verdict") for x in runs.get("glimmer", [])}
    res = {}
    for name, rows in sorted(runs.items()):
        v = lambda x: (x["answer"] or {}).get("verdict")
        cond = [x for x in rows if x["kind"] == "condition"]; pos = [x for x in cond if x["truth"] == "pass"]; neg = [x for x in cond if x["truth"] != "pass"]
        sp = [x for x in rows if x["kind"] == "same_spot"]
        m = {"questions": len(rows), "valid": rate(sum(v(x) in ("pass", "needs_fix", "fail") for x in rows), len(rows)),
             "confirms_true_condition": rate(sum(v(x) == "pass" for x in pos), len(pos)), "wrong_release": rate(sum(v(x) == "pass" for x in neg), len(neg)),
             "condition_right": rate(sum((v(x) == "pass") == (x["truth"] == "pass") for x in cond if v(x)), sum(1 for x in cond if v(x))),
             "same_spot_right": rate(sum((x["answer"] or {}).get("same_spot") is x["truth"] for x in sp), len(sp)),
             "ms_p50": pct([x["ms"] for x in rows], .5), "ms_p95": pct([x["ms"] for x in rows], .95), "ms_condition_p50": pct([x["ms"] for x in cond], .5), "ms_pair_p50": pct([x["ms"] for x in sp], .5)}
        if g and name != "glimmer":
            both = [(v(x), g[key(x)]) for x in rows if g.get(key(x)) and v(x)]
            m["agrees_with_glimmer"] = rate(sum(p == q for p, q in both), len(both))
        conf = [(c, (v(x) == "pass") == (x["truth"] == "pass")) for x in cond if v(x) and isinstance(c := (x["answer"] or {}).get("confidence"), (int, float))]
        if conf:
            hi = [ok for c, ok in conf if c >= 0.9]; m["stated_confidence_0.9"] = {"share": round(len(hi) / len(conf), 4), "right": rate(sum(hi), len(hi))}
        res[name] = m
        print(name, {k: (x["rate"] if isinstance(x, dict) and "rate" in x else x) for k, x in m.items()}, flush=True)
    json.dump(res, open(os.path.join(a.dir, "scores.json"), "w"), indent=1)

if __name__ == "__main__":
    main()
