// The server end to end over HTTP (stand-in PayPal, in-memory state): the judges' tour, the website's customer and pro
// routes (multipart evidence upload), a customer's agent over MCP, REST and A2A, a real pro's agent over A2A with a
// pro key, the back office, webhooks and llms.txt.
import test, { after } from "node:test";
import assert from "node:assert/strict";
import "./helpers.js";
import { ev } from "./helpers.js";
process.env.DONE_NO_LISTEN = "1";
const { app } = await import("../src/server.js");
const srv = app.listen(0);
after(() => srv.close());
const base = `http://127.0.0.1:${srv.address().port}`;
function client() {
  let ck = "";
  const call = async (method, p, body, headers = {}) => {
    const isBuf = Buffer.isBuffer(body);
    const r = await fetch(base + p, { method, headers: { ...(isBuf ? {} : { "content-type": "application/json" }), cookie: ck, ...headers }, body: body == null ? undefined : isBuf ? body : JSON.stringify(body), redirect: "manual" });
    const sc = r.headers.get("set-cookie");
    if (sc) ck = [ck, sc.split(";")[0]].filter(Boolean).join("; ");
    const text = await r.text();
    let j = null; try { j = JSON.parse(text); } catch { j = text; }
    return { s: r.status, j, h: r.headers };
  };
  return call;
}
const rpc = (data, token) => ({ jsonrpc: "2.0", id: 1, method: "message/send", params: { message: { kind: "message", role: "user", messageId: "m1", parts: [{ kind: "data", data }] } } });
const stamp = (lat = 30.2433, lng = -97.7656, ago = 0) => ev.withExif(Buffer.concat([ev.TINY_JPEG.slice(0, -2), Buffer.from(String(Math.random())), ev.TINY_JPEG.slice(-2)]), { taken: new Date(Date.now() - ago * 60e3).toISOString(), lat, lng });

test("the judges' tour, all steps: hired, held, change order, evidence, checked, paid", async () => {
  const call = client();
  const r = await call("POST", "/api/demo/tour", { step: "all" });
  assert.equal(r.s, 200, JSON.stringify(r.j).slice(0, 300));
  assert.equal(r.j.status, "released");
  assert.equal(r.j.money.balanced, true);
  assert.ok(r.j.money.payout.batchId);
  assert.ok(r.j.thread.some((m) => m.type === "counter"));
  assert.equal(r.j.changeOrders[0].status, "approved");
  const me = await call("GET", "/api/me");
  assert.equal(me.j.person.role, "customer");
  const ev1 = r.j.evidence.find((e) => e.kind === "photo");
  const f = await fetch(base + ev1.url);
  assert.equal(f.status, 404, "evidence files aren't public");
  const f2 = await call("GET", ev1.url);
  assert.equal(f2.s, 200);
  const stats = await call("GET", "/api/stats");
  assert.equal(stats.j.last.number, r.j.number);
});

test("website: a customer posts, edits the scope, gets offers, counters, accepts; a pro uploads multipart evidence", async () => {
  const cust = client(), pro = client();
  await cust("POST", "/api/auth/demo", { as: "customer", name: "Web Tester" });
  const lim = await cust("PUT", "/api/limits", { perJobMax: 400, monthlyMax: 2500, changeMax: 60, agentMayRelease: false });
  assert.equal(lim.j.perJobMax, "$400.00");
  assert.equal(lim.j.monthlyMax, "$2,500.00", "thousands separators");
  const j = await cust("POST", "/api/jobs", { text: "Kitchen faucet drips all night. Fix it this week.", zip: "78704", budget: 220 });
  assert.equal(j.j.status, "scoped");
  assert.equal(j.j.budget.cents, 22000);
  const e = await cust("PATCH", `/api/jobs/${j.j.id}/scope`, { title: "Fix the kitchen faucet drip" });
  assert.equal(e.j.scope.title, "Fix the kitchen faucet drip");
  const o = await cust("POST", `/api/jobs/${j.j.id}/offers/request`);
  assert.equal(o.j.status, "offered");
  const best = o.j.offers.find((x) => x.pro.id === "barton-creek-plumbing");
  const c = await cust("POST", `/api/jobs/${j.j.id}/offers/${best.id}/counter`, { amount: best.amount.cents / 100 - 20 });
  assert.equal(c.s, 200);
  const a = await cust("POST", `/api/jobs/${j.j.id}/offers/${best.id}/accept`, { payWith: "paypal" });
  assert.equal(a.j.status, "agreed");
  assert.match(a.j.approveUrl, /mock-paypal\/approve/);
  // the customer approves on the simulated PayPal page, comes back, and the hold is placed
  const ap = await cust("POST", `/mock-paypal/approve?token=${a.j.orderId}`, Buffer.from("a=yes"), { "content-type": "application/x-www-form-urlencoded" });
  assert.equal(ap.s, 302);
  const ret = await cust("GET", ap.h.get("location"));
  assert.equal(ret.s, 302);
  assert.equal((await cust("GET", `/api/jobs/${j.j.id}`)).j.status, "held");
  // the pro signs in, starts, uploads three files as multipart and submits
  assert.equal((await client()("POST", "/api/auth/demo", { as: "pro", pro: "barton-creek-plumbing" })).s, 401, "a demo pro signs in with the PIN");
  const pm = await pro("POST", "/api/auth/demo", { as: "pro", pro: "barton-creek-plumbing", pin: "8642" });
  assert.equal(pm.j.pro.id, "barton-creek-plumbing");
  assert.equal((await pro("POST", `/api/pro/jobs/${j.j.id}/start`)).j.status, "working");
  const B = "----done", part = (name, val) => `--${B}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${val}\r\n`;
  const file = (i, buf) => Buffer.concat([Buffer.from(`--${B}\r\nContent-Disposition: form-data; name="file"; filename="p${i}.jpg"\r\nContent-Type: image/jpeg\r\n\r\n`), buf, Buffer.from("\r\n")]);
  const body = Buffer.concat([Buffer.from(part("kind_0", "photo") + part("checkId_0", "c1") + part("kind_1", "photo") + part("checkId_1", "c2") + part("kind_2", "receipt") + part("checkId_2", "c3") + part("text_2", "TOTAL 35.00") + part("submit", "true")), file(0, stamp(undefined, undefined, 15)), file(1, stamp()), file(2, stamp()), Buffer.from(`--${B}--\r\n`)]);
  const up = await pro("POST", `/api/pro/jobs/${j.j.id}/evidence`, body, { "content-type": `multipart/form-data; boundary=${B}` });
  assert.equal(up.s, 200, JSON.stringify(up.j).slice(0, 300));
  assert.equal(up.j.status, "released", JSON.stringify(up.j.lastCheck?.checks));
  assert.equal(up.j.evidence.length, 3);
  assert.ok(up.j.evidence.every((x) => x.exif?.lat));
  const pay = await pro("GET", "/api/pro/payouts");
  assert.ok(pay.j.total.cents > 0);
  // the customer's view of the pro's PayPal is masked
  const view = await cust("GET", `/api/jobs/${j.j.id}`);
  assert.match(view.j.agreed.payee.to, /•••/);
});

test("a customer's agent: token from the website, then MCP, REST and A2A; a read-only token is refused", async () => {
  const cust = client();
  await cust("POST", "/api/auth/demo", { as: "customer" });
  const t = (await cust("POST", "/api/tokens", { label: "Claude", scopes: ["read", "hire"] })).j.token;
  assert.match(t, /^done_/);
  const auth = { authorization: `Bearer ${t}`, accept: "application/json, text/event-stream" };
  const list = await cust("POST", "/mcp", { jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }, auth);
  const names = list.j.result.tools.map((x) => x.name);
  for (const n of ["post_job", "job_status", "list_offers", "counter_offer", "accept_offer", "approve_change", "release", "request_fix", "open_dispute", "my_limits", "cancel_job"]) assert.ok(names.includes(n), n);
  const post = await cust("POST", "/mcp", { jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "post_job", arguments: { text: "Bathroom sink drain is clogged, fix today", zip: "78702", budget: 180 } } }, auth);
  const job = post.j.result.structuredContent;
  assert.equal(job.status, "offered");
  // MCP results are the summary by default; view: "full" gives the whole job
  assert.equal(job.view, "summary");
  assert.ok(job.conditions.length > 0 && job.offers.length > 0);
  assert.ok(JSON.stringify(job).length < 6000, `summary is ${JSON.stringify(job).length} bytes`);
  const full = await cust("POST", "/mcp", { jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "job_status", arguments: { job: job.id, view: "full" } } }, auth);
  assert.equal(full.j.result.structuredContent.scope.trade, "plumbing");
  // an argument a tool doesn't take is refused, listing the ones it does (MCP, REST, A2A)
  const bad = await cust("POST", "/mcp", { jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "release", arguments: { job: job.id, payee: "evil@example.com" } } }, auth);
  assert.equal(bad.s, 400);
  assert.match(bad.j.error.message, /doesn't take payee.*It takes: job/);
  const badRest = await cust("POST", "/api/agent/job_status", { job: job.id, payee: "x" }, { authorization: `Bearer ${t}` });
  assert.equal(badRest.s, 400);
  assert.deepEqual(badRest.j.unknown, ["payee"]);
  const badA2a = await cust("POST", "/a2a", rpc({ action: "job_status", job: job.id, payee: "x" }), { authorization: `Bearer ${t}` });
  assert.match(badA2a.j.error.message, /doesn't take payee/);
  const rest = await cust("POST", "/api/agent/my_limits", {}, { authorization: `Bearer ${t}` });
  assert.equal(rest.j.perJobMax, "$500.00");
  const rel = await cust("POST", "/api/agent/release", { job: job.id }, { authorization: `Bearer ${t}` });
  assert.equal(rel.s, 403, "no pay scope");
  const a2a = await cust("POST", "/a2a", rpc({ action: "list_offers", job: job.id }), { authorization: `Bearer ${t}` });
  assert.ok(a2a.j.result.parts[0].data.offers.length > 0);
  assert.equal(a2a.j.result.contextId, job.id);
  const none = await cust("POST", "/api/agent/my_limits", {});
  assert.equal(none.s, 401);
});

test("a real pro's agent over A2A with a pro key: list, offer, answer the counter, deliver, payout status", async () => {
  const staff = client(), cust = client();
  await staff("POST", "/api/auth/staff", {});
  const made = await staff("POST", "/api/staff/pros", { name: "Riverside Plumbing (test)", trade: "plumbing", zip: "78741", email: "riverside@done-demo.example" });
  const key = made.j.key, P = { authorization: `Bearer ${key}` };
  const send = async (data) => (await cust("POST", "/a2a", rpc(data), P)).j;
  assert.equal((await send({ action: "whoami" })).result.parts[0].data.pro.agent, "external");
  // its PayPal isn't verified yet: the pro does that on the website (here: staff's tool stands in)
  const { setPayPal } = await import("../src/pros.js");
  setPayPal(made.j.pro.id, { email: "riverside@done-demo.example" });
  await cust("POST", "/api/auth/demo", { as: "customer" });
  const j = (await cust("POST", "/api/jobs", { text: "Leaking pipe under the kitchen sink, fix this week", zip: "78741", budget: 250, requestOffers: true })).j;
  const listed = (await send({ action: "list_jobs" })).result.parts[0].data.jobs;
  assert.ok(listed.some((x) => x.id === j.id && x.zip === "78741" && !("customer" in x)));
  // a payout address from the agent is refused outright, with the arguments offer takes
  const refused = await send({ action: "offer", job: j.id, amount: 210, payee: "someone@else.com" });
  assert.match(refused.error.message, /doesn't take payee.*only by the pro on the website/);
  const off = (await send({ action: "offer", job: j.id, amount: 210, arrival: new Date(Date.now() + 864e5).toISOString() })).result.parts[0].data;
  const offerId = off.offer;
  const ctr = await cust("POST", `/api/jobs/${j.id}/offers/${offerId}/counter`, { amount: 180 });
  assert.equal(ctr.j.offers.find((o) => o.id === offerId).status, "countered");
  assert.equal((await cust("POST", `/api/jobs/${j.id}/offers/${offerId}/accept`, {})).s, 409, "waiting for the pro's answer");
  const ans = (await send({ action: "counter", offer: offerId, amount: 195 })).result.parts[0].data;
  assert.equal(ans.offers.find((o) => o.id === offerId).amount.cents, 19500);
  const held = await cust("POST", `/api/jobs/${j.id}/offers/${offerId}/accept`, { payWith: "card" });
  assert.equal(held.j.status, "held");
  assert.equal((await send({ action: "start_work", job: j.id })).result.parts[0].data.status, "working");
  const items = [{ kind: "photo", checkId: "c1", dataUrl: `data:image/jpeg;base64,${stamp(30.231, -97.7222, 15).toString("base64")}` }, { kind: "photo", checkId: "c2", dataUrl: `data:image/jpeg;base64,${stamp(30.2312, -97.7224).toString("base64")}` }, { kind: "receipt", checkId: "c3", text: "TOTAL 40.00", dataUrl: `data:image/jpeg;base64,${stamp().toString("base64")}` }];
  const sub = (await send({ action: "submit_evidence", job: j.id, items })).result.parts[0].data;
  assert.equal(sub.status, "released", JSON.stringify(sub.lastCheck?.checks));
  const ps = (await send({ action: "payout_status", job: j.id })).result.parts[0].data;
  assert.equal(ps.split.release.cents, 19500);
  assert.ok(ps.payout.batchId);
  const bad = await cust("POST", "/a2a", rpc({ action: "list_jobs" }), { authorization: "Bearer dpk_nope" });
  assert.equal(bad.j.error.code, -32001);
});

// (judging round 2: the tour uses its library of real photos on every tour job, when they're available; between tour jobs
// that's reported as "demo library photo (tour)", never a reuse. Synthetic scenes are still re-drawn every run.)
test("a second tour isn't flagged as reused: new synthetic pictures, or the tour's own photo library", async () => {
  const a = await client()("POST", "/api/demo/tour", { step: "all" }), b = await client()("POST", "/api/demo/tour", { step: "all" });
  assert.equal(b.j.status, "released", JSON.stringify(b.j.lastCheck?.checks));
  const { job } = await import("../src/jobs.js");
  const pa = job(a.j.id).evidence.filter((e) => e.kind === "photo"), pb = job(b.j.id).evidence.filter((e) => e.kind === "photo");
  assert.ok(pa.every((x) => pb.every((y) => x.sha !== y.sha)));
  const { creditOf } = await import("../src/demoassets.js");
  if (creditOf(pa[0].name) && creditOf(pb[0].name)) assert.ok(job(b.j.id).checks.at(-1).checks.some((c) => (c.signals || []).includes("demo library photo (tour)")), "the library photo is reported");
  else if (process.platform === "win32") {
    const { facts } = await import("../src/check/vision.js");
    const f = (await facts([pa[0], pb[0]].map((e) => ({ id: e.id, kind: "photo", path: e.path, uploadedAt: e.uploadedAt })), {})).facts;
    const ham = (x, y) => { let v = BigInt(`0x${x}`) ^ BigInt(`0x${y}`), n = 0; while (v) { n += Number(v & 1n); v >>= 1n; } return n; };
    assert.ok(ham(f.get(pa[0].id).dhash, f.get(pb[0].id).dhash) > 10, "a different dHash, not a near-copy");
  }
});

test("public: signed-out /api/me, the example job without personal data, model status, ask the grid", async () => {
  const anon = client();
  const me = await anon("GET", "/api/me");
  assert.equal(me.s, 200);
  assert.equal(me.j.signedIn, false);
  // with the rules alone (these tests) every paid job's photos passed on code without a look ("content not judged"), so
  // the home page shows none (judging round 2); the model-judged pick and its privacy are in judging2.test.js
  const ex = await anon("GET", "/api/example-job");
  assert.equal(ex.s, 404); assert.match(ex.j.message, /judged/);
  const ms = await anon("GET", "/api/models/status?probe=0");
  assert.equal(ms.j.live, false);
  assert.match(ms.j.reason, /rules/);
  const staff = client();
  await staff("POST", "/api/auth/staff", {});
  const q = await staff("POST", "/api/staff/ask", { question: "plumbing jobs in review over $150, biggest first" });
  assert.equal(q.j.grid, "jobs");
  assert.deepEqual(q.j.filters.map((f) => f.field).sort(), ["due", "status", "trade"]);
  assert.deepEqual(q.j.sort, { field: "due", dir: "desc" });
  assert.equal(q.j.source, "rules");
  const h = await staff("POST", "/api/staff/ask", { question: "holds expiring soonest" });
  assert.equal(h.j.grid, "holds");
  assert.equal(h.j.sort.field, "expiresAt");
});

test("back office, webhooks, llms.txt, agent card, demo clock", async () => {
  const staff = client();
  assert.equal((await staff("GET", "/api/staff/overview")).s, 401);
  await staff("POST", "/api/auth/staff", {});
  const ov = await staff("GET", "/api/staff/overview");
  assert.ok(ov.j.jobs >= 2);
  assert.equal(ov.j.unbalanced, 0);
  const rows = (await staff("GET", "/api/staff/jobs")).j;
  assert.ok(rows.every((r) => r.balanced));
  assert.ok(Array.isArray((await staff("GET", "/api/staff/holds")).j));
  assert.ok(Array.isArray((await staff("GET", "/api/staff/alerts")).j.alerts));
  const rec = await staff("POST", "/api/staff/recon?wait=1");
  assert.ok(rec.j.rows.length > 0);
  assert.ok(rec.j.rows.every((r) => ["matched", "pending", "sent_unclaimed"].includes(r.status)), JSON.stringify(rec.j.rows.filter((r) => r.status !== "matched")));
  assert.ok(rec.j.rows.filter((r) => r.kind === "capture").every((r) => r.fee?.ok && r.fee.paypal > 0), "PayPal's fee from Transaction Search matches the ledger");
  assert.ok(rec.j.fees.captures > 0 && rec.j.fees.differences === 0);
  const wh = await fetch(`${base}/paypal/webhook`, { method: "POST", body: JSON.stringify({ id: "WH-1", event_type: "PAYMENT.CAPTURE.COMPLETED", resource: {} }) });
  assert.equal(wh.status, 200);
  assert.equal((await staff("GET", "/api/staff/webhooks")).j.recent[0].type, "PAYMENT.CAPTURE.COMPLETED");
  const sim = await staff("POST", "/api/staff/webhooks/simulate", { event_type: "CUSTOMER.DISPUTE.CREATED" });
  assert.equal(sim.j.event.type, "CUSTOMER.DISPUTE.CREATED");
  assert.ok(sim.j.did.some((x) => /no job has capture/.test(x)), JSON.stringify(sim.j.did));
  assert.equal((await staff("POST", "/api/staff/webhooks/simulate", { event_type: "NOT.AN.EVENT" })).j.error, "event_type");
  const llms = await staff("GET", "/llms.txt");
  assert.match(llms.j, /VeriPay/);
  assert.match(llms.j, /dpk_/);
  const card = await staff("GET", "/.well-known/agent-card.json");
  assert.equal(card.j.skills.length, 2);
  const info = await staff("GET", "/api/info");
  assert.equal(info.j.paypal, "mock");
  assert.equal(info.j.ai.mode, "rules");
  const adv = await staff("POST", "/api/demo/advance", { hours: 2 });
  assert.ok(adv.j.now);
});
