// Notifications (PLAN §15 item 8): an in-app inbox per person (customer, pro, landlord, tenant) for every event they
// care about, plus email and SMS written to an OUTBOX only. Nothing is ever sent in this demo: every outbox item says
// "simulated: not sent". The inbox is fed by the activity log (activity.js): each entry names the people it's about,
// so a notification is never made up apart from what happened. Code writes every line (no model).
//   settings per person: which categories reach the inbox, and which also go to email / SMS (to an address or phone the
//   person gives; without one, a labelled demo address)
import crypto from "node:crypto";
import { store, stateFile } from "./store.js";
import { onActivity } from "./activity.js";
import { person } from "./people.js";
import { proOfPerson, pro as getPro } from "./pros.js";
import { langOf, newsIn } from "./i18n.js";
import { nowIso } from "./clock.js";

const db = store(stateFile("inbox"), { items: [], outbox: [], settings: {}, seq: 0 });
export const inboxStore = db;
const save = () => db.save();
export const SIMULATED = "not_sent"; // the outbox is never sent (a demo); machine status only
export const OUTBOX_LABEL = "Simulated: not sent. This demo never sends email or SMS; the text is kept here to show what would go out.";

// what each activity action is about (a person turns categories on or off)
export const CATEGORIES = {
  offers: ["offers_requested", "offer_received", "counter_sent", "counter_accept", "counter_counter", "counter_decline", "offer_declined", "offer_expired", "offer_withdrawn", "terms_changed", "tenant_pick", "negotiation_move", "negotiation_agreed", "negotiation_ended", "negotiation_stuck", "pro_asked", "reviews_checked"],
  hire: ["job_agreed", "money_held", "hold_pending", "hold_failed", "job_cancelled", "job_expired"],
  changes: ["change_requested", "change_approved", "change_declined", "change_withdrawn", "materials_advance_requested", "materials_advance_paid", "materials_advance_declined", "materials_advance_refused"],
  work: ["work_started", "checked", "fix_requested", "confirmed", "review_asked", "scope_review", "job_scoped"],
  money: ["money_released", "payout_sent", "payout_failed", "tip_paid", "tip_pending", "refund", "early_pay"],
  disputes: ["dispute_opened", "dispute_resolved", "defect_claimed", "defect_fixed", "paypal_dispute"],
  schedule: ["slot_booked", "rescheduled", "reschedule_proposed", "reschedule_declined"],
  tenancy: ["tenant_linked", "tenant_note", "landlord_decided", "tenant_invited"],
  reports: ["report_ready"],
  mandates: ["mandate_used", "mandate_refused", "mandate_issued"],
  feed: ["feed_job"],
};
const CAT_OF = Object.fromEntries(Object.entries(CATEGORIES).flatMap(([c, as]) => as.map((a) => [a, c])));
export const categoryOf = (action) => CAT_OF[action] || "other";
const TITLES = {
  offers_requested: "Offers asked for", negotiation_move: "New price proposed", negotiation_agreed: "Price agreed", negotiation_ended: "Negotiation ended", negotiation_stuck: "No price agreed yet", pro_asked: "Question sent to a pro", reviews_checked: "Reviews checked", offer_received: "New offer", counter_sent: "Counter sent", counter_accept: "Counter accepted", counter_counter: "Counter answered", counter_decline: "Counter declined", offer_declined: "Offer not chosen", offer_expired: "Offer expired", offer_withdrawn: "Offer withdrawn", terms_changed: "Terms changed", tenant_pick: "Your tenant picked an offer",
  job_agreed: "Hired", money_held: "Money held with PayPal", hold_pending: "Approve the hold in PayPal", hold_failed: "The hold failed", job_cancelled: "Job cancelled", job_expired: "Job expired",
  change_requested: "Change order to decide", change_approved: "Change order approved", change_declined: "Change order declined", change_withdrawn: "Change order withdrawn", materials_advance_requested: "Materials advance asked for", materials_advance_paid: "Materials advance paid", materials_advance_declined: "Materials advance declined", materials_advance_refused: "Materials advance refused",
  work_started: "Work started", checked: "Evidence checked", fix_requested: "Fix asked for", confirmed: "Checks confirmed", review_asked: "Expert review asked", scope_review: "Scope reviewed", job_scoped: "Job posted",
  money_released: "Payment released", payout_sent: "Payout sent", payout_failed: "Payout failed", tip_paid: "Tip sent", tip_pending: "Approve the tip in PayPal", early_pay: "Early pay",
  dispute_opened: "Dispute opened", dispute_resolved: "Dispute resolved", defect_claimed: "Defect claimed", defect_fixed: "Defect fixed",
  slot_booked: "Visit booked", rescheduled: "Visit rescheduled", reschedule_proposed: "New time proposed", reschedule_declined: "New time declined",
  tenant_linked: "Tenant linked", tenant_note: "Note from your tenant", landlord_decided: "Your landlord decided", tenant_invited: "Tenant invite made",
  report_ready: "Report ready", feed_job: "New job in your feed", mandate_used: "Mandate used", mandate_refused: "Mandate refused", mandate_issued: "Mandate issued",
};
// by default: everything in the inbox; email for what needs a decision or moves money; SMS only once a phone is given
const EMAIL_DEFAULT = ["hire", "changes", "money", "disputes", "schedule", "tenancy", "mandates"], SMS_DEFAULT = ["schedule", "money", "changes"];
export function settingsOf(personId) {
  const s = db.data.settings[personId] || {}, cats = Object.keys(CATEGORIES).concat("other"), p = person(personId);
  return {
    inApp: Object.fromEntries(cats.map((c) => [c, s.inApp?.[c] ?? true])),
    email: { on: s.email?.on ?? true, to: s.email?.to || p?.email || null, categories: s.email?.categories || EMAIL_DEFAULT, demoAddress: !(s.email?.to || p?.email) },
    sms: { on: s.sms?.on ?? !!s.sms?.to, to: s.sms?.to || null, categories: s.sms?.categories || SMS_DEFAULT },
    categories: cats, 
  };
}
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/, PHONE = (s) => { const d = String(s || "").replace(/\D/g, ""); return d.length === 10 ? `+1${d}` : d.length === 11 && d[0] === "1" ? `+${d}` : null; };
export function setSettings(personId, b = {}) {
  const allowed = ["inApp", "email", "sms"], bad = Object.keys(b || {}).filter((k) => !allowed.includes(k));
  if (bad.length) return { error: "fields", message: `Unknown field${bad.length > 1 ? "s" : ""}: ${bad.join(", ")}. Allowed: ${allowed.join(", ")}.`, unknown: bad, allowed };
  const cats = Object.keys(CATEGORIES).concat("other"), s = (db.data.settings[personId] ||= {});
  if (b.inApp) { for (const [k, v] of Object.entries(b.inApp)) { if (!cats.includes(k)) return { error: "category", message: `Categories: ${cats.join(", ")}.` }; (s.inApp ||= {})[k] = !!v; } }
  for (const ch of ["email", "sms"]) if (b[ch]) {
    const x = b[ch], o = (s[ch] ||= {});
    if (x.on != null) o.on = !!x.on;
    if (x.to !== undefined) { if (x.to === null || x.to === "") o.to = null; else if (ch === "email" ? !EMAIL.test(String(x.to)) : !PHONE(x.to)) return { error: ch === "email" ? "email" : "phone", message: ch === "email" ? "That isn't an email address." : "A US phone number: 10 digits." }; else o.to = ch === "email" ? String(x.to).slice(0, 120) : PHONE(x.to); }
    if (x.categories) { if (!Array.isArray(x.categories) || x.categories.some((c) => !cats.includes(c))) return { error: "category", message: `Categories: ${cats.join(", ")}.` }; o.categories = [...new Set(x.categories)]; }
  }
  save();
  return settingsOf(personId);
}

// other channels that relay the inbox as it happens (telegram.js)
const notifyListeners = new Set();
export const onNotify = (fn) => { notifyListeners.add(fn); return () => notifyListeners.delete(fn); };

const mask = (to, ch) => (ch === "sms" ? String(to).replace(/^(\+1)(\d{3})\d{3}(\d{4})$/, "$1 $2-•••-$3") : String(to).replace(/^(.)(.*)(@.*)$/, (m, a, b, c) => `${a}•••${c}`));
// one notification for one person, from one activity entry
function deliver(personId, e, { why = null } = {}) {
  const p = person(personId);
  if (!p) return null;
  const st = settingsOf(personId), cat = categoryOf(e.action);
  if (st.inApp[cat] === false) return null;
  const pr = p.pro ? getPro(p.pro) : proOfPerson(personId), lang = pr ? langOf(pr) : "en";
  const number = (String(e.summary || "").match(/^(DP-\d+):/) || [])[1] || null;
  const es = pr && lang === "es" ? newsIn("es", e, number) : null;
  const n = (db.data.seq = (db.data.seq || 0) + 1);
  const item = { id: `ntf_${crypto.randomBytes(5).toString("hex")}`, n, person: personId, at: e.at || nowIso(), action: e.action, category: cat,
    title: es?.title || TITLES[e.action] || e.action.replace(/_/g, " "), body: es?.summary || e.summary, ...(es ? { lang: "es", titleEn: TITLES[e.action] || e.action, bodyEn: e.summary, ...(es.untranslated ? { untranslated: true } : {}) } : {}),
    job: e.ref?.startsWith?.("job_") ? e.ref : null, number, activity: e.id, actor: e.actor || null, ...(why ? { why } : {}), read: false, readAt: null, channels: { inApp: true, email: null, sms: null } };
  for (const ch of ["email", "sms"]) {
    const c = st[ch];
    if (!c.on || !c.categories.includes(cat)) continue;
    const to = c.to || (ch === "email" ? `${personId}@inbox.done-demo.example` : null);
    if (!to) continue;
    const o = { id: `out_${crypto.randomBytes(5).toString("hex")}`, channel: ch, person: personId, to, toShown: mask(to, ch), demoAddress: ch === "email" && !c.to, at: item.at,
      subject: ch === "email" ? `VeriPay: ${item.title}${number ? ` (${number})` : ""}` : null, body: ch === "sms" ? `VeriPay: ${item.body}`.slice(0, 300) : `${item.body}\n\nOpen the job on VeriPay to see more.`, lang: item.lang || "en",
      notification: item.id, status: SIMULATED };
    db.data.outbox.push(o); item.channels[ch] = o.id;
  }
  db.data.items.push(item);
  for (const fn of notifyListeners) try { fn(item); } catch (x) { console.error("notify", x.message); }
  if (db.data.items.length > 20000) db.data.items.splice(0, db.data.items.length - 20000);
  if (db.data.outbox.length > 20000) db.data.outbox.splice(0, db.data.outbox.length - 20000);
  return item;
}
// new jobs in a pro's feed: jobs.js tells us which pros (with a person) see a job, with the miles (no import cycle)
let feedLookup = () => [];
export const setFeedLookup = (fn) => { feedLookup = fn; };
function feedNews(e) {
  if (e.action !== "offers_requested" || !e.ref?.startsWith?.("job_")) return 0;
  let n = 0;
  for (const { person: pid, pro: proId, number, title, miles, trade } of feedLookup(e.ref) || []) {
    if ((e.who || []).includes(pid)) continue;
    if (deliver(pid, { ...e, action: "feed_job", summary: `${number}: a new ${trade} job in your feed, ${miles} miles away: "${title}". Offer before ${e.actor?.kind === "agent" ? "the customer's agent" : "the customer"} hires.`, data: { ...(e.data || {}), pro: proId } }, { why: "new in your feed" })) n++;
  }
  return n;
}
// who hears about an activity entry: the people it names, plus a pro whose offer it is about (their person), never the
// person who did it themselves on the website
function recipients(e) {
  const out = new Set(e.who || []);
  if (e.data?.pro) { const pr = getPro(e.data.pro); if (pr?.person) out.add(pr.person); }
  if (e.data?.notify) for (const x of [].concat(e.data.notify)) out.add(x);
  if (e.actor?.kind === "person" && e.actor.person) out.delete(e.actor.person);
  return [...out];
}
let off = null;
export function listen() {
  if (off) return off;
  off = onActivity((e) => { try { let n = feedNews(e); for (const pid of recipients(e)) if (deliver(pid, e)) n++; if (n) save(); } catch (x) { console.error("inbox", x.message); } });
  return off;
}
listen();

export function inboxOf(personId, { unread = false, after = 0, limit = 100, category = null } = {}) {
  const all = db.data.items.filter((x) => x.person === personId), items = all.filter((x) => x.n > (+after || 0) && (!unread || !x.read) && (!category || x.category === category)).slice(-Math.max(1, Math.min(500, +limit || 100))).reverse();
  return { items, unread: all.filter((x) => !x.read).length, total: all.length, last: all.at(-1)?.n || 0, settings: settingsOf(personId) };
}
export function markRead(personId, { ids = null, all = false, read = true } = {}) {
  let n = 0;
  for (const x of db.data.items) if (x.person === personId && (all || (Array.isArray(ids) && ids.includes(x.id))) && x.read !== !!read) { x.read = !!read; x.readAt = read ? nowIso() : null; n++; }
  if (n) save();
  return { changed: n, unread: db.data.items.filter((x) => x.person === personId && !x.read).length };
}
export const outboxOf = (personId, { limit = 100 } = {}) => ({ items: db.data.outbox.filter((x) => x.person === personId).slice(-limit).reverse() });
export const allOutbox = ({ limit = 200 } = {}) => ({ items: db.data.outbox.slice(-limit).reverse().map((x) => ({ ...x, to: x.toShown })), sent: 0 });
export const _reset = () => { db.data.items = []; db.data.outbox = []; db.data.settings = {}; db.data.seq = 0; save(); };
