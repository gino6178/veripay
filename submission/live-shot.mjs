// The home page's live demo as a visitor sees it (8810), desktop and phone.
import path from "node:path";
import { createRequire } from "node:module";
const require = createRequire(path.join(process.env.PUPPETEER_FROM, "package.json"));
const puppeteer = require("puppeteer-core");
const b = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: "new" });
const p = await b.newPage(); await p.setViewport({ width: 1440, height: 1000 });
await p.goto("http://127.0.0.1:8810/", { waitUntil: "networkidle0" });
await p.evaluate(() => [...document.querySelectorAll("button")].find((e) => /^not now$/i.test(e.textContent.trim()))?.click());
await new Promise((r) => setTimeout(r, 2500));
await p.screenshot({ path: "check/live-desktop.png", fullPage: true });
await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true }); await new Promise((r) => setTimeout(r, 1500));
await p.screenshot({ path: "check/live-phone.png", fullPage: false });
await b.close();
