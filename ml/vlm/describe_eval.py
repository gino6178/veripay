"""Done-VLM, describe-only: the small VLM says what is visible, without being told what to look for (no condition in
the prompt, so it can't echo it), and Done-Audit judges the description against the condition. On the app's
judge-style prompt (eval.py) the small models echoed the condition text and passed almost everything.
  Scored by code on the openly licensed photos (fetch.py): does the description name the photo's own thing (a keyword
  list per thing: recall), and does it name a different thing that isn't there (one random other thing per photo:
  false mention). Latency on 6 CPU threads, one photo at a time, at --side px on the long side.
   python ml/vlm/describe_eval.py --photos ml/vlm/photos --models smolvlm2-500m,... --n 60 --out ml/vlm/results_describe
"""
import argparse, base64, io, json, os, random, re, time
from PIL import Image
from eval import start, post

PROMPT = "Describe this photo for a home-repair checker in one or two sentences: name the main objects and fixtures you can see and their condition. Don't guess about things you can't see."
KEYS = {"a kitchen faucet": ["faucet", "tap", "spout", "mixer"], "a faucet cartridge": ["cartridge", "valve", "faucet"], "a toilet tank's inside": ["tank", "cistern", "flush", "toilet"], "a garbage disposal unit": ["disposal", "disposer", "grinder"],
        "a P-trap under a sink": ["trap", "pipe", "drain", "plumbing"], "a water heater": ["water heater", "heater", "boiler", "tank"], "a hole in drywall": ["hole", "drywall", "wall", "damage"], "a TV mounted on a wall": ["tv", "television", "screen", "monitor"],
        "a chest of drawers": ["drawer", "dresser", "chest", "cabinet"], "a bed frame": ["bed"], "the inside of an oven": ["oven"], "the inside of a refrigerator": ["refrigerator", "fridge"], "a bathtub": ["tub", "bath"],
        "a kitchen sink": ["sink"], "a toilet": ["toilet"], "a bathroom mirror": ["mirror"], "a mopped floor": ["floor", "mop"], "a trash can": ["trash", "bin", "garbage", "waste"], "cardboard boxes": ["box", "cardboard"],
        "a paint roller": ["roller", "paint"], "a stud finder": ["stud finder", "detector", "device"], "a bubble level": ["level"], "a power drill": ["drill"], "a pipe wrench": ["wrench"], "a ceiling light fixture": ["light", "lamp", "fixture"],
        "an electrical outlet": ["outlet", "socket", "plug"], "a smoke detector": ["smoke", "detector", "alarm"], "a window": ["window"], "a door": ["door"], "tiles": ["tile"], "a ladder": ["ladder"], "a radiator": ["radiator", "heater"],
        "a washing machine": ["washing machine", "washer", "laundry"], "a lawn mower": ["mower", "lawn"]}
hit = lambda text, thing: any(re.search(r"\b" + re.escape(k), text.lower()) for k in KEYS.get(thing, [thing.split()[-1]]))

def main():
    ap = argparse.ArgumentParser(); ap.add_argument("--photos", required=True); ap.add_argument("--models", required=True); ap.add_argument("--n", type=int, default=60)
    ap.add_argument("--side", type=int, default=448); ap.add_argument("--out", required=True)
    ap.add_argument("--test_files", default="", help="score exactly these photos (photos/test_files.json, Done-VLM's held-out split) instead of --n random ones")
    ap.add_argument("--cpus", default="6-11"); ap.add_argument("--threads", type=int, default=6); ap.add_argument("--image_max_tokens", type=int, default=0)
    a = ap.parse_args(); os.makedirs(a.out, exist_ok=True); r = random.Random(7)
    photos = [json.loads(l) for l in open(os.path.join(a.photos, "photos.jsonl"), encoding="utf8")]
    things = sorted({p["thing"] for p in photos}); r.shuffle(photos)
    if a.test_files: keep = set(json.load(open(a.test_files))); photos = sorted([p for p in photos if p["file"] in keep], key=lambda p: p["file"])
    else: photos = photos[:a.n]
    for p in photos: p["other"] = r.choice([t for t in things if t != p["thing"] and not (set(KEYS.get(t, [])) & set(KEYS.get(p["thing"], [])))])
    for name in a.models.split(","):
        f = os.path.join(a.out, f"{name}.jsonl")
        if os.path.exists(f) and sum(1 for _ in open(f)) >= len(photos): continue
        srv = start(name, 18901, a.cpus, a.threads, ("--image-max-tokens", str(a.image_max_tokens)) if a.image_max_tokens else ())
        try:
            with open(f, "w", encoding="utf8") as out:
                for p in photos:
                    im = Image.open(os.path.join(a.photos, p["file"])).convert("RGB"); im.thumbnail((a.side, a.side)); buf = io.BytesIO(); im.save(buf, "JPEG", quality=88)
                    t0 = time.time()
                    try:
                        j = post("http://127.0.0.1:18901/v1/chat/completions", {"messages": [{"role": "user", "content": [{"type": "image_url", "image_url": {"url": "data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode()}}, {"type": "text", "text": PROMPT}]}],
                                  "temperature": 0, "max_tokens": 70, "cache_prompt": False})
                        text, use = j["choices"][0]["message"]["content"], j.get("usage", {})
                    except Exception as e: text, use = "", {"error": str(e)[:100]}
                    out.write(json.dumps({"photo": p["file"], "thing": p["thing"], "other": p["other"], "text": text, "own": hit(text, p["thing"]), "false_mention": hit(text, p["other"]),
                                          "ms": round((time.time() - t0) * 1000), "prompt_tokens": use.get("prompt_tokens"), "tokens": use.get("completion_tokens")}, ensure_ascii=False) + "\n"); out.flush()
        finally: srv.kill(); srv.wait()
        rs = [json.loads(l) for l in open(f, encoding="utf8")]; ms = sorted(x["ms"] for x in rs)
        print(name, json.dumps({"photos": len(rs), "names_own_thing": round(sum(x["own"] for x in rs) / len(rs), 4), "names_absent_thing": round(sum(x["false_mention"] for x in rs) / len(rs), 4),
                                "ms_p50": ms[len(ms) // 2], "ms_p95": ms[int(len(ms) * 0.95)], "prompt_tokens_p50": sorted(x["prompt_tokens"] or 0 for x in rs)[len(rs) // 2]}), flush=True)
    print("DESCRIBE_DONE")

if __name__ == "__main__":
    main()
