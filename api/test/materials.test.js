// Materials advance (PLAN §13): an approved materials change order, the supplier's invoice and a photo on site, a
// partial capture and a Payouts item now; at release the advance is counted; returned materials come off; every
// ledger balances; the agent approves only within materialsAdvanceMax; a supplier is paid only on the person's say.
import test from "node:test";
import assert from "node:assert/strict";
import { J, person, P, PRO, photo, pp, people, tools, setAI } from "./helpers.js";

async function hired(c) {
  const j = await J.createJob(c.id, { text: "Replace our 50 gallon water heater this month", zip: "78704", budget: 300000, actor: P(c) });
  await J.requestOffers(j.id, P(c), { now: true });
  const o = J.job(j.id).offers.filter((x) => x.status === "open").sort((a, b) => a.amount - b.amount)[0];
  await J.acceptOffer(j.id, o.id, { actor: P(c), payWith: "card", raiseCeiling: true });
  J.startWork(J.job(j.id).agreed.pro, j.id, PRO(J.job(j.id).agreed.pro));
  return J.job(j.id);
}
const invoice = (j) => [{ kind: "receipt", buf: photo(j), mime: "image/jpeg", text: "HILL COUNTRY PLUMBING SUPPLY\n2 GAL EXPANSION TANK 54.00\nPRESSURE REDUCING VALVE 26.40\nTAX 6.63\nTOTAL 87.03" }, { kind: "photo", buf: photo(j), mime: "image/jpeg" }];
const pass = (amount, needsPerson = false) => setAI({ materials: async () => ({ verdict: "pass", decision: needsPerson ? "review" : "advance", needsPerson, reasons: ["ok"], invoice: { store: "HILL COUNTRY PLUMBING SUPPLY", total: amount, date: "11/05/2026", readBy: "test" }, approved: amount, matchedTotal: amount, source: "test" }) });
async function materialsCO(j, amount = 8703) {
  const pid = j.agreed.pro;
  const co = await J.requestChange(pid, j.id, { amount, reason: "a second expansion tank and a pressure-reducing valve", kind: "materials" }, PRO(pid));
  assert.ok(!co.error, co.message);
  const ok = await J.approveChange(j.id, co.change.id, P({ id: j.customer }));
  assert.ok(!ok.error, ok.message);
  return co.change;
}
async function deliverAll(j) {
  const pid = j.agreed.pro;
  setAI({ check: async (job) => ({ checks: job.scope.checks.map((x) => ({ id: x.id, verdict: "pass", reason: "ok", confidence: 0.95, signals: [] })), decision: "release", source: "rules" }) });
  try {
    for (const m0 of J.job(j.id).milestones) {
      const m = () => J.job(j.id).milestones.find((x) => x.id === m0.id);
      if (["released", "passed"].includes(m().status)) continue;
      const items = J.job(j.id).scope.checks.filter((c) => m0.checkIds.includes(c.id)).map((x) => ({ kind: x.evidence === "note" ? "note" : x.evidence === "receipt" ? "receipt" : "photo", ...(x.evidence === "note" ? { text: "done" } : { buf: photo(J.job(j.id)), mime: "image/jpeg", text: x.doc ? "CITY OF AUSTIN PLUMBING PERMIT No. BP-2026-123456 Issued 11/05/2026 inspection PASSED" : "TOTAL 0.00" }), checkId: x.id }));
      J.addEvidence(pid, j.id, items, PRO(pid));
      await J.submit(pid, j.id, PRO(pid), { milestone: m0.id });
      if (m().status === "review") await J.release(j.id, P({ id: j.customer }), { milestone: m0.id, acknowledgeFailed: J.notPassed(J.job(j.id), m()).map((x) => x.id) });
    }
  } finally { setAI({ check: null }); }
}

test("a materials advance is captured and paid at once; at release it's counted; the ledger balances to the cent", async () => {
  const c = person(), j = await hired(c), pid = j.agreed.pro;
  const co = await materialsCO(j);
  pass(8703);
  try {
    const r = await J.requestMaterialsAdvance(pid, j.id, { change: co.id, items: invoice(J.job(j.id)) }, PRO(pid));
    assert.ok(!r.error, r.message);
    assert.equal(r.change.advance.status, "paid");
    assert.ok(r.change.advance.payout?.batchId, "a Payouts batch now");
  } finally { setAI({ materials: null }); }
  const k = J.job(j.id), b0 = J.balance(k);
  assert.equal(b0.captured, 8703); assert.equal(b0.materials, 8703); assert.ok(b0.ok, "balanced right after the advance");
  assert.equal(pp()._db.data.auths[k.hold.authorization].captured, 8703, "a partial capture on the authorization");
  await deliverAll(J.job(j.id));
  const f = J.job(j.id), b = J.balance(f);
  assert.equal(f.status, "released");
  const adj = f.money.ledger.filter((l) => l.kind === "parts_adjusted").reduce((t, l) => t + l.amount, 0);
  assert.equal(b.captured, J.due(f) - adj, "the whole due captured (parts at the receipt), the advance included");
  assert.ok(b.ok, "balanced at the end");
});

test("materials returned unused come off the final payment", async () => {
  const c = person(), j = await hired(c), pid = j.agreed.pro;
  const co = await materialsCO(j);
  pass(8703);
  try { await J.requestMaterialsAdvance(pid, j.id, { change: co.id, items: invoice(J.job(j.id)) }, PRO(pid)); } finally { setAI({ materials: null }); }
  const before = J.due(J.job(j.id));
  const r = J.returnMaterials(pid, j.id, { change: co.id, amount: 2640, note: "the pressure-reducing valve went back" }, PRO(pid));
  assert.ok(!r.error, r.message);
  await deliverAll(J.job(j.id));
  const f = J.job(j.id), b = J.balance(f);
  const adj = f.money.ledger.filter((l) => l.kind === "parts_adjusted").reduce((t, l) => t + l.amount, 0);
  assert.equal(b.captured, before - 2640 - adj);
  assert.ok(b.ok);
  assert.ok(f.money.ledger.some((l) => l.kind === "materials_returned" && l.amount === 2640));
});

test("over the materials-advance limit or to a supplier: the agent can't approve; the person can", async () => {
  const c = person();
  people.updatePerson(c.id, { limits: { materialsAdvanceMax: 5000 } });
  const a = { person: c.id, client: "t", scopes: ["read", "hire", "pay"] };
  const j = await hired(c), pid = j.agreed.pro, co = await materialsCO(j);
  pass(8703);
  try { const r = await J.requestMaterialsAdvance(pid, j.id, { change: co.id, items: invoice(J.job(j.id)) }, PRO(pid)); assert.equal(r.change.advance.status, "awaiting_customer"); } finally { setAI({ materials: null }); }
  const ag = await tools.CUSTOMER.approve_materials_advance(a, { job: j.id, change: co.id });
  assert.equal(ag.error, "limit"); assert.equal(ag.limit, "materialsAdvanceMax"); assert.ok(ag.askPerson?.url);
  const ok = await J.approveMaterialsAdvance(j.id, co.id, P(c));
  assert.equal(ok.change.advance.status, "paid");
  const j2 = await hired(c), co2 = await materialsCO(j2, 4000);
  pass(4000);
  try { await J.requestMaterialsAdvance(j2.agreed.pro, j2.id, { change: co2.id, items: invoice(J.job(j2.id)), supplierEmail: "supplier@example.com" }, PRO(j2.agreed.pro)); } finally { setAI({ materials: null }); }
  assert.equal((await tools.CUSTOMER.approve_materials_advance(a, { job: j2.id, change: co2.id })).error, "limit");
  const sp = await J.approveMaterialsAdvance(j2.id, co2.id, P(c));
  assert.equal(sp.change.advance.status, "paid");
  assert.ok(J.job(j2.id).money.ledger.some((l) => l.kind === "materials_payout" && l.to === "supplier"));
  assert.ok(J.balance(J.job(j2.id)).ok);
});

test("an advance is refused for a non-materials or unapproved change order, and when the check fails", async () => {
  const c = person(), j = await hired(c), pid = j.agreed.pro;
  const co = await J.requestChange(pid, j.id, { amount: 3000, reason: "extra fittings", kind: "parts" }, PRO(pid));
  assert.equal((await J.requestMaterialsAdvance(pid, j.id, { change: co.change.id, items: invoice(J.job(j.id)) }, PRO(pid))).error, "kind");
  J.declineChange(j.id, co.change.id, P(c), "no");
  const m = await J.requestChange(pid, j.id, { amount: 3000, reason: "an expansion tank", kind: "materials" }, PRO(pid));
  assert.equal((await J.requestMaterialsAdvance(pid, j.id, { change: m.change.id, items: invoice(J.job(j.id)) }, PRO(pid))).error, "state");
  await J.approveChange(j.id, m.change.id, P(c));
  setAI({ materials: async () => ({ verdict: "fail", decision: "needs_fix", needsPerson: false, reasons: ["this invoice was already used on another job"], matchedTotal: 0, source: "test" }) });
  try { const r = await J.requestMaterialsAdvance(pid, j.id, { change: m.change.id, items: invoice(J.job(j.id)) }, PRO(pid)); assert.equal(r.change.advance.status, "rejected"); } finally { setAI({ materials: null }); }
  assert.equal(J.balance(J.job(j.id)).captured, 0);
});

test("the demo pro on a water heater asks for the extra materials and the advance; a seeded customer answers both", async () => {
  const demopro = await import("../src/demopro.js");
  const sc = people.makePerson({ name: "Demo · Materials", zip: "78704", via: "seed" });
  people.updatePerson(sc.id, { limits: { changeMax: 15000, perJobMax: 400000, monthlyMax: 1500000 } }); // as the seed sets them
  const j = await J.createJob(sc.id, { text: "Replace our 50 gallon water heater this month", zip: "78704", budget: 300000, actor: P(sc) });
  await J.requestOffers(j.id, P(sc), { now: true });
  const o = J.job(j.id).offers.filter((x) => x.status === "open" && x.agent === "demo").sort((a, b) => a.amount - b.amount)[0];
  await J.acceptOffer(j.id, o.id, { actor: P(sc), payWith: "card", raiseCeiling: true });
  J.job(j.id).scope.window.from = new Date(Date.now() - 3600e3).toISOString(); J.job(j.id).agreed.arrival = null;
  await demopro.step(j.id, { advance: "test" });            // starts
  const s2 = await demopro.step(j.id, { advance: "test" });  // the materials change order
  assert.match(s2.did, /materials change order/);
  await demopro.customerAnswersChange(j.id);
  assert.equal(J.job(j.id).changeOrders.find((c) => c.kind === "materials").status, "approved", JSON.stringify(J.job(j.id).changeOrders.find((c) => c.kind === "materials").decided));
  pass(8703, true); // the checker (OCR and the photo model) is the AI agent’s: here it passes and asks for a person
  let s3; try { s3 = await demopro.step(j.id, { advance: "test" }); } finally { setAI({ materials: null }); }
  assert.match(s3.did, /materials advance/);
  const co = J.job(j.id).changeOrders.find((c) => c.kind === "materials");
  if (co.advance.status === "awaiting_customer") await demopro.customerAnswersAdvance(j.id);
  assert.equal(J.job(j.id).changeOrders.find((c) => c.kind === "materials").advance.status, "paid", JSON.stringify(co.advance.check));
  assert.ok(J.balance(J.job(j.id)).ok);
});
