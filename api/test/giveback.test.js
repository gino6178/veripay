// Giving to several causes: a person's premiums split across the pools of the causes they chose, to the cent, and the
// year's close pays every cause in one PayPal Payouts batch, with an item and a receipt per cause.
import test from "node:test";
import assert from "node:assert/strict";
import { mockPaypal } from "../src/pay/mock.js";
import { setPay, pp } from "../src/pay/index.js";
import { makePerson } from "../src/people.js";
import { quote } from "../src/quote.js";
import * as P from "../src/policy.js";
import * as ops from "../src/ops.js";
import { lines, split, causesOf } from "../src/pool.js";
import * as carrier from "../src/carrier.js";

setPay(mockPaypal({ file: null }), "http://test");
const renters = { place: "Austin, TX 78704", size: 650, floor: "low", building: "managed", contents: 8000, valuables: 0, claims3y: 0, deductible: "250" };

test("shares are kept to the cent", () => {
  assert.deepEqual(split(1001, { a: 50, b: 50 }), [["a", 501], ["b", 500]]);
  assert.deepEqual(causesOf({ animals: 1, hunger: 1, ocean: 1 }), { animals: 34, hunger: 33, ocean: 33 });
  assert.deepEqual(causesOf("nope"), { disaster: 100 });
});

test("a premium splits across the chosen causes, and the year's close pays them all in one batch", async () => {
  const me = makePerson({ name: "Zoe" });
  const q = quote("renters", renters, { person: me.id });
  const v = await P.buy(me.id, { quote: q.quote, plan: "yearly", causes: { animals: 60, hunger: 40 } });
  pp().approve({ token: v.payments[0].paypal });
  await P.confirm(v.policy);
  const prem = lines({ policy: v.policy, kind: "premium" });
  assert.deepEqual(prem.map((l) => l.cause).sort(), ["animals", "hunger"]);
  assert.equal(prem.reduce((t, l) => t + l.amount, 0), P.policy(v.policy).annual);
  assert.equal(prem.find((l) => l.cause === "animals").amount, Math.round(P.policy(v.policy).annual * 0.6));
  const g = await carrier.closeYear();
  const paid = g.filter((x) => x.amount > 0);
  assert.ok(paid.length >= 2);
  assert.equal(new Set(paid.map((x) => x.payout)).size, 1, "one Payouts batch for every cause");
  assert.ok(paid.every((x) => x.receipt));
});

test("an agent can split its person's giveback, and a made-up cause is refused", () => {
  const me = makePerson({ name: "Yuki" });
  const a = { person: me.id, client: "t", scopes: ["read", "buy", "claim"] };
  assert.equal(ops.chooseCause(a, { causes: { animals: 50, nowhere: 50 } }).error, "cause");
  const r = ops.chooseCause(a, { causes: { kids: 70, ocean: 30 } });
  assert.deepEqual(r.causes.map((c) => [c.id, c.share]), [["kids", 70], ["ocean", 30]]);
});
