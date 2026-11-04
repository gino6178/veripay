// Partners: a travel seller's checkout agent asks Cover for an offer, counters once, and binds it for its customer.
// The policy is the customer's, the premium is Cover's own PayPal order, and the seller's commission is paid with
// PayPal Payouts from Cover's 20% fee, never from the claims pool. Expired offers and wrong keys are refused.
import test from "node:test";
import assert from "node:assert/strict";
import { mockPaypal } from "../src/pay/mock.js";
import { setPay, pp } from "../src/pay/index.js";
import * as partners from "../src/partners.js";
import * as P from "../src/policy.js";
import { allPeople } from "../src/people.js";
import { lines, poolOf, FEE } from "../src/pool.js";
import { now, advance } from "../src/clock.js";

setPay(mockPaypal({ file: null }), "http://test");
const day = (n) => new Date(now() + n * 864e5).toISOString().slice(0, 10);
const trip = () => ({ destination: "asia", departure: day(21), return: day(29), flights: [{ flight: "UA837", date: day(21), from: "SFO", to: "NRT" }, { flight: "UA838", date: day(29), from: "NRT", to: "SFO" }], travelers: 2, oldest: 34, tripCost: 642 });
const made = partners.createPartner({ name: "Test Air (demo)", email: "test-air@cover-demo.example", rate: 0.1 });
const p = partners.partnerOf({ headers: { authorization: `Bearer ${made.key}` } });
const cents = (s) => Math.round(parseFloat(String(s).replace(/[$,]/g, "")) * 100);
// a JSON-RPC call to the partner A2A endpoint, with a stand-in request and response
async function rpc(key, data) {
  let out = null, passed = false;
  await partners.a2a({ headers: { authorization: `Bearer ${key}` }, body: { jsonrpc: "2.0", id: 7, method: "message/send", params: { message: { kind: "message", role: "user", messageId: "m1", parts: [{ kind: "data", data }] } } } }, { json: (x) => { out = x; } }, () => { passed = true; });
  return passed ? "next" : out;
}

test("a partner key is shown once and kept as a hash", () => {
  assert.match(made.key, /^cvpk_/);
  assert.equal(p.id, made.partner.id);
  assert.ok(!JSON.stringify(partners.partnersStore.data).includes(made.key));
  assert.equal(partners.createPartner({ name: "Greedy", email: "g@example.com", rate: 0.25 }).error, "rate", "a commission can't eat Cover's whole fee");
});

test("offer, one counter to flight-only, bind: the customer's policy, then the commission from Cover's fee", async () => {
  const o = await rpc(made.key, { action: "offer_trip_cover", trip: trip(), plan: "standard" });
  const offer = o.result.parts.find((x) => x.kind === "data").data;
  assert.equal(o.result.contextId, offer.negotiation);
  assert.equal(offer.plan, "standard");
  assert.deepEqual(offer.covers.map((c) => c.clause), ["TR-2.1", "TR-2.2", "TR-2.3", "TR-2.4", "TR-2.5"]);
  assert.ok(Math.abs(Date.parse(offer.expires) - now() - 15 * 60e3) < 5e3, "good for 15 minutes");

  // the buyer's budget sits between flight-only and standard: Cover drops the lines, it doesn't discount
  const c = await rpc(made.key, { action: "counter_offer", offer: offer.offer, budget: cents(offer.price) / 100 - 1 });
  const counter = c.result.parts.find((x) => x.kind === "data").data;
  assert.equal(counter.plan, "flight");
  assert.deepEqual(counter.dropped.map((d) => d.clause), ["TR-2.4", "TR-2.5"]);
  assert.match(c.result.parts[0].text, /dropped TR-2\.4/);
  // the counter's price is exactly a flight-only offer's price for the same trip: the risk price, not a discount
  const fresh = partners.offerTripCover(p, { trip: trip(), plan: "flight" }).data;
  assert.equal(counter.price, fresh.price);
  // one round only
  assert.equal((await rpc(made.key, { action: "counter_offer", offer: counter.offer, budget: 1 })).result.parts[1].data.error, "one_counter");

  const b = await rpc(made.key, { action: "bind_cover", offer: counter.offer, customer: { name: "Mei Lin", email: "mei.lin@example.com" }, payer: "test_card" });
  const sale = b.result.parts[1].data;
  assert.equal(sale.policy.status, "awaiting_payment", "the stand-in has no test card: the customer approves Cover's order in PayPal");
  assert.ok(sale.payment.approveUrl);
  assert.equal(sale.commission.status, "waiting", "no commission before the premium is captured");

  // the customer is a person at Cover by their email, and the policy is theirs
  const who = allPeople().find((x) => x.email === "mei.lin@example.com");
  assert.ok(who);
  assert.ok(P.policiesOf(who.id).some((x) => x.id === sale.policy.id));

  // the customer approves in PayPal; the seller's agent asks cover_status
  pp().approve({ token: sale.payment.paypalOrder });
  const st = (await rpc(made.key, { action: "cover_status", sale: sale.sale })).result.parts[1].data;
  assert.equal(st.policy.status, "active");
  assert.equal(st.commission.status, "paid");
  assert.match(st.commission.paypalPayout, /^PAYOUT-/);
  const prem = cents(counter.price);
  assert.equal(cents(st.commission.amount), Math.round(prem * 0.1));

  // the ledger: the premium splits 80/20, the commission comes out of the fee only
  const L = lines({ policy: sale.policy.id }), premium = L.find((l) => l.kind === "premium"), com = L.find((l) => l.kind === "commission");
  assert.equal(premium.amount, prem);
  assert.equal(com.amount, Math.round(prem * 0.1));
  assert.equal(com.pool, 0, "the claims pool pays no commission");
  assert.equal(com.fee, -com.amount);
  assert.equal(com.ref, st.commission.paypalPayout);
  const pool = poolOf(premium.cause);
  assert.equal(pool.balance, prem - Math.round(prem * FEE), "the pool keeps its full 80%");
  assert.equal(pool.fees, Math.round(prem * FEE) - com.amount, "Cover keeps its fee less the commission");

  // asking again pays nothing twice
  await rpc(made.key, { action: "cover_status", sale: sale.sale });
  assert.equal(lines({ policy: sale.policy.id, kind: "commission" }).length, 1);
  // a bound offer can't be bound again
  assert.equal((await rpc(made.key, { action: "bind_cover", offer: counter.offer, customer: { email: "x@example.com" } })).result.parts[1].data.error, "offer_closed");
});

test("a premium captured on the return URL pays the commission too, and a second sale finds the same person", async () => {
  const o = partners.offerTripCover(p, { trip: trip(), plan: "flight" }).data;
  const s = (await partners.bindCover(p, { offer: o.offer, customer: { name: "Mei", email: "MEI.LIN@example.com" } })).data;
  assert.equal(allPeople().filter((x) => x.email?.toLowerCase() === "mei.lin@example.com").length, 1);
  pp().approve({ token: s.payment.paypalOrder });
  await P.confirm(s.policy.id); // what /paypal/return does
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(partners.sale(s.sale).commission.status, "paid");
});

test("a budget under the risk price is refused, with the lowest price, and the offer still stands", async () => {
  const o = partners.offerTripCover(p, { trip: trip(), plan: "standard" }).data;
  const r = partners.counterOffer(p, { offer: o.offer, budget: 5, discount: 50 });
  assert.equal(r.data.error, "below_risk_price");
  assert.match(r.text, /doesn't discount/);
  assert.ok(cents(r.data.floor.price) > 500);
  assert.equal(r.data.offer.status, "open");
});

test("an expired offer is refused", async () => {
  const o = partners.offerTripCover(p, { trip: trip(), plan: "flight" }).data;
  advance(16 / 1440, "test: 16 minutes");
  const r = await partners.bindCover(p, { offer: o.offer, customer: { name: "Late", email: "late@example.com" } });
  assert.equal(r.data.error, "offer_expired");
  assert.ok(!allPeople().some((x) => x.email === "late@example.com"), "nobody was made for a refused bind");
});

test("a wrong key is refused, and a person's token is passed on to the people's A2A", async () => {
  const r = await rpc("cvpk_not-a-real-key", { action: "offer_trip_cover", trip: trip() });
  assert.equal(r.error.code, -32001);
  assert.equal(await rpc("cover_abc123", {}), "next");
  // another partner's key can't see this partner's offers
  const other = partners.createPartner({ name: "Other (demo)", email: "o@cover-demo.example" });
  const o = partners.offerTripCover(p, { trip: trip(), plan: "flight" }).data;
  assert.equal((await rpc(other.key, { action: "bind_cover", offer: o.offer, customer: { email: "z@example.com" } })).result.parts[1].data.error, "offer");
});

test("the pool and fee totals still add up across every line", () => {
  const L = lines();
  const sum = (k, f = () => true) => L.filter(f).reduce((t, l) => t + l[k], 0);
  for (const l of L.filter((x) => x.kind === "premium")) assert.equal(l.fee + l.pool, l.amount);
  const premiums = sum("amount", (l) => l.kind === "premium"), commissions = sum("amount", (l) => l.kind === "commission");
  assert.ok(commissions > 0);
  assert.equal(sum("pool"), premiums - sum("fee", (l) => l.kind === "premium"), "only premiums moved the pools here");
  assert.equal(sum("fee"), sum("fee", (l) => l.kind === "premium") - commissions);
  assert.equal(sum("fee") + sum("pool"), premiums - commissions);
});
