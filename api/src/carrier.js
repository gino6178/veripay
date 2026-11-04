// Cover's back office: the numbers an insurer runs on, counted from the ledger, policies and claims (never estimated
// when they can be counted), plus the two things that sank Lemonade's California book: catastrophe exposure and a rate
// increase the regulator refused.
//   reinsurance   a per-claim excess of loss (Cover keeps the first $5,000 of any claim, the reinsurer pays the rest)
//                 and a catastrophe layer (one hurricane, wildfire or earthquake: Cover keeps $20,000 of the event, the reinsurer
//                 pays the rest up to $500,000), paid for with the reinsurance part of every premium
//   giveback      at the year's close, each cause pool pays its reinsurance, and what is left of every pool goes to its
//                 cause in one PayPal Payouts batch (an item per cause), with a receipt for each in the transparency log
//   exposure      in-force policies and sums insured by state and hazard level; a hurricane, wildfire or quake scenario
//   rates         a filed rate change waits for the regulator's answer; until approved, prices don't move
import { store, stateFile } from "./store.js";
import { nowIso, DAY } from "./clock.js";
import { PRODUCTS } from "./products/index.js";
import { allPolicies, causesOfPolicy, topCause } from "./policy.js";
import { allClaims } from "./claims.js";
import { post, postSplit, pools, poolOf, CAUSES, lines, year, closeYear as nextYear } from "./pool.js";
import { record } from "./activity.js";
import * as receipts from "./proof/receipts.js";
import { pp, usd, why } from "./pay/index.js";

export const TREATY = { perClaimRetention: 500000, catRetention: 2000000, catLimit: 50000000 };
const db = store(stateFile("carrier"), { recoveries: [], events: {}, filings: [], givebacks: [] });
export const carrierStore = db;
const CAT_TYPES = ["windstorm", "quake", "flood", "fire"];

// After a claim is paid: what the reinsurer owes on it
export function afterClaim(c) {
  if (c.paid > TREATY.perClaimRetention) {
    const amount = c.paid - TREATY.perClaimRetention;
    db.data.recoveries.push({ claim: c.id, layer: "per claim", amount, at: nowIso() }); db.save();
    postSplit({ kind: "recovery", causes: causesOfPolicy(allPolicies().find((p) => p.id === c.policy) || {}), amount, policy: c.policy, claim: c.id, product: c.product, note: "per-claim excess of loss" });
  }
  if (c.event && CAT_TYPES.includes(c.type)) {
    const ev = (db.data.events[c.event] ||= { id: c.event, paid: 0, recovered: 0 });
    ev.paid += c.paid;
    const owed = Math.min(TREATY.catLimit, Math.max(0, ev.paid - TREATY.catRetention)) - ev.recovered;
    if (owed > 0) { ev.recovered += owed; postSplit({ kind: "recovery", causes: causesOfPolicy(allPolicies().find((p) => p.id === c.policy) || {}), amount: owed, policy: c.policy, claim: c.id, product: c.product, note: `catastrophe layer, event ${c.event}` }); }
    db.save();
  }
}

// The year's numbers by product
export function dashboard() {
  const pols = allPolicies(), cls = allClaims(), y = year(), L = lines({ year: y });
  const by = Object.fromEntries(Object.keys(PRODUCTS).map((id) => [id, { product: id, inForce: 0, sold: 0, premiums: 0, refunds: 0, claimsPaid: 0, claims: 0, instant: 0, referred: 0, denied: 0, open: 0, secondsToPay: [], recoveries: 0 }]));
  for (const p of pols) { const b = by[p.product]; if (["active", "grace"].includes(p.status)) b.inForce++; if (p.start) b.sold++; }
  for (const l of L) { const b = by[l.product]; if (!b) continue; if (l.kind === "premium") b.premiums += l.amount; if (l.kind === "refund") b.refunds += l.amount; if (l.kind === "claim") b.claimsPaid += l.amount; if (l.kind === "recovery") b.recoveries += l.amount; }
  for (const c of cls) {
    const b = by[c.product]; b.claims++;
    if (c.status === "paid" && c.decision?.by === "rules") { b.instant++; b.secondsToPay.push(c.secondsToPay); }
    if (c.history.some((h) => h.outcome === "refer")) b.referred++;
    if (c.status === "denied") b.denied++;
    if (["referred", "needs_info", "needs_evidence"].includes(c.status)) b.open++;
  }
  const rows = Object.values(by).map((b) => { const earned = b.premiums - b.refunds, s = b.secondsToPay.sort((x, y) => x - y);
    return { ...b, earned, lossRatio: earned ? +((b.claimsPaid - b.recoveries) / earned).toFixed(3) : null, medianSecondsToPay: s.length ? s[Math.floor(s.length / 2)] : null, instantShare: b.claims ? +(b.instant / b.claims).toFixed(2) : null, secondsToPay: undefined }; });
  const t = rows.reduce((a, r) => ({ premiums: a.premiums + r.premiums, earned: a.earned + r.earned, claimsPaid: a.claimsPaid + r.claimsPaid, recoveries: a.recoveries + r.recoveries, claims: a.claims + r.claims, instant: a.instant + r.instant }), { premiums: 0, earned: 0, claimsPaid: 0, recoveries: 0, claims: 0, instant: 0 });
  const fees = L.reduce((s, l) => s + l.fee, 0);
  return { year: y, products: rows, total: { ...t, fees, lossRatio: t.earned ? +((t.claimsPaid - t.recoveries) / t.earned).toFixed(3) : null, instantShare: t.claims ? +(t.instant / t.claims).toFixed(2) : null }, treaty: TREATY, pools: pools().map((p) => ({ cause: p.cause, balance: p.balance, claims: p.claims, premiums: p.premiums })) };
}

// In-force exposure by state (and metro, where the zone table has one): how many policies, how much insured, and each
// hazard's level
export function exposure() {
  const out = {};
  for (const p of allPolicies().filter((x) => ["active", "grace"].includes(x.status) && x.zone)) {
    const key = p.zone.area || p.zone.state || "?", e = (out[key] ||= { area: key, state: p.zone.state, policies: 0, insured: 0, flood: p.zone.flood, wildfire: p.zone.wildfire, hurricane: p.zone.hurricane, quake: p.zone.quake, theft: p.zone.theft, products: {} });
    e.policies++; e.insured += p.coverages.filter((c) => ["building", "contents", "own_damage", "theft"].includes(c.id)).reduce((t, c) => t + (c.limit || 0), 0);
    e.products[p.product] = (e.products[p.product] || 0) + 1;
  }
  return Object.values(out).sort((a, b) => b.insured - a.insured);
}
// A scenario: a hurricane, wildfire or earthquake of a given strength over the areas at a hazard level. The damage share of
// the sum insured by level is a simple, stated assumption (not a catastrophe model), so the point is the shape: how
// much Cover keeps after the treaty, and what it does to the year's loss ratio and the giveback.
export const PERIL_DAMAGE = { hurricane: [0, 0.002, 0.01, 0.04], wildfire: [0, 0.001, 0.006, 0.035], quake: [0, 0.003, 0.012, 0.05] };
const DAMAGE = PERIL_DAMAGE;
export function scenario({ peril = "hurricane", strength = 1 } = {}) {
  const k = peril in DAMAGE ? peril : "hurricane", s = Math.max(0.5, Math.min(3, +strength || 1));
  let gross = 0; const hit = [];
  for (const e of exposure()) { const loss = Math.round(e.insured * DAMAGE[k][e[k]] * s); if (loss) { gross += loss; hit.push({ area: e.area, state: e.state, level: e[k], policies: e.policies, loss }); } }
  const ceded = Math.min(TREATY.catLimit, Math.max(0, gross - TREATY.catRetention)), net = gross - ceded, d = dashboard();
  const poolTotal = pools().reduce((t, p) => t + Math.max(0, p.balance), 0);
  return { peril: k, strength: s, gross, ceded, net, hit, lossRatioNow: d.total.lossRatio, lossRatioAfter: d.total.earned ? +((d.total.claimsPaid - d.total.recoveries + net) / d.total.earned).toFixed(3) : null, givebackNow: poolTotal, givebackAfter: Math.max(0, poolTotal - net),
    assumption: `damage as a share of the sum insured by hazard level 1/2/3: ${DAMAGE[k].slice(1).map((x) => `${(x * 100).toFixed(1)}%`).join(" / ")}, times strength ${s}` };
}

// Rate filings: a change Cover asks the regulator for. The demo plays the regulator.
export function fileRate({ product, change, why = "" }) {
  if (!PRODUCTS[product] || !(Math.abs(+change) <= 0.5)) return { error: "filing", message: "product, and change as a fraction (-0.5 to 0.5)" };
  const f = { id: `rf_${db.data.filings.length + 1}`, product, change: +change, why: String(why).slice(0, 300), status: "filed", filed: nowIso() };
  db.data.filings.push(f); db.save(); return f;
}
export function answerRate(id, approve) {
  const f = db.data.filings.find((x) => x.id === id);
  if (!f || f.status !== "filed") return { error: "filing" };
  f.status = approve ? "approved" : "refused"; f.answered = nowIso(); db.save();
  if (approve) { const p = PRODUCTS[f.product]; p.price.rateChange = (p.price.rateChange || 1) * (1 + f.change); }
  return f;
}
export const filings = () => db.data.filings;

// The year's close: each pool pays its reinsurance, then gives what is left to its cause
export async function closeYear() {
  const y = year(), done = [], items = [];
  // each pool pays its reinsurance: the reinsurance part of every premium line it received this year
  for (const cause of Object.keys(CAUSES)) {
    const reins = lines({ year: y, cause, kind: "premium" }).reduce((t, l) => { const p = allPolicies().find((x) => x.id === l.policy); return t + (p ? Math.round(l.amount * (p.reinsShare ?? reinsShare(p))) : 0); }, 0);
    if (reins) post({ kind: "reinsurance", cause, amount: reins, note: `reinsurance for year ${y}` });
    const left = poolOf(cause, y).balance;
    done.push({ year: y, cause, amount: Math.max(0, left), reinsurance: reins, policies: new Set(lines({ year: y, cause, kind: "premium" }).map((l) => l.policy)).size, at: nowIso(), payout: null });
    if (left > 0) items.push({ id: `giveback-${y}-${cause}`, receiver: CAUSES[cause].email, amount: left, note: `Cover's giveback for year ${y}: what was left of the ${CAUSES[cause].en} pool.` });
  }
  // then every cause is paid in ONE PayPal Payouts batch, an item per cause
  let batch = null, err = null;
  if (items.length) try { batch = (await pp().payoutBatch({ batchId: `giveback-${y}`, items, subject: "Cover: this year's giveback", note: `Cover's giveback for year ${y}.` })).batchId; } catch (e) { err = why(e); }
  for (const g of done) {
    if (g.amount > 0) { if (batch) { g.payout = batch; post({ kind: "giveback", cause: g.cause, amount: g.amount, ref: batch, note: `giveback year ${y}, item giveback-${y}-${g.cause}` }); } else g.error = err; }
    const rc = receipts.issue({ kind: "giveback", subject: `giveback-${y}-${g.cause}`, event: "given", data: { year: y, cause: g.cause, amount: g.amount, reinsurance: g.reinsurance, payout: g.payout, item: `giveback-${y}-${g.cause}`, pool: poolOf(g.cause, y) } });
    g.receipt = rc.id; db.data.givebacks.push(g);
  }
  db.save();
  // each person hears what their premiums gave, cause by cause
  const people = new Map();
  for (const p of allPolicies()) for (const [c, share] of Object.entries(causesOfPolicy(p))) { const m = people.get(p.person) || {}; m[c] = Math.max(m[c] || 0, share); people.set(p.person, m); }
  for (const [pid, m] of people) { const gs = done.filter((g) => m[g.cause] && g.amount > 0); if (gs.length) record({ actor: { kind: "platform" }, who: [pid], action: "giveback", summary: `Year ${y} closed: ${gs.map((g) => `${usd(g.amount)} to ${CAUSES[g.cause].en}`).join(", ")}, in one PayPal Payouts batch${batch ? ` (${batch})` : ""}.`, ref: batch }); }
  done.funds = await (await import("./community.js")).closeYear();
  nextYear();
  return done;
}
const reinsShare = (p) => ({ renters: 0.045, home: 0.1, pet: 0.016, life: 0.038, car: 0.031 })[p.product] || 0.04;
export const givebacks = () => db.data.givebacks;
