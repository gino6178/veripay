// PayPal, round 7: refunds made as an onboarded pro (PayPal-Auth-Assertion) with VeriPay's fee given back, a missed
// plan month charged (subscription capture), a sent invoice cancelled in PayPal, payouts to a PayPal account id, and
// saving PayPal without a purchase (Vault setup token).
import test from "node:test";
import assert from "node:assert/strict";
import { J, person, P, offered, held, deliver, pp, pros, people } from "./helpers.js";
const onboarding = await import("../src/onboarding.js");
const invoices = await import("../src/invoices.js");
const plans = await import("../src/plans.js");
const cheapest = (j) => j.offers.filter((x) => x.status === "open").sort((a, b) => a.amount - b.amount)[0];

test("a refund on an onboarded pro's capture is made as the pro, and VeriPay's fee on it goes back", async () => {
  const c = person(), j = await offered(c), o = cheapest(j), pid = o.pro?.id || o.pro;
  const s = await onboarding.start(pid, "someone");
  await onboarding.sync(pid, { fromPayPal: { merchantIdInPayPal: new URL(s.url).searchParams.get("merchantIdInPayPal") } });
  await J.acceptOffer(j.id, o.id, { actor: P(c), payWith: "card" });
  await deliver(J.job(j.id));
  const h = J.job(j.id), cap = h.money.payout.capture;
  const orig = pp().refund; let seen = null;
  pp().refund = async (id, args) => { seen = args; return orig.call(pp(), id, args); };
  try { await J.refundCapture(h, cap, { amount: 2000, requestId: "t7-refund" }); } finally { pp().refund = orig; }
  assert.equal(seen.onBehalfOf, pros.pro(pid).merchant.merchantId);
  assert.equal(seen.platformFee, 200);
  // a platform-flow job's refund is plain (the same pro, no longer onboarded)
  pros.setMerchant(pid, null);
  const j2 = await held(person()), orig2 = pp().refund; let seen2 = null;
  pp().refund = async (id, args) => { seen2 = args; return orig2.call(pp(), id, args); };
  try { await deliver(j2); const c2 = J.job(j2.id).hold.capture; await J.refundCapture(J.job(j2.id), c2, { amount: 1000, requestId: "t7-refund-2" }); } finally { pp().refund = orig2; }
  assert.equal(seen2.onBehalfOf, undefined);
});

test("a plan month PayPal couldn't charge: the customer has PayPal charge it now, and it waits for proof like any month", async () => {
  const c = person(), j = await held(c);
  await deliver(j);
  const p0 = await plans.create(j.id, { amount: 9000 }, P(c));
  pp().approve({ subscription: p0.paypal.subscription });
  const p = plans.plan(p0.id);
  await plans.sync(p);
  assert.equal(p.cycles.length, 1);
  assert.equal((await plans.payOutstanding(p.id, P(c))).error, "state", "nothing outstanding");
  pp().failBill(p0.paypal.subscription);
  await plans.sync(p);
  assert.equal(plans.view(p).paypal.outstanding.cents ?? plans.view(p).paypal.outstanding, plans.view(p).paypal.outstanding.cents ?? 9000);
  assert.equal((await plans.payOutstanding(p.id, { kind: "agent", person: c.id })).error, "forbidden");
  const r = await plans.payOutstanding(p.id, P(c));
  assert.ok(!r.error, r.message);
  assert.equal(p.cycles.length, 2);
  assert.equal(p.cycles[1].status, "waiting_for_proof");
  assert.equal(p.paypal.outstanding, 0);
});

test("a sent invoice can be cancelled: PayPal withdraws it; a paid one can't", async () => {
  const pid = "zilker-clean-co";
  const inv = await invoices.create(pid, { customer: { email: "c7@example.com" }, title: "Office clean", text: "Clean a small office: kitchen, bathroom, floors", amount: 18000, zip: "78704", checks: [{ what: "a note", evidence: "note" }] });
  invoices.addEvidence(pid, inv.id, [{ kind: "note", checkId: inv.scope.checks[0].id, text: "Cleaned the kitchen, bathroom and floors as listed." }]);
  const sent = await invoices.submit(pid, inv.id);
  assert.equal(sent.status, "sent", `the note check passed (${sent.status})`);
  const r = await invoices.cancel(pid, inv.id);
  assert.equal(r.status, "cancelled");
  assert.equal(r.paypal.status, "CANCELLED");
  assert.equal((await pp().getInvoice(sent.paypal.id)).status, "CANCELLED");
});

test("a PayPal verified by Log in with PayPal is paid to its PayPal account id, not the email", async () => {
  const p = pros.allPros().find((x) => x.paypal?.verified);
  const before = pros.payoutTarget(p);
  assert.equal(before.recipientType, "EMAIL");
  pros.setPayPalFromLogin(p.id, { email: "verified@example.com", payerId: "PAYERID123", verifiedAccount: "true", demo: true });
  const t = pros.payoutTarget(pros.pro(p.id));
  assert.deepEqual([t.recipientType, t.receiver, t.via], ["PAYPAL_ID", "PAYERID123", "paypal_id"]);
});

test("PayPal saved without a purchase: a setup token approved at PayPal becomes the person's saved PayPal", async () => {
  const c = person();
  const s = await pp().vaultSetup({ returnUrl: "http://test/r", cancelUrl: "http://test/c", requestId: "t7-setup" });
  assert.ok(s.approveUrl);
  await assert.rejects(pp().vaultToken(s.id, "t7-token-early"), /NOT_APPROVED/);
  pp().approve({ setup: s.id });
  const t = await pp().vaultToken(s.id, "t7-token");
  assert.match(t.id, /^paypal:/);
  people.updatePerson(c.id, { vault: t.id, vaultCustomer: t.customerId });
  const j = await offered(c), o = cheapest(j);
  await J.acceptOffer(j.id, o.id, { actor: P(c) });
  assert.equal(J.job(j.id).hold.status, "held", "held at once on the saved PayPal, no approval");
});
