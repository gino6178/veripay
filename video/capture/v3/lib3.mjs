// v3 capture helpers: a desktop "150%" viewport (1280×720 CSS at 3× device pixels → crisp 3840×2160 textures that read
// as 150% browser zoom on a 1920×1080 frame) and the pro's phone (390×844 at 3×). Capture-only CSS hides the demo chrome
// (DEMO tag, CONTROLS, tour panel, clock note); everything else is the page as served.
import path from "node:path";
import fs from "node:fs";
import { launch, prep, settle, api, CAPTURE_CSS, eager, boxes, pageH } from "../lib.mjs";
export { launch, prep, settle, api, eager, boxes, pageH };
export const B = process.env.FILM_BASE || "http://localhost:8840";
export const HERE = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1"));
export const OUT = path.join(HERE, "../../public/textures/v3"); fs.mkdirSync(OUT, { recursive: true });
export const STATE = path.join(HERE, "state.json");
export const st = () => (fs.existsSync(STATE) ? JSON.parse(fs.readFileSync(STATE, "utf8")) : {});
export const save = (x) => fs.writeFileSync(STATE, JSON.stringify({ ...st(), ...x }, null, 1));
export const CSS = CAPTURE_CSS + " .pin-once { visibility: hidden !important; } ";
export const DESK = { width: 1280, height: 720, deviceScaleFactor: 3 };
export const PHONE = { width: 390, height: 844, deviceScaleFactor: 3, isMobile: true, hasTouch: true };
export const wait = (ms) => new Promise((r) => setTimeout(r, ms));
export const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
export async function page(b, vp = DESK) { const c = await b.createBrowserContext(); const p = await c.newPage(); await prep(p, { css: CSS }); await p.setViewport(vp); await p.goto(B + "/", { waitUntil: "networkidle0" }); return p; }
export async function shot(p, name, { full = false } = {}) { await eager(p); await settle(p, 900); const file = path.join(OUT, name + ".png"); await p.screenshot({ path: file, fullPage: full, captureBeyondViewport: full }); log("shot", name); return file; }
// the person's test values (PIN etc.) live in capture/film-test-values.json, never on screen or in logs
export const T = JSON.parse(fs.readFileSync(path.join(HERE, "../film-test-values.json"), "utf8"));
