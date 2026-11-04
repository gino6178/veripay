// Cover's clock. Insurance happens over a year (monthly premiums, a grace period, the year's giveback), so the demo
// can move Cover's time forward: every date Cover writes or checks comes from now(), which is the real time plus the
// days the demo has skipped. Nothing moves backwards. PayPal's own times (a subscription's billing) stay real.
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
