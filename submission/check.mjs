// Look at the one-agent website on 8810 like a visitor: landing, Try it, type one sentence, wait for offers.
import path from "node:path";
import { createRequire } from "node:module";
const require = createRequire(path.join(process.env.PUPPETEER_FROM, "package.json"));
const puppeteer = require("puppeteer-core");
const B = "http://127.0.0.1:8810", O = "check";
const b = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: "new" });
const p = await b.newPage();
await p.setViewport({ width: 1440, height: 900 });
await p.goto(B + "/", { waitUntil: "networkidle0" });
await p.screenshot({ path: `${O}/1-landing.png` });
const click = async (re) => { const ok = await p.evaluate((s) => { const r = new RegExp(s, "i"); const el = [...document.querySelectorAll("button,a")].find((e) => r.test(e.textContent.trim())); if (el) { el.click(); return el.textContent.trim(); } return null; }, re); return ok; };
console.log("clicked", await click("^not now$"), await click("try it"));
await new Promise((r) => setTimeout(r, 4000));
console.log("pin", await click("got it|written it down")); await new Promise((r) => setTimeout(r, 3000)); await p.screenshot({ path: `${O}/2-thread.png` });
const box = await p.$("textarea, input[type=text]");
if (box) { await box.type("My bathroom sink drains slowly. Fix it this week, under $150."); await p.keyboard.press("Enter"); }
await new Promise((r) => setTimeout(r, 45000));
await p.screenshot({ path: `${O}/3-after-post.png` });
await new Promise((r) => setTimeout(r, 45000));
await p.screenshot({ path: `${O}/4-later.png`, fullPage: false });
await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
await new Promise((r) => setTimeout(r, 1500));
await p.screenshot({ path: `${O}/5-phone.png` });
await b.close();
