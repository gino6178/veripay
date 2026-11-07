// Neighborhood group jobs (PLAN §16 item 3). Households in one ZIP with the same kind of job (a job type from the scope
// writer's templates: drain, water heater flush, cleaning...) join one group; a pro quotes a group price, a share off
// each household's own price, and does them in one trip. Every household's job stays its own: its own offer at the
// group price, its own PayPal hold, its own checks, its own payment. Agents may join for their person within the
// person's limits (the job's budget is checked like any post_job). Code sets the discount (no model).
//   discount: 10% with 2 households, 15% with 3, 20% with 4 or more (the demo pros' rule; a real pro's agent names its own)
import crypto from "node:crypto";
import { store, stateFile } from "./store.js";
import * as J from "./jobs.js";
import { person, limitsOf } from "./people.js";
import { pro as getPro, prosFor, quoteFor, payee } from "./pros.js";
import { pickTemplate } from "./scope.js";
import { nowIso, now, DAY } from "./clock.js";
import { usd } from "./pay/index.js";
import { record } from "./activity.js";

const db = store(stateFile("groups"), { groups: {} });
export const groupsStore = db;
const save = () => db.save();
const r5 = (c) => Math.round(c / 500) * 500;
export const discountFor = (n) => (n >= 4 ? 20 : n >= 3 ? 15 : n >= 2 ? 10 : 0);
export const MAX_HOUSEHOLDS = 8, OPEN_DAYS = 7;
export const group = (id) => db.data.groups[id] || null;
export const allGroups = () => Object.values(db.data.groups);
const typeOf = (j) => j.scope?.template || pickTemplate(`${j.scope?.title || ""} ${j.text}`).id;
const live = (g) => g.status === "open" && Date.parse(g.closes) > now();

// open a group from one of the person's own jobs (scoped or offered, before anyone is hired)
export function openGroup(jobId, actor, { title = null } = {}) {
  const j = J.job(jobId);
  if (!j || j.customer !== actor?.person) return { error: "not_found", message: "No such job of yours." };
  if (!["scoped", "offered"].includes(j.status)) return { error: "state", message: "A group starts from a job before anyone is hired." };
  if (j.group) return { error: "state", message: `This job is already in group ${j.group}.` };
  const id = `grp_${crypto.randomBytes(4).toString("hex")}`, g = { id, zip: j.address.zip, type: typeOf(j), trade: j.scope.trade, title: String(title || j.scope.title).slice(0, 80), status: "open", created: nowIso(), closes: new Date(now() + OPEN_DAYS * DAY).toISOString(), members: [], pro: null, quotes: [], by: actor.kind };
  db.data.groups[id] = g;
  const r = addMember(g, j, actor);
  if (r?.error) { delete db.data.groups[id]; return r; }
  save();
  return { group: g };
}
function addMember(g, j, actor) {
  if (typeOf(j) !== g.type || j.address.zip !== g.zip) return { error: "group", message: `This group is for ${g.type.replace(/_/g, " ")} jobs in ${g.zip}.` };
  if (g.members.some((m) => m.person === j.customer)) return { error: "group", message: "Your household is already in this group." };
  if (g.members.length >= MAX_HOUSEHOLDS) return { error: "group", message: `A group has at most ${MAX_HOUSEHOLDS} households.` };
  g.members.push({ job: j.id, person: j.customer, joinedAt: nowIso(), by: actor.kind === "agent" ? "agent" : "person" });
  j.group = g.id; J.jobsStore.save();
  return null;
}
// join with a job the person already posted, or with text (a new job is posted for them, in the group's ZIP)
export async function joinGroup(groupId, actor, { job: jobId = null, text = null, budget = null } = {}) {
  const g = group(groupId);
  if (!g) return { error: "not_found", message: "No such group." };
  if (!live(g)) return { error: "state", message: "This group is closed." };
  const p = person(actor.person);
  let j = jobId ? J.job(jobId) : null;
  if (jobId && (!j || j.customer !== actor.person)) return { error: "not_found", message: "No such job of yours." };
  if (!j) {
    if (String(text || "").trim().length < 6) return { error: "text", message: "Describe your household's job (text), or pass job." };
    if (actor.kind === "agent" && budget != null && budget > limitsOf(p).perJobMax) return { error: "limit", limit: "perJobMax", message: `A ${usd(budget)} budget is over your person's per-job limit of ${usd(limitsOf(p).perJobMax)}.`, limitUsd: usd(limitsOf(p).perJobMax), wouldBe: usd(budget) };
    j = await J.createJob(actor.person, { text, zip: g.zip, budget, actor });
    if (j.error) return j;
  }
  if (!["scoped", "offered"].includes(j.status)) return { error: "state", message: "Only a job before anyone is hired can join a group." };
  const e = addMember(g, j, actor);
  if (e) return e;
  save();
  record({ actor: { kind: actor.kind, person: actor.person, client: actor.client }, who: g.members.map((m) => m.person).filter((x) => x !== actor.person), action: "group_joined", summary: `Another household joined the ${g.title} group in ${g.zip} (${g.members.length} now): the group discount is ${discountFor(g.members.length)}%.`, ref: g.id });
  await priceGroup(g.id);
  return { group: group(g.id), job: J.job(j.id) };
}
// the demo pros' agents quote the group: each household's own quote less the group discount; the best pro (lowest
// total) is the group's. A household's job gets an offer at its group price, tagged with the group.
export async function priceGroup(groupId) {
  const g = group(groupId);
  if (!g || g.members.length < 2) return g;
  const d = discountFor(g.members.length), jobs = g.members.map((m) => J.job(m.job)).filter((j) => j && ["scoped", "offered"].includes(j.status));
  const cands = prosFor(g.trade).filter((p) => p.agent === "demo" && payee(p)).map((p) => { const qs = jobs.map((j) => ({ j, q: quoteFor(p, j) })); return qs.some((x) => x.q.decline) ? null : { p, qs, total: qs.reduce((t, x) => t + x.q.ask, 0) }; }).filter(Boolean).sort((a, b) => a.total - b.total);
  const best = cands[0];
  if (!best) return g;
  g.pro = best.p.id; g.discountPct = d;
  for (const { j, q } of best.qs) {
    const price = r5(Math.round(q.ask * (1 - d / 100)));
    const prev = j.offers.find((o) => o.pro === best.p.id && o.group === g.id && ["open", "countered"].includes(o.status));
    if (prev && prev.amount === price) continue;
    const r = J.groupOffer(j.id, best.p.id, { amount: price, ask: q.ask, group: g.id, discountPct: d, arrival: q.arrival, breakdown: q.breakdown, parts: q.parts, households: g.members.length });
    if (!r.error) g.quotes.push({ job: j.id, pro: best.p.id, solo: q.ask, group: price, discountPct: d, at: nowIso() });
  }
  g.status = "open"; g.priced = nowIso(); save();
  return g;
}
export function viewGroup(g, viewer = null) {
  if (!g) return null;
  const mine = g.members.find((m) => m.person === viewer);
  return { id: g.id, zip: g.zip, type: g.type, trade: g.trade, title: g.title, status: live(g) ? "open" : g.status === "open" ? "closed" : g.status, created: g.created, closes: g.closes, households: g.members.length, discountPct: discountFor(g.members.length), nextDiscountPct: discountFor(g.members.length + 1),
    pro: g.pro ? { id: g.pro, name: getPro(g.pro)?.name } : null,
    members: g.members.map((m) => ({ you: m.person === viewer, job: m.person === viewer ? m.job : null, status: J.job(m.job)?.status || null, joinedAt: m.joinedAt, by: m.by })),
    ...(mine ? { yourJob: mine.job, yourOffer: (() => { const o = J.job(mine.job)?.offers.find((x) => x.group === g.id && ["open", "countered"].includes(x.status)); return o ? { id: o.id, amount: J.money(o.amount), solo: J.money(o.ask0 || o.ask), says: o.groupSays } : null; })() } : {}),
    rule: "Each household's job stays its own: its own offer at the group price, its own PayPal hold, its own checks and payment. Discount: 10% with 2 households, 15% with 3, 20% with 4 or more (the demo pros' rule).", source: "rules" };
}
export const openGroupsNear = (zip, type = null) => allGroups().filter((g) => live(g) && (!zip || g.zip === zip) && (!type || g.type === type));
