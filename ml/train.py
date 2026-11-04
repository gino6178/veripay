"""Distill Muse Glimmer's claim audits into a small model (Llama 3.2 1B/3B Instruct, or Qwen3-1.7B) that answers in one
forward pass over declared verdicts (ml/prompt.py), with LoRA. Ported from Serve's jev/train.py.

Losses, at positions code knows (no text is generated):
  choice   cross-entropy at the answer position over the five verdict letters only, against Glimmer's answers to the
           case (a distribution when Glimmer was asked more than once): distillation of the teacher's verdict.
           --target code trains on code's verdict instead (known by construction in ml/cases.mjs), and --target mix
           puts weight --code_w on code's verdict and the rest on Glimmer's distribution;
  applies  two-way cross-entropy (" yes" against " no") at every clause's marker, against the rule engine's truth.
   python3 ml/train.py --train d1,d2 --val d3 --out runs/x [--base ~/models/meta-1b] [--epochs 3] [--target teacher]
   python3 ml/train.py --eval runs/x --test d4 --pred out.jsonl     (score a saved adapter on held-out cases)
"""
import argparse, json, math, os, random, sys, time, collections
import torch, torch.nn.functional as F
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from prompt import Builder, VERDICTS, clause_texts, label_of

PRODUCTS = os.environ.get("COVER_PRODUCTS", os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "api", "src", "products"))

def load(dirs, need_teacher=True):
    """[(case, Counter of Glimmer's verdicts)] for the cases Glimmer answered (or every case, with an empty Counter)."""
    out = []
    for d in dirs.split(","):
        cases = {c["id"]: c for c in map(json.loads, open(f"{d}/cases.jsonl", encoding="utf8"))}
        lab = collections.defaultdict(collections.Counter)
        if os.path.exists(f"{d}/teacher.jsonl"):
            for r in map(json.loads, open(f"{d}/teacher.jsonl", encoding="utf8")):
                y = label_of(r)
                if y is not None: lab[r["id"]][y] += 1
        out += [(cases[i], lab[i]) for i in cases if lab[i] or not need_teacher]
    return out

class Data:
    def __init__(self, tok, target="teacher", code_w=0.5):
        self.b = Builder(tok, clause_texts(PRODUCTS)); self.tok = tok; self.target = target; self.code_w = code_w
    def example(self, c, counts):
        x = self.b.build(c)
        tgt = torch.zeros(len(VERDICTS))
        for y, n in counts.items(): tgt[VERDICTS.index(y)] += n
        code = torch.zeros(len(VERDICTS)); code[VERDICTS.index(c["verdict"])] = 1
        if self.target == "code" or tgt.sum() == 0: tgt = code
        else:
            tgt /= tgt.sum()
            if self.target == "mix": tgt = self.code_w * code + (1 - self.code_w) * tgt
        return {"ids": x["ids"], "answer": x["answer"], "letters": [self.b.letter[l] for l, _ in x["options"]], "target": tgt,
                "markers": [p for _, p in x["markers"]], "mlabels": [1 if c["applies"][k] else 0 for k, _ in x["markers"]], "mids": [k for k, _ in x["markers"]]}

def pad(seqs, val):
    n = max(len(s) for s in seqs)
    return torch.tensor([s + [val] * (n - len(s)) for s in seqs]), torch.tensor([[1] * len(s) + [0] * (n - len(s)) for s in seqs])

def heads(model, batch, dev):
    """Hidden states for a batch, then the LM head only at the positions and tokens that matter."""
    ids, att = pad([e["ids"] for e in batch], 0)
    base = model.get_base_model() if hasattr(model, "get_base_model") else model
    h = base.model(input_ids=ids.to(dev), attention_mask=att.to(dev)).last_hidden_state
    return h, base.lm_head.weight

def losses(model, batch, dev, d, applies_w=1.0):
    h, W = heads(model, batch, dev)
    lc, la = [], []
    for i, e in enumerate(batch):
        z = (h[i, e["answer"]] @ W[e["letters"]].T).float()
        lc.append(-(e["target"].to(dev) * F.log_softmax(z, -1)).sum())
        if e["markers"]:
            zw = (h[i, e["markers"]] @ W[[d.b.yes, d.b.no]].T).float()
            la.append(F.cross_entropy(zw, torch.tensor([0 if y else 1 for y in e["mlabels"]], device=dev)))
    out = {"choice": torch.stack(lc).mean(), "applies": torch.stack(la).mean() if la else torch.zeros((), device=dev)}
    out["loss"] = out["choice"] + applies_w * out["applies"]
    return out

@torch.no_grad()
def predict(model, data, items, dev, bs=8):
    model.eval(); rows = []
    for s in range(0, len(items), bs):
        chunk = items[s:s + bs]
        exs = [data.example(c, n) for c, n in chunk]
        h, W = heads(model, exs, dev)
        for i, ((c, n), e) in enumerate(zip(chunk, exs)):
            p = F.softmax((h[i, e["answer"]] @ W[e["letters"]].T).float(), -1).tolist()
            pa = F.softmax((h[i, e["markers"]] @ W[[data.b.yes, data.b.no]].T).float(), -1)[:, 0].tolist() if e["markers"] else []
            rows.append({"id": c["id"], "probs": {v: round(q, 4) for v, q in zip(VERDICTS, p)}, "applies_p": dict(zip(e["mids"], [round(q, 4) for q in pa])),
                         "applies": c["applies"], "verdict": c["verdict"], "glimmer": dict(n)})
    model.train()
    return rows

def summarize(rows):
    """Agreement with Glimmer (its majority answer; every sample), with code's verdict, and applies precision/recall."""
    n = agree = agree_s = tot_s = code = 0; tp = fp = fn = 0
    for r in rows:
        pick = max(r["probs"], key=r["probs"].get)
        g = r["glimmer"]
        n += 1; code += pick == r["verdict"]
        if g: agree += pick == max(g, key=g.get); agree_s += g.get(pick, 0); tot_s += sum(g.values())
        P = {k for k, q in r["applies_p"].items() if q >= 0.5}; T = {k for k, v in r["applies"].items() if v}
        tp += len(P & T); fp += len(P - T); fn += len(T - P)
    return {"cases": n, "agree_majority": round(agree / max(1, n), 4), "agree_samples": round(agree_s / max(1, tot_s), 4), "code_verdict": round(code / max(1, n), 4),
            "applies_precision": round(tp / max(1, tp + fp), 4), "applies_recall": round(tp / max(1, tp + fn), 4)}

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default=os.path.expanduser("~/models/meta-1b"))  # meta-llama/Llama-3.2-1B-Instruct, or Qwen/Qwen3-1.7B
    ap.add_argument("--train"); ap.add_argument("--val"); ap.add_argument("--test"); ap.add_argument("--out"); ap.add_argument("--eval"); ap.add_argument("--pred")
    ap.add_argument("--epochs", type=float, default=3); ap.add_argument("--lr", type=float, default=2e-4); ap.add_argument("--bs", type=int, default=8); ap.add_argument("--accum", type=int, default=2)
    ap.add_argument("--r", type=int, default=16); ap.add_argument("--applies_w", type=float, default=1.0)
    ap.add_argument("--target", default="teacher", choices=["teacher", "code", "mix"]); ap.add_argument("--code_w", type=float, default=0.5)
    ap.add_argument("--seed", type=int, default=0); ap.add_argument("--limit", type=int, default=0)
    a = ap.parse_args()
    from transformers import AutoTokenizer, AutoModelForCausalLM
    from peft import LoraConfig, get_peft_model, PeftModel
    random.seed(a.seed); torch.manual_seed(a.seed)
    dev = "cuda"
    tok = AutoTokenizer.from_pretrained(a.base)
    model = AutoModelForCausalLM.from_pretrained(a.base, torch_dtype=torch.bfloat16).to(dev)
    if a.eval:
        model = PeftModel.from_pretrained(model, a.eval).to(dev)
        d = Data(tok); items = load(a.test, need_teacher=False)
        t0 = time.time(); rows = predict(model, d, items, dev)
        s = summarize(rows); s["seconds"] = round(time.time() - t0, 1); print(json.dumps(s), flush=True)
        if a.pred:
            with open(a.pred, "w", encoding="utf8") as f:
                for r in rows: f.write(json.dumps(r, ensure_ascii=False) + "\n")
        return
    model.gradient_checkpointing_enable(); model.enable_input_require_grads()
    model = get_peft_model(model, LoraConfig(r=a.r, lora_alpha=2 * a.r, lora_dropout=0.05, target_modules=["q_proj", "k_proj", "v_proj", "o_proj", "gate_proj", "up_proj", "down_proj"], task_type="CAUSAL_LM"))
    d = Data(tok, a.target, a.code_w)
    train = load(a.train, need_teacher=a.target != "code"); val = load(a.val, need_teacher=False) if a.val else []
    if a.limit: train = train[:a.limit]
    exs = [d.example(c, n) for c, n in train]
    print(f"train {len(exs)} examples, val {len(val)}; target {a.target}", flush=True)
    opt = torch.optim.AdamW([p for p in model.parameters() if p.requires_grad], lr=a.lr, weight_decay=0.0)
    steps = math.ceil(len(exs) * a.epochs / (a.bs * a.accum)); warm = max(1, steps // 20)
    sched = torch.optim.lr_scheduler.LambdaLR(opt, lambda s: min(1, (s + 1) / warm) * 0.5 * (1 + math.cos(math.pi * min(1, s / steps))))
    os.makedirs(a.out, exist_ok=True); log = open(f"{a.out}/log.jsonl", "a")
    t0 = time.time(); step = 0; seen = 0; acc = collections.defaultdict(float); nacc = 0
    order = []
    while len(order) < steps * a.bs * a.accum:
        o = list(range(len(exs))); random.shuffle(o); order += o
    model.train()
    for s in range(steps):
        for _ in range(a.accum):
            batch = [exs[i] for i in order[seen:seen + a.bs]]; seen += a.bs
            out = losses(model, batch, dev, d, a.applies_w)
            (out["loss"] / a.accum).backward()
            for k, v in out.items(): acc[k] += float(v)
            nacc += 1
        torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
        opt.step(); sched.step(); opt.zero_grad(set_to_none=True); step += 1
        if step % 20 == 0 or step == steps:
            row = {"step": step, "of": steps, "sec": round(time.time() - t0), **{k: round(v / nacc, 4) for k, v in acc.items()}}
            if val and (step % 100 == 0 or step == steps): row["val"] = summarize(predict(model, d, val, dev))
            print(json.dumps(row), flush=True); log.write(json.dumps(row) + "\n"); log.flush()
            acc.clear(); nacc = 0
    model.save_pretrained(a.out)
    json.dump(vars(a), open(f"{a.out}/args.json", "w"))
    print("TRAIN_DONE", round(time.time() - t0), "s", flush=True)

if __name__ == "__main__":
    main()
