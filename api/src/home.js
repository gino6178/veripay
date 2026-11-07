// The home profile and its maintenance agent (PLAN §16 item 1). Each customer's home keeps:
//   appliances   found in their paid jobs (a water heater from the job's spec and the rating plate the checker read),
//                or added by the person; with installed date, size, brand/model/serial and warranty dates
//   history      every job done there: what, who, when, what it cost, its close-out package
//   warranties   the workmanship warranty of each paid job, and an appliance's typical manufacturer warranty (labelled)
// The maintenance agent is rules (no model): by an appliance's age, the last service and warranty dates it suggests
// work ("flush the water heater once a year", "the warranty on DP-1012 ends in 12 days"). The person, or their agent
// within the person's limits, turns a suggestion into a job (posted and sent to pros like any other).
import crypto from "node:crypto";
import * as J from "./jobs.js";
import { person, peopleStore, limitsOf } from "./people.js";
import { now, nowIso, DAY } from "./clock.js";
import { usd } from "./pay/index.js";
import { BANDS } from "./estimate.js";

export const KINDS = ["water_heater", "faucet", "toilet", "drain", "dishwasher", "garbage_disposal", "water_softener", "hvac", "other"];
// typical manufacturer tank warranties (years) by kind: a rule of thumb, labelled as such, never read from a document
const TYPICAL_WARRANTY_YEARS = { water_heater: 6, faucet: 5, toilet: 5, dishwasher: 1, garbage_disposal: 3, water_softener: 5, hvac: 5 };
const LIFE_YEARS = { water_heater: 10, garbage_disposal: 10, dishwasher: 10, toilet: 25, faucet: 15, water_softener: 15, hvac: 15 };
const YEAR = 365.25 * DAY;
const sid = (...p) => `sug_${crypto.createHash("sha256").update(p.join("|")).digest("hex").slice(0, 10)}`;
const isWaterHeater = (j) => j.scope?.template === "water_heater" || /water heater/i.test(`${j.text} ${j.scope?.title || ""}`);
const paid = (j) => ["released", "resolved"].includes(j.status) && (j.money?.split?.release || 0) > 0;

// appliances from the person's paid jobs: a water heater replacement installs one (its gallons from the scope's spec,
// brand/model/serial from the rating plate the checker read, when it did)
function fromJobs(jobs) {
  const out = [];
  for (const j of jobs.filter(paid)) {
    if (!isWaterHeater(j) || !/replac|install|new/i.test(`${j.text} ${j.scope?.title || ""}`)) continue;
    const plate = j.checks.flatMap((r) => r.checks).map((c) => c.plate).filter((p) => p && (p.brand || p.model || p.serial)).at(-1) || null;
    out.push({ id: `apl_${j.id.slice(4)}`, kind: "water_heater", label: `Water heater${j.scope?.spec?.capacityGal ? ` (${j.scope.spec.capacityGal} gal)` : ""}`, installed: j.paidAt, capacityGal: j.scope?.spec?.capacityGal || (String(j.text).match(/(\d{2})\s*gal/i)?.[1] ? +String(j.text).match(/(\d{2})\s*gal/i)[1] : null),
      brand: plate?.brand || j.scope?.spec?.brand || null, model: plate?.model || null, serial: plate?.serial || null, plateReadBy: plate?.by || null, source: plate ? "the job's spec and the rating plate the checker read" : "the job's spec", job: j.id, number: j.number, pro: j.agreed?.proName || null });
  }
  return out;
}
const added = (p) => p?.home?.appliances || [];
export function addAppliance(personId, b = {}) {
  const p = person(personId);
  if (!p) return { error: "person", message: "No such person." };
  const allowed = ["kind", "label", "brand", "model", "serial", "capacityGal", "installed", "notes"], bad = Object.keys(b).filter((k) => !allowed.includes(k));
  if (bad.length) return { error: "fields", message: `Unknown fields: ${bad.join(", ")}. Allowed: ${allowed.join(", ")}.`, unknown: bad, allowed };
  if (!KINDS.includes(b.kind)) return { error: "kind", message: `kind is one of ${KINDS.join(", ")}.` };
  const inst = b.installed ? Date.parse(b.installed) : null;
  if (b.installed && (!Number.isFinite(inst) || inst > now())) return { error: "installed", message: "installed is a past date (YYYY-MM-DD)." };
  const a = { id: `apl_${crypto.randomBytes(4).toString("hex")}`, kind: b.kind, label: String(b.label || b.kind.replace(/_/g, " ")).slice(0, 60), brand: b.brand ? String(b.brand).slice(0, 40) : null, model: b.model ? String(b.model).slice(0, 40) : null, serial: b.serial ? String(b.serial).slice(0, 40) : null,
    capacityGal: b.capacityGal != null ? Math.round(+b.capacityGal) || null : null, installed: inst ? new Date(inst).toISOString() : null, notes: b.notes ? String(b.notes).slice(0, 300) : null, source: "added by the person", at: nowIso() };
  p.home = { ...(p.home || {}), appliances: [...added(p), a] }; peopleStore.save();
  return a;
}
export function removeAppliance(personId, id) { const p = person(personId); const n = added(p).length; if (!p) return false; p.home = { ...(p.home || {}), appliances: added(p).filter((a) => a.id !== id) }; peopleStore.save(); return added(p).length < n; }

const svcOf = (jobs, kind) => jobs.filter(paid).filter((j) => (kind === "water_heater" ? isWaterHeater(j) : new RegExp(kind.replace(/_/g, " "), "i").test(`${j.text} ${j.scope?.title || ""}`))).map((j) => ({ job: j.id, number: j.number, at: j.paidAt, title: j.scope.title }));
export function homeOf(personId) {
  const p = person(personId);
  if (!p) return null;
  const jobs = J.jobsOf(personId);
  const appliances = [...fromJobs(jobs), ...added(p)].map((a) => {
    const age = a.installed ? (now() - Date.parse(a.installed)) / YEAR : null, ty = TYPICAL_WARRANTY_YEARS[a.kind];
    return { ...a, ageYears: age != null ? +age.toFixed(1) : null, service: svcOf(jobs, a.kind).filter((s) => !a.installed || s.at >= a.installed),
      warranty: a.installed && ty ? { until: new Date(Date.parse(a.installed) + ty * YEAR).toISOString(), years: ty, source: "typical manufacturer warranty for this kind (a rule of thumb, not read from your paperwork)" } : null, expectedLifeYears: LIFE_YEARS[a.kind] || null };
  });
  const history = jobs.filter((j) => j.agreed).map((j) => ({ job: j.id, number: j.number, title: j.scope?.title, trade: j.scope?.trade, status: j.status, pro: j.agreed.proName, agreedAt: j.agreed.at, paidAt: j.paidAt || null, paid: J.money(J.balance(j).captured - J.balance(j).refunded), closeout: paid(j) ? `/api/jobs/${j.id}/reports/closeout.pdf` : null, insurance: null }));
  const warranties = [
    ...jobs.filter((j) => j.warranty?.until).map((j) => ({ kind: "workmanship", job: j.id, number: j.number, title: j.scope.title, pro: j.agreed?.proName, until: j.warranty.until, status: j.warranty.status, daysLeft: Math.ceil((Date.parse(j.warranty.until) - now()) / DAY), source: "the job's warranty window (VeriPay)" })),
    ...appliances.filter((a) => a.warranty).map((a) => ({ kind: "manufacturer (typical)", appliance: a.id, label: a.label, until: a.warranty.until, daysLeft: Math.ceil((Date.parse(a.warranty.until) - now()) / DAY), source: a.warranty.source })),
  ].sort((a, b) => a.until.localeCompare(b.until));
  return { person: personId, address: { zip: p.zip, line: p.address?.line || null }, appliances, history, warranties, suggestions: suggestionsFor(personId, { appliances, warranties, jobs }), label: "Your home's record from your jobs on VeriPay; suggestions are rules (no model)." };
}
const band = (k) => { const b = BANDS[k] || BANDS.handyman; return b[2]; };
// the maintenance agent: rules by age, last service and warranty dates
export function suggestionsFor(personId, ctx = null) {
  const p = person(personId);
  if (!p) return [];
  const h = ctx || homeOf(personId), done = new Set((p.home?.accepted || []).map((x) => x.id).concat(p.home?.dismissed || [])), out = [], t = now();
  const add = (s) => { if (!done.has(s.id)) out.push({ ...s, budget: J.money(s.budget), source: "rules", label: "A maintenance suggestion from rules on your home's record." }); };
  for (const a of h.appliances) {
    const last = a.service.at(-1)?.at || a.installed, since = last ? (t - Date.parse(last)) / YEAR : null;
    if (a.kind === "water_heater") {
      if (since != null && since >= 11 / 12) add({ id: sid(personId, a.id, "flush", String(new Date(last).getFullYear())), kind: "flush", appliance: a.id, title: `Flush the ${a.label.toLowerCase()}`, why: `Tank water heaters should be flushed about once a year to clear sediment; the last service was ${Math.floor(since * 12)} months ago.`, due: new Date(Date.parse(last) + YEAR).toISOString(), trade: "plumbing", text: `Flush the ${a.capacityGal ? `${a.capacityGal} gallon ` : ""}tank water heater and check the T&P valve and anode rod. Annual maintenance, this month.`, budget: 17500 });
      if (a.ageYears != null && a.ageYears >= 3 && a.ageYears < 9) add({ id: sid(personId, a.id, "anode", String(Math.floor(a.ageYears))), kind: "inspect", appliance: a.id, title: "Check the water heater's anode rod", why: `At ${a.ageYears} years the anode rod is often worn; replacing it extends the tank's life.`, due: nowIso(), trade: "plumbing", text: `Inspect and replace the anode rod on our ${a.ageYears}-year-old water heater if worn. This month.`, budget: 20000 });
      if (a.ageYears != null && a.ageYears >= (a.expectedLifeYears || 10)) add({ id: sid(personId, a.id, "replace"), kind: "replace", appliance: a.id, title: "Plan to replace the water heater", why: `At ${a.ageYears} years it's past the usual ${a.expectedLifeYears}-year life of a tank water heater.`, due: nowIso(), trade: "plumbing", text: `Replace our ${a.capacityGal || 50} gallon water heater (${a.ageYears} years old) this month.`, budget: band("water_heater") });
    }
    if (a.warranty) { const left = (Date.parse(a.warranty.until) - t) / DAY; if (left > 0 && left <= 60) add({ id: sid(personId, a.id, "mfr-warranty", a.warranty.until), kind: "warranty", appliance: a.id, title: `The ${a.label.toLowerCase()}'s warranty ends in ${Math.ceil(left)} days`, why: "A check before the (typical) manufacturer warranty ends, while a fault is still covered.", due: a.warranty.until, trade: "plumbing", text: `Inspect our ${a.label.toLowerCase()} for leaks or faults before its warranty ends.`, budget: 15000 }); }
  }
  for (const w of h.warranties.filter((x) => x.kind === "workmanship" && x.daysLeft > 0 && x.daysLeft <= 30 && x.status === "open")) add({ id: sid(personId, w.job, "workmanship"), kind: "warranty", job: w.job, title: `The workmanship warranty on ${w.number} ends in ${w.daysLeft} days`, why: `If anything about "${w.title}" isn't right, claim it on the job before ${w.until.slice(0, 10)}: the pro fixes it at no charge.`, due: w.until, trade: null, text: null, budget: 0, action: { claimDefect: `/api/jobs/${w.job}/defect` } });
  const jobs = ctx?.jobs || J.jobsOf(personId), clean = jobs.filter(paid).filter((j) => j.scope?.trade === "cleaning").at(-1);
  if (clean && (t - Date.parse(clean.paidAt)) / DAY >= 28 && !jobs.some((j) => j.schedule && j.scope?.trade === "cleaning")) add({ id: sid(personId, clean.id, "clean-again"), kind: "repeat", job: clean.id, title: "Book the next clean", why: `The last clean (${clean.number}) was ${Math.floor((t - Date.parse(clean.paidAt)) / DAY)} days ago.`, due: nowIso(), trade: "cleaning", text: clean.text, budget: clean.agreed.price, action: { repeat: `/api/jobs/${clean.id}/repeat` } });
  return out.sort((a, b) => String(a.due).localeCompare(String(b.due)));
}
// the person (or their agent, within the person's limits) turns a suggestion into a job, posted and sent to pros
export async function acceptSuggestion(personId, sugId, actor, { budget = null } = {}) {
  const p = person(personId), s = suggestionsFor(personId).find((x) => x.id === sugId);
  if (!s) return { error: "not_found", message: "No such open suggestion (maintenance_suggestions lists them)." };
  if (!s.text) return { error: "state", message: `This suggestion is an action on a job, not a new job: ${Object.values(s.action || {})[0] || "see the job"}.`, action: s.action || null };
  const b = budget != null ? Math.round(+budget) : s.budget.cents;
  if (actor?.kind === "agent" && b > limitsOf(p).perJobMax) return { error: "limit", limit: "perJobMax", message: `This job's budget (${usd(b)}) is over your person's per-job limit of ${usd(limitsOf(p).perJobMax)}: they accept it on the website.`, limitUsd: usd(limitsOf(p).perJobMax), wouldBe: usd(b) };
  const j = await J.createJob(personId, { text: s.text, zip: p.zip, budget: b, actor });
  if (j.error) return j;
  await J.requestOffers(j.id, actor);
  p.home = { ...(p.home || {}), accepted: [...(p.home?.accepted || []), { id: s.id, job: j.id, at: nowIso(), by: actor?.kind || "person" }] }; peopleStore.save();
  return { job: J.job(j.id), suggestion: s };
}
export function dismissSuggestion(personId, sugId) { const p = person(personId); if (!p) return false; p.home = { ...(p.home || {}), dismissed: [...new Set([...(p.home?.dismissed || []), sugId])] }; peopleStore.save(); return true; }
