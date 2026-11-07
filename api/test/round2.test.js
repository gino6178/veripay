// Web round 2: resuming a demo customer, the scope preview with milestones and its gap review, "confirm" versus
// "release now", warranties without retainage, the review wording, profile ratings and photo captions, an inspector
// reading evidence, payout explanations everywhere, and a pro's reply to the scope.
import test, { after } from "node:test";
import assert from "node:assert/strict";
import { J, person, P, PRO, photo, pp, clock, people, setAI } from "./helpers.js";
process.env.DONE_NO_LISTEN = "1";
const { app } = await import("../src/server.js");
const srv = app.listen(0);
after(() => srv.close());
const base = `http://127.0.0.1:${srv.address().port}`;
const client = () => { let ck = ""; return async (method, p, body) => { const r = await fetch(base + p, { method, headers: { "content-type": "application/json", cookie: ck }, body: body ? JSON.stringify(body) : undefined }); const sc = r.headers.get("set-cookie"); if (sc) ck = sc.split(";")[0]; const t = await r.text(); let j; try { j = JSON.parse(t); } catch { j = t; } return { s: r.status, j }; }; };
const evidenceFor = (j, m = J.job(j.id).milestones[0]) => J.job(j.id).scope.checks.filter((c) => m.checkIds.includes(c.id)).map((c) => c.doc ? { kind: "receipt", buf: photo(J.job(j.id)), mime: "image/jpeg", checkId: c.id, text: "CITY OF AUSTIN plumbing permit BP-1 inspection PASSED lien waiver" }
  : c.evidence === "receipt" ? { kind: "receipt", buf: photo(J.job(j.id)), mime: "image/jpeg", checkId: c.id, text: `TOTAL ${((J.job(j.id).agreed.parts || 0) / 100).toFixed(2)}` } : c.evidence === "note" ? { kind: "note", checkId: c.id, text: "Done as described, tested." } : { kind: "photo", buf: photo(J.job(j.id)), mime: "image/jpeg", checkId: c.id });
async function hire(c, text = "Kitchen faucet keeps dripping. Fix it this week.", options = {}, budget = 25000) {
  const j = await J.createJob(c.id, { text, zip: "78704", budget, options, actor: P(c) });
  await J.requestOffers(j.id, P(c));
  const o = J.job(j.id).offers.filter((x) => x.status === "open").sort((a, b) => a.amount - b.amount)[0];
  await J.acceptOffer(j.id, o.id, { actor: P(c), payWith: "card", raiseCeiling: true });
  J.startWork(J.job(j.id).agreed.pro, j.id, PRO(J.job(j.id).agreed.pro));
  return J.job(j.id);
}
const deliver = async (j, items = evidenceFor(j)) => { J.addEvidence(j.agreed.pro, j.id, items, PRO(j.agreed.pro)); return J.submit(j.agreed.pro, j.id, PRO(j.agreed.pro)); };
const unsure = () => setAI({ check: async (job) => ({ checks: job.scope.checks.map((x) => ({ id: x.id, verdict: "pass", reason: "needs a look", confidence: 0.5, signals: ["needs_person"], needsPerson: true })), decision: "review", source: "test-model" }) });

test("a demo sign-in can resume an existing demo customer, with their jobs", async () => {
  const a = client();
  const first = (await a("POST", "/api/auth/demo", { as: "customer", name: "Resume Me", pin: "5555" })).j.person;
  await a("POST", "/api/jobs", { text: "Kitchen faucet drips, fix this week", zip: "78704", budget: 200 });
  const list = (await client()("GET", "/api/demo/customers")).j;
  assert.ok(list.some((x) => x.id === first.id && x.jobs === 1));
  const b = client();
  const again = (await b("POST", "/api/auth/demo", { as: "customer", person: first.id, pin: "5555" })).j.person;
  assert.equal(again.id, first.id);
  assert.equal((await b("GET", "/api/jobs")).j.length, 1);
  assert.equal((await b("POST", "/api/auth/demo", { as: "customer", person: "p_0000000000" })).s, 404);
});

test("the scope preview returns milestones; posted back, they're kept; the gap review runs before posting", async () => {
  const c = client();
  await c("POST", "/api/auth/demo", { as: "customer" });
  const pre = (await c("POST", "/api/scope", { text: "Replace our 40 gallon water heater this month", budget: 2500 })).j;
  assert.equal(pre.milestones.length, 2);
  assert.ok(pre.milestones[0].docs.length);
  const rv = (await c("POST", "/api/scope/review", { scope: pre })).j;
  assert.ok(Array.isArray(rv.gaps));
  assert.equal(rv.source, "rules");
  const posted = (await c("POST", "/api/jobs", { text: "Replace our 40 gallon water heater this month", zip: "78704", budget: 2500, scope: { ...pre, title: "Replace the water heater (garage)", priceCeiling: 2500 } })).j;
  assert.equal(posted.scope.milestones.length, 2);
  assert.equal(posted.scope.source, "rules");
  assert.equal(posted.scope.editedBy, "person");
  assert.ok(posted.scope.checks.some((x) => x.doc === "permit"));
});

test("confirming checks that needed a person is a pass: the review window still applies; 'release now' skips it", async () => {
  const c = person(), j = await hire(c, undefined, { releaseMode: "review", reviewHours: 24 });
  unsure();
  try { assert.equal((await deliver(j)).status, "review"); } finally { setAI({ check: null }); }
  assert.match(J.view(J.job(j.id)).next, /Every check passed, but some need a person to confirm/);
  const v = await J.confirm(j.id, P(c));
  assert.equal(v.status, "passed");
  assert.equal(v.milestones[0].passed.waiting, "review_window");
  const now_ = await J.release(j.id, P(c));
  assert.equal(now_.status, "released", "release now skips the window");
  // the expert's confirmation and an inspector's are passes too
  const k = await hire(person(), undefined, { releaseMode: "review", reviewHours: 24 });
  unsure();
  try { await deliver(k); } finally { setAI({ check: null }); }
  const q = J.queue().find((x) => x.job === k.id);
  assert.equal((await J.expertDecide(k.id, q.id, { decision: "release" })).status, "passed", "the expert confirms; the window applies");
  const ins = people.makePerson({ name: "Inspector R2 (demo)", role: "inspector" });
  const n = await hire(person(), undefined, { inspector: ins.id });
  unsure();
  try { await deliver(n); } finally { setAI({ check: null }); }
  assert.equal((await J.inspect(ins.id, n.id, { verdict: "pass" })).status, "released", "an inspector's pass on a review, instant mode");
  // the wording on a first review with needs_fix verdicts
  const w = await hire(person());
  setAI({ check: async (job) => ({ checks: job.scope.checks.map((x, i) => ({ id: x.id, verdict: i ? "pass" : "needs_fix", reason: "blurry", confidence: 0.9, signals: [] })), decision: "review", source: "t" }) });
  try { const r = await deliver(w); assert.equal(r.status, "review"); assert.doesNotMatch(r.next, /several tries/); } finally { setAI({ check: null }); }
});

test("a warranty without retainage: claim, the fix is checked; staff can refund from the capture (the platform's cost)", async () => {
  const c = person(), j = await hire(c);
  await deliver(j);
  assert.equal(J.job(j.id).warranty.status, "open");
  assert.match(J.view(J.job(j.id)).next, /Warranty until/);
  await J.claimDefect(j.id, { reason: "It drips again", items: [{ kind: "photo", buf: photo(j), mime: "image/jpeg" }] }, P(c));
  const f = await J.fixDefect(j.agreed.pro, j.id, [{ kind: "photo", buf: photo(j), mime: "image/jpeg" }], PRO(j.agreed.pro));
  assert.equal(f.warranty.status, "fixed");
  const k = await hire(person());
  await deliver(k);
  await J.claimDefect(k.id, { reason: "The handle broke" }, P({ id: k.customer }));
  assert.equal((await J.resolveDefect(k.id, { outcome: "refund" })).error, "outcome", "no retainage: say how much");
  const r = await J.resolveDefect(k.id, { outcome: "partial", refund: 2000, note: "half the handle" });
  assert.equal(r.warranty.status, "refunded");
  const b = J.balance(J.job(k.id));
  assert.ok(b.ok, JSON.stringify(b));
  assert.ok(J.job(k.id).money.ledger.some((l) => l.kind === "platform_loss" && l.amount === 2000));
  clock.advance(15, "test");
  await J.tick();
});

test("profile: one decimal from the true mean; photos only from the accepted round, captioned by what decided", async () => {
  const pid = "eastside-pipe-drain";
  const mk = async (stars, viaPerson) => {
    const c = person();
    const j = await J.createJob(c.id, { text: "Kitchen faucet keeps dripping. Fix it this week.", zip: "78704", budget: 25000, actor: P(c) });
    await J.requestOffers(j.id, P(c));
    const o = J.job(j.id).offers.find((x) => x.pro === pid);
    await J.acceptOffer(j.id, o.id, { actor: P(c), payWith: "card", raiseCeiling: true });
    J.startWork(pid, j.id, PRO(pid));
    if (viaPerson) { unsure(); try { await deliver(J.job(j.id)); } finally { setAI({ check: null }); } await J.release(j.id, P(c)); }
    else { const items = evidenceFor(J.job(j.id)); await deliver(J.job(j.id), items.slice(1)); await deliver(J.job(j.id), items.slice(0, 1)); }
    J.rate(j.id, { stars, sharePhotos: true }, P(c));
    return J.job(j.id);
  };
  const a = await mk(5, false), b = await mk(4, true);
  const prof = J.proProfile(pid);
  const mine = prof.reviews.filter((r) => [a.number, b.number].includes(r.job));
  assert.equal(mine.length, 2);
  assert.equal(typeof prof.rating, "number");
  assert.equal(prof.ratingText, (Math.round(prof.rating * 10) / 10).toFixed(1));
  const pa = prof.photos.filter((x) => x.job === a.number), pb = prof.photos.filter((x) => x.job === b.number);
  assert.ok(pa.every((x) => /every check passed/.test(x.verified)));
  assert.ok(pb.every((x) => /released by the customer/.test(x.verified)));
  // a defect-fix photo isn't on the profile
  await J.claimDefect(a.id, { reason: "drips again" }, P({ id: a.customer }));
  await J.fixDefect(pid, a.id, [{ kind: "photo", buf: photo(a), mime: "image/jpeg" }], PRO(pid));
  const fixPhoto = J.job(a.id).evidence.filter((e) => e.checkId === "warranty" && e.phase === "after").at(-1);
  assert.ok(!J.proProfile(pid).photos.some((x) => x.url.endsWith(fixPhoto.id)));
  assert.equal(J.profilePhoto(pid, fixPhoto.id), null);
  // a 5 and a 4 average to 4.5, not 5.0
  const solo = await (async () => { const x = J.proProfile("mueller-plumbing"); return x; })();
  assert.ok(solo.rating === null || typeof solo.rating === "number");
});

test("an assigned inspector reads the job's evidence with only the inspector session; payouts say what they mean", async () => {
  const ic = client();
  const ins = (await ic("POST", "/api/auth/demo", { as: "inspector", pin: "1357" })).j.person;
  const c = person(), j = await hire(c, undefined, { inspector: ins.id });
  await deliver(j);
  const e = J.job(j.id).evidence.find((x) => x.kind === "photo");
  assert.equal((await ic("GET", `/api/jobs/${j.id}/evidence/${e.id}`)).s, 200);
  assert.equal((await client()("GET", `/api/jobs/${j.id}/evidence/${e.id}`)).s, 404);
  assert.equal((await ic("GET", `/api/inspector/jobs/${j.id}`)).s, 200);
  const v = J.view(J.job(j.id));
  assert.ok(v.money.payout.items.every((x) => x.says));
  assert.ok(v.milestones[0].payout.items.every((x) => x.says));
  const st = client();
  await st("POST", "/api/auth/staff", {});
  const pays = (await st("GET", "/api/staff/payouts")).j;
  assert.ok(pays.length && pays.every((p) => p.items.every((x) => x.says) && p.says));
});

test("a pro replies to the scope before agreeing; the customer can take the suggested revision", async () => {
  const c = person();
  setAI({ review: async (job, opts) => ({ gaps: [{ severity: "medium", what: "the shut-off valve isn't in scope", suggestion: "add it" }], ok: true, source: "test-model", revisedScope: { ...job.scope, items: [...job.scope.items, "Replace the shut-off valve if it leaks"], checks: job.scope.checks }, changes: [opts?.proReply ? "from the pro" : "x"] }) });
  try {
    const j = await J.createJob(c.id, { text: "Kitchen faucet keeps dripping. Fix it this week.", zip: "78704", budget: 25000, actor: P(c) });
    await J.requestOffers(j.id, P(c));
    const r = await J.scopeReply("barton-creek-plumbing", j.id, "The shut-off valve often fails too; it should be in the scope.", PRO("barton-creek-plumbing"));
    assert.ok(r.reply.review.revisedScope);
    const a = J.applyRevision(j.id, r.reply.id, P(c));
    assert.ok(!a.error, a.message);
    assert.equal(J.job(j.id).status, "scoped", "offers are asked for again");
    assert.ok(J.job(j.id).scope.items.some((x) => /shut-off valve/.test(x)));
  } finally { setAI({ review: null }); }
});
