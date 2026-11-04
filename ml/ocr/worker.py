"""Cover-OCR as the app's document reader, on the CPU: a photo of a receipt, invoice, repair quote or police slip in,
the reader's fields out (api/src/reader.js mode "cover-ocr").

  photo -> lines (find_lines: no trained detector yet, see below) -> text (rec.py's SVTR-tiny recogniser, CTC greedy)
        -> fields (parse.py's rules) + a confidence

Line finding is deliberately simple, and measured, not assumed:
  1. Ink: a local (adaptive) threshold on the grey image, so glare and uneven light don't decide what is dark.
     Specks, long thin strokes (creases, the paper's edge) and huge blobs are dropped as connected components.
  2. Skew: the angle (-9..9 degrees) whose horizontal projection of the ink is sharpest (largest sum of squares).
     The photo is turned by it.
  3. Lines: the turned ink's horizontal projection, smoothed; runs of rows with ink are lines, and a run taller than a
     line is split at its weakest row. Each line's left and right ends come from its own columns of ink.
  4. Each line is refined on its own (its own small skew), then cut 32 px high with 3 px of slack, as rec.py's
     training crops were.

  python ml/ocr/worker.py serve [--port 11449] [--run ml/ocr/runs/r1]
  python ml/ocr/worker.py eval --data ml/ocr/out --split test [--limit N]     (photo -> fields, end to end)

POST /read {"image": base64 jpeg/png, "kind": optional} -> {"fields": {...}, "confidence": 0..1, "version", "ms", "lines"}
GET /health -> {"ok": true, "version", "threads"}
Listens on 127.0.0.1 only. One document at a time (a lock), torch on the CPU.
"""
import argparse, base64, json, math, os, sys, threading, time
import numpy as np, cv2, torch

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from rec import SVTRTiny, H, MAXW, edit, wilson  # noqa: E402
import importlib  # noqa: E402

# A model is a run directory: model.pt and meta.json ({"chars": [...], and optionally "version", "parser", "dims"}).
# "parser" names the module whose fields(text) turns its lines into the reader's fields (default parse.py, the rules for
# Taiwan documents). Swapping in another model, such as an English one with its own rules, is a new run directory
# and OCR_RUN=... (serve.sh); nothing here changes.


# ---- the recogniser on the CPU ---------------------------------------------------------------------------------------
class Reader:
    def __init__(self, run, threads=1):
        torch.set_num_threads(threads)
        self.threads = threads
        meta = json.load(open(os.path.join(run, "meta.json"), encoding="utf8"))
        self.chars = meta["chars"]
        self.version = meta.get("version") or f"cover-ocr-{os.path.basename(os.path.normpath(run))}"
        self.parse = importlib.import_module(meta.get("parser", "parse")).fields
        self.model = SVTRTiny(len(self.chars) + 1, **({"dims": tuple(meta["dims"])} if meta.get("dims") else {}))
        self.model.load_state_dict(torch.load(os.path.join(run, "model.pt"), map_location="cpu"))
        self.model.eval()

    def recognise(self, crops):
        """Each crop (H px high, BGR uint8) to (text, confidence): the mean of the best class's probability over the
        characters emitted (1.0 for an empty line). Lines go through one at a time: the convolutions see a batch's
        padding, and the model was trained and scored on batches of nearly equal width (rec.py sorts by width), so
        padding a short line to a long one's width costs it its last characters."""
        out = []
        with torch.inference_mode():
            for c in crops:
                W = (c.shape[1] + 3) // 4 * 4
                x = np.zeros((1, H, W, 3), np.float32); x[0, :, :c.shape[1]] = c.astype(np.float32) / 127.5 - 1
                n = (c.shape[1] + 3) // 4
                p = self.model(torch.from_numpy(x).permute(0, 3, 1, 2), torch.tensor([n])).float().softmax(-1)[0, :n]
                conf, arg = p.max(-1)
                s_, c_, prev = [], [], 0
                for a, cf in zip(arg.tolist(), conf.tolist()):
                    if a != prev and a != 0: s_.append(self.chars[a - 1]); c_.append(cf)
                    prev = a
                out.append(("".join(s_), float(np.mean(c_)) if c_ else 1.0))
        return out


def to_crop(im):
    """A line image to rec.py's input: H px high, at most MAXW wide (load_img's resize)."""
    h, w = im.shape[:2]
    w2 = min(MAXW, max(8, int(round(w * H / max(h, 1)))))
    return cv2.resize(im, (w2, H), interpolation=cv2.INTER_AREA)


# ---- line finding ------------------------------------------------------------------------------------------------------
def paper_mask(gray):
    """The sheet of paper: the largest bright region (Otsu on a heavily blurred photo), filled and pulled in a little,
    so the paper's own edge against the background is not read as ink. None when no clear sheet stands out."""
    h, w = gray.shape
    g = cv2.GaussianBlur(gray, (0, 0), 9)
    _, t = cv2.threshold(g, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    n, lab, st, _ = cv2.connectedComponentsWithStats(t, 8)
    if n < 2: return None
    k = 1 + int(np.argmax(st[1:, cv2.CC_STAT_AREA]))
    if st[k, cv2.CC_STAT_AREA] < 0.3 * h * w or st[k, cv2.CC_STAT_AREA] > 0.97 * h * w: return None
    cs, _ = cv2.findContours((lab == k).astype(np.uint8), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    m = np.zeros((h, w), np.uint8); cv2.drawContours(m, [cv2.convexHull(max(cs, key=cv2.contourArea))], -1, 1, -1)
    return cv2.erode(m, np.ones((9, 9), np.uint8))


def ink_mask(gray):
    """Dark strokes against their own neighbourhood, on the paper; specks, long thin strokes and huge blobs removed."""
    h, w = gray.shape
    blk = max(15, (min(h, w) // 20) | 1)
    m = cv2.adaptiveThreshold(cv2.GaussianBlur(gray, (3, 3), 0), 255, cv2.ADAPTIVE_THRESH_MEAN_C, cv2.THRESH_BINARY_INV, blk, 12)
    p = paper_mask(gray)
    if p is not None: m &= p * 255
    n, lab, st, _ = cv2.connectedComponentsWithStats(m, 8)
    keep = np.zeros(n, np.uint8)
    for i in range(1, n):
        x, y, bw, bh, area = st[i]
        if area < 4: continue                                   # noise
        if bh > 70: continue                                    # taller than any printed line: edge, crease, shadow
        if bw > 0.6 * w and bh < 6: continue                    # a long thin stroke across the page
        if bw > 12 * bh and bw > 120 and area < 0.25 * bw * bh: continue  # a diagonal or crease segment
        keep[i] = 1
    return keep[lab].astype(np.uint8)


def best_angle(mask, lo=-9.0, hi=9.0, step=0.25):
    ys, xs = np.nonzero(mask)
    if len(ys) < 50: return 0.0
    if len(ys) > 60000:
        k = np.random.default_rng(0).choice(len(ys), 60000, replace=False); ys, xs = ys[k], xs[k]
    xs = xs - mask.shape[1] / 2; ys = ys - mask.shape[0] / 2
    def score(a):
        t = math.radians(a); y2 = ys * math.cos(t) - xs * math.sin(t)
        hst = np.bincount((y2 - y2.min()).astype(np.int64)); return float((hst.astype(np.float64) ** 2).sum())
    angs = np.arange(lo, hi + 1e-9, step); sc = [score(a) for a in angs]; a0 = float(angs[int(np.argmax(sc))])
    fine = np.arange(a0 - step, a0 + step + 1e-9, step / 5); sf = [score(a) for a in fine]
    return float(fine[int(np.argmax(sf))])


def rotate(img, deg, border=cv2.BORDER_REPLICATE, interp=cv2.INTER_LINEAR):
    h, w = img.shape[:2]
    M = cv2.getRotationMatrix2D((w / 2, h / 2), deg, 1.0)
    return cv2.warpAffine(img, M, (w, h), flags=interp, borderMode=border)


def runs(v, thr, min_len=1):
    on = v > thr; out = []; i = 0; n = len(v)
    while i < n:
        if on[i]:
            j = i
            while j < n and on[j]: j += 1
            if j - i >= min_len: out.append([i, j])
            i = j
        else: i += 1
    return out


def x_extent(cols, gap):
    """The main stretch of a line's columns of ink: runs closer than `gap` are joined, and stray far pieces dropped."""
    xs = np.nonzero(cols)[0]
    if not len(xs): return None
    segs = [[xs[0], xs[0]]]
    for x in xs[1:]:
        if x - segs[-1][1] <= gap: segs[-1][1] = x
        else: segs.append([x, x])
    mass = [cols[a:b + 1].sum() for a, b in segs]
    # keep the heaviest segment and everything joined to it within 3 gaps (two-column lines such as "item    price")
    k = int(np.argmax(mass)); a, b = segs[k]
    for s, e in segs[k + 1:]:
        if s - b <= 3 * gap * 2: b = e
        else: break
    for s, e in reversed(segs[:k]):
        if a - e <= 3 * gap * 2: a = s
        else: break
    return int(a), int(b)


def bands_of(M):
    """Runs of rows with ink in the horizontal projection; a run taller than a line is split at its weakest row."""
    prof = np.convolve(M.sum(1).astype(np.float32), np.ones(3) / 3, "same")
    thr = max(2.0, 0.04 * float(np.percentile(prof[prof > 0], 90))) if (prof > 0).any() else 2.0
    out = []
    for a, b in runs(prof, thr, 5):
        stack = [[a, b]]
        while stack:
            a2, b2 = stack.pop()
            if b2 - a2 > 52:
                c = a2 + 10 + int(np.argmin(prof[a2 + 10:b2 - 10])); stack += [[c + 1, b2], [a2, c]]
            else: out.append([a2, b2])
    return sorted(x for x in out if x[1] - x[0] >= 7)


def cut_quad(img, q, H=H):
    """gen.py's cut(): a quad straightened to H px high."""
    q = np.float32(q)
    wq = max(np.linalg.norm(q[1] - q[0]), np.linalg.norm(q[2] - q[3])); hq = max(np.linalg.norm(q[3] - q[0]), np.linalg.norm(q[2] - q[1]))
    W = max(8, int(round(wq * H / max(hq, 1))))
    M = cv2.getPerspectiveTransform(q, np.float32([[0, 0], [W, 0], [W, H], [0, H]]))
    return cv2.warpPerspective(img, M, (W, H), borderMode=cv2.BORDER_REPLICATE)


def find_lines(img):
    """A photo (BGR) -> the lines (each with its quad in the photo and its crop, H px high), top to bottom.
    Bands come from the deskewed projection; each band's line is then fitted from its own pieces of ink (connected
    components whose centre lies in the band), so a line the perspective tilts against the band is still cut whole."""
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    m = ink_mask(gray)
    ang = best_angle(m)
    h, w = m.shape
    Rm = cv2.getRotationMatrix2D((w / 2, h / 2), ang, 1.0); Ri = cv2.invertAffineTransform(Rm)
    M = cv2.warpAffine(m, Rm, (w, h), flags=cv2.INTER_NEAREST, borderMode=cv2.BORDER_CONSTANT)
    n, lab, st, cen = cv2.connectedComponentsWithStats(M, 8)
    lines = []
    for a, b in bands_of(M):
        ids = [i for i in range(1, n) if a <= cen[i][1] < b]
        if not ids: continue
        ids.sort(key=lambda i: st[i][0])
        # the main stretch: pieces closer than a few line heights are joined; far strays (a stain, a fold) dropped
        lh = b - a; gap = max(24, 3 * lh)
        groups = [[ids[0]]]; right = st[ids[0]][0] + st[ids[0]][2]
        for i in ids[1:]:
            if st[i][0] - right <= gap: groups[-1].append(i)
            else: groups.append([i])
            right = max(right, st[i][0] + st[i][2]) if len(groups[-1]) > 1 else st[i][0] + st[i][2]
        g = max(groups, key=lambda G: sum(st[j][4] for j in G))
        area = sum(st[j][4] for j in g)
        x0 = min(st[j][0] for j in g); x1 = max(st[j][0] + st[j][2] for j in g)
        if x1 - x0 < 10 or area < 0.04 * lh * (x1 - x0): continue
        # the line's own slant: a weighted fit of the pieces' centres (only when the line is long enough to show it)
        xs = np.array([cen[j][0] for j in g]); ys = np.array([cen[j][1] for j in g]); ws = np.array([st[j][4] for j in g], float)
        k = 0.0
        for _ in range(2):  # fit, then take every piece near the fitted line (a tilted line's end leaves its band)
            if len(g) >= 4 and x1 - x0 > 4 * lh:
                k, c0 = np.polyfit(xs, ys, 1, w=np.sqrt(ws)); k = max(-0.05, min(0.05, float(k)))
            else: c0 = float(np.average(ys, weights=ws)) - k * float(np.average(xs, weights=ws))
            c0 = float(np.average(ys - k * xs, weights=ws))
            g = [i for i in range(1, n) if abs(cen[i][1] - (c0 + k * cen[i][0])) < 0.45 * lh and x0 - gap <= cen[i][0] <= x1 + gap and st[i][3] < 2.2 * lh]
            if not g: break
            x0 = min(st[j][0] for j in g); x1 = max(st[j][0] + st[j][2] for j in g)
            xs = np.array([cen[j][0] for j in g]); ys = np.array([cen[j][1] for j in g]); ws = np.array([st[j][4] for j in g], float)
        if not g: continue
        top = min(st[j][1] - k * (st[j][0] + st[j][2] / 2) for j in g); bot = max(st[j][1] + st[j][3] - k * (st[j][0] + st[j][2] / 2) for j in g)
        X0, X1 = x0 - 3, x1 + 3; T, B = top - 3, bot + 3
        q = np.float32([[X0, T + k * X0], [X1, T + k * X1], [X1, B + k * X1], [X0, B + k * X0]])
        qi = cv2.transform(q.reshape(-1, 1, 2), Ri).reshape(-1, 2)   # back into the photo
        crop = cut_quad(img, qi)
        lines.append({"quad": qi.round(1).tolist(), "box": [int(qi[:, 0].min()), int(qi[:, 1].min()), int(qi[:, 0].max()), int(qi[:, 1].max())], "crop": to_crop(crop)})
    return lines, ang


def read_document(reader, img):
    t0 = time.time()
    lines, ang = find_lines(img)
    rec = reader.recognise([l["crop"] for l in lines]) if lines else []
    # a "line" the recogniser is unsure of throughout is usually not text (the paper's edge, a fold, a shadow)
    rec = [(t, c) for t, c in rec if c >= 0.5]
    texts = [t for t, _ in rec]
    text = "\n".join(t for t in texts if t)
    f = reader.parse(text)
    # confidence: the recogniser's own certainty on the lines, times how much of the document's schema was found
    lc = [c for (t, c) in rec if t]
    cert = float(np.exp(np.mean(np.log(np.clip(lc, 1e-6, 1))))) if lc else 0.0
    worst = float(min(lc)) if lc else 0.0
    police = f["reportNo"] is not None
    need = ["date", "merchant", "reportNo"] if police else ["date", "amount", "merchant"]
    filled = sum(1 for k in need if f[k]) / len(need)
    conf = round(min(cert, 0.5 + worst / 2) * filled, 3)
    f["text"] = text
    return {"fields": f, "confidence": conf, "version": reader.version, "ms": int((time.time() - t0) * 1000), "lines": len(lines), "skew": round(ang, 2)}


# ---- end-to-end evaluation on the generator's held-out photos ---------------------------------------------------------
def evaluate(a):
    reader = Reader(a.run, a.threads)
    docs = [json.loads(l) for l in open(os.path.join(a.data, f"docs_{a.split}.jsonl"), encoding="utf8")]
    docs = [d for d in docs if d.get("image") and os.path.exists(os.path.join(a.data, d["image"]))]
    if a.limit: docs = docs[:a.limit]
    keys = ["date", "amount", "merchant", "taxId", "reportNo", "items"]
    right = {k: 0 for k in keys}; allr = 0; E = N = 0; nlines_ok = 0; kinds = {}; ms = []; fails = []; confs = []
    for d in docs:
        img = cv2.imread(os.path.join(a.data, d["image"]), cv2.IMREAD_COLOR)
        r = read_document(reader, img); f = r["fields"]; t = d["fields"]
        ok = {k: f[k] == t[k] for k in keys}
        for k in keys: right[k] += ok[k]
        good = all(ok.values()); allr += good; confs.append((r["confidence"], good))
        E += edit(r["fields"]["text"], d["text"]); N += len(d["text"])
        nlines_ok += r["lines"] == len(d["lines"]); ms.append(r["ms"])
        kk = kinds.setdefault(d["kind"], [0, 0]); kk[0] += good; kk[1] += 1
        if not good and len(fails) < 15: fails.append({"id": d["id"], "kind": d["kind"], "lines": [r["lines"], len(d["lines"])], "wrong": {k: {"want": t[k], "got": f[k]} for k in keys if not ok[k]}})
    n = len(docs)
    # how well the confidence sorts right from wrong documents: all-fields accuracy above each threshold
    by_conf = {}
    for th in (0.5, 0.7, 0.8, 0.9):
        sel = [g for c, g in confs if c >= th]
        by_conf[str(th)] = {"share": round(len(sel) / n, 3), "all_fields": round(sum(sel) / len(sel), 3) if sel else None}
    res = {"split": a.split, "documents": n, "pipeline": "photo -> find_lines (projection) -> recogniser on CPU -> parser", "run": a.run, "version": reader.version,
           "doc_cer": round(E / N, 4), "line_count_right": round(nlines_ok / n, 4),
           "fields_exact": {k: round(right[k] / n, 4) for k in keys}, "fields_exact_ci95": {k: wilson(right[k], n) for k in keys},
           "all_fields": round(allr / n, 4), "all_fields_ci95": wilson(allr, n), "by_kind_all_fields": {k: f"{v[0]}/{v[1]}" for k, v in kinds.items()},
           "ms_per_document_cpu": {"median": int(np.median(ms)), "p90": int(np.percentile(ms, 90)), "threads": a.threads},
           "by_confidence": by_conf, "failures": fails}
    if a.out: json.dump(res, open(a.out, "w", encoding="utf8"), ensure_ascii=False, indent=1)
    print(json.dumps({k: v for k, v in res.items() if k != "failures"}, ensure_ascii=False))
    return res


# ---- the HTTP worker ----------------------------------------------------------------------------------------------------
def serve(a):
    from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
    reader = Reader(a.run, a.threads); lock = threading.Lock()
    MAX = 9 * 1024 * 1024

    class Handler(BaseHTTPRequestHandler):
        def _send(self, code, obj):
            b = json.dumps(obj, ensure_ascii=False).encode("utf8")
            self.send_response(code); self.send_header("Content-Type", "application/json; charset=utf-8"); self.send_header("Content-Length", str(len(b))); self.end_headers(); self.wfile.write(b)

        def do_GET(self):
            if self.path == "/health": return self._send(200, {"ok": True, "version": reader.version, "threads": reader.threads})
            self._send(404, {"error": "not found"})

        def do_POST(self):
            if self.path != "/read": return self._send(404, {"error": "not found"})
            n = int(self.headers.get("Content-Length") or 0)
            if n <= 0 or n > MAX: return self._send(413, {"error": "body"})
            try:
                body = json.loads(self.rfile.read(n))
                buf = np.frombuffer(base64.b64decode(body.get("image") or ""), np.uint8)
                img = cv2.imdecode(buf, cv2.IMREAD_COLOR)
                if img is None: return self._send(400, {"error": "not an image"})
                if max(img.shape[:2]) > 2000:  # rec.py trained on ~760 px pages; very large photos are brought down
                    s = 2000 / max(img.shape[:2]); img = cv2.resize(img, None, fx=s, fy=s, interpolation=cv2.INTER_AREA)
                with lock: r = read_document(reader, img)
                self._send(200, r)
            except Exception as e:  # noqa: BLE001
                self._send(500, {"error": str(e)[:200]})

        def log_message(self, *args): pass

    srv = ThreadingHTTPServer(("127.0.0.1", a.port), Handler)
    print(f"Cover-OCR worker {reader.version} on http://127.0.0.1:{a.port} (CPU, {reader.threads} threads)", flush=True)
    srv.serve_forever()


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("cmd", choices=["serve", "eval"])
    ap.add_argument("--run", default=os.environ.get("OCR_RUN") or os.path.join(HERE, "runs", "r1"))
    ap.add_argument("--port", type=int, default=11449)
    ap.add_argument("--threads", type=int, default=int(os.environ.get("OCR_THREADS", "1")))
    ap.add_argument("--data", default=os.path.join(HERE, "out")); ap.add_argument("--split", default="test")
    ap.add_argument("--limit", type=int, default=0); ap.add_argument("--out")
    a = ap.parse_args()
    serve(a) if a.cmd == "serve" else evaluate(a)
