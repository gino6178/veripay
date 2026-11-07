// Film v7, shot 12a ("a complete product: 28 pages for five roles"): one real page per role from the running demo
// server, each opened as its demo person (POST /api/demo/open). 1600x900 at 1.2x = 1920x1080; the pro's on a phone.
import { launch, prep } from "./lib.mjs";
const B = "http://127.0.0.1:8810", OUT = "D:/paypal/done/video/public/v7";
const SHOTS = [
  { name: "customer", feature: "held", go: "/" },          // the agent page with the job side panel
  { name: "pro", feature: "working", phone: true, es: true }, // the pro's job on a phone, in Spanish
  { name: "landlord", feature: "landlord" },
  { name: "dispute", feature: "dispute" },
  { name: "office", url: "/demo/office" },
  { name: "demo", url: "/demo" },
];
import fs from "node:fs";
fs.mkdirSync(OUT, { recursive: true });
const only = process.argv.slice(2);
const b = await launch();
for (const s of SHOTS) {
  if (only.length && !only.includes(s.name)) continue;
  const c = await b.createBrowserContext(), p = await c.newPage();
  await prep(p, { css: ".tour, .demo, .tour-tab, .pin-once, .ctl-ic, .toast { display: none !important; } body.tour-open .main { padding-right: var(--gutter) !important; }" });
  await p.setViewport(s.phone ? { width: 390, height: 844, deviceScaleFactor: 2.5, isMobile: true, hasTouch: true } : { width: 1600, height: 900, deviceScaleFactor: 1.2 });
  await p.goto(B + "/", { waitUntil: "load", timeout: 120000 });
  await p.evaluate(() => localStorage.setItem("done.tour", JSON.stringify({ step: 0, open: false, v: 2 })));
  let to = s.url;
  if (s.feature) to = await p.evaluate(async (f) => (await (await fetch("/api/demo/open", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ feature: f }) })).json()).to, s.feature);
  await p.goto(B + (s.go || to), { waitUntil: "load", timeout: 120000 });
  await new Promise((r) => setTimeout(r, 8000));
  await p.evaluate(() => document.body.classList.remove("tour-open"));
  if (s.es) { await p.evaluate(() => [...document.querySelectorAll("button")].find((x) => x.textContent.trim() === "ES")?.click()); await new Promise((r) => setTimeout(r, 2500)); }
  await p.screenshot({ path: `${OUT}/${s.name}.jpg`, type: "jpeg", quality: 88 });
  console.log(s.name, s.go || to);
  await c.close();
}
await b.close();
