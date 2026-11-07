// Phase 4 (shot 6): Maria approves the +$47.05 change order herself. Her session's PIN step-up has lapsed (10 minutes),
// so tapping Approve opens the real PIN sheet; she types her PIN (dots only) and confirms. The hold is then re-held on
// PayPal's sandbox. Frames: the card, the sheet with 0..6 dots, the result.
import fs from "node:fs";
import path from "node:path";
import { launch, page, api, shot, settle, save, log, wait, st, T, B, OUT } from "./lib3.mjs";
const S = st().m, job = S.job;
const b = await launch(); const c = await page(b);
const t0 = Date.now();
log("resume", (await api(c, "/api/auth/demo", { person: S.person, pin: T.customerPin })).status);
const lapse = 10.6 * 60e3 - (Date.now() - t0);
log("waiting for the step-up to lapse", Math.round(lapse / 1000), "s"); await wait(lapse);
await c.goto(B + "/", { waitUntil: "networkidle0" }); await settle(c, 2500);
await shot(c, "s6-pin-before");
// the newest change-order card's Approve button
const btn = await c.evaluateHandle(() => { const bs = [...document.querySelectorAll("button")].filter((x) => /^Approve/.test(x.innerText.trim()) && !x.disabled); return bs.at(-1) || null; });
if (!(await btn.evaluate((x) => !!x))) { log("no Approve button"); process.exit(1); }
await btn.evaluate((x) => x.scrollIntoView({ block: "center" })); await settle(c, 600);
const bb = await btn.evaluate((e) => { const r = e.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; });
await shot(c, "s6-pin-approve"); save({ m: { ...st().m, approveBtn: bb } });
await btn.click();
const inp = await c.waitForSelector(".pin-in, input[type=password]", { timeout: 15000 }).catch(() => null);
if (!inp) { log("no PIN sheet"); await shot(c, "s6-pin-none"); process.exit(1); }
await settle(c, 700);
await shot(c, "s6-pin-0");
for (let i = 0; i < T.customerPin.length; i++) { await inp.type(T.customerPin[i]); await shot(c, `s6-pin-${i + 1}`); }
await c.keyboard.press("Enter");
await wait(8000);
await c.goto(B + "/", { waitUntil: "networkidle0" }); await settle(c, 2500);
await shot(c, "s6-pin-after"); await shot(c, "s6-pin-after-full", { full: true });
const j = (await api(c, `/api/jobs/${job}`)).body;
save({ m: { ...st().m, rehold: j.hold, changeOrders: j.changeOrders.map((x) => ({ id: x.id, status: x.status, amount: x.amount })) } });
log("after", j.status, JSON.stringify({ order: j.hold?.paypalOrder, auth: j.hold?.authorization, amount: j.hold?.amount?.usd, history: (j.hold?.history || []).map((h) => h.event) }));
await b.close();
