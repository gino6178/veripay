// Business insights: PayPal's get_merchant_insights (Agent Toolkit / PayPal's MCP server) for SALES or ORDERS by
// DAILY / WEEKLY / MONTHLY. PayPal answers "not supported in sandbox mode" (checked 2026-11-07, both paths), so when
// PayPal has no answer the same figures are computed by code from VeriPay's own ledger, and the answer says which.
import { session } from "./recon.js";
import { allJobs } from "./jobs.js";
import { all as allInvoices } from "./invoices.js";
import { all as allPlans } from "./plans.js";
import { pp } from "./pay/index.js";

const TYPES = ["SALES", "ORDERS"], INTERVALS = ["DAILY", "WEEKLY", "MONTHLY"];
const bucket = (t, interval) => {
  const d = new Date(t);
  if (interval === "MONTHLY") return d.toISOString().slice(0, 7);
  if (interval === "WEEKLY") { const m = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - ((d.getUTCDay() + 6) % 7))); return m.toISOString().slice(0, 10); }
  return d.toISOString().slice(0, 10);
};
// what PayPal received for the platform: captures (sales), paid invoices and plan months; an order is one of them
function fromLedger(start, end, interval) {
  const rows = [];
  for (const j of allJobs()) for (const l of j.money.ledger) if (l.kind === "capture") rows.push({ at: l.at, amount: l.amount });
  for (const v of allInvoices()) for (const l of v.money.ledger) if (l.kind === "invoice_paid") rows.push({ at: l.at, amount: l.amount });
  for (const p of allPlans()) for (const c of p.cycles) rows.push({ at: c.at, amount: c.amount });
  const s = Date.parse(start), e = Date.parse(end) + 864e5, by = new Map();
  for (const r of rows.filter((x) => Date.parse(x.at) >= s && Date.parse(x.at) < e)) { const k = bucket(r.at, interval), b = by.get(k) || { period: k, sales: 0, orders: 0 }; b.sales += r.amount; b.orders += 1; by.set(k, b); }
  return [...by.values()].sort((a, b) => a.period.localeCompare(b.period));
}
export async function insights({ type = "SALES", interval = "WEEKLY", start, end, via = "toolkit" } = {}) {
  const T = TYPES.includes(String(type).toUpperCase()) ? String(type).toUpperCase() : "SALES", I = INTERVALS.includes(String(interval).toUpperCase()) ? String(interval).toUpperCase() : "WEEKLY";
  const e = /^\d{4}-\d{2}-\d{2}$/.test(end || "") ? end : new Date().toISOString().slice(0, 10), s0 = /^\d{4}-\d{2}-\d{2}$/.test(start || "") ? start : new Date(Date.parse(e) - 90 * 864e5).toISOString().slice(0, 10);
  let paypal = null, paypalSays = null;
  if (pp().mode !== "mock") {
    const ss = session({ via }), r = await ss.run("get_merchant_insights", { start_date: s0, end_date: e, insight_type: T, time_interval: I });
    if (r?.error) paypalSays = r.error.message; else paypal = r;
  } else paypalSays = "The stand-in has no merchant insights.";
  const series = fromLedger(s0, e, I).map((b) => ({ period: b.period, value: T === "SALES" ? b.sales : b.orders }));
  return { type: T, interval: I, start: s0, end: e, source: paypal ? "paypal" : "ledger", paypal, paypalSays,
    series: paypal ? null : series, unit: T === "SALES" ? "cents" : "count",
    says: paypal ? "PayPal's merchant insights (get_merchant_insights)." : `Computed by code from VeriPay's ledger (captures, paid invoices, plan months), because PayPal said: ${paypalSays}` };
}
