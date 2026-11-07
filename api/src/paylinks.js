// PayPal Payment Links for a pro: a link the pro sends for a deposit or a small extra (no VeriPay account needed to
// pay). PayPal's Pay Links API makes it; the customer pays at PayPal; the money lands with the platform, which keeps its
// 10% fee and pays the pro with Payouts, as for an invoice. A payment is found with Transaction Search (the link's item
// name and amount, after it was made), so it shows up when PayPal's search does (hours in the sandbox). No evidence
// check: a link is for money agreed in advance, and says so; a job's own payment always goes through the hold.
import crypto from "node:crypto";
import { store, stateFile } from "./store.js";
import { nowIso } from "./clock.js";
import { pro as getPro, payee } from "./pros.js";
import { split, money, FEE_RATE } from "./jobs.js";
import { pp, publicUrl, usd, why } from "./pay/index.js";
import { record } from "./activity.js";

const db = store(stateFile("paylinks"), { links: {}, seq: 100 });
const save = () => db.save();
const err = (error, message) => ({ error, message });
export const linksOf = (proId) => Object.values(db.data.links).filter((l) => l.pro === proId).sort((a, b) => b.created.localeCompare(a.created));
export const all = () => Object.values(db.data.links);
const PURPOSES = { deposit: "Deposit", extra: "Extra work", other: "Payment" };

// notes: up to 3 questions the payer answers at PayPal (default: gate code / access notes); taxPct: sales tax on the line
export async function create(proId, { title, amount, purpose = "deposit", notes = null, taxPct = 0 } = {}) {
  const p = getPro(proId);
  if (!p) return err("pro", "No such pro.");
  const c = Math.round(+amount);
  if (!(c >= 500 && c <= 100000)) return err("amount", "A link is for $5 to $1,000.");
  const t = String(title || "").trim();
  if (t.length < 4) return err("title", "Say what it's for.");
  if (linksOf(proId).filter((l) => l.status === "open").length >= 10) return err("limit", "Ten open links at most.");
  const number = `PL-DP-${++db.data.seq}`, name = `${PURPOSES[purpose] || "Payment"}: ${t.slice(0, 60)} (${number}, ${p.name})`;
  let r;
  const qs = (Array.isArray(notes) ? notes : [{ label: "Gate code or access notes", required: false }]).filter((n) => n?.label).slice(0, 3), tax = Math.max(0, Math.min(20, +taxPct || 0));
  try { r = await pp().createPayLink({ name, amount: c, returnUrl: `${publicUrl()}/pro/invoices?link=${number}`, notes: qs, taxPct: tax }); } catch (e) { return err("paypal", why(e)); }
  const l = { id: `pl_${crypto.randomBytes(4).toString("hex")}`, number, pro: p.id, title: t.slice(0, 80), purpose: PURPOSES[purpose] ? purpose : "other", name, amount: c, paypal: { id: r.id, url: r.url }, status: "open", payments: [], created: nowIso() };
  db.data.links[l.id] = l; save();
  return view(l);
}
// a new price on an open link (PayPal's resource updated in place: the same link)
export async function reprice(proId, id, amount) {
  const l = db.data.links[id], c = Math.round(+amount);
  if (!l || l.pro !== proId) return err("not_found", "No such link.");
  if (l.status !== "open") return err("state", `The link is ${l.status}.`);
  if (!(c >= 500 && c <= 100000)) return err("amount", "A link is for $5 to $1,000.");
  try { await pp().updatePayLinkPrice(l.paypal.id, { amount: c }); } catch (e) { return err("paypal", why(e)); }
  (l.history ||= []).push({ at: nowIso(), event: `price ${l.amount} -> ${c}` }); l.amount = c; save();
  return view(l);
}
export async function close(proId, id) {
  const l = db.data.links[id];
  if (!l || l.pro !== proId) return err("not_found", "No such link.");
  if (l.status !== "open") return err("state", `The link is ${l.status}.`);
  try { await pp().deletePayLink(l.paypal.id); } catch (e) { if (e.status !== 404) return err("paypal", why(e)); }
  l.status = l.payments.length ? "paid" : "closed"; save();
  return view(l);
}
// new payments on an open link: the fee kept, the pro paid with one Payouts item each
export async function sync(l) {
  if (l.status !== "open") return null;
  let found;
  try { found = await pp().payLinkPayments({ name: l.name, amount: l.amount, since: l.created }); delete l.why; } catch (e) { l.why = why(e); return null; }
  const fresh = found.filter((x) => !l.payments.some((y) => y.id === x.id));
  if (!fresh.length) return null;
  const p = getPro(l.pro), to = payee(p);
  for (const x of fresh) {
    const sp = split(x.amount, 0), pay = { id: x.id, amount: x.amount, paypalFee: x.fee || 0, at: x.at || nowIso(), fee: sp.fee, pro: sp.pro, payout: null };
    if (!to) pay.payout = { status: "waiting_for_paypal" };
    else { try { const b = await pp().payoutBatch({ batchId: `${l.id}-${l.payments.length + 1}`, items: [{ id: `${l.number}-${l.payments.length + 1}`, receiver: to, amount: sp.pro, note: `${l.number}: paid through your PayPal link.` }], subject: "VeriPay: your payment link was paid" }); pay.payout = { batchId: b.batchId, status: b.status }; } catch (e) { pay.payout = { status: "failed", why: why(e) }; } }
    l.payments.push(pay);
    if (p.person) record({ actor: { kind: "paypal" }, who: [p.person], action: "paylink_paid", summary: `${l.number} paid ${usd(x.amount)}: ${usd(sp.pro)} to you, ${usd(sp.fee)} platform fee.`, ref: l.id });
  }
  save();
  return l;
}
export async function tick() { const out = []; for (const l of all()) { const r = await sync(l); if (r) out.push({ link: l.number, event: "paid" }); } return out; }
export const view = (l) => ({ id: l.id, number: l.number, title: l.title, purpose: l.purpose, amount: money(l.amount), status: l.status, url: l.status === "open" ? l.paypal.url : null, paypal: { id: l.paypal.id }, feeRate: FEE_RATE,
  payments: l.payments.map((x) => ({ id: x.id, at: x.at, amount: money(x.amount), fee: money(x.fee), pro: money(x.pro), payout: x.payout })), created: l.created, ...(l.why ? { paypalSays: l.why } : {}),
  says: "Paid at PayPal; found with Transaction Search (the sandbox's search lags by hours). VeriPay keeps its fee and pays you with Payouts. No evidence check: for money agreed in advance." });
