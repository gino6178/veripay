// Phase 11: the cover's screens in the one-agent UI, from the film's sandbox run (8840): Maria's agent thread at the paid
// DP-1002 card (desktop) and the pro's phone thread at the same paid job. Saved into submission/ for cover.html.
import path from "node:path";
import { launch, page, api, settle, eager, log, st, T, B, HERE } from "./lib3.mjs";
const S = st().m;
const SUB = path.join(HERE, "../../../submission");
const b = await launch();
const hideComposer = ".composer, .sugg, .sugg-c { display: none !important; }";
// desktop: 1280 wide, tall enough to fill the cover's 940×820 screen box at its width (940/1280 → 1117 CSS high)
const c = await page(b, { width: 1280, height: 1117, deviceScaleFactor: 2 });
log("maria", (await api(c, "/api/auth/demo", { person: S.person, pin: T.customerPin })).status);
await c.goto(B + "/", { waitUntil: "networkidle0" }); await c.addStyleTag({ content: hideComposer }); await eager(c); await settle(c, 2000);
const hit = await c.evaluate(() => { const a = [...document.querySelectorAll("article.msg-t")].filter((e) => /^\s*Paid\./.test(e.innerText)); const e = a.at(-1); if (!e) return false; const r = e.getBoundingClientRect(); window.scrollTo({ top: scrollY + r.bottom - innerHeight + 30, behavior: "instant" }); return true; });
log("paid card", hit); await settle(c, 900);
await c.screenshot({ path: path.join(SUB, "shot-thread.png") });
// the pro's phone at the bottom of the thread (the paid job)
const ph = await page(b, { width: 390, height: 844, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
log("pro", (await api(ph, "/api/auth/demo", { as: "pro", pro: S.pro, pin: process.env.DONE_DEMO_PRO_PIN || "8642" })).status);
await ph.goto(B + "/", { waitUntil: "networkidle0" }); await ph.addStyleTag({ content: hideComposer }); await eager(ph); await settle(ph, 2000);
const hit2 = await ph.evaluate(() => { const a = [...document.querySelectorAll("article.msg-t")].filter((e) => /DP-1002/.test(e.innerText) && /paid|\$208\.84/i.test(e.innerText)); const e = a.at(-1); if (!e) return false; const r = e.getBoundingClientRect(); window.scrollTo({ top: scrollY + r.top + r.height / 2 - innerHeight / 2 - 40, behavior: "instant" }); return e.innerText.slice(0, 80); });
log("pro paid card", hit2); await settle(ph, 900);
await ph.screenshot({ path: path.join(SUB, "shot-pro-thread.png") });
await b.close();
