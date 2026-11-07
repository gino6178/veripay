// Agent test round 1 findings: pro onboarding and readiness, role-bound tokens, pros seeing only their own offers,
// limits at posting, demo pros' realistic delay and their doing hired jobs, the anonymized demo office, offer
// breakdowns, the clock's last move, human rule text, the hold explained and kept within the ceiling, a hold retry,
// receipts only when there are parts, who acts next, and who may move the shared clock.
import test, { after } from "node:test";
import assert from "node:assert/strict";
import { J, person, P, PRO, photo, pp, people, pros, tools } from "./helpers.js";
process.env.DONE_NO_LISTEN = "1";
const { app } = await import("../src/server.js");
const demopro = await import("../src/demopro.js");
const srv = app.listen(0);
srv.keepAliveTimeout = 120e3;
after(() => srv.close());
const base = `http://127.0.0.1:${srv.address().port}`;
const client = () => { let ck = ""; return async (method, p, body, headers = {}) => { const r = await fetch(base + p, { method, headers: { "content-type": "application/json", cookie: ck, ...headers }, body: body ? JSON.stringify(body) : undefined, redirect: "manual" }); for (const c of r.headers.getSetCookie?.() || []) ck = [...ck.split("; ").filter((x) => x && !x.startsWith(c.split("=")[0])), c.split(";")[0]].join("; "); const t = await r.text(); let j; try { j = JSON.parse(t); } catch { j = t; } return { s: r.status, j }; }; };
const rpc = (data) => ({ jsonrpc: "2.0", id: 1, method: "message/send", params: { message: { kind: "message", role: "user", messageId: "m", parts: [{ kind: "data", data }] } } });

test("a pro staff create: onboarding link signs the person in; readiness says what blocks hiring; early offers are flagged", async () => {
  const staff = client(); await staff("POST", "/api/auth/staff", {});
  const made = (await staff("POST", "/api/staff/pros", { name: "Onboard Plumbing (test)", trade: "plumbing", zip: "78704", email: "onboard@done-demo.example" })).j;
  assert.match(made.onboarding.link, /^\/pro\/onboard\?code=/);
  assert.equal(made.readiness.hireable, false);
  const key = made.key, A = { authorization: `Bearer ${key}` }, a2a = async (data) => (await client()("POST", "/a2a", rpc(data), A)).j.result.parts[0].data;
  const rd = await a2a({ action: "readiness" });
  assert.equal(rd.hireable, false);
  assert.equal(rd.blockers[0].id, "paypal");
  assert.match(rd.onboarding.link, /onboard\?code=/);
  // an offer before verifying: allowed, flagged to the pro and to the customer
  const cust = client(); await cust("POST", "/api/auth/demo", { as: "customer" });
  const job = (await cust("POST", "/api/jobs", { text: "Pipe leak under the kitchen sink, fix this week", zip: "78704", budget: 300, requestOffers: true })).j;
  const off = await a2a({ action: "offer", job: job.id, amount: 180 });
  assert.match(off.warning, /can't be accepted yet/);
  const seen = (await cust("GET", `/api/jobs/${job.id}`)).j.offers.find((o) => o.id === off.offer);
  assert.equal(seen.hireable, false);
  assert.ok(seen.blocked.length);
  // the person opens the link (a second use is refused), verifies PayPal, and the pro is hireable
  const code = rd.onboarding.link.split("code=")[1], pc = client();
  const ob = await pc("POST", "/api/pro/onboard", { code });
  assert.equal(ob.s, 200);
  assert.equal(ob.j.person.role, "pro");
  assert.equal((await client()("POST", "/api/pro/onboard", { code })).s, 410);
  assert.equal((await pc("PUT", "/api/pro/paypal", { email: "onboard@done-demo.example" })).s, 200);
  assert.equal((await pc("GET", "/api/pro/readiness")).j.hireable, true);
  assert.equal((await cust("POST", `/api/jobs/${job.id}/offers/${off.offer}/accept`, { payWith: "card" })).j.status, "held");
  // pros make dpk keys, never customer tokens
  assert.equal((await pc("POST", "/api/tokens", { label: "x" })).s, 403);
});

test("a pro sees only their own offers and their side of the thread", async () => {
  const c = person(), j = await J.createJob(c.id, { text: "Kitchen faucet keeps dripping. Fix it this week.", zip: "78704", budget: 25000, actor: P(c) });
  await J.requestOffers(j.id, P(c), { now: true });
  const mine = "barton-creek-plumbing", v = J.view(J.job(j.id), { as: "pro", pro: mine });
  assert.ok(v.offers.length === 1 && v.offers[0].pro.id === mine);
  assert.ok(v.thread.every((m) => m.from.kind !== "pro_agent" || m.from.pro === mine));
  const a2a = (await tools.PRO.job_status(pros.pro(mine), { job: j.id }));
  assert.equal(a2a.offers.length, 1);
  assert.ok(J.view(J.job(j.id)).offers.length > 1, "the customer sees them all");
});

test("posting over the per-job limit: refused for the agent (with how to raise it), a warning for the person", async () => {
  const c = person(), a = { person: c.id, client: "t", scopes: ["read", "hire", "pay"] };
  const r = await tools.CUSTOMER.post_job(a, { description: "Kitchen faucet drips, fix it this week", zip: "78704", budget: 600 });
  assert.equal(r.error, "limit");
  assert.match(r.message, /\$500\.00.*raise/);
  const ok = await tools.CUSTOMER.post_job(a, { description: "Kitchen faucet drips, fix it this week", zip: "78704", budget: 200 });
  assert.equal(ok.status, "offered", "description is accepted as text");
  const p = await J.createJob(c.id, { text: "Kitchen faucet drips, fix it this week", zip: "78704", budget: 60000, actor: P(c) });
  assert.match(p.warnings[0], /per-job limit/);
  const llms = await (await fetch(`${base}/llms.txt`)).text();
  assert.match(llms, /- post_job \{ text: string/);
  assert.match(llms, /- offer \{ job, amount/);
});

test("demo pros' agents take a realistic while to offer; a real pro's offer is there first and isn't declined", async () => {
  process.env.DONE_DEMO_PRO_DELAY_MS = "150";
  try {
    const c = person(), j = await J.createJob(c.id, { text: "Kitchen faucet keeps dripping. Fix it this week.", zip: "78704", budget: 25000, actor: P(c) });
    await J.requestOffers(j.id, P(c));
    assert.equal(J.job(j.id).offers.length, 0, "nothing at once");
    const x = pros.createPro({ name: "Fast Real Plumber (test)", trade: "plumbing", zip: "78704", email: "fast@done-demo.example" });
    pros.setPayPal(x.pro.id, { email: "fast@done-demo.example" });
    const ro = J.proOffer(x.pro.id, j.id, { amount: 15000 }, PRO(x.pro.id));
    await new Promise((r) => setTimeout(r, 500));
    const k = J.job(j.id);
    assert.ok(k.offers.filter((o) => o.agent === "demo").length >= 3, "the demo pros answered later");
    assert.equal(k.offers.find((o) => o.id === ro.offer.id).status, "open");
    assert.ok(k.offers.every((o) => o.breakdown || o.agent !== "demo"));
    const v = J.view(k).offers.find((o) => o.id === ro.offer.id);
    assert.equal(v.breakdown.given, false, "an external offer always has a breakdown object");
    assert.equal(v.breakdown.total.cents, 15000);
  } finally { process.env.DONE_DEMO_PRO_DELAY_MS = "0"; }
});

test("a demo pro does a visitor's hired job; 'finish now' runs it to the check and the payout", async () => {
  const cust = client(); await cust("POST", "/api/auth/demo", { as: "customer" });
  const j = (await cust("POST", "/api/jobs", { text: "Kitchen faucet keeps dripping. Fix it this week.", zip: "78704", budget: 250, requestOffers: true })).j;
  const o = j.offers.filter((x) => x.status === "open").sort((a, b) => a.amount.cents - b.amount.cents)[0];
  const a0 = (await cust("POST", `/api/jobs/${j.id}/offers/${o.id}/accept`, { payWith: "saved" })).j;
  assert.equal(a0.status, "agreed", "saved with nothing saved: the person approves in PayPal, never the test card by default");
  assert.match(a0.hold.note, /No saved payment method yet/);
  assert.match(a0.hold.approveUrl, /mock-paypal\/approve/);
  const h = (await cust("POST", `/api/jobs/${j.id}/hold/retry`, { payWith: "card" })).j;
  assert.equal(h.status, "held");
  assert.ok(h.hold.amount.cents <= 25000, "the hold stays within the $250 budget");
  assert.match(h.hold.explain, /buffer/);
  assert.equal(h.waitingOn.who, "pro");
  const f = await cust("POST", `/api/jobs/${j.id}/demo-finish`, {});
  assert.equal(f.s, 200);
  assert.ok(["released", "review"].includes(f.j.status), JSON.stringify(f.j.demo.steps));
  assert.ok(f.j.evidence.some((e) => e.phase === "before"));
  assert.ok(f.j.evidence.filter((e) => e.kind === "photo" && e.phase === "after").every((e) => e.exif?.taken));
  if (f.j.status === "released") assert.ok(f.j.money.payout.batchId);
  assert.ok(f.j.scope.checks.every((c) => typeof c.ruleText === "string"));
});

test("the back office: a customer session never reaches /api/staff; the demo office is read-only and anonymized; the clock", async () => {
  const cust = client(); const me = (await cust("POST", "/api/auth/demo", { as: "customer", name: "Office Tester" })).j.person;
  assert.equal((await cust("GET", "/api/staff/overview")).s, 401);
  assert.equal((await cust("GET", "/api/staff/jobs")).s, 401);
  const office = await cust("GET", "/api/demo/office");
  assert.equal(office.j.readOnly, true);
  assert.ok(!JSON.stringify(office.j).includes(me.name));
  assert.ok(!/p_[0-9a-f]{10}/.test(JSON.stringify(office.j)));
  // the shared clock: not with an agent token, not anonymously; the move is in /api/info
  const t = (await cust("POST", "/api/tokens", { label: "a" })).j.token;
  assert.equal((await client()("POST", "/api/demo/advance", { hours: 1 }, { authorization: `Bearer ${t}` })).s, 403);
  assert.equal((await client()("POST", "/api/demo/advance", { hours: 1 })).s, 401);
  assert.equal((await cust("POST", "/api/demo/advance", { hours: 1 })).s, 200);
  const info = (await cust("GET", "/api/info")).j;
  assert.match(info.clock.lastAdvance.by, /Office Tester/);
});

test("retry a failed hold; receipts aren't asked for with no parts; wait_for_news says who acts next", async () => {
  const c = person();
  const j = await J.createJob(c.id, { text: "Kitchen faucet keeps dripping. Fix it this week.", zip: "78704", budget: 25000, actor: P(c) });
  await J.requestOffers(j.id, P(c), { now: true });
  // a real pro with no parts in the price
  const x = pros.createPro({ name: "No Parts Plumbing (test)", trade: "plumbing", zip: "78704", email: "np@done-demo.example" });
  pros.setPayPal(x.pro.id, { email: "np@done-demo.example" });
  const off = J.proOffer(x.pro.id, j.id, { amount: 12000 }, PRO(x.pro.id)).offer;
  await J.acceptOffer(j.id, off.id, { actor: P(c), payWith: "card" });
  const v = J.view(J.job(j.id));
  assert.equal(v.status, "held");
  J.startWork(x.pro.id, j.id, PRO(x.pro.id));
  const k = J.job(j.id), items = k.scope.checks.filter((c2) => c2.evidence === "photo").map((c2) => ({ kind: "photo", buf: photo(k), mime: "image/jpeg", checkId: c2.id }));
  J.addEvidence(x.pro.id, j.id, items, PRO(x.pro.id));
  const r = await J.submit(x.pro.id, j.id, PRO(x.pro.id));
  const rc = r.lastCheck.checks.find((c2) => J.job(j.id).scope.checks.find((s) => s.id === c2.id).evidence === "receipt");
  assert.equal(rc.verdict, "pass");
  assert.match(rc.reason, /no receipt is needed/);
  // a declined card: the hold fails, the job stays agreed, retry_hold places it
  const d = person(); await J.createJob(d.id, { text: "x faucet drips now", zip: "78704", budget: 25000, actor: P(d) }).catch(() => {});
  const jj = await J.createJob(d.id, { text: "Kitchen faucet keeps dripping. Fix it this week.", zip: "78704", budget: 25000, actor: P(d) });
  await J.requestOffers(jj.id, P(d), { now: true });
  const cheapest = J.job(jj.id).offers.filter((o) => o.status === "open").sort((a, b) => a.amount - b.amount)[0];
  await J.acceptOffer(jj.id, cheapest.id, { actor: P(d), payWith: "card" });
  // a second job for d: the saved card declines once
  const kk = await J.createJob(d.id, { text: "Kitchen faucet keeps dripping. Fix it this week.", zip: "78704", budget: 25000, actor: P(d) });
  await J.requestOffers(kk.id, P(d), { now: true });
  pp().failNextCharge(people.person(d.id).vault);
  const ch = J.job(kk.id).offers.filter((o) => o.status === "open").sort((a, b) => a.amount - b.amount)[0];
  const fail = await J.acceptOffer(kk.id, ch.id, { actor: P(d), payWith: "saved" });
  assert.equal(fail.error, "paypal");
  assert.equal(J.job(kk.id).status, "agreed");
  const a = { person: d.id, client: "t", scopes: ["read", "hire", "pay"] };
  assert.equal((await tools.CUSTOMER.retry_hold(a, { job: kk.id })).status, "held");
  const news = await tools.CUSTOMER.wait_for_news(a, { after: 0, seconds: 1 });
  assert.ok(news.jobs.some((x) => x.job === kk.id && x.waitingOn.who === "pro"));
  assert.ok(demopro.workDelay() < 0, "tests drive the demo pros themselves");
});
