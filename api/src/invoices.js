// Checked invoices: a pro bills a job they took outside VeriPay, through Done, and the invoice is sent (made
// payable) only once the same evidence checks pass. The pro writes the job and the done-conditions (or Done writes
// them from a sentence), uploads the evidence, and submits:
//   draft -> checking -> sent (PayPal Invoicing v2: created and sent to the customer's email) -> paid | paid_outside
//   (sent: a QR code to pay, a reminder a day; paid_outside: the pro recorded cash or a check, PayPal MARKED_AS_PAID)
//                     -> needs_fix (send what's missing) | review (staff look; the pro can't override the check)
//   cancelled (before it's sent)
// When the customer pays the invoice in PayPal, the money lands with the platform, which keeps its 10% fee and pays
// the pro with one Payouts batch, to the pro's verified PayPal only, exactly as for an on-platform job.
import crypto from "node:crypto";
import { store, stateFile } from "./store.js";
import { nowIso } from "./clock.js";
import { pro as getPro, payee } from "./pros.js";
import { writeScope, checkEvidence } from "./ai.js";
import { decide } from "./rules.js";
import { saveFile, fromDataUrl } from "./evidence.js";
import { where, inAustin } from "./geo.js";
import { split, money, FEE_RATE, explainPayout } from "./jobs.js";
import { pp, usd, why } from "./pay/index.js";
import { record } from "./activity.js";
import * as receipts from "./proof/receipts.js";
const said = (c) => c?.label || (c?.verdict === "pass" && (c?.needsPerson || (c?.signals || []).some((s) => /^needs_person/.test(String(s)))) ? "NEEDS_REVIEW" : c?.verdict); // a pass a person must confirm is NEEDS_REVIEW, never "pass"

const db = store(stateFile("invoices"), { invoices: {}, seq: 100 });
export const invoicesStore = db;
const save = () => db.save();
const err = (error, message) => ({ error, message });
const rid = () => `inv_${crypto.randomBytes(5).toString("hex")}`;
export const invoice = (id) => db.data.invoices[id] || null;
export const invoicesOf = (proId) => Object.values(db.data.invoices).filter((x) => x.pro === proId).sort((a, b) => b.created.localeCompare(a.created));
export const all = () => Object.values(db.data.invoices);
const RANK = { release: 0, needs_fix: 1, review: 2 };

// allowTip: PayPal lets the customer add a tip (all of it goes to the pro); minDue: a big job may be paid in parts,
// at least this much each time (the pro is paid when it's paid in full)
// lines: [{ name, qty, unit: HOURS|QUANTITY, amount (each, cents), taxPct }] adding up (with tripFee) to amount; tax on
// a line is added by PayPal on top and goes to the pro, who owes it; payTerm: DUE_ON_RECEIPT, NET_10..NET_90; terms: the
// warranty text; cc: other emails (a property manager); sendOn: a later date PayPal sends it on (SCHEDULED)
const TERMS = ["DUE_ON_RECEIPT", "NET_10", "NET_15", "NET_30", "NET_45", "NET_60", "NET_90"];
export async function create(proId, { customer = {}, title, text, amount, zip, checks = null, template = null, allowTip = false, minDue = null, lines = null, tripFee = 0, payTerm = "DUE_ON_RECEIPT", terms = null, cc = [], sendOn = null } = {}) {
  const p = getPro(proId);
  if (!p) return err("pro", "No such pro.");
  const tp = template ? (db.data.templates ||= {})[template] : null;
  if (template && (!tp || tp.pro !== proId)) return err("template", "No such template.");
  if (tp) { title ||= tp.title; text ||= tp.text; if (amount == null || Number.isNaN(+amount)) amount = tp.amount; checks ||= tp.checks; }
  const email = String(customer.email || "").trim();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return err("customer", "customer.email is where PayPal sends the invoice.");
  const c = Math.round(+amount);
  if (!(c >= 1000 && c <= 2000000)) return err("amount", "amount is USD, from 10 to 20,000.");
  const ln = Array.isArray(lines) && lines.length ? lines.slice(0, 20).map((x) => ({ name: String(x.name || "").slice(0, 200), qty: Math.max(1, Math.min(999, +x.qty || 1)), unit: x.unit === "HOURS" ? "HOURS" : "QUANTITY", amount: Math.round(+x.amount), taxPct: x.taxPct ? Math.max(0, Math.min(20, +x.taxPct)) : 0 })) : null, trip = Math.round(+tripFee || 0);
  if (ln && (ln.some((x) => !x.name || !(x.amount > 0)) || ln.reduce((t, x) => t + x.amount * x.qty, 0) + trip !== c)) return err("lines", "Each line needs a name and an amount; the lines (and the trip fee) add up to amount.");
  if (!TERMS.includes(payTerm)) return err("payTerm", `One of ${TERMS.join(", ")}.`);
  const ccs = (Array.isArray(cc) ? cc : []).map((e) => String(e).trim()).filter((e) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)).slice(0, 3);
  if (sendOn && !(/^\d{4}-\d{2}-\d{2}$/.test(sendOn) && sendOn >= nowIso().slice(0, 10) && Date.parse(sendOn) < Date.now() + 60 * 864e5)) return err("sendOn", "sendOn is a date (YYYY-MM-DD) from today to 60 days out.");
  const md = minDue == null || minDue === "" ? null : Math.round(+minDue);
  if (md != null && !(md >= 500 && md < c)) return err("minDue", "minDue is at least $5 and less than the amount.");
  const z = String(zip || p.zip);
  if (!inAustin(z)) return err("zip", "This demo serves Austin, TX ZIP codes.");
  const t = String(text || title || "").trim();
  if (t.length < 6) return err("text", "Describe the job.");
  const s = Array.isArray(checks) && checks.length ? { title: title || t.slice(0, 80), trade: p.trade, items: [], checks: checks.slice(0, 8).map((x, i) => ({ id: x.id || `c${i + 1}`, what: String(x.what || "").slice(0, 200), evidence: ["photo", "receipt", "note"].includes(x.evidence) ? x.evidence : "photo", rule: String(x.rule || "") })), source: "pro" } : await writeScope({ text: t, zip: z, budgetMax: c });
  const inv = { id: rid(), number: `INV-DP-${++db.data.seq}`, pro: p.id, proName: p.name, customer: { name: String(customer.name || "").slice(0, 60) || null, email: email.slice(0, 120) }, title: String(title || s.title).slice(0, 120), text: t.slice(0, 1000),
    amount: c, address: { zip: z, ...where(z), precise: false }, scope: { title: s.title, trade: s.trade || p.trade, items: s.items || [], checks: s.checks, window: s.window || null, source: s.source || "rules" },
    ...(tp ? { template: { id: tp.id, paypal: tp.paypal } } : {}), allowTip: !!allowTip, minDue: md, ...(ln ? { lines: ln } : {}), ...(trip ? { tripFee: trip } : {}), payTerm, terms: terms ? String(terms).slice(0, 2000) : null, cc: ccs, sendOn: sendOn || null, status: "draft", evidence: [], checks: [], paypal: null, money: { ledger: [] }, created: nowIso(), updated: nowIso(), receipts: [] };
  db.data.invoices[inv.id] = inv; save();
  return view(inv);
}
const mine = (proId, id) => { const x = invoice(id); return x && x.pro === proId ? x : null; };
export function addEvidence(proId, id, items) {
  const inv = mine(proId, id);
  if (!inv) return err("not_found", "No such invoice.");
  if (!["draft", "needs_fix"].includes(inv.status)) return err("state", `Invoice ${inv.number} is ${inv.status}.`);
  for (const x of (Array.isArray(items) ? items : [items]).slice(0, 12)) {
    let buf = x.buf, mime = x.mime;
    if (!buf && x.dataUrl) { const d = fromDataUrl(x.dataUrl); if (!d) return err("file", "dataUrl isn't a data: URL."); buf = d.buf; mime = d.mime; }
    const e = saveFile(inv.id, { buf, mime, kind: x.kind || (buf ? "photo" : "note"), name: x.name, text: x.text, checkId: x.checkId || null, uploadedAt: nowIso() });
    if (e.error) return e;
    e.round = inv.checks.length + 1;
    inv.evidence.push(e);
  }
  save();
  return view(inv);
}
// the check: the same checker and the same code decision as a job; only "release" sends the invoice
export async function submit(proId, id) {
  const inv = mine(proId, id);
  if (!inv) return err("not_found", "No such invoice.");
  if (!["draft", "needs_fix"].includes(inv.status)) return err("state", `Invoice ${inv.number} is ${inv.status}.`);
  if (!inv.evidence.length) return err("evidence", "Send the evidence first.");
  inv.status = "checking"; save();
  const asJob = { id: inv.id, number: inv.number, scope: inv.scope, address: inv.address, window: inv.scope.window, changeOrders: [], agreed: { at: inv.created, price: inv.amount, parts: 0 }, created: inv.created };
  const ev = inv.evidence.slice().reverse().map((e) => ({ id: e.id, kind: e.kind, path: e.path, uploadedAt: e.uploadedAt, text: e.text, name: e.name, checkId: e.checkId, sha: e.sha, exif: e.exif, round: e.round }));
  const r = await checkEvidence(asJob, ev);
  const byId = Object.fromEntries((r.checks || []).map((c) => [c.id, c]));
  const checks = inv.scope.checks.map((c) => byId[c.id] ? { id: c.id, what: c.what, verdict: byId[c.id].verdict, ...(byId[c.id].label ? { label: byId[c.id].label } : {}), ...(byId[c.id].needsPerson ? { needsPerson: true } : {}), reason: String(byId[c.id].reason || "").slice(0, 400), confidence: byId[c.id].confidence ?? null, signals: byId[c.id].signals || [] } : { id: c.id, what: c.what, verdict: "needs_fix", reason: "No verdict.", confidence: null, signals: ["no_verdict"] });
  let decision = decide(checks);
  if (RANK[r.decision] > RANK[decision]) decision = r.decision;
  inv.checks.push({ round: inv.checks.length + 1, at: nowIso(), checks, decision, decidedBy: "rules (code), over the checker's verdicts", checker: r.source || "unknown" });
  if (decision !== "release") { inv.status = decision; inv.updated = nowIso(); save(); return view(inv); }
  return send(inv, "every done-condition passed");
}
async function send(inv, because) {
  try {
    const last = inv.checks.at(-1);
    const r = await pp().invoice({ recipient: inv.customer.email, item: `${inv.title} (${inv.number}, checked by VeriPay)`, amount: inv.amount, note: `Billed by ${inv.proName} through VeriPay. Sent after the evidence checks: ${last.checks.map((c) => `${c.what}: ${said(c)}`).join("; ")}.`, requestId: `${inv.id}:invoice`, templateId: inv.template?.paypal || null, allowTip: !!inv.allowTip, minDue: inv.minDue || null,
      lines: inv.lines || null, tripFee: inv.tripFee || 0, payTerm: inv.payTerm || "DUE_ON_RECEIPT", terms: inv.terms || null, cc: inv.cc || [], sendOn: inv.sendOn || null, reference: inv.number, memo: `VeriPay ${inv.id}`, number: await pp().nextInvoiceNumber().then((x) => `${inv.number}-${x.number}`.slice(0, 25)).catch(() => null),
      invoicer: (() => { const pr = getPro(inv.pro); return { business: pr?.name, phone: pr?.phone || null, website: pr?.website || null, note: "Billed through VeriPay after the evidence checks" }; })(), site: inv.address?.zip ? { zip: inv.address.zip, line1: `Service area ${inv.address.zip}` } : null,
      subject: `${inv.proName}: ${inv.title} (checked by VeriPay)`, sendNote: `Your invoice from ${inv.proName}. VeriPay sent it only after the work's evidence passed the agreed checks.` });
    inv.paypal = { id: r.id, url: r.url, status: r.status, at: nowIso(), ...(r.status === "SCHEDULED" ? { scheduledFor: inv.sendOn } : {}) };
    inv.status = "sent"; inv.updated = nowIso(); inv.sentBecause = because;
    const rc = receipts.issue({ kind: "invoice", subject: inv.id, event: "sent", data: { invoice: inv.number, paypalInvoice: r.id, amount: inv.amount, checks: last.checks.map((c) => ({ id: c.id, verdict: c.verdict, label: said(c) })), because }, people: [] });
    inv.receipts.push({ id: rc.id, event: "sent" });
    save();
    return view(inv);
  } catch (e) { inv.status = "review"; inv.why = `PayPal: ${why(e)}`; save(); return { ...view(inv), error: "paypal", message: why(e) }; }
}
// staff, after a review: send it anyway, or close it
export async function review(id, { approve = false, note = "" } = {}) {
  const inv = invoice(id);
  if (!inv || inv.status !== "review") return err("state", "Not in review.");
  if (!approve) { inv.status = "cancelled"; inv.note = String(note).slice(0, 200); save(); return view(inv); }
  return send(inv, `sent by staff after review${note ? `: ${String(note).slice(0, 200)}` : ""}`);
}
export async function cancel(proId, id, { note = "" } = {}) {
  const inv = mine(proId, id);
  if (!inv) return err("not_found", "No such invoice.");
  // a sent, unpaid invoice is withdrawn in PayPal too (the customer is told); a paid one is refunded, not cancelled
  if (inv.status === "sent" && inv.paypal?.status === "SCHEDULED") {
    try { await pp().deleteInvoice(inv.paypal.id); } catch (e) { return err("paypal", why(e)); }
    inv.paypal.status = "DELETED"; inv.status = "cancelled"; inv.cancelledAfterSending = nowIso(); save();
    return view(inv);
  }
  if (inv.status === "sent" && inv.paypal?.id) {
    try { await pp().cancelInvoice(inv.paypal.id, { note }); } catch (e) { return err("paypal", why(e)); }
    inv.paypal.status = "CANCELLED"; inv.status = "cancelled"; inv.cancelledAfterSending = nowIso(); save();
    return view(inv);
  }
  if (!["draft", "needs_fix", "review"].includes(inv.status)) return err("state", `Invoice ${inv.number} is ${inv.status}.`);
  inv.status = "cancelled"; save();
  return view(inv);
}
// PayPal says it's paid: the fee stays, the pro is paid with Payouts
export async function syncOne(inv) {
  if (inv.status !== "sent" || !inv.paypal?.id) return null;
  const s = await pp().getInvoice(inv.paypal.id).catch(() => null);
  if (!s) return null;
  inv.paypal.status = s.status;
  if (s.external || s.status === "MARKED_AS_PAID") return paidOutside(inv, { by: "PayPal (marked as paid)" });
  if (s.status === "PARTIALLY_PAID" && s.paid !== inv.paypal.paid) { inv.paypal.paid = s.paid; (inv.money.parts ||= []).push({ paid: s.paid, at: nowIso() }); }
  if (s.status !== "PAID" && !(s.paid >= inv.amount)) { save(); return null; }
  const tip = s.tip || 0, tax = s.tax || 0, sp0 = split(inv.amount, 0), sp = tip || tax ? { ...sp0, ...(tip ? { tip } : {}), ...(tax ? { tax } : {}), pro: sp0.pro + tip + tax } : sp0, p = getPro(inv.pro), L = inv.money.ledger;
  if (tax) L.push({ n: 1.6, kind: "sales_tax", amount: tax, note: "added by PayPal on the taxed lines; paid to the pro, who remits it", at: nowIso() });
  L.push({ n: 1, kind: "invoice_paid", amount: inv.amount, ref: inv.paypal.id, at: nowIso() }, ...(tip ? [{ n: 1.5, kind: "tip", amount: tip, note: "added by the customer in PayPal; all to the pro", at: nowIso() }] : []), { n: 2, kind: "platform_fee", amount: sp.fee, note: `${FEE_RATE * 100}%`, at: nowIso() }, { n: 3, kind: "pro_payout", amount: sp.pro, to: p.id, at: nowIso() });
  inv.paypal.paid = s.paid; if (tip) inv.money.tip = tip;
  inv.money.split = sp; inv.status = "paid"; inv.paidAt = nowIso();
  const to = payee(p);
  if (!to) inv.money.payout = { status: "waiting_for_paypal", at: nowIso() };
  else {
    try { const b = await pp().payoutBatch({ batchId: `${inv.id}-payout`, items: [{ id: `${inv.number}-pro`, receiver: to, amount: sp.pro, note: `${inv.number} ${inv.title}: paid by the customer, checked by VeriPay.` }], subject: "VeriPay: your invoice was paid" });
      inv.money.payout = { batchId: b.batchId, status: b.status, items: [{ id: `${inv.number}-pro`, amount: sp.pro, to: "pro" }], at: nowIso() }; }
    catch (e) { inv.money.payout = { status: "failed", why: why(e), at: nowIso() }; }
  }
  save();
  if (p.person) record({ actor: { kind: "paypal" }, who: [p.person], action: "invoice_paid", summary: `${inv.number} paid: ${usd(sp.pro)} to you, ${usd(sp.fee)} platform fee.`, ref: inv.id });
  return inv;
}
// paid outside PayPal (the customer paid the pro in cash or by check): no money reached the platform, so there's no
// fee to keep and nothing to pay out; the invoice closes as paid_outside
function paidOutside(inv, { method = "CASH", by }) {
  if (inv.status !== "sent") return null;
  inv.status = "paid_outside"; inv.paidAt = nowIso();
  inv.money.ledger.push({ n: inv.money.ledger.length + 1, kind: "paid_outside_paypal", amount: inv.amount, ref: inv.paypal?.id || null, note: `${method.toLowerCase()} to the pro, recorded by ${by}: no fee, no payout`, at: nowIso() });
  inv.money.split = null; inv.money.payout = null;
  save();
  return inv;
}
export async function recordPayment(proId, id, { method = "CASH", note = "" } = {}) {
  const inv = mine(proId, id);
  if (!inv) return err("not_found", "No such invoice.");
  if (inv.status !== "sent" || !inv.paypal?.id) return err("state", "Only a sent invoice can be marked as paid.");
  const m = String(method).toUpperCase();
  if (!["CASH", "CHECK", "BANK_TRANSFER", "OTHER"].includes(m)) return err("method", "Cash, check, bank transfer or other.");
  try { const r = await pp().recordInvoicePayment(inv.paypal.id, { method: m, amount: inv.amount, date: nowIso().slice(0, 10), note: String(note).slice(0, 200) }); inv.paypal.outsidePayment = r.paymentId || null; } catch (e) { return err("paypal", why(e)); }
  inv.paypal.status = "MARKED_AS_PAID";
  paidOutside(inv, { method: m, by: "the pro" });
  record({ actor: { kind: "person" }, who: [getPro(inv.pro)?.person].filter(Boolean), action: "invoice_paid_outside", summary: `${inv.number} marked paid in ${m.toLowerCase().replace("_", " ")}: no platform fee, no payout.`, ref: inv.id });
  return view(inv);
}
// a cash payment recorded by mistake: removed in PayPal, the invoice is open again
export async function undoOutside(proId, id) {
  const inv = mine(proId, id);
  if (!inv) return err("not_found", "No such invoice.");
  if (inv.status !== "paid_outside" || !inv.paypal?.outsidePayment) return err("state", "Only a payment recorded outside PayPal, with its PayPal id.");
  try { await pp().deleteInvoicePayment(inv.paypal.id, inv.paypal.outsidePayment); } catch (e) { return err("paypal", why(e)); }
  inv.status = "sent"; inv.paidAt = null; inv.paypal.status = "SENT"; delete inv.paypal.outsidePayment; inv.money.ledger.push({ n: inv.money.ledger.length + 1, kind: "outside_payment_removed", amount: inv.amount, at: nowIso() }); save();
  return view(inv);
}
// money given back outside PayPal (cash back after a complaint), recorded on the PayPal invoice
export async function refundOutside(proId, id, { amount, method = "CASH" } = {}) {
  const inv = mine(proId, id), c = Math.round(+amount);
  if (!inv) return err("not_found", "No such invoice.");
  if (!["paid_outside", "paid"].includes(inv.status) || !inv.paypal?.id) return err("state", "A paid invoice.");
  if (!(c >= 100 && c <= inv.amount)) return err("amount", "From $1 to the invoice's amount.");
  try { const r = await pp().recordInvoiceRefund(inv.paypal.id, { method: String(method).toUpperCase(), amount: c, date: nowIso().slice(0, 10) }); (inv.money.outsideRefunds ||= []).push({ id: r.refundId, amount: c, at: nowIso() }); } catch (e) { return err("paypal", why(e)); }
  inv.money.ledger.push({ n: inv.money.ledger.length + 1, kind: "refund_outside_paypal", amount: c, note: `${String(method).toLowerCase()} back to the customer, recorded on the PayPal invoice`, at: nowIso() }); save();
  return view(inv);
}
// a scheduled invoice changed before PayPal sends it: its send date or its note
export async function editScheduled(proId, id, { sendOn = null, note = null } = {}) {
  const inv = mine(proId, id);
  if (!inv) return err("not_found", "No such invoice.");
  if (inv.paypal?.status !== "SCHEDULED") return err("state", "Only an invoice PayPal hasn't sent yet (scheduled).");
  if (sendOn && !(/^\d{4}-\d{2}-\d{2}$/.test(sendOn) && sendOn >= nowIso().slice(0, 10))) return err("sendOn", "A date from today.");
  try { await pp().updateInvoice(inv.paypal.id, (v) => { if (v.detail) { if (sendOn) v.detail.invoice_date = sendOn; if (note) v.detail.note = String(note).slice(0, 4000); } else { if (sendOn) v.sendOn = sendOn; } return v; }); } catch (e) { return err("paypal", why(e)); }
  if (sendOn) inv.sendOn = inv.paypal.scheduledFor = sendOn;
  save();
  return view(inv);
}
// the pro's templates as PayPal lists them, and one renamed or repriced there
export async function paypalTemplates() { return pp().listInvoiceTemplates(); }
export async function updateTemplate(proId, id, { name = null, amount = null } = {}) {
  const t = (db.data.templates || {})[id];
  if (!t || t.pro !== proId) return err("not_found", "No such template.");
  const c = amount != null ? Math.round(+amount) : null;
  if (c != null && !(c >= 1000 && c <= 2000000)) return err("amount", "amount is USD, from 10 to 20,000.");
  try { await pp().updateInvoiceTemplate(t.paypal.templateId || t.paypal, { name: name ? String(name).slice(0, 80) : null, amount: c }); } catch (e) { return err("paypal", why(e)); }
  if (name) t.name = String(name).slice(0, 80); if (c != null) t.amount = c; save();
  return templateView(t);
}
// a reminder from PayPal to the customer; at most one a day (PayPal allows two)
export async function remind(proId, id, { note = "" } = {}) {
  const inv = mine(proId, id);
  if (!inv) return err("not_found", "No such invoice.");
  if (inv.status !== "sent" || !inv.paypal?.id) return err("state", "Only a sent, unpaid invoice.");
  const last = inv.reminders?.at(-1);
  if (last && Date.now() - Date.parse(last) < 864e5) return err("limit", "One reminder a day.");
  try { await pp().remindInvoice(inv.paypal.id, { note }); } catch (e) { return err("paypal", why(e)); }
  (inv.reminders ||= []).push(nowIso()); save();
  return view(inv);
}
// the QR code that opens PayPal's pay page for a sent invoice (PNG, base64), cached on the invoice
export async function qr(proId, id) {
  const inv = mine(proId, id);
  if (!inv) return err("not_found", "No such invoice.");
  if (inv.status !== "sent" || !inv.paypal?.id) return err("state", "A QR code is for a sent, unpaid invoice.");
  if (!inv.paypal.qr) { try { inv.paypal.qr = (await pp().invoiceQr(inv.paypal.id)).png; save(); } catch (e) { return err("paypal", why(e)); } }
  return { png: inv.paypal.qr, says: "Scan to pay with PayPal." };
}
// invoice templates: a pro's usual job (title, description, price, done-conditions) saved in VeriPay and as a template
// in PayPal's invoicer (Invoicing v2 templates); an invoice made from one carries PayPal's template_id. Checks still
// run on every invoice: a template only fills the form.
export const templatesOf = (proId) => Object.values(db.data.templates || {}).filter((t) => t.pro === proId).sort((a, b) => b.created.localeCompare(a.created));
export async function saveTemplate(proId, { from = null, name, title, text, amount, checks = null } = {}) {
  const p = getPro(proId);
  if (!p) return err("pro", "No such pro.");
  const src = from ? mine(proId, from) : null;
  if (from && !src) return err("not_found", "No such invoice.");
  const t = { title: String(src?.title || title || "").trim().slice(0, 120), text: String(src?.text || text || "").trim().slice(0, 1000), amount: Math.round(+(src?.amount ?? amount)), checks: src?.scope?.checks || (Array.isArray(checks) ? checks.slice(0, 8) : null) };
  if (t.text.length < 6) return err("text", "Describe the job.");
  if (!(t.amount >= 1000 && t.amount <= 2000000)) return err("amount", "amount is USD, from 10 to 20,000.");
  const nm = String(name || t.title || t.text.slice(0, 60)).slice(0, 80);
  if (templatesOf(proId).length >= 20) return err("limit", "Twenty templates at most.");
  let r;
  try { r = await pp().createInvoiceTemplate({ name: `${p.name} · ${nm} · ${crypto.randomBytes(2).toString("hex")}`, item: t.title || nm, amount: t.amount, note: `Billed by ${p.name} through VeriPay, sent only after the evidence checks pass.` }); }
  catch (e) { return err("paypal", why(e)); }
  const tp = { id: `tpl_${crypto.randomBytes(4).toString("hex")}`, pro: p.id, name: nm, ...t, paypal: r.id, created: nowIso() };
  (db.data.templates ||= {})[tp.id] = tp; save();
  return templateView(tp);
}
export async function deleteTemplate(proId, id) {
  const tp = (db.data.templates || {})[id];
  if (!tp || tp.pro !== proId) return err("not_found", "No such template.");
  try { await pp().deleteInvoiceTemplate(tp.paypal); } catch (e) { if (e.status !== 404) return err("paypal", why(e)); }
  delete db.data.templates[id]; save();
  return { deleted: id };
}
export const templateView = (t) => ({ id: t.id, name: t.name, title: t.title, text: t.text, amount: money(t.amount), checks: t.checks, paypal: { templateId: t.paypal }, created: t.created });
export async function tick() { const out = []; for (const inv of all()) { const r = await syncOne(inv); if (r) out.push({ invoice: inv.number, event: "paid" }); } return out; }

export function view(inv) {
  return { id: inv.id, number: inv.number, status: inv.status, pro: inv.pro, proName: inv.proName, customer: inv.customer, title: inv.title, text: inv.text, amount: money(inv.amount), address: inv.address, scope: inv.scope,
    evidence: inv.evidence.map((e) => ({ id: e.id, kind: e.kind, name: e.name, checkId: e.checkId, text: e.text ?? null, mime: e.mime, size: e.size, sha256: e.sha, exif: e.exif, uploadedAt: e.uploadedAt, round: e.round })),
    checks: inv.checks, lastCheck: inv.checks.at(-1) || null, paypal: inv.paypal ? { ...inv.paypal, qr: undefined, hasQr: !!inv.paypal.qr } : null, sentBecause: inv.sentBecause || null,
    money: { split: inv.money.split ? Object.fromEntries(Object.entries(inv.money.split).map(([k, v]) => [k, money(v)])) : null, payout: explainPayout(inv.money.payout), ledger: inv.money.ledger.map((l) => ({ ...l, amount: money(l.amount) })) },
    template: inv.template || null, allowTip: !!inv.allowTip, minDue: inv.minDue ? money(inv.minDue) : null, lines: inv.lines ? inv.lines.map((x) => ({ ...x, amount: money(x.amount) })) : null, tripFee: inv.tripFee ? money(inv.tripFee) : null, payTerm: inv.payTerm || "DUE_ON_RECEIPT", terms: inv.terms || null, cc: inv.cc || [], sendOn: inv.sendOn || null, salesTax: inv.money.split?.tax ? money(inv.money.split.tax) : null, paidSoFar: inv.paypal?.paid ? money(inv.paypal.paid) : null, tip: inv.money.tip ? money(inv.money.tip) : null, reminders: inv.reminders || [], receipts: inv.receipts, created: inv.created, updated: inv.updated, paidAt: inv.paidAt || null, ...(inv.why ? { why: inv.why } : {}) };
}
