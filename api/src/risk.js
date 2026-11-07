// Done-Risk in the app: the probability a job ends in a dispute, and that it runs over its agreed price (a change
// order), from the LightGBM trees in ml/risk/out (ml/risk/risk.mjs evaluates them; dispute AUC 0.776, overrun AUC 0.780
// on held-out synthetic jobs, calibrated; see ml/RESULTS.md). Used to size the hold's buffer within the ceiling and
// shown on the job and in the back office, labelled "model: done-risk". When the files aren't there, a small rules
// version gives the same shape, labelled "rules". It never decides money by itself: it sizes a buffer within limits.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DIR = process.env.DONE_RISK_DIR || path.join(HERE, "../../ml/risk/out");
let model = undefined, why = null;
async function loadModel() {
  if (model !== undefined) return model;
  try {
    if (!fs.existsSync(path.join(DIR, "done_risk_dispute.json")) || !fs.existsSync(path.join(DIR, "done_risk_overrun.json"))) throw new Error(`no Done-Risk trees in ${DIR}`);
    const m = await import(pathToFileURL(path.join(HERE, "../../ml/risk/risk.mjs")).href);
    model = m.load(DIR);
  } catch (e) { model = null; why = String(e?.message || e).slice(0, 160); }
  return model;
}
export const riskStatus = async () => { const m = await loadModel(); return m ? { live: true, source: "model: done-risk", version: Object.values(m.specs).map((s) => s.version).join(",") } : { live: false, source: "rules", why }; };

// the model's inputs, from a job (money in dollars, as the model was trained)
export function inputsOf(j, { price = null, pro = null, history = [] } = {}) {
  const cents = price ?? j.agreed?.price ?? null, ceiling = j.scope?.priceCeiling || j.budget || cents;
  const w = j.scope?.window, days = w?.from && w?.to ? Math.max(0.5, (Date.parse(w.to) - Date.parse(w.from)) / 864e5) : 7;
  const allowance = (j.agreed?.parts ?? j.scope?.estimate?.parts ?? 0) / 100, estimate = (j.scope?.estimate?.parts ?? j.agreed?.parts ?? 0) / 100;
  const past = history.filter((x) => x.id !== j.id && x.agreed);
  return { trade: j.scope?.trade || "handyman", price: (cents || 0) / 100, ceiling: (ceiling || cents || 1) / 100, partsAllowance: allowance, partEstimate: estimate || allowance,
    checks: j.scope?.checks?.length || 0, gaps: j.scopeReview?.gaps?.length ?? 0, windowDays: +days.toFixed(1),
    proJobs: pro?.jobs ?? 0, proRating: pro?.rating ?? 4.5, proLicensed: !!pro?.verification?.license?.valid, licensedTrade: (j.scope?.trade || "") === "plumbing",
    firstTimeHirer: past.length === 0, hirerPastDisputes: past.filter((x) => x.dispute || (x.pastDisputes || []).length).length, problemPhoto: (j.evidence || []).some((e) => e.phase === "reference") };
}
// the rules' stand-in: the same direction as the model (gaps, a first-time hirer and past disputes raise dispute risk;
// a price near the ceiling and parts below the estimate raise overrun risk)
function rules(x) {
  const lg = (z) => 1 / (1 + Math.exp(-z));
  const d = lg(-2.0 + 0.35 * x.gaps + 0.5 * (x.firstTimeHirer ? 1 : 0) + 0.6 * x.hirerPastDisputes + 1.2 * Math.max(0, x.price / x.ceiling - 0.85) - 0.15 * Math.min(10, x.proJobs / 20));
  const o = lg(-2.1 + 0.3 * x.gaps + 0.8 * Math.max(0, 1 - (x.partEstimate > 0 ? x.partsAllowance / x.partEstimate : 1)) + 0.002 * Math.min(1000, x.price) - (x.problemPhoto ? 0.3 : 0));
  return { dispute: { p: +d.toFixed(4), why: [] }, overrun: { p: +o.toFixed(4), why: [] } };
}
// each factor in words: what it is, its value, which way it pushed (factors at 0 / false, or with no effect, are left out)
const SAY = { trade: (v) => `a ${v} job`, price: (v) => `the price ($${Math.round(v)})`, price_to_ceiling: (v) => `the price is ${Math.round(v * 100)}% of the ceiling`, parts_allowance: (v) => `$${Math.round(v)} of parts in the price`,
  allowance_to_parts: (v) => `the parts allowance is ${Math.round(v * 100)}% of the part estimate`, checks: (v) => `${v} done-conditions`, gaps: (v) => `${v} gap${v === 1 ? "" : "s"} in the scope review`, window_days: (v) => `a ${v}-day window`,
  pro_jobs: (v) => `the pro has ${v} jobs done`, pro_rating: (v) => `the pro is rated ${v}`, pro_licensed: () => "the pro is licensed", licensed_trade: () => "a licensed trade", first_time_hirer: () => "a first-time hirer",
  hirer_past_disputes: (v) => `${v} past dispute${v === 1 ? "" : "s"} for this customer`, problem_photo: () => "the customer posted a photo of the problem" };
const words = (why, what) => (why || []).filter((w) => w.value !== 0 && w.value !== false && w.value != null && Math.abs(w.logOdds) >= 0.05).map((w) => ({ factor: w.factor, says: `${(SAY[w.factor] || ((v) => `${w.factor.replace(/_/g, " ")} ${v}`))(w.value)} ${w.logOdds > 0 ? "raises" : "lowers"} the ${what} risk`, effect: w.logOdds > 0 ? "raises" : "lowers", logOdds: w.logOdds }));
export async function riskOf(j, opts = {}) {
  const x = inputsOf(j, opts), m = await loadModel();
  if (m) { try { const r = m.predict(x); return { dispute: { p: r.dispute.p, why: words(r.dispute.why, "dispute") }, overrun: { p: r.overrun.p, why: words(r.overrun.why, "overrun") }, source: "model: done-risk", version: r.version, inputs: x, at: new Date().toISOString() }; } catch (e) { why = String(e?.message || e).slice(0, 160); } }
  return { ...rules(x), source: "rules", why: why || "the Done-Risk files aren't loaded", inputs: x, at: new Date().toISOString() };
}
// the buffer: the person's buffer % at least, more when overrun is likely (10% + 60% of the overrun probability, at
// most 40%); the hold never exceeds the ceiling (startHold caps it)
export const riskBufferPct = (overrunP, minPct) => Math.max(minPct, Math.min(40, Math.round(10 + 60 * (overrunP || 0))));
