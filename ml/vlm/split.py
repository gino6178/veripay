"""Fix Done-VLM's held-out test photos before any training data is made: a quarter of the photos of every thing in
photos.jsonl (seed 11), written to test_files.json. Photos fetched later are training photos; a training photo with the
same Commons title as a test photo is dropped by the training-data builder (vlm/teach.py).
   python ml/vlm/split.py --photos ml/vlm/photos"""
import argparse, json, os, random
ap = argparse.ArgumentParser(); ap.add_argument("--photos", required=True); a = ap.parse_args()
f = os.path.join(a.photos, "test_files.json")
if os.path.exists(f): print("kept", f); raise SystemExit
ps = [json.loads(l) for l in open(os.path.join(a.photos, "photos.jsonl"), encoding="utf8")]
by = {}; [by.setdefault(p["thing"], []).append(p) for p in ps]
r = random.Random(11); test = []
for t in sorted(by):
    xs = sorted(by[t], key=lambda p: p["file"]); r.shuffle(xs); test += [p["file"] for p in xs[:max(1, round(len(xs) / 4))]]
json.dump(sorted(test), open(f, "w"), indent=0); print(len(test), "test photos of", len(ps))
