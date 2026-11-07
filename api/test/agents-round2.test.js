// Agent test round 2: options from agents (post_job, set_options), review_scope, options changing until an offer is
// accepted (pros told, may re-quote), the demo inspector always there, askPerson links for person-only steps, and the
// personId alias when resuming a demo customer.
import test, { after } from "node:test";
import assert from "node:assert/strict";
import { J, person, P, PRO, people, pros, tools } from "./helpers.js";
process.env.DONE_NO_LISTEN = "1";
const { app } = await import("../src/server.js");
const srv = app.listen(0);
after(() => srv.close());
const base = `http://127.0.0.1:${srv.address().port}`;
const client = () => { let ck = ""; return async (method, p, body, headers = {}) => { const r = await fetch(base + p, { method, headers: { "content-type": "application/json", cookie: ck, ...headers }, body: body ? JSON.stringify(body) : undefined, redirect: "manual" }); for (const c of r.headers.getSetCookie?.() || []) ck = c.split(";")[0]; const t = await r.text(); let j; try { j = JSON.parse(t); } catch { j = t; } return { s: r.status, j, location: r.headers.get("location") }; }; };
const agent = (c) => ({ person: c.id, client: "test agent", scopes: ["read", "hire", "pay"] });

test("an agent posts with options and milestones, reviews a scope, and changes options until an offer is accepted", async () => {
  const ins = people.ensureDemoInspector(), c = person(), a = agent(c);
  const r = await tools.CUSTOMER.post_job(a, { text: "Replace our 40 gallon water heater this month", zip: "78704", budget: 300, options: { releaseMode: "review", reviewHours: 24, retainPct: 10, warrantyDays: 30, inspector: ins.id, requireBefore: true } });
  // over the $500 per-job limit? no: $300; options as asked
  assert.ok(!r.error, r.message);
  assert.deepEqual([r.options.releaseMode, r.options.reviewHours, r.options.retainPct, r.options.warrantyDays, r.options.inspector, r.options.requireBefore], ["review", 24, 10, 30, ins.id, true]);
  assert.equal(r.scope.milestones.length, 2, "the multi-day template's milestones");
  const flat = await tools.CUSTOMER.post_job(a, { text: "Replace our 40 gallon water heater this month", zip: "78704", budget: 300, milestones: "none" });
  assert.equal(flat.scope.milestones, null);
  const rv = await tools.CUSTOMER.review_scope(a, { job: r.id });
  assert.ok(Array.isArray(rv.gaps));
  assert.ok((await tools.CUSTOMER.review_scope(a, { scope: r.scope })).gaps);
  // options change after offers: pros are told; a pro may send a new offer, which replaces their open one
  const j = await J.createJob(c.id, { text: "Kitchen faucet keeps dripping. Fix it this week.", zip: "78704", budget: 25000, actor: P(c) });
  await J.requestOffers(j.id, P(c), { now: true });
  const s = await tools.CUSTOMER.set_options(a, { job: j.id, options: { retainPct: 10, releaseMode: "review" } });
  assert.equal(s.options.retainPct, 10);
  assert.ok(s.thread.some((m) => m.type === "terms"));
  assert.ok(J.job(j.id).offers.every((o) => o.status !== "open" || o.termsChanged));
  assert.equal((await tools.CUSTOMER.set_options(a, { job: j.id, options: { milestones: "none" } })).error, "state", "milestones only before offers");
  const x = pros.createPro({ name: "Requote Plumbing (test)", trade: "plumbing", zip: "78704", email: "rq@done-demo.example" });
  pros.setPayPal(x.pro.id, { email: "rq@done-demo.example" });
  const o1 = J.proOffer(x.pro.id, j.id, { amount: 19000 }, PRO(x.pro.id)).offer, o2 = J.proOffer(x.pro.id, j.id, { amount: 18000, note: "with the new terms" }, PRO(x.pro.id)).offer;
  assert.equal(J.job(j.id).offers.find((o) => o.id === o1.id).status, "superseded");
  assert.equal(o2.status, "open");
  await J.acceptOffer(j.id, o2.id, { actor: P(c), payWith: "card" });
  assert.equal((await tools.CUSTOMER.set_options(a, { job: j.id, options: { retainPct: 0 } })).error, "state", "not after an offer is accepted");
});

test("a person-only step gives the agent askPerson: a one-time link that signs the person in on the right setting", async () => {
  const c = person();
  people.updatePerson(c.id, { limits: { perJobMax: 15000 } });
  const r = await tools.CUSTOMER.post_job(agent(c), { text: "Kitchen faucet drips, fix it this week", zip: "78704", budget: 300 });
  assert.equal(r.error, "limit");
  assert.match(r.askPerson.url, /^\/link\?code=/, "the web page first: it shows what was asked");
  assert.equal(r.askPerson.limit, "perJobMax");
  assert.equal(r.askPerson.current, "$150.00");
  assert.equal(r.askPerson.wouldBe, "$300.00");
  assert.equal(r.askPerson.to, "/connect#limits");
  assert.match(r.askPerson.tell, /Show this link to your person/);
  // the link alone never signs anyone in (Judge C: an agent opened its own link): the person proves it with their PIN
  const code = r.askPerson.url.split("code=")[1], auth = await import("../src/auth.js");
  const b = client(), go = await b("GET", `/api/auth/link?code=${code}`);
  assert.equal(go.s, 302);
  assert.match(go.location, /^\/link\?code=/);
  assert.equal((await b("GET", "/api/me")).j.signedIn, false, "no session from the link");
  assert.equal((await b("POST", "/api/auth/link", { code })).s, 401, "the PIN is needed");
  auth.setPin(c.id, "4321");
  assert.equal((await b("POST", "/api/auth/link", { code, pin: "1111" })).s, 403);
  const ok = await b("POST", "/api/auth/link", { code, pin: "4321" });
  assert.equal(ok.j.to, "/connect#limits");
  assert.equal((await b("GET", "/api/me")).j.person.id, c.id, "signed in as the person, with their PIN");
  assert.equal((await client()("POST", "/api/auth/link", { code, pin: "4321" })).s, 410, "one use");
  // the price ceiling: the link lands on the job
  const d = person(), j = await J.createJob(d.id, { text: "Kitchen faucet keeps dripping. Fix it this week.", zip: "78704", budget: 15000, actor: P(d) });
  await J.requestOffers(j.id, P(d), { now: true });
  const over = J.job(j.id).offers.find((o) => o.amount > 15000);
  const acc = await tools.CUSTOMER.accept_offer(agent(d), { job: j.id, offer: over.id });
  assert.equal(acc.limit, "priceCeiling");
  assert.equal(acc.askPerson.to, `/jobs/${j.id}`);
  const llms = await (await fetch(`${base}/llms.txt`)).text();
  assert.match(llms, /askPerson/);
  assert.match(llms, /set_options \{/);
  assert.match(llms, /review_scope \{/);
});

test("the demo inspector is always there; resuming a demo customer accepts personId", async () => {
  const list = (await client()("GET", "/api/inspectors")).j;
  assert.ok(list.length >= 1);
  const a = client(), signup = (await a("POST", "/api/auth/demo", { as: "customer" })).j, me = signup.person;
  assert.match(signup.pinOnce, /^\d{6}$/);
  const b = client();
  assert.equal((await b("POST", "/api/auth/demo", { as: "customer", personId: me.id })).s, 401, "resuming needs the PIN");
  const again = (await b("POST", "/api/auth/demo", { as: "customer", personId: me.id, pin: signup.pinOnce })).j.person;
  assert.equal(again.id, me.id);
});
