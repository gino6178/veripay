// Done-Risk wired in: dispute and overrun probabilities from the exported LightGBM trees, shown on the job and in the
// back office, sizing the hold's buffer (more with a likely overrun, never past the ceiling); the rules stand in when
// the files are missing. Demo pros offer to come within minutes.
import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { J, person, P, pros } from "./helpers.js";
import { riskOf, riskStatus, riskBufferPct, inputsOf } from "../src/risk.js";
import { quoteFor } from "../src/pros.js";

test("Done-Risk scores a job, sizes the buffer within the ceiling, and is shown on the job", async () => {
  const st = await riskStatus();
  assert.equal(st.live, true, st.why);
  assert.equal(st.source, "model: done-risk");
  const c = person(), j = await J.createJob(c.id, { text: "Kitchen faucet keeps dripping. Fix it this week.", zip: "78704", budget: 40000, actor: P(c) });
  await J.requestOffers(j.id, P(c), { now: true });
  const o = J.job(j.id).offers.filter((x) => x.status === "open").sort((a, b) => a.amount - b.amount)[0];
  const v = await J.acceptOffer(j.id, o.id, { actor: P(c), payWith: "card" });
  assert.equal(v.risk.source, "model: done-risk");
  for (const k of ["dispute", "overrun"]) assert.ok(v.risk[k].p > 0 && v.risk[k].p < 1);
  const pct = riskBufferPct(v.risk.overrun.p, 20);
  assert.ok(pct >= 20 && pct <= 40);
  assert.equal(v.hold.amount.cents, o.amount + Math.min(Math.round(o.amount * pct / 100), 40000 - o.amount));
  assert.match(v.hold.bufferWhy, /%/);
  const x = inputsOf(J.job(j.id), { price: o.amount });
  assert.equal(x.price, o.amount / 100, "dollars, as the model was trained");
  assert.equal(x.firstTimeHirer, true);
  // a riskier job (gaps, past disputes) never scores lower
  const r1 = await riskOf({ ...J.job(j.id), scopeReview: { gaps: [] } }), r2 = await riskOf({ ...J.job(j.id), scopeReview: { gaps: [1, 2, 3, 4] } });
  assert.ok(r2.dispute.p >= r1.dispute.p);
});

test("without the Done-Risk files the rules stand in, labelled", async () => {
  const code = `process.env.DONE_RISK_DIR = "/nowhere"; const r = await import(${JSON.stringify(new URL("../src/risk.js", import.meta.url).href)}); const x = await r.riskOf({ scope: { trade: "plumbing", checks: [1, 2], priceCeiling: 20000 }, agreed: { price: 18000 } }); console.log(JSON.stringify({ s: x.source, d: x.dispute.p, o: x.overrun.p }));`;
  const { stdout } = await promisify(execFile)(process.execPath, ["--input-type=module", "-e", code], { env: { ...process.env, NODE_TEST_CONTEXT: "" } });
  const r = JSON.parse(stdout.trim().split("\n").at(-1));
  assert.equal(r.s, "rules");
  assert.ok(r.d > 0 && r.d < 1 && r.o > 0 && r.o < 1);
});

test("in the demo a demo pro offers to come within minutes", () => {
  const p = pros.pro("barton-creek-plumbing"), now = Date.now();
  const q = quoteFor(p, { address: { lat: 30.243, lng: -97.765 }, scope: { estimate: { hours: 1, parts: 3500 }, window: { from: new Date(now).toISOString(), to: new Date(now + 5 * 864e5).toISOString() } } });
  const mins = (Date.parse(q.arrival) - Date.now()) / 60e3;
  assert.ok(mins >= 4 && mins <= 11, `${mins} minutes`);
});
