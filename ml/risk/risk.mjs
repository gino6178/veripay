// Cover-Risk in Node: evaluates the exported LightGBM trees (ml/risk/fit.py -> risk_<product>.json) for a quote, with
// no dependency. It has the shape api/src/quote.js useRiskModel() expects, but is not wired into the app:
//   import { load } from "../ml/risk/risk.mjs"; const m = load("ml/risk/out"); useRiskModel(m);
//   m.estimate(product, answers, zone) -> { claims (cents a year), why: [{ factor, value, times }], version } | null
// The reasons are each feature's share of the prediction along the paths the policy takes through the trees (Saabas
// path attributions, on the log scale, so each is a factor that multiplies the premium). They are close to the SHAP
// values fit.py reports, not equal to them.
//   node ml/risk/risk.mjs ml/risk/out     (checks the Node predictions against Python's on 50 test policies each)
import fs from "node:fs";
import path from "node:path";

function encode(spec, answers, zone) {
  return spec.features.map((f) => {
    if (f.startsWith("z_")) return zone?.[f.slice(2)] ?? NaN;
    const v = answers[f], e = spec.encode[f];
    if (v === undefined || v === null || v === "") return NaN;
    if (e.choice) { const i = e.choice.indexOf(String(v)); return i < 0 ? NaN : i; }
    if (typeof v === "boolean") return v ? 1 : 0;
    return Number(v);
  });
}

function walk(node, x, contrib) {
  while (node.f !== undefined) {
    const v = x[node.f];
    let left;
    if (node.cat) left = Number.isFinite(v) && node.cat.includes(v);
    else left = Number.isFinite(v) ? v <= node.t : node.dl;
    const next = left ? node.l : node.r;
    if (contrib) contrib[node.f] += next.v - node.v;
    node = next;
  }
  return node.v;
}

export function predict(spec, answers, zone, withReasons = false) {
  const x = encode(spec, answers, zone), contrib = withReasons ? new Array(x.length).fill(0) : null;
  let raw = spec.init || 0;
  for (const t of spec.trees) raw += walk(t, x, contrib);
  return { claims: Math.exp(raw), contrib, x };
}

export function load(dir) {
  const specs = {};
  for (const f of fs.readdirSync(dir).filter((f) => /^risk_\w+\.json$/.test(f))) { const s = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")); specs[s.product] = s; }
  return {
    specs,
    estimate(p, answers, zone) {
      const spec = specs[p?.id || p];
      if (!spec) return null;
      const { claims, contrib } = predict(spec, answers, zone || {}, true);
      const why = spec.features.map((f, i) => ({ factor: f.startsWith("z_") ? `zone.${f.slice(2)}` : f, value: f.startsWith("z_") ? zone?.[f.slice(2)] : answers[f], times: +Math.exp(contrib[i]).toFixed(3) }))
        .filter((w) => Math.abs(w.times - 1) >= 0.02).sort((a, b) => Math.abs(Math.log(b.times)) - Math.abs(Math.log(a.times)));
      return { claims: Math.round(claims), why, version: spec.version };
    },
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"))) {
  const dir = process.argv[2] || "ml/risk/out", m = load(dir);
  for (const p of Object.keys(m.specs)) {
    const cs = JSON.parse(fs.readFileSync(path.join(dir, `check_${p}.json`), "utf8"));
    const worst = Math.max(...cs.map((c) => Math.abs(predict(m.specs[p], c.answers, c.zone).claims / c.predicted - 1)));
    const e = m.estimate(p, cs[0].answers, cs[0].zone);
    console.log(p, `${cs.length} policies, largest relative difference from Python ${worst.toExponential(2)}`, JSON.stringify({ claims: e.claims, why: e.why.slice(0, 3) }));
  }
}
