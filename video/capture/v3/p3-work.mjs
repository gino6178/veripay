// Phase 3 (shots 6–7): the pro's phone thread while the money is held; the pro arrives and starts (tour step); the pro
// asks for the +$47.05 change order (tour step). Captures: the pro's thread (held, started, camera page) and Maria's
// thread with the change-order card (over her agent's $25 limit: Approve needs her PIN).
import { launch, page, api, shot, settle, save, log, wait, st, T, B, PHONE } from "./lib3.mjs";
const S = st().m, job = S.job;
const b = await launch();
const c = await page(b); log("resume", (await api(c, "/api/auth/demo", { person: S.person, pin: T.customerPin })).status);
const ph = await page(b, PHONE);
const pro = (await api(c, `/api/jobs/${job}`)).body.agreed.pro; const proId = pro?.id || pro;
log("pro", proId, (await api(ph, "/api/auth/demo", { as: "pro", pro: proId, pin: process.env.DONE_DEMO_PRO_PIN || "8642" })).status);
save({ m: { ...S, pro: proId } });
await ph.goto(B + "/", { waitUntil: "networkidle0" }); await settle(ph, 2500);
await shot(ph, "s7-pro-held"); await shot(ph, "s7-pro-held-full", { full: true });
let r = await api(c, "/api/demo/tour", { step: "start_work", job }); log("start_work", r.body.status || r.body.error);
await ph.goto(B + "/", { waitUntil: "networkidle0" }); await settle(ph, 2500);
await shot(ph, "s7-pro-started"); await shot(ph, "s7-pro-started-full", { full: true });
await ph.goto(`${B}/pro/jobs/${job}?camera=1`, { waitUntil: "networkidle0" }); await settle(ph, 2500);
await shot(ph, "s7-pro-camera");
r = await api(c, "/api/demo/tour", { step: "change", job }); log("change", r.body.status || r.body.error);
await wait(3000);
await c.goto(B + "/", { waitUntil: "networkidle0" }); await settle(c, 2500);
await shot(c, "s6-change"); await shot(c, "s6-change-full", { full: true });
const th = (await api(c, "/api/assistant/thread")).body.messages;
const co = th.filter((m) => m.card?.kind === "change_order").at(-1);
log("change card", co?.text, JSON.stringify(co?.actions?.map((a) => [a.label, a.needsPin])), JSON.stringify(co?.card?.data?.agentMayApprove));
await b.close();
