// The live demo: simulated people keep using VeriPay on the demo server, and a public feed shows what they do.
// Every DONE_SIM_MS (default 75 s) one of the seeded customers posts a real request through the normal path (createJob,
// then offers); from there everything that happens is the product itself: the demo pros' agents offer, the seeded
// customers' agent hires, PayPal (the stand-in on the demo server) holds, the pros work, the checker checks and code
// pays. Only on a demo server with the PayPal stand-in, never against a real PayPal sandbox, and never more than
// DONE_SIM_OPEN jobs of its own open at once.
import * as J from "./jobs.js";
import * as people from "./people.js";
import { pro as getPro, allPros, readiness } from "./pros.js";
import { activityStore } from "./activity.js";

const ASKS = [
  ["My kitchen faucet keeps dripping. Fix it this week, under $200.", "78704"],
  ["The bathroom sink drains slowly. Clear it by Friday, budget $150.", "78745"],
  ["Toilet keeps running after every flush. Fix it this week, $180 max.", "78751"],
  ["Garbage disposal hums but won't spin. Replace it this week, under $350.", "78703"],
  ["Mount a 55-inch TV on drywall in the living room this weekend, $200.", "78704"],
  ["Patch a fist-sized hole in the hallway drywall and paint it, $250.", "78745"],
  ["Deep clean my 2-bedroom apartment before move-out this weekend, $300.", "78751"],
  ["Shower head leaks at the arm. Fix it tomorrow, under $150.", "78703"],
  ["Kitchen sink is clogged with standing water. Fix today, budget $200.", "78704"],
  ["Replace a worn cartridge in the bathroom faucet this week, $180.", "78745"],
];
const OPEN = ["scoped", "offered", "agreed", "held", "working", "submitted", "review", "needs_fix"];
let timer = null, n = 0;
const simJobs = () => J.allJobs().filter((j) => j.sim);

export const enabled = () => process.env.DONE_SIM !== "0" && (process.env.PAYPAL_MODE || "mock") === "mock" && process.env.DONE_STATE_DIR !== "memory";

// the customer's agent hires: on a job of its own that has had offers for 90 s, the cheapest offer from a hireable pro
// (accepting holds the money, as accept_offer does for any agent)
export async function hireOne() {
  const j = simJobs().find((x) => x.status === "offered" && Date.now() - Date.parse(x.offersOpenedAt || x.updated) > 90e3 && x.offers.some((o) => o.status === "open"));
  if (!j) return null;
  const o = j.offers.filter((x) => x.status === "open" && readiness(getPro(x.pro) || {}).hireable !== false).sort((a, b) => a.amount - b.amount)[0];
  if (!o) return null;
  const r = await J.acceptOffer(j.id, o.id, { actor: { kind: "agent", person: j.customer, client: "Customer's agent" } });
  return r?.error ? null : j.id;
}

export async function postOne() {
  // a job nobody has touched for 10 minutes doesn't hold up the next one (it stays on the demo as it is)
  if (simJobs().filter((j) => OPEN.includes(j.status) && Date.now() - Date.parse(j.updated) < 10 * 60e3).length >= +(process.env.DONE_SIM_OPEN || 4)) return null;
  const seeded = people.allPeople().filter((p) => p.role === "customer" && p.via === "seed");
  if (!seeded.length) return null;
  const p = seeded[n % seeded.length], [text, zip] = ASKS[n % ASKS.length];
  n++;
  const actor = { kind: "agent", person: p.id, client: "Customer's agent" };
  const j = await J.createJob(p.id, { text, zip: p.zip || zip, actor });
  if (j?.error) return null;
  J.job(j.id).sim = true;
  await J.requestOffers(j.id, actor);
  return j.id;
}

export function start() {
  if (timer || !enabled()) return;
  const every = +(process.env.DONE_SIM_MS || 75e3);
  const go = () => hireOne().then(postOne).catch((e) => console.error("sim", e.message));
  setTimeout(go, 8e3).unref();
  timer = setInterval(go, every);
  timer.unref();
}

// ---- the public live feed --------------------------------------------------------------------------------------------
// Code-made facts only (the activity log's own sentences), about the demo's fictional people and pros: no PINs, tokens,
// emails or PayPal ids. Each event names who did it and what, for the live page.
const KIND = {
  job_scoped: "post", offers_requested: "post", offer_received: "offer", counter_accept: "deal", counter_counter: "deal", job_agreed: "deal",
  slot_booked: "deal", money_held: "hold", money_reheld: "hold", money_reauthorized: "hold", work_started: "work", evidence_submitted: "work",
  checked: "check", confirmed: "check", money_released: "paid", tip_paid: "paid", change_requested: "change", change_approved: "change",
  dispute_opened: "dispute", dispute_resolved: "dispute", negotiation_move: "deal", negotiation_agreed: "deal", negotiation_stuck: "deal", pro_asked: "post", fix_requested: "check", report_ready: "doc", group_joined: "group",
  landlord_decided: "deal", tenant_note: "post", tenant_pick: "deal", rescheduled: "deal", reschedule_proposed: "deal",
};
const initials = (s) => String(s || "?").split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join("");
const clean = (s) => String(s || "")
  .replace(/\s*PayPal (Payouts )?batch \S+/g, "").replace(/\b(PAYOUT|CAP|AUTH|ORDER|MOCK|SIM)[-_][A-Z0-9-]+/gi, "")
  .replace(/\s*\((demo|simulated|stand-in)[^)]*\)/gi, "").replace(/\s*\((authorization|capture|order)?\s*\)/gi, "").replace(/\s{2,}/g, " ").replace(/\s+([.,:;])/g, "$1").trim();
function who(e) {
  const j = e.ref ? J.job(e.ref) : null, pro = e.data?.pro ? getPro(e.data.pro) : null;
  const k = e.actor?.kind;
  if ((k === "pro" || k === "pro_agent") && (pro || j?.agreed)) { const p = pro || getPro(j.agreed.pro); return { role: "pro", name: p?.name || "A pro", id: p?.id }; }
  if (k === "paypal") return { role: "paypal", name: "PayPal" };
  if (k === "model") return { role: "ai", name: "VeriPay AI" };
  if (k === "platform" && /checked|released|report/.test(e.action)) return { role: "ai", name: "VeriPay" };
  const c = j ? people.person(j.customer) : people.person(e.who?.[0]);
  return { role: k === "agent" ? "agent" : "customer", name: c?.name || "A customer", id: c?.id, agent: k === "agent" };
}
const visible = (e) => { const j = e.ref ? J.job(e.ref) : null; const c = j ? people.person(j.customer) : people.person(e.who?.[0]); return !!c && (c.demo || ["seed", "demo_landlord"].includes(c.via)) && !j?.tour && KIND[e.action]; };

export function live({ after = 0, limit = 60 } = {}) {
  const all = activityStore.data.entries.filter((e) => e.id > after && visible(e)).slice(-limit);
  const events = all.map((e) => {
    const w = who(e), j = e.ref ? J.job(e.ref) : null;
    return { id: e.id, at: e.at, kind: KIND[e.action], action: e.action, who: { ...w, initials: initials(w.name) }, job: j ? { number: j.number, title: j.scope?.title, zip: j.scope?.zip || j.zip || people.person(j.customer)?.zip, customer: j.customer } : null, text: clean(e.summary).replace(/^DP-\d+:\s*/, "").replace(/^the job:\s*/i, "").replace(/^./, (c) => c.toUpperCase()) };
  });
  const jobs = J.allJobs();
  const pros = allPros().filter((p) => p.demo).map((p) => { const mine = jobs.filter((j) => j.agreed?.pro === p.id); const now = mine.find((j) => ["held", "working", "submitted", "review", "needs_fix"].includes(j.status)); return { id: p.id, name: p.name, initials: initials(p.name), trade: p.trade, rating: p.rating, zip: p.zip, busy: now ? { number: now.number, title: now.scope?.title, status: now.status } : null, paid: mine.filter((j) => ["released", "resolved"].includes(j.status)).length }; });
  const customers = people.allPeople().filter((p) => p.role === "customer" && p.via === "seed").map((p) => { const mine = J.jobsOf(p.id); const open = mine.find((j) => OPEN.includes(j.status)); return { id: p.id, name: p.name, initials: initials(p.name), zip: p.zip, jobs: mine.length, open: open ? { number: open.number, title: open.scope?.title, status: open.status } : null }; });
  const paid = jobs.filter((j) => ["released", "resolved"].includes(j.status) && j.money?.split?.release > 0);
  return { events, pros, customers, stats: { jobs: jobs.length, paid: paid.length, open: jobs.filter((j) => OPEN.includes(j.status)).length, paidToPros: paid.reduce((t, j) => t + (j.money.split.pro || 0) + (j.money.split.helper || 0), 0) }, sim: enabled() };
}
