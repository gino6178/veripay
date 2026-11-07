// The demo pros at work. When a visitor hires a demo pro, the pro's agent does the job the way a pro would: after a
// realistic while it starts (with before photos), then sends fresh synthetic after photos with correct EXIF, the
// receipt and any documents, and submits each milestone in turn, so the visitor's own job reaches its checks and its
// payout. DEMO_PRO_WORK_MS (default 90 s real) between steps; "Have the demo pro finish now" runs what's left at once.
// Everything it sends is labelled synthetic; it never answers for a real (external) pro.
import { onActivity } from "./activity.js";
import * as J from "./jobs.js";
import { pro as getPro } from "./pros.js";
import { evidenceFor, beforeFor, planVisit, MATERIALS, materialsEvidence, jobType } from "./demoassets.js";
import { advanceMs } from "./clock.js";
import { aiStatus } from "./ai.js";
import * as people from "./people.js";
import { nowIso } from "./clock.js";
import { humanize } from "./human.js";

export const workDelay = () => (process.env.DONE_DEMO_PRO_WORK_MS != null ? +process.env.DONE_DEMO_PRO_WORK_MS : process.env.DEMO_PRO_WORK_MS != null ? +process.env.DEMO_PRO_WORK_MS : 90e3);
const busy = new Set(), timers = new Map();
// (a judges-tour job is driven by the tour itself, step by step)
const isDemoPro = (j) => !!j?.agreed && getPro(j.agreed.pro)?.agent === "demo" && !j.tour;
const actor = (j) => ({ kind: "pro_agent", pro: j.agreed.pro, client: `${j.agreed.proName}'s agent` });

// one step: start, or deliver the current milestone; returns what it did
export async function step(id, { advance = false, tour = false } = {}) {
  if (busy.has(id)) return { busy: true };
  busy.add(id);
  try {
    const j = J.job(id);
    if (!isDemoPro(j) && !(tour && j?.tour && getPro(j.agreed?.pro)?.agent === "demo")) return { skipped: "not a demo pro's job" };
    const pid = j.agreed.pro, a = actor(j);
    const from = Date.parse(j.scope?.window?.from || ""), early = Number.isFinite(from) && Date.parse(nowIso()) < from - 30 * 60e3;
    // "finish now" and the tour don't wait for the window (e.g. it's night in Austin and the window opens at 7 am): they
    // move the shared demo clock to the window's start, logged, like the demo panel does
    if (early && advance && ["held", "working"].includes(j.status)) advanceMs(from - Date.parse(nowIso()) + 5 * 60e3, `${advance}: to the job's window (it opens ${new Date(from).toISOString()})`);
    else if (early && ["held", "working"].includes(j.status)) return { waiting: humanize(`the job's window starts ${new Date(from).toISOString()}: the demo pro comes then`), windowFrom: new Date(from).toISOString() };
    const arrive = Date.parse(j.agreed?.arrival || "");
    if (!advance && j.status === "held" && Number.isFinite(arrive) && Date.parse(nowIso()) < arrive - 2 * 60e3) return { waiting: humanize(`the demo pro said they'd arrive ${new Date(arrive).toISOString()}: the before photos are taken then`), windowFrom: new Date(arrive).toISOString() };
    if (j.status === "held") {
      const r = J.startWork(pid, id, a, { before: await beforeFor(j, j.scope.checks) });
      return { did: "started", error: r.error || null };
    }
    if (["working", "needs_fix"].includes(j.status)) {
      if (j.changeOrders.some((c) => c.status === "pending")) return { waiting: "a change order the customer hasn't answered" };
      // a water heater: the extra materials (once), then the materials advance with the supplier's invoice and a photo
      if (jobType(j) === "water_heater" && ["open", "working"].includes(j.milestones[0]?.status) && !j.changeOrders.some((c) => c.kind === "materials")) {
        const r = await J.requestChange(pid, id, { amount: MATERIALS.amount, reason: MATERIALS.reason, kind: "materials" }, a);
        return { did: "materials change order", error: r.error ? r.message : null };
      }
      const mco = j.changeOrders.find((c) => c.kind === "materials" && c.status === "approved" && !c.advance);
      if (mco) {
        const r = await J.requestMaterialsAdvance(pid, id, { change: mco.id, items: await materialsEvidence(j, { typed: (await aiStatus()).mode === "rules" }) }, a);
        return { did: `materials advance: ${r.change?.advance?.status || r.error}`, error: r.error ? r.message : null };
      }
      if (j.changeOrders.some((c) => c.advance?.status === "awaiting_customer")) return { waiting: "the customer hasn't answered the materials advance" };
      const m = j.milestones.find((x) => x.status === "needs_fix") || J.currentMs(j);
      if (!m) return { skipped: "nothing open" };
      const checks = j.scope.checks.filter((c) => m.checkIds.includes(c.id));
      // the visit takes time: every after photo is taken after work started, timed gaps for real. Not long enough yet:
      // wait (or, for "finish now" and the tour, move the demo clock by those minutes, logged as such)
      const { span } = planVisit(j, checks), started = Date.parse(j.startedAt || j.agreed.at), elapsed = (Date.parse(nowIso()) - started) / 60e3;
      if (elapsed < span) {
        const need = Math.ceil(span - elapsed);
        if (!advance) return { waiting: humanize(`the visit takes ${span} minutes (timed photos): the demo pro sends the evidence ${new Date(started + span * 60e3).toISOString()}`), windowFrom: new Date(started + span * 60e3).toISOString() };
        // only an explicit "finish now" gets here (scheduled steps never move the clock), logged with who asked
        advanceMs(need * 60e3, `finish now (${typeof advance === "string" ? advance : "asked on the job"}): ${j.agreedProName || j.agreed.proName}'s visit on ${j.number} takes ${need} more minutes (timed photos)`);
      }
      const typed = (await aiStatus()).mode === "rules";
      // a fix: what didn’t pass, plus every timed condition that depends on a photo being retaken (retaken after it, in order)
      const failedIds = new Set((j.checks.filter((r) => r.milestone === m.id).at(-1)?.checks || []).filter((x) => x.verdict !== "pass").map((x) => x.id));
      for (let k = 0; k < 3; k++) for (const c of checks) { const g = J.timeGap(c, j.scope.checks); if (g && failedIds.has(g.after)) failedIds.add(c.id); }
      const items = await evidenceFor(j, m.status === "needs_fix" ? checks.filter((c) => failedIds.has(c.id)) : checks, { typed, partsCents: J.msDue(j, m) - m.amount + (j.agreed.parts || 0) || null });
      const add = J.addEvidence(pid, id, items.length ? items : await evidenceFor(j, checks, { typed }), a);
      if (add.error === "unchanged") return { did: "evidence", error: add.message, needs: add.reason };
      if (add.error) return { did: "evidence", error: add.message };
      const r = await J.submit(pid, id, a, { milestone: m.id });
      return { did: `submitted ${m.title}`, status: r.status, error: r.error ? r.message : null };
    }
    return { skipped: `the job is ${j.status}` };
  } finally { busy.delete(id); }
}
// the next step after the delay, while there's one to do
export function schedule(id, ms = workDelay()) {
  clearTimeout(timers.get(id));
  const t = setTimeout(async () => { timers.delete(id); const r = await step(id).catch((e) => ({ error: e.message })); const j = J.job(id); if (!r.skipped && !r.busy && j && ["held", "working", "needs_fix"].includes(j.status)) schedule(id, r.windowFrom ? Math.max(workDelay(), Math.min(6 * 3600e3, Date.parse(r.windowFrom) - Date.parse(nowIso()))) : workDelay()); }, Math.max(0, ms));
  t.unref?.();
  timers.set(id, t);
}
// "Have the demo pro finish now": every step left, at once (bounded)
export async function finishNow(id, by = "asked on the job", { tour = false } = {}) {
  clearTimeout(timers.get(id)); timers.delete(id);
  const done = [];
  for (let i = 0; i < 12; i++) {
    const j = J.job(id);
    if (!j || !["held", "working", "needs_fix"].includes(j.status)) break;
    const r = await step(id, { advance: String(by), tour });
    done.push(r);
    if (r.error || r.skipped || r.waiting || r.busy) break;
  }
  return done;
}
// hired a demo pro and the money is held -> start in a while; a fix asked for -> back to it in a while
export function watch() {
  return onActivity((e) => {
    if (!e.ref?.startsWith?.("job_")) return;
    const j = J.job(e.ref);
    if (seeded(j) && e.action === "offer_received" && j.status === "offered") scheduleCustomer(j.id, landlordJob(j) ? landlordDelay() : customerDelay());
    // a seeded customer answers every change order (whoever the pro is: a demo pro or a real one) within ~90 s, and looks
    // at a milestone left in review (every check passed or needs a person) and confirms it within a couple of minutes
    if (seeded(j) && e.action === "change_requested") laterCustomer(j.id, "change", customerChangeDelay(), customerAnswersChange);
    // the demo expert reviewer (automated stand-in) answers the expert queue within ~2 minutes
    if (["checked", "review_asked"].includes(e.action) && (j.queue || []).some((q) => q.status === "open")) for (const q of j.queue.filter((x) => x.status === "open")) laterCustomer(`${j.id}:${q.id}`, "expert", expertDelay(), () => J.demoExpert(j.id, q.id));
    if (seeded(j) && e.action === "materials_advance_requested") laterCustomer(j.id, "advance", customerChangeDelay(), customerAnswersAdvance);
    if (isDemoPro(j) && ["materials_advance_paid", "materials_advance_declined", "materials_advance_refused"].includes(e.action)) schedule(j.id);
    if (seeded(j) && e.action === "checked") laterCustomer(j.id, "confirm", customerConfirmDelay(), customerConfirms);
    if (!isDemoPro(j)) return;
    // the pro starts when they said they'd arrive (or the job's window opens), not before
    if (e.action === "money_held") { const at = Math.max(...[j.agreed?.arrival, j.scope?.window?.from].filter(Boolean).map((x) => Date.parse(x) - Date.parse(nowIso())), workDelay()); schedule(j.id, Math.min(at, 6 * 3600e3)); }
    else if (["fix_requested", "change_approved", "change_declined", "change_withdrawn"].includes(e.action) || (e.action === "checked" && e.data?.decision === "needs_fix") || (e.action === "money_released" && j.status === "working")) schedule(j.id);
  });
}
// ---- seeded customers' demo agent ----------------------------------------------------------------------------------
// The seeded demo customers (via "seed") never answer by themselves, so a demo customer agent acts for them: a few
// minutes after the first offer (DEMO_CUSTOMER_DELAY_MS, default 3 min real), it accepts the best offer from a pro who
// can be hired, within the ceiling (lowest price, then rating), whoever made it, a real pro's agent included. Labelled
// "Demo customer agent (seeded customer)". Visitors' own jobs are never touched.
export const customerDelay = () => (process.env.DEMO_CUSTOMER_DELAY_MS != null ? +process.env.DEMO_CUSTOMER_DELAY_MS : 180e3);
// the demo landlord (people.ensureDemoLandlord, fictional) is answered the same way, within minutes, labelled as the
// demo landlord's agent; it takes the tenant's suggested offer when that one is acceptable
const seeded = (j) => !!j && ["seed", "demo_landlord"].includes(people.person(j.customer)?.via);
const landlordJob = (j) => people.person(j?.customer)?.via === "demo_landlord";
const agentLabel = (j) => (landlordJob(j) ? "Riverside Property Management's agent" : "Customer's agent");
const whoSays = (j) => (landlordJob(j) ? "The landlord" : "The customer");
export const landlordDelay = () => (process.env.DEMO_LANDLORD_DELAY_MS != null ? +process.env.DEMO_LANDLORD_DELAY_MS : 120e3);
const ctimers = new Map();
export async function customerDecides(id) {
  const j = J.job(id);
  if (!seeded(j) || j.status !== "offered") return null;
  const a = { kind: "agent", person: j.customer, client: agentLabel(j) };
  const ceiling = j.scope.priceCeiling || Infinity;
  const pick = j.tenantPick && j.offers.find((o) => o.id === j.tenantPick.offer && o.status === "open" && o.amount <= ceiling && !!getPro(o.pro)?.paypal?.verified);
  const best = pick || j.offers.filter((o) => o.status === "open" && o.amount <= ceiling && !!getPro(o.pro)?.paypal?.verified).sort((x, y) => x.amount - y.amount || (getPro(y.pro).rating || 0) - (getPro(x.pro).rating || 0))[0];
  if (!best) return null;
  return J.acceptOffer(j.id, best.id, { actor: a, payWith: people.person(j.customer).vault ? "saved" : "card" });
}
export const customerChangeDelay = () => (process.env.DEMO_CUSTOMER_CHANGE_MS != null ? +process.env.DEMO_CUSTOMER_CHANGE_MS : 90e3);
// approve a pending change order within the person's limits (change-order limit, per-job limit), else decline with why
export async function customerAnswersChange(id) {
  const j = J.job(id), co = j?.changeOrders.find((c) => c.status === "pending");
  if (!seeded(j) || !co) return null;
  const a = { kind: "agent", person: j.customer, client: agentLabel(j) };
  const r = await J.approveChange(j.id, co.id, a);
  if (!r.error) return r;
  return J.declineChange(j.id, co.id, a, `Declined by the customer's agent: ${r.message}`);
}
export const expertDelay = () => (process.env.DEMO_EXPERT_MS != null ? +process.env.DEMO_EXPERT_MS : 120e3);
export const customerConfirmDelay = () => (process.env.DEMO_CUSTOMER_CONFIRM_MS != null ? +process.env.DEMO_CUSTOMER_CONFIRM_MS : 120e3);
// a milestone in review on a seeded job: the demo customer looks and confirms when nothing failed (only checks left to a
// person); a failed check gets a fix asked for, with the checker's reason. Labelled as the demo customer.
export async function customerConfirms(id) {
  const j = J.job(id);
  if (!seeded(j) || j.status !== "review") return null;
  const m = j.milestones.find((x) => x.status === "review");
  if (!m) return null;
  const bad = J.notPassed(j, m), a = { kind: "person", person: j.customer, client: `${whoSays(j)}: looked at the photos` };
  const r = bad.length ? J.requestFix(j.id, `Demo customer (seeded): please fix ${bad.map((c) => `${c.id}: ${c.reason || c.verdict}`).join("; ")}`.slice(0, 300), a, { milestone: m.id })
    : await J.confirm(j.id, a, { milestone: m.id });
  if (!r?.error) J.note(j.id, bad.length ? `${whoSays(j)} asked for a fix: ${bad.map((c) => c.id).join(", ")} didn't pass.` : `${whoSays(j)} looked at the photos and confirmed the checks left to a person.`);
  return r;
}
const later = new Map();
function laterCustomer(id, what, ms, fn) {
  const k = `${id}:${what}`;
  if (later.has(k) || ms < 0) return;
  const t = setTimeout(async () => { later.delete(k); await fn(id).catch(() => {}); const j = J.job(id); if (what === "change" && j?.changeOrders.some((c) => c.status === "pending")) laterCustomer(id, what, ms, fn); }, Math.max(0, ms));
  t.unref?.(); later.set(k, t);
}
// a seeded customer approves a materials advance (labelled: the demo customer, a seeded demo account)
export async function customerAnswersAdvance(id) {
  const j = J.job(id), co = j?.changeOrders.find((c) => c.advance?.status === "awaiting_customer");
  if (!seeded(j) || !co) return null;
  const r = await J.approveMaterialsAdvance(j.id, co.id, { kind: "person", person: j.customer });
  if (!r?.error) J.note(j.id, `${whoSays(j)} looked at the supplier's invoice and the photo and approved the materials advance.`);
  return r;
}
export function scheduleCustomer(id, ms = customerDelay()) {
  if (ctimers.has(id) || ms < 0) return;
  const t = setTimeout(() => { ctimers.delete(id); customerDecides(id).catch(() => {}); }, Math.max(0, ms));
  t.unref?.(); ctimers.set(id, t);
}
// after a restart: pick up demo pros' jobs that were waiting on them
export function resume() {
  for (const j of J.allJobs()) {
    if (isDemoPro(j) && ["held", "working", "needs_fix"].includes(j.status)) schedule(j.id);
    if (seeded(j) && j.status === "offered" && j.offers.some((o) => o.status === "open")) scheduleCustomer(j.id);
    if (seeded(j) && j.changeOrders.some((c) => c.status === "pending")) laterCustomer(j.id, "change", customerChangeDelay(), customerAnswersChange);
    if (seeded(j) && j.status === "review") laterCustomer(j.id, "confirm", customerConfirmDelay(), customerConfirms);
    for (const q of (j.queue || []).filter((x) => x.status === "open")) laterCustomer(`${j.id}:${q.id}`, "expert", expertDelay(), () => J.demoExpert(j.id, q.id));
  }
}
