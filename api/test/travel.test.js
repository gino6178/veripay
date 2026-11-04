// Travel: an agent insures its person's trip in one call; a flight that departs late or is cancelled pays every
// traveler by itself (no claim filed), a disruption known before buying is refused, the trip's cap holds, and
// cancelling before the first flight refunds in full.
import test from "node:test";
import assert from "node:assert/strict";
import { mockPaypal } from "../src/pay/mock.js";
import { setPay, pp } from "../src/pay/index.js";
import { makePerson, updatePerson } from "../src/people.js";
import * as ops from "../src/ops.js";
import * as P from "../src/policy.js";
import * as C from "../src/claims.js";
import { report } from "../src/flights.js";
import { now } from "../src/clock.js";
import { poolOf } from "../src/pool.js";

setPay(mockPaypal({ file: null }), "http://test");
const day = (n) => new Date(now() + n * 864e5).toISOString().slice(0, 10);
const agentFor = (p) => ({ person: p.id, client: "test agent", scopes: ["read", "buy", "claim"] });
async function trip(name, flights, travelers = 2) {
  const me = makePerson({ name, email: `${name.toLowerCase()}@example.com`, lang: "en" });
  ops.setLimits(me.id, { monthlyMax: 50000, mayBuy: true, autopay: false });
  const r = await ops.insureTrip(agentFor(me), { destination: "europe", departure: day(10), return: day(20), flights, tripCost: 900, travelers, oldest: 34, plan: "flight", cause: "ocean" });
  assert.ok(!r.error, JSON.stringify(r));
  pp().approve({ token: r.policy.payments[0].paypal });
  const v = await P.confirm(r.policy.policy);
  assert.equal(v.status, "active");
  return { me, pol: P.policy(r.policy.policy) };
}

test("a flight that leaves 2.5 hours late pays both travelers $100, with no claim filed", async () => {
  const { pol } = await trip("Ava", [{ flight: "UA857", date: day(10) }, { flight: "UA858", date: day(20) }]);
  report({ flight: "UA857", date: day(10), status: "departed", delayMin: 150 });
  const out = await C.flightTick();
  const c = out.find((x) => x?.policy === pol.id);
  assert.equal(c.status, "paid"); assert.equal(c.payout.amount, "$200.00");
  assert.equal(C.claim(c.claim).decision.by, "parametric");
  assert.equal((await C.flightTick()).filter((x) => x?.policy === pol.id).length, 0, "paid once");
  assert.ok(poolOf("ocean").claims >= 20000);
});

test("cancelled pays $300 a traveler; the trip's cap holds", async () => {
  const { pol } = await trip("Ben", [{ flight: "DL100", date: day(10) }, { flight: "DL101", date: day(15) }, { flight: "DL102", date: day(20) }], 1);
  report({ flight: "DL100", date: day(10), status: "cancelled" });
  report({ flight: "DL101", date: day(15), status: "departed", delayMin: 400 });
  report({ flight: "DL102", date: day(20), status: "departed", delayMin: 130 });
  const paid = (await C.flightTick()).filter((x) => x?.policy === pol.id);
  const total = paid.reduce((t, c) => t + (c.payout ? Math.round(parseFloat(c.payout.amount.slice(1)) * 100) : 0), 0);
  assert.equal(total, 60000, "$600 a traveler per trip at most");
  assert.ok(paid.some((c) => c.status === "denied" && /cap/.test(C.claim(c.claim).decision.reason)));
});

test("a flight already delayed can't be insured (TR-3.1)", async () => {
  report({ flight: "AA200", date: day(10), status: "delayed", delayMin: 240 });
  const me = makePerson({ name: "Cy" }); ops.setLimits(me.id, { monthlyMax: 50000 });
  const r = await ops.insureTrip(agentFor(me), { destination: "domestic", departure: day(10), return: day(12), flights: [{ flight: "AA200", date: day(10) }], travelers: 1, oldest: 30 });
  assert.equal(r.policy.error, "known_disruption");
});

test("cancelling before the first flight refunds the whole trip", async () => {
  const { pol } = await trip("Dee", [{ flight: "B6123", date: day(10) }], 1);
  const v = await P.cancel(pol.id);
  assert.equal(v.refunded, `$${(pol.annual / 100).toFixed(2)}`);
});
