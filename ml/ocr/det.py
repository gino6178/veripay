"""Done-OCR's text-line detector, so a photo is read end to end without the generator's line corners: a small U-Net
predicts, DBNet-style, a probability map of each line's shrunk region on the photo (scaled to 640 px on the long
side); connected regions above 0.5 become rotated boxes, grown back by the shrink, cut out and straightened
(gen.py cut), then read by the recogniser (rec.py), ordered top to bottom, and turned into fields by parse.py.
Trained on the generator's photos, with each line's quad as the label.
   python ml/ocr/det.py train --data ml/ocr/out_done --splits det0,det1 --out ml/ocr/runs/det1 [--epochs 20]
   python ml/ocr/det.py eval --data ml/ocr/out_done --det ml/ocr/runs/det1 --rec ml/ocr/runs/done1 --split test
     line recall/precision (a detected box matches a true line at IoU >= 0.5), and end to end from the photo: CER of
     the read lines against the true text, and the fields exact (the same scoring as rec.py eval, which uses the true
     line corners).
"""
import argparse, json, math, os, sys, time, random
import numpy as np, cv2, torch, torch.nn as nn, torch.nn.functional as F
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

S = 640; SHRINK = 0.6

def conv(i, o): return nn.Sequential(nn.Conv2d(i, o, 3, padding=1), nn.BatchNorm2d(o), nn.ReLU(inplace=True), nn.Conv2d(o, o, 3, padding=1), nn.BatchNorm2d(o), nn.ReLU(inplace=True))
class UNet(nn.Module):
    def __init__(s, c=(16, 32, 64, 128)):
        super().__init__()
        s.d = nn.ModuleList([conv(3, c[0]), conv(c[0], c[1]), conv(c[1], c[2]), conv(c[2], c[3])])
        s.u = nn.ModuleList([conv(c[3] + c[2], c[2]), conv(c[2] + c[1], c[1]), conv(c[1] + c[0], c[0])])
        s.out = nn.Conv2d(c[0], 1, 1)
    def forward(s, x):
        f = []
        for k, d in enumerate(s.d):
            x = d(x if k == 0 else F.max_pool2d(x, 2)); f.append(x)
        for k, u in enumerate(s.u):
            x = F.interpolate(x, scale_factor=2, mode="nearest"); x = u(torch.cat([x, f[-2 - k]], 1))
        return s.out(x)

def prep(img):
    h, w = img.shape[:2]; k = S / max(h, w); im = cv2.resize(img, (int(w * k) // 8 * 8, int(h * k) // 8 * 8))
    return im, k, (im.shape[1] / w, im.shape[0] / h)

def shrink_quad(q, f):
    q = np.float32(q); c = q.mean(0); hgt = (np.linalg.norm(q[3] - q[0]) + np.linalg.norm(q[2] - q[1])) / 2
    up = (q[0] - q[3] + q[1] - q[2]) / 4; n = up / (np.linalg.norm(up) + 1e-6)
    out = q.copy(); d = hgt * (1 - f) / 2
    out[0] -= n * d; out[1] -= n * d; out[2] += n * d; out[3] += n * d  # pull the top and bottom edges in
    return out

def target(doc, data, shape, sx, sy):
    m = np.zeros(shape, np.uint8)
    for ln in doc["lines"]:
        q = shrink_quad(np.float32(ln["quad"]) * [sx, sy], SHRINK); cv2.fillPoly(m, [q.astype(np.int32)], 1)
    return m

def load(data, splits):
    items = []
    for sp in splits.split(","):
        for l in open(os.path.join(data, f"docs_{sp}.jsonl"), encoding="utf8"):
            d = json.loads(l)
            if d.get("image"): items.append(d)
    return items

def train(a):
    dev = "cuda"; random.seed(0); torch.manual_seed(0)
    docs = load(a.data, a.splits); X, Y = [], []
    for d in docs:
        img = cv2.imread(os.path.join(a.data, d["image"])); im, k, (sx, sy) = prep(img)
        X.append(im); Y.append(target(d, a.data, im.shape[:2], sx, sy))
    print(f"{len(X)} photos", flush=True)
    model = UNet().to(dev); opt = torch.optim.AdamW(model.parameters(), lr=2e-3, weight_decay=1e-4)
    steps = a.epochs * math.ceil(len(X) / a.bs); sch = torch.optim.lr_scheduler.OneCycleLR(opt, 2e-3, total_steps=steps)
    os.makedirs(a.out, exist_ok=True); t0 = time.time(); step = 0
    for ep in range(a.epochs):
        idx = list(range(len(X))); random.shuffle(idx); tl = 0; n = 0
        for s in range(0, len(idx), a.bs):
            b = idx[s:s + a.bs]; H = max(X[i].shape[0] for i in b); W = max(X[i].shape[1] for i in b)
            x = torch.zeros(len(b), 3, H, W); y = torch.zeros(len(b), 1, H, W)
            for j, i in enumerate(b):
                h, w = X[i].shape[:2]; x[j, :, :h, :w] = torch.from_numpy(X[i]).permute(2, 0, 1).float() / 127.5 - 1; y[j, 0, :h, :w] = torch.from_numpy(Y[i]).float()
            x, y = x.to(dev), y.to(dev)
            with torch.autocast("cuda", dtype=torch.bfloat16): lo = model(x)
            lo = lo.float(); p = torch.sigmoid(lo)
            dice = 1 - (2 * (p * y).sum() + 1) / (p.sum() + y.sum() + 1)
            loss = F.binary_cross_entropy_with_logits(lo, y) + dice
            opt.zero_grad(set_to_none=True); loss.backward(); opt.step(); sch.step(); step += 1; tl += float(loss.detach()); n += 1
        print(json.dumps({"epoch": ep + 1, "loss": round(tl / n, 4), "sec": round(time.time() - t0)}), flush=True)
        torch.save(model.state_dict(), os.path.join(a.out, "det.pt"))
    print("TRAIN_DONE", flush=True)

def detect(model, img, dev):
    im, k, (sx, sy) = prep(img)
    x = torch.from_numpy(im).permute(2, 0, 1).float()[None] / 127.5 - 1
    with torch.no_grad(): p = torch.sigmoid(model(x.to(dev)).float())[0, 0].cpu().numpy()
    n, lab, stats, _ = cv2.connectedComponentsWithStats((p > 0.5).astype(np.uint8), 8)
    quads = []
    for i in range(1, n):
        if stats[i, cv2.CC_STAT_AREA] < 20: continue
        pts = np.column_stack(np.where(lab == i))[:, ::-1].astype(np.float32)
        (cx, cy), (w, h), ang = cv2.minAreaRect(pts)
        if w < h: w, h, ang = h, w, ang + 90
        h = h / SHRINK; box = cv2.boxPoints(((cx, cy), (w + 6, h), ang))  # only the height was shrunk in training
        # order: top-left, top-right, bottom-right, bottom-left (in reading direction)
        box = sorted(box.tolist(), key=lambda q: q[0]); left, right = sorted(box[:2], key=lambda q: q[1]), sorted(box[2:], key=lambda q: q[1])
        q = np.float32([left[0], right[0], right[1], left[1]]) / [sx, sy]
        quads.append(q)
    quads.sort(key=lambda q: q[:, 1].mean())
    return quads

def iou(a, b):
    ra, rb = cv2.minAreaRect(np.float32(a)), cv2.minAreaRect(np.float32(b)); r, inter = cv2.rotatedRectangleIntersection(ra, rb)
    if r == cv2.INTERSECT_NONE or inter is None: return 0.0
    ia = cv2.contourArea(inter); return ia / (ra[1][0] * ra[1][1] + rb[1][0] * rb[1][1] - ia + 1e-6)

def evaluate(a):
    from rec import SVTRTiny, recognise, load_img, edit, wilson
    from gen import cut
    from parse import fields as parse_fields
    dev = "cuda" if torch.cuda.is_available() else "cpu"
    det = UNet().to(dev); det.load_state_dict(torch.load(os.path.join(a.det, "det.pt"), map_location=dev)); det.eval()
    meta = json.load(open(os.path.join(a.rec, "meta.json"), encoding="utf8")); chars = meta["chars"]
    rec = SVTRTiny(len(chars) + 1).to(dev); rec.load_state_dict(torch.load(os.path.join(a.rec, "model.pt"), map_location=dev))
    docs = load(a.data, a.split); keys = ["date", "amount", "merchant", "taxId", "reportNo", "items"]
    tp = fp = fn = 0; E = N = 0; right = {k: 0 for k in keys}; allr = 0; ms = []
    for d in docs:
        img = cv2.imread(os.path.join(a.data, d["image"])); t0 = time.time()
        qs = detect(det, img, dev)
        ims = []
        for q in qs:
            c = cut(img, q, None, jitter=False); h, w = c.shape[:2]; ims.append(cv2.resize(c, (min(512, max(8, int(w * 32 / h))), 32)))
        texts = recognise(rec, chars, ims, dev) if ims else []
        ms.append((time.time() - t0) * 1000)
        true = [ln["quad"] for ln in d["lines"]]; used = set()
        for q in qs:
            best = max(((iou(q, t), j) for j, t in enumerate(true) if j not in used), default=(0, None))
            if best[0] >= 0.5: tp += 1; used.add(best[1])
            else: fp += 1
        fn += len(true) - len(used)
        got = "\n".join(texts); want = d["text"]
        E += edit(got, want); N += len(want)
        f, t = parse_fields(got), d["fields"]; ok = {k: f[k] == t[k] for k in keys}
        for k in keys: right[k] += ok[k]
        allr += all(ok.values())
    n = len(docs)
    res = {"split": a.split, "documents": n, "line_recall": round(tp / max(1, tp + fn), 4), "line_precision": round(tp / max(1, tp + fp), 4),
           "cer_page": round(E / max(1, N), 4), "fields_exact": {k: round(right[k] / n, 4) for k in keys}, "all_fields": round(allr / n, 4), "all_fields_ci95": wilson(allr, n),
           "ms_per_page_p50": round(sorted(ms)[len(ms) // 2], 1), "device": dev}
    json.dump(res, open(os.path.join(a.det, f"eval_{a.split}_{dev}.json"), "w"), indent=1); print(json.dumps(res))

if __name__ == "__main__":
    ap = argparse.ArgumentParser(); ap.add_argument("cmd"); ap.add_argument("--data", required=True); ap.add_argument("--splits", default=""); ap.add_argument("--split", default="test")
    ap.add_argument("--out"); ap.add_argument("--det"); ap.add_argument("--rec"); ap.add_argument("--epochs", type=int, default=20); ap.add_argument("--bs", type=int, default=8)
    a = ap.parse_args()
    train(a) if a.cmd == "train" else evaluate(a)
