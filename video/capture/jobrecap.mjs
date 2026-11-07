// Re-capture the film job's page (desktop, Maria) and the pro's phone page with every image loaded.
//   node jobrecap.mjs <tag> <state-name>
import path from "node:path";
import fs from "node:fs";
import { launch, prep, settle, api, B, HERE, boxes, pageH, CAPTURE_CSS, eager } from "./lib.mjs";
const [tag = "final", name = "final2"] = process.argv.slice(2);
const DIR = path.join(HERE, "../public/textures", "flow-" + tag);
const L = JSON.parse(fs.readFileSync(path.join(DIR, "layout.json"), "utf8"));
const T = JSON.parse(fs.readFileSync(path.join(HERE, "film-test-values.json"), "utf8"));
const CSS = CAPTURE_CSS + " .pin-once { visibility: hidden !important; } ";
const SLICE = 1600;
async function slices(p, nm) { const H = await pageH(p), W = await p.evaluate(() => document.documentElement.clientWidth), out = []; for (let y = 0, i = 0; y < H; y += SLICE, i++) { const h = Math.min(SLICE, H - y), file = `${nm}-s${i}.png`; await p.screenshot({ path: path.join(DIR, file), clip: { x: 0, y, width: W, height: h }, captureBeyondViewport: true }); out.push({ file, y, h }); } return out; }
const SEL = { head: ".wo-head", h2: "main h2, main h3", panels: ".panel", stamps: ".stamp-slot", saw: ".saw", signals: ".signals", ids: ".ids", thread: ".thread", src: ".src", note: ".note", amt: ".big-amt", offer: ".offer", fair: ".fair", msgs: ".thread > *", spec: ".spec", cond: ".cond", thumbs: ".thumbs", doc: ".doc", stamp: ".stamp", ledger: "table", li: "main li" };
const b = await launch();
const pg = await b.newPage(); await prep(pg, { css: CSS }); await pg.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 2 });
await pg.goto(B + "/", { waitUntil: "networkidle0" });
const cs = (await api(pg, "/api/demo/customers")).body; const me = cs.find((c) => c.name === "Demo · " + T.customerName);
console.log("resume", (await api(pg, "/api/auth/demo", { person: me.id, pin: T.customerPin })).status);
await pg.goto(`${B}/jobs/${L.job.id}`, { waitUntil: "networkidle0" }); await settle(pg, 1500);
await pg.evaluate(() => { for (const d of document.querySelectorAll("main details")) d.open = true; });
await eager(pg); await settle(pg, 1200);
const m = { pageH: await pageH(pg) }; for (const [k, s] of Object.entries(SEL)) m[k] = await boxes(pg, s, true);
m.slices = await slices(pg, name);
L.states[name] = { ...(L.states[name] || {}), desktop: m };
const job = (await api(pg, "/api/jobs/" + L.job.id)).body; fs.writeFileSync(path.join(DIR, `job-${name}.json`), JSON.stringify(job, null, 1));
// phone
const ctx = await b.createBrowserContext(); const ph = await ctx.newPage(); await prep(ph, { css: CSS });
await ph.setViewport({ width: 390, height: 844, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
await ph.goto(B + "/", { waitUntil: "networkidle0" });
console.log("pro", (await api(ph, "/api/auth/demo", { as: "pro", pro: L.job.pro, pin: process.env.DONE_DEMO_PRO_PIN || "8642" })).status);
await ph.goto(`${B}/pro/jobs/${L.job.id}`, { waitUntil: "networkidle0" }); await settle(ph, 1500);
await ph.evaluate(() => { for (const d of document.querySelectorAll("main details")) d.open = true; });
await eager(ph); await settle(ph, 1200);
const q = { pageH: await pageH(ph) }; for (const [k, s] of Object.entries({ h2: "main h2, main h3", panels: ".panel", thumbs: ".thumbs", cond: ".cond", stamp: ".stamp", doc: ".doc" })) q[k] = await boxes(ph, s, true);
q.slices = await slices(ph, `phone-${name}`);
L.states[name].phone = q;
fs.writeFileSync(path.join(DIR, "layout.json"), JSON.stringify(L, null, 1));
await b.close(); console.log("ok", name, m.pageH, q.pageH);
