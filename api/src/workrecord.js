// A pro's portable, verifiable work record (PLAN §16 item 2): every job that passed its checks and was paid, as entries
// that hold no customer personal data (trade, month, conditions passed, an amount band), each signed by the platform
// and tied to the job's signed release receipt in the transparency log by the receipt's hash, its Merkle path and the
// log's inclusion proof. Anyone can check it with the platform's public key (/.well-known/done-receipts.json), without
// trusting the server and without seeing the receipt's contents.
//   entry.body: { type: "DoneWorkRecordEntry", version: 1, pro, trade, month (YYYY-MM, Austin), conditions: { passed,
//     total }, milestones, amountBand: "$100-$250", paidVia: "PayPal capture; the payout to the pro may still be unclaimed", receiptHash, issued }
//   entry.signature: Ed25519 over the canonical JSON of body (merkle.js canonical), base64url
//   entry.log: { receiptId, batch: { id, root, log }, proof (the receipt's Merkle path to the batch root),
//     inclusion: { index, size, proof }, checkpoint } | { pending: true } (receipts are batched every few minutes)
// The record as a whole is signed too (record.signature over { pro, entries: [entry hashes], issued }).
import crypto from "node:crypto";
import * as J from "./jobs.js";
import { pro as getPro } from "./pros.js";
import * as receipts from "./proof/receipts.js";
import { canonical, sha256, merkle } from "./proof/merkle.js";

const TZ = "America/Chicago";
const monthOf = (iso) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit" }).format(new Date(iso)).slice(0, 7);
export const BANDS = [[0, 10000, "under $100"], [10000, 25000, "$100-$250"], [25000, 50000, "$250-$500"], [50000, 100000, "$500-$1,000"], [100000, 250000, "$1,000-$2,500"], [250000, 500000, "$2,500-$5,000"], [500000, Infinity, "$5,000 and up"]];
export const bandOf = (c) => BANDS.find(([lo, hi]) => c >= lo && c < hi)[2];
const sign = (obj) => receipts.signBytes(Buffer.from(canonical(obj))).toString("base64url");
export const LABEL = "Verified work record: every entry is a job on VeriPay whose done-conditions passed and that was paid with PayPal. Signed by VeriPay and tied to its transparency log; no customer names, addresses or exact amounts.";

function entryFor(j, p) {
  const released = [...j.receipts].reverse().find((r) => /released|resolved/.test(r.event));
  if (!released) return null;
  const last = (m) => j.checks.filter((r) => r.milestone === m.id && r.kind !== "defect").at(-1);
  const rounds = (j.milestones || []).map(last).filter(Boolean);
  // "passed" counts only what the checks passed on their own; conditions a person confirmed (the checks left them to a
  // person) are counted apart, so the record never overstates what was verified automatically
  const byPerson = (c) => c.verdict === "pass" && (c.needsPerson || c.label === "NEEDS_REVIEW" || c.decisionLabel === "NEEDS_REVIEW");
  const passed = rounds.reduce((t, r) => t + r.checks.filter((c) => c.verdict === "pass" && !byPerson(c)).length, 0), confirmedByPerson = rounds.reduce((t, r) => t + r.checks.filter(byPerson).length, 0), total = rounds.reduce((t, r) => t + r.checks.length, 0);
  const shown = receipts.show(released.id);
  if (!shown) return null;
  const body = { type: "DoneWorkRecordEntry", version: 1, pro: p.id, trade: j.scope.trade, month: monthOf(j.paidAt || j.updated), conditions: { passed, confirmedByPerson, total }, milestones: (j.milestones || []).length, amountBand: bandOf(j.money.split?.release || 0), paidVia: "PayPal", receiptHash: shown.hash, issued: new Date().toISOString() };
  return { body, hash: sha256(canonical(body)), signature: sign(body), kid: receipts.publicKey().kid,
    log: shown.batch && shown.log ? { receiptId: shown.id, batch: shown.batch, proof: shown.proof, inclusion: { index: shown.log.index, size: shown.log.size, proof: shown.log.proof }, entry: shown.log.entry, checkpoint: shown.log.checkpoint, origin: shown.log.origin } : { receiptId: shown.id, pending: true, says: "The receipt is signed; it joins the transparency log at the next batch (every few minutes)." } };
}
// only paid jobs whose every condition passed, or that a person confirmed: not those released over failed conditions,
// not disputes settled part and part
const counts = (j) => j.status === "released" && (j.money?.split?.release || 0) > 0 && !(j.milestones || []).some((m) => m.acknowledgedFailed);
export function workRecord(proId) {
  const p = getPro(proId);
  if (!p) return null;
  const entries = J.allJobs().filter((j) => j.agreed?.pro === proId && counts(j)).sort((a, b) => String(a.paidAt).localeCompare(String(b.paidAt))).map((j) => entryFor(j, p)).filter(Boolean);
  const head = { type: "DoneWorkRecord", version: 1, pro: { id: p.id, name: p.name, trade: p.trade, demo: !!p.demo }, entries: entries.map((e) => e.hash), issued: new Date().toISOString() };
  const byTrade = {}, byBand = {};
  for (const e of entries) { byTrade[e.body.trade] = (byTrade[e.body.trade] || 0) + 1; byBand[e.body.amountBand] = (byBand[e.body.amountBand] || 0) + 1; }
  return { ...head, signature: sign(head), kid: receipts.publicKey().kid, publicKey: receipts.publicKey(), count: entries.length,
    summary: { jobs: entries.length, conditionsPassed: entries.reduce((t, e) => t + e.body.conditions.passed, 0), conditionsTotal: entries.reduce((t, e) => t + e.body.conditions.total, 0), confirmedByPerson: entries.reduce((t, e) => t + (e.body.conditions.confirmedByPerson || 0), 0), byTrade, byBand, months: [...new Set(entries.map((e) => e.body.month))] },
    records: entries, label: LABEL, howToVerify: "For each entry: Ed25519-verify signature over the canonical JSON of body with publicKey; check the receipt hash's Merkle path to batch.root; check the batch's log entry is included in the signed checkpoint (RFC 6962 inclusion proof). POST /api/work-record/verify does the same." };
}
// what an outsider checks (also the tests): signatures, Merkle paths, log inclusion, the record's own signature
export function verifyRecord(rec, jwk = rec?.publicKey) {
  let pub = null; try { pub = crypto.createPublicKey({ key: jwk, format: "jwk" }); } catch {}
  const ok = (obj, sig) => { try { return crypto.verify(null, Buffer.from(canonical(obj)), pub, Buffer.from(sig, "base64url")); } catch { return false; } };
  const head = { type: rec?.type, version: rec?.version, pro: rec?.pro, entries: rec?.entries, issued: rec?.issued };
  const entries = (rec?.records || []).map((e) => {
    const r = { hash: sha256(canonical(e.body)) === e.hash && (rec.entries || []).includes(e.hash), signature: ok(e.body, e.signature), proof: null, log: null };
    if (e.log && !e.log.pending) {
      r.proof = merkle.verify(e.body.receiptHash, e.log.proof, e.log.batch.root);
      r.log = receipts.verifyLog(e.log.batch, { entry: e.log.entry, index: e.log.inclusion.index, size: e.log.inclusion.size, proof: e.log.inclusion.proof, checkpoint: e.log.checkpoint, origin: e.log.origin }, jwk);
    }
    return { receiptHash: e.body?.receiptHash, ...r, ok: r.hash && r.signature && r.proof !== false && r.log !== false, inLog: r.log === true };
  });
  return { record: ok(head, rec?.signature), entries, ok: ok(head, rec?.signature) && entries.every((x) => x.ok), allInLog: entries.every((x) => x.inLog) };
}
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
export function recordPage(rec) {
  const rows = rec.records.map((e) => `<tr><td>${esc(e.body.month)}</td><td>${esc(e.body.trade)}</td><td>${e.body.conditions.passed} of ${e.body.conditions.total}</td><td>${esc(e.body.amountBand)}</td><td>${e.log.pending ? "pending (next batch)" : `in log entry ${e.log.batch.log}`}</td><td><code>${esc(e.hash.slice(0, 12))}</code></td></tr>`).join("");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(rec.pro.name)}: verified work record</title><style>:root{--bg:#fff;--ink:#001C64;--soft:#4A5568;--line:#DDE3EC;--link:#005BB8}a{color:var(--link)}h1,h2{color:#003087}body{background:var(--bg);color:var(--ink);font:15px/1.5 system-ui,sans-serif;max-width:860px;margin:0 auto;padding:24px 16px}table{border-collapse:collapse;width:100%}td,th{border-bottom:1px solid var(--line);padding:6px 8px;text-align:left}.muted{color:var(--soft);font-size:13px}code{font-size:12px}</style></head><body>
<h1>${esc(rec.pro.name)}</h1><p>${esc(rec.label)}</p><p><b>${rec.summary.jobs}</b> paid jobs · ${rec.summary.conditionsPassed} of ${rec.summary.conditionsTotal} done-conditions passed by the checks${rec.summary.confirmedByPerson ? `, ${rec.summary.confirmedByPerson} confirmed by the customer` : ""} · ${esc(Object.entries(rec.summary.byTrade).map(([t, n]) => `${n} ${t}`).join(", ") || "none yet")}</p>
<table><tr><th>Month</th><th>Trade</th><th>Conditions passed</th><th>Paid</th><th>Transparency log</th><th>Entry</th></tr>${rows || "<tr><td colspan=6>No paid jobs yet.</td></tr>"}</table>
<p class="muted">Verify it yourself: download <a href="/api/pros/${esc(rec.pro.id)}/record.json">the JSON</a> and check each entry's signature with the platform's key (<a href="/.well-known/done-receipts.json">/.well-known/done-receipts.json</a>), or POST it to /api/work-record/verify. ${rec.pro.demo ? "This pro is fictional (demo)." : ""}</p></body></html>`;
}
