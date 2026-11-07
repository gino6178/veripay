// PayPal Disputes: when a customer escalates a paid job to PayPal (after release, or after Done's own dispute settled),
// the platform keeps a record tied to the capture, tracks PayPal's dispute, and answers it with the job's evidence:
// each done-condition's verdict and reason, the check's source, and the signed receipt for the release.
//   escalate   the customer asks: the record is opened (status "requested"); the stand-in opens the PayPal dispute
//              itself, as a buyer would. In the real sandbox a dispute is opened by the buyer in PayPal's Resolution
//              Center (a sandbox buyer login, which we don't have for the demo's card payments), so "requested" waits
//              for sync to find it (also nudged by the CUSTOMER.DISPUTE.CREATED webhook)
//   sync       Disputes API: the disputes on this job's capture (GET /v1/customer/disputes?disputed_transaction_id=)
//   respond    staff send the evidence (POST /v1/customer/disputes/{id}/provide-evidence: notes + the receipt JSON)
// Nothing here moves money: PayPal decides a PayPal dispute.
import { job, allJobs, jobsStore, money } from "./jobs.js";
import { record } from "./activity.js";
import * as receipts from "./proof/receipts.js";
import { pp, usd, why } from "./pay/index.js";
import { nowIso } from "./clock.js";
import { session } from "./recon.js";
const said = (c) => c?.label || (c?.verdict === "pass" && (c?.needsPerson || (c?.signals || []).some((s) => /^needs_person/.test(String(s)))) ? "NEEDS_REVIEW" : c?.verdict); // a pass a person must confirm is NEEDS_REVIEW, never "pass"

const err = (error, message) => ({ error, message });
const cents = (v) => (v == null || !Number.isFinite(+v) ? null : Math.round(Math.abs(+v) * 100));
const save = () => jobsStore.save();
const DAY = 864e5;
export const SANDBOX_NOTE = "PayPal disputes are opened by the buyer in PayPal (Resolution Center). The sandbox needs a sandbox buyer account for that; the demo's card holds have none, so with real sandbox keys the record waits in \"requested\" until sync finds a dispute on the capture. The stand-in opens one itself.";

export function view(j) {
  const d = j.paypalDispute;
  return d ? { ...d, amount: money(d.amount), sandboxNote: pp().mode === "sandbox" && d.status === "requested" ? SANDBOX_NOTE : undefined } : null;
}
export async function escalate(id, reason, actor) {
  const j = job(id);
  if (!j) return err("not_found", "No such job.");
  if (!((actor?.kind === "person" || actor?.kind === "agent") && actor.person === j.customer)) return err("forbidden", "Not your job.");
  if (!["released", "resolved"].includes(j.status) || !j.hold?.capture) return err("state", "Escalating to PayPal is for a job whose payment was captured (released or settled). Before that, open a dispute with Done.");
  if (j.paypalDispute && j.paypalDispute.status !== "closed") return err("state", "Already escalated.");
  if (Date.now() - Date.parse(j.paidAt) > 180 * DAY) return err("state", "PayPal takes disputes within 180 days of the payment.");
  const r = String(reason || "").trim();
  if (r.length < 6) return err("reason", "Say what's wrong.");
  j.paypalDispute = { status: "requested", reason: r.slice(0, 1000), capture: j.hold.capture, amount: j.money.captured - j.money.refunded, at: nowIso(), paypal: null, evidence: null, history: [{ at: nowIso(), event: "requested" }] };
  if (pp().mode === "mock") { const d = pp().openDispute(j.hold.capture, "MERCHANDISE_OR_SERVICE_NOT_AS_DESCRIBED"); if (d) attach(j, d); }
  save();
  record({ actor: { kind: actor.kind }, who: [j.customer], action: "paypal_dispute_requested", summary: `${j.number}: escalated to PayPal (capture ${j.hold.capture}, ${usd(j.paypalDispute.amount)}).`, ref: j.id });
  return view(j);
}
function attach(j, d) {
  const p = j.paypalDispute;
  p.paypal = { id: d.id, status: d.status, reason: d.reason, amount: d.amount ?? null };
  p.status = /RESOLVED|CLOSED/i.test(d.status) ? "closed" : d.evidence || /UNDER_REVIEW/.test(d.status) ? "answered" : "open";
  p.history.push({ at: nowIso(), event: `PayPal: ${d.status}`, id: d.id });
}
export async function sync(id) {
  const j = job(id);
  if (!j?.hold?.capture) return err("not_found", "No captured job.");
  try {
    const list = await pp().listDisputes(j.hold.capture);
    if (list.length) { j.paypalDispute ||= { status: "open", reason: "opened by the buyer in PayPal", capture: j.hold.capture, amount: j.money.captured - j.money.refunded, at: nowIso(), paypal: null, evidence: null, history: [] }; attach(j, list[0]);
      // INTERNAL: a PayPal case; EXTERNAL: a card chargeback (the bank decides; evidence still goes through PayPal);
      // ALERT: a pre-chargeback alert (refunding now avoids the chargeback)
      if (list[0].channel) j.paypalDispute.channel = list[0].channel; save(); }
    return { job: j.number, disputes: list.length, record: view(j) };
  } catch (e) { return err("paypal", why(e)); }
}
// the notes PayPal gets: what was agreed, every check, the split, and where to verify the receipt
export function packet(j) {
  const last = j.checks.at(-1), rel = [...j.receipts].reverse().find((r) => ["released", "resolved"].includes(r.event));
  const notes = [`VeriPay job ${j.number}: ${j.scope.title}. Agreed ${usd(j.agreed.price)} with ${j.agreed.proName}; approved change orders ${usd(j.changeOrders.filter((c) => c.status === "approved").reduce((t, c) => t + c.amount, 0))}.`,
    last ? `Evidence check round ${last.round} (${last.checker}), decided by code: ${last.decision}.` : "No evidence check.",
    ...(last ? last.checks.map((c) => `- ${c.what}: ${said(c)} (${c.reason})`) : []),
    j.dispute?.resolution ? `Settled in Done before release: ${usd(j.dispute.resolution.release)} released, ${usd(j.dispute.resolution.refund)} refunded.` : null,
    `Captured ${usd(j.money.captured)}, refunded ${usd(j.money.refunded)}. Signed receipt ${rel?.id || "n/a"} (Ed25519, transparency log), attached.`].filter(Boolean).join("\n");
  return { notes, receipt: rel ? receipts.show(rel.id) : null };
}
// the evidence type for the claim: a service job's proof is PROOF_FOR_SOFTWARE_OR_SERVICE_DELIVERED (PROOF_OF_FULFILLMENT
// is for shipped goods, with tracking); money already given back is PROOF_OF_REFUND with the refund ids; a
// "not as described" claim is answered with the agreed work order as the contract (COPY_OF_CONTRACT)
export function evidenceType(j) {
  const r = String(j.paypalDispute?.paypal?.reason || j.paypalDispute?.reason || "").toUpperCase();
  const refunds = (j.money?.ledger || []).filter((l) => l.kind === "refund" && l.ref).map((l) => l.ref);
  if (refunds.length && j.money.refunded >= (j.paypalDispute?.amount || Infinity)) return { type: "PROOF_OF_REFUND", refundIds: refunds };
  if (/NOT_AS_DESCRIBED/.test(r)) return { type: "COPY_OF_CONTRACT", refundIds: [] };
  return { type: "PROOF_FOR_SOFTWARE_OR_SERVICE_DELIVERED", refundIds: [] };
}
export async function respond(id, { note = "" } = {}) {
  const j = job(id);
  if (!j?.paypalDispute?.paypal?.id) return err("state", "There's no PayPal dispute on this job yet (sync first).");
  const p = packet(j), notes = `${p.notes}${note ? `\nStaff: ${String(note).slice(0, 500)}` : ""}`, ev = evidenceType(j);
  try {
    const r = await pp().provideEvidence(j.paypalDispute.paypal.id, { notes, file: Buffer.from(JSON.stringify(p.receipt || {}, null, 1)), fileName: `${j.number}-receipt.json`, type: ev.type, refundIds: ev.refundIds });
    j.paypalDispute.evidence = { at: nowIso(), notes, receipt: p.receipt?.id || null, paypal: r.status, type: ev.type };
    j.paypalDispute.status = "answered"; j.paypalDispute.history.push({ at: nowIso(), event: "evidence sent" });
    save();
    return view(j);
  } catch (e) { return err("paypal", why(e)); }
}
// a CUSTOMER.DISPUTE.CREATED webhook: the job whose capture it's on
export const jobOfCapture = (capture) => allJobs().find((j) => j.hold?.capture === capture) || null;
export const all = () => allJobs().filter((j) => j.paypalDispute).map((j) => ({ job: j.id, number: j.number, pro: j.agreed?.proName, ...view(j) }));

// ---- the disputes AGENT ------------------------------------------------------------------------------------------------
// Reads every PayPal dispute on the account with the PayPal Agent Toolkit (list_disputes, then get_dispute for each;
// via "paypal-mcp" the same two tools through PayPal's hosted MCP server),
// ties it to its job by the capture, and proposes what to do by code rules over the job's own record:
//   send_evidence  the release followed a passing evidence check and a signed receipt: answer with the packet
//   review         released without a passing check (a person's call, or settled in Done): staff choose
//   wait           evidence already sent; PayPal is deciding
//   closed         PayPal resolved it
//   look           not on a VeriPay capture
// Sending evidence moves no money, so `auto: true` sends it for send_evidence rows. Accepting the claim (PayPal refunds
// the buyer) moves money: it is never automatic, only POST /api/staff/jobs/:id/paypal-dispute/accept.
let lastTriage = null;
export const latestTriage = () => lastTriage;
const dueIn = (t) => (t ? Math.round((Date.parse(t) - Date.now()) / 3600e3) : null);
function propose(j, d) {
  if (!j) return { action: "look", why: "Not on a VeriPay capture." };
  if (/RESOLVED|CLOSED/i.test(d.status)) return { action: "closed", why: `PayPal: ${d.status}${d.outcome ? ` (${d.outcome})` : ""}.` };
  if (/WAITING_FOR_BUYER/i.test(d.status) && j.paypalDispute?.offer) return { action: "wait", why: `Offered ${usd(j.paypalDispute.offer.amount)} back; waiting for the buyer.` };
  if (j.paypalDispute?.evidence || /UNDER_REVIEW/i.test(d.status)) return { action: "wait", why: "Evidence sent; PayPal is reviewing." };
  const last = j.checks.at(-1), rel = j.receipts.some((r) => ["released", "resolved"].includes(r.event));
  if (last?.decision === "release" && rel && !j.dispute) return { action: "send_evidence", why: `Released after evidence check round ${last.round} passed (${last.checks.length} conditions), with a signed receipt.` };
  return { action: "review", why: j.dispute ? "Settled in VeriPay before release: staff decide whether to answer or accept." : "Released without a passing evidence check: staff decide whether to answer or accept." };
}
export async function triage({ by = "on demand", auto = false, via = "toolkit" } = {}) {
  const s = session({ via }), t = Date.now(), rows = [];
  const list = await s.run("list_disputes", { page_size: 50 });
  for (const it of list?.items || []) {
    const d = (await s.run("get_dispute", { dispute_id: it.dispute_id })) || {};
    const status = d.status || it.status, cap = (d.disputed_transactions || it.disputed_transactions || [])[0]?.seller_transaction_id, j = cap ? jobOfCapture(cap) : null;
    if (j) { j.paypalDispute ||= { status: "open", reason: "opened by the buyer in PayPal", capture: cap, amount: j.money.captured - j.money.refunded, at: nowIso(), paypal: null, evidence: null, history: [] }; if (j.paypalDispute.paypal?.status !== status) attach(j, { id: it.dispute_id, status, reason: d.reason || it.reason, amount: cents(d.dispute_amount?.value ?? it.dispute_amount?.value) }); }
    if (j?.paypalDispute?.offer && /RESOLVED/i.test(status) && j.paypalDispute.offer.status === "waiting_for_buyer") { j.paypalDispute.offer.status = d.dispute_outcome?.outcome_code === "RESOLVED_WITH_PAYOUT" ? "accepted" : "closed"; j.paypalDispute.status = "closed"; }
    const p = propose(j, { status, outcome: d.dispute_outcome?.outcome_code });
    const row = { dispute: it.dispute_id, status, reason: d.reason || it.reason, amount: cents(d.dispute_amount?.value ?? it.dispute_amount?.value), capture: cap || null, job: j?.id || null, number: j?.number || null, dueInHours: dueIn(d.seller_response_due_date), ...p };
    if (auto && p.action === "send_evidence") { const r = await respond(j.id); row.sent = !r.error; if (r.error) row.sendError = r.message; }
    rows.push(row);
  }
  save();
  lastTriage = { at: nowIso(), by, ms: Date.now() - t, paypal: pp().mode, via: pp().mode === "mock" ? "stand-in" : via, toolkit: ["list_disputes", "get_dispute"], calls: s.calls, rows, counts: rows.reduce((c, r) => ({ ...c, [r.action]: (c[r.action] || 0) + 1 }), {}), error: list?.error?.message || null };
  return lastTriage;
}
// staff offer the buyer a partial refund (weak evidence, but not all of it): PayPal asks the buyer; if they accept, PayPal
// refunds that amount and closes the dispute (moves money: staff only, never automatic)
// kind "refund": part of the money back; kind "redo": the pro comes back and redoes the work, no money back
// (REPLACEMENT_WITHOUT_REFUND)
export async function offer(id, { amount, note = "", kind = "refund" } = {}, actor = { kind: "staff" }) {
  const j = job(id), d = j?.paypalDispute;
  if (actor?.kind !== "staff") return err("forbidden", "Staff make offers on a PayPal dispute.");
  if (!d?.paypal?.id) return err("state", "There's no PayPal dispute on this job yet (sync first).");
  if (d.status === "closed") return err("state", "Already closed.");
  const redo = kind === "redo", c = redo ? 0 : Math.round(+amount);
  if (!redo && !(c > 0 && c < d.amount)) return err("amount", `An offer is part of the disputed ${usd(d.amount)}, more than $0 (all of it is accepting the claim).`);
  const n = String(note || "").trim();
  if (n.length < 6) return err("note", "Say why (PayPal shows the buyer this note).");
  try { await pp().makeOffer(d.paypal.id, { amount: c, note: n.slice(0, 2000), offerType: redo ? "REPLACEMENT_WITHOUT_REFUND" : "REFUND" }); } catch (e) { return err("paypal", why(e)); }
  d.offer = { amount: c, kind: redo ? "redo" : "refund", note: n.slice(0, 2000), at: nowIso(), status: "waiting_for_buyer" };
  d.history.push({ at: nowIso(), event: redo ? "offered to redo the work" : `offered ${usd(c)} back` });
  save();
  record({ actor: { kind: "staff" }, who: [j.customer], action: "paypal_dispute_offer", summary: `${j.number}: VeriPay offered ${usd(c)} back on the PayPal dispute; answer it in PayPal.`, ref: j.id });
  return view(j);
}
// staff accept the buyer's claim: PayPal refunds the buyer from the platform's balance (moves money; staff only)
// a message to the buyer in PayPal's dispute thread (staff), and an appeal of a decision PayPal made against VeriPay
// with the job's evidence again (staff; PayPal allows it once, after it decides)
export async function message(id, { message = "" } = {}, actor = { kind: "staff" }) {
  const j = job(id), d = j?.paypalDispute;
  if (actor?.kind !== "staff") return err("forbidden", "Staff write in a PayPal dispute.");
  if (!d?.paypal?.id) return err("state", "There's no PayPal dispute on this job yet (sync first).");
  const m = String(message || "").trim();
  if (m.length < 6) return err("message", "Write the message (PayPal shows it to the buyer).");
  try { await pp().disputeMessage(d.paypal.id, m.slice(0, 2000)); } catch (e) { return err("paypal", why(e)); }
  (d.messages ||= []).push({ at: nowIso(), from: "VeriPay", message: m.slice(0, 2000) });
  d.history.push({ at: nowIso(), event: "messaged the buyer in PayPal" });
  save();
  return view(j);
}
// the buyer sent back what PayPal asked them to return (the parts, a fixture): staff say it arrived, so PayPal can close it
export async function acknowledgeReturn(id, { note = "" } = {}, actor = { kind: "staff" }) {
  const j = job(id), d = j?.paypalDispute;
  if (actor?.kind !== "staff") return err("forbidden", "Staff answer a PayPal dispute.");
  if (!d?.paypal?.id) return err("state", "There's no PayPal dispute on this job yet (sync first).");
  if (d.returnAcknowledged) return err("state", "Already acknowledged.");
  const n = String(note || "").trim();
  if (n.length < 6) return err("note", "Say what arrived back and when.");
  try { await pp().acknowledgeReturn(d.paypal.id, { note: n.slice(0, 2000) }); } catch (e) { return err("paypal", why(e)); }
  d.returnAcknowledged = { at: nowIso(), note: n.slice(0, 2000) };
  d.history.push({ at: nowIso(), event: "told PayPal the returned item arrived" });
  save();
  return view(j);
}
// what PayPal asked VeriPay for (provide-supporting-info), and the contact PayPal uses for this case (PATCH)
export async function supportingInfo(id, { notes = "" } = {}, actor = { kind: "staff" }) {
  const j = job(id), d = j?.paypalDispute;
  if (actor?.kind !== "staff") return err("forbidden", "Staff answer a PayPal dispute.");
  if (!d?.paypal?.id) return err("state", "There's no PayPal dispute on this job yet (sync first).");
  const n = String(notes || "").trim();
  if (n.length < 10) return err("notes", "Write what PayPal asked for.");
  try { await pp().supportingInfo(d.paypal.id, { notes: `${n.slice(0, 1500)}\n\n${packet(j).notes}`.slice(0, 2000) }); } catch (e) { return err("paypal", why(e)); }
  d.history.push({ at: nowIso(), event: "sent PayPal the information it asked for" }); save();
  return view(j);
}
export async function setContact(id, { email, note = "" } = {}, actor = { kind: "staff" }) {
  const j = job(id), d = j?.paypalDispute;
  if (actor?.kind !== "staff") return err("forbidden", "Staff answer a PayPal dispute.");
  if (!d?.paypal?.id) return err("state", "There's no PayPal dispute on this job yet (sync first).");
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(email || ""))) return err("email", "An email PayPal can reach VeriPay at for this case.");
  try { await pp().updateDisputeContact(d.paypal.id, { email, note }); } catch (e) { return err("paypal", why(e)); }
  d.contact = { email, at: nowIso() }; d.history.push({ at: nowIso(), event: "gave PayPal the contact for this case" }); save();
  return view(j);
}
// the queue: every dispute PayPal says needs VeriPay's action, or changed since a time
export async function queue({ state = "REQUIRED_ACTION", since = null } = {}) {
  try { const list = await pp().listDisputes(null, { state, since }); return { state, since, count: list.length, items: list.map((d) => ({ ...d, job: jobOfCapture(d.capture)?.number || null })) }; }
  catch (e) { return err("paypal", why(e)); }
}
// sandbox only: PayPal decides a test dispute (BUYER_FAVOR / SELLER_FAVOR) or asks a side for evidence
export async function sandboxDecide(id, { outcome = null, ask = null } = {}) {
  const j = job(id), d = j?.paypalDispute;
  if (!d?.paypal?.id) return err("state", "There's no PayPal dispute on this job yet (sync first).");
  try {
    if (outcome) { if (!["BUYER_FAVOR", "SELLER_FAVOR"].includes(outcome)) return err("outcome", "BUYER_FAVOR or SELLER_FAVOR."); await pp().sandboxAdjudicate(d.paypal.id, outcome); d.history.push({ at: nowIso(), event: `sandbox: PayPal decided ${outcome}` }); }
    if (ask) { if (!["BUYER_EVIDENCE", "SELLER_EVIDENCE"].includes(ask)) return err("ask", "BUYER_EVIDENCE or SELLER_EVIDENCE."); await pp().sandboxRequireEvidence(d.paypal.id, ask); d.history.push({ at: nowIso(), event: `sandbox: PayPal asked for ${ask}` }); }
  } catch (e) { return err("paypal", why(e)); }
  save(); await sync(j.id).catch(() => null);
  return view(j);
}
export async function appeal(id, { notes = "" } = {}, actor = { kind: "staff" }) {
  const j = job(id), d = j?.paypalDispute;
  if (actor?.kind !== "staff") return err("forbidden", "Staff appeal a PayPal decision.");
  if (!d?.paypal?.id) return err("state", "There's no PayPal dispute on this job yet (sync first).");
  if (d.appeal) return err("state", "Already appealed once.");
  const n = String(notes || "").trim();
  if (n.length < 20) return err("notes", "Say what PayPal missed (at least a sentence).");
  const p = packet(j);
  try { await pp().appealDispute(d.paypal.id, { notes: `${n.slice(0, 1000)}

${p.notes}`, file: Buffer.from(JSON.stringify(p.receipt || {}, null, 1)), fileName: `${j.number}-receipt.json`, type: evidenceType(j).type }); } catch (e) { return err("paypal", why(e)); }
  d.appeal = { at: nowIso(), notes: n.slice(0, 2000) };
  d.history.push({ at: nowIso(), event: "appealed PayPal's decision with the evidence" });
  save();
  return view(j);
}
// amount: accept only part of the claim (PARTIAL_REFUND); without it, the whole claim
export async function accept(id, { note = "", amount = null } = {}, actor = { kind: "staff" }) {
  const j = job(id), d = j?.paypalDispute;
  if (!d?.paypal?.id) return err("state", "There's no PayPal dispute on this job yet (sync first).");
  if (d.status === "closed") return err("state", "Already closed.");
  const n = String(note || "").trim();
  if (n.length < 6) return err("note", "Say why you're accepting (PayPal shows the buyer this note).");
  try {
    const part = amount != null ? Math.round(+amount) : null;
    if (part != null && !(part > 0 && part < d.amount)) return err("amount", `A partial acceptance is less than the disputed ${usd(d.amount)}.`);
    const r = await pp().acceptClaim(d.paypal.id, { note: n.slice(0, 2000), amount: part });
    d.status = "closed"; d.outcome = { accepted: true, at: nowIso(), note: n.slice(0, 2000), paypal: r.status, amount: part ?? d.amount, partial: part != null };
    d.history.push({ at: nowIso(), event: "claim accepted: PayPal refunds the buyer" });
    save();
    record({ actor: { kind: actor.kind }, who: [j.customer], action: "paypal_dispute_accepted", summary: `${j.number}: PayPal claim accepted (${usd(d.amount)} back to the buyer through PayPal).`, ref: j.id });
    return view(j);
  } catch (e) { return err("paypal", why(e)); }
}
