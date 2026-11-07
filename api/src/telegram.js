// VeriPay on Telegram: a bot a person links from the website (a one-use code, 15 minutes). The linked chat gets their
// inbox as it happens, and works their jobs with the same tools a customer's agent has (tools.js): post a job, see
// offers with where each price sits, bargain, check reviews, ask nearby pros. Hiring holds money, so the bot never
// does it: it sends a one-use link to the website, where the person confirms with their own PIN.
// Long polling (getUpdates), so it needs no public URL. Off unless TELEGRAM_BOT_TOKEN is set.
import crypto from "node:crypto";
import { store, stateFile } from "./store.js";
import { onNotify } from "./inbox.js";
import { person } from "./people.js";
import { personLink } from "./auth.js";
import { CUSTOMER } from "./tools.js";
import * as J from "./jobs.js";
import { nowIso } from "./clock.js";

const db = store(stateFile("telegram"), { chats: {}, byPerson: {}, codes: {}, offset: 0 });
const save = () => db.save();
const sha = (s) => crypto.createHash("sha256").update(String(s)).digest("hex");
const token = () => process.env.TELEGRAM_BOT_TOKEN || "";
const base = () => (process.env.TELEGRAM_API_BASE || "https://api.telegram.org").replace(/\/$/, "");
const site = () => (process.env.PUBLIC_URL || `http://localhost:${process.env.PORT || 8810}`).replace(/\/$/, "");
export const telegramOn = () => !!token();
let me = null; // the bot's own account (getMe): its @username makes the t.me link

export async function call(method, body = {}) {
  const r = await fetch(`${base()}/bot${token()}/${method}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(method === "getUpdates" ? 40000 : 10000) });
  const j = await r.json().catch(() => ({}));
  if (!j.ok) throw new Error(`Telegram ${method}: ${j.description || r.status}`);
  return j.result;
}
const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const send = (chat, text, buttons = null, extra = {}) => call("sendMessage", { chat_id: chat, text: String(text).slice(0, 4000), parse_mode: "HTML", disable_web_page_preview: true, ...(buttons ? { reply_markup: { inline_keyboard: buttons } } : {}), ...extra }).catch((e) => console.error(e.message));
const btn = (text, data) => ({ text, callback_data: String(data).slice(0, 64) });

// ---- linking (the website makes the code; /start <code> in the chat redeems it) ----------------------------------
export async function botName() { if (!me && telegramOn()) me = await call("getMe").catch(() => null); return me?.username || null; }
export async function linkCode(personId) {
  if (!telegramOn()) return { error: "off", message: "Telegram isn't set up on this server (TELEGRAM_BOT_TOKEN)." };
  const code = crypto.randomBytes(9).toString("base64url"), expires = new Date(Date.now() + 15 * 60e3).toISOString();
  for (const [k, c] of Object.entries(db.data.codes)) if (c.person === personId || Date.parse(c.expires) < Date.now()) delete db.data.codes[k];
  db.data.codes[sha(code)] = { person: personId, expires };
  save();
  const u = await botName();
  return { code, expires, bot: u, url: u ? `https://t.me/${u}?start=${code}` : null, says: `Open the link (or send /start ${code} to the bot) within 15 minutes.` };
}
export function statusOf(personId) {
  const chat = db.data.byPerson[personId], c = chat ? db.data.chats[chat] : null;
  return { on: telegramOn(), bot: me?.username || null, linked: !!c, ...(c ? { since: c.linkedAt, name: c.name || null } : {}) };
}
export function unlink(personId) {
  const chat = db.data.byPerson[personId];
  if (chat) { delete db.data.chats[chat]; delete db.data.byPerson[personId]; save(); send(chat, "This chat is no longer linked to VeriPay."); }
  return statusOf(personId);
}
function redeem(chat, code, from) {
  const k = sha(code), c = db.data.codes[k];
  if (!c || Date.parse(c.expires) < Date.now()) return null;
  delete db.data.codes[k];
  const old = db.data.byPerson[c.person];
  if (old && old !== String(chat)) delete db.data.chats[old];
  db.data.chats[chat] = { person: c.person, linkedAt: nowIso(), name: [from?.first_name, from?.last_name].filter(Boolean).join(" ") || null };
  db.data.byPerson[c.person] = String(chat);
  save();
  return c.person;
}

// ---- the inbox, relayed ------------------------------------------------------------------------------------------
onNotify((item) => {
  const chat = telegramOn() && db.data.byPerson[item.person];
  if (!chat) return;
  // what the person just did from this chat isn't news to them (their own moves, made as the Telegram agent); offers and
  // the pros' answers always are, whoever's request set them off
  if (item.actor?.kind === "agent" && item.actor.client === "Telegram" && !/^offer/.test(item.action) && !(item.action === "negotiation_move" && /agent proposed|'s agent/.test(item.body || "") && !/customer's side/.test(item.body || ""))) return;
  const j = item.job && J.job(item.job), mineJob = j && j.customer === item.person;
  const buttons = mineJob ? [[btn(`Open ${j.number}`, `job:${j.id}`)]] : null;
  send(chat, `<b>${esc(item.title)}</b>\n${esc(item.body)}`, buttons);
});

// ---- what the chat can do -----------------------------------------------------------------------------------------
const agent = (personId) => ({ person: personId, client: "Telegram", scopes: null });
const HELP = [
  "<b>VeriPay on Telegram</b>",
  "Describe a job in a message (\"kitchen faucet drips, 78704\") and I'll post it.",
  "/jobs: your jobs", "/help: this list",
  "On a job: see offers and where each price sits, bargain, check reviews, ask pros nearby. Hiring opens VeriPay, where you confirm with your PIN.",
].join("\n");

async function jobsText(personId) {
  const js = (await CUSTOMER.my_jobs(agent(personId))).slice(-8).reverse();
  if (!js.length) return ["No jobs yet. Describe one in a message and I'll post it.", null];
  return [`<b>Your jobs</b>\n${js.map((x) => `${x.number} · ${esc(x.title)} · ${x.status}`).join("\n")}`, js.map((x) => [btn(`${x.number} · ${x.title}`.slice(0, 40), `job:${x.id}`)])];
}
async function jobCard(personId, id) {
  const v = await CUSTOMER.job_status(agent(personId), { job: id });
  if (v.error) return [esc(v.message), null];
  const offers = (v.offers || []).filter((o) => ["open", "countered", "accepted"].includes(o.status));
  const lines = [`<b>${v.number} · ${esc(v.scope?.title)}</b>`, `${v.status}${v.scope?.priceCeiling ? ` · ceiling ${v.scope.priceCeiling.usd}` : ""}`, v.next ? `Next: ${esc(v.next)}` : null];
  const buttons = [];
  offers.forEach((o, i) => {
    const n = o.negotiation;
    lines.push("", `<b>${i + 1}. ${esc(o.pro.name)}</b> ${o.amount.usd}${o.pro.rating != null ? ` · ${o.pro.rating}★` : ""}${o.miles != null ? ` · ${o.miles} mi` : ""}`);
    if (o.fair?.says) lines.push(esc(o.fair.says));
    if (n) lines.push(negText(n));
    const row = [];
    if (o.status === "open" && (!n || (n.status === "open" && n.yourTurn))) row.push(btn("Propose a price", `bid:${v.id}:${o.id}`));
    if (n?.status === "open" && n.yourTurn && n.last?.pro) row.push(btn(`Take ${n.last.pro}`, `take:${v.id}:${o.id}`));
    if (o.acceptable) row.push(btn(`Hire at ${o.amount.usd}`, `hire:${v.id}:${o.id}`));
    if (row.length) buttons.push(row);
  });
  if (!offers.length && ["scoped", "offered"].includes(v.status)) lines.push("", "No offers yet: pros' agents usually answer within a minute or two. I'll tell you when one comes in.");
  if (["scoped", "offered"].includes(v.status)) buttons.push([btn("Pros near the job", `near:${v.id}`), btn("Check reviews", `rev:${v.id}`)]);
  buttons.push([btn("Refresh", `job:${v.id}`)]);
  return [lines.filter((x) => x != null).join("\n"), buttons];
}
function negText(n) {
  const trail = n.rounds.map((r) => `${r.by === "pro" ? "Pro" : "You"} ${r.amount}`).join(" → ");
  const state = n.status === "agreed" ? `Agreed at ${n.price}` : n.status === "ended" ? "No more rounds" : n.yourTurn ? `your move, ${n.movesLeft.customer} left` : "their move";
  const out = [`${esc(trail)} (${state})`];
  if (n.market?.yours) out.push(`📊 ${esc(n.market.yours.says)}`);
  else if (n.market?.theirs) out.push(`📊 ${esc(n.market.theirs.says)}`);
  if (n.stuck) out.push(`⚠️ <b>No price agreed yet: ${esc(n.stuck.why)}</b> ${esc(n.stuck.suggest)}`);
  return out.join("\n");
}
async function nearText(personId, id) {
  const r = await CUSTOMER.find_nearby_pros(agent(personId), { job: id, limit: 6 });
  if (r.error) return [esc(r.message), null];
  const on = r.onVeriPay.map((p) => `• ${esc(p.name)} · ${p.miles} mi${p.rating != null ? ` · ${p.rating}★` : ""}${p.offered ? " · offered" : ""}`);
  const off = r.local.slice(0, 5).map((p) => `• ${esc(p.name)} · ${p.miles} mi${p.phone ? ` · ${esc(p.phone)}` : ""}`);
  const ask = r.onVeriPay.filter((p) => !p.offered).slice(0, 3).map((p) => [btn(`Ask ${p.name}`.slice(0, 40), `ask:${id}:${p.id}`)]);
  return [[`<b>On VeriPay</b>`, ...on, "", `<b>Listed nearby</b> (OpenStreetMap; VeriPay never contacts them, you do)`, ...off].join("\n"), ask.length ? ask : null];
}
async function reviewsText(personId, id) {
  const near = await CUSTOMER.find_nearby_pros(agent(personId), { job: id, limit: 6 });
  if (near.error) return esc(near.message);
  const ids = [...near.onVeriPay.slice(0, 2), ...near.local.slice(0, 3)].map((x) => x.id);
  const r = await CUSTOMER.check_reviews(agent(personId), { job: id, ids });
  if (r.error) return esc(r.message);
  const out = r.results.filter((x) => x.name).map((x) => [`<b>${esc(x.name)}</b>${x.rating != null ? ` ${Number(x.rating).toFixed(1)}★ (${x.count} ${x.countOf || "review"}${x.count === 1 ? "" : "s"})` : ""}`,
    x.read?.verdict ? esc(x.read.verdict) : null, x.read?.watch?.length ? `Watch: ${esc(x.read.watch.join(", "))}` : null, !x.available && !x.onVeriPay && x.mapsUrl ? `<a href="${esc(x.mapsUrl)}">Reviews on Google Maps</a>` : null].filter(Boolean).join("\n"));
  return [r.google === "on" ? null : "<i>Google reviews need the server's Google key; listed businesses link to Google Maps.</i>", ...out].filter(Boolean).join("\n\n");
}

async function onCallback(q) {
  const chat = String(q.message?.chat?.id), c = db.data.chats[chat];
  call("answerCallbackQuery", { callback_query_id: q.id }).catch(() => {});
  if (!c) return send(chat, "Link this chat from VeriPay first (Inbox → Telegram).");
  const [kind, id, x] = String(q.data || "").split(":");
  if (kind === "noop") return;
  if (kind === "job") { const [t, b] = await jobCard(c.person, id); return send(chat, t, b); }
  if (kind === "near") { const [t, b] = await nearText(c.person, id); return send(chat, t, b); }
  if (kind === "rev") return send(chat, await reviewsText(c.person, id));
  if (kind === "ask") { const r = await CUSTOMER.ask_pros(agent(c.person), { job: id, to: [x] }); const a = r.asked?.[0]; return send(chat, r.error ? esc(r.message) : a?.answer ? `<b>${esc(a.to?.name || "The pro")}:</b> ${esc(a.answer.text)}` : `Asked. ${esc(a?.says || "")}`); }
  if (kind === "post") { const t = c.draft; delete c.draft; save(); return t ? postJob(chat, c, t) : send(chat, "Describe the job again, please."); }
  if (kind === "bid") { c.pending = { kind: "bid", job: id, offer: x }; save(); return send(chat, "Your price in dollars? (Reply with a number, e.g. 170.)", null, { reply_markup: { force_reply: true, input_field_placeholder: "170" } }); }
  if (kind === "take") { const r = await CUSTOMER.accept_price(agent(c.person), { job: id, offer: x }); if (r.error) return send(chat, esc(r.message)); const [t, b] = await jobCard(c.person, id); return send(chat, `Agreed at ${r.price}. Hire to hold the money with PayPal.\n\n${t}`, b); }
  if (kind === "hire") {
    const j = J.job(id), o = j?.offers.find((y) => y.id === x);
    if (!j || j.customer !== c.person || !o) return send(chat, "That offer isn't there any more.");
    const l = personLink(c.person, { to: `/jobs/${id}`, what: `hire ${J.view(j).offers.find((y) => y.id === x)?.pro?.name || "the pro"} for ${j.number}`, hours: 1 });
    return send(chat, `Hiring holds the money with PayPal, so you confirm it on VeriPay with your PIN (one-use link, 1 hour):\n${esc(site() + l.url)}`);
  }
}
async function postJob(chat, c, text) {
  const zip = (text.match(/\b(\d{5})\b/) || [])[1] || person(c.person)?.zip || null;
  const r = await CUSTOMER.post_job(agent(c.person), { text, zip });
  if (r.error) return send(chat, esc(r.message));
  const [t, b] = await jobCard(c.person, r.id);
  return send(chat, `Posted. Pros' agents near ${esc(zip)} are quoting now.\n\n${t}`, b);
}
async function onMessage(m) {
  const chat = String(m.chat.id), text = String(m.text || "").trim();
  const start = text.match(/^\/start(?:@\w+)?\s+(\S+)/);
  if (start) {
    const p = redeem(chat, start[1], m.from);
    return send(chat, p ? `Linked to ${esc(person(p)?.name || "your VeriPay account")}. Your VeriPay inbox comes here now.\n\n${HELP}` : "That code didn't work (they last 15 minutes and work once). Make a new one on VeriPay: Inbox → Telegram.");
  }
  const c = db.data.chats[chat];
  if (!c) return send(chat, "Hi. To use VeriPay here, link this chat from the website: Inbox → Telegram → Connect.");
  if (/^\/(start|help)\b/.test(text)) return send(chat, HELP);
  if (/^\/jobs\b/.test(text)) { const [t, b] = await jobsText(c.person); return send(chat, t, b); }
  if (/^\/unlink\b/.test(text)) { unlink(c.person); return; }
  if (c.pending?.kind === "bid" && /^\$?\s*\d+(\.\d{1,2})?\s*$/.test(text)) {
    const { job, offer } = c.pending; delete c.pending; save();
    const r = await CUSTOMER.propose_price(agent(c.person), { job, offer, amount: +text.replace(/[$\s]/g, "") });
    if (r.error) return send(chat, esc(r.message));
    return send(chat, negText(r), [[btn("Open the job", `job:${job}`)]]);
  }
  if (text.startsWith("/")) return send(chat, HELP);
  if (text.length < 8) return send(chat, HELP);
  c.draft = text.slice(0, 1000); save();
  return send(chat, `Post this as a job?\n<i>${esc(c.draft)}</i>`, [[btn("Post it", "post:x"), btn("Not now", "noop:x")]]);
}
export async function handleUpdate(u) {
  try { if (u.callback_query) return await onCallback(u.callback_query); if (u.message?.text) return await onMessage(u.message); }
  catch (e) { console.error("telegram", e.message); }
}

// ---- polling -----------------------------------------------------------------------------------------------------
let running = false;
export async function start() {
  if (running || !telegramOn()) return false;
  running = true;
  for (let i = 0; i < 3 && !(await botName()); i++) await new Promise((r) => setTimeout(r, 2000));
  console.log(`Telegram: ${me?.username ? `@${me.username}` : "bot (name not read yet)"} polling`);
  (async () => {
    while (running) {
      try {
        const ups = await call("getUpdates", { offset: db.data.offset, timeout: 25, allowed_updates: ["message", "callback_query"] });
        for (const u of ups) { db.data.offset = u.update_id + 1; await handleUpdate(u); }
        if (ups.length) save();
      } catch (e) { if (running) { console.error(e.message); await new Promise((r) => setTimeout(r, 5000)); } }
    }
  })();
  return true;
}
export const stop = () => { running = false; };
export const _reset = () => { db.data.chats = {}; db.data.byPerson = {}; db.data.codes = {}; db.data.offset = 0; me = null; };
