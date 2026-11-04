// Neighborhood funds: three households in one ZIP with renters cover are offered a fund; members' monthly amounts come
// from saved PayPal; when Cover pays a member's claim the fund pays half its deductible; the year's leftover goes to the
// project the members voted for; an agent joins only within its person's limits.
import test from "node:test";
import assert from "node:assert/strict";
import { mockPaypal } from "../src/pay/mock.js";
import { setPay, pp } from "../src/pay/index.js";
import { makePerson } from "../src/people.js";
import { quote } from "../src/quote.js";
import * as P from "../src/policy.js";
import * as C from "../src/claims.js";
import * as N from "../src/community.js";
import * as ops from "../src/ops.js";
import { setReader } from "../src/reader.js";
import { advance, now } from "../src/clock.js";

setPay(mockPaypal({ file: null }), "http://test");
setReader((e, buf) => ({ amount: +buf.toString().split("=")[1] / 100, date: new Date(now()).toISOString().slice(0, 10), merchant: "Fix", items: [], text: "", confidence: 0.95 }));
const answers = { place: "Austin, TX 78704", size: 650, floor: "low", building: "managed", contents: 8000, valuables: 0, claims3y: 0, deductible: "250" };
async function household(name) {
  const me = makePerson({ name, email: `${name.toLowerCase()}@example.com` });
  const q = quote("renters", answers, { person: me.id, addons: ["devices"] });
  const v = await P.buy(me.id, { quote: q.quote, plan: "monthly", cause: "kids" });
  pp().approve({ token: v.payments[0].paypal }); await P.confirm(v.policy);
  return { me, pol: P.policy(v.policy) };
}

test("three neighbors: suggested, joined, and the fund pays half a member's deductible", async () => {
  const a = await household("Ann"), b = await household("Bea"), c = await household("Cal");
  const s = N.suggestion(a.me.id);
  assert.equal(s.zip, "78704"); assert.equal(s.households, 3);
  for (const h of [a, b, c]) assert.ok(!(await N.join(h.me.id, {})).error);
  const f = N.fundFor("78704");
  assert.equal(N.active(f).length, 3); assert.equal(N.balance(f), 900);
  advance(31); await N.tick(); assert.equal(N.balance(f), 1800, "a second month from each");
  // Bea's laptop: $180 repair, the add-on's $50 deductible; the fund would pay $25 of it, but holds only $18 so far
  const cl = await C.file(b.me.id, { policy: b.pol.id, type: "device_damage", happenedAt: new Date(now() - 3600e3).toISOString(), amount: 180, evidence: [{ kind: "photo", data: Buffer.from("p-bea").toString("base64") }, { kind: "repair_quote", data: Buffer.from("x=18000").toString("base64") }] });
  assert.equal(cl.status, "paid");
  assert.equal(N.view(f).deductibleHelp, "$18.00", "never more than the fund holds"); assert.equal(N.balance(f), 0);
});

test("the year's leftover goes to the project the members chose", async () => {
  const f = N.fundFor("78704"), [m1, m2] = N.active(f);
  advance(31); await N.tick(); assert.equal(N.balance(f), 900);
  assert.equal(N.propose(m1.person, f.id, { title: "Sandbags for the block", payee: "nope" }).error, "project");
  const v = N.propose(m1.person, f.id, { title: "Sandbags for the block", payee: "block-captain@example.com" });
  N.vote(m1.person, f.id, v.projects[0].id); N.vote(m2.person, f.id, v.projects[0].id);
  const [g] = await N.closeYear();
  assert.equal(g.project, "Sandbags for the block"); assert.ok(g.amount > 0 && g.payout);
  assert.equal(N.balance(f), 0);
});

test("an agent joins only with its person's autopay, and too few households can't start a fund", async () => {
  const d = await household("Dan");
  const ag = { person: d.me.id, client: "test agent", scopes: ["read", "buy", "claim"] };
  ops.setLimits(d.me.id, { monthlyMax: 50000, mayBuy: true, autopay: false });
  assert.equal((await ops.joinFund(ag, {})).error, "limits");
  ops.setLimits(d.me.id, { autopay: true });
  assert.ok(!(await ops.joinFund(ag, {})).error);
  const lone = makePerson({ name: "Eve" }), q = quote("renters", { ...answers, place: "Boise, ID 83702" }, { person: lone.id });
  const v = await P.buy(lone.id, { quote: q.quote, plan: "monthly" }); pp().approve({ token: v.payments[0].paypal }); await P.confirm(v.policy);
  assert.equal((await N.join(lone.id, {})).error, "too_few");
});
