// PLAN §15 items 2 (AP2-style signed mandates), 7 (scheduling), 5 (Spanish for pros) and 6 (the insurance claim
// package): in process, against the stand-in.
import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { J, person, P, PRO, pros, people, tools, held, offered, deliver, faucetEvidence, clock } from "./helpers.js";
const auth = await import("../src/auth.js");
const M = await import("../src/proof/mandates.js");
const R = await import("../src/reports.js");
const C = await import("../src/calendar.js");
const i18n = await import("../src/i18n.js");
const { canonical } = await import("../src/proof/merkle.js");

const BIG = { text: "Kitchen faucet keeps dripping. Fix it this week, $400 max.", budget: 40000 };
const agentFor = (p, opts = {}) => { const t = auth.makeToken(p.id, "mandate agent", opts); const tok = auth.tokensStore.data.tokens.find((x) => x.id === t.id); return { person: p.id, client: "mandate agent", token: t.id, scopes: ["read", "hire", "pay"], requireMandate: !!tok.requireMandate }; };
const keypair = () => { const { privateKey, publicKey } = crypto.generateKeyPairSync("ed25519"); return { priv: privateKey, x: publicKey.export({ format: "jwk" }).x }; };
const sign = (payload, priv) => ({ payload, signature: crypto.sign(null, Buffer.from(canonical(payload)), priv).toString("base64url") });

test("mandates: required, an agent's accept_offer needs one; the person's own key signs it; limits, scope, job, expiry and one use are checked; it's in a receipt", async () => {
  const c = person();
  people.updatePerson(c.id, { limits: { requireMandate: true } });
  const a = agentFor(c), j = await offered(c, BIG), o = j.offers.filter((x) => x.status === "open").sort((x, y) => x.amount - y.amount)[0];
  const none = await tools.CUSTOMER.accept_offer(a, { job: j.id, offer: o.id, payWith: "card" });
  assert.equal(none.error, "mandate"); assert.equal(none.reason, "missing");
  const k = keypair();
  assert.ok(!M.addKey(c.id, { x: k.x, label: "phone" }).error);
  const tpl = await tools.CUSTOMER.mandate_template(a, { action: "accept_offer", maxAmount: 1, job: j.id });
  assert.equal(tpl.payload.agentClient, a.token); assert.equal(tpl.sign, canonical(tpl.payload));
  const small = sign(tpl.payload, k.priv);
  const r1 = await tools.CUSTOMER.accept_offer(a, { job: j.id, offer: o.id, payWith: "card", mandate: small });
  assert.equal(r1.reason, "amount");
  const wrongScope = sign(M.template({ payer: c.id, agentClient: a.token, maxAmount: 500, scope: ["release"], jobId: j.id }), k.priv);
  assert.equal((await tools.CUSTOMER.accept_offer(a, { job: j.id, offer: o.id, payWith: "card", mandate: wrongScope })).reason, "scope");
  const otherJob = sign(M.template({ payer: c.id, agentClient: a.token, maxAmount: 500, scope: ["hold"], jobId: "job_other" }), k.priv);
  assert.equal((await tools.CUSTOMER.accept_offer(a, { job: j.id, offer: o.id, payWith: "card", mandate: otherJob })).reason, "job");
  const forged = sign(M.template({ payer: c.id, agentClient: a.token, maxAmount: 500, scope: ["hold"], jobId: j.id }), keypair().priv);
  assert.equal((await tools.CUSTOMER.accept_offer(a, { job: j.id, offer: o.id, payWith: "card", mandate: forged })).reason, "signature");
  const expired = M.template({ payer: c.id, agentClient: a.token, maxAmount: 500, scope: ["hold"], jobId: j.id }); expired.expires = new Date(Date.now() - 1000).toISOString();
  assert.equal((await tools.CUSTOMER.accept_offer(a, { job: j.id, offer: o.id, payWith: "card", mandate: sign(expired, k.priv) })).reason, "expired");
  const otherAgent = sign(M.template({ payer: c.id, agentClient: "tok_someone", maxAmount: 500, scope: ["hold"], jobId: j.id }), k.priv);
  assert.equal((await tools.CUSTOMER.accept_offer(a, { job: j.id, offer: o.id, payWith: "card", mandate: otherAgent })).reason, "agent");
  const good = sign(M.template({ payer: c.id, agentClient: a.token, maxAmount: 500, scope: ["hold", "approve_change"], jobId: j.id }), k.priv);
  const r = await tools.CUSTOMER.accept_offer(a, { job: j.id, offer: o.id, payWith: "card", mandate: good });
  assert.ok(!r.error, r.message); assert.equal(r.status, "held");
  assert.equal(r.mandate.used, true); assert.match(r.mandate.signedBy, /own key/); assert.ok(r.mandate.receipt);
  assert.equal(J.job(j.id).mandates[0].action, "accept_offer");
  // one use: the same mandate again is a replay
  const co = await J.requestChange(J.job(j.id).agreed.pro, j.id, { amount: 2000, reason: "a corroded supply line" }, PRO(J.job(j.id).agreed.pro));
  const again = await tools.CUSTOMER.approve_change(a, { job: j.id, change: co.change.id, mandate: good });
  assert.equal(again.reason, "replay");
  const rec = M.mandatesOf(c.id);
  assert.ok(rec.some((x) => x.status === "used" && x.receipt) && rec.some((x) => x.status === "refused"));
});

test("mandates: the demo path issues one signed by the server's per-person key; a mandate-only token needs one even when the person didn't turn it on; a failed action gives the nonce back", async () => {
  const c = person(), a = agentFor(c, { requireMandate: true }), j = await offered(c, BIG), o = j.offers.filter((x) => x.status === "open").sort((x, y) => x.amount - y.amount)[0];
  assert.equal((await tools.CUSTOMER.accept_offer(a, { job: j.id, offer: o.id, payWith: "card" })).reason, "missing");
  const iss = M.issueForPerson(c.id, { agentClient: a.token, maxAmount: 1000, scope: ["accept_offer"], jobId: j.id, minutes: 30 });
  assert.equal(iss.signedBy, "server-held demo key"); assert.match(iss.label, /PIN step-up/);
  // an offer that doesn't exist: the action fails, the mandate stays usable
  const bad = await tools.CUSTOMER.accept_offer(a, { job: j.id, offer: "ofr_nope", payWith: "card", mandate: iss.mandate });
  assert.ok(bad.error);
  const r = await tools.CUSTOMER.accept_offer(a, { job: j.id, offer: o.id, payWith: "card", mandate: iss.mandate });
  assert.ok(!r.error, r.message); assert.equal(r.mandate.signedBy, "server-held demo key");
  // without the requirement, an agent without a mandate works as before
  const c2 = person(), a2 = agentFor(c2), j2 = await offered(c2, BIG);
  assert.ok(!(await tools.CUSTOMER.accept_offer(a2, { job: j2.id, offer: j2.offers.filter((x) => x.status === "open")[0].id, payWith: "card" })).error);
});

test("scheduling: hours and blocked dates; demo offers propose slots; the customer accepts one; moves with notice apply, short notice is a proposal", async () => {
  const av = C.cleanAvailability({ weekly: { mon: [["08:00", "12:00"]], tue: [["08:00", "12:00"]], wed: [["08:00", "12:00"]], thu: [["08:00", "12:00"]], fri: [["08:00", "12:00"]] }, blocked: [], visitMinutes: 120 });
  assert.ok(!av.error);
  assert.equal(C.cleanAvailability({ weekly: { mon: [["12:00", "08:00"]] } }).error, "weekly");
  assert.equal(C.cleanAvailability({ blocked: ["tomorrow"] }).error, "blocked");
  const slots = C.freeSlots(av, { minutes: 120, count: 3 });
  assert.equal(slots.length, 3);
  for (const s of slots) { const l = C.local(Date.parse(s.from)); assert.ok(l.minute >= 480 && l.minute + 120 <= 720, `${s.from} inside 8-12 Austin`); assert.ok(!["sat", "sun"].includes(l.day)); }
  const blockedDay = C.local(Date.parse(slots[0].from)).date;
  assert.ok(C.freeSlots({ ...av, blocked: [blockedDay] }, { minutes: 120, count: 1 })[0].from.slice(0, 10) !== slots[0].from.slice(0, 10) || C.local(Date.parse(C.freeSlots({ ...av, blocked: [blockedDay] }, { minutes: 120, count: 1 })[0].from)).date !== blockedDay);

  const c = person(), j = await offered(c, { text: "Kitchen faucet keeps dripping. Fix it within two weeks, $250 max." });
  const o = j.offers.filter((x) => x.status === "open").sort((a, b) => a.amount - b.amount)[0];
  assert.ok(o.slot && o.slots.length >= 1, "a demo offer proposes slots");
  assert.equal(o.arrival, o.slot.from, "arrival is the slot");
  const pick = o.slots.length > 1 ? 1 : 0;
  assert.equal((await J.acceptOffer(j.id, o.id, { actor: P(c), payWith: "card", slot: 7 })).error, "slot");
  const r = await J.acceptOffer(j.id, o.id, { actor: P(c), payWith: "card", slot: pick });
  assert.ok(!r.error, r.message);
  let k = J.job(j.id);
  assert.equal(k.agreed.slot.from, o.slots[pick].from); assert.equal(k.agreed.arrival, o.slots[pick].from); assert.equal(k.visit.history[0].event, "booked");
  // the pro sets hours; a move to a time outside them is refused with the next open slots
  const pid = k.agreed.pro;
  pros.setAvailability(pid, C.cleanAvailability({ weekly: Object.fromEntries(C.DAYS.map((d) => [d, [["00:00", "24:00"]]])), visitMinutes: 60 }));
  const far = `${new Date(Date.now() + 3 * 864e5).toISOString().slice(0, 10)}T18:00:00.000Z`; // noon in Austin, so a 60-minute visit never runs past midnight
  assert.equal(J.reschedule(j.id, { from: far, reason: "x" }, P(c)).error, "reason");
  // the booked slot is soon (a demo on-call visit in minutes): less than 24 h notice, so it's a proposal; the demo pro's agent answers
  const s1 = J.reschedule(j.id, { from: far, reason: "we're away until Friday" }, P(c));
  assert.ok(!s1.error, s1.message);
  k = J.job(j.id);
  if (Date.parse(o.slots[pick].from) - Date.now() < C.NOTICE_HOURS * 3600e3) { assert.ok(s1.proposal); assert.equal(s1.answeredBy, "the demo pro's agent (inside their hours)"); }
  assert.equal(Date.parse(k.agreed.arrival), Date.parse(far), "moved: arrival follows the slot");
  // now 3 days' notice: the pro moves it at once
  const later = `${new Date(Date.now() + 4 * 864e5).toISOString().slice(0, 10)}T18:00:00.000Z`;
  const s2 = J.reschedule(j.id, { from: later, reason: "a part arrives Thursday" }, PRO(pid));
  assert.ok(s2.rescheduled, JSON.stringify(s2).slice(0, 200));
  assert.equal(Date.parse(J.job(j.id).agreed.arrival), Date.parse(later));
  // with the pro's hours narrowed, a time outside them is refused
  pros.setAvailability(pid, C.cleanAvailability({ weekly: { mon: [["09:00", "10:00"]] }, visitMinutes: 60 }));
  const bad = J.reschedule(j.id, { from: new Date(Date.now() + 5 * 864e5).toISOString(), reason: "another day" }, PRO(pid));
  assert.equal(bad.error, "slot");
  pros.setAvailability(pid, null);
});

test("scheduling: a pro's own agent offers a slot inside their hours; outside them is refused", async () => {
  const c = person(), j = await offered(c, { text: "Kitchen faucet keeps dripping. Fix it within two weeks, $250 max." });
  const p = pros.createPro({ name: "Slot Test Plumbing", trade: "plumbing", zip: "78704", email: "slot@example.com" }).pro;
  pros.setPayPal(p.id, { email: "slot@example.com" });
  pros.setAvailability(p.id, C.cleanAvailability({ weekly: { tue: [["09:00", "17:00"]], thu: [["09:00", "17:00"]] }, visitMinutes: 90 }));
  const open = C.freeSlots(pros.pro(p.id).availability, { winFrom: j.scope.window.from, winTo: j.scope.window.to, minutes: 90, count: 1 })[0];
  if (!open) return; // the window has no Tue/Thu (never with two weeks)
  const r = J.proOffer(p.id, j.id, { amount: 19000, slots: [open.from] }, PRO(p.id));
  assert.ok(!r.error, r.message); assert.equal(r.offer.slot.from, open.from);
  const bad = J.proOffer(p.id, j.id, { amount: 18000, slots: [new Date(Date.parse(open.from) + 864e5 * 0 + 10 * 3600e3).toISOString()] }, PRO(p.id));
  assert.equal(bad.error, "slot");
});

test("Spanish for pros: errors, next, readiness and news; the customer side stays English", async () => {
  const c = person(), j = await held(c), pid = j.agreed.pro;
  pros.setProSettings(pid, { lang: "es" });
  try {
    const p = pros.pro(pid);
    assert.equal(pros.setProSettings(pid, { lang: "fr" }).error, "lang");
    const v = i18n.proAnswerIn("es", J.job(j.id), J.view(J.job(j.id), { as: "pro", pro: pid }));
    assert.equal(v.lang, "es"); assert.match(v.next, /fotos de antes/); assert.ok(v.nextEn);
    const e = i18n.errorIn("es", { error: "state", message: "Job DP-1 is held." });
    assert.match(e.message, /estado/); assert.equal(e.messageEn, "Job DP-1 is held.");
    const rd = i18n.readinessIn("es", { blockers: [{ id: "paypal", say: "Verify" }], recommended: [] });
    assert.match(rd.blockers[0].say, /PayPal/); assert.equal(rd.blockers[0].sayEn, "Verify");
    const n = i18n.newsIn("es", { action: "money_released", summary: "DP-1: paid" }, "DP-1");
    assert.equal(n.title, "Pago liberado"); assert.match(n.summary, /DP-1/);
    assert.equal(i18n.newsIn("es", { action: "unknown_thing", summary: "x" }).untranslated, true, "never guessed");
    // the pro's inbox in Spanish, the customer's in English
    J.startWork(pid, j.id, PRO(pid));
    const ib = (await import("../src/inbox.js")).inboxOf(p.person || "none");
    if (p.person) assert.ok(ib.items.some((x) => x.lang === "es"));
    const cv = J.view(J.job(j.id));
    assert.ok(!cv.lang && /The pro/.test(cv.next), "the customer stays English");
  } finally { pros.setProSettings(pid, { lang: "en" }); }
});

test("the insurance claim package: a leak job's damage photos, cause, work, receipts, timeline and PayPal ids; not a claim filing; other jobs aren't eligible", async () => {
  const c = person(), j = await held(c, { text: "Pipe under the kitchen sink is leaking, water damage on the cabinet floor. Fix it this week, $400 max.", budget: 40000 });
  J.addReference(j.id, [{ dataUrl: `data:image/jpeg;base64,${(await import("../src/evidence.js")).TINY_JPEG.toString("base64")}`, label: "the wet cabinet" }], P(c));
  J.startWork(j.agreed.pro, j.id, PRO(j.agreed.pro));
  await deliver(J.job(j.id), faucetEvidence(J.job(j.id)));
  let k = J.job(j.id);
  if (k.status === "review") { await J.release(j.id, P(c), { acknowledgeFailed: J.notPassed(k, k.milestones[0]).map((x) => x.id) }); k = J.job(j.id); }
  const d = R.insuranceClaim(k);
  assert.ok(!d.error, d.message);
  assert.equal(d.data.notAFiling, true); assert.match(d.data.label, /not an insurance claim filing/);
  assert.ok(d.data.damagePhotos.length >= 1 && d.data.damagePhotos[0].phase === "reference");
  assert.ok(d.data.cause.notes.some((n) => /leaking/.test(n.text)));
  assert.ok(d.data.workDone.conditions.length >= 1);
  assert.ok(d.data.receipts.length >= 1);
  assert.ok(d.data.payments.some((p) => p.kind === "capture" && p.paypal));
  assert.equal(d.data.paypalIds.authorization, k.hold.authorization);
  assert.match(d.html, /not an insurance claim filing/);
  const pdf = d.pdf();
  assert.equal(pdf.slice(0, 5).toString(), "%PDF-"); assert.match(pdf.toString("latin1"), /insurance claim package/);
  const other = await held(person(), { text: "Deep clean our 2 bedroom apartment this week, $600 max.", budget: 60000 });
  assert.equal(R.insuranceClaim(J.job(other.id)).error, "not_eligible");
});
