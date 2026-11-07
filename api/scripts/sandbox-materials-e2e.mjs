// A materials advance on PayPal's real sandbox, through the app (in memory, a free local port; not the live server):
// a water heater hired on the sandbox test card; the pro asks for extra materials (a materials change order), the
// customer approves; the pro sends the supplier's invoice and a photo on site; the checks; a partial capture of the
// authorization (final_capture=false) and a Payouts item labelled materials; then the job's milestones, the final
// capture less the advance, and the ledger to the cent. Prints ids and statuses only.
// Usage: node scripts/sandbox-materials-e2e.mjs [--json out.json]
process.env.DONE_STATE_DIR = "memory";
process.env.DONE_NO_LISTEN = "1";
process.env.RECON_MS = "0";
process.env.DONE_DEMO_PRO_DELAY_MS = "0"; process.env.DONE_DEMO_PRO_WORK_MS = "-1"; process.env.DEMO_CUSTOMER_DELAY_MS = "-1";
const fs = await import("node:fs");
const { app } = await import("../src/server.js");
const { pp } = await import("../src/pay/index.js");
const J = await import("../src/jobs.js"), demo = await import("../src/demoassets.js"), { aiStatus } = await import("../src/ai.js");
if (pp().mode !== "sandbox") { console.error("Needs sandbox keys in api/.env."); process.exit(1); }
const srv = app.listen(0), base = `http://127.0.0.1:${srv.address().port}`;
srv.keepAliveTimeout = 300e3;
const client = () => { let ck = ""; return async (method, p, body) => { const r = await fetch(base + p, { method, headers: { "content-type": "application/json", cookie: ck }, body: body ? JSON.stringify(body) : undefined }); for (const c of r.headers.getSetCookie?.() || []) ck = c.split(";")[0]; return { s: r.status, j: await r.json().catch(() => null) }; }; };
const toItems = (items) => items.map(({ buf, mime, ...x }) => ({ ...x, ...(buf ? { dataUrl: `data:${mime};base64,${buf.toString("base64")}` } : {}) }));
const out = { at: new Date().toISOString(), paypal: "sandbox", checker: (await aiStatus()).mode, steps: [] };
const step = (name, data) => { out.steps.push({ name, ...data }); console.log(`\n== ${name}`, JSON.stringify(data, null, 1)); };
const cust = client(), pro = client();
try {
  await cust("POST", "/api/auth/demo", { as: "customer", name: "Materials Tester", pin: "4826" });
  const j0 = (await cust("POST", "/api/jobs", { text: "Replace our 50 gallon water heater this month, $3000 max", zip: "78704", budget: 3000 })).j;
  await J.requestOffers(j0.id, { kind: "person", person: J.job(j0.id).customer }, { now: true });
  const j = (await cust("GET", `/api/jobs/${j0.id}`)).j, o = j.offers.filter((x) => x.status === "open").sort((a, b) => a.amount.cents - b.amount.cents)[0];
  const h = (await cust("POST", `/api/jobs/${j.id}/offers/${o.id}/accept`, { payWith: "card", raiseCeiling: true })).j;
  step("hired and held", { number: h.number, price: h.agreed?.price?.usd, hold: h.hold?.amount?.usd, authorization: h.hold?.authorization, status: h.hold?.status });
  await pro("POST", "/api/auth/demo", { as: "pro", pro: o.pro.id, pin: process.env.DONE_DEMO_PRO_PIN || "8642" });
  await pro("POST", `/api/pro/jobs/${j.id}/start`, {});
  const co = (await pro("POST", `/api/pro/jobs/${j.id}/changes`, { amount: demo.MATERIALS.amount / 100, reason: demo.MATERIALS.reason, kind: "materials" })).j;
  const cid = co.changeOrders?.find((c) => c.kind === "materials")?.id;
  const ap = (await cust("POST", `/api/jobs/${j.id}/changes/${cid}/approve`, {})).j;
  step("materials change order approved", { change: cid, amount: ap.changeOrders?.find((c) => c.id === cid)?.amount?.usd, status: ap.changeOrders?.find((c) => c.id === cid)?.status, hold: ap.hold?.amount?.usd });
  const items = toItems(await demo.materialsEvidence(J.job(j.id), { typed: true }));
  let adv = (await pro("POST", `/api/pro/jobs/${j.id}/changes/${cid}/advance`, { items })).j;
  let a = adv.changeOrders?.find((c) => c.id === cid)?.advance;
  step("advance requested and checked", { status: a?.status, amount: a?.amount?.usd, check: a?.check, error: adv.error ? adv.message : null });
  if (a?.status === "awaiting_customer") { adv = (await cust("POST", `/api/jobs/${j.id}/changes/${cid}/advance/approve`, {})).j; a = adv.changeOrders?.find((c) => c.id === cid)?.advance; step("advance approved by the customer (PIN session)", { status: a?.status, error: adv.error ? adv.message : null }); }
  if (a?.status === "paid") {
    const batch = a.payout?.batchId ? await pp().getPayout(a.payout.batchId).catch((e) => ({ error: e.message })) : null;
    step("advance paid", { capture: a.capture, amount: a.amount?.usd, payout: a.payout && { batchId: a.payout.batchId, status: a.payout.status }, paypal: batch && { status: batch.status, items: (batch.items || []).map((i) => ({ id: i.id, status: i.status, transactionId: i.transactionId, amount: i.amount })) }, ledger: J.job(j.id).money.ledger.map((l) => `${l.kind} ${(l.amount / 100).toFixed(2)} ${l.ref || ""}`.trim()), balanced: J.balance(J.job(j.id)).ok });
  }
  // the milestones: the demo pro's evidence; the customer confirms what passed and only that
  for (const m0 of J.job(j.id).milestones) {
    const { span } = demo.planVisit(J.job(j.id), J.job(j.id).scope.checks.filter((c) => m0.checkIds.includes(c.id)));
    await cust("POST", "/api/demo/advance", { hours: (span + 1) / 60 });
    const ev = toItems(await demo.evidenceFor(J.job(j.id), J.job(j.id).scope.checks.filter((c) => m0.checkIds.includes(c.id)), { typed: true }));
    let v = (await pro("POST", `/api/pro/jobs/${j.id}/evidence`, { items: ev, submit: true, milestone: m0.id })).j;
    const ms = v?.milestones?.find((m) => m.id === m0.id);
    if (ms?.status === "review" && !(ms.lastCheck?.checks || []).some((c) => c.verdict !== "pass")) v = (await cust("POST", `/api/jobs/${j.id}/confirm`, { milestone: m0.id })).j;
    const m = J.job(j.id).milestones.find((x) => x.id === m0.id);
    step(`milestone ${m0.id}`, { status: m.status, verdicts: (m.release ? J.job(j.id).checks.filter((r) => r.milestone === m.id).at(-1) : J.job(j.id).checks.filter((r) => r.milestone === m.id).at(-1))?.checks.map((c) => `${c.id}:${c.verdict}`), release: m.release && { release: (m.release.release / 100).toFixed(2), materials: m.release.materials, capture: m.release.capture }, payout: m.payout && { batchId: m.payout.batchId, status: m.payout.status } });
    if (m.status !== "released") break;
  }
  const f = J.job(j.id), b = J.balance(f);
  step("the ledger", { status: f.status, captured: (b.captured / 100).toFixed(2), materials: (b.materials / 100).toFixed(2), balanced: b.ok, ledger: f.money.ledger.map((l) => `${l.kind} ${(l.amount / 100).toFixed(2)} ${l.ref || ""}`.trim()) });
} catch (e) { out.error = String(e.message || e); console.error(e); }
finally {
  srv.close();
  const i = process.argv.indexOf("--json");
  if (i > 0) fs.writeFileSync(process.argv[i + 1], JSON.stringify(out, null, 1));
  setTimeout(() => process.exit(0), 200);
}
