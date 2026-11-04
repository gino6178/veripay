"""The fields of a document from its lines of text, by rules (the app reader's schema: date, amount, currency, merchant,
taxId, reportNo, items). Used to score Cover-OCR end to end (recognised lines -> fields), and run on the true text it
gives the rules' own ceiling. Cover-1B learns the same mapping (ml/tasks.mjs ocr) for documents the rules don't know.
"""
import re

def _date(t):
    for pat, roc in [(r"(20\d\d)[-/](\d{1,2})[-/](\d{1,2})", False), (r"民國\s*(\d{2,3})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日", True),
                     (r"(?<!\d)(\d{3})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日", True), (r"(?<!\d)(1\d\d)/(\d{1,2})/(\d{1,2})(?!\d)", True), (r"(20\d\d)\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日", False)]:
        m = re.search(pat, t)
        if m:
            y, mo, d = int(m.group(1)), int(m.group(2)), int(m.group(3))
            if roc: y += 1911
            if 1 <= mo <= 12 and 1 <= d <= 31: return f"{y}-{mo:02d}-{d:02d}"
    return None

def _num(s):
    s = s.translate(str.maketrans("０１２３４５６７８９，", "0123456789,"))
    m = re.search(r"\d[\d,]*", s)
    return int(m.group(0).replace(",", "")) if m else None

def _name(line):
    """An item line's name: the text before its quantity or price."""
    return re.split(r"\s+(?:\d|\$|NT)|\s{2,}", line.strip(), maxsplit=1)[0].strip()

def fields(text):
    L = [l.strip() for l in text.split("\n") if l.strip()]
    T = "\n".join(L)
    kind = "invoice" if "電子發票" in T else "police" if re.search(r"受.{0,3}理.*(證明單|紀錄表)", T) else "receipt"
    f = {"date": None, "amount": None, "currency": None, "merchant": None, "taxId": None, "reportNo": None, "items": []}
    for l in L:
        if kind == "invoice" and re.search(r"\d+年\d+-\d+月", l): continue  # the invoice's two-month period, not its date
        d = _date(l)
        if d: f["date"] = d; break
    tot = [l for l in L if re.search(r"合\s*計|總\s*計|總\s*金\s*額", l)]
    if tot: f["amount"] = _num(re.split(r"合\s*計|總\s*金\s*額", tot[-1])[-1]) if re.search(r"合\s*計|總\s*金\s*額", tot[-1]) else _num(re.split(r"總\s*計", tot[-1])[-1])
    if f["amount"] is not None: f["currency"] = "TWD"
    for l in L:
        m = re.search(r"(?:賣方|統一編號|統編|營利事業統一編號)\s*[:：]?\s*(\d{8})", l)
        if m and not re.search(r"(客戶|買方)\s*統一編號\s*[:：]?\s*" + m.group(1), l): f["taxId"] = m.group(1); break
    m = re.search(r"受理編號\s*[:：]\s*(\d+)", T)
    if m: f["reportNo"] = m.group(1)
    if kind == "police":
        m = re.search(r"受理單位\s*[:：]\s*(\S+)", T); f["merchant"] = m.group(1) if m else None
        m = re.search(r"報案人之(.+?)遭竊", T); f["items"] = [m.group(1)] if m else []
    else:
        f["merchant"] = L[0] if L else None
        if kind == "invoice":
            i0 = next((i for i, l in enumerate(L) if "明細" in l), None)
            body = L[i0 + 1:] if i0 is not None else []
        else:
            i0 = next((i for i, l in enumerate(L) if re.match(r"項目", l)), None)
            body = L[i0 + 1:] if i0 is not None else []
        for l in body:
            if re.search(r"合\s*計|統一編號|統編", l): break
            n = _name(l)
            if n: f["items"].append(n)
    return f
