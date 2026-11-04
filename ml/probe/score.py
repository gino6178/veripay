"""Score the probe's answers by code (ml/probe/out/*.jsonl from run.py) and write ml/probe/out/results.json.
  qa       JSON valid; the cited clause exists in the product; it is the right one (one of the accepted ids); covered
           right; the answer in Traditional Chinese (no simplified-only characters).
  extract  JSON valid (the app reader's schema, api/src/reader.js); each field exactly right: date as YYYY-MM-DD,
           amount as the whole number, merchant, taxId (the seller's) and reportNo exactly as written or null where
           there is none, and the item among the answer's items; every field right in one answer. Currency is
           reported apart (TWD or a way of writing it, where there is an amount).
  vision   the same as extract, from the image.
Self-agreement: for each case, whether its two answers are the same (qa: same clause and covered; extract: every field
the same). Latency: seconds per answer at the concurrency it was asked with, and for one request alone (solo).
   python3 ml/probe/score.py
"""
import collections, json, math, os, re, statistics as st

HERE = os.path.dirname(os.path.abspath(__file__))
SIMPLIFIED = set("们这险赔证医费发时说国对过还给让关图门问间电买卖钱单项补应该实际处认识读写选违规损坏宠货报经济务进连续条护满额质类变确资验检无产账属页么样东车请网历")
FIELDS = ["date", "amount", "merchant", "item", "taxId", "reportNo"]  # the app reader's names; item: among the answer's items
TWD = {"TWD", "NTD", "NT$", "NT", "新臺幣", "新台幣", "台幣", "臺幣", "元"}

def wilson(k, n, z=1.96):
    if not n: return [0, 0]
    p = k / n; d = 1 + z * z / n; c = p + z * z / (2 * n); h = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n))
    return [round((c - h) / d, 3), round((c + h) / d, 3)]

def rate(k, n): return {"rate": round(k / max(1, n), 3), "k": k, "n": n, "ci95": wilson(k, n)}

def pct(xs, q):
    xs = sorted(xs); return xs[min(len(xs) - 1, int(q * len(xs)))] if xs else None

def rows(name):
    f = os.path.join(HERE, "out", f"{name}.jsonl")
    return [json.loads(l) for l in open(f, encoding="utf8")] if os.path.exists(f) else []

def parse(r):
    try: j = json.loads(r.get("content") or ""); return j if isinstance(j, dict) else None
    except Exception: return None

def norm_field(k, v):
    if v is None: return None
    if k == "amount":
        if isinstance(v, (int, float)) and float(v).is_integer(): return int(v)
        return v
    return v if isinstance(v, str) else v

def timing(rs):
    s = [r["seconds"] for r in rs if "seconds" in r]
    return {"answers": len(s), "seconds_p50": pct(s, .5), "seconds_p95": pct(s, .95), "seconds_mean": round(st.mean(s), 2) if s else None,
            "output_tokens_mean": round(st.mean(r.get("output_tokens", 0) for r in rs), 1) if rs else None, "prompt_tokens_mean": round(st.mean(r.get("prompt_tokens", 0) for r in rs), 1) if rs else None,
            "thinking_chars_mean": round(st.mean(r.get("thinking_chars", 0) for r in rs), 1) if rs else None, "hit_token_limit": sum(r.get("done_reason") == "length" for r in rs),
            "decode_tok_per_s_mean": round(st.mean(r["output_tokens"] / r["eval_s"] for r in rs if r.get("eval_s")), 1) if any(r.get("eval_s") for r in rs) else None}

def score_qa():
    cases = {c["id"]: c for c in map(json.loads, open(os.path.join(HERE, "qa_cases.jsonl"), encoding="utf8"))}
    snap = json.load(open(os.path.join(HERE, "clauses.json"), encoding="utf8"))
    rs = rows("qa"); n = len(rs); valid = exists = right = cov = cov2 = trad = 0; fails = []; by = collections.defaultdict(dict)
    for r in rs:
        c = cases[r["id"]]; j = parse(r)
        ids = {x["id"] for x in snap[c["product"]]["clauses"]}
        if j is None: fails.append({"id": r["id"], "sample": r["sample"], "why": "invalid JSON", "got": (r.get("content") or "")[:200]}); by[r["id"]][r["sample"]] = None; continue
        valid += 1
        cl = str(j.get("clause", "")).strip()
        m = re.search(r"[A-Z]{2}-\d+\.\d+", cl); cl_id = m.group(0) if m else cl
        e = cl_id in ids; ok = cl_id in c["clause"]; cv = j.get("covered") == c["covered"]
        t = not (set(j.get("answer", "")) & SIMPLIFIED)
        loose = lambda x: "yes" if x == "info" else x  # "how much / how long" questions: "info" and "yes" both fit
        exists += e; right += ok; cov += cv; cov2 += loose(j.get("covered")) == loose(c["covered"]); trad += t
        by[r["id"]][r["sample"]] = (cl_id, j.get("covered"))
        if not (e and ok and cv and t):
            fails.append({"id": r["id"], "sample": r["sample"], "q": c["q"], "want": [c["clause"], c["covered"]], "got": [cl, j.get("covered")], "answer": j.get("answer", "")[:200],
                          "why": ", ".join(w for w, b in [("clause does not exist", not e), ("wrong clause", e and not ok), ("covered wrong", not cv), ("simplified characters", not t)] if b)})
    pairs = [(v[0] == v[1]) for v in by.values() if 0 in v and 1 in v]
    return {"answers": n, "json_valid": rate(valid, n), "clause_exists": rate(exists, n), "clause_right": rate(right, n), "covered_right": rate(cov, n), "covered_right_info_as_yes": rate(cov2, n), "traditional_only": rate(trad, n),
            "self_agreement": rate(sum(pairs), len(pairs)), "timing": timing(rs), "failures": fails}

def score_extract(name, case_file):
    cases = {c["id"]: c for c in map(json.loads, open(os.path.join(HERE, case_file), encoding="utf8"))}
    rs = rows(name); n = len(rs); valid = allright = 0; field = collections.Counter(); kind = collections.defaultdict(lambda: [0, 0]); fails = []; by = collections.defaultdict(dict); cur = [0, 0]; loose_item = [0, 0]; loose_all = [0, 0]
    for r in rs:
        c = cases[r["id"]]; j = parse(r)
        if j is None: fails.append({"id": r["id"], "sample": r["sample"], "why": "invalid JSON", "got": (r.get("content") or "")[:200]}); by[r["id"]][r["sample"]] = None; kind[c["kind"]][1] += 1; continue
        valid += 1
        got = {k: norm_field(k, j.get(k)) for k in FIELDS if k != "item"}
        items = [str(x).strip() for x in (j.get("items") or [])]
        got["item"] = c["truth"]["item"] if c["truth"]["item"] in items else items
        # loose: the item line copied whole ("落地電風扇    1 x 6060    6060TX") counts, a different item does not
        loose_item[0] += any(x == c["truth"]["item"] or x.startswith(c["truth"]["item"] + " ") for x in items); loose_item[1] += 1
        if isinstance(got.get("taxId"), str): got["taxId"] = got["taxId"].strip() or None
        if isinstance(got.get("reportNo"), str): got["reportNo"] = got["reportNo"].strip() or None
        wrong = [k for k in FIELDS if got[k] != c["truth"][k]]
        if c["truth"]["amount"] is not None: cur[0] += str(j.get("currency") or "").strip().upper() in {x.upper() for x in TWD}; cur[1] += 1
        for k in FIELDS: field[k] += k not in wrong
        loose_all[0] += not [k for k in wrong if k != "item"] and any(x == c["truth"]["item"] or x.startswith(c["truth"]["item"] + " ") for x in items); loose_all[1] += 1
        allright += not wrong; kind[c["kind"]][0] += not wrong; kind[c["kind"]][1] += 1
        by[r["id"]][r["sample"]] = json.dumps(got, sort_keys=True, ensure_ascii=False)
        if wrong: fails.append({"id": r["id"], "sample": r["sample"], "kind": c["kind"], "wrong": {k: {"want": c["truth"][k], "got": got[k]} for k in wrong}})
    pairs = [(v[0] == v[1]) for v in by.values() if 0 in v and 1 in v]
    return {"answers": n, "json_valid": rate(valid, n), "all_fields_right": rate(allright, n), "fields": {k: rate(field[k], n) for k in FIELDS},
            "by_kind": {k: rate(*v) for k, v in kind.items()}, "currency_twd": rate(*cur), "item_loose": rate(*loose_item), "all_fields_right_item_loose": rate(*loose_all), "self_agreement": rate(sum(pairs), len(pairs)), "timing": timing(rs), "failures": fails}

def main():
    out = {"qa": score_qa(), "extract": score_extract("extract", "extract_cases.jsonl"), "vision": score_extract("vision", "vision_cases.jsonl"),
           "vision_app": score_extract("vision_app", "vision_cases.jsonl"), "solo": timing(rows("solo"))}
    json.dump(out, open(os.path.join(HERE, "out", "results.json"), "w", encoding="utf8"), ensure_ascii=False, indent=1)
    brief = lambda d: {k: (v["rate"] if isinstance(v, dict) and "rate" in v else v) for k, v in d.items() if k not in ("failures", "fields", "by_kind", "timing")}
    print(json.dumps({k: brief(v) if k != "solo" else v for k, v in out.items()}, ensure_ascii=False, indent=1))
    print("extract fields", {k: v["rate"] for k, v in out["extract"]["fields"].items()}, "by kind", {k: v["rate"] for k, v in out["extract"]["by_kind"].items()})
    for k in ("vision", "vision_app"): print(k, "fields", {f: v["rate"] for f, v in out[k]["fields"].items()})
    for k in ("qa", "extract", "vision", "vision_app"): print(k, "timing", out[k]["timing"])

if __name__ == "__main__":
    main()
