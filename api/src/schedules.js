// Repeat visits (PLAN §3 step 9), e.g. a clean every two weeks: made from a job that was paid, with the same pro, price
// and done-conditions. Each visit is its own job: on its day it is booked and held on the customer's saved payment
// method (no approval: the person set the schedule up on the website), and it is paid only when that visit's own
// checks pass. A hold that fails (a declined card) is recorded on the visit and the schedule pauses.
import crypto from "node:crypto";
import { store, stateFile } from "./store.js";
import { now, nowIso, DAY } from "./clock.js";
import { person } from "./people.js";
import * as J from "./jobs.js";
import { record } from "./activity.js";
import { usd } from "./pay/index.js";

const db = store(stateFile("schedules"), { schedules: {} });
export const schedulesStore = db;
const save = () => db.save();
const err = (error, message) => ({ error, message });
export const schedule = (id) => db.data.schedules[id] || null;
export const schedulesOf = (personId) => Object.values(db.data.schedules).filter((s) => s.customer === personId);
export const all = () => Object.values(db.data.schedules);
export const TRADES = ["cleaning", "handyman", "plumbing"];

export function create(jobId, { everyDays = 14, visits = 6, firstInDays = null } = {}, actor) {
  const j = J.job(jobId);
  if (!j) return err("not_found", "No such job.");
  if (actor?.kind !== "person" || actor.person !== j.customer) return err("forbidden", "The customer sets up a repeat schedule on the website.");
  if (j.status !== "released") return err("state", "Repeat a job that was done and paid.");
  if (!person(j.customer)?.vault) return err("no_saved_payment", "Repeat visits are held on a saved payment method: there isn't one.");
  const every = Math.round(+everyDays), n = Math.round(+visits);
  if (!(every >= 7 && every <= 60)) return err("everyDays", "everyDays is 7 to 60.");
  if (!(n >= 1 && n <= 26)) return err("visits", "visits is 1 to 26.");
  if (all().some((s) => s.from === j.id && s.status === "active")) return err("state", "This job already has a repeat schedule.");
  const s = { id: `sch_${crypto.randomBytes(5).toString("hex")}`, customer: j.customer, from: j.id, pro: j.agreed.pro, proName: j.agreed.proName, price: j.agreed.price, parts: j.agreed.parts || 0, helper: !!j.agreed.helper,
    template: { text: j.text, zip: j.address.zip, address: j.address.precise ? { line: j.address.line, lat: j.address.lat, lng: j.address.lng } : { line: j.address.line }, scope: { title: j.scope.title, trade: j.scope.trade, items: j.scope.items, checks: j.scope.checks, priceCeiling: j.agreed.price, estimate: j.scope.estimate || null }, bufferPct: j.bufferPct },
    everyDays: every, visits: n, made: [], nextAt: new Date(now() + (firstInDays != null ? Math.max(0, +firstInDays) : every) * DAY).toISOString(), status: "active", created: nowIso(), history: [] };
  db.data.schedules[s.id] = s; save();
  record({ actor: { kind: "person" }, who: [j.customer], action: "schedule_created", summary: `Repeat ${j.scope.title} with ${s.proName} every ${every} days, ${n} visits, ${usd(s.price)} each; each held on your saved payment method and paid only when its checks pass.`, ref: s.id });
  return view(s);
}
export function set(id, personId, what) {
  const s = schedule(id);
  if (!s || s.customer !== personId) return err("not_found", "No such schedule.");
  if (s.status === "done" || s.status === "cancelled") return err("state", `The schedule is ${s.status}.`);
  if (what === "pause") s.status = "paused";
  else if (what === "resume") { s.status = "active"; if (Date.parse(s.nextAt) < now()) s.nextAt = nowIso(); }
  else if (what === "cancel") s.status = "cancelled";
  else return err("action", "pause, resume or cancel");
  s.history.push({ at: nowIso(), event: what }); save();
  return view(s);
}
// one visit now: a job with the template's scope, booked with the same pro at the same price, held on the saved method
export async function visit(s) {
  const who = { kind: "person", person: s.customer, client: `repeat schedule ${s.id}` };
  const t = s.template;
  const j = await J.createJob(s.customer, { text: t.text, zip: t.zip, address: t.address, budget: s.price, bufferPct: t.bufferPct, scope: { ...t.scope, window: { from: nowIso(), to: new Date(now() + 3 * DAY).toISOString() }, source: "repeat schedule" }, actor: who });
  if (j.error) return j;
  const r = await J.bookRepeat(j.id, { pro: s.pro, price: s.price, parts: s.parts, helper: s.helper, schedule: s.id }, who);
  s.made.push(j.id);
  s.history.push({ at: nowIso(), event: r.error ? `visit ${s.made.length}: hold failed` : `visit ${s.made.length} held`, job: j.id, ...(r.error ? { why: r.message } : {}) });
  if (r.error) s.status = "paused";
  else if (s.made.length >= s.visits) s.status = "done";
  s.nextAt = new Date(Date.parse(s.nextAt) + s.everyDays * DAY).toISOString();
  save();
  return r.error ? { ...r, job: j.id } : J.view(J.job(j.id));
}
export async function runNow(id, personId) {
  const s = schedule(id);
  if (!s || s.customer !== personId) return err("not_found", "No such schedule.");
  if (s.status !== "active") return err("state", `The schedule is ${s.status}.`);
  return visit(s);
}
export async function tick() {
  const out = [];
  for (const s of all()) if (s.status === "active" && Date.parse(s.nextAt) <= now()) { const r = await visit(s); out.push({ schedule: s.id, job: r.id || r.job, error: r.error || null }); }
  return out;
}
export function view(s) {
  return { id: s.id, status: s.status, from: s.from, pro: s.pro, proName: s.proName, price: J.money(s.price), everyDays: s.everyDays, visits: s.visits, done: s.made.length, nextAt: s.status === "active" ? s.nextAt : null,
    title: s.template.scope.title, checks: s.template.scope.checks,
    jobs: s.made.map((id) => { const j = J.job(id); return j && { id, number: j.number, status: j.status, due: J.money(J.due(j)), paidAt: j.paidAt || null }; }).filter(Boolean),
    history: s.history, created: s.created, rule: "Each visit is held on your saved payment method and paid only when that visit's checks pass." };
}
