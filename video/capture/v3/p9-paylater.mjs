// Phase 9 (shot 10): Pay Later. A water heater job (over $300) hired to be held through PayPal's own JS SDK v6 buttons on
// the sandbox server; the page shows PayPal's PayPal and Pay Later buttons when PayPal finds the buyer eligible.
import { launch, page, api, shot, save, log, wait, st, T, B } from "./lib3.mjs";
const S = st();
const b = await launch(); const c = await page(b);
log("m2", (await api(c, "/api/auth/demo", { person: S.m2.person, pin: T.customerPin })).status);
await api(c, "/api/limits", { perJobMax: 2500 }, "PUT");
const before = new Set(((await api(c, "/api/assistant/thread")).body.messages || []).map((m) => m.job?.id).filter(Boolean));
await api(c, "/api/assistant/message", { text: "Replace my old 40-gallon water heater next week, $1,800 max." });
let job = null; for (let i = 0; i < 40 && !job; i++) { const t = (await api(c, "/api/assistant/thread")).body; job = t.messages.filter((m) => m.card?.kind === "work_order" && !before.has(m.job?.id)).at(-1)?.job?.id; if (!job) await wait(2000); }
for (let i = 0; i < 40; i++) { const j = (await api(c, `/api/jobs/${job}`)).body; if ((j.offers || []).filter((o) => o.status === "open").length >= 2) break; await wait(3000); }
const j = (await api(c, `/api/jobs/${job}`)).body; const off = j.offers.filter((o) => o.status === "open").sort((a, b) => a.amount.cents - b.amount.cents)[0];
const r = await api(c, `/api/jobs/${job}/offers/${off.id}/accept`, { payWith: "paypal" }); log("hire paypal", r.status, r.body?.status || r.body?.error, off.amount.usd);
await c.goto(`${B}/paypal/button?job=${job}`, { waitUntil: "networkidle0" }); await wait(12000); await shot(c, "s10-paylater");
save({ paylater: { job, amount: off.amount } });
await b.close();
