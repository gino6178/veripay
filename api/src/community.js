// Neighborhood funds: neighbors on Cover chipping in together. When Cover (or a person's own agent) sees that several
// households in the same ZIP code hold the same kind of home cover, it suggests a fund for that ZIP. Each member adds a
// small amount a month, charged to their saved PayPal; the fund
//   - pays part of a member's deductible the moment Cover pays their claim (neighbors carrying each other's first dollars
//     after the same storm), with PayPal Payouts, and
//   - at the year's close gives what is left to a local project the members voted for (a block's flood barriers, a
//     cooling center, street trees), with PayPal Payouts to the project's organizer.
// Joining is the person's yes: an agent may join for them only within their limits and with autopay, like any purchase.
// The fund's money is its own ledger here, never mixed with the claims pools or Cover's fee: Cover takes nothing from it.
import crypto from "node:crypto";
import { store, stateFile } from "./store.js";
import { now, nowIso, DAY } from "./clock.js";
import { allPolicies } from "./policy.js";
import { person, payoutAddress } from "./people.js";
import { record } from "./activity.js";
import * as receipts from "./proof/receipts.js";
import { pp, usd, why } from "./pay/index.js";

const db = store(stateFile("community"), { funds: {}, lines: [] });
export const communityStore = db;
const MONTH = 365 * DAY / 12;
export const RULES = { monthly: 300, minHouseholds: 3, helpCap: 25000, helpShare: 0.5, kinds: ["renters", "home"] };
const save = () => db.save();
const say = (who, action, summary, ref) => record({ actor: { kind: "platform" }, who, action, summary, ref });
const zipOf = (pol) => pol?.zone?.zip || null;
const live = (p) => ["active", "grace"].includes(p.status);
export const fund = (id) => db.data.funds[id] || null;
export const fundFor = (zip) => Object.values(db.data.funds).find((f) => f.zip === zip) || null;
export const fundsOf = (pid) => Object.values(db.data.funds).filter((f) => f.members.some((m) => m.person === pid && !m.left));
const add = (f, kind, amount, extra = {}) => { const l = { n: db.data.lines.length + 1, at: nowIso(), fund: f.id, kind, amount, ...extra }; db.data.lines.push(l); save(); return l; };
export const balance = (f) => db.data.lines.filter((l) => l.fund === f.id).reduce((t, l) => t + (["contribution"].includes(l.kind) ? l.amount : -l.amount), 0);

// Is there a fund to suggest for this person? Their home-cover policies' ZIP codes, with how many households there hold
// the same kind of cover on Cover (counted, never named)
export function suggestion(pid) {
  const mine = allPolicies().filter((p) => p.person === pid && live(p) && RULES.kinds.includes(p.product) && zipOf(p));
  for (const pol of mine) {
    const zip = zipOf(pol), f = fundFor(zip);
    if (f && f.members.some((m) => m.person === pid && !m.left)) continue;
    const households = new Set(allPolicies().filter((p) => live(p) && RULES.kinds.includes(p.product) && zipOf(p) === zip).map((p) => p.person)).size;
    if (households >= RULES.minHouseholds || f) return { zip, area: pol.zone.area, households, fund: f ? view(f, pid) : null, monthly: usd(RULES.monthly),
      why: `${households} households in ${zip} have home or renters cover with Cover. A storm that hits one of you hits all of you: a neighborhood fund pays part of each member's deductible the moment Cover pays their claim, and what is left at the year's end goes to a local project you vote for.` };
  }
  return null;
}

// Join (or start) the fund for one of the person's ZIP codes: the first month is charged at once to their saved PayPal
export async function join(pid, { zip, actor } = {}) {
  const who = person(pid);
  const pol = allPolicies().find((p) => p.person === pid && live(p) && RULES.kinds.includes(p.product) && (!zip || zipOf(p) === zip));
  if (!pol || !zipOf(pol)) return { error: "eligible", message: "A neighborhood fund is for households with active renters or home cover at a ZIP code." };
  if (!who.vault) return { error: "paypal", message: "Save PayPal first (buy any policy with PayPal, or the sandbox test card): the fund's monthly amount is charged to it." };
  const z = zipOf(pol);
  let f = fundFor(z);
  if (!f) {
    const households = new Set(allPolicies().filter((p) => live(p) && RULES.kinds.includes(p.product) && zipOf(p) === z).map((p) => p.person)).size;
    if (households < RULES.minHouseholds) return { error: "too_few", message: `A fund starts once ${RULES.minHouseholds} households in ${z} have home cover with Cover; there are ${households}.` };
    f = { id: `nf_${crypto.randomBytes(4).toString("hex")}`, zip: z, area: pol.zone.area, created: nowIso(), members: [], projects: [], year: 1 };
    db.data.funds[f.id] = f;
  }
  if (f.members.some((m) => m.person === pid && !m.left)) return view(f, pid);
  const m = { person: pid, since: nowIso(), monthly: RULES.monthly, nextDue: null, payments: 0 };
  f.members.push(m); save();
  const r = await charge(f, m);
  if (r.error) { m.left = nowIso(); save(); return r; }
  say([pid], "fund_joined", `You joined the ${f.zip} neighborhood fund: ${usd(m.monthly)} a month from your saved PayPal. It pays part of members' deductibles when Cover pays their claims.`, f.id);
  for (const o of f.members.filter((x) => x.person !== pid && !x.left)) say([o.person], "fund_grew", `A neighbor joined the ${f.zip} neighborhood fund (${active(f).length} households now).`, f.id);
  if (actor) say([pid], "fund_joined_by", `${actor.client || "Your agent"} joined the fund for you, within your limits.`, f.id);
  return view(f, pid);
}
async function charge(f, m) {
  const who = person(m.person), n = m.payments + 1;
  try {
    const r = await pp().createPayment({ amount: m.monthly, reference: f.id, description: `Neighborhood fund ${f.zip}: month ${n}`, vaultId: who.vault, requestId: `${f.id}:${m.person}:${n}` });
    if (r.status !== "COMPLETED") throw new Error(`PayPal answered ${r.status}`);
    m.payments = n; m.nextDue = new Date((m.nextDue ? Date.parse(m.nextDue) : now()) + MONTH).toISOString(); save();
    add(f, "contribution", m.monthly, { person: m.person, ref: r.capture?.id || r.id }); m.lastPayPal = r.capture?.id || r.id;
    return { ok: true };
  } catch (e) { return { error: "paypal", message: why(e) }; }
}
export const active = (f) => f.members.filter((m) => !m.left);
export function leave(pid, id) {
  const f = fund(id), m = f?.members.find((x) => x.person === pid && !x.left);
  if (!m) return { error: "fund" };
  m.left = nowIso(); save(); say([pid], "fund_left", `You left the ${f.zip} neighborhood fund. What you paid in stays with your neighbors.`, f.id);
  return view(f, pid);
}

// Monthly contributions (the billing run, and when the demo moves the clock)
export async function tick() {
  for (const f of Object.values(db.data.funds)) for (const m of active(f)) if (m.nextDue && Date.parse(m.nextDue) <= now()) await charge(f, m);
}

// After Cover pays a member's claim: the fund pays half of the deductible that claim carried, up to $250, while it has
// the money (claims.js calls this). Shown to the member and the neighbors (never who).
export async function afterClaim(c) {
  const ded = -(c.decision?.steps || []).filter((s) => s.step === "deductible").reduce((t, s) => t + s.amount, 0);
  if (!(ded > 0)) return null;
  const pol = allPolicies().find((p) => p.id === c.policy), f = pol && fundFor(zipOf(pol));
  if (!f || !RULES.kinds.includes(pol.product) || !active(f).some((m) => m.person === c.person && Date.parse(m.since) <= Date.parse(c.happenedAt))) return null;
  const amount = Math.min(Math.round(ded * RULES.helpShare), RULES.helpCap, balance(f));
  if (amount <= 0) return null;
  try {
    const r = await pp().payout({ batchId: `${f.id}-${c.id}-help`, receiver: payoutAddress(person(c.person)), amount, note: `Your ${f.zip} neighbors' fund covers ${usd(amount)} of the deductible on claim ${c.number}.`, subject: "Cover: your neighbors chipped in" });
    add(f, "deductible_help", amount, { person: c.person, claim: c.id, ref: r.batchId });
    say([c.person], "fund_helped", `Your ${f.zip} neighborhood fund paid ${usd(amount)} toward your ${usd(ded)} deductible on claim ${c.number}, with PayPal Payouts.`, f.id);
    for (const o of active(f).filter((x) => x.person !== c.person)) say([o.person], "fund_helped_neighbor", `The ${f.zip} fund paid ${usd(amount)} toward a neighbor's deductible.`, f.id);
    return { amount, payout: r.batchId };
  } catch (e) { return { error: why(e) }; }
}

// Local projects: any member may propose one (what, and the PayPal email of whoever runs it); each member has one vote
export function propose(pid, id, { title, payee, why: reason = "" }) {
  const f = fund(id);
  if (!f || !active(f).some((m) => m.person === pid)) return { error: "fund", message: "Only members propose projects." };
  if (!String(title || "").trim() || !/^\S+@\S+\.\S+$/.test(String(payee || ""))) return { error: "project", message: "A project needs a title and the PayPal email of whoever runs it." };
  if (f.projects.filter((p) => p.year === f.year).length >= 6) return { error: "project", message: "Six projects at most a year." };
  const p = { id: `pj_${crypto.randomBytes(3).toString("hex")}`, year: f.year, title: String(title).slice(0, 80), why: String(reason).slice(0, 300), payee: String(payee).slice(0, 120), by: pid, votes: [] };
  f.projects.push(p); save();
  for (const o of active(f)) say([o.person], "fund_project", `A neighbor proposed a project for the ${f.zip} fund: "${p.title}". Vote on Cover.`, f.id);
  return view(f, pid);
}
export function vote(pid, id, projectId) {
  const f = fund(id);
  if (!f || !active(f).some((m) => m.person === pid)) return { error: "fund" };
  for (const p of f.projects.filter((x) => x.year === f.year)) p.votes = p.votes.filter((v) => v !== pid);
  const p = f.projects.find((x) => x.id === projectId && x.year === f.year);
  if (!p) return { error: "project" };
  p.votes.push(pid); save();
  return view(f, pid);
}
// The year's close for every fund: what is left goes to the project with the most votes
export async function closeYear() {
  const out = [];
  for (const f of Object.values(db.data.funds)) {
    const left = balance(f), pick = f.projects.filter((p) => p.year === f.year).sort((a, b) => b.votes.length - a.votes.length)[0];
    const g = { fund: f.id, zip: f.zip, year: f.year, amount: 0, project: pick?.title || null, payout: null };
    if (left > 0 && pick) {
      try { const r = await pp().payout({ batchId: `${f.id}-y${f.year}`, receiver: pick.payee, amount: left, note: `The ${f.zip} neighborhood fund's year ${f.year}: chosen by its members for "${pick.title}".`, subject: "Cover: a neighborhood fund chose your project" }); add(f, "project", left, { project: pick.id, ref: r.batchId }); g.amount = left; g.payout = r.batchId; } catch (e) { g.error = why(e); }
    }
    g.receipt = receipts.issue({ kind: "fund", subject: `${f.id}-y${f.year}`, event: "given", data: { zip: f.zip, year: f.year, households: active(f).length, project: pick?.title || null, amount: g.amount, payout: g.payout } }).id;
    for (const m of active(f)) say([m.person], "fund_year", g.amount ? `The ${f.zip} fund gave ${usd(g.amount)} to "${g.project}", the project you and your neighbors chose.` : `The ${f.zip} fund closed its year with nothing to give${pick ? "" : " (no project was proposed)"}; the balance carries on.`, f.id);
    f.year += 1; save(); out.push(g);
  }
  return out;
}

export function view(f, pid = null) {
  const L = db.data.lines.filter((l) => l.fund === f.id), sum = (k) => L.filter((l) => l.kind === k).reduce((t, l) => t + l.amount, 0);
  const me = pid && f.members.find((m) => m.person === pid && !m.left);
  return { fund: f.id, zip: f.zip, area: f.area, households: active(f).length, year: f.year, monthly: usd(RULES.monthly),
    balance: usd(balance(f)), contributed: usd(sum("contribution")), deductibleHelp: usd(sum("deductible_help")), helped: L.filter((l) => l.kind === "deductible_help").length, givenToProjects: usd(sum("project")),
    rules: `Each household adds ${usd(RULES.monthly)} a month. When Cover pays a member's home or renters claim, the fund pays half its deductible, up to ${usd(RULES.helpCap)}, while it has the money. At the year's end what is left goes to the local project the members voted for. Cover takes nothing from the fund.`,
    member: !!me, ...(me ? { since: me.since, paid: me.payments, nextDue: me.nextDue, lastPayment: me.lastPayPal || null, leave: "leave_neighborhood_fund (or Leave on the website): no fee; what was paid in stays with the neighbors" } : {}),
    projects: f.projects.filter((p) => p.year === f.year).map((p) => ({ id: p.id, title: p.title, why: p.why, votes: p.votes.length, mine: pid ? p.votes.includes(pid) : false })) };
}
