// The film's job flow on the film's own server (8840), captured state by state.
//   node flow.mjs [tag]       -> public/textures/flow-<tag>/...  (+ layout.json)
// Maria (demo customer, her own test PIN from film-test-values.json, never on screen) types the sentence on Post a job;
// the same sentence starts the judges' tour job; the demo agent negotiates and hires on the website; the tour's pro
// starts work and asks for a change order; Maria approves it with her PIN on the website (10+ min after sign-in, so the
// step-up has lapsed and the PIN dialog shows); the tour's pro sends the evidence; the checks run; we capture whatever
// the server decides (nothing is faked). The pro's phone view (390 px) is captured at each stage.
import path from "node:path";
import fs from "node:fs";
import { launch, prep, settle, api, B, HERE, boxes, pageH, CAPTURE_CSS } from "./lib.mjs";
const tag = process.argv[2] || "dry";
const T = JSON.parse(fs.readFileSync(path.join(HERE, "film-test-values.json"), "utf8"));
const DIR = path.join(HERE, "../public/textures", "flow-" + tag); fs.mkdirSync(DIR, { recursive: true });
const SENT = "My kitchen faucet keeps dripping. Get it fixed this week, under $200.";
const LAYOUT = { tag, at: new Date().toISOString(), states: {} };
const save = () => fs.writeFileSync(path.join(DIR, "layout.json"), JSON.stringify(LAYOUT, null, 1));
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
// never let a shown-once PIN reach a capture
const CSS = CAPTURE_CSS + " .pin-once { visibility: hidden !important; } ";

const b = await launch();
const pg = await b.newPage(); await prep(pg, { css: CSS });
await pg.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 2 });
await pg.goto(B + "/", { waitUntil: "networkidle0" });
const t0 = Date.now();
const si = await api(pg, "/api/auth/demo", { as: "customer", name: T.customerName, zip: T.zip, pin: T.customerPin });
log("signed in", si.status);

// what to measure on the desktop job page
const SEL = {
  head: ".wo-head", rail: "[class*='rail']", panels: ".panel", h2: "main h2, main h3", checks: ".check-row", stamps: ".stamp-slot",
  saw: ".saw", signals: ".signals", ids: ".ids", thread: ".thread", offers: "#offers, [id='offers']", src: ".src", note: ".note", amt: ".big-amt", offer: ".offer", fair: ".fair", msgs: ".thread > *", spec: ".spec", aside: "aside, .wo-side",
};
async function measure(name) {
  const m = { pageH: await pageH(pg) };
  for (const [k, s] of Object.entries(SEL)) m[k] = await boxes(pg, s, true);
  LAYOUT.states[name] = { ...(LAYOUT.states[name] || {}), desktop: m }; save();
  return m;
}
// Chrome garbles single screenshots taller than ~16k device px, so pages are saved as stacked slices of SLICE CSS px
const SLICE = 1600;
async function slices(p, name) {
  const H = await pageH(p), W = await p.evaluate(() => document.documentElement.clientWidth), out = [];
  for (let y = 0, i = 0; y < H; y += SLICE, i++) {
    const h = Math.min(SLICE, H - y), file = `${name}-s${i}.png`;
    await p.screenshot({ path: path.join(DIR, file), clip: { x: 0, y, width: W, height: h }, captureBeyondViewport: true });
    out.push({ file, y, h });
  }
  return out;
}
// full page at 1x (overview) + full page at 2x (texture for push-ins)
async function desk(name, { full2x = true } = {}) {
  await settle(pg, 1500);
  // open the folded parts (agents' messages, ledger, PayPal ids, timeline, signals) so the capture shows them
  await pg.evaluate(() => { for (const d of document.querySelectorAll("main details")) d.open = true; scrollTo(0, 0); });
  await settle(pg, 800);
  const m = await measure(name);
  m.slices = await slices(pg, name); save();
  log("desk", name);
}

// ---- 1. Post a job: typed char by char, viewport frames (2x) ----------------------------------------------------------
await pg.goto(B + "/post", { waitUntil: "networkidle0" }); await settle(pg, 1200);
fs.mkdirSync(path.join(DIR, "type"), { recursive: true });
const say = await boxes(pg, "#say"); LAYOUT.states.post = { say: say[0], pageH: await pageH(pg) }; save();
await pg.click("#say");
await pg.screenshot({ path: path.join(DIR, "type", "t000.png") });
for (let i = 0; i < SENT.length; i++) {
  await pg.keyboard.type(SENT[i]);
  if (i % 2 === 1 || i === SENT.length - 1) await pg.screenshot({ path: path.join(DIR, "type", `t${String(i + 1).padStart(3, "0")}.png`) });
}
log("typed");
await pg.keyboard.press("Enter");
await pg.waitForFunction(() => document.querySelectorAll(".say.done").length > 1 && !document.querySelector(".chat .skel"), { timeout: 180000 });
await settle(pg, 1500);
LAYOUT.states.postWo = { panels: await boxes(pg, ".panel", true), say: await boxes(pg, ".say", true), fields: await boxes(pg, ".field", true), pageH: await pageH(pg) }; save();
LAYOUT.states.postWo.slices = await slices(pg, "post-wo"); save();
log("post work order");

// ---- 2. the tour job from the same sentence -------------------------------------------------------------------------
let r = await api(pg, "/api/demo/tour", { step: "start" }); // the tour's own sentence (its photo library matches it)
const id = r.body.id; LAYOUT.job = { id, number: r.body.number }; save();
log("tour job", r.body.number, r.body.status, (r.body.offers || []).length, "offers");
await pg.goto(B + "/jobs/" + id, { waitUntil: "networkidle0" });
await desk("offered");

// ---- 3. the demo agent negotiates and hires (website button) -------------------------------------------------------
await pg.evaluate(() => { const d = [...document.querySelectorAll("details")].find((x) => /NEGOTIATE/i.test(x.innerText)); if (d) { d.open = true; d.scrollIntoView({ block: "center" }); } });
await settle(pg, 600);
await pg.screenshot({ path: path.join(DIR, "negotiate-open.png") });
await pg.evaluate(() => document.querySelector("[data-tour='auto-hire']")?.click());
await pg.waitForFunction(() => /held|Held/.test(document.body.innerText) && !/Pick an offer/.test(document.body.innerText), { timeout: 120000 }).catch(() => log("no held text seen"));
await desk("held");

// ---- 4. the pro: phone view helper ----------------------------------------------------------------------------------
const job = (await api(pg, "/api/jobs/" + id)).body;
const proId = job.agreed?.pro?.id || job.agreed?.pro; LAYOUT.job.pro = proId; LAYOUT.job.proName = job.agreed?.proName; save();
const ctx = await b.createBrowserContext(); const ph = await ctx.newPage(); await prep(ph, { css: CSS });
await ph.setViewport({ width: 390, height: 844, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
await ph.goto(B + "/", { waitUntil: "networkidle0" });
const ps = await api(ph, "/api/auth/demo", { as: "pro", pro: proId, pin: process.env.DONE_DEMO_PRO_PIN || "8642" }); log("pro signed in", ps.status);
async function phone(name) {
  await ph.goto(`${B}/pro/jobs/${id}`, { waitUntil: "networkidle0" }); await settle(ph, 2500);
  const m = { pageH: await pageH(ph), panels: await boxes(ph, ".panel", true), h: await boxes(ph, "main h2, main h3", true), thumbs: await boxes(ph, ".thumbs", true), checks: await boxes(ph, ".check-row", true), stamps: await boxes(ph, ".stamp-slot", true) };
  await ph.evaluate(() => { for (const d of document.querySelectorAll("main details")) d.open = true; scrollTo(0, 0); }); await settle(ph, 600);
  m.pageH = await pageH(ph); m.panels = await boxes(ph, ".panel", true); m.thumbs = await boxes(ph, ".thumbs", true); m.checks = await boxes(ph, ".check-row", true); m.h = await boxes(ph, "main h2, main h3", true);
  m.slices = await slices(ph, `phone-${name}`);
  LAYOUT.states[name] = { ...(LAYOUT.states[name] || {}), phone: m }; save();
  log("phone", name);
}
await phone("held");

// ---- 5. work starts (BEFORE photos) and the change order ------------------------------------------------------------
r = await api(pg, "/api/demo/tour", { step: "start_work", job: id }); log("start_work", r.body.status || r.body.error);
await phone("working");
r = await api(pg, "/api/demo/tour", { step: "change", job: id }); log("change", r.body.status || r.body.error);
await phone("change");
await pg.goto(B + "/jobs/" + id, { waitUntil: "networkidle0" });
await desk("change");

// ---- 6. Maria approves the change order with her PIN (website), after the 10-minute step-up has lapsed ---------------
const lapse = 10.6 * 60e3 - (Date.now() - t0);
if (lapse > 0) { log("waiting for the step-up to lapse", Math.round(lapse / 1000), "s"); await wait(lapse); }
await pg.goto(B + "/jobs/" + id, { waitUntil: "networkidle0" }); await settle(pg, 1500);
const apBtn = await pg.evaluateHandle(() => [...document.querySelectorAll("button")].find((x) => /^Approve \+/.test(x.innerText.trim())));
if (apBtn && (await apBtn.evaluate((x) => !!x))) {
  await apBtn.evaluate((x) => x.scrollIntoView({ block: "center" })); await settle(pg, 500);
  await pg.screenshot({ path: path.join(DIR, "approve-before.png") });
  LAYOUT.states.approve = { btn: await apBtn.evaluate((e) => { const r = e.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; }), scrollY: await pg.evaluate(() => scrollY) }; save();
  await apBtn.click();
  const dlg = await pg.waitForSelector(".pin-in", { timeout: 15000 }).catch(() => null);
  if (dlg) {
    await settle(pg, 600);
    LAYOUT.states.approve.dialog = (await boxes(pg, "form.confirm"))[0]; LAYOUT.states.approve.scrollY2 = await pg.evaluate(() => scrollY); save();
    await pg.screenshot({ path: path.join(DIR, "pin-0.png") });
    for (let i = 0; i < T.customerPin.length; i++) { await pg.type(".pin-in", T.customerPin[i]); await pg.screenshot({ path: path.join(DIR, `pin-${i + 1}.png`) }); }
    await pg.evaluate(() => document.querySelector("form.confirm")?.requestSubmit());
    log("PIN submitted");
  } else { log("no PIN dialog (step-up still valid?)"); await pg.screenshot({ path: path.join(DIR, "approve-nopin.png") }); }
  await settle(pg, 3000);
} else log("no Approve button found");
await pg.goto(B + "/jobs/" + id, { waitUntil: "networkidle0" });
await desk("approved");

// ---- 7. evidence and the checks ------------------------------------------------------------------------------------
r = await api(pg, "/api/demo/tour", { step: "evidence", job: id }); log("evidence ->", r.body.status, r.body.tour?.ai?.says);
LAYOUT.result = { status: r.body.status, ai: r.body.tour?.ai || null }; save();
await phone("evidence");
await pg.goto(B + "/jobs/" + id, { waitUntil: "networkidle0" });
await desk("checked");
// the money panel, PayPal ids and ledger, measured again after any late refresh
await settle(pg, 4000); await desk("final");

await pg.goto(B + "/jobs/" + id, { waitUntil: "networkidle0" });
await b.close();
log("done", tag, LAYOUT.result?.status);
