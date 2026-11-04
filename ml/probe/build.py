"""The Traditional Chinese probe of Muse Glimmer (PLAN-cover.md 11 and 12: "Muse Glimmer's Traditional Chinese has not
been measured"). Builds the 50 cases, with the right answers known by code or written beside the question:

  qa       25 clause questions (qa_questions.json, written by hand against the products' own clauses): the answer must
           cite the clause id. The clauses are a snapshot of cover/api/src/products/{renters,pet}.json (clauses.json),
           so the probe stays reproducible while the app line edits them.
  extract  25 receipts and claim texts (generated here from a seed): 統一發票 (electronic invoice proof copies), vet
           receipts, repair slips, police report slips and claim narratives, with the fields known exactly, named as
           the app's reader (api/src/reader.js) names them: date, amount, merchant, taxId (the seller's 統一編號),
           reportNo (a police report's number), and the item, which must be among the answer's items. Dates are written as ROC or Western dates, amounts with
           commas, NT$, full-width digits; some show a buyer's 統一編號 too (not the answer).
  vision   5 of the 統一發票 cases rendered as images (PIL, a Traditional Chinese font), the same right answers.

Every name, number and 統一編號 is made up (統一編號 pass the checksum but belong to no one). These are evaluation cases
only: they are never used as training data.
   python3 ml/probe/build.py [--products ../api/src/products] [--font /usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc]
"""
import argparse, json, os, random

HERE = os.path.dirname(os.path.abspath(__file__))
ZH_DIGITS = str.maketrans("0123456789,", "０１２３４５６７８９，")

def tax_id(rng):
    """A made-up 8-digit 統一編號 that passes the checksum (weights 1,2,1,2,1,2,4,1; digit sums of the products; total
    divisible by 10, which is valid under both the old and the 2023 rule)."""
    w = [1, 2, 1, 2, 1, 2, 4, 1]
    while True:
        d = [rng.randrange(10) for _ in range(8)]
        if d[6] == 7: continue
        s = sum(sum(divmod(a * b, 10)) for a, b in zip(d, w))
        if s % 10 == 0: return "".join(map(str, d))

MERCHANTS = {
    "invoice": [("小森生活百貨股份有限公司", ["電動吸塵器", "除濕機", "空氣清淨機", "電熱水壺", "落地電風扇"]),
                ("青禾3C數位館", ["無線藍牙耳機", "行動電源", "平板電腦保護殼", "27吋螢幕", "機械式鍵盤"]),
                ("日光文具家居有限公司", ["書桌收納櫃", "人體工學椅", "LED檯燈", "折疊床墊"]),
                ("北辰電器行", ["變頻冷氣安裝", "洗衣機", "微波爐", "電冰箱"])],
    "vet": [("安和動物醫院", ["門診診療費", "X光檢查", "腸胃炎住院一日", "傷口縫合", "血液檢查"]),
            ("森林犬貓專科醫院", ["結石手術", "超音波檢查", "皮膚科門診", "牙結石清除"]),
            ("晴川動物醫院", ["狂犬病疫苗", "五合一疫苗", "外傷處置", "心絲蟲檢驗"])],
    "repair": [("快修通訊維修站", ["手機螢幕更換", "手機電池更換", "主機板進水處理"]),
               ("藍灣筆電維修中心", ["筆電鍵盤更換", "筆電螢幕更換", "硬碟資料救援"])],
}

def roc(y): return y - 1911

def fmt_date(rng, y, m, d, style):
    if style == "iso": return f"{y}-{m:02d}-{d:02d}"
    if style == "slash": return f"{y}/{m:02d}/{d:02d}"
    if style == "roc_slash": return f"{roc(y)}/{m:02d}/{d:02d}"
    if style == "roc_word": return f"民國{roc(y)}年{m}月{d}日"
    if style == "word": return f"{y}年{m}月{d}日"

def fmt_amount(rng, a, style):
    s = f"{a:,}"
    return {"nt": f"NT${s}", "yuan": f"{s} 元", "plain": f"{a}", "full": f"{s.translate(ZH_DIGITS)} 元", "dollar": f"$ {s}"}[style]

def extract_cases(seed=20261104):
    rng = random.Random(seed)
    kinds = ["invoice"] * 8 + ["vet"] * 6 + ["repair"] * 4 + ["police"] * 3 + ["story"] * 4
    out = []
    for i, kind in enumerate(kinds):
        y = rng.choice([2025, 2026]); m = rng.randrange(1, 13); d = rng.randrange(1, 29)
        date_style = rng.choice(["iso", "slash", "roc_slash", "roc_word", "word"])
        amt_style = rng.choice(["nt", "yuan", "plain", "full", "dollar"])
        hh, mm, ss = rng.randrange(9, 22), rng.randrange(60), rng.randrange(60)
        truth = {"date": f"{y}-{m:02d}-{d:02d}"}
        if kind == "police":
            station = rng.choice(["臺北市政府警察局大安分局和平東路派出所", "新北市政府警察局板橋分局江翠派出所", "臺中市政府警察局第一分局民權派出所"])
            item = rng.choice(["腳踏車", "筆記型電腦", "機車"])
            no = f"{rng.randrange(10**9, 10**10)}"
            text = (f"受（處）理案件證明單\n報案人：王○明\n案件類別：竊盜\n受理單位：{station}\n受理日期：{fmt_date(rng, y, m, d, date_style)} {hh:02d}時{mm:02d}分\n"
                    f"案情摘要：報案人停放於住處之{item}遭竊。\n受理編號：{no}\n（本證明單僅證明有報案，不代表案件屬實）")
            truth.update({"amount": None, "merchant": station, "item": item, "taxId": None, "reportNo": no})
        elif kind == "story":
            sub = rng.choice(["invoice", "vet", "repair"])
            merchant, items = rng.choice(MERCHANTS[sub]); item = rng.choice(items)
            a = rng.randrange(8, 400) * 50
            pet = rng.choice(["狗狗豆豆", "貓咪咪咪", "柯基阿福"])
            lead = {"invoice": f"我在{fmt_date(rng, y, m, d, date_style)}到{merchant}買了{item}，付了{fmt_amount(rng, a, amt_style)}，結果",
                    "vet": f"{pet}{fmt_date(rng, y, m, d, date_style)}在{merchant}做了{item}，總共花了{fmt_amount(rng, a, amt_style)}，",
                    "repair": f"我的手機壞了，{fmt_date(rng, y, m, d, date_style)}拿去{merchant}做{item}，維修費{fmt_amount(rng, a, amt_style)}，"}[sub]
            tail = {"invoice": "隔週家裡漏水就泡壞了，發票我只有拍照，上面沒有統編。", "vet": "收據在這裡，請幫我申請理賠，謝謝。", "repair": "單子上沒有寫統一編號，想問能不能申請。"}[sub]
            text = lead + tail
            truth.update({"amount": a, "merchant": merchant, "item": item, "taxId": None, "reportNo": None})
        else:
            merchant, items = rng.choice(MERCHANTS[kind]); item = rng.choice(items)
            a = rng.randrange(6, 900) * 10 + rng.choice([0, 5])
            tid = tax_id(rng); buyer = tax_id(rng) if rng.random() < 0.4 else None
            show_tid = kind == "invoice" or rng.random() < 0.6
            if kind == "invoice":
                inv = f"{rng.choice('ABCDEFGHJKLMNPQRSTUVWXYZ')}{rng.choice('ABCDEFGHJKLMNPQRSTUVWXYZ')}-{rng.randrange(10**7, 10**8)}"
                per = (m + 1) // 2 * 2
                lines = [merchant, "電子發票證明聯", f"{roc(y)}年{per - 1:02d}-{per:02d}月", inv,
                         f"{fmt_date(rng, y, m, d, rng.choice(['iso', 'slash']))} {hh:02d}:{mm:02d}:{ss:02d}",
                         f"隨機碼 {rng.randrange(1000, 10000)}    總計 {a}", f"賣方 {tid}" + (f"    買方 {buyer}" if buyer else ""),
                         "----------------", f"{item}    1 x {a}    {a}TX", f"合計：{fmt_amount(rng, a, amt_style)}"]
                text = "\n".join(lines)
            else:
                title = "收據" if kind == "vet" else "維修單"
                lines = [f"{merchant}  {title}", f"日期：{fmt_date(rng, y, m, d, date_style)}"]
                if kind == "vet": lines.append(f"寵物：{rng.choice(['豆豆（犬）', '咪咪（貓）', '阿福（犬）'])}  晶片號碼：{rng.randrange(10**14, 10**15)}")
                else: lines.append(f"機型：{rng.choice(['手機 X12', '筆電 Air 14', '手機 Pro 9'])}  序號：{rng.randrange(10**9, 10**10)}")
                if buyer and kind != "vet": lines.append(f"客戶統一編號：{buyer}")
                lines += [f"項目：{item}", f"金額：{fmt_amount(rng, a, amt_style)}"]
                if show_tid: lines.append(rng.choice([f"統一編號：{tid}", f"統編 {tid}", f"營利事業統一編號 {tid}"]))
                lines.append(rng.choice(["謝謝光臨", "本收據為正式收據", "保固 90 天"]))
                text = "\n".join(lines)
            truth.update({"amount": a, "merchant": merchant, "item": item, "taxId": tid if show_tid else None, "reportNo": None})
        out.append({"id": f"ex{i + 1:02d}", "kind": kind, "text": text, "truth": truth})
    return out

def render(case, path, font):
    """A 統一發票-style proof copy: narrow, centred, black on white, with a little skew noise-free layout (the probe asks
    whether the vision reads clean images at all; Cover-OCR's generator adds the creases and glare)."""
    from PIL import Image, ImageDraw, ImageFont
    lines = case["text"].split("\n")
    W = 520; big = ImageFont.truetype(font, 34); mid = ImageFont.truetype(font, 26); small = ImageFont.truetype(font, 22)
    H = 80 + 50 * len(lines)
    im = Image.new("RGB", (W, H), "white"); dr = ImageDraw.Draw(im)
    yy = 30
    for k, ln in enumerate(lines):
        f = big if k in (1, 2) else (mid if k in (0, 3) else small)
        w = dr.textlength(ln, font=f)
        x = (W - w) / 2 if k <= 4 else 30
        dr.text((x, yy), ln, fill="black", font=f); yy += 50 if f is not small else 42
    im.save(path)

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--products", default=os.path.join(HERE, "..", "..", "api", "src", "products"))
    ap.add_argument("--font", default="")
    a = ap.parse_args()
    clauses_file = os.path.join(HERE, "clauses.json")
    if os.path.exists(os.path.join(a.products, "renters.json")):
        snap = {}
        for p in ("renters", "pet"):
            d = json.load(open(os.path.join(a.products, f"{p}.json"), encoding="utf8"))
            snap[p] = {"name": d["name"], "clauses": [{"id": c["id"], "kind": c["kind"], "zh": c["zh"]} for c in d["clauses"]]}
        json.dump(snap, open(clauses_file, "w", encoding="utf8"), ensure_ascii=False, indent=1)
    snap = json.load(open(clauses_file, encoding="utf8"))
    qs = json.load(open(os.path.join(HERE, "qa_questions.json"), encoding="utf8"))
    with open(os.path.join(HERE, "qa_cases.jsonl"), "w", encoding="utf8") as f:
        for q in qs:
            ids = {c["id"] for c in snap[q["product"]]["clauses"]}
            assert all(c in ids for c in q["clause"]), q
            f.write(json.dumps(q, ensure_ascii=False) + "\n")
    ex = extract_cases()
    with open(os.path.join(HERE, "extract_cases.jsonl"), "w", encoding="utf8") as f:
        for c in ex: f.write(json.dumps(c, ensure_ascii=False) + "\n")
    vis = [c for c in ex if c["kind"] == "invoice"][:5]
    with open(os.path.join(HERE, "vision_cases.jsonl"), "w", encoding="utf8") as f:
        for c in vis: f.write(json.dumps({**c, "id": "im" + c["id"][2:], "image": f"images/{c['id']}.png"}, ensure_ascii=False) + "\n")
    if a.font:
        os.makedirs(os.path.join(HERE, "images"), exist_ok=True)
        for c in vis: render(c, os.path.join(HERE, "images", f"{c['id']}.png"), a.font)
    print(len(qs), "qa,", len(ex), "extract,", len(vis), "vision", "(images rendered)" if a.font else "(no --font: images not rendered)")

if __name__ == "__main__":
    main()
