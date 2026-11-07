// Phase 1 (shot 3): a customer named Maria types one sentence to her agent; the agent writes the work order.
// A separate account from the money job (her typed job is a normal job; the money story runs on the judges' tour job).
import { launch, page, api, shot, settle, save, log, wait, T, B } from "./lib3.mjs";
const SENT = "Kitchen faucet keeps dripping. Fix it this week, under $200.";
const b = await launch(); const p = await page(b);
const r = await api(p, "/api/auth/demo", { as: "customer", name: "Maria", zip: "78704", pin: T.customerPin }); log("signin", r.status);
await p.goto(B + "/", { waitUntil: "networkidle0" }); await settle(p, 1500);
await shot(p, "s3-hello");
const box = await p.$("textarea, input[type=text]");
await box.click(); await p.keyboard.type(SENT, { delay: 25 });
await shot(p, "s3-typed");
await p.keyboard.press("Enter");
// wait for the work order card
await p.waitForFunction(() => /work order/i.test(document.body.innerText) && /\$/.test(document.body.innerText), { timeout: 120000 }).catch(() => log("no work order text"));
await wait(4000);
await shot(p, "s3-workorder");
await shot(p, "s3-workorder-full", { full: true });
const th = await api(p, "/api/assistant/thread"); save({ m2: { person: r.body?.person?.id, thread: th.body?.messages?.map((m) => ({ from: m.from, text: m.text, card: m.card?.kind, job: m.job?.number })) } });
log(JSON.stringify(th.body?.messages?.map((m) => [m.from, m.card?.kind, m.job?.number, m.text?.slice(0, 80)])));
await b.close();
