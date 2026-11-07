"""Test sets for Done-OCR: 30 US-style parts receipts rendered from random fictional stores, items and prices, in six
fonts, two layouts (price column, inline), with tilt, blur and noise. The receipt rules were first written against
receipt_*.jpg in this folder only. The truth is in <folder>/truth.json.
   python api/test/fixtures/evidence/make_ocr_set.py [seed] [folder]     (seeded layout; the noise layer is not seeded)
     seed 2026 -> ocr-set/     the first held-out set; its failures were then looked at and the rules improved, so it
                               is a development set now
     seed 2027 -> ocr-set-2/   held out after that change (measure on it once per rules change, then make a new one)
     seed 2028 -> ocr-set-3/   made after the 0/9 total cross-check, with Consolas added (dotted zero); its one
                               confident wrong total led to the printed-rate check, so it is a development set now
     seed 2029 -> ocr-set-4/   held out after that change
Scored by: node api/src/check/eval.mjs ocr [folder]
"""
import json, os, random
from PIL import Image, ImageDraw, ImageFilter, ImageFont

import sys
SEED = int(sys.argv[1]) if len(sys.argv) > 1 else 2026
HERE = os.path.join(os.path.dirname(os.path.abspath(__file__)), sys.argv[2] if len(sys.argv) > 2 else "ocr-set")
os.makedirs(HERE, exist_ok=True)
FONTS = ["arial.ttf", "tahoma.ttf", "calibri.ttf", "verdana.ttf", "cour.ttf", "lucon.ttf"]
# from seed 2028 on, Consolas too: its dotted zero is what the demo receipt uses, and the OCR reads it as 9
if SEED >= 2028: FONTS.append("consola.ttf")
STORES = ["PECAN STREET SUPPLY (DEMO)", "LONGHORN HOME CENTER (DEMO)", "BARTON PLUMBING PARTS (DEMO)", "RIVERSIDE TRUE FIX (DEMO)",
          "MOPAC BUILD & PAINT (DEMO)", "EASTSIDE TOOL BARN (DEMO)", "CEDAR PARK HARDWARE (DEMO)", "SOUTH CONGRESS DIY (DEMO)"]
ITEMS = ["Shutoff valve 1/4 turn", "Faucet cartridge", "O-ring assortment", "Plumber tape", "Toilet flapper", "Fill valve", "Wax ring",
         "Supply line 16in", "Drain snake 25ft", "P-trap kit", "Drywall patch kit", "Joint compound", "Sanding sponge", "Interior paint qt",
         "TV wall anchor set", "Stud finder", "Wood screws #8", "Caulk white", "Furniture strap", "Teflon washer"]
r = random.Random(SEED)
truth = {}
for k in range(30):
    fn = FONTS[k % len(FONTS)]; mono = fn in ("cour.ttf", "lucon.ttf")
    store = r.choice(STORES); mo, d = 11, r.randint(1, 20); hh, mm = r.randint(7, 19), r.randint(0, 59)
    n = r.randint(1, 4); items = r.sample(ITEMS, n); prices = [r.randint(149, 8999) for _ in items]
    sub = sum(prices); rate = 0.0825; tax = round(sub * rate); total = sub + tax
    column = r.random() < 0.6
    lines = [store, f"{r.randint(100, 9999)} Demo Ln, Austin TX 787{r.randint(10, 59)}", f"{mo:02d}/{d:02d}/2026 {(hh - 1) % 12 + 1}:{mm:02d} {'AM' if hh < 12 else 'PM'}", f"Register {r.randint(1, 9)}", ""]
    money = lambda c: f"${c // 100}.{c % 100:02d}"
    body = [(it, money(p)) for it, p in zip(items, prices)] + [("SUBTOTAL", money(sub)), ("TAX 8.25%", money(tax)), ("TOTAL", money(total))]
    size = r.choice([22, 24, 26, 28]); f = ImageFont.truetype("C:/Windows/Fonts/" + fn, size); gap = int(size * 1.7); w = 760
    h = 60 + (len(lines) + len(body) + 2) * gap
    im = Image.new("RGB", (w, h), tuple(r.randint(236, 252) for _ in range(3))); dr = ImageDraw.Draw(im); ink = (r.randint(10, 60),) * 3
    y = 30
    for l in lines: dr.text((30, y), l, fill=ink, font=f); y += gap
    for a, b in body:
        if column: dr.text((30, y), a, fill=ink, font=f); dr.text((w - 30 - dr.textlength(b, font=f), y), b, fill=ink, font=f)
        else: dr.text((30, y), f"{a}  {b}", fill=ink, font=f)
        y += gap
    dr.text((30, y + gap // 2), "Thank you (demo receipt)", fill=ink, font=f)
    ang = r.uniform(-4, 4)
    im = im.rotate(ang, expand=True, fillcolor=(80, 72, 64), resample=Image.BICUBIC)
    if r.random() < 0.4: im = im.filter(ImageFilter.GaussianBlur(r.uniform(0.4, 1.1)))
    if r.random() < 0.5: im = Image.blend(im, Image.effect_noise(im.size, 30).convert("RGB"), r.uniform(0.04, 0.12))
    name = f"r{k:02d}.jpg"; im.save(os.path.join(HERE, name), "JPEG", quality=r.randint(70, 92))
    truth[name] = {"store": store, "date": f"2026-{mo:02d}-{d:02d}", "total": total, "subtotal": sub, "tax": tax, "items": items,
                   "font": fn, "layout": "column" if column else "inline", "tilt": round(ang, 2)}
json.dump(truth, open(os.path.join(HERE, "truth.json"), "w"), indent=1)
print("wrote", len(truth))
