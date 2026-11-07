// Milestones on one PayPal authorization (partial captures, the last one final), required documents, before photos,
// the inspector, retainage with a warranty window and defect claims, a review window with early pay, disputes scoped
// to one milestone, the expert queue's SLA, signed verdict hashes, ratings and profiles from paid jobs, verified pros,
// and the scope review when both sides agree.
import test from "node:test";
import assert from "node:assert/strict";
import { J, person, P, PRO, photo, pp, clock, people, pros, cents, receipts, setAI } from "./helpers.js";
import { licenceLookup, insuranceCheck } from "../src/registry.js";

const DOC_TEXT = { permit: "CITY OF AUSTIN plumbing permit BP-2026-004512", inspection: "Inspection PASSED, green tag", lien_waiver: "Conditional lien waiver and release" };
// evidence for one milestone's conditions
function evidenceFor(j, m) {
  return J.job(j.id).scope.checks.filter((c) => m.checkIds.includes(c.id)).map((c) => c.doc ? { kind: "receipt", buf: photo(J.job(j.id)), mime: "image/jpeg", checkId: c.id, text: DOC_TEXT[c.doc] }
    : c.evidence === "receipt" ? { kind: "receipt", buf: photo(J.job(j.id)), mime: "image/jpeg", checkId: c.id, text: `TOTAL ${((J.job(j.id).agreed.parts || 0) / 100).toFixed(2)}` }
    : c.evidence === "note" ? { kind: "note", checkId: c.id, text: "Done as described, tested." } : { kind: "photo", buf: photo(J.job(j.id)), mime: "image/jpeg", checkId: c.id, label: "wide shot" });
}
async function hire(c, { text, budget, options }) {
  const j = await J.createJob(c.id, { text, zip: "78704", budget, options, actor: P(c) });
  await J.requestOffers(j.id, P(c));
  const o = J.job(j.id).offers.filter((x) => x.status === "open").sort((a, b) => a.amount - b.amount)[0];
  assert.ok(o, "an offer");
  const r = await J.acceptOffer(j.id, o.id, { actor: P(c), payWith: "card", raiseCeiling: true });
  assert.equal(r.status, "held", r.message);
  return J.job(j.id);
}
const deliverMs = async (j, m) => { const pid = j.agreed.pro; const a = J.addEvidence(pid, j.id, evidenceFor(j, m), PRO(pid)); assert.ok(!a.error, a.message); return J.submit(pid, j.id, PRO(pid), { milestone: m.id }); };
const inspector = people.makePerson({ name: "Capitol Home Inspections (demo)", role: "inspector" });

test("water heater in two milestones: partial capture, before photos, permit, inspector, retainage, warranty", async () => {
  const c = person();
  const j = await hire(c, { text: "Replace our 40 gallon water heater this month, $2500 max", budget: 250000, options: { inspector: inspector.id, retainPct: 10, warrantyDays: 14, requireBefore: true } });
  assert.equal(j.milestones.length, 2);
  assert.equal(j.milestones.reduce((t, m) => t + m.amount, 0), j.agreed.price, "milestone amounts add up to the price");
  assert.ok(j.scope.checks.some((x) => x.doc === "permit"));
  assert.ok(j.scope.checks.find((x) => x.evidence === "photo").shots.min >= 1, "a photo checklist is stored");
  const pid = j.agreed.pro;
  // before photos are required: start is refused, then accepted with them
  assert.equal(J.startWork(pid, j.id, PRO(pid)).error, "before");
  const spots = j.scope.checks.filter((x) => x.evidence === "photo" && !x.doc);
  assert.equal(J.startWork(pid, j.id, PRO(pid), { before: spots.map((x) => ({ buf: photo(j), mime: "image/jpeg", checkId: x.id, label: "before" })) }).status, "working");
  // milestone 1: a partial capture (final_capture=false), one Payouts batch, the job keeps working
  const m1 = j.milestones[0], v1 = await deliverMs(j, m1);
  assert.equal(v1.status, "working", JSON.stringify(v1.milestones[0].lastCheck?.checks));
  assert.equal(v1.milestones[0].status, "released");
  assert.equal(v1.lastCheck.before > 0, true, "before photos went to the check");
  const auth = pp()._db.data.auths[J.job(j.id).hold.authorization];
  assert.equal(auth.status, "PARTIALLY_CAPTURED");
  assert.equal(auth.captured, m1.amount);
  assert.ok(v1.milestones[0].payout.batchId);
  assert.equal(v1.money.releases[0].fee.cents, Math.round(m1.amount * 0.1), "the fee is shown at every release");
  assert.match(v1.money.releases[0].says, /platform fee \(10%\)/);
  // milestone 2 passes its checks but waits for the inspector
  const m2 = J.job(j.id).milestones[1], v2 = await deliverMs(J.job(j.id), m2);
  assert.equal(v2.status, "passed");
  assert.equal(v2.milestones[1].passed.waiting, "inspector");
  assert.equal((await J.inspect(person().id, j.id, { milestone: m2.id, verdict: "pass" })).error, "not_found", "only the named inspector");
  const v3 = await J.inspect(inspector.id, j.id, { milestone: m2.id, verdict: "pass", note: "T&P discharge to code" });
  assert.equal(v3.status, "released");
  assert.equal(pp()._db.data.auths[J.job(j.id).hold.authorization].status, "CAPTURED", "the last capture is final");
  // retainage: 10% of the pro's share held for the warranty window, then paid
  const b = cents(j);
  assert.ok(b.ok, JSON.stringify(b));
  assert.ok(b.retainOpen > 0);
  assert.equal(v3.warranty.status, "open");
  clock.advance(15, "test");
  await J.tick();
  const done = J.job(j.id);
  assert.equal(done.warranty.status, "released");
  assert.equal(J.balance(done).retainOpen, 0);
  assert.ok(J.balance(done).ok);
  assert.ok(done.money.ledger.some((l) => l.kind === "retainage_paid"));
});

test("a review window with early pay: the pro is paid now for a fee, the capture comes when the window ends", async () => {
  const c = person();
  const j = await hire(c, { text: "Kitchen faucet keeps dripping. Fix it this week.", budget: 25000, options: { releaseMode: "review", reviewHours: 24 } });
  J.startWork(j.agreed.pro, j.id, PRO(j.agreed.pro));
  const v = await deliverMs(j, j.milestones[0]);
  assert.equal(v.status, "passed");
  assert.match(v.next, /paid automatically/);
  assert.equal(J.job(j.id).money.captured, null, "nothing captured during the window");
  const e = await J.earlyPay(j.agreed.pro, j.id, {}, PRO(j.agreed.pro));
  assert.ok(e.milestones[0].earlyPay.batchId);
  assert.ok(e.milestones[0].earlyPay.fee.cents >= 100);
  clock.advance(1.1, "test");
  const t = await J.tick();
  assert.ok(t.some((x) => /review window/.test(x.event || "")));
  const r = J.job(j.id);
  assert.equal(r.status, "released");
  const b = J.balance(r);
  assert.ok(b.ok, JSON.stringify(b));
  assert.equal(b.earlyFee, e.milestones[0].earlyPay.fee.cents);
  assert.equal(r.milestones[0].payout.status, "nothing_to_send", "the pro was already paid");
});

test("a dispute scoped to one milestone: refunded from that milestone's capture only; the job goes on", async () => {
  const c = person();
  const j = await hire(c, { text: "Remodel the bathroom: new tile, vanity and shower, this month", budget: 900000, options: {} });
  assert.equal(j.milestones.length, 3);
  J.startWork(j.agreed.pro, j.id, PRO(j.agreed.pro));
  assert.equal((await deliverMs(j, j.milestones[0])).milestones[0].status, "released");
  const m2 = J.job(j.id).milestones[1];
  J.addEvidence(j.agreed.pro, j.id, evidenceFor(j, m2), PRO(j.agreed.pro));
  await J.openDispute(j.id, "The membrane doesn't cover the corners.", P(c), { milestone: m2.id });
  assert.equal(J.job(j.id).status, "disputed");
  const d2 = J.msDue(J.job(j.id), m2), R = Math.round(d2 * 0.5);
  const r = await J.resolve(j.id, { outcome: "partial", release: R });
  assert.equal(r.status, "working", "two milestones left open after the settled one? no: one left");
  assert.equal(r.milestones[1].status, "resolved");
  const cap = pp()._db.data.captures[J.job(j.id).milestones[1].captures[0]];
  assert.equal(cap.refunded, d2 - R, "the refund comes from milestone 2's own capture");
  assert.equal(pp()._db.data.captures[J.job(j.id).milestones[0].captures[0]].refunded, 0, "milestone 1 untouched");
  const v3 = await deliverMs(J.job(j.id), J.job(j.id).milestones[2]);
  assert.equal(v3.status, "released");
  assert.ok(cents(j).ok, JSON.stringify(cents(j)));
});

test("a defect in the warranty window: claimed with photos, fixed and checked, then the retainage is paid", async () => {
  const c = person();
  const j = await hire(c, { text: "Kitchen faucet keeps dripping. Fix it this week.", budget: 25000, options: { retainPct: 10, warrantyDays: 14 } });
  J.startWork(j.agreed.pro, j.id, PRO(j.agreed.pro));
  await deliverMs(j, j.milestones[0]);
  const held = J.balance(J.job(j.id)).retainOpen;
  assert.ok(held > 0);
  const cl = await J.claimDefect(j.id, { reason: "It drips again at night", items: [{ kind: "photo", buf: photo(j), mime: "image/jpeg" }] }, P(c));
  assert.equal(cl.warranty.status, "claimed");
  clock.advance(15, "test");
  await J.tick();
  assert.equal(J.job(j.id).warranty.status, "claimed", "a claim keeps the retainage past the window");
  const f = await J.fixDefect(j.agreed.pro, j.id, [{ kind: "photo", buf: photo(j), mime: "image/jpeg" }], PRO(j.agreed.pro));
  assert.equal(f.warranty.status, "released", JSON.stringify(f.lastCheck));
  assert.equal(f.status, "released");
  assert.ok(J.balance(J.job(j.id)).ok);
  // another job: staff refund the retainage to the customer instead
  const k = await hire(person(), { text: "Kitchen faucet keeps dripping. Fix it this week.", budget: 25000, options: { retainPct: 10 } });
  J.startWork(k.agreed.pro, k.id, PRO(k.agreed.pro));
  await deliverMs(k, k.milestones[0]);
  await J.claimDefect(k.id, { reason: "The handle came off the next day" }, P({ id: k.customer }));
  const s = await J.resolveDefect(k.id, { outcome: "refund" });
  assert.equal(s.warranty.status, "refunded");
  const bk = J.balance(J.job(k.id));
  assert.ok(bk.ok, JSON.stringify(bk));
  assert.equal(bk.retainOpen, 0);
});

test("past the honor period with a milestone captured: a new hold for what's left, not a reauthorize", async () => {
  const c = person();
  const j = await hire(c, { text: "Replace our 40 gallon water heater this month, $2500 max", budget: 250000, options: {} });
  J.startWork(j.agreed.pro, j.id, PRO(j.agreed.pro));
  await deliverMs(j, j.milestones[0]);
  const first = J.job(j.id).hold.authorization;
  clock.advance(3.3, "test");
  const t = await J.tick();
  assert.ok(t.some((x) => x.job === j.number && x.event === "re-held"), JSON.stringify(t));
  const h = J.job(j.id).hold;
  assert.notEqual(h.authorization, first);
  assert.equal(pp()._db.data.auths[first].status, "VOIDED", "the rest of the partly captured hold is voided");
  assert.ok(h.amount >= J.remainingDue(J.job(j.id)));
  assert.equal((await deliverMs(J.job(j.id), J.job(j.id).milestones[1])).status, "released");
  assert.ok(cents(j).ok);
});

test("review goes to the expert queue with a 4-business-hour SLA; the expert can release; verdicts are signed", async () => {
  const c = person();
  const j = await hire(c, { text: "Kitchen faucet keeps dripping. Fix it this week.", budget: 25000, options: {} });
  setAI({ check: async (job) => ({ checks: job.scope.checks.map((x) => ({ id: x.id, verdict: "pass", reason: "probably", confidence: 0.55, signals: [] })), decision: "review", source: "test-model", model: "done-audit-test" }) });
  try { await deliverMs(j, j.milestones[0]); } finally { setAI({ check: null }); }
  const q = J.queue().find((x) => x.job === j.id);
  assert.ok(q);
  assert.ok(Date.parse(q.slaDue) > Date.parse(q.at));
  assert.equal(J.addBusinessHours(Date.parse("2026-11-06T22:00:00Z"), 4), Date.parse("2026-11-09T18:00:00Z"), "Friday 4pm Austin + 4 business hours = Monday noon");
  const r = await J.expertDecide(j.id, q.id, { decision: "release" });
  assert.equal(r.status, "released");
  assert.ok(!J.queue().some((x) => x.job === j.id));
  const round = J.job(j.id).checks[0];
  assert.match(round.verdictHash, /^[0-9a-f]{64}$/);
  await receipts.batch();
  const rc = receipts.show(round.receipt);
  assert.equal(rc.body.data.verdictHash, round.verdictHash);
  assert.equal(rc.body.data.signed.model, "done-audit-test");
  const ok = receipts.verify(rc);
  assert.ok(ok.hash && ok.signature);
});

test("ratings only from paid jobs; a public profile shows them and the job's photos; verified pros", async () => {
  const c = person();
  const j = await hire(c, { text: "Kitchen faucet keeps dripping. Fix it this week.", budget: 25000, options: {} });
  assert.equal(J.rate(j.id, { stars: 5 }, P(c)).error, "state", "not paid yet");
  J.startWork(j.agreed.pro, j.id, PRO(j.agreed.pro));
  await deliverMs(j, j.milestones[0]);
  assert.equal(J.rate(j.id, { stars: 5, text: "Fast and clean", sharePhotos: true }, { kind: "agent", person: c.id }).error, "forbidden");
  assert.equal(J.rate(j.id, { stars: 5, text: "Fast and clean", sharePhotos: true }, P(c)).rating.stars, 5);
  const prof = J.proProfile(j.agreed.pro);
  assert.ok(prof.ratings >= 1);
  assert.ok(prof.photos.length >= 1);
  assert.ok(J.profilePhoto(j.agreed.pro, prof.photos[0].url.split("/").pop()));
  const badges = pros.viewPro(pros.pro(j.agreed.pro)).verified;
  assert.ok(badges.find((b) => b.id === "paypal").ok);
  assert.equal(licenceLookup("M-90417").valid, true);
  assert.equal(licenceLookup("12345").valid, false);
  assert.equal(licenceLookup("J-50311").valid, false, "an expired licence");
  assert.equal(licenceLookup(null, { trade: "cleaning" }).required, false);
  assert.equal(insuranceCheck({ carrier: "X", policy: "GL-123456", limit: 10000000, expires: "2030-01-01" }).valid, false, "under $300k");
  const x = pros.createPro({ name: "Test Plumbing Verify", trade: "plumbing", zip: "78704", email: "tpv@done-demo.example" });
  const v = pros.setVerification(x.pro.id, { license: { number: "M-99999" }, insurance: { carrier: "Acme", policy: "GL-999999", limit: 50000000, expires: "2030-01-01" } });
  assert.equal(v.verification.license.valid, false);
  assert.equal(v.verification.insurance.valid, true);
});

test("the scope review runs when both sides agree: the AI's reviewScope if it's there, else the rules", async () => {
  const c = person();
  setAI({ review: async () => ({ gaps: [{ severity: "medium", what: "No photo of the shut-off valve", suggestion: "Add one" }], ok: true, source: "test-model" }) });
  try {
    const j = await hire(c, { text: "Kitchen faucet keeps dripping. Fix it this week.", budget: 25000, options: {} });
    await new Promise((r) => setTimeout(r, 20));
    assert.equal(J.job(j.id).scopeReview.source, "test-model");
  } finally { setAI({ review: null }); }
  const k = await hire(c, { text: "Kitchen faucet keeps dripping. Fix it this week.", budget: 25000, options: {} });
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(J.job(k.id).scopeReview.source, "rules");
});
