// PayPal, round 6: delayed disbursement released with Referenced Payouts, Payment Links, the card bank's AVS/CVV,
// a returning payer's client token, webhook catch-up, invoice search, and messaging / appealing a PayPal dispute.
import test from "node:test";
import assert from "node:assert/strict";
import { J, person, P, offered, held, deliver, pp, cents, pros, clock } from "./helpers.js";
const onboarding = await import("../src/onboarding.js");
const paylinks = await import("../src/paylinks.js");
const disputes = await import("../src/disputes.js");
const cheapest = (j) => j.offers.filter((x) => x.status === "open").sort((a, b) => a.amount - b.amount)[0];

test("a card hold shows what the card's bank said (AVS and CVV), in words", async () => {
  const j = await held(person());
  const v = J.view(j, { as: "customer" }).hold.processor;
  assert.equal(v.cvv, "M");
  assert.equal(v.says, "security code matches");
});

test("a returning payer's client token is minted for their PayPal customer id", async () => {
  assert.equal((await pp().clientToken({ customerId: "CUST-1" })).returningPayer, true);
  assert.equal((await pp().clientToken()).returningPayer, false);
});

test("Payment Links: a pro's link is paid at PayPal; VeriPay keeps its fee and pays the pro with Payouts", async () => {
  const pid = pros.allPros()[0].id;
  assert.equal((await paylinks.create(pid, { title: "Deposit", amount: 100 })).error, "amount");
  const l = await paylinks.create(pid, { title: "Deposit for the vanity", amount: 15000, purpose: "deposit" });
  assert.equal(l.status, "open");
  assert.ok(l.url && l.paypal.id.startsWith("PLB-"));
  const raw = paylinks.all().find((x) => x.id === l.id);
  assert.equal(await paylinks.sync(raw), null, "nothing paid yet");
  pp().payLink(l.paypal.id);
  await paylinks.sync(raw);
  const v = paylinks.view(raw);
  assert.equal(v.payments.length, 1);
  assert.equal(raw.payments[0].fee + raw.payments[0].pro, 15000);
  assert.ok(raw.payments[0].payout.batchId);
  assert.equal(await paylinks.sync(raw), null, "the same payment isn't paid out twice");
  assert.equal((await paylinks.close(pid, l.id)).status, "paid");
});

test("delayed disbursement: an onboarded pro's money stays at PayPal for the dispute window, then Referenced Payouts releases it", async () => {
  const c = person(), j = await offered(c), o = cheapest(j), pid = o.pro?.id || o.pro;
  const s = await onboarding.start(pid, "someone");
  await onboarding.sync(pid, { fromPayPal: { merchantIdInPayPal: new URL(s.url).searchParams.get("merchantIdInPayPal") } });
  await J.acceptOffer(j.id, o.id, { actor: P(c), payWith: "card" });
  assert.equal((await deliver(J.job(j.id))).status, "released");
  const h = J.job(j.id), po = h.money.payout;
  assert.equal(po.status, "held_at_paypal");
  assert.ok(cents(h).ok);
  await J.tick();
  assert.equal(J.job(j.id).money.payout.status, "held_at_paypal", "not before the window ends");
  clock.advance(2.1, "test");
  await J.tick();
  const after = J.job(j.id).money.payout;
  assert.equal(after.status, "disbursed");
  assert.ok(after.item.startsWith("RPI-"));
});

test("a PayPal dispute: staff message the buyer in PayPal's thread; an appeal waits for PayPal's decision", async () => {
  const c = person(), j = await held(c);
  assert.equal((await deliver(j)).status, "released");
  const e = await disputes.escalate(j.id, "The faucet still drips.", P(c));
  assert.ok(!e.error, e.message);
  assert.equal((await disputes.message(j.id, { message: "hi" })).error, "message");
  assert.equal((await disputes.message(j.id, { message: "We'll send the pro back tomorrow." }, { kind: "person" })).error, "forbidden");
  const m = await disputes.message(j.id, { message: "We'll send the pro back tomorrow morning." });
  assert.ok(!m.error, m.message);
  assert.equal(J.job(j.id).paypalDispute.messages.length, 1);
  assert.equal((await disputes.appeal(j.id, { notes: "PayPal missed the photos of the dry faucet after the repair." })).error, "paypal", "PayPal hasn't decided yet");
});

test("webhook catch-up: PayPal's record of sent events, and the platform's invoices searched in PayPal", async () => {
  const e = await pp().simulateWebhook({ eventType: "PAYMENT.CAPTURE.COMPLETED" });
  const list = await pp().webhookEvents({});
  assert.ok(list.some((x) => x.id === e.id));
  assert.equal((await pp().webhookEvent(e.id)).event_type, "PAYMENT.CAPTURE.COMPLETED");
  await pp().invoice({ recipient: "x@example.com", item: "Clean", amount: 9000, requestId: "inv-search-1" });
  const r = await pp().searchInvoices({ status: ["SENT"] });
  assert.ok(r.total >= 1 && r.items.every((x) => x.status === "SENT"));
});
