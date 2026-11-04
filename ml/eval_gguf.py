"""Score the int4 GGUF on held-out cases on the CPU, as the worker runs it (one request at a time), with the latency of
each forward pass. Ported from Serve's jev/eval_gguf.py; its rows are the same as train.py --eval's, so report.py reads
both.
   python ml/eval_gguf.py --gguf m.gguf --tokenizer dir --products dir --data ml/data/test --out preds.jsonl [--threads 8]
"""
import argparse, collections, json, os, sys, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from prompt import label_of, marker_truth
from worker import Model, Tok

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--gguf", required=True); ap.add_argument("--tokenizer", required=True); ap.add_argument("--products", required=True)
    ap.add_argument("--data", required=True); ap.add_argument("--out", required=True)
    ap.add_argument("--threads", type=int, default=8); ap.add_argument("--limit", type=int, default=0)
    a = ap.parse_args()
    cases = {c["id"]: c for c in map(json.loads, open(f"{a.data}/cases.jsonl", encoding="utf8"))}
    lab = collections.defaultdict(collections.Counter)
    if os.path.exists(f"{a.data}/teacher.jsonl"):
        for r in map(json.loads, open(f"{a.data}/teacher.jsonl", encoding="utf8")):
            y = label_of(r)
            if y is not None: lab[r["id"]][y] += 1
    ids = list(cases)
    if a.limit: ids = ids[:a.limit]
    M = Model(a.gguf, Tok(a.tokenizer), a.products, a.threads)
    M.audit(cases[ids[0]])  # load and warm up
    with open(a.out, "w", encoding="utf8") as f:
        for i in ids:
            c = cases[i]; t0 = time.time()
            r = M.audit(c)
            f.write(json.dumps({"id": i, "probs": {o["verdict"]: o["p"] for o in r["options"]}, "applies_p": r["applies_p"], "applies": {k: marker_truth(c, k) for k in r["applies_p"]}, "verdict": c["verdict"],
                                "glimmer": dict(lab[i]), "ms": r["ms"], "wall_ms": round((time.time() - t0) * 1000, 1), "tokens": r["tokens"]}, ensure_ascii=False) + "\n"); f.flush()
    print("EVAL_DONE", len(ids))

if __name__ == "__main__":
    main()
