"""Give the real demo photos (api/demo-assets/real/) their original camera metadata back. The 500 px Commons thumbnails
carry no EXIF. For each photo in attribution.json this script:
  - reads the source file's metadata from Wikimedia Commons (imageinfo commonmetadata + extmetadata: Make, Model,
    DateTimeOriginal and the other EXIF fields Commons extracted from the original upload);
  - records them in attribution.json under "original_exif" (null fields when the source has none, plus "has_camera_metadata");
  - writes the same tags (Make, Model, DateTimeOriginal, DateTime, Software, Orientation=1) into the scaled copy's EXIF
    re-saving the picture at its own JPEG quality tables (PIL quality="keep"), same size.
   python ml/vlm/demo_exif.py --attribution <attribution.json> --photos ml/vlm/photos --out <dir>
Standard library + Pillow; one Commons request every 2 seconds."""
import argparse, json, os, re, time, urllib.error, urllib.parse, urllib.request
from PIL import Image

API = "https://commons.wikimedia.org/w/api.php"
UA = "DoneAndPaid-ml-eval/1.0 (hackathon research; contact via project README)"
EXIF_TAGS = {"Make": 0x010F, "Model": 0x0110, "Software": 0x0131, "DateTime": 0x0132, "Orientation": 0x0112}
EXIF_IFD = {"DateTimeOriginal": 0x9003, "DateTimeDigitized": 0x9004}

def get(params):
    url = API + "?" + urllib.parse.urlencode({**params, "format": "json"})
    for k in range(8):   # 429 / 5xx: wait as asked (Retry-After) or back off, then ask again
        time.sleep(2.0)
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": UA}), timeout=60) as r: return json.loads(r.read())
        except urllib.error.HTTPError as e:
            if e.code != 429 and e.code < 500: raise
            time.sleep(min(300, int(e.headers.get("Retry-After") or 0) or 15 * 2 ** k))
    raise RuntimeError("Commons kept refusing")

def strip(html): return re.sub(r"<[^>]+>", "", str(html or "")).strip()

def flat(meta):
    """Commons commonmetadata is a list of {name, value}; nested values are lists again."""
    out = {}
    for m in meta or []:
        v = m.get("value")
        out[m.get("name")] = v if not isinstance(v, list) else flat(v)
    return out

def exif_date(s):
    """'2019:05:04 12:31:07' stays; '2019-05-04 12:31:07' or ISO become EXIF form; anything else None."""
    m = re.match(r"^(\d{4})[:-](\d{2})[:-](\d{2})[ T](\d{2}):(\d{2}):(\d{2})", str(s or ""))
    return f"{m[1]}:{m[2]}:{m[3]} {m[4]}:{m[5]}:{m[6]}" if m else None

def main():
    ap = argparse.ArgumentParser(); ap.add_argument("--attribution", required=True); ap.add_argument("--photos", required=True); ap.add_argument("--out", required=True)
    a = ap.parse_args(); os.makedirs(a.out, exist_ok=True)
    att = json.load(open(a.attribution, encoding="utf8"))
    for p in att["photos"]:
        r = get({"action": "query", "titles": p["title"], "prop": "imageinfo", "iiprop": "commonmetadata|extmetadata|size", "iimetadataversion": "latest"})
        page = next(iter(r.get("query", {}).get("pages", {}).values()), {})
        ii = (page.get("imageinfo") or [{}])[0]
        cm = flat(ii.get("commonmetadata")); em = ii.get("extmetadata", {})
        make = strip(cm.get("Make")) or None; model = strip(cm.get("Model")) or None
        dto = exif_date(cm.get("DateTimeOriginal")) or exif_date(strip(em.get("DateTimeOriginal", {}).get("value")))
        p["original_exif"] = {"Make": make, "Model": model, "DateTimeOriginal": dto, "DateTimeDigitized": exif_date(cm.get("DateTimeDigitized")),
                              "Software": strip(cm.get("Software")) or None, "original_size": [ii.get("width"), ii.get("height")],
                              "read_from": "Wikimedia Commons imageinfo commonmetadata/extmetadata of " + p["title"]}
        p["has_camera_metadata"] = bool(make or model)
        src = os.path.join(a.photos, p["original_file"]); dst = os.path.join(a.out, p["file"])
        im = Image.open(src); ex = im.getexif()
        for k, tag in EXIF_TAGS.items():
            v = {"Make": make, "Model": model, "Software": p["original_exif"]["Software"], "DateTime": dto, "Orientation": 1}[k]
            if v is not None: ex[tag] = v
        ifd = ex.get_ifd(0x8769)
        if dto: ifd[EXIF_IFD["DateTimeOriginal"]] = dto
        if p["original_exif"]["DateTimeDigitized"]: ifd[EXIF_IFD["DateTimeDigitized"]] = p["original_exif"]["DateTimeDigitized"]
        im.save(dst, "JPEG", quality="keep", exif=ex.tobytes()) if im.format == "JPEG" else im.convert("RGB").save(dst, "JPEG", quality=92, exif=ex.tobytes())
        print(p["file"], make, model, dto, flush=True)
    att["exif_note"] = ("The copies are Commons' scaled thumbnails (500 to 960 px), which carry no EXIF. Each copy's EXIF (Make, Model, DateTimeOriginal, "
                        "DateTimeDigitized, Software) was written back from the original upload's metadata as Commons reports it (ml/vlm/demo_exif.py); "
                        "the picture was re-saved at its own JPEG quality tables (Pillow quality=\"keep\"), same size. Photos with has_camera_metadata false had no camera fields in their source. "
                        "The capture dates are the originals' (often years ago), so a check that compares them with a job window will see an old date.")
    json.dump(att, open(os.path.join(a.out, "attribution.json"), "w", encoding="utf8"), indent=1, ensure_ascii=False)
    print("EXIF_DONE", sum(p["has_camera_metadata"] for p in att["photos"]), "of", len(att["photos"]), "with camera metadata")

if __name__ == "__main__":
    main()
