// PLAN §17: "Your agent", the one conversation. A fresh customer's thread; a free-text post; the proactive offers message
// and the hire from it; a change order whose approval needs the PIN through /act; the judges' tour as messages; and
// idempotency (the same events again, as after a restart, make no new messages).
import test, { after } from "node:test";
import assert from "node:assert/strict";
import { J, PRO, faucetEvidence, photo } from "./helpers.js";
process.env.DONE_NO_LISTEN = "1";
const { app } = await import("../src/server.js");
const A = await import("../src/assistant.js");
const auth = await import("../src/auth.js");
const { activityStore } = await import("../src/activity.js");
const srv = app.listen(0);
after(() => srv.close());
const base = `http://127.0.0.1:${srv.address().port}`;
function client() {
  let ck = "";
  const call = async (method, p, body) => { const r = await fetch(base + p, { method, headers: { "content-type": "application/json", cookie: ck }, body: body == null ? undefined : JSON.stringify(body) }); const sc = r.headers.get("set-cookie"); if (sc) ck = sc.split(";")[0]; const t = await r.text(); let j; try { j = JSON.parse(t); } catch { j = t; } return { s: r.status, j }; };
  call.sid = () => ck.split("=")[1];
  return call;
}
const short = (m) => m.text.split(/(?<=[.?!])\s+/).filter(Boolean).length <= 2 && m.text.length <= 240;
// a described problem is asked about first (photo, room, service), then posted on "Post it": this answers each question
// with its first button (no photo, the first room, the first service) and returns every message on the way
async function postJob(c, text, { photos } = {}) {
  const r = await c("POST", "/api/assistant/message", { text, ...(photos ? { photos } : {}) });
  if (r.s !== 200) return r;
  const all = [...r.j.messages];
  for (let i = 0; i < 6 && !all.some((m) => m.card?.kind === "work_order"); i++) {
    const q = [...all].reverse().find((m) => m.from === "agent" && m.actions?.length);
    if (!q) break;
    const a = q.actions.find((x) => x.label === "Post it") || q.actions.find((x) => x.label === "No photo" || x.label === "Use it anyway") || q.actions.find((x) => !x.href && x.label !== "Cancel" && x.label !== "Somewhere else");
    const x = await c("POST", "/api/assistant/act", { action: a.id });
    if (x.s !== 200) return x;
    all.push(...x.j.messages);
  }
  return { s: 200, j: { messages: all } };
}

test("a fresh customer: a hello with suggested replies; a free-text request posts the job, and the offers arrive as a question with a Hire button", async () => {
  const c = client();
  const me = await c("POST", "/api/auth/demo", { as: "customer", pin: "1234" });
  const t = await c("GET", "/api/assistant/thread");
  assert.equal(t.s, 200); assert.equal(t.j.messages.length, 1);
  const hello = t.j.messages[0];
  assert.equal(hello.card.kind, "hello"); assert.ok(hello.actions.length >= 1 && hello.actions.every((a) => a.label.split(" ").length <= 3));
  assert.ok((await c("GET", "/api/assistant/thread")).j.messages.length === 1, "the hello is said once");
  const r = await postJob(c, "My kitchen faucet drips, fix it this week under $200");
  assert.equal(r.s, 200, JSON.stringify(r.j).slice(0, 300));
  const kinds = r.j.messages.map((m) => m.card?.kind);
  assert.equal(r.j.messages[0].from, "you"); assert.equal(r.j.messages[0].intent.intent, "post_job");
  assert.ok(kinds.includes("work_order"), JSON.stringify(kinds));
  // the agent negotiates with the best pro's agent (A2A) right after the offers come in, then asks for one confirmation
  await new Promise((ok) => setTimeout(ok, 30));
  const offers = (await c("GET", "/api/assistant/thread")).j.messages.find((m) => m.card?.kind === "offers");
  assert.ok(offers, "the offers came in and the agent asked");
  assert.match(offers.text, /^I negotiated: .+'s agent (agreed to|came down to|kept) \$/);
  assert.ok(r.j.messages.filter((m) => m.from === "agent").every(short), "two short sentences at most");
  assert.ok(offers.card.data.offers.every((o) => Number.isInteger(o.amount) && o.pro?.initials));
  const job = J.job(offers.job.id);
  assert.equal(job.budget, 20000); assert.equal(job.customer, me.j.person.id);
  // hire from the button: the built-in agent, within the limits
  const hire = offers.actions.find((a) => /^Confirm \$/.test(a.label));
  assert.ok(hire && !hire.needsPin, JSON.stringify(offers.actions));
  assert.ok(J.job(offers.job.id).offers.some((o) => o.counter && /Your agent/.test(o.counter.by?.client || "")), "the counter was the agent's");
  const h = await c("POST", "/api/assistant/act", { action: hire.id });
  assert.equal(h.s, 200, JSON.stringify(h.j).slice(0, 300));
  assert.equal(J.job(job.id).status, "held");
  assert.match(J.job(job.id).agreed.by.client, /Your agent/);
  const held = h.j.messages.find((m) => m.card?.kind === "hold");
  assert.ok(held && held.card.data.money.held > 0 && held.card.data.rail.current === "held");
  assert.equal((await c("POST", "/api/assistant/act", { action: hire.id })).s, 409, "an action is done once");
  // what's happening
  const st = await c("POST", "/api/assistant/message", { text: "What's happening?" });
  assert.ok(st.j.messages.some((m) => m.card?.kind === "job_summary"));

  // an extra cost within the limit: the agent negotiates it with the pro's agent (A2A) and approves it itself
  const pid = J.job(job.id).agreed.pro;
  J.startWork(pid, job.id, PRO(pid));
  const co = await J.requestChange(pid, job.id, { amount: 3000, reason: "the supply line is cracked" }, PRO(pid));
  assert.ok(!co.error, co.message);
  await new Promise((ok) => setTimeout(ok, 50));
  const c0 = J.job(job.id).changeOrders[0];
  assert.equal(c0.ask, 3000); assert.ok(c0.counter && c0.amount < 3000, JSON.stringify(c0));
  assert.equal(c0.status, "approved"); assert.equal(c0.decided.by.kind, "agent");
  const th0 = await c("GET", "/api/assistant/thread");
  assert.ok(th0.j.messages.some((m) => m.card?.kind === "change_order" && /agreed to|came down to|kept/.test(m.text)), JSON.stringify(th0.j.messages.slice(-4).map((m) => m.text)));
  const flow = th0.j.messages.find((m) => m.card?.kind === "flow");
  assert.ok(flow.card.data.nodes.some((n) => n.key === `change:${c0.id}` && /negotiated/.test(n.detail)), JSON.stringify(flow.card.data.nodes));
  // over the agent's limit: negotiated, then the person confirms with the PIN
  const co2 = await J.requestChange(pid, job.id, { amount: 12000, reason: "the shut-off valve is seized" }, PRO(pid));
  assert.ok(!co2.error, co2.message);
  await new Promise((ok) => setTimeout(ok, 50));
  const th = await c("GET", "/api/assistant/thread");
  const cm = th.j.messages.findLast((m) => m.card?.kind === "change_order" && m.actions?.length);
  assert.ok(cm && cm.card.data.amount < 12000, JSON.stringify(th.j.messages.slice(-3).map((m) => m.text)));
  const approve = cm.actions.find((a) => /^Confirm \+/.test(a.label));
  assert.equal(approve.needsPin, true);
  auth.ageSession(c.sid(), auth.STEP_UP_MS + 1000); // the sign-in's step-up has run out
  const no = await c("POST", "/api/assistant/act", { action: approve.id });
  assert.equal(no.s, 403); assert.equal(no.j.error, "step_up");
  assert.equal(J.job(job.id).changeOrders[1].status, "pending", "nothing moved");
  assert.equal((await c("POST", "/api/auth/step-up", { pin: "1234" })).s, 200);
  const yes = await c("POST", "/api/assistant/act", { action: approve.id });
  assert.equal(yes.s, 200, JSON.stringify(yes.j).slice(0, 300));
  assert.equal(J.job(job.id).changeOrders[1].status, "approved");
  assert.equal(J.job(job.id).changeOrders[1].decided.by.kind, "person", "the person confirmed, not the agent");

  // evidence and checks arrive as a card with photos, then paid
  const k = J.job(job.id), items = faucetEvidence(k);
  J.addEvidence(pid, job.id, items, PRO(pid)); await J.submit(pid, job.id, PRO(pid));
  const th2 = await c("GET", `/api/assistant/thread?after=${th.j.seq}`);
  const ck = th2.j.messages.find((m) => m.card?.kind === "checks");
  assert.ok(ck, JSON.stringify(th2.j.messages.map((m) => m.card?.kind)));
  assert.ok(ck.card.data.conditions.some((x) => x.photos.length && x.photos[0].url.startsWith(`/api/jobs/${job.id}/evidence/`) && ["model", "code", "person"].includes(x.photos[0].judge)));
  if (J.job(job.id).status === "released") assert.ok(th2.j.messages.some((m) => m.card?.kind === "paid" && m.card.data.stamp === "PAID"));
});

test("idempotent: the same events again (a restart) make no new messages", async () => {
  const c = client();
  const me = await c("POST", "/api/auth/demo", { as: "customer", pin: "4321" });
  await postJob(c, "Bathroom sink drain is clogged and slow, fix it tomorrow, $250 max");
  const before = (await c("GET", "/api/assistant/thread")).j.messages.length;
  for (const e of activityStore.data.entries.filter((x) => x.who.includes(me.j.person.id))) A.replay(e);
  assert.equal(A.catchUp(), 0);
  await A.tick();
  const after_ = (await c("GET", "/api/assistant/thread")).j.messages;
  assert.equal(after_.length, before, JSON.stringify(after_.slice(before).map((m) => m.text)));
});

test("an unclear message gets one short question; counter at $X is the agent's within limits", async () => {
  const c = client();
  await c("POST", "/api/auth/demo", { as: "customer", pin: "5555" });
  const u = await c("POST", "/api/assistant/message", { text: "hmm" });
  assert.equal(u.j.messages.length, 2); assert.match(u.j.messages[1].text, /\?$/);
  // with the agent's own negotiation off, "counter at $X" is still the person's way to counter
  process.env.DONE_AGENT_NEGOTIATES = "0";
  try { await postJob(c, "Kitchen faucet keeps dripping, fix it this week, $250 max"); } finally { delete process.env.DONE_AGENT_NEGOTIATES; }
  const r = await c("POST", "/api/assistant/message", { text: "counter at $150" });
  assert.ok(r.j.messages.some((m) => /I countered \$150\.00/.test(m.text)), JSON.stringify(r.j.messages.map((m) => m.text)));
});

test("the judges' tour plays out in the thread: work order, offers, hold, change order, mandates, checks, paid", async () => {
  const c = client();
  const r = await c("POST", "/api/demo/tour", { step: "all" });
  assert.equal(r.s, 200);
  const th = await c("GET", "/api/assistant/thread");
  const kinds = new Set(th.j.messages.map((m) => m.card?.kind).filter(Boolean));
  for (const k of ["work_order", "hold", "change_order", "mandate", "checks"]) assert.ok(kinds.has(k), `${k} in ${[...kinds]}`);
  if (r.j.status === "released") assert.ok(kinds.has("paid"));
  assert.equal(th.j.messages.filter((m) => m.card?.kind === "mandate").length, 3);
  assert.ok(th.j.messages.filter((m) => m.from === "agent").every(short));
});

test("the pro's thread: a new job to offer on, hired, I've arrived, send for check, paid; in Spanish when lang is es", async () => {
  const pro = client(), cust = client();
  await pro("POST", "/api/auth/demo", { as: "pro", pro: "lone-star-rooter", pin: "8642" });
  const hello = await pro("GET", "/api/pro/assistant/thread");
  assert.equal(hello.s, 200); assert.equal(hello.j.messages[0].card.kind, "hello");
  await cust("POST", "/api/auth/demo", { as: "customer", pin: "7777", zip: "78758" });
  await postJob(cust, "Bathroom sink drain is clogged and slow, fix it this week, $300 max");
  const t1 = await pro("GET", "/api/pro/assistant/thread");
  // (a demo pro's own agent quotes at once, so the thread says what it offered; a pro without one gets an Offer button)
  const nj = t1.j.messages.find((m) => m.card?.kind === "work_order" && (/Your agent offered/.test(m.text) || m.actions?.some((a) => /^Offer/.test(a.label))));
  assert.ok(nj, JSON.stringify(t1.j.messages.map((m) => m.text)));
  if (nj.actions?.length) assert.equal((await pro("POST", "/api/pro/assistant/act", { action: nj.actions[0].id })).s, 200);
  const job = J.job(nj.job.id), mine = job.offers.find((o) => o.pro === "lone-star-rooter" && o.status === "open");
  assert.ok(mine, "the pro's offer is in");
  assert.ok(!(await J.acceptOffer(job.id, mine.id, { actor: { kind: "person", person: job.customer }, payWith: "card" })).error);
  const t2 = await pro("GET", `/api/pro/assistant/thread?after=${t1.j.seq}`);
  const arrive = t2.j.messages.flatMap((m) => m.actions || []).find((a) => a.label === "I've arrived");
  assert.ok(arrive, JSON.stringify(t2.j.messages.map((m) => m.text)));
  await pro("POST", "/api/pro/assistant/act", { action: arrive.id });
  assert.equal(J.job(job.id).status, "working");
  const t3 = await pro("GET", `/api/pro/assistant/thread?after=${t2.j.seq}`);
  const started = t3.j.messages.find((m) => m.actions?.some((a) => a.label === "Take photos"));
  assert.ok(started.actions.find((a) => a.label === "Take photos").href.includes(job.id), "camera-first: the photo button opens the camera page");
  // the pro uploads (the website's camera page), then sends from the thread
  const k = J.job(job.id);
  J.addEvidence("lone-star-rooter", job.id, k.scope.checks.map((c) => ({ kind: c.evidence === "note" ? "note" : c.evidence === "receipt" ? "receipt" : "photo", ...(c.evidence === "note" ? { text: "Cleared the clog: hair in the P-trap; it drains freely now." } : { buf: photo(k), mime: "image/jpeg", text: "TOTAL 0.00" }), checkId: c.id })), PRO("lone-star-rooter"));
  const send = started.actions.find((a) => a.label === "Send for check");
  assert.equal((await pro("POST", "/api/pro/assistant/act", { action: send.id })).s, 200);
  const t4 = await pro("GET", `/api/pro/assistant/thread?after=${t3.j.seq}`);
  assert.ok(t4.j.messages.some((m) => ["checks", "paid"].includes(m.card?.kind)), JSON.stringify(t4.j.messages.map((m) => m.text)));
  // Spanish
  await pro("PUT", "/api/pro/settings", { lang: "es" });
  const st = await pro("POST", "/api/pro/assistant/message", { text: "estado" });
  assert.ok(st.j.messages.length >= 2);
  const said = st.j.messages.filter((m) => m.from === "agent").map((m) => m.text).join(" ");
  assert.ok(/[áéíóúñ¿]|Trabajo|Pagado|Revisando|corrección|Le aviso|Envíe|cliente/i.test(said), said);
  await pro("PUT", "/api/pro/settings", { lang: "en" });
});

test("a pro without a demo agent gets an Offer button for a new job in their feed, and the offer goes in from the thread", async () => {
  const pros = await import("../src/pros.js"), people = await import("../src/people.js"), PA = await import("../src/proAgent.js");
  const made = pros.createPro({ name: "Thread Test Drains", trade: "plumbing", zip: "78704", email: "thread@example.com" });
  pros.setPayPal(made.pro.id, { email: "thread@example.com" });
  const pp_ = people.makePerson({ name: "Thread Pro", role: "pro", zip: "78704", demo: false }); people.updatePerson(pp_.id, { pro: made.pro.id }); pros.linkPerson(made.pro.id, pp_.id);
  const cust = client();
  await cust("POST", "/api/auth/demo", { as: "customer", pin: "8888", zip: "78704" });
  await postJob(cust, "Bathroom sink drain is clogged and slow, fix it this week, $300 max");
  const t = PA.thread(pp_.id, made.pro.id);
  const m = t.messages.find((x) => x.actions?.some((a) => /^Offer \$/.test(a.label)));
  assert.ok(m, JSON.stringify(t.messages.map((x) => x.text)));
  const r = await A.act(pp_.id, m.actions[0].id, {});
  assert.ok(!r.error, JSON.stringify(r));
  assert.ok(J.job(m.job.id).offers.some((o) => o.pro === made.pro.id && o.status === "open"));
});

test("offers are one live message updated in place; all over the ceiling: Counter at the ceiling leads, and a demo pro takes it", async () => {
  const c = client();
  await c("POST", "/api/auth/demo", { as: "customer", pin: "9999" });
  const r = await postJob(c, "My bathroom sink drains slowly. Fix it this week, under $120.");
  const job = J.job(r.j.messages.find((m) => m.job)?.job.id);
  await new Promise((ok) => setTimeout(ok, 30));
  const th = await c("GET", "/api/assistant/thread");
  const offerMsgs = th.j.messages.filter((m) => m.card?.kind === "offers");
  assert.equal(offerMsgs.length, 1, "one offers message");
  const m = offerMsgs[0];
  assert.ok(m.live);
  // every offer was over the $120 ceiling: the agent countered at the ceiling itself (A2A), and a demo pro takes it
  const o = J.job(job.id).offers.find((x) => x.counter);
  assert.ok(o && o.ask > job.scope.priceCeiling, "the countered offer was over the ceiling");
  assert.equal(o.counter.amount, 12000); assert.match(o.counter.by.client, /Your agent/);
  assert.equal(o.answer?.kind, "accept", "a demo pro meets the customer's budget"); assert.equal(o.amount, 12000);
  assert.match(m.text, /^I negotiated: .+'s agent agreed to \$120\.00/);
  assert.equal(m.actions[0].label, "Confirm $120"); assert.equal(m.actions[0].needsPin, false, "within the ceiling now: no PIN");
  // the same offers event again updates the one message in place, it doesn't add one
  const A_ = await import("../src/assistant.js"), { activityStore: st } = await import("../src/activity.js");
  const before = (await c("GET", "/api/assistant/thread")).j.messages.length;
  A_.replay(st.data.entries.filter((x) => x.ref === job.id && x.action === "offers_requested").at(-1));
  assert.equal((await c("GET", "/api/assistant/thread")).j.messages.length, before);
  // and when it changes, the same id comes back with a higher seq
  const seq0 = (await c("GET", "/api/assistant/thread")).j.seq, u0 = m.updates || 0;
  const live = A_.upsert(J.job(job.id).customer, `offers:${job.id}`, { text: "changed", job: J.job(job.id), card: { kind: "offers", data: {} } });
  const again = await c("GET", `/api/assistant/thread?after=${seq0}`);
  assert.equal(again.j.messages.length, 1, JSON.stringify(again.j.messages.map((x) => [x.id, x.seq, x.text]))); assert.equal(again.j.messages[0].id, m.id); assert.ok(live.updates >= u0 + 1);
});

test("a demo pro's agent takes a counter at the customer's ceiling when it's at least 75% of the ask", async () => {
  const { answerCounter } = await import("../src/pros.js");
  assert.equal(answerCounter({ ask: 19500, floor: 17000, amount: 15000, atCeiling: true }).kind, "accept");
  assert.equal(answerCounter({ ask: 19500, floor: 17000, amount: 15000 }).kind, "counter", "not at the ceiling: the usual rule");
  assert.notEqual(answerCounter({ ask: 25000, floor: 22000, amount: 15000, atCeiling: true }).kind, "accept", "under 75% of the ask: no");
});

test("capture fixes: no leftover counted twice after release; Hire <short name>; why the best offer in a few words; a pro's active job leads with its next step", async () => {
  const A_ = await import("../src/assistant.js"), PA = await import("../src/proAgent.js"), people = await import("../src/people.js"), pros = await import("../src/pros.js");
  const c = client();
  const me = await c("POST", "/api/auth/demo", { as: "customer", pin: "2121" });
  const r = await postJob(c, "Kitchen faucet keeps dripping. Fix it this week, $300 max.");
  await new Promise((ok) => setTimeout(ok, 30));
  const offers = (await c("GET", "/api/assistant/thread")).j.messages.find((m) => m.card?.kind === "offers");
  const hire = offers.actions[0], best = J.job(offers.job.id).offers.find((o) => o.id === offers.card.data.bestId);
  assert.equal(hire.label, `Confirm ${(best.amount / 100).toLocaleString("en-US", { style: "currency", currency: "USD" }).replace(".00", "")}`);
  assert.match(offers.text, /^I negotiated: .* Confirm to hire; PayPal holds the money until the work passes\.$/);
  // the pro (signed in after the hire) sees the next step first
  await c("POST", "/api/assistant/act", { action: hire.id });
  const job = J.job(offers.job.id), pid = job.agreed.pro, pp_ = people.makePerson({ name: "Pro person", role: "pro", zip: "78704" });
  people.updatePerson(pp_.id, { pro: pid }); const had = pros.pro(pid).person; pros.linkPerson(pid, pp_.id);
  try {
    const t = PA.thread(pp_.id, pid);
    const next = t.messages.find((m) => m.job?.id === job.id && m.actions?.some((a) => a.label === "I've arrived"));
    assert.ok(next && next.card.kind === "visit", JSON.stringify(t.messages.map((m) => m.text)));
    assert.equal(PA.thread(pp_.id, pid).messages.filter((m) => m.job?.id === job.id && m.actions?.some((a) => a.label === "I've arrived")).length, 1, "asked once");
    // finish: no leftover counted twice in the paid card
    J.startWork(pid, job.id, PRO(pid));
    await J.submit(pid, job.id, PRO(pid)).catch(() => {});
    J.addEvidence(pid, job.id, faucetEvidence(J.job(job.id)), PRO(pid)); await J.submit(pid, job.id, PRO(pid));
    let k = J.job(job.id);
    if (k.status === "review") { await J.release(job.id, { kind: "person", person: me.j.person.id }, { acknowledgeFailed: J.notPassed(k, k.milestones[0]).map((x) => x.id) }); k = J.job(job.id); }
    assert.equal(k.status, "released");
    const mb = A_.moneyBar(k);
    assert.equal(mb.held, 0, "nothing is held after the final capture");
    assert.ok(!mb.segments.some((s) => s.kind === "held"));
    assert.equal(mb.releasedBuffer, k.hold.amount - mb.captured);
    assert.equal(mb.segments.reduce((t, s) => t + s.amount, 0), mb.captured, "every captured cent once");
  } finally { pros.linkPerson(pid, had); }
});

test("the pro taps I've arrived: the work starts and the camera comes next; too early, one line says when and offers Move visit", async () => {
  const PA = await import("../src/proAgent.js"), people = await import("../src/people.js"), pros = await import("../src/pros.js");
  const c = client();
  await c("POST", "/api/auth/demo", { as: "customer", pin: "3131" });
  await postJob(c, "Kitchen faucet keeps dripping. Fix it this week, $300 max.");
  const offers = (await c("GET", "/api/assistant/thread")).j.messages.find((m) => m.card?.kind === "offers");
  await c("POST", "/api/assistant/act", { action: offers.actions[0].id });
  const job = J.job(offers.job.id), pid = job.agreed.pro, pp_ = people.makePerson({ name: "Arriving pro", role: "pro", zip: "78704" });
  people.updatePerson(pp_.id, { pro: pid }); const had = pros.pro(pid).person; pros.linkPerson(pid, pp_.id);
  try {
    // the visit is three hours away: refused, with when and Move visit
    const later = new Date(Date.now() + 3 * 3600e3).toISOString();
    Object.assign(J.job(job.id).agreed, { arrival: later }); J.job(job.id).visit = { slot: { from: later, to: later, minutes: 60 }, history: [], proposal: null };
    const t = PA.thread(pp_.id, pid), tap = t.messages.flatMap((m) => m.actions || []).find((a) => a.label === "I've arrived" && !a.done);
    const r1 = await A.act(pp_.id, tap.id, {});
    assert.match(r1.messages.at(-1).text, /^Your visit is .+: tap again then, or move the visit\.$/);
    assert.ok(r1.messages.at(-1).actions.some((a) => a.label === "Move visit"));
    assert.equal(J.job(job.id).status, "held");
    // at the visit: the work starts and the camera is next
    const now = new Date().toISOString();
    Object.assign(J.job(job.id).agreed, { arrival: now }); J.job(job.id).visit.slot.from = now;
    const again = r1.messages.at(-1).actions.find((a) => a.label === "I've arrived");
    const r2 = await A.act(pp_.id, again.id, {});
    assert.equal(J.job(job.id).status, "working");
    assert.ok(r2.messages.some((m) => m.actions?.some((a) => a.label === "Take photos") && m.actions.some((a) => a.label === "Send for check")), JSON.stringify(r2.messages.map((m) => m.text)));
    // typed "I've arrived" on a working job just shows the next step
    const r3 = await PA.message(pp_.id, pid, "I've arrived");
    assert.ok(r3.messages.some((m) => m.actions?.some((a) => a.label === "Take photos")));
  } finally { pros.linkPerson(pid, had); }
});

test("the agent asks before posting: a photo (checked by code), the room, the service; then Post it posts with the photo on the job", async () => {
  const ev = await import("../src/evidence.js");
  const pic = (s) => ({ dataUrl: `data:image/jpeg;base64,${Buffer.concat([ev.TINY_JPEG.slice(0, -2), Buffer.from(String(s)), ev.TINY_JPEG.slice(-2)]).toString("base64")}` });
  const c = client();
  await c("POST", "/api/auth/demo", { as: "customer", pin: "1234" });
  const act = async (msgs, label) => { const a = [...msgs].reverse().flatMap((m) => m.actions || []).find((x) => x.label === label); assert.ok(a, `no "${label}" in ${JSON.stringify(msgs.map((m) => m.text))}`); const r = await c("POST", "/api/assistant/act", { action: a.id }); assert.equal(r.s, 200, JSON.stringify(r.j).slice(0, 200)); return r.j.messages; };
  assert.equal((await c("POST", "/api/assistant/message", { text: "" })).s, 400, "nothing to send");
  // 1) a problem with the room but no service: first the photo
  let m = (await c("POST", "/api/assistant/message", { text: "My bathroom faucet drips all night" })).j.messages;
  assert.ok(!m.some((x) => x.card?.kind === "work_order"), "nothing posted yet");
  assert.match(m.at(-1).text, /photo of the faucet/);
  assert.deepEqual(m.at(-1).actions.map((a) => a.label), ["Take a photo", "No photo"]);
  assert.equal(m.at(-1).actions[0].href, "#photo");
  // 2) the photo is checked by code: an 8x8 picture is too small, so it asks for another (or to use it)
  m = (await c("POST", "/api/assistant/message", { text: "", photos: [pic("drip-1")] })).j.messages;
  assert.equal(m[0].photoCount, 1);
  assert.match(m.at(-1).text, /is small \(8×8\)/);
  m = await act(m, "Use it anyway");
  // 3) the room came with the sentence; the service is asked
  assert.match(m.at(-1).text, /What should the pro do with the faucet/);
  m = await act(m, "Fix it");
  assert.match(m.at(-1).text, /Ready to post: .*bathroom · fix it · 1 photo/);
  m = await act(m, "Post it");
  const wo = m.find((x) => x.card?.kind === "work_order");
  assert.ok(wo, JSON.stringify(m.map((x) => x.text)));
  const j = J.job(wo.job.id);
  assert.match(j.text, /faucet drips all night/i);
  assert.equal(j.evidence.filter((e) => e.phase === "reference").length, 1, "the photo is on the job as a photo of the problem");
  assert.ok(m.some((x) => /1 photo of the problem added/.test(x.text)));
  const t = (await c("GET", "/api/assistant/thread")).j.messages, mine = t.find((x) => x.from === "you" && x.photoCount === 1);
  assert.equal(mine.photos.length, 1, "the person's message shows the photo from the job");
  assert.equal((await fetch(base + mine.photos[0].url, { headers: { cookie: `done_session=${c.sid()}` } })).status, 200);
  // 4) typed answers: no photo, the room, the service, yes
  m = (await c("POST", "/api/assistant/message", { text: "The ceiling fan wobbles and makes a noise, $180 max" })).j.messages;
  m = (await c("POST", "/api/assistant/message", { text: "no photo" })).j.messages;
  assert.match(m.at(-1).text, /Where is the ceiling fan/);
  m = (await c("POST", "/api/assistant/message", { text: "the bedroom upstairs" })).j.messages;
  assert.match(m.at(-1).text, /What should the pro do/);
  m = (await c("POST", "/api/assistant/message", { text: "replace it" })).j.messages;
  assert.match(m.at(-1).text, /bedroom · replace it · no photo · up to \$180\.00/);
  m = (await c("POST", "/api/assistant/message", { text: "yes" })).j.messages;
  const j2 = J.job(m.find((x) => x.card?.kind === "work_order").job.id);
  assert.match(j2.text, /It's in the bedroom\. Wanted: replace\./);
  // 5) cancel drops the draft; a photo alone then goes on the job not started yet
  const me = (await c("GET", "/api/me")).j.person.id;
  await c("POST", "/api/assistant/message", { text: "Kitchen sink is leaking under the cabinet" });
  assert.ok(A.intakeDraft(me));
  m = (await c("POST", "/api/assistant/message", { text: "cancel" })).j.messages;
  assert.match(m.at(-1).text, /dropped it/); assert.equal(A.intakeDraft(me), null);
  m = (await c("POST", "/api/assistant/message", { text: "", photos: [pic("drip-2")] })).j.messages;
  assert.match(m.at(-1).text, new RegExp(`Added 1 photo of the problem to ${j2.number}`));
});

test("the judges' demo: the showcase customer's chat shows a job asked about, negotiated by her agent, and an extra cost negotiated for her to confirm", async () => {
  const c = client();
  const me = (await c("POST", "/api/auth/demo", { as: "customer", pin: "7373" })).j.person.id;
  const r = await A.showcase(me, "offers");
  assert.ok(r.job && !r.error);
  let t = (await c("GET", "/api/assistant/thread")).j.messages;
  assert.ok(t.some((m) => /Can you send a photo/.test(m.text)) && t.some((m) => m.card?.kind === "flow"));
  const offers = t.find((m) => m.card?.kind === "offers");
  assert.match(offers.text, /^I negotiated: /); assert.ok(offers.actions.some((a) => /^Confirm \$/.test(a.label)));
  const x = await A.showcase(me, "extra");
  assert.ok(["working"].includes(x.job.status), x.job.status);
  const co = x.job.changeOrders.at(-1);
  assert.equal(co.ask, 12000); assert.ok(co.amount < 12000 && co.status === "pending", JSON.stringify(co));
  t = (await c("GET", "/api/assistant/thread")).j.messages;
  const cm = t.findLast((m) => m.card?.kind === "change_order");
  assert.ok(cm.actions.some((a) => /^Confirm \+\$/.test(a.label) && a.needsPin), JSON.stringify(cm));
  const flow = t.find((m) => m.card?.kind === "flow" && m.job?.id === x.job.id);
  assert.ok(flow.card.data.nodes.some((n) => n.key === `change:${co.id}` && n.state === "now" && n.by === "you"), JSON.stringify(flow.card.data.nodes));
});
