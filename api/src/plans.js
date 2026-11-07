// Maintenance plans (PayPal Subscriptions): the customer turns a paid job into a monthly plan with the same pro and the
// same done-conditions. PayPal charges the plan each month; the money lands with the platform and waits there for that
// month's visit to be proven, exactly like a job's hold:
//   pending_approval -> active (the customer approved the subscription at PayPal) <-> paused (suspended) -> cancelled
//   a new price: the pro proposes, the customer accepts (PIN), PayPal's billing plan is repriced
//   each month PayPal charged is a cycle: waiting_for_proof -> paid (checks passed: fee kept, the pro paid with Payouts)
//                                                          -> needs_fix (send what's missing) | review (staff)
//                                                          -> refunded (staff, or no proof within 30 days: PayPal refund)
// The customer starts and cancels a plan on the website (PIN); no agent can. Code decides every payment.
import crypto from "node:crypto";
import { store, stateFile } from "./store.js";
import { nowIso } from "./clock.js";
import * as J from "./jobs.js";
import { pro as getPro, payee } from "./pros.js";
import { checkEvidence } from "./ai.js";
import { decide } from "./rules.js";
import { saveFile, fromDataUrl } from "./evidence.js";
import { pp, usd, why, publicUrl } from "./pay/index.js";
import { record } from "./activity.js";
import { person } from "./people.js";

const db = store(stateFile("plans"), { plans: {}, seq: 100 });
export const plansStore = db;
const save = () => db.save();
const err = (error, message) => ({ error, message });
const RANK = { release: 0, needs_fix: 1, review: 2 };
const PROOF_DAYS = 30;
export const plan = (id) => db.data.plans[id] || null;
export const all = () => Object.values(db.data.plans);
export const plansOf = (personId) => all().filter((p) => p.customer === personId);
export const plansOfPro = (proId) => all().filter((p) => p.pro === proId);

// setupFee: a one-time charge at approval for the first visit's extra work (held for that visit's proof, like a month)
// every: months between visits (1, 3, 6, 12); visits: a fixed number (0 = until cancelled); trial: the first visit
// free; taxPct: sales tax on each charge; units: priced per unit (e.g. per AC unit); startOn: the first charge's date;
// payWith "card": the sandbox test card as the subscriber's card (PayPal activates it at once, no approval page);
// shared: one PayPal plan per cadence with this price as an override (DONE_SHARED_PLANS=1 makes it the default)
export async function create(jobId, { amount = null, setupFee = null, every = 1, visits = 0, trial = false, taxPct = 0, units = 0, startOn = null, payWith = null, shared = process.env.DONE_SHARED_PLANS === "1" } = {}, actor) {
  const j = J.job(jobId);
  if (!j) return err("not_found", "No such job.");
  if (actor?.kind !== "person" || actor.person !== j.customer) return err("forbidden", "The customer starts a plan on the website.");
  if (j.status !== "released" || !j.agreed) return err("state", "A plan is made from a job that was finished and paid.");
  if (all().some((p) => p.job === j.id && ["pending_approval", "active"].includes(p.status))) return err("state", "This job already has a plan.");
  const c = Math.round(amount ?? j.agreed.price);
  if (!(c >= 1000 && c <= 200000)) return err("amount", "A month is from $10 to $2,000.");
  const sf = setupFee ? Math.round(+setupFee) : 0;
  if (sf && !(sf >= 1000 && sf <= 200000 && sf !== c)) return err("setupFee", "A setup fee is from $10 to $2,000 and not the same as the month.");
  if (![1, 3, 6, 12].includes(+every)) return err("every", "every is 1, 3, 6 or 12 months.");
  if (!(Number.isInteger(+visits) && +visits >= 0 && +visits <= 60)) return err("visits", "visits is 0 (until cancelled) to 60.");
  if (!(+taxPct >= 0 && +taxPct <= 20)) return err("taxPct", "taxPct is 0 to 20.");
  if (!(Number.isInteger(+units) && +units >= 0 && +units <= 20)) return err("units", "units is 0 to 20.");
  if (startOn && !(/^\d{4}-\d{2}-\d{2}$/.test(startOn) && Date.parse(startOn) > Date.now() && Date.parse(startOn) < Date.now() + 90 * 864e5)) return err("startOn", "startOn is a date (YYYY-MM-DD) in the next 90 days.");
  if (payWith === "card" && !pp().testCard) return err("test_card", "The sandbox test card is off on this server.");
  const id = `plan_${crypto.randomBytes(5).toString("hex")}`, number = `PLAN-${++db.data.seq}`;
  const checks = j.scope.checks.filter((x) => x.evidence !== "receipt").map((x) => ({ id: x.id, what: x.what, evidence: x.evidence, rule: x.rule }));
  const p = { id, number, job: j.id, jobNumber: j.number, customer: j.customer, pro: j.agreed.pro, proName: j.agreed.proName, title: `Monthly: ${j.scope.title}`.slice(0, 120), amount: c,
    scope: { title: j.scope.title, trade: j.scope.trade, items: j.scope.items || [], checks, window: null }, address: j.address, status: "pending_approval", paypal: null, cycles: [], created: nowIso(), ...(sf ? { setupFee: sf } : {}), every: +every, visits: +visits, trial: !!trial, taxPct: +taxPct || 0, units: +units || 0, startOn: startOn || null, payWith: payWith === "card" ? "card" : "paypal" };
  try {
    const s = await pp().subscribe({ name: `${p.title} (${number})`, amount: c, reference: id, returnUrl: `${publicUrl()}/api/plans/${id}/return`, cancelUrl: `${publicUrl()}/jobs/${j.id}?plan=cancelled`, requestId: id, setupFee: sf,
      every: +every, cycles: +visits, trial: !!trial, taxPct: +taxPct || 0, units: +units || 0, startTime: startOn ? `${startOn}T15:00:00Z` : null, trade: j.scope.trade || null, card: payWith === "card", shared: !!shared,
      subscriber: { name: person(j.customer)?.name || null, email: person(j.customer)?.email || null } });
    p.paypal = { subscription: s.id, plan: s.plan, product: s.product, status: s.status, approveUrl: s.approveUrl, shared: !!s.shared };
  } catch (e) { return err("paypal", why(e)); }
  db.data.plans[id] = p; save();
  if (p.paypal.status === "ACTIVE") await sync(p);
  record({ actor: { kind: "person" }, who: [p.customer], action: "plan_requested", summary: `${number}: ${usd(c)} ${p.every === 1 ? "a month" : `every ${p.every} months`} with ${p.proName}; ${p.paypal.status === "ACTIVE" ? "PayPal activated it on the card" : "approve it at PayPal"}.`, ref: id });
  return view(p);
}

// PayPal's word on the subscription and its payments: a new payment is a new cycle waiting for proof
export async function sync(p) {
  if (!p?.paypal?.subscription || p.status === "cancelled" && p.cycles.every((c) => c.status !== "waiting_for_proof")) return p;
  try {
    const s = await pp().getSubscription(p.paypal.subscription);
    p.paypal.status = s.status; p.paypal.nextBilling = s.nextBilling; delete p.syncError;
    p.paypal.outstanding = s.outstanding || 0; p.paypal.failed = s.failed || 0; p.paypal.lastFailed = s.lastFailed || null; p.paypal.cyclesDone = s.cyclesDone ?? null;
    if (s.status === "ACTIVE" && p.status === "pending_approval") { p.status = "active"; p.activeAt = nowIso(); }
    if (s.status === "CANCELLED" && p.status !== "cancelled") p.status = "cancelled";
    if (s.status === "SUSPENDED" && p.status === "active") p.status = "paused";
    const pays = s.status === "APPROVAL_PENDING" ? [] : await pp().subscriptionPayments(p.paypal.subscription, { since: p.created }); // PayPal answers 404 before approval
    for (const x of pays.filter((y) => y.status === "COMPLETED" && !p.cycles.some((c) => c.payment === y.id))) {
      const setup = !!p.setupFee && x.amount === p.setupFee && !p.cycles.some((c) => c.setup);
      p.cycles.push({ n: p.cycles.length + 1, ...(setup ? { setup: true } : {}), payment: x.id, amount: x.amount ?? p.amount, paypalFee: x.fee ?? null, at: x.at || nowIso(), status: "waiting_for_proof", evidence: [], checks: [], ledger: [{ kind: "subscription_payment", amount: x.amount ?? p.amount, ref: x.id, at: nowIso() }] });
      record({ actor: { kind: "paypal" }, who: [getPro(p.pro)?.person, p.customer].filter(Boolean), action: "plan_cycle_paid", summary: `${p.number} ${setup ? "setup fee (the first visit's extra work)" : `month ${p.cycles.length}`}: ${usd(x.amount ?? p.amount)} charged by PayPal, held until the visit is proven.`, ref: p.id });
    }
    save();
  } catch (e) { p.syncError = why(e); save(); }
  return p;
}

const mineAsPro = (proId, id) => { const p = plan(id); return p && p.pro === proId ? p : null; };
const cycleOf = (p, n) => p?.cycles.find((c) => c.n === +n) || null;
export function addEvidence(proId, id, n, items) {
  const p = mineAsPro(proId, id), c = cycleOf(p, n);
  if (!c) return err("not_found", "No such plan month.");
  if (!["waiting_for_proof", "needs_fix"].includes(c.status)) return err("state", `Month ${c.n} is ${c.status}.`);
  for (const x of (Array.isArray(items) ? items : [items]).slice(0, 12)) {
    let buf = x.buf, mime = x.mime;
    if (!buf && x.dataUrl) { const d = fromDataUrl(x.dataUrl); if (!d) return err("file", "dataUrl isn't a data: URL."); buf = d.buf; mime = d.mime; }
    const e = saveFile(`${p.id}-${c.n}`, { buf, mime, kind: x.kind || (buf ? "photo" : "note"), name: x.name, text: x.text, checkId: x.checkId || null, uploadedAt: nowIso() });
    if (e.error) return e;
    e.round = c.checks.length + 1;
    c.evidence.push(e);
  }
  save();
  return view(p);
}
// the month's check: the same checker and the same code decision as a job; only "release" pays the pro
export async function submit(proId, id, n) {
  const p = mineAsPro(proId, id), c = cycleOf(p, n);
  if (!c) return err("not_found", "No such plan month.");
  if (!["waiting_for_proof", "needs_fix"].includes(c.status)) return err("state", `Month ${c.n} is ${c.status}.`);
  if (!c.evidence.length) return err("evidence", "Send the evidence first.");
  const asJob = { id: `${p.id}-${c.n}`, number: `${p.number}-${c.n}`, scope: p.scope, address: p.address, window: null, changeOrders: [], agreed: { at: c.at, price: c.amount, parts: 0 }, created: c.at };
  const ev = c.evidence.slice().reverse().map((e) => ({ id: e.id, kind: e.kind, path: e.path, uploadedAt: e.uploadedAt, text: e.text, name: e.name, checkId: e.checkId, sha: e.sha, exif: e.exif, round: e.round }));
  const r = await checkEvidence(asJob, ev);
  const byId = Object.fromEntries((r.checks || []).map((x) => [x.id, x]));
  const checks = p.scope.checks.map((x) => byId[x.id] ? { id: x.id, what: x.what, verdict: byId[x.id].verdict, ...(byId[x.id].needsPerson ? { needsPerson: true } : {}), reason: String(byId[x.id].reason || "").slice(0, 400), signals: byId[x.id].signals || [] } : { id: x.id, what: x.what, verdict: "needs_fix", reason: "No verdict.", signals: ["no_verdict"] });
  let decision = decide(checks);
  if (RANK[r.decision] > RANK[decision]) decision = r.decision;
  c.checks.push({ round: c.checks.length + 1, at: nowIso(), checks, decision, decidedBy: "rules (code), over the checker's verdicts", checker: r.source || "unknown" });
  if (decision !== "release") { c.status = decision; save(); return view(p); }
  return payPro(p, c, "every done-condition passed");
}
async function payPro(p, c, because) {
  const sp = J.split(c.amount, 0), pr = getPro(p.pro), to = payee(pr);
  c.ledger.push({ kind: "platform_fee", amount: sp.fee, at: nowIso() }, { kind: "pro_payout", amount: sp.pro, to: pr.id, at: nowIso() });
  c.status = "paid"; c.paidAt = nowIso(); c.because = because; c.split = sp;
  if (!to) c.payout = { status: "waiting_for_paypal", at: nowIso() };
  else {
    try { const b = await pp().payoutBatch({ batchId: `${p.id}-${c.n}-payout`, items: [{ id: `${p.number}-${c.n}-pro`, receiver: to, amount: sp.pro, note: `${p.number} month ${c.n}: the visit was proven.` }], subject: "VeriPay: your plan visit was paid" });
      c.payout = { batchId: b.batchId, status: b.status, amount: sp.pro, at: nowIso() }; }
    catch (e) { c.payout = { status: "failed", why: why(e), at: nowIso() }; }
  }
  save();
  record({ actor: { kind: "platform" }, who: [pr.person, p.customer].filter(Boolean), action: "plan_cycle_released", summary: `${p.number} month ${c.n}: ${usd(sp.pro)} to ${p.proName} (${because}).`, ref: p.id });
  return view(p);
}
// the month's money back to the customer (staff after a review, or no proof within 30 days)
async function refund(p, c, because) {
  try { const r = await pp().refundSubscriptionPayment(c.payment, { amount: c.amount, requestId: `${p.id}-${c.n}-refund` }); c.ledger.push({ kind: "refund", amount: c.amount, ref: r.id, at: nowIso() }); }
  catch (e) { return err("paypal", why(e)); }
  c.status = "refunded"; c.refundedAt = nowIso(); c.because = because; save();
  record({ actor: { kind: "platform" }, who: [p.customer, getPro(p.pro)?.person].filter(Boolean), action: "plan_cycle_refunded", summary: `${p.number} month ${c.n}: ${usd(c.amount)} back to the customer (${because}).`, ref: p.id });
  return view(p);
}
export async function staffDecide(id, n, { pay = false, note = "" } = {}) {
  const p = plan(id), c = cycleOf(p, n);
  if (!c || !["review", "needs_fix", "waiting_for_proof"].includes(c.status)) return err("state", "Nothing to decide on that month.");
  return pay ? payPro(p, c, `staff after review${note ? `: ${String(note).slice(0, 200)}` : ""}`) : refund(p, c, `staff${note ? `: ${String(note).slice(0, 200)}` : ""}`);
}
export async function cancel(id, actor) {
  const p = plan(id);
  if (!p) return err("not_found", "No such plan.");
  if (actor?.kind !== "person" || actor.person !== p.customer) return err("forbidden", "The customer cancels a plan on the website.");
  if (!["pending_approval", "active", "paused"].includes(p.status)) return err("state", `The plan is ${p.status}.`);
  try { if (p.paypal?.subscription && ["active", "paused"].includes(p.status)) { await pp().cancelSubscription(p.paypal.subscription, "Cancelled by the customer on VeriPay"); p.paypal.status = "CANCELLED"; p.paypal.nextBilling = null; } } catch (e) { return err("paypal", why(e)); }
  p.status = "cancelled"; p.cancelledAt = nowIso();
  // the plan's own PayPal billing plan is retired with it (a shared one stays for the others)
  if (p.paypal?.plan && !p.paypal.shared) { try { await pp().deactivatePlan(p.paypal.plan); p.paypal.planStatus = "INACTIVE"; } catch (e) { p.paypal.planStatus = `not deactivated: ${why(e)}`; } }
  save();
  return view(p);
}
// the customer pauses (PayPal stops charging) and resumes a plan, on the website (PIN)
export async function pause(id, actor, resume = false) {
  const p = plan(id);
  if (!p) return err("not_found", "No such plan.");
  if (actor?.kind !== "person" || actor.person !== p.customer) return err("forbidden", "The customer pauses or resumes a plan on the website.");
  if (p.status !== (resume ? "paused" : "active")) return err("state", resume ? "Only a paused plan resumes." : "Only an active plan pauses.");
  try { if (resume) await pp().activateSubscription(p.paypal.subscription, "Resumed by the customer on VeriPay"); else await pp().suspendSubscription(p.paypal.subscription, "Paused by the customer on VeriPay"); } catch (e) { return err("paypal", why(e)); }
  p.status = resume ? "active" : "paused"; (p.history ||= []).push({ at: nowIso(), event: resume ? "resumed" : "paused" }); save();
  record({ actor: { kind: "person" }, who: [p.customer, getPro(p.pro)?.person].filter(Boolean), action: resume ? "plan_resumed" : "plan_paused", summary: `${p.number} ${resume ? "resumed: PayPal charges it again" : "paused: PayPal won't charge it until it's resumed"}.`, ref: p.id });
  return view(p);
}
// a new monthly price: the pro proposes it, the customer accepts it (PIN); then PayPal's billing plan is repriced
// a month PayPal couldn't charge (the card declined): the customer, with their PIN, has PayPal charge the outstanding
// balance now; the payment then arrives as that month, held for the visit's proof like any other
export async function payOutstanding(id, actor) {
  const p = plan(id);
  if (!p) return err("not_found", "No such plan.");
  if (!(actor?.kind === "person" && actor.person === p.customer)) return err("forbidden", "Only the customer, on the website.");
  await sync(p);
  if (!(p.paypal?.outstanding > 0)) return err("state", "Nothing is outstanding.");
  try { await pp().captureSubscriptionBalance(p.paypal.subscription, { amount: p.paypal.outstanding, note: `${p.number}: the month PayPal couldn't charge`, requestId: `${p.id}:outstanding:${p.cycles.length}` }); } catch (e) { return err("paypal", why(e)); }
  (p.history ||= []).push({ at: nowIso(), event: `charged the outstanding ${usd(p.paypal.outstanding)}` });
  await sync(p);
  return view(p);
}
export function proposePrice(proId, id, amount) {
  const p = mineAsPro(proId, id);
  if (!p) return err("not_found", "No such plan.");
  if (!["active", "paused"].includes(p.status)) return err("state", `The plan is ${p.status}.`);
  const c = Math.round(+amount);
  if (!(c >= 1000 && c <= 200000) || c === p.amount) return err("amount", "A new month price from $10 to $2,000, different from now.");
  p.priceChange = { amount: c, at: nowIso() }; save();
  record({ actor: { kind: "pro" }, who: [p.customer], action: "plan_price_proposed", summary: `${p.number}: ${p.proName} asks ${usd(c)} a month instead of ${usd(p.amount)}. Accept it on the website.`, ref: p.id });
  return view(p);
}
export async function acceptPrice(id, actor) {
  const p = plan(id);
  if (!p?.priceChange) return err("state", "No price change to accept.");
  if (actor?.kind !== "person" || actor.person !== p.customer) return err("forbidden", "The customer accepts a new price on the website.");
  // a shared plan: only this subscription's price changes (PATCH the subscription); else the plan's own price
  try { if (p.paypal.shared) await pp().patchSubscriptionPrice(p.paypal.subscription, { amount: p.priceChange.amount }); else await pp().updatePlanPrice(p.paypal.plan, { amount: p.priceChange.amount, sequence: p.trial ? 2 : 1 }); } catch (e) { return err("paypal", why(e)); }
  (p.history ||= []).push({ at: nowIso(), event: `price ${usd(p.amount)} -> ${usd(p.priceChange.amount)}` });
  p.amount = p.priceChange.amount; delete p.priceChange; save();
  return view(p);
}
// more or fewer units (e.g. a second AC unit): PayPal asks the customer to approve the change (revise)
export async function changeUnits(id, units, actor) {
  const p = plan(id), u = Math.round(+units);
  if (!p) return err("not_found", "No such plan.");
  if (actor?.kind !== "person" || actor.person !== p.customer) return err("forbidden", "The customer changes the plan on the website.");
  if (!p.units) return err("state", "This plan isn't priced per unit.");
  if (!(u >= 1 && u <= 20) || u === p.units) return err("units", "A new number of units, 1 to 20.");
  try { const r = await pp().reviseSubscription(p.paypal.subscription, { units: u, returnUrl: `${publicUrl()}/api/plans/${p.id}/return`, cancelUrl: `${publicUrl()}/jobs/${p.job}` }); p.unitsChange = { to: u, approveUrl: r.approveUrl, at: nowIso() }; save(); return { ...view(p), approveUrl: r.approveUrl }; }
  catch (e) { return err("paypal", why(e)); }
}
// staff: how many failed charges before PayPal suspends a plan's subscription (the plan's own billing plan)
export async function setFailureThreshold(id, n) {
  const p = plan(id), k = Math.round(+n);
  if (!p?.paypal?.plan) return err("not_found", "No such plan.");
  if (!(k >= 1 && k <= 5)) return err("threshold", "1 to 5.");
  try { await pp().patchPlan(p.paypal.plan, { failureThreshold: k }); } catch (e) { return err("paypal", why(e)); }
  p.failureThreshold = k; save(); return view(p);
}
export async function tick() {
  const out = [];
  for (const p of all()) {
    await sync(p);
    for (const c of p.cycles.filter((x) => ["waiting_for_proof", "needs_fix"].includes(x.status) && Date.now() - Date.parse(x.at) > PROOF_DAYS * 864e5)) { await refund(p, c, `no proof within ${PROOF_DAYS} days`); out.push({ plan: p.number, month: c.n, event: "refunded" }); }
  }
  return out;
}
export function view(p) {
  const m = J.money;
  return { id: p.id, number: p.number, job: p.job, jobNumber: p.jobNumber, pro: p.pro, proName: p.proName, title: p.title, amount: m(p.amount), status: p.status, scope: p.scope,
    priceChange: p.priceChange ? { amount: m(p.priceChange.amount), at: p.priceChange.at } : null, history: p.history || [],
    paypal: p.paypal && { subscription: p.paypal.subscription, status: p.paypal.status, nextBilling: p.paypal.nextBilling || null, outstanding: p.paypal.outstanding ? m(p.paypal.outstanding) : null, approveUrl: p.status === "pending_approval" ? p.paypal.approveUrl : undefined },
    setupFee: p.setupFee ? m(p.setupFee) : null, every: p.every || 1, visits: p.visits || 0, trial: !!p.trial, taxPct: p.taxPct || 0, units: p.units || 0, startOn: p.startOn || null, payWith: p.payWith || "paypal", failureThreshold: p.failureThreshold || 2,
    lastFailed: p.paypal?.lastFailed ? { ...p.paypal.lastFailed, amount: m(p.paypal.lastFailed.amount) } : null, cyclesDone: p.paypal?.cyclesDone ?? null, unitsChange: p.unitsChange || null, cycles: p.cycles.map((c) => ({ n: c.n, setup: !!c.setup, payment: c.payment, amount: m(c.amount), at: c.at, status: c.status, because: c.because || null, lastCheck: c.checks.at(-1) || null, evidence: c.evidence.map((e) => ({ id: e.id, kind: e.kind, checkId: e.checkId, name: e.name })), payout: c.payout || null, ledger: c.ledger.map((l) => ({ ...l, amount: m(l.amount) })), proofDue: new Date(Date.parse(c.at) + PROOF_DAYS * 864e5).toISOString() })),
    says: "PayPal charges the plan each month; the money waits with VeriPay until that month's visit is proven, then the pro is paid. No proof in 30 days: the month is refunded.",
    created: p.created, ...(p.syncError ? { syncError: p.syncError } : {}) };
}
