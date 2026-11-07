// What a customer's agent may do: scopes, the per-job and monthly limits (shown in dollars, kept in cents), change
// orders over the agent's limit (refused; the person approves them on the website), release and cancel only with
// permission, and payees: only the pro's verified PayPal, never an address an agent sends.
import test from "node:test";
import assert from "node:assert/strict";
import { J, person, P, PRO, AGENT, offered, held, deliver, faucetEvidence, people, pros, tools, pp } from "./helpers.js";
import { can, makeToken, agentOf } from "../src/auth.js";

const cheapest = (j) => j.offers.filter((o) => o.status === "open").sort((a, b) => a.amount - b.amount)[0];

test("a change order over the agent's limit is refused for the agent; the person can approve it", async () => {
  const c = person();
  people.updatePerson(c.id, { limits: { changeMax: 5000 } });
  const j = await held(c, { budget: 30000 });
  J.startWork(j.agreed.pro, j.id, PRO(j.agreed.pro));
  const big = await J.requestChange(j.agreed.pro, j.id, { amount: 7500, reason: "the shut-off valve is corroded" }, PRO(j.agreed.pro));
  assert.equal(big.change.agentMayApprove, false);
  assert.match(big.change.needs, /on the website/);
  const r = await J.approveChange(j.id, big.change.id, AGENT(c));
  assert.equal(r.error, "limit");
  assert.equal(r.limit, "changeMax");
  assert.equal(r.limitUsd, "$50.00");
  assert.equal(J.job(j.id).changeOrders[0].status, "pending");
  // the evidence can't be checked while a change order waits
  J.addEvidence(j.agreed.pro, j.id, faucetEvidence(j), PRO(j.agreed.pro));
  assert.equal((await J.submit(j.agreed.pro, j.id, PRO(j.agreed.pro))).error, "pending");
  const ok = await J.approveChange(j.id, big.change.id, P(c));
  assert.ok(!ok.error, ok.message);
  assert.equal(J.job(j.id).changeOrders[0].status, "approved");
  // within the limit, the agent approves by itself
  const k = await held(c, { budget: 30000 });
  J.startWork(k.agreed.pro, k.id, PRO(k.agreed.pro));
  const small = await J.requestChange(k.agreed.pro, k.id, { amount: 2500, reason: "new supply line" }, PRO(k.agreed.pro));
  assert.equal(small.change.agentMayApprove, true);
  assert.ok(!(await J.approveChange(k.id, small.change.id, AGENT(c))).error);
});

test("per-job and monthly limits stop the agent's accept; the person may go over them", async () => {
  const c = person();
  people.updatePerson(c.id, { limits: { perJobMax: 15000 } });
  const j = await offered(c);
  const r = await J.acceptOffer(j.id, cheapest(j).id, { actor: AGENT(c), payWith: "card" });
  assert.equal(r.error, "limit");
  assert.equal(r.limit, "perJobMax");
  assert.equal(r.limitUsd, "$150.00");
  assert.equal(J.job(j.id).status, "offered", "nothing agreed, nothing held");
  const d = person();
  people.updatePerson(d.id, { limits: { monthlyMax: 30000 } });
  await held(d, { actor: AGENT(d) });
  const k = await offered(d);
  const r2 = await J.acceptOffer(k.id, cheapest(k).id, { actor: AGENT(d) });
  assert.equal(r2.error, "limit");
  assert.equal(r2.limit, "monthlyMax");
  const v = await J.acceptOffer(k.id, cheapest(k).id, { actor: P(d) });
  assert.equal(v.status, "held", "the person on the website isn't limited by their agent's limits");
  const L = tools.limitsView(people.person(d.id));
  assert.equal(L.monthlyMax, "$300.00");
  assert.equal(L.cents.monthlyMax, 30000);
  assert.ok(L.spentThisMonth.startsWith("$"));
});

test("an agent releases or cancels only if the person allowed it", async () => {
  const c = person();
  people.updatePerson(c.id, { limits: { agentMayCancel: false } });
  const j = await offered(c);
  assert.equal((await J.cancel(j.id, AGENT(c))).error, "limit");
  people.updatePerson(c.id, { limits: { agentMayCancel: true, agentMayRelease: true } });
  assert.equal((await J.cancel(j.id, AGENT(c))).status, "cancelled");
});

test("scopes: a read-only token can't hire; tokens are kept as hashes", () => {
  const c = person(), t = makeToken(c.id, "reader", { scopes: ["read"] });
  const a = agentOf({ headers: { authorization: `Bearer ${t.token}` } });
  assert.equal(a.person, c.id);
  assert.ok(can(a, "job_status"));
  assert.ok(!can(a, "accept_offer"));
  assert.ok(!can(a, "release"));
  const h = makeToken(c.id, "hirer", { scopes: ["read", "hire"] }), b = agentOf({ headers: { authorization: `Bearer ${h.token}` } });
  assert.ok(can(b, "accept_offer") && !can(b, "release"));
});

test("payee: only the pro's verified PayPal; agent-sent payout addresses are ignored", async () => {
  const c = person();
  const a = { person: c.id, client: "test", scopes: ["read", "hire", "pay"] };
  const r = await tools.CUSTOMER.post_job(a, { text: "Kitchen faucet drips, fix it this week", zip: "78704", budget: 200, payee: "attacker@example.com", email: "attacker@example.com" });
  assert.deepEqual(r.ignored.sort(), ["email", "payee"]);
  assert.match(r.payeeRule, /verified PayPal/);
  const o = r.offers.filter((x) => x.status === "open").sort((x, y) => x.amount.cents - y.amount.cents)[0];
  const v = await tools.CUSTOMER.accept_offer(a, { job: r.id, offer: o.id, payWith: "card", receiver: "attacker@example.com" });
  assert.equal(v.status, "held");
  assert.deepEqual(v.ignored, ["receiver"]);
  const j = J.job(r.id);
  const done = await deliver(j);
  assert.equal(done.status, "released");
  const batch = Object.values(pp()._db.data.payouts).find((b) => b.sender === `${j.id}-payout`);
  const p = pros.pro(j.agreed.pro);
  assert.equal(batch.items.find((x) => x.id.endsWith("-pro")).receiver, p.paypal.email);
  assert.ok(batch.items.every((x) => !/attacker/.test(x.receiver)));
});

test("a pro without a verified PayPal can't be hired; once verified on the website, payouts go there", async () => {
  const x = pros.createPro({ name: "Unverified Plumbing Test", trade: "plumbing", zip: "78704", email: "unverified@done-demo.example" });
  assert.match(x.key, /^dpk_/);
  const c = person(), j = await offered(c);
  const r = J.proOffer(x.pro.id, j.id, { amount: 15000 }, PRO(x.pro.id));
  assert.ok(!r.error, r.message);
  const a = await J.acceptOffer(j.id, r.offer.id, { actor: P(c), payWith: "card" });
  assert.equal(a.error, "payee");
  pros.setPayPal(x.pro.id, { email: "verified-pro@done-demo.example" });
  const ok = await J.acceptOffer(j.id, r.offer.id, { actor: P(c), payWith: "card" });
  assert.equal(ok.status, "held");
  const done = await deliver(J.job(j.id));
  assert.equal(done.status, "released");
  const batch = Object.values(pp()._db.data.payouts).find((b) => b.sender === `${j.id}-payout`);
  assert.equal(batch.items[0].receiver, "verified-pro@done-demo.example");
});
