// The film's chat shot: drives the real Telegram bot code (src/telegram.js) against a stand-in Bot API, in memory, and
// writes what was said both ways (the person's messages, taps, and the bot's replies with their buttons) as JSON.
//   cd api && DONE_STATE_DIR=memory node scripts/chat-transcript.mjs ../video/src/v5/chat.json
import fs from "node:fs";
import express from "express";
process.env.DONE_STATE_DIR = "memory"; process.env.DONE_NO_LISTEN = "1"; process.env.DONE_DEMO_PRO_DELAY_MS = "1500";
const sent = [];
const fake = express().use(express.json());
fake.post("/bot:token/:method", (req, res) => {
  if (req.params.method === "getMe") return res.json({ ok: true, result: { id: 1, is_bot: true, username: "veripay_bot" } });
  if (req.params.method === "sendMessage") sent.push({ from: "bot", text: req.body.text, buttons: (req.body.reply_markup?.inline_keyboard || []).map((r) => r.map((b) => b.text)), data: (req.body.reply_markup?.inline_keyboard || []).flat().map((b) => b.callback_data), forceReply: !!req.body.reply_markup?.force_reply });
  res.json({ ok: true, result: {} });
});
const tg = fake.listen(0);
process.env.TELEGRAM_API_BASE = `http://127.0.0.1:${tg.address().port}`; process.env.TELEGRAM_BOT_TOKEN = "1:film";
const { app } = await import("../src/server.js");
const T = await import("../src/telegram.js"), J = await import("../src/jobs.js");
const srv = app.listen(0), base = `http://127.0.0.1:${srv.address().port}`;
let ck = "";
const c = async (m, p, b) => { const r = await fetch(base + p, { method: m, headers: { "content-type": "application/json", cookie: ck }, body: b ? JSON.stringify(b) : undefined }); for (const x of r.headers.getSetCookie?.() || []) ck = x.split(";")[0]; return r.json(); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const chat = 42, log = [];
const say = async (text) => { log.push({ from: "you", text }); await T.handleUpdate({ update_id: 1, message: { chat: { id: chat }, from: { first_name: "Maria" }, text } }); };
const tap = async (label, data) => { log.push({ from: "tap", text: label }); await T.handleUpdate({ update_id: 2, callback_query: { id: "x", data, message: { chat: { id: chat } } } }); };
const flush = () => { while (sent.length) log.push(sent.shift()); };
await c("POST", "/api/auth/demo", { as: "customer" });
const code = (await c("POST", "/api/telegram/link")).code;
await T.handleUpdate({ update_id: 0, message: { chat: { id: chat }, from: { first_name: "Maria" }, text: `/start ${code}` } });
sent.length = 0; // the linking reply isn't in the shot
await say("Kitchen faucet keeps dripping. Fix it this week, under $300. 78704"); flush();
await tap("Post it", "post:x"); flush();
const jobId = (await c("GET", "/api/jobs"))[0].id;
for (let i = 0; i < 60 && J.job(jobId).offers.length < 3; i++) await wait(250);
await wait(400); flush();
// keep only the first new-offer notice (the others say the same)
const offerNote = (m) => m.from === "bot" && /^<b>New offer/i.test(m.text);
const firstNote = log.findIndex(offerNote);
for (let i = log.length - 1; i > firstNote; i--) if (offerNote(log[i])) log.splice(i, 1);
await tap(`Open ${J.job(jobId).number}`, `job:${jobId}`); flush();
const card = log.at(-1), bid = card.data.find((d) => d.startsWith("bid:") && J.job(jobId).offers.find((o) => o.id === d.split(":")[2])?.amount === Math.min(...J.job(jobId).offers.map((o) => o.amount)));
await tap("Propose a price", bid); flush();
const o = J.job(jobId).offers.find((x) => x.id === bid.split(":")[2]);
await say(String(Math.round((o.amount / 100) * 0.88))); flush();
await tap(`Hire`, `hire:${jobId}:${o.id}`); flush();
for (const m of log) { delete m.data; if (m.text) m.text = m.text.replace(/http:\/\/localhost:\d+\/link\?code=\S+/, "veripay…/link?code=•••"); }
fs.writeFileSync(process.argv[2] || "chat.json", JSON.stringify(log, null, 1));
console.log(log.map((m) => `${m.from}: ${String(m.text).slice(0, 80).replace(/\n/g, " ⏎ ")}${m.buttons?.length ? `  [${m.buttons.flat().join(" | ")}]` : ""}`).join("\n"));
T.stop(); srv.close(); tg.close(); process.exit(0);
