// Partners: businesses that sell Cover inside their own checkout (embedded insurance). A travel seller's checkout agent
// talks to Cover's agent over A2A (or the same actions as REST, /api/partner/<action>) while its customer is paying:
//   offer_trip_cover  the trip in, an offer out: the price, each cover line with its clause, an offer id for 15 minutes
//   counter_offer     one round: another plan, or the buyer's budget. Cover never discounts the risk price (the price is
//                     what the claims are expected to cost, the reinsurance and the 20% fee; a discount would be paid by
//                     everyone else in the pool). It can only cover less, dropping lines to fit, and it says which.
//   bind_cover        the seller binds the offer for its customer; Cover records the policy for that person (made from
//                     their email if Cover hasn't met them) and takes the premium in PayPal
//   cover_status      where a bound sale is: the payment, the policy, the commission
// The partner earns a commission on each premium Cover captures (10% by default), paid to its PayPal with PayPal
// Payouts and posted to the ledger as "commission": it comes out of Cover's 20% fee, never out of the claims pool, so
// a partner's sale changes nothing about what the pool pays or gives back.
//
// The PayPal flow: Cover's premium is its own PayPal order (Orders v2, intent CAPTURE, made by policy.js like every
// other first premium), which the seller's checkout puts in front of its customer beside its own ticket order.
// Not one order with two purchase_units, because:
//   - an insurer collects its own premium: the money goes straight from the customer to Cover, never through the
//     seller's account, and the policy, the receipt and any refund are Cover's alone
//   - an order whose purchase_units pay two different merchants is a PayPal Commerce Platform multiparty feature (the
//     platform onboards both sellers first) and isn't taken with a card payment_source, which is how the demo pays
//     (PayPal's sandbox test card, since judges have no sandbox buyer login)
//   - cancelling the cover refunds only Cover's capture; the ticket's order is untouched, and the other way round
//   - the commission stays visible as its own movement (a Payout from Cover to the seller), instead of being netted
//     out inside a split capture
// So the customer pays once at the checkout (with the test card both orders go through on the same click; with a
// PayPal account they approve Cover's order in PayPal), and Cover's captured premium is what starts the policy and
// releases the commission.
import crypto from "node:crypto";
import { store, stateFile } from "./store.js";
import { now, nowIso } from "./clock.js";
import { quote as makeQuote, getQuote } from "./quote.js";
import * as policies from "./policy.js";
import { makePerson, allPeople } from "./people.js";
import { post, FEE, lines } from "./pool.js";
import { record, onActivity } from "./activity.js";
import { product } from "./products/index.js";
import { pp, usd, why } from "./pay/index.js";

const db = store(stateFile("partners"), { partners: {}, offers: {}, sales: {} });
export const partnersStore = db;
const sha = (s) => crypto.createHash("sha256").update(s).digest("hex");
const rid = (p) => `${p}_${crypto.randomBytes(5).toString("hex")}`;
const save = () => db.save();
export const OFFER_MS = 15 * 60e3;
// the most a partner can earn: it is paid from Cover's 20% fee, so it must leave Cover something
export const RATE_MAX = 0.15;
const PLANS = ["flight", "standard", "plus"];
const PLAN_NAME = { flight: "Flight only", standard: "Standard", plus: "Plus" };

// ---- the registry -------------------------------------------------------------------------------------------------
// One demo seller to start with. Its PayPal is a sandbox stand-in address (SKYWAY_PAYPAL_EMAIL points it at a real
// sandbox business account), so the commission payout lands somewhere in PayPal's sandbox.
if (!db.data.partners.skyway) {
  db.data.partners.skyway = { id: "skyway", name: "Skyway Travel (demo)", email: process.env.SKYWAY_PAYPAL_EMAIL || "skyway-travel@cover-demo.example", rate: 0.1, keys: [], created: nowIso() };
  save();
}
export const partner = (id) => db.data.partners[id] || null;
export const allPartners = () => Object.values(db.data.partners);
const slug = (s) => String(s || "").toLowerCase().replace(/\(.*?\)/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 24) || "partner";

// A partner's A2A key: cvpk_..., kept only as a SHA-256 hash (as auth.js keeps people's tokens), shown once
function issueKey(p, label) {
  const secret = `cvpk_${crypto.randomBytes(24).toString("base64url")}`;
  p.keys.push({ id: rid("pk"), hash: sha(secret), hint: secret.slice(0, 9), label: String(label || "checkout agent").slice(0, 40), created: nowIso(), revoked: false });
  save();
  return secret;
}
// Staff add a partner (or, naming an existing id, give it another key). rate is a share of the premium, at most 15%.
export function createPartner({ id, name, email, rate = 0.1, label } = {}) {
  const r = +rate;
  if (!(r >= 0 && r <= RATE_MAX)) return { error: "rate", message: `rate is a share of the premium from 0 to ${RATE_MAX} (it is paid out of Cover's ${FEE * 100}% fee)` };
  let p = id ? partner(String(id)) : null;
  if (!p) {
    if (!String(name || "").trim()) return { error: "name", message: "A partner needs a name." };
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(email || ""))) return { error: "email", message: "A partner needs the PayPal email its commission is paid to." };
    let pid = id ? slug(id) : slug(name);
    while (partner(pid)) pid = `${pid.slice(0, 18)}-${crypto.randomBytes(2).toString("hex")}`;
    p = db.data.partners[pid] = { id: pid, name: String(name).trim().slice(0, 60), email: String(email).slice(0, 120), rate: r, keys: [], created: nowIso() };
  }
  const key = issueKey(p, label);
  return { partner: viewPartner(p), key, note: "Keep the key: Cover stores only its hash. Send it as Authorization: Bearer cvpk_..." };
}
// the demo page's own key for Skyway, made fresh at each start and held only in this process (the old one is revoked)
let demoSecret = null;
export function demoKey() {
  if (demoSecret) return demoSecret;
  const p = partner("skyway");
  for (const k of p.keys) if (k.label === "demo page") k.revoked = true;
  demoSecret = issueKey(p, "demo page");
  return demoSecret;
}
export const isPartnerKey = (req) => /^Bearer\s+cvpk_/.test(String(req.headers.authorization || ""));
export function partnerOf(req) {
  const m = String(req.headers.authorization || "").match(/^Bearer\s+(cvpk_[\w-]+)$/);
  if (!m) return null;
  const h = sha(m[1]);
  for (const p of allPartners()) { const k = p.keys.find((x) => x.hash === h && !x.revoked); if (k) { k.lastUsed = nowIso(); return p; } }
  return null;
}
export function viewPartner(p) {
  const sales = Object.values(db.data.sales).filter((s) => s.partner === p.id), paid = sales.filter((s) => s.commission.status === "paid");
  return { id: p.id, name: p.name, paypal: p.email, rate: p.rate, keys: p.keys.filter((k) => !k.revoked).map((k) => ({ id: k.id, label: k.label, hint: `${k.hint}…`, created: k.created, lastUsed: k.lastUsed || null })),
    sales: sales.length, premiums: usd(sales.filter((s) => s.paid).reduce((t, s) => t + s.premium, 0)), commissionPaid: usd(paid.reduce((t, s) => t + s.commission.amount, 0)) };
}

// ---- the negotiation ------------------------------------------------------------------------------------------------
const actor = (p) => ({ kind: "partner", partner: p.id, client: `${p.name}'s checkout agent` });
const lineOf = (c) => { const d = product("travel").coverages.find((x) => x.id === c.id); return { id: c.id, clause: c.clause, what: d?.en || c.id, limit: c.limit != null ? usd(c.limit) : null, ...(c.parametric ? { paidAutomatically: true } : {}) }; };
const signed = (c) => (c < 0 ? `-${usd(-c)}` : usd(c));
const money = (c) => ({ value: (c / 100).toFixed(2), currency: "USD" });
const RULES = "Cover never discounts the risk price. To meet a budget it can only cover less: drop the medical and trip-cancellation lines (Standard to Flight only), and it says which. One counter_offer per offer; an offer is good for 15 minutes.";

function tripAnswers(x = {}) {
  const t = { ...(x.trip || {}), ...x };
  const plan = PLANS.includes(t.plan) ? t.plan : "standard";
  // the oldest traveler's age only prices medical: flight-only cover doesn't need it (and a counter to a plan with
  // medical asks for it rather than guess)
  return { destination: t.destination, departure: t.departure, return: t.return, flights: t.flights, tripCost: t.tripCost ?? 0, travelers: t.travelers ?? 1, oldest: t.oldest ?? (plan === "flight" ? 30 : undefined), plan, ageGiven: t.oldest != null };
}
function makeOffer(p, { ageGiven, ...answers }, { parent = null, root = null } = {}) {
  const q = makeQuote("travel", answers, { lang: "en" });
  if (q.error || q.decision !== "ok") return { error: q.error || "underwriting", message: q.message || q.why || "Cover can't offer this trip online.", ...(q.missing ? { missing: q.missing, bad: q.bad } : {}) };
  const full = getQuote(q.quote), id = rid("ofr");
  const o = { id, partner: p.id, quote: q.quote, answers: full.answers, plan: full.answers.plan, premium: full.annual, breakdown: full.breakdown, coverages: full.coverages,
    ageGiven: !!ageGiven, created: nowIso(), expires: new Date(now() + OFFER_MS).toISOString(), status: "open", parent, root: root || id, countered: false };
  db.data.offers[id] = o; save();
  return o;
}
export function viewOffer(o) {
  const p = partner(o.partner), b = o.breakdown, n = o.answers.travelers;
  return { offer: o.id, negotiation: o.root, status: o.status, expires: o.expires, validFor: "15 minutes",
    plan: o.plan, name: `Cover travel, ${PLAN_NAME[o.plan]}`, travelers: n, flights: o.answers.flights, price: usd(o.premium), amount: money(o.premium),
    covers: o.coverages.map(lineOf),
    whereTheMoneyGoes: { claimsPool: usd(b.expectedClaims + b.poolExtra), reinsurance: usd(b.reinsurance), coverFee: usd(b.fee), yourCommission: `${usd(Math.round(o.premium * p.rate))} (${Math.round(p.rate * 100)}% of the premium, out of Cover's fee)` },
    rules: RULES, ...(o.status === "open" ? { next: o.countered || o.parent ? "bind_cover with this offer and your customer's name and email, before it expires." : "bind_cover with this offer and your customer's name and email, or counter_offer once (another plan, or the buyer's budget in USD)." } : {}) };
}
const say = (text, data) => ({ text, data });
const fail = (error, message, extra = {}) => say(message, { error, message, ...extra });
function openOffer(p, id) {
  const o = db.data.offers[String(id || "")];
  if (!o || o.partner !== p.id) return { err: fail("offer", "No such offer for this partner: offer_trip_cover first.") };
  if (o.status === "open" && Date.parse(o.expires) < now()) { o.status = "expired"; save(); }
  if (o.status === "expired") return { err: fail("offer_expired", `Offer ${o.id} expired at ${o.expires}: ask for a new one with offer_trip_cover (the price may have changed).`) };
  if (o.status !== "open") return { err: fail("offer_closed", `Offer ${o.id} is ${o.status}${o.status === "superseded" ? `: the counter-offer ${o.next} replaced it` : ""}.`) };
  return { o };
}

export function offerTripCover(p, x = {}) {
  const o = makeOffer(p, tripAnswers(x));
  if (o.error) return fail(o.error, `Cover can't offer this: ${o.message}`, o);
  return say(`Offer ${o.id}: Cover travel ${PLAN_NAME[o.plan]} for ${o.answers.travelers} traveler${o.answers.travelers > 1 ? "s" : ""}, ${usd(o.premium)}, good until ${o.expires.slice(11, 16)} UTC. Covers ${o.coverages.map((c) => c.clause).join(", ")}; flight delay and cancellation pay automatically.`, viewOffer(o));
}

// One round: { offer, plan } for another plan, or { offer, budget } (USD) for the most cover that fits it
export function counterOffer(p, x = {}) {
  const { o, err } = openOffer(p, x.offer);
  if (err) return err;
  const root = db.data.offers[o.root];
  if (root.countered || o.parent) return fail("one_counter", `Offer ${o.id} has already had its counter-offer: bind it, or start again with offer_trip_cover.`, { offer: viewOffer(o) });
  const budget = x.budget != null ? Math.round(+x.budget * 100) : null, asked = PLANS.includes(x.plan) ? x.plan : null;
  if (budget == null && !asked) return fail("counter", "counter_offer takes plan (flight, standard or plus) or budget (USD, what the buyer will pay for cover).", { offer: viewOffer(o) });
  if (budget != null && !(budget > 0)) return fail("counter", "budget is a number of US dollars, more than 0.", { offer: viewOffer(o) });
  if (asked && asked !== "flight" && !o.ageGiven && x.oldest == null) return fail("counter", `${PLAN_NAME[asked]} includes medical cover, priced by the oldest traveler's age: send oldest with the counter_offer.`, { offer: viewOffer(o) });
  root.countered = true; save();
  const discount = x.discount != null || x.price != null ? " Cover doesn't discount the risk price; it can only cover less." : "";
  // the plans to try, best first: the one asked for, or every plan from the current one down
  const tries = asked ? [asked] : PLANS.slice(0, PLANS.indexOf(o.plan) + 1).reverse();
  let best = null, floor = null;
  for (const plan of tries) {
    const n = makeOffer(p, { ...o.answers, plan, ...(x.oldest != null ? { oldest: +x.oldest } : {}), ageGiven: o.ageGiven || x.oldest != null }, { parent: o.id, root: o.root });
    if (n.error) return fail(n.error, n.message, { offer: viewOffer(o) });
    floor = n;
    if (budget == null || n.premium <= budget) { best = n; break; }
    n.status = "declined"; save();
  }
  if (!best) return fail("below_risk_price", `No: the least Cover can offer for this trip is ${PLAN_NAME[floor.plan]} at ${usd(floor.premium)}, the risk price, and the budget is ${usd(budget)}. Cover doesn't discount the risk price.${discount} Offer ${o.id} still stands until it expires.`, { offer: viewOffer(o), floor: { plan: floor.plan, price: usd(floor.premium) } });
  o.status = "superseded"; o.next = best.id; save();
  const have = new Set(best.coverages.map((c) => c.id)), dropped = o.coverages.filter((c) => !have.has(c.id)).map(lineOf), added = best.coverages.filter((c) => !o.coverages.some((d) => d.id === c.id)).map(lineOf);
  const change = dropped.length ? `dropped ${dropped.map((d) => `${d.clause} (${d.what.split(",")[0].split(" up to")[0]})`).join(" and ")}` : added.length ? `added ${added.map((d) => d.clause).join(", ")}` : "the same lines";
  return say(`Counter-offer ${best.id}: ${PLAN_NAME[best.plan]} at ${usd(best.premium)}${budget != null ? `, within the budget of ${usd(budget)}` : ""}; ${change}. The price is the risk price for what is covered, not a discount.${discount} Good until ${best.expires.slice(11, 16)} UTC.`,
    { ...viewOffer(best), replaces: o.id, dropped, added, kept: best.coverages.map((c) => c.clause), was: usd(o.premium) });
}

// Bind an offer for the seller's customer. customer: { name, email, lang }; payer: "test_card" (PayPal's sandbox test
// card, when this server has it on) or "paypal" (the customer approves Cover's order in PayPal: approveUrl)
const byEmail = (email) => allPeople().find((x) => x.email && x.email.toLowerCase() === email.toLowerCase()) || null;
const outbox = new Map(); // sale id -> the policy link Cover "emails" the customer (the demo page reads it as their inbox)
export const inbox = (saleId) => outbox.get(saleId) || null;
export async function bindCover(p, x = {}) {
  const { o, err } = openOffer(p, x.offer);
  if (err) return err;
  const c = x.customer || {}, email = String(c.email || "").trim();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return fail("customer", "customer.email is needed: it is where Cover pays the travelers when a flight goes wrong, and where it sends the policy.");
  // the customer is a person at Cover from now on: the one Cover already knows by this email, or a new one
  const who = byEmail(email) || makePerson({ name: c.name || email.split("@")[0], email, lang: c.lang === "zh" ? "zh" : "en", via: `partner:${p.id}` });
  const card = x.payer === "test_card" && !!pp().testCard;
  o.status = "binding"; save();
  const pol = await policies.buy(who.id, { quote: o.quote, pay: card ? "card" : "paypal", actor: actor(p) });
  if (!pol.policy) { o.status = "open"; save(); return fail(pol.error || "bind", `Cover couldn't bind ${o.id}: ${pol.message || pol.error}`); }
  const s = { id: rid("sale"), partner: p.id, offer: o.id, policy: pol.policy, person: who.id, premium: o.premium, rate: p.rate, paid: false, commission: { amount: Math.round(o.premium * p.rate), status: "waiting" }, created: nowIso() };
  db.data.sales[s.id] = s; o.status = "bound"; o.sale = s.id; save();
  // the link that opens the policy for the customer: one use, a week. Cover sends it to the customer, never to the
  // seller (in this demo the /partners page plays the customer's inbox)
  const t = crypto.randomBytes(18).toString("base64url");
  s.welcome = { hash: sha(t), expires: new Date(Date.now() + 7 * 864e5).toISOString(), used: false }; save();
  outbox.set(s.id, { to: email, link: `/api/partner/welcome/${t}`, subject: "Your Cover travel policy" });
  record({ actor: actor(p), who: [who.id], action: "partner_sale", summary: `${p.name} added Cover travel (${PLAN_NAME[o.plan]}, ${usd(o.premium)}) to your booking at its checkout. Flight delays and cancellations pay you automatically.`, ref: pol.policy });
  if (x.payer === "test_card" && !card) s.note = "The sandbox test card is off on this server: the customer approves the payment in PayPal.";
  await settle(s);
  return statusSay(s, true);
}

// Once Cover's premium is captured: the sale is paid, and the partner's commission goes out with PayPal Payouts
const busy = new Map();
export function settle(s) {
  if (busy.has(s.id)) return busy.get(s.id);
  const run = (async () => {
    const pol = policies.policy(s.policy), first = pol?.payments?.[0];
    if (!pol || first?.status !== "COMPLETED" || !first.capture) return;
    if (!s.paid) { s.paid = true; s.paidAt = nowIso(); save(); }
    if (["paid", "paying"].includes(s.commission.status)) return;
    const p = partner(s.partner), batchId = `${s.id}-commission`;
    s.commission.status = "paying"; save();
    try {
      const r = await pp().payout({ batchId, receiver: p.email, amount: s.commission.amount, note: `Cover commission: ${Math.round(s.rate * 100)}% of the ${usd(s.premium)} premium on policy ${pol.number}.`, subject: "Cover: your commission" });
      const line = post({ kind: "commission", cause: pol.cause, amount: s.commission.amount, policy: pol.id, product: pol.product, ref: r.batchId, note: `${p.name}: ${Math.round(s.rate * 100)}% of ${usd(s.premium)}, from Cover's fee` });
      Object.assign(s.commission, { status: "paid", batchId: r.batchId, paypalStatus: r.status, line: line.n, at: nowIso() }); save();
      record({ actor: { kind: "paypal" }, who: [], action: "commission_paid", summary: `${usd(s.commission.amount)} commission paid to ${p.name} with PayPal Payouts (${r.batchId}), out of Cover's fee.`, ref: pol.id });
    } catch (e) { Object.assign(s.commission, { status: "failed", why: why(e) }); save(); }
  })().finally(() => busy.delete(s.id));
  busy.set(s.id, run);
  return run;
}
// a premium captured any way (the customer back from PayPal, a webhook, the billing run) settles its sale
const saleOf = (policyId) => Object.values(db.data.sales).find((s) => s.policy === policyId) || null;
onActivity((e) => { if (e.action === "premium_paid") { const s = saleOf(e.ref); if (s) settle(s).catch(() => {}); } });

export function viewSale(s) {
  const pol = policies.policy(s.policy), p = partner(s.partner), v = pol ? policies.view(pol) : null, first = pol?.payments?.[0];
  const L = lines({ policy: s.policy }).filter((l) => ["premium", "commission"].includes(l.kind)).map((l) => ({ n: l.n, kind: l.kind, amount: usd(l.amount), toPool: signed(l.pool), toCoverFee: signed(l.fee), ref: l.ref }));
  return { sale: s.id, offer: s.offer, partner: p.name,
    policy: v && { id: v.policy, number: v.number, status: v.status, price: v.price, start: v.start, end: v.end, travelers: v.trip?.travelers, flights: v.trip?.flights, covers: v.covers },
    payment: { paypalOrder: first?.order || null, paypalCapture: first?.capture || null, status: first?.status || null, ...(v?.approveUrl ? { approveUrl: v.approveUrl, next: "Show approveUrl to your customer: they pay Cover's premium in PayPal. Then cover_status." } : {}), ...(s.note ? { note: s.note } : {}) },
    commission: { amount: usd(s.commission.amount), rate: s.rate, status: s.commission.status, paypalPayout: s.commission.batchId || null, ...(s.commission.why ? { why: s.commission.why } : {}), from: "Cover's 20% fee, never the claims pool" },
    customer: { told: "Cover emailed the customer a link to their policy. If an insured flight departs 2+ hours late or is cancelled, Cover pays every traveler to that email's PayPal by itself." },
    ledger: L };
}
function statusSay(s, fresh = false) {
  const v = viewSale(s), pol = v.policy;
  const text = pol.status === "active"
    ? `${fresh ? "Bound. " : ""}Policy ${pol.number} is active for ${pol.travelers} traveler${pol.travelers > 1 ? "s" : ""}: premium ${pol.price.replace(" for the trip", "")} captured in PayPal (${v.payment.paypalCapture}). Your commission ${v.commission.amount}: ${s.commission.status === "paid" ? `paid with PayPal Payouts (${s.commission.batchId})` : s.commission.status}.`
    : `${fresh ? "Bound; " : ""}policy ${pol.number} is ${pol.status.replace("_", " ")}${v.payment.approveUrl ? ": your customer pays Cover's premium in PayPal (approveUrl), then ask cover_status" : ""}.`;
  return say(text, v);
}
export async function coverStatus(p, { sale } = {}) {
  const s = db.data.sales[String(sale || "")];
  if (!s || s.partner !== p.id) return fail("sale", "No such sale for this partner.");
  const pol = policies.policy(s.policy);
  // asks PayPal itself whether the customer approved, the same as the return URL does
  if (pol?.status === "awaiting_payment" && pol.payments[0]?.order) {
    const o = await pp().getOrder(pol.payments[0].order).catch(() => null);
    if (["APPROVED", "COMPLETED"].includes(o?.status)) await policies.confirm(pol.id);
  }
  await settle(s);
  return statusSay(s);
}

// The customer's link: signs them in (createSession is passed in by the server) and opens the policy
export function welcome(token) {
  const h = sha(String(token || "")), s = Object.values(db.data.sales).find((x) => x.welcome?.hash === h);
  if (!s || s.welcome.used || Date.parse(s.welcome.expires) < Date.now()) return null;
  s.welcome.used = true; save();
  return { person: s.person, policy: s.policy };
}

// ---- the same actions over REST and A2A -----------------------------------------------------------------------------
export const ACTIONS = { offer_trip_cover: offerTripCover, counter_offer: counterOffer, bind_cover: bindCover, cover_status: coverStatus };
export async function act(p, action, args) {
  const fn = ACTIONS[action];
  if (!fn) return fail("action", `action is one of ${Object.keys(ACTIONS).join(", ")}.`);
  return fn(p, args || {});
}
// A2A JSON-RPC (message/send) for a partner's agent: the same binding as mcp.js's a2a() for people's agents, one data
// part { action, ...arguments }. The answer is a message with a text part (what Cover's agent says, written by code)
// and a data part (the structured answer). The negotiation's id is the contextId, so a thread of messages is one deal.
export async function a2a(req, res, next) {
  if (!isPartnerKey(req)) return next();
  const { id = null, method, params } = req.body || {};
  const failRpc = (code, message) => res.json({ jsonrpc: "2.0", id, error: { code, message } });
  if (!["message/send", "SendMessage"].includes(method)) return failRpc(-32601, "Only message/send is supported.");
  const p = partnerOf(req);
  if (!p) return failRpc(-32001, "Unauthorized: that partner key isn't one Cover issued (or it was revoked).");
  const part = (params?.message?.parts || []).find((x) => x.kind === "data" || x.data);
  const { action, ...args } = part?.data || {};
  if (!ACTIONS[action]) return failRpc(-32602, `data.action is one of ${Object.keys(ACTIONS).join(", ")}.`);
  const r = await act(p, action, args);
  const ctx = r.data?.negotiation || (args.offer && db.data.offers[args.offer]?.root) || (r.data?.offer && db.data.offers[r.data.offer]?.root) || params?.message?.contextId || crypto.randomUUID();
  res.json({ jsonrpc: "2.0", id, result: { kind: "message", role: "agent", messageId: crypto.randomUUID(), contextId: ctx, parts: [{ kind: "text", text: r.text }, { kind: "data", data: r.data }] } });
}
export const salesOf = (pid) => Object.values(db.data.sales).filter((s) => s.partner === pid).map(viewSale);
export const sale = (id) => db.data.sales[id] || null;
