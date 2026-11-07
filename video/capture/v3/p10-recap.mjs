// Phase 10: re-captures with the mobile DEMO tag hidden: the pro's camera page; the injection attempt's thread cards; the
// water heater job page (milestones) as slices.
import path from "node:path";
import fs from "node:fs";
import { launch, page, api, shot, settle, log, st, T, B, PHONE, OUT, pageH, eager } from "./lib3.mjs";
import { threadCards } from "./cards.mjs";
const S = st();
const b = await launch();
const SLICE = 1600;
async function slices(p, name) { await eager(p); await settle(p, 800); const H = await pageH(p), W = await p.evaluate(() => document.documentElement.clientWidth), out = []; for (let y = 0, i = 0; y < H; y += SLICE, i++) { const h = Math.min(SLICE, H - y), file = `${name}-s${i}.png`; await p.screenshot({ path: path.join(OUT, file), clip: { x: 0, y, width: W, height: h }, captureBeyondViewport: true }); out.push({ file, y, h }); } fs.writeFileSync(path.join(OUT, `${name}.json`), JSON.stringify({ pageH: H, width: W, slices: out }, null, 1)); log("slices", name, out.length); }
const ph = await page(b, PHONE); log("pro", (await api(ph, "/api/auth/demo", { as: "pro", pro: S.m.pro, pin: process.env.DONE_DEMO_PRO_PIN || "8642" })).status);
await ph.goto(`${B}/pro/jobs/${S.m.job}?camera=1`, { waitUntil: "networkidle0" }); await settle(ph, 2500); await shot(ph, "s7-pro-camera");
await ph.goto(B + "/", { waitUntil: "networkidle0" }); await settle(ph, 2500); await shot(ph, "s9-pro");
const c2 = await page(b); log("m2", (await api(c2, "/api/auth/demo", { person: S.m2.person, pin: T.customerPin })).status);
await c2.goto(B + "/", { waitUntil: "networkidle0" }); await settle(c2, 2500); await threadCards(c2, "m2-cards");
await c2.goto(`${B}/jobs/${S.inj.job}`, { waitUntil: "networkidle0" }); await settle(c2, 2000); await c2.evaluate(() => { for (const d of document.querySelectorAll("main details")) d.open = true; }); await slices(c2, "inj-job");
const M = "http://localhost:8841";
const d = await page(b); await d.goto(M + "/", { waitUntil: "networkidle0" });
const cs = (await api(d, "/api/demo/customers")).body || []; const dana = cs.find((x) => /Dana/.test(x.name));
log("dana", (await api(d, "/api/auth/demo", { person: dana.id, pin: T.customerPin })).status);
await d.goto(`${M}/jobs/${S.scale.job}`, { waitUntil: "networkidle0" }); await settle(d, 2500); await d.evaluate(() => { for (const x of document.querySelectorAll("main details")) x.open = true; }); await slices(d, "wh-job");
await d.goto(M + "/", { waitUntil: "networkidle0" }); await settle(d, 2500); await threadCards(d, "wh-cards");
await b.close();
