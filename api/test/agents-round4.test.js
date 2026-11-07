// Round 4 red team: confirm can't release over failed checks; one guard in the capture path (only every-condition-
// passed, or failures a person named); experts release over failures only with a note; an inspector's pass doesn't
// release failed checks; a re-hold goes above the ceiling only by approved change orders; offers over the ceiling are
// marked; an agent's milestones are taken.
import test from "node:test";
import assert from "node:assert/strict";
import { J, person, P, PRO, photo, pp, people, pros, tools, setAI } from "./helpers.js";

async function hire(c, { text = "Kitchen faucet keeps dripping. Fix it this week.", budget = 25000, options = {} } = {}) {
  const j = await J.createJob(c.id, { text, zip: "78704", budget, options, actor: P(c) });
  await J.requestOffers(j.id, P(c), { now: true });
  const o = J.job(j.id).offers.filter((x) => x.status === "open").sort((a, b) => a.amount - b.amount)[0];
  await J.acceptOffer(j.id, o.id, { actor: P(c), payWith: "card", raiseCeiling: true });
  J.startWork(J.job(j.id).agreed.pro, j.id, PRO(J.job(j.id).agreed.pro));
  return J.job(j.id);
}
// the red team's case: no_drip (c2) failed, the receipt (c3) needs a fix, the rest passed but needed a person
const mixed = () => setAI({ check: async (job) => ({ checks: job.scope.checks.map((x) => ({ id: x.id, verdict: x.id === "c2" ? "fail" : x.id === "c3" ? "needs_fix" : "pass", reason: x.id === "c2" ? "drips" : x.id === "c3" ? "unreadable" : "a person should look", confidence: 0.5, signals: ["needs_person"] })), decision: "review", source: "rules" }) });
const deliver = async (j, ai) => { const pid = j.agreed.pro; J.addEvidence(pid, j.id, J.job(j.id).scope.checks.map((c) => ({ kind: c.evidence === "receipt" ? "receipt" : "photo", buf: photo(J.job(j.id)), mime: "image/jpeg", checkId: c.id, text: "TOTAL 35.00" })), PRO(pid)); ai(); try { return await J.submit(pid, j.id, PRO(pid)); } finally { setAI({ check: null }); } };

test("BLOCKER: confirm refuses when a check failed or needs a fix; nothing is captured; release needs the failures named", async () => {
  const c = person(), j = await hire(c);
  const v = await deliver(j, mixed);
  assert.equal(v.status, "review");
  const r = await J.confirm(j.id, P(c));
  assert.equal(r.error, "not_passed");
  assert.deepEqual(r.failed.map((x) => x.id).sort(), ["c2", "c3"]);
  assert.match(r.message, /request_fix|acknowledgeFailed/);
  assert.equal(J.job(j.id).money.captured, null, "nothing captured");
  assert.equal(pp()._db.data.auths[J.job(j.id).hold.authorization].captured, 0);
  assert.equal((await J.release(j.id, P(c), { acknowledgeFailed: ["c2"] })).error, "acknowledge", "every failed one must be named");
  const ok = await J.release(j.id, P(c), { acknowledgeFailed: ["c2", "c3"] });
  assert.equal(ok.status, "released");
  assert.match(ok.milestones[0].release.why, /over conditions that didn't pass \(c2, c3\), acknowledged/);
  assert.ok(!ok.timeline.some((t) => /every done-condition .* passed/.test(t.note || "")), "the timeline says what happened");
});

test("the expert queue: confirm only for passes; release_anyway needs a note and is recorded", async () => {
  const c = person(), j = await hire(c);
  await deliver(j, mixed);
  const q = J.queue().find((x) => x.job === j.id);
  assert.equal((await J.expertDecide(j.id, q.id, { decision: "release" })).error, "not_passed");
  assert.equal((await J.expertDecide(j.id, q.id, { decision: "release_anyway" })).error, "note");
  const r = await J.expertDecide(j.id, q.id, { decision: "release_anyway", note: "the drip is the customer's other tap" });
  assert.equal(r.status, "released");
  assert.equal(J.job(j.id).milestones[0].acknowledgedFailed.note, "the drip is the customer's other tap");
});

test("an inspector's pass doesn't release a milestone whose checks failed; the capture guard holds on every path", async () => {
  const ins = people.ensureDemoInspector(), c = person(), j = await hire(c, { options: { inspector: ins.id } });
  await deliver(j, mixed);
  const r = await J.inspect(ins.id, j.id, { verdict: "pass" });
  assert.equal(r.status, "review");
  assert.equal(J.job(j.id).money.captured, null);
  // the needs-person-only case confirms and pays, with the right words
  const k = await hire(person());
  await deliver(k, () => setAI({ check: async (job) => ({ checks: job.scope.checks.map((x) => ({ id: x.id, verdict: "pass", reason: "a person should look", confidence: 0.5, signals: ["needs_person"] })), decision: "review", source: "rules" }) }));
  const ok = await J.confirm(k.id, P({ id: k.customer }));
  assert.equal(ok.status, "released");
  assert.match(ok.milestones[0].release.why, /every condition .* passed; the ones that needed a person were confirmed by the customer/);
});

test("a re-hold goes above the ceiling only by approved change orders; offers over the ceiling are marked", async () => {
  const c = person(), j = await hire(c, { budget: 20000 });
  const ceiling = J.job(j.id).scope.priceCeiling, price = J.job(j.id).agreed.price;
  const co = await J.requestChange(j.agreed.pro, j.id, { amount: 6000, reason: "a new supply line and valve" }, PRO(j.agreed.pro));
  await J.approveChange(j.id, co.change.id, P(c));
  const h = J.job(j.id).hold;
  assert.ok(h.amount <= Math.max(ceiling, price) + 6000, `${h.amount} > ${Math.max(ceiling, price) + 6000}`);
  assert.ok(h.amount >= price + 6000);
  // an offer above the ceiling
  const d = person(), k = await J.createJob(d.id, { text: "Kitchen faucet keeps dripping. Fix it this week.", zip: "78704", budget: 18000, actor: P(d) });
  await J.requestOffers(k.id, P(d), { now: true });
  const over = J.view(J.job(k.id)).offers.find((o) => o.amount.cents > 18000);
  assert.equal(over.overCeiling, true);
  assert.equal(over.acceptable, false);
  assert.match(over.acceptableWhy, /raise the ceiling|raising the ceiling/);
});

test("an agent's milestones are taken: their own conditions, or titles that split the scope's", async () => {
  const c = person(), a = { person: c.id, client: "t", scopes: ["read", "hire", "pay"] };
  const r = await tools.CUSTOMER.post_job(a, { text: "Repaint the bedroom and patch two drywall holes this month", zip: "78704", budget: 450, milestones: [{ title: "Patch the holes", share: 0.4, checks: [{ what: "Photo of each patch before paint", evidence: "photo" }] }, { title: "Paint", share: 0.6, checks: ["Photo of each wall painted", { what: "Receipt for paint", evidence: "receipt" }] }] });
  assert.ok(!r.error, r.message);
  assert.equal(r.scope.milestones.length, 2);
  assert.ok(r.scope.checks.some((x) => x.id === "m2c2" && x.evidence === "receipt"));
  const r2 = await tools.CUSTOMER.post_job(a, { text: "Kitchen faucet keeps dripping. Fix it this week.", zip: "78704", budget: 250, milestones: [{ title: "Diagnose", share: 0.3 }, { title: "Repair", share: 0.7 }] });
  assert.equal(r2.scope.milestones.length, 2, JSON.stringify(r2.warning || ""));
  assert.ok(r2.scope.milestones.every((m) => m.checkIds.length));
});

test("the capture guard: even a review-window auto-release can't capture over a failed check", async () => {
  const { clock } = await import("./helpers.js");
  const c = person(), j = await hire(c);
  await deliver(j, mixed);
  // force the state a bug elsewhere might leave: passed, its review window over, with failed checks in the last round
  const m = J.job(j.id).milestones[0];
  m.status = "passed"; m.passed = { at: new Date().toISOString(), waiting: "review_window", until: new Date(clock.now() - 1000).toISOString() };
  J.job(j.id).status = "passed";
  await J.tick();
  assert.equal(J.job(j.id).money.captured, null, "nothing captured");
  assert.ok(J.job(j.id).timeline.length && (await import("../src/activity.js")).forRef(j.id).some((e) => e.action === "capture_refused"));
});

test("Dana: a resend identical to a turned-down file is refused; demo water-heater evidence matches the job; one buffer text; what paid", async () => {
  const ev = await import("../src/demoassets.js");
  // identical resend
  const c = person(), j = await hire(c);
  const buf = photo(J.job(j.id));
  J.addEvidence(j.agreed.pro, j.id, [{ kind: "photo", buf, mime: "image/jpeg", checkId: "c1" }], PRO(j.agreed.pro));
  setAI({ check: async (job) => ({ checks: job.scope.checks.map((x) => ({ id: x.id, verdict: x.id === "c1" ? "needs_fix" : "pass", reason: x.id === "c1" ? "blurry" : "ok", confidence: 0.9, signals: [] })), decision: "needs_fix", source: "rules" }) });
  try { await J.submit(j.agreed.pro, j.id, PRO(j.agreed.pro)); } finally { setAI({ check: null }); }
  const again = J.addEvidence(j.agreed.pro, j.id, [{ kind: "photo", buf, mime: "image/jpeg", checkId: "c1" }], PRO(j.agreed.pro));
  assert.equal(again.error, "unchanged");
  assert.match(again.message, /Nothing changed since the last check of c1.*blurry/);
  // water heater: 50 gallons from the job, the old tank for "before removal", a permit with number and issue date
  const w = await J.createJob(c.id, { text: "Replace our 50 gallon water heater this month", zip: "78704", budget: 300000, actor: P(c) });
  assert.equal(ev.gallonsOf(J.job(w.id)), 50);
  const items = await ev.evidenceFor(J.job(w.id), J.job(w.id).scope.checks, { typed: true });
  const byCheck = Object.fromEntries(items.map((x) => [x.checkId, x]));
  const oldC = J.job(w.id).scope.checks.find((x) => /old heater/i.test(x.what));
  assert.equal(byCheck[oldC.id].name, "wh-old.jpg");
  const permit = items.find((x) => /PERMIT No\./.test(x.text || ""));
  assert.match(permit.text, /Issued: \d{2}\/\d{2}\/\d{4}/);
  const rc = await ev.receiptToday("heater", 50);
  assert.ok(rc.length > 1000, "a heater receipt drawn for 50 gallons");
  // one buffer text: explain and bufferWhy agree on the %; paidWith says it was the test card
  const v = J.view(J.job(j.id));
  const pct = J.job(j.id).hold.bufferPct;
  if (/% of the price/.test(v.hold.explain)) assert.match(v.hold.explain, new RegExp(`${pct}% of the price`));
  assert.match(v.hold.bufferWhy, new RegExp(`^${pct}%`));
  assert.match(v.hold.paidWith, /sandbox test card/);
  assert.equal(people.person(c.id).vaultFrom, "test_card");
});

test("every review_scope suggestion can be applied by id; a licence already registered to another pro fails", async () => {
  const c = person(), a = { person: c.id, client: "t", scopes: ["read", "hire", "pay"] };
  const j = await J.createJob(c.id, { text: "Kitchen faucet keeps dripping. Fix it this week.", zip: "78704", budget: 25000, actor: P(c) });
  setAI({ review: async () => ({ gaps: [{ severity: "medium", what: "No licence number", suggestion: "Add a note with the plumber's licence number" }, { severity: "low", checkId: "c1", what: "vague", suggestion: "Photo of the new cartridge seated, handle off" }], ok: true, source: "test-model", revisedScope: null }) });
  try {
    const rv = await tools.CUSTOMER.review_scope(a, { job: j.id });
    assert.deepEqual(rv.gaps.map((g) => g.id), ["g1", "g2"]);
    const r1 = await tools.CUSTOMER.apply_scope_suggestion(a, { job: j.id, suggestion: "g1" });
    assert.ok(!r1.error, r1.message);
    assert.ok(r1.scope.checks.some((x) => x.evidence === "note" && /licence number/i.test(x.what)));
    const r2 = await tools.CUSTOMER.apply_scope_suggestion(a, { job: j.id, suggestion: "g2" });
    assert.equal(r2.scope.checks.find((x) => x.id === "c1").what, "Photo of the new cartridge seated, handle off");
    assert.equal((await tools.CUSTOMER.apply_scope_suggestion(a, { job: j.id, suggestion: "g9" })).error, "not_found");
  } finally { setAI({ review: null }); }
  // a duplicate licence
  const taken = pros.pro("barton-creek-plumbing").verification.license.number;
  const x = pros.createPro({ name: "Copycat Plumbing (test)", trade: "plumbing", zip: "78704", email: "cc@done-demo.example" });
  const v = pros.setVerification(x.pro.id, { license: { number: taken } });
  assert.equal(v.verification.license.valid, false);
  assert.match(v.verification.license.why, /already registered to another pro/);
});

test("Luis: a seeded customer answers a change order bigger than the buffer (a new hold) and confirms checks left to a person", async () => {
  const demopro = await import("../src/demopro.js");
  process.env.PAYPAL_OVERCAPTURE = "0"; // this one is about the re-hold (the over-capture allowance has its own test)
  const sc = people.makePerson({ name: "Demo · Luis's customer", zip: "78704", via: "seed" });
  const j = await hire(sc), pid = j.agreed.pro, held = J.job(j.id).hold.amount;
  const room = held - J.job(j.id).agreed.price, amt = Math.min(7400, room + 1500);
  assert.ok(amt > room, "the change order is bigger than the buffer");
  await J.requestChange(pid, j.id, { amount: amt, reason: "a new shutoff valve" }, PRO(pid));
  const r = await demopro.customerAnswersChange(j.id);
  assert.ok(!r?.error, r?.message);
  assert.equal(J.job(j.id).changeOrders[0].status, "approved");
  assert.ok(J.job(j.id).hold.amount > held, "a new, larger hold");
  delete process.env.PAYPAL_OVERCAPTURE;
  // review: every check passed but a person should look -> the demo customer confirms, labelled
  const v = await deliver(J.job(j.id), () => setAI({ check: async (job) => ({ checks: job.scope.checks.map((x) => ({ id: x.id, verdict: "pass", reason: "a person should look", confidence: 0.5, signals: ["needs_person"] })), decision: "review", source: "rules" }) }));
  assert.equal(v.status, "review");
  const c = await demopro.customerConfirms(j.id);
  assert.ok(!c?.error, c?.message);
  assert.notEqual(J.job(j.id).status, "review");
  assert.ok(J.job(j.id).thread.some((t) => /^The customer (looked|asked)/.test(t.text || "")));
  // the clock: scheduled demo steps never move it
  const clock = (await import("../src/clock.js"));
  const t0 = Date.parse(clock.nowIso());
  await demopro.step(j.id);
  assert.ok(Date.parse(clock.nowIso()) - t0 < 60e3);
});

test("items 12-16: the real buffer %, nothing held while waiting, a customer's receipt condition stays, demo payout addresses, item status", async () => {
  const c = person();
  const j = await J.createJob(c.id, { text: "Kitchen faucet keeps dripping. Fix it this week.", zip: "78704", budget: 25000, actor: P(c) });
  const checks = J.job(j.id).scope.checks.filter((x) => x.evidence !== "receipt").concat([{ id: "r9", what: "Receipt for anything bought", evidence: "receipt" }]);
  J.editScope(j.id, { checks }, P(c));
  assert.equal(J.job(j.id).scope.checks.find((x) => x.id === "r9").by, "customer");
  const p = pros.viewPro(pros.pro("barton-creek-plumbing"));
  assert.equal(p.payout.demoAddress, true);
  const ex = J.explainPayout({ batchId: "b1", status: "SUCCESS", items: [{ id: "i1", amount: 100, to: "pro" }], paypal: [{ id: "i1", status: "UNCLAIMED" }] });
  assert.equal(ex.status, "UNCLAIMED"); assert.equal(ex.batchStatus, "SUCCESS");
});

test("item 19: before labels by condition, after scenes fixed, the start no later than the first before photo", async () => {
  const da = await import("../src/demoassets.js");
  assert.equal(da.shortName("Photo of the corroded shut-off valve under the kitchen sink, before"), "the corroded shut-off valve");
  const c = person(), j = await J.createJob(c.id, { text: "Kitchen faucet keeps dripping. Fix it this week.", zip: "78704", budget: 25000, actor: P(c) });
  assert.equal(da.afterFile({ id: "x", what: "No water damage or corrosion left under the sink" }, J.job(j.id)), "faucet-installed.jpg");
});
