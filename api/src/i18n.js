// Spanish for pros (PLAN §15 item 5). A pro whose setting `lang` is "es" gets every pro-facing message from the API in
// Spanish: A2A replies (next, waitingOn, errors), news summaries, readiness, inbox items and simulated emails/SMS. The
// customer side stays English. A small catalog, written by hand (no model translates anything): each Spanish line
// keeps its English one beside it (`messageEn`, `nextEn`, `summaryEn`), and a line the catalog doesn't know stays in
// English, marked `untranslated: true`, never machine-guessed.
import { usd } from "./pay/index.js";

export const LANGS = ["en", "es"];
export const langOf = (p) => (p?.lang === "es" ? "es" : "en");
const TZ = "America/Chicago";
// "7 nov, 7:00 a. m." in Austin time
export const cuando = (iso) => { const t = Date.parse(iso); return Number.isFinite(t) ? new Intl.DateTimeFormat("es-US", { timeZone: TZ, month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(t)) : String(iso); };
const fill = (s, p = {}) => s.replace(/\{(\w+)\}/g, (m, k) => (p[k] == null ? "" : String(p[k])));

// ---- errors, by code (the English message stays in messageEn) ----------------------------------------------------------
const ERRORS = {
  not_found: "No se encontró: revise el id del trabajo, la oferta o el cambio.", forbidden: "No es su trabajo.", state: "El trabajo no está en un estado que permita esto ahora.",
  amount: "Revise el monto (en dólares estadounidenses).", arguments: "Esa acción no acepta algunos de los argumentos enviados (vea `allowed`).", offer: "Esa oferta no está abierta.",
  trade: "Este trabajo es de otro oficio.", parts: "parts es su estimado de piezas en USD, dentro del precio.", partsPolicy: "partsPolicy es at_cost, markup_10 o included.",
  pending: "Hay una orden de cambio esperando al cliente: espere o retírela.", person_only: "Solo la persona puede hacer esto en el sitio web, con su PIN.", payee: "El profesional aún no tiene un PayPal verificado.",
  unchanged: "Ese archivo o nota ya fue rechazado para esta condición: envíe uno nuevo.", before: "Faltan las fotos de antes.", slot: "Ese horario no está dentro de su disponibilidad o de la ventana del trabajo.",
  reschedule: "No se pudo cambiar la cita.", lang: "lang es \"en\" o \"es\".", fields: "Hay campos desconocidos (vea `allowed`).", kind: "kind es accept, counter o decline.",
  one_counter: "Ya hubo una contraoferta en esta oferta.", limit: "Eso supera un límite que solo la persona puede cambiar.", scope: "Esta llave no tiene ese permiso.",
  rate_limited: "Demasiadas solicitudes por minuto: vaya más despacio.", phone: "El número de teléfono debe ser de EE. UU. (10 dígitos).", tip: "Propinas: revise el monto y el estado del trabajo.",
};
export function errorIn(lang, r) {
  if (lang !== "es" || !r?.error) return r;
  const es = ERRORS[r.error];
  return es ? { ...r, message: es, messageEn: r.message, lang: "es" } : { ...r, lang: "es", untranslated: true };
}

// ---- "what happens next" for a pro, by the job's state (mirrors jobs.js nextStep for as: "pro") ----------------------
export function proNextEs(j, en) {
  const m = j.milestones?.find((x) => !["released", "resolved"].includes(x.status)), multi = (j.milestones?.length || 0) > 1, name = m && multi ? ` (${m.title})` : "";
  if (j.warranty?.status === "claimed") return "Repare el defecto reclamado y envíe fotos de la reparación.";
  if (j.status === "passed" && m?.passed) return m.passed.waiting === "inspector" ? `Todas las revisiones pasaron${name}; el inspector confirma antes de que se mueva el dinero.` : `Aprobado${name}: se paga el ${cuando(m.passed.until)} (o tome el pago anticipado ahora).`;
  if (j.status === "working" && multi && m) return `Envíe la evidencia de "${m.title}" y luego envíela a revisión.`;
  const L = { draft: "Se está escribiendo el alcance.", scoped: "El cliente revisa el alcance.", offered: "Haga una oferta o responda a la contraoferta del cliente.",
    agreed: "El cliente está reteniendo el dinero con PayPal.", held: "Tome las fotos de antes y luego empiece el trabajo.", working: "Envíe la evidencia de cada condición de terminado y luego envíela a revisión.",
    submitted: "Revisando.", checking: "Revisando.", needs_fix: `Envíe lo que pidió la revisión${name} y vuelva a enviarlo.`, review: "El cliente está decidiendo; puede reenviar evidencia de lo que falta.",
    disputed: "Proponga un reparto, acepte el de la otra parte o espere al árbitro.", released: "Pagado (o enviado con PayPal Payouts).", resolved: "Resuelto.", cancelled: "Cancelado.", expired: "Vencido." };
  return L[j.status] || en;
}
const WAITING = { customer: "el cliente", pro: "usted (el profesional)", platform: "la plataforma", paypal: "PayPal", inspector: "el inspector", nobody: "nadie", "customer and pro": "el cliente y usted", landlord: "el propietario" };
export function waitingEs(w) {
  if (!w) return w;
  return { ...w, whoEs: WAITING[w.who] || w.who, whatEn: w.what, what: ({ "start work": "empezar el trabajo", "send the evidence and submit": "enviar la evidencia", checking: "revisando", "send what the check asked for": "enviar lo que pidió la revisión", "fix the claimed defect": "reparar el defecto reclamado", "counter or accept an offer": "contraofertar o aceptar una oferta", "send an offer": "enviar una oferta", "answer the customer's counter": "responder a la contraoferta del cliente", "confirm, release, ask for a fix or dispute": "confirmar, pagar, pedir una corrección o disputar" })[w.what] || (/^start work: they arrive about (.+)$/.test(w.what) ? `empezar el trabajo: llega cerca del ${cuando(w.what.replace(/^start work: they arrive about /, ""))}` : /^approve or decline the change order/.test(w.what) ? "el cliente aprueba o rechaza la orden de cambio" : w.what) };
}

// ---- news and inbox items, by activity action ----------------------------------------------------------------------------
// {n}: the job number; {amount}: money from the event's data when there is one
const NEWS = {
  offers_requested: ["Trabajo nuevo pidiendo ofertas", "{n}: se piden ofertas."], job_scoped: ["Trabajo nuevo", "{n}: un trabajo nuevo con su alcance escrito."],
  offer_received: ["Oferta enviada", "{n}: su oferta llegó al cliente."], counter_sent: ["Contraoferta del cliente", "{n}: el cliente hizo una contraoferta: respóndala."],
  offer_declined: ["Oferta no elegida", "{n}: el cliente eligió otra oferta."], offer_expired: ["Oferta vencida", "{n}: su oferta venció."], terms_changed: ["Cambiaron las condiciones", "{n}: el cliente cambió las condiciones; puede enviar una oferta nueva."],
  job_agreed: ["¡Lo contrataron!", "{n}: el cliente aceptó su oferta."], money_held: ["Dinero retenido", "{n}: el dinero está retenido con PayPal; puede empezar."], hold_pending: ["Esperando la retención", "{n}: el cliente aprueba la retención en PayPal."],
  change_requested: ["Orden de cambio enviada", "{n}: su orden de cambio espera al cliente."], change_approved: ["Orden de cambio aprobada", "{n}: el cliente aprobó la orden de cambio."], change_declined: ["Orden de cambio rechazada", "{n}: el cliente rechazó la orden de cambio."],
  fix_requested: ["Se pidió una corrección", "{n}: el cliente pidió una corrección."], checked: ["Evidencia revisada", "{n}: la evidencia fue revisada."], confirmed: ["Confirmado", "{n}: el cliente confirmó las revisiones."],
  money_released: ["Pago liberado", "{n}: el dinero se capturó y se le paga con PayPal Payouts."], payout_sent: ["Pago enviado", "{n}: el pago va en camino."], payout_failed: ["El pago falló", "{n}: el pago falló y se reintentará."],
  dispute_opened: ["Disputa abierta", "{n}: se abrió una disputa."], dispute_resolved: ["Disputa resuelta", "{n}: la disputa se resolvió."], job_cancelled: ["Trabajo cancelado", "{n}: el trabajo se canceló."],
  defect_claimed: ["Defecto reclamado", "{n}: el cliente reclamó un defecto en la garantía."], materials_advance_paid: ["Anticipo de materiales pagado", "{n}: se le pagó el anticipo de materiales."], materials_advance_requested: ["Anticipo de materiales pedido", "{n}: pidió un anticipo de materiales."],
  slot_booked: ["Cita confirmada", "{n}: la cita quedó confirmada."], rescheduled: ["Cita cambiada", "{n}: la cita cambió."], reschedule_proposed: ["Propuesta de cambio de cita", "{n}: se propuso otra fecha; acéptela o recházela."], reschedule_declined: ["Cambio de cita rechazado", "{n}: se rechazó el cambio de cita."],
  feed_job: ["Trabajo nuevo en su zona", "{n}: hay un trabajo nuevo en su zona; haga una oferta."], tip_paid: ["¡Propina!", "{n}: el cliente le dejó una propina; el 100% es suyo."], tenant_note: ["Nota del inquilino", "{n}: el inquilino agregó una nota."], scope_review: ["Revisión del alcance", "{n}: el alcance fue revisado."],
};
export function newsIn(lang, e, number) {
  const c = NEWS[e.action];
  if (lang !== "es") return null;
  return c ? { title: c[0], summary: fill(c[1], { n: number || "" }), summaryEn: e.summary, lang: "es" } : { summary: e.summary, lang: "es", untranslated: true };
}
export const titleEn = (action) => String(action || "update").replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());

// ---- readiness (blockers and recommendations, by id) -----------------------------------------------------------------------
const READY = {
  paypal: "Verifique el PayPal donde le pagan, en el sitio web (Pagos). Hasta entonces no lo pueden contratar: los pagos van solo a un PayPal verificado.",
  helper_paypal: "Su ayudante necesita un PayPal verificado antes de que se pague un trabajo con él.",
  license: "Agregue su número de licencia TSBPE (M-, J-, T- o RMP- y cinco dígitos) en el sitio web.",
  insurance: "Agregue su certificado de seguro (responsabilidad general, al menos $300,000) en el sitio web.",
  signin: "Nadie ha iniciado sesión por este profesional en el sitio web: abra el enlace de registro.",
};
export function readinessIn(lang, r) {
  if (lang !== "es" || !r) return r;
  const tr = (x) => ({ ...x, say: READY[x.id] || x.say, sayEn: x.say });
  return { ...r, blockers: (r.blockers || []).map(tr), recommended: (r.recommended || []).map(tr), lang: "es" };
}

// a pro's view of a job (REST or A2A), in their language: next, waitingOn, and the inbox-style lines
export function proViewIn(lang, j, v) {
  if (lang !== "es" || !v || v.error || !j) return v;
  return { ...v, next: proNextEs(j, v.next), nextEn: v.next, waitingOn: waitingEs(v.waitingOn), lang: "es" };
}
// any pro answer: a job view, an error, readiness, news
export function proAnswerIn(lang, j, r) {
  if (lang !== "es" || !r || typeof r !== "object") return r;
  if (r.error) return errorIn(lang, r);
  let out = r;
  if (j && r.id === j.id && r.status) out = proViewIn(lang, j, r);
  if (r.blockers) out = readinessIn(lang, out);
  if (r.readiness?.blockers) out = { ...out, readiness: readinessIn(lang, r.readiness) };
  if (r.warning) out = { ...out, warningEn: r.warning, warning: "Esta oferta aún no se puede aceptar: vea readiness." };
  return out;
}
// a short money phrase for Spanish lines
export const dinero = (c) => usd(c);
// simulated email/SMS subject and text for a pro in Spanish
export const outboxIn = (lang, item) => (lang === "es" ? { ...item, subject: item.titleEs || item.subject, body: item.summaryEs || item.body } : item);
