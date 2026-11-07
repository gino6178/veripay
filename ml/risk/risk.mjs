// Done-Risk in Node: evaluates the exported LightGBM trees (ml/risk/fit.py -> done_risk_<target>.json) for a job, with
// no dependency. Ported from Cover-Risk's risk.mjs.
//   import { load } from "../ml/risk/risk.mjs"; const m = load("ml/risk/out");
//   m.predict(job) -> { dispute: { p, why }, overrun: { p, why }, version }
//     job: { trade, price, ceiling, partsAllowance, partEstimate, checks, gaps, windowDays, proJobs, proRating,
//            proLicensed, licensedTrade, firstTimeHirer, hirerPastDisputes, problemPhoto }   (money in dollars)
// "why" is each feature's share of the log-odds along the paths the job takes (Saabas path attributions): close to the
// SHAP values fit.py reports, not equal to them.
//   node ml/risk/risk.mjs ml/risk/out     (checks the Node predictions against Python's on 50 test jobs each)
import fs from "node:fs";
import path from "node:path";

const FROM_JOB = { trade: "trade", price: "price", price_to_ceiling: (j) => j.price / j.ceiling, parts_allowance: "partsAllowance", allowance_to_parts: (j) => (j.partEstimate > 0 ? j.partsAllowance / j.partEstimate : 1),
  checks: "checks", gaps: "gaps", window_days: "windowDays", pro_jobs: "proJobs", pro_rating: "proRating", pro_licensed: (j) => +!!j.proLicensed, licensed_trade: (j) => +!!j.licensedTrade,
  first_time_hirer: (j) => +!!j.firstTimeHirer, hirer_past_disputes: "hirerPastDisputes", problem_photo: (j) => +!!j.problemPhoto };

function encode(spec, row) {
  return spec.features.map((f) => {
    const v = row[f], e = spec.encode[f];
    if (v === undefined || v === null || v === "") return NaN;
    if (e.choice) { const i = e.choice.indexOf(String(v)); return i < 0 ? NaN : i; }
    return Number(v);
  });
}
function walk(node, x, contrib) {
  while (node.f !== undefined) {
    const v = x[node.f]; const left = node.cat ? Number.isFinite(v) && node.cat.includes(v) : Number.isFinite(v) ? v <= node.t : node.dl;
    const next = left ? node.l : node.r; if (contrib) contrib[node.f] += next.v - node.v; node = next;
  }
  return node.v;
}
export function score(spec, row, reasons = false) {
  const x = encode(spec, row), contrib = reasons ? new Array(x.length).fill(0) : null;
  let z = 0; for (const t of spec.trees) z += walk(t, x, contrib);
  return { p: 1 / (1 + Math.exp(-z)), contrib };
}
export const rowOf = (job) => Object.fromEntries(Object.entries(FROM_JOB).map(([k, f]) => [k, typeof f === "function" ? f(job) : job[f]]));

export function load(dir) {
  const specs = {};
  for (const f of fs.readdirSync(dir).filter((f) => /^done_risk_\w+\.json$/.test(f))) { const s = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")); specs[s.target] = s; }
  return {
    specs,
    predict(job) {
      const row = rowOf(job), out = {};
      for (const [t, spec] of Object.entries(specs)) {
        const { p, contrib } = score(spec, row, true);
        out[t] = { p: +p.toFixed(4), why: spec.features.map((f, i) => ({ factor: f, value: row[f], logOdds: +contrib[i].toFixed(3) })).filter((w) => Math.abs(w.logOdds) >= 0.05).sort((a, b) => Math.abs(b.logOdds) - Math.abs(a.logOdds)).slice(0, 5) };
      }
      return { ...out, version: Object.values(specs).map((s) => s.version).join(",") };
    },
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"))) {
  const dir = process.argv[2] || "ml/risk/out", m = load(dir);
  for (const t of Object.keys(m.specs)) {
    const cs = JSON.parse(fs.readFileSync(path.join(dir, `check_${t}.json`), "utf8"));
    const worst = Math.max(...cs.map((c) => Math.abs(score(m.specs[t], c.job).p - c.predicted)));
    console.log(t, `${cs.length} jobs, largest difference from Python ${worst.toExponential(2)}`);
  }
  console.log(JSON.stringify(m.predict({ trade: "plumbing", price: 240, ceiling: 250, partsAllowance: 30, partEstimate: 45, checks: 4, gaps: 2, windowDays: 1, proJobs: 3, proRating: 4.1, proLicensed: false, licensedTrade: true, firstTimeHirer: true, hirerPastDisputes: 0, problemPhoto: false }), null, 1));
}
