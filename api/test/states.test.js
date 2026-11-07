// The job state machine, every path in PLAN §3: draft -> scoped -> offered -> agreed -> held -> working -> submitted ->
// checking -> released | needs_fix -> submitted | review -> release / fix / dispute | disputed -> resolved; cancelled
// (void) and expired.
import test from "node:test";
import assert from "node:assert/strict";
import { J, person, P, PRO, AGENT, offered, held, deliver, faucetEvidence, pp, setAI, cents, photo } from "./helpers.js";

test("happy path: scope, offers, counter, accept + hold, work, evidence, all pass, paid at once", async () => {
  const c = person();
  const j0 = await J.createJob(c.id, { text: "Kitchen faucet keeps dripping. Fix it this week, $200 max.", zip: "78704", budget: 20000, actor: P(c) });
  assert.equal(j0.status, "scoped");
  assert.equal(j0.scope.trade, "plumbing");
  assert.equal(j0.scope.source, "rules");
  assert.deepEqual(j0.scope.checks.map((x) => x.evidence), ["photo", "photo", "receipt"]);
  assert.deepEqual(j0.timeline.map((t) => t.to), ["draft", "scoped"]);
  await J.requestOffers(j0.id, P(c));
  let j = J.job(j0.id);
  assert.equal(j.status, "offered");
  assert.ok(j.offers.length >= 3, "several demo plumbers quote");
  assert.ok(j.offers.every((o) => o.amount % 500 === 0 && o.floor <= o.amount));
  // counter once
  const o = j.offers.sort((a, b) => a.amount - b.amount)[0];
  const r = await J.counterOffer(j.id, o.id, Math.round(o.amount * 0.92 / 500) * 500, P(c));
  assert.ok(!r.error, r.message);
  assert.equal(o.answer.kind, "accept");
  assert.equal((await J.counterOffer(j.id, o.id, 10000, P(c))).error, "one_counter");
  // accept: agreed then held at once (the test card)
  const v = await J.acceptOffer(j.id, o.id, { actor: P(c), payWith: "card" });
  assert.equal(v.status, "held");
  assert.ok(v.hold.amount.cents >= o.amount + Math.min(Math.round(o.amount * 0.2), Math.max(0, 20000 - o.amount)) && v.hold.amount.cents <= Math.max(20000, o.amount), "the buffer (at least 20%, more with overrun risk) stays within the $200 ceiling");
  assert.match(v.hold.explain, /buffer/);
  assert.match(v.hold.authorization, /^AUTH-/);
  assert.ok(j.offers.filter((x) => x.id !== o.id).every((x) => x.status === "declined"));
  // work and evidence
  assert.equal(J.startWork(j.agreed.pro, j.id, PRO(j.agreed.pro)).status, "working");
  const done = await deliver(j);
  assert.equal(done.status, "released", JSON.stringify(done.lastCheck?.checks));
  assert.deepEqual(J.job(j.id).timeline.map((t) => t.to).slice(-4), ["working", "submitted", "checking", "released"]);
  assert.equal(done.lastCheck.decision, "release");
  assert.equal(done.money.captured.cents, o.answer.amount);
  assert.ok(done.money.payout.batchId);
  assert.ok(cents(j).ok);
  assert.ok(done.receipts.some((x) => x.event === "released"));
});

test("needs_fix -> submitted again -> released", async () => {
  const c = person(), j = await held(c);
  // only two of the three done-conditions
  const r = await deliver(j, faucetEvidence(j).slice(0, 2));
  assert.equal(r.status, "needs_fix");
  assert.equal(r.lastCheck.checks.find((x) => x.id === "c3").verdict, "needs_fix");
  assert.equal(pp()._db.data.captures && Object.keys(pp()._db.data.captures).length >= 0, true);
  assert.equal(J.job(j.id).money.captured, null, "nothing captured while it waits for the fix");
  const r2 = await deliver(J.job(j.id), [faucetEvidence(j)[2]]);
  assert.equal(r2.status, "released");
  assert.equal(r2.checks.length, 2);
});

test("three fixes and it goes to the customer (review)", async () => {
  const c = person(), j = await held(c);
  for (let i = 0; i < 3; i++) assert.equal((await deliver(J.job(j.id), faucetEvidence(j).slice(0, 1))).status, "needs_fix");
  assert.equal((await deliver(J.job(j.id), faucetEvidence(j).slice(0, 1))).status, "review");
});

test("review: the customer releases, or asks for a fix", async () => {
  const c = person(), j = await held(c);
  setAI({ check: async (job) => ({ checks: job.scope.checks.map((x) => ({ id: x.id, verdict: "pass", reason: "looks right", confidence: 0.5, signals: [] })), decision: "release", source: "test-model" }) });
  try {
    const r = await deliver(j);
    assert.equal(r.status, "review", "low confidence is never paid by itself, whatever the model says");
    assert.equal(r.lastCheck.checkerSuggested, "release");
    assert.equal(r.lastCheck.decidedBy.startsWith("rules"), true);
    // the agent may not release without the person's permission
    assert.equal((await J.release(j.id, AGENT(c))).error, "limit");
    const fix = J.requestFix(j.id, "the second photo is blurry", P(c));
    assert.equal(fix.status, "needs_fix");
    const r2 = await deliver(J.job(j.id));
    assert.equal(r2.status, "review");
    const paid = await J.release(j.id, P(c));
    assert.equal(paid.status, "released");
    assert.ok(cents(j).ok);
  } finally { setAI({ check: null }); }
});

test("review -> disputed -> resolved by agreement (part released, part refunded)", async () => {
  const c = person(), j = await held(c);
  setAI({ check: async (job) => ({ checks: job.scope.checks.map((x, i) => ({ id: x.id, verdict: i === 1 ? "fail" : "pass", reason: i === 1 ? "still drips" : "ok", confidence: 0.9, signals: [] })), decision: "review", source: "test-model" }) });
  try { assert.equal((await deliver(j)).status, "review"); } finally { setAI({ check: null }); }
  const d = await J.openDispute(j.id, "It still drips at night.", P(c));
  assert.equal(d.status, "disputed");
  assert.ok(d.dispute.summary.facts.checks.length === 3);
  assert.equal(d.dispute.summary.suggestion.source, "rules");
  const due = J.due(J.job(j.id)), R = Math.round(due * 0.6);
  J.proposeSettlement(j.id, R, PRO(j.agreed.pro));
  assert.equal((await J.acceptSettlement(j.id, PRO(j.agreed.pro))).error, "proposal", "the side that proposed can't accept");
  const r = await J.acceptSettlement(j.id, P(c));
  assert.equal(r.status, "resolved");
  const b = cents(j);
  assert.equal(b.captured, due);
  assert.equal(b.refunded, due - R);
  assert.equal(b.pro + b.helper + b.fee, R);
  assert.ok(b.ok);
});

test("disputed -> resolved by staff: refund (void) and release", async () => {
  const c = person(), j = await held(c);
  J.startWork(j.agreed.pro, j.id, PRO(j.agreed.pro));
  await J.openDispute(j.id, "The pro never showed up.", P(c));
  assert.equal((await J.resolve(j.id, { outcome: "refund" }, P(c))).error, "forbidden");
  const r = await J.resolve(j.id, { outcome: "refund" });
  assert.equal(r.status, "resolved");
  assert.equal(r.hold.status, "voided");
  assert.equal(r.money.captured.cents, 0);
  const j2 = await held(person());
  await J.openDispute(j2.id, "We disagree on the finish.", PRO(j2.agreed.pro));
  const r2 = await J.resolve(j2.id, { outcome: "release" });
  assert.equal(r2.status, "resolved");
  assert.equal(r2.money.refunded.cents, 0);
});

test("cancel: before a hold, and with a hold (voided, nothing charged); not once work started", async () => {
  const c = person(), j = await offered(c);
  assert.equal((await J.cancel(j.id, P(c))).status, "cancelled");
  assert.ok(J.job(j.id).offers.every((o) => o.status !== "open"));
  const h = await held(person());
  const v = await J.cancel(h.id, P({ id: h.customer }));
  assert.equal(v.status, "cancelled");
  assert.equal(v.hold.status, "voided");
  assert.equal(v.money.captured.cents, 0);
  const w = await held(person());
  J.startWork(w.agreed.pro, w.id, PRO(w.agreed.pro));
  assert.equal((await J.cancel(w.id, P({ id: w.customer }))).error, "state");
});

test("a person can't accept over the price ceiling unless they raise it; the scope keeps where it came from", async () => {
  const c = person(), j = await offered(c);
  const over = j.offers.find((o) => o.amount > j.scope.priceCeiling);
  const r = await J.acceptOffer(j.id, over.id, { actor: P(c), payWith: "card" });
  assert.equal(r.error, "ceiling");
  assert.equal(r.ceiling.usd, "$200.00");
  const ok = await J.acceptOffer(j.id, over.id, { actor: P(c), payWith: "card", raiseCeiling: true });
  assert.equal(ok.status, "held");
  assert.equal(ok.scope.priceCeiling.cents, over.amount);
  assert.ok(J.job(j.id).timeline.some((t) => /ceiling raised/.test(t.note || "")));
  // a scope previewed by the rules and posted back keeps source "rules" and says the person edited it
  const { rulesScope } = await import("../src/rules.js");
  const pre = rulesScope({ text: "Kitchen faucet drips, this week", zip: "78704" });
  const k = await J.createJob(c.id, { text: "Kitchen faucet drips, this week", zip: "78704", scope: { ...pre, title: "Fix my kitchen faucet" }, actor: P(c) });
  assert.equal(k.scope.source, "rules");
  assert.equal(k.scope.editedBy, "person");
  const e = J.editScope(k.id, { title: "Fix the kitchen faucet drip" }, P(c));
  assert.equal(e.scope.source, "rules");
});

test("review wording: all passed but a person must confirm, versus a failed check", async () => {
  const { setAI } = await import("./helpers.js");
  const c = person(), j = await held(c);
  setAI({ check: async (job) => ({ checks: job.scope.checks.map((x) => ({ id: x.id, verdict: "pass", reason: "ok", confidence: 0.4, signals: ["needs_person"] })), decision: "review", source: "test" }) });
  try { const r = await deliver(j); assert.equal(r.status, "review"); assert.match(r.next, /Every check passed, but some need a person to confirm/); } finally { setAI({ check: null }); }
  const k = await held(person());
  setAI({ check: async (job) => ({ checks: job.scope.checks.map((x, i) => ({ id: x.id, verdict: i ? "pass" : "fail", reason: "x", confidence: 0.9, signals: [] })), decision: "review", source: "test" }) });
  try { assert.match((await deliver(k)).next, /Some checks didn't pass/); } finally { setAI({ check: null }); }
});

test("illegal moves are refused", async () => {
  const c = person(), j = await offered(c);
  assert.equal(J.startWork("barton-creek-plumbing", j.id, PRO("barton-creek-plumbing")).error, "forbidden");
  assert.equal((await J.release(j.id, P(c))).error, "state");
  assert.equal(J.requestFix(j.id, "x", P(c)).error, "state");
  const other = person();
  assert.equal((await J.acceptOffer(j.id, j.offers[0].id, { actor: P(other) })).error, "forbidden");
  const h = await held(person());
  assert.equal((await J.submit(h.agreed.pro, h.id, PRO(h.agreed.pro))).error, "evidence", "no evidence, no check");
});

test("first-time PayPal: approve, then confirm; the payment method is saved for the next hold", async () => {
  const c = person(), j = await offered(c);
  const o = j.offers.slice().sort((a, b) => a.amount - b.amount)[0];
  const v = await J.acceptOffer(j.id, o.id, { actor: P(c), payWith: "paypal" });
  assert.equal(v.status, "agreed");
  assert.match(v.approveUrl, /mock-paypal\/approve\?token=/);
  assert.equal((await J.confirmHold(j.id, P(c))).status, "agreed", "not approved yet");
  pp().approve({ token: v.orderId });
  const h = await J.confirmHold(j.id, P(c), { orderId: v.orderId });
  assert.equal(h.status, "held");
  assert.match((await import("../src/people.js")).person(c.id).vault, /^paypal:/);
  // the next job holds with no approval
  const j2 = await offered(c);
  const cheapest = j2.offers.slice().sort((a, b) => a.amount - b.amount)[0];
  const v2 = await J.acceptOffer(j2.id, cheapest.id, { actor: AGENT(c) });
  assert.equal(v2.status, "held");
  assert.equal(v2.hold.payWith, "saved");
});

test("an open job nobody hires expires after 7 days; a hold never approved expires after 3", async () => {
  const { clock } = await import("./helpers.js");
  const c = person(), j = await offered(c);
  const k = await offered(person());
  await J.acceptOffer(k.id, k.offers[0].id, { actor: P({ id: k.customer }), payWith: "paypal" });
  clock.advance(8, "test");
  await J.tick();
  assert.equal(J.job(j.id).status, "expired");
  assert.equal(J.job(k.id).status, "expired");
  assert.ok(J.job(j.id).offers.every((o) => o.status !== "open"));
});
