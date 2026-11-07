// Phase 2 (shots 4–5): Maria (her own PIN) sets her agent's limits (a change over $25 needs her PIN), requires signed
// mandates, and makes an agent token. The judges' tour starts her job (PayPal sandbox server). Her agent (REST, the
// token) counters once, then tries to hire with a mandate capped at $150 (refused: over its limit), hires with a mandate
// capped at $200 (the hold is authorized on PayPal's sandbox with the test card), then sends that mandate again
// (refused: single-use). The token is held in memory only.
import { launch, page, api, shot, settle, save, log, wait, st, T, B } from "./lib3.mjs";
const b = await launch(); const p = await page(b);
const si = await api(p, "/api/auth/demo", { as: "customer", name: "Maria", zip: "78704", pin: T.customerPin });
log("signin", si.status); const me = si.body.person.id;
save({ m: { person: me, signedInAt: new Date().toISOString() } });
log("limits", (await api(p, "/api/limits", { perJobMax: 200, changeMax: 25, requireMandate: true }, "PUT")).status);
const tok = await api(p, "/api/tokens", { label: "Maria's agent", scopes: ["read", "hire", "pay"] });
log("token", tok.status); const TOKEN = tok.body.token, TOKID = tok.body.id;
const agent = (tool, args) => p.evaluate(async (t, a, k) => { const r = await fetch(`/api/agent/${t}`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${k}` }, body: JSON.stringify(a) }); return { status: r.status, body: await r.json().catch(() => null) }; }, tool, args, TOKEN);
// the tour starts the job (its own sentence and the customer's photo) and asks for offers
let r = await api(p, "/api/demo/tour", { step: "start" }); const job = r.body.id; log("tour", r.status, r.body.number, r.body.status, (r.body.offers || []).length);
save({ m: { ...st().m, job, number: r.body.number } });
for (let i = 0; i < 40; i++) { const j = (await api(p, `/api/jobs/${job}`)).body; if ((j.offers || []).filter((o) => o.status === "open").length >= 5) break; await wait(3000); }
await p.goto(B + "/", { waitUntil: "networkidle0" }); await settle(p, 2500);
await shot(p, "s4-offers"); await shot(p, "s4-offers-full", { full: true });
let j = (await api(p, `/api/jobs/${job}`)).body;
const open = j.offers.filter((o) => o.status === "open").sort((a, b) => a.amount.cents - b.amount.cents);
const best = open[0]; log("best", best.pro?.name, best.amount.usd, open.map((o) => o.amount.usd).join(","));
// one counter, inside the range
r = await agent("counter_offer", { job, offer: best.id, amount: 170 }); log("counter", r.status, r.body?.error || "");
await wait(2500);
j = (await api(p, `/api/jobs/${job}`)).body; const now = j.offers.find((o) => o.id === best.id); log("after counter", now.status, now.amount.usd, JSON.stringify(now.answer || null));
// mandate 1: capped at $150 (refused: the offer is over it)
const m150 = await api(p, "/api/mandates/issue", { agentClient: TOKID, maxAmount: 150, scope: ["hold"], jobId: job, minutes: 60 }); log("mandate150", m150.status);
r = await agent("accept_offer", { job, offer: best.id, payWith: "card", mandate: m150.body.mandate }); log("accept150", r.status, r.body?.error, r.body?.reason);
// mandate 2: capped at $200 (accepted: the hold goes to PayPal's sandbox)
const m200 = await api(p, "/api/mandates/issue", { agentClient: TOKID, maxAmount: 200, scope: ["hold"], jobId: job, minutes: 60 }); log("mandate200", m200.status);
r = await agent("accept_offer", { job, offer: best.id, payWith: "card", mandate: m200.body.mandate }); log("accept200", r.status, r.body?.error || r.body?.status, JSON.stringify(r.body?.mandate || null));
// the same mandate again (refused: single-use)
const rp = await agent("accept_offer", { job, offer: best.id, payWith: "card", mandate: m200.body.mandate }); log("replay", rp.status, rp.body?.error, rp.body?.reason);
const mand = (await api(p, "/api/mandates")).body;
save({ m: { ...st().m, tokenId: TOKID, mandates: mand.mandates, replay: { status: rp.status, error: rp.body?.error, reason: rp.body?.reason, message: rp.body?.message } } });
await wait(3000);
await p.goto(B + "/", { waitUntil: "networkidle0" }); await settle(p, 2500);
await shot(p, "s5-hold"); await shot(p, "s5-hold-full", { full: true });
j = (await api(p, `/api/jobs/${job}`)).body;
save({ m: { ...st().m, hold: j.hold, status: j.status } });
log("job", j.status, JSON.stringify({ order: j.hold?.paypalOrder, auth: j.hold?.authorization, amount: j.hold?.amount }));
await b.close();
