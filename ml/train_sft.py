"""Cover-1B: supervised fine-tuning with LoRA on the rows ml/build_1b.mjs assembles (qa, story, ocr, dialog and the
injection set), for Llama 3.2 1B Instruct or Qwen3-1.7B. The loss is on the answer's tokens only (the JSON target and
the end-of-turn token); the prompt is the model's own chat template (Qwen3 without thinking).
   python3 ml/train_sft.py --base ~/models/meta-1b --out ml/runs/c1b_llama --data ml/data/1b/sft [--epochs 2]
"""
import argparse, json, math, os, random, time, collections
import torch

TASKS = ["qa", "story", "ocr", "dialog", "inject"]

def chat_ids(tok, messages, target=None):
    """Prompt ids (the chat template with the assistant's turn opened) and, with a target, the target's ids + end."""
    kw = {"enable_thinking": False} if "qwen" in tok.name_or_path.lower() else {}
    p = tok.apply_chat_template(messages, add_generation_prompt=True, tokenize=True, **kw)
    if hasattr(p, "input_ids"): p = p["input_ids"]
    if target is None: return list(p), None
    end = "<|eot_id|>" if "<|eot_id|>" in tok.get_vocab() else "<|im_end|>"
    return list(p), tok.encode(target, add_special_tokens=False) + [tok.convert_tokens_to_ids(end)]

def load(data, split, tasks=TASKS):
    rows = []
    for t in tasks:
        f = os.path.join(data, f"{t}_{split}.jsonl")
        if os.path.exists(f): rows += [json.loads(l) for l in open(f, encoding="utf8")]
    return rows

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", required=True); ap.add_argument("--out", required=True); ap.add_argument("--data", default="ml/data/1b/sft")
    ap.add_argument("--epochs", type=float, default=2); ap.add_argument("--lr", type=float, default=2e-4); ap.add_argument("--r", type=int, default=16)
    ap.add_argument("--tokens", type=int, default=12000, help="tokens per micro-batch (padded)"); ap.add_argument("--accum", type=int, default=2); ap.add_argument("--max_len", type=int, default=2560)
    a = ap.parse_args()
    from transformers import AutoTokenizer, AutoModelForCausalLM
    from peft import LoraConfig, get_peft_model
    random.seed(0); torch.manual_seed(0); dev = "cuda"
    tok = AutoTokenizer.from_pretrained(a.base)
    rows = load(a.data, "train"); exs = []; skipped = collections.Counter()
    for r in rows:
        p, t = chat_ids(tok, r["messages"], r["target"])
        if len(p) + len(t) > a.max_len: skipped[r["task"]] += 1; continue
        exs.append((p + t, len(p), r["task"]))
    print(f"{len(exs)} examples {dict(collections.Counter(e[2] for e in exs))}, skipped as too long {dict(skipped)}", flush=True)
    model = AutoModelForCausalLM.from_pretrained(a.base, dtype=torch.bfloat16).to(dev)
    model.gradient_checkpointing_enable(); model.enable_input_require_grads()
    model = get_peft_model(model, LoraConfig(r=a.r, lora_alpha=2 * a.r, lora_dropout=0.05, target_modules=["q_proj", "k_proj", "v_proj", "o_proj", "gate_proj", "up_proj", "down_proj"], task_type="CAUSAL_LM"))
    # micro-batches of similar length, up to `tokens` padded tokens each
    def batches():
        o = sorted(range(len(exs)), key=lambda i: len(exs[i][0]) + random.random()); out, cur = [], []
        for i in o:
            if cur and (len(cur) + 1) * max(len(exs[j][0]) for j in cur + [i]) > a.tokens: out.append(cur); cur = []
            cur.append(i)
        if cur: out.append(cur)
        random.shuffle(out); return out
    nb = len(batches()); steps = math.ceil(nb * a.epochs / a.accum); warm = max(1, steps // 20)
    opt = torch.optim.AdamW([p for p in model.parameters() if p.requires_grad], lr=a.lr, weight_decay=0.0)
    sched = torch.optim.lr_scheduler.LambdaLR(opt, lambda s: min(1, (s + 1) / warm) * 0.5 * (1 + math.cos(math.pi * min(1, s / steps))))
    os.makedirs(a.out, exist_ok=True); log = open(os.path.join(a.out, "log.jsonl"), "a"); t0 = time.time(); step = 0; acc = 0.0; nacc = 0
    queue = []; model.train()  # (gradient checkpointing works only in training mode)
    while step < steps:
        if not queue: queue = batches()
        for _ in range(a.accum):
            if not queue: queue = batches()
            b = queue.pop(); L = max(len(exs[i][0]) for i in b)
            ids = torch.full((len(b), L), tok.pad_token_id or 0); lab = torch.full((len(b), L), -100); att = torch.zeros((len(b), L), dtype=torch.long)
            for k, i in enumerate(b):
                x, pl, _ = exs[i]; ids[k, :len(x)] = torch.tensor(x); att[k, :len(x)] = 1; lab[k, pl:len(x)] = torch.tensor(x[pl:])
            # the LM head only where there is a label (the answer), as Serve's jev/train.py reads only its positions:
            # the full vocabulary at every prompt position would not fit beside Ollama on the GPU
            base = model.get_base_model()
            h = base.model(input_ids=ids.to(dev), attention_mask=att.to(dev)).last_hidden_state[:, :-1]
            y = lab[:, 1:].to(dev); m = y != -100
            loss = torch.nn.functional.cross_entropy(base.lm_head(h[m]).float(), y[m])
            (loss / a.accum).backward(); acc += float(loss.detach()); nacc += 1
        torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0); opt.step(); sched.step(); opt.zero_grad(set_to_none=True); step += 1
        if step % 20 == 0 or step == steps:
            row = {"step": step, "of": steps, "loss": round(acc / nacc, 4), "sec": round(time.time() - t0)}; acc = 0.0; nacc = 0
            print(json.dumps(row), flush=True); log.write(json.dumps(row) + "\n"); log.flush()
    model.save_pretrained(a.out); json.dump(vars(a), open(os.path.join(a.out, "args.json"), "w"))
    print("TRAIN_DONE", round(time.time() - t0), "s", flush=True)

if __name__ == "__main__":
    main()
