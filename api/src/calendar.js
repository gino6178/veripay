// Scheduling (PLAN §15 item 7). A pro sets when they work: weekly hours (Austin time) and blocked dates. An offer
// proposes a visit slot inside those hours and the job's window; the customer (or their agent) accepts a slot when
// they accept the offer; either side can move it later, with notice. The pro's arrival is the slot's start.
//   availability: { weekly: { mon: [["08:00","17:00"]], ..., sun: [] }, blocked: ["2026-11-26"], visitMinutes?: 120 }
// Code only: no model picks a time.
import { now } from "./clock.js";

export const TZ = "America/Chicago";
export const DAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
export const NOTICE_HOURS = 24; // a move with less notice than this is a proposal the other side accepts or declines
const HM = /^([01]\d|2[0-3]):([0-5]\d)$|^24:00$/;
const mins = (s) => (s === "24:00" ? 1440 : +s.slice(0, 2) * 60 + +s.slice(3));
const fmt = new Intl.DateTimeFormat("en-US", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23", weekday: "short" });
// an instant's Austin calendar parts
export function local(ms) {
  const p = Object.fromEntries(fmt.formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, day: p.weekday.slice(0, 3).toLowerCase(), minute: (+p.hour % 24) * 60 + +p.minute, y: +p.year, m: +p.month, d: +p.day };
}
// Austin wall time -> instant (handles the DST switch: checked twice)
export function atLocal(date, minute) {
  const [y, m, d] = date.split("-").map(Number), guess = Date.UTC(y, m - 1, d, Math.floor(minute / 60), minute % 60);
  let t = guess;
  for (let i = 0; i < 2; i++) { const l = local(t), seen = Date.UTC(l.y, l.m - 1, l.d, Math.floor(l.minute / 60), l.minute % 60); t += guess - seen; }
  return t;
}
const addDays = (date, n) => { const [y, m, d] = date.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10); };

// the demo pros' hours (fictional): plumbers 7-19 Mon-Sat, cleaners 8-17 Mon-Fri and Sat morning, handymen 8-18 Mon-Fri
export function demoAvailability(p) {
  const d = (from, to) => [[from, to]];
  const w = p.trade === "plumbing" ? { mon: d("07:00", "19:00"), tue: d("07:00", "19:00"), wed: d("07:00", "19:00"), thu: d("07:00", "19:00"), fri: d("07:00", "19:00"), sat: d("08:00", "14:00"), sun: [] }
    : p.trade === "cleaning" ? { mon: d("08:00", "17:00"), tue: d("08:00", "17:00"), wed: d("08:00", "17:00"), thu: d("08:00", "17:00"), fri: d("08:00", "17:00"), sat: d("09:00", "13:00"), sun: [] }
    : { mon: d("08:00", "18:00"), tue: d("08:00", "18:00"), wed: d("08:00", "18:00"), thu: d("08:00", "18:00"), fri: d("08:00", "18:00"), sat: [], sun: [] };
  return { weekly: w, blocked: [], visitMinutes: null, source: "demo hours (fictional)", onCall: true, onCallSays: "Demo pros also take same-day calls within minutes for the demo, even outside these hours; such a slot is labelled \"demo on-call\"." };
}
// a pro's hours as they sent them, checked: 400-style { error } or the clean availability
export function cleanAvailability(b = {}) {
  const allowed = ["weekly", "blocked", "visitMinutes"], bad = Object.keys(b || {}).filter((k) => !allowed.includes(k));
  if (bad.length) return { error: "fields", message: `Unknown field${bad.length > 1 ? "s" : ""}: ${bad.join(", ")}. Allowed: ${allowed.join(", ")}.`, unknown: bad, allowed };
  const weekly = {};
  for (const day of DAYS) {
    const v = b.weekly?.[day] ?? [];
    if (!Array.isArray(v)) return { error: "weekly", message: `weekly.${day} is a list of ["HH:MM", "HH:MM"] pairs (Austin time).` };
    weekly[day] = [];
    for (const r of v.slice(0, 4)) {
      const [f, t] = Array.isArray(r) ? r : [r?.from, r?.to];
      if (!HM.test(String(f)) || !HM.test(String(t)) || mins(t) <= mins(f)) return { error: "weekly", message: `weekly.${day}: each range is ["HH:MM", "HH:MM"], the end after the start (Austin time).` };
      weekly[day].push([f, t]);
    }
    weekly[day].sort((x, y) => mins(x[0]) - mins(y[0]));
  }
  if (b.weekly && Object.keys(b.weekly).some((k) => !DAYS.includes(k))) return { error: "weekly", message: `weekly's days are ${DAYS.join(", ")}.` };
  const blocked = (Array.isArray(b.blocked) ? b.blocked : []).map(String);
  if (blocked.some((x) => !/^\d{4}-\d{2}-\d{2}$/.test(x))) return { error: "blocked", message: "blocked is a list of dates, YYYY-MM-DD (Austin)." };
  const vm = b.visitMinutes == null ? null : Math.round(+b.visitMinutes);
  if (vm != null && !(vm >= 30 && vm <= 720)) return { error: "visitMinutes", message: "visitMinutes is 30 to 720." };
  return { weekly, blocked: [...new Set(blocked)].sort().slice(0, 120), visitMinutes: vm, source: "the pro", at: new Date(now()).toISOString() };
}
export const availabilityOf = (p) => p?.availability || (p?.demo ? demoAvailability(p) : null);
// how long a visit takes: the pro's setting, else the scope's hours estimate, at least an hour, rounded to 30 minutes
export const visitMinutes = (p, j) => availabilityOf(p)?.visitMinutes || Math.max(60, Math.min(600, Math.ceil(((j?.scope?.estimate?.hours ?? 1.5) * 60) / 30) * 30));
// is [from, from + minutes) inside one of the pro's ranges that day, and the day not blocked?
export function inHours(av, from, minutes) {
  if (!av) return true;
  const l = local(from), end = l.minute + minutes;
  if (av.blocked?.includes(l.date)) return false;
  return (av.weekly?.[l.day] || []).some(([f, t]) => l.minute >= mins(f) && end <= mins(t));
}
// the first `count` open slots of `minutes` inside the hours, from `earliest`, all within [winFrom, winTo]; every 30 minutes
export function freeSlots(av, { earliest = now(), winFrom = null, winTo = null, minutes = 120, count = 3, maxDays = 21, gapMinutes = 120 } = {}) {
  if (!av) return [];
  const start = Math.max(earliest, winFrom ? Date.parse(winFrom) : 0), end = winTo ? Date.parse(winTo) : start + maxDays * 864e5, out = [];
  let date = local(start).date;
  for (let i = 0; i < maxDays + 1 && out.length < count; i++, date = addDays(date, 1)) {
    if (av.blocked?.includes(date)) continue;
    const day = DAYS[new Date(`${date}T12:00:00Z`).getUTCDay()];
    for (const [f, t] of av.weekly?.[day] || []) {
      for (let m = Math.ceil(mins(f) / 30) * 30; m + minutes <= mins(t) && out.length < count; m += 30) {
        const at = atLocal(date, m);
        if (at < start || at + minutes * 60e3 > end) continue;
        if (out.length && at - Date.parse(out.at(-1).from) < gapMinutes * 60e3) continue;
        out.push(slot(at, minutes, "availability"));
      }
    }
  }
  return out;
}
export const slot = (from, minutes, source, extra = {}) => ({ from: new Date(from).toISOString(), to: new Date(from + minutes * 60e3).toISOString(), minutes, source, ...extra });
// the slots an offer proposes. arrival: when the pro can come at the earliest (the quote's)
//   fast (a demo pro coming within minutes): that time, inside the hours or labelled "demo on-call"; then later options
export function proposeSlots(p, j, { arrival = null, fast = false } = {}) {
  const av = availabilityOf(p), minutes = visitMinutes(p, j), win = j.scope?.window || {}, earliest = Date.parse(arrival || "") || now();
  if (!av) return arrival ? { slots: [slot(earliest, minutes, "the pro's arrival (no hours set)")], minutes } : { slots: [], minutes };
  const later = freeSlots(av, { earliest, winFrom: win.from, winTo: win.to, minutes, count: 3 });
  if (fast && arrival) {
    const first = inHours(av, earliest, minutes) ? slot(earliest, minutes, "availability") : slot(earliest, minutes, "demo on-call", { onCall: true, says: "Outside the pro's weekly hours: a demo on-call visit (demo only)." });
    return { slots: [first, ...later.filter((s) => Date.parse(s.from) - earliest >= 120 * 60e3)].slice(0, 3), minutes };
  }
  return { slots: later, minutes };
}
// is this slot one the pro can do, inside the job's window? { ok } or { error, message }
export function checkSlot(p, j, from, { minutes = null, outsideWindowOk = false } = {}) {
  const t = Date.parse(from || "");
  if (!Number.isFinite(t)) return { error: "slot", message: "slot.from is an ISO time." };
  const av = availabilityOf(p), m = minutes || visitMinutes(p, j), win = j.scope?.window || {};
  if (t < now() - 5 * 60e3) return { error: "slot", message: "That time has passed." };
  if (!outsideWindowOk && ((win.from && t < Date.parse(win.from) - 60e3) || (win.to && t + m * 60e3 > Date.parse(win.to)))) return { error: "slot", message: `That slot isn't inside the job's window (${win.from} to ${win.to}).`, window: win };
  if (av && !inHours(av, t, m)) return { error: "slot", message: `That isn't inside ${p.name}'s hours (Austin time) or falls on a blocked date.`, hours: av.weekly, blocked: av.blocked, next: freeSlots(av, { earliest: t, winFrom: outsideWindowOk ? null : win.from, winTo: outsideWindowOk ? null : win.to, minutes: m, count: 3 }) };
  return { ok: true, slot: slot(t, m, av ? "availability" : "the pro's own time (no hours set)") };
}
// in words, for the pro's profile
export function hoursText(av) {
  if (!av) return "No hours set.";
  const cap = (d) => d[0].toUpperCase() + d.slice(1);
  return DAYS.slice(1).concat("sun").map((d) => `${cap(d)} ${(av.weekly?.[d] || []).map(([f, t]) => `${f}-${t}`).join(", ") || "closed"}`).join("; ") + (av.blocked?.length ? `; closed ${av.blocked.join(", ")}` : "");
}
