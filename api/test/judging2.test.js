// Judging round 2 fixes: the tour's mandates (one accepted, a replay and an overspend refused) and its AI summary with an
// automatic release; tour jobs reuse their own photo library across tour jobs (a signal, not a failure) while real jobs
// keep full reuse detection; the home page's example job is one the models judged, never "content not judged"; a
// change order's reason never leaves a cut phrase in a condition.
import test, { after } from "node:test";
import assert from "node:assert/strict";
import { J, person, P, PRO, held, photo, setAI } from "./helpers.js";
process.env.DONE_NO_LISTEN = "1";
const { app } = await import("../src/server.js");
const { shortReason, addPartsCondition } = await import("../src/scope.js");
const srv = app.listen(0);
after(() => srv.close());
const base = `http://127.0.0.1:${srv.address().port}`;
const call = async (method, p, body) => { const r = await fetch(base + p, { method, headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined }); return { s: r.status, j: await r.json() }; };

test("the tour: mandates required; one accepted (labelled), the replay and the overspend refused; the AI summary; released by itself", async () => {
  const r = await call("POST", "/api/demo/tour", { step: "all" });
  assert.equal(r.s, 200, JSON.stringify(r.j).slice(0, 300));
  const m = r.j.tour.mandates;
  assert.deepEqual(m.map((x) => [x.outcome, x.reason ?? null]), [["accepted", null], ["refused", "replay"], ["refused", "amount"]]);
  assert.ok(m.every((x) => x.label === "signed by a key the server holds for you"));
  assert.ok(m[0].receipt, "the accepted mandate is in a signed receipt");
  assert.equal(r.j.changeOrders[0].status, "approved");
  assert.ok(r.j.tour.ai && r.j.tour.ai.conditions.length);
  if (r.j.status === "released") { assert.equal(r.j.tour.ai.autoReleased, true); assert.match(r.j.tour.ai.says, /released the money by itself/); }
  assert.equal(r.j.options.releaseMode, "instant");
  assert.equal(r.j.money.balanced, true);
});

test("tour jobs share their photo library (a signal, not a failure); a real job reusing the same photo still fails", async () => {
  const bytes = photo({ address: { lat: 30.243, lng: -97.765 }, id: "x" }, { salt: 0.4242 });
  const mk = async (tour) => { const c = person(), j = await held(c); if (tour) { J.job(j.id).tour = true; J.jobsStore.save(); } J.startWork(j.agreed.pro, j.id, PRO(j.agreed.pro)); return J.job(j.id); };
  const items = (j) => [{ kind: "photo", buf: bytes, mime: "image/jpeg", checkId: "c1" }];
  const t1 = await mk(true);
  J.addEvidence(t1.agreed.pro, t1.id, items(t1), PRO(t1.agreed.pro)); await J.submit(t1.agreed.pro, t1.id, PRO(t1.agreed.pro));
  const t2 = await mk(true);
  J.addEvidence(t2.agreed.pro, t2.id, items(t2), PRO(t2.agreed.pro)); await J.submit(t2.agreed.pro, t2.id, PRO(t2.agreed.pro));
  const c1 = J.job(t2.id).checks.at(-1).checks.find((c) => c.id === "c1");
  assert.ok(c1.signals.includes(J.TOUR_LIBRARY_SIGNAL), JSON.stringify(c1));
  assert.ok(!c1.signals.some((s) => /reused/.test(s)), "not a reuse between tour jobs");
  const real = await mk(false);
  J.addEvidence(real.agreed.pro, real.id, items(real), PRO(real.agreed.pro)); await J.submit(real.agreed.pro, real.id, PRO(real.agreed.pro));
  const rc = J.job(real.id).checks.at(-1).checks.find((c) => c.id === "c1");
  assert.notEqual(rc.verdict, "pass"); assert.ok(rc.signals.some((s) => /reused/.test(s)), JSON.stringify(rc.signals));
});

test("the example job: the paid demo job the models judged with the fewest conditions left to a person, and it says so", async () => {
  // a checker that answers as the model would (by: "done-audit"), so a tour job is model-judged
  setAI({ check: async (job) => ({ checks: job.scope.checks.map((x) => ({ id: x.id, verdict: "pass", reason: "the photo shows the new cartridge", confidence: 0.93, signals: [], by: "done-audit", label: "APPROVED" })), decision: "release", source: "model" }) });
  try { const r = await call("POST", "/api/demo/tour", { step: "all" }); assert.equal(r.j.status, "released"); } finally { setAI({ check: null }); }
  const ex = await call("GET", "/api/example-job");
  assert.equal(ex.s, 200, JSON.stringify(ex.j).slice(0, 200));
  assert.ok(ex.j.exampleWhy.modelJudged > 0); assert.equal(ex.j.exampleWhy.allNotJudged, false); assert.match(ex.j.exampleWhy.says, /models decided/);
  const text = JSON.stringify(ex.j);
  assert.ok(!/p_[0-9a-f]{10}/.test(text), "no person ids"); assert.ok(!/Demo · /.test(text), "no customer name"); assert.equal(ex.j.address.line, undefined);
});

test("a change order's reason in a condition: its first clause, or cut at a word with an ellipsis; never 'with the )'", () => {
  const tour = "the shut-off valve under the sink is corroded and weeps; replacing it, with the new cartridge (parts at cost: $47.05 on the receipt)";
  assert.equal(shortReason(tour), "the shut-off valve under the sink is corroded and weeps");
  const long = shortReason("replacing the corroded supply lines and both angle stops under the kitchen and bathroom sinks with the new braided lines");
  assert.ok(long.endsWith("…") && long.length <= 81 && !/\s(the|with|and)…$/.test(long), long);
  const s = addPartsCondition({ checks: [{ id: "c1", what: "x", evidence: "photo" }], notes: [] }, { reason: tour });
  const w = s.checks.at(-1).what;
  assert.ok(!/with the \)/.test(w) && !/\(\s*\)/.test(w), w);
  assert.match(w, /^Receipt for the parts and materials \(the shut-off valve under the sink is corroded and weeps\), dated during the job$/);
});
