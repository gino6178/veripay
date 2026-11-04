"""The fields of a US document from its lines of text, by rules (the app reader's schema: date, amount, currency,
merchant, taxId, reportNo, items). Used to score Cover-OCR end to end (recognised lines -> fields). Run on the true
text, it gives the rules' own ceiling. Cover-1B learns the same mapping (ml/tasks.mjs ocr) for documents the rules
don't know.
"""
import re

PRICE = r"\$?\d{1,3}(?:,\d{3})*\.\d{2}"

def _date(t):
    m = re.search(r"(?<!\d)(\d{1,2})/(\d{1,2})/(\d{4}|\d{2})(?!\d)", t)
    if not m: return None
    mo, d, y = int(m.group(1)), int(m.group(2)), int(m.group(3))
    if y < 100: y += 2000
    return f"{y}-{mo:02d}-{d:02d}" if 1 <= mo <= 12 and 1 <= d <= 31 else None

def _money(s):
    m = re.findall(PRICE, s)
    return float(m[-1].replace("$", "").replace(",", "")) if m else None

def _name(line):
    """An item line's name: the text before its quantity or price."""
    return re.split(r"\s+\d+\s*@|\s+" + PRICE, line.strip(), maxsplit=1)[0].strip()

TOTAL = r"^(TOTAL|Total Due|Balance Due|Amount Due)\b"

def fields(text):
    L = [l.strip() for l in text.split("\n") if l.strip()]
    T = "\n".join(L)
    kind = "police" if re.search(r"INCIDENT REPORT", T) else "invoice" if re.search(r"^INVOICE$", T, re.M) else "receipt"
    f = {"date": None, "amount": None, "currency": None, "merchant": L[0] if L else None, "taxId": None, "reportNo": None, "items": []}
    for l in L:
        d = _date(l)
        if d: f["date"] = d; break
    m = re.search(r"\bEIN\s*(\d{2}-\d{7})", T)
    if m: f["taxId"] = m.group(1)
    if kind == "police":
        m = re.search(r"Case No[.:]?\s*([\w-]+)", T); f["reportNo"] = m.group(1) if m else None
        m = re.search(r"Property:\s*(.+)", T); f["items"] = [m.group(1).strip()] if m else []
        return f
    tot = [l for l in L if re.match(TOTAL, l)]
    if tot: f["amount"] = _money(tot[-1])
    if f["amount"] is not None: f["currency"] = "USD"
    if kind == "invoice":
        i0 = next((i for i, l in enumerate(L) if l.startswith("Description")), None)
        body = L[i0 + 1:] if i0 is not None else []
    else:
        i0 = next((i for i, l in enumerate(L) if re.match(r"\d{1,2}/\d{1,2}/\d{2,4}", l)), None)
        body = L[i0 + 1:] if i0 is not None else []
    for l in body:
        if re.match(r"(SUBTOTAL|Subtotal|Tax|SALES TAX)\b", l) or re.match(TOTAL, l): break
        n = _name(l)
        if n and re.search(PRICE, l): f["items"].append(n)
    return f
