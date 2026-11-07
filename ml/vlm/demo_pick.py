"""Real photos for the demo: from the openly licensed Commons photos (photos.jsonl, licences recorded), the ones that
Done & Paid's own models actually pass for each demo scene's done-conditions, run the way the app runs them:
done-vlm describes the photo (the describe prompt, ml/prompts.mjs DESCRIBE_PROMPT), and done-audit judges that
description against the condition (a one-check work order: the photo taken in the job window at the job address, no
duplicate). BEFORE photos are kept when the description names the thing (they are references, not checked).
Only CC0 / public domain / CC BY / CC BY-SA photos are used; each keeps its author, licence and source.
   python ml/vlm/demo_pick.py --photos ml/vlm/photos --url http://127.0.0.1:11480 --out ml/vlm/demo_pick.json
"""
import argparse, base64, io, json, os, re, sys, time, urllib.request
from PIL import Image

DESCRIBE = "Describe this photo for a home-repair checker in one or two sentences: name the main objects and fixtures you can see and their condition. Don't guess about things you can't see."
SCENES = {  # scene -> [(slot, role, condition, pool of things, keywords the description must contain for a before photo)]
    "faucet": [("faucet_before", "before", "The kitchen faucet before the repair", ["a kitchen faucet"], ["faucet", "tap"]),
               ("faucet_installed", "after", "The kitchen faucet is installed and in good condition", ["a kitchen faucet"], None),
               ("under_sink_dry", "after", "The area under the sink is clean and dry", ["a P-trap under a sink", "a kitchen sink"], None)],
    "drain": [("drain_before", "before", "The sink before the drain was cleared", ["a kitchen sink", "a bathtub"], ["sink", "tub", "bath", "basin"]),
              ("trap_opened", "after", "The P-trap under the sink is reconnected", ["a P-trap under a sink"], None),
              ("draining", "after", "The sink is empty and drains freely", ["a kitchen sink"], None)],
    "toilet": [("toilet_tank", "after", "New parts are installed inside the toilet tank", ["a toilet tank's inside"], None),
               ("toilet_installed", "after", "The toilet is installed and clean", ["a toilet"], None)],
    "water_heater": [("heater_old", "before", "The old water heater before replacement", ["a water heater"], ["heater", "tank", "boiler"]),
                     ("heater_installed", "after", "A water heater tank is installed", ["a water heater"], None),
                     ("rating_plate", "after", "The rating plate of the new water heater is readable", ["a rating plate", "a water heater"], None)],
    "tv_mount": [("tv_mounted", "after", "The TV is mounted on the wall", ["a TV mounted on a wall"], None),
                 ("level_used", "after", "A bubble level is used to check the mount is level", ["a bubble level"], None)],
    "furniture": [("boxes_before", "before", "Flat-pack boxes before assembly", ["cardboard boxes"], ["box", "cardboard"]),
                  ("dresser", "after", "The dresser is assembled with its drawers in place", ["a chest of drawers"], None),
                  ("bed", "after", "The bed frame is assembled", ["a bed frame"], None)],
    "drywall": [("hole_before", "before", "The hole in the drywall before the repair", ["a hole in drywall"], ["hole", "wall", "damage"]),
                ("painting", "after", "The wall is painted with a roller", ["a paint roller"], None)],
    "cleaning": [("kitchen_clean", "after", "The kitchen sink and counter are clean", ["a kitchen sink"], None),
                 ("bathroom_clean", "after", "The bathroom tub and toilet are clean", ["a bathtub", "a toilet"], None),
                 ("mirror_clean", "after", "The bathroom mirror is clean", ["a bathroom mirror"], None),
                 ("floor_mopped", "after", "The floor is mopped clean", ["a mopped floor", "tiles"], None),
                 ("oven_clean", "after", "The inside of the oven is clean", ["the inside of an oven"], None),
                 ("fridge_clean", "after", "The inside of the fridge is clean and empty", ["the inside of a refrigerator"], None),
                 ("trash_out", "after", "The trash cans are empty", ["a trash can"], None)],
}
# an AFTER photo is sent to Done-Audit only if its description names what the condition is about (every group, any word
# of a group): Done-Audit was trained on written evidence, not on photo descriptions, and passed vague ones (2026-11-05)
MUST = {"faucet_installed": [["faucet", "tap", "mixer"]], "under_sink_dry": [["pipe", "trap", "plumbing", "drain"]], "trap_opened": [["trap", "pipe", "plumbing"]],
        "draining": [["sink"]], "toilet_tank": [["tank", "cistern", "flush", "float", "valve"]], "toilet_installed": [["toilet"]], "heater_installed": [["water heater", "heater"]],
        "rating_plate": [["plate", "label", "sticker", "rating"]], "tv_mounted": [["tv", "television"], ["wall", "mounted"]], "level_used": [["level"]],
        "dresser": [["drawer", "dresser", "chest"]], "bed": [["bed"]], "painting": [["roller", "paint"]], "kitchen_clean": [["sink", "counter"]],
        "bathroom_clean": [["tub", "bath", "toilet"]], "mirror_clean": [["mirror"]], "floor_mopped": [["floor"]], "oven_clean": [["oven"]],
        "fridge_clean": [["refrigerator", "fridge"]], "trash_out": [["trash", "bin", "garbage"]]}
names = lambda d, groups: all(any(re.search(r"\b" + re.escape(k), d.lower()) for k in g) for g in groups)
OPEN = re.compile(r"^(public domain|pd|cc0|cc[- ]by(-sa)?[- ]?[0-9.]*( [a-z]+)?)$", re.I)

def post(url, body, timeout=180):
    req = urllib.request.Request(url, data=json.dumps(body).encode(), headers={"content-type": "application/json"})
    with urllib.request.urlopen(req, timeout=timeout) as r: return json.loads(r.read())

def call(url, body, tries=60):
    for k in range(tries):
        try: return post(url, body)
        except urllib.error.HTTPError as e:
            if e.code == 503: time.sleep(5); continue   # busy (another caller): wait and ask again, up to 5 minutes
            raise
        except (TimeoutError, urllib.error.URLError, ConnectionError): time.sleep(10); continue   # slow or restarting endpoint
    raise RuntimeError("busy")

def main():
    ap = argparse.ArgumentParser(); ap.add_argument("--photos", required=True); ap.add_argument("--url", default="http://127.0.0.1:11480"); ap.add_argument("--out", required=True)
    ap.add_argument("--list", default="photos.jsonl", help="which photo list in --photos to pick from (photos_before_more.jsonl: the photos already described)")
    a = ap.parse_args()
    sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
    photos = [json.loads(l) for l in open(os.path.join(a.photos, a.list), encoding="utf8")]
    photos = [p for p in photos if OPEN.match(p["license"])]
    by = {}; [by.setdefault(p["thing"], []).append(p) for p in photos]
    # one description per photo (cached), then the audit per slot
    cache_f = a.out.replace(".json", "_descriptions.json"); desc = json.load(open(cache_f)) if os.path.exists(cache_f) else {}
    # Done-Audit's system prompt and schema, as ml/prompts.mjs writes them (node ml/vlm/dump_prompt.mjs)
    audit_prompt = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "audit_prompt.json"), encoding="utf8"))
    out = {}
    for scene, slots in SCENES.items():
        for slot, role, what, pool, keys in slots:
            cands = [p for t in pool for p in by.get(t, [])]
            res = []
            for p in cands:
                if p["file"] not in desc or not desc[p["file"]]["sees"]:   # an empty description (a timed-out call) is asked again
                    im = Image.open(os.path.join(a.photos, p["file"])).convert("RGB"); im.thumbnail((448, 448)); buf = io.BytesIO(); im.save(buf, "JPEG", quality=88)
                    t0 = time.time()
                    j = call(f"{a.url}/api/chat", {"model": "done-vlm", "messages": [{"role": "user", "content": DESCRIBE, "images": [base64.b64encode(buf.getvalue()).decode()]}], "stream": False, "options": {"temperature": 0, "num_predict": 70}})
                    desc[p["file"]] = {"sees": j["message"]["content"].strip(), "ms": round((time.time() - t0) * 1000)}
                    json.dump(desc, open(cache_f, "w"), indent=1)
                d = desc[p["file"]]["sees"]
                if role == "before":
                    ok = any(re.search(r"\b" + k, d.lower()) for k in keys); res.append({"photo": p, "sees": d, "verdict": "reference" if ok else "not_named", "confidence": None, "ok": ok}); continue
                if not d or not names(d, MUST.get(slot, [])):
                    res.append({"photo": p, "sees": d, "verdict": "not_named", "confidence": None, "ok": False}); continue
                user = (f"Work order: Demo job ({scene}). Window 2026-11-06 to 2026-11-08. Address 1204 Elm St, Austin, TX 78704.\nChecks:\n- c (photo): {what}\n"
                        f"Evidence:\n[p1] photo for c | \"{d}\" | taken 2026-11-07 14:12, 0.03 mi from the job")
                j = call(f"{a.url}/api/chat", {"model": "done-audit", "messages": [{"role": "system", "content": audit_prompt["sys"]}, {"role": "user", "content": user}], "stream": False, "format": audit_prompt["schema"],
                                                 "options": {"temperature": 0, "num_predict": 80}, "logprobs": True, "top_logprobs": 5})
                try: c = (json.loads(j["message"]["content"]).get("checks") or [{}])[0]
                except Exception: c = {}
                conf = None
                text = ""
                for t in j.get("logprobs") or []:
                    if re.search(r'"v"\s*:\s*"$', text):
                        ps = {}
                        for x in t.get("top_logprobs", []):
                            tok = x["token"].strip()
                            for v in ("pass", "needs_fix", "fail"):
                                if tok and (v.startswith(tok) or tok.startswith(v)): ps[v] = ps.get(v, 0) + 2.718281828 ** x["logprob"]
                        z = sum(ps.values()); conf = round(ps.get(c.get("v"), 0) / z, 3) if z else None; break
                    text += t["token"]
                res.append({"photo": p, "sees": d, "verdict": c.get("v"), "reason_code": c.get("r"), "confidence": conf, "ok": c.get("v") == "pass"})
            good = sorted([r for r in res if r["ok"]], key=lambda r: -(r["confidence"] or 0))
            out[slot] = {"scene": scene, "role": role, "condition": what, "candidates": len(res), "passed": len(good),
                         "picked": [{"file": r["photo"]["file"], "sees": r["sees"], "verdict": r["verdict"], "confidence": r["confidence"], "author": r["photo"]["author"], "license": r["photo"]["license"],
                                     "license_url": r["photo"].get("license_url"), "source": r["photo"]["source"], "title": r["photo"]["title"]} for r in good[:3]]}
            print(scene, slot, f"{len(good)}/{len(res)} pass", flush=True)
    json.dump(out, open(a.out, "w"), indent=1)
    print("PICK_DONE")

if __name__ == "__main__":
    main()
