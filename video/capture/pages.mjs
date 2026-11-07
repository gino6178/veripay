// The montage and context pages on the film server (8840): /live-test, the back office (AG Grid), a pro's public work
// record with "Verify it now", the demo landlord's tenancy page, a neighborhood group, the photo credits, and home.
//   node pages.mjs [tag]   -> public/textures/pages-<tag>/
import path from "node:path";
import fs from "node:fs";
import { launch, prep, settle, api, B, HERE, boxes, pageH, CAPTURE_CSS } from "./lib.mjs";
const tag = process.argv[2] || "dry";
const DIR = path.join(HERE, "../public/textures", "pages-" + tag); fs.mkdirSync(DIR, { recursive: true });
const L = {}; const save = () => fs.writeFileSync(path.join(DIR, "layout.json"), JSON.stringify(L, null, 1));
// /live-test's intro names the test agents' vendor: the film is the website only, so the intro paragraph is hidden there
const CSS = CAPTURE_CSS + " .pin-once { visibility: hidden !important; } ";
const LIVE_CSS = CSS + " main > p.lede { display: none !important; } ";
const b = await launch();
async function ctxPage(css = CSS, vp = { width: 1920, height: 1080, deviceScaleFactor: 2 }) { const c = await b.createBrowserContext(); const p = await c.newPage(); await prep(p, { css }); await p.setViewport(vp); await p.goto(B + "/", { waitUntil: "networkidle0" }); return p; }
async function shot(p, name, url, { full = false, sels = {}, wait = 1500, before } = {}) {
  if (url) await p.goto(B + url, { waitUntil: "networkidle0" });
  await settle(p, wait);
  if (before) { await before(p); await settle(p, 1200); }
  const m = { pageH: await pageH(p) }; for (const [k, s] of Object.entries(sels)) m[k] = await boxes(p, s, true);
  L[name] = m; save();
  await p.screenshot({ path: path.join(DIR, name + ".png"), fullPage: full, captureBeyondViewport: full });
  console.log("ok", name);
}

// live-test: the stats and the per-round chart
{ const p = await ctxPage(LIVE_CSS); await shot(p, "livetest", "/live-test/", { sels: { stats: ".stat", chart: ".panel", h1: "h1" } });
  await p.evaluate(() => { const c = document.querySelector(".panel"); scrollTo(0, c.getBoundingClientRect().top + scrollY - 40); });
  await shot(p, "livetest-chart", null, { sels: { chart: ".panel", svg: ".panel svg" } }); }
// back office as demo staff
{ const p = await ctxPage(); const s = await api(p, "/api/auth/staff", {}); console.log("staff", s.status);
  await shot(p, "office", "/office", { full: true, wait: 4000, sels: { grid: ".ag-root-wrapper", h: "main h1, main h2, main h3", panels: ".panel", tabs: ".tabs" } });
  for (const [k, lab] of [["office-jobs", "Jobs"], ["office-holds", "Holds expiring"], ["office-payouts", "Payouts"]]) {
    await shot(p, k, null, { full: true, wait: 300, sels: { grid: ".ag-root-wrapper", tabs: ".tabs" }, before: async (q) => { await q.evaluate((l) => { scrollTo(0, 0); [...document.querySelectorAll(".tabs button")].find((e) => e.innerText.trim().startsWith(l))?.click(); }, lab); await new Promise((r) => setTimeout(r, 2500)); await q.evaluate(() => scrollTo(0, 0)); } }); } }
// a pro's public work record, then "Verify it now"
{ const p = await ctxPage(); const pros = (await api(p, "/api/pros")).body; let pro = process.env.FILM_PRO, best = -1;
  if (!pro) for (const x of (pros.pros || pros)) { const r = (await api(p, `/api/pros/${x.id}/record.json`)).body; const n = (r?.entries || r?.record?.entries || []).length; if (n > best) { best = n; pro = x.id; } }
  L.proId = pro; L.proEntries = best;
  await shot(p, "pro-record", `/pros/${pro}`, { full: true, sels: { panels: ".panel", btn: "button", h: "main h1, main h2, main h3" } });
  await shot(p, "pro-verified", null, { full: true, sels: { panels: ".panel", note: ".note", h: "main h1, main h2, main h3" }, before: async (q) => {
    await q.evaluate(() => { const x = [...document.querySelectorAll("button")].find((e) => /Verify it now/.test(e.innerText)); if (x) x.click(); });
    await new Promise((r) => setTimeout(r, 2500)); await q.evaluate(() => scrollTo(0, 0)); } }); }
// the demo landlord: tenancy
{ const p = await ctxPage(); const s = await api(p, "/api/auth/demo", { as: "landlord", demo: true, pin: process.env.DONE_DEMO_LANDLORD_PIN || "9753" }); console.log("landlord", s.status);
  await shot(p, "tenancy", "/tenancy", { full: true, sels: { panels: ".panel", h: "main h1, main h2, main h3" } }); }
// a neighborhood group: a seeded customer who is in it (seed PIN), found from the groups list
{ const p = await ctxPage(); const cs = (await api(p, "/api/demo/customers")).body || [];
  let done = false;
  for (const c of cs.filter((x) => /Casey|Riley|Sam|Jordan|Morgan|Avery|Taylor|Jamie|Drew|Alex|Priya|Chris/.test(x.name))) {
    const s = await api(p, "/api/auth/demo", { person: c.id, pin: process.env.DONE_SEED_PIN || "2468" }); if (s.status !== 200) continue;
    const g = (await api(p, "/api/groups")).body; if ((g?.groups || []).length) { L.groupAs = c.name; await shot(p, "groups", "/groups", { full: true, sels: { panels: ".panel", h: "main h1, main h2, main h3" } }); done = true; break; }
  }
  if (!done) console.log("no group found"); }
// photo credits
{ const p = await ctxPage(); await shot(p, "credits", "/credits", { full: true }); const c = await api(p, "/api/credits"); fs.writeFileSync(path.join(DIR, "credits.json"), JSON.stringify(c.body, null, 1)); }
// home (its hero shows a paid job once one exists on this server)
{ const p = await ctxPage(); await shot(p, "home", "/", { full: true, wait: 6000, sels: { hero: ".hero, main section", stamps: ".stamp-slot, [class*='stamp']" } }); }
await b.close();
