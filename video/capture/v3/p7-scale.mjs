// Phase 7 (shot 10): real screens for the depth features, on the film's second server (8841, a seeded month on the
// PayPal stand-in): a water heater job posted to the agent (milestones from the rules' multi-day template, 10% retained
// for the warranty), hired, the demo pro's materials change order and materials advance; the landlord's tenants page;
// a neighborhood group. Ids on these screens are the stand-in's: the film frames avoid them.
import { launch, page, api, shot, settle, save, log, wait, st, T } from "./lib3.mjs";
const B = "http://localhost:8841";
const b = await launch();
const go = async (p, u) => { await p.goto(B + u, { waitUntil: "networkidle0" }); await settle(p, 2500); };
const c = await (async () => { const cx = await b.createBrowserContext(); const p = await cx.newPage(); const { prep } = await import("../lib.mjs"); const { CSS, DESK } = await import("./lib3.mjs"); await prep(p, { css: CSS }); await p.setViewport(DESK); await p.goto(B + "/", { waitUntil: "networkidle0" }); return p; })();
log("signin", (await api(c, "/api/auth/demo", { as: "customer", name: "Dana", zip: "78704", pin: T.customerPin })).status);
await api(c, "/api/limits", { perJobMax: 2500, changeMax: 25 }, "PUT");
let r = await api(c, "/api/assistant/message", { text: "Replace my old 40-gallon water heater next week, $1,800 max." });
let job = null;
for (let i = 0; i < 40 && !job; i++) { const t = (await api(c, "/api/assistant/thread")).body; job = t.messages.find((m) => m.card?.kind === "work_order")?.job?.id; if (!job) await wait(2000); }
log("job", job);
r = await api(c, `/api/jobs/${job}/scope`, { options: { retainPct: 10, warrantyDays: 30, releaseMode: "instant" } }, "PATCH"); log("options", r.status, r.body?.error || "");
for (let i = 0; i < 40; i++) { const j = (await api(c, `/api/jobs/${job}`)).body; if ((j.offers || []).filter((o) => o.status === "open").length >= 2) break; await wait(3000); }
let j = (await api(c, `/api/jobs/${job}`)).body; const best = j.offers.filter((o) => o.status === "open").sort((a, b) => a.amount.cents - b.amount.cents)[0];
r = await api(c, `/api/jobs/${job}/offers/${best.id}/accept`, { payWith: "card" }); log("hire", r.status, r.body?.status || r.body?.error);
await go(c, "/"); await shot(c, "s10-thread-hired", { full: true });
await go(c, `/jobs/${job}`); await c.evaluate(() => { for (const d of document.querySelectorAll("main details")) d.open = true; }); await shot(c, "s10-job-milestones", { full: true });
// the demo pro: to the job's window, then its own steps (start, the materials change order, the advance)
await api(c, "/api/demo/advance", { hours: 14 });
for (let k = 0; k < 4; k++) {
  r = await api(c, `/api/jobs/${job}/demo-finish`, {}); log("finish", r.status, JSON.stringify((r.body?.demo?.steps || []).map((s) => s.did || s.waiting || s.error)).slice(0, 300));
  j = (await api(c, `/api/jobs/${job}`)).body;
  const co = j.changeOrders.find((x) => x.kind === "materials");
  if (co && co.status === "pending") { r = await api(c, `/api/jobs/${job}/changes/${co.id}/approve`, {}); log("approve materials", r.status, r.body?.error || ""); }
  const adv = j.changeOrders.find((x) => x.advance)?.advance;
  if (adv) { log("advance", adv.status); if (adv.status === "awaiting_customer") { await go(c, "/"); await shot(c, "s10-thread-advance", { full: true }); const cid = j.changeOrders.find((x) => x.advance).id; r = await api(c, `/api/jobs/${job}/changes/${cid}/advance/approve`, {}); log("advance approve", r.status, r.body?.error || ""); } if (["paid", "checked"].includes(adv.status) || k > 1) break; }
  await wait(2000);
}
await go(c, "/"); await shot(c, "s10-thread-materials", { full: true });
await go(c, `/jobs/${job}`); await c.evaluate(() => { for (const d of document.querySelectorAll("main details")) d.open = true; }); await shot(c, "s10-job-materials", { full: true });
save({ scale: { job, number: j.number } });
// landlord and tenants; a neighborhood group
const l = await (async () => { const cx = await b.createBrowserContext(); const p = await cx.newPage(); const { prep } = await import("../lib.mjs"); const { CSS, DESK } = await import("./lib3.mjs"); await prep(p, { css: CSS }); await p.setViewport(DESK); await p.goto(B + "/", { waitUntil: "networkidle0" }); return p; })();
log("landlord", (await api(l, "/api/auth/demo", { as: "landlord", demo: true, pin: process.env.DONE_DEMO_LANDLORD_PIN || "9753" })).status);
await go(l, "/tenancy"); await shot(l, "s10-tenancy", { full: true });
await go(l, "/"); await shot(l, "s10-landlord-thread", { full: true });
const g = await (async () => { const cx = await b.createBrowserContext(); const p = await cx.newPage(); const { prep } = await import("../lib.mjs"); const { CSS, DESK } = await import("./lib3.mjs"); await prep(p, { css: CSS }); await p.setViewport(DESK); await p.goto(B + "/", { waitUntil: "networkidle0" }); return p; })();
const cs = (await api(g, "/api/demo/customers")).body || [];
for (const x of cs) { const s = await api(g, "/api/auth/demo", { person: x.id, pin: process.env.DONE_SEED_PIN || "2468" }); if (s.status !== 200) continue; const gg = (await api(g, "/api/groups")).body; if ((gg?.groups || []).length) { await go(g, "/groups"); await shot(g, "s10-groups", { full: true }); break; } }
await b.close();
