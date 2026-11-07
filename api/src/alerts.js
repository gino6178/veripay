// The back office's watch list: what needs a person, worked out by code from the jobs (no model).
//   hold_expiring   a hold that expires within 48 hours while work isn't done
//   honor_passed    a hold past its 3-day honor period that hasn't been renewed (the tick should have)
//   hold_pending    a hire waiting more than 24 hours for the customer to approve the hold
//   payout_stuck    a released job whose payout failed or waits for a verified PayPal
//   unbalanced      a job whose ledger doesn't add up to its capture (should never happen)
//   dispute_open    a dispute older than 48 hours
//   reused_evidence a check that found a file already used on another job
//   injection       evidence text that tried to instruct the checker
//   review_waiting  a job in review for more than 48 hours
import { now, DAY } from "./clock.js";
import { allJobs, balance, money } from "./jobs.js";
import { pro } from "./pros.js";
import { store, stateFile } from "./store.js";

const db = store(stateFile("alerts"), { acked: {} });
export const alertsStore = db;
const H = 3600e3;
export function scan() {
  const t = now(), out = [];
  const add = (j, kind, level, says, extra = {}) => { const id = `${kind}:${j.id}`; out.push({ id, kind, level, job: j.id, number: j.number, says, pro: j.agreed ? pro(j.agreed.pro)?.name : null, acked: !!db.data.acked[id], ...extra }); };
  for (const j of allJobs()) {
    const h = j.hold;
    if (h?.status === "held" && h.mode === "authorize" && ["held", "working", "submitted", "checking", "needs_fix", "review", "disputed"].includes(j.status)) {
      if (Date.parse(h.expiresAt) - t < 48 * H) add(j, "hold_expiring", "high", `Hold of ${money(h.amount).usd} expires ${h.expiresAt}.`, { at: h.expiresAt });
      if (t - Date.parse(h.createdAt) > 3 * DAY + H) add(j, "honor_passed", "medium", `Hold ${h.authorization} is past its 3-day honor period and hasn't been renewed.`);
    }
    if (j.status === "agreed" && h?.status === "pending_approval" && t - Date.parse(j.agreed.at) > 24 * H) add(j, "hold_pending", "low", "Hired, but the customer hasn't approved the hold in PayPal for a day.");
    if (["failed", "waiting_for_paypal"].includes(j.money.payout?.status)) add(j, "payout_stuck", "high", `Payout ${j.money.payout.status}: ${j.money.payout.why || ""}`.trim());
    if (j.money.ledger.length && !balance(j).ok) add(j, "unbalanced", "high", `Ledger is off by ${money(balance(j).difference).usd}.`);
    if (j.status === "disputed" && t - Date.parse(j.dispute.at) > 48 * H) add(j, "dispute_open", "medium", `Disputed since ${j.dispute.at.slice(0, 10)}: ${j.dispute.reason.slice(0, 80)}`);
    if (j.status === "review" && t - Date.parse(j.updated) > 48 * H) add(j, "review_waiting", "low", "In review for over 48 hours: the customer hasn't decided.");
    const sig = new Set(j.checks.flatMap((r) => r.checks.flatMap((c) => c.signals || [])));
    if (sig.has("reused_file")) add(j, "reused_evidence", "high", "A photo or receipt was already used on another job.");
    if (sig.has("injection")) add(j, "injection", "medium", "Evidence text tried to instruct the checker; it was ignored and the job went to review.");
  }
  const rank = { high: 0, medium: 1, low: 2 };
  return out.sort((a, b) => rank[a.level] - rank[b.level]);
}
export function ack(id) { db.data.acked[id] = new Date().toISOString(); db.save(); return { ok: true, id }; }
