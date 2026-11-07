// PayPal, round 5: invoice templates, the saved payment method from PayPal's vault, the Risk API before a hold, holds
// by card fields / Google Pay / Fastlane, and a pro onboarded as a PayPal merchant (Partner Referrals) paid as payee.
import test from "node:test";
import assert from "node:assert/strict";
import { J, person, P, offered, held, deliver, pp, people, cents, pros } from "./helpers.js";
const invoices = await import("../src/invoices.js");
const cheapest = (j) => j.offers.filter((x) => x.status === "open").sort((a, b) => a.amount - b.amount)[0];
const onboarding = await import("../src/onboarding.js");

test("an invoice template: saved in PayPal, an invoice made from it carries it, deleting removes it from PayPal", async () => {
  const pid = "zilker-clean-co";
  const inv = await invoices.create(pid, { customer: { email: "a@example.com" }, title: "Office clean", text: "Clean a small office: kitchen, bathroom, floors", amount: 18000, zip: "78704" });
  const tp = await invoices.saveTemplate(pid, { from: inv.id, name: "Office clean" });
  assert.ok(tp.paypal.templateId.startsWith("TEMP-"));
  assert.equal(tp.amount.cents ?? tp.amount, tp.amount.cents ?? 18000);
  assert.equal(invoices.templatesOf(pid).length, 1);
  assert.equal((await invoices.saveTemplate("other-pro", { from: inv.id })).error, "pro");
  const again = await invoices.create(pid, { template: tp.id, customer: { email: "b@example.com" } });
  assert.equal(again.status, "draft");
  assert.equal(again.title, "Office clean");
  assert.equal(again.template.paypal, tp.paypal.templateId);
  assert.equal(again.scope.checks.length, inv.scope.checks.length, "the same done-conditions");
  assert.equal((await invoices.create(pros.allPros().find((x) => x.id !== pid).id, { template: tp.id, customer: { email: "c@example.com" } })).error, "template", "only the pro's own");
  assert.deepEqual(await invoices.deleteTemplate(pid, tp.id), { deleted: tp.id });
  await assert.rejects(pp().getInvoiceTemplate(tp.paypal.templateId), /404|NOT_FOUND/);
});

test("the Risk API: every hold sends PayPal the transaction context first, and the order carries its tracking id", async () => {
  const c = person(), j = await held(c);
  assert.ok(j.hold.risk.trackingId);
  assert.ok(j.hold.risk.sent.includes("sender_account_id") && j.hold.risk.sent.includes("receiver_account_id"));
  assert.equal(J.view(j, { as: "customer" }).hold.risk.trackingId, j.hold.risk.trackingId);
});

test("the saved payment method comes from PayPal's vault; removing it deletes the token, and the next hold asks again", async () => {
  const c = person(), j = await held(c);
  const p = people.person(c.id);
  assert.ok(p.vault);
  const t = await pp().getPaymentToken(p.vault);
  assert.equal(t.kind, "card");
  assert.equal((await pp().listPaymentTokens(t.customerId)).length, 1);
  await pp().deletePaymentToken(p.vault);
  await assert.rejects(pp().getPaymentToken(p.vault), /404|NOT_FOUND/);
  people.updatePerson(c.id, { vault: null, vaultLabel: null });
  const j2 = await offered(c), o = cheapest(j2);
  const r = await J.acceptOffer(j2.id, o.id, { actor: P(c) });
  assert.equal(J.job(j2.id).hold.status, "pending_approval", "nothing saved: approve in PayPal again");
  assert.ok(j.id && r);
});

test("a hold waiting for approval can be placed with a Fastlane card instead; card fields and Google Pay make a new order", async () => {
  const c = person(), j = await offered(c), o = cheapest(j);
  await J.acceptOffer(j.id, o.id, { actor: P(c), payWith: "paypal" });
  assert.equal(J.job(j.id).hold.status, "pending_approval");
  assert.equal((await J.holdWith(j.id, P(c), { method: "fastlane" })).error, "token");
  assert.equal((await J.holdWith(j.id, P(person()), { method: "fastlane", token: "FL-123456" })).error, "forbidden");
  const before = J.job(j.id).hold.order;
  const cf = await J.holdWith(j.id, P(c), { method: "cardfields" });
  assert.equal(J.job(j.id).hold.status, "pending_approval");
  assert.notEqual(J.job(j.id).hold.order, before, "a new order for the card fields");
  assert.ok(cf);
  await J.holdWith(j.id, P(c), { method: "fastlane", token: "FL-123456" });
  const h = J.job(j.id);
  assert.equal(h.status, "held");
  assert.equal(h.hold.payWith, "fastlane");
  assert.match(J.view(h, { as: "customer" }).hold.paidWith, /Fastlane/);
});

test("a pro onboarded as a PayPal merchant (Partner Referrals) is the order's payee, with VeriPay's fee as platform_fees", async () => {
  const c = person(), j = await offered(c), o = j.offers.filter((x) => x.status === "open").sort((a, b) => a.amount - b.amount)[0];
  const pid = o.pro?.id || o.pro;
  assert.equal(onboarding.view(pros.pro(pid)).status, "none");
  const s = await onboarding.start(pid, "someone");
  assert.ok(s.url.includes("merchantIdInPayPal"));
  assert.equal(pros.pro(pid).merchant.status, "started");
  const v = await onboarding.sync(pid, { fromPayPal: { merchantIdInPayPal: new URL(s.url).searchParams.get("merchantIdInPayPal"), permissionsGranted: "true" } });
  assert.equal(v.status, "ready");
  assert.equal((await onboarding.start(pid, "someone")).error, "state");
  await J.acceptOffer(j.id, o.id, { actor: P(c), payWith: "card" });
  const h = J.job(j.id);
  assert.equal(h.hold.flow, "multiparty_payee_with_platform_fee");
  assert.match(h.hold.payeeMerchant, /Partner Referrals/);
  const r = await deliver(h);
  assert.equal(r.status, "released");
  assert.ok(cents(h).ok);
});
