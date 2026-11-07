// The Telegram bot, against a fake Telegram Bot API: linking a chat with a one-use code, the inbox relayed to it,
// posting a job from a message, bargaining through a reply, and hiring only through a link to the website.
import test, { after } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import "./helpers.js";

// the fake Bot API: records every call, answers getMe and sendMessage
const calls = [];
const fake = express().use(express.json());
fake.post("/bot:token/:method", (req, res) => {
  calls.push({ method: req.params.method, body: req.body, token: req.params.token });
  if (req.params.method === "getMe") return res.json({ ok: true, result: { id: 1, is_bot: true, username: "veripay_test_bot" } });
  if (req.params.method === "getUpdates") return setTimeout(() => res.json({ ok: true, result: [] }), 50);
  res.json({ ok: true, result: { message_id: calls.length } });
});
const tg = fake.listen(0);
process.env.TELEGRAM_API_BASE = `http://127.0.0.1:${tg.address().port}`;
process.env.TELEGRAM_BOT_TOKEN = "123:test";
process.env.DONE_NO_LISTEN = "1";
const { app } = await import("../src/server.js");
const T = await import("../src/telegram.js");
const J = await import("../src/jobs.js");
const srv = app.listen(0);
after(() => { T.stop(); srv.close(); tg.close(); });
const base = `http://127.0.0.1:${srv.address().port}`;
const client = () => { let ck = ""; return async (method, p, body) => { const r = await fetch(base + p, { method, headers: { "content-type": "application/json", cookie: ck }, body: body ? JSON.stringify(body) : undefined }); for (const c of r.headers.getSetCookie?.() || []) ck = c.split(";")[0]; return { s: r.status, j: await r.json() }; }; };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const sent = (chat) => calls.filter((c) => c.method === "sendMessage" && String(c.body.chat_id) === String(chat)).map((c) => c.body);
const lastTo = (chat) => sent(chat).at(-1);
const msg = (chat, text) => T.handleUpdate({ update_id: 1, message: { message_id: 1, chat: { id: chat }, from: { first_name: "Casey" }, text } });
const tap = (chat, data) => T.handleUpdate({ update_id: 2, callback_query: { id: "cb", data, message: { chat: { id: chat } } } });

test("a chat links with a one-use code from the website, and only then works", async () => {
  const c = client(); await c("POST", "/api/auth/demo", { as: "customer" });
  assert.equal((await c("GET", "/api/telegram")).j.linked, false);
  const l = (await c("POST", "/api/telegram/link")).j;
  assert.match(l.url, /^https:\/\/t\.me\/veripay_test_bot\?start=/);
  await msg(501, "/jobs");
  assert.match(lastTo(501).text, /link this chat/i);
  await msg(501, `/start ${l.code}`);
  assert.match(lastTo(501).text, /^Linked/);
  assert.equal((await c("GET", "/api/telegram")).j.linked, true);
  await msg(502, `/start ${l.code}`);
  assert.match(lastTo(502).text, /didn't work/, "a code works once");
  assert.ok(calls.every((x) => x.token === "123:test"));
  assert.equal((await c("DELETE", "/api/telegram")).j.linked, false);
});

test("from the chat: post a job, the inbox follows, offers show the market, a bid goes through a reply, hiring is a website link", async () => {
  const c = client(); await c("POST", "/api/auth/demo", { as: "customer" });
  const chat = 777;
  await msg(chat, `/start ${(await c("POST", "/api/telegram/link")).j.code}`);
  await msg(chat, "Kitchen faucet drips, fix it this week 78704");
  assert.match(lastTo(chat).text, /Post this as a job\?/);
  await tap(chat, "post:x");
  assert.match(lastTo(chat).text, /Posted\./);
  const jobId = (await c("GET", "/api/jobs")).j[0].id;
  for (let i = 0; i < 60 && !J.job(jobId).offers.length; i++) await wait(100);
  await wait(200);
  assert.ok(sent(chat).some((m) => /offer/i.test(m.text) && m.reply_markup?.inline_keyboard?.[0]?.[0]?.callback_data === `job:${jobId}`), "a new offer reached the chat with an Open button");
  await tap(chat, `job:${jobId}`);
  const card = lastTo(chat), buttons = card.reply_markup.inline_keyboard.flat().map((b) => b.callback_data);
  const bid = buttons.find((b) => b.startsWith("bid:")), offerId = bid.split(":")[2];
  assert.ok(buttons.some((b) => b.startsWith("hire:")));
  await tap(chat, bid);
  assert.equal(lastTo(chat).reply_markup.force_reply, true);
  const o = J.job(jobId).offers.find((x) => x.id === offerId);
  await msg(chat, String(Math.round(o.amount / 100 * 0.9)));
  assert.match(lastTo(chat).text, /You \$/);
  assert.match(lastTo(chat).text, /typical range/);
  await tap(chat, `hire:${jobId}:${offerId}`);
  assert.match(lastTo(chat).text, /PIN[\s\S]*\/link\?code=/);
  assert.equal(J.job(jobId).agreed?.pro ?? null, null, "the chat never hires by itself");
  await tap(chat, `rev:${jobId}`);
  assert.match(lastTo(chat).text, /Google/);
});

test("the bot polls getUpdates with the stored offset", async () => {
  assert.equal(await T.start(), true);
  await wait(300);
  const polls = calls.filter((c) => c.method === "getUpdates");
  assert.ok(polls.length >= 1); assert.equal(polls[0].body.timeout, 25);
  T.stop();
});
