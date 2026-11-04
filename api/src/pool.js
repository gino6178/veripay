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
  animals: { zh: "流浪動物救援", en: "Animal rescue and shelters", email: "cause-animals@cover-demo.example" },
  kids: { zh: "兒童教育", en: "Schooling for kids who need it most", email: "cause-kids@cover-demo.example" },
  ocean: { zh: "海洋與海岸保育", en: "Protecting oceans and coasts", email: "cause-ocean@cover-demo.example" },
  disaster: { zh: "颶風、野火與地震災後重建", en: "Rebuilding after hurricanes, wildfires and earthquakes", email: "cause-disaster@cover-demo.example" },
  hunger: { zh: "食物銀行", en: "Food banks", email: "cause-hunger@cover-demo.example" },
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
  // ---- BEGIN partner commission (partners.js): a partner's share of a premium it sold, paid out of Cover's fee; the
  // claims pool never pays it
  else if (kind === "commission") fee = -amount;
  // ---- END partner commission
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

// ---- giving to several causes -------------------------------------------------------------------------------------
// A person may split their giveback across causes ({ animals: 50, disaster: 50 }, shares adding up to 100). Then
// every premium, refund and claim of theirs is split across those causes' pools in the same shares, to the cent (the
// largest remainders take the odd cents), so each pool's leftover at the year's close is exactly theirs to give.
export function causesOf(input, fallback = DEFAULT_CAUSE) {
  let m = {};
  if (typeof input === "string" && CAUSES[input]) m = { [input]: 100 };
  else if (Array.isArray(input)) for (const x of input) { const c = x?.cause || x?.id; if (CAUSES[c]) m[c] = (m[c] || 0) + Math.round(+x.share || +x.pct || 0); }
  else if (input && typeof input === "object") for (const [c, v] of Object.entries(input)) if (CAUSES[c] && +v > 0) m[c] = Math.round(+v);
  const total = Object.values(m).reduce((t, v) => t + v, 0);
  if (!total) return { [CAUSES[fallback] ? fallback : DEFAULT_CAUSE]: 100 };
  // shares that don't add up to 100 are scaled to it
  if (total !== 100) { const parts = split(100, Object.fromEntries(Object.entries(m).map(([c, v]) => [c, v * 100 / total]))); m = Object.fromEntries(parts.filter(([, v]) => v > 0)); }
  return m;
}
export const checkCauses = (input) => {
  if (input == null) return null;
  const bad = (typeof input === "string" ? [input] : Array.isArray(input) ? input.map((x) => x?.cause || x?.id) : Object.keys(input)).filter((c) => !CAUSES[c]);
  return bad.length ? `unknown cause${bad.length > 1 ? "s" : ""}: ${bad.join(", ")}; causes are ${Object.keys(CAUSES).join(", ")}` : null;
};
export function split(amount, shares) {
  const entries = Object.entries(shares), total = entries.reduce((t, [, v]) => t + v, 0) || 1;
  const raw = entries.map(([c, v]) => [c, (amount * v) / total]), floor = raw.map(([c, v]) => [c, Math.floor(v)]);
  let left = amount - floor.reduce((t, [, v]) => t + v, 0);
  const order = raw.map(([, v], i) => [v - Math.floor(v), i]).sort((a, b) => b[0] - a[0]);
  for (const [, i] of order) { if (left <= 0) break; floor[i][1]++; left--; }
  return floor;
}
// post one movement split across a policy's causes
export function postSplit({ causes, amount, ...rest }) {
  return split(amount, causesOf(causes)).filter(([, v]) => v > 0).map(([cause, v]) => post({ ...rest, cause, amount: v }));
}
