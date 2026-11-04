// Products, quotes and a policy's life with the PayPal stand-in: a first premium approved in PayPal, monthly premiums
// charged to saved PayPal, a declined premium (grace, lapse, reinstated by invoice), a change and a cancellation.
import test from "node:test";
import assert from "node:assert/strict";
import { mockPaypal } from "../src/pay/mock.js";
import { setPay, pp } from "../src/pay/index.js";
import { makePerson, person } from "../src/people.js";
import { check } from "../src/products/index.js";
import { quote } from "../src/quote.js";
import * as P from "../src/policy.js";
import { advance } from "../src/clock.js";
import { poolOf } from "../src/pool.js";

setPay(mockPaypal({ file: null }), "http://test");
const renters = { place: "Austin, TX 78704", size: 650, floor: "low", building: "managed", contents: 8000, valuables: 0, claims3y: 0, deductible: "250" };

test("every clause the products cite exists", () => assert.deepEqual(check(), []));

test("a quote says where the money goes: 20% fee, the rest the claims pool", () => {
  const q = quote("renters", renters);
  const cents = (s) => Math.round(parseFloat(s.slice(1)) * 100), w = q.whereYourMoneyGoes;
  assert.equal(cents(w.coverFee), Math.round(cents(q.annual) * 0.2));
  assert.equal(cents(w.claimsPool) + cents(w.coverFee) + cents(w.reinsurance), cents(q.annual));
  assert.equal(q.zone.area, "Austin, TX 78704"); assert.equal(q.zone.state, "TX");
});

test("missing answers are named, out-of-range ones refused", () => {
  const q = quote("pet", { species: "dog" });
  assert.equal(q.error, "answers"); assert.ok(q.missing.includes("ageYears"));
  assert.equal(quote("pet", { species: "dog", petName: "x", breedSize: "small", ageYears: 20, chipped: true, conditions: "none", limit: "6000", copay: "20" }).error, "answers");
});

test("life: a serious illness is referred to a person, not sold online", () => {
  const q = quote("life", { ageYears: 50, sex: "m", smoker: false, health: "serious", job: "office", amount: "250000", term: "20" });
  assert.equal(q.decision, "refer");
});

test("a monthly policy: paid, charged, declined, lapsed, reinstated, changed, cancelled", async () => {
  const me = makePerson({ name: "Anna" });
  const q = quote("renters", renters, { person: me.id });
  let v = await P.buy(me.id, { quote: q.quote, plan: "monthly", cause: "animals" });
  assert.equal(v.status, "awaiting_payment"); assert.ok(v.approveUrl);
  pp().approve({ token: v.payments[0].paypal });
  v = await P.confirm(v.policy);
  assert.equal(v.status, "active"); assert.ok(person(me.id).vault, "PayPal saved in the Vault with the first payment");
  advance(31); assert.deepEqual((await P.tick()).map((x) => x[1]), ["charged"]);
  pp().failNextCharge(person(me.id).vault);
  advance(31); await P.tick(); assert.equal(P.policy(v.policy).status, "grace");
  advance(15); await P.tick(); assert.equal(P.policy(v.policy).status, "lapsed");
  pp().approve({ invoice: P.policy(v.policy).invoice.id }); await P.tick();
  assert.equal(P.policy(v.policy).status, "active"); assert.equal(P.policy(v.policy).gaps.length, 1);
  const c = await P.change(v.policy, { answers: { contents: 15000 } });
  assert.match(c.difference, /^charged/);
  const x = await P.cancel(v.policy);
  assert.equal(x.status, "cancelled");
  const pool = poolOf("animals");
  assert.equal(pool.fees + pool.balance, pool.premiums - pool.refunds);
});
