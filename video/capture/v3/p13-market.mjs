// Phase 13 (film v5, the "find + bargain" shot): on the demo server (8810), a fresh customer's job: the pros near it,
// the review agent's read, a negotiation with the market bar, and one that stalls (the stuck warning). Element captures.
//   FILM_BASE=http://localhost:8810 node p13-market.mjs
import path from "node:path";
import fs from "node:fs";
import { launch, page, api, settle, eager, log, B, OUT, wait } from "./lib3.mjs";
const b = await launch();
const p = await page(b);
const noTop = () => p.addStyleTag({ content: ".top { display: none !important; }" });
log("signin", (await api(p, "/api/auth/demo", { as: "customer" })).status);
const j = (await api(p, "/api/jobs", { text: "My kitchen faucet keeps dripping. Get it fixed this week, under $300.", zip: "78704", budget: 300, requestOffers: true })).body;
log("job", j.number, j.id);
let v;
for (let i = 0; i < 90; i++) { v = (await api(p, `/api/jobs/${j.id}`)).body; if ((v.offers || []).length >= 3) break; await wait(2000); }
log("offers", v.offers.map((o) => `${o.pro.name} ${o.amount.usd}`).join(" · "));
async function el(sel, name) {
  const h = await p.$(sel);
  if (!h) { log("missing", sel); return null; }
  await h.evaluate((e) => e.scrollIntoView({ block: "center" })); await settle(p, 500);
  const file = path.join(OUT, name + ".png"); await h.screenshot({ path: file }); log("shot", name); return file;
}
const open = async () => { await p.goto(`${B}/jobs/${j.id}`, { waitUntil: "networkidle0" }); await noTop(); await eager(p); await settle(p, 1200); };
await open();
await el("section[aria-labelledby=h-near]", "n-near");
// the review agent
await p.evaluate(() => [...document.querySelectorAll("button")].find((x) => /^Check reviews/.test(x.textContent))?.click());
for (let i = 0; i < 20 && !(await p.$(".revs")); i++) await wait(500);
await settle(p, 800);
await el(".revs", "n-reviews");
// a negotiation that converges: bid 85% of the cheapest offer; the demo pro answers
const os = [...v.offers].sort((a, c) => a.amount.cents - c.amount.cents);
const good = os[0], bad = os.at(-1);
const r1 = (await api(p, `/api/jobs/${j.id}/offers/${good.id}/negotiate`, { move: "propose", amount: Math.round(good.amount.cents / 100 * 0.85) })).body;
log("bid", good.pro.name, r1.rounds?.map((x) => x.by + " " + x.amount).join(" > "));
// one that stalls: a lowball the pro walks away from
const r2 = (await api(p, `/api/jobs/${j.id}/offers/${bad.id}/negotiate`, { move: "propose", amount: Math.round(bad.amount.cents / 100 * 0.55) })).body;
log("lowball", bad.pro.name, r2.status, r2.stuck?.why || r2.error || "");
await open();
await el(`#offer-${good.id}`, "n-market");
await el(`#offer-${bad.id}`, "n-stuck");
fs.writeFileSync(path.join(OUT, "n-market.json"), JSON.stringify({ job: j.number, good: { pro: good.pro.name, rounds: r1.rounds, market: r1.market }, bad: { pro: bad.pro.name, status: r2.status, stuck: r2.stuck } }, null, 1));
await b.close();
