// The platform clock. A job lives over days (a hold has a 3-day honor period and lasts 29 days), so the demo can move
// time forward: every date the platform writes or checks comes from now(), which is the real time plus the days the
// demo has skipped. Nothing moves backwards. The PayPal stand-in uses the same clock; the real sandbox keeps real time.
import { store, stateFile } from "./store.js";

const db = store(stateFile("clock"), { offsetMs: 0, log: [] });
export const clockStore = db;
export const now = () => Date.now() + db.data.offsetMs;
export const nowIso = () => new Date(now()).toISOString();
export const DAY = 864e5;
export function advance(days, why = "demo") {
  const d = Math.max(0, Math.min(400, +days || 0));
  db.data.offsetMs += d * DAY; db.data.log.push({ at: new Date().toISOString(), days: d, why }); db.save();
  return { skipped: db.data.offsetMs / DAY, now: nowIso() };
}
export const skipped = () => db.data.offsetMs / DAY;
// minutes/hours too, for the demo (a job window today)
export function advanceMs(ms, why = "demo") { const d = Math.max(0, Math.min(400 * DAY, +ms || 0)); db.data.offsetMs += d; db.data.log.push({ at: new Date().toISOString(), ms: d, why }); db.save(); return { skipped: db.data.offsetMs / DAY, now: nowIso() }; }
// tests: back to real time
// how far the demo clock is ahead of real time, and the moves since the seed (who moved it, how far)
export function clockInfo() {
  const log = db.data.log || [], from = log.map((l) => /^seed/.test(l.why || "")).lastIndexOf(true) + 1, moves = log.slice(from);
  const ahead = Math.round((db.data.offsetMs || 0) / 60e3);
  return { now: nowIso(), realNow: new Date().toISOString(), aheadMinutes: ahead, says: null, recent: moves.slice(-5).reverse().map((l) => ({ at: l.at, minutes: l.ms != null ? Math.round(l.ms / 60e3) : l.days != null ? Math.round(l.days * 1440) : null, by: l.why })) };
}
export function resetClock() { db.data.offsetMs = 0; db.data.log = []; db.save(); }
