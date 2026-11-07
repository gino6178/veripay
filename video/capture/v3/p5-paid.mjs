// Phase 5 (shots 7–9): the tour's pro sends the photos and the receipt (tour step: the pro's agent), the checks run,
// and whatever the server decides happens on PayPal's sandbox. Then: Maria's thread cards, the pro's phone thread cards.
import { launch, page, api, shot, settle, save, log, wait, st, T, B, PHONE } from "./lib3.mjs";
import { threadCards } from "./cards.mjs";
const S = st().m, job = S.job;
const b = await launch(); const c = await page(b);
log("resume", (await api(c, "/api/auth/demo", { person: S.person, pin: T.customerPin })).status);
let r = await api(c, "/api/demo/tour", { step: "evidence", job }); log("evidence", r.body.status, r.body?.tour?.ai?.says);
let j = (await api(c, `/api/jobs/${job}`)).body;
for (let i = 0; i < 20 && j.money?.payout?.batchId == null && j.status === "released"; i++) { await wait(3000); j = (await api(c, `/api/jobs/${job}`)).body; }
const last = j.lastCheck || j.checks?.at(-1);
save({ m: { ...st().m, final: { status: j.status, decision: last?.decision, checker: last?.checker, conditions: (last?.checks || []).map((x) => ({ id: x.id, what: x.what, verdict: x.verdict, by: x.by, confidence: x.confidence, signals: x.signals, reason: String(x.reason || "").slice(0, 300) })), hold: j.hold, money: { captured: j.money.captured, split: j.money.split, payout: j.money.payout, balanced: j.money.balanced, ledger: j.money.ledger } } } });
log("final", j.status, last?.decision, last?.checker, JSON.stringify({ capture: j.hold?.capture, batch: j.money?.payout?.batchId, captured: j.money?.captured?.usd }));
await wait(5000);
await c.goto(B + "/", { waitUntil: "networkidle0" }); await settle(c, 3000);
await shot(c, "s9-thread");
await threadCards(c, "m-cards");
const ph = await page(b, PHONE);
log("pro", (await api(ph, "/api/auth/demo", { as: "pro", pro: S.pro, pin: process.env.DONE_DEMO_PRO_PIN || "8642" })).status);
await ph.goto(B + "/", { waitUntil: "networkidle0" }); await settle(ph, 3000);
await shot(ph, "s9-pro"); await threadCards(ph, "p-cards");
await b.close();
