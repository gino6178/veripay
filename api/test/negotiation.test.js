// The negotiation layer (rounds both sides' agents take), nearby pros and asking them, and pros' agents over MCP.
import test, { after } from "node:test";
import assert from "node:assert/strict";
import "./helpers.js";
process.env.DONE_NO_LISTEN = "1";
const { app } = await import("../src/server.js");
const J = await import("../src/jobs.js");
const pros = await import("../src/pros.js");
const srv = app.listen(0);
after(() => srv.close());
const base = `http://127.0.0.1:${srv.address().port}`;
const client = () => { let ck = ""; return async (method, p, body, headers = {}) => { const r = await fetch(base + p, { method, headers: { "content-type": "application/json", accept: "application/json, text/event-stream", cookie: ck, ...headers }, body: body ? JSON.stringify(body) : undefined }); for (const c of r.headers.getSetCookie?.() || []) ck = [...ck.split("; ").filter((x) => x && !x.startsWith(c.split("=")[0])), c.split(";")[0]].join("; "); const t = await r.text(); let j; try { j = JSON.parse(t); } catch { j = t; } return { s: r.status, j }; }; };
const customer = (j) => ({ kind: "agent", person: j.customer, client: "test agent" });
async function offeredJob() {
  const c = client(); await c("POST", "/api/auth/demo", { as: "customer" });
  const j = (await c("POST", "/api/jobs", { text: "Kitchen faucet drips, fix it this week", zip: "78704", budget: 300, requestOffers: true })).j;
  for (let i = 0; i < 40 && !(J.job(j.id).offers.length); i++) await new Promise((r) => setTimeout(r, 100));
  return J.job(j.id);
}

test("negotiation: turns alternate, the customer only goes up within the ceiling, a demo pro answers by its rule", async () => {
  const j = await offeredJob(), o = j.offers.find((x) => pros.pro(x.pro).agent === "demo");
  assert.ok(o, "a demo pro offered");
  const v0 = J.negotiationOf(j.id, o.id, customer(j));
  assert.equal(v0.turn, "customer"); assert.equal(v0.rounds.length, 1); assert.ok(v0.ceiling);
  assert.equal((await J.negotiate(j.id, o.id, { move: "propose", amount: o.amount + 100 }, customer(j))).error, "amount");
  assert.equal((await J.negotiate(j.id, o.id, { move: "propose", amount: j.scope.priceCeiling + 100 }, customer(j))).error, "amount");
  const r = await J.negotiate(j.id, o.id, { move: "propose", amount: Math.round(o.amount * 0.85) }, customer(j));
  assert.ok(!r.error, r.message);
  assert.ok(["agreed", "open", "ended"].includes(r.negotiation.status));
  if (r.negotiation.status === "open") { assert.equal(r.negotiation.turn, "customer"); assert.equal(r.negotiation.rounds.at(-1).by, "pro"); }
  // a pro that isn't on the offer can't move it
  assert.equal(J.negotiationOf(j.id, o.id, { kind: "pro_agent", pro: "nobody" }).error, "forbidden");
});

test("negotiation: the pro's side only goes down, between the two last prices; accept settles the offer's price", async () => {
  const j = await offeredJob(), o = j.offers[0], p = pros.pro(o.pro), was = p.agent;
  p.agent = "external"; // answer by hand, as a real pro's agent would
  try {
    const ask = o.amount, mine = Math.round(ask * 0.8);
    await J.negotiate(j.id, o.id, { move: "propose", amount: mine }, customer(j));
    const proSide = { kind: "pro_agent", pro: p.id, client: "pro agent" };
    assert.equal((await J.negotiate(j.id, o.id, { move: "propose", amount: ask + 1 }, proSide)).error, "amount");
    assert.equal((await J.negotiate(j.id, o.id, { move: "propose", amount: mine - 1 }, proSide)).error, "amount");
    assert.equal((await J.negotiate(j.id, o.id, { move: "propose", amount: mine + 500 }, customer(j))).error, "turn");
    const mid = Math.round((ask + mine) / 2);
    const r = await J.negotiate(j.id, o.id, { move: "propose", amount: mid }, proSide);
    assert.ok(!r.error, r.message); assert.equal(J.job(j.id).offers.find((x) => x.id === o.id).amount, mid);
    const done = await J.negotiate(j.id, o.id, { move: "accept" }, customer(j));
    assert.equal(done.negotiation.status, "agreed"); assert.equal(J.job(j.id).offers.find((x) => x.id === o.id).amount, mid);
    assert.equal((await J.negotiate(j.id, o.id, { move: "propose", amount: mid - 100 }, customer(j))).error, "closed");
  } finally { p.agent = was; }
});

test("nearby: pros on VeriPay and listed businesses, nearest first; asking a pro gets an answer, a listed business only a draft", async () => {
  const j = await offeredJob();
  const n = J.findNearby(j.id, {}, customer(j));
  assert.ok(n.onVeriPay.length >= 1);
  for (let i = 1; i < n.onVeriPay.length; i++) assert.ok(n.onVeriPay[i].miles >= n.onVeriPay[i - 1].miles);
  assert.ok(n.local.every((x) => x.onVeriPay === false && x.id.startsWith("osm:")));
  assert.match(n.source.license, /OpenStreetMap/);
  const to = [n.onVeriPay[0].id, ...(n.local[0] ? [n.local[0].id] : [])];
  const r = await J.askPros(j.id, { to, question: "Can you come Thursday morning?" }, customer(j));
  const toPro = r.asked.find((x) => x.to === n.onVeriPay[0].id);
  assert.ok(["answered", "sent"].includes(toPro.status));
  if (n.local[0]) { const d = r.asked.find((x) => x.to === n.local[0].id); assert.equal(d.status, "draft"); assert.match(d.sendIt, /never contacts/); }
  assert.equal((await J.askPros(j.id, { to: [n.onVeriPay[0].id] }, customer(j))).asked[0].status, "already_asked");
});

test("a pro's agent connects over MCP with its pro key and sees the pro tools", async () => {
  const staff = client(); await staff("POST", "/api/auth/staff", {});
  const made = (await staff("POST", "/api/staff/pros", { name: "MCP Plumbing (test)", trade: "plumbing", zip: "78704", email: "mcp@veripay-test.example" })).j;
  const A = { authorization: `Bearer ${made.key}` }, c = client();
  const init = await c("POST", "/mcp", { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "t", version: "1" } } }, A);
  assert.equal(init.s, 200); assert.match(JSON.stringify(init.j), /veripay-pro/);
  const list = await c("POST", "/mcp", { jsonrpc: "2.0", id: 2, method: "tools/list", params: {} }, A);
  const names = list.j.result.tools.map((t) => t.name);
  for (const n of ["offer", "propose_price", "accept_price", "walk_away", "negotiation", "submit_evidence", "my_inquiries"]) assert.ok(names.includes(n), n);
  const who = await c("POST", "/mcp", { jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "whoami", arguments: {} } }, A);
  assert.match(JSON.stringify(who.j), /MCP Plumbing/);
  const bad = await c("POST", "/mcp", { jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "offer", arguments: { job: "x", payTo: "me@example.com" } } }, A);
  assert.equal(bad.s, 400);
});
