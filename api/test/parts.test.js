// The checker's parts result (docs/MODELS.md): parts change orders paid at the matched receipt total; padding sends the
// receipt condition back. Evidence may name several conditions (checkIds).
import test from "node:test";
import assert from "node:assert/strict";
import { J, person, P, PRO, photo, setAI } from "./helpers.js";

async function hiredWithChange(amount) {
  const c = person(), j = await J.createJob(c.id, { text: "Kitchen faucet keeps dripping. Fix it this week.", zip: "78704", budget: 30000, actor: P(c) });
  await J.requestOffers(j.id, P(c), { now: true });
  const o = J.job(j.id).offers.filter((x) => x.status === "open").sort((a, b) => a.amount - b.amount)[0];
  await J.acceptOffer(j.id, o.id, { actor: P(c), payWith: "card" });
  const pid = J.job(j.id).agreed.pro;
  J.startWork(pid, j.id, PRO(pid));
  const co = await J.requestChange(pid, j.id, { amount, reason: "a new shut-off valve" }, PRO(pid));
  await J.approveChange(j.id, co.change.id, P(c));
  return J.job(j.id);
}
const items = (j) => [{ kind: "photo", buf: photo(j), mime: "image/jpeg", checkIds: ["c1"] }, { kind: "photo", buf: photo(j), mime: "image/jpeg", checkId: "c2" }, { kind: "receipt", buf: photo(j), mime: "image/jpeg", checkIds: "c3", text: "TOTAL 41.00" }];
const allPass = (parts) => async (job) => ({ checks: job.scope.checks.map((x) => ({ id: x.id, verdict: "pass", reason: "ok", confidence: 0.9, signals: [] })), decision: "release", source: "rules", parts });

test("the checker's matched parts total sets what's captured; padding sends the receipt back; checkIds accepted", async () => {
  const j = await hiredWithChange(5000), pid = j.agreed.pro;
  setAI({ check: allPass({ checkId: "c3", receiptsTotal: 4100, approvedChangeOrders: 5000, matchedTotal: 4100, difference: 900, padding: false }) });
  try {
    J.addEvidence(pid, j.id, items(j), PRO(pid));
    const due = J.due(J.job(j.id)), r = await J.submit(pid, j.id, PRO(pid));
    assert.equal(r.status, "released", JSON.stringify(r.lastCheck));
    assert.equal(r.money.captured.cents, due - 900);
    assert.equal(r.milestones[0].release.partsAdjusted.source, "checker");
    assert.ok(r.money.balanced);
    assert.deepEqual(r.evidence[0].checkIds, ["c1"]);
    assert.deepEqual(r.evidence[2].checkIds, ["c3"]);
  } finally { setAI({ check: null }); }
  const k = await hiredWithChange(5000), kp = k.agreed.pro;
  setAI({ check: allPass({ checkId: "c3", receiptsTotal: 1000, approvedChangeOrders: 5000, matchedTotal: 1000, difference: 4000, padding: true }) });
  try {
    J.addEvidence(kp, k.id, items(k), PRO(kp));
    const r = await J.submit(kp, k.id, PRO(kp));
    assert.equal(r.status, "needs_fix");
    assert.ok(r.lastCheck.checks.find((c) => c.id === "c3").signals.includes("parts_padding"));
  } finally { setAI({ check: null }); }
});
