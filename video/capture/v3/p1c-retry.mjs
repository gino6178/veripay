// Shot 3 retry: a fresh account named Maria types the sentence again with the models live; we keep whichever work order
// the server writes (source shown in the card data).
import { launch, page, api, shot, settle, save, log, wait, st, T, B } from "./lib3.mjs";
import { threadCards } from "./cards.mjs";
const SENT = "Kitchen faucet keeps dripping. Fix it this week, under $200.";
const b = await launch(); const p = await page(b);
const r = await api(p, "/api/auth/demo", { as: "customer", name: "Maria", zip: "78704", pin: T.customerPin }); log("signin", r.status);
await p.goto(B + "/", { waitUntil: "networkidle0" }); await settle(p, 1500);
const box = await p.$("textarea, input[type=text]"); await box.click(); await p.keyboard.type(SENT, { delay: 20 }); await p.keyboard.press("Enter");
let wo = null; for (let i = 0; i < 60 && !wo; i++) { const t = (await api(p, "/api/assistant/thread")).body; wo = t.messages.find((m) => m.card?.kind === "work_order"); if (!wo) await wait(1500); }
log("work order source", wo?.card?.data?.source, (wo?.card?.data?.conditions || []).map((c) => c.what).join(" | "));
await wait(20000);
const j = (await api(p, `/api/jobs/${wo.card.data.job}`)).body; log("job scope source now", j.scope?.source, j.scopeRefined ? "refined kept as suggestion" : "");
await p.goto(B + "/", { waitUntil: "networkidle0" }); await settle(p, 2500);
await threadCards(p, "m3-cards");
save({ m3: { person: r.body.person.id, job: wo.card.data.job, source: wo.card.data.source, scopeSource: j.scope?.source } });
await b.close();
