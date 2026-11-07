// Screenshots for the judges' demo page (web/public/shots/<feature>.jpg), taken from the running demo server: each
// feature opened as its demo person (POST /api/demo/open), the first screen at 1.5x; the pro's job on a phone.
import { launch, prep } from "./lib.mjs";
const B = "http://127.0.0.1:8810", OUT = "D:/paypal/done/web/public/shots";
const OPEN = ["ask", "negotiate", "extra", "offers", "held", "working", "needsfix", "paid", "dispute", "landlord", "groups", "home", "earnings", "connect"];
const LINKS = [["office", "/demo/office"], ["models", "/models"], ["tests", "/live-test/"]];
const PHONE = new Set(["working"]);
// where the feature is on its page: the screenshot starts there instead of at the top (and for the agent, a narrower crop)
const FOCUS = { ask: { text: "Can you send a photo", w: 960 }, negotiate: { text: "I negotiated", w: 960 }, extra: { text: "It's over your agent", w: 960, has: true }, offers: { text: "Lowest price", w: 1100, has: true }, held: { text: "The money", w: 1100 }, paid: { text: "The money", w: 1100 } };
const only = process.argv.slice(2);
const b = await launch();
async function shot(name, url, feature) {
  const c = await b.createBrowserContext(), p = await c.newPage();
  await prep(p, { css: ".tour, .demo, .tour-tab, .pin-once, .ctl-ic { display: none !important; } body.tour-open .main { padding-right: var(--gutter) !important; } header.top { position: absolute !important; } .toast { display: none !important; }" });
  const phone = PHONE.has(name);
  await p.setViewport(phone ? { width: 390, height: 780, deviceScaleFactor: 2.5, isMobile: true, hasTouch: true } : { width: 1440, height: 900, deviceScaleFactor: 1.5 });
  await p.goto(B + "/", { waitUntil: "load", timeout: 120000 });
  await p.evaluate(() => localStorage.setItem("done.tour", JSON.stringify({ step: 0, open: false, v: 2 })));
  let to = url;
  if (feature) to = await p.evaluate(async (f) => (await (await fetch("/api/demo/open", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ feature: f }) })).json()).to, feature);
  await p.goto(B + to, { waitUntil: "load", timeout: 120000 }); await new Promise((r) => setTimeout(r, 9000));
  await p.evaluate(() => document.body.classList.remove("tour-open"));
  const fo = FOCUS[name];
  if (fo) await p.waitForFunction((t) => document.querySelector("main")?.textContent.includes(t), { timeout: 90000 }, fo.text).catch(() => console.log("no", fo.text));
  const at = fo && await p.evaluate((t) => { const el = [...document.querySelectorAll("main h1, main h2, main h3, main p, main b, main div")].filter((e) => (t.has ? e.textContent.includes(t.text) : e.textContent.trim().startsWith(t.text))).sort((a, b) => a.textContent.length - b.textContent.length)[0]; if (!el) return null; const r = el.getBoundingClientRect(); return { y: r.top + scrollY, x: r.left + r.width / 2 }; }, { text: fo.text, has: !!fo.has });
  if (at) { const w = fo.w || 1440, h = Math.round(w * 10 / 16), x = Math.max(0, Math.min(1440 - w, at.x - w / 2)); await p.screenshot({ path: `${OUT}/${name}.jpg`, type: "jpeg", quality: 82, clip: { x: fo.w ? x : 0, y: Math.max(0, at.y - 90), width: w, height: h }, captureBeyondViewport: true }); }
  else await p.screenshot({ path: `${OUT}/${name}.jpg`, type: "jpeg", quality: 78 });
  console.log(name, to); await c.close();
}
for (const f of OPEN) if (!only.length || only.includes(f)) await shot(f, null, f);
for (const [n, u] of LINKS) if (!only.length || only.includes(n)) await shot(n, u);
await b.close();
