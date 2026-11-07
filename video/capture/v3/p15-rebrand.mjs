// Phase 15 (film v5): re-capture the thread cards and the pro's phone from the film's run (state copy on 8840) with the
// current interface (VeriPay; status badges instead of the yellow PAID stamp). Same cards, same order as p5-paid.
import { launch, page, api, shot, settle, log, st, T, B, PHONE } from "./lib3.mjs";
import { threadCards } from "./cards.mjs";
const S = st().m;
const b = await launch(); const c = await page(b);
log("resume", (await api(c, "/api/auth/demo", { person: S.person, pin: T.customerPin })).status);
await c.goto(B + "/", { waitUntil: "networkidle0" }); await settle(c, 3000);
await shot(c, "s9-thread");
await threadCards(c, "m-cards");
const ph = await page(b, PHONE);
log("pro", (await api(ph, "/api/auth/demo", { as: "pro", pro: S.pro, pin: process.env.DONE_DEMO_PRO_PIN || "8642" })).status);
await ph.goto(B + "/", { waitUntil: "networkidle0" }); await settle(ph, 3000);
await shot(ph, "s9-pro"); await threadCards(ph, "p-cards");
await b.close();
