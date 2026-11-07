// The pro's earnings dashboard (PLAN §16 item 4): what they earned, what it cost them, how fast they were paid, how
// often a check sent work back, their ratings, materials advances and tips, with a monthly series for AG Charts and one
// row per job for AG Grid. Every figure comes from the jobs' ledgers (the same lines the books export uses), in cents.
import * as J from "./jobs.js";
import { usd } from "./pay/index.js";

const TZ = "America/Chicago";
const monthOf = (iso) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit" }).format(new Date(iso)).slice(0, 7);
const sum = (L, k, f = () => true) => L.filter((l) => l.kind === k && f(l)).reduce((t, l) => t + l.amount, 0);
const median = (a) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y), m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2); };
const m$ = (c) => ({ cents: c, usd: usd(c) });

export function dashboard(proId, { months = 12, from = null, to = null } = {}) {
  const jobs = J.allJobs().filter((j) => j.agreed?.pro === proId);
  const rows = jobs.map((j) => {
    const L = j.money?.ledger || [], paid = ["released", "resolved"].includes(j.status) && (j.money?.split?.release || 0) > 0;
    const gross = sum(L, "capture") - sum(L, "refund"), fee = sum(L, "platform_fee"), early = sum(L, "early_pay_fee");
    const toPro = sum(L, "pro_payout") + sum(L, "retainage_paid"), materials = sum(L, "materials_payout", (l) => l.to !== "supplier"), helper = sum(L, "helper_payout"), tips = sum(L, "tip_payout");
    const firstSubmit = j.submissions?.[0]?.at || null, lastSubmit = j.submissions?.at(-1)?.at || null;
    const minutesToPaid = paid && lastSubmit && j.paidAt ? Math.max(0, Math.round((Date.parse(j.paidAt) - Date.parse(lastSubmit)) / 60e3)) : null;
    const fixRounds = (j.checks || []).filter((r) => r.kind !== "defect" && r.decision === "needs_fix").length;
    return { job: j.id, number: j.number, title: j.scope?.title || null, trade: j.scope?.trade || null, zip: j.address?.zip, status: j.status, agreedAt: j.agreed.at, paidAt: j.paidAt || null, month: monthOf(j.paidAt || j.agreed.at),
      price: j.agreed.price, gross, fee, earlyPayFee: early, toPro, helper, materials, tips, net: toPro + materials + tips, refunded: sum(L, "refund"), checked: (j.checks || []).filter((r) => r.kind !== "defect").length > 0,
      fixRounds, sentBack: fixRounds > 0, minutesToPaid, firstSubmit, rating: j.rating?.stars ?? null, disputed: !!j.dispute, paid };
  }).filter((r) => (!from || r.month >= from) && (!to || r.month <= to)).sort((a, b) => String(b.paidAt || b.agreedAt).localeCompare(String(a.paidAt || a.agreedAt)));
  const paidRows = rows.filter((r) => r.paid), checked = rows.filter((r) => r.checked), rated = rows.filter((r) => r.rating != null), ttp = paidRows.map((r) => r.minutesToPaid).filter((x) => x != null);
  const tot = (k) => rows.reduce((t, r) => t + (r[k] || 0), 0);
  // the monthly series: the last `months` calendar months (Austin), oldest first, empty months included
  const now = new Date(), series = [];
  for (let i = Math.max(1, Math.min(36, +months || 12)) - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 15)), m = d.toISOString().slice(0, 7), rs = rows.filter((r) => r.month === m);
    series.push({ month: m, jobs: rs.length, paidJobs: rs.filter((r) => r.paid).length, gross: rs.reduce((t, r) => t + r.gross, 0), fees: rs.reduce((t, r) => t + r.fee + r.earlyPayFee, 0), net: rs.reduce((t, r) => t + r.net, 0), tips: rs.reduce((t, r) => t + r.tips, 0), materials: rs.reduce((t, r) => t + r.materials, 0), medianMinutesToPaid: median(rs.map((r) => r.minutesToPaid).filter((x) => x != null)) });
  }
  return {
    pro: proId, currency: "USD", amountsIn: "cents (each total also as money)",
    totals: { jobs: rows.length, paidJobs: paidRows.length, gross: m$(tot("gross")), fees: m$(tot("fee")), earlyPayFees: m$(tot("earlyPayFee")), net: m$(tot("net")), toPro: m$(tot("toPro")), helpers: m$(tot("helper")), materialsAdvances: m$(tot("materials")), tips: m$(tot("tips")), refunded: m$(tot("refunded")), feeRate: J.FEE_RATE },
    timeToPaid: { medianMinutes: median(ttp), meanMinutes: ttp.length ? Math.round(ttp.reduce((a, b) => a + b, 0) / ttp.length) : null, n: ttp.length, says: "From the last evidence sent to the capture and payout, per paid job." },
    fixRate: { rate: checked.length ? +(checked.filter((r) => r.sentBack).length / checked.length).toFixed(3) : null, sentBack: checked.filter((r) => r.sentBack).length, checked: checked.length, says: "Jobs where at least one check round asked for a fix, of the jobs that were checked." },
    ratings: { mean: rated.length ? +(rated.reduce((t, r) => t + r.rating, 0) / rated.length).toFixed(2) : null, n: rated.length, byStars: Object.fromEntries([1, 2, 3, 4, 5].map((s) => [s, rated.filter((r) => r.rating === s).length])) },
    disputes: rows.filter((r) => r.disputed).length,
    monthly: series,
    rows,
    columns: ["number", "title", "trade", "zip", "status", "month", "price", "gross", "fee", "earlyPayFee", "toPro", "helper", "materials", "tips", "net", "minutesToPaid", "fixRounds", "rating"],
    export: { csv: "/api/pro/dashboard.csv", books: "/api/pro/books.csv" },
    label: "From the jobs' ledgers, by code.",
  };
}
const cell = (v) => { const s = String(v ?? ""); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
export function dashboardCsv(d) {
  const money = new Set(["price", "gross", "fee", "earlyPayFee", "toPro", "helper", "materials", "tips", "net"]);
  return [d.columns.join(","), ...d.rows.map((r) => d.columns.map((c) => cell(money.has(c) ? (r[c] / 100).toFixed(2) : r[c])).join(","))].join("\n") + "\n";
}
