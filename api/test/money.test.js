// Every cent adds up: capture = pro + helper + platform fee (10%) + refund, for released jobs, settled disputes with a
// partial refund, odd amounts and helpers; the unused buffer is never captured; one Payouts batch with one item per
// payee; signed receipts that verify. And the pro agents' negotiation rules.
import test from "node:test";
import assert from "node:assert/strict";
import { J, person, P, PRO, held, deliver, faucetEvidence, pp, cents, receipts, pros, setAI } from "./helpers.js";
import { answerCounter, quoteFor } from "../src/pros.js";

test("split(): fee 10%, helper share of the rest, to the cent, for many amounts", () => {
  for (let R = 1; R < 200000; R += 997) for (const share of [0, 0.15, 0.2, 0.25, 0.45]) {
    const s = J.split(R, share);
    assert.equal(s.pro + s.helper + s.fee, R);
    assert.ok(s.pro >= 0 && s.helper >= 0 && s.fee >= 0);
    assert.equal(s.fee, Math.round(R * 0.1));
  }
});

test("a released job with a helper: one Payouts batch, one item per payee, every cent accounted for", async () => {
  const c = person(), j = await held(c);
  // hire the pro that brings a helper
  const k = await (async () => { const { offered } = await import("./helpers.js"); const x = await offered(person()); const o = x.offers.find((y) => y.helper && y.status === "open"); const v = await J.acceptOffer(x.id, o.id, { actor: P({ id: x.customer }), payWith: "card", raiseCeiling: o.amount > x.scope.priceCeiling });
    assert.ok(!v.error, v.message); return J.job(x.id); })();
  assert.ok(k.agreed.helper);
  const r = await deliver(k);
  assert.equal(r.status, "released");
  const b = cents(k);
  assert.ok(b.ok);
  assert.equal(b.captured, J.due(J.job(k.id)));
  assert.equal(b.fee, Math.round(b.captured * 0.1));
  assert.ok(b.helper > 0);
  const batch = Object.values(pp()._db.data.payouts).find((x) => x.sender === `${k.id}-payout`);
  assert.equal(batch.items.length, 2);
  assert.deepEqual(batch.items.map((x) => x.amount).sort((a, b) => a - b), [b.helper, b.pro].sort((a, b) => a - b));
  assert.equal(batch.items.reduce((t, x) => t + x.amount, 0) + b.fee, b.captured);
  // the stand-in's own record agrees: the authorization captured exactly what was due, and closed
  const auth = pp()._db.data.auths[k.hold.authorization];
  assert.equal(auth.captured, b.captured);
  assert.equal(auth.status, "CAPTURED");
  assert.ok(auth.amount >= auth.captured, "never more captured than held");
  await deliver(j);
  assert.ok(cents(j).ok);
});

test("a dispute settled part and part: capture what's due, refund the rest with a partial refund", async () => {
  const c = person(), j = await held(c);
  J.startWork(j.agreed.pro, j.id, PRO(j.agreed.pro));
  await J.openDispute(j.id, "Only half the work was done.", P(c));
  const d = J.due(J.job(j.id)), R = 7333;
  const r = await J.resolve(j.id, { outcome: "partial", release: R });
  assert.equal(r.status, "resolved");
  const b = cents(j);
  assert.equal(b.captured, d);
  assert.equal(b.refunded, d - R);
  assert.equal(b.pro + b.helper + b.fee, R);
  assert.ok(b.ok);
  const cap = pp()._db.data.captures[J.job(j.id).hold.capture];
  assert.equal(cap.refunded, d - R, "PayPal's capture shows the partial refund");
  assert.ok(r.money.ledger.some((l) => l.kind === "refund" && l.amount.cents === d - R));
});

test("stand-in follows PayPal: no capture over the hold's allowance, no refund over the capture, reauthorize not too soon", async () => {
  const j = await held(person());
  const a = j.hold.authorization;
  await assert.rejects(pp().capture(a, { amount: j.hold.amount + Math.min(Math.round(j.hold.amount * 0.15), 7500) + 1 }), /MAX_CAPTURE_AMOUNT_EXCEEDED/); // over PayPal's 115% / +$75 allowance
  await assert.rejects(pp().reauthorize(a, { amount: 100 }), /REAUTHORIZATION_TOO_SOON/);
  const c = await pp().capture(a, { amount: 1000, final: true });
  await assert.rejects(pp().capture(a, { amount: 100 }), /ALREADY_CAPTURED/);
  await assert.rejects(pp().refund(c.id, { amount: 1001 }), /REFUND_AMOUNT_EXCEEDED/);
  await assert.rejects(pp().voidAuthorization(a), /CANNOT_BE_VOIDED/);
  const same1 = await pp().refund(c.id, { amount: 300, requestId: "r1" }), same2 = await pp().refund(c.id, { amount: 300, requestId: "r1" });
  assert.equal(same1.id, same2.id, "the same PayPal-Request-Id is the same refund");
});

test("receipts are signed, batched into the log, and verify; a changed receipt doesn't", async () => {
  const j = await held(person());
  await deliver(j);
  const ids = J.job(j.id).receipts.map((r) => r.id);
  assert.ok(ids.length >= 4);
  await receipts.batch();
  const r = receipts.show(ids.at(-1));
  const v = receipts.verify(r);
  assert.deepEqual([v.hash, v.signature, v.proof, v.log], [true, true, true, true]);
  assert.ok(r.body.data.balanced);
  const bad = structuredClone(r);
  bad.body.data.split.pro += 1;
  assert.equal(receipts.verify(bad).hash, false);
});

test("pro agents: quotes from rules, one counter, never under the floor; a model can't change a number", async () => {
  assert.deepEqual(answerCounter({ ask: 20000, floor: 18000, amount: 18500 }), { kind: "accept", amount: 18500 });
  assert.deepEqual(answerCounter({ ask: 20000, floor: 18000, amount: 16000 }), { kind: "counter", amount: 18000 });
  assert.equal(answerCounter({ ask: 20000, floor: 18000, amount: 11000 }).kind, "decline");
  assert.equal(answerCounter({ ask: 20000, floor: 18000, amount: 16000, countered: true }).kind, "decline");
  const p = pros.pro("barton-creek-plumbing");
  const q = quoteFor(p, { address: { lat: 30.243, lng: -97.765 }, scope: { estimate: { hours: 1, parts: 3500 }, window: { from: new Date().toISOString(), to: new Date(Date.now() + 5 * 864e5).toISOString() } } });
  assert.equal(q.ask, q.breakdown.callout + q.breakdown.labor + q.breakdown.parts + q.breakdown.travel);
  assert.ok(quoteFor(p, { address: { lat: 31.5, lng: -97.1 }, scope: {} }).decline, "outside the service area");
  // a model that writes a different number is dropped for the rules' sentence
  setAI({ chat: async () => ({ text: "We'll do it for $99!", source: "model", ms: 5 }) });
  try {
    const s = await pros.say(p, "accept", { amount: 18500 });
    assert.equal(s.source, "rules");
    assert.match(s.text, /\$185\.00/);
    setAI({ chat: async () => ({ text: "Deal at $185.00, see you soon.", source: "model", ms: 5 }) });
    assert.equal((await pros.say(p, "accept", { amount: 18500 })).source, "model");
  } finally { setAI({ chat: null }); }
});

test("a change order inside PayPal's over-capture allowance (115% or +$75) needs no new hold; the capture goes over the hold", async () => {
  const c = person(), j = await held(c), h0 = J.job(j.id).hold, pid = j.agreed.pro;
  const allowance = J.overAllowance(h0), room = h0.amount - J.due(J.job(j.id));
  const amt = room + Math.min(1000, allowance - 1); // past the buffer, inside the allowance
  const ch = await J.requestChange(pid, j.id, { amount: amt, reason: "a longer supply line", kind: "parts" }, PRO(pid));
  assert.ok(!ch.error, ch.message);
  const r = await J.approveChange(j.id, J.job(j.id).changeOrders.at(-1).id, P(c));
  assert.ok(!r.error, r.message);
  assert.equal(J.job(j.id).hold.amount, h0.amount, "the same hold");
  assert.equal(J.job(j.id).hold.authorization, h0.authorization);
  const v = await deliver(J.job(j.id), faucetEvidence(J.job(j.id), { receiptText: `TOTAL ${(amt / 100).toFixed(2)}` }));
  assert.equal(v.status, "released", v.message);
  const cap = J.job(j.id).money.ledger.filter((l) => l.kind === "capture").reduce((s, l) => s + l.amount, 0);
  assert.ok(cap > h0.amount, "captured over the hold");
  assert.equal(cap, J.due(J.job(j.id)));
  assert.ok(J.job(j.id).hold.history.some((x) => /over the hold/.test(x.event)));
});

test("if PayPal refuses capturing over the hold, the job re-holds and captures", async () => {
  process.env.PAYPAL_MOCK_NO_OVERCAPTURE = "1";
  try {
    const c = person(), j = await held(c, { payWith: "card" }), h0 = J.job(j.id).hold, pid = j.agreed.pro;
    const amt = h0.amount - J.due(J.job(j.id)) + Math.min(1000, J.overAllowance(h0) - 1);
    await J.requestChange(pid, j.id, { amount: amt, reason: "a longer supply line", kind: "parts" }, PRO(pid));
    assert.ok(!(await J.approveChange(j.id, J.job(j.id).changeOrders.at(-1).id, P(c))).error);
    const v = await deliver(J.job(j.id), faucetEvidence(J.job(j.id), { receiptText: `TOTAL ${(amt / 100).toFixed(2)}` }));
    assert.equal(v.status, "released", v.message);
    assert.ok(J.job(j.id).hold.history.some((x) => x.event === "over-capture refused"));
    assert.equal(J.job(j.id).money.ledger.filter((l) => l.kind === "capture").reduce((s, l) => s + l.amount, 0), J.due(J.job(j.id)));
  } finally { delete process.env.PAYPAL_MOCK_NO_OVERCAPTURE; }
});

test("before the customer approves the hold in PayPal, a new buffer PATCHes the same order", async () => {
  const c = person(), j = await held(c, { payWith: "paypal" });
  assert.equal(J.job(j.id).hold.status, "pending_approval");
  const order = J.job(j.id).hold.order, was = J.job(j.id).hold.amount;
  const r = await J.setPendingBuffer(j.id, { bufferPct: 5 }, P(c));
  assert.ok(!r.error, r.message);
  assert.equal(J.job(j.id).hold.order, order, "the same PayPal order");
  assert.notEqual(J.job(j.id).hold.amount, was);
  assert.equal((await pp().getOrder(order)).amount ?? J.job(j.id).hold.amount, J.job(j.id).hold.amount);
  assert.equal((await J.setPendingBuffer(j.id, { bufferPct: 50 }, P(c))).error, "bufferPct");
});

test("parts tracking: the hired pro adds a carrier and number; it goes on PayPal's order with the capture", async () => {
  const c = person(), j = await held(c), pid = j.agreed.pro;
  assert.equal((await J.addPartsTracking("someone-else", j.id, { carrier: "UPS", trackingNumber: "1Z999AA10123456784" }, PRO("x"))).error, "forbidden");
  assert.equal((await J.addPartsTracking(pid, j.id, { carrier: "PIGEON", trackingNumber: "1Z999AA10123456784" }, PRO(pid))).error, "carrier");
  const t = await J.addPartsTracking(pid, j.id, { carrier: "ups", trackingNumber: "1Z999AA10123456784" }, PRO(pid));
  assert.ok(!t.error, t.message); assert.equal(t.tracking.paypal, null, "no capture yet");
  const v = await deliver(J.job(j.id));
  assert.equal(v.status, "released");
  for (let i = 0; i < 20 && J.job(j.id).tracking[0].paypal?.status !== "sent"; i++) await new Promise((r) => setTimeout(r, 25));
  assert.equal(J.job(j.id).tracking[0].paypal.status, "sent");
  assert.equal(J.view(J.job(j.id)).tracking[0].onPayPal, true);
});
