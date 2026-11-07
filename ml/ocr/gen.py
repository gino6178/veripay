"""Done-OCR's synthetic US documents (from Cover-OCR's generator): supply-store parts receipts and home-service pros'
invoices (trip fee, labor hours, parts, tax on parts) first, then store receipts (big-box and electronics stores, with sales tax), repair-shop
invoices, vet invoices and police incident reports with a case number. They are written in English, with USD,
MM/DD/YYYY dates and US addresses, and drawn in a varied set of Latin fonts. Some are printed as a thermal receipt
(light grey, faded bands) or as a dot-matrix printout (each glyph rebuilt from dots). Then they are spoilt the way
phone photos are: perspective and skew, creases, glare, uneven light, blur, noise and JPEG.

Every field and every line's text is known exactly, because code wrote them. Stores, clinics, people, addresses,
case numbers and EINs are made up (an EIN appears on some invoices; the app reader's taxId is null otherwise).

Writes, under --out:
  docs_<split>.jsonl   one row per document: id, kind, style, font, fields (the app reader's schema without "text"),
                       text (the lines as written), lines [{text, quad, crop}], image
  docs/<split>/*.jpg   document photos (the first --images of each split)
  lines/<split>/*.png  each line cut out along its corners and straightened, 32 px high
  lines_<split>.tsv    file \t text
   python ml/ocr/gen.py --out ml/ocr/out_us --split train0 --docs 1000 --seed 100
   python ml/ocr/gen.py --out ml/ocr/out_us --split test_font --docs 200 --seed 3 --fonts held_out
(The first round's Traditional Chinese generator is in git history; RESULTS.md keeps its numbers.)
"""
import argparse, glob, json, math, os, random
import numpy as np
import cv2
from PIL import Image, ImageDraw, ImageFont

def _f(*pats):
    for p in pats:
        g = sorted(glob.glob(p))
        if g: return g[0]
    return None

FONTS = {k: v for k, v in {
    "dejavu_sans": _f("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"), "dejavu_sans_cond": _f("/usr/share/fonts/truetype/dejavu/DejaVuSansCondensed.ttf"),
    "dejavu_serif": _f("/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf"), "dejavu_mono": _f("/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf"),
    "dejavu_mono_bold": _f("/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf"),
    "liberation_sans": _f("/usr/share/fonts/truetype/liberation2/LiberationSans-Regular.ttf"), "liberation_serif": _f("/usr/share/fonts/truetype/liberation2/LiberationSerif-Regular.ttf"),
    "liberation_mono": _f("/usr/share/fonts/truetype/liberation2/LiberationMono-Regular.ttf"),
    "free_mono": _f("/usr/share/fonts/truetype/freefont/FreeMono.ttf"), "free_mono_bold": _f("/usr/share/fonts/truetype/freefont/FreeMonoBold.ttf"), "free_sans": _f("/usr/share/fonts/truetype/freefont/FreeSans.ttf"),
    "nimbus_mono": _f("/usr/share/fonts/opentype/urw-base35/NimbusMonoPS-Regular.otf"), "nimbus_sans": _f("/usr/share/fonts/opentype/urw-base35/NimbusSans-Regular.otf"),
    "nimbus_narrow": _f("/usr/share/fonts/opentype/urw-base35/NimbusSansNarrow-Regular.otf"), "nimbus_roman": _f("/usr/share/fonts/opentype/urw-base35/NimbusRoman-Regular.otf"),
    "noto_sans": _f("/usr/share/fonts/truetype/noto/NotoSans-Regular.ttf"), "noto_mono": _f("/usr/share/fonts/truetype/noto/NotoSansMono-Regular.ttf"),
    "roboto": _f("/usr/share/fonts/truetype/roboto/unhinted/RobotoTTF/Roboto-Regular.ttf"), "roboto_cond": _f("/usr/share/fonts/truetype/roboto/unhinted/RobotoCondensed-Regular.ttf"),
    "open_sans": _f("/usr/share/fonts/truetype/open-sans/OpenSans-Regular.ttf"), "inconsolata": _f("/usr/share/fonts/truetype/inconsolata/Inconsolata.otf"),
}.items() if v}
HELD_OUT = {k: v for k, v in {  # never trained on
    "ibm_plex_mono": _f("/usr/share/fonts/truetype/ibm-plex/IBMPlexMono-Regular.ttf"), "lato": _f("/usr/share/fonts/truetype/lato/Lato-Regular.ttf"),
    "texgyre_cursor": _f("/usr/share/texmf/fonts/opentype/public/tex-gyre/texgyrecursor-regular.otf", "/usr/share/fonts/opentype/texgyre/texgyrecursor-regular.otf", "/usr/share/**/texgyrecursor-regular.otf"),
}.items() if v}
MONO = {k for k in list(FONTS) + list(HELD_OUT) if any(s in k for s in ("mono", "inconsolata", "cursor"))}

def ein(r): return f"{r.randrange(10, 99)}-{r.randrange(10**6, 10**7)}"
def card(r): return f"{r.choice(['VISA', 'MASTERCARD', 'AMEX', 'DISCOVER'])} ****{r.randrange(1000, 10000)}"

STREETS = ["Elm St", "Main St", "Oak Ave", "Maple Dr", "Cedar Ln", "Park Blvd", "Lakeview Rd", "Washington Ave", "Sunset Blvd", "Pine St", "2nd Ave", "Market St", "Highland Ave", "Riverside Dr"]
CITIES = [("Austin", "TX", "787"), ("Denver", "CO", "802"), ("Columbus", "OH", "432"), ("Portland", "OR", "972"), ("Raleigh", "NC", "276"), ("Tampa", "FL", "336"), ("Phoenix", "AZ", "850"),
          ("Sacramento", "CA", "958"), ("Nashville", "TN", "372"), ("Madison", "WI", "537"), ("Boise", "ID", "837"), ("Richmond", "VA", "232"), ("Albany", "NY", "122"), ("Tucson", "AZ", "857")]
TAX = {"TX": 8.25, "CO": 8.81, "OH": 7.5, "OR": 0.0, "NC": 7.25, "FL": 7.5, "AZ": 8.6, "CA": 8.75, "TN": 9.25, "WI": 5.5, "ID": 6.0, "VA": 6.0, "NY": 8.0}
STORES = ["BRIGHTWAY HOME CENTER", "VOLT ELECTRONICS", "NORTHLINE HARDWARE", "MAPLE & CO HOME", "PIXEL POINT", "HOMESTEAD SUPPLY", "SUMMIT OUTLET", "BLUE HARBOR MARKET", "CIRCUIT CITYWIDE", "TRUEVALUE LANE"]
PARTS = [("Moen 1225 Cartridge", 32.48), ("Delta RP46074 Cartridge", 24.97), ("Fluidmaster 400H Fill Valve", 11.98), ("Korky Flapper 2in", 7.47), ("Toilet Repair Kit", 26.98), ("InSinkErator Badger 5", 109.00),
         ("1/2 HP Disposal", 129.00), ("Plumbers Putty 14oz", 5.98), ("PTFE Tape 1/2in", 2.48), ("P-Trap Kit 1-1/2in", 9.87), ("Tilting TV Mount 37-70in", 39.99), ("Lag Bolts 5/16 x 3in 8pk", 6.47),
         ("Cord Cover Kit", 19.97), ("Drywall Patch Kit", 12.98), ("Spackle 8oz", 6.98), ("Interior Paint Qt", 18.98), ("Sanding Sponge", 3.97), ("Supply Line 3/8 x 20in", 8.97), ("Wax Ring", 4.98)]
SUPPLY = ["NORTHLINE HARDWARE", "BRIGHTWAY HOME CENTER", "LONE STAR PLUMBING SUPPLY", "CAPITOL HARDWARE", "AUSTIN PRO SUPPLY"]
PROS = ["ACE RIVERA PLUMBING (DEMO)", "CLEARFLOW PLUMBING (DEMO)", "SPARKLE SQUAD CLEANING (DEMO)", "FIXIT FRANK HANDYMAN (DEMO)", "HILL COUNTRY HOME SERVICES (DEMO)"]
SERVICES = {"PLUMBING": [("Service call / trip fee", 89.00), ("Replace faucet cartridge", 0), ("Replace fill valve and flapper", 0), ("Clear drain and trap", 0), ("Install garbage disposal", 0)],
            "CLEANING": [("Deep clean 1BR apartment", 0), ("Inside oven", 45.00), ("Inside fridge", 35.00), ("Move-out clean", 0)],
            "HANDYMAN": [("Mount TV on studs", 0), ("Assemble dresser", 0), ("Assemble bed frame", 0), ("Patch and paint drywall", 0), ("Hide cables in cord cover", 40.00)]}
PLATES = [("RHEEM", "GAS WATER HEATER", ["CAPACITY 50 GAL", "INPUT 40000 BTU/HR", "NATURAL GAS", "RECOVERY 40.9 GPH", "WORKING PRESSURE 150 PSI"]),
          ("A.O. SMITH", "ELECTRIC WATER HEATER", ["CAPACITY 40 GAL", "240 V 4500 W", "1 PHASE 60 HZ", "WORKING PRESSURE 150 PSI"]),
          ("BRADFORD WHITE", "GAS WATER HEATER", ["CAPACITY 40 GAL", "INPUT 38000 BTU/HR", "PROPANE GAS"]),
          ("CARRIER", "AIR CONDITIONER", ["208/230 V 1 PH 60 HZ", "COMPRESSOR RLA 13.5", "REFRIGERANT R-454B", "MIN CIRCUIT AMPS 18.4", "MAX FUSE 30 A"]),
          ("TRANE", "HEAT PUMP OUTDOOR UNIT", ["208/230 V 1 PH 60 HZ", "REFRIGERANT R-410A", "MAX FUSE 25 A"]),
          ("INSINKERATOR", "FOOD WASTE DISPOSER", ["115 V 60 HZ", "6.9 A", "1/2 HP"]), ("GE", "BUILT-IN DISHWASHER", ["120 V 60 HZ", "10.0 A"])]
PERMIT_WORK = ["Water heater replacement", "Gas line repair", "Electrical service upgrade", "Bathroom remodel - plumbing", "HVAC replacement", "Fence over 7 ft", "Deck repair"]
GOODS = [("Dyson V8 Vacuum", 299.99), ("LG 55in 4K TV", 449.99), ("Apple AirPods Pro", 249.00), ("Instant Pot 6qt", 89.95), ("Ninja Air Fryer", 119.99), ("Dehumidifier 35pt", 189.00), ("Office Chair Mesh", 159.99),
         ("LED Desk Lamp", 34.99), ("Queen Mattress Topper", 79.99), ("Microwave 1.1cf", 129.00), ("Laptop Sleeve 15in", 24.99), ("Mechanical Keyboard", 89.99), ("27in Monitor", 229.99), ("Space Heater", 49.99),
         ("Robot Vacuum", 279.00), ("Bluetooth Speaker", 59.99), ("Smart Watch", 199.99), ("Camera Lens 50mm", 129.95), ("Cordless Drill", 99.00), ("Window AC 8000BTU", 329.00), ("HDMI Cable 6ft", 12.99)]
CLINICS = ["CEDAR CREEK ANIMAL HOSPITAL", "HAPPY PAWS VETERINARY CLINIC", "RIVERBEND PET HOSPITAL", "OAKWOOD VETERINARY CENTER", "SUNNYSIDE ANIMAL CLINIC", "BAYSIDE EMERGENCY VET"]
VET_ITEMS = [("Office Exam", 65.00), ("Radiographs 2 Views", 210.00), ("CBC Blood Panel", 145.50), ("Rabies Vaccine", 28.00), ("DHPP Vaccine", 32.00), ("Wound Repair", 385.00), ("IV Fluids", 120.00),
             ("Hospitalization 1 Day", 260.00), ("Dental Cleaning", 450.00), ("Ultrasound Abdomen", 395.00), ("Urinalysis", 55.00), ("Antibiotics 14 Days", 42.75), ("Anesthesia", 180.00), ("Bladder Stone Surgery", 1450.00)]
SHOPS = ["QUICKFIX PHONE REPAIR", "METRO AUTO BODY", "ACE APPLIANCE SERVICE", "GEEKSQUAD-STYLE TECH CARE", "PRECISION COLLISION", "UBREAKIT DEPOT", "MAIN STREET MOTORS"]
REPAIR_ITEMS = [("Screen Replacement", 189.00), ("Battery Replacement", 79.00), ("Water Damage Service", 149.00), ("Diagnostic Fee", 49.00), ("Labor 2.0 hr", 190.00), ("Front Bumper Repair", 640.00),
                ("Side Mirror Assembly", 285.50), ("Paint and Refinish", 520.00), ("Compressor Replacement", 610.00), ("Keyboard Replacement", 159.00), ("Parts", 87.40), ("Shop Supplies", 18.50)]
DEPTS = ["SPRINGFIELD POLICE DEPARTMENT", "CITY OF AUSTIN POLICE DEPARTMENT", "DENVER POLICE DEPARTMENT", "PORTLAND POLICE BUREAU", "TAMPA POLICE DEPARTMENT", "MADISON POLICE DEPARTMENT"]
STOLEN = ["Bicycle", "Laptop Computer", "Catalytic Converter", "Cell Phone", "Wallet", "Camera", "Motor Scooter", "Television"]
NAMES = ["J. SMITH", "M. GARCIA", "A. JOHNSON", "L. NGUYEN", "R. PATEL", "K. WILLIAMS", "D. BROWN", "S. LEE"]
PETS = ["MAX (CANINE)", "BELLA (FELINE)", "CHARLIE (CANINE)", "LUNA (FELINE)", "COOPER (CANINE)"]

def money(x): return f"{x:,.2f}"
def addr(r):
    c, s, z = r.choice(CITIES); return f"{r.randrange(100, 9999)} {r.choice(STREETS)}", f"{c}, {s} {z}{r.randrange(10, 99)}", s

def document(r):
    kind = r.choice(["parts", "parts", "parts", "service", "service", "service", "receipt", "repair", "plate", "plate", "permit", "lien"])  # Done & Paid: parts receipts and pros' invoices first; then rating plates, permits, lien waivers
    y = r.choice([2025, 2026]); m = r.randrange(1, 13); d = r.randrange(1, 29); hh, mi = r.randrange(1, 13), r.randrange(60)
    date = f"{y}-{m:02d}-{d:02d}"
    us = f"{m:02d}/{d:02d}/{y}" if r.random() < 0.8 else f"{m:02d}/{d:02d}/{y % 100:02d}"
    a1, a2, st = addr(r); L = []  # (text, size, align)
    taxid = None
    if kind == "receipt":
        name = r.choice(STORES); its = r.sample(GOODS, r.choice([1, 1, 2, 2, 3, 4]))
        qty = [r.choice([1, 1, 1, 2]) for _ in its]; sub = round(sum(p * q for (_, p), q in zip(its, qty)), 2); rate = TAX[st]; tax = round(sub * rate / 100, 2); tot = round(sub + tax, 2)
        L += [(name, 28, "c"), (a1, 20, "c"), (a2, 20, "c"), (f"({r.randrange(200, 999)}) {r.randrange(200, 999)}-{r.randrange(1000, 9999)}", 20, "c"),
              (f"STORE {r.randrange(100, 9999):04d}  REG {r.randrange(1, 20):02d}  TRN {r.randrange(1000, 9999)}", 18, "l"), (f"{us} {hh:02d}:{mi:02d} {r.choice(['AM', 'PM'])}", 20, "l")]
        for (nm, p), q in zip(its, qty):
            L.append((f"{nm}{f' {q} @ {money(p)}' if q > 1 else ''}  {money(p * q)}", 20, "l"))
        L += [(f"SUBTOTAL  {money(sub)}", 20, "l"), (f"SALES TAX {rate:g}%  {money(tax)}" if rate else "SALES TAX  0.00", 20, "l"), (f"TOTAL  ${money(tot)}", 24, "l"),
              (f"{card(r)}  ${money(tot)}", 18, "l"), (r.choice(["THANK YOU FOR SHOPPING", "RETURNS WITHIN 30 DAYS WITH RECEIPT", "SAVE YOUR RECEIPT"]), 18, "c")]
        fields = {"date": date, "amount": tot, "currency": "USD", "merchant": name, "taxId": None, "reportNo": None, "items": [n for n, _ in its]}
    elif kind in ("repair", "vet"):
        name = r.choice(SHOPS if kind == "repair" else CLINICS); pool = REPAIR_ITEMS if kind == "repair" else VET_ITEMS
        its = r.sample(pool, r.choice([1, 2, 2, 3, 4])); sub = round(sum(p for _, p in its), 2)
        rate = TAX[st] if kind == "repair" and r.random() < 0.6 else 0.0; tax = round(sub * rate / 100, 2); tot = round(sub + tax, 2)
        if r.random() < 0.35: taxid = ein(r)
        L += [(name, 26, "c"), (f"{a1}, {a2}", 18, "c"), ("INVOICE", 28, "c"), (f"Invoice # {r.randrange(10000, 99999)}", 20, "l"), (f"Date: {us}", 20, "l")]
        L += [(f"Patient: {r.choice(PETS)}", 20, "l"), (f"Client: {r.choice(NAMES)}", 20, "l")] if kind == "vet" else [(f"Customer: {r.choice(NAMES)}", 20, "l"), (f"Unit: {r.choice(['iPhone 14', 'Galaxy S23', '2019 Honda Civic', 'MacBook Air', 'Whirlpool Fridge', '2021 Toyota RAV4'])}", 20, "l")]
        L += [("Description  Amount", 20, "l")] + [(f"{nm}  {money(p)}", 20, "l") for nm, p in its]
        if rate: L += [(f"Subtotal  {money(sub)}", 20, "l"), (f"Tax {rate:g}%  {money(tax)}", 20, "l")]
        L += [(f"{r.choice(['TOTAL', 'Total Due', 'Balance Due', 'Amount Due'])}  ${money(tot)}", 24, "l")]
        if taxid: L += [(f"EIN {taxid}", 18, "l")]
        L += [(r.choice(["Thank you for your business", "Payment due upon receipt", "90-day warranty on parts and labor"]), 18, "c")]
        fields = {"date": date, "amount": tot, "currency": "USD", "merchant": name, "taxId": taxid, "reportNo": None, "items": [n for n, _ in its]}
    elif kind == "parts":  # a supply-store receipt for the job's parts
        a1, a2, st = f"{r.randrange(100, 9999)} {r.choice(STREETS)}", f"Austin, TX 787{r.randrange(10, 99)}", "TX"
        name = r.choice(SUPPLY); its = r.sample(PARTS, r.choice([1, 1, 2, 3])); qty = [r.choice([1, 1, 1, 2]) for _ in its]
        sub = round(sum(p * q for (_, p), q in zip(its, qty)), 2); tax = round(sub * 8.25 / 100, 2); tot = round(sub + tax, 2)
        L += [(name, 28, "c"), (a1, 20, "c"), (a2, 20, "c"), (f"STORE {r.randrange(100, 9999):04d}  REG {r.randrange(1, 20):02d}  TRN {r.randrange(1000, 9999)}", 18, "l"), (f"{us} {hh:02d}:{mi:02d} {r.choice(['AM', 'PM'])}", 20, "l")]
        for (nm, p), q in zip(its, qty): L.append((f"{nm}{f' {q} @ {money(p)}' if q > 1 else ''}  {money(p * q)}", 20, "l"))
        L += [(f"SUBTOTAL  {money(sub)}", 20, "l"), (f"SALES TAX 8.25%  {money(tax)}", 20, "l"), (f"TOTAL  ${money(tot)}", 24, "l"), (f"{card(r)}  ${money(tot)}", 18, "l"), (r.choice(["THANK YOU FOR SHOPPING", "PRO DESK: ASK ABOUT VOLUME PRICING", "SAVE YOUR RECEIPT"]), 18, "c")]
        fields = {"date": date, "amount": tot, "currency": "USD", "merchant": name, "taxId": None, "reportNo": None, "items": [n for n, _ in its]}
    elif kind == "service":  # the pro's own invoice for the job: trip fee, labor, parts, tax on parts
        trade = r.choice(list(SERVICES)); name = next(p for p in PROS if trade[:4] in p or trade == "PLUMBING" and "PLUMB" in p) if r.random() < 0.7 else r.choice(PROS)
        rate_hr = r.choice([75, 85, 95, 110, 125]); hrs = r.choice([1.0, 1.5, 2.0, 2.5, 3.0]); lines = []
        fixed = [x for x in SERVICES[trade] if x[1]]; task = r.choice([x for x in SERVICES[trade] if not x[1]])
        lines.append((f"{task[0]}", round(rate_hr * hrs, 2), f"Labor {hrs:g} hr @ {money(rate_hr)}"))
        if fixed and r.random() < 0.6: lines.append((fixed[0][0], fixed[0][1], None))
        parts = r.sample(PARTS, r.choice([0, 1, 1, 2])) if trade != "CLEANING" else []
        for nm, p in parts: lines.append((nm, p, None))
        labor = round(sum(x[1] for x in lines[:len(lines) - len(parts)]), 2); ptot = round(sum(p for _, p in parts), 2); tax = round(ptot * 8.25 / 100, 2); tot = round(labor + ptot + tax, 2)
        if r.random() < 0.4: taxid = ein(r)
        L += [(name, 24, "c"), (f"{r.randrange(100, 9999)} {r.choice(STREETS)}, Austin, TX 787{r.randrange(10, 99)}", 18, "c"), (f"TX License #{r.choice(['M', 'RMP-', 'TACLA'])}{r.randrange(10000, 99999)}" if trade == "PLUMBING" else f"Insured & bonded  (512) {r.randrange(200, 999)}-{r.randrange(1000, 9999)}", 18, "c"),
              ("INVOICE", 28, "c"), (f"Invoice # {r.randrange(1000, 99999)}", 20, "l"), (f"Date: {us}", 20, "l"), (f"Service address: {r.randrange(100, 9999)} {r.choice(STREETS)}", 18, "l"), ("Description  Amount", 20, "l")]
        for nm, p, sub in lines: L.append((f"{nm}  {money(p)}", 20, "l"))
        L += [(f"Subtotal  {money(labor + ptot)}", 20, "l"), (f"Tax on parts 8.25%  {money(tax)}", 20, "l") if parts else (f"Tax  0.00", 20, "l"), (f"{r.choice(['TOTAL', 'Total Due', 'Amount Due'])}  ${money(tot)}", 24, "l")]
        if taxid: L += [(f"EIN {taxid}", 18, "l")]
        L += [(r.choice(["Paid via Done & Paid", "Thank you for your business", "1-year warranty on labor"]), 18, "c")]
        fields = {"date": date, "amount": tot, "currency": "USD", "merchant": name, "taxId": taxid, "reportNo": None, "items": [nm for nm, _, _ in lines]}
    elif kind == "plate":  # a product rating / serial plate (water heater, AC, disposal): brand, model, serial, specs
        brand, kindname, specs = r.choice(PLATES)
        model = f"{r.choice('ABCDEGHMRSTX')}{r.choice('ABCDEGHMRSTX')}{r.randrange(10, 99)}-{r.randrange(100, 999)}{r.choice(['', 'A', 'B', 'T', 'N'])}"
        serial = f"{r.choice('ABCDEFGHJKLMNPRSTUVWXYZ')}{r.randrange(10, 99)}{r.randrange(10, 53):02d}{r.randrange(100000, 999999)}"
        L += [(brand, 30, "c"), (kindname, 22, "c"), (f"MODEL NO. {model}", 22, "l"), (f"SERIAL NO. {serial}", 22, "l")]
        L += [(x, 20, "l") for x in r.sample(specs, min(len(specs), r.choice([2, 3, 4])))]
        L += [(f"MFD. {m:02d}/{y}", 20, "l"), (r.choice(["LISTED E123456", "CERTIFIED TO ANSI Z21.10.1", "MADE IN USA", "ASSEMBLED IN MEXICO"]), 18, "l")]
        fields = {"date": None, "amount": None, "currency": None, "merchant": brand, "taxId": None, "reportNo": serial, "items": [model]}
    elif kind == "permit":  # a City of Austin building / trade permit
        no = f"{y}-{r.randrange(10**5, 10**6):06d} {r.choice(['PP', 'EP', 'BP', 'MP'])}"; work = r.choice(PERMIT_WORK); fee = round(r.choice([85, 110, 135, 185, 240, 310]) + r.choice([0, 0.5]), 2)
        L += [("CITY OF AUSTIN", 26, "c"), ("DEVELOPMENT SERVICES DEPARTMENT", 20, "c"), ("BUILDING PERMIT", 28, "c"), (f"Permit No: {no}", 22, "l"), (f"Issued: {us}", 20, "l"),
              (f"Expires: {(m % 12) + 1:02d}/{d:02d}/{y + (1 if m == 12 else 0)}", 20, "l"), (f"Site: {r.randrange(100, 9999)} {r.choice(STREETS)}, Austin, TX 787{r.randrange(10, 99)}", 18, "l"),
              (f"Work: {work}", 20, "l"), (f"Contractor: {r.choice(PROS)}", 18, "l"), (f"License: {r.choice(['RMP-', 'TECL-', 'TACLA'])}{r.randrange(10000, 99999)}", 18, "l"),
              (f"Fee Paid: ${money(fee)}", 22, "l"), ("POST AT JOB SITE UNTIL FINAL INSPECTION", 18, "c")]
        fields = {"date": date, "amount": fee, "currency": "USD", "merchant": "CITY OF AUSTIN DEVELOPMENT SERVICES DEPARTMENT", "taxId": None, "reportNo": no, "items": [work]}
    elif kind == "lien":  # a Texas conditional waiver and release on final payment (Property Code 53.284 wording, shortened)
        claimant = r.choice(PROS); amt = round(r.randrange(90, 2600) + r.choice([0, 0.5, 0.25]), 2)
        L += [("CONDITIONAL WAIVER AND RELEASE", 24, "c"), ("ON FINAL PAYMENT", 24, "c"), ("Texas Property Code Sec. 53.284", 18, "c"),
              (f"Project: {r.randrange(100, 9999)} {r.choice(STREETS)}, Austin, TX", 18, "l"), (f"Job No: {r.randrange(1000, 99999)}", 20, "l"), (f"Claimant: {claimant}", 18, "l"),
              (f"Payment amount: ${money(amt)}", 22, "l"), ("Upon receipt of this payment the claimant", 18, "l"), ("waives and releases its lien and payment bond", 18, "l"),
              ("claims for all labor and materials furnished.", 18, "l"), (f"Date: {us}", 20, "l"), ("Signature: ____________________", 18, "l")]
        fields = {"date": date, "amount": amt, "currency": "USD", "merchant": claimant, "taxId": None, "reportNo": None, "items": ["Conditional Waiver and Release on Final Payment"]}
    else:
        dept = r.choice(DEPTS); no = f"{y % 100:02d}-{r.randrange(10**5, 10**6)}"; item = r.choice(STOLEN)
        L += [(dept, 22, "c"), ("INCIDENT REPORT", 28, "c"), (f"Case No: {no}", 22, "l"), (f"Date Reported: {us}", 20, "l"), (f"Time: {hh:02d}{mi:02d} HRS", 20, "l"),
              (f"Offense: {r.choice(['THEFT', 'BURGLARY', 'THEFT FROM VEHICLE', 'LARCENY'])}", 20, "l"), (f"Location: {a1}", 20, "l"), (f"Property: {item}", 20, "l"),
              (f"Reporting Officer: Ofc. {r.choice(NAMES)} #{r.randrange(100, 9999)}", 18, "l"), ("This report is a record that a report was made", 16, "l")]
        fields = {"date": date, "amount": None, "currency": None, "merchant": dept, "taxId": None, "reportNo": no, "items": [item]}
    return kind, fields, L

def dotmatrix(img, ink, paper, pitch=3):
    """Rebuild the ink from dots on a grid, as an impact printer prints."""
    g = np.array(img.convert("L")); h, w = g.shape; out = Image.new("RGB", (w, h), paper); dr = ImageDraw.Draw(out)
    dark = g < 140
    for yy in range(0, h, pitch):
        for xx in range(0, w, pitch):
            if dark[yy:yy + pitch, xx:xx + pitch].mean() > 0.25: dr.ellipse([xx - 0.3, yy - 0.3, xx + pitch - 0.2, yy + pitch - 0.2], fill=ink)
    return out

def render(L, path, style, r):
    W = 600; pad = 34; gap = 12
    if style == "dotmatrix": L = [(t, int(sz * 1.3), al) for t, sz, al in L]; W = 760  # impact printers print large
    cache = {}
    def F(s):
        if s not in cache: cache[s] = ImageFont.truetype(path, s)
        return cache[s]
    H = pad * 2 + sum(s + gap for _, s, _ in L)
    paper = tuple(int(x) for x in np.random.randint(232, 256, 3)) if style != "thermal" else (250, 250, 248)
    ink = tuple(int(x) for x in np.random.randint(0, 50, 3)) if style != "thermal" else tuple([int(np.random.randint(70, 130))] * 3)
    im = Image.new("RGB", (W, H), paper); dr = ImageDraw.Draw(im); boxes = []; y = pad
    for text, s, al in L:
        f = F(s); w = dr.textlength(text, font=f)
        if w > W - 2 * pad: s = max(11, int(s * (W - 2 * pad) / w)); f = F(s); w = dr.textlength(text, font=f)
        x = (W - w) / 2 if al == "c" else pad
        dr.text((x, y), text, fill=ink, font=f); bb = dr.textbbox((x, y), text, font=f)
        boxes.append([bb[0] - 3, bb[1] - 3, bb[2] + 3, bb[3] + 3]); y += s + gap
    if style == "dotmatrix": im = dotmatrix(im, ink, paper, 2)
    a = np.array(im).astype(np.float32)
    if style == "thermal":  # faded vertical bands, as a worn print head leaves
        for _ in range(r.randrange(1, 4)):
            x0 = r.randrange(W); bw = r.randrange(10, 80); a[:, x0:x0 + bw] = 255 - (255 - a[:, x0:x0 + bw]) * r.uniform(0.35, 0.75)
    return np.clip(a, 0, 255).astype(np.uint8), boxes

def spoil(img, boxes, r):
    """A phone photo of the paper: on a background, in perspective, creased, with glare, uneven light, blur, noise and
    JPEG. Returns the photo and each line's four corners in it. (As in round 1.)"""
    h, w = img.shape[:2]
    for _ in range(r.choice([0, 1, 1, 2])):
        p0 = (r.randrange(w), 0) if r.random() < 0.5 else (0, r.randrange(h)); p1 = (r.randrange(w), h) if p0[1] == 0 else (w, r.randrange(h))
        cv2.line(img, p0, p1, tuple(int(c) for c in np.random.randint(120, 190, 3)), r.choice([1, 2]))
        cv2.line(img, (p0[0] + 2, p0[1] + 2), (p1[0] + 2, p1[1] + 2), (250, 250, 250), 1)
    B = 60; bg = np.full((h + 2 * B, w + 2 * B, 3), np.random.randint(40, 200, 3), np.uint8); bg[B:B + h, B:B + w] = img
    j = lambda: r.uniform(-1, 1) * 0.06
    src = np.float32([[B, B], [B + w, B], [B + w, B + h], [B, B + h]])
    dst = np.float32([[B + w * j(), B + h * j()], [B + w + w * j(), B + h * j()], [B + w + w * j(), B + h + h * j()], [B + w * j(), B + h + h * j()]])
    ang = math.radians(r.uniform(-6, 6)); cx, cy = (w + 2 * B) / 2, (h + 2 * B) / 2
    rot = np.float32([[math.cos(ang), -math.sin(ang)], [math.sin(ang), math.cos(ang)]]); dst = (dst - [cx, cy]) @ rot.T + [cx, cy]
    M = cv2.getPerspectiveTransform(src, dst.astype(np.float32))
    out = cv2.warpPerspective(bg, M, (w + 2 * B, h + 2 * B), borderMode=cv2.BORDER_REPLICATE)
    quads = [cv2.perspectiveTransform(np.float32([[x0 + B, y0 + B], [x1 + B, y0 + B], [x1 + B, y1 + B], [x0 + B, y1 + B]]).reshape(-1, 1, 2), M).reshape(-1, 2).tolist() for x0, y0, x1, y1 in boxes]
    out = out.astype(np.float32); H2, W2 = out.shape[:2]; yy, xx = np.mgrid[0:H2, 0:W2]
    out *= (0.75 + 0.35 * (xx / W2 * r.uniform(-1, 1) + yy / H2 * r.uniform(-1, 1) + 1) / 2)[..., None]
    if r.random() < 0.6:
        gx, gy, gr = r.randrange(W2), r.randrange(H2), r.uniform(0.15, 0.4) * W2
        out += (r.uniform(60, 160) * np.exp(-((xx - gx) ** 2 + (yy - gy) ** 2) / (2 * gr ** 2)))[..., None]
    if r.random() < 0.5: out = cv2.GaussianBlur(out, (0, 0), r.uniform(0.3, 1.2))
    elif r.random() < 0.5:
        k = r.choice([3, 5]); kern = np.zeros((k, k), np.float32); kern[k // 2, :] = 1 / k
        out = cv2.filter2D(out, -1, cv2.warpAffine(kern, cv2.getRotationMatrix2D((k / 2, k / 2), r.uniform(0, 180), 1), (k, k)))
    out += np.random.normal(0, r.uniform(2, 9), out.shape)
    out = np.clip(out, 0, 255).astype(np.uint8)
    ok, enc = cv2.imencode(".jpg", out, [cv2.IMWRITE_JPEG_QUALITY, r.randrange(25, 80)])
    return cv2.imdecode(enc, cv2.IMREAD_COLOR), quads

def cut(photo, quad, r=None, H=32, jitter=True):
    q = np.float32(quad)
    if jitter and r is not None: q = q + np.float32([[r.uniform(-3, 3), r.uniform(-3, 3)] for _ in range(4)])
    wq = max(np.linalg.norm(q[1] - q[0]), np.linalg.norm(q[2] - q[3])); hq = max(np.linalg.norm(q[3] - q[0]), np.linalg.norm(q[2] - q[1]))
    W = max(8, int(round(wq * H / max(hq, 1))))
    return cv2.warpPerspective(photo, cv2.getPerspectiveTransform(q, np.float32([[0, 0], [W, 0], [W, H], [0, H]])), (W, H), borderMode=cv2.BORDER_REPLICATE)

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", required=True); ap.add_argument("--split", required=True); ap.add_argument("--docs", type=int, required=True); ap.add_argument("--seed", type=int, default=1)
    ap.add_argument("--fonts", default="train", choices=["train", "held_out"]); ap.add_argument("--images", type=int, default=300)
    a = ap.parse_args()
    r = random.Random(a.seed); np.random.seed(a.seed); cv2.setNumThreads(1)
    fonts = FONTS if a.fonts == "train" else HELD_OUT
    for d in (f"docs/{a.split}", f"lines/{a.split}"): os.makedirs(os.path.join(a.out, d), exist_ok=True)
    docs = open(os.path.join(a.out, f"docs_{a.split}.jsonl"), "w", encoding="utf8"); tsv = open(os.path.join(a.out, f"lines_{a.split}.tsv"), "w", encoding="utf8"); nl = 0
    for i in range(a.docs):
        kind, f, L = document(r)
        fn = r.choice(sorted(fonts))
        style = "plain"
        if kind in ("receipt", "parts"): style = r.choice(["plain", "thermal", "thermal", "dotmatrix"])
        elif r.random() < 0.15: style = "dotmatrix"
        if style != "plain" and fn not in MONO and r.random() < 0.7 and any(k in MONO for k in fonts): fn = r.choice(sorted(k for k in fonts if k in MONO))
        img, boxes = render(L, fonts[fn], style, r)
        photo, quads = spoil(img, boxes, r)
        did = f"{a.split}-{i:05d}"
        if i < a.images: cv2.imwrite(os.path.join(a.out, "docs", a.split, f"{did}.jpg"), photo, [cv2.IMWRITE_JPEG_QUALITY, 90])
        lines = []
        for k, ((text, _, _), q) in enumerate(zip(L, quads)):
            crop = cut(photo, q, r, jitter=a.split.startswith("train"))
            name = f"lines/{a.split}/{did}-{k:02d}.png"; cv2.imwrite(os.path.join(a.out, name), crop)
            tsv.write(f"{name}\t{text}\n"); nl += 1
            lines.append({"text": text, "quad": [[round(x, 1), round(y, 1)] for x, y in q], "crop": name})
        docs.write(json.dumps({"id": did, "kind": kind, "style": style, "font": fn, "fields": f, "text": "\n".join(t for t, _, _ in L), "lines": lines,
                               "image": f"docs/{a.split}/{did}.jpg" if i < a.images else None}, ensure_ascii=False) + "\n")
    print(f"GEN_DONE {a.split}: {a.docs} documents, {nl} lines, fonts {sorted(fonts)}")

if __name__ == "__main__":
    main()
