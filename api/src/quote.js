// The price of a policy, said as what it is made of. Lemonade's model, which Cover follows: 20% of every premium is
// Cover's flat fee, and the other 80% goes into the claims pool, which pays the claims and the reinsurance. So the
// premium is (expected claims + reinsurance) / 0.8, and every quote shows those three parts in dollars. What is left
// in a pool when the year closes goes to the policyholders' causes (giveback.js), never back to Cover.
// Money is integer US cents. The expected claims are the product's base rate times its factors (products/*.json);
// a Cover-Risk model, once installed (risk.js), replaces the factors with its own estimate and its reasons.
import crypto from "node:crypto";
import { product } from "./products/index.js";
import { zoneOf, ZONE_FACTOR } from "./zones.js";
import { parseFlights, estimateTrip } from "./flights.js";
import { store, stateFile } from "./store.js";
import { now, nowIso } from "./clock.js";

export const FEE = 0.2;
// the share of expected claims the reinsurer charges to take the catastrophe layer (a hurricane, wildfire or
// earthquake hitting many policies at once; see carrier.js for the treaty)
const REINSURANCE = { travel: 0.03, renters: 0.05, home: 0.14, pet: 0.02, life: 0.05, car: 0.04 };
const QUOTE_MS = 30 * 864e5;
const db = store(stateFile("quotes"), { quotes: {} });
export const quotesStore = db;
let riskModel = null;
export const useRiskModel = (m) => { riskModel = m; };

const usd = (c) => `$${(c / 100).toFixed(2)}`;
// a number answer against a factor table's range keys ("0-10", "11-30", "51+", "3+") or exact keys
function bucket(table, v) {
  if (v === undefined || v === null) return undefined;
  const k = String(v);
  if (k in table) return k;
  if (typeof v !== "number") return undefined;
  for (const key of Object.keys(table)) {
    const m = key.match(/^(\d+)(?:-(\d+)|\+)$/);
    if (m && v >= +m[1] && (m[2] === undefined || v <= +m[2])) return key;
  }
  return undefined;
}

// Check a person's answers against the product's questions: what is missing and what is out of range
export function checkAnswers(p, answers = {}) {
  const missing = [], bad = [], out = {};
  for (const q of p.questions) {
    let v = answers[q.id];
    if (v === undefined || v === null || v === "") { missing.push(q.id); continue; }
    if (q.type === "number") { v = Number(v); if (!Number.isFinite(v) || v < q.min || v > q.max) { bad.push(`${q.id} must be a number from ${q.min} to ${q.max}`); continue; } }
    else if (q.type === "choice") { v = String(v); if (!q.options.some((o) => o.v === v)) { bad.push(`${q.id} must be one of ${q.options.map((o) => o.v).join(", ")}`); continue; } }
    else if (q.type === "bool") { if (typeof v === "string") v = /^(true|yes|1|是|有)$/i.test(v); v = !!v; }
    else if (q.type === "date") { v = String(v).slice(0, 10); if (!/^\d{4}-\d{2}-\d{2}$/.test(v) || Number.isNaN(Date.parse(v))) { bad.push(`${q.id} must be a date, YYYY-MM-DD`); continue; } }
    else if (q.type === "flights") { const f = parseFlights(v); if (f.bad.length || !f.flights.length) { bad.push(`${q.id}: write each flight as its number and date, like UA857 2026-12-20${f.bad.length ? ` (not understood: ${f.bad.join(", ")})` : ""}`); continue; } v = f.flights; }
    else v = String(v).slice(0, 200);
    out[q.id] = v;
  }
  // a trip: it can't have started already, comes back after it leaves, lasts at most 90 days, and its flights are in it
  if (p.term === "trip" && out.departure && out.return && !bad.length) {
    const d = Date.parse(out.departure), r = Date.parse(out.return), today = Date.parse(new Date(now()).toISOString().slice(0, 10));
    if (d < today) bad.push("departure is in the past");
    if (r < d) bad.push("return is before departure");
    if (r - d > 90 * 864e5) bad.push("a trip can be at most 90 days (TR-1.1)");
    for (const f of out.flights || []) if (Date.parse(f.date) < d - 864e5 || Date.parse(f.date) > r + 864e5) bad.push(`flight ${f.flight} on ${f.date} is outside the trip's dates`);
  }
  return { missing, bad, answers: out };
}

// Underwriting: can this be sold online, does a person have to look first, or not at all
function underwrite(p, a) {
  const u = p.underwriting || {}, hit = (r) => a[r.q] !== undefined && String(a[r.q]) === r.v && (!r.and || (a[r.and.q] >= (r.and.min ?? -Infinity)));
  const decline = (u.decline || []).find(hit), review = (u.review || []).find(hit);
  if (decline) return { decision: "refer", why: { zh: decline.zh, en: decline.en } };
  if (review) return { decision: "review", why: { zh: review.zh, en: review.en } };
  return { decision: "ok" };
}

// The expected yearly claims for these answers, and each thing that moved it
function expected(p, a, zone, addons) {
  const pr = p.price, why = [];
  if (pr.model === "trip") { const t = estimateTrip(a); return { claims: t.claims, why: t.why, extra: [] }; }
  let base;
  if (pr.model === "mortality") {
    const rate = pr.perThousand[bucket(pr.perThousand, a.ageYears)];
    base = Math.round(rate * (+a.amount / 1000) * 100);
    why.push({ factor: "ageYears", value: a.ageYears, effect: `${rate} per $1,000 of cover a year at this age` });
  } else {
    base = typeof pr.base === "object" ? pr.base[a.vehicle] : pr.base;
    why.push({ factor: "base", value: p.id, effect: `${usd(base)} a year to start from` });
  }
  let x = 1;
  for (const [q, table] of Object.entries(pr.factors || {})) {
    const k = bucket(table, a[q]);
    if (k === undefined) continue;
    const f = table[k];
    if (f === null) continue; // (a declined answer: underwriting says so)
    if (f !== 1) why.push({ factor: q, value: a[q], times: f });
    x *= f;
  }
  for (const [q, rule] of Object.entries(pr.per || {})) {
    if (rule.only && !rule.only.includes(a.level)) continue;
    const n = Math.max(0, (+a[q] || 0) / rule.every), f = 1 + n * rule.add;
    why.push({ factor: q, value: a[q], times: +f.toFixed(3) }); x *= f;
  }
  for (const [kind, on] of Object.entries(pr.zone || {})) {
    if (!on) continue;
    const f = ZONE_FACTOR[kind][zone[kind]];
    if (f !== 1) why.push({ factor: `zone.${kind}`, value: `${zone.area || zone.state || "US"}: level ${zone[kind]}`, times: f });
    x *= f;
  }
  let claims = Math.round(base * x * (pr.rateChange || 1));
  if (pr.rateChange && pr.rateChange !== 1) why.push({ factor: "rate", value: "approved rate change", times: +pr.rateChange.toFixed(3) });
  // add-ons: a fixed price, or a rate of an amount the person gave (their valuables)
  const extra = [];
  for (const id of addons) {
    const ad = p.addons.find((d) => d.id === id);
    if (!ad) continue;
    // a peril add-on (earthquake, flood) is priced by that peril's level where the home is
    const zf = ad.zone ? ZONE_FACTOR[ad.zone][zone[ad.zone] || 2] * (zone[ad.zone] === 3 ? 1.6 : 1) : 1;
    const c = ad.price != null ? Math.round(ad.price * (1 - FEE)) : Math.round((+a[ad.of] || 0) * 100 * ad.rate * zf);
    extra.push({ id, claims: c }); claims += c;
  }
  return { claims, why, extra };
}

// A quote: the price for these answers, kept 30 days so the person (or their agent) can buy exactly what they saw
export function quote(productId, answers, { addons = [], person = null, lang = "en" } = {}) {
  const p = product(productId);
  if (!p) return { error: "product", message: "No such product: renters, home, pet, life or car." };
  const chk = checkAnswers(p, answers);
  if (chk.missing.length || chk.bad.length) return { error: "answers", missing: chk.missing, bad: chk.bad, ask: chk.missing.map((id) => p.questions.find((q) => q.id === id)[lang]) };
  const a = chk.answers, uw = underwrite(p, a);
  if (uw.decision === "refer") return { product: p.id, decision: "refer", why: uw.why[lang], note: "Cover won't sell this online; a person on Cover's underwriting desk can look at it." };
  const zone = a.place ? zoneOf(a.place) : null;
  const addonIds = [...new Set(addons)].filter((id) => p.addons.some((d) => d.id === id));
  const est = riskModel?.estimate?.(p, a, zone) || null;
  const e = expected(p, a, zone || {}, addonIds);
  const claims = est ? est.claims + e.extra.reduce((t, x) => t + x.claims, 0) : e.claims;
  const reinsurance = Math.round(claims * REINSURANCE[p.id]);
  let annual = Math.max(p.price.min, Math.round((claims + reinsurance) / (1 - FEE)));
  if (p.term !== "trip") annual = Math.ceil(annual / 12) * 12; // so twelve monthly payments add up exactly
  const fee = Math.round(annual * FEE), pool = annual - fee;
  const q = {
    id: `q_${crypto.randomBytes(5).toString("hex")}`, product: p.id, person, answers: a, addons: addonIds, zone,
    annual, monthly: p.term === "trip" ? null : annual / 12, term: p.term || "year", decision: uw.decision, created: nowIso(), expires: new Date(now() + QUOTE_MS).toISOString(),
    breakdown: { expectedClaims: claims, reinsurance, poolExtra: pool - claims - reinsurance, fee },
    why: est ? est.why : e.why, priced: est ? `Cover-Risk ${est.version}` : "product factors",
    coverages: limits(p, a, addonIds),
    deductible: a.deductible ? +a.deductible * 100 : null,
  };
  db.data.quotes[q.id] = q; db.save();
  return view(q, lang);
}
export const getQuote = (id) => db.data.quotes[id] || null;

// What each coverage pays up to, for these answers
export function limits(p, a, addons = []) {
  const n = +a.travelers || 1, derived = { medicalLimit: a.plan === "plus" ? 250000 : 50000, tripCostTotal: (+a.tripCost || 0) * n };
  return [...p.coverages.filter((c) => (!c.levels || c.levels.includes(a.level)) && (!c.plans || c.plans.includes(a.plan))).map((c) => ({ id: c.id, clause: c.clause,
    limit: c.limitPerTraveler ? c.limitPerTraveler * n : c.limitFrom ? Math.round(+(a[c.limitFrom] ?? derived[c.limitFrom]) * 100 * (c.share || 1)) : c.limit, ...(c.perDay ? { perDay: c.perDay } : {}), ...(c.noDeductible ? { noDeductible: true } : {}), ...(c.parametric ? { parametric: true } : {}) })),
  ...addons.map((id) => p.addons.find((d) => d.id === id)).map((d) => ({ id: d.id, clause: d.clause, addon: true, limit: d.limit ?? (d.of ? Math.round(+a[d.of] * 100) : null) }))];
}

export function view(q, lang = "en") {
  const p = product(q.product), b = q.breakdown;
  return { quote: q.id, product: q.product, name: p.name[lang], decision: q.decision, term: q.term || "year", annual: usd(q.annual), monthly: q.monthly == null ? null : usd(q.monthly), ...(q.term === "trip" ? { trip: usd(q.annual), flights: q.answers.flights } : {}),
    whereYourMoneyGoes: { claimsPool: usd(b.expectedClaims + b.poolExtra), ofWhichExpectedClaims: usd(b.expectedClaims), reinsurance: usd(b.reinsurance), coverFee: usd(b.fee),
      means: "20% is Cover's flat fee. The rest is the claims pool: it pays claims and the reinsurance that covers one event hitting many policyholders at once (a hurricane, a wildfire, a day of grounded flights). What is left of your cause's pool after the year goes to that cause." },
    why: q.why, priced: q.priced, zone: q.zone && { area: [q.zone.area, q.zone.zip].filter(Boolean).join(" "), state: q.zone.state, flood: q.zone.flood, wildfire: q.zone.wildfire, hurricane: q.zone.hurricane, quake: q.zone.quake, theft: q.zone.theft, source: q.zone.source },
    covers: q.coverages.map((c) => ({ ...c, what: (p.coverages.find((x) => x.id === c.id) || p.addons.find((x) => x.id === c.id))[lang], limit: c.limit != null ? usd(c.limit) : null, ...(c.perDay ? { perDay: usd(c.perDay) } : {}) })),
    deductible: q.deductible != null ? usd(q.deductible) : null, addons: q.addons, expires: q.expires,
    ...(q.decision === "review" ? { note: "A person on Cover's underwriting desk looks at this before it can start." } : {}) };
}
