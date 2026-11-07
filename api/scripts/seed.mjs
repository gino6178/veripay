// A believable demo month of VeriPay in Austin, made through the real modules (jobs, pros, the rules checker)
// against the PayPal stand-in, so the website and the back office have something to show: about 40 jobs over the
// last 30 days across plumbing (most), cleaning and handyman; counters, change orders, fixes, a review, a dispute
// settled part and part, a cancellation, an expired job, and a few still open today; and (PLAN §15) a tenant's job paid
// by the demo landlord, a tipped job, a moved visit, and an agent that hired with a signed mandate. Every person and pro is fictional (demo: true);
// every job's ledger adds up (checked at the end).
//   npm run seed -- ../data/state            (an empty folder; --append to add to one)
//   then: PAYPAL_MODE=mock npm start         (the stand-in's records are in the same folder: seed for the mock only)
import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2), dirArg = args.find((a) => !a.startsWith("--"));
if (dirArg) process.env.DONE_STATE_DIR = dirArg === "memory" ? "memory" : path.resolve(dirArg);
const DIR = process.env.DONE_STATE_DIR;
if (!DIR) { console.error("Name the state folder: npm run seed -- <folder>   (\"memory\" for a dry run)"); process.exit(1); }
if (DIR !== "memory" && fs.existsSync(path.join(DIR, "jobs.json")) && !args.includes("--append")) { console.error(`${DIR} already has jobs. Seed an empty folder, or pass --append.`); process.exit(1); }
process.env.DONE_AI = "rules";
process.env.DONE_REAL_PHOTOS = "0"; // the real demo photos are kept for live jobs (each is used once per server)
process.env.DONE_DEMO_PRO_DELAY_MS = "0"; // the seed writes history: offers come at once

const { mockPaypal } = await import("../src/pay/mock.js");
const { setPay } = await import("../src/pay/index.js");
const { makePerson, updatePerson } = await import("../src/people.js");
const J = await import("../src/jobs.js");
const pros = await import("../src/pros.js");
const tools = await import("../src/tools.js");
const { clockStore, advanceMs, nowIso, now, DAY } = await import("../src/clock.js");
const { withExif } = await import("../src/evidence.js");
const receipts = await import("../src/proof/receipts.js");
setPay(mockPaypal({ publicUrl: process.env.PUBLIC_URL || "http://localhost:8810" }), process.env.PUBLIC_URL || "http://localhost:8810");

// The month ends at the platform clock's now (which may be ahead of real time if the demo skipped days): start 31 days
// before it and walk forward; every job starts on its day and nothing is dated after "now". The clock is put back.
const END = now(), ORIG = clockStore.data.offsetMs, BASE = END - 31 * DAY;
clockStore.data.offsetMs = BASE - Date.now(); clockStore.save();
const setTo = (t) => { if (t > now()) advanceMs(t - now(), "seed"); };
let seed = 7;
const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
const pick = (a) => a[Math.floor(rnd() * a.length)];
const ASSETS = path.join(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "../demo-assets");
const img = (f) => fs.readFileSync(path.join(ASSETS, f));
const ZIPS = ["78704", "78702", "78703", "78745", "78741", "78751", "78756", "78757", "78723", "78722", "78705", "78749"];
const NAMES = ["Jordan Avery", "Sam Patel", "Riley Chen", "Morgan Diaz", "Casey Brooks", "Avery Johnson", "Taylor Nguyen", "Jamie Rivera", "Drew Thompson", "Alex Kim", "Priya Raman", "Chris Walker"];
const TEXTS = [
  ["Kitchen faucet keeps dripping even when it's off. Fix it this week, $200 max.", 20000, 0.32],
  ["Bathroom faucet drips all night, please fix this week. Budget $220.", 22000, 0.12],
  ["Toilet keeps running after every flush. Fix this week, under $180.", 18000, 0.14],
  ["Bathroom sink drain is clogged and slow. Fix tomorrow, $160 max.", 16000, 0.1],
  ["Small leak from the pipe under the kitchen sink, fix this week, $250.", 25000, 0.08],
  ["Deep clean of a 2-bedroom apartment before move-out, this weekend, $400 max.", 40000, 0.08],
  ["Regular clean for a 1-bedroom, kitchen and bathroom, this week, $200.", 20000, 0.07],
  ["Mount a 55 inch TV on drywall and hide the cables, this week, $200.", 20000, 0.05],
  ["Assemble an IKEA desk and a bookshelf, anchor the shelf, this week, $180.", 18000, 0.04],
];
const pickText = () => { let x = rnd(); for (const t of TEXTS) { if ((x -= t[2]) <= 0) return t; } return TEXTS[0]; };
(await import("../src/people.js")).ensureDemoInspector();
const customers = NAMES.map((n, i) => makePerson({ name: n, zip: ZIPS[i % ZIPS.length], via: "seed" }));
// the seeded customers share one demo PIN (DONE_SEED_PIN, default 2468): testers who act as one of them use it to resume
const { setPin } = await import("../src/auth.js");
for (const c of customers) setPin(c.id, process.env.DONE_SEED_PIN || "2468");
// seeded customers let their agent approve change orders up to $150 on jobs up to $4,000 (a water heater and its extra materials fit)
for (const c of customers) updatePerson(c.id, { limits: { changeMax: 15000, perJobMax: 400000, monthlyMax: 1500000 } });
// the demo inspector's PIN (DONE_INSPECTOR_PIN, default 1357)
{ const { ensureDemoInspector } = await import("../src/people.js"); setPin(ensureDemoInspector().id, process.env.DONE_INSPECTOR_PIN || "1357"); }
customers.forEach((c, i) => updatePerson(c.id, { limits: { perJobMax: pick([40000, 50000, 60000]), monthlyMax: pick([120000, 150000, 200000]), changeMax: pick([5000, 7500, 10000]), agentMayRelease: i % 4 === 0 } }));
const agent = (c) => ({ kind: "agent", person: c.id, client: pick(["Claude (MCP)", "Household assistant (A2A)", "Done demo agent (rules)"]) });
const person_ = (c) => ({ kind: "person", person: c.id });
const proA = (j) => ({ kind: "pro_agent", pro: j.agreed.pro, client: `${j.agreed.proName}'s agent` });
const later = (h) => advanceMs(h * 3600e3, "seed");

function evidenceFor(j, { skip = null, receiptOff = false, oldPhoto = false } = {}) {
  const changes = j.changeOrders.filter((c) => c.status === "approved").reduce((t, c) => t + c.amount, 0);
  const total = changes || j.agreed.parts || 0;
  return j.scope.checks.filter((c) => c.id !== skip).map((c, i) => {
    if (c.evidence === "receipt") { const t = receiptOff ? total * 2 + 1900 : total; return { kind: "receipt", buf: withExif(img("receipt.jpg"), { taken: nowIso(), lat: j.address.lat + rnd() * 0.0004, lng: j.address.lng }), mime: "image/jpeg", checkId: c.id, text: `AUSTIN PLUMBING SUPPLY (demo)\nParts\nTOTAL ${(t / 100).toFixed(2)}` }; }
    if (c.evidence === "note") return { kind: "note", checkId: c.id, text: pick(["Hair and soap clog in the P-trap; cleared and flushed.", "Replaced the flapper; tank refills and stops.", "Done as described, tested, cleaned up."]) };
    const f = ["faucet-installed.jpg", "sink-dry.jpg", "valve-worn.jpg"][i % 3];
    // a visit's photos minutes apart, in the order of the conditions (timed conditions are checked from camera times)
    const nPhotos = j.scope.checks.length, taken = oldPhoto && i === 0 ? new Date(now() - 20 * DAY).toISOString() : new Date(now() - Math.max(0, nPhotos - 1 - i) * 12 * 60e3).toISOString();
    return { kind: "photo", buf: withExif(img(f), { taken, lat: j.address.lat + rnd() * 0.0004, lng: j.address.lng - rnd() * 0.0004 }), mime: "image/jpeg", checkId: c.id };
  });
}
async function deliver(j, opts) { J.addEvidence(j.agreed.pro, j.id, evidenceFor(J.job(j.id), opts), proA(j)); return J.submit(j.agreed.pro, j.id, proA(j)); }

const plan = [];
for (let d = 0; d < 30; d++) { const n = rnd() < 0.35 ? 2 : rnd() < 0.85 ? 1 : 0; for (let k = 0; k < n; k++) plan.push(d); }
const story = { released: 0, fix: 0, review: 0, dispute: 0, cancel: 0, expired: 0, open: 0, change: 0 };
let day = 0;
for (const [i, d] of plan.entries()) {
  if (d > day) { day = d; await J.tick(); }
  setTo(BASE + d * DAY + (8 + rnd() * 8) * 3600e3);
  if (now() > END - 14 * 3600e3) break; // a job needs its day; never past now
  const c = customers[i % customers.length], [text, budget] = pickText(), viaAgent = rnd() < 0.6, actor = viaAgent ? agent(c) : person_(c);
  const j = await J.createJob(c.id, { text, zip: c.zip, budget, actor });
  if (j.error) { console.error(j.message); continue; }
  await J.requestOffers(j.id, actor, { now: true }); // the seed writes history: the demo pros answer at once
  later(0.5);
  const last = d >= 28;
  // a few stay open, one expires unhired
  if (i === 3) { story.expired++; continue; }
  if (last && rnd() < 0.3) { story.open++; continue; }
  const r = viaAgent ? await tools.autoHire(j.id, c.id, { payWith: c.vault ? "saved" : "card" }) : await (async () => { const o = J.job(j.id).offers.filter((x) => x.status === "open").sort((a, b) => a.amount - b.amount)[0]; if (!o) return { error: "no_offers" }; return J.acceptOffer(j.id, o.id, { actor, payWith: c.vault ? "saved" : "card" }); })();
  if (r.error || J.job(j.id).status !== "held") { story.open++; continue; }
  if (i % 17 === 5) { later(3); await J.cancel(j.id, person_(c), "found someone closer"); story.cancel++; continue; }
  later(2 + rnd() * 4);
  J.startWork(J.job(j.id).agreed.pro, j.id, proA(J.job(j.id)));
  later(1);
  if (rnd() < 0.3 && J.job(j.id).scope.trade !== "cleaning") {
    const co = await J.requestChange(J.job(j.id).agreed.pro, j.id, { amount: pick([2500, 3500, 4500, 6500, 9000]), reason: pick(["the shut-off valve is corroded and weeps", "the supply line is cracked", "needed a longer drain extension", "two more wall anchors and a bracket"]) }, proA(J.job(j.id)));
    if (!co.error) { const ok = await J.approveChange(j.id, co.change.id, co.change.agentMayApprove && viaAgent ? actor : person_(c)); if (!ok.error) story.change++; }
  }
  if (last && rnd() < 0.5) { story.open++; continue; } // still working today
  later(1 + rnd() * 2);
  let v;
  if (i % 9 === 2) { v = await deliver(J.job(j.id), { skip: J.job(j.id).scope.checks.at(-1).id }); story.fix++; later(3); v = await deliver(J.job(j.id), {}); }
  else if (i % 13 === 7) { v = await deliver(J.job(j.id), { oldPhoto: true }); story.review++; later(4); if (!last) { await J.requestFix(j.id, "send photos from today", person_(c)); later(6); v = await deliver(J.job(j.id), {}); } }
  else if ((i % 19 === 11 || (story.dispute === 0 && i > 20 && !last)) && J.job(j.id).scope.checks.some((x) => x.evidence === "receipt")) { v = await deliver(J.job(j.id), { receiptOff: true }); later(8); await J.openDispute(j.id, "The receipt doesn't match the parts we agreed on, and the drip came back.", person_(c)); story.dispute++; later(6); const due = J.due(J.job(j.id)); await J.resolve(j.id, { outcome: "partial", release: Math.round(due * 0.7 / 500) * 500, note: "parts not proven; labor done" }); }
  else v = await deliver(J.job(j.id), {});
  if (J.job(j.id).status === "released") story.released++;
}
// ---- PLAN §15 stories, on the last day: a landlord/tenant job, a tipped job, a scheduled visit, a mandate-backed agent
// job. All through the real modules on the stand-in; labelled like the rest (demo people, demo pros).
const s15 = { landlord: null, tipped: null, scheduled: null, mandate: null };
{
  setTo(END - 9 * 3600e3);
  const finish = async (id, who) => {
    const j = J.job(id);
    J.startWork(j.agreed.pro, id, proA(j)); later(0.5);
    await deliver(J.job(id), {}); later(0.25);
    const k = J.job(id);
    if (k.status === "review") await J.release(id, person_(who), { acknowledgeFailed: J.notPassed(k, k.milestones[0]).map((x) => x.id) });
    return J.job(id);
  };
  const cheapest = (id) => J.job(id).offers.filter((o) => o.status === "open" && o.amount <= (J.job(id).scope.priceCeiling || Infinity)).sort((a, b) => a.amount - b.amount)[0];
  // 1. a tenant posts a leak for the demo landlord; the demo landlord's agent hires the tenant's pick on the landlord's card
  const P = await import("../src/people.js"), landlord = P.ensureDemoLandlord();
  setPin(landlord.id, process.env.DONE_DEMO_LANDLORD_PIN || "9753");
  updatePerson(landlord.id, { limits: { perJobMax: 400000, monthlyMax: 1500000, changeMax: 15000 } });
  const tenant = makePerson({ name: "Robin Hale", zip: "78704", via: "seed" });
  setPin(tenant.id, process.env.DONE_SEED_PIN || "2468");
  P.linkTenant(tenant.id, landlord.id, { unit: "Apt 3C, 1400 S Congress" });
  const tj = await J.createJob(landlord.id, { text: "Small leak from the pipe under the kitchen sink, the cabinet floor is wet. Fix it this week, $450 max.", zip: "78704", budget: 45000, actor: person_(tenant), tenant: tenant.id });
  if (tj.error) console.error("s15 landlord", tj.message);
  if (!tj.error) {
    J.tenantNote(tj.id, "It started Sunday night; I put a bowl under it and shut the valve under the sink.", person_(tenant));
    await J.requestOffers(tj.id, person_(tenant), { now: true }); later(0.3);
    const pickO = cheapest(tj.id); if (!pickO) console.error("s15 landlord offers", J.job(tj.id).status, J.job(tj.id).offers.map((o) => o.status + o.amount), J.job(tj.id).thread.filter((m) => m.type === "pass").map((m) => m.text));
    if (pickO) {
      J.tenantPick(tj.id, pickO.id, person_(tenant));
      const r = await J.acceptOffer(tj.id, pickO.id, { actor: { kind: "agent", person: landlord.id, client: "Demo landlord's agent (Riverside Property Management, demo)" }, payWith: landlord.vault ? "saved" : "card" });
      if (r.error) console.error("s15 landlord accept", r.message);
      if (!r.error) { later(1); const f = await finish(tj.id, landlord); s15.landlord = `${f.number} ${f.status}`; }
    }
  }
  // 2. a paid job, then a tip: its own order, 100% to the pro
  later(0.5);
  const tc = customers[1], tjob = await J.createJob(tc.id, { text: "Bathroom faucet drips all night, please fix this week. Budget $400.", zip: tc.zip, budget: 40000, actor: person_(tc) });
  if (!tjob.error) {
    await J.requestOffers(tjob.id, person_(tc), { now: true });
    const o = cheapest(tjob.id);
    if (o && !(await J.acceptOffer(tjob.id, o.id, { actor: person_(tc), payWith: tc.vault ? "saved" : "card" })).error) {
      later(0.5); const f = await finish(tjob.id, tc); later(0.25);
      if (["released", "resolved"].includes(f.status)) { const t = await J.tip(tjob.id, { amount: 2500, payWith: tc.vault ? "saved" : "card" }, person_(tc)); s15.tipped = `${f.number} tip ${t.error ? t.message : t.tip.status}`; }
    }
  }
  // 3. a visit booked on a later slot, then moved by the customer to two days out (the demo pro's agent accepts)
  later(0.25);
  const sc = customers[2], sjob = await J.createJob(sc.id, { text: "Toilet keeps running after every flush. Fix within two weeks, under $400.", zip: sc.zip, budget: 40000, actor: person_(sc) });
  if (!sjob.error) {
    await J.requestOffers(sjob.id, person_(sc), { now: true });
    const o = cheapest(sjob.id);
    if (o) {
      const r = await J.acceptOffer(sjob.id, o.id, { actor: person_(sc), payWith: sc.vault ? "saved" : "card", slot: o.slots?.length > 1 ? 1 : 0 });
      if (!r.error) {
        const C = await import("../src/calendar.js"), av = C.availabilityOf((await import("../src/pros.js")).pro(J.job(sjob.id).agreed.pro));
        const next = C.freeSlots(av, { earliest: now() + 2 * DAY, minutes: C.visitMinutes(pros.pro(J.job(sjob.id).agreed.pro), J.job(sjob.id)), count: 1 })[0];
        if (next) J.reschedule(sjob.id, { from: next.from, reason: "we're away until the weekend" }, person_(sc));
        s15.scheduled = `${J.job(sjob.id).number} ${J.job(sjob.id).status}, visit ${J.job(sjob.id).agreed.arrival}`;
      }
    }
  }
  // 4. an agent that may only hire with a signed mandate: issued on the website (the demo path), then used once
  later(0.25);
  const mc = customers[3];
  updatePerson(mc.id, { limits: { requireMandate: true } });
  const auth_ = await import("../src/auth.js"), M = await import("../src/proof/mandates.js");
  const tok = auth_.makeToken(mc.id, "Household assistant (mandate-only)", { requireMandate: true });
  const ag = { person: mc.id, client: "Household assistant (mandate-only)", token: tok.id, scopes: ["read", "hire", "pay"], requireMandate: true };
  const mj = await tools.CUSTOMER.post_job(ag, { text: "Bathroom sink drain is clogged and slow. Fix it this week, $400 max.", zip: mc.zip, budget: 400 });
  if (!mj.error) {
    const o = cheapest(mj.id);
    if (o) {
      const iss = M.issueForPerson(mc.id, { agentClient: tok.id, maxAmount: o.amount / 100, scope: ["hold"], jobId: mj.id, minutes: 60 });
      const r = await tools.CUSTOMER.accept_offer(ag, { job: mj.id, offer: o.id, payWith: mc.vault ? "saved" : "card", mandate: iss.mandate });
      if (!r.error) { later(0.5); const f = await finish(mj.id, mc); s15.mandate = `${f.number} ${f.status}, mandate ${r.mandate?.id}`; }
      else s15.mandate = `refused: ${r.message}`;
    }
  }
}
// ---- PLAN §16: a home with a water heater due a flush, and an open neighborhood group (two households, drains, 78704)
const s16 = { home: null, group: null };
{
  later(0.1);
  const H = await import("../src/home.js"), G = await import("../src/groups.js");
  const hc = customers[4];
  H.addAppliance(hc.id, { kind: "water_heater", label: "Water heater (50 gal)", brand: "Rheem", capacityGal: 50, installed: new Date(now() - 400 * DAY).toISOString().slice(0, 10), notes: "added by the household" });
  s16.home = `${hc.name}: ${H.suggestionsFor(hc.id).map((s) => s.kind).join(", ")}`;
  const g1 = customers.find((c) => c.zip === "78704") || customers[0], g2 = customers.find((c) => c.zip === "78704" && c !== g1) || customers[5];
  const gj = await J.createJob(g1.id, { text: "Bathroom sink drain is clogged and slow. Fix it this week, $300 max.", zip: "78704", budget: 30000, actor: person_(g1) });
  if (!gj.error) {
    const g = G.openGroup(gj.id, person_(g1), { title: "Clogged drains, 78704" });
    const r = g.group ? await G.joinGroup(g.group.id, person_(g2), { text: "Kitchen sink drain is clogged and slow. Fix this week, $300 max.", budget: 30000 }) : g;
    s16.group = r.error ? `failed: ${r.message}` : `${g.group.id}: ${G.group(g.group.id).members.length} households, ${G.group(g.group.id).discountPct}% off, pro ${G.group(g.group.id).pro}`;
  }
}
await J.tick();
// the clock back where it was: the seeded month ends at its "now"
clockStore.data.offsetMs = ORIG; clockStore.data.log.push({ at: new Date().toISOString(), why: "seed: a month ending now" }); clockStore.save();
// the expert queue: the demo expert has handled the old items (confirmed where every condition passed, else left to the
// customer with a note); at most one recent item stays open for the tour
{
  const open = J.queue(), keep = open.filter((q) => Date.parse(q.slaDue) > now() - 24 * 3600e3).at(-1);
  for (const q of open) {
    if (q === keep) continue;
    const j = J.job(q.job), m = j.milestones.find((x) => x.id === q.milestone) || j.milestones[0];
    const r = !J.notPassed(j, m).length ? await J.expertDecide(q.job, q.id, { decision: "confirm" }) : null;
    if (!r || r.error) await J.expertDecide(q.job, q.id, { decision: "customer", note: "The demo expert reviewer looked: some conditions didn't pass, so the customer decides." });
  }
}
const future = J.allJobs().filter((j) => Date.parse(j.updated) > now() + 60e3);
if (future.length) { console.error(`${future.length} jobs are dated after now: ${future.map((j) => j.number).join(", ")}`); process.exit(1); }
await receipts.batch();

const all = J.allJobs(), bad = all.filter((j) => j.money.ledger.length && !J.balance(j).ok);
const sum = (f) => all.reduce((t, j) => t + f(j), 0), usd = (c) => `$${(c / 100).toFixed(2)}`;
const by = all.reduce((m, j) => ({ ...m, [j.status]: (m[j.status] || 0) + 1 }), {});
console.log(`Seeded ${all.length} jobs for ${customers.length} demo customers in ${DIR}`);
console.log("by status:", JSON.stringify(by));
console.log(`dated ${all.map((j) => j.created).sort()[0].slice(0, 10)} to ${all.map((j) => j.updated).sort().at(-1).slice(0, 16)}; clock now ${nowIso().slice(0, 16)}`);
console.log("story:", JSON.stringify(story));
console.log(`expert queue open: ${J.queue().length}`);
console.log("plan 15:", JSON.stringify(s15));
console.log("plan 16:", JSON.stringify(s16));
console.log(`captured ${usd(sum((j) => J.balance(j).captured))}, paid to pros ${usd(sum((j) => J.balance(j).pro + J.balance(j).helper))}, platform fees ${usd(sum((j) => J.balance(j).fee))}, refunded ${usd(sum((j) => J.balance(j).refunded))}`);
console.log(bad.length ? `UNBALANCED: ${bad.map((j) => j.number).join(", ")}` : "every job's ledger adds up to the cent");
if (bad.length) process.exit(1);
