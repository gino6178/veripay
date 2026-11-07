"""Done-VLM training targets from Glimmer's vision (muse-glimmer on the VM's Ollama; no other model's output).
For every training photo (photos.jsonl minus test_files.json, minus any photo whose Commons title is also a test
photo's), Glimmer answers the same describe-only prompt the app and Done-VLM use (ml/prompts.mjs DESCRIBE_PROMPT),
--samples times at temperature 0.6. Code keeps a description only if:
  - it names the photo's own thing (the keyword list of describe_eval.py, the same one the evaluation scores with);
  - it is one or two sentences and at most 60 words;
  - it does not hedge about unseen things ("probably", "might be", "likely", "possibly").
   python ml/vlm/teach.py --photos ml/vlm/photos --out ml/vlm/teach --samples 3 --par 24
Resumable: rows already in <out>/raw.jsonl are skipped."""
import argparse, base64, io, json, os, re, sys, threading, urllib.request
from concurrent.futures import ThreadPoolExecutor
from PIL import Image
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from describe_eval import PROMPT, hit

URL = os.environ.get("LLM_URL", "http://127.0.0.1:11434"); MODEL = os.environ.get("LLM_MODEL", "muse-glimmer:30b-q4_K_M")
# the teacher alone gets a length limit after the prompt (Glimmer's first answers ran to 3-4 sentences); Done-VLM is
# trained and asked with the app's prompt alone
TEACH_SUFFIX = " Use at most 40 words."
HEDGE = re.compile(r"\b(probably|might be|may be|likely|possibly|perhaps|i think|it seems)\b", re.I)

def ask(b64, temp):
    body = {"model": MODEL, "stream": False, "think": False, "keep_alive": "24h", "messages": [{"role": "user", "content": PROMPT + TEACH_SUFFIX, "images": [b64]}], "options": {"temperature": temp, "num_predict": 400}}
    req = urllib.request.Request(URL + "/api/chat", data=json.dumps(body).encode(), headers={"content-type": "application/json"})
    with urllib.request.urlopen(req, timeout=600) as r: return json.loads(r.read())["message"]["content"].strip()

def check(text, thing):
    if not hit(text, thing): return "not_named"
    if len(text.split()) > 60 or len([s for s in re.split(r"(?<=[.!?])\s+", text) if s]) > 2: return "too_long"
    if HEDGE.search(text): return "hedges"
    return "ok"

def main():
    ap = argparse.ArgumentParser(); ap.add_argument("--photos", required=True); ap.add_argument("--out", required=True); ap.add_argument("--samples", type=int, default=3)
    ap.add_argument("--par", type=int, default=24); ap.add_argument("--side", type=int, default=448)
    a = ap.parse_args(); os.makedirs(a.out, exist_ok=True)
    ps = [json.loads(l) for l in open(os.path.join(a.photos, "photos.jsonl"), encoding="utf8")]
    test = set(json.load(open(os.path.join(a.photos, "test_files.json"))))
    test_titles = {p["title"] for p in ps if p["file"] in test}
    train = [p for p in ps if p["file"] not in test and p["title"] not in test_titles]
    raw_f = os.path.join(a.out, "raw.jsonl"); done = set()
    if os.path.exists(raw_f):
        for l in open(raw_f, encoding="utf8"):
            try: x = json.loads(l); done.add((x["file"], x["sample"]))
            except Exception: pass   # a line cut by a preemption
    jobs = [(p, k) for p in train for k in range(a.samples) if (p["file"], k) not in done]
    print(len(train), "training photos,", len(test), "test photos held out;", len(jobs), "Glimmer calls to make", flush=True)
    lock = threading.Lock(); out = open(raw_f, "a", encoding="utf8")
    def one(job):
        p, k = job
        try:
            im = Image.open(os.path.join(a.photos, p["file"])).convert("RGB"); im.thumbnail((a.side, a.side)); buf = io.BytesIO(); im.save(buf, "JPEG", quality=88)
            text = ask(base64.b64encode(buf.getvalue()).decode(), 0.6 if k else 0.2)
        except Exception as e: text = ""; print("fail", p["file"], str(e)[:80], flush=True)
        row = {"file": p["file"], "thing": p["thing"], "sample": k, "text": text, "check": check(text, p["thing"]) if text else "error"}
        with lock: out.write(json.dumps(row, ensure_ascii=False) + "\n"); out.flush()
    with ThreadPoolExecutor(a.par) as ex: list(ex.map(one, jobs))
    rows = [json.loads(l) for l in open(raw_f, encoding="utf8") if l.strip().endswith("}")]
    from collections import Counter
    print("checks", dict(Counter(r["check"] for r in rows)), flush=True)
    print("TEACH_DONE", flush=True)

if __name__ == "__main__":
    main()
