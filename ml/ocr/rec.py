"""Cover-OCR's recogniser: one text line (32 px high) to its characters, trained from scratch on the synthetic lines
(ml/ocr/gen.py). The architecture follows SVTR-tiny (Du et al., IJCAI 2022, the recogniser in PP-OCRv3/v4): a
convolutional patch stem to 1/4 of the height and width, local mixing (depthwise convolution blocks), then global
mixing (self-attention over every patch), with the height merged between stages, and a CTC head over the width.
About 5M parameters. PaddleOCR's own pretrained recogniser was not used: PaddlePaddle on this VM's CUDA 12.9 was the
riskier path (README "OCR" says so); the data and the scoring would serve a PP-OCR fine-tune the same way.
   python ml/ocr/rec.py train --data ml/ocr/out --out ml/ocr/runs/r1 [--epochs 30]
   python ml/ocr/rec.py eval --data ml/ocr/out --run ml/ocr/runs/r1 --split test       (CER, lines and fields)
"""
import argparse, json, math, os, sys, time, random
import numpy as np, cv2, torch, torch.nn as nn, torch.nn.functional as F
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from parse import fields as parse_fields

H, MAXW = 32, 512

def load_img(path):
    im = cv2.imread(path, cv2.IMREAD_COLOR)
    h, w = im.shape[:2]; w2 = min(MAXW, max(8, int(round(w * H / h))))
    return cv2.resize(im, (w2, H), interpolation=cv2.INTER_AREA)

def batchify(ims):
    W = max(i.shape[1] for i in ims); W = (W + 3) // 4 * 4
    x = np.full((len(ims), H, W, 3), 0, np.float32)
    for k, i in enumerate(ims): x[k, :, :i.shape[1]] = i.astype(np.float32) / 127.5 - 1
    return torch.from_numpy(x).permute(0, 3, 1, 2)

class Local(nn.Module):  # local mixing: depthwise 7x7 conv, then an MLP
    def __init__(s, d):
        super().__init__(); s.dw = nn.Conv2d(d, d, 7, padding=3, groups=d); s.n = nn.LayerNorm(d); s.mlp = nn.Sequential(nn.Linear(d, 4 * d), nn.GELU(), nn.Linear(4 * d, d))
    def forward(s, x):
        y = s.dw(x).permute(0, 2, 3, 1); return x + s.mlp(s.n(y)).permute(0, 3, 1, 2)

class Global(nn.Module):  # global mixing: self-attention over every patch
    def __init__(s, d, heads):
        super().__init__(); s.n1 = nn.LayerNorm(d); s.att = nn.MultiheadAttention(d, heads, batch_first=True); s.n2 = nn.LayerNorm(d); s.mlp = nn.Sequential(nn.Linear(d, 4 * d), nn.GELU(), nn.Linear(4 * d, d))
    def forward(s, x, mask=None):
        b, d, h, w = x.shape; t = x.flatten(2).transpose(1, 2)
        y = s.n1(t); t = t + s.att(y, y, y, key_padding_mask=mask, need_weights=False)[0]; t = t + s.mlp(s.n2(t))
        return t.transpose(1, 2).reshape(b, d, h, w)

class SVTRTiny(nn.Module):
    def __init__(s, n_cls, dims=(64, 128, 256)):
        super().__init__()
        s.stem = nn.Sequential(nn.Conv2d(3, dims[0] // 2, 3, 2, 1), nn.BatchNorm2d(dims[0] // 2), nn.GELU(), nn.Conv2d(dims[0] // 2, dims[0], 3, 2, 1), nn.BatchNorm2d(dims[0]), nn.GELU())  # 8 x W/4
        s.s1 = nn.Sequential(*[Local(dims[0]) for _ in range(3)])
        s.m1 = nn.Conv2d(dims[0], dims[1], (3, 3), (2, 1), 1)   # 4 x W/4
        s.s2a = nn.Sequential(*[Local(dims[1]) for _ in range(3)]); s.s2b = nn.ModuleList([Global(dims[1], 4) for _ in range(3)])
        s.m2 = nn.Conv2d(dims[1], dims[2], (3, 3), (2, 1), 1)   # 2 x W/4
        s.s3 = nn.ModuleList([Global(dims[2], 8) for _ in range(3)])
        s.head = nn.Sequential(nn.LayerNorm(dims[2]), nn.Dropout(0.1), nn.Linear(dims[2], n_cls))
    def forward(s, x, wlen=None):
        x = s.s1(s.stem(x)); x = s.s2a(s.m1(x))
        b, _, h, w = x.shape
        # padding on the right of shorter lines is masked out of the attention
        pad = lambda h, w: None if wlen is None else (torch.arange(w, device=x.device)[None, None, :] >= wlen[:, None, None]).expand(b, h, w).flatten(1)
        mask = pad(h, w)
        for g in s.s2b: x = g(x, mask)
        x = s.m2(x); b, _, h, w = x.shape
        m3 = pad(h, w)
        for g in s.s3: x = g(x, m3)
        return s.head(x.mean(2).transpose(1, 2))  # B x W/4 x classes

def read_tsv(data, split):
    rows = [l.rstrip("\n").split("\t", 1) for l in open(os.path.join(data, f"lines_{split}.tsv"), encoding="utf8")]
    return [(os.path.join(data, p), t) for p, t in rows]

def greedy(logits, chars, lengths=None):
    """CTC greedy decoding, each line read only up to its own width (not into the batch's padding)."""
    out = []
    for i, seq in enumerate(logits.argmax(-1).tolist()):
        if lengths is not None: seq = seq[:int(lengths[i])]
        s, prev = [], 0
        for k in seq:
            if k != prev and k != 0: s.append(chars[k - 1])
            prev = k
        out.append("".join(s))
    return out

def edit(a, b):
    d = list(range(len(b) + 1))
    for i, ca in enumerate(a, 1):
        p, d[0] = d[0], i
        for j, cb in enumerate(b, 1): p, d[j] = d[j], min(d[j] + 1, d[j - 1] + 1, p + (ca != cb))
    return d[len(b)]

def recognise(model, chars, ims, dev, bs=256):
    out = []
    model.eval()
    with torch.no_grad(), torch.autocast("cuda", dtype=torch.bfloat16):
        order = sorted(range(len(ims)), key=lambda i: ims[i].shape[1]); res = [None] * len(ims)
        for s in range(0, len(order), bs):
            idx = order[s:s + bs]; x = batchify([ims[i] for i in idx]).to(dev)
            wl = torch.tensor([(ims[i].shape[1] + 3) // 4 for i in idx], device=dev)
            for i, t in zip(idx, greedy(model(x, wl).float(), chars, wl.tolist())): res[i] = t
    model.train()
    return res

def train(a):
    dev = "cuda"; random.seed(0); torch.manual_seed(0)
    tr = read_tsv(a.data, "train"); te = read_tsv(a.data, "test")
    chars = sorted({c for _, t in tr for c in t})
    init = None
    if a.init:  # fine-tune from an earlier run: keep its characters (and their head rows), add any new ones
        im = json.load(open(os.path.join(a.init, "meta.json"), encoding="utf8")); init = (im["chars"], torch.load(os.path.join(a.init, "model.pt"), map_location="cpu"))
        chars = im["chars"] + sorted(set(chars) - set(im["chars"]))
    cid = {c: i + 1 for i, c in enumerate(chars)}
    print(f"{len(tr)} training lines, {len(chars)} characters", flush=True)
    t0 = time.time(); ims = [load_img(p) for p, _ in tr]; print(f"loaded in {time.time() - t0:.0f} s", flush=True)
    vi = [load_img(p) for p, _ in te[:2000]]; vt = [t for _, t in te[:2000]]
    model = SVTRTiny(len(chars) + 1).to(dev)
    if init:
        old, sd = init; own = model.state_dict()
        for k, v in sd.items():
            if k in own and own[k].shape == v.shape: own[k] = v
            elif k.startswith("head.2."): own[k][: v.shape[0]] = v  # the classes it already had (blank first, then its characters in order)
        model.load_state_dict(own); print(f"initialised from {a.init} ({len(old)} characters, {len(chars) - len(old)} new)", flush=True)
    print("parameters", sum(p.numel() for p in model.parameters()), flush=True)
    opt = torch.optim.AdamW(model.parameters(), lr=a.lr, weight_decay=0.05)
    steps = a.epochs * math.ceil(len(tr) / a.bs); warm = 500
    sch = torch.optim.lr_scheduler.LambdaLR(opt, lambda s: min(1, (s + 1) / warm) * 0.5 * (1 + math.cos(math.pi * min(1, s / steps))))
    ctc = nn.CTCLoss(blank=0, zero_infinity=True)
    os.makedirs(a.out, exist_ok=True); json.dump({"chars": chars, "args": vars(a)}, open(os.path.join(a.out, "meta.json"), "w", encoding="utf8"), ensure_ascii=False)
    log = open(os.path.join(a.out, "log.jsonl"), "a"); step = 0
    # batches of similar width (less padding)
    idx = sorted(range(len(tr)), key=lambda i: ims[i].shape[1])
    for ep in range(a.epochs):
        bat = [idx[s:s + a.bs] for s in range(0, len(idx), a.bs)]; random.shuffle(bat); tl = 0; n = 0
        for b in bat:
            x = batchify([ims[i] for i in b]).to(dev)
            # light extra noise on the fly: brightness, contrast
            x = (x * torch.empty(len(b), 1, 1, 1, device=dev).uniform_(0.8, 1.2) + torch.empty(len(b), 1, 1, 1, device=dev).uniform_(-0.15, 0.15)).clamp(-1, 1)
            wl = torch.tensor([(ims[i].shape[1] + 3) // 4 for i in b], device=dev)
            with torch.autocast("cuda", dtype=torch.bfloat16): lo = model(x, wl)
            lp = F.log_softmax(lo.float(), -1).transpose(0, 1)
            tg = [torch.tensor([cid[c] for c in tr[i][1]]) for i in b]
            loss = ctc(lp, torch.cat(tg).to(dev), wl, torch.tensor([len(t) for t in tg], device=dev))
            opt.zero_grad(set_to_none=True); loss.backward(); torch.nn.utils.clip_grad_norm_(model.parameters(), 5); opt.step(); sch.step(); step += 1
            tl += float(loss); n += 1
        pr = recognise(model, chars, vi, dev)
        cer = sum(edit(p, t) for p, t in zip(pr, vt)) / sum(len(t) for t in vt)
        row = {"epoch": ep + 1, "step": step, "loss": round(tl / n, 4), "val_cer": round(cer, 4), "val_line_exact": round(sum(p == t for p, t in zip(pr, vt)) / len(vt), 4), "sec": round(time.time() - t0)}
        print(json.dumps(row), flush=True); log.write(json.dumps(row) + "\n"); log.flush()
        torch.save(model.state_dict(), os.path.join(a.out, "model.pt"))
    print("TRAIN_DONE", flush=True)

def wilson(k, n, z=1.96):
    if not n: return [0, 0]
    p = k / n; d = 1 + z * z / n; c = p + z * z / (2 * n); h = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n))
    return [round((c - h) / d, 4), round((c + h) / d, 4)]

def evaluate(a):
    dev = "cuda"; meta = json.load(open(os.path.join(a.run, "meta.json"), encoding="utf8")); chars = meta["chars"]
    model = SVTRTiny(len(chars) + 1).to(dev); model.load_state_dict(torch.load(os.path.join(a.run, "model.pt"), map_location=dev))
    docs = [json.loads(l) for l in open(os.path.join(a.data, f"docs_{a.split}.jsonl"), encoding="utf8")]
    crops = [(d["id"], k, load_img(os.path.join(a.data, ln["crop"])), ln["text"]) for d in docs for k, ln in enumerate(d["lines"])]
    t0 = time.time(); pred = recognise(model, chars, [c[2] for c in crops], dev); ms = (time.time() - t0) * 1000 / len(crops)
    E = sum(edit(p, c[3]) for p, c in zip(pred, crops)); N = sum(len(c[3]) for c in crops)
    unseen = sum(1 for c in crops for ch in c[3] if ch not in set(chars))
    by = {}
    for (did, k, _, _), p in zip(crops, pred): by.setdefault(did, {})[k] = p
    keys = ["date", "amount", "merchant", "taxId", "reportNo", "items"]
    right = {k: 0 for k in keys}; allr = 0; ceil = {k: 0 for k in keys}; ceil_all = 0; kinds = {}; styles = {}; fails = []
    for d in docs:
        text = "\n".join(by[d["id"]][k] for k in sorted(by[d["id"]]))
        f, g, t = parse_fields(text), parse_fields(d["text"]), d["fields"]
        ok = {k: f[k] == t[k] for k in keys}; okg = {k: g[k] == t[k] for k in keys}
        for k in keys: right[k] += ok[k]; ceil[k] += okg[k]
        allr += all(ok.values()); ceil_all += all(okg.values())
        kk = kinds.setdefault(d["kind"], [0, 0]); kk[0] += all(ok.values()); kk[1] += 1
        ss = styles.setdefault(d.get("style", "plain"), [0, 0]); ss[0] += all(ok.values()); ss[1] += 1
        if not all(ok.values()) and len(fails) < 12: fails.append({"id": d["id"], "kind": d["kind"], "wrong": {k: {"want": t[k], "got": f[k]} for k in keys if not ok[k]}})
    n = len(docs)
    res = {"split": a.split, "documents": n, "lines": len(crops), "cer": round(E / N, 4), "line_exact": round(sum(p == c[3] for p, c in zip(pred, crops)) / len(crops), 4),
           "line_exact_ci95": wilson(sum(p == c[3] for p, c in zip(pred, crops)), len(crops)), "chars_not_in_training": unseen, "ms_per_line_gpu_batched": round(ms, 2),
           "fields_exact": {k: round(right[k] / n, 4) for k in keys}, "all_fields": round(allr / n, 4), "all_fields_ci95": wilson(allr, n), "by_kind_all_fields": {k: f"{v[0]}/{v[1]}" for k, v in kinds.items()}, "by_style_all_fields": {k: f"{v[0]}/{v[1]}" for k, v in styles.items()},
           "rules_on_true_text": {"fields_exact": {k: round(ceil[k] / n, 4) for k in keys}, "all_fields": round(ceil_all / n, 4)}, "failures": fails,
           "examples": [{"want": c[3], "got": p} for p, c in list(zip(pred, crops)) if p != c[3]][:15]}
    json.dump(res, open(os.path.join(a.run, f"eval_{a.split}.json"), "w", encoding="utf8"), ensure_ascii=False, indent=1)
    print(json.dumps({k: v for k, v in res.items() if k not in ("failures", "examples")}, ensure_ascii=False))

if __name__ == "__main__":
    ap = argparse.ArgumentParser(); ap.add_argument("cmd"); ap.add_argument("--data", required=True); ap.add_argument("--out"); ap.add_argument("--run"); ap.add_argument("--split", default="test")
    ap.add_argument("--epochs", type=int, default=30); ap.add_argument("--bs", type=int, default=128); ap.add_argument("--lr", type=float, default=1e-3); ap.add_argument("--init", default="")
    a = ap.parse_args()
    train(a) if a.cmd == "train" else evaluate(a)
