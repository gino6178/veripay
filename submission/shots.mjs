// Screens for the cover and the video, from the running demo server (8810): a judge-tour job paid end to end, seen by
// the customer (desktop) and by the pro (phone).
//   PUPPETEER_FROM=D:/COmp2/shuttle-analyst/deck node submission/shots.mjs
import { createRequire } from "node:module";
import path from "node:path";
const require = createRequire(path.join(process.env.PUPPETEER_FROM, "package.json"));
const puppeteer = require("puppeteer-core");
const HERE = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1")), B = "http://127.0.0.1:8810";
const browser = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: "new" });
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
await page.goto(B + "/", { waitUntil: "networkidle0" });
// the tour, as a demo customer (its own cookie), to a paid job
const job = await page.evaluate(async () => {
  const t = (step, job) => fetch("/api/demo/tour", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ step, job }) }).then((r) => r.json());
  let r = await t("start"); const id = r.id;
  for (const s of ["hire", "start_work", "change", "approve_change", "evidence", "release"]) r = await t(s, id);
  return { id, status: r.status, pro: r.agreed?.pro?.id || r.agreed?.pro };
});
console.log("tour job", job);
await page.goto(`${B}/jobs/${job.id}`, { waitUntil: "networkidle0" });
await new Promise((r) => setTimeout(r, 2500));
await page.screenshot({ path: path.join(HERE, "shot-job.png") });
await page.goto(B + "/", { waitUntil: "networkidle0" });
await new Promise((r) => setTimeout(r, 1500));
await page.screenshot({ path: path.join(HERE, "shot-home.png") });
// the pro, on a phone
const ctx = await browser.createBrowserContext(), phone = await ctx.newPage();
await phone.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await phone.goto(B + "/", { waitUntil: "networkidle0" });
await phone.evaluate((pro) => fetch("/api/auth/demo", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ as: "pro", pro, pin: "8642" }) }), job.pro);
await phone.goto(`${B}/pro/jobs/${job.id}`, { waitUntil: "networkidle0" });
await new Promise((r) => setTimeout(r, 2500));
await phone.screenshot({ path: path.join(HERE, "shot-pro-phone.png") });
await browser.close();
console.log("saved shots");
