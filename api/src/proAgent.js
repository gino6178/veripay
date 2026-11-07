// The pro's agent: the same short thread as the customer's (assistant.js), for the pro's side (PLAN §17). Camera-first:
// the next step is a button (I've arrived, take photos, send for check, answer a counter or a fix); messages are code
// templates from the job's state, two short sentences at most, in Spanish when the pro's lang is "es". Nothing here
// changes where a pro is paid; early pay needs the pro's PIN.
import * as A from "./assistant.js";
import * as J from "./jobs.js";
import { pro as getPro, quoteFor } from "./pros.js";
import { person } from "./people.js";
import { usd } from "./pay/index.js";
import { when } from "./human.js";
import { cuando } from "./i18n.js";
import { nowIso } from "./clock.js";

const PRO_ACTOR = (proId) => ({ kind: "pro_agent", pro: proId, client: "Your agent (built-in, pro)" });
const PRO_ME = (proId, pid) => ({ kind: "pro", pro: proId, person: pid });
// the templates, English and Spanish (the numbers are filled in by code)
const T = {
  en: { newJob: (t, mi, c) => `New job near you: ${t}, ${mi} mi${c ? `, up to ${c}` : ""}. Offer?`, agentOffered: (t, mi, a) => `New job near you: ${t}, ${mi} mi. Your agent offered ${a}.`, offerBtn: (a) => `Offer ${a}`, skip: "Skip", counter: (a) => `The customer counters ${a}.`, accept: "Accept", decline: "Decline",
    hired: (p, t) => `You're hired at ${p}. Arrive ${t}.`, held: "The money is held. Start when you arrive.", arrived: "I've arrived", started: "Started. Take a photo for each condition.", camera: "Take photos", send: "Send for check",
    change: (a, s) => `Change order +${a} ${s}.`, fix: (n) => `${n} need${n === 1 ? "s" : ""} a fix.`, passed: "Every check passed.", review: "The customer is looking at it.", paid: (a, v) => `Paid ${a} to your ${v}.`, tip: (a) => `A ${a} tip, all yours.`,
    moved: (t) => `The customer asks to move it to ${t}.`, notChosen: "The customer chose another offer.", status: (n, s) => `${n}: ${s}`, nothing: "No jobs right now. I'll tell you when one comes in.", help: "Ask me: status, I've arrived, send, payout.", tooEarly: (t) => `Your visit is ${t}: tap again then, or move the visit.`, moveVisit: "Move visit", notHeld: "The money isn't held yet; I'll tell you when it is.", needBefore: "The customer wants before photos first: take them, then tap I've arrived.", moveTo: "You can move it to:", noSlot: "No other opening in the job's window.", proposed: (t) => `Asked the customer to move it to ${t}.`, earlyPay: "Early pay", unclear: "Status, arrived, send or payout?" },
  es: { newJob: (t, mi, c) => `Trabajo nuevo cerca: ${t}, ${mi} mi${c ? `, hasta ${c}` : ""}. ¿Oferta?`, agentOffered: (t, mi, a) => `Trabajo nuevo cerca: ${t}, ${mi} mi. Su agente ofreció ${a}.`, offerBtn: (a) => `Ofrecer ${a}`, skip: "Omitir", counter: (a) => `El cliente contraoferta ${a}.`, accept: "Aceptar", decline: "Rechazar",
    hired: (p, t) => `Lo contrataron por ${p}. Llegue ${t}.`, held: "El dinero está retenido. Empiece al llegar.", arrived: "Ya llegué", started: "Empezado. Tome una foto por condición.", camera: "Tomar fotos", send: "Enviar a revisión",
    change: (a, s) => `Orden de cambio +${a} ${s}.`, fix: (n) => `${n} ${n === 1 ? "necesita" : "necesitan"} corrección.`, passed: "Todas las revisiones pasaron.", review: "El cliente lo está revisando.", paid: (a, v) => `Se le pagaron ${a} a su ${v}.`, tip: (a) => `Una propina de ${a}, toda suya.`,
    moved: (t) => `El cliente pide cambiar la cita a ${t}.`, notChosen: "El cliente eligió otra oferta.", status: (n, s) => `${n}: ${s}`, nothing: "No hay trabajos ahora. Le aviso cuando llegue uno.", help: "Pregúnteme: estado, ya llegué, enviar, pago.", tooEarly: (t) => `Su visita es ${t}: toque de nuevo entonces, o cambie la cita.`, moveVisit: "Cambiar cita", notHeld: "El dinero aún no está retenido; le aviso cuando lo esté.", needBefore: "El cliente pide fotos de antes: tómelas y toque Ya llegué.", moveTo: "Puede cambiarla a:", noSlot: "No hay otra hora en la ventana del trabajo.", proposed: (t) => `Le pedí al cliente cambiarla a ${t}.`, earlyPay: "Pago anticipado", unclear: "¿Estado, llegué, enviar o pago?" },
};
const langOf = (proId) => (getPro(proId)?.lang === "es" ? "es" : "en");
const t_ = (proId) => T[langOf(proId)];
const at = (proId, iso) => (langOf(proId) === "es" ? cuando(iso) : when(iso));
const camera = (j) => `/pro/jobs/${j.id}?camera=1`;

function proMessages(pid, proId, j, e) {
  const L = t_(proId), out = [], say = (text, card, actions = [], k = 0) => out.push({ text, card, actions: actions.filter(Boolean).map((a) => ({ ...a, pro: proId })), k });
  const mine = j.agreed?.pro === proId;
  switch (e.action) {
    case "offers_requested": {
      if (j.status !== "offered") break;
      const p = getPro(proId), mineO = j.offers.find((o) => o.pro === proId && ["open", "countered"].includes(o.status)), f = J.openFor(p).find((x) => x.id === j.id);
      // a demo pro's own agent (run by VeriPay) already quoted: say what it offered
      if (mineO) { say(L.agentOffered(j.scope.title, f?.miles ?? mineO.miles ?? "?", usd(mineO.amount)), A.workOrderCard(j)); break; }
      const q = quoteFor(p, j);
      if (q.decline || !f) break;
      say(L.newJob(j.scope.title, f.miles, j.scope.priceCeiling ? usd(j.scope.priceCeiling) : null), A.workOrderCard(j), [{ kind: "pro_offer", label: L.offerBtn(usd(q.ask).replace(".00", "")), style: "primary", args: { amount: q.ask } }, { kind: "pro_skip", label: L.skip }]);
      break;
    }
    case "counter_sent": { const o = j.offers.find((x) => x.pro === proId && x.status === "countered"); if (o) say(L.counter(usd(o.counter.amount)), A.offersCard(j), [{ kind: "pro_accept_counter", label: L.accept, style: "primary", args: { offer: o.id } }, { kind: "pro_decline_counter", label: L.decline, style: "danger", args: { offer: o.id } }]); break; }
    case "offer_declined": if (e.data?.pro === proId) say(L.notChosen, null); break;
    case "job_agreed": if (mine) say(L.hired(usd(j.agreed.price), at(proId, j.agreed.arrival || j.scope.window?.from)), A.visitCard(j, "booked")); break;
    case "money_held": if (mine) say(L.held, A.visitCard(j, "booked"), [{ kind: "pro_start", label: L.arrived, style: "primary" }]); break;
    case "work_started": if (mine) say(L.started, A.workOrderCard(j), [{ kind: "camera", label: L.camera, style: "primary", href: camera(j) }, { kind: "pro_submit", label: L.send }]); break;
    case "change_approved": case "change_declined": { const co = j.changeOrders.filter((c) => c.status === (e.action === "change_approved" ? "approved" : "declined")).at(-1); if (mine && co) say(L.change(usd(co.amount), e.action === "change_approved" ? (langOf(proId) === "es" ? "aprobada" : "approved") : (langOf(proId) === "es" ? "rechazada" : "declined")), A.changeCard(j, co)); break; }
    case "fix_requested": if (mine) say(L.fix(J.toFix(j).length || 1), A.checksCard(j), [{ kind: "camera", label: L.camera, style: "primary", href: camera(j) }, { kind: "pro_submit", label: L.send }]); break;
    case "checked": if (mine) { const r = j.checks.at(-1); if (r?.decision === "needs_fix") say(L.fix(J.toFix(j).length || 1), A.checksCard(j), [{ kind: "camera", label: L.camera, style: "primary", href: camera(j) }, { kind: "pro_submit", label: L.send }]); else if (r?.decision === "review") say(L.review, A.checksCard(j)); else if (!["released", "resolved"].includes(j.status)) say(L.passed, A.checksCard(j)); } break;
    case "money_released": if (mine) { const b = J.balance(j), v = j.money?.payout?.via === "venmo" ? "Venmo" : "PayPal"; say(L.paid(usd(b.pro), v), A.paidCard(j), j.milestones?.some((m) => m.status === "passed" && !m.earlyPay) ? [{ kind: "pro_early_pay", label: L.earlyPay, needsPin: true }] : []); } break;
    case "reschedule_proposed": { const p = j.visit?.proposal; if (mine && p?.by === "customer") say(L.moved(at(proId, p.from)), { kind: "reschedule", data: { job: j.id, proposal: p, slot: j.visit.slot } }, [{ kind: "pro_accept_reschedule", label: L.accept, style: "primary", args: { proposal: p.id } }, { kind: "pro_decline_reschedule", label: L.decline, args: { proposal: p.id } }]); break; }
    case "tip_paid": if (mine) say(L.tip(usd((j.tips || []).at(-1)?.amount || 0)), A.paidCard(j)); break;
    default: break;
  }
  return out;
}
A.setProHook(proMessages);

// "I've arrived": starts the work (start_work, with its usual checks). Refused, in one line with the way on, when the
// money isn't held yet or the visit is more than an hour away (the job's window not open yet)
const EARLY_MS = 60 * 60e3;
async function arrive(pid, proId, j, replyTo = null) {
  const L = t_(proId), tell = (txt, extra = {}) => A.note(pid, txt, { job: j, replyTo, ...extra }), act = (kind, label, extra = {}) => ({ kind, label, pro: proId, ...extra });
  if (j.status === "working" || j.status === "needs_fix") { tell(L.started, { card: A.workOrderCard(j), actions: [act("camera", L.camera, { style: "primary", href: camera(j) }), act("pro_submit", L.send)] }); return { ok: true }; }
  if (j.status !== "held") { tell(L.notHeld); return { error: "state" }; }
  const visit = Date.parse(j.visit?.slot?.from || j.agreed?.arrival || ""), opens = Date.parse(j.scope.window?.from || ""), t = Date.parse(nowIso());
  const early = (Number.isFinite(visit) && t < visit - EARLY_MS) || (Number.isFinite(opens) && t < opens - 60e3);
  if (early) { const when_ = Number.isFinite(visit) ? visit : opens; tell(L.tooEarly(at(proId, new Date(when_).toISOString())), { card: A.visitCard(j, "booked"), actions: [act("pro_start", L.arrived, { style: "primary" }), act("pro_move", L.moveVisit)] }); return { error: "early" }; }
  const r = J.startWork(proId, j.id, PRO_ME(proId, pid), {});
  if (r?.error) { tell(r.error === "before" ? L.needBefore : String(r.message).split(/(?<=\.)\s/)[0].slice(0, 200), { card: A.visitCard(j, "booked"), actions: r.error === "before" ? [act("camera", L.camera, { style: "primary", href: `/pro/jobs/${j.id}?camera=before` }), act("pro_start", L.arrived)] : [] }); return r; }
  return r;
}
async function proAct(pid, a, actionId) {
  const proId = a.pro, j = a.job ? J.job(a.job) : null, L = t_(proId), reply = (txt, extra = {}) => A.note(pid, txt, { job: j, replyTo: a.msg, ...extra });
  const fail = (r) => { reply(String(r.message || "That didn't work.").split(/(?<=\.)\s/)[0].slice(0, 200)); return r; };
  let r = null;
  switch (a.kind) {
    case "pro_offer": r = J.proOffer(proId, j.id, { amount: a.args.amount }, PRO_ACTOR(proId)); if (r?.error) return fail(r); reply(langOf(proId) === "es" ? `Oferta enviada: ${usd(a.args.amount)}.` : `Offer sent: ${usd(a.args.amount)}.`); break;
    case "pro_skip": reply(langOf(proId) === "es" ? "Bien, lo omito." : "OK, skipped."); break;
    case "pro_accept_counter": r = await J.proAnswer(proId, a.args.offer, { kind: "accept" }, PRO_ACTOR(proId)); if (r?.error) return fail(r); reply(langOf(proId) === "es" ? "Contraoferta aceptada." : "Counter accepted."); break;
    case "pro_decline_counter": r = await J.proAnswer(proId, a.args.offer, { kind: "decline" }, PRO_ACTOR(proId)); if (r?.error) return fail(r); reply(langOf(proId) === "es" ? "Rechazada; su oferta sigue en pie." : "Declined; your offer stands."); break;
    case "pro_start": r = await arrive(pid, proId, j, a.msg); if (r?.error) { A.markDone(actionId, "refused"); return r; } break; // work_started says the rest
    case "pro_move": { const { freeSlots, availabilityOf, visitMinutes } = await import("./calendar.js"); const p = getPro(proId), sl = freeSlots(availabilityOf(p), { earliest: Date.parse(nowIso()) + 3600e3, winFrom: j.scope.window?.from, winTo: j.scope.window?.to, minutes: visitMinutes(p, j), count: 3 }); reply(sl.length ? L.moveTo : L.noSlot, { card: A.visitCard(j, "booked"), actions: sl.map((s) => ({ kind: "pro_reschedule", label: at(proId, s.from).split(", ").slice(-1)[0].slice(0, 24), pro: proId, args: { from: s.from } })) }); break; }
    case "pro_reschedule": r = J.reschedule(j.id, { from: a.args.from, reason: "moved by the pro from the thread" }, PRO_ME(proId, pid)); if (r?.error) return fail(r); if (r.proposal) reply(L.proposed(at(proId, a.args.from))); break;
    case "pro_submit": r = await J.submit(proId, j.id, PRO_ME(proId, pid)); if (r?.error) return fail(r); break; // checked says the rest
    case "pro_accept_reschedule": case "pro_decline_reschedule": r = J.answerReschedule(j.id, a.args.proposal, { accept: a.kind === "pro_accept_reschedule" }, PRO_ME(proId, pid)); if (r?.error) return fail(r); break;
    case "pro_early_pay": r = await J.earlyPay(proId, j.id, {}, PRO_ME(proId, pid)); if (r?.error) return fail(r); reply(langOf(proId) === "es" ? "Pago anticipado enviado." : "Early pay sent."); break;
    default: reply(L.unclear);
  }
  A.markDone(actionId, "done");
  return r;
}
A.setProActHook(proAct);

export function thread(pid, proId, { after = 0 } = {}) {
  const t = A.threadOf(pid), L = t_(proId);
  if (!t.messages.length) A.note(pid, L.help, { key: "hello-pro", card: { kind: "hello", data: { pro: A.proChip(proId), lang: langOf(proId) } } });
  // an active job leads with its next step (a pro who signs in after the job's events missed them): the visit and
  // "I've arrived" while the money is held; the camera and "Send for check" while working or fixing
  for (const j of J.jobsOfPro(proId).filter((x) => x.agreed?.pro === proId && ["held", "working", "needs_fix"].includes(x.status))) {
    const key = `next:${j.id}:${j.status}:${j.checks.length}`, act = (kind, label, extra = {}) => ({ kind, label, pro: proId, ...extra });
    // (already asked, with a button still open: nothing new)
    if (t.messages.some((m) => m.job?.id === j.id && (m.actions || []).some((a) => !a.done && (a.label === L.arrived || a.label === L.send || a.label === L.camera)))) continue;
    if (j.status === "held") A.note(pid, L.hired(usd(j.agreed.price), at(proId, j.agreed.arrival || j.scope.window?.from)), { job: j, key, card: A.visitCard(j, "booked"), actions: [act("pro_start", L.arrived, { style: "primary" })] });
    else A.note(pid, j.status === "needs_fix" ? L.fix(J.toFix(j).length || 1) : L.started, { job: j, key, card: j.status === "needs_fix" ? A.checksCard(j) : A.workOrderCard(j), actions: [act("camera", L.camera, { style: "primary", href: camera(j) }), act("pro_submit", L.send)] });
  }
  return { messages: t.messages.filter((m) => m.seq > (+after || 0)), seq: t.seq, lang: langOf(proId), waitingOn: J.jobsOfPro(proId).filter((j) => j.agreed?.pro === proId && J.waitingOn(j)?.who === "pro").map((j) => ({ job: { id: j.id, number: j.number, title: j.scope.title }, ask: J.waitingOn(j).what })) };
}
// typed text from the pro: status, arrived, send, payout (rules; Spanish words too)
export async function message(pid, proId, text) {
  const t0 = A.threadOf(pid).seq, L = t_(proId), low = String(text || "").toLowerCase();
  A.post(pid, { from: "you", text: String(text).slice(0, 500) });
  const jobs = J.jobsOfPro(proId).filter((j) => j.agreed?.pro === proId && !["released", "resolved", "cancelled", "expired"].includes(j.status));
  const cur = jobs[0] || null, reply = (txt, extra = {}) => A.note(pid, txt, extra);
  const act = (kind, label, extra = {}) => ({ kind, label, pro: proId, style: "primary", ...extra });
  if (/arriv|here|start|llegu|empez/.test(low) && cur && ["held", "working", "needs_fix"].includes(cur.status)) await arrive(pid, proId, cur);
  else if (/arriv|here|start|llegu|empez/.test(low) && cur) reply(cur.status === "held" ? L.held : L.status(cur.number, J.view(cur, { as: "pro" }).next), { job: cur, card: A.visitCard(cur, "booked"), actions: cur.status === "held" ? [act("pro_start", L.arrived)] : [] });
  else if (/send|submit|photo|envi|foto/.test(low) && cur) reply(L.started, { job: cur, card: A.workOrderCard(cur), actions: [act("camera", L.camera, { href: camera(cur) }), act("pro_submit", L.send, { style: "secondary" })] });
  else if (/pay|paid|money|pago|dinero/.test(low)) { const done = J.jobsOfPro(proId).filter((j) => j.agreed?.pro === proId && j.paidAt).slice(0, 2); if (!done.length) reply(L.nothing); for (const j of done) reply(L.paid(usd(J.balance(j).pro), j.money?.payout?.via === "venmo" ? "Venmo" : "PayPal"), { job: j, card: A.paidCard(j) }); }
  else if (/status|what|estado|qué|que pasa/.test(low)) { if (!jobs.length) reply(L.nothing); for (const j of jobs.slice(0, 3)) reply(L.status(j.number, (langOf(proId) === "es" ? (await import("./i18n.js")).proNextEs(j, J.view(j, { as: "pro" }).next) : J.view(j, { as: "pro" }).next)).slice(0, 200), { job: j, card: { kind: "job_summary", data: { job: j.id, number: j.number, title: j.scope.title, status: j.status, rail: A.rail(j) } } }); }
  else reply(L.unclear);
  return { messages: A.since(pid, t0) };
}
