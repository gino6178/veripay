"""Done-VLM: LoRA fine-tune of SmolVLM2-500M-Video-Instruct (Apache 2.0) on Glimmer's describe-only answers
(vlm/teach.py, kept rows only). Only the language model gets adapters; the vision encoder and the connector stay as
they are, so the served GGUF keeps the base model's projector (mmproj). Loss on the answer tokens only.
Checkpoints (adapter + optimizer + step) every --ckpt_every steps; a rerun resumes from the last one.
   python ml/vlm/train_vlm.py --base ~/models/vlm/smolvlm2-500m-hf --teach ml/vlm/teach/raw.jsonl --photos ml/vlm/photos --out ml/vlm/runs/v1
Then <out>/merged holds the merged model for llama.cpp's convert_hf_to_gguf.py."""
import argparse, json, os, random, sys, torch
from PIL import Image
from transformers import AutoProcessor, AutoModelForImageTextToText
from peft import LoraConfig, get_peft_model, PeftModel, set_peft_model_state_dict, get_peft_model_state_dict
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from describe_eval import PROMPT
from teach import check   # checks are recomputed here, so a keyword added after teaching counts

ap = argparse.ArgumentParser()
for k, d in [("--base", None), ("--teach", None), ("--photos", None), ("--out", None)]: ap.add_argument(k, required=True)
ap.add_argument("--epochs", type=float, default=2); ap.add_argument("--lr", type=float, default=1e-4); ap.add_argument("--batch", type=int, default=8)
ap.add_argument("--side", type=int, default=448); ap.add_argument("--ckpt_every", type=int, default=40); ap.add_argument("--r", type=int, default=16)
a = ap.parse_args(); os.makedirs(a.out, exist_ok=True); ck = os.path.join(a.out, "ckpt")
rows = [json.loads(l) for l in open(a.teach, encoding="utf8") if l.strip().endswith("}")]
test = set(json.load(open(os.path.join(a.photos, "test_files.json"))))
rows = [r for r in rows if r["text"] and check(r["text"], r["thing"]) == "ok" and r["file"] not in test]
seen = set(); rows = [r for r in rows if not ((r["file"], r["text"]) in seen or seen.add((r["file"], r["text"])))]
print(len(rows), "examples from", len({r["file"] for r in rows}), "photos", flush=True)

proc = AutoProcessor.from_pretrained(a.base)
model = AutoModelForImageTextToText.from_pretrained(a.base, dtype=torch.bfloat16).cuda()
lcfg = LoraConfig(r=a.r, lora_alpha=2 * a.r, lora_dropout=0.05, target_modules=r".*text_model.*\.(q_proj|k_proj|v_proj|o_proj|gate_proj|up_proj|down_proj)")
model = get_peft_model(model, lcfg); model.print_trainable_parameters()

def example(r):
    im = Image.open(os.path.join(a.photos, r["file"])).convert("RGB"); im.thumbnail((a.side, a.side))
    user = [{"role": "user", "content": [{"type": "image"}, {"type": "text", "text": PROMPT}]}]
    full = user + [{"role": "assistant", "content": [{"type": "text", "text": r["text"]}]}]
    p_text = proc.apply_chat_template(user, add_generation_prompt=True, tokenize=False)
    f_text = proc.apply_chat_template(full, tokenize=False)
    enc = proc(text=[f_text], images=[[im]], return_tensors="pt")
    n_prompt = proc(text=[p_text], images=[[im]], return_tensors="pt")["input_ids"].shape[1]
    labels = enc["input_ids"].clone(); labels[:, :n_prompt] = -100
    return enc, labels

steps_per_epoch = (len(rows) + a.batch - 1) // a.batch; total = int(steps_per_epoch * a.epochs)
opt = torch.optim.AdamW([p for p in model.parameters() if p.requires_grad], lr=a.lr, weight_decay=0.0)
sched = torch.optim.lr_scheduler.LambdaLR(opt, lambda s: min(1.0, (s + 1) / 20) * max(0.05, 1 - s / max(1, total)))
step = 0
if os.path.exists(os.path.join(ck, "state.pt")):
    st = torch.load(os.path.join(ck, "state.pt"), weights_only=False)
    set_peft_model_state_dict(model, st["adapter"]); opt.load_state_dict(st["opt"]); sched.load_state_dict(st["sched"]); step = st["step"]
    print("resumed at step", step, flush=True)
order = []
for e in range(int(a.epochs) + 1): rr = list(range(len(rows))); random.Random(100 + e).shuffle(rr); order += rr
model.train()
while step < total:
    batch = order[step * a.batch:(step + 1) * a.batch]; loss_sum = 0.0
    for i in batch:
        enc, labels = example(rows[i])
        enc = {k: v.cuda() for k, v in enc.items()}
        if "pixel_values" in enc: enc["pixel_values"] = enc["pixel_values"].to(torch.bfloat16)
        loss = model(**enc, labels=labels.cuda()).loss / len(batch); loss.backward(); loss_sum += loss.item()
    torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0); opt.step(); sched.step(); opt.zero_grad(); step += 1
    if step % 10 == 0: print(f"step {step}/{total} loss {loss_sum:.4f}", flush=True)
    if step % a.ckpt_every == 0 or step == total:
        os.makedirs(ck, exist_ok=True); tmp = os.path.join(ck, "state.tmp")
        torch.save({"adapter": get_peft_model_state_dict(model), "opt": opt.state_dict(), "sched": sched.state_dict(), "step": step}, tmp); os.replace(tmp, os.path.join(ck, "state.pt"))
model.save_pretrained(os.path.join(a.out, "adapter"))
merged = model.merge_and_unload(); merged.save_pretrained(os.path.join(a.out, "merged")); proc.save_pretrained(os.path.join(a.out, "merged"))
json.dump({"examples": len(rows), "photos": len({r["file"] for r in rows}), "steps": total, "epochs": a.epochs, "lr": a.lr, "r": a.r}, open(os.path.join(a.out, "train_info.json"), "w"))
print("TRAIN_VLM_DONE", flush=True)
