"""Cover-Audit's input, built by code from the facts of one claim decision (shared by training, evaluation and the
serving worker, so the three see the same tokens). Ported from Serve's jev/prompt.py.

One forward pass reads it and returns, in parallel:
  - for each check the claim engine runs (in force, waiting period, covered, reported in time, police within 24 hours,
    documents read) and "no fraud signal", P(ok) at that check's "ok?" marker (the logits of " yes" against " no"):
    the student's own reading of the rules, made before it sees the options; the truth is the engine's;
  - at the last position, a distribution over the declared verdicts only (single-token letters):
      A ok, B overpay, C underpay, D wrong_clause, E human (it should have gone to a person).
The prompt is token ids put together segment by segment, so the marker positions are known exactly.
Two chat formats: Llama 3 (Llama 3.2 1B/3B Instruct) and ChatML (Qwen3-1.7B, with an empty think block, as Qwen3 is
asked without thinking).
"""
import json

VERDICTS = ["ok", "overpay", "underpay", "wrong_clause", "human"]
LETTERS = "ABCDE"
SAY = {"ok": "the decision is right", "overpay": "it pays too much", "underpay": "it pays too little",
       "wrong_clause": "the amount is right but it cites the wrong clause", "human": "it should go to a person, not be paid instantly"}

def usd(c): return f"${c / 100:,.2f}".replace(".00", "")

# the engine's checks (api/src/claims.js decide()) and its fraud signals, as the student's markers
CHECK_ZH = {"in_force": "事發時保單有效", "waiting": "已過等待期", "covered": "保單有此保障", "reported": "90 日內申請", "police_24h": "24 小時內報警",
            "documents_read": "文件已讀出", "signal": "沒有防詐訊號"}
OUTCOME_ZH = {"pay": "即時賠付", "deny": "不賠", "refer": "轉人工審核"}

def clause_texts(products_dir):
    """{clause id: zh text} for every product (cover/api/src/products/*.json)."""
    import glob, os
    out = {}
    for f in glob.glob(os.path.join(products_dir, "*.json")):
        for c in json.load(open(f, encoding="utf8")).get("clauses", []): out[c["id"]] = c["zh"]
    return out

def marker_keys(case):
    return [k for k in CHECK_ZH if k in case["applies"]]

def marker_truth(case, k):
    """The engine's answer at a marker: the check passed, or (signal) no fraud signal fired."""
    return (not case["applies"]["signal"]) if k == "signal" else bool(case["applies"][k])

def segments(case, texts):
    """[(text, role)]: role 'marker:<check>' for the token where that check's ok? is read."""
    d = case["decision"]
    segs = [(f"{case['facts']}\n決定：{OUTCOME_ZH[d['outcome']]}，{usd(d['amount'])}，依 {d['clause']}（{texts.get(d['clause'], '')[:60]}）。\n檢查：", None)]
    for k in marker_keys(case):
        segs.append((f"\n{CHECK_ZH[k]} ok", None))
        segs.append(("?", f"marker:{k}"))
    segs.append(("\nVerdict: " + ", ".join(f"{l} = {SAY[v]}" for l, v in zip(LETTERS, VERDICTS)) + ".\nAnswer:", None))
    return segs

class Builder:
    """Token ids for a case, with the marker and answer positions."""
    def __init__(self, tok, texts):
        self.texts = texts
        enc = lambda s: tok.encode(s, add_special_tokens=False)
        self.enc = enc
        vocab = tok.get_vocab() if hasattr(tok, "get_vocab") else {}
        if "<|im_start|>" in vocab:  # Qwen3 (ChatML), not thinking
            self.pre = enc("<|im_start|>user\n"); self.post = enc("<|im_end|>\n<|im_start|>assistant\n<think>\n\n</think>\n\n")
        else:  # Llama 3
            self.pre = enc("<|begin_of_text|><|start_header_id|>user<|end_header_id|>\n\n"); self.post = enc("<|eot_id|><|start_header_id|>assistant<|end_header_id|>\n\n")
        self.yes, self.no = enc(" yes")[0], enc(" no")[0]
        assert len(enc(" yes")) == 1 and len(enc(" no")) == 1
        self.letter = {}
        for l in LETTERS:
            ids = enc(l); assert len(ids) == 1, l; self.letter[l] = ids[0]

    def build(self, case):
        ids = list(self.pre); markers = []
        for text, role in segments(case, self.texts):
            ids += self.enc(text)
            if role: markers.append((role[7:], len(ids) - 1))
        ids += self.post
        return {"ids": ids, "markers": markers, "answer": len(ids) - 1, "options": list(zip(LETTERS, VERDICTS))}

def label_of(row):
    """The teacher's verdict from a teacher.jsonl row, or None (no answer)."""
    v = (row.get("answer") or {}).get("verdict")
    return v if v in VERDICTS else None
