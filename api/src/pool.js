// Where every dollar is, by cause. Each person picks a cause; everyone who picked the same cause shares one claims
// pool, as Lemonade groups them. A premium splits at once: 20% to Cover (the fee), 80% into the person's cause pool.
// Claims and the reinsurance are paid from the pool. When the year closes, what is left in a pool is given to its
// cause with PayPal Payouts (giveback.js), so Cover never gains from paying less in claims.
// Every movement is one line in this ledger (integer cents), so the transparency page and the carrier's back office
// are counted from it, never estimated.
import { store, stateFile } from "./store.js";
import { nowIso } from "./clock.js";

// The causes. Their PayPal addresses are sandbox accounts standing in for the real organisations a live Cover would
// partner with: the names say what they do, not who they are.
export const CAUSES = {
  animals: { zh: "流浪動物救援", en: "Rescuing stray animals", email: "cause-animals@cover-demo.example" },
  kids: { zh: "偏鄉兒童教育", en: "Schooling for children in remote areas", email: "cause-kids@cover-demo.example" },
  ocean: { zh: "海洋與海岸保育", en: "Protecting the ocean and coast", email: "cause-ocean@cover-demo.example" },
  disaster: { zh: "颱風地震災後重建", en: "Rebuilding after typhoons and earthquakes", email: "cause-disaster@cover-demo.example" },
  elders: { zh: "獨居長者陪伴", en: "Company for elders living alone", email: "cause-elders@cover-demo.example" },
};
export const DEFAULT_CAUSE = "disaster";
export const FEE = 0.2;

const db = store(stateFile("ledger"), { lines: [], year: 1, closed: [] });
export const ledgerStore = db;

// kind: premium | refund | claim | reinsurance | recovery | giveback | adjust
export function post({ kind, cause, amount, policy = null, claim = null, product = null, ref = null, note = null }) {
  const c = CAUSES[cause] ? cause : DEFAULT_CAUSE;
  let fee = 0, pool = 0;
  if (kind === "premium") { fee = Math.round(amount * FEE); pool = amount - fee; }
  else if (kind === "refund") { fee = -Math.round(amount * FEE); pool = -(amount + fee); }
  else if (["claim", "reinsurance", "giveback"].includes(kind)) pool = -amount;
  else if (kind === "recovery") pool = amount;
  else if (kind === "adjust") pool = amount;
  const line = { n: db.data.lines.length + 1, at: nowIso(), year: db.data.year, kind, cause: c, amount, fee, pool, policy, claim, product, ref, note };
  db.data.lines.push(line); db.save();
  return line;
}

// One cause's pool this year: what came in, what went out, what is left
export function poolOf(cause, year = db.data.year) {
  const t = { cause, year, premiums: 0, refunds: 0, fees: 0, claims: 0, reinsurance: 0, recoveries: 0, giveback: 0, balance: 0, policies: new Set(), claimCount: 0 };
  for (const l of db.data.lines) {
    if (l.cause !== cause || l.year !== year) continue;
    if (l.kind === "premium") t.premiums += l.amount; if (l.kind === "refund") t.refunds += l.amount;
    if (l.kind === "claim") { t.claims += l.amount; t.claimCount++; } if (l.kind === "reinsurance") t.reinsurance += l.amount;
    if (l.kind === "recovery") t.recoveries += l.amount; if (l.kind === "giveback") t.giveback += l.amount;
    t.fees += l.fee; t.balance += l.pool; if (l.policy) t.policies.add(l.policy);
  }
  return { ...t, policies: t.policies.size };
}
export const pools = (year = db.data.year) => Object.keys(CAUSES).map((c) => ({ ...poolOf(c, year), name: CAUSES[c] }));
export const lines = (filter = {}) => db.data.lines.filter((l) => Object.entries(filter).every(([k, v]) => l[k] === v));
export const year = () => db.data.year;
export function closeYear() { db.data.closed.push({ year: db.data.year, at: nowIso() }); db.data.year += 1; db.save(); return db.data.year; }
// money a policy has paid in and been refunded, for working out what a cancellation gives back
export function paidBy(policy) { let paid = 0; for (const l of db.data.lines) if (l.policy === policy) { if (l.kind === "premium") paid += l.amount; if (l.kind === "refund") paid -= l.amount; } return paid; }
