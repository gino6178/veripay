// Done-OCR: a US parts receipt's (or a plate's, a permit's) text, then its fields by rules.
//
//   images(list)       [{ path, ocr, thumb? }] -> Map(path -> { dhash, dhashBy, w, h, lines, ocrBy, lang, error, thumbJpeg? })
//     dHash: plain JavaScript on any host (imagehash.js); the Windows helper only for JPEGs the JS decoder can't read.
//     OCR, the first that's available (each result says which ran, in ocrBy):
//       "done-ocr"     our own Done-OCR model served over HTTP (DONE_OCR_URL: POST {url}/read { image: base64, kind }
//                      -> { lines: [string], fields?, confidence?, version? }; the Cover-OCR worker contract), any host
//       "windows-ocr"  the OCR engine built into Windows (Windows.Media.Ocr) through ocr-win.ps1, CPU, nothing to install
//       none           { error }: the reader then tries a vision model, then the total the pro typed (reader.js)
//     thumb: a smaller JPEG (longest side in px) for a vision model, Windows only.
//   parseReceipt(text) the receipt's fields by rules (ported from Cover's ml/ocr/parse.py, the US rules), tolerant of
//                      the OCR's habit of spacing out digits ("2 5 . 93") and splitting columns into separate lines.
//   DONE_OCR = "auto" (default) | "done-ocr" | "windows" | "off";  DONE_IMAGE_HELPER=off turns the Windows helper off
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { dhashOf } from "./imagehash.js";
import { serverDown, noteDown, modelHeaders } from "./llm.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const winHelper = () => process.platform === "win32" && (process.env.DONE_IMAGE_HELPER || "").toLowerCase() !== "off";
export const doneOcrUrl = () => (process.env.DONE_OCR_URL || "").replace(/\/$/, "") || null;
// which OCR runs: "done-ocr", "windows" or "off"
export const ocrMode = () => {
  const m = (process.env.DONE_OCR || "auto").toLowerCase();
  if (m === "off") return "off";
  if ((m === "auto" || m === "done-ocr") && doneOcrUrl()) return "done-ocr";
  if ((m === "auto" || m === "windows") && winHelper()) return "windows";
  return "off";
};

// results by file (path, size, mtime) and what was asked: the same evidence is not run twice
const cache = new Map();
const keyOf = (x, ocr) => { const st = fs.statSync(x.path); return `${path.resolve(x.path)}|${st.size}|${st.mtimeMs}|${ocr || 0}${ocr === "done-ocr" ? `@${doneOcrUrl()}` : ""}|${x.thumb || 0}`; };

async function ocrReachable() {
  const u = doneOcrUrl();
  if (serverDown(u)) return false;
  try { await fetch(`${u}/api/version`, { headers: modelHeaders(), signal: AbortSignal.timeout(1500) }); return true; } catch (e) { noteDown(u, e); if (e?.name === "TimeoutError") return false; return !serverDown(u); }
}
async function doneOcr(p, timeoutMs) {
  const t0 = Date.now();
  if (serverDown(doneOcrUrl())) return { error: "done-ocr: the server refused the connection just now" };
  try {
    const r = await fetch(`${doneOcrUrl()}/read`, { method: "POST", headers: modelHeaders({ "Content-Type": "application/json" }), body: JSON.stringify({ image: fs.readFileSync(p).toString("base64") }), signal: AbortSignal.timeout(timeoutMs) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j.error) return { error: `done-ocr: ${j.error || `HTTP ${r.status}`}` };
    const lines = Array.isArray(j.lines) ? j.lines.map((l) => String(typeof l === "string" ? l : l?.text ?? "")).filter(Boolean) : String(j.fields?.text || j.text || "").split(/\r?\n/).filter(Boolean);
    return lines.length ? { lines, ocrBy: `done-ocr${j.version ? ` (${j.version})` : ""}`, ocrConfidence: j.confidence ?? null, ocrMs: Date.now() - t0 } : { error: "done-ocr: no text" };
  } catch (e) { noteDown(doneOcrUrl(), e); return { error: `done-ocr: ${e?.name === "TimeoutError" ? `no answer in ${timeoutMs} ms` : String(e.message || e).slice(0, 100)}` }; }
}

export async function images(list, { timeoutMs = +(process.env.DONE_OCR_TIMEOUT_MS || 30e3), mode: forced } = {}) {
  const out = new Map();
  let mode = forced || ocrMode();
  // Done-OCR not running (refused just now, or no answer to a quick knock): Windows' own OCR reads the receipt instead
  if (!forced && mode === "done-ocr" && winHelper() && list.some((x) => x?.ocr) && !(await ocrReachable())) mode = "windows";
  for (const x of list) if (x?.path && !fs.existsSync(x.path)) out.set(x.path, { error: "file not found" });
  let todo = list.filter((x) => x?.path && fs.existsSync(x.path));
  todo = todo.filter((x) => { const hit = cache.get(keyOf(x, x.ocr && mode)); if (hit) out.set(x.path, hit); return !hit; });
  const helper = [];
  for (const x of todo) {
    const h = dhashOf(fs.readFileSync(x.path)), r = { dhash: h.dhash || null, dhashBy: h.dhash ? h.by : null, w: h.w ?? null, h: h.h ?? null, lines: null, error: null };
    if (x.ocr && mode === "done-ocr") { const o = await doneOcr(x.path, timeoutMs); if (o.error) r.error = o.error; else Object.assign(r, o); }
    else if (x.ocr && mode === "off") r.error = "no OCR on this host (set DONE_OCR_URL for Done-OCR; Windows has a built-in one)";
    out.set(x.path, r);
    // the Windows helper: OCR in windows mode, a dHash the JS decoder couldn't make, a thumbnail
    if (winHelper() && ((x.ocr && mode === "windows") || !r.dhash || x.thumb)) helper.push(x);
    else if (!r.error || x.ocr) cache.set(keyOf(x, x.ocr && mode), r);
    if (!r.dhash && !winHelper() && !r.error) r.error = `dHash: ${h.error}`;
  }
  if (!helper.length) return out;
  const tmp = path.join(os.tmpdir(), `done-ocr-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
  fs.writeFileSync(tmp, JSON.stringify(helper.map((x) => ({ path: path.resolve(x.path), ocr: !!x.ocr && mode === "windows", thumb: x.thumb || 0 }))));
  try {
    const t0 = Date.now();
    const raw = await run("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", path.join(HERE, "ocr-win.ps1"), "-List", tmp], timeoutMs);
    const j = JSON.parse(raw.slice(raw.indexOf("{")));
    const items = Array.isArray(j.items) ? j.items : [j.items];
    const ms = Date.now() - t0;
    // each result is matched to its file by path (the helper echoes it), never by position alone: a result for one
    // photo must not become another photo's thumbnail or hash
    const norm = (q) => path.resolve(String(q || "")).toLowerCase();
    helper.forEach((x, i) => {
      const it = items.find((y) => y && norm(y.path) === norm(x.path)) || (items[i] && norm(items[i].path) === norm(x.path) ? items[i] : null) || { error: "image helper gave no result for this file" }, r = out.get(x.path);
      const lines = it.lines == null ? null : (Array.isArray(it.lines) ? it.lines : [it.lines]).map(String);
      let thumbJpeg = null;
      if (it.thumb) { try { thumbJpeg = fs.readFileSync(it.thumb); fs.rmSync(it.thumb, { force: true }); } catch {} }
      if (!r.dhash && it.dhash) { r.dhash = it.dhash; r.dhashBy = "windows"; r.w = it.w ?? r.w; r.h = it.h ?? r.h; }
      if (x.ocr && mode === "windows") { r.lines = lines; r.ocrBy = `windows-ocr${j.lang ? ` (${j.lang})` : ""}`; r.lang = j.lang || null; }
      r.error = it.error || null; r.batchMs = ms;
      if (thumbJpeg) r.thumbJpeg = thumbJpeg;
      if (!r.error) cache.set(keyOf(x, x.ocr && mode), r);
    });
  } catch (e) {
    for (const x of helper) { const r = out.get(x.path); r.error = `image helper: ${String(e.message || e).slice(0, 120)}`; }
  } finally { fs.rmSync(tmp, { force: true }); }
  return out;
}

function run(cmd, args, timeoutMs) {
  return new Promise((ok, no) => {
    const p = spawn(cmd, args, { windowsHide: true });
    let so = "", se = "";
    const t = setTimeout(() => { p.kill(); no(new Error(`timed out after ${timeoutMs} ms`)); }, timeoutMs);
    p.stdout.on("data", (d) => { so += d; });
    p.stderr.on("data", (d) => { se += d; });
    p.on("error", (e) => { clearTimeout(t); no(e); });
    p.on("close", (code) => { clearTimeout(t); if (code === 0 && so.includes("{")) ok(so); else no(new Error(se.trim().split("\n")[0] || `exit ${code}`)); });
  });
}

// ---- the receipt's fields by rules -----------------------------------------------------------------------------------
// OCR spacing: "$ 18 . 97" -> "$18.97", "11 / 0 4 / 2 0 2 6" -> "11/04/2026", "1 .98" -> "1.98"; the zh-Hant recogniser
// (the only one installed on the demo machine) reads some decimal points as a middle dot.
export function tidy(line) {
  let s = String(line || "").replace(/[·•・‧．]/g, ".").replace(/[ØøΘθ]/g, "0").replace(/\s+/g, " ").trim();
  s = s.replace(/\$ (?=\d)/g, "$");
  for (let k = 0; k < 3; k++) s = s.replace(/(\d) ?([./:]) ?(\d)/g, "$1$2$3");
  // a run of single digits that ends at a separator is one number spaced out by the OCR: "2 0 2 6" in a date, "2 5.93"
  s = s.replace(/(?<![\d.])((?:\d ){1,5}\d)(?=[./]\d)/g, (m) => m.replace(/ /g, ""));
  for (let k = 0; k < 3; k++) s = s.replace(/([./:]\d+) (\d)(?=$|[^\d])/g, (m, a, b) => (/[.]\d$/.test(a) || /[/:]\d$/.test(a) ? a + b : m));
  // ".00" read as " 0" or " 00" ("$225.00" -> "$ 225 0"): whole dollars
  s = s.replace(/\$(\d{1,6}) (0{1,2})(?![\d.,])/g, "$$$1.00");
  // US receipts always print cents: "$87 , 43" is $87.43, and a $-amount whose point was dropped ("$6975") is $69.75
  s = s.replace(/\$(\d{1,4}) ?, ?(\d{2})(?![\d,])/g, "$$$1.$2").replace(/\$(\d{3,6})(?![\d.,])/g, (m, d) => `$${d.slice(0, -2)}.${d.slice(-2)}`);
  // a price on its own line, its point read as a comma: "28 , 97" is 28.97
  s = s.replace(/^(\d{1,4}) ?, ?(\d{2})$/, "$1.$2");
  // dates: "1 1/04/2026" -> "11/04/2026", "11/04/202 6" -> "11/04/2026"
  s = s.replace(/(?<!\d)(\d) (\d)(?=\/\d{1,2}\/\d{2,4})/g, "$1$2").replace(/(\d{1,2}\/\d{1,2}\/)((?:\d ?){3}\d)(?!\d)/g, (m, a, y) => a + y.replace(/ /g, ""));
  return s;
}
const MONEY = /\$?(\d{1,3}(?:,\d{3})+|\d+)\.(\d{2})(?!\d)/g;
const amounts = (s) => [...String(s).matchAll(MONEY)].map((m) => Math.round(+(m[1].replace(/,/g, "") + "." + m[2]) * 100));
const TOTAL = /^(grand )?t ?o ?t ?a ?l\b(?! ?(items|qty|savings|discount))|^(total due|balance due|amount due|amount paid)\b/i;
const SUB = /^s ?u ?b ?-? ?total\b/i, TAX = /^(sales )?t ?a ?x\b/i;
const HEADER = /^(register|reg\b|receipt\b|store #|store no|tel\b|phone|cashier|trans|www\.|http)/i;
// the store's address, phone and demo footer, which OCR can read in among the items when it reads the page in columns
const ADDRESS = /^\d{2,6} ([NSEW] )?[a-z0-9 .'-]+ (st|street|ln|lane|ave|avenue|rd|road|blvd|dr|drive|hwy|pkwy|way|ct|pl)\b|\b[A-Z]{2} \d{5}(-\d{4})?\b|\b\d{3} ?[-一—] ?\d{3} ?[-一—] ?\d{4}\b|not a real purchase/i;
const NOT_ITEM = /^(change|cash|visa|mastercard|amex|discover|debit|credit|card|tender|balance|amount|auth|approval|ref|thank|items? sold|you saved|savings|qty\b)/i;
// an amount on a line of its own (OCR reads a right-aligned price column as separate lines): "$44.87", "$ 4t45"
const AMOUNT_ONLY = /^\$?\s?[\d][\d.,\st]*$|^\$\S{0,8}$/;

// a line with words (OCR sometimes spaces letters apart: "AU S T I N P L U M B I NG")
const wordy = (l) => /[a-z]{3}/i.test(String(l).replace(/\s+/g, ""));
// one amount read as another by a single-digit misread (0/9, 3/8, 1/7, 5/6 ...): same digits but one
export function oneDigitApart(a, b) {
  const x = String(a), y = String(b);
  return x.length === y.length && x !== y && [...x].filter((c, i) => c !== y[i]).length === 1;
}

// a US date "MM/DD/YYYY" from a line. Fonts with a dotted or slashed zero make the OCR read 0 as 9 ("01" as "91"): a
// month or day that's impossible as read but valid with its 9 read as 0 is taken that way.
export function usDate(mm, dd, yy) {
  let y = +yy; if (y < 100) y += 2000;
  const ok = (mo, d) => mo >= 1 && mo <= 12 && d >= 1 && d <= 31;
  const unNine = (x) => String(x).replace(/^9/, "0");
  for (const [mo, d] of [[mm, dd], [unNine(mm), dd], [mm, unNine(dd)], [unNine(mm), unNine(dd)]]) if (ok(+mo, +d)) return `${y}-${String(+mo).padStart(2, "0")}-${String(+d).padStart(2, "0")}`;
  return null;
}
function dateOf(l) {
  let m = l.match(/(?<!\d)(\d{1,2})\/(\d{1,2})\/(\d{4}|\d{2})(?!\d)/);
  if (m) { const d = usDate(m[1], m[2], m[3]); if (d) return d; }
  m = l.match(/(?<!\d)(20\d{2})-(\d{2})-(\d{2})(?!\d)/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

export function parseReceipt(text) {
  const L = String(text || "").split(/\r?\n/).map(tidy).filter(Boolean);
  const f = { store: null, date: null, items: [], subtotal: null, tax: null, total: null, currency: null, totalFrom: null };
  const di = L.findIndex((l) => dateOf(l));
  if (di >= 0) f.date = dateOf(L[di]);
  f.store = L.find((l) => wordy(l) && !/^\d/.test(l) && !AMOUNT_ONLY.test(l) && !HEADER.test(l) && !dateOf(l) && !SUB.test(l) && !TAX.test(l) && !TOTAL.test(l)) || null;
  // the body starts after the header (store, address, date, register lines) and ends at the total
  let b = 0;
  if (di >= 0) { b = di + 1; while (b < L.length && HEADER.test(L[b])) b++; }
  else { const si = L.indexOf(f.store); b = si + 1; while (b < L.length && (/\b(tx|blvd|st|ave|rd|austin|\d{5})\b/i.test(L[b]) || HEADER.test(L[b])) && !AMOUNT_ONLY.test(L[b])) b++; }
  const body = L.slice(b);
  const ti = body.findIndex((l) => TOTAL.test(l));
  const labels = [], loose = [];
  body.forEach((l, i) => {
    if (AMOUNT_ONLY.test(l)) { loose.push({ i, v: amounts(l).pop() ?? null }); return; }
    if (ti >= 0 && i > ti) return;                       // after the total: payment lines, notes (and any "note to AI")
    if (NOT_ITEM.test(l) || l === f.store || ADDRESS.test(l)) return;
    const own = amounts(l.replace(/\d+(\.\d+)?\s?%/, "")); // "TAX 8.25% $3.42": the rate is not the tax
    labels.push({ l, v: own.length ? own[own.length - 1] : null });
  });
  // a price column read apart from its labels: pair the labels that have no amount with the loose amounts, in order
  // (from the end when the counts differ, so the total keeps the last amount)
  const bare = labels.filter((x) => x.v == null);
  if (bare.length && loose.length) {
    const n = Math.min(bare.length, loose.length);
    const bs = bare.length === loose.length ? bare : bare.slice(-n), ls = bare.length === loose.length ? loose : loose.slice(-n);
    bs.forEach((x, k) => { x.v = ls[k].v; x.paired = true; });
  }
  for (const x of labels) {
    if (SUB.test(x.l)) f.subtotal = x.v;
    else if (TAX.test(x.l)) f.tax = x.v;
    else if (TOTAL.test(x.l)) { if (x.v != null) { f.total = x.v; f.totalFrom = x.paired ? "total line (column)" : "total line"; } }
    else if (x.v != null && wordy(x.l)) f.items.push(x.l.split(/\s+\d+\s*@|\s+\$?\d[\d,]*\.\d{2}|\s+x\d+\b/i)[0].trim().slice(0, 80));
  }
  // when the labelled amounts don't add up (a price column paired out of step, a misread line), look for the three
  // amounts that do: subtotal + tax = total, with the tax at most 12% of the subtotal (US sales tax tops out near 10%)
  const adds = (x) => x.subtotal != null && x.tax != null && x.total != null && Math.abs(x.subtotal + x.tax - x.total) <= 1;
  if (!adds(f)) {
    const vals = [...labels.map((x) => x.v), ...loose.map((x) => x.v)].filter((v) => v != null && v > 0);
    let best = null;
    // when the receipt prints its rate ("TAX 8.25%"), the tax must be that rate of the subtotal (two items can add up
    // to a subtotal by the same arithmetic; the rate tells them apart)
    const rateLine = L.find((l) => TAX.test(l) && /\d+(\.\d+)?\s?%/.test(l)), rate = rateLine ? +rateLine.match(/(\d+(?:\.\d+)?)\s?%/)[1] / 100 : null;
    const fits = (st, tx) => (rate != null && rate > 0 && rate < 0.15 ? Math.abs(tx - Math.round(st * rate)) <= 2 : tx <= st * 0.12);
    for (const t of vals) for (const st of vals) for (const tx of vals) if (st > 0 && tx > 0 && fits(st, tx) && Math.abs(st + tx - t) <= 1 && (!best || t > best.t)) best = { t, st, tx };
    if (best) { f.total = best.t; f.subtotal = best.st; f.tax = best.tx; f.totalFrom = "arithmetic (subtotal + tax = total)"; }
  }
  if (f.total == null && f.subtotal != null && f.tax != null) { f.total = f.subtotal + f.tax; f.totalFrom = "subtotal + tax"; }
  if (f.total == null) { const all = L.flatMap((l) => amounts(l.replace(/\d+(\.\d+)?\s?%/, ""))); if (all.length) { f.total = Math.max(...all); f.totalFrom = "largest amount"; } }
  if (f.total != null) f.currency = "USD";
  const itemVals = labels.filter((x) => x.v != null && wordy(x.l) && !SUB.test(x.l) && !TAX.test(x.l) && !TOTAL.test(x.l)).map((x) => x.v);
  const itemsSum = itemVals.length ? itemVals.reduce((s, v) => s + v, 0) : null;
  // a misread subtotal ("$ 4t45") is recovered when the items and the tax add up to the total
  if (f.subtotal == null && itemsSum != null && f.tax != null && f.total != null && Math.abs(itemsSum + f.tax - f.total) <= 1) { f.subtotal = itemsSum; f.subtotalFrom = "sum of items"; }
  // the total line against the arithmetic: when a read total disagrees with subtotal + tax, which do we believe?
  // Fonts with a dotted or slashed zero make the OCR read 0 as 9 ("$47.05" -> "$47.95"). If the items add up to the
  // subtotal (a second, independent confirmation) and the read total is one digit away from subtotal + tax, the total
  // line was misread: use subtotal + tax. Any other disagreement keeps the read total at a confidence a person checks.
  if (f.totalFrom && f.totalFrom.startsWith("total line") && f.subtotal != null && f.tax != null && f.total != null && Math.abs(f.subtotal + f.tax - f.total) > 1) {
    const computed = f.subtotal + f.tax;
    f.totalRead = f.total;
    if (itemsSum === f.subtotal && oneDigitApart(f.total, computed)) { f.total = computed; f.totalFrom = "items + tax (total line misread)"; }
    else f.totalConflict = `total line reads ${(f.total / 100).toFixed(2)}, subtotal + tax is ${(computed / 100).toFixed(2)}`;
  }
  const sums = f.subtotal != null && f.tax != null && f.total != null && Math.abs(f.subtotal + f.tax - f.total) <= 1;
  f.checksum = sums ? (itemsSum === f.subtotal ? "items, subtotal, tax and total add up" : "subtotal + tax = total") : "does not add up";
  // a total that nothing else confirms is worth less: a column paired out of step reads an item's price as the total,
  // and a total computed from a subtotal and a tax line ("TAX 8.25" may be the rate) is only as good as those two
  const read = f.totalConflict ? 0.5 : { "items + tax (total line misread)": 0.8, "total line": sums ? 0.95 : 0.75, "total line (column)": sums ? 0.9 : 0.5, "arithmetic (subtotal + tax = total)": 0.8, "subtotal + tax": 0.55, "largest amount": 0.4 }[f.totalFrom] ?? 0.1;
  f.confidence = +Math.max(0.1, Math.min(0.97, read - (f.date ? 0 : 0.1) - (f.store ? 0 : 0.05))).toFixed(2);
  return f;
}
