// Cover-Risk in quotes: the exported LightGBM trees (ml/risk/out/risk_<product>.json, from ml/risk/fit.py), evaluated
// by ml/risk/risk.mjs, installed into quote.js with useRiskModel() when the files exist.
//
// A product is priced by its trees only when they fit the product as it is now. The trees were fitted on one set of
// answers and zone levels; if the product's questions or the zone table change (a new market, new units), the trees
// would be reading answers they never saw, so that product keeps its own factor table, and /api/models says why.
// The checks, per product, at start:
//   - every answer the trees read is still one of the product's questions;
//   - every choice the product offers is a choice the trees know;
//   - the product still prices every zone level the trees read;
//   - the numbers in the export's own check policies (check_<product>.json) still lie in the product's ranges and
//     choices (a change of units, square metres to square feet say, moves the range and fails this).
// And per quote: the zone must give every level the trees read, as a number; otherwise the quote is priced by factors.
//
// Level: the trees' total on their own training portfolio is not the portfolio's actual total (ml/RESULTS.md). Home
// is the one RESULTS.md says to correct before pricing with it: on the 200,000 training policies, regenerated from
// fit.py's seeds (claims 6,706, $1,239.84 a policy-year, as RESULTS.md), the trees predict 92.64% of the actual loss,
// so home's estimate is multiplied by 1.0795 (actual / predicted, training). The other products are left as fitted;
// their training ratios are 0.9640 renters, 0.9973 pet, 0.9677 car (predicted / actual), reported, not applied.
// Life is not modelled: it stays on its mortality table.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { PRODUCTS } from "./products/index.js";
import { useRiskModel } from "./quote.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const RISK_DIR = process.env.RISK_DIR || path.join(HERE, "../../ml/risk/out");
// actual / predicted on the training portfolio; see above
export const LEVEL = { home: { times: 1.0795, why: "recalibrated to the training total: the trees predict 92.64% of the 200,000 training policies' actual loss" } };

let state = { live: false, dir: RISK_DIR, products: {}, reason: "not loaded" };
export const riskState = () => state;

// does this export fit the product as it is now? [] when it does, else the reasons it doesn't
export function fits(spec, p, checks = []) {
  const why = [], qs = Object.fromEntries((p.questions || []).map((q) => [q.id, q]));
  for (const f of spec.features) {
    if (f.startsWith("z_")) { if (!p.price?.zone?.[f.slice(2)]) why.push(`the product no longer prices zone level "${f.slice(2)}"`); continue; }
    const q = qs[f];
    if (!q) { why.push(`no question "${f}"`); continue; }
    const e = spec.encode[f] || {};
    if (e.choice) {
      if (q.type !== "choice") { why.push(`"${f}" is no longer a choice`); continue; }
      const unknown = q.options.map((o) => o.v).filter((v) => !e.choice.includes(String(v)));
      if (unknown.length) why.push(`"${f}" offers ${unknown.join(", ")}, which the trees never saw`);
    } else if (q.type === "choice" && !q.options.every((o) => Number.isFinite(Number(o.v)))) why.push(`"${f}" is now a choice of words, the trees read a number`);
  }
  // the check policies' answers against today's ranges and choices
  const off = {};
  for (const c of checks.slice(0, 50)) for (const [k, v] of Object.entries(c.answers || {})) {
    const q = qs[k];
    if (!q || !spec.features.includes(k)) continue;
    const bad = q.type === "number" ? typeof v !== "number" || v < q.min || v > q.max : q.type === "choice" ? !q.options.some((o) => String(o.v) === String(v)) : false;
    if (bad) (off[k] ||= { n: 0, q, vals: new Set() }).n++, off[k].vals.add(v);
  }
  for (const [k, { n, q, vals }] of Object.entries(off)) {
    const seen = [...vals].slice(0, 3).join(", ");
    why.push(q.type === "number" ? `"${k}": ${n} of the export's check policies (${seen}, ...) are outside today's range ${q.min}–${q.max} (new units?)` : `"${k}": the export's check policies use ${seen}, not one of today's choices`);
  }
  return [...new Set(why)];
}

// Load the trees and install them. Safe to call when the files are missing or don't fit: quotes keep the factors.
export async function installRisk({ dir = RISK_DIR } = {}) {
  state = { live: false, dir, products: {}, reason: null };
  if (!fs.existsSync(dir) || !fs.readdirSync(dir).some((f) => /^risk_\w+\.json$/.test(f))) { state.reason = `no exported trees in ${path.relative(path.join(HERE, "../.."), dir) || dir}`; useRiskModel(null); return state; }
  let m;
  try { m = (await import(pathToFileURL(path.join(HERE, "../../ml/risk/risk.mjs")).href)).load(dir); }
  catch (e) { state.reason = `could not load the trees: ${String(e.message || e).slice(0, 120)}`; useRiskModel(null); return state; }
  const ok = new Set();
  for (const [id, spec] of Object.entries(m.specs)) {
    const p = PRODUCTS[id];
    if (!p) { state.products[id] = { live: false, version: spec.version, why: ["no such product"] }; continue; }
    if (p.price?.model === "mortality") { state.products[id] = { live: false, version: spec.version, why: ["priced from its mortality table"] }; continue; }
    let checks = [];
    try { checks = JSON.parse(fs.readFileSync(path.join(dir, `check_${id}.json`), "utf8")); } catch { /* no check file: the key checks only */ }
    const why = fits(spec, p, checks);
    state.products[id] = { live: !why.length, version: spec.version, trees: spec.trees.length, features: spec.features, ...(LEVEL[id] ? { level: LEVEL[id].times } : {}), ...(why.length ? { why } : {}) };
    if (!why.length) ok.add(id);
  }
  for (const p of Object.values(PRODUCTS)) if (!state.products[p.id]) state.products[p.id] = { live: false, why: [p.price?.model === "mortality" ? "priced from its mortality table" : "no exported trees"] };
  if (!ok.size) { state.reason = "the exported trees don't fit today's products' answers; every product is priced by its factor table"; useRiskModel(null); return state; }
  useRiskModel({
    estimate(p, answers, zone) {
      const id = p?.id || p;
      if (!ok.has(id)) return null;
      const spec = m.specs[id];
      // every zone level the trees read must be there, as a number
      for (const f of spec.features) if (f.startsWith("z_") && !Number.isFinite(Number(zone?.[f.slice(2)]))) return null;
      const e = m.estimate(id, answers, zone || {});
      if (!e || !Number.isFinite(e.claims) || e.claims <= 0) return null;
      const lv = LEVEL[id], why = e.why.map((w) => ({ ...w, by: "Cover-Risk" }));
      if (lv) why.push({ factor: "level", value: lv.why, times: lv.times, by: "Cover-Risk" });
      return { claims: Math.round(e.claims * (lv?.times || 1)), why, version: e.version };
    },
  });
  state.live = true; state.reason = null;
  return state;
}
