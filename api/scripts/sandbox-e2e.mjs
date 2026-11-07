// The whole app against PayPal's real sandbox, in memory (no state written), on a free local port:
//   job 1: the judges' tour: hire (authorize with the sandbox test card, saved to the vault) -> change order bigger than
//          the buffer (re-hold on the vaulted card, old hold voided) -> evidence -> checks -> capture -> Payouts batch
//   job 2: hired on the saved card (merchant-initiated authorize), disputed, staff settle part and part: capture,
//          partial refund, Payouts batch for the released part
//   job 3: hired and cancelled: the hold is voided
//   job 4: job 1 escalated to PayPal Disputes (the record; sync asks PayPal for disputes on the capture)
//   job 5: a repeat visit of job 1 (re-held on the vaulted card, paid when its own checks pass)
//   invoice: a pro's off-platform job, checked, then sent with PayPal Invoicing
//   then the reconciliation agent (Agent Toolkit list_transactions / get_refund, Payouts API)
// Needs api/.env (PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET, PAYPAL_TEST_CARD=1). Writes ids and statuses only.
// Usage: node scripts/sandbox-e2e.mjs [--json out.json]
process.env.DONE_STATE_DIR = "memory";
process.env.DONE_NO_LISTEN = "1";
process.env.RECON_MS = "0";
const fs = await import("node:fs");
const { app } = await import("../src/server.js");
const { pp } = await import("../src/pay/index.js");
if (pp().mode !== "sandbox") { console.error("No sandbox keys in api/.env (or PAYPAL_MODE=mock): this script runs against the real sandbox only."); process.exit(1); }
const srv = app.listen(0), base = `http://127.0.0.1:${srv.address().port}`;
let ck = "";
const call = async (method, p, body) => {
  const r = await fetch(base + p, { method, headers: { "content-type": "application/json", cookie: ck }, body: body ? JSON.stringify(body) : undefined });
  for (const c of r.headers.getSetCookie?.() || []) ck = [...ck.split("; ").filter((x) => x && !x.startsWith(c.split("=")[0])), c.split(";")[0]].join("; ");
  return { s: r.status, j: await r.json().catch(() => null) };
};
const out = { at: new Date().toISOString(), paypal: "sandbox", jobs: [] };
const brief = (j) => ({ number: j.number, status: j.status, flow: j.flow, hold: j.hold && { mode: j.hold.mode, status: j.hold.status, amount: j.hold.amount?.usd, order: j.hold.paypalOrder, authorization: j.hold.authorization, capture: j.hold.capture, history: j.hold.history.map((h) => `${h.event}${h.why ? `: ${h.why}` : ""}`) },
  due: j.due?.usd, checks: j.lastCheck && { decision: j.lastCheck.decision, checker: j.lastCheck.checker, verdicts: j.lastCheck.checks.map((c) => `${c.id}:${c.verdict}`), by: j.lastCheck.checks.map((c) => `${c.id}: ${c.by || c.label || "?"} (${String(c.reason || "").slice(0, 120)})`), decidedFrom: j.lastCheck.decidedFrom?.label || null },
  money: { captured: j.money.captured.usd, refunded: j.money.refunded.usd, paypalFee: j.money.paypalFee.usd, split: j.money.split && Object.fromEntries(Object.entries(j.money.split).map(([k, v]) => [k, v.usd])), balanced: j.money.balanced, payout: j.money.payout, ledger: j.money.ledger.map((l) => `${l.kind} ${l.amount.usd} ${l.ref || ""}`.trim()) },
  ...(j.error ? { error: j.error, message: j.message } : {}) });
const log = (label, r) => { if (!r.j?.money) { out.jobs.push({ label, error: r.j?.error || "no job", message: r.j?.message || null, http: r.s }); console.log(`
== ${label}: HTTP ${r.s} ${r.j?.error}: ${r.j?.message}`); return r.j; } const b = brief(r.j); out.jobs.push({ label, ...b }); console.log(`\n== ${label}: ${b.status} (HTTP ${r.s})`, JSON.stringify(b, null, 1)); return r.j; };

try {
  let one = await call("POST", "/api/demo/tour", { step: "all" });
  // the tour stops when the checks didn’t all pass (the capture guard): record the job as it stands, with each verdict
  if (one.j?.error && one.j?.job) { out.tourStopped = { error: one.j.error, message: one.j.message }; one = { s: one.s, j: (await call("GET", `/api/jobs/${one.j.job}`)).j }; }
  log("tour: hire, change order, evidence, paid", one);
  const t2 = await call("POST", "/api/demo/tour", { step: "start", text: "Bathroom faucet drips, fix it this week, $220 max." });
  let j2 = (await call("POST", "/api/demo/tour", { step: "hire", job: t2.j.id })).j;
  await call("POST", "/api/demo/tour", { step: "start_work", job: j2.id });
  await call("POST", `/api/jobs/${j2.id}/dispute`, { reason: "Only one of the two faucets was fixed." });
  await call("POST", "/api/auth/staff", {});
  const due = (await call("GET", `/api/jobs/${j2.id}`)).j.due.cents;
  log("dispute settled part and part", await call("POST", `/api/staff/disputes/${j2.id}/resolve`, { outcome: "partial", release: Math.round(due * 0.6) / 100, note: "half the work, by the evidence" }));
  const t3 = await call("POST", "/api/demo/tour", { step: "start", text: "Toilet keeps running, fix it this week, $200 max." });
  await call("POST", "/api/demo/tour", { step: "hire", job: t3.j.id });
  log("hired then cancelled: hold voided", await call("POST", `/api/jobs/${t3.j.id}/cancel`, { reason: "fixed it myself" }));
  const esc = await call("POST", `/api/jobs/${one.j.id}/escalate`, { reason: "The faucet drips again a week later." });
  const sync = await call("POST", `/api/staff/jobs/${one.j.id}/paypal-dispute/sync`);
  out.dispute = { escalate: { s: esc.s, status: esc.j?.status, note: esc.j?.sandboxNote || esc.j?.message }, sync: { s: sync.s, disputes: sync.j?.disputes, error: sync.j?.message } };
  console.log("\n== PayPal dispute", JSON.stringify(out.dispute, null, 1));
  const rep = await call("POST", `/api/jobs/${one.j.id}/repeat`, { everyDays: 14, visits: 2, firstInDays: 0 });
  const v = await call("POST", `/api/schedules/${rep.j.id}/run-now`);
  let vj = v.j;
  if (vj?.id) { await call("POST", "/api/demo/tour", { step: "evidence", job: vj.id }); vj = (await call("POST", "/api/demo/tour", { step: "release", job: vj.id })).j; if (vj?.error) vj = (await call("GET", `/api/jobs/${v.j.id}`)).j; }
  if (vj?.id) log("repeat visit (re-held on the vaulted card)", { s: v.s, j: vj }); else out.repeat = { s: v.s, error: v.j };
  const pro = (() => { let c2 = ""; return async (m, p, b) => { const r = await fetch(base + p, { method: m, headers: { "content-type": "application/json", cookie: c2 }, body: b ? JSON.stringify(b) : undefined }); for (const c of r.headers.getSetCookie?.() || []) c2 = c.split(";")[0]; return { s: r.status, j: await r.json().catch(() => null) }; }; })();
  await pro("POST", "/api/auth/demo", { as: "pro", pro: "barton-creek-plumbing", pin: process.env.DONE_DEMO_PRO_PIN || "8642" });
  const inv = await pro("POST", "/api/pro/invoices", { customer: { name: "Off-platform client (demo)", email: "client-demo@done-demo.example" }, title: "Replace a kitchen faucet cartridge", text: "Kitchen faucet drips, replace the cartridge", amount: 165, zip: "78704", checks: [{ id: "c1", what: "Photo of the new cartridge installed", evidence: "photo" }, { id: "c2", what: "Note naming the part replaced", evidence: "note" }] });
  const { withExif } = await import("../src/evidence.js");
  const img = withExif(fs.readFileSync(new URL("../demo-assets/faucet-installed.jpg", import.meta.url)), { taken: new Date().toISOString(), lat: 30.2431, lng: -97.7655 });
  const sent = await pro("POST", `/api/pro/invoices/${inv.j.id}/evidence`, { items: [{ kind: "photo", checkId: "c1", dataUrl: `data:image/jpeg;base64,${img.toString("base64")}` }, { kind: "note", checkId: "c2", text: "Replaced the Moen 1225 cartridge, tested 10 minutes, no drips." }], submit: true });
  let invOut = sent.j;
  if (invOut?.status === "review") { await call("POST", "/api/auth/staff", {}); invOut = (await call("POST", `/api/staff/invoices/${inv.j.id}/review`, { approve: true, note: "checked by staff (no model serving)" })).j; }
  out.invoice = { s: sent.s, number: invOut?.number, status: invOut?.status, decision: sent.j?.lastCheck?.decision, checker: sent.j?.lastCheck?.checker, paypal: invOut?.paypal, sentBecause: invOut?.sentBecause, error: invOut?.message };
  console.log("\n== invoice", JSON.stringify(out.invoice, null, 1));
  const rec = await call("POST", "/api/staff/recon?wait=1");
  out.recon = { counts: rec.j.counts, summary: rec.j.summary, rows: rec.j.rows.map((r) => `${r.kind} ${r.job} ${r.ref} ours=${r.ours} paypal=${r.paypal} ${r.status} (${r.via})`) };
  console.log("\n== recon", JSON.stringify(out.recon, null, 1));
} finally {
  srv.close();
  const i = process.argv.indexOf("--json");
  if (i > 0) fs.writeFileSync(process.argv[i + 1], JSON.stringify(out, null, 1));
  setTimeout(() => process.exit(0), 200);
}
