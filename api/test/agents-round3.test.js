// Red team round 3: a pro whose person exists always gets a way back onto the website; withdrawing and re-offering
// keeps the negotiation (no higher price, the customer's counter-once per pro per job, the history kept).
import test, { after } from "node:test";
import assert from "node:assert/strict";
import { J, person, P, PRO, pros, tools } from "./helpers.js";
process.env.DONE_NO_LISTEN = "1";
const { app } = await import("../src/server.js");
const srv = app.listen(0);
after(() => srv.close());
const base = `http://127.0.0.1:${srv.address().port}`;

test("a pro whose onboarding link was used still gets in: readiness gives a fresh one-time sign-in link", async () => {
  const x = pros.createPro({ name: "Shady Test Fix-It", trade: "plumbing", zip: "78704", email: "st@done-demo.example" });
  const code = x.onboarding.link.split("code=")[1];
  const ob = await fetch(`${base}/api/pro/onboard`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code, pin: "2580" }) });
  assert.equal(ob.status, 200);
  assert.equal((await ob.json()).pinOnce, undefined, "a PIN the pro chose is never echoed");
  assert.equal((await fetch(`${base}/api/pro/onboard`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code }) })).status, 410);
  const rd = await tools.PRO.readiness(pros.pro(x.pro.id));
  assert.match(rd.signIn.url, /^\/link\?code=/);
  assert.equal(rd.signIn.to, "/pro");
  // the link opens the page; the pro signs in there with their PIN
  const lc = rd.signIn.url.split("code=")[1];
  const go = await fetch(`${base}/api/auth/link?code=${lc}`, { redirect: "manual" });
  assert.equal(go.status, 302);
  assert.equal(go.headers.get("set-cookie"), null, "the link alone signs nobody in");
  const post = await fetch(`${base}/api/auth/link`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code: lc, pin: "2580" }) });
  assert.equal(post.status, 200);
  const ck = post.headers.get("set-cookie").split(";")[0];
  const me = await (await fetch(`${base}/api/me`, { headers: { cookie: ck } })).json();
  assert.equal(me.pro.id, x.pro.id, "signed in as that pro's person");
  assert.ok((await tools.PRO.my_profile(pros.pro(x.pro.id))).readiness.signIn.url, "my_profile too, every time");
});

test("withdraw and re-offer keeps the negotiation: no higher price, one counter per pro per job, history kept", async () => {
  const x = pros.createPro({ name: "Reoffer Plumbing (test)", trade: "plumbing", zip: "78704", email: "ro@done-demo.example" });
  pros.setPayPal(x.pro.id, { email: "ro@done-demo.example" });
  const c = person(), j = await J.createJob(c.id, { text: "Kitchen faucet keeps dripping. Fix it this week.", zip: "78704", budget: 25000, actor: P(c) });
  await J.requestOffers(j.id, P(c), { now: true });
  const o1 = J.proOffer(x.pro.id, j.id, { amount: 20000 }, PRO(x.pro.id)).offer;
  await J.counterOffer(j.id, o1.id, 15000, P(c));
  assert.equal(J.proOffer(x.pro.id, j.id, { amount: 19000 }, PRO(x.pro.id)).error, "offer", "answer the counter first");
  J.withdrawOffer(x.pro.id, o1.id, PRO(x.pro.id));
  const hi = J.proOffer(x.pro.id, j.id, { amount: 24000 }, PRO(x.pro.id));
  assert.equal(hi.error, "amount", "not above the last price");
  const o2 = J.proOffer(x.pro.id, j.id, { amount: 19000 }, PRO(x.pro.id)).offer;
  assert.equal(o2.previous, o1.id);
  assert.equal((await J.counterOffer(j.id, o2.id, 15000, P(c))).error, "one_counter", "the customer countered this pro on this job already");
  const v = J.view(J.job(j.id));
  assert.ok(v.offers.some((o) => o.id === o1.id && o.status === "withdrawn"), "the history is kept");
  assert.equal(v.offers.find((o) => o.id === o2.id).counterUsed, true);
  // after the customer changes the terms, a higher price is allowed
  J.setOptions(j.id, { retainPct: 10 }, P(c));
  J.withdrawOffer(x.pro.id, o2.id, PRO(x.pro.id));
  assert.ok(!J.proOffer(x.pro.id, j.id, { amount: 21000 }, PRO(x.pro.id)).error);
});
