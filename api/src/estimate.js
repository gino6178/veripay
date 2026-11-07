// A fair-price range for a job, from what similar jobs here actually cost (PLAN §15 item 4). An estimate to negotiate
// with, never a quote: every answer says so and says where it came from.
//
//   estimatePrice({ text, scope?, photos?, zip?, history?, risk?, timeoutMs? }) -> {
//     low, high, typical (cents), basis: [string], source: "model+history" | "history" | "rules" | "model+rules",
//     template, size: "small"|"usual"|"large", matched: n (completed jobs used), seen?: [description], label, ms }
//   fairRange(job) -> { low, high, typical, counterAt, source, label }   (sync: for the customer's agent to counter within)
//
// 1. The job type: the scope's template, else the scope writer's rules on the text; the customer's problem photos,
//    described by done-vlm without being told anything (describe-only, vlm.js), can name the fixture when the text is
//    vague ("it's broken" + a photo of a water heater) and say how big it is ("two sinks", "a large hole").
// 2. The range, by code: the 25th-75th percentile (median as typical) of completed jobs' agreed prices of that type
//    (history: [{ template | title | text, price (cents), at? }], 3 or more needed), else a demo band per job type.
// 3. Size from the text and the photo: small x0.85, large x1.3 (upper end x1.4).
// 4. Done-Risk's overrun probability, when given (risk: { overrun: 0..1 }), widens the upper end by up to 50%.
import { pickTemplate } from "./scope.js";
import { vlmAvailable, describePhoto } from "./vlm.js";

// demo bands (cents) per job type when there's no history: rough Austin figures, labelled as such
export const BANDS = {
  faucet: [12000, 25000, 18000], drain: [10000, 30000, 17500], toilet: [10000, 25000, 16000], water_heater: [120000, 220000, 160000],
  cleaning: [15000, 30000, 22000], tv_mount: [10000, 25000, 16000], furniture: [8000, 20000, 13000], drywall: [15000, 35000, 24000], handyman: [10000, 30000, 18000],
  disposal: [15000, 45000, 25000], tile: [20000, 60000, 35000], caulk: [10000, 30000, 18000], leak: [15000, 45000, 25000], fan_light: [12000, 35000, 20000],
  door_lock: [8000, 25000, 15000], smoke_alarm: [8000, 25000, 14000], gutter: [12000, 35000, 20000], pressure_wash: [15000, 45000, 25000], move_out: [25000, 60000, 40000],
};
// a band means something on the price bar only when it's tight: each demo band is the typical price -25% / +30%
// (rounded to $5); history's middle half is kept within -25% / +35% of its median
for (const k of Object.keys(BANDS)) { const t = BANDS[k][2]; BANDS[k] = [Math.round((t * 0.75) / 500) * 500, Math.round((t * 1.3) / 500) * 500, t]; }
const LABEL = "an estimate from similar jobs, not a quote";
const r5 = (c) => Math.round(c / 500) * 500;
const pct = (sorted, p) => { if (!sorted.length) return null; const i = (sorted.length - 1) * p, lo = Math.floor(i), hi = Math.ceil(i); return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo); };

export function sizeOf(words) {
  const t = String(words || "").toLowerCase();
  if (/\b(two|2|both|double|several|multiple|three|whole|entire|large|big|huge|extensive|major|commercial|75 ?gal|80 ?gal)\b/.test(t)) return "large";
  if (/\b(small|minor|tiny|little|single|just one|quick)\b/.test(t)) return "small";
  return "usual";
}
const templateOf = (h) => h.template || pickTemplate(`${h.title || ""} ${h.text || ""}`).id;

export async function estimatePrice({ text = "", scope = null, photos = [], zip = null, history = [], risk = null, timeoutMs } = {}) {
  const t0 = Date.now(), basis = [], seen = [];
  // 1. what the photo shows (describe-only), when there is one and a VLM is running
  if (photos?.length && vlmAvailable()) {
    for (const p of photos.slice(0, 3)) { const d = await describePhoto(p?.path || p, { timeoutMs }); if (d.source === "model") seen.push(d.sees); }
    if (seen.length) basis.push(`the photo shows: ${seen.join(" / ").slice(0, 160)} (done-vlm)`);
    else basis.push("the photo couldn't be described (no answer from the photo model)");
  }
  let template = scope?.template || pickTemplate(text).id;
  // (a VLM says "water tank" for a water heater)
  if ((!scope?.template && template === "handyman") && seen.length) { const fromPhoto = pickTemplate(seen.join(" ").replace(/\b(cylindrical |large |hot )?water tank\b/gi, "water heater")).id; if (fromPhoto !== "handyman") { template = fromPhoto; basis.push(`job type from the photo: ${template.replace("_", " ")}`); } }
  const size = sizeOf(`${text} ${seen.join(" ")}`);
  // 2. what similar jobs cost
  const prices = (history || []).filter((h) => h && Number.isFinite(+h.price) && +h.price > 0 && templateOf(h) === template).map((h) => +h.price).sort((a, b) => a - b);
  let low, high, typical, from;
  if (prices.length >= 3) {
    typical = pct(prices, 0.5); low = Math.max(pct(prices, 0.25), typical * 0.75); high = Math.min(pct(prices, 0.75), typical * 1.35); from = "history";
    basis.push(`${prices.length} completed ${template.replace("_", " ")} jobs on VeriPay: middle half ${"$" + (low / 100).toFixed(0)}-${"$" + (high / 100).toFixed(0)}, median ${"$" + (typical / 100).toFixed(0)}`);
  } else {
    [low, high, typical] = BANDS[template] || BANDS.handyman; from = "rules";
    basis.push(`${prices.length ? `only ${prices.length} completed ${template.replace("_", " ")} job${prices.length > 1 ? "s" : ""} so far; ` : ""}a demo band for ${template.replace("_", " ")} jobs in Austin`);
  }
  // 3. size
  if (size !== "usual") { const k = size === "large" ? 1.3 : 0.85; low *= k; typical *= k; high *= size === "large" ? 1.4 : k; basis.push(`${size === "large" ? "a larger" : "a smaller"} job than usual, from the ${seen.length ? "description and the photo" : "description"}`); }
  // 4. overrun risk
  const ov = Number.isFinite(+risk?.overrun) && +risk.overrun >= 0 && +risk.overrun <= 1 ? +risk.overrun : null;
  if (ov != null && ov > 0.05) { high *= 1 + ov * 0.5; basis.push(`Done-Risk: ${Math.round(ov * 100)}% chance of an overrun, so the upper end is higher`); }
  if (zip && !/^787\d\d$/.test(String(zip))) basis.push("outside Austin: the range is Austin's");
  const source = seen.length ? `model+${from}` : from;
  return { low: r5(low), high: r5(high), typical: r5(typical), basis, source, template, size, matched: prices.length, ...(seen.length ? { seen } : {}), label: LABEL, ms: Date.now() - t0 };
}

// For the customer's agent: counter within [low, typical]; above high, say so. Uses the job's stored estimate when the
// core kept one, else the rules band for its type (labelled).
export function fairRange(job) {
  const e = job?.estimate;
  if (e && Number.isFinite(e.low) && Number.isFinite(e.high)) return { low: e.low, high: e.high, typical: e.typical, counterAt: Math.max(e.low, Math.min(e.typical, r5((e.low + e.typical) / 2))), source: e.source, label: LABEL };
  const tpl = job?.scope?.template || pickTemplate(`${job?.scope?.title || ""} ${job?.text || ""}`).id, [low, high, typical] = BANDS[tpl] || BANDS.handyman;
  return { low, high, typical, counterAt: r5((low + typical) / 2), source: "rules", label: LABEL };
}
