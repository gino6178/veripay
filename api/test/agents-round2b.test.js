// Agent test round 2, second batch: the person decides a review (askPerson), the agent reads the evidence, timed
// conditions checked from the cameras' times, how the hold was paid, demo evidence that fits the job, one source of
// truth per check round, sent vs paid, the pro resending during review, parts at the receipt's amount, onboarding links
// that survive previews, and withdrawing an offer.
import test, { after } from "node:test";
import assert from "node:assert/strict";
import { J, person, P, PRO, photo, pp, people, pros, tools, setAI, clock } from "./helpers.js";
process.env.DONE_NO_LISTEN = "1";
const { app } = await import("../src/server.js");
const demopro = await import("../src/demopro.js");
const { makeToken } = await import("../src/auth.js");
const srv = app.listen(0);
srv.keepAliveTimeout = 120e3;
after(() => srv.close());
const base = `http://127.0.0.1:${srv.address().port}`;
const agent = (c) => ({ person: c.id, client: "test agent", scopes: ["read", "hire", "pay"] });
async function hire(c, text = "Kitchen faucet keeps dripping. Fix it this week.", budget = 25000) {
  const j = await J.createJob(c.id, { text, zip: "78704", budget, actor: P(c) });
  await J.requestOffers(j.id, P(c), { now: true });
  const o = J.job(j.id).offers.filter((x) => x.status === "open").sort((a, b) => a.amount - b.amount)[0];
  await J.acceptOffer(j.id, o.id, { actor: P(c), payWith: "card", raiseCeiling: true });
  J.startWork(J.job(j.id).agreed.pro, j.id, PRO(J.job(j.id).agreed.pro));
  return J.job(j.id);
}
const faucet = (j, t = {}) => [{ kind: "photo", buf: photo(j, { taken: t.c1 }), mime: "image/jpeg", checkId: "c1" }, { kind: "photo", buf: photo(j, { taken: t.c2 }), mime: "image/jpeg", checkId: "c2" }, { kind: "receipt", buf: photo(j), mime: "image/jpeg", checkId: "c3", text: t.receipt || "TOTAL 35.00" }];
const deliver = async (j, items) => { J.addEvidence(j.agreed.pro, j.id, items, PRO(j.agreed.pro)); return J.submit(j.agreed.pro, j.id, PRO(j.agreed.pro)); };

test("a timed condition: an after photo taken 5 seconds after the repair photo fails; 12 minutes passes", async () => {
  const c = person(), j = await hire(c), now = clock.now();
  const r = await deliver(j, faucet(j, { c1: new Date(now - 5000).toISOString(), c2: new Date(now).toISOString() }));
  const c2 = r.lastCheck.checks.find((x) => x.id === "c2");
  assert.equal(c2.verdict, "needs_fix");
  assert.ok(c2.signals.includes("time_gap_short"));
  assert.match(c2.reason, /5 seconds after.*at least 10 minutes/);
  assert.equal(J.job(j.id).scope.checks.find((x) => x.id === "c2").ruleText.includes("at least 10 minutes after the c1 photo"), true);
  const r2 = await deliver(J.job(j.id), faucet(J.job(j.id), { c1: new Date(now - 13 * 60e3).toISOString(), c2: new Date(now).toISOString() }));
  assert.equal(r2.status, "released", JSON.stringify(r2.lastCheck.checks));
  assert.equal(r2.lastCheck.decidedFrom.checker, "rules");
  assert.equal(r2.lastCheck.decidedFrom.model, "none");
  assert.equal(r2.lastCheck.decidedFrom.vlm, "none");
  assert.equal((await (await fetch(`${base}/api/models/status?probe=0`)).json()).lastCheck.vlm, "none");
});

test("review without release permission: the agent gets askPerson for the job; it can read the evidence with its token", async () => {
  const c = person(), j = await hire(c);
  setAI({ check: async (job) => ({ checks: job.scope.checks.map((x) => ({ id: x.id, verdict: "pass", reason: "a person should look", confidence: 0.5, signals: ["needs_person"], needsPerson: true })), decision: "review", source: "rules" }) });
  try { await deliver(j, faucet(j)); } finally { setAI({ check: null }); }
  const st = await tools.CUSTOMER.job_status(agent(c), { job: j.id });
  assert.equal(st.status, "review");
  assert.equal(st.askPerson.to, `/jobs/${j.id}`);
  assert.match(st.next, /Your person decides/);
  const rel = await tools.CUSTOMER.release(agent(c), { job: j.id });
  assert.equal(rel.error, "limit");
  assert.equal(rel.askPerson.to, `/jobs/${j.id}`);
  const ev = await tools.CUSTOMER.job_evidence(agent(c), { job: j.id, include: "data" });
  assert.ok(ev.evidence.some((e) => e.kind === "photo" && e.exifSummary.startsWith("taken") && e.dataUrl?.startsWith("data:image/jpeg")));
  const t = makeToken(c.id, "reader", { scopes: ["read"] }).token, url = ev.evidence.find((e) => e.url).url;
  assert.equal((await fetch(base + url, { headers: { authorization: `Bearer ${t}` } })).status, 200);
  const other = makeToken(person().id, "other", { scopes: ["read"] }).token;
  assert.equal((await fetch(base + url, { headers: { authorization: `Bearer ${other}` } })).status, 404);
  // the pro can resend evidence while it's in review: a new round, the queue item closes
  const pv = J.view(J.job(j.id), { as: "pro", pro: j.agreed.pro });
  assert.ok(Array.isArray(pv.toFix));
  const again = await deliver(J.job(j.id), faucet(J.job(j.id)));
  assert.ok(["released", "needs_fix", "review"].includes(again.status));
  assert.equal(J.job(j.id).checks.length, 2);
});

test("accept_offer says how it was paid; payouts: sent is not paid until PayPal says SUCCESS", async () => {
  const c = person(), j = await J.createJob(c.id, { text: "Kitchen faucet keeps dripping. Fix it this week.", zip: "78704", budget: 25000, actor: P(c) });
  await J.requestOffers(j.id, P(c), { now: true });
  const o = J.job(j.id).offers.filter((x) => x.status === "open").sort((a, b) => a.amount - b.amount)[0];
  const r = await tools.CUSTOMER.accept_offer(agent(c), { job: j.id, offer: o.id });
  assert.equal(r.paidWith, "PayPal approval", "no saved method and no payWith: an approval link, not the test card");
  assert.ok(r.approveUrl);
  const r2 = await tools.CUSTOMER.retry_hold(agent(c), { job: j.id, payWith: "card" });
  assert.match(r2.hold.paidWith, /sandbox test card/);
  J.startWork(J.job(j.id).agreed.pro, j.id, PRO(J.job(j.id).agreed.pro));
  const v = await deliver(J.job(j.id), faucet(J.job(j.id)));
  assert.equal(v.status, "released");
  assert.equal(v.payoutState.state, "sent", "PENDING right after the batch");
  await J.tick();
  assert.equal(J.view(J.job(j.id)).payoutState.state, "sent_unclaimed", "a stand-in address: sent, not claimed");
});

test("a parts change order is paid at the receipt's total when it's less", async () => {
  const c = person(), j = await hire(c, undefined, 30000);
  const co = await J.requestChange(j.agreed.pro, j.id, { amount: 5000, reason: "a new shut-off valve" }, PRO(j.agreed.pro));
  await J.approveChange(j.id, co.change.id, P(c));
  const due = J.due(J.job(j.id));
  const r = await deliver(J.job(j.id), faucet(J.job(j.id), { receipt: "Stop valve 43.46\nTAX 3.59\nTOTAL 47.05" }));
  assert.equal(r.status, "released", JSON.stringify(r.lastCheck.checks));
  assert.equal(r.money.captured.cents, due - 295, "$50.00 approved, $47.05 receipt: $2.95 less captured");
  assert.equal(r.milestones[0].release.partsAdjusted.amount, 295);
  assert.ok(r.money.ledger.some((l) => l.kind === "parts_adjusted"));
  assert.ok(r.money.balanced);
});

test("demo evidence fits the job: a drain job gets drain photos, no parts receipt, a drain note", async () => {
  const c = person();
  const j = await J.createJob(c.id, { text: "Bathroom sink drain is clogged and slow. Fix it tomorrow.", zip: "78704", budget: 20000, actor: P(c) });
  await J.requestOffers(j.id, P(c), { now: true });
  const o = J.job(j.id).offers.filter((x) => x.status === "open").sort((a, b) => a.amount - b.amount)[0];
  await J.acceptOffer(j.id, o.id, { actor: P(c), payWith: "card", raiseCeiling: true });
  const steps = await demopro.finishNow(j.id);
  const k = J.job(j.id);
  assert.ok(steps.length >= 2, JSON.stringify(steps));
  const names = k.evidence.map((e) => e.name);
  assert.ok(names.some((n) => /drain|trap/.test(n)), names.join(","));
  assert.ok(!names.some((n) => /faucet|valve/.test(n)), names.join(","));
  assert.ok(!k.evidence.some((e) => e.kind === "receipt"), "no parts, no receipt");
  const note = k.evidence.find((e) => e.kind === "note");
  if (note) assert.match(note.text, /trap|drain/i);
});

test("onboarding links: a GET doesn't use them up; a second link doesn't kill the first; withdraw an offer", async () => {
  const x = pros.createPro({ name: "Preview Plumbing (test)", trade: "plumbing", zip: "78704", email: "pv@done-demo.example" });
  const first = x.onboarding.link.split("code=")[1];
  const second = pros.onboardingLink(x.pro.id).link.split("code=")[1];
  const page = await fetch(`${base}/api/pro/onboard?code=${first}`);
  assert.equal(page.status, 200);
  assert.match(await page.text(), /Continue/);
  const r1 = await fetch(`${base}/api/pro/onboard`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code: first }) });
  assert.equal(r1.status, 200, "still valid after the preview and after a second link");
  const pinOnce = (await r1.json()).pinOnce;
  assert.match(pinOnce, /^\d{6}$/, "the PIN, shown once at onboarding");
  const r2 = await fetch(`${base}/api/pro/onboard`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code: first }) });
  assert.equal(r2.status, 410, "one use");
  // the second link alone no longer signs in: the pro now has a PIN
  assert.equal((await fetch(`${base}/api/pro/onboard`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code: second }) })).status, 401);
  const r3 = await fetch(`${base}/api/pro/onboard`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code: second, pin: pinOnce }) });
  assert.equal(r3.status, 200);
  // withdraw
  const c = person(), j = await J.createJob(c.id, { text: "Kitchen faucet keeps dripping. Fix it this week.", zip: "78704", budget: 25000, actor: P(c) });
  await J.requestOffers(j.id, P(c), { now: true });
  const o = J.proOffer(x.pro.id, j.id, { amount: 15000 }, PRO(x.pro.id)).offer;
  const w = await tools.PRO.withdraw_offer(pros.pro(x.pro.id), { offer: o.id });
  assert.equal(w.offers.find((y) => y.id === o.id).status, "withdrawn");
  assert.equal((await J.acceptOffer(j.id, o.id, { actor: P(c), payWith: "card" })).error, "offer");
});
