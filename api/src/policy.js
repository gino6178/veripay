// A policy, from a quote to its end, and every premium it pays through PayPal.
//   awaiting_payment -> active -> (grace -> active | lapsed -> active) -> expired | cancelled
//   review: a quote underwriting sends to a person first (pending approval on the underwriting desk)
// Premiums: yearly (one PayPal payment) or monthly. Monthly is charged by Cover on its own schedule to the PayPal the
// person saved in the Vault with their first payment (billing "vault"), or billed by PayPal Subscriptions (billing
// "subscription"). A monthly charge that fails starts the grace period (14 days, 30 for life): cover goes on, and the
// person gets a PayPal invoice for it; unpaid at the end, the policy lapses until it is paid (reinstate).
// Changing a policy prices it again at once; the rest of the current period is charged or refunded. Cancelling refunds
// the days not used. Every premium and refund is posted to the cause's pool (pool.js).
import crypto from "node:crypto";
import { store, stateFile } from "./store.js";
import { now, nowIso, DAY } from "./clock.js";
import { product } from "./products/index.js";
import { quote as makeQuote, getQuote, limits } from "./quote.js";
import { person, updatePerson } from "./people.js";
import { post, postSplit, causesOf, checkCauses, DEFAULT_CAUSE, CAUSES } from "./pool.js";
import { record } from "./activity.js";
import { statusOf } from "./flights.js";
import { pp, publicUrl, usd, why } from "./pay/index.js";

const db = store(stateFile("policies"), { policies: {} });
export const policiesStore = db;
const MONTH = 365 * DAY / 12, YEAR = 365 * DAY;
export const policy = (id) => db.data.policies[id] || null;
// where a policy's money goes: its causes and shares (older policies have one cause)
export const causesOfPolicy = (pol) => pol.causes || causesOf(pol.cause);
export const topCause = (pol) => Object.entries(causesOfPolicy(pol)).sort((a, b) => b[1] - a[1])[0][0];
export const policiesOf = (personId) => Object.values(db.data.policies).filter((p) => p.person === personId);
export const allPolicies = () => Object.values(db.data.policies);
const graceDays = (p) => (p.product === "life" ? 30 : 14);
const say = (p, action, summary, data = null, actor = { kind: "platform" }) => record({ actor, who: [p.person], action, summary, ref: p.id, data });
const save = () => db.save();

// Buy what a quote priced. plan: "monthly" | "yearly"; billing: "vault" | "subscription" (monthly only)
export async function buy(personId, { quote: qid, plan = "monthly", billing = "vault", cause, causes, beneficiaries, items, pay = "paypal", actor }) {
  const who = person(personId), q = getQuote(qid);
  if (!who) return { error: "person" };
  if (!q || (q.person && q.person !== personId)) return { error: "quote", message: "No such quote for this person: get one with get_quote." };
  if (Date.parse(q.expires) < now()) return { error: "quote_expired", message: "That quote has expired: get a new one." };
  const badCause = checkCauses(causes ?? cause);
  if (badCause) return { error: "cause", message: badCause };
  const p = product(q.product);
  if (p.term === "trip") { plan = "trip"; billing = "vault"; }
  else if (!["monthly", "yearly"].includes(plan)) return { error: "plan", message: "plan is monthly or yearly." };
  if (plan === "yearly") billing = "vault";
  // TR-3.1: a flight already delayed or cancelled can't be insured
  if (p.term === "trip") for (const f of q.answers.flights || []) { const st = await statusOf(f, q.answers.destination); if (st.firstSeenDisrupted) return { error: "known_disruption", message: `${f.flight} on ${f.date} is already ${st.status === "cancelled" ? "cancelled" : `${Math.round(st.delayMin / 60 * 10) / 10} hours late`}; a disruption known before buying isn't covered (TR-3.1).` }; }
  if (p.beneficiaries) {
    const b = Array.isArray(beneficiaries) ? beneficiaries : [];
    if (!b.length || b.reduce((t, x) => t + (+x.share || 0), 0) !== 100 || b.some((x) => !String(x.name || "").trim())) return { error: "beneficiaries", message: "Name at least one beneficiary, with shares adding up to 100 (beneficiaries: [{ name, relation, share }])." };
  }
  const id = `pol_${crypto.randomBytes(5).toString("hex")}`;
  const pol = { id, person: personId, product: q.product, quote: q.id, answers: q.answers, addons: q.addons, zone: q.zone, annual: q.annual, monthly: q.monthly, reinsShare: q.breakdown.reinsurance / q.annual,
    coverages: q.coverages, deductible: q.deductible, plan, billing, causes: causesOf(causes ?? cause ?? who.causes ?? who.cause),
    beneficiaries: p.beneficiaries ? beneficiaries.map((x) => ({ name: String(x.name).slice(0, 60), relation: String(x.relation || "").slice(0, 30), share: +x.share })) : undefined,
    items: Array.isArray(items) ? items.slice(0, 20).map((x) => ({ what: String(x.what || "").slice(0, 80), value: Math.round(+x.value * 100) || 0 })) : undefined,
    status: q.decision === "review" ? "review" : "awaiting_payment", created: nowIso(), start: null, end: null, nextDue: null, waitingUntil: null,
    payWith: pay === "card" && pp().testCard ? "card" : "paypal", payments: [], changes: [], number: `CV-${q.product.slice(0, 2).toUpperCase()}-${Date.now().toString(36).toUpperCase().slice(-6)}` };
  db.data.policies[id] = pol; save();
  say(pol, "policy_created", `${who.name} chose ${p.name.en} (${plan === "trip" ? `one trip, ${usd(pol.annual)}` : `${plan}${plan === "monthly" ? `, ${usd(pol.monthly)} a month` : `, ${usd(pol.annual)} a year`}`}).`, { quote: q.id }, actor);
  if (pol.status === "review") return view(pol);
  return startFirstPayment(pol);
}

// The first premium. With saved PayPal (from an earlier policy) it is charged at once; otherwise the person approves
// it in PayPal, and their PayPal is saved in the same approval for the monthly premiums.
async function startFirstPayment(pol) {
  const who = person(pol.person), amount = pol.plan === "monthly" ? pol.monthly : pol.annual;
  if (pol.billing === "subscription") {
    try {
      const plan = await pp().subscriptionPlan({ name: `${pol.number} ${product(pol.product).name.en}`, monthly: pol.monthly, requestId: `${pol.id}:plan` });
      const s = await pp().subscribe({ planId: plan.id, reference: pol.id, returnUrl: `${publicUrl()}/paypal/return?policy=${pol.id}`, cancelUrl: `${publicUrl()}/policies?cancelled=${pol.id}`, requestId: `${pol.id}:sub` });
      pol.subscription = { plan: plan.id, id: s.id, status: s.status }; pol.approveUrl = s.approveUrl; save();
      return view(pol);
    } catch (e) { return { ...view(pol), error: "paypal", message: why(e) }; }
  }
  try {
    const r = await pp().createPayment({ amount, reference: pol.id, description: `${product(pol.product).name.en} ${pol.number}: first premium`, returnUrl: `${publicUrl()}/paypal/return?policy=${pol.id}`, cancelUrl: `${publicUrl()}/policies?cancelled=${pol.id}`,
      vaultId: who.vault || null, save: !who.vault, card: pol.payWith === "card", requestId: `${pol.id}:first` });
    pol.payments.push({ n: 1, kind: "premium", amount, order: r.id, status: r.status, at: nowIso() });
    if (r.status === "COMPLETED") { settleFirst(pol, r); return view(pol); }
    pol.approveUrl = r.approveUrl; save();
    return view(pol);
  } catch (e) { return { ...view(pol), error: "paypal", message: why(e) }; }
}

// Pay a waiting first premium with PayPal's published sandbox test card instead (judges have no sandbox buyer login;
// sandbox only, PAYPAL_TEST_CARD=1). The waiting PayPal order is simply left unapproved.
export async function payByCard(id) {
  const pol = policy(id);
  if (!pol || pol.status !== "awaiting_payment" || pol.billing === "subscription") return { error: "policy", message: "Only a policy waiting for its first payment." };
  if (!pp().testCard) return { error: "test_card", message: "The sandbox test card is off (PAYPAL_TEST_CARD)." };
  const amount = pol.plan === "monthly" ? pol.monthly : pol.annual;
  try {
    const r = await pp().createPayment({ amount, reference: pol.id, description: `${product(pol.product).name.en} ${pol.number}: first premium`, save: true, card: true, requestId: `${pol.id}:first:card` });
    pol.payments = [{ n: 1, kind: "premium", amount, order: r.id, status: r.status, at: nowIso(), card: true }];
    if (r.status !== "COMPLETED") { save(); return { ...view(pol), error: "paypal", message: `PayPal answered ${r.status}` }; }
    pol.payWith = "card"; settleFirst(pol, r);
  } catch (e) { return { ...view(pol), error: "paypal", message: why(e) }; }
  return view(pol);
}

// The person came back from PayPal (or a webhook says they approved): capture the first premium and start the policy
export async function confirm(id) {
  const pol = policy(id);
  if (!pol) return { error: "policy" };
  if (pol.status !== "awaiting_payment") return view(pol);
  if (pol.billing === "subscription") {
    const s = await pp().getSubscription(pol.subscription.id).catch(() => null);
    if (s?.status !== "ACTIVE") return { ...view(pol), note: "PayPal hasn't confirmed the subscription yet." };
    pol.subscription.status = "ACTIVE";
    activate(pol);
    if (s.lastPayment) premiumPaid(pol, s.lastPayment.amount, { subscription: s.id, n: 1 });
    return view(pol);
  }
  const first = pol.payments[0];
  try {
    const r = await pp().captureOrder(first.order, `${pol.id}:first:capture`);
    settleFirst(pol, r);
  } catch (e) { return { ...view(pol), error: "paypal", message: why(e) }; }
  return view(pol);
}
function settleFirst(pol, r) {
  const first = pol.payments[0];
  first.status = "COMPLETED"; first.capture = r.capture?.id; first.fee = r.capture?.fee ?? null;
  if (r.vaultId) updatePerson(pol.person, { vault: r.vaultId });
  activate(pol);
  premiumPaid(pol, first.amount, { capture: first.capture, n: 1 });
}
function activate(pol) {
  const t = now(), p = product(pol.product);
  // a trip is covered from purchase to the day after it comes home; everything else for a year
  const end = p.term === "trip" ? Date.parse(`${pol.answers.return}T23:59:59Z`) + DAY : t + YEAR;
  pol.status = "active"; pol.start = new Date(t).toISOString(); pol.end = new Date(end).toISOString();
  pol.nextDue = pol.plan === "monthly" ? new Date(t + MONTH).toISOString() : null; pol.paidUntil = new Date(pol.plan === "monthly" ? t + MONTH : end).toISOString();
  pol.waitingUntil = p.waitingDays ? new Date(t + p.waitingDays * DAY).toISOString() : null;
  delete pol.approveUrl; save();
  say(pol, "policy_active", `Policy ${pol.number} started: ${p.name.en}, cover until ${pol.end.slice(0, 10)}.${pol.waitingUntil ? ` Claims other than ${p.id === "pet" ? "accidents" : "fire and theft"} are paid from ${pol.waitingUntil.slice(0, 10)} (waiting period).` : ""}`);
}
function premiumPaid(pol, amount, ref) {
  postSplit({ kind: "premium", causes: causesOfPolicy(pol), amount, policy: pol.id, product: pol.product, ref: ref.capture || ref.subscription || ref.invoice || null });
  say(pol, "premium_paid", `Premium ${usd(amount)} paid in PayPal: ${usd(Math.round(amount * 0.8))} to the claims pool, ${usd(Math.round(amount * 0.2))} Cover's fee.`, ref, { kind: "paypal" });
}

// Cover's billing run (every minute, and after the demo clock moves): charge monthly premiums that are due, start
// grace periods, lapse what grace didn't save, reinstate what an invoice paid, and end policies whose year is over.
export async function tick() {
  const t = now(), out = [];
  for (const pol of allPolicies()) {
    if (["active", "grace"].includes(pol.status) && pol.end && Date.parse(pol.end) <= t) { pol.status = "expired"; save(); say(pol, "policy_expired", `Policy ${pol.number} came to the end of its year.`); out.push([pol.id, "expired"]); continue; }
    if (pol.status === "grace" && pol.invoice) {
      const inv = await pp().getInvoice(pol.invoice.id).catch(() => null);
      if (inv?.status === "PAID" || inv?.paid >= pol.invoice.amount) { reinstate(pol, pol.invoice.amount, { invoice: pol.invoice.id }); out.push([pol.id, "paid by invoice"]); continue; }
      if (Date.parse(pol.graceUntil) <= t) { pol.status = "lapsed"; pol.lapsedAt = pol.graceUntil; save(); say(pol, "policy_lapsed", `Policy ${pol.number} lapsed: the ${usd(pol.invoice.amount)} premium wasn't paid in the grace period. Paying the invoice reinstates it; anything that happens while it is lapsed isn't covered.`); out.push([pol.id, "lapsed"]); }
      continue;
    }
    if (pol.status === "lapsed" && pol.invoice) {
      const inv = await pp().getInvoice(pol.invoice.id).catch(() => null);
      if (inv?.status === "PAID") { reinstate(pol, pol.invoice.amount, { invoice: pol.invoice.id }); out.push([pol.id, "reinstated"]); }
      continue;
    }
    if (pol.status === "active" && pol.plan === "monthly" && pol.billing === "vault" && pol.nextDue && Date.parse(pol.nextDue) <= t) out.push([pol.id, await chargeMonth(pol)]);
    if (pol.status === "active" && pol.billing === "subscription" && pol.subscription) {
      const s = await pp().getSubscription(pol.subscription.id).catch(() => null);
      const n = pol.payments.filter((x) => x.subscription).length;
      if (s?.lastPayment && s.lastPayment.at && !pol.payments.some((x) => x.at === s.lastPayment.at)) { pol.payments.push({ n: n + 1, kind: "premium", amount: s.lastPayment.amount, subscription: s.id, status: "COMPLETED", at: s.lastPayment.at }); premiumPaid(pol, s.lastPayment.amount, { subscription: s.id }); }
    }
  }
  return out;
}
async function chargeMonth(pol) {
  const who = person(pol.person), n = pol.payments.filter((x) => x.kind === "premium").length + 1, amount = pol.monthly;
  try {
    if (!who.vault) throw new Error("no saved PayPal");
    const r = await pp().createPayment({ amount, reference: pol.id, description: `${product(pol.product).name.en} ${pol.number}: premium ${n} of 12`, vaultId: who.vault, requestId: `${pol.id}:premium:${n}` });
    pol.payments.push({ n, kind: "premium", amount, order: r.id, capture: r.capture?.id, fee: r.capture?.fee ?? null, status: "COMPLETED", at: nowIso() });
    pol.nextDue = new Date(Date.parse(pol.nextDue) + MONTH).toISOString(); pol.paidUntil = pol.nextDue; save();
    premiumPaid(pol, amount, { capture: r.capture?.id, n });
    return "charged";
  } catch (e) {
    pol.status = "grace"; pol.graceUntil = new Date(Date.parse(pol.nextDue) + graceDays(pol) * DAY).toISOString(); pol.failed = { n, amount, at: nowIso(), why: why(e) };
    try {
      const inv = await pp().invoice({ recipient: who.email || `${who.id}@cover-demo.example`, item: `${product(pol.product).name.en} ${pol.number}: premium ${n}`, amount, note: `Your monthly premium couldn't be charged to your saved PayPal. Your cover goes on until ${pol.graceUntil.slice(0, 10)}; pay this to keep it.`, requestId: `${pol.id}:invoice:${n}` });
      pol.invoice = { id: inv.id, url: inv.url, amount, n };
    } catch (e2) { pol.invoice = null; }
    save();
    say(pol, "premium_failed", `The ${usd(amount)} premium couldn't be charged (${pol.failed.why}). Cover goes on until ${pol.graceUntil.slice(0, 10)} (grace period)${pol.invoice ? "; a PayPal invoice for it was sent" : ""}.`);
    return "failed: grace";
  }
}
function reinstate(pol, amount, ref) {
  const n = pol.invoice?.n || pol.payments.length + 1;
  pol.payments.push({ n, kind: "premium", amount, invoice: ref.invoice, status: "COMPLETED", at: nowIso() });
  const was = pol.status;
  pol.status = "active"; pol.nextDue = new Date(Date.parse(pol.nextDue) + MONTH).toISOString(); pol.paidUntil = pol.nextDue;
  if (was === "lapsed") pol.gaps = [...(pol.gaps || []), { from: pol.lapsedAt, to: nowIso() }];
  delete pol.invoice; delete pol.graceUntil; delete pol.failed; delete pol.lapsedAt; save();
  premiumPaid(pol, amount, ref);
  say(pol, was === "lapsed" ? "policy_reinstated" : "grace_cleared", was === "lapsed" ? `Policy ${pol.number} is reinstated. Nothing that happened while it was lapsed is covered.` : `The premium was paid by invoice: policy ${pol.number} is in good standing.`);
}

// Was the policy in force on a date? (claims ask this: not before it started, not in a lapse, not after it ended)
export function inForce(pol, at) {
  const t = Date.parse(at);
  if (!pol.start || t < Date.parse(pol.start) || t > Date.parse(pol.end)) return { ok: false, why: "outside the policy's dates" };
  if (pol.status === "cancelled" && t > Date.parse(pol.cancelledAt)) return { ok: false, why: "after the policy was cancelled" };
  if (pol.status === "lapsed" && t >= Date.parse(pol.lapsedAt)) return { ok: false, why: "while the policy was lapsed" };
  for (const g of pol.gaps || []) if (t >= Date.parse(g.from) && t < Date.parse(g.to)) return { ok: false, why: "while the policy was lapsed" };
  return { ok: true };
}

// The part of the current paid period not yet used, as a share (0 to 1). A trip refunds in full until its first insured
// flight leaves, and nothing after (TR-6.1).
function unused(pol) {
  const t = now(), until = Date.parse(pol.paidUntil), len = pol.plan === "monthly" ? MONTH : YEAR;
  if (pol.plan === "trip") { const first = Math.min(...(pol.answers.flights || []).map((f) => Date.parse(`${f.date}T00:00:00Z`))); return t < first ? 1 : 0; }
  return Math.max(0, Math.min(1, (until - t) / len));
}
// Money back to the person: refunded against their latest premium captures, newest first
async function refund(pol, amount, step) {
  let left = amount; const done = [];
  for (const pay of [...pol.payments].reverse()) {
    if (left <= 0) break;
    if (pay.kind !== "premium" || !pay.capture) continue;
    const room = pay.amount - (pay.refunded || 0), take = Math.min(room, left);
    if (take <= 0) continue;
    const r = await pp().refund(pay.capture, { amount: take, requestId: `${pol.id}:${step}:${pay.n}` });
    pay.refunded = (pay.refunded || 0) + take; left -= take; done.push({ capture: pay.capture, amount: take, id: r.id });
  }
  const sent = amount - left;
  if (sent > 0) postSplit({ kind: "refund", causes: causesOfPolicy(pol), amount: sent, policy: pol.id, product: pol.product, ref: done.map((d) => d.id).join(",") });
  return { sent, done };
}
// A one-off charge to saved PayPal (a change that costs more)
async function charge(pol, amount, step, description) {
  const who = person(pol.person);
  if (!who.vault) return { error: "no_vault" };
  const r = await pp().createPayment({ amount, reference: pol.id, description, vaultId: who.vault, requestId: `${pol.id}:${step}` });
  pol.payments.push({ n: pol.payments.length + 1, kind: "premium", amount, order: r.id, capture: r.capture?.id, status: "COMPLETED", at: nowIso(), adjustment: step });
  premiumPaid(pol, amount, { capture: r.capture?.id });
  return { charged: amount };
}

// Change a policy: new answers or add-ons, priced again at once. The rest of the current period is charged or refunded
// (to the cent); from the next premium, the new price.
export async function change(id, { answers = {}, addons, items, beneficiaries, actor } = {}) {
  const pol = policy(id);
  if (!pol || !["active", "grace"].includes(pol.status)) return { error: "policy", message: "Only an active policy can be changed." };
  const p = product(pol.product);
  if (pol.product === "life" && answers.amount && +answers.amount > +pol.answers.amount) return { error: "underwriting", message: "Raising life cover needs new underwriting: buy a new policy for the extra amount." };
  const q = makeQuote(pol.product, { ...pol.answers, ...answers }, { addons: addons ?? pol.addons, person: pol.person });
  if (q.error) return q;
  if (q.decision !== "ok") return { error: "underwriting", message: q.why || q.note };
  const nq = getQuote(q.quote), share = unused(pol);
  const before = pol.plan === "monthly" ? pol.monthly : pol.annual, after = pol.plan === "monthly" ? nq.monthly : nq.annual;
  const diff = Math.round((after - before) * share);
  const step = `change:${pol.changes.length + 1}`;
  let money = null;
  try {
    if (diff > 0) money = await charge(pol, diff, step, `${p.name.en} ${pol.number}: change`);
    if (diff < 0) money = await refund(pol, -diff, step);
  } catch (e) { return { error: "paypal", message: why(e) }; }
  if (money?.error) return { error: "paypal", message: "No saved PayPal to charge the difference to." };
  const was = { annual: pol.annual, monthly: pol.monthly, answers: pol.answers, addons: pol.addons };
  Object.assign(pol, { answers: nq.answers, addons: nq.addons, zone: nq.zone, annual: nq.annual, monthly: nq.monthly, coverages: nq.coverages, deductible: nq.deductible, quote: nq.id });
  if (items) pol.items = items.slice(0, 20).map((x) => ({ what: String(x.what || "").slice(0, 80), value: Math.round(+x.value * 100) || 0 }));
  if (beneficiaries && p.beneficiaries) pol.beneficiaries = beneficiaries.map((x) => ({ name: String(x.name).slice(0, 60), relation: String(x.relation || "").slice(0, 30), share: +x.share }));
  if (pol.billing === "subscription" && pol.subscription) await pp().repriceSubscription(pol.subscription.plan, nq.monthly).catch(() => null);
  pol.changes.push({ at: nowIso(), was, diff, quote: nq.id }); save();
  say(pol, "policy_changed", `Policy ${pol.number} changed: now ${pol.plan === "monthly" ? `${usd(pol.monthly)} a month` : `${usd(pol.annual)} a year`}. ${diff > 0 ? `${usd(diff)} charged for the rest of this ${pol.plan === "monthly" ? "month" : "year"}.` : diff < 0 ? `${usd(-diff)} refunded for the rest of this ${pol.plan === "monthly" ? "month" : "year"}.` : "Nothing to charge or refund."}`, { diff }, actor);
  return { ...view(pol), difference: diff === 0 ? "none" : diff > 0 ? `charged ${usd(diff)}` : `refunded ${usd(-diff)}` };
}

// Cancel: cover ends now, the unused days are refunded, no fee
export async function cancel(id, { actor, reason = "the policyholder asked" } = {}) {
  const pol = policy(id);
  if (!pol || !["active", "grace", "lapsed", "awaiting_payment", "review"].includes(pol.status)) return { error: "policy", message: "This policy can't be cancelled." };
  let back = 0;
  if (["active", "grace"].includes(pol.status)) {
    const amount = Math.round((pol.plan === "monthly" ? pol.monthly : pol.annual) * unused(pol));
    try { back = amount > 0 ? (await refund(pol, amount, "cancel")).sent : 0; } catch (e) { return { error: "paypal", message: why(e) }; }
  }
  if (pol.subscription) await pp().cancelSubscription(pol.subscription.id, "Policy cancelled").catch(() => null);
  pol.status = "cancelled"; pol.cancelledAt = nowIso(); pol.refunded = back; save();
  say(pol, "policy_cancelled", `Policy ${pol.number} cancelled (${reason}). ${back ? `${usd(back)} refunded for the days not used.` : "Nothing was due back."}`, null, actor);
  return view(pol);
}

// The underwriting desk's answer on a policy that needed a person to look
export async function review(id, { approve, note = "" }) {
  const pol = policy(id);
  if (!pol || pol.status !== "review") return { error: "policy" };
  if (!approve) { pol.status = "declined"; pol.reviewNote = note; save(); say(pol, "policy_declined", `Cover's underwriting desk couldn't offer this policy${note ? `: ${note}` : "."}`); return view(pol); }
  pol.status = "awaiting_payment"; pol.reviewNote = note; save();
  say(pol, "policy_approved", `Cover's underwriting desk approved the policy: pay the first premium to start it.`);
  return startFirstPayment(pol);
}

export function view(pol, lang = "en") {
  const p = product(pol.product);
  return { policy: pol.id, number: pol.number, product: pol.product, name: p.name[lang], status: pol.status, plan: pol.plan, billing: pol.billing,
    ...(pol.plan === "trip" ? { trip: { destination: pol.answers.destination, departure: pol.answers.departure, return: pol.answers.return, flights: pol.answers.flights, travelers: pol.answers.travelers, plan: pol.answers.plan } } : {}),
    price: pol.plan === "trip" ? (lang === "zh" ? `本趟 ${usd(pol.annual)}` : `${usd(pol.annual)} for the trip`) : pol.plan === "monthly" ? (lang === "zh" ? `每月 ${usd(pol.monthly)}` : `${usd(pol.monthly)} a month`) : (lang === "zh" ? `每年 ${usd(pol.annual)}` : `${usd(pol.annual)} a year`), annual: usd(pol.annual), monthly: pol.monthly == null ? null : usd(pol.monthly),
    start: pol.start, end: pol.end, nextPremium: pol.nextDue, waitingUntil: pol.waitingUntil, causes: causesOfPolicy(pol), cause: topCause(pol),
    covers: pol.coverages.map((c) => ({ id: c.id, clause: c.clause, limit: c.limit != null ? usd(c.limit) : null })), deductible: pol.deductible != null ? usd(pol.deductible) : null, addons: pol.addons,
    ...(pol.items?.length ? { items: pol.items.map((x) => ({ what: x.what, value: usd(x.value) })) } : {}),
    ...(pol.beneficiaries ? { beneficiaries: pol.beneficiaries } : {}),
    ...(pol.approveUrl ? { approveUrl: pol.approveUrl, next: "Open approveUrl to pay the first premium in PayPal (show it to your person)." } : {}),
    ...(pol.status === "grace" ? { graceUntil: pol.graceUntil, invoice: pol.invoice?.url || null, failed: pol.failed } : {}),
    ...(pol.status === "lapsed" ? { lapsedAt: pol.lapsedAt, invoice: pol.invoice?.url || null } : {}),
    ...(pol.status === "cancelled" ? { cancelledAt: pol.cancelledAt, refunded: usd(pol.refunded || 0) } : {}),
    payments: pol.payments.map((x) => ({ n: x.n, amount: usd(x.amount), status: x.status, at: x.at, ...(x.refunded ? { refunded: usd(x.refunded) } : {}), paypal: x.capture || x.subscription || x.invoice || x.order })) };
}
export { limits };
