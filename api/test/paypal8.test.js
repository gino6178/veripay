// PayPal, round 8: the hold's line items on the order (labor, parts, buffer) kept in step with a buffer change, card
// Level 2 data, Venmo approved and saved for the next holds with the contact the payer confirmed in PayPal, invoice tips
// and partial payments, a plan's setup fee, and a returned item acknowledged on a dispute.
import test from "node:test";
import assert from "node:assert/strict";
import { J, person, P, offered, held, deliver, pp, people } from "./helpers.js";
const invoices = await import("../src/invoices.js");
const plans = await import("../src/plans.js");
const disputes = await import("../src/disputes.js");
const cheapest = (j) => j.offers.filter((x) => x.status === "open").sort((a, b) => a.amount - b.amount)[0];

test("a hold lists labor, parts and the buffer on the PayPal order; a buffer change before approval patches them too", async () => {
  const c = person(), j = await offered(c), o = cheapest(j);
  await J.acceptOffer(j.id, o.id, { actor: P(c), payWith: "paypal" });
  const h = J.job(j.id).hold, ord = await pp().getOrder(h.order);
  assert.equal(ord.items.reduce((t, x) => t + x.amount, 0), h.amount);
  assert.ok(ord.items[0].name.startsWith("Labor"));
  assert.ok(ord.items.some((x) => /buffer/.test(x.name)), "the buffer is its own line");
  assert.equal(ord.level2, null, "Level 2 is for card holds only");
  const r = await J.setPendingBuffer(j.id, { bufferPct: 0 }, P(c));
  assert.ok(!r.error, r.message);
  const o2 = await pp().getOrder(h.order);
  assert.equal(o2.items.reduce((t, x) => t + x.amount, 0), J.job(j.id).hold.amount);
  assert.ok(!o2.items.some((x) => /buffer/.test(x.name)), "no buffer, no buffer line");
  assert.ok(J.view(J.job(j.id)).hold.items.length >= 1);
});

test("a card hold carries Level 2 data (the hold's invoice number, no tax)", async () => {
  const c = person(), j = await held(c, { payWith: "card" }), ord = await pp().getOrder(j.hold.order);
  assert.deepEqual(ord.level2, { invoiceId: `${j.number}-H1`, tax: 0 });
});

test("Venmo: approved in Venmo, saved as Venmo, and the next hold is placed on it with no approval", async () => {
  const c = person(), j = await offered(c), o = cheapest(j);
  const r = await J.acceptOffer(j.id, o.id, { actor: P(c), payWith: "venmo" });
  assert.ok(r.approveUrl || J.job(j.id).hold.approveUrl);
  pp().approve({ token: J.job(j.id).hold.order });
  await J.confirmHold(j.id, P(c));
  const h = J.job(j.id).hold;
  assert.equal(h.status, "held");
  assert.match(people.person(c.id).vault, /^venmo:/);
  assert.equal(people.person(c.id).vaultLabel, "Venmo");
  assert.equal(J.view(J.job(j.id)).hold.payerContact.phone, "•••0142", "the phone the payer confirmed in PayPal, masked");
  const j2 = await held(people.person(c.id));
  assert.equal(j2.hold.status, "held");
  assert.equal(J.view(j2).hold.paidWith, "saved Venmo");
});

test("an invoice may take a tip and be paid in parts: the pro is paid in full once it's paid, the tip all theirs", async () => {
  const pid = "zilker-clean-co";
  assert.equal((await invoices.create(pid, { customer: { email: "c8@example.com" }, text: "Deep clean a house", amount: 40000, zip: "78704", minDue: 50000 })).error, "minDue");
  const inv = await invoices.create(pid, { customer: { email: "c8@example.com" }, title: "Deep clean", text: "Deep clean a three-bedroom house", amount: 40000, zip: "78704", allowTip: true, minDue: 10000, checks: [{ what: "a note", evidence: "note" }] });
  invoices.addEvidence(pid, inv.id, [{ kind: "note", checkId: inv.scope.checks[0].id, text: "Cleaned every room, the kitchen and both bathrooms." }]);
  const sent = await invoices.submit(pid, inv.id);
  assert.equal(sent.status, "sent");
  assert.throws(() => pp().payInvoice(sent.paypal.id, { amount: 5000 }), /PARTIAL_PAYMENT_NOT_ALLOWED/);
  pp().payInvoice(sent.paypal.id, { amount: 15000 });
  await invoices.tick();
  let v = invoices.view(invoices.invoice(inv.id));
  assert.equal(v.status, "sent");
  assert.equal(v.paidSoFar.cents, 15000);
  pp().payInvoice(sent.paypal.id, { tip: 3000 });
  await invoices.tick();
  v = invoices.view(invoices.invoice(inv.id));
  assert.equal(v.status, "paid");
  assert.equal(v.tip.cents, 3000);
  assert.equal(v.money.split.pro.cents, 40000 - 4000 + 3000, "90% of the invoice plus the whole tip");
});

test("a plan with a setup fee: PayPal charges it at approval, held for the first visit like a month", async () => {
  const c = person(), j = await held(c);
  await deliver(j);
  assert.equal((await plans.create(j.id, { amount: 9000, setupFee: 9000 }, P(c))).error, "setupFee");
  const p0 = await plans.create(j.id, { amount: 9000, setupFee: 15000 }, P(c));
  assert.equal(p0.setupFee.cents, 15000);
  pp().approve({ subscription: p0.paypal.subscription });
  const p = await plans.sync(plans.plan(p0.id));
  assert.equal(p.cycles.length, 2);
  assert.deepEqual(p.cycles.map((x) => [!!x.setup, x.amount, x.status]), [[true, 15000, "waiting_for_proof"], [false, 9000, "waiting_for_proof"]]);
});

test("a dispute where the buyer sent the part back: staff tell PayPal it arrived, once", async () => {
  const c = person(), j = await held(c);
  await deliver(j);
  await disputes.escalate(j.id, "The new faucet was the wrong model; I sent it back.", P(c));
  assert.equal((await disputes.acknowledgeReturn(j.id, { note: "Got the faucet back." }, { kind: "person" })).error, "forbidden");
  assert.equal((await disputes.acknowledgeReturn(j.id, { note: "ok" })).error, "note");
  const r = await disputes.acknowledgeReturn(j.id, { note: "The faucet arrived back at the pro's shop on Monday, unused." });
  assert.ok(!r.error, r.message);
  assert.ok(J.job(j.id).paypalDispute.returnAcknowledged);
  assert.equal((await disputes.acknowledgeReturn(j.id, { note: "The faucet arrived back again." })).error, "state");
});
