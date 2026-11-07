// Document validation: an invoice, a Texas lien waiver, a building/plumbing permit. Read (Windows OCR, or text given),
// fields pulled by rules, then checks against the job. Fields and checks only: code elsewhere decides what a missing or
// wrong document means for the money (the core's per-milestone required documents).
//
//   validateDocument({ kind?, path?, text?, lines?, job?, expect? }) -> {
//     kind: "invoice" | "lien_waiver" | "permit" | "unknown", kindDetected, fields: {...},
//     checks: [{ id, ok: true|false|null, say }], verdict: "pass" | "needs_fix" | "fail", label, confidence,
//     by: "rules" (who decided), readBy: "windows-ocr (...)" | "given text" | "given lines" | why nothing was read, ms }
//   job:    { address: { zip, line? }, window: { from, to }, scope: { trade, template } }
//   expect: { amount (cents), vendor, claimant, owner, stage: "progress"|"final", paid: boolean, permitType }
// A missing field -> needs_fix (send a clearer or complete document); a field that contradicts the job (amount,
// address, wrong waiver type, permit for another trade) -> fail (a person looks).
import fs from "node:fs";
import { images, tidy, usDate } from "./ocr.js";
import crypto from "node:crypto";
import { CHECK_LABEL } from "./check/attest.js";
import { photoRows, rememberDocument } from "./check/history.js";

const MONEY = /\$\s?(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{2}))?/g;
const cents = (m) => Math.round(+`${m[1].replace(/,/g, "")}.${m[2] || "00"}` * 100);
const amountsIn = (s) => [...String(s).matchAll(MONEY)].map(cents);
const dateIn = (s) => { const m = String(s).match(/(?<!\d)(\d{1,2})\/(\d{1,2})\/(\d{4})(?!\d)/) || null; if (m) { const u = usDate(m[1], m[2], m[3]); if (u) return u; } const n = String(s).match(/(20\d{2})-(\d{2})-(\d{2})/); return n ? n[0] : null; };
const after = (L, re, n = 60) => { for (let i = 0; i < L.length; i++) { const m = L[i].match(re); if (m) { const rest = L[i].slice(m.index + m[0].length).replace(/^[\s:#.-]+/, "").trim(); return (rest || L[i + 1] || "").slice(0, n).trim() || null; } } return null; };
const has = (T, re) => re.test(T);

// Austin/Texas permit numbers: "BP-2026-004512", "2026-004512 PR", "2026-123456 PP", "PP-2026-0001", "Permit #12345"
export const PERMIT_NUMBER = /\b(?:[A-Z]{1,3}[- ])?20\d{2}[- ]\d{3,7}(?:[- ]?[A-Z]{1,3})?\b|\b[A-Z]{1,3}-\d{5,8}\b/;
export function permitNumberIn(T) {
  const s = String(T || "");
  const m = s.match(/\bpermit\s*(?:#|no\.?|number)?\s*[:#]?\s*([A-Z0-9][A-Z0-9 -]{2,24}\d(?:[ -]?[A-Z]{1,3}\b)?)/i);
  if (m && /\d{3,}/.test(m[1])) return m[1].trim();
  const n = s.match(PERMIT_NUMBER);
  return n ? n[0].trim() : null;
}

export function detectKind(T) {
  if (/WAIVER\s+AND\s+RELEASE/i.test(T)) return "lien_waiver";
  if (/\bPERMIT\b/i.test(T) && /(PERMIT\s*(#|NO|NUMBER)|ISSUED|INSPECTION)/i.test(T)) return "permit";
  if (/\bINVOICE\b/i.test(T)) return "invoice";
  return "unknown";
}

export function parseDocument(lines, kind) {
  // the OCR reads a capital I at a word's start as l ("lnvoice", "lssued")
  const L = (lines || []).map((l) => tidy(String(l)).replace(/\b[l1](nvoice|ssued|ssue|ssuance)/gi, "I$1")).filter(Boolean), T = L.join("\n");
  const k = kind || detectKind(T);
  const f = { zip: (T.match(/\b(7\d{4})\b/) || [])[1] || null };
  if (k === "invoice") {
    f.vendor = L[0] || null;
    f.number = after(L, /\bINVOICE\s*(#|NO\.?|NUMBER)/i, 30);
    f.date = dateIn(after(L, /\b(INVOICE\s+)?DATE\b/i, 30) || T);
    const tot = L.filter((l) => /^(TOTAL|AMOUNT DUE|BALANCE DUE|TOTAL DUE)\b/i.test(l)).map(amountsIn).flat();
    f.total = tot.length ? tot[tot.length - 1] : null;
    f.billTo = after(L, /\bBILL\s*TO\b/i);
    f.items = L.filter((l) => amountsIn(l).length && !/^(SUB ?TOTAL|TOTAL|TAX|AMOUNT|BALANCE)/i.test(l)).map((l) => l.replace(MONEY, "").trim()).filter((x) => /[a-z]{3}/i.test(x)).slice(0, 12);
  } else if (k === "lien_waiver") {
    const title = L.find((l) => /WAIVER\s+AND\s+RELEASE/i.test(l)) || "";
    f.title = title;
    f.conditional = /UNCONDITIONAL/i.test(title) ? false : /CONDITIONAL/i.test(title) ? true : null;
    f.payment = /FINAL/i.test(title) ? "final" : /PROGRESS/i.test(title) ? "progress" : null;
    f.project = after(L, /\bPROJECT\b/i);
    f.location = after(L, /\bJOB\s+LOCATION\b/i);
    f.owner = after(L, /\bOWNER\b/i);
    f.claimant = after(L, /\bCLAIMANT\b/i);
    f.customer = after(L, /\bCUSTOMER\b/i);
    const amts = amountsIn(T); f.amount = amts.length ? Math.max(...amts) : null;
    f.throughDate = dateIn(after(L, /\bTHROUGH\b/i, 40) || "") || null;
    f.signed = has(T, /\bSIGNATURE\b/i) && has(T, /\/s\/|SIGNED|X\s*_+|\bBY:\s*\w/i);
    f.signedDate = dateIn(after(L, /\bDATE\b/i, 30) || "");
  } else if (k === "permit") {
    f.jurisdiction = (T.match(/CITY OF [A-Z ]+?(?=\n|$|DEVELOPMENT|PERMIT)/i) || [null])[0]?.trim() || null;
    f.number = after(L, /\bPERMIT\s*(#|NO\.?|NUMBER)/i, 30) || permitNumberIn(T);
    if (!f.number) {
      // a sticker in a big mono font comes back spaced out ("P E RM Ⅰ T B P - 292 6 - 994 512"): close the gaps; a year
      // read as 29xx is 20xx (a dotted zero read as 9); other digits stay as read and are marked unclear
      for (const l of L) {
        const sq = l.replace(/[ⅠІ|]/g, "I").replace(/\s+/g, "");
        const m = sq.match(/PERM[I1l]T#?:?([A-Z]{1,3})-?(\d{4})-?(\d{4,7})([A-Z]{0,3})/i);
        if (m) { const y = m[2].replace(/^29/, "20"); f.number = `${m[1].toUpperCase()}-${y}-${m[3]}${m[4] ? ` ${m[4].toUpperCase()}` : ""}`; f.numberUnclear = y !== m[2] || /9{2}/.test(m[3]); break; }
      }
    }
    f.type = (T.match(/\b(PLUMBING|ELECTRICAL|MECHANICAL|BUILDING|GAS|WATER HEATER)\b/i) || [null])[0]?.toLowerCase() || null;
    f.address = after(L, /\b(SITE(\s+ADDRESS)?|ADDRESS|LOCATION)\b\s*:/i);
    f.issued = dateIn(after(L, /(^|\s)[Il1]?SSUED\b/i, 30) || "");
    f.status = (T.match(/\bSTATUS\b[^A-Za-z]{0,4}([A-Za-z ]{3,30})/i) || [])[1]?.trim().toLowerCase() || null;
    f.contractor = after(L, /\bCONTRACTOR\b/i);
    f.licence = (T.match(/\b(?:LICEN[CS]E|LIC\.?)\s*(?:#|NO\.?)?\s*([A-Z]{0,3}-?\d{4,8})/i) || [])[1] || null;
  }
  return { kind: k, fields: f, text: T };
}

const zipOk = (f, job) => (job?.address?.zip && f.zip ? f.zip === String(job.address.zip) : null);
const inWindow = (d, job, slackDays = 2) => { if (!d || !job?.window) return null; const t = Date.parse(`${d}T12:00:00Z`); return t <= Date.parse(job.window.to) + slackDays * 864e5; };
const near = (a, b) => (a == null || b == null ? null : Math.abs(a - b) <= Math.max(100, b * 0.01));
const nameMatch = (a, b) => (!a || !b ? null : String(a).toUpperCase().replace(/[^A-Z0-9]/g, "").includes(String(b).toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8)));

export function checksFor(kind, f, job, expect = {}) {
  const c = [], add = (id, ok, say) => c.push({ id, ok, say });
  if (kind === "invoice") {
    add("number", f.number ? true : false, f.number ? `invoice ${f.number}` : "no invoice number");
    add("date", f.date ? true : false, f.date ? `dated ${f.date}` : "no date");
    add("total", f.total != null ? true : false, f.total != null ? `total $${(f.total / 100).toFixed(2)}` : "no total");
    if (expect.amount != null) add("total_matches", near(f.total, expect.amount), `invoice total ${f.total != null ? `$${(f.total / 100).toFixed(2)}` : "?"} vs agreed $${(expect.amount / 100).toFixed(2)}`);
    if (expect.vendor) add("vendor_matches", nameMatch(f.vendor, expect.vendor), `from ${f.vendor || "?"}, expected ${expect.vendor}`);
    add("address_matches", zipOk(f, job), `ZIP ${f.zip || "?"} vs job ${job?.address?.zip || "?"}`);
    add("date_in_window", inWindow(f.date, job), `invoice date ${f.date || "?"} vs job window`);
  } else if (kind === "lien_waiver") {
    add("statutory_form", f.conditional != null && f.payment != null, f.title ? `form: ${f.title}` : "not one of the four Texas statutory waiver forms (Property Code §53.284)");
    if (expect.paid != null) add("type_fits", f.conditional == null ? null : expect.paid ? true : f.conditional === true, expect.paid ? "payment made: conditional or unconditional both fit" : "before payment the waiver must be CONDITIONAL (an unconditional one waives rights before the money arrives)");
    if (expect.stage) add("payment_stage", f.payment == null ? null : f.payment === expect.stage, `waiver is for ${f.payment || "?"} payment, milestone is ${expect.stage}`);
    add("claimant", f.claimant ? true : false, f.claimant ? `claimant ${f.claimant}` : "no claimant");
    if (expect.claimant) add("claimant_matches", nameMatch(f.claimant, expect.claimant), `claimant ${f.claimant || "?"} vs pro ${expect.claimant}`);
    if (expect.amount != null) add("amount_matches", near(f.amount, expect.amount), `waiver amount ${f.amount != null ? `$${(f.amount / 100).toFixed(2)}` : "?"} vs payment $${(expect.amount / 100).toFixed(2)}`);
    add("location_matches", zipOk(f, job), `job location ZIP ${f.zip || "?"} vs job ${job?.address?.zip || "?"}`);
    add("signed", f.signed ? true : false, f.signed ? "signed" : "no signature");
  } else if (kind === "permit") {
    // needed: a number, an issue date, and the site (address or ZIP) matching the job. The city, the type and the status
    // are checked when printed and don't block when they aren't.
    add("number", f.number ? true : false, f.number ? `permit ${f.number}` : "no permit number found");
    add("issued", f.issued ? true : false, f.issued ? `issued ${f.issued}` : "no issue date found");
    const zm = zipOk(f, job), noSite = !f.zip && !f.address;
    add("address_matches", noSite ? false : zm !== false, noSite ? "no site address found" : zm === false ? `the site ZIP ${f.zip} isn't the job's ${job?.address?.zip}` : `site ${f.address || `ZIP ${f.zip}`}`);
    add("jurisdiction", f.jurisdiction ? true : null, f.jurisdiction || "no issuing city printed (not required)");
    const want = expect.permitType || (job?.scope?.trade === "plumbing" ? "plumbing" : null);
    if (want) add("type_fits", f.type == null ? null : f.type === want || (want === "plumbing" && f.type === "water heater"), f.type == null ? "no permit type printed (not required)" : `permit type ${f.type}, job needs ${want}`);
    if (f.issued) { const ok = inWindow(f.issued, job, 0); add("issued_in_time", ok, ok === false ? `issued ${f.issued}, after the job window` : `issued ${f.issued}, in time`); }
    if (f.status) add("status_ok", !/(expired|void|revoked|cancel|suspend|denied)/.test(f.status), `status ${f.status}`);
  }
  return c;
}

// ok: true (holds), false (missing or wrong: named in the reason), null (not printed and not required: never blocks).
// A wrong field (an amount, an address, a waiver type) is a fail; a missing one ("... found") is needs_fix.
const MISMATCH = new Set(["total_matches", "vendor_matches", "address_matches", "date_in_window", "type_fits", "payment_stage", "claimant_matches", "amount_matches", "location_matches", "issued_in_time", "status_ok"]);
export function verdictOf(checks) {
  if (checks.some((c) => c.ok === false && MISMATCH.has(c.id) && !/found$/.test(c.say))) return "fail";
  if (checks.some((c) => c.ok === false)) return "needs_fix";
  return "pass";
}
// the reason always matches the verdict: what failed, or what was found
export function reasonOf(kind, checks, verdict) {
  const name = String(kind || "document").replace("_", " ");
  if (verdict === "pass") return `The ${name} checks out: ${checks.filter((c) => c.ok === true).map((c) => c.say).join("; ")}.`;
  return `The ${name} ${verdict === "fail" ? "doesn't match the job" : "is incomplete"}: ${checks.filter((c) => c.ok === false).map((c) => c.say).join("; ") || "unreadable"}.`;
}

export async function validateDocument({ kind, path, text, lines, job, expect, evidenceId } = {}) {
  const t0 = Date.now();
  // by: who decided (always the rules here: docs.js has no model yet) and who read the text (readBy)
  let L = lines, readBy = lines ? "given lines" : "given text";
  if (!L && text) L = String(text).split(/\r?\n/);
  if (!L && path) {
    const isPdf = /\.pdf$/i.test(path) || (() => { try { return fs.readFileSync(path).subarray(0, 4).toString() === "%PDF"; } catch { return false; } })();
    const o = isPdf ? { error: "a PDF: the OCR reads images only (send a photo or scan as JPEG/PNG, or the text)" } : (await images([{ path, ocr: true }])).get(path);
    if (!o?.lines?.length) {
      const why = o?.error || "no text found";
      return { kind: kind || "unknown", kindDetected: "unknown", error: why, verdict: "needs_fix", label: CHECK_LABEL.needs_fix, reason: `The ${String(kind || "document").replace("_", " ")} could not be read: ${why}.`, checks: [{ id: "readable", ok: false, say: `the document could not be read: ${why}` }], fields: {}, confidence: 0, by: "rules", readBy: isPdf ? "none (PDF)" : `windows-ocr: ${why}`, ms: Date.now() - t0 };
    }
    L = o.lines; readBy = o.ocrBy || `windows-ocr${o.lang ? ` (${o.lang})` : ""}`;
  }
  const p = parseDocument(L || [], kind), detected = detectKind(p.text);
  const k = kind || p.kind;
  const checks = checksFor(k, p.fields, job, expect || {});
  // the same document already sent with another job: the same file, or the same kind and number (an invoice or permit
  // number belongs to one job), unless the caller says not to look (history: false)
  let sha = null;
  try { if (path) sha = crypto.createHash("sha256").update(fs.readFileSync(path)).digest("hex"); } catch {}
  if (job?.id) {
    const num = String(p.fields.number || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
    const hit = photoRows().find((h) => h.jobId !== job.id && ((sha && h.sha === sha) || (h.kind === "document" && h.docKind === k && num.length >= 4 && h.number === num)));
    if (hit) checks.unshift({ id: "reused", ok: false, say: `this ${k.replace("_", " ")} was already used on another job (${hit.jobId})${sha && hit.sha === sha ? "" : `: same number ${p.fields.number}`}` });
    if (!hit) rememberDocument(job.id, { evidenceId: evidenceId || null, sha, docKind: k, number: num || null });   // a reused one isn't the new job's
  }
  if (kind && detected !== "unknown" && detected !== kind) checks.unshift({ id: "kind", ok: false, say: `this looks like a ${detected.replace("_", " ")}, not a ${kind.replace("_", " ")}` });
  const verdict = k === "unknown" ? "needs_fix" : verdictOf(checks);
  const known = checks.filter((c) => c.ok !== null).length;
  return { kind: k, kindDetected: detected, fields: p.fields, checks, verdict, reason: reasonOf(k, checks, verdict), label: CHECK_LABEL[verdict], confidence: +(checks.length ? known / checks.length : 0).toFixed(2), by: "rules", readBy, ms: Date.now() - t0 };
}
