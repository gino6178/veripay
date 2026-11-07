// "Your agent": one conversation per person (PLAN §17). The person types plain sentences or taps a button; everything
// else arrives in the thread on its own: the job's events (offers in, hold placed, the pro arriving, a change order,
// checks done, paid...) become short agent messages, each with a card (the view-model a graphic draws) and at most three
// actions. Messages are written by code templates from the job's real state, two short sentences at most; no model
// writes them. A model (done-chat) only reads the INTENT of what the person types (JSON, a short timeout, rules when it's
// slow or off). The built-in agent acts within the person's limits (counter once, hire within the ceiling, ask for a
// fix) and says what it did; anything only the person may do (approve a change order, confirm, release over failures,
// dispute, tip, raise the ceiling) is an action with needsPin: the server refuses it without the person's PIN step-up.
// One hook on the activity log makes the proactive messages, idempotent per event (keys survive a restart), plus timed
// follow-ups on the demo clock (a reminder once when the person hasn't answered, a hold about to expire, maintenance due).
import crypto from "node:crypto";
import { store, stateFile } from "./store.js";
import { onActivity, activityStore } from "./activity.js";
import * as J from "./jobs.js";
import { person, limitsOf } from "./people.js";
import { pro as getPro, allPros } from "./pros.js";
import { now, nowIso } from "./clock.js";
import { usd } from "./pay/index.js";
import { when } from "./human.js";
import { chat } from "./ai.js";

// managed: the jobs the built-in agent posted from the chat (it negotiates those itself; jobs posted another way, by the
// website or the person's own agent, are left to whoever posted them)
const db = store(stateFile("assistant"), { threads: {}, actions: {}, lastEvent: 0, managed: {} });
export const assistantStore = db;
const save = () => db.save();
const rid = (p) => `${p}_${crypto.randomBytes(5).toString("hex")}`;
export const AGENT = (personId) => ({ kind: "agent", person: personId, client: "Your agent (built-in)", scopes: ["read", "hire", "pay"] });
const ME = (personId) => ({ kind: "person", person: personId });
export const REMIND_MIN = () => +(process.env.DONE_ASSISTANT_REMIND_MIN || 30);
export const CARD_KINDS = ["work_order", "offers", "hold", "change_order", "visit", "evidence", "checks", "paid", "refund", "fix", "dispute", "reschedule", "maintenance", "group", "landlord", "receipt", "mandate", "job_summary", "hello"];

// ---- the thread ----------------------------------------------------------------------------------------------------
const threadOf = (pid) => (db.data.threads[pid] ||= { seq: 0, messages: [], keys: {}, reminded: {} });
const jobRef = (j) => (j ? { id: j.id, number: j.number, title: j.scope?.title || null } : null);
// one message: text (two short sentences at most), a card, up to three actions; key makes it idempotent
export function post(pid, { from = "agent", text, job = null, card = null, actions = [], key = null, replyTo = null, photos = null }) {
  const t = threadOf(pid);
  if (key && t.keys[key]) return null;
  const id = rid("am"), acts = actions.filter(Boolean).slice(0, 3).map((a) => { const aid = rid("act"); db.data.actions[aid] = { person: pid, msg: id, kind: a.kind, args: a.args || {}, job: job?.id || a.job || null, needsPin: !!a.needsPin, label: a.label, at: nowIso(), ...(a.pro ? { pro: a.pro } : {}) }; return { id: aid, label: String(a.label).slice(0, 24), style: a.style || "secondary", needsPin: !!a.needsPin, ...(a.href ? { href: a.href } : {}), done: false }; });
  const m = { id, seq: ++t.seq, at: nowIso(), from, text: String(text || "").slice(0, 240), textSource: from === "agent" ? "template" : from === "you" ? "you" : "system", ...(job ? { job: jobRef(job) } : {}), ...(card ? { card } : {}), ...(acts.length ? { actions: acts } : {}), ...(replyTo ? { replyTo } : {}), ...(key ? { key } : {}), ...(photos?.length ? { photos } : {}) };
  t.messages.push(m);
  if (key) t.keys[key] = m.id;
  if (t.messages.length > 2000) t.messages.splice(0, t.messages.length - 2000);
  save();
  return m;
}
// a live message: one per key, updated in place (new text, card and buttons; the old buttons close; its seq is bumped so
// a client polling ?after= gets it again and redraws it)
export function upsert(pid, live, msg) {
  const t = threadOf(pid), id0 = t.keys[`live:${live}`], m0 = id0 && t.messages.find((x) => x.id === id0);
  if (!m0) { const m = post(pid, msg); if (m) { m.live = live; t.keys[`live:${live}`] = m.id; save(); } return m; }
  const same = m0.text === msg.text && JSON.stringify(m0.card) === JSON.stringify(msg.card);
  if (same) return null;
  for (const a of m0.actions || []) if (!a.done) markDone(a.id, "updated");
  const fresh = post(pid, { ...msg, key: null });
  t.messages.splice(t.messages.indexOf(fresh), 1);
  Object.assign(m0, { text: fresh.text, card: fresh.card, actions: fresh.actions, seq: fresh.seq, updated: fresh.at, updates: (m0.updates || 0) + 1 });
  for (const a of fresh.actions || []) db.data.actions[a.id].msg = m0.id;
  t.messages.splice(t.messages.indexOf(m0), 1); t.messages.push(m0);
  save();
  return m0;
}
const markDone = (aid, outcome = null) => { const a = db.data.actions[aid]; if (!a) return; a.done = nowIso(); const t = threadOf(a.person), m = t.messages.find((x) => x.id === a.msg); const x = m?.actions?.find((y) => y.id === aid); if (x) { x.done = true; if (outcome) x.outcome = outcome; } save(); };
// close every open action on a job's earlier messages of a kind (an answered question isn't asked again)
const closeKind = (pid, jobId, kinds) => { for (const [aid, a] of Object.entries(db.data.actions)) if (a.person === pid && a.job === jobId && kinds.includes(a.kind) && !a.done) markDone(aid, "superseded"); };

// ---- what the cards draw (amounts in cents) ----------------------------------------------------------------------
const STAGES = ["posted", "offers", "hired", "held", "working", "checking", "paid"];
export function railOf(j) {
  const s = j.status, at = { draft: 0, scoped: 0, offered: 1, agreed: 2, held: 3, working: 4, submitted: 5, checking: 5, needs_fix: 4, review: 5, passed: 5, disputed: 5, released: 6, resolved: 6, cancelled: -1, expired: -1 }[s] ?? 0;
  return { stages: STAGES, current: at < 0 ? null : STAGES[at], index: at, status: s, ended: ["cancelled", "expired"].includes(s) ? s : null };
}
export function moneyBar(j) {
  // held = what the authorization still holds (nothing once the final capture released the rest); releasedBuffer = what
  // was held and never captured. Each cent is in one segment only.
  const b = J.balance(j), h = j.hold, captured = b.captured || 0, live = h?.status === "held" && h.mode !== "capture", closed = h && !live && h.status !== "pending_approval";
  const held = live ? Math.max(0, h.amount - (h.capturedOnThis || 0)) : 0;
  return { currency: "USD", price: j.agreed?.price ?? null, due: J.due(j), held, captured, paidToPro: b.pro + b.helper, fee: b.fee, refunded: b.refunded, releasedBuffer: closed && captured ? Math.max(0, h.amount - captured) : 0, holdStatus: h?.status || null,
    segments: [{ kind: "held", amount: held }, { kind: "captured", amount: Math.max(0, captured - (b.pro + b.helper) - b.fee - b.refunded) }, { kind: "paid", amount: b.pro + b.helper }, { kind: "fee", amount: b.fee }, { kind: "refunded", amount: b.refunded }].filter((x) => x.amount > 0),
    ids: { order: h?.order || null, authorization: h?.authorization || null, captures: (j.money?.captures || []).map((c) => c.id), payout: j.money?.payout?.batchId || null } };
}
// a pro's short name for a button: the first word of the business name ("Eastside Pipe & Drain" -> "Eastside")
export const shortName = (s) => (String(s || "").replace(/\s*\(demo\)/i, "").trim().split(/\s+/)[0] || "them").replace(/[^\w'&-]/g, "");
const initials = (s) => String(s || "").replace(/\(demo\)/i, "").split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join("");
const proChip = (pid) => { const p = getPro(pid); if (!p) return null; const v = p.verification || {}; return { id: p.id, name: p.name, initials: initials(p.name), rating: p.rating ?? null, jobs: p.jobs ?? null, licensed: !!v.license?.valid, insured: !!v.insurance?.valid, demo: !!p.demo }; };
const ICON = { photo: "camera", receipt: "receipt", note: "note" };
const judgeOf = (c) => (c.needsPerson || (c.signals || []).some((s) => /^needs_person|customer_confirmed/.test(String(s))) || c.by === "person" ? "person" : c.by && !/^(rules|given text|none|code|typed|rules \(documents\))$/.test(String(c.by)) ? "model" : "code");
const workOrderCard = (j) => ({ kind: "work_order", data: { job: j.id, title: j.scope.title, trade: j.scope.trade, source: j.scope.source, conditions: j.scope.checks.map((c) => ({ id: c.id, what: c.what, evidence: c.evidence, icon: c.doc ? "doc" : /measure|inch|feet|level/i.test(c.what) ? "ruler" : ICON[c.evidence] || "note" })), ceiling: j.scope.priceCeiling, window: j.scope.window, estimate: j.estimate ? { low: j.estimate.low, high: j.estimate.high, typical: j.estimate.typical, label: j.estimate.label } : null, rail: railOf(j) } });
function offersCard(j) {
  const open = j.offers.filter((o) => ["open", "countered", "accepted"].includes(o.status)), best = bestOffer(j);
  return { kind: "offers", data: { job: j.id, ceiling: j.scope.priceCeiling, range: j.estimate ? { low: j.estimate.low, high: j.estimate.high, typical: j.estimate.typical } : null, bestId: best?.id || null,
    offers: open.map((o) => ({ id: o.id, pro: proChip(o.pro), amount: o.amount, ask: o.ask, status: o.status, eta: o.arrival || null, slot: o.slot || null, best: o.id === best?.id, overCeiling: !!(j.scope.priceCeiling && o.amount > j.scope.priceCeiling), group: o.group || null, counter: o.counter?.amount ?? null })), rail: railOf(j) } };
}
// why the best offer is the one to take, in six words at most
function whyBest(j, best, open) {
  const rating = (o) => getPro(o.pro)?.rating || 0, top = Math.max(...open.map(rating)), low = Math.min(...open.map((o) => o.amount));
  const under = j.scope.priceCeiling ? "under your max" : null, inRange = j.estimate && best.amount <= j.estimate.typical ? "a typical price" : null;
  const first = open.length > 1 && rating(best) >= top ? "best rated" : open.length > 1 && best.amount === low ? "lowest price" : inRange;
  return [first, under].filter(Boolean).join(", ") || "within your limits";
}
const bestOffer = (j) => j.offers.filter((o) => o.status === "open" && getPro(o.pro)?.paypal?.verified).sort((a, b) => (a.amount <= (j.scope.priceCeiling || Infinity) ? 0 : 1) - (b.amount <= (j.scope.priceCeiling || Infinity) ? 0 : 1) || a.amount - b.amount || (getPro(b.pro)?.rating || 0) - (getPro(a.pro)?.rating || 0))[0] || null;
const holdCard = (j) => ({ kind: "hold", data: { job: j.id, pro: proChip(j.agreed?.pro), money: moneyBar(j), buffer: j.hold?.buffer ?? null, honorUntil: j.hold?.honorUntil || null, expiresAt: j.hold?.expiresAt || null, approveUrl: j.hold?.approveUrl || null, paidWith: j.hold?.payWith || null, rail: railOf(j) } });
const visitCard = (j, state) => ({ kind: "visit", data: { job: j.id, pro: proChip(j.agreed?.pro), slot: j.visit?.slot || j.agreed?.slot || null, arrival: j.agreed?.arrival || null, state, proposal: j.visit?.proposal || null, rail: railOf(j) } });
const photoOf = (j, e) => ({ id: e.id, url: `/api/jobs/${j.id}/evidence/${e.id}`, phase: e.phase || "after", taken: e.exif?.taken || null, label: e.label || null });
function checksCard(j) {
  const r = j.checks.at(-1);
  if (!r) return null;
  const conds = r.checks.map((c) => ({ id: c.id, what: c.what || j.scope.checks.find((x) => x.id === c.id)?.what, evidence: j.scope.checks.find((x) => x.id === c.id)?.evidence || null, verdict: c.verdict, label: c.label || null, judge: judgeOf(c), confidence: c.confidence ?? null, reason: c.reason,
    photos: j.evidence.filter((e) => e.kind === "photo" && (e.phase || "after") === "after" && (e.checkId === c.id || (e.checkIds || []).includes(c.id))).slice(-4).map((e) => ({ ...photoOf(j, e), judge: judgeOf(c), verdict: c.verdict })) }));
  return { kind: "checks", data: { job: j.id, round: r.round, milestone: r.milestone || null, decision: r.decision, checker: r.checker, counts: { total: conds.length, passed: conds.filter((c) => c.verdict === "pass" && c.judge !== "person").length, person: conds.filter((c) => c.judge === "person" && c.verdict === "pass").length, notPassed: conds.filter((c) => c.verdict !== "pass").length }, conditions: conds, rail: railOf(j) } };
}
const paidCard = (j) => ({ kind: "paid", data: { job: j.id, stamp: "PAID", pro: proChip(j.agreed?.pro), money: moneyBar(j), payout: j.money?.payout ? { batchId: j.money.payout.batchId || null, status: j.money.payout.status, via: j.money.payout.via || "paypal" } : null, paidAt: j.paidAt || null, rail: railOf(j) } });
// a materials invoice the pro scanned, as the code read it: store, lines, total, what it matched, the photo of it
const itemLine = (x) => (typeof x === "string" ? x : [x?.name || x?.description || x?.desc || "item", x?.amount != null ? usd(x.amount) : x?.price != null ? usd(x.price) : ""].filter(Boolean).join(" ")).slice(0, 80);
const invoiceOf = (j, co) => { const a = co.advance, inv = a?.check?.invoice; if (!a) return null;
  return { status: a.status, amount: a.amount || 0, store: inv?.store || null, total: inv?.total ?? null, date: inv?.date || null, readBy: inv?.readBy || null, items: (inv?.items || []).slice(0, 6).map(itemLine),
    verdict: a.check?.verdict || null, reasons: (a.check?.reasons || []).slice(0, 3), photos: j.evidence.filter((e) => (a.evidence || []).includes(e.id)).map((e) => photoOf(j, e)) }; };
const changeCard = (j, co) => ({ kind: "change_order", data: { job: j.id, id: co.id, amount: co.amount, ask: co.ask ?? null, reason: co.reason, kind: co.kind || "parts", status: co.status, agentMayApprove: !!co.agentMayApprove, photos: j.evidence.filter((e) => (co.evidence || []).includes(e.id)).map((e) => photoOf(j, e)), dueAfter: J.due(j) + (co.status === "pending" ? co.amount : 0), money: moneyBar(j), invoice: invoiceOf(j, co) } });
export const jobSummaryCard = (j) => ({ kind: "job_summary", data: { job: j.id, number: j.number, title: j.scope?.title, status: j.status, pro: j.agreed ? proChip(j.agreed.pro) : null, money: j.agreed ? moneyBar(j) : null, waitingOn: J.waitingOn(j), rail: railOf(j) } });

// ---- the job's process, node by node (the "flow" card) ----------------------------------------------------------------
// One card per job, kept up to date in place (it stays where it was posted; its seq is bumped so the page redraws it):
// the request, sending it to pros, the negotiation your agent runs with their agents (A2A), your confirmation and the
// PayPal hold, the repair, extra costs and a materials invoice when there are any, the checks, and the payment. Each
// node says who did what; the only steps that wait on the person are marked "you".
const FLOW_AT = { draft: 0, scoped: 1, offered: 2, agreed: 3, held: 4, working: 4, needs_fix: 4, submitted: 6, checking: 6, review: 6, passed: 6, disputed: 6, released: 7, resolved: 7 };
export function flowNodes(j) {
  const s = j.status, at = FLOW_AT[s] ?? 0, ended = ["cancelled", "expired"].includes(s) ? s : null;
  const st = (i) => (ended ? (i < at ? "done" : "skip") : i < at ? "done" : i === at ? "now" : "next");
  const ref = j.evidence.filter((e) => e.phase === "reference").length, offers = j.offers || [];
  const pro = firstName(j.agreed?.proName);
  const negs = offers.filter((o) => o.counter).map((o) => `${firstName(o.proName)}: ${usd(o.ask ?? o.amount)} asked, your agent offered ${usd(o.counter.amount)}${o.answer ? ` → ${o.answer.kind === "accept" ? `agreed ${usd(o.amount)}` : o.answer.kind === "counter" ? `they came back at ${usd(o.amount)}` : `they kept ${usd(o.amount)}`}` : ", waiting"}`);
  const best = s === "offered" ? bestOffer(j) : null, last = j.checks?.at(-1), cnt = last ? { pass: last.checks.filter((c) => c.verdict === "pass").length, n: last.checks.length } : null;
  const b = J.balance(j);
  const nodes = [
    { key: "request", label: "Request", state: "done", by: "you + agent", detail: `${j.scope?.title || "The job"}${ref ? ` · ${ref} photo${ref === 1 ? "" : "s"}` : ""}${j.scope?.priceCeiling ? ` · up to ${usd(j.scope.priceCeiling)}` : ""}` },
    { key: "dispatch", label: "Sent to pros", state: st(1), by: "agent", detail: offers.length ? `${offers.length} offer${offers.length === 1 ? "" : "s"} from pros nearby` : at >= 1 ? "Asking pros nearby" : "" },
    { key: "negotiate", label: "Negotiation (A2A)", state: st(2), by: "agent ↔ pros' agents", detail: at > 2 && j.agreed ? `${pro} at ${usd(j.agreed.price)}${negs.length ? ` (${negs[0]})` : ""}` : negs.length ? negs.slice(0, 2).join("; ") : best ? `Best so far: ${firstName(best.proName)} at ${usd(best.amount)}` : "" },
    { key: "confirm", label: "You confirm · PayPal holds", state: st(3), by: "you", detail: j.hold?.status === "held" ? `${usd(j.hold.amount)} held with PayPal, not charged` : j.hold?.status === "pending_approval" ? "Approve the hold in PayPal" : best ? `Confirm ${firstName(best.proName)} at ${usd(best.amount)}` : "" },
    { key: "repair", label: "Repair", state: st(4), by: "pro", detail: s === "working" ? `${pro} is working` : s === "needs_fix" ? `${pro} is fixing what didn't pass` : j.agreed?.arrival && at <= 4 ? `${pro} comes ${when(j.agreed.arrival)}` : at > 4 ? "Done; proof sent" : "" },
  ];
  for (const co of j.changeOrders || []) nodes.push({ key: `change:${co.id}`, label: co.kind === "materials" ? "Extra: materials" : "Extra cost", state: co.status === "pending" ? (ended ? "skip" : "now") : "done", by: co.status === "pending" ? (co.counter?.waiting ? "agent ↔ pro's agent" : "you") : "agent + you",
    detail: `+${usd(co.amount)} ${String(co.reason || "").split(/[;(]/)[0].trim()}${co.ask && co.ask !== co.amount ? ` (asked +${usd(co.ask)}, negotiated)` : ""} · ${co.status === "pending" ? (co.counter?.waiting ? "negotiating" : "waiting for you") : co.status}` });
  for (const co of (j.changeOrders || []).filter((c) => c.advance)) { const a = co.advance; nodes.push({ key: `invoice:${co.id}`, label: "Materials invoice", state: ["paid"].includes(a.status) ? "done" : ["rejected", "declined", "failed"].includes(a.status) ? "skip" : "now", by: "pro scans · code reads · you", detail: `${usd(a.amount || 0)} · invoice ${a.check?.verdict === "pass" ? "matches" : a.check?.verdict ? a.check.verdict.replace("_", " ") : "read"} · ${a.status.replace(/_/g, " ")}` }); }
  nodes.push({ key: "checks", label: "Checks", state: ended ? (at > 6 ? "done" : "skip") : at > 6 ? "done" : at === 6 ? "now" : "next", by: "code (+ you if unsure)", detail: cnt ? `${cnt.pass} of ${cnt.n} passed` : `${j.scope?.checks?.length || 0} things to prove` });
  nodes.push({ key: "paid", label: "PayPal pays the pro", state: at >= 7 ? "done" : ended ? "skip" : "next", by: "code", detail: at >= 7 ? `${usd(b.pro + b.helper)} to ${pro}${j.hold?.amount && j.money?.captured ? `; ${usd(Math.max(0, j.hold.amount - j.money.captured))} never charged` : ""}` : "When every check passes" });
  if (ended) nodes.push({ key: "ended", label: ended === "cancelled" ? "Cancelled" : "Expired", state: "done", by: "", detail: "" });
  return nodes;
}
const flowCard = (j) => ({ kind: "flow", data: { job: j.id, number: j.number, title: j.scope?.title, nodes: flowNodes(j) } });
const flowText = (j) => { const n = flowNodes(j), now = n.find((x) => x.state === "now"); return `${j.number}: ${now ? `${now.label.replace(/ \(A2A\)/, "")} — ${now.by === "you" ? "waiting for you" : `${now.by} on it`}` : n.at(-1).state === "done" ? "done" : "on its way"}.`; };
// posted once per job, then updated where it is
function flowPut(pid, j) {
  const t = threadOf(pid), key = `flow:${j.id}`, id0 = t.keys[key], m0 = id0 && t.messages.find((x) => x.id === id0);
  const card = flowCard(j), text = flowText(j);
  if (!m0) { const m = post(pid, { text, job: j, card }); if (m) { t.keys[key] = m.id; save(); } return m; }
  if (m0.text === text && JSON.stringify(m0.card) === JSON.stringify(card)) return null;
  Object.assign(m0, { text, card, seq: ++t.seq, updated: nowIso() });
  save();
  return m0;
}
export const flowOf = (j) => flowCard(j).data; // the job page draws the same nodes

// ---- the agent negotiates for the person (A2A) ------------------------------------------------------------------------
// When offers come in, the person's agent counters the best one once, toward the typical price (never under 85% of the
// ask, never over the ceiling), with the pro's agent; the person then only confirms the result. Extra costs the same way:
// the agent offers ~85%, the pro's agent answers, and the agent approves it itself when it's within the person's limit
// (else it asks them to confirm).
const busyNeg = new Set();
const round5 = (c) => Math.round(c / 500) * 500;
function targetFor(j, o) {
  const ceiling = j.scope?.priceCeiling || Infinity, typical = j.estimate?.typical ?? j.estimate?.low ?? null;
  // toward the typical price, not under 85% of the ask; never over the ceiling (over it, the counter is the ceiling)
  const t = Math.min(ceiling, round5(Math.max(o.amount * 0.85, Math.min(typical ?? o.amount * 0.9, o.amount * 0.95))));
  return t < o.amount ? t : null;
}
async function negotiateOffers(pid, jobId) {
  const j = J.job(jobId);
  if (!j || j.status !== "offered" || busyNeg.has(jobId)) return;
  const best = bestOffer(j);
  if (!best || best.status !== "open" || best.counter || best.counterUsed || j.offers.some((x) => x.pro === best.pro && x.counter)) return;
  const target = targetFor(j, best);
  if (!target) return;
  busyNeg.add(jobId);
  try { await J.counterOffer(j.id, best.id, target, AGENT(pid)); } catch {} finally { busyNeg.delete(jobId); }
}
async function negotiateChange(pid, jobId, changeId) {
  const j = J.job(jobId), co = j?.changeOrders.find((c) => c.id === changeId);
  if (!co || co.status !== "pending" || co.counter || busyNeg.has(changeId)) return;
  busyNeg.add(changeId);
  try {
    const r = await J.counterChange(j.id, co.id, Math.min(co.amount - 100, Math.ceil((co.amount * 0.85) / 100) * 100), AGENT(pid)); // ~85%, to the dollar
    if (r?.error || r?.waiting) return;
    // within the person's limit the agent approves it itself; else the person confirms (the change card asks)
    const L = limitsOf(person(pid));
    if (co.agentMayApprove !== false && co.amount <= L.changeMax) await J.approveChange(j.id, co.id, AGENT(pid));
  } catch {} finally { busyNeg.delete(changeId); }
}

// ---- proactive: one hook on the activity log ---------------------------------------------------------------------
// which people's threads hear about a job event: the payer (customer or landlord) and the tenant who posted it
const audience = (j) => [j.customer, ...(j.tenant ? [j.tenant] : [])].filter((pid) => ["customer", "landlord"].includes(person(pid)?.role));
const firstName = (s) => String(s || "the pro").replace(/\s*\(demo\)/i, "");
function onEvent(e) {
  if (!e?.ref?.startsWith?.("job_")) return 0;
  const j = J.job(e.ref);
  if (!j) return 0;
  let n = 0;
  for (const pid of audience(j)) {
    const msgs = messagesFor(pid, j, e); for (const m of msgs) if (m.live ? upsert(pid, m.live, { ...m, job: j }) : post(pid, { ...m, job: j, key: `ev:${e.id}:${m.k || 0}` })) n++;
    if (flowPut(pid, j)) n++;
    // the agent's own moves run after this event is recorded (they make events of their own)
    if (pid === j.customer && manages(j)) {
      if (["offers_requested", "offer_received"].includes(e.action)) setTimeout(() => negotiateOffers(pid, j.id), 0);
      if (e.action === "change_requested" && e.data?.change) setTimeout(() => negotiateChange(pid, j.id, e.data.change), 0);
    }
  }
  // the pros' short threads (proAgent.js): the hired pro, the pro an offer event is about, and pros whose feed shows a
  // job that just asked for offers
  for (const { pid, proId } of proAudience(j, e)) { const msgs = proHook ? proHook(pid, proId, j, e) : []; for (const m of msgs) if (post(pid, { ...m, job: j, key: `ev:${e.id}:p${m.k || 0}` })) n++; }
  return n;
}
// DONE_AGENT_NEGOTIATES=0 turns the agent's own counters off (the person counters with buttons, as before)
const NO_AUTO_NEG = () => process.env.DONE_AGENT_NEGOTIATES === "0";
const manages = (j) => !NO_AUTO_NEG() && !!db.data.managed?.[j.id];
let proHook = null;
export const setProHook = (fn) => { proHook = fn; };
function proAudience(j, e) {
  const out = new Map(), add = (proId) => { const p = getPro(proId); if (p?.person && person(p.person)?.role === "pro") out.set(p.person, proId); };
  if (j.agreed?.pro) add(j.agreed.pro);
  if (e.data?.pro) add(e.data.pro);
  if (e.action === "offers_requested") for (const p of allPros().filter((x) => x.person && x.trade === j.scope?.trade)) { if (J.openFor(p).some((f) => f.id === j.id) || j.offers.some((o) => o.pro === p.id)) add(p.id); }
  return [...out].map(([pid, proId]) => ({ pid, proId }));
}
function messagesFor(pid, j, e) {
  const tenant = j.tenant === pid && j.customer !== pid, pro = firstName(j.agreed?.proName), out = [];
  const say = (text, card, actions = [], k = 0, live = null) => out.push({ text, card, actions: tenant ? [] : actions, k, ...(live ? { live } : {}) });
  switch (e.action) {
    case "job_scoped": say(`I wrote the work order: ${j.scope.checks.length} things to prove it's done${j.scope.priceCeiling ? `, up to ${usd(j.scope.priceCeiling)}` : ""}. I'm asking pros nearby now.`, workOrderCard(j)); break;
    case "offers_requested": // (offers that came at once arrive with this event)
    case "counter_accept": case "counter_counter": case "counter_decline": // the pro's agent answered the agent's counter
    case "offer_received": {
      // one live offers message per job, updated as offers come in
      const open = j.offers.filter((o) => o.status === "open"), best = bestOffer(j);
      if (j.status !== "offered" || !best) break;
      const ceiling = j.scope.priceCeiling, over = ceiling && best.amount > ceiling, canCounter = !best.counter && !best.counterUsed;
      const lead = `${open.length} offer${open.length > 1 ? "s" : ""} in; the best is ${firstName(best.proName)} at ${usd(best.amount)}.`;
      // the agent negotiated (or is): its result, and one button for the person
      if (manages(j) && (best.counter || targetFor(j, best))) {
        if (best.status === "countered" || (!best.counter && targetFor(j, best))) { say(`${lead.replace(/\.$/, "")}. I'm negotiating with ${firstName(best.proName)}'s agent now.`, offersCard(j), [], 0, `offers:${j.id}`); break; }
        const got = best.answer?.kind === "accept" ? `${firstName(best.proName)}'s agent agreed to ${usd(best.amount)} (asked ${usd(best.ask)}).` : best.answer?.kind === "counter" ? `${firstName(best.proName)}'s agent came down to ${usd(best.amount)} (asked ${usd(best.ask)}).` : `${firstName(best.proName)}'s agent kept ${usd(best.amount)}.`;
        if (over) say(`I negotiated: ${got} That's still over your ${usd(ceiling)}: confirm with your PIN?`, offersCard(j), [{ kind: "hire_pin", label: `Confirm ${usd(best.amount).replace(".00", "")}`, style: "primary", needsPin: true, args: { offer: best.id } }, { kind: "wait", label: "Not yet" }], 0, `offers:${j.id}`);
        else say(`I negotiated: ${got} Confirm to hire; PayPal holds the money until the work passes.`, offersCard(j), [{ kind: "hire", label: `Confirm ${usd(best.amount).replace(".00", "")}`, style: "primary", args: { offer: best.id } }, { kind: "wait", label: "Not yet" }], 0, `offers:${j.id}`);
        break;
      }
      // every offer over the ceiling: the agent's own move leads (counter at the ceiling, within its limits)
      if (over && canCounter) say(`${lead} All are over your ${usd(ceiling)}; I can counter at ${usd(ceiling)}.`, offersCard(j), [{ kind: "counter", label: `Counter ${usd(ceiling).replace(".00", "")}`, style: "primary", args: { offer: best.id, amount: ceiling } }, { kind: "hire_pin", label: "Hire (PIN)", needsPin: true, args: { offer: best.id } }, { kind: "wait", label: "Wait" }], 0, `offers:${j.id}`);
      else say(`${over ? lead : `${lead.replace(/\.$/, "")}, ${whyBest(j, best, open)}.`} ${over ? "It's over your ceiling." : "Hire them?"}`, offersCard(j), [{ kind: over ? "hire_pin" : "hire", label: over ? "Hire (PIN)" : `Hire ${shortName(best.proName)}`, style: "primary", needsPin: !!over, args: { offer: best.id } }, canCounter ? { kind: "counter", label: "Counter", args: { offer: best.id } } : null, { kind: "wait", label: "Wait" }], 0, `offers:${j.id}`);
      break;
    }
    // (job_agreed comes just before the hold is placed: money_held or hold_pending says it)
    case "money_held": closeKind(pid, j.id, ["hire", "hire_pin", "counter", "wait"]); say(`${pro} is hired. ${usd(j.hold.amount)} is held with PayPal, not charged.`, holdCard(j)); break;
    case "hold_pending": say(`Approve the ${usd(j.hold?.amount || 0)} hold in PayPal to book ${pro}.`, holdCard(j), [{ kind: "link", label: "Open PayPal", style: "primary", href: j.hold?.approveUrl }]); break;
    case "hold_failed": say(`PayPal didn't hold the money. Try again?`, holdCard(j), [{ kind: "retry_hold", label: "Try again", style: "primary" }]); break;
    case "slot_booked": say(`${pro} comes ${when(j.agreed.arrival)}.`, visitCard(j, "booked")); break;
    case "work_started": say(`${pro} arrived and started.`, visitCard(j, "arrived")); break;
    case "reschedule_proposed": { const p = j.visit?.proposal; if (p && p.by === "pro") say(`${pro} asks to come ${when(p.from)} instead.`, { kind: "reschedule", data: { job: j.id, proposal: p, slot: j.visit.slot } }, [{ kind: "accept_reschedule", label: "Accept", style: "primary", args: { proposal: p.id } }, { kind: "decline_reschedule", label: "Decline", args: { proposal: p.id } }]); break; }
    case "rescheduled": say(`The visit is now ${when(j.agreed.arrival)}.`, visitCard(j, "booked")); break;
    case "change_requested": {
      const co = j.changeOrders.find((c) => c.id === e.data?.change) || j.changeOrders.filter((c) => c.status === "pending").at(-1);
      if (co?.status !== "pending") break;
      if (!manages(j)) say(`${pro} needs +${usd(co.amount)}: ${co.reason.split(/[;(]/)[0].trim()}.`, changeCard(j, co), [{ kind: "approve_change", label: "Approve", style: "primary", needsPin: true, args: { change: co.id } }, { kind: "decline_change", label: "Decline", style: "danger", args: { change: co.id } }]);
      else say(`${pro} asks +${usd(co.amount)}: ${co.reason.split(/[;(]/)[0].trim()}. I'm negotiating it with their agent.`, changeCard(j, co), [], 0, `change:${co.id}`);
      break;
    }
    case "change_countered": { const co = j.changeOrders.find((c) => c.id === e.data?.change); if (co) say(`I offered +${usd(co.counter.amount)} instead of +${usd(co.ask)}; waiting for ${pro}'s agent.`, changeCard(j, co), [], 0, `change:${co.id}`); break; }
    case "change_answered": {
      const co = j.changeOrders.find((c) => c.id === e.data?.change);
      if (!co || co.status !== "pending") break;
      const got = e.data?.kind === "accept" ? `${pro}'s agent agreed to +${usd(co.amount)} (asked +${usd(co.ask)})` : e.data?.kind === "counter" ? `${pro}'s agent came down to +${usd(co.amount)} (asked +${usd(co.ask)})` : `${pro}'s agent kept +${usd(co.amount)}`;
      const L = limitsOf(person(j.customer));
      // within the limit the agent approves it next (change_approved says so); over it, the person confirms
      if (co.agentMayApprove !== false && co.amount <= L.changeMax) say(`${got}. That's within your ${usd(L.changeMax)} limit, so I'm approving it.`, changeCard(j, co), [], 0, `change:${co.id}`);
      else say(`${got}. It's over your agent's ${usd(L.changeMax)} limit: confirm it?`, changeCard(j, co), [{ kind: "approve_change", label: `Confirm +${usd(co.amount).replace(".00", "")}`, style: "primary", needsPin: true, args: { change: co.id } }, { kind: "decline_change", label: "Decline", style: "danger", args: { change: co.id } }], 0, `change:${co.id}`);
      break;
    }
    case "change_approved": { const co = j.changeOrders.find((c) => c.id === e.data?.change) || j.changeOrders.filter((c) => c.status === "approved").at(-1); if (co) { closeKind(pid, j.id, ["approve_change", "decline_change"]); say(`+${usd(co.amount)} approved; the job is now ${usd(J.due(j))}.`, changeCard(j, co)); } break; }
    case "change_declined": closeKind(pid, j.id, ["approve_change", "decline_change"]); say(`The change order was declined.`, null); break;
    case "materials_advance_requested": { const co = j.changeOrders.find((c) => c.advance?.status === "awaiting_customer"); if (co) { const inv = co.advance.check?.invoice; say(`${pro} bought materials and scanned the invoice${inv?.store ? ` from ${inv.store}` : ""}${inv?.total != null ? ` (${usd(inv.total)})` : ""}; I checked it against the approved +${usd(co.amount)}. Confirm paying ${usd(co.advance.amount || co.amount)} now from the hold?`, changeCard(j, co), [{ kind: "approve_advance", label: `Confirm ${usd(co.advance.amount || co.amount).replace(".00", "")}`, style: "primary", needsPin: true, args: { change: co.id } }, { kind: "decline_advance", label: "Decline", style: "danger", args: { change: co.id } }]); } break; }
    case "checked": {
      const card = checksCard(j), r = j.checks.at(-1);
      if (!card) break;
      const c = card.data.counts;
      if (r.decision === "release") { if (!["released", "resolved"].includes(j.status)) say(`All ${c.total} checks passed.`, card); }
      else if (r.decision === "needs_fix") say(`${c.notPassed} of ${c.total} need${c.notPassed === 1 ? "s" : ""} a fix; I've sent ${pro} back.`, card);
      else { closeKind(pid, j.id, ["confirm", "request_fix", "dispute"]); say(c.notPassed ? `${c.notPassed} of ${c.total} didn't pass. Your call.` : `${c.person} of ${c.total} need your look.`, card, [c.notPassed ? null : { kind: "confirm", label: "Confirm", style: "primary", needsPin: true }, { kind: "request_fix", label: "Ask a fix" }, { kind: "dispute", label: "Dispute", style: "danger", needsPin: true }]); }
      break;
    }
    case "fix_requested": closeKind(pid, j.id, ["confirm", "request_fix", "dispute"]); say(`I asked ${pro} for a fix.`, { kind: "fix", data: { job: j.id, reason: e.summary.replace(/^DP-\d+:\s*/, "").slice(0, 140) } }); break;
    case "money_released": if (["released", "resolved"].includes(j.status)) { closeKind(pid, j.id, ["confirm", "request_fix", "dispute", "release"]); say(`Paid. ${pro} got ${usd(J.balance(j).pro + J.balance(j).helper)} through PayPal.`, paidCard(j), j.status === "released" && !j.tips?.length ? [{ kind: "tip", label: "Tip $10", needsPin: true, args: { amount: 1000 } }, { kind: "rate", label: "Rate 5★", args: { stars: 5 } }] : []); } else say(`A milestone was paid: ${usd(J.balance(j).captured)} captured so far.`, paidCard(j)); break;
    case "dispute_opened": say(`A dispute is open; the money stays held.`, { kind: "dispute", data: { job: j.id, dispute: j.dispute ? { id: j.dispute.id, by: j.dispute.by, suggestion: j.dispute.summary?.suggestion || null } : null, money: moneyBar(j) } }); break;
    case "dispute_resolved": say(`The dispute is settled.`, { kind: "refund", data: { job: j.id, money: moneyBar(j), resolution: j.dispute?.resolution || null } }); break;
    case "job_cancelled": say(`Cancelled; nothing was charged.`, jobSummaryCard(j)); break;
    case "tip_paid": say(`Your tip went to ${pro}, all of it.`, { kind: "receipt", data: { job: j.id, tip: (j.tips || []).at(-1) || null, money: moneyBar(j) } }); break;
    case "tenant_note": if (!tenant) say(`Your tenant added a note.`, { kind: "landlord", data: { job: j.id, notes: j.tenantNotes || [], pick: j.tenantPick || null } }); break;
    case "tenant_pick": if (!tenant) { const o = j.offers.find((x) => x.id === j.tenantPick?.offer); if (o) say(`Your tenant suggests ${firstName(o.proName)} at ${usd(o.amount)}.`, offersCard(j), [{ kind: o.amount > (j.scope.priceCeiling || Infinity) ? "hire_pin" : "hire", label: "Hire them", style: "primary", needsPin: o.amount > (j.scope.priceCeiling || Infinity), args: { offer: o.id } }]); } break;
    case "landlord_decided": if (tenant) say(`Your landlord hired ${pro}.`, holdCard(j)); break;
    default: break;
  }
  return out;
}
let off = null;
export function listen() { if (off) return off; off = onActivity((e) => { try { onEvent(e); db.data.lastEvent = Math.max(db.data.lastEvent || 0, e.id); save(); } catch (x) { console.error("assistant", x.message); } }); return off; }
listen();
// after a restart: the events recorded while nobody listened (the keys stop any message being made twice)
export function catchUp() { let n = 0; for (const e of activityStore.data.entries.filter((x) => x.id > (db.data.lastEvent || 0))) { n += onEvent(e); db.data.lastEvent = e.id; } save(); return n; }
// (tests) run an event through the hook again, as a restart would
export const replay = (e) => onEvent(e);

// ---- timed follow-ups on the demo clock ------------------------------------------------------------------------------
export async function tick() {
  let n = 0;
  for (const [pid, t] of Object.entries(db.data.threads)) {
    // an unanswered question: asked again once, shorter, after REMIND_MIN demo-minutes
    for (const m of t.messages.filter((x) => x.from === "agent" && x.actions?.some((a) => !a.done && a.style === "primary") && !t.reminded[x.id] && !x.reminder)) {
      if (now() - Date.parse(m.at) < REMIND_MIN() * 60e3) continue;
      const j = m.job ? J.job(m.job.id) : null;
      if (j && !["customer", "landlord"].includes(J.waitingOn(j)?.who)) { t.reminded[m.id] = "not waiting"; continue; }
      t.reminded[m.id] = nowIso();
      const open = m.actions.filter((a) => !a.done).map((a) => ({ ...db.data.actions[a.id], label: a.label, style: a.style, href: a.href }));
      for (const a of m.actions) if (!a.done) markDone(a.id, "asked again");
      const r = post(pid, { text: `Still waiting on you: ${m.text.split(/(?<=[.?!])\s/)[0]}`, job: j, card: m.card, actions: open, key: `remind:${m.id}`, replyTo: m.id });
      if (r) { r.reminder = true; n++; }
    }
    // a hold about to expire, a workmanship warranty ending: once each
    for (const j of J.jobsOf(pid)) {
      if (j.hold?.status === "held" && j.hold.expiresAt && Date.parse(j.hold.expiresAt) - now() < 3 * 864e5 && Date.parse(j.hold.expiresAt) > now()) { if (post(pid, { text: `The hold for ${j.number} ends ${when(j.hold.expiresAt)}; I'll renew it if the work isn't done.`, job: j, card: holdCard(j), key: `expiring:${j.id}:${j.hold.authorization}` })) n++; }
      if (j.warranty?.status === "open" && j.warranty.until && Date.parse(j.warranty.until) - now() < 7 * 864e5 && Date.parse(j.warranty.until) > now()) { if (post(pid, { text: `${j.number}'s warranty ends ${when(j.warranty.until, { date: true })}. Anything wrong?`, job: j, card: jobSummaryCard(j), actions: [{ kind: "say", label: "All good", args: { text: "All good" } }], key: `warranty:${j.id}` })) n++; }
    }
    // maintenance due (home.js rules)
    try { const H = await import("./home.js"); for (const s of H.suggestionsFor(pid).filter((x) => x.text).slice(0, 2)) if (post(pid, { text: `${s.title}? ${s.why.split(/(?<=\.)\s/)[0]}`, card: { kind: "maintenance", data: { suggestion: s.id, kind: s.kind, title: s.title, due: s.due, budget: s.budget.cents, appliance: s.appliance || null } }, actions: [{ kind: "accept_suggestion", label: "Book it", style: "primary", args: { suggestion: s.id } }, { kind: "dismiss_suggestion", label: "Not now", args: { suggestion: s.id } }], key: `maint:${s.id}` })) n++; } catch {}
  }
  return n;
}

// ---- the thread as the website reads it -------------------------------------------------------------------------------
export const SUGGESTIONS = ["My kitchen faucet drips, fix it this week under $200", "What's happening?", "Deep clean my 2-bedroom this weekend, $300"];
export function thread(pid, { after = 0 } = {}) {
  const t = threadOf(pid);
  if (!t.messages.length) post(pid, { text: "Hi, I'm your agent. Tell me what needs doing, by when, and your budget.", card: { kind: "hello", data: { limits: (() => { const L = limitsOf(person(pid)); return { perJobMax: L.perJobMax, monthlyMax: L.monthlyMax, changeMax: L.changeMax }; })(), suggestions: SUGGESTIONS } }, actions: SUGGESTIONS.slice(0, 2).map((s) => ({ kind: "say", label: s.split(/[,.]/)[0].split(" ").slice(0, 3).join(" "), args: { text: s } })), key: "hello" });
  const jobs = [...J.jobsOf(pid), ...J.jobsAsTenant(pid)].filter((j) => !["cancelled", "expired", "released", "resolved"].includes(j.status));
  return { messages: t.messages.filter((m) => m.seq > (+after || 0)), seq: t.seq, waitingOn: jobs.map((j) => ({ job: jobRef(j), w: J.waitingOn(j) })).filter((x) => ["customer", "landlord"].includes(x.w?.who)).map((x) => ({ job: x.job, ask: x.w.what })), suggestions: SUGGESTIONS };
}
const since = (pid, seq) => threadOf(pid).messages.filter((m) => m.seq > seq);

// ---- what the person types: the intent (the model's JSON, else rules), acted on as their built-in agent --------------
const money$ = (s) => { const m = String(s).match(/\$\s*(\d[\d,]*(?:\.\d+)?)|\b(?:under|below|max|budget(?: of)?|up to)\s*\$?\s*(\d[\d,]*)/i); return m ? Math.round(+String(m[1] || m[2]).replace(/,/g, "") * 100) : null; };
// What a sentence describes: work to do (a problem, a fixture, a chore), in English or Spanish. Word stems, so "drains",
// "leaking", "clogged", "replaced" all count.
const WORK = /\b(fix|repair|replac|install|mount|clean|clog|leak|drip|broke|busted|crack|running|assembl|unclog|patch|paint|heater|faucet|tap\b|toilet|drain|sink|shower|tub|bath|pipe|valve|tv\b|desk|shelf|shelves|door|window|light|outlet|switch|fan\b|garbage|disposal|dishwasher|gutter|fence|deck|move-?out|hang|caulk|tile|grout|smell|noise|not working|doesn'?t work|won'?t|stopped|slow|backed up|overflow|flood|wet|mold|kitchen|bathroom|apartment|house|room|floor|wall|ceiling|carpet|furniture|ikea|water|gotea|fuga|tapad|arregl|repar|limpi|lavabo|fregadero|grifo|llave|calentador|baño|cocina|inodoro|ducha|tuber|mueble|pared)/i;
const STATUS = /\bwhat'?s (happening|going on|up|new)\b|^\s*(status|any news|news|update|estado|qué pasa|que pasa)\b|\bwhere('?s| is) (the|my) (pro|plumber|cleaner|handyman|job)\b|\bhow'?s (it|my job) going\b/i;
const MOVE = /\b(reschedule|re-schedule|move (it|the visit|the appointment|my visit)|another (day|time)|different (day|time)|change (the )?(visit|time|appointment|date)|postpone|push (it )?back|cambiar la cita)\b/i;
export function rulesIntent(text) {
  const t = String(text || "").trim(), low = t.toLowerCase(), work = WORK.test(low), words = low.split(/\s+/).filter(Boolean).length;
  if (!t) return { intent: "unclear" };
  if (/^(hi|hello|hey|hola|help|ayuda|\?)[!.]*$/.test(low)) return { intent: "help" };
  if (STATUS.test(low) && !(work && words > 6)) return { intent: "status" };
  if (/^(yes|yeah|yep|ok|okay|sure|do it|go ahead|sounds good|hire( them| him| her| it)?|accept( it)?|sí|si)\b/.test(low) && !work) return { intent: "hire" };
  if (/\bcounter\b|\boffer (them|him|her)\b|\bwould (they|you) do\b/.test(low) && money$(t) != null) return { intent: "counter", amount: money$(t) };
  if (/^approve\b/.test(low) && !work) return { intent: "approve" };
  if (/^(decline|no|nope)\b/.test(low) && !work) return { intent: "decline" };
  if (/\bcancel\b/.test(low) && words <= 8) return { intent: "cancel" };
  // a move needs the words for it; a sentence about a problem is a new job, whatever day it names
  if (MOVE.test(low) && !(work && !/\b(visit|appointment|cita)\b/.test(low))) return { intent: "reschedule" };
  if (work && t.length >= 8) return { intent: "post_job", text: t, budget: money$(t) };
  if (words >= 4) return { intent: "maybe_post", text: t, budget: money$(t) };
  return { intent: "unclear" };
}
async function intentOf(text) {
  const r = rulesIntent(text);
  // the rules decide whenever they're sure (a described problem is always a new job); the model (JSON, short timeout)
  // is asked only when they aren't, and its answer counts only for intents that don't move anything by themselves or
  // that the person's words back up. It never writes the reply and never sets an amount.
  if (!["unclear", "maybe_post"].includes(r.intent)) return { ...r, source: "rules" };
  const m = await chat([{ role: "system", content: 'Classify the customer\'s message to their home-services agent. Answer JSON only: {"intent": "post_job"|"status"|"help"|"unclear"}. post_job = they describe work they want done or something broken.' }, { role: "user", content: String(text).slice(0, 500) }], { json: true, timeoutMs: +(process.env.DONE_INTENT_TIMEOUT_MS || 2500), purpose: "intent" }).catch(() => null);
  if (m?.source === "model" && ["post_job", "status", "help"].includes(m.json?.intent)) return { intent: m.json.intent, ...(m.json.intent === "post_job" ? { text: String(text).trim(), budget: money$(text) } : {}), source: "model", rules: r.intent };
  return { ...r, source: "rules" };
}
const latestJob = (pid, statuses = null) => [...J.jobsOf(pid)].filter((j) => !statuses || statuses.includes(j.status))[0] || null;
// ---- asking before posting (intake) ------------------------------------------------------------------------------------
// A described problem doesn't post at once: like a dispatcher, the agent first asks for a photo (and checks it), where it
// is, and what the pro should do, then shows the request and posts it on "Post it". Answers come as buttons or typed
// words; a step the first sentence already answered ("my kitchen faucet…, fix it") is skipped. The draft lives in memory
// for two hours. Photos sent in it go on the job as the customer's photos of the problem (reference photos), which the
// checker later compares the pro's AFTER photos with.
const drafts = new Map(); // person id -> { text, budget, thing, room, service, zip, photos: [{ dataUrl, msg, check }], noPhoto, step, at }
const MAX_PHOTOS = 6, DRAFT_TTL = 2 * 3600e3;
const draftOf = (pid) => { const d = drafts.get(pid); if (d && Date.now() - d.at > DRAFT_TTL) { drafts.delete(pid); return null; } return d || null; };
export const intakeDraft = (pid) => draftOf(pid); // tests
const ROOMS = [["kitchen", /\bkitchen\b/i], ["bathroom", /\b(bath(room)?|shower|toilet|tub)\b/i], ["laundry room", /\blaundry\b/i], ["bedroom", /\bbed ?room\b/i], ["living room", /\bliving ?room\b/i], ["garage", /\bgarage\b/i], ["outside", /\b(outside|yard|patio|deck|roof|gutters?|fence|driveway|porch)\b/i], ["basement", /\bbasement\b/i], ["attic", /\battic\b/i], ["hallway", /\bhall(way)?\b/i], ["whole home", /\b(whole (house|home|apartment)|\d[- ]?bed(room)?s?\b|apartment|condo)\b/i]];
const roomIn = (t) => ROOMS.find(([, re]) => re.test(t))?.[0] || null;
// what the pro should do: only when the person says it (a drip is a problem, not a request)
const SERVICES = [["Fix it", /\b(fix|repair|patch|unclog|unblock|seal)\b/i], ["Replace it", /\b(replace|swap|new one)\b/i], ["Install it", /\b(install|mount|put up|hang|assemble)\b/i], ["Clean it", /\b(clean|deep clean|wash)\b/i], ["Have a pro look first", /\b(inspect|diagnose|take a look|not sure)\b/i]];
const serviceIn = (t) => SERVICES.find(([, re]) => re.test(t))?.[0] || null;
const THINGS = ["garbage disposal", "water heater", "ceiling fan", "faucet", "toilet", "sink", "drain", "shower", "tub", "outlet", "light", "switch", "breaker", "dishwasher", "washer", "dryer", "fridge", "oven", "stove", "AC", "furnace", "thermostat", "door", "window", "lock", "drywall", "wall", "ceiling", "floor", "tile", "fence", "gutter", "roof", "TV", "shelf", "blinds", "pipe", "leak"];
const thingIn = (t) => THINGS.find((x) => new RegExp(`\\b${x}s?\\b`, "i").test(t)) || null;
const zipIn = (t) => String(t).match(/\b787\d\d\b/)?.[0] || null;

// the photo check, by code (and by the vision model when one is configured, labelled as the model's): readable, big
// enough, taken recently (the camera's time), not a photo already sent with another job
async function checkPhoto(dataUrl) {
  const { fromDataUrl, sniff, MAX_FILE } = await import("./evidence.js"), { dhashOf } = await import("./imagehash.js"), { exifOf } = await import("./exif.js");
  const { reuseOf } = await import("./fraud.js"), { photoRows } = await import("./check/history.js");
  const f = fromDataUrl(dataUrl), problems = [], notes = [];
  if (!f || !sniff(f.buf)) return { ok: false, problems: ["isn't a photo VeriPay can read"], notes, by: "code" };
  if (f.buf.length > MAX_FILE) problems.push("is over 8 MB");
  const h = dhashOf(f.buf), ex = exifOf(f.buf), sha = crypto.createHash("sha256").update(f.buf).digest("hex");
  if (h.w && h.h) { if (Math.min(h.w, h.h) < 320) problems.push(`is small (${h.w}×${h.h}): a closer, sharper photo helps the pro`); else notes.push(`${h.w}×${h.h}`); }
  if (ex.taken) { const days = (now() - Date.parse(ex.taken)) / 864e5; if (days > 30) problems.push(`was taken ${String(ex.taken).slice(0, 10)}, over a month ago: a photo from today shows it as it is now`); else notes.push(days < 1 ? "taken today" : `taken ${Math.round(days)} day${Math.round(days) === 1 ? "" : "s"} ago`); }
  else notes.push("no camera time in it");
  const hit = reuseOf({ id: "intake", jobId: "intake", sha, dhash: h.dhash || null }, photoRows())[0];
  if (hit) problems.push(`looks like a photo already sent with ${J.job(hit.jobId)?.number || "another job"}`); else notes.push("not seen on another job");
  let sees = null;
  try {
    const V = await import("./vlm.js");
    if (V.vlmAvailable()) {
      const os = await import("node:os"), fs = await import("node:fs"), path = await import("node:path");
      const tmp = path.join(os.tmpdir(), `veripay-intake-${sha.slice(0, 16)}.jpg`); fs.writeFileSync(tmp, f.buf);
      const r = await V.describePhoto(tmp, { timeoutMs: 20000 }); if (r.source === "model" && r.sees) sees = r.sees;
      try { fs.unlinkSync(tmp); } catch {}
    }
  } catch {}
  return { ok: !problems.length, problems, notes, sees, by: sees ? "code + model" : "code" };
}
const checkSays = (c, n) => c.ok ? `Photo${n > 1 ? ` ${n}` : ""} checked by code: ${c.notes.join(", ")}.${c.sees ? ` The model sees: ${c.sees}` : ""}`.slice(0, 238)
  : `This photo ${c.problems[0]}.${c.problems.length > 1 ? ` It also ${c.problems[1]}.` : ""}`.slice(0, 238);

// the next question the draft needs, or the request to post
function ask(pid, d, replyTo) {
  const reply = (txt, extra = {}) => post(pid, { text: txt, replyTo, ...extra });
  const it = d.thing ? `the ${d.thing}` : "it";
  d.at = Date.now();
  if (!d.text) { d.step = "what"; return reply("What's wrong in the photo? Say it in a sentence, and by when."); }
  if (!d.photos.length && !d.noPhoto) { d.step = "photo"; return reply(`Can you send a photo of ${it}? The pros see it before they quote, and at the end the pro's after photos are compared with it.`, { actions: [{ kind: "intake_photo", label: "Take a photo", style: "primary", href: "#photo" }, { kind: "intake_skip_photo", label: "No photo" }] }); }
  if (!d.room) {
    d.step = "where";
    const p = person(pid), at = p.address?.line1 ? `${p.address.line1}, ${p.zip}` : `ZIP ${p.zip}`;
    const opts = /toilet|shower|tub/i.test(d.thing || "") ? ["bathroom", "laundry room"] : ["kitchen", "bathroom"];
    return reply(`Where is ${it}? I have your home at ${at}: which room? (Type an address if it's somewhere else.)`, { actions: [...opts.map((r) => ({ kind: "intake_room", label: r[0].toUpperCase() + r.slice(1), args: { room: r } })), { kind: "intake_room_other", label: "Somewhere else" }] });
  }
  if (!d.service) { d.step = "service"; return reply(`What should the pro do with ${it}?`, { actions: ["Fix it", "Replace it", "Have a pro look first"].map((x, i) => ({ kind: "intake_service", label: x, style: i ? "secondary" : "primary", args: { service: x } })) }); }
  d.step = "confirm";
  const n = d.photos.length;
  return reply(`Ready to post: “${d.text.slice(0, 80)}${d.text.length > 80 ? "…" : ""}” · ${d.room}${d.zip ? ` (${d.zip})` : ""} · ${d.service.toLowerCase()} · ${n ? `${n} photo${n === 1 ? "" : "s"}` : "no photo"}${d.budget ? ` · up to ${usd(d.budget)}` : ""}. Post it?`,
    { actions: [{ kind: "intake_post", label: "Post it", style: "primary" }, { kind: "intake_cancel", label: "Cancel" }] });
}
function startIntake(pid, text, budget = null) {
  const t = String(text || "").trim();
  const d = { text: t, budget: budget ?? (t ? money$(t) : null), thing: thingIn(t), room: roomIn(t), service: serviceIn(t), zip: zipIn(t), photos: [], noPhoto: false, step: null, at: Date.now() };
  drafts.set(pid, d);
  return d;
}
// photos added to the draft, each checked; a doubtful one asks before going on
async function takePhotos(pid, d, pics, you, replyTo) {
  for (const x of pics) {
    if (d.photos.length >= MAX_PHOTOS) break;
    const c = await checkPhoto(x.dataUrl);
    d.photos.push({ dataUrl: x.dataUrl, msg: you?.id || null, check: c });
    post(pid, { text: checkSays(c, d.photos.length), replyTo, ...(c.ok ? {} : { actions: [{ kind: "intake_photo", label: "Send another", style: "primary", href: "#photo" }, { kind: "intake_keep_photo", label: "Use it anyway" }] }) });
    if (!c.ok) { d.step = "photo_check"; return false; }
  }
  return true;
}
// the request as the pros will read it: the person's words, plus the room and the service when the words don't say them
const draftText = (d) => [d.text.replace(/\s+$/, "").replace(/([^.!?])$/, "$1."), d.room && !roomIn(d.text) ? `It's in the ${d.room}.` : "", d.service && serviceIn(d.text) !== d.service ? `Wanted: ${d.service === "Have a pro look first" ? "a pro to look at it first and say what it needs" : d.service.toLowerCase().replace(/ it$/, "")}.` : ""].filter(Boolean).join(" ");
async function postDraft(pid, d, replyTo) {
  const p = person(pid), L = limitsOf(p), reply = (txt, extra = {}) => post(pid, { text: txt, replyTo, ...extra });
  const b = d.budget, text = draftText(d);
  if (b && b > L.perJobMax) reply(`That's over your agent's ${usd(L.perJobMax)} per-job limit, so I'll post it but you decide the hire.`);
  const j = await J.createJob(pid, { text, zip: d.zip || p.zip, budget: b, actor: b && b > L.perJobMax ? ME(pid) : AGENT(pid) });
  if (j.error) { reply(j.message.split(/(?<=\.)\s/)[0]); return j; }
  drafts.delete(pid);
  (db.data.managed ||= {})[j.id] = pid; save();
  flowPut(pid, j);
  if (d.photos.length) {
    const r = J.addReference(j.id, d.photos.map((x) => ({ dataUrl: x.dataUrl, label: "the problem" })), ME(pid));
    if (!r.error) {
      // each of the person's messages shows its photos from the job now
      const t = threadOf(pid);
      r.evidence.forEach((e, i) => { const m = t.messages.find((x) => x.id === d.photos[i].msg); if (m) m.photos = [...(m.photos || []), photoOf(r.job, e)]; });
      save();
      reply(`${r.evidence.length} photo${r.evidence.length === 1 ? "" : "s"} of the problem added to ${j.number}: the pros see ${r.evidence.length === 1 ? "it" : "them"} before quoting.`, { job: j });
    }
  }
  await J.requestOffers(j.id, AGENT(pid), { now: !!d.offersNow });
  return j;
}
// ---- the judges' demo page: the new flow, ready to look at, in the showcase customer's own thread -------------------
// showcase(pid, "offers"): a job posted through the chat (her words, the agent's questions, Post it), the demo pros'
// offers at once, and the agent's negotiation with their agents; "extra": that job hired (Confirm), started, and an
// extra cost the pro asks for, which the agent negotiates and leaves to her to confirm (it's over her agent's limit).
const SHOW_TEXT = "My kitchen faucet drips all night, fix it this week under $250";
const managedOf = (pid, statuses) => [...J.jobsOf(pid)].find((j) => db.data.managed?.[j.id] && statuses.includes(j.status)) || null;
const pressLabel = async (pid, msgs, label) => { const a = [...(msgs || [])].reverse().flatMap((m) => m.actions || []).find((x) => x.label === label && !x.done); return a ? (await act(pid, a.id, { steppedUp: true })).messages : null; };
export async function showcase(pid, what) {
  let j = managedOf(pid, what === "extra" ? ["held", "working"] : ["offered"]);
  if (!j && what === "extra") j = managedOf(pid, ["offered"]);
  if (!j) {
    drafts.delete(pid);
    let m = (await message(pid, SHOW_TEXT)).messages;
    m = await pressLabel(pid, m, "No photo");
    const d = draftOf(pid);
    if (d) d.offersNow = true;
    await pressLabel(pid, m, "Post it");
    j = managedOf(pid, ["offered", "scoped"]);
    if (!j) return { error: "none" };
    await new Promise((ok) => setTimeout(ok, 50)); // the agent's counter runs right after the offers event
  }
  if (what !== "extra") return { job: j };
  if (j.status === "offered") {
    const t = threadOf(pid), offersMsg = [...t.messages].reverse().find((m) => m.card?.kind === "offers" && m.job?.id === j.id && m.actions?.some((a) => /^Confirm/.test(a.label) && !a.done));
    const a = offersMsg?.actions.find((x) => /^Confirm/.test(x.label));
    if (a) await act(pid, a.id, { steppedUp: true });
    else { const best = bestOffer(j); if (best) await J.acceptOffer(j.id, best.id, { actor: AGENT(pid), payWith: "card", raiseCeiling: true }); }
    j = J.job(j.id);
  }
  const proId = j.agreed?.pro;
  if (!proId) return { job: j };
  const PRO = { kind: "pro_agent", pro: proId, client: "demo pro agent" };
  if (j.status === "held") J.startWork(proId, j.id, PRO);
  if (!j.changeOrders.some((c) => c.status === "pending")) await J.requestChange(proId, j.id, { amount: 12000, reason: "the shut-off valve under the sink is seized and has to be replaced" }, PRO);
  await new Promise((ok) => setTimeout(ok, 50));
  return { job: J.job(j.id) };
}
// a typed answer (or photos) while a draft is open
async function answerIntake(pid, d, text, pics, you, t0) {
  const t = String(text || "").trim();
  const reply = (txt, extra = {}) => post(pid, { text: txt, replyTo: you.id, ...extra });
  if (/^(cancel|never ?mind|stop|forget it|no thanks)\b|^(取消|算了)/i.test(t)) { drafts.delete(pid); reply("OK, dropped it. Tell me when something needs doing."); return { messages: since(pid, t0) }; }
  if (pics.length && d.step === "photo_check") d.step = null; // another photo instead of the doubtful one
  if (pics.length && !(await takePhotos(pid, d, pics, you, you.id))) return { messages: since(pid, t0) };
  if (t) {
    if (d.step === "what" || !d.text) { const n = startIntake(pid, t); n.photos = d.photos; n.noPhoto = d.noPhoto; d = n; }
    else if (d.step === "photo" && /\b(no|skip|don'?t have|can'?t|later)\b|沒有|不用/i.test(t)) d.noPhoto = true;
    else if (d.step === "photo_check" && /\b(use it|keep|fine|ok(ay)?|yes)\b/i.test(t)) d.step = null;
    else if (d.step === "where") { d.room = (roomIn(t) || t).slice(0, 60); d.zip = zipIn(t) || d.zip; }
    else if (d.step === "service") d.service = serviceIn(t) || t.slice(0, 60);
    else if (d.step === "confirm" && /^(yes|yep|ok(ay)?|sure|post( it)?|go|do it)\b|^(好|可以)/i.test(t)) { await postDraft(pid, d, you.id); return { messages: since(pid, t0) }; }
    else { // more detail: added to the request, and any room or service it names is taken
      d.text = `${d.text.replace(/([^.!?])$/, "$1.")} ${t}`.slice(0, 480); d.room = d.room || roomIn(t); d.service = d.service || serviceIn(t); d.thing = d.thing || thingIn(t); d.budget = d.budget ?? money$(t); d.zip = d.zip || zipIn(t);
    }
  }
  if (d.step !== "photo_check") ask(pid, d, you.id);
  return { messages: since(pid, t0) };
}
export async function message(pid, text, { photos = [] } = {}) {
  const p = person(pid);
  if (!p) return { error: "person", message: "No such person." };
  const pics = (Array.isArray(photos) ? photos : []).filter((x) => /^data:image\/(jpeg|png|webp);base64,/.test(String(x?.dataUrl || ""))).slice(0, MAX_PHOTOS);
  if (!String(text || "").trim() && !pics.length) return { error: "text", message: "Say something, or send a photo." };
  const t0 = threadOf(pid).seq;
  const you = post(pid, { from: "you", text: String(text || "").slice(0, 500) });
  if (pics.length) { you.photoCount = pics.length; save(); }
  const reply = (txt, extra = {}) => post(pid, { text: txt, replyTo: you.id, ...extra });
  const open = draftOf(pid);
  if (open) return answerIntake(pid, open, text, pics, you, t0);
  // a photo with no words: on the job not started yet, if there is one; else it starts a request
  if (!String(text || "").trim()) {
    const j = latestJob(pid, ["draft", "scoped", "offered", "agreed", "held"]);
    if (j) {
      const r = J.addReference(j.id, pics.map((x) => ({ dataUrl: x.dataUrl, label: "the problem" })), ME(pid));
      if (!r.error) { you.photos = r.evidence.map((e) => photoOf(r.job, e)); save(); reply(`Added ${r.evidence.length} photo${r.evidence.length === 1 ? "" : "s"} of the problem to ${j.number}. The pro sees them, and the checker compares the after photos with them.`, { job: j }); return { messages: since(pid, t0) }; }
    }
    const d = startIntake(pid, "");
    if (await takePhotos(pid, d, pics, you, you.id)) ask(pid, d, you.id);
    return { messages: since(pid, t0) };
  }
  let it = await intentOf(text);
  // nothing booked to move (or approve, decline, cancel) but the sentence describes work: it's a new job
  if (["reschedule", "approve", "decline", "cancel"].includes(it.intent) && WORK.test(String(text)) && !latestJob(pid, ["scoped", "offered", "agreed", "held", "working", "review"])) it = { intent: "post_job", text: String(text).trim(), budget: money$(text), source: "rules" };
  you.intent = { intent: it.intent, source: it.source }; save();
  if (it.intent === "post_job") {
    const d = startIntake(pid, it.text, it.budget);
    if (pics.length && !(await takePhotos(pid, d, pics, you, you.id))) return { messages: since(pid, t0) };
    ask(pid, d, you.id);
  } else if (it.intent === "status") {
    const jobs = [...J.jobsOf(pid)].filter((j) => !["cancelled", "expired"].includes(j.status)).slice(0, 3);
    if (!jobs.length) reply("No jobs yet. What needs doing?");
    for (const j of jobs) reply(`${j.number}: ${J.view(j).next}`.slice(0, 160), { job: j, card: jobSummaryCard(j) });
  } else if (it.intent === "hire") {
    const j = latestJob(pid, ["offered"]), o = j && bestOffer(j);
    if (!o) reply("There's no offer to accept right now.");
    else await doAct(pid, { kind: o.amount > (j.scope.priceCeiling || Infinity) ? "hire_pin" : "hire", args: { offer: o.id }, job: j.id }, { steppedUp: false, replyTo: you.id });
  } else if (it.intent === "counter") {
    const j = latestJob(pid, ["offered"]), o = j && bestOffer(j);
    if (!o) reply("There's no offer to counter right now.");
    else await doAct(pid, { kind: "counter", args: { offer: o.id, amount: it.amount }, job: j.id }, { steppedUp: false, replyTo: you.id });
  } else if (it.intent === "approve" || it.intent === "decline") {
    const j = [...J.jobsOf(pid)].find((x) => x.changeOrders.some((c) => c.status === "pending")), co = j?.changeOrders.find((c) => c.status === "pending");
    if (!co) reply("Nothing is waiting for your approval.");
    else if (it.intent === "approve") reply(`Approving +${usd(co.amount)} needs your PIN.`, { job: j, card: changeCard(j, co), actions: [{ kind: "approve_change", label: "Approve", style: "primary", needsPin: true, args: { change: co.id } }] });
    else await doAct(pid, { kind: "decline_change", args: { change: co.id }, job: j.id }, { steppedUp: false, replyTo: you.id });
  } else if (it.intent === "cancel") {
    const j = latestJob(pid, ["scoped", "offered", "agreed", "held"]);
    if (!j) reply("There's nothing to cancel.");
    else reply(`Cancel ${j.number} (${j.scope.title})?`, { job: j, card: jobSummaryCard(j), actions: [{ kind: "cancel", label: "Cancel it", style: "danger" }, { kind: "wait", label: "Keep it" }] });
  } else if (it.intent === "reschedule") {
    const j = latestJob(pid, ["agreed", "held"]);
    if (!j) reply("There's no booked visit to move.");
    else { const { freeSlots, availabilityOf, visitMinutes } = await import("./calendar.js"); const p0 = getPro(j.agreed.pro), sl = freeSlots(availabilityOf(p0), { earliest: now() + 864e5, minutes: visitMinutes(p0, j), count: 3 }); reply(sl.length ? `${firstName(j.agreed.proName)} can also come:` : "The pro has no other opening soon.", { job: j, card: visitCard(j, "booked"), actions: sl.map((s) => ({ kind: "reschedule", label: when(s.from).replace(/:00/, "").split(", ").slice(-2).join(" ").slice(0, 24), args: { from: s.from } })) }); }
  } else if (it.intent === "maybe_post") {
    reply(`New job: "${it.text.slice(0, 80)}"?`, { actions: [{ kind: "post_text", label: "Post it", style: "primary", args: { text: it.text } }, { kind: "wait", label: "No" }] });
  } else if (it.intent === "help") reply("Tell me what needs doing, by when, and your budget. I'll handle the pros and the money.", { actions: SUGGESTIONS.slice(0, 2).map((s) => ({ kind: "say", label: s.split(/[,.]/)[0].split(" ").slice(0, 3).join(" "), args: { text: s } })) });
  else reply("What needs doing, and by when?");
  return { messages: since(pid, t0) };
}

// ---- a tap on an action --------------------------------------------------------------------------------------------
let proActHook = null;
export const setProActHook = (fn) => { proActHook = fn; };
export async function act(pid, actionId, { steppedUp = false } = {}) {
  const a = db.data.actions[actionId];
  if (!a || a.person !== pid) return { error: "not_found", message: "No such action." };
  if (a.pro) { if (a.done) return { error: "state", message: "That's already done.", messages: [] }; if (a.needsPin && !steppedUp) return { error: "step_up", message: "Only you can do this: confirm with your PIN first.", stepUp: "/api/auth/step-up", action: actionId }; const t0 = threadOf(pid).seq; post(pid, { from: "you", text: a.label, replyTo: a.msg }); const r = await proActHook(pid, a, actionId); return { ...(r?.error ? { error: r.error } : {}), messages: since(pid, t0) }; }
  if (a.done) return { error: "state", message: "That's already done.", messages: [] };
  if (a.needsPin && !steppedUp) return { error: "step_up", message: "Only you can do this: confirm with your PIN first.", stepUp: "/api/auth/step-up", action: actionId };
  const t0 = threadOf(pid).seq;
  if (a.kind !== "say") post(pid, { from: "you", text: a.label, replyTo: a.msg });
  const r = await doAct(pid, a, { steppedUp, replyTo: a.msg, actionId });
  return { ...(r?.error ? { error: r.error } : {}), messages: since(pid, t0) };
}
async function doAct(pid, a, { steppedUp = false, replyTo = null, actionId = null } = {}) {
  const j = a.job ? J.job(a.job) : null, reply = (txt, extra = {}) => post(pid, { text: txt, replyTo, job: j, ...extra });
  const fail = (r) => { reply(String(r.message || "That didn't work.").split(/(?<=\.)\s/)[0].slice(0, 200)); return r; };
  const mine = !j || j.customer === pid;
  if (!mine && !["say", "wait", "link"].includes(a.kind)) return fail({ error: "forbidden", message: "Your landlord decides this." });
  let r = null;
  switch (a.kind) {
    case "say": if (actionId) markDone(actionId); return message(pid, a.args.text).then(() => null);
    case "post_text": { if (actionId) markDone(actionId); const d = startIntake(pid, a.args.text); ask(pid, d, replyTo); return null; }
    case "intake_skip_photo": case "intake_keep_photo": case "intake_room": case "intake_room_other": case "intake_service": case "intake_post": case "intake_cancel": {
      const d = draftOf(pid);
      if (actionId) markDone(actionId);
      if (!d) { reply("That request timed out. Tell me again what needs doing."); return null; }
      if (a.kind === "intake_cancel") { drafts.delete(pid); reply("OK, dropped it."); return null; }
      if (a.kind === "intake_post") { const r2 = await postDraft(pid, d, replyTo); return r2?.error ? r2 : null; }
      if (a.kind === "intake_room_other") { d.step = "where"; reply("Type where it is: the room, or the address if it's not your home."); return null; }
      if (a.kind === "intake_skip_photo") d.noPhoto = true;
      if (a.kind === "intake_keep_photo") d.step = null;
      if (a.kind === "intake_room") d.room = a.args.room;
      if (a.kind === "intake_service") d.service = a.args.service;
      ask(pid, d, replyTo);
      return null;
    }
    case "wait": reply("OK, I'll tell you when something changes."); break;
    case "link": reply("Opening PayPal."); break;
    case "hire": {
      r = await J.acceptOffer(j.id, a.args.offer, { actor: AGENT(pid), payWith: person(pid).vault ? "saved" : "card", slot: a.args.slot ?? null });
      if (r?.error === "limit") { reply(`That's over your agent's limit (${r.limitUsd}); it needs your PIN.`, { actions: [{ kind: "hire_pin", label: "Hire (PIN)", style: "primary", needsPin: true, args: a.args }] }); r = null; break; }
      if (r?.error) return fail(r);
      break; // money_held / hold_pending say the rest
    }
    case "hire_pin": r = await J.acceptOffer(j.id, a.args.offer, { actor: ME(pid), payWith: person(pid).vault ? "saved" : "card", raiseCeiling: true }); if (r?.error) return fail(r); break;
    case "counter": {
      const o = j.offers.find((x) => x.id === a.args.offer), fr = j.estimate ? J.fairRange(j) : null;
      const amt = a.args.amount || Math.max(fr ? fr.low : 0, Math.min(Math.round((o.amount * 0.88) / 500) * 500, fr ? fr.typical : Infinity));
      r = await J.counterOffer(j.id, o.id, amt, AGENT(pid));
      if (r?.error) return fail(r);
      const o2 = J.job(j.id).offers.find((x) => x.id === o.id), ans = o2.answer;
      reply(ans ? (ans.kind === "accept" ? `I countered ${usd(amt)}; ${firstName(o2.proName)} said yes.` : ans.kind === "counter" ? `I countered ${usd(amt)}; they came back at ${usd(ans.amount)}.` : `I countered ${usd(amt)}; they declined, ${usd(o2.amount)} stands.`) : `I countered ${usd(amt)}; waiting for their agent.`, { card: offersCard(J.job(j.id)), actions: ans && ans.kind !== "decline" || !ans ? [{ kind: o2.amount > (j.scope.priceCeiling || Infinity) ? "hire_pin" : "hire", label: `Hire at ${usd(o2.amount).replace(".00", "")}`, style: "primary", needsPin: o2.amount > (j.scope.priceCeiling || Infinity), args: { offer: o.id } }] : [] });
      break;
    }
    case "approve_change": r = await J.approveChange(j.id, a.args.change, ME(pid)); if (r?.error) return fail(r); break;
    case "decline_change": r = J.declineChange(j.id, a.args.change, ME(pid), "declined in the chat"); if (r?.error) return fail(r); break;
    case "approve_advance": r = await J.approveMaterialsAdvance(j.id, a.args.change, ME(pid)); if (r?.error) return fail(r); reply("Approved; the pro is paid for the materials now."); break;
    case "decline_advance": r = J.declineMaterialsAdvance(j.id, a.args.change, ME(pid), "declined in the chat"); if (r?.error) return fail(r); reply("Declined; materials are paid with the rest at the end."); break;
    case "confirm": r = await J.confirm(j.id, ME(pid), {}); if (r?.error) return fail(r); break;
    case "request_fix": { const bad = J.toFix(j).map((x) => `${x.what}: ${x.reason}`).join("; ") || "please resend clearer photos of each condition"; r = J.requestFix(j.id, `Your agent asks: ${bad}`.slice(0, 300), AGENT(pid)); if (r?.error) return fail(r); break; }
    case "dispute": r = await J.openDispute(j.id, "Opened from the chat: the result isn't right.", ME(pid)); if (r?.error) return fail(r); break;
    case "cancel": r = await J.cancel(j.id, limitsOf(person(pid)).agentMayCancel ? AGENT(pid) : ME(pid), "cancelled in the chat"); if (r?.error) return fail(r); break;
    case "retry_hold": r = await J.retryHold(j.id, AGENT(pid), {}); if (r?.error) return fail(r); break;
    case "accept_reschedule": case "decline_reschedule": r = J.answerReschedule(j.id, a.args.proposal, { accept: a.kind === "accept_reschedule" }, ME(pid)); if (r?.error) return fail(r); if (a.kind === "decline_reschedule") reply("Kept the original time."); break;
    case "reschedule": r = J.reschedule(j.id, { from: a.args.from, reason: "moved from the chat" }, ME(pid)); if (r?.error) return fail(r); if (r.proposal) reply(`Asked the pro to come ${when(a.args.from)}.`); break;
    case "tip": r = await J.tip(j.id, { amount: a.args.amount }, ME(pid)); if (r?.error) return fail(r); break;
    case "rate": r = J.rate(j.id, { stars: a.args.stars }, ME(pid)); if (r?.error) return fail(r); reply("Thanks: 5 stars recorded."); break;
    case "accept_suggestion": { const H = await import("./home.js"); r = await H.acceptSuggestion(pid, a.args.suggestion, AGENT(pid)); if (r?.error) return fail(r); break; }
    case "dismiss_suggestion": { const H = await import("./home.js"); H.dismissSuggestion(pid, a.args.suggestion); reply("OK, I'll leave it."); break; }
    default: reply("I can't do that from here.");
  }
  if (actionId) markDone(actionId, "done");
  return r;
}
// a message the server writes for a person outside a job event (the judges' tour's mandate steps)
export const note = (pid, text, extra = {}) => post(pid, { text, ...extra });
export { threadOf, since, markDone, holdCard, checksCard, paidCard, visitCard, offersCard, changeCard, workOrderCard, railOf as rail, proChip, firstName };
export const _reset = () => { db.data.threads = {}; db.data.actions = {}; db.data.lastEvent = 0; save(); };
