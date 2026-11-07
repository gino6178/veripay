// The reconciliation agent: PayPal's record of the platform's money, checked line by line against each job's ledger,
// using the PayPal Agent Toolkit (@paypal/agent-toolkit) read-only tools on the same PayPal app (the sandbox's access
// token from paypal.js; the stand-in's answers otherwise).
//   captures   every job's capture: list_transactions (T0006), else the Captures API; PayPal's fee (fee_amount) is checked
//              against the ledger's paypal_fee line (fee_difference); payouts carry PayPal's Payouts fee (sandbox transaction search lags
//              by hours, so a young capture not listed yet is "pending", not "missing")
//   refunds    every refund line: get_refund
//   payouts    every Payouts item: the Payouts API batch (the toolkit has no Payouts tool)
// Each row is matched, missing at PayPal, an amount difference, or pending, with both sides' ids and amounts. Code makes
// every comparison; a model (if live) only writes the one-paragraph summary, and that is labelled.
import { PayPalAgentToolkit } from "@paypal/agent-toolkit/openai";
import { PayPalAPI } from "@paypal/agent-toolkit/mcp";
import { store, stateFile } from "./store.js";
import { allJobs } from "./jobs.js";
import { pp, why, usd } from "./pay/index.js";
import { chat } from "./ai.js";

const db = store(stateFile("recon"), { latest: null, history: [] });
export const reconStore = db;
const TOOLS = ["list_transactions", "get_refund"];
let definitions = [];
try { definitions = new PayPalAgentToolkit({ configuration: { actions: { transactions: { list: true }, payments: { getRefunds: true } }, context: { sandbox: true } } }).getTools().map((t) => t.function?.name).filter((n) => TOOLS.includes(n)); } catch {}
export const toolkitInfo = () => ({ package: "@paypal/agent-toolkit", tools: definitions.length ? definitions : TOOLS });
const cents = (v) => (v == null || !Number.isFinite(+v) ? null : Math.round(Math.abs(+v) * 100));
const iso = (t) => new Date(t).toISOString().replace(/\.\d{3}Z$/, "Z");

// via "paypal-mcp": the same tool names through PayPal's hosted MCP server (paypalmcp.js) instead of the bundled toolkit
export function session({ via = "toolkit" } = {}) {
  const calls = [];
  let client = null;
  async function run(name, args) {
    const t0 = Date.now();
    let j;
    try {
      if (pp().mode === "mock") j = pp().toolkit(name, args) ?? { error: { message: "no answer" } };
      else if (via === "paypal-mcp") j = await (await import("./paypalmcp.js")).call(name, args);
      else { client ||= new PayPalAPI(await pp().accessToken(), { sandbox: true }); const o = await client.run(name, args); j = typeof o === "string" ? JSON.parse(o) : o; }
    } catch (e) { j = { error: { message: why(e) } }; }
    calls.push({ tool: name, args, ok: !j?.error, ms: Date.now() - t0, via: pp().mode === "mock" ? "stand-in" : via });
    return j;
  }
  return { run, calls };
}

let running = null;
export const isRunning = () => !!running;
export const latest = () => db.data.latest;
export const history = () => db.data.history.slice(-10).reverse().map((r) => ({ at: r.at, by: r.by, counts: r.counts }));
export function run({ by = "on demand" } = {}) {
  if (running) return running;
  running = reconcile(by).finally(() => { running = null; });
  return running;
}
async function reconcile(by) {
  const s = session(), rows = [], t = Date.now();
  const end = Date.now(), start = end - 30 * 864e5;
  const listed = await s.run("list_transactions", { start_date: iso(start), end_date: iso(end), transaction_status: "S", page_size: 500, page: 1 });
  const tx = new Map((listed.transaction_details || []).map((x) => [x.transaction_info.transaction_id, x.transaction_info]));
  for (const j of allJobs()) {
    for (const l of j.money.ledger) {
      if (l.kind === "capture") {
        const p = tx.get(l.ref);
        let paypal = p ? cents(p.transaction_amount?.value) : null, via = p ? "list_transactions" : null;
        if (paypal == null) { const c = await pp().getCapture(l.ref).catch(() => null); if (c) { paypal = c.amount; via = "captures API"; } }
        const young = end - Date.parse(l.at) < 3 * 3600e3;
        // PayPal's fee on it, as Transaction Search reports it, against the paypal_fee line the capture recorded
        const oursFee = j.money.ledger.filter((y) => y.kind === "paypal_fee" && y.ref === l.ref).reduce((t, y) => t + y.amount, 0), ppFee = p ? cents(p.fee_amount?.value) : null;
        const fee = { ours: oursFee || null, paypal: ppFee, ok: ppFee == null || ppFee === oursFee };
        rows.push({ kind: "capture", job: j.number, ref: l.ref, ours: l.amount, paypal, via, fee, ...(fee.ok ? {} : { says: `PayPal's fee ${usd(ppFee)}, the ledger's ${usd(oursFee)}.` }), status: !fee.ok && paypal === l.amount ? "fee_difference" : paypal == null ? (young ? "pending" : "missing_in_paypal") : paypal === l.amount ? "matched" : "amount_difference" });
      }
      if (l.kind === "refund") {
        const r = await s.run("get_refund", { refund_id: l.ref }), paypal = r?.error ? null : cents(r.amount?.value);
        rows.push({ kind: "refund", job: j.number, ref: l.ref, ours: l.amount, paypal, via: "get_refund", status: paypal == null ? "missing_in_paypal" : paypal === l.amount ? "matched" : "amount_difference" });
      }
    }
    for (const po of (j.money.payouts || (j.money.payout ? [j.money.payout] : [])).filter((x) => x.batchId)) {
      const b = await pp().getPayout(po.batchId).catch(() => null);
      for (const it of po.items || []) {
        const x = b?.items?.find((y) => y.id === it.id);
        rows.push({ kind: "payout", job: j.number, ref: x?.itemId || po.batchId, batch: po.batchId, ours: it.amount, paypal: x?.amount ?? null, via: "payouts API", fee: x?.fee != null ? { paypal: x.fee, ok: true, note: "PayPal's Payouts fee, the platform's cost" } : null, status: !x ? "missing_in_paypal" : x.amount !== it.amount ? "amount_difference" : ["SUCCESS"].includes(x.status) ? "matched" : x.status === "PENDING" ? "pending" : x.status === "UNCLAIMED" ? "sent_unclaimed" : `paypal_${String(x.status).toLowerCase()}`, ...(x?.status === "UNCLAIMED" ? { says: "Sent and matched in amount; the receiver claims it by signing up to PayPal with that email." } : {}) });
      }
    }
  }
  const counts = rows.reduce((c, r) => ({ ...c, [r.status]: (c[r.status] || 0) + 1 }), {});
  const fees = { captures: rows.filter((r) => r.kind === "capture").reduce((t, r) => t + (r.fee?.paypal ?? r.fee?.ours ?? 0), 0), payouts: rows.filter((r) => r.kind === "payout").reduce((t, r) => t + (r.fee?.paypal || 0), 0), differences: rows.filter((r) => r.fee && !r.fee.ok).length };
  const facts = { rows: rows.length, ...counts, captured: usd(rows.filter((r) => r.kind === "capture").reduce((x, r) => x + r.ours, 0)), paypalFees: usd(fees.captures + fees.payouts) };
  const m = await chat([{ role: "system", content: "Write two sentences summarizing this payment reconciliation for a back-office reader. Use only the numbers given." }, { role: "user", content: JSON.stringify(facts) }], { timeoutMs: 4000 });
  const report = { at: new Date().toISOString(), by, ms: Date.now() - t, paypal: pp().mode, toolkit: toolkitInfo(), calls: s.calls, rows, counts, fees,
    summary: m?.source === "model" && m.text ? { text: String(m.text).slice(0, 600), source: "model" } : { text: `${rows.length} PayPal movements checked: ${Object.entries(counts).map(([k, v]) => `${v} ${k.replace(/_/g, " ")}`).join(", ") || "none yet"}.`, source: "rules" } };
  db.data.latest = report; db.data.history.push({ at: report.at, by, counts }); if (db.data.history.length > 50) db.data.history.shift(); db.save();
  return report;
}

// ---- the reconciliation AGENT ------------------------------------------------------------------------------------------
// An agent that decides which PayPal tools to call, one step at a time, within a step budget: the model (Done-Chat,
// through ai.chat) picks the next tool and its arguments from what the ledger expects and what it has seen so far;
// without a model (or when its answer isn't a valid call) the rules pick (labelled). The PayPal Agent Toolkit's
// read-only tools (list_transactions, get_refund, get_order, list_disputes, get_dispute, list_invoices, get_invoice)
// and two REST reads the toolkit lacks (get_payout_batch, get_capture). The model may also claim findings; code checks
// every claim, and every row, against the ledger: a claim code can't confirm is shown as unconfirmed, never acted on.
export const AGENT_TOOLS = {
  list_transactions: { toolkit: true, args: ["start_date", "end_date", "transaction_id"], says: "PayPal's transactions in a date range (captures T0006, refunds T1107, payouts T0000)" },
  get_refund: { toolkit: true, args: ["refund_id"], says: "one refund by id" },
  get_order: { toolkit: true, args: ["id"], says: "one order by id" },
  list_disputes: { toolkit: true, args: [], says: "the disputes on the account" },
  get_dispute: { toolkit: true, args: ["dispute_id"], says: "one dispute" },
  list_invoices: { toolkit: true, args: [], says: "the invoices sent" },
  get_invoice: { toolkit: true, args: ["invoice_id"], says: "one invoice" },
  get_payout_batch: { toolkit: false, args: ["batch_id"], says: "a Payouts batch and its items (REST: the toolkit has no Payouts tool)" },
  get_capture: { toolkit: false, args: ["capture_id"], says: "one capture (REST)" },
};
function expected() {
  const caps = [], refunds = [], batches = [], orders = [], invoices = [];
  for (const j of allJobs()) {
    for (const l of j.money.ledger) { if (l.kind === "capture") caps.push({ job: j.number, ref: l.ref, amount: l.amount, at: l.at }); if (l.kind === "refund") refunds.push({ job: j.number, ref: l.ref, amount: l.amount }); }
    for (const po of (j.money.payouts || []).filter((x) => x.batchId)) batches.push({ job: j.number, batch: po.batchId, items: (po.items || []).map((i) => ({ id: i.id, amount: i.amount })) });
    if (j.hold?.order) orders.push({ job: j.number, order: j.hold.order });
  }
  return { caps, refunds, batches, orders, invoices };
}
export async function agentRun({ by = "on demand", budget = 14, model = true } = {}) {
  const s = session(), t = Date.now(), exp = expected(), seen = { tx: new Map(), refunds: new Map(), batches: new Map(), captures: new Map(), disputes: null }, steps = [], claims = [];
  const end = Date.now(), start = end - 30 * 864e5;
  const exec = async (tool, args) => {
    if (tool === "get_payout_batch") { const t0 = Date.now(); const b = await pp().getPayout(args.batch_id).catch((e) => ({ error: { message: why(e) } })); s.calls.push({ tool, args, ok: !b?.error, ms: Date.now() - t0 }); if (!b?.error) seen.batches.set(args.batch_id, b); return b; }
    if (tool === "get_capture") { const t0 = Date.now(); const c = await pp().getCapture(args.capture_id).catch((e) => ({ error: { message: why(e) } })); s.calls.push({ tool, args, ok: !c?.error, ms: Date.now() - t0 }); if (c && !c.error) seen.captures.set(args.capture_id, c); return c; }
    const r = await s.run(tool, args);
    if (tool === "list_transactions") for (const x of r?.transaction_details || []) seen.tx.set(x.transaction_info.transaction_id, x.transaction_info);
    if (tool === "get_refund" && !r?.error) seen.refunds.set(args.refund_id, r);
    if (tool === "list_disputes" && !r?.error) seen.disputes = r.items || [];
    return r;
  };
  // the rules' plan: what's left to look at, in order
  const nextByRules = () => {
    if (!s.calls.some((c) => c.tool === "list_transactions")) return { tool: "list_transactions", args: { start_date: iso(start), end_date: iso(end) } };
    const r = exp.refunds.find((x) => !seen.refunds.has(x.ref) && !s.calls.some((c) => c.tool === "get_refund" && c.args.refund_id === x.ref)); if (r) return { tool: "get_refund", args: { refund_id: r.ref } };
    const b = exp.batches.find((x) => !seen.batches.has(x.batch) && !s.calls.some((c) => c.tool === "get_payout_batch" && c.args.batch_id === x.batch)); if (b) return { tool: "get_payout_batch", args: { batch_id: b.batch } };
    const c = exp.caps.find((x) => !seen.tx.has(x.ref) && !seen.captures.has(x.ref) && !s.calls.some((y) => y.tool === "get_capture" && y.args.capture_id === x.ref)); if (c) return { tool: "get_capture", args: { capture_id: c.ref } };
    if (!s.calls.some((y) => y.tool === "list_disputes")) return { tool: "list_disputes", args: {} };
    return null;
  };
  const brief = (r) => { if (!r || r.error) return { error: r?.error?.message || "no answer" }; if (r.transaction_details) return { transactions: r.transaction_details.length }; if (r.items && r.batchId) return { batch: r.batchId, status: r.status, items: r.items.map((i) => `${i.id} ${i.status} ${i.amount}`) }; if (r.items) return { items: r.items.length }; return { id: r.id, status: r.status, amount: r.amount?.value ?? r.amount ?? null }; };
  for (let i = 0; i < budget; i++) {
    let pick = null, chosenBy = "rules", thought = null;
    if (model) {
      const ask = [{ role: "system", content: `You reconcile a payments platform's ledger with PayPal. Each turn, answer with JSON only: {"tool": name, "args": {...}, "why": short} to call one tool, or {"done": true, "findings": [{"ref": id, "claim": "matched"|"missing"|"amount_difference"|"pending", "why": short}]} when you have looked at enough. Tools: ${Object.entries(AGENT_TOOLS).map(([k, v]) => `${k}(${v.args.join(", ")}): ${v.says}`).join("; ")}. Code checks every finding; never invent ids.` },
        { role: "user", content: JSON.stringify({ expect: { captures: exp.caps.slice(0, 20).map((c) => [c.ref, c.amount]), refunds: exp.refunds.slice(0, 20).map((r) => [r.ref, r.amount]), payoutBatches: exp.batches.slice(0, 20).map((b) => b.batch) }, steps: steps.map((x) => ({ tool: x.tool, args: x.args, result: x.result })), stepsLeft: budget - i }) }];
      const m = await chat(ask, { timeoutMs: 6000 });
      if (m?.source === "model" && m.text) {
        let o = null; try { o = JSON.parse(String(m.text).replace(/^```(json)?|```$/g, "").trim()); } catch {}
        if (o?.done) { for (const f of (Array.isArray(o.findings) ? o.findings : []).slice(0, 40)) claims.push({ ref: String(f.ref || ""), claim: String(f.claim || ""), why: String(f.why || "").slice(0, 160) }); steps.push({ n: i + 1, done: true, chosenBy: "model", why: String(o.why || "").slice(0, 160) }); break; }
        if (o?.tool && AGENT_TOOLS[o.tool]) { const args = Object.fromEntries(Object.entries(o.args || {}).filter(([k]) => AGENT_TOOLS[o.tool].args.includes(k)).map(([k, v]) => [k, String(v).slice(0, 80)])); if (o.tool === "list_transactions") { args.start_date ||= iso(start); args.end_date ||= iso(end); } pick = { tool: o.tool, args }; chosenBy = "model"; thought = String(o.why || "").slice(0, 160); }
        else thought = "the model's answer wasn't a valid tool call: the rules chose";
      }
    }
    pick ||= nextByRules();
    if (!pick) { steps.push({ n: i + 1, done: true, chosenBy: "rules", why: "nothing left to look at" }); break; }
    if (chosenBy === "model" && s.calls.some((c) => c.tool === pick.tool && JSON.stringify(c.args) === JSON.stringify(pick.args))) { const rp = nextByRules(); if (!rp) { steps.push({ n: i + 1, done: true, chosenBy: "rules", why: "the model repeated a call; nothing left" }); break; } pick = rp; chosenBy = "rules"; thought = "the model repeated a call: the rules chose"; }
    const res = await exec(pick.tool, pick.args);
    steps.push({ n: i + 1, tool: pick.tool, args: pick.args, chosenBy, why: thought, toolkit: AGENT_TOOLS[pick.tool].toolkit, result: brief(res) });
  }
  // code: every expected movement, from what the agent saw (and code's own follow-ups for what it didn't look at)
  const rows = [], follow = [];
  for (const c of exp.caps) {
    let paypal = seen.tx.has(c.ref) ? cents(seen.tx.get(c.ref).transaction_amount?.value) : seen.captures.get(c.ref)?.amount ?? null, via = seen.tx.has(c.ref) ? "list_transactions" : seen.captures.has(c.ref) ? "get_capture" : null;
    if (paypal == null) { const x = await pp().getCapture(c.ref).catch(() => null); if (x) { paypal = x.amount; via = "code follow-up: captures API"; follow.push(c.ref); } }
    const young = end - Date.parse(c.at) < 3 * 3600e3;
    rows.push({ kind: "capture", job: c.job, ref: c.ref, ours: c.amount, paypal, via, status: paypal == null ? (young ? "pending" : "missing_in_paypal") : paypal === c.amount ? "matched" : "amount_difference" });
  }
  for (const r of exp.refunds) { let x = seen.refunds.get(r.ref), via = "get_refund"; if (!x) { x = await s.run("get_refund", { refund_id: r.ref }); via = "code follow-up: get_refund"; follow.push(r.ref); } const paypal = x?.error ? null : cents(x?.amount?.value); rows.push({ kind: "refund", job: r.job, ref: r.ref, ours: r.amount, paypal, via, status: paypal == null ? "missing_in_paypal" : paypal === r.amount ? "matched" : "amount_difference" }); }
  for (const b of exp.batches) {
    let x = seen.batches.get(b.batch), via = "get_payout_batch";
    if (!x) { x = await pp().getPayout(b.batch).catch(() => null); via = "code follow-up: payouts API"; follow.push(b.batch); }
    for (const it of b.items) { const y = x?.items?.find((z) => z.id === it.id); rows.push({ kind: "payout", job: b.job, ref: y?.itemId || b.batch, batch: b.batch, ours: it.amount, paypal: y?.amount ?? null, via, status: !y ? "missing_in_paypal" : y.amount !== it.amount ? "amount_difference" : y.status === "SUCCESS" ? "matched" : y.status === "UNCLAIMED" ? "sent_unclaimed" : "pending" }); }
  }
  const verified = claims.map((c) => { const row = rows.find((r) => r.ref === c.ref || r.batch === c.ref); const want = { matched: "matched", missing: "missing_in_paypal", amount_difference: "amount_difference", pending: "pending" }[c.claim]; return { ...c, confirmedByCode: !!row && row.status === want, codeSays: row ? row.status : "no such movement in the ledger" }; });
  const counts = rows.reduce((c, r) => ({ ...c, [r.status]: (c[r.status] || 0) + 1 }), {});
  const report = { kind: "agent", at: new Date().toISOString(), by, ms: Date.now() - t, paypal: pp().mode, budget, steps, calls: s.calls, chose: { model: steps.filter((x) => x.chosenBy === "model" && x.tool).length, rules: steps.filter((x) => x.chosenBy === "rules" && x.tool).length }, claims: verified, codeFollowUps: follow, rows, counts,
    summary: { text: `The agent made ${steps.filter((x) => x.tool).length} tool calls (${steps.filter((x) => x.chosenBy === "model" && x.tool).length} chosen by the model, the rest by the rules); code checked ${rows.length} PayPal movements against the ledger: ${Object.entries(counts).map(([k, v]) => `${v} ${k.replace(/_/g, " ")}`).join(", ") || "none yet"}${verified.length ? `; the model claimed ${verified.length} findings, ${verified.filter((v) => v.confirmedByCode).length} confirmed by code` : ""}.`, source: "rules" } };
  db.data.latestAgent = report; db.save();
  return report;
}
export const latestAgent = () => db.data.latestAgent || null;
