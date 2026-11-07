// Agent test round 2, Luis (a real pro's agent): the job feed within the service radius with a since cursor, the pro's
// wait_for_news, setting rates, unknown fields refused, insurance in dollars, and the seeded customers' demo agent.
import test, { after } from "node:test";
import assert from "node:assert/strict";
import { J, person, P, PRO, people, pros, tools } from "./helpers.js";
process.env.DONE_NO_LISTEN = "1";
const { app } = await import("../src/server.js");
const demopro = await import("../src/demopro.js");
const srv = app.listen(0);
after(() => srv.close());
const base = `http://127.0.0.1:${srv.address().port}`;

test("the pro feed: open jobs in the trade within the radius, newest first, a since cursor; news arrives without polling", async () => {
  const x = pros.createPro({ name: "Luis Feed Plumbing (test)", trade: "plumbing", zip: "78721", email: "lf@done-demo.example" }), p = pros.pro(x.pro.id);
  const c = person({ zip: "78702" });
  const j1 = await J.createJob(c.id, { text: "Kitchen faucet keeps dripping. Fix it this week.", zip: "78702", budget: 25000, actor: P(c) });
  await J.requestOffers(j1.id, P(c), { now: true });
  const feed = await tools.PRO.list_jobs(p, {});
  const f1 = feed.jobs.find((f) => f.id === j1.id);
  assert.ok(f1, "a 78702 job is in a 78721 pro's feed");
  assert.ok(f1.miles < 5);
  assert.ok(feed.jobs.every((f, i, a) => i === 0 || a[i - 1].created >= f.created), "newest first");
  // wait_for_news: a new job wakes it
  const last = (await tools.PRO.wait_for_news(p, { after: 0, seconds: 1 })).last;
  const waiting = tools.PRO.wait_for_news(p, { after: last, seconds: 10 });
  const j2 = await J.createJob(c.id, { text: "Toilet keeps running after every flush. Fix this week.", zip: "78702", budget: 20000, actor: P(c) });
  const news = await waiting;
  assert.ok(news.events.some((e) => e.job === j2.id), JSON.stringify(news.events));
  const since = await tools.PRO.list_jobs(p, { since: f1.created });
  assert.ok(since.jobs.every((f) => f.created > f1.created) && since.jobs.some((f) => f.id === j2.id));
  // outside the radius: a 10-mile radius from 78721 doesn't reach 78749
  pros.setRates(p.id, { radius: 10 });
  const far = person({ zip: "78749" }), j3 = await J.createJob(far.id, { text: "Kitchen faucet keeps dripping. Fix it this week.", zip: "78749", budget: 25000, actor: P(far) });
  assert.ok(!(await tools.PRO.list_jobs(p, {})).jobs.some((f) => f.id === j3.id));
});

test("a pro sets their rates in dollars; unknown fields are refused; insurance limits are dollars too", async () => {
  const x = pros.createPro({ name: "Rates Plumbing (test)", trade: "plumbing", zip: "78721", email: "rt@done-demo.example" });
  const r = await tools.PRO.set_rates(pros.pro(x.pro.id), { callout: 85, hourly: 110, radius: 20, partsPolicy: "at_cost" });
  assert.equal(r.rules.callout, "$85.00");
  assert.equal(r.rules.hourly, "$110.00");
  assert.equal(pros.pro(x.pro.id).rules.hourly, 11000);
  assert.equal(pros.setRates(x.pro.id, { hourlyRate: 110 }).error, "fields");
  assert.equal(pros.setPayPal(x.pro.id, { paypalEmail: "x@y.z" }).error, "fields");
  const v = pros.setVerification(x.pro.id, { license: { number: "M-41877" }, insurance: { carrier: "Acme Mutual", policy: "GL-445566", limit: 1000000, expires: "2030-01-01" } });
  assert.equal(v.verification.insurance.valid, true);
  assert.equal(v.verification.insurance.limit, "$1,000,000.00");
  assert.equal(pros.setVerification(x.pro.id, { insurance: { limitCents: 1 } }).error, "fields");
  const llms = await (await fetch(`${base}/llms.txt`)).text();
  assert.match(llms, /\/api\/pro\/verification \{license/);
  assert.match(llms, /set_rates \{/);
});

test("a seeded customer's demo agent accepts the best hireable offer, a real pro's included; visitors' jobs are left alone", async () => {
  const seededC = people.makePerson({ name: "Demo · Seeded", zip: "78704", via: "seed" });
  const j = await J.createJob(seededC.id, { text: "Kitchen faucet keeps dripping. Fix it this week.", zip: "78704", budget: 25000, actor: P(seededC) });
  await J.requestOffers(j.id, P(seededC), { now: true });
  const x = pros.createPro({ name: "Cheap Real Plumber (test)", trade: "plumbing", zip: "78704", email: "cr@done-demo.example" });
  pros.setPayPal(x.pro.id, { email: "cr@done-demo.example" });
  const o = J.proOffer(x.pro.id, j.id, { amount: 12000 }, PRO(x.pro.id)).offer;
  const r = await demopro.customerDecides(j.id);
  assert.equal(r.status, "held");
  assert.equal(J.job(j.id).agreed.pro, x.pro.id, "the cheapest hireable offer, from the real pro");
  assert.equal(J.job(j.id).agreed.by.client, "Customer's agent");
  const visitor = person(), k = await J.createJob(visitor.id, { text: "Kitchen faucet keeps dripping. Fix it this week.", zip: "78704", budget: 25000, actor: P(visitor) });
  await J.requestOffers(k.id, P(visitor), { now: true });
  assert.equal(await demopro.customerDecides(k.id), null);
  assert.equal(J.job(k.id).status, "offered");
});
