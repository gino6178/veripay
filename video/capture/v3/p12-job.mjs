// Phase 12 (film v4, shot 3): DP-1002's own job page on the sandbox server (8840), as Maria: her request in her own
// words and the work order ("by MODEL", "edited by the customer"), captured as slices at 150% (no text edited).
import path from "node:path";
import fs from "node:fs";
import { launch, page, api, settle, eager, log, st, T, B, OUT, pageH } from "./lib3.mjs";
const S = st().m;
const b = await launch();
const c = await page(b);
log("maria", (await api(c, "/api/auth/demo", { person: S.person, pin: T.customerPin })).status);
await c.goto(`${B}/jobs/${S.job}`, { waitUntil: "networkidle0" }); await eager(c); await settle(c, 2500);
await c.evaluate(() => { for (const d of document.querySelectorAll("main details")) d.open = true; });
await settle(c, 600);
const H = await pageH(c), W = await c.evaluate(() => document.documentElement.clientWidth), SL = 1600, out = [];
for (let y = 0, i = 0; y < H && i < 6; y += SL, i++) { const h = Math.min(SL, H - y), file = `j1002-s${i}.png`; await c.screenshot({ path: path.join(OUT, file), clip: { x: 0, y, width: W, height: h }, captureBeyondViewport: true }); out.push({ file, y, h }); }
// where the request and the work order are on the page (CSS px), for framing
const marks = await c.evaluate(() => { const r = (el) => { if (!el) return null; const b = el.getBoundingClientRect(); return { x: Math.round(b.x), y: Math.round(b.y + scrollY), w: Math.round(b.width), h: Math.round(b.height), text: el.innerText.slice(0, 120) }; };
  const all = [...document.querySelectorAll("main *")];
  const find = (re) => all.filter((e) => re.test(e.innerText || "") && e.children.length < 40).sort((a, b) => a.innerText.length - b.innerText.length)[0];
  return { request: r(find(/Kitchen faucet keeps dripping/)), doneWhen: r(find(/^\s*Done when/)), byModel: r(find(/work order by MODEL/i)) }; });
fs.writeFileSync(path.join(OUT, "j1002.json"), JSON.stringify({ pageH: H, width: W, slices: out, marks }, null, 1));
log("slices", out.length, JSON.stringify(marks).slice(0, 400));
await b.close();
