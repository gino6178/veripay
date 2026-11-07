// Phase 1b: once the agent's work-order card is in the thread, capture it (and the offers if they arrived).
import { launch, page, api, shot, settle, save, log, wait, st, T, B } from "./lib3.mjs";
const b = await launch(); const p = await page(b);
const me = st().m2.person;
log("resume", (await api(p, "/api/auth/demo", { person: me, pin: T.customerPin })).status);
for (let i = 0; i < 60; i++) { const t = (await api(p, "/api/assistant/thread")).body; if (t?.messages?.some((m) => m.card?.kind === "work_order")) break; await wait(3000); }
await p.goto(B + "/", { waitUntil: "networkidle0" }); await settle(p, 2500);
await shot(p, "s3-workorder");
await shot(p, "s3-workorder-full", { full: true });
const th = (await api(p, "/api/assistant/thread")).body;
save({ m2: { ...st().m2, thread: th.messages.map((m) => ({ from: m.from, text: m.text, card: m.card?.kind, job: m.job?.number, jobId: m.job?.id })) } });
log(JSON.stringify(th.messages.map((m) => [m.from, m.card?.kind, m.job?.number, m.text?.slice(0, 90)])));
const wo = th.messages.find((m) => m.card?.kind === "work_order");
if (wo) log(JSON.stringify(wo.card.data).slice(0, 900));
await b.close();
