// Red team round 3: inspections can't be skipped by "release" (only waived by the person), releasing over failed checks
// needs them named, a fix needs a reason, demo evidence fits the job type and is fresh each round, demo photo times sit
// inside [work started, now] with BEFORE first, seeded customers answer change orders, a pending change order blocks the
// submit before anything is stored and can be withdrawn, declined offers say why, before photos need no checkId,
// apply_scope_suggestion, and who released shows in the back office.
import test, { after } from "node:test";
import assert from "node:assert/strict";
import { J, person, P, PRO, photo, people, pros, tools, setAI, clock } from "./helpers.js";
process.env.DONE_NO_LISTEN = "1";
const { app } = await import("../src/server.js");
const demopro = await import("../src/demopro.js");
const srv = app.listen(0);
srv.keepAliveTimeout = 300e3;
after(() => srv.close());
const base = `http://127.0.0.1:${srv.address().port}`;
const agent = (c) => ({ person: c.id, client: "test agent", scopes: ["read", "hire", "pay"] });
async function hire(c, text, { budget = 25000, options = {}, start = true } = {}) {
  const j = await J.createJob(c.id, { text, zip: "78704", budget, options, actor: P(c) });
  await J.requestOffers(j.id, P(c), { now: true });
  const o = J.job(j.id).offers.filter((x) => x.status === "open").sort((a, b) => a.amount - b.amount)[0];
  await J.acceptOffer(j.id, o.id, { actor: P(c), payWith: "card", raiseCeiling: true });
  if (start) J.startWork(J.job(j.id).agreed.pro, j.id, PRO(J.job(j.id).agreed.pro), { before: [{ buf: photo(J.job(j.id)), mime: "image/jpeg" }] });
  return J.job(j.id);
}
const unsure = (fail = []) => setAI({ check: async (job) => ({ checks: job.scope.checks.map((x) => ({ id: x.id, verdict: fail.includes(x.id) ? "fail" : "pass", reason: fail.includes(x.id) ? "wrong photo" : "a person should look", confidence: 0.5, signals: [] })), decision: "review", source: "rules" }) });
const send = async (j, m, fail = []) => { const pid = j.agreed.pro; J.addEvidence(pid, j.id, J.job(j.id).scope.checks.filter((c) => m.checkIds.includes(c.id)).map((c) => c.evidence === "note" ? { kind: "note", checkId: c.id, text: "Done as described." } : { kind: c.evidence === "receipt" ? "receipt" : "photo", buf: photo(J.job(j.id)), mime: "image/jpeg", checkId: c.id, text: c.doc ? "CITY OF AUSTIN permit BP-1 inspection PASSED lien waiver" : "TOTAL 0.00" }), PRO(pid)); unsure(fail); try { return await J.submit(pid, j.id, PRO(pid), { milestone: m.id }); } finally { setAI({ check: null }); } };

test("an inspection milestone isn't paid by 'release' unless the person waives it; failed checks must be acknowledged", async () => {
  const ins = people.ensureDemoInspector(), c = person();
  const j = await hire(c, "Replace our 40 gallon water heater this month", { budget: 300000, options: { inspector: ins.id } });
  const m1 = j.milestones[0];
  await send(j, m1, [J.job(j.id).scope.checks.find((x) => m1.checkIds.includes(x.id) && !x.doc && x.evidence === "photo").id]);
  const r0 = await J.release(j.id, P(c));
  assert.equal(r0.error, "acknowledge", "a failed check has to be named");
  assert.ok(r0.failed.length >= 1);
  const ok = await J.release(j.id, P(c), { acknowledgeFailed: r0.failed.map((f) => f.id) });
  assert.equal(ok.milestones[0].status, "released");
  const m2 = J.job(j.id).milestones[1];
  assert.equal(m2.inspect, true);
  await send(J.job(j.id), m2);
  const r1 = await J.release(j.id, P(c));
  assert.equal(r1.error, "inspection");
  assert.equal((await J.release(j.id, { kind: "agent", person: c.id, client: "a" }, { waiveInspection: true })).error, "inspection", "an agent can't waive it");
  const r2 = await J.release(j.id, P(c), { waiveInspection: true });
  assert.equal(r2.status, "released");
  assert.ok(J.job(j.id).milestones[1].inspectionWaived);
  assert.ok(r2.timeline.some((t) => /inspection was waived/.test(t.note || "")));
  assert.equal(J.requestFix(j.id, "", P(c)).error, "state");
  const k = await hire(person(), "Kitchen faucet keeps dripping. Fix it this week.");
  await send(k, k.milestones[0]);
  assert.equal(J.requestFix(k.id, " ", P({ id: k.customer })).error, "reason", "a fix needs a reason");
});

test("demo evidence: water-heater scenes, fresh files each round, BEFORE first, after photos inside [work started, now]", async () => {
  const c = person();
  const j = await hire(c, "Replace our 40 gallon water heater this month", { budget: 300000, start: false });
  let steps = await demopro.finishNow(j.id);
  // the demo pro asks for the extra materials on a water heater (round 7): the customer answers, then the advance
  for (let i = 0; i < 3; i++) {
    const co = J.job(j.id).changeOrders.find((x) => x.status === "pending"); if (co) await J.approveChange(j.id, co.id, P(c));
    const ad = J.job(j.id).changeOrders.find((x) => x.advance?.status === "awaiting_customer"); if (ad) await J.approveMaterialsAdvance(j.id, ad.id, P(c));
    steps = [...steps, ...(await demopro.finishNow(j.id))];
  }
  const k = J.job(j.id), names = k.evidence.filter((e) => !e.forAdvance).map((e) => e.name);
  assert.ok(names.some((n) => /^wh-|permit-sticker/.test(n)), names.join(","));
  assert.ok(!names.some((n) => /faucet|valve-worn|sink-dry/.test(n)), names.join(","));
  const started = Date.parse(k.startedAt), before = k.evidence.filter((e) => e.phase === "before"), after_ = k.evidence.filter((e) => e.phase === "after" && e.kind === "photo");
  assert.ok(after_.every((e) => Date.parse(e.exif.taken) >= started - 1000), "after photos after work started");
  assert.ok(after_.every((e) => Date.parse(e.exif.taken) <= clock.now() + 1000), "none in the future");
  assert.ok(before.every((b) => after_.every((a) => Date.parse(b.exif.taken) <= Date.parse(a.exif.taken))), "BEFORE first");
  const shas = k.evidence.filter((e) => e.sha).map((e) => e.sha);
  assert.equal(new Set(shas).size, shas.length, "no file twice");
  assert.ok(steps.length >= 2);
});

test("seeded customers answer change orders; a pending one blocks the submit before anything is stored and can be withdrawn", async () => {
  const sc = people.makePerson({ name: "Demo · CO", zip: "78704", via: "seed" });
  const j = await hire(sc, "Kitchen faucet keeps dripping. Fix it this week.");
  const pid = j.agreed.pro;
  const co = await J.requestChange(pid, j.id, { amount: 4705, reason: "a new stop valve" }, PRO(pid));
  const before = J.job(j.id).evidence.length;
  const r = await tools.PRO.submit_evidence(pros.pro(pid), { job: j.id, items: [{ kind: "photo", dataUrl: `data:image/jpeg;base64,${photo(j).toString("base64")}`, checkId: "c1" }] });
  assert.equal(r.error, "pending");
  assert.match(r.message, /Nothing was stored.*withdraw_change/);
  assert.equal(J.job(j.id).evidence.length, before);
  const a = await demopro.customerAnswersChange(j.id);
  assert.equal(J.job(j.id).changeOrders[0].status, "approved", JSON.stringify(a?.message || ""));
  const co2 = await J.requestChange(pid, j.id, { amount: 99000, reason: "replace all the pipes" }, PRO(pid));
  await demopro.customerAnswersChange(j.id);
  assert.equal(J.job(j.id).changeOrders.find((x) => x.id === co2.change.id).status, "declined");
  assert.match(J.job(j.id).changeOrders.find((x) => x.id === co2.change.id).decided.note, /Declined by the customer's agent/);
  const co3 = await J.requestChange(pid, j.id, { amount: 1000, reason: "a washer" }, PRO(pid));
  assert.equal(J.withdrawChange(pid, j.id, co3.change.id, PRO(pid)).change.status, "withdrawn");
  // the same file twice in a round is stored once
  const buf = photo(J.job(j.id)), n0 = J.job(j.id).evidence.length;
  J.addEvidence(pid, j.id, [{ kind: "photo", buf, mime: "image/jpeg", checkId: "c1" }, { kind: "photo", buf, mime: "image/jpeg", checkId: "c1" }], PRO(pid));
  assert.equal(J.job(j.id).evidence.length, n0 + 1);
  assert.ok(co);
});

test("declined offers say why; before photos need no checkId; apply_scope_suggestion; the back office shows who released", async () => {
  const c = person();
  const j = await J.createJob(c.id, { text: "Kitchen faucet keeps dripping. Fix it this week.", zip: "78704", budget: 25000, options: { requireBefore: true }, actor: P(c) });
  await J.requestOffers(j.id, P(c), { now: true });
  setAI({ review: async (job) => ({ gaps: [{ severity: "medium", what: "no shut-off valve photo", suggestion: "add one" }], ok: true, source: "test-model", revisedScope: { ...job.scope, items: [...job.scope.items, "Check the shut-off valve"] } }) });
  try {
    const rv = await tools.CUSTOMER.review_scope(agent(c), { job: j.id });
    assert.match(rv.next, /apply_scope_suggestion/);
    const ap = await tools.CUSTOMER.apply_scope_suggestion(agent(c), { job: j.id });
    // round 5: the old offers are withdrawn and offers are asked for again at once (pros quote the new scope)
    assert.equal(ap.status, "offered");
    assert.match(ap.offersAgain, /asked for again/);
    assert.ok(ap.scope.items.some((x) => /shut-off/.test(x)));
    assert.ok(ap.offers.some((o) => o.status === "withdrawn"));
  } finally { setAI({ review: null }); }
  await J.requestOffers(j.id, P(c), { now: true });
  const os = J.job(j.id).offers.filter((x) => x.status === "open").sort((a, b) => a.amount - b.amount);
  await J.acceptOffer(j.id, os[0].id, { actor: P(c), payWith: "card", raiseCeiling: true });
  const v = J.view(J.job(j.id));
  assert.equal(v.offers.find((o) => o.id === os[1].id).declinedWhy, "The customer chose another offer.");
  const pid = J.job(j.id).agreed.pro;
  assert.equal(J.startWork(pid, j.id, PRO(pid)).error, "before");
  assert.equal(J.startWork(pid, j.id, PRO(pid), { before: [{ buf: photo(J.job(j.id)), mime: "image/jpeg" }] }).status, "working", "no checkId needed");
  assert.equal(J.view(J.job(j.id)).waitingOn.who, "pro");
  const st = (await (await fetch(`${base}/api/auth/staff`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" })).headers.get("set-cookie")).split(";")[0];
  await send(J.job(j.id), J.job(j.id).milestones[0]);
  await J.release(j.id, P(c));
  const rows = await (await fetch(`${base}/api/staff/jobs`, { headers: { cookie: st } })).json();
  const row = rows.find((r) => r.id === j.id);
  assert.equal(row.releasedBy, "the customer");
  assert.ok(row.checkedBy);
});
