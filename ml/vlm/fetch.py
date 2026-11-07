"""Photos for Done-VLM's evaluation (and, time allowing, its fine-tuning): openly licensed home-repair photos from
Wikimedia Commons, one category per thing a done-condition asks about. Only files whose licence is public domain,
CC0, CC BY or CC BY-SA are kept; each photo's licence, author and source page are recorded beside it
(photos.jsonl), as their licences require. Thumbnails of 500 px (a standard Commons size) are fetched, not originals.
   python ml/vlm/fetch.py --out ml/vlm/photos [--per 12]
Standard library only; it asks Commons for at most one request every two seconds.
"""
import argparse, json, os, re, time, urllib.parse, urllib.request

# thing (as a done-condition names it) -> Commons categories
THINGS = {
    "a kitchen faucet": ["Kitchen faucets", "Mixer taps"], "a faucet cartridge": ["Faucet cartridges", "Tap valves"], "a toilet tank's inside": ["Toilet cisterns", "Toilet flush mechanisms"],
    "a garbage disposal unit": ["Garbage disposal units"], "a P-trap under a sink": ["P-traps", "Sink traps"], "a water heater": ["Water heaters", "Hot water storage tanks"],
    "a hole in drywall": ["Holes in walls", "Damaged walls"], "a TV mounted on a wall": ["Wall-mounted televisions", "Television mounts"], "a chest of drawers": ["Chests of drawers", "Dressers (furniture)"],
    "a bed frame": ["Bed frames", "Beds (furniture)"], "the inside of an oven": ["Oven interiors", "Ovens"], "the inside of a refrigerator": ["Refrigerator interiors", "Open refrigerators"],
    "a bathtub": ["Bathtubs"], "a kitchen sink": ["Kitchen sinks"], "a toilet": ["Flush toilets"], "a bathroom mirror": ["Bathroom mirrors"], "a mopped floor": ["Mopping", "Wet floors"],
    "a trash can": ["Waste containers", "Trash cans"], "cardboard boxes": ["Cardboard boxes"], "a paint roller": ["Paint rollers"], "a stud finder": ["Stud finders"], "a bubble level": ["Spirit levels"],
    "a power drill": ["Cordless drills", "Electric drills"], "a pipe wrench": ["Pipe wrenches"], "a ceiling light fixture": ["Ceiling lights"], "an electrical outlet": ["AC power sockets in the United States", "Electrical outlets"],
    "a smoke detector": ["Smoke detectors"], "a window": ["Windows (interior)", "Sash windows"], "a door": ["Interior doors"], "tiles": ["Ceramic tiles", "Bathroom tiles"],
    "a ladder": ["Step ladders"], "a radiator": ["Radiators"], "a washing machine": ["Washing machines"], "a lawn mower": ["Lawn mowers"],
}
OK = re.compile(r"^(public domain|pd|cc0|cc[- ]by(-sa)?[- ]?[0-9.]*( [a-z]+)?)$", re.I)
API = "https://commons.wikimedia.org/w/api.php"
UA = "DoneAndPaid-ml-eval/1.0 (hackathon research; contact via project README)"

def get(params):
    url = API + "?" + urllib.parse.urlencode({**params, "format": "json"})
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    time.sleep(2.0)
    with urllib.request.urlopen(req, timeout=60) as r: return json.loads(r.read())

def strip(html): return re.sub(r"<[^>]+>", "", html or "").strip()

def main():
    ap = argparse.ArgumentParser(); ap.add_argument("--out", required=True); ap.add_argument("--per", type=int, default=12)
    ap.add_argument("--things", default="", help="a JSON file { thing: [Commons categories] } instead of the built-in list")
    a = ap.parse_args(); os.makedirs(a.out, exist_ok=True)
    things = json.load(open(a.things, encoding="utf8")) if a.things else THINGS
    if not os.path.exists(os.path.join(a.out, "photos.jsonl")): open(os.path.join(a.out, "photos.jsonl"), "w").close()
    meta = open(os.path.join(a.out, "photos.jsonl"), "a", encoding="utf8"); seen = set()
    have = {json.loads(l)["file"] for l in open(os.path.join(a.out, "photos.jsonl"), encoding="utf8")} if os.path.getsize(os.path.join(a.out, "photos.jsonl")) else set()
    for thing, cats in things.items():
        got = sum(1 for f in have if f.startswith(re.sub(r"\W+", "_", thing)))
        for cat in cats:
            if got >= a.per: break
            try:
                r = get({"action": "query", "generator": "categorymembers", "gcmtitle": f"Category:{cat}", "gcmtype": "file", "gcmlimit": 50,
                         "prop": "imageinfo", "iiprop": "url|extmetadata|mime", "iiurlwidth": 500})
            except Exception as e: print("skip", cat, e); continue
            for p in (r.get("query", {}).get("pages", {}) or {}).values():
                if got >= a.per: break
                ii = (p.get("imageinfo") or [{}])[0]; md = ii.get("extmetadata", {})
                lic = strip(md.get("LicenseShortName", {}).get("value"))
                if ii.get("mime") not in ("image/jpeg", "image/png") or not OK.match(lic) or p["title"] in seen: continue
                seen.add(p["title"]); slug = re.sub(r"\W+", "_", thing); name = f"{slug}_{got:02d}.jpg"
                if name in have: got += 1; continue
                try:
                    req = urllib.request.Request(ii["thumburl"], headers={"User-Agent": UA}); time.sleep(2.0)
                    with urllib.request.urlopen(req, timeout=60) as r2: data = r2.read()
                except Exception as e: print("fail", p["title"], e); continue
                open(os.path.join(a.out, name), "wb").write(data)
                meta.write(json.dumps({"file": name, "thing": thing, "category": cat, "title": p["title"], "source": ii.get("descriptionurl"), "license": lic,
                                       "license_url": strip(md.get("LicenseUrl", {}).get("value")), "author": strip(md.get("Artist", {}).get("value"))[:200]}, ensure_ascii=False) + "\n"); meta.flush()
                got += 1
        print(thing, got, flush=True)
    print("FETCH_DONE")

if __name__ == "__main__":
    main()
