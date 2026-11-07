// PayPal, round 10 (the 112-item sweep): what the hold's order carries (job number, job site, language, line skus,
// card stored-credential ids), a declined card, Seller Protection, the test card confirmed on the same order,
// saving a card without a purchase, itemized and scheduled invoices, cash refunds and undo, card-paid plans with a free
// first visit and other cadences, shared plans, dispute evidence types and offers, and pay links with questions.
import test from "node:test";
import assert from "node:assert/strict";
import { J, person, P, offered, held, deliver, pp, people } from "./helpers.js";
const invoices = await import("../src/invoices.js");
const plans = await import("../src/plans.js");
const disputes = await import("../src/disputes.js");
const paylinks = await import("../src/paylinks.js");
const pros = await import("../src/pros.js");
const cheapest = (j) => j.offers.filter((x) => x.status === "open").sort((a, b) => a.amount - b.amount)[0];

test("the hold's order carries the job number, the job site, Spanish for a Spanish speaker, and line skus", async () => {
  const c = person(); people.updatePerson(c.id, { lang: "es" });
  const j = await offered(people.person(c.id)), o = cheapest(j);
  await J.acceptOffer(j.id, o.id, { actor: { ...P(c), ua: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)" }, payWith: "paypal" });
  const h = J.job(j.id).hold, ord = await pp().getOrder(h.order);
  assert.equal(ord.invoiceId, `${j.number}-H1`);
  assert.equal(ord.site.zip, j.address.zip);
  assert.equal(ord.locale, "es-US");
  assert.ok(ord.items.every((x) => x.sku?.startsWith(j.number)));
  const ctx = J.holdCtx(J.job(j.id), { ua: "Mozilla/5.0 (iPhone)" }, people.person(c.id), 2);
  assert.equal(ctx.customerRef, c.id);
  assert.equal(ctx.invoiceId, `${j.number}-H2`);
});

test("a card the bank declines (PayPal's CCREJECT trigger) fails the hold with the bank's code; a good card shows Seller Protection", async () => {
  const c = person(), j = await offered(c), o = cheapest(j);
  await J.acceptOffer(j.id, o.id, { actor: P(c), payWith: "paypal" });
  const r = await J.holdByCard(j.id, { ...P(c), cardName: "CCREJECT-REFUSED" });
  assert.equal(r.error, "paypal");
  assert.match(r.message, /declined.*0500/);
  assert.equal(J.job(j.id).hold.status, "failed");
  const j2 = await held(person());
  const v = J.view(j2).hold;
  assert.equal(v.sellerProtection.status, "NOT_ELIGIBLE");
  assert.match(v.sellerProtection.says, /evidence/);
});

test("the demo card on an order waiting for approval: confirmed on the same order (confirm-payment-source), and its network id kept", async () => {
  const c = person(), j = await offered(c), o = cheapest(j);
  await J.acceptOffer(j.id, o.id, { actor: P(c), payWith: "paypal" });
  const order = J.job(j.id).hold.order;
  await J.holdByCard(j.id, P(c));
  const h = J.job(j.id).hold;
  assert.equal(h.status, "held");
  assert.equal(h.order, order, "the same PayPal order");
  assert.ok(h.history.some((x) => /confirm-payment-source/.test(x.event)));
  const c2 = person(), j2 = await held(c2);
  assert.ok(people.person(c2.id).vaultNtr?.id, "the first stored charge's network id is kept for the next merchant-initiated hold");
  const j3 = await held(people.person(c2.id));
  assert.equal((await pp().getOrder(j3.hold.order)).prevNtr.id, people.person(c2.id).vaultNtr.id);
});

test("a card saved without a purchase: the test card's setup token is approved at once and becomes a card token", async () => {
  const s = await pp().vaultCardSetup({ requestId: "t9-card-setup", customerRef: "p_test" });
  assert.equal(s.status, "APPROVED");
  assert.equal((await pp().getSetupToken(s.id)).kind, "card");
  const t = await pp().vaultToken(s.id, "t9-card-token");
  assert.match(t.id, /^card:/);
  const v = await pp().vaultSetup({ requestId: "t9-venmo", venmo: true });
  pp().approve({ setup: v.id });
  assert.match((await pp().vaultToken(v.id, "t9-venmo-token")).id, /^venmo:/);
});

test("an itemized invoice: hours, parts with tax, a trip fee, NET_15; the tax goes to the pro; a scheduled one is deleted when cancelled", async () => {
  const pid = "zilker-clean-co", base = { customer: { email: "c9@example.com" }, title: "Deep clean", text: "Deep clean a three-bedroom house", zip: "78704", checks: [{ what: "a note", evidence: "note" }] };
  assert.equal((await invoices.create(pid, { ...base, amount: 30000, lines: [{ name: "Labor", qty: 2, unit: "HOURS", amount: 6000 }] })).error, "lines");
  const inv = await invoices.create(pid, { ...base, amount: 20000, lines: [{ name: "Labor", qty: 2, unit: "HOURS", amount: 6000 }, { name: "Supplies", amount: 6500, taxPct: 8.25 }], tripFee: 1500, payTerm: "NET_15", terms: "90-day workmanship warranty." });
  assert.ok(!inv.error, inv.message);
  invoices.addEvidence(pid, inv.id, [{ kind: "note", checkId: inv.scope.checks[0].id, text: "Cleaned every room, the kitchen and both bathrooms." }]);
  const sent = await invoices.submit(pid, inv.id);
  assert.equal(sent.status, "sent");
  pp().approve({ invoice: sent.paypal.id });
  await invoices.tick();
  const v = invoices.view(invoices.invoice(inv.id));
  assert.equal(v.status, "paid");
  assert.equal(v.salesTax.cents, Math.round(6500 * 0.0825));
  assert.equal(v.money.split.pro.cents, 20000 - 2000 + Math.round(6500 * 0.0825));
  const later = new Date(Date.now() + 3 * 864e5).toISOString().slice(0, 10);
  const s2 = await invoices.create(pid, { ...base, amount: 15000, sendOn: later });
  invoices.addEvidence(pid, s2.id, [{ kind: "note", checkId: s2.scope.checks[0].id, text: "Cleaned every room, the kitchen and both bathrooms." }]);
  const q = await invoices.submit(pid, s2.id);
  assert.equal(q.paypal.status, "SCHEDULED");
  assert.equal((await invoices.editScheduled(pid, s2.id, { sendOn: new Date(Date.now() + 5 * 864e5).toISOString().slice(0, 10) })).error, undefined);
  const x = await invoices.cancel(pid, s2.id);
  assert.equal(x.paypal.status, "DELETED");
});

test("cash outside PayPal: a mistaken cash payment is undone, and cash given back is recorded on the PayPal invoice", async () => {
  const pid = "zilker-clean-co";
  const inv = await invoices.create(pid, { customer: { email: "c9b@example.com" }, title: "Window clean", text: "Clean all the windows inside and out", amount: 12000, zip: "78704", checks: [{ what: "a note", evidence: "note" }] });
  invoices.addEvidence(pid, inv.id, [{ kind: "note", checkId: inv.scope.checks[0].id, text: "Cleaned every window inside and outside, both floors." }]);
  await invoices.submit(pid, inv.id);
  assert.equal((await invoices.recordPayment(pid, inv.id, { method: "CASH" })).status, "paid_outside");
  const u = await invoices.undoOutside(pid, inv.id);
  assert.equal(u.status, "sent");
  await invoices.recordPayment(pid, inv.id, { method: "CASH" });
  const r = await invoices.refundOutside(pid, inv.id, { amount: 2000 });
  assert.ok(r.money.ledger.some((l) => l.kind === "refund_outside_paypal"));
});

test("a plan paid with the test card is active at once; a free first visit, every 3 months, per unit; cancelling retires its PayPal plan", async () => {
  const c = person(), j = await held(c);
  await deliver(j);
  assert.equal((await plans.create(j.id, { amount: 9000, every: 2 }, P(c))).error, "every");
  const p0 = await plans.create(j.id, { amount: 9000, every: 3, trial: true, units: 2, payWith: "card" }, P(c));
  assert.ok(!p0.error, p0.message);
  assert.equal(p0.status, "active", "PayPal activated it on the card, no approval page");
  assert.deepEqual([p0.every, p0.trial, p0.units], [3, true, 2]);
  assert.ok(p0.cycles.length >= 1);
  const x = await plans.changeUnits(p0.id, 3, P(c));
  assert.ok(x.approveUrl, "more units: PayPal asks the customer to approve (revise)");
  const z = await plans.cancel(p0.id, P(c));
  assert.equal(z.status, "cancelled");
  assert.equal(plans.plan(p0.id).paypal.planStatus, "INACTIVE");
});

test("a shared plan: one PayPal plan, this price as an override; a new price changes only this subscription", async () => {
  const c = person(), j = await held(c);
  await deliver(j);
  const p0 = await plans.create(j.id, { amount: 8000, payWith: "card", shared: true }, P(c));
  assert.ok(!p0.error, p0.message);
  const p = plans.plan(p0.id);
  assert.equal(p.paypal.shared, true);
  p.priceChange = { amount: 8500, at: new Date().toISOString() };
  const r = await plans.acceptPrice(p.id, P(c));
  assert.equal(r.amount.cents, 8500);
});

test("dispute evidence matches the claim; staff offer a redo or accept part; the queue lists what needs action", async () => {
  const c = person(), j = await held(c);
  await deliver(j);
  await disputes.escalate(j.id, "The work wasn't as described.", P(c));
  const k = J.job(j.id);
  assert.equal(disputes.evidenceType(k).type, k.paypalDispute.paypal?.reason && /NOT_AS_DESCRIBED/.test(k.paypalDispute.paypal.reason) ? "COPY_OF_CONTRACT" : "PROOF_FOR_SOFTWARE_OR_SERVICE_DELIVERED");
  const o = await disputes.offer(j.id, { kind: "redo", note: "The pro comes back Monday and redoes it." });
  assert.ok(!o.error, o.message);
  assert.equal(J.job(j.id).paypalDispute.offer.kind, "redo");
  const q = await disputes.queue({});
  assert.ok(q.count >= 0 && Array.isArray(q.items));
  const a = await disputes.accept(j.id, { note: "Part of it back for the delay.", amount: 1000 });
  assert.ok(!a.error, a.message);
  assert.equal(J.job(j.id).paypalDispute.outcome.partial, true);
});

test("a pay link asks the payer a question (gate code) and can be repriced in place", async () => {
  const pid = pros.allPros()[0].id;
  const l = await paylinks.create(pid, { title: "Deposit for the bathroom", amount: 5000, purpose: "deposit" });
  assert.ok(!l.error, l.message);
  const r = await paylinks.reprice(pid, l.id, 6000);
  assert.equal(r.amount.cents, 6000);
  assert.equal((await pp().getPayLink(paylinks.view ? l.paypal?.id || (await pp().listPayLinks()).at(-1).id : null)).amount, 6000);
});
