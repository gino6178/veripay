// What a person's agent can do, the same over MCP, REST and A2A. `a` is the agent: { person, client, scopes }.
// The person's limits (set on the website, signed in as themselves, never by an agent's token) are checked here,
// before anything reaches PayPal:
//   monthlyMax   the most the agent may add to the person's premiums, a month, all policies together
//   mayBuy       the agent may buy new policies (otherwise it can only quote, and the person buys on the website)
//   mayCancel    the agent may cancel a policy
//   autopay      the agent may pay from the PayPal the person saved; otherwise every payment waits for them in PayPal
// Claims are always paid to the person's own PayPal (or straight to the vet they named); an agent can't change where.
import { PRODUCTS, product, summary, clause as getClause } from "./products/index.js";
import { quote as makeQuote, getQuote } from "./quote.js";
import * as policies from "./policy.js";
import * as claims from "./claims.js";
import { person, updatePerson } from "./people.js";
import { poolOf, CAUSES, causesOf, checkCauses } from "./pool.js";
import { forPerson, onActivity, record } from "./activity.js";
import { usd } from "./pay/index.js";
import { now } from "./clock.js";
import { fundsOf as fundsOfSync, RULES as FUND_RULES } from "./community.js";

export const DEFAULT_LIMITS = { monthlyMax: 3000, mayBuy: true, mayCancel: false, autopay: false };
export const limitsOf = (pid) => ({ ...DEFAULT_LIMITS, ...(person(pid)?.limits || {}) });
export function setLimits(pid, l) {
  const cur = limitsOf(pid), next = { ...cur };
  if (l.monthlyMax !== undefined) { if (!(Number.isInteger(l.monthlyMax) && l.monthlyMax >= 0 && l.monthlyMax <= 100000)) return { error: "monthlyMax must be cents, 0 to 100000" }; next.monthlyMax = l.monthlyMax; }
  for (const k of ["mayBuy", "mayCancel", "autopay"]) if (l[k] !== undefined) next[k] = l[k] === true;
  updatePerson(pid, { limits: { ...next, updated: new Date().toISOString() } });
  return limitsOf(pid);
}
// what a person's policies cost them this month: monthly premiums, a yearly premium as a twelfth, and any trip bought in
// the last 30 days in full
// a neighborhood fund's monthly amount counts too
const fundMonthly = (pid) => fundsOfSync(pid).length * FUND_RULES.monthly;
const monthlyNow = (pid) => fundMonthly(pid) + policies.policiesOf(pid).filter((p) => ["active", "grace", "awaiting_payment"].includes(p.status) || (p.plan === "trip" && p.status === "expired")).reduce((t, p) => t + (p.plan === "trip" ? (now() - Date.parse(p.created) < 30 * 864e5 ? p.annual : 0) : p.monthly ?? 0), 0);
const by = (a) => ({ kind: "agent", person: a.person, client: a.client });
const lang = (a) => person(a.person)?.lang || "en";

export function whoami(a) {
  const p = person(a.person), l = limitsOf(a.person);
  return { person: { id: p.id, name: p.name, lang: p.lang, causes: Object.entries(p.causes || (p.cause ? { [p.cause]: 100 } : {})).map(([id, share]) => ({ id, share, name: CAUSES[id].en })), paypalSaved: !!p.vault, paysTo: p.email ? "their own PayPal email" : "no PayPal email yet (claims can't be paid until they add one on the website)" },
    limits: { monthlyMax: usd(l.monthlyMax), monthlyNow: usd(monthlyNow(a.person)), mayBuy: l.mayBuy, mayCancel: l.mayCancel, autopay: l.autopay, means: "You may add premiums up to monthlyMax a month in all. Only your person changes these, on the website." },
    agent: { client: a.client, scopes: a.scopes } };
}
export const listProducts = (a) => Object.values(PRODUCTS).map((p) => summary(p, lang(a)));
export function explainClause(a, { id }) { const c = getClause(String(id || "")); return c ? { id: c.id, product: c.product, kind: c.kind, zh: c.zh, en: c.en } : { error: "clause", message: "No such clause id (they look like RT-2.1, PT-3.1)." }; }
export function getQuote_(a, { product: pid, answers = {}, addons = [] }) {
  const r = makeQuote(pid, answers, { addons, person: a.person, lang: lang(a) });
  if (!r.error) record({ actor: by(a), who: [a.person], action: "quoted", summary: `${a.client} got a quote: ${r.name}, ${r.monthly} a month.`, ref: r.quote });
  return r;
}

export async function buyPolicy(a, { quote, plan = "monthly", billing = "vault", cause, causes, beneficiaries, items }) {
  const l = limitsOf(a.person), q = getQuote(quote);
  if (!l.mayBuy) return { error: "limits", message: "Your person hasn't let you buy policies. Give them the quote; they can buy it on the website." };
  if (!q) return { error: "quote", message: "No such quote: get_quote first." };
  if (monthlyNow(a.person) + (q.monthly ?? q.annual) > l.monthlyMax) return { error: "limits", message: `This adds ${usd(q.monthly ?? q.annual)}${q.monthly == null ? " (a trip, counted in full this month)" : " a month"}; with what they already pay (${usd(monthlyNow(a.person))}) that is over your person's limit of ${usd(l.monthlyMax)} a month. Tell them; only they can raise it.` };
  const p = person(a.person);
  // without autopay the agent's purchase waits for the person in PayPal, even when PayPal is saved
  const saved = p.vault;
  if (saved && !l.autopay) p.vault = null;
  try { return await policies.buy(a.person, { quote, plan, billing, cause, causes, beneficiaries, items, actor: by(a) }); }
  finally { if (saved && !l.autopay) p.vault = saved; }
}
const ownPolicy = (a, id) => { const p = policies.policy(id); return p && p.person === a.person ? p : null; };
// Insure a trip in one step, as an agent planning it would: price it, and buy it if your person's limits allow
export async function insureTrip(a, x = {}) {
  // (agents sometimes wrap the arguments as { answers: {...} }, the way get_quote takes them: both work)
  const { destination, departure, return: back, flights, tripCost = 0, travelers = 1, plan = "flight", cause, causes } = { ...(x.answers || {}), ...x };
  // the oldest traveler's age only prices medical; flight-only cover needs none, so it isn't asked for then
  const oldest = x.oldest ?? x.answers?.oldest ?? (plan === "flight" ? 30 : undefined);
  const q = getQuote_(a, { product: "travel", answers: { destination, departure, return: back, flights, tripCost, travelers, oldest, plan } });
  if (q.error) return q;
  const l = limitsOf(a.person), cost = getQuote(q.quote).annual;
  if (!l.mayBuy) return { quote: q, error: "limits", message: "Your person hasn't let you buy. Show them this quote; they can buy it on the website." };
  if (cost + monthlyNow(a.person) > l.monthlyMax) return { quote: q, error: "limits", message: `This trip costs ${q.trip}; with what your person already pays this month (${usd(monthlyNow(a.person))}) that is over their spending limit of ${usd(l.monthlyMax)} a month. Show them the quote; only they can raise the limit, on the website.` };
  const r = await buyPolicy(a, { quote: q.quote, cause, causes });
  return { quote: { trip: q.trip, whereYourMoneyGoes: q.whereYourMoneyGoes, covers: q.covers }, policy: r };
}
export async function flightStatus(a, { policy }) {
  const p = ownPolicy(a, policy);
  if (!p || p.product !== "travel") return { error: "policy", message: "A travel policy id." };
  const { statusOf } = await import("./flights.js");
  return { flights: await Promise.all((p.answers.flights || []).map((f) => statusOf(f, p.answers.destination).then((s) => ({ flight: s.flight, date: s.date, from: s.from, to: s.to, scheduled: s.scheduled, status: s.status, delayMin: s.delayMin, source: s.source })))),
    pays: "TR-2.1: $100 a traveler at 2 h late, $300 at 6 h; TR-2.2: $300 if cancelled. Paid automatically, to the policyholder for every traveler, once the flight departs or is cancelled.",
    ...(await (async () => { const { allClaims } = await import("./claims.js"); const n = +p.answers.travelers || 1, paid = allClaims().filter((c) => c.policy === p.id && c.auto && c.status === "paid").reduce((t, c) => t + (c.paid || 0), 0);
      return { paidSoFar: usd(paid), leftPerTraveler: usd(Math.max(0, 60000 - Math.floor(paid / n))), leftForTrip: usd(Math.max(0, 60000 * n - paid)) }; })()) };
}
// Neighborhood funds: what Cover suggests for the person's ZIP, and joining (a monthly charge: within their limits
// and with autopay only, like any purchase)
export async function neighborhood(a) {
  const { suggestion, fundsOf, view } = await import("./community.js");
  return { suggestion: suggestion(a.person), funds: fundsOf(a.person).map((f) => view(f, a.person)) };
}
export async function leaveFund(a, { fund }) { const { leave, fundsOf } = await import("./community.js"); const id = fund || fundsOf(a.person)[0]?.id; return id ? leave(a.person, id) : { error: "fund", message: "Not in a fund." }; }
export async function proposeProject(a, { fund, title, payee, why }) { const { propose, fundsOf } = await import("./community.js"); const id = fund || fundsOf(a.person)[0]?.id; return id ? propose(a.person, id, { title, payee, why }) : { error: "fund", message: "Not in a fund." }; }
export async function voteProject(a, { fund, project }) { const { vote, fundsOf } = await import("./community.js"); const id = fund || fundsOf(a.person)[0]?.id; return id ? vote(a.person, id, project) : { error: "fund", message: "Not in a fund." }; }
export async function joinFund(a, { zip }) {
  const l = limitsOf(a.person), { RULES, join } = await import("./community.js");
  if (!l.mayBuy || !l.autopay) return { error: "limits", message: "Joining adds a monthly charge, which your person hasn't let you make on your own (mayBuy and autopay). Tell them about the fund; they can join on the website." };
  if (monthlyNow(a.person) + RULES.monthly > l.monthlyMax) return { error: "limits", message: `That would take their monthly spending over ${usd(l.monthlyMax)}.` };
  return join(a.person, { zip, actor: by(a) });
}
export const myPolicies = (a) => policies.policiesOf(a.person).map((p) => policies.view(p, lang(a)));
export function policyStatus(a, { policy }) { const p = ownPolicy(a, policy); return p ? policies.view(p, lang(a)) : { error: "policy" }; }
export async function changePolicy(a, x) {
  const p = ownPolicy(a, x.policy);
  if (!p) return { error: "policy" };
  const l = limitsOf(a.person);
  if (!l.autopay) return { error: "limits", message: "A change may charge the difference to saved PayPal, which your person hasn't let you do (autopay). They can make the change on the website." };
  const q = makeQuote(p.product, { ...p.answers, ...(x.answers || {}) }, { addons: x.addons ?? p.addons, person: a.person });
  if (!q.error && monthlyNow(a.person) - p.monthly + getQuote(q.quote).monthly > l.monthlyMax) return { error: "limits", message: `That would take their premiums over ${usd(l.monthlyMax)} a month.` };
  return policies.change(p.id, { ...x, actor: by(a) });
}
export async function cancelPolicy(a, { policy }) {
  const p = ownPolicy(a, policy);
  if (!p) return { error: "policy" };
  if (!limitsOf(a.person).mayCancel) return { error: "limits", message: "Your person hasn't let you cancel policies. They can cancel on the website (the unused days are refunded)." };
  return policies.cancel(p.id, { actor: by(a), reason: `${a.client}, for its person` });
}
// one cause, or several with shares ({ animals: 60, disaster: 40 }): from now on every premium is split that way
export function chooseCause(a, { cause, causes }) {
  const bad = checkCauses(causes ?? cause);
  if (bad || (cause == null && causes == null)) return { error: "cause", message: bad || `cause (one), or causes ({ id: share }), from: ${Object.keys(CAUSES).join(", ")}` };
  const m = causesOf(causes ?? cause);
  updatePerson(a.person, { causes: m });
  for (const p of policies.policiesOf(a.person).filter((x) => ["active", "grace", "awaiting_payment"].includes(x.status))) p.causes = m;
  policies.policiesStore.save();
  const deficit = Object.keys(m).filter((id) => poolOf(id).balance < 0);
  return { causes: Object.entries(m).map(([id, share]) => ({ id, share, name: CAUSES[id].en, poolNow: usd(poolOf(id).balance) })), ...(deficit.length ? { warning: `${deficit.map((id) => CAUSES[id].en).join(", ")}: this pool has paid out more than it took in this year, so it would give nothing if the year closed today. Your share still goes in; it gives only if the pool ends the year above zero.` } : {}), note: "Premiums from now on are split across these causes' pools in these shares; at the year's close each pool's leftover goes to its cause, all in one PayPal Payouts batch." };
}
export function giveback(a) {
  const p = person(a.person), m = p.causes || (p.cause ? { [p.cause]: 100 } : null) || (policies.policiesOf(a.person)[0] && policies.causesOfPolicy(policies.policiesOf(a.person)[0]));
  if (!m) return { note: "No cause yet: choose_cause." };
  return { causes: Object.entries(m).map(([id, share]) => { const pool = poolOf(id); return { id, share, name: CAUSES[id].en, pool: { policies: pool.policies, premiums: usd(pool.premiums), claims: usd(pool.claims), balance: usd(pool.balance) } }; }),
    means: "balance is what would go to each cause if the year closed today (before the reinsurance); all causes are paid in one PayPal Payouts batch." };
}

export async function fileClaim(a, x) {
  const p = ownPolicy(a, x.policy);
  if (!p) return { error: "policy" };
  return claims.file(a.person, { ...x, actor: by(a) });
}
const ownClaim = (a, id) => { const c = claims.claim(id); return c && c.person === a.person ? c : null; };
export async function addEvidence(a, { claim, ...e }) { const c = ownClaim(a, claim); return c ? claims.addEvidence(c.id, e, { actor: by(a) }) : { error: "claim" }; }
export function claimStatus(a, { claim }) { const c = ownClaim(a, claim); return c ? claims.view(c) : { error: "claim" }; }
export const myClaims = (a) => claims.claimsOf(a.person).map((c) => claims.view(c));
export function withdrawClaim(a, { claim }) { const c = ownClaim(a, claim); return c ? claims.withdraw(c.id, a.person) : { error: "claim" }; }

// Waits for something new for the person (a premium, a claim decided or paid, a lapse) and returns it
export async function waitForNews(a, { after = 0, seconds = 45 }) {
  const pick = () => forPerson(a.person, { after }).filter((e) => e.actor?.client !== a.client || e.actor?.kind !== "agent");
  let news = pick();
  if (!news.length) {
    await new Promise((done) => { const off = onActivity((e) => { if (e.who.includes(a.person) && e.id > after) { off(); clearTimeout(t); done(); } }); const t = setTimeout(() => { off(); done(); }, Math.min(50, seconds) * 1000); });
    news = pick();
  }
  return { news: news.map((e) => ({ id: e.id, at: e.at, what: e.action, summary: e.summary, ref: e.ref })), last: news.at(-1)?.id ?? after, note: "Call again with after: last for what comes next." };
}
