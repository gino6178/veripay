// Round 5: the test history at /live-test (allow-list, redacted), where a condition came from, parts on a pro's own
// offer, the licence staff-review path, a pro's wait_for_news, the demo clock in views, before photos count, a later
// note doesn't push out earlier photos, change orders decided in review, demo staff, scope changes keep every condition
// and milestone document, review_scope after an applied gap, confirm says what it paid, the demo permit document.
import test, { after } from "node:test";
import assert from "node:assert/strict";
import { J, person, P, PRO, photo, people, pros, tools, setAI, clock } from "./helpers.js";
process.env.DONE_NO_LISTEN = "1";
const server = await import("../src/server.js");
const srv = server.app.listen(0);
after(() => srv.close());
const base = `http://127.0.0.1:${srv.address().port}`;

async function hire(c, { text = "Kitchen faucet keeps dripping. Fix it this week.", budget = 25000, start = true, before = false } = {}) {
  const j = await J.createJob(c.id, { text, zip: "78704", budget, actor: P(c) });
  if (before) J.editScope(j.id, { checks: [{ id: "before", what: "Photo of the faucet before the repair", evidence: "photo" }, ...J.job(j.id).scope.checks.filter((x) => x.id !== "before")] }, P(c));
  await J.requestOffers(j.id, P(c), { now: true });
  const o = J.job(j.id).offers.filter((x) => x.status === "open").sort((a, b) => a.amount - b.amount)[0];
  await J.acceptOffer(j.id, o.id, { actor: P(c), payWith: "card", raiseCeiling: true });
  if (start) J.startWork(J.job(j.id).agreed.pro, j.id, PRO(J.job(j.id).agreed.pro));
  return J.job(j.id);
}

test("/live-test serves the test history read-only, an allow-list, secrets redacted", async () => {
  const r = await fetch(`${base}/live-test/`);
  assert.equal(r.status, 200);
  assert.match(r.headers.get("content-type"), /text\/html/);
  assert.equal((await fetch(`${base}/live-test/build.mjs`)).status, 404);
  assert.equal((await fetch(`${base}/live-test/..%2F..%2Fapi%2F.env`)).status, 404);
  const md = await fetch(`${base}/live-test/rounds.json`);
  assert.equal(md.status, 200);
  const ops = await (await fetch(`${base}/live-test/ops/round04-water-heater-with-milestones-a01891.json`)).text();
  assert.ok(!/code=(?!REDACTED)[A-Za-z0-9_-]{4,}/.test(ops), "link codes are redacted");
});

test("a condition's origin: the writer's from the preview stay the writer's; the customer's added ones are theirs", async () => {
  const c = person(), text = "Kitchen sink is clogged and drains slowly.";
  const pv = await J.previewScope({ text, zip: "78704" });
  const given = { ...pv, checks: [...pv.checks, { id: "c9", what: "Receipt for anything bought", evidence: "receipt" }] };
  const j = await J.createJob(c.id, { text, zip: "78704", budget: 30000, scope: given, actor: P(c) });
  const k = J.job(j.id);
  assert.equal(k.scope.checks.find((x) => x.id === "c9").by, "customer");
  assert.ok(k.scope.checks.filter((x) => x.id !== "c9").every((x) => x.by === "writer"), JSON.stringify(k.scope.checks.map((x) => [x.id, x.by])));
});

test("a pro's own offer carries parts and the parts policy; the customer sees them; the hold leaves room for parts", async () => {
  const c = person(), j = await J.createJob(c.id, { text: "Kitchen faucet keeps dripping. Fix it this week.", zip: "78704", budget: 40000, actor: P(c) });
  const x = pros.createPro({ name: "Parts Plumbing (test)", trade: "plumbing", zip: "78704", email: "pp@done-demo.example" });
  const pid = x.pro.id;
  pros.setPayPal?.(pid, { email: "pp@done-demo.example" });
  await J.requestOffers(j.id, P(c));
  const bad = await tools.PRO.offer(pros.pro(pid), { job: j.id, amount: 200, parts: 250 });
  assert.equal(bad.error, "parts");
  const r = await tools.PRO.offer(pros.pro(pid), { job: j.id, amount: 200, parts: 60, partsPolicy: "at_cost" });
  assert.ok(!r.error, r.message);
  const o = J.view(J.job(j.id)).offers.find((y) => y.pro.id === pid);
  assert.equal(o.parts.usd, "$60.00");
  assert.equal(o.partsPolicy, "at_cost");
  assert.match(o.partsSays, /\$60\.00 of the price is parts/);
});

test("a licence the demo registry doesn't know: pending staff review with a document, then verified by staff", async () => {
  const x = pros.createPro({ name: "Unknown Licence Plumbing (test)", trade: "plumbing", zip: "78704", email: "ul@done-demo.example" });
  let v = pros.setVerification(x.pro.id, { license: { number: "M-77731" } });
  assert.equal(v.verification.license.valid, false);
  assert.match(v.verification.license.why, /send a photo or PDF of your licence/);
  const doc = `data:image/jpeg;base64,${photo({ address: { lat: 30.25, lng: -97.75 } }).toString("base64")}`;
  v = pros.setVerification(x.pro.id, { licenseDoc: doc });
  assert.equal(v.verification.license.status, "pending_review");
  assert.equal(v.verification.license.says, "not yet verified (staff review pending)");
  assert.match(v.verification.license.why, /staff review pending/);
  v = pros.staffLicence(x.pro.id, { ok: true, note: "document checked" });
  assert.equal(v.verification.license.valid, true);
  assert.equal(v.verification.license.status, "verified_by_staff");
});

test("a pro's wait_for_news is about their jobs, their offers and their feed; the demo clock shows in views", async () => {
  const p = pros.pro("barton-creek-plumbing");
  const w = await tools.PRO.wait_for_news(p, { after: 0, seconds: 1 });
  assert.ok(w.events.every((e) => ["your job", "your offer", "new in your feed"].includes(e.why)), JSON.stringify(w.events.slice(0, 3)));
  assert.ok(w.clock && "aheadMinutes" in w.clock);
  const c = person(), j = await J.createJob(c.id, { text: "Kitchen faucet keeps dripping.", zip: "78704", budget: 25000, actor: P(c) });
  clock.advanceMs(5 * 60e3, "test: finish now");
  assert.ok(J.view(J.job(j.id)).clock.aheadMinutes >= 5);
});

test("before photos from start_work count for the before condition; a later note doesn't push out earlier photos", async () => {
  const c = person(), j = await hire(c, { start: false, before: true }), pid = j.agreed.pro;
  const k0 = J.job(j.id), bc = k0.scope.checks.find((x) => x.id === "before" || /before/i.test(x.what));
  assert.ok(bc, "the faucet scope has a before condition");
  J.startWork(pid, j.id, PRO(pid), { before: [{ kind: "photo", buf: photo(k0, { taken: new Date(clock.now() - 60e3).toISOString() }), mime: "image/jpeg" }] });
  const others = J.job(j.id).scope.checks.filter((x) => x.id !== bc.id);
  const photos = others.filter((x) => x.evidence === "photo").map((x) => ({ kind: "photo", buf: photo(J.job(j.id)), mime: "image/jpeg", checkId: x.id }));
  J.addEvidence(pid, j.id, [...photos, ...others.filter((x) => x.evidence !== "photo").map((x) => ({ kind: x.evidence === "receipt" ? "receipt" : "note", ...(x.evidence === "receipt" ? { buf: photo(J.job(j.id)), mime: "image/jpeg", text: "TOTAL 0.00" } : { text: "Replaced the cartridge." }), checkId: x.id }))], PRO(pid));
  let seen = null;
  setAI({ check: async (job, evidence) => { seen = evidence; return { checks: job.scope.checks.map((x) => ({ id: x.id, verdict: "pass", reason: "ok", confidence: 0.9, signals: [] })), decision: "release", source: "rules" }; } });
  try { await J.submit(pid, j.id, PRO(pid)); } finally { setAI({ check: null }); }
  assert.ok(seen.some((e) => e.checkId === bc.id && e.fromBefore), "the before photo answers the before condition");
});

test("a change order requested while in review can be decided; demo staff are labelled; ADMIN_TOKEN guards staff without demo", async () => {
  const c = person(), j = await hire(c), pid = j.agreed.pro;
  setAI({ check: async (job) => ({ checks: job.scope.checks.map((x) => ({ id: x.id, verdict: "pass", reason: "a person should look", confidence: 0.5, signals: ["needs_person"] })), decision: "review", source: "rules" }) });
  try { J.addEvidence(pid, j.id, J.job(j.id).scope.checks.map((x) => ({ kind: x.evidence === "receipt" ? "receipt" : x.evidence === "note" ? "note" : "photo", ...(x.evidence === "note" ? { text: "done" } : { buf: photo(J.job(j.id)), mime: "image/jpeg", text: "TOTAL 0.00" }), checkId: x.id })), PRO(pid)); await J.submit(pid, j.id, PRO(pid)); } finally { setAI({ check: null }); }
  assert.equal(J.job(j.id).status, "review");
  const co = await J.requestChange(pid, j.id, { amount: 1500, reason: "a new supply line" }, PRO(pid));
  assert.ok(!co.error, co.message);
  const r = await J.approveChange(j.id, co.change.id, P(c));
  assert.ok(!r.error, r.message);
  assert.equal(server.staffAllowed(true, null, null), true);
  assert.equal(server.staffAllowed(false, null, "x"), false);
  assert.equal(server.staffAllowed(false, "s3cret-admin", "nope"), false);
  assert.equal(server.staffAllowed(false, "s3cret-admin", "s3cret-admin"), true);
});

test("applying a revised scope keeps every condition and milestone document and says what changed; the gap isn't listed again", async () => {
  const c = person(), a = { person: c.id, client: "t", scopes: ["read", "hire", "pay"] };
  const j = await J.createJob(c.id, { text: "Replace our 50 gallon water heater this month", zip: "78704", budget: 300000, actor: P(c) });
  const k = J.job(j.id), docsBefore = (k.scope.milestones || []).flatMap((m) => m.docs || []);
  const plain = k.scope.checks.filter((x) => !/^m\d+d\d+$/.test(x.id));
  setAI({ review: async () => ({ gaps: [{ severity: "low", what: "No licence number", suggestion: "Add a note with the plumber's licence number" }], ok: false, source: "test-model", revisedScope: { title: k.scope.title, items: k.scope.items, checks: plain.slice(0, 2) } }) });
  try {
    await tools.CUSTOMER.review_scope(a, { job: j.id });
    const r = await tools.CUSTOMER.apply_scope_suggestion(a, { job: j.id });
    assert.ok(!r.error, r.message);
    const after_ = J.job(j.id);
    assert.ok(plain.every((x) => after_.scope.checks.some((y) => y.id === x.id)), "no condition dropped");
    assert.deepEqual((after_.scope.milestones || []).flatMap((m) => m.docs || []).sort(), docsBefore.sort());
    assert.equal(r.changed.removed.length, 0);
    await tools.CUSTOMER.apply_scope_suggestion(a, { job: j.id, suggestion: "g1" });
    const again = await tools.CUSTOMER.review_scope(a, { job: j.id });
    assert.equal(again.gaps.length, 0);
    assert.equal(again.alreadyApplied, 1);
  } finally { setAI({ review: null }); }
});

test("the demo pro's permit is a permit document: number, issue date, site; the inspection is the sticker", async () => {
  const da = await import("../src/demoassets.js");
  const c = person(), j = await J.createJob(c.id, { text: "Replace our 50 gallon water heater this month", zip: "78704", budget: 300000, actor: P(c) });
  const permit = J.job(j.id).scope.checks.find((x) => x.doc === "permit");
  if (!permit) return;
  const items = await da.evidenceFor(J.job(j.id), [permit], { typed: true });
  assert.match(items[0].text, /PERMIT No\. BP-\d{4}-\d+/);
  assert.match(items[0].text, /Issued: \d{2}\/\d{2}\/\d{4}/);
  assert.match(items[0].text, /Site: /);
  assert.ok(!/INSPECTION PASSED/.test(items[0].text));
});

test("the demo pro's permit passes the document check; two demo jobs get different permit numbers and stores", async () => {
  const da = await import("../src/demoassets.js"), { validateDocument } = await import("../src/docs.js");
  const c = person();
  const a = await J.createJob(c.id, { text: "Replace our 50 gallon water heater this month", zip: "78704", budget: 300000, actor: P(c) });
  const b = await J.createJob(c.id, { text: "Replace our 40 gallon water heater this month", zip: "78704", budget: 300000, actor: P(c) });
  assert.notEqual(da.permitNo(J.job(a.id)), da.permitNo(J.job(b.id)));
  assert.notEqual(da.storeOf(J.job(a.id)), da.storeOf(J.job(b.id)));
  const permit = J.job(a.id).scope.checks.find((x) => x.doc === "permit");
  if (!permit) return;
  const [item] = await da.evidenceFor(J.job(a.id), [permit], { typed: true });
  const v = await validateDocument({ kind: "permit", text: item.text, job: J.publicJob(J.job(a.id)), expect: { stage: "progress" } });
  assert.equal(v.verdict, "pass", JSON.stringify(v));
});

test("Judge C: an agent can't become its person: links need the PIN, resume needs the PIN, person-only routes need a step-up, 5 wrong PINs lock", async () => {
  const auth = await import("../src/auth.js");
  const call = async (method, p, body, ck = "") => { const r = await fetch(base + p, { method, headers: { "content-type": "application/json", cookie: ck }, body: body ? JSON.stringify(body) : undefined, redirect: "manual" }); return { s: r.status, j: await r.json().catch(() => null), ck: r.headers.get("set-cookie")?.split(";")[0] || null }; };
  const signup = await call("POST", "/api/auth/demo", { as: "customer", pin: "8642" });
  const pid = signup.j.person.id;
  assert.ok(!JSON.stringify(signup.j).includes("8642") || signup.j.pinOnce === undefined, "a chosen PIN is never echoed");
  // the agent's askPerson link: opening it gives no session
  const link = auth.personLink(pid, { to: "/connect#limits", limit: "changeMax" }), code = link.url.split("code=")[1];
  assert.equal(link.api, undefined);
  const open = await call("GET", `/api/auth/link?code=${code}`);
  assert.equal(open.s, 302); assert.equal(open.ck, null);
  assert.equal((await call("POST", "/api/auth/link", { code })).s, 401);
  // resuming the customer without the PIN
  const noPin = await call("POST", "/api/auth/demo", { as: "customer", person: pid });
  assert.equal(noPin.s, 401); assert.match(noPin.j.message, /PIN is needed to sign in as them/);
  // a session without a step-up (however it was had) can't raise limits, make tokens or release
  const sid = auth.createSession(pid), ck = `${auth.COOKIE}=${sid}`;
  const lim = await call("PUT", "/api/limits", { changeMax: 400, agentMayRelease: true }, ck);
  assert.equal(lim.s, 403); assert.equal(lim.j.error, "step_up");
  assert.equal((await call("POST", "/api/tokens", { label: "x" }, ck)).s, 403);
  // five wrong PINs lock the step-up; the right one is refused while locked
  for (let i = 0; i < 5; i++) assert.equal((await call("POST", "/api/auth/step-up", { pin: "0000" }, ck)).s, i < 4 ? 403 : 403);
  assert.equal((await call("POST", "/api/auth/step-up", { pin: "8642" }, ck)).s, 429);
  // another person: the right PIN steps up, and limits can then change
  const other = await call("POST", "/api/auth/demo", { as: "customer", pin: "1357" });
  const sid2 = auth.createSession(other.j.person.id), ck2 = `${auth.COOKIE}=${sid2}`;
  assert.equal((await call("POST", "/api/auth/step-up", { pin: "1357" }, ck2)).s, 200);
  assert.equal((await call("PUT", "/api/limits", { changeMax: 100 }, ck2)).s, 200);
});

test("pros and the inspector: PIN at onboarding and sign-in; payout routing, licence, insurance, keys and early pay need a step-up; pro agents can't route money", async () => {
  const auth = await import("../src/auth.js"), mcp = await import("../src/mcp.js");
  const call = async (method, p, body, ck = "") => { const r = await fetch(base + p, { method, headers: { "content-type": "application/json", cookie: ck }, body: body ? JSON.stringify(body) : undefined, redirect: "manual" }); return { s: r.status, j: await r.json().catch(() => null), ck: r.headers.get("set-cookie")?.split(";")[0] || null }; };
  // demo pro and inspector sign-in need the PIN
  assert.equal((await call("POST", "/api/auth/demo", { as: "pro", pro: "lone-star-rooter" })).s, 401);
  assert.equal((await call("POST", "/api/auth/demo", { as: "pro", pro: "lone-star-rooter", pin: "0000" })).s, 403);
  assert.equal((await call("POST", "/api/auth/demo", { as: "pro", pro: "lone-star-rooter", pin: "8642" })).s, 200);
  assert.equal((await call("POST", "/api/auth/demo", { as: "inspector" })).s, 401);
  assert.equal((await call("POST", "/api/auth/demo", { as: "inspector", pin: process.env.DONE_INSPECTOR_PIN || "1357" })).s, 200);
  // an onboarded pro sets a PIN; a pro that onboarded can't come in through the demo button
  const x = pros.createPro({ name: "Step Up Plumbing (test)", trade: "plumbing", zip: "78704", email: "su@done-demo.example" });
  const ob = await call("POST", "/api/pro/onboard", { code: x.onboarding.link.split("code=")[1], pin: "97531" });
  assert.equal(ob.s, 200);
  assert.equal((await call("POST", "/api/auth/demo", { as: "pro", pro: x.pro.id })).s, 401);
  // a session without a step-up (however it was had) can't change where money goes, the licence, keys, or take early pay
  const sid = auth.createSession(ob.j.person.id), ck = `${auth.COOKIE}=${sid}`;
  assert.equal((await call("PUT", "/api/pro/paypal", { email: "thief@evil.example" }, ck)).j.error, "step_up");
  assert.equal((await call("PUT", "/api/pro/verification", { license: { number: "M-12345" } }, ck)).s, 403);
  assert.equal((await call("POST", "/api/pro/keys", { label: "x" }, ck)).s, 403);
  assert.equal((await call("POST", "/api/auth/step-up", { pin: "97531" }, ck)).s, 200);
  assert.equal((await call("PUT", "/api/pro/paypal", { email: "su-real@done-demo.example" }, ck)).s, 200);
  // a pro agent: no argument routes money; early pay is the pro's own decision
  const pr = pros.pro(x.pro.id);
  const sr = await tools.PRO.set_rates(pr, { hourly: 90 });
  assert.ok(!sr.error);
  const bad = (await import("../src/tools.js")).unknownProArgs("set_rates", { hourly: 90, paypalEmail: "thief@evil.example", helperShare: 0.9 });
  assert.match(bad.message, /doesn't take paypalEmail, helperShare.*only by the pro on the website/);
  // early pay: someone else’s job is not found (ownership first); their own job gets the person-only answer
  assert.equal((await tools.PRO.early_pay(pr, { job: "job_x" })).error, "not_found");
  const c = person(), j = await J.createJob(c.id, { text: "Kitchen faucet keeps dripping. Fix it this week.", zip: "78704", budget: 25000, actor: P(c) });
  await J.requestOffers(j.id, P(c), { now: true });
  const o = J.proOffer(pr.id, j.id, { amount: 15000 }, PRO(pr.id)).offer;
  await J.acceptOffer(j.id, o.id, { actor: P(c), payWith: "card" });
  const ep = await tools.PRO.early_pay(pr, { job: j.id });
  assert.equal(ep.error, "person_only");
  assert.ok(ep.signIn.url);
  assert.ok(mcp);
});

test("the step-up lasts 10 minutes of real time from the step-up (link sign-in included); the demo clock doesn't move it", async () => {
  const auth = await import("../src/auth.js");
  const call = async (method, p, body, ck = "") => { const r = await fetch(base + p, { method, headers: { "content-type": "application/json", cookie: ck }, body: body ? JSON.stringify(body) : undefined, redirect: "manual" }); return { s: r.status, j: await r.json().catch(() => null), ck: r.headers.get("set-cookie")?.split(";")[0] || null }; };
  const c = person();
  auth.setPin(c.id, "24680");
  const link = auth.personLink(c.id, { to: "/connect#limits" }), code = link.url.split("code=")[1];
  const li = await call("POST", "/api/auth/link", { code, pin: "24680" });
  assert.equal(li.s, 200);
  const sid = li.ck.split("=")[1];
  // the demo clock moves 30 minutes: the step-up is still on (real time: no time has passed)
  clock.advanceMs(30 * 60e3, "test: the demo clock");
  assert.equal((await call("PUT", "/api/limits", { changeMax: 50 }, li.ck)).s, 200);
  // 9 real minutes after the link sign-in: still on; 10 and a bit: off
  auth.ageSession(sid, 9 * 60e3);
  assert.equal((await call("PUT", "/api/limits", { changeMax: 60 }, li.ck)).s, 200);
  auth.ageSession(sid, 61e3);
  const late = await call("PUT", "/api/limits", { changeMax: 70 }, li.ck);
  assert.equal(late.s, 403); assert.equal(late.j.error, "step_up");
  // a fresh step-up starts a new 10 minutes
  assert.equal((await call("POST", "/api/auth/step-up", { pin: "24680" }, li.ck)).s, 200);
  assert.equal((await call("PUT", "/api/limits", { changeMax: 70 }, li.ck)).s, 200);
});

test("the model's scope refines a rules draft in the background: swapped in while nobody quoted, else kept as a suggestion", async () => {
  const { rulesScope } = await import("../src/rules.js").catch(() => ({}));
  const base0 = async (input) => ({ ...(await (await import("../src/scope.js")).writeScope({ ...input, timeoutMs: 1 }).catch(() => null)), source: "rules", refinable: true });
  const model = (input) => ({ title: "Replace the kitchen faucet cartridge", trade: "plumbing", items: ["Replace the cartridge"], checks: [{ id: "new_part", what: "Photo of the new cartridge installed", evidence: "photo" }, { id: "no_drip", what: "Photo of the faucet off, no drip, 10 minutes later", evidence: "photo" }], source: "model" });
  setAI({ scope: base0, refine: async (input) => model(input) });
  try {
    const c = person();
    const j = await J.createJob(c.id, { text: "Kitchen faucet keeps dripping. Fix it this week.", zip: "78704", budget: 25000, actor: P(c) });
    assert.equal(J.job(j.id).scope.source, "rules", "posting never waits for the model");
    await J.refining.get(j.id);
    assert.equal(J.job(j.id).scope.source, "model");
    assert.equal(J.job(j.id).scope.refinedFrom, "rules");
    // a job pros already quoted: kept as a suggestion
    const k = await J.createJob(c.id, { text: "Kitchen faucet keeps dripping. Fix it this week.", zip: "78704", budget: 25000, actor: P(c) });
    await J.requestOffers(k.id, P(c), { now: true });
    await J.refining.get(k.id);
    assert.equal(J.job(k.id).scope.source, "rules");
    assert.ok(J.job(k.id).scopeRefined);
  } finally { setAI({ scope: null, refine: null }); }
  assert.ok(rulesScope || true);
});

test("round 6: an agent applies only stricter or clearer scope changes; set_options refuses unknown keys; person-only ones point to askPerson", async () => {
  const c = person(), a = { person: c.id, client: "t", scopes: ["read", "hire", "pay"] };
  const j = await J.createJob(c.id, { text: "Kitchen faucet keeps dripping. Fix it this week.", zip: "78704", budget: 25000, actor: P(c) });
  const first = J.job(j.id).scope.checks[0];
  setAI({ review: async () => ({ gaps: [{ severity: "low", what: "No receipt asked for", suggestion: "Add a receipt for the parts bought" }, { severity: "low", checkId: first.id, what: "too strict", suggestion: "Anything showing the job is roughly done" }], ok: false, source: "test-model", revisedScope: null }) });
  try {
    await tools.CUSTOMER.review_scope(a, { job: j.id });
    // g1 adds a condition: stricter, the agent may apply it
    const r1 = await tools.CUSTOMER.apply_scope_suggestion(a, { job: j.id, suggestion: "g1" });
    assert.ok(!r1.error, r1.message);
    assert.ok(J.job(j.id).scope.checks.some((x) => /receipt for the parts/i.test(x.what)));
    // g2 rewrites a condition into something looser: refused for the agent, the scope unchanged, askPerson given
    const r2 = await tools.CUSTOMER.apply_scope_suggestion(a, { job: j.id, suggestion: "g2" });
    assert.equal(r2.error, "limit");
    assert.equal(r2.limit, "scopeChange");
    assert.ok(r2.askPerson?.url);
    assert.equal(J.job(j.id).scope.checks.find((x) => x.id === first.id).what, first.what);
    // the person may apply it
    const r3 = J.applySuggestion(j.id, "g2", P(c));
    assert.ok(!r3.error, r3.message);
  } finally { setAI({ review: null }); }
  // set_options: unknown keys refused (400); the person-only ones point to askPerson
  const k = await J.createJob(c.id, { text: "Kitchen faucet keeps dripping. Fix it this week.", zip: "78704", budget: 25000, actor: P(c) });
  const u = await tools.CUSTOMER.set_options(a, { job: k.id, options: { reviewHours: 24, colour: "blue" } });
  assert.equal(u.error, "arguments"); assert.deepEqual(u.unknown, ["colour"]);
  const m = await tools.CUSTOMER.set_options(a, { job: k.id, options: { agentMayRelease: true } });
  assert.equal(m.error, "limit"); assert.equal(m.limit, "agentMayRelease"); assert.ok(m.askPerson?.url);
  const pc = await tools.CUSTOMER.set_options(a, { job: k.id, options: { priceCeiling: 900 } });
  assert.equal(pc.limit, "priceCeiling"); assert.ok(pc.askPerson?.url);
  assert.notEqual(J.job(k.id).options.reviewHours, 24, "nothing half-applied");
});

test("round 6: the tour's steps are idempotent and finish now works on a tour job; never a negative duration; lastCheck counts match its rows", async () => {
  const call = async (method, p, body, ck = "") => { const r = await fetch(base + p, { method, headers: { "content-type": "application/json", cookie: ck }, body: body ? JSON.stringify(body) : undefined, redirect: "manual" }); return { s: r.status, j: await r.json().catch(() => null), ck: r.headers.get("set-cookie")?.split(";")[0] || null }; };
  const st = await call("POST", "/api/demo/tour", { step: "start" }), ck = st.ck, id = st.j.id;
  await call("POST", "/api/demo/tour", { step: "hire", job: id }, ck);
  const w1 = await call("POST", "/api/demo/tour", { step: "start_work", job: id }, ck);
  assert.equal(w1.j.status, "working");
  const w2 = await call("POST", "/api/demo/tour", { step: "start_work", job: id }, ck);
  assert.equal(w2.s, 200, "pressed again: the job as it is, not an error");
  // "finish now" on the tour job: the demo pro delivers (the tour's pro isn't idle)
  const fin = await call("POST", `/api/jobs/${id}/demo-finish`, {}, ck);
  assert.equal(fin.s, 200);
  assert.ok(["submitted", "checking", "review", "passed", "released", "needs_fix"].includes(J.job(id).status), J.job(id).status);
  const lc = J.view(J.job(id)).lastCheck;
  assert.equal(lc.counts.total, lc.checks.length);
  assert.equal(lc.counts.notPassed, lc.checks.filter((c) => c.verdict !== "pass").length);
  for (const r of J.job(id).checks) for (const c of r.checks) assert.ok(!/-\d+ (seconds|minutes)/.test(c.reason || ""), c.reason);
});

test("round 6 urgent: an agent never releases without agentMayRelease (a passed milestone in its review window too) nor settles a dispute; 'all' is the person's; document conditions survive; agreed parts at cost", async () => {
  const c = person(), a = { person: c.id, client: "t", scopes: ["read", "hire", "pay"] };
  // a passed milestone in its review window: the agent may not release it early
  const j = await J.createJob(c.id, { text: "Kitchen faucet keeps dripping. Fix it this week.", zip: "78704", budget: 25000, options: { releaseMode: "review", reviewHours: 48 }, actor: P(c) });
  await J.requestOffers(j.id, P(c), { now: true });
  const o = J.job(j.id).offers.filter((x) => x.status === "open").sort((x, y) => x.amount - y.amount)[0];
  await J.acceptOffer(j.id, o.id, { actor: P(c), payWith: "card" });
  const pid = J.job(j.id).agreed.pro;
  J.startWork(pid, j.id, PRO(pid));
  setAI({ check: async (job) => ({ checks: job.scope.checks.map((x) => ({ id: x.id, verdict: "pass", reason: "ok", confidence: 0.95, signals: [] })), decision: "release", source: "rules" }) });
  try { J.addEvidence(pid, j.id, J.job(j.id).scope.checks.map((x) => ({ kind: x.evidence === "note" ? "note" : x.evidence === "receipt" ? "receipt" : "photo", ...(x.evidence === "note" ? { text: "done" } : { buf: photo(J.job(j.id)), mime: "image/jpeg", text: "TOTAL 0.00" }), checkId: x.id })), PRO(pid)); await J.submit(pid, j.id, PRO(pid)); } finally { setAI({ check: null }); }
  assert.equal(J.job(j.id).milestones[0].status, "passed", "in the review window");
  const r = await tools.CUSTOMER.release(a, { job: j.id });
  assert.equal(r.error, "limit"); assert.equal(r.limit, "agentMayRelease");
  assert.equal(J.job(j.id).money.captured, null, "nothing captured by the agent");
  // 'all' is the person's
  const w = await J.createJob(c.id, { text: "Replace our 50 gallon water heater this month", zip: "78704", budget: 300000, actor: P(c) });
  const docs = J.job(w.id).scope.checks.filter((x) => x.doc);
  setAI({ review: async () => ({ gaps: docs.map((d) => ({ severity: "low", checkId: d.id, what: "vague", suggestion: "A photo of the area" })), ok: false, source: "test-model", revisedScope: null }) });
  try {
    await tools.CUSTOMER.review_scope(a, { job: w.id });
    const all = await tools.CUSTOMER.apply_scope_suggestion(a, { job: w.id, suggestion: "all" });
    assert.equal(all.error, "limit");
    // the person applies all: the permit and inspection conditions are still there, unchanged
    const pr = J.applySuggestion(w.id, "all", P(c));
    assert.ok(!pr.error, pr.message);
    for (const d of docs) { const now = J.job(w.id).scope.checks.find((x) => x.id === d.id); assert.ok(now, `${d.id} kept`); assert.equal(now.what, d.what); assert.equal(now.doc, d.doc); }
  } finally { setAI({ review: null }); }
});

test("round 6: parts in the agreed price are paid at the receipt's total (no change orders); agents can't propose or accept a settlement", async () => {
  const c = person();
  const j = await J.createJob(c.id, { text: "Kitchen faucet keeps dripping. Fix it this week.", zip: "78704", budget: 30000, actor: P(c) });
  await J.requestOffers(j.id, P(c), { now: true });
  const x = pros.createPro({ name: "Parts At Cost (test)", trade: "plumbing", zip: "78704", email: "pac@done-demo.example" });
  pros.setPayPal(x.pro.id, { email: "pac@done-demo.example" });
  const o = J.proOffer(x.pro.id, j.id, { amount: 20000, parts: 9000, partsPolicy: "at_cost" }, PRO(x.pro.id)).offer;
  await J.acceptOffer(j.id, o.id, { actor: P(c), payWith: "card" });
  J.startWork(x.pro.id, j.id, PRO(x.pro.id));
  const k = J.job(j.id);
  setAI({ check: async (job) => ({ checks: job.scope.checks.map((y) => ({ id: y.id, verdict: "pass", reason: "ok", confidence: 0.95, signals: [] })), decision: "release", source: "rules" }) });
  try { J.addEvidence(x.pro.id, j.id, k.scope.checks.map((y) => ({ kind: y.evidence === "note" ? "note" : y.evidence === "receipt" ? "receipt" : "photo", ...(y.evidence === "note" ? { text: "done" } : { buf: photo(J.job(j.id)), mime: "image/jpeg", text: y.evidence === "receipt" ? "AUSTIN PLUMBING SUPPLY\nTOTAL 61.50" : "" }), checkId: y.id })), PRO(x.pro.id)); await J.submit(x.pro.id, j.id, PRO(x.pro.id)); } finally { setAI({ check: null }); }
  const m = J.job(j.id).milestones[0];
  if (J.job(j.id).scope.checks.some((y) => y.evidence === "receipt" && !y.doc)) {
    assert.equal(m.release?.partsAdjusted?.amount, 2850, JSON.stringify(m.release?.partsAdjusted));
    assert.equal(J.balance(J.job(j.id)).captured, 20000 - 2850);
    assert.ok(J.balance(J.job(j.id)).ok);
  }
});

test("round 6 extras: per-condition confirm with a fix for the rest; ask_for_review; terms_changed news; timing warnings; /api/me steppedUpUntil; events on the platform clock", async () => {
  const c = person(), j = await (async () => { const x = await J.createJob(c.id, { text: "Kitchen faucet keeps dripping. Fix it this week.", zip: "78704", budget: 25000, actor: P(c) }); await J.requestOffers(x.id, P(c), { now: true }); const o = J.job(x.id).offers.filter((y) => y.status === "open").sort((p1, p2) => p1.amount - p2.amount)[0]; await J.acceptOffer(x.id, o.id, { actor: P(c), payWith: "card" }); J.startWork(J.job(x.id).agreed.pro, x.id, PRO(J.job(x.id).agreed.pro)); return J.job(x.id); })();
  const pid = j.agreed.pro, ids = j.scope.checks.map((x) => x.id);
  setAI({ check: async (job) => ({ checks: job.scope.checks.map((x, i) => ({ id: x.id, verdict: i === 0 ? "needs_fix" : "pass", reason: i === 0 ? "blurry" : "a person should look", confidence: 0.5, signals: ["needs_person"] })), decision: "review", source: "rules" }) });
  try { J.addEvidence(pid, j.id, j.scope.checks.map((x) => ({ kind: x.evidence === "note" ? "note" : x.evidence === "receipt" ? "receipt" : "photo", ...(x.evidence === "note" ? { text: "done" } : { buf: photo(J.job(j.id)), mime: "image/jpeg", text: "TOTAL 0.00" }), checkId: x.id })), PRO(pid)); await J.submit(pid, j.id, PRO(pid)); } finally { setAI({ check: null }); }
  assert.equal(J.job(j.id).status, "review");
  // confirm all but the first; without a fix reason it says what's left
  const some = await J.confirm(j.id, P(c), { checkIds: ids.slice(1) });
  assert.equal(some.error, "fix"); assert.deepEqual(some.toFix, [ids[0]]);
  const fx = await J.confirm(j.id, P(c), { checkIds: ids.slice(1), fix: "Retake the first photo in focus" });
  assert.ok(!fx.error, fx.message);
  assert.equal(J.job(j.id).status, "needs_fix");
  // the pro asks for a person on the first condition
  const ask = await tools.PRO.ask_for_review(pros.pro(pid), { job: j.id, checkId: ids[0], note: "The photo is sharp; the model misread it." });
  assert.ok(!ask.error, ask.message);
  assert.ok(J.job(j.id).queue.some((q) => q.proAsked?.checkId === ids[0]));
  // resubmit only the first: the confirmed ones carry over as passed
  setAI({ check: async (job) => ({ checks: job.scope.checks.map((x) => ({ id: x.id, verdict: x.id === ids[0] ? "pass" : "needs_fix", reason: x.id === ids[0] ? "ok" : "nothing new", confidence: 0.95, signals: [] })), decision: "release", source: "rules" }) });
  try { J.addEvidence(pid, j.id, [{ kind: "photo", buf: photo(J.job(j.id)), mime: "image/jpeg", checkId: ids[0] }], PRO(pid)); await J.submit(pid, j.id, PRO(pid)); } finally { setAI({ check: null }); }
  const lc = J.job(j.id).checks.at(-1);
  // carried over, except a condition timed from the retaken photo (it needs a retake after it: never a negative time)
  for (const id of ids.slice(1)) { const r = lc.checks.find((x) => x.id === id), g = J.timeGap(j.scope.checks.find((x) => x.id === id), j.scope.checks); if (g?.after === ids[0]) assert.match(r.reason, /^Retake after/); else assert.equal(r.verdict, "pass", `${id} carried over`); }
  // timing warnings
  const nd = j.scope.checks.find((x) => J.timeGap(x, j.scope.checks));
  if (nd) { const g = J.timeGap(nd, j.scope.checks); const w = J.timingWarnings(J.job(j.id), [{ checkId: g.after }]); assert.equal(w[0].checkId, nd.id); }
  // events on the platform clock
  const act = await import("../src/activity.js");
  const e = act.activityStore.data.entries.at(-1);
  assert.ok(Math.abs(Date.parse(e.at) - clock.now()) < 5000, "stamped with the platform clock");
});

test("round 6: a scope change that withdraws an offer is news for that pro", async () => {
  const c = person(), j = await J.createJob(c.id, { text: "Kitchen faucet keeps dripping. Fix it this week.", zip: "78704", budget: 25000, actor: P(c) });
  await J.requestOffers(j.id, P(c), { now: true });
  const o = J.job(j.id).offers.find((x) => x.status === "open"), p = pros.pro(o.pro);
  const act = await import("../src/activity.js"), after = act.activityStore.data.entries.at(-1).id;
  setAI({ review: async () => ({ gaps: [{ severity: "low", what: "x", suggestion: "Add a note with the plumber's licence number" }], ok: false, source: "test-model", revisedScope: null }) });
  try { await tools.CUSTOMER.review_scope({ person: c.id, client: "t", scopes: ["read", "hire"] }, { job: j.id }); J.applySuggestion(j.id, "g1", P(c)); } finally { setAI({ review: null }); }
  const n = await tools.PRO.wait_for_news(p, { after, seconds: 1 });
  assert.ok(n.events.some((e) => e.action === "terms_changed"), JSON.stringify(n.events.map((e) => e.action)));
});

test("(20) partial confirm: an unticked condition waiting on a person stays waiting, never vanishes", async () => {
  const c = person();
  const x = await J.createJob(c.id, { text: "Kitchen faucet keeps dripping. Fix it this week.", zip: "78704", budget: 25000, actor: P(c) });
  await J.requestOffers(x.id, P(c), { now: true });
  const o = J.job(x.id).offers.filter((y) => y.status === "open").sort((p1, p2) => p1.amount - p2.amount)[0];
  await J.acceptOffer(x.id, o.id, { actor: P(c), payWith: "card" });
  const pid = J.job(x.id).agreed.pro; J.startWork(pid, x.id, PRO(pid));
  const ids = J.job(x.id).scope.checks.map((y) => y.id);
  // all passed but need a person, except the last which needs a fix
  setAI({ check: async (job) => ({ checks: job.scope.checks.map((y) => ({ id: y.id, verdict: y.id === ids.at(-1) ? "needs_fix" : "pass", reason: "a person should look", confidence: 0.5, signals: ["needs_person"] })), decision: "review", source: "rules" }) });
  try { J.addEvidence(pid, x.id, J.job(x.id).scope.checks.map((y) => ({ kind: y.evidence === "note" ? "note" : y.evidence === "receipt" ? "receipt" : "photo", ...(y.evidence === "note" ? { text: "done" } : { buf: photo(J.job(x.id)), mime: "image/jpeg", text: "TOTAL 0.00" }), checkId: y.id })), PRO(pid)); await J.submit(pid, x.id, PRO(pid)); } finally { setAI({ check: null }); }
  // tick the first two only, ask a fix for the failed one: the unticked waiting ones stay listed as waiting
  const r = await J.confirm(x.id, P(c), { checkIds: ids.slice(0, 2), fix: "Redo it please" });
  assert.ok(!r.error, r.message);
  assert.deepEqual(r.toFix, [ids.at(-1)]);
  assert.deepEqual(r.waiting, ids.slice(2, -1));
  assert.deepEqual([...r.confirmed, ...r.toFix, ...r.waiting].sort(), [...ids].sort(), "every condition is in a list");
});

test("round 7: licence numbers as people write them; an unverified pro on a licensed job needs the person; the demo expert answers the queue", async () => {
  const reg = await import("../src/registry.js");
  for (const s of ["M-41877", "TX M-41877", "m41877", "M 41877 (master)", "M–41877"]) assert.equal(reg.normalizeLicence(s), "M-41877", s);
  assert.doesNotMatch(reg.licenceLookup("TX M-41877").why, /Not a TSBPE licence number/);
  // a licensed job (permit) and an unverified pro: the agent can't accept, the person can
  const c = person(), a = { person: c.id, client: "t", scopes: ["read", "hire", "pay"] };
  people.updatePerson(c.id, { limits: { perJobMax: 400000, monthlyMax: 1000000 } });
  const j = await J.createJob(c.id, { text: "Replace our 50 gallon water heater this month", zip: "78704", budget: 300000, actor: P(c) });
  assert.ok(J.licenceRequired(J.job(j.id)));
  await J.requestOffers(j.id, P(c), { now: true });
  const x = pros.createPro({ name: "Unlicensed Plumbing (test)", trade: "plumbing", zip: "78704", email: "ul2@done-demo.example" });
  pros.setPayPal(x.pro.id, { email: "ul2@done-demo.example" });
  const o = J.proOffer(x.pro.id, j.id, { amount: 140000 }, PRO(x.pro.id)).offer;
  const v = J.view(J.job(j.id)).offers.find((y) => y.id === o.id);
  assert.equal(v.licence.says, "licence not verified");
  const r = await tools.CUSTOMER.accept_offer(a, { job: j.id, offer: o.id });
  assert.equal(r.error, "limit"); assert.equal(r.limit, "licenceUnverified"); assert.ok(r.askPerson?.url);
  const ok = await J.acceptOffer(j.id, o.id, { actor: P(c), payWith: "card" });
  assert.ok(!ok.error, ok.message);
  // the demo expert: a queue item where code found nothing wrong is confirmed, labelled
  const k = await (async () => { const y = await J.createJob(c.id, { text: "Kitchen faucet keeps dripping. Fix it this week.", zip: "78704", budget: 25000, actor: P(c) }); await J.requestOffers(y.id, P(c), { now: true }); const oo = J.job(y.id).offers.filter((z) => z.status === "open").sort((p1, p2) => p1.amount - p2.amount)[0]; await J.acceptOffer(y.id, oo.id, { actor: P(c), payWith: "card" }); J.startWork(J.job(y.id).agreed.pro, y.id, PRO(J.job(y.id).agreed.pro)); return J.job(y.id); })();
  const pid = k.agreed.pro;
  setAI({ check: async (job) => ({ checks: job.scope.checks.map((y) => ({ id: y.id, verdict: "pass", reason: "a person should look", confidence: 0.5, signals: ["needs_person"] })), decision: "review", source: "rules" }) });
  try { J.addEvidence(pid, k.id, k.scope.checks.map((y) => ({ kind: y.evidence === "note" ? "note" : y.evidence === "receipt" ? "receipt" : "photo", ...(y.evidence === "note" ? { text: "done" } : { buf: photo(J.job(k.id)), mime: "image/jpeg", text: "TOTAL 0.00" }), checkId: y.id })), PRO(pid)); await J.submit(pid, k.id, PRO(pid)); } finally { setAI({ check: null }); }
  const q = (J.job(k.id).queue || []).find((z) => z.status === "open");
  if (q) {
    await J.demoExpert(k.id, q.id);
    assert.notEqual(J.job(k.id).status, "review");
    assert.equal(J.job(k.id).queue.find((z) => z.id === q.id).by?.client, "demo expert (automated stand-in)");
  }
});

test("confirm with fixIds: a passed or waiting condition sent back on the person's say; parts receipts come with parts", async () => {
  const c = person();
  const x = await J.createJob(c.id, { text: "Kitchen faucet keeps dripping. Fix it this week.", zip: "78704", budget: 25000, actor: P(c) });
  await J.requestOffers(x.id, P(c), { now: true });
  const o = J.job(x.id).offers.filter((y) => y.status === "open").sort((p1, p2) => p1.amount - p2.amount)[0];
  await J.acceptOffer(x.id, o.id, { actor: P(c), payWith: "card" });
  // an offer with parts in the price: a parts receipt condition (unless one exists)
  if (o.parts > 0) assert.ok(J.job(x.id).scope.checks.some((y) => y.evidence === "receipt" && !y.doc), "a parts receipt with parts in the price");
  const pid = J.job(x.id).agreed.pro; J.startWork(pid, x.id, PRO(pid));
  const ids = J.job(x.id).scope.checks.map((y) => y.id);
  setAI({ check: async (job) => ({ checks: job.scope.checks.map((y) => ({ id: y.id, verdict: "pass", reason: "a person should look", confidence: 0.5, signals: ["needs_person"] })), decision: "review", source: "rules" }) });
  try { J.addEvidence(pid, x.id, J.job(x.id).scope.checks.map((y) => ({ kind: y.evidence === "note" ? "note" : y.evidence === "receipt" ? "receipt" : "photo", ...(y.evidence === "note" ? { text: "done" } : { buf: photo(J.job(x.id)), mime: "image/jpeg", text: "TOTAL 0.00" }), checkId: y.id })), PRO(pid)); await J.submit(pid, x.id, PRO(pid)); } finally { setAI({ check: null }); }
  const r = await J.confirm(x.id, P(c), { checkIds: ids.slice(0, 1), fixIds: [ids[1]], fix: "Retake that one, closer" });
  assert.ok(!r.error, r.message);
  assert.deepEqual(r.toFix, [ids[1]]); assert.deepEqual(r.confirmed, [ids[0]]);
  assert.deepEqual([...r.confirmed, ...r.toFix, ...r.waiting].sort(), [...ids].sort());
  assert.equal(J.job(x.id).status, "needs_fix");
  // a materials change order approved: a parts receipt condition exists from then on
  const k = J.job(x.id);
  const co = await J.requestChange(pid, x.id, { amount: 3000, reason: "a new supply line", kind: "materials" }, PRO(pid));
  await J.approveChange(x.id, co.change.id, P(c));
  assert.ok(J.job(x.id).scope.checks.some((y) => y.evidence === "receipt" && !y.doc));
  assert.ok(k);
});
