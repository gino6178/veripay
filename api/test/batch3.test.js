// PLAN §16: the earnings dashboard (4), the verifiable work record (2), the home profile and maintenance agent (1),
// neighborhood group jobs (3). In process, on the stand-in.
import test from "node:test";
import assert from "node:assert/strict";
import { J, person, P, PRO, pros, people, tools, held, deliver, faucetEvidence, clock, receipts } from "./helpers.js";
const dash = await import("../src/prodash.js");
const WR = await import("../src/workrecord.js");
const H = await import("../src/home.js");
const G = await import("../src/groups.js");

async function paid(c, opts = {}) {
  const j = await held(c, opts);
  J.startWork(j.agreed.pro, j.id, PRO(j.agreed.pro));
  await deliver(J.job(j.id), faucetEvidence(J.job(j.id)));
  let k = J.job(j.id);
  if (k.status === "review") { await J.confirm(j.id, P(c)); k = J.job(j.id); }
  if (k.status === "review") { await J.release(j.id, P(c), { acknowledgeFailed: J.notPassed(k, k.milestones[0]).map((x) => x.id) }); k = J.job(j.id); }
  return k;
}

test("the earnings dashboard: totals from the ledgers, time to paid, fix rate, ratings, a monthly series, CSV", async () => {
  const c = person(), k = await paid(c), pid = k.agreed.pro;
  if (k.status === "released") J.rate(k.id, { stars: 5 }, P(c));
  const d = dash.dashboard(pid, { months: 6 });
  const row = d.rows.find((r) => r.job === k.id);
  assert.ok(row); assert.equal(row.fee, J.balance(k).fee); assert.equal(row.toPro, J.balance(J.job(k.id)).pro - J.balance(J.job(k.id)).materials);
  assert.equal(d.monthly.length, 6); assert.ok(d.monthly.every((m) => /^\d{4}-\d{2}$/.test(m.month)));
  assert.ok(d.totals.net.cents >= row.net); assert.ok(d.timeToPaid.n >= 1);
  assert.ok(d.fixRate.checked >= 1); assert.ok(d.fixRate.rate >= 0 && d.fixRate.rate <= 1);
  if (k.status === "released") assert.ok(d.ratings.n >= 1);
  const csv = dash.dashboardCsv(d);
  assert.match(csv.split("\n")[0], /^number,title,trade/); assert.ok(csv.includes(k.number));
});

test("the work record: no customer data, signed entries tied to the transparency log, verifiable with the public key; tampering fails", async () => {
  const c = person({ name: "Secret Customer Name" }), k = await paid(c);
  assert.equal(k.status, "released");
  assert.ok(!(k.milestones || []).some((m) => m.acknowledgedFailed), "paid on its checks");
  await receipts.batch();
  const rec = WR.workRecord(k.agreed.pro);
  const e = rec.records.find((x) => x.log.receiptId && J.job(k.id).receipts.some((r) => r.id === x.log.receiptId));
  assert.ok(e, "the job is in the record");
  const s = JSON.stringify(rec);
  assert.ok(!s.includes("Secret Customer Name") && !s.includes(c.id) && !s.includes(k.id) && !s.includes(k.address.line || "@@"), "no customer data, no job id");
  assert.match(e.body.amountBand, /\$/); assert.equal(e.body.month.length, 7);
  const v = WR.verifyRecord(JSON.parse(s), receipts.publicKey());
  assert.equal(v.ok, true, JSON.stringify(v).slice(0, 300)); assert.ok(v.entries.find((x) => x.receiptHash === e.body.receiptHash).inLog);
  const bad = JSON.parse(s); bad.records.find((x) => x.hash === e.hash).body.amountBand = "$5,000 and up";
  assert.equal(WR.verifyRecord(bad, receipts.publicKey()).ok, false);
  assert.match(WR.recordPage(rec), /verified work record/);
});

test("the home profile: a water heater from a paid replacement job (plate and spec), history, warranties; suggestions turn into jobs within limits", async () => {
  const c = person();
  people.updatePerson(c.id, { limits: { perJobMax: 400000 } });
  const j = await J.createJob(c.id, { text: "Replace our 50 gallon water heater this month", zip: "78704", budget: 300000, actor: P(c) });
  // a paid replacement, a year and a month ago (the record as it would stand)
  const k = J.job(j.id);
  Object.assign(k, { status: "released", agreed: { pro: "barton-creek-plumbing", proName: "Barton Creek Plumbing (demo)", price: 150000, at: new Date(clock.now() - 400 * 864e5).toISOString() }, paidAt: new Date(clock.now() - 400 * 864e5).toISOString() });
  k.money.split = { release: 150000 };
  k.scope.spec = { ...(k.scope.spec || {}), capacityGal: 50 };
  k.checks.push({ round: 1, milestone: "m1", checks: [{ id: "c1", verdict: "pass", plate: { brand: "Rheem", model: "XG50T06EC36U1", serial: "Q1234567", by: "done-ocr" } }] });
  J.jobsStore.save();
  const h = H.homeOf(c.id);
  const wh = h.appliances.find((a) => a.kind === "water_heater");
  assert.ok(wh); assert.equal(wh.brand, "Rheem"); assert.equal(wh.capacityGal, 50); assert.ok(wh.ageYears > 1);
  assert.match(wh.warranty.source, /rule of thumb/);
  assert.ok(h.history.some((x) => x.job === j.id && x.closeout));
  const flush = h.suggestions.find((s) => s.kind === "flush");
  assert.ok(flush, JSON.stringify(h.suggestions.map((s) => s.kind))); assert.equal(flush.source, "rules");
  // an agent within limits posts it as a job; over the limit it's the person's
  people.updatePerson(c.id, { limits: { perJobMax: 1000 } });
  const a = { kind: "agent", person: c.id, client: "home agent", scopes: ["read", "hire", "pay"] };
  assert.equal((await H.acceptSuggestion(c.id, flush.id, a)).error, "limit");
  people.updatePerson(c.id, { limits: { perJobMax: 400000 } });
  const r = await tools.CUSTOMER.accept_suggestion({ ...a, token: "t" }, { suggestion: flush.id });
  assert.ok(!r.error, r.message); assert.equal(r.status, "offered"); assert.match(r.text, /Flush/);
  assert.ok(!H.suggestionsFor(c.id).some((s) => s.id === flush.id), "accepted once");
  // a person-added appliance
  assert.equal(H.addAppliance(c.id, { kind: "spaceship" }).error, "kind");
  const disp = H.addAppliance(c.id, { kind: "garbage_disposal", installed: new Date(clock.now() - 11 * 365 * 864e5).toISOString().slice(0, 10) });
  assert.ok(disp.id); assert.ok(H.homeOf(c.id).appliances.some((x) => x.id === disp.id && x.ageYears > 10));
});

test("neighborhood groups: same ZIP and job type; the group price is a discount on each household's own quote; each pays separately", async () => {
  const a = person({ zip: "78704" }), b = person({ zip: "78704" }), c = person({ zip: "78704" }), far = person({ zip: "78758" });
  const ja = await J.createJob(a.id, { text: "Bathroom sink drain is clogged and slow. Fix it this week, $300 max.", zip: "78704", budget: 30000, actor: P(a) });
  const g0 = G.openGroup(ja.id, P(a));
  assert.ok(g0.group); assert.equal(G.viewGroup(g0.group, a.id).households, 1);
  const rb = await G.joinGroup(g0.group.id, P(b), { text: "Kitchen sink drain is clogged and slow, fix this week, $300 max.", budget: 30000 });
  assert.ok(!rb.error, rb.message);
  let g = G.group(g0.group.id);
  assert.equal(g.discountPct, 10); assert.ok(g.pro);
  const offA = J.job(ja.id).offers.find((o) => o.group === g.id && o.status === "open");
  assert.ok(offA); assert.equal(offA.amount, Math.round(Math.round(offA.ask0 * 0.9) / 500) * 500);
  // a third household: 15%, the offers are re-priced
  const ag = { kind: "agent", person: c.id, client: "c's agent" };
  people.updatePerson(c.id, { limits: { perJobMax: 10000 } });
  assert.equal((await G.joinGroup(g.id, ag, { text: "Our bathtub drain is clogged and slow. Fix this week.", budget: 30000 })).error, "limit", "an agent joins only within limits");
  people.updatePerson(c.id, { limits: { perJobMax: 50000 } });
  const rc = await G.joinGroup(g.id, ag, { text: "Our bathtub drain is clogged and slow. Fix this week.", budget: 30000 });
  assert.ok(!rc.error, rc.message);
  g = G.group(g.id); assert.equal(g.discountPct, 15);
  const offA2 = J.job(ja.id).offers.find((o) => o.group === g.id && o.status === "open");
  assert.ok(offA2.amount < offA.amount); assert.equal(J.job(ja.id).offers.find((o) => o.id === offA.id).status, "superseded");
  // another ZIP or job type can't join
  const jf = await J.createJob(far.id, { text: "Bathroom sink drain is clogged. Fix it this week, $300 max.", zip: "78758", budget: 30000, actor: P(far) });
  assert.equal((await G.joinGroup(g.id, P(far), { job: jf.id })).error, "group");
  // each household accepts, holds and pays on its own job
  const rA = await J.acceptOffer(ja.id, offA2.id, { actor: P(a), payWith: "card" });
  assert.ok(!rA.error, rA.message);
  const kA = J.job(ja.id);
  assert.equal(kA.status, "held"); assert.equal(kA.agreed.price, offA2.amount);
  const jb = rb.job.id, offB = J.job(jb).offers.find((o) => o.group === g.id && o.status === "open");
  await J.acceptOffer(jb, offB.id, { actor: P(b), payWith: "card" });
  assert.notEqual(J.job(jb).hold.authorization, kA.hold.authorization, "separate holds");
  const v = G.viewGroup(G.group(g.id), b.id);
  assert.equal(v.households, 3); assert.equal(v.members.filter((m) => m.job).length, 1, "a household sees only its own job id");
  assert.ok(G.openGroupsNear("78704").some((x) => x.id === g.id));
});
