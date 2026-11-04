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
import { poolOf, CAUSES } from "./pool.js";
import { forPerson, onActivity, record } from "./activity.js";
import { usd } from "./pay/index.js";

export const DEFAULT_LIMITS = { monthlyMax: 3000, mayBuy: true, mayCancel: false, autopay: false };
export const limitsOf = (pid) => ({ ...DEFAULT_LIMITS, ...(person(pid)?.limits || {}) });
export function setLimits(pid, l) {
  const cur = limitsOf(pid), next = { ...cur };
  if (l.monthlyMax !== undefined) { if (!(Number.isInteger(l.monthlyMax) && l.monthlyMax >= 0 && l.monthlyMax <= 100000)) return { error: "monthlyMax must be cents, 0 to 100000" }; next.monthlyMax = l.monthlyMax; }
  for (const k of ["mayBuy", "mayCancel", "autopay"]) if (l[k] !== undefined) next[k] = l[k] === true;
  updatePerson(pid, { limits: { ...next, updated: new Date().toISOString() } });
  return limitsOf(pid);
}
const monthlyNow = (pid) => policies.policiesOf(pid).filter((p) => ["active", "grace", "awaiting_payment"].includes(p.status) && p.monthly != null).reduce((t, p) => t + p.monthly, 0);
const by = (a) => ({ kind: "agent", person: a.person, client: a.client });
const lang = (a) => person(a.person)?.lang || "en";

export function whoami(a) {
  const p = person(a.person), l = limitsOf(a.person);
  return { person: { id: p.id, name: p.name, lang: p.lang, cause: p.cause ? { id: p.cause, ...CAUSES[p.cause] } : null, paypalSaved: !!p.vault, paysTo: p.email ? "their own PayPal email" : "no PayPal email yet (claims can't be paid until they add one on the website)" },
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

export async function buyPolicy(a, { quote, plan = "monthly", billing = "vault", cause, beneficiaries, items }) {
  const l = limitsOf(a.person), q = getQuote(quote);
  if (!l.mayBuy) return { error: "limits", message: "Your person hasn't let you buy policies. Give them the quote; they can buy it on the website." };
  if (!q) return { error: "quote", message: "No such quote: get_quote first." };
  if (monthlyNow(a.person) + (q.monthly ?? q.annual) > l.monthlyMax) return { error: "limits", message: `This adds ${usd(q.monthly)} a month; with what they already pay (${usd(monthlyNow(a.person))}) that is over your person's limit of ${usd(l.monthlyMax)} a month. Tell them; only they can raise it.` };
  const p = person(a.person);
  // without autopay the agent's purchase waits for the person in PayPal, even when PayPal is saved
  const saved = p.vault;
  if (saved && !l.autopay) p.vault = null;
  try { return await policies.buy(a.person, { quote, plan, billing, cause, beneficiaries, items, actor: by(a) }); }
  finally { if (saved && !l.autopay) p.vault = saved; }
}
const ownPolicy = (a, id) => { const p = policies.policy(id); return p && p.person === a.person ? p : null; };
// Insure a trip in one step, as an agent planning it would: price it, and buy it if your person's limits allow
export async function insureTrip(a, { destination, departure, return: back, flights, tripCost = 0, travelers = 1, oldest, plan = "flight", cause }) {
  const q = getQuote_(a, { product: "travel", answers: { destination, departure, return: back, flights, tripCost, travelers, oldest, plan } });
  if (q.error) return q;
  const l = limitsOf(a.person), cost = getQuote(q.quote).annual;
  if (!l.mayBuy) return { quote: q, error: "limits", message: "Your person hasn't let you buy. Show them this quote; they can buy it on the website." };
  if (cost > l.monthlyMax) return { quote: q, error: "limits", message: `This trip costs ${q.trip}, over your person's limit of ${usd(l.monthlyMax)}. Show them the quote.` };
  const r = await buyPolicy(a, { quote: q.quote, cause });
  return { quote: { trip: q.trip, whereYourMoneyGoes: q.whereYourMoneyGoes, covers: q.covers }, policy: r };
}
export async function flightStatus(a, { policy }) {
  const p = ownPolicy(a, policy);
  if (!p || p.product !== "travel") return { error: "policy", message: "A travel policy id." };
  const { statusOf } = await import("./flights.js");
  return { flights: await Promise.all((p.answers.flights || []).map((f) => statusOf(f, p.answers.destination).then((s) => ({ flight: s.flight, date: s.date, from: s.from, to: s.to, scheduled: s.scheduled, status: s.status, delayMin: s.delayMin, source: s.source })))),
    pays: "TR-2.1: $100 a traveler at 2 h late, $300 at 6 h; TR-2.2: $300 if cancelled. Paid automatically once the flight departs or is cancelled." };
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
export function chooseCause(a, { cause }) {
  if (!(cause in CAUSES)) return { error: "cause", message: `cause is one of ${Object.keys(CAUSES).join(", ")}` };
  updatePerson(a.person, { cause });
  for (const p of policies.policiesOf(a.person).filter((x) => ["active", "grace", "awaiting_payment"].includes(x.status))) p.cause = cause;
  policies.policiesStore.save();
  return { cause, name: CAUSES[cause], note: "Premiums from now on go to this cause's pool." };
}
export function giveback(a) {
  const p = person(a.person), cause = p.cause || policies.policiesOf(a.person)[0]?.cause;
  if (!cause) return { note: "No cause yet: choose_cause." };
  const pool = poolOf(cause);
  return { cause, name: CAUSES[cause], pool: { policies: pool.policies, premiums: usd(pool.premiums), claims: usd(pool.claims), balance: usd(pool.balance) }, means: "balance is what would go to the cause if the year closed today (before the reinsurance)." };
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
