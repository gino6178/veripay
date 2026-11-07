// Phase 8 (shots 8, 10, 11): thread cards of the injection attempt; the money job's page; Pay Later on a $300+ job
// (PayPal's own JS SDK v6 buttons, sandbox); staff: reconciliation against PayPal (sandbox server) and the AG Grid
// back office; the pro's AG Charts earnings and /live-test (the seeded server, 8841).
import path from "node:path";
import fs from "node:fs";
import { launch, page, api, shot, settle, save, log, wait, st, T, B, PHONE, OUT, pageH, eager } from "./lib3.mjs";
import { threadCards } from "./cards.mjs";
const S = st();
const b = await launch();
const SLICE = 1600;
async function slices(p, name) { await eager(p); await settle(p, 800); const H = await pageH(p), W = await p.evaluate(() => document.documentElement.clientWidth), out = []; for (let y = 0, i = 0; y < H; y += SLICE, i++) { const h = Math.min(SLICE, H - y), file = `${name}-s${i}.png`; await p.screenshot({ path: path.join(OUT, file), clip: { x: 0, y, width: W, height: h }, captureBeyondViewport: true }); out.push({ file, y, h }); } fs.writeFileSync(path.join(OUT, `${name}.json`), JSON.stringify({ pageH: H, width: W, slices: out }, null, 1)); log("slices", name, out.length); }
// 1. the injection attempt, as Maria (the second account) sees it
const c2 = await page(b); log("m2", (await api(c2, "/api/auth/demo", { person: S.m2.person, pin: T.customerPin })).status);
await c2.goto(B + "/", { waitUntil: "networkidle0" }); await settle(c2, 2500); await threadCards(c2, "m2-cards");
await c2.goto(`${B}/jobs/${S.inj.job}`, { waitUntil: "networkidle0" }); await settle(c2, 2000); await c2.evaluate(() => { for (const d of document.querySelectorAll("main details")) d.open = true; }); await slices(c2, "inj-job");
// 2. the money job's page (for the checks close-ups)
const c = await page(b); log("m", (await api(c, "/api/auth/demo", { person: S.m.person, pin: T.customerPin })).status);
await c.goto(`${B}/jobs/${S.m.job}`, { waitUntil: "networkidle0" }); await settle(c, 2500); await c.evaluate(() => { for (const d of document.querySelectorAll("main details")) d.open = true; }); await slices(c, "y-job");
// 3. Pay Later: a $300+ job hired to be held through PayPal's own buttons
let r = await api(c2, "/api/assistant/message", { text: "Clear the main sewer line this week, $400 max." });
let job = null; for (let i = 0; i < 40 && !job; i++) { const t = (await api(c2, "/api/assistant/thread")).body; job = t.messages.filter((m) => m.card?.kind === "work_order").at(-1)?.job?.id; if (job === S.inj.job) job = null; if (!job) await wait(2000); }
for (let i = 0; i < 40; i++) { const j = (await api(c2, `/api/jobs/${job}`)).body; if ((j.offers || []).some((o) => o.status === "open" && o.amount.cents >= 30000)) break; if ((j.offers || []).filter((o) => o.status === "open").length >= 3) break; await wait(3000); }
let j = (await api(c2, `/api/jobs/${job}`)).body; const off = j.offers.filter((o) => o.status === "open").sort((a, b) => b.amount.cents - a.amount.cents)[0];
r = await api(c2, `/api/jobs/${job}/offers/${off.id}/accept`, { payWith: "paypal" }); log("hire paypal", r.status, r.body?.status || r.body?.error, off.amount.usd);
await c2.goto(`${B}/paypal/button?job=${job}`, { waitUntil: "networkidle0" }); await wait(9000); await shot(c2, "s10-paylater"); save({ paylater: { job, amount: off.amount } });
// 4. staff on the sandbox server: reconciliation (the agent asks PayPal) and the grid
const s = await page(b); log("staff", (await api(s, "/api/auth/staff", {})).status);
r = await api(s, "/api/staff/recon?wait=1", {}); save({ recon: { counts: r.body?.counts, summary: r.body?.summary, rows: (r.body?.rows || []).map((x) => ({ kind: x.kind, job: x.job, ref: x.ref, ours: x.ours, paypal: x.paypal, status: x.status, via: x.via })) } }); log("recon", JSON.stringify(r.body?.counts), r.body?.summary);
await s.goto(B + "/office", { waitUntil: "networkidle0" }); await settle(s, 4000);
await s.evaluate(() => [...document.querySelectorAll(".tabs button")].find((e) => /Reconciliation/.test(e.innerText))?.click()); await wait(3000); await shot(s, "s11-recon-sandbox", { full: true });
// 5. the seeded server: the grid, the pro's earnings, /live-test
const M = "http://localhost:8841";
const so = await page(b); await so.goto(M + "/", { waitUntil: "networkidle0" }); log("staff mock", (await api(so, "/api/auth/staff", {})).status);
await so.goto(M + "/office", { waitUntil: "networkidle0" }); await settle(so, 4000); await shot(so, "s11-office", { full: true });
await so.evaluate(() => [...document.querySelectorAll(".tabs button")].find((e) => /^Jobs/.test(e.innerText.trim()))?.click()); await wait(3000); await shot(so, "s11-office-jobs", { full: true });
await so.evaluate(() => [...document.querySelectorAll(".tabs button")].find((e) => /Payouts/.test(e.innerText))?.click()); await wait(3000); await shot(so, "s11-office-payouts", { full: true });
const pr = await page(b); await pr.goto(M + "/", { waitUntil: "networkidle0" }); log("pro mock", (await api(pr, "/api/auth/demo", { as: "pro", pro: "eastside-pipe-drain", pin: process.env.DONE_DEMO_PRO_PIN || "8642" })).status);
await pr.goto(M + "/pro/earnings", { waitUntil: "networkidle0" }); await settle(pr, 5000); await shot(pr, "s11-earnings", { full: true });
const lt = await page(b); await lt.addStyleTag({ content: "main > p.lede { display: none !important; }" }).catch(() => {});
await lt.goto(B + "/live-test/", { waitUntil: "networkidle0" }); await lt.addStyleTag({ content: "main > p.lede { display: none !important; }" }); await settle(lt, 1500); await shot(lt, "s11-livetest");
await lt.evaluate(() => { const c = document.querySelector(".panel"); scrollTo(0, c.getBoundingClientRect().top + scrollY - 30); }); await settle(lt, 800); await shot(lt, "s11-livetest-chart");
await b.close();
