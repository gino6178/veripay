"""Done-OCR's worker on the CPU: POST /read { image: base64 [, kind] } -> { lines: [string], fields, confidence, version,
ms } (the Cover-OCR worker contract the app's api/src/ocr.js reads). The line detector (det.py) finds each text line on
the photo, the recogniser (rec.py) reads it, lines are ordered top to bottom, and parse.py turns them into the reader's
fields. confidence is the mean, over the characters read, of the recogniser's probability for each (CTC, the best
class at each kept step). GET /health. Listens on 127.0.0.1 only; ml/serve.mjs forwards POST /read to it.
   python ml/ocr/server.py --det ml/ocr/runs/det1 --rec ml/ocr/runs/done2 [--port 11490] [--threads 2]
"""
import argparse, base64, json, os, sys, time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import threading
import numpy as np, cv2, torch, torch.nn.functional as F
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from det import UNet, detect
from rec import SVTRTiny, batchify
from gen import cut
from parse import fields as parse_fields

def main():
    ap = argparse.ArgumentParser(); ap.add_argument("--det", required=True); ap.add_argument("--rec", required=True); ap.add_argument("--port", type=int, default=11490); ap.add_argument("--threads", type=int, default=2); ap.add_argument("--device", default="cpu")
    a = ap.parse_args(); torch.set_num_threads(a.threads); dev = a.device if a.device != "cuda" or torch.cuda.is_available() else "cpu"
    det = UNet(); det.load_state_dict(torch.load(os.path.join(a.det, "det.pt"), map_location=dev)); det.to(dev).eval()
    meta = json.load(open(os.path.join(a.rec, "meta.json"), encoding="utf8")); chars = meta["chars"]
    rec = SVTRTiny(len(chars) + 1); rec.load_state_dict(torch.load(os.path.join(a.rec, "model.pt"), map_location=dev)); rec.to(dev).eval()
    version = f"done-ocr {os.path.basename(a.det.rstrip('/'))}+{os.path.basename(a.rec.rstrip('/'))}"
    lock = threading.Lock()

    def read(img):
        quads = detect(det, img, dev); ims = []
        for q in quads:
            c = cut(img, q, None, jitter=False); h, w = c.shape[:2]; ims.append(cv2.resize(c, (min(512, max(8, int(w * 32 / h))), 32)))
        if not ims: return [], None
        x = batchify(ims).to(dev); wl = torch.tensor([(i.shape[1] + 3) // 4 for i in ims], device=dev)
        with torch.no_grad(): p = F.softmax(rec(x, wl).float(), -1)
        lines, probs = [], []
        for k in range(len(ims)):
            best, idx = p[k, : int(wl[k])].max(-1); out, prev = [], 0
            for t, (i, b) in enumerate(zip(idx.tolist(), best.tolist())):
                if i != prev and i != 0: out.append(chars[i - 1]); probs.append(b)
                prev = i
            if out: lines.append("".join(out))
        return lines, (round(float(np.mean(probs)), 3) if probs else None)

    class H(BaseHTTPRequestHandler):
        def log_message(self, *args): pass
        def reply(self, code, obj):
            b = json.dumps(obj).encode(); self.send_response(code); self.send_header("content-type", "application/json"); self.send_header("content-length", str(len(b))); self.end_headers(); self.wfile.write(b)
        def do_GET(self):
            self.reply(200, {"ready": True, "version": version}) if self.path == "/health" else self.reply(404, {"error": "not found"})
        def do_POST(self):
            if self.path != "/read": return self.reply(404, {"error": "not found"})
            try:
                body = json.loads(self.rfile.read(int(self.headers.get("content-length", 0))))
                img = cv2.imdecode(np.frombuffer(base64.b64decode(body["image"]), np.uint8), cv2.IMREAD_COLOR)
                if img is None: return self.reply(400, {"error": "not an image"})
                t0 = time.time()
                with lock: lines, conf = read(img)
                self.reply(200, {"lines": lines, "fields": {**parse_fields("\n".join(lines)), "text": "\n".join(lines)}, "confidence": conf, "version": version, "ms": round((time.time() - t0) * 1000)})
            except Exception as e:
                self.reply(400, {"error": str(e)[:200]})
    srv = ThreadingHTTPServer(("127.0.0.1", a.port), H)
    print(f"{version} on 127.0.0.1:{a.port} ({a.threads} threads, {dev})", flush=True)
    srv.serve_forever()

if __name__ == "__main__":
    main()
