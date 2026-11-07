// The new money paths through the whole app, on PayPal's real sandbox (in memory, a free local port):
//   A. a water heater in two milestones, 10% retainage: one authorization; milestone 1 a partial capture
//      (final_capture=false) and its Payouts batch; milestone 2 the final capture; the retainage held, then paid with
//      Payouts when the warranty window ends (the platform clock is moved 15 days)
//   B. a faucet with a 24-hour review window: the pro takes early pay (Payouts, before any capture), then the window
//      ends and the capture follows
//   C. a faucet with retainage and a defect claim the arbiter refunds: a PayPal refund on the capture
// When no model is serving, the checker leaves photos to a person (review): the customer then releases, as the
// website lets them. Prints ids and statuses only. Usage: node scripts/sandbox-milestones-e2e.mjs [--json out.json]
process.env.DONE_STATE_DIR = "memory";
process.env.DONE_NO_LISTEN = "1";
process.env.RECON_MS = "0";
// offers at once; the demo pros' own agents don't work these jobs (this script plays the pro); the customer agent idle
process.env.DONE_DEMO_PRO_DELAY_MS = "0"; process.env.DONE_DEMO_PRO_WORK_MS = "-1"; process.env.DEMO_CUSTOMER_DELAY_MS = "-1";
const fs = await import("node:fs");
const os = await import("node:os");
const path = await import("node:path");
const crypto = await import("node:crypto");
const { execFileSync } = await import("node:child_process");
const { app } = await import("../src/server.js");
const { pp } = await import("../src/pay/index.js");
const { withExif } = await import("../src/evidence.js");
if (pp().mode !== "sandbox") { console.error("Needs sandbox keys in api/.env."); process.exit(1); }
const srv = app.listen(0), base = `http://127.0.0.1:${srv.address().port}`;
srv.keepAliveTimeout = 300e3; // (rendering photos blocks this process; keep the client's socket alive meanwhile)
const client = () => { let ck = ""; return async (method, p, body) => { if (process.env.TRACE) console.log(">", method, p, body ? JSON.stringify(body).length : 0); const r = await fetch(base + p, { method, headers: { "content-type": "application/json", cookie: ck }, body: body ? JSON.stringify(body) : undefined }); for (const c of r.headers.getSetCookie?.() || []) ck = c.split(";")[0]; return { s: r.status, j: await r.json().catch(() => null) }; }; };
const ASSETS = new URL("../demo-assets/", import.meta.url);
const fresh = (file, at) => {
  const out = path.join(os.tmpdir(), `done-ms-${crypto.randomBytes(5).toString("hex")}.jpg`);
  let buf;
  try { execFileSync("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", new URL("make-assets.ps1", ASSETS).pathname.replace(/^\/([A-Za-z]:)/, "$1"), "-Batch", `${file}>${out}`, "-Seed", String(crypto.randomInt(1, 2 ** 31 - 1))], { stdio: "ignore", timeout: 20e3 }); buf = fs.readFileSync(out); } catch { buf = fs.readFileSync(new URL(file, ASSETS)); }
  return `data:image/jpeg;base64,${withExif(buf, { taken: new Date().toISOString(), lat: at.lat + Math.random() * 3e-4, lng: at.lng - Math.random() * 3e-4 }).toString("base64")}`;
};
const DOCS = { permit: "CITY OF AUSTIN plumbing permit BP-2026-004512", inspection: "Inspection PASSED, green tag", lien_waiver: "Conditional lien waiver and release" };
const demo = await import("../src/demoassets.js"), J = await import("../src/jobs.js");
const itemsFor2 = async (id, mid) => {
  const j = J.job(id), m = j.milestones.find((x) => x.id === mid), checks = j.scope.checks.filter((c) => m.checkIds.includes(c.id));
  const items = await demo.evidenceFor(j, checks, { typed: true, partsCents: j.agreed.parts || null });
  return items.map(({ buf, mime, ...x }) => ({ ...x, ...(buf ? { dataUrl: `data:${mime};base64,${buf.toString("base64")}` } : {}) }));
};
const itemsFor = (job, mid) => {
  const m = job.milestones.find((x) => x.id === mid), at = { lat: job.address.lat, lng: job.address.lng };
  return job.scope.checks.filter((c) => m.checkIds.includes(c.id)).map((c, i) => c.doc ? { kind: "receipt", checkId: c.id, text: DOCS[c.doc], dataUrl: fresh("receipt.jpg", at) }
    : c.evidence === "receipt" ? { kind: "receipt", checkId: c.id, dataUrl: fresh("receipt.jpg", at), text: `TOTAL ${(job.agreed.parts.cents / 100).toFixed(2)}` }
    : c.evidence === "note" ? { kind: "note", checkId: c.id, text: "Replaced as described, tested, area cleaned." } : { kind: "photo", checkId: c.id, label: "wide shot", dataUrl: fresh(["faucet-installed.jpg", "sink-dry.jpg", "valve-worn.jpg"][i % 3], at) });
};
const out = { at: new Date().toISOString(), paypal: "sandbox", runs: [] };
const brief = (j) => ({ checks: (j.milestones || []).map((m) => m.lastCheck && { milestone: m.id, decision: m.lastCheck.decision, checker: m.lastCheck.checker, verdicts: m.lastCheck.checks.map((c) => `${c.id}:${c.verdict}${c.verdict !== "pass" ? ` (${c.reason})` : ""}`) }).filter(Boolean), number: j.number, status: j.status, hold: j.hold && { authorization: j.hold.authorization, status: j.hold.status, amount: j.hold.amount?.usd, history: j.hold.history.map((h) => h.event) },
  milestones: j.milestones.map((m) => ({ id: m.id, title: m.title, status: m.status, due: m.due.usd, captures: m.captures, release: m.release && { release: m.release.release.usd, fee: m.release.fee.usd, pro: m.release.pro.usd, retained: m.release.retained.usd }, payout: m.payout?.batchId || (m.payout ? `${m.payout.status}: ${m.payout.why || ""}` : null), earlyPay: m.earlyPay && { amount: m.earlyPay.amount.usd, fee: m.earlyPay.fee.usd, batchId: m.earlyPay.batchId } })),
  warranty: j.warranty && { status: j.warranty.status, open: j.warranty.open?.usd, paid: j.warranty.paid?.batchId || null }, money: { captured: j.money.captured.usd, refunded: j.money.refunded.usd, retained: j.money.retained.usd, earlyPayFees: j.money.earlyPayFees.usd, balanced: j.money.balanced, ledger: j.money.ledger.map((l) => `${l.kind} ${l.amount.usd} ${l.ref || ""}`.trim()) }, error: j.error || null, message: j.message || null });
const cust = client(), pro = client(), staff = client();
await staff("POST", "/api/auth/staff", {});
async function job(text, budget, options) {
  await cust("POST", "/api/auth/demo", { as: "customer", name: "Sandbox Tester" });
  const j0 = (await cust("POST", "/api/jobs", { text, zip: "78704", budget, options })).j;
  await J.requestOffers(j0.id, { kind: "person", person: J.job(j0.id).customer }, { now: true });
  const j = (await cust("GET", `/api/jobs/${j0.id}`)).j;
  if (!j?.offers?.some((x) => x.status === "open")) throw new Error(`no offers: ${JSON.stringify(j).slice(0, 300)}`);
  const o = j.offers.filter((x) => x.status === "open").sort((a, b) => a.amount.cents - b.amount.cents)[0];
  const h = (await cust("POST", `/api/jobs/${j.id}/offers/${o.id}/accept`, { payWith: "card", raiseCeiling: true })).j;
  await pro("POST", "/api/auth/demo", { as: "pro", pro: o.pro.id, pin: process.env.DONE_DEMO_PRO_PIN || "8642" });
  await pro("POST", `/api/pro/jobs/${j.id}/start`, {});
  return h;
}
// the visit takes its minutes (timed photos): the demo clock moves by the visit's span, logged
async function deliver(id, mid) {
  const j0 = J.job(id), m0 = j0.milestones.find((x) => x.id === mid), { span } = demo.planVisit(j0, j0.scope.checks.filter((c) => m0.checkIds.includes(c.id)));
  await cust("POST", "/api/demo/advance", { hours: (span + 1) / 60 });
  let v = (await pro("POST", `/api/pro/jobs/${id}/evidence`, { items: await itemsFor2(id, mid), submit: true, milestone: mid })).j;
  // a person confirms only what passed: when the checks left it to a person and every condition passed, the customer
  // confirms; anything that didn't pass stays unpaid (recorded as it is)
  const ms = v?.milestones?.find((m) => m.id === mid);
  if (ms?.status === "review" && !(ms.lastCheck?.checks || []).some((c) => c.verdict !== "pass")) v = (await cust("POST", `/api/jobs/${id}/confirm`, { milestone: mid })).j;
  return v;
}
const log = (label, j) => { if (!j?.milestones) { out.runs.push({ label, error: j?.message || j?.error || "no job" }); console.log(`
== ${label}: ${j?.message || j?.error}`); return; } const b = brief(j); out.runs.push({ label, ...b }); console.log(`\n== ${label}`, JSON.stringify(b, null, 1)); };
try {
  const a = await job("Replace our 40 gallon water heater this month, $2500 max", 2500, { retainPct: 10, warrantyDays: 14 });
  await deliver(a.id, "m1");
  const a2 = await deliver(a.id, "m2");
  log("A: two milestones, after the final capture", a2);
  await cust("POST", "/api/demo/advance", { days: 15 });
  log("A: after the warranty window", (await cust("GET", `/api/jobs/${a.id}`)).j);
  const b = await job("Kitchen faucet keeps dripping. Fix it this week.", 250, { releaseMode: "review", reviewHours: 24 });
  const bj = (await cust("GET", `/api/jobs/${b.id}`)).j;
  await cust("POST", "/api/demo/advance", { hours: 0.5 });
  let bv = (await pro("POST", `/api/pro/jobs/${b.id}/evidence`, { items: await itemsFor2(b.id, "m1"), submit: true })).j;
  if (bv.status === "review") bv = (await staff("POST", `/api/staff/queue/${b.id}/${(await staff("GET", "/api/staff/queue")).j.items.find((q) => q.job === b.id)?.id}`, { decision: "customer", note: "photos fine" })).j;
  const early = (await pro("POST", `/api/pro/jobs/${b.id}/early-pay`, {})).j;
  out.early = { status: early?.status, error: early?.message || null, why: bv.status !== "passed" ? `the job was ${bv.status} (no review window without passing checks)` : null };
  if (bv.status === "review" && !(bv.lastCheck?.checks || []).some((c) => c.verdict !== "pass")) await cust("POST", `/api/jobs/${b.id}/confirm`, {});
  await cust("POST", "/api/demo/advance", { days: 1.1 });
  log("B: review window + early pay", (await cust("GET", `/api/jobs/${b.id}`)).j);
  const c = await job("Kitchen faucet keeps dripping. Fix it this week.", 250, { retainPct: 10 });
  await deliver(c.id, "m1");
  await cust("POST", `/api/jobs/${c.id}/defect`, { reason: "The handle came off the next day" });
  log("C: defect claim, retainage refunded by the arbiter", (await staff("POST", `/api/staff/jobs/${c.id}/defect`, { outcome: "refund", note: "handle defect, retainage back" })).j);
} finally {
  srv.close();
  const i = process.argv.indexOf("--json");
  if (i > 0) fs.writeFileSync(process.argv[i + 1], JSON.stringify(out, null, 1));
  setTimeout(() => process.exit(0), 200);
}
