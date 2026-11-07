// The reconciliation agent: the model chooses the PayPal tools step by step (the rules when it can't), code checks every
// finding against the ledger; a claim code can't confirm stays unconfirmed.
import test from "node:test";
import assert from "node:assert/strict";
import { J, person, P, PRO, photo, setAI } from "./helpers.js";
const recon = await import("../src/recon.js");

async function paidJob() {
  const c = person(), j = await J.createJob(c.id, { text: "Kitchen faucet keeps dripping. Fix it this week.", zip: "78704", budget: 25000, actor: P(c) });
  await J.requestOffers(j.id, P(c), { now: true });
  const o = J.job(j.id).offers.filter((x) => x.status === "open").sort((a, b) => a.amount - b.amount)[0];
  await J.acceptOffer(j.id, o.id, { actor: P(c), payWith: "card" });
  const pid = J.job(j.id).agreed.pro; J.startWork(pid, j.id, PRO(pid));
  setAI({ check: async (job) => ({ checks: job.scope.checks.map((x) => ({ id: x.id, verdict: "pass", reason: "ok", confidence: 0.95, signals: [] })), decision: "release", source: "rules" }) });
  try { J.addEvidence(pid, j.id, J.job(j.id).scope.checks.map((x) => ({ kind: x.evidence === "note" ? "note" : x.evidence === "receipt" ? "receipt" : "photo", ...(x.evidence === "note" ? { text: "done" } : { buf: photo(J.job(j.id)), mime: "image/jpeg", text: "TOTAL 0.00" }), checkId: x.id })), PRO(pid)); await J.submit(pid, j.id, PRO(pid)); } finally { setAI({ check: null }); }
  return J.job(j.id);
}

test("the model picks the tools; code checks its findings; an invented finding isn't confirmed", async () => {
  const j = await paidJob(), cap = j.money.ledger.find((l) => l.kind === "capture").ref, batch = j.money.payouts.find((p) => p.batchId).batchId;
  const plan = [{ tool: "list_transactions", args: {}, why: "see the captures" }, { tool: "get_payout_batch", args: { batch_id: batch }, why: "the payout" }, { done: true, findings: [{ ref: cap, claim: "matched" }, { ref: "FAKE-123", claim: "missing" }] }];
  let n = 0;
  setAI({ chat: async () => ({ text: JSON.stringify(plan[Math.min(n++, plan.length - 1)]), source: "model" }) });
  let r;
  try { r = await recon.agentRun({ by: "test", budget: 8 }); } finally { setAI({ chat: null }); }
  assert.deepEqual(r.steps.filter((s) => s.tool).map((s) => [s.tool, s.chosenBy]), [["list_transactions", "model"], ["get_payout_batch", "model"]]);
  assert.ok(r.steps.find((s) => s.tool === "list_transactions").toolkit, "a PayPal Agent Toolkit tool");
  assert.equal(r.claims.find((c) => c.ref === cap).confirmedByCode, true);
  const fake = r.claims.find((c) => c.ref === "FAKE-123");
  assert.equal(fake.confirmedByCode, false); assert.equal(fake.codeSays, "no such movement in the ledger");
  assert.ok(r.rows.some((x) => x.ref === cap && x.status === "matched"));
});

test("without a model the rules choose every step, labelled; the same rows", async () => {
  await paidJob();
  const r = await recon.agentRun({ by: "test", budget: 20, model: false });
  assert.ok(r.steps.filter((s) => s.tool).every((s) => s.chosenBy === "rules"));
  assert.equal(r.steps.filter((s) => s.tool)[0].tool, "list_transactions");
  assert.ok(r.rows.length > 0 && r.rows.every((x) => x.status !== "missing_in_paypal"), JSON.stringify(r.counts));
  assert.match(r.summary.text, /chosen by the model, the rest by the rules/);
});
