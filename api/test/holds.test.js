// Holds over time: the 3-day honor period, reauthorize once (PayPal allows it on days 4-29), re-hold on the saved
// payment method when reauthorize isn't possible, the 29-day expiry, a change order bigger than the buffer, the PLAN
// §12 fallback (charge now, keep at the platform), and the multiparty flag falling back with the sandbox's answer.
import test from "node:test";
import assert from "node:assert/strict";
import { J, person, P, PRO, AGENT, held, deliver, pp, clock, fresh, setHoldMode, cents } from "./helpers.js";

test("past the 3-day honor period the hold is reauthorized, and the job still pays", async () => {
  const c = person(), j = await held(c);
  const first = j.hold.authorization;
  clock.advance(2, "test");
  await J.tick();
  assert.equal(J.job(j.id).hold.authorization, first, "inside the honor period nothing changes");
  clock.advance(1.5, "test");
  const t = await J.tick();
  const h = J.job(j.id).hold;
  assert.ok(t.some((x) => x.job === j.number && x.event === "reauthorized"), JSON.stringify(t));
  assert.notEqual(h.authorization, first);
  assert.equal(h.reauthorized, true);
  const auth1 = h.authorization;
  assert.ok(J.job(j.id).money.ledger.some((l) => l.kind === "reauthorize"));
  assert.ok(J.job(j.id).receipts.some((r) => r.event === "reauthorized"));
  // the next honor period passes: PayPal allows one reauthorization, so the platform re-holds on the saved card
  clock.advance(3.5, "test");
  const t2 = await J.tick();
  assert.ok(t2.some((x) => x.job === j.number && x.event === "re-held"), JSON.stringify(t2));
  const h2 = J.job(j.id).hold;
  assert.notEqual(h2.authorization, auth1);
  assert.ok(h2.history.some((e) => e.event === "re-held" && /reauthorize/.test(e.why)));
  // (PayPal, and the stand-in, allow one reauthorization: a second is refused)
  await assert.rejects(pp().reauthorize(auth1, { amount: 100 }), /MAX_NUMBER_OF_REAUTHORIZATIONS|ALREADY/);
  assert.equal(pp()._db.data.auths[auth1].status, "VOIDED", "the replaced authorization is voided");
  const r = await deliver(J.job(j.id));
  assert.equal(r.status, "released");
  assert.equal(pp()._db.data.auths[h2.authorization].status, "CAPTURED");
  assert.ok(cents(j).ok);
});

test("a hold that can't be renewed expires the job, and nothing is charged", async () => {
  const c = person(), j = await held(c);
  J.startWork(j.agreed.pro, j.id, PRO(j.agreed.pro));
  // the saved card starts declining, and PayPal refuses the reauthorization (already used)
  clock.advance(3.2, "test");
  await J.tick(); // reauthorized
  pp().failNextCharge(c.vault);
  for (let i = 0; i < 12; i++) { pp().failNextCharge((await import("../src/people.js")).person(c.id).vault); clock.advance(3, "test"); await J.tick(); }
  const x = J.job(j.id);
  assert.equal(x.status, "expired", x.hold.history.map((e) => e.event).join(", "));
  assert.equal(x.money.captured, null);
  assert.ok(x.hold.history.some((e) => e.event === "expired"));
});

test("a change order bigger than the buffer re-holds first; the unused buffer is never captured", async () => {
  const c = person(), j = await held(c, { budget: 30000 });
  const hold0 = j.hold.amount, price = j.agreed.price, buffer = hold0 - price;
  J.startWork(j.agreed.pro, j.id, PRO(j.agreed.pro));
  // within the buffer: the hold stays
  const small = await J.requestChange(j.agreed.pro, j.id, { amount: Math.min(2000, buffer), reason: "new supply line" }, PRO(j.agreed.pro));
  await J.approveChange(j.id, small.change.id, P(c));
  assert.equal(J.job(j.id).hold.amount, hold0);
  // bigger than what's left: a new hold for the new total, the old one voided
  const big = await J.requestChange(j.agreed.pro, j.id, { amount: buffer + 5000, reason: "the valve is corroded too" }, PRO(j.agreed.pro));
  const old = J.job(j.id).hold.authorization;
  const r = await J.approveChange(j.id, big.change.id, P(c));
  assert.ok(!r.error, r.message);
  const h = J.job(j.id).hold;
  assert.ok(h.amount >= J.due(J.job(j.id)));
  assert.notEqual(h.authorization, old);
  assert.equal(pp()._db.data.auths[old].status, "VOIDED");
  const done = await deliver(J.job(j.id), (await import("./helpers.js")).faucetEvidence(J.job(j.id), { receiptText: `TOTAL ${((Math.min(2000, buffer) + buffer + 5000) / 100).toFixed(2)}` }));
  assert.equal(done.status, "released", JSON.stringify(done.lastCheck.checks));
  assert.equal(done.money.captured.cents, price + Math.min(2000, buffer) + buffer + 5000);
  const ledger = J.job(j.id).money.ledger, released = ledger.find((l) => l.kind === "buffer_released");
  assert.equal(released.amount, h.amount - done.money.captured.cents);
  assert.equal(pp()._db.data.auths[h.authorization].captured, done.money.captured.cents, "PayPal captured exactly what was due");
});

test("PLAN §12 fallback: HOLD_MODE=capture charges at once and refunds what isn't released", async () => {
  setHoldMode("capture");
  try {
    const c = person(), j = await held(c);
    assert.equal(j.hold.mode, "capture");
    assert.ok(j.hold.capture);
    assert.equal(j.money.captured, j.hold.amount);
    const r = await deliver(j);
    assert.equal(r.status, "released");
    const b = cents(j);
    assert.equal(b.refunded, j.hold.amount - J.due(J.job(j.id)), "the unused buffer is refunded");
    assert.ok(b.ok);
    // cancel in fallback mode refunds the charge in full
    const k = await held(person());
    const v = await J.cancel(k.id, P({ id: k.customer }));
    assert.equal(v.hold.status, "refunded");
    assert.equal(cents(k).refunded, k.hold.amount);
  } finally { setHoldMode("authorize"); }
});

test("DONE_MULTIPARTY=1: PayPal refuses without partner onboarding; the platform flow runs and says so", async () => {
  process.env.DONE_MULTIPARTY = "1";
  try {
    const j = await held(person());
    assert.equal(j.hold.flow, "platform_capture_then_payouts");
    assert.ok(j.hold.history.some((e) => e.issue === "UNSUPPORTED_PAYMENT_INSTRUCTION"));
    // with a stand-in that accepts it (an onboarded pro), the pro is paid as the payee and no Payouts batch goes out
    fresh({ allowMultiparty: true });
    const k = await held(person());
    assert.equal(k.hold.flow, "multiparty_payee_with_platform_fee");
    const r = await deliver(k);
    assert.equal(r.status, "released");
    assert.equal(r.money.payout.status, "paid_as_payee");
    assert.ok(r.money.ledger.filter((l) => ["capture", "platform_fee", "pro_payout"].includes(l.kind)).every((l) => l.flow === "multiparty_payee_with_platform_fee"));
    assert.ok(cents(k).ok);
  } finally { delete process.env.DONE_MULTIPARTY; fresh(); }
});

test("a declined saved card fails the hold and says why", async () => {
  const c = person();
  await held(c);
  const { offered } = await import("./helpers.js");
  const j = await offered(c);
  pp().failNextCharge((await import("../src/people.js")).person(c.id).vault);
  const cheapest = j.offers.slice().sort((a, b) => a.amount - b.amount)[0];
  const r = await J.acceptOffer(j.id, cheapest.id, { actor: AGENT(c) });
  assert.equal(r.error, "paypal");
  assert.match(r.message, /INSTRUMENT_DECLINED/);
  assert.equal(J.job(j.id).hold.status, "failed");
});
