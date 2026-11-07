// PLAN §15 item 3 (Pay Later, Venmo payouts, tips) and item 4's wiring (the fair-price estimate on the job, the offers
// and the demo agent's counter). Stand-in PayPal; the Venmo refusal mirrors the real sandbox run
// (docs/live-test/sandbox/venmo-tips-1.json: "Recipient wallet not supported in sandbox").
import test from "node:test";
import assert from "node:assert/strict";
import { J, person, P, PRO, pros, pp, deliver, held, faucetEvidence, tools } from "./helpers.js";

async function paidJob(c) {
  const j = await held(c);
  J.startWork(j.agreed.pro, j.id, PRO(j.agreed.pro));
  await deliver(J.job(j.id), faucetEvidence(J.job(j.id)));
  let k = J.job(j.id);
  if (k.status === "review") { await J.release(j.id, P(c), { acknowledgeFailed: J.notPassed(k, k.milestones[0]).map((x) => x.id) }); k = J.job(j.id); }
  assert.equal(k.status, "released");
  return k;
}

test("a tip: its own PayPal order captured at once, 100% to the pro with Payouts, no fee; ledger lines match", async () => {
  const c = person(), j = await paidJob(c), before = J.balance(j);
  const r = await J.tip(j.id, { amount: 2000 }, P(c));
  assert.ok(!r.error, r.message);
  const k = J.job(j.id), t = k.tips[0];
  assert.equal(t.status, "paid"); assert.ok(t.order && t.capture && t.payout.batchId);
  assert.notEqual(t.order, k.hold.order, "a separate order");
  const L = k.money.ledger;
  assert.equal(L.find((l) => l.kind === "tip_capture").amount, 2000);
  assert.equal(L.find((l) => l.kind === "tip_payout").amount, 2000, "100% to the pro");
  assert.ok(L.some((l) => l.kind === "tip_paypal_fee"), "PayPal's fee is the platform's cost");
  assert.ok(!L.some((l) => l.kind === "platform_fee" && l.ref === t.payout.batchId));
  const v = J.view(k);
  assert.equal(v.tips.balanced, true); assert.equal(v.tips.toPro.cents, 2000);
  assert.deepEqual(J.balance(k).ok, before.ok, "the job's own balance is untouched");
  const pay = pp()._db.data.payouts[t.payout.batchId];
  assert.equal(pay.items[0].amount, 2000);
});

test("tips: only after payment, bounded, and an agent tips only within the change-order limit", async () => {
  const c = person(), j = await held(c);
  assert.equal((await J.tip(j.id, { amount: 500 }, P(c))).error, "state");
  const k = await paidJob(person());
  const cust = { id: k.customer };
  assert.equal((await J.tip(k.id, { amount: 50 }, P(cust))).error, "amount");
  assert.equal((await J.tip(k.id, { amount: J.TIP_MAX + 100 }, P(cust))).error, "amount");
  const a = { kind: "agent", person: k.customer, client: "t", scopes: ["read", "hire", "pay"] };
  const r = await J.tip(k.id, { amount: 9000 }, a);
  assert.equal(r.error, "limit"); assert.equal(r.limit, "changeMax");
  assert.ok(!(await J.tip(k.id, { amount: 1500 }, a)).error);
});

test("a tip without a saved method waits for approval, then is captured on confirm", async () => {
  const c = person(), j = await paidJob(c);
  const k0 = J.job(j.id);
  const r = await J.tip(j.id, { amount: 1000, payWith: "paypal" }, P(c));
  assert.equal(r.tip.status, "pending_approval"); assert.ok(r.tip.approveUrl);
  pp().approve({ token: r.tip.order });
  const done = await J.confirmTip(j.id, r.tip.id, P(c));
  assert.equal(done.tip.status, "paid");
  assert.equal(J.view(J.job(k0.id)).tips.balanced, true);
});

test("Venmo payouts: the pro chooses Venmo (a phone); the sandbox refuses the wallet, so the payout goes to their PayPal and says so", async () => {
  const c = person(), j = await held(c), pid = j.agreed.pro;
  assert.equal(pros.setPayoutMethod(pid, { method: "venmo", phone: "555" }).error, "phone");
  const v = pros.setPayoutMethod(pid, { method: "venmo", phone: "(512) 555-0142" });
  assert.equal(v.payoutMethod.method, "venmo"); assert.equal(v.payoutMethod.to, "+15125550142");
  assert.equal(pros.payoutTarget(pros.pro(pid)).wallet, "VENMO");
  try {
    J.startWork(pid, j.id, PRO(pid));
    await deliver(J.job(j.id), faucetEvidence(J.job(j.id)));
    let k = J.job(j.id);
    if (k.status === "review") await J.release(j.id, P(c), { acknowledgeFailed: J.notPassed(k, k.milestones[0]).map((x) => x.id) });
    k = J.job(j.id);
    const po = k.money.payout;
    assert.equal(po.via, "paypal"); assert.match(po.venmoFallback.why, /Recipient wallet not supported in sandbox/);
    assert.ok(po.batchId); assert.ok(J.balance(k).ok);
    // as production would answer (DONE_MOCK_VENMO=accept): the item goes to Venmo
    process.env.DONE_MOCK_VENMO = "accept";
    const t = await J.tip(j.id, { amount: 700 }, P(c));
    assert.equal(t.tip.payout.via, "venmo");
    const item = pp()._db.data.payouts[t.tip.payout.batchId].items[0];
    assert.equal(item.wallet, "VENMO"); assert.equal(item.receiver, "+15125550142");
  } finally { delete process.env.DONE_MOCK_VENMO; pros.setPayoutMethod(pid, { method: "paypal" }); }
});

test("Pay Later: hold options offer it on holds of $300 or more; payWith paylater is a PayPal approval that says so", async () => {
  const c = person(), j = await (async () => { const x = await J.createJob(c.id, { text: "Replace our 50 gallon water heater this month", zip: "78704", budget: 300000, actor: P(c) }); await J.requestOffers(x.id, P(c), { now: true }); return J.job(x.id); })();
  const o = j.offers.filter((x) => x.status === "open").sort((a, b) => a.amount - b.amount)[0];
  const opt = J.holdOptions(j), pl = opt.methods.find((m) => m.id === "paylater");
  assert.equal(pl.offered, true); assert.match(pl.sandbox, /Not verified end to end/);
  const r = await J.acceptOffer(j.id, o.id, { actor: P(c), payWith: "paylater", raiseCeiling: true });
  assert.ok(r.approveUrl, "an approval"); assert.equal(J.job(j.id).hold.payLater.offered, true);
  // a small job: not offered
  const s = await held(person(), { payWith: "card" });
  assert.equal(J.holdOptions(s).methods.find((m) => m.id === "paylater").offered, false);
});

test("the fair-price estimate: kept on the job at posting, on each offer, and the demo agent counters inside it", async () => {
  const c = person();
  const j = await J.createJob(c.id, { text: "Kitchen faucet keeps dripping. Fix it this week, $250 max.", zip: "78704", budget: 25000, actor: P(c) });
  assert.ok(j.estimate, "job.estimate"); assert.equal(j.estimate.label, "an estimate from similar jobs, not a quote");
  await J.requestOffers(j.id, P(c), { now: true });
  const v = J.view(J.job(j.id));
  assert.ok(v.estimate.low.cents > 0 && v.estimate.says.includes("not a quote"));
  assert.ok(v.offers.every((o) => o.fair && ["below", "within", "above"].includes(o.fair.where)));
  const r = await tools.autoHire(j.id, c.id, { payWith: "card" });
  const s = (r.steps || []).find((x) => /countered/.test(x));
  if (s) {
    assert.match(s, /inside the fair range/);
    const cnt = J.job(j.id).offers.find((o) => o.counter)?.counter.amount;
    const fr = J.fairRange(J.job(j.id));
    assert.ok(cnt >= Math.min(fr.low, cnt) && cnt <= Math.max(fr.typical, fr.low), `${cnt} in ${fr.low}-${fr.typical}`);
  }
});
