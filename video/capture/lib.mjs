// Shared capture helpers: puppeteer-core from PUPPETEER_FROM, the film's own server (8840), capture-only CSS.
import { createRequire } from "node:module";
import path from "node:path";
import fs from "node:fs";
const require = createRequire(path.join(process.env.PUPPETEER_FROM || "D:/COmp2/shuttle-analyst/deck", "package.json"));
export const puppeteer = require("puppeteer-core");
export const B = process.env.FILM_BASE || "http://localhost:8840";
export const HERE = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1"));
export const OUT = path.join(HERE, "../public/textures");
fs.mkdirSync(OUT, { recursive: true });
// capture-only: hide the judge-tour panel/tab, the demo clock note and the demo panel button (they are demo chrome,
// not the product); "(demo)" labels stay because they are part of the page text.
export const CAPTURE_CSS = `
  .tour, .tour-tab, .clock-note, .demo, .demo-btn, .demo-pop, .demo-tag, .nav-demo, .toast, [class*="toast"] { display: none !important; }
  *, *::before, *::after { caret-color: transparent !important; }
`;
export async function launch() {
  return puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: "new", args: ["--hide-scrollbars", "--force-color-profile=srgb", "--lang=en-US"], env: { ...process.env, LANG: "en_US.UTF-8" } });
}
export async function prep(page, { css = CAPTURE_CSS } = {}) {
  await page.setExtraHTTPHeaders({ "Accept-Language": "en-US,en;q=0.9" });
  await page.evaluateOnNewDocument(() => { Object.defineProperty(navigator, "language", { get: () => "en-US" }); Object.defineProperty(navigator, "languages", { get: () => ["en-US", "en"] }); });
  await page.evaluateOnNewDocument((c) => {
    const add = () => { if (document.getElementById("film-css")) return; const s = document.createElement("style"); s.id = "film-css"; s.textContent = c; (document.head || document.documentElement).appendChild(s); };
    document.addEventListener("DOMContentLoaded", add); add();
    try { localStorage.setItem("dp-tour", JSON.stringify({ open: false, dismissed: true })); } catch {}
  }, css);
}
export const settle = async (page, ms = 900) => { await page.evaluate(() => document.fonts.ready); await new Promise((r) => setTimeout(r, ms)); };
export const api = (page, url, body, method = body ? "POST" : "GET") => page.evaluate(async (u, b, m) => { const r = await fetch(u, { method: m, headers: { "content-type": "application/json" }, body: b ? JSON.stringify(b) : undefined }); let j = null; try { j = await r.json(); } catch {} return { status: r.status, body: j }; }, url, body ?? null, method);
// element bboxes in page coordinates (for layout.json)
export const boxes = (page, sel, all = false) => page.evaluate((s, a) => {
  const els = a ? [...document.querySelectorAll(s)] : [document.querySelector(s)].filter(Boolean);
  return els.map((e) => { const r = e.getBoundingClientRect(); return { x: Math.round(r.left + scrollX), y: Math.round(r.top + scrollY), w: Math.round(r.width), h: Math.round(r.height), text: (e.innerText || "").slice(0, 80) }; });
}, sel, all);
export const pageH = (page) => page.evaluate(() => document.documentElement.scrollHeight);
// lazy images below the fold never load in a beyond-viewport capture: make them eager, walk the page, wait for decode
export async function eager(page) {
  await page.evaluate(async () => {
    for (const i of document.querySelectorAll("img")) i.loading = "eager";
    const H = document.documentElement.scrollHeight;
    for (let y = 0; y < H; y += 700) { scrollTo(0, y); await new Promise((r) => setTimeout(r, 60)); }
    scrollTo(0, 0);
    await Promise.all([...document.images].map((i) => (i.complete ? null : new Promise((r) => { i.onload = i.onerror = r; setTimeout(r, 4000); }))));
  });
}
