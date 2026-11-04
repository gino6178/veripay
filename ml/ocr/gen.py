"""Cover-OCR's synthetic documents (PLAN-cover.md 12.2): 統一發票 proof copies, vet invoices, repair quotes and police
report slips (受理案件證明單, the 報案三聯單's copy), drawn with Traditional Chinese fonts and then spoilt the way phone
photos are: perspective and skew, creases, glare, uneven light, blur, noise and JPEG. Every field and every line's
text is known exactly, because code wrote them. Names, numbers and 統一編號 are made up (統一編號 pass the checksum
and belong to no one).

Writes, under --out:
  docs_<split>.jsonl   one row per document: id, kind, fields (the app reader's schema without "text"), text (the lines
                       as written), lines [{text, quad}] (each line's four corners in the photo), font, image
  docs/<split>/*.jpg   the document photos (only the first --images of each split, to keep the disk small)
  lines/<split>/*.png  each line, cut out of the photo along its corners and straightened, 32 px high
  lines_<split>.tsv    file \t text
   python ml/ocr/gen.py --out ml/ocr/out --split train --docs 5000 --seed 1
   python ml/ocr/gen.py --out ml/ocr/out --split test --docs 400 --seed 2
   python ml/ocr/gen.py --out ml/ocr/out --split test_font --docs 200 --seed 3 --fonts held_out
"""
import argparse, json, math, os, random
import numpy as np
import cv2
from PIL import Image, ImageDraw, ImageFont

FONTS = {  # (path, index in a .ttc)
    "noto_sans": ("/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc", 3),   # Noto Sans CJK TC
    "noto_sans_bold": ("/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc", 3),
    "noto_serif": ("/usr/share/fonts/opentype/noto/NotoSerifCJK-Regular.ttc", 3), # Noto Serif CJK TC
    "uming": ("/usr/share/fonts/truetype/arphic/uming.ttc", 2),                  # AR PL UMing TW
    "wqy_zenhei": ("/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc", 0),
    "wqy_micro": ("/usr/share/fonts/truetype/wqy/wqy-microhei.ttc", 0),
}
HELD_OUT = {"ukai": ("/usr/share/fonts/truetype/arphic/ukai.ttc", 2)}            # AR PL UKai TW: never in training

def tax_id(r):
    w = [1, 2, 1, 2, 1, 2, 4, 1]
    while True:
        d = [r.randrange(10) for _ in range(8)]
        if d[6] == 7: continue
        if sum(sum(divmod(a * b, 10)) for a, b in zip(d, w)) % 10 == 0: return "".join(map(str, d))

SHOPS = ["小森生活百貨股份有限公司", "青禾3C數位館", "日光文具家居有限公司", "北辰電器行", "大和家電量販", "晨星通訊行", "木樨傢俱", "好市生活館", "藍鯨數位", "安心五金行", "春田寢具"]
GOODS = ["電動吸塵器", "除濕機", "空氣清淨機", "電熱水壺", "落地電風扇", "無線藍牙耳機", "行動電源", "27吋螢幕", "機械式鍵盤", "書桌收納櫃", "人體工學椅", "LED檯燈", "折疊床墊", "微波爐", "電鍋", "吹風機", "筆記型電腦", "平板電腦", "智慧手錶", "單眼相機鏡頭", "行李箱", "記憶枕", "延長線", "掃地機器人"]
VETS = ["安和動物醫院", "森林犬貓專科醫院", "晴川動物醫院", "毛孩日常動物醫院", "仁心獸醫診所", "海風動物醫院"]
VET_ITEMS = ["門診診療費", "X光檢查", "腸胃炎住院一日", "傷口縫合", "血液檢查", "結石手術", "超音波檢查", "皮膚科門診", "牙結石清除", "狂犬病疫苗", "五合一疫苗", "外傷處置", "心絲蟲檢驗", "點滴治療", "處方藥", "麻醉費"]
REPAIRS = ["快修通訊維修站", "藍灣筆電維修中心", "大安車業", "順風機車行", "宏達家電維修", "極速手機急診室"]
REPAIR_ITEMS = ["手機螢幕更換", "手機電池更換", "主機板進水處理", "筆電鍵盤更換", "筆電螢幕更換", "硬碟資料救援", "前保險桿鈑金", "後照鏡更換", "車殼烤漆", "冷氣壓縮機更換", "工資", "檢測費"]
STATIONS = ["臺北市政府警察局大安分局和平東路派出所", "新北市政府警察局板橋分局江翠派出所", "臺中市政府警察局第一分局民權派出所", "高雄市政府警察局苓雅分局四維派出所", "臺南市政府警察局第一分局東門派出所", "桃園市政府警察局中壢分局興國派出所"]
STOLEN = ["腳踏車", "筆記型電腦", "機車", "手機", "錢包", "單眼相機", "行李箱"]
SURN = "王林陳張李黃吳劉蔡楊許鄭謝郭洪曾"
PETS = ["豆豆（犬）", "咪咪（貓）", "阿福（犬）", "麻糬（貓）", "Lucky（犬）", "小黑（貓）"]

def roc(y): return y - 1911
def fdate(r, y, m, d, style):
    return {"iso": f"{y}-{m:02d}-{d:02d}", "slash": f"{y}/{m:02d}/{d:02d}", "roc": f"{roc(y)}/{m:02d}/{d:02d}", "rocw": f"民國{roc(y)}年{m}月{d}日", "rocw2": f"{roc(y)}年{m:02d}月{d:02d}日"}[style]
def money(a, style): return {"nt": f"NT${a:,}", "yuan": f"{a:,}元", "plain": f"{a}", "dollar": f"${a:,}"}[style]

def document(r):
    kind = r.choice(["invoice", "invoice", "vet", "repair", "police"])
    y = r.choice([2025, 2026]); m = r.randrange(1, 13); d = r.randrange(1, 29); hh, mi, ss = r.randrange(8, 22), r.randrange(60), r.randrange(60)
    date = f"{y}-{m:02d}-{d:02d}"; L = []  # (text, size, align)
    if kind == "invoice":
        shop = r.choice(SHOPS); tid = tax_id(r); buyer = tax_id(r) if r.random() < 0.35 else None
        its = r.sample(GOODS, r.choice([1, 1, 2, 3])); prices = [r.randrange(3, 900) * 10 + r.choice([0, 5]) for _ in its]; amt = sum(prices)
        per = (m + 1) // 2 * 2
        L += [(shop, 26, "c"), ("電子發票證明聯", 34, "c"), (f"{roc(y)}年{per - 1:02d}-{per:02d}月", 34, "c"), (f"{r.choice('ABCDEFGHJKLMNPQRSTUVWXYZ')}{r.choice('ABCDEFGHJKLMNPQRSTUVWXYZ')}-{r.randrange(10**7, 10**8)}", 30, "c"),
              (f"{fdate(r, y, m, d, r.choice(['iso', 'slash']))} {hh:02d}:{mi:02d}:{ss:02d}", 22, "l"), (f"隨機碼 {r.randrange(1000, 10000)}  總計 {amt}", 22, "l"),
              (f"賣方 {tid}" + (f"  買方 {buyer}" if buyer else ""), 22, "l"), ("交易明細", 22, "l")]
        L += [(f"{it} {r.choice(['1 x ', ''])}{p} {p}TX", 22, "l") for it, p in zip(its, prices)]
        L += [(f"合計 {money(amt, r.choice(['nt', 'yuan', 'plain', 'dollar']))}", 24, "l")]
        f = {"date": date, "amount": amt, "currency": "TWD", "merchant": shop, "taxId": tid, "reportNo": None, "items": its}
    elif kind in ("vet", "repair"):
        shop = r.choice(VETS if kind == "vet" else REPAIRS); tid = tax_id(r) if r.random() < 0.7 else None
        its = r.sample(VET_ITEMS if kind == "vet" else REPAIR_ITEMS, r.choice([1, 2, 2, 3])); prices = [r.randrange(2, 400) * 50 for _ in its]; amt = sum(prices)
        L += [(shop, 30, "c"), ("醫療費用收據" if kind == "vet" else r.choice(["維修估價單", "維修單"]), 28, "c"), (f"日期：{fdate(r, y, m, d, r.choice(['iso', 'slash', 'roc', 'rocw', 'rocw2']))}", 22, "l")]
        if kind == "vet": L += [(f"飼主：{r.choice(SURN)}○○  寵物：{r.choice(PETS)}", 22, "l"), (f"晶片號碼：{r.randrange(10**14, 10**15)}", 22, "l")]
        else: L += [(f"機型：{r.choice(['手機 X12', '筆電 Air 14', '機車 125', '冷氣 分離式'])}  序號：{r.randrange(10**8, 10**9)}", 22, "l")]
        if kind == "repair" and r.random() < 0.3: L += [(f"客戶統一編號：{tax_id(r)}", 22, "l")]
        L += [("項目        金額", 22, "l")] + [(f"{it}    {money(p, r.choice(['plain', 'yuan']))}", 22, "l") for it, p in zip(its, prices)]
        L += [(f"合計：{money(amt, r.choice(['nt', 'yuan', 'plain', 'dollar']))}", 24, "l")]
        if tid: L += [(r.choice([f"統一編號：{tid}", f"統編 {tid}", f"營利事業統一編號 {tid}"]), 22, "l")]
        L += [(r.choice(["謝謝光臨", "本收據為正式收據", "保固 90 天", "請妥善保存"]), 20, "l")]
        f = {"date": date, "amount": amt, "currency": "TWD", "merchant": shop, "taxId": tid, "reportNo": None, "items": its}
    else:
        st = r.choice(STATIONS); item = r.choice(STOLEN); no = str(r.randrange(10**9, 10**10))
        L += [(r.choice(["受（處）理案件證明單", "受理各類案件紀錄表"]), 30, "c"), (f"報案人：{r.choice(SURN)}○○", 22, "l"), ("案件類別：竊盜", 22, "l"),
              (f"受理單位：{st}", 18, "l"), (f"受理時間：{fdate(r, y, m, d, r.choice(['roc', 'rocw', 'rocw2']))} {hh:02d}時{mi:02d}分", 22, "l"),
              (f"案情摘要：報案人之{item}遭竊", 22, "l"), (f"受理編號：{no}", 22, "l"), ("本證明單僅證明有報案", 18, "l")]
        f = {"date": date, "amount": None, "currency": None, "merchant": st, "taxId": None, "reportNo": no, "items": [item]}
    return kind, f, L

def render(L, font_name, fonts):
    path, idx = fonts[font_name]
    W = 640; pad = 36; gap = 14
    cache = {}
    def F(s):
        if s not in cache: cache[s] = ImageFont.truetype(path, s, index=idx)
        return cache[s]
    H = pad * 2 + sum(s + gap for _, s, _ in L)
    paper = tuple(int(x) for x in np.random.randint(225, 256, 3))
    im = Image.new("RGB", (W, H), paper); dr = ImageDraw.Draw(im)
    boxes = []; y = pad
    ink = tuple(int(x) for x in np.random.randint(0, 60, 3))
    for text, s, al in L:
        f = F(s); w = dr.textlength(text, font=f)
        if w > W - 2 * pad:  # too wide: shrink this line
            s2 = max(12, int(s * (W - 2 * pad) / w)); f = F(s2); w = dr.textlength(text, font=f); s = s2
        x = (W - w) / 2 if al == "c" else pad
        dr.text((x, y), text, fill=ink, font=f)
        bb = dr.textbbox((x, y), text, font=f)
        boxes.append([bb[0] - 3, bb[1] - 3, bb[2] + 3, bb[3] + 3])
        y += s + gap
    return np.array(im), boxes

def spoil(img, boxes, r):
    """A phone photo of the paper: on a background, in perspective, creased, with glare, uneven light, blur, noise and
    JPEG. Returns the photo and each line's four corners in it."""
    h, w = img.shape[:2]
    # crease: a darker fold line with a lighter edge across the paper
    for _ in range(r.choice([0, 1, 1, 2])):
        p0 = (r.randrange(w), 0) if r.random() < 0.5 else (0, r.randrange(h)); p1 = (r.randrange(w), h) if p0[1] == 0 else (w, r.randrange(h))
        cv2.line(img, p0, p1, tuple(int(c) for c in np.random.randint(120, 190, 3)), r.choice([1, 2]))
        cv2.line(img, (p0[0] + 2, p0[1] + 2), (p1[0] + 2, p1[1] + 2), (250, 250, 250), 1)
    # on a background, then perspective
    B = 60; bg = np.full((h + 2 * B, w + 2 * B, 3), np.random.randint(40, 200, 3), np.uint8)
    bg[B:B + h, B:B + w] = img
    j = lambda: r.uniform(-1, 1) * 0.06
    src = np.float32([[B, B], [B + w, B], [B + w, B + h], [B, B + h]])
    dst = np.float32([[B + w * j(), B + h * j()], [B + w + w * j(), B + h * j()], [B + w + w * j(), B + h + h * j()], [B + w * j(), B + h + h * j()]])
    ang = math.radians(r.uniform(-6, 6)); cx, cy = (w + 2 * B) / 2, (h + 2 * B) / 2
    rot = np.float32([[math.cos(ang), -math.sin(ang)], [math.sin(ang), math.cos(ang)]])
    dst = (dst - [cx, cy]) @ rot.T + [cx, cy]
    M = cv2.getPerspectiveTransform(src, dst.astype(np.float32))
    out = cv2.warpPerspective(bg, M, (w + 2 * B, h + 2 * B), borderMode=cv2.BORDER_REPLICATE)
    quads = []
    for x0, y0, x1, y1 in boxes:
        q = np.float32([[x0 + B, y0 + B], [x1 + B, y0 + B], [x1 + B, y1 + B], [x0 + B, y1 + B]]).reshape(-1, 1, 2)
        quads.append(cv2.perspectiveTransform(q, M).reshape(-1, 2).tolist())
    out = out.astype(np.float32)
    # uneven light and glare
    H2, W2 = out.shape[:2]; yy, xx = np.mgrid[0:H2, 0:W2]
    out *= (0.75 + 0.35 * (xx / W2 * r.uniform(-1, 1) + yy / H2 * r.uniform(-1, 1) + 1) / 2)[..., None]
    if r.random() < 0.6:
        gx, gy, gr = r.randrange(W2), r.randrange(H2), r.uniform(0.15, 0.4) * W2
        out += (r.uniform(60, 160) * np.exp(-((xx - gx) ** 2 + (yy - gy) ** 2) / (2 * gr ** 2)))[..., None]
    # blur (focus or motion), noise, JPEG
    if r.random() < 0.5: out = cv2.GaussianBlur(out, (0, 0), r.uniform(0.3, 1.4))
    elif r.random() < 0.5:
        k = r.choice([3, 5, 7]); kern = np.zeros((k, k), np.float32); kern[k // 2, :] = 1 / k
        out = cv2.filter2D(out, -1, cv2.warpAffine(kern, cv2.getRotationMatrix2D((k / 2, k / 2), r.uniform(0, 180), 1), (k, k)))
    out += np.random.normal(0, r.uniform(2, 9), out.shape)
    out = np.clip(out, 0, 255).astype(np.uint8)
    ok, enc = cv2.imencode(".jpg", out, [cv2.IMWRITE_JPEG_QUALITY, r.randrange(25, 80)])
    return cv2.imdecode(enc, cv2.IMREAD_COLOR), quads

def cut(photo, quad, r=None, H=32, jitter=True):
    """A line cut out along its four corners and straightened to H px high (a little slack around it, jittered in
    training as a detector's boxes would be)."""
    q = np.float32(quad)
    if jitter and r is not None: q = q + np.float32([[r.uniform(-3, 3), r.uniform(-3, 3)] for _ in range(4)])
    wq = max(np.linalg.norm(q[1] - q[0]), np.linalg.norm(q[2] - q[3])); hq = max(np.linalg.norm(q[3] - q[0]), np.linalg.norm(q[2] - q[1]))
    W = max(8, int(round(wq * H / max(hq, 1))))
    M = cv2.getPerspectiveTransform(q, np.float32([[0, 0], [W, 0], [W, H], [0, H]]))
    return cv2.warpPerspective(photo, M, (W, H), borderMode=cv2.BORDER_REPLICATE)

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", required=True); ap.add_argument("--split", required=True); ap.add_argument("--docs", type=int, required=True); ap.add_argument("--seed", type=int, default=1)
    ap.add_argument("--fonts", default="train", choices=["train", "held_out"]); ap.add_argument("--images", type=int, default=300)
    a = ap.parse_args()
    r = random.Random(a.seed); np.random.seed(a.seed)
    fonts = FONTS if a.fonts == "train" else HELD_OUT
    fonts = {k: v for k, v in fonts.items() if os.path.exists(v[0])}
    for d in (f"docs/{a.split}", f"lines/{a.split}"): os.makedirs(os.path.join(a.out, d), exist_ok=True)
    docs = open(os.path.join(a.out, f"docs_{a.split}.jsonl"), "w", encoding="utf8"); tsv = open(os.path.join(a.out, f"lines_{a.split}.tsv"), "w", encoding="utf8")
    nl = 0
    for i in range(a.docs):
        kind, f, L = document(r); fn = r.choice(sorted(fonts))
        img, boxes = render(L, fn, fonts)
        photo, quads = spoil(img, boxes, r)
        did = f"{a.split}-{i:05d}"
        if i < a.images: cv2.imwrite(os.path.join(a.out, "docs", a.split, f"{did}.jpg"), photo, [cv2.IMWRITE_JPEG_QUALITY, 90])
        lines = []
        for k, ((text, _, _), q) in enumerate(zip(L, quads)):
            crop = cut(photo, q, r, jitter=a.split == "train")
            name = f"lines/{a.split}/{did}-{k:02d}.png"; cv2.imwrite(os.path.join(a.out, name), crop)
            tsv.write(f"{name}\t{text}\n"); nl += 1
            lines.append({"text": text, "quad": [[round(x, 1), round(y, 1)] for x, y in q], "crop": name})
        docs.write(json.dumps({"id": did, "kind": kind, "font": fn, "fields": f, "text": "\n".join(t for t, _, _ in L), "lines": lines, "image": f"docs/{a.split}/{did}.jpg" if i < a.images else None}, ensure_ascii=False) + "\n")
    print(f"GEN_DONE {a.split}: {a.docs} documents, {nl} lines, fonts {sorted(fonts)}")

if __name__ == "__main__":
    main()
