// VeriPay's server: the website's API for customers and pros, the same actions for their agents (MCP, REST, A2A),
// PayPal's return URLs and webhooks, the back office, the demo controls, and the built website. Configure with
// environment variables (api/.env). Without PayPal keys it runs against the PayPal stand-in (pay/mock.js) and says so.
// Every route and its JSON is in docs/API.md.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import compression from "compression";
import * as TG from "./telegram.js";
import os from "node:os";
import { execFileSync } from "node:child_process";

const HERE = path.dirname(fileURLToPath(import.meta.url));
// a small .env reader (before the modules that read the environment are imported)
for (const f of [path.join(HERE, "../.env")]) if (fs.existsSync(f)) for (const line of fs.readFileSync(f, "utf8").split(/\r?\n/)) { const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/); if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, ""); }

const { paypal } = await import("./pay/paypal.js");
const { mockPaypal } = await import("./pay/mock.js");
const { setPay, pp, usd, toCents, setHoldMode, getHoldMode } = await import("./pay/index.js");
const { agentOf, sessionOf, createSession, endSession, makeToken, tokensOf, revoke, can, scopeError, COOKIE, SCOPES, redeemLink, peekLink, checkPin, setPin, validPin, hasPin, stepUp, steppedUp, stepUpLeft, STEP_UP_MS, validEmail, validPassword, personByEmail, setPassword, checkPassword } = await import("./auth.js");
const { makePerson, person, updatePerson, limitsOf, viewPerson, DEFAULT_LIMITS, allPeople } = await import("./people.js");
const people_ = await import("./people.js");
const pros = await import("./pros.js");
const J = await import("./jobs.js");
const tools = await import("./tools.js");
const { forPerson, forRef, record } = await import("./activity.js");
const { advance, advanceMs, nowIso, skipped, clockStore } = await import("./clock.js");
const receipts = await import("./proof/receipts.js");
const mcp = await import("./mcp.js");
const { guide } = await import("./guide.js");
const { parseMultipart, readFile, withExif, exifOf } = await import("./evidence.js");
const { aiStatus, modelStatus } = await import("./ai.js");
const grid = await import("./grid.js");
const { DEMO_ASSETS, ASSET_DIR, freshPhoto, evidenceFor: demoEvidence, beforeFor: demoBefore, planVisit: demoPlan } = await import("./demoassets.js");
const demopro = await import("./demopro.js");
const alerts = await import("./alerts.js");
const recon = await import("./recon.js");
const disputes = await import("./disputes.js");
const plans = await import("./plans.js");
const invoices = await import("./invoices.js");
const schedules = await import("./schedules.js");
const inbox = await import("./inbox.js");
const i18n = await import("./i18n.js");
const mandates = await import("./proof/mandates.js");
const calendar = await import("./calendar.js");
const home = await import("./home.js");
const groups = await import("./groups.js");
const prodash = await import("./prodash.js");
const workrecord = await import("./workrecord.js");
const assistant = await import("./assistant.js");
const sim = await import("./sim.js");
const paylinks = await import("./paylinks.js");
const tickAll = async () => ({ paylinks: await paylinks.tick(), jobs: await J.tick(), schedules: await schedules.tick(), invoices: await invoices.tick(), plans: await plans.tick(), assistant: await (await import("./assistant.js")).tick() });

const PORT = +(process.env.PORT || 8810);
const PUBLIC_URL = (process.env.PUBLIC_URL || `http://localhost:${PORT}`).replace(/\/$/, "");
const DEMO = process.env.DEMO_SIGNIN !== "0";
const real = !!(process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET) && process.env.PAYPAL_MODE !== "mock";
setPay(real ? paypal({ clientId: process.env.PAYPAL_CLIENT_ID, secret: process.env.PAYPAL_CLIENT_SECRET, testCard: process.env.PAYPAL_TEST_CARD === "1" }) : mockPaypal({ publicUrl: "" }), PUBLIC_URL);
setHoldMode(process.env.HOLD_MODE);
receipts.setOrigin(process.env.LOG_ORIGIN || `${new URL(PUBLIC_URL).host}/done-receipts`);

const app = express();
app.set("trust proxy", "loopback");
app.disable("x-powered-by");
// gzip for pages, scripts and JSON over 1 KB (photos and PDFs are already compressed; compression skips them)
app.use(compression({ threshold: 1024 }));

// ---- PayPal webhooks: verified, then treated as a nudge (the platform asks PayPal for the state itself) ---------------
// every event VeriPay acts on; at startup (real PayPal) the list is checked against webhooks-event-types and any name
// PayPal doesn't know is dropped and logged, so a typo can't make PayPal refuse the webhook
let EVENTS = ["CHECKOUT.ORDER.APPROVED", "CHECKOUT.ORDER.COMPLETED", "PAYMENT.AUTHORIZATION.CREATED", "PAYMENT.AUTHORIZATION.VOIDED",
  "PAYMENT.CAPTURE.COMPLETED", "PAYMENT.CAPTURE.DENIED", "PAYMENT.CAPTURE.DECLINED", "PAYMENT.CAPTURE.PENDING", "PAYMENT.CAPTURE.REVERSED", "PAYMENT.CAPTURE.REFUNDED", "PAYMENT.REFUND.PENDING", "PAYMENT.REFUND.FAILED",
  "PAYMENT.PAYOUTSBATCH.SUCCESS", "PAYMENT.PAYOUTSBATCH.DENIED", "PAYMENT.PAYOUTS-ITEM.SUCCEEDED", "PAYMENT.PAYOUTS-ITEM.UNCLAIMED", "PAYMENT.PAYOUTS-ITEM.RETURNED", "PAYMENT.PAYOUTS-ITEM.FAILED", "PAYMENT.PAYOUTS-ITEM.BLOCKED", "PAYMENT.PAYOUTS-ITEM.HELD", "PAYMENT.PAYOUTS-ITEM.REFUNDED", "PAYMENT.PAYOUTS-ITEM.CANCELED",
  "CUSTOMER.DISPUTE.CREATED", "CUSTOMER.DISPUTE.UPDATED", "CUSTOMER.DISPUTE.RESOLVED", "INVOICING.INVOICE.PAID", "INVOICING.INVOICE.CANCELLED", "INVOICING.INVOICE.REFUNDED", "INVOICING.INVOICE.SCHEDULED", "INVOICING.INVOICE.UPDATED",
  "BILLING.SUBSCRIPTION.ACTIVATED", "BILLING.SUBSCRIPTION.SUSPENDED", "BILLING.SUBSCRIPTION.CANCELLED", "BILLING.SUBSCRIPTION.EXPIRED", "BILLING.SUBSCRIPTION.PAYMENT.FAILED", "PAYMENT.SALE.COMPLETED", "PAYMENT.SALE.REFUNDED", "PAYMENT.SALE.REVERSED",
  "VAULT.PAYMENT-TOKEN.CREATED", "VAULT.PAYMENT-TOKEN.DELETED", "VAULT.PAYMENT-TOKEN.DELETION-INITIATED", "MERCHANT.ONBOARDING.COMPLETED", "MERCHANT.PARTNER-CONSENT.REVOKED",
  "CUSTOMER.MERCHANT-INTEGRATION.SELLER-CONSENT-GRANTED", "CUSTOMER.MERCHANT-INTEGRATION.SELLER-EMAIL-CONFIRMED", "CUSTOMER.MERCHANT-INTEGRATION.CAPABILITY-UPDATED"];
let eventCheck = null;
if (real) pp().eventTypes().then((names) => { const known = new Set(names), bad = EVENTS.filter((e) => !known.has(e)); eventCheck = { at: nowIso(), paypalKnows: names.length, unknown: bad }; if (bad.length) { console.error("PayPal doesn't know these webhook events, dropped:", bad.join(", ")); EVENTS = EVENTS.filter((e) => known.has(e)); } }).catch((e) => { eventCheck = { at: nowIso(), error: e.message }; });
// DONE_NO_WEBHOOK=1: a temporary public URL (a tunnel) that shouldn't leave a webhook behind on the PayPal app
if (real && PUBLIC_URL.startsWith("https://") && !process.env.PAYPAL_WEBHOOK_ID && process.env.DONE_NO_WEBHOOK !== "1")
  pp().ensureWebhook(`${PUBLIC_URL}/paypal/webhook`, EVENTS).then((w) => { process.env.PAYPAL_WEBHOOK_ID = w.id; console.log(`PayPal webhook ${w.created ? "created" : "found"}: ${w.id}`); }).catch((e) => console.error("webhook setup:", e.message));
else if (real) console.log(`PayPal webhook: not registered (${process.env.DONE_NO_WEBHOOK === "1" ? "DONE_NO_WEBHOOK=1" : `${PUBLIC_URL} isn't public https; PayPal can't reach it`}). Return URLs and the minute tick keep state in step.`);
const webhookLog = [];
app.post("/paypal/webhook", express.raw({ type: "*/*", limit: "256kb" }), async (req, res) => {
  res.status(200).end();
  const raw = req.body.toString("utf8");
  try {
    if (real) {
      if (!process.env.PAYPAL_WEBHOOK_ID) { console.log("webhook: received but no PAYPAL_WEBHOOK_ID to verify it against; ignored"); return; }
      if (!(await pp().verifyWebhook(req.headers, raw, process.env.PAYPAL_WEBHOOK_ID))) { console.error("webhook: signature not verified, ignored"); return; }
    }
    await onEvent(JSON.parse(raw), { verified: real });
  } catch (e) { console.error("webhook:", e.message); }
});
// one PayPal event, verified (or simulated by staff): a nudge to look at PayPal's state; returns what it touched
async function onEvent(e, { verified = false, simulated = false, replayed = false } = {}) {
  const r = e.resource || {}, ref = r.custom_id || r.purchase_units?.[0]?.custom_id || r.purchase_units?.[0]?.reference_id, did = [];
  webhookLog.push({ at: nowIso(), type: e.event_type, id: e.id, ref: ref || null, verified, ...(simulated ? { simulated: true } : {}), ...(replayed ? { replayed: true } : {}) }); if (webhookLog.length > 100) webhookLog.shift();
  if (ref && J.job(ref) && J.job(ref).status === "agreed") { await J.confirmHold(ref, { kind: "paypal" }); did.push(`checked the hold of ${J.job(ref).number}`); }
  if (e.event_type?.startsWith("MERCHANT.") || e.event_type?.startsWith("CUSTOMER.MERCHANT-INTEGRATION.")) { const tid = r.tracking_id, mid = r.merchant_id, pr = pros.allPros?.().find((p) => p.merchant && (p.merchant.trackingId === tid || (mid && p.merchant.merchantId === mid))); if (pr) { await (await import("./onboarding.js")).sync(pr.id); did.push(`checked ${pr.name}'s PayPal merchant status`); } else did.push(`no pro has tracking id ${tid || "?"}`); }
  // the rest are nudges to look at that one thing in PayPal: a dispute's progress, an invoice, a plan's subscription
  if (/^CUSTOMER\.DISPUTE\.(UPDATED|RESOLVED)$/.test(e.event_type)) { const cap = r.disputed_transactions?.[0]?.seller_transaction_id, j = cap && disputes.jobOfCapture(cap); if (j) { await disputes.sync(j.id); did.push(`synced the PayPal dispute on ${j.number}`); } }
  if (e.event_type?.startsWith("INVOICING.INVOICE.")) { const inv = invoices.all().find((v) => v.paypal?.id && v.paypal.id === (r.invoice?.id || r.id)); if (inv) { await invoices.syncOne(inv); did.push(`checked ${inv.number} in PayPal`); } }
  if (e.event_type?.startsWith("BILLING.SUBSCRIPTION.") || e.event_type?.startsWith("PAYMENT.SALE.")) { const sid = r.billing_agreement_id || r.id, pl = plans.all().find((x) => x.paypal?.subscription === sid); if (pl) { await plans.sync(pl); did.push(`synced plan ${pl.number}`); } }
  // a capture PayPal declined, left pending or reversed; a refund pending or failed; a payout item that failed, was
  // blocked, held, refunded or cancelled; an approval reversed; a saved method deleted in PayPal: noted on the job (or
  // the person) and told to staff; the tick then follows up
  const capJob = (cid) => cid && J.allJobs().find((x) => x.hold?.capture === cid || x.money?.captures?.some((c) => c.id === cid));
  if (/^PAYMENT\.CAPTURE\.(DECLINED|DENIED|PENDING|REVERSED)$/.test(e.event_type)) { const j = capJob(r.id); if (j) { (j.paypalEvents ||= []).push({ at: nowIso(), type: e.event_type, capture: r.id, reason: r.status_details?.reason || null }); J.saveJobs(); record({ actor: { kind: "paypal" }, who: [j.customer], action: "paypal_capture_event", summary: `${j.number}: PayPal says the capture is ${e.event_type.split(".").pop().toLowerCase()}${r.status_details?.reason ? ` (${r.status_details.reason})` : ""}.`, ref: j.id }); did.push(`noted ${e.event_type} on ${j.number}`); } }
  if (/^PAYMENT\.REFUND\.(PENDING|FAILED)$/.test(e.event_type)) { const cid = (r.links || []).find((l) => l.rel === "up")?.href?.split("/").pop(), j = capJob(cid); if (j) { const pr = (j.money.pendingRefunds ||= []); if (!pr.some((x) => x.id === r.id)) pr.push({ id: r.id, amount: Math.round(+(r.amount?.value || 0) * 100), at: nowIso(), reason: r.status_details?.reason || null }); J.saveJobs(); did.push(`following refund ${r.id} on ${j.number}`); } }
  if (/^PAYMENT\.PAYOUTS-ITEM\.(FAILED|BLOCKED|HELD|REFUNDED|CANCELED|RETURNED|UNCLAIMED)$/.test(e.event_type)) { const sid = r.payout_item?.sender_item_id, j = sid && J.allJobs().find((x) => String(sid).startsWith(`${x.number}-`)); record({ actor: { kind: "paypal" }, who: j ? [pros.pro(j.agreed?.pro)?.person].filter(Boolean) : [], action: "payout_item_event", summary: `PayPal: payout item ${sid || r.payout_item_id} is ${e.event_type.split(".").pop().toLowerCase()}${r.errors?.name ? ` (${r.errors.name})` : ""}.`, ref: j?.id || null }); did.push(`noted payout item ${e.event_type.split(".").pop()}`); }
  if (e.event_type === "CHECKOUT.PAYMENT-APPROVAL.REVERSED") { const j = J.allJobs().find((x) => x.hold?.order === (r.order_id || r.id)); if (j && j.hold) { j.hold.history.push({ at: nowIso(), event: "PayPal reversed the payer's approval" }); if (j.hold.status === "pending_approval") j.hold.approvalReversed = nowIso(); J.saveJobs(); did.push(`approval reversed on ${j.number}`); } }
  if (/^VAULT\.PAYMENT-TOKEN\.(DELETED|DELETION-INITIATED)$/.test(e.event_type)) { const tid = r.id, who = tid && allPeople().find((x) => String(x.vault || "").endsWith(`:${tid}`)); if (who) { updatePerson(who.id, { vault: null, vaultLabel: null, vaultFrom: null }); record({ actor: { kind: "paypal" }, who: [who.id], action: "payment_method_removed", summary: "Your saved payment method was removed in PayPal; the next hold asks for an approval." }); did.push("cleared a saved method removed in PayPal"); } }
  if (e.event_type === "CUSTOMER.DISPUTE.CREATED") { const cap = r.disputed_transactions?.[0]?.seller_transaction_id, j = cap && disputes.jobOfCapture(cap); if (j) { await disputes.sync(j.id); did.push(`synced PayPal disputes on ${j.number}`); } else did.push(`no job has capture ${cap || "?"}`); }
  const t = await tickAll();
  did.push(`ran the tick (${Object.values(t).flat().length} changes)`);
  return did;
}
// evidence: multipart or JSON with data: URLs (8 MB a file, a few files a request); everything else stays small
const multipart = express.raw({ type: "multipart/form-data", limit: "40mb" });
app.use(["/api/pro/jobs", "/api/pro/invoices", "/a2a", "/api/demo/tour", "/api/jobs", "/api/assistant/message", "/api/inspector/jobs", "/api/pro/verification"], express.json({ limit: "40mb", verify: (req, res, buf) => { req.rawBody = buf; } }));
app.use(express.json({ limit: "256kb", verify: (req, res, buf) => { req.rawBody = buf; } }));

// rate limits: a fixed window per caller (its token when there is one, else the address)
const windows = new Map();
function limit(per, max) {
  return (req, res, next) => {
    const who = `${per}:${(req.headers.authorization || "").slice(-16) || req.ip}`, t = Date.now(), w = windows.get(who);
    if (!w || t - w.start > 60e3) { windows.set(who, { start: t, n: 1 }); return next(); }
    if (++w.n > max) return res.status(429).set("Retry-After", String(Math.ceil((w.start + 60e3 - t) / 1000))).json({ error: "rate_limited", message: `More than ${max} requests a minute. Slow down.` });
    next();
  };
}
setInterval(() => { const t = Date.now(); for (const [k, w] of windows) if (t - w.start > 60e3) windows.delete(k); }, 60e3).unref();
app.use(["/mcp", "/api/agent", "/a2a"], limit("agent", +(process.env.AGENT_RPM || 120)));
app.use(["/api/auth", "/api/tokens"], limit("people", 60));

// errors as HTTP: not_found 404, forbidden/scope/limit 403, state/pending 409, paypal 502, else 400
const CODE = { not_found: 404, person: 404, forbidden: 403, scope: 403, limit: 403, payee: 409, state: 409, pending: 409, one_counter: 409, offer: 409, paypal: 502, test_card: 409, no_saved_payment: 409 };
const send = (res, r) => res.status(r?.error ? CODE[r.error] || 400 : 200).json(r);
const out = (r, as, pro = null) => (r?.error ? r : r?.job ? { ...J.view(r.job, { as, pro }), ...(r.warning ? { warning: r.warning, readiness: r.readiness } : {}), ...(r.offer ? { offer: r.offer.id } : {}), ...(r.change ? { change: r.change.id } : {}) } : r?.timeline && r?.customer ? J.view(r, { as, pro }) : r);

// ---- agents -------------------------------------------------------------------------------------------------------------
app.all("/mcp", (req, res) => mcp.handle(req, res).catch((e) => { console.error("mcp", e); if (!res.headersSent) res.status(500).json({ jsonrpc: "2.0", error: { code: -32603, message: "internal error" }, id: null }); }));
app.post("/a2a", (req, res) => mcp.a2a(req, res).catch((e) => { console.error("a2a", e); if (!res.headersSent) res.status(500).end(); }));
app.get("/.well-known/agent-card.json", (req, res) => res.json(mcp.card(PUBLIC_URL)));
app.get("/.well-known/mcp-tools.json", (req, res) => res.json(mcp.toolsManifest()));
app.get("/.well-known/mcp.json", (req, res) => { const t = mcp.toolsManifest(); res.json({ name: "VeriPay", description: "Hire a local pro for your person; pay only when the done-conditions pass (PayPal sandbox).", url: `${PUBLIC_URL}/mcp`, transport: "streamable-http", authentication: { type: "bearer", howToGetOne: `${PUBLIC_URL}/llms.txt` }, tools: t.tools.map((x) => x.name), toolsDigest: t.digest }); });
app.get("/llms.txt", (req, res) => res.type("text/plain").send(guide(PUBLIC_URL)));
app.post("/api/agent/:tool", async (req, res) => {
  const a = agentOf(req), fn = tools.CUSTOMER[req.params.tool];
  if (!a) return res.status(401).json({ error: "token", message: "Send a person's agent token: Authorization: Bearer done_..." });
  if (!fn) return res.status(404).json({ error: "tool", message: `Tools: ${Object.keys(tools.CUSTOMER).join(", ")}` });
  if (!can(a, req.params.tool)) return res.status(403).json(scopeError(req.params.tool));
  const bad = mcp.unknownArgs(req.params.tool, req.body || {});
  if (bad) return res.status(400).json(bad);
  const r = await fn(a, req.body || {});
  send(res, req.body?.view === "summary" ? tools.summarize(r) : r);
});

// ---- sign-in -------------------------------------------------------------------------------------------------------------
const me = (req) => { const s = sessionOf(req); return s ? person(s.person) : null; };
const signedIn = (req, res, next) => { const p = me(req); if (!p) return res.status(401).json({ error: "signin", message: "Sign in first." }); req.person = p; next(); };
// only the person: their session AND a fresh step-up with their PIN (POST /api/auth/step-up {pin}); an agent that got
// hold of a session still can't do these
const personOnly = (req, res, next) => (steppedUp(req) ? next() : res.status(403).json({ error: "step_up", message: "Only the person can do this: confirm with your PIN first (POST /api/auth/step-up {pin}). Agents never have the PIN.", stepUp: "/api/auth/step-up" }));
const personOnlyIf = (cond) => (req, res, next) => (cond(req) ? personOnly(req, res, next) : next());
// (with the browser and address, for the order: App Switch on a phone, the risk context)
const asPerson = (req) => ({ kind: "person", person: req.person.id, ua: String(req.headers["user-agent"] || "").slice(0, 400), ip: req.ip || null });
const cookie = (sid) => `${COOKIE}=${sid}; HttpOnly; SameSite=Lax; Path=/`;
// ---- real accounts: sign up with email, password and PIN; sign in again with email and password ----------------------
// Works with demo sign-in on or off. A customer gets the default agent limits; a pro also gets their business (trade,
// ZIP, the PayPal they're paid to: unverified until they verify it in Payout settings, so nobody can hire them before).
// Signing in with the password doesn't step up: what only the person may do still asks for the PIN.
app.post("/api/auth/signup", limit("signup", 10), (req, res) => {
  const b = req.body || {}, role = b.role === "pro" ? "pro" : "customer";
  const name = String(b.name || "").trim().slice(0, 60), email = String(b.email || "").trim().slice(0, 120);
  if (!name) return res.status(400).json({ error: "name", message: "Your name, please." });
  if (!validEmail(email)) return res.status(400).json({ error: "email", message: "That doesn't look like an email address." });
  if (!validPassword(b.password)) return res.status(400).json({ error: "password", message: "The password needs at least 8 characters." });
  if (!validPin(b.pin)) return res.status(400).json({ error: "pin", message: "The PIN is 4 to 6 digits." });
  if (b.zip != null && b.zip !== "" && !/^\d{5}$/.test(String(b.zip))) return res.status(400).json({ error: "zip", message: "The ZIP code is 5 digits." });
  if (personByEmail(email)) return res.status(409).json({ error: "email_taken", message: "There's already an account with this email: sign in instead." });
  let pr = null;
  if (role === "pro") {
    const payTo = String(b.paypalEmail || email).trim();
    if (!validEmail(payTo)) return res.status(400).json({ error: "paypalEmail", message: "The PayPal email doesn't look like an email address." });
    const made = pros.createPro({ name: String(b.business || name).trim(), owner: name, trade: b.trade, zip: b.zip || "78701", email: payTo, label: "signup" });
    if (made.error) return res.status(400).json(made);
    pr = pros.pro(made.pro.id);
  }
  const p = makePerson({ name, email, zip: b.zip || (pr?.zip ?? "78704"), role, demo: false, via: "signup" });
  setPassword(p.id, b.password); setPin(p.id, b.pin);
  if (pr) { updatePerson(p.id, { pro: pr.id }); pros.linkPerson(pr.id, p.id); }
  res.status(201).set("Set-Cookie", cookie(createSession(p.id, { stepUp: true }))).json({ person: viewPerson(p), ...(pr ? { pro: pros.viewPro(pr, { self: true }), readiness: pros.readiness(pr) } : { limits: tools.limitsView(p) }) });
});
app.post("/api/auth/login", limit("login", 20), (req, res) => {
  const c = checkPassword(req.body?.email, req.body?.password);
  if (c.error) return res.status(c.locked ? 429 : 401).json(c);
  const pr = c.person.pro ? pros.pro(c.person.pro) : null;
  res.set("Set-Cookie", cookie(createSession(c.person.id))).json({ person: viewPerson(c.person), ...(pr ? { pro: pros.viewPro(pr, { self: true }) } : {}) });
});
const DEMO_NAMES = ["Jordan Avery", "Sam Patel", "Riley Chen", "Morgan Diaz", "Casey Brooks"];
app.post("/api/auth/demo", (req, res) => {
  if (!DEMO) return res.status(404).end();
  const b = req.body || {};
  // the demo inspector and the pros sign in with their PIN too (an agent never has it): the demo inspector's is
  // DONE_INSPECTOR_PIN (default 1357), the demo pros' DONE_DEMO_PRO_PIN (default 8642); a pro who onboarded set their own
  const pinGate = (pid) => { const c = checkPin(pid, b.pin); return c.error ? res.status(c.locked ? 429 : b.pin == null ? 401 : 403).json({ ...c, needs: "pin", message: `Signing in needs the PIN. ${c.message}` }) && null : true; };
  if (b.as === "inspector") {
    const p = allPeople().find((x) => x.role === "inspector") || makePerson({ name: "Capitol Home Inspections", role: "inspector", zip: "78701" });
    if (!hasPin(p.id) && p.demo) setPin(p.id, process.env.DONE_INSPECTOR_PIN || "1357");
    if (!pinGate(p.id)) return;
    return res.set("Set-Cookie", cookie(createSession(p.id, { stepUp: true }))).json({ person: viewPerson(p) });
  }
  // landlords (PLAN §15 item 1): the demo landlord (fictional, answers within minutes through its labelled demo agent)
  // with DONE_DEMO_LANDLORD_PIN (default 9753); or a new demo landlord with their own PIN; or resume one with their PIN
  if (b.as === "landlord") {
    if (b.demo) { const l = people_.ensureDemoLandlord(); if (!hasPin(l.id)) setPin(l.id, process.env.DONE_DEMO_LANDLORD_PIN || "9753"); if (!pinGate(l.id)) return; return res.set("Set-Cookie", cookie(createSession(l.id, { stepUp: true }))).json({ person: viewPerson(l), limits: tools.limitsView(l), demoLandlord: true }); }
    if (b.person) { const l = person(b.person); if (!(l?.demo && l.role === "landlord")) return res.status(404).json({ error: "person", message: "No such demo landlord." }); if (!pinGate(l.id)) return; return res.set("Set-Cookie", cookie(createSession(l.id, { stepUp: true }))).json({ person: viewPerson(l), limits: tools.limitsView(l) }); }
    if (b.pin != null && !validPin(b.pin)) return res.status(400).json({ error: "pin", message: "The PIN is 4 to 6 digits." });
    const l = makePerson({ name: b.name ? String(b.name).slice(0, 40) : "Landlord", role: "landlord", zip: b.zip || "78704" });
    const pin = b.pin != null ? String(b.pin) : String(crypto.randomInt(0, 1e6)).padStart(6, "0");
    setPin(l.id, pin);
    return res.set("Set-Cookie", cookie(createSession(l.id, { stepUp: true }))).json({ person: viewPerson(l), limits: tools.limitsView(l), ...(b.pin == null ? { pinOnce: pin } : {}) });
  }
  if (b.as === "pro") {
    const pr = pros.pro(b.pro || "barton-creek-plumbing");
    if (!pr) return res.status(404).json({ error: "pro", message: "No such pro.", pros: pros.allPros().map((x) => x.id) });
    let p = pr.person && person(pr.person);
    if (!p && !pr.demo) return res.status(403).json({ error: "onboarding", message: "This pro signs in from their onboarding link (they set their PIN there), not the demo button." });
    if (!p) { p = makePerson({ name: pr.owner || pr.name, role: "pro", zip: pr.zip }); updatePerson(p.id, { pro: pr.id }); pros.linkPerson(pr.id, p.id); }
    if (!hasPin(p.id) && pr.demo) setPin(p.id, process.env.DONE_DEMO_PRO_PIN || "8642");
    if (!pinGate(p.id)) return;
    return res.set("Set-Cookie", cookie(createSession(p.id, { stepUp: true }))).json({ person: viewPerson(p), pro: pros.viewPro(pr, { self: true }) });
  }
  // resume a demo customer (from GET /api/demo/customers, or the id this browser kept): only with their PIN
  const pid = b.person || b.personId || null, back = pid ? person(pid) : null;
  if (pid && !(back?.demo && back.role === "customer")) return res.status(404).json({ error: "person", message: "No such demo customer: GET /api/demo/customers lists them." });
  if (back) {
    const c = checkPin(back.id, b.pin);
    if (c.error) return res.status(c.locked ? 429 : c.missing ? 401 : 403).json({ ...c, needs: "pin", message: c.missing ? c.message : `Resuming a demo customer needs their PIN. ${c.message}` });
    return res.set("Set-Cookie", cookie(createSession(back.id, { stepUp: true }))).json({ person: viewPerson(back), limits: tools.limitsView(back) });
  }
  // a new demo customer sets their PIN now (4-6 digits); without one the website is given one to show once
  if (b.pin != null && !validPin(b.pin)) return res.status(400).json({ error: "pin", message: "The PIN is 4 to 6 digits." });
  const p = makePerson({ name: b.name ? String(b.name).slice(0, 40) : DEMO_NAMES[Math.floor(Math.random() * DEMO_NAMES.length)], email: b.email || null, zip: b.zip || "78704", role: "customer" });
  const pin = b.pin != null ? String(b.pin) : String(crypto.randomInt(0, 1e6)).padStart(6, "0");
  setPin(p.id, pin);
  res.set("Set-Cookie", cookie(createSession(p.id, { stepUp: true }))).json({ person: viewPerson(p), limits: tools.limitsView(p), ...(b.pin == null ? { pinOnce: pin } : {}), pin: { set: true, says: b.pin == null ? "Your PIN is shown once (pinOnce): you need it to come back as this customer and to confirm anything only you may do. Your agent never gets it." : "PIN set. You need it to come back as this customer and to confirm anything only you may do. Your agent never gets it." } });
});
// The demo page (/demo): every feature already running on the demo server, one click away. POST {feature} signs this
// browser in as the demo person it belongs to (a seeded customer, the demo pro on that job, the demo landlord) and says
// where to go; the jobs are the demo's own, in whatever state the simulated people have them right now.
const SHOW = {
  ask: { who: "fresh", to: () => "/" },
  // the agent's negotiation (A2A) and an extra cost it negotiated, in the showcase customer's own chat (assistant.showcase)
  negotiate: { who: "fresh", to: () => "/", show: "offers" },
  extra: { who: "fresh", to: () => "/", show: "extra" },
  offers: { statuses: ["offered", "scoped"], side: "customer" },
  held: { statuses: ["held", "agreed"], side: "customer", build: ["start", "hire"] },
  working: { statuses: ["working", "submitted", "review"], side: "pro", build: ["start", "hire", "start_work"] },
  needsfix: { statuses: ["needs_fix", "review", "submitted"], side: "customer" },
  paid: { statuses: ["released"], side: "customer" },
  // none open yet: a tour job at work, and its customer disputes it (the reason says it is the demo)
  dispute: { statuses: ["disputed", "resolved"], side: "customer", or: (j) => !!j.dispute, build: ["start", "hire", "start_work"],
    then: (j) => J.openDispute(j.id, "Demo dispute: the faucet still drips at the handle after the visit.", { kind: "person", person: j.customer }) },
  earnings: { who: "pro", to: () => "/pro/earnings" },
  landlord: { who: "landlord", to: () => "/tenancy" },
  // with no open group near them, two simulated neighbours open one (a faucet repair), so the page shows a priced group to join
  groups: { who: "seed", to: () => "/groups", prep: demoGroup },
  home: { who: "seed", to: () => "/home" },
  connect: { who: "seed", to: () => "/connect" },
};
async function demoGroup(p) {
  const zip = p.zip || "78704";
  if (groups.openGroupsNear(zip).length) return;
  const near = allPeople().filter((x) => x.via === "demo" && x.role === "customer" && x.id !== p.id).slice(0, 2);
  if (near.length < 2) return;
  const text = "Kitchen faucet drips from the spout; replace the cartridge", actor = (x) => ({ kind: "person", person: x.id });
  const j = await J.createJob(near[0].id, { text, zip, budget: 20000, actor: actor(near[0]) });
  if (j.error) return;
  const g = groups.openGroup(j.id, actor(near[0]));
  if (!g.error) await groups.joinGroup(g.group.id, actor(near[1]), { text, budget: 20000 });
}
// a demo state no job is in yet: a judges-tour job driven there through the tour route itself
async function buildTourJob(steps) {
  let cookie = null, j = null;
  for (const step of steps) {
    const r = await fetch(`http://127.0.0.1:${PORT}/api/demo/tour`, { method: "POST", headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) }, body: JSON.stringify({ step, job: j?.id }) });
    cookie ||= (r.headers.get("set-cookie") || "").split(";")[0] || null;
    j = await r.json().catch(() => null);
    if (!r.ok || !j || j.error) return null;
  }
  return j && J.job(j.id);
}
function demoProPerson(prId) {
  const pr = pros.pro(prId);
  if (!pr?.demo) return null;
  let p = pr.person && person(pr.person);
  if (!p) { p = makePerson({ name: pr.owner || pr.name, role: "pro", zip: pr.zip }); updatePerson(p.id, { pro: pr.id }); pros.linkPerson(pr.id, p.id); }
  if (!hasPin(p.id)) setPin(p.id, process.env.DONE_DEMO_PRO_PIN || "8642");
  return p;
}
app.post("/api/demo/open", async (req, res) => {
  if (!DEMO) return res.status(404).end();
  const f = SHOW[req.body?.feature];
  if (!f) return res.status(400).json({ error: "feature", message: "No such feature.", features: Object.keys(SHOW) });
  const seeded = (pid) => ["seed"].includes(person(pid)?.via);
  let p = null, to = null;
  if (f.statuses) {
    const fits = (j) => (f.statuses.includes(j.status) || f.or?.(j)) && (f.side !== "pro" || pros.pro(j.agreed?.pro)?.demo);
    // the seeded customers' jobs first; when none is in that state yet, a judges'-tour job that is (the same demo flow)
    let jobs = J.allJobs().filter((j) => seeded(j.customer) && !j.tour && fits(j));
    if (!jobs.length) jobs = J.allJobs().filter((j) => j.tour && fits(j));
    if (!jobs.length) jobs = J.allJobs().filter((j) => person(j.customer)?.via === "demo" && fits(j));
    // jobs whose photos are real (the demo library keeps the camera) first, then the latest
    const real = (x) => { const ph = (x.evidence || []).filter((e) => e.kind === "photo"); return ph.length ? ph.filter((e) => e.exif?.camera).length / ph.length : 0; };
    let j = f.statuses.map((s) => jobs.filter((x) => x.status === s).sort((a, b) => real(b) - real(a) || String(b.updated).localeCompare(String(a.updated)))[0]).find(Boolean) || jobs[0];
    if (!j && f.build) { j = await buildTourJob(f.build); if (j && f.then) { const r = await f.then(j); j = r?.error ? null : J.job(j.id); } }
    if (!j) return res.status(404).json({ error: "none", message: "Nothing in that state on the demo right now: try again in a minute." });
    p = f.side === "pro" ? demoProPerson(j.agreed.pro) : person(j.customer);
    to = f.side === "pro" ? `/pro/jobs/${j.id}` : `/jobs/${j.id}`;
  } else if (f.who === "pro") {
    const busy = J.allJobs().filter((j) => j.status === "released" && pros.pro(j.agreed?.pro)?.demo).map((j) => j.agreed.pro);
    p = demoProPerson(busy.sort((a, b) => busy.filter((x) => x === b).length - busy.filter((x) => x === a).length)[0] || "barton-creek-plumbing");
  } else if (f.who === "landlord") {
    p = people_.ensureDemoLandlord();
  } else if (f.who === "seed") {
    // the seeded customer with the most jobs; on a state with none seeded (the sandbox one), the simulated customer who has
    const most = (ok) => { const counts = new Map(); for (const j of J.allJobs()) if (ok(j.customer)) counts.set(j.customer, (counts.get(j.customer) || 0) + 1); return person([...counts].sort((a, b) => b[1] - a[1])[0]?.[0]); };
    p = most(seeded) || most((pid) => person(pid)?.via === "demo" && person(pid)?.role === "customer");
  } else {
    p = allPeople().find((x) => x.via === "showcase" && x.role === "customer") || makePerson({ name: "Maria Lopez", zip: "78704", via: "showcase" });
    if (!hasPin(p.id)) setPin(p.id, "2468");
  }
  if (!p) return res.status(404).json({ error: "none", message: "That demo person isn't here yet: try again in a minute." });
  if (f.prep) await f.prep(p).catch((e) => console.error("demo prep", e.message));
  if (f.show) { const r = await assistant.showcase(p.id, f.show); if (r?.error) return res.status(404).json({ error: "none", message: "Couldn't set that up right now: try again in a minute." }); }
  res.set("Set-Cookie", cookie(createSession(p.id, { stepUp: true }))).json({ to: to || f.to(), as: { name: p.name, role: p.role } });
});
app.get("/api/demo/customers", (req, res) => { if (!DEMO) return res.status(404).end(); res.json(allPeople().filter((p) => p.demo && p.role === "customer").map((p) => ({ id: p.id, name: p.name, zip: p.zip, jobs: J.jobsOf(p.id).length, lastJob: J.jobsOf(p.id)[0]?.updated || null, created: p.created })).sort((a, b) => String(b.lastJob || b.created).localeCompare(String(a.lastJob || a.created))).slice(0, 30)); });
// a person's one-time link (askPerson): sign in as them, land on the setting; POST for the web page, GET for a plain link
// a person's one-time link (askPerson) opens the website's page; it never signs anyone in by itself. GET shows what was
// asked (no session); POST {code, pin} signs the person in (stepped up) when the PIN is theirs.
app.get("/api/auth/link", (req, res) => { const l = peekLink(req.query.code); if (!l || !person(l.person)) return res.status(410).type("text/plain").send("This link has been used or has expired. Ask your agent for a new one."); res.redirect(`/link?code=${encodeURIComponent(String(req.query.code))}`); });
app.get("/api/auth/link/info", (req, res) => { const l = peekLink(req.query.code); if (!l || !person(l.person)) return res.status(410).json({ error: "code", message: "This link has been used or has expired." }); res.json({ for: person(l.person).name, what: l.what, to: l.to, limit: l.limit, wouldBe: l.wouldBe, current: l.current, job: l.job, needs: "pin" }); });
app.post("/api/auth/link", (req, res) => {
  const l = peekLink(req.body?.code);
  if (!l || !person(l.person)) return res.status(410).json({ error: "code", message: "This link has been used or has expired." });
  const c = checkPin(l.person, req.body?.pin);
  if (c.error) return res.status(c.locked ? 429 : req.body?.pin == null ? 401 : 403).json({ ...c, needs: "pin", message: `Sign in with your PIN to open this. ${c.message}` });
  redeemLink(req.body.code);
  res.set("Set-Cookie", cookie(createSession(l.person, { stepUp: true }))).json({ person: viewPerson(person(l.person)), to: l.to, what: l.what, limit: l.limit, wouldBe: l.wouldBe, current: l.current, job: l.job });
});
// step-up: the person confirms with their PIN (10 minutes)
app.post("/api/auth/step-up", limit("stepup", 20), signedIn, (req, res) => {
  const c = checkPin(req.person.id, req.body?.pin);
  if (c.error) return res.status(c.locked ? 429 : 403).json(c);
  stepUp(sessionOf(req).sid);
  res.json({ ok: true, until: new Date(Date.now() + STEP_UP_MS).toISOString(), says: "Confirmed for 10 minutes." });
});
// set or change the PIN: a fresh step-up with the old one (a PIN-less person can't set one here: they sign up again)
app.put("/api/auth/pin", signedIn, personOnly, (req, res) => { if (!validPin(req.body?.pin)) return res.status(400).json({ error: "pin", message: "The PIN is 4 to 6 digits." }); setPin(req.person.id, req.body.pin); res.json({ ok: true }); });
app.post("/api/auth/signout", (req, res) => { const s = sessionOf(req); if (s) endSession(s.sid); res.set("Set-Cookie", `${COOKIE}=; Max-Age=0; Path=/`).json({ ok: true }); });
app.get("/api/me", (req, res, next) => (me(req) ? next() : res.json({ signedIn: false })), signedIn, (req, res) => { const pr = req.person.pro ? pros.pro(req.person.pro) : null; res.json({ signedIn: true, steppedUpUntil: stepUpLeft(req) ? new Date(Date.now() + stepUpLeft(req)).toISOString() : null, person: viewPerson(req.person), limits: ["customer", "landlord"].includes(req.person.role) ? tools.limitsView(req.person) : null, pro: pr ? pros.viewPro(pr, { self: true }) : null, inbox: { unread: inbox.inboxOf(req.person.id, { limit: 1 }).unread } }); });
// the saved payment method, as PayPal's vault has it (Payment Method Tokens v3), and removing it from PayPal: holds
// already placed stay; the next hold asks for approval again
app.get("/api/me/payment-methods", signedIn, async (req, res) => {
  const p = req.person;
  if (!p.vault) return res.json({ saved: null, all: [], says: "Nothing saved in PayPal's vault." });
  try {
    const t = await pp().getPaymentToken(p.vault), cust = t.customerId || p.vaultCustomer || null;
    const all = cust ? await pp().listPaymentTokens(cust, { page: Math.max(1, +req.query.page || 1) }).catch(() => []) : [];
    res.json({ saved: { ...t, inUse: true }, all, customerId: cust, says: "From PayPal's vault (GET /v3/vault/payment-tokens)." });
  } catch (e) { res.json({ saved: { id: p.vault, label: p.vaultLabel || null, inUse: true, paypalSays: why(e) }, all: [], says: "PayPal didn't answer for this token." }); }
});
// save PayPal before any job (Vault v3 setup token, approved at PayPal, then a payment token): the agent can then hire
// within the person's limits without an approval on the first hold
// kind: "paypal" (approved at PayPal, or in the page with the JS SDK's save session), "venmo" (a Venmo setup token),
// "card" (a setup token for the JS SDK's card-fields save session), "testcard" (the sandbox test card: PayPal approves
// the setup token at once, so it's saved with no approval). Each carries VeriPay's person id on the vault record.
app.post("/api/me/payment-methods/setup", signedIn, personOnly, async (req, res) => {
  if (req.person.vault) return res.status(409).json({ error: "saved", message: "A payment method is already saved; remove it first." });
  const kind = ["paypal", "venmo", "card", "testcard"].includes(req.body?.kind) ? req.body.kind : "paypal", rid = `${req.person.id}:vault-setup:${kind}:${Date.now()}`, ret = { returnUrl: `${PUBLIC_URL}/paypal/vault-return`, cancelUrl: `${PUBLIC_URL}/connect#saved-payment` };
  try {
    if (kind === "testcard") {
      if (!pp().testCard) return res.status(409).json({ error: "test_card", message: "The sandbox test card is off on this server." });
      const s = await pp().vaultCardSetup({ requestId: rid, customerRef: req.person.id, ...ret });
      if (s.status !== "APPROVED") return res.status(502).json({ error: "paypal", message: `PayPal answered ${s.status}` });
      return res.json(await saveFromSetup(req.person, s.id));
    }
    const r = kind === "card" ? await pp().vaultCardSetup({ requestId: rid, customerRef: req.person.id, withTestCard: false, ...ret }) : await pp().vaultSetup({ ...ret, requestId: rid, customerRef: req.person.id, venmo: kind === "venmo" });
    res.json({ url: r.approveUrl, setupToken: r.id, kind });
  } catch (e) { res.status(502).json({ error: "paypal", message: why(e) }); }
});
// a setup token approved in the page (the JS SDK's PayPal or card-fields save session): turn it into the saved method
app.post("/api/me/payment-methods/confirm", signedIn, personOnly, async (req, res) => {
  const tok = String(req.body?.setupToken || "").slice(0, 60);
  if (!/^[A-Za-z0-9_-]{6,}$/.test(tok)) return res.status(400).json({ error: "setupToken", message: "The setup token PayPal gave the page." });
  try { res.json(await saveFromSetup(req.person, tok)); } catch (e) { res.status(502).json({ error: "paypal", message: why(e) }); }
});
// the setup token's state first (GET), then the payment token
async function saveFromSetup(person, tok) {
  const st = await pp().getSetupToken(tok).catch(() => null);
  if (st && !["APPROVED", "VAULTED"].includes(st.status)) throw new Error(`PayPal says the setup is ${st.status}: approve it first`);
  const r = await pp().vaultToken(tok, `${person.id}:vault-token:${tok}`), label = r.label || (r.kind === "venmo" ? "Venmo" : r.kind === "card" ? "Card" : "PayPal");
  updatePerson(person.id, { vault: r.id, vaultLabel: pp().testCard && r.kind === "card" && !r.label?.includes("••") ? "Sandbox test card (saved)" : label, vaultFrom: r.kind === "card" ? (pp().testCard ? "test_card" : "card") : r.kind, ...(r.customerId ? { vaultCustomer: r.customerId } : {}) });
  record({ actor: { kind: "person" }, who: [person.id], action: "payment_method_saved", summary: `Saved your ${label} in PayPal's vault (no purchase): holds within your limits need no approval.` });
  return { saved: { id: r.id, kind: r.kind, label }, setup: st?.status || null };
}
app.get("/paypal/vault-return", signedIn, async (req, res) => {
  const tok = String(req.query.approval_token_id || req.query.token || "").slice(0, 60);
  if (!tok) return res.redirect("/connect?saved=missing#saved-payment");
  try { await saveFromSetup(req.person, tok); res.redirect("/connect?saved=1#saved-payment"); }
  catch (e) { res.redirect(`/connect?saved=${encodeURIComponent(why(e))}#saved-payment`); }
});
app.delete("/api/me/payment-methods", signedIn, personOnly, async (req, res) => {
  const p = req.person;
  if (!p.vault) return res.status(409).json({ error: "none", message: "Nothing saved." });
  let paypalSays = "deleted in PayPal's vault";
  try { await pp().deletePaymentToken(p.vault); } catch (e) { if (e.status !== 404) return res.status(502).json({ error: "paypal", message: why(e) }); paypalSays = "PayPal no longer had it"; }
  const was = p.vaultLabel || p.vault;
  updatePerson(p.id, { vault: null, vaultLabel: null, vaultFrom: null, vaultCustomer: null });
  record({ actor: { kind: "person" }, who: [p.id], action: "payment_method_removed", summary: `Removed the saved payment method (${was}) from PayPal's vault.` });
  res.json({ removed: true, paypalSays, person: viewPerson(person(p.id)), says: "Holds already placed stay. The next hold asks you to approve in PayPal again; repeat visits and your agent can't hold until then." });
});
app.patch("/api/me", signedIn, (req, res) => { const { name, email, zip, address } = req.body || {}; res.json(viewPerson(updatePerson(req.person.id, { name, email, zip: /^\d{5}$/.test(String(zip || "")) ? zip : undefined, address }))); });

// ---- limits and tokens (the person only, never an agent) ------------------------------------------------------------------
app.get("/api/limits", signedIn, (req, res) => res.json(tools.limitsView(req.person)));
app.put("/api/limits", signedIn, personOnly, (req, res) => {
  const b = req.body || {}, L = {}, dollars = { perJobMax: [10, 20000], monthlyMax: [10, 50000], changeMax: [0, 5000], materialsAdvanceMax: [0, 5000] };
  for (const [k, [lo, hi]] of Object.entries(dollars)) if (b[k] != null) { const c = toCents(b[k]); if (c == null || c < lo * 100 || c > hi * 100) return res.status(400).json({ error: k, message: `${k} is USD from ${lo} to ${hi}.` }); L[k] = c; }
  if (b.bufferPct != null) { const v = +b.bufferPct; if (!(v >= 0 && v <= 50)) return res.status(400).json({ error: "bufferPct", message: "bufferPct is 0 to 50." }); L.bufferPct = v; }
  for (const k of ["agentMayRelease", "agentMayCancel", "requireMandate"]) if (b[k] != null) L[k] = !!b[k];
  updatePerson(req.person.id, { limits: L });
  res.json(tools.limitsView(person(req.person.id)));
});
app.get("/api/tokens", signedIn, (req, res) => res.json(tokensOf(req.person.id)));
app.post("/api/tokens", signedIn, personOnly, (req, res) => !["customer", "landlord"].includes(req.person.role) ? res.status(403).json({ error: "role", message: req.person.role === "pro" ? "Pros connect their agent with a pro key: POST /api/pro/keys (dpk_...), used over A2A." : "Only customers make agent tokens." }) : res.json(makeToken(req.person.id, req.body?.label, { scopes: req.body?.scopes, days: req.body?.days, key: req.body?.key, requireMandate: req.body?.requireMandate === true })));
app.delete("/api/tokens/:id", signedIn, (req, res) => res.json({ ok: revoke(req.person.id, req.params.id) }));
app.get("/api/activity", signedIn, (req, res) => res.json(forPerson(req.person.id, { after: +req.query.after || 0 })));
app.get("/api/mcp-config", signedIn, (req, res) => res.json({ url: `${PUBLIC_URL}/mcp`, transport: "streamable-http", scopes: SCOPES, llms: `${PUBLIC_URL}/llms.txt`, a2a: `${PUBLIC_URL}/.well-known/agent-card.json`,
  example: { mcpServers: { "done-and-paid": { type: "http", url: `${PUBLIC_URL}/mcp`, headers: { Authorization: "Bearer done_..." } } } } }));

// ---- customers' jobs ------------------------------------------------------------------------------------------------------
// the preview carries estimate (estimate.js: a fair-price range from similar completed jobs, labelled; null when the
// estimate module gives none)
app.post("/api/scope", signedIn, async (req, res) => {
  const b = req.body || {}; const s = await J.previewScope({ text: b.text, zip: b.zip || req.person.zip, budgetMax: b.budget != null ? toCents(b.budget) : null });
  let estimate = null;
  try { const { estimatePrice } = await import("./estimate.js"); const e = await estimatePrice({ text: String(b.text || "").slice(0, 1000), scope: s, zip: b.zip || req.person.zip, history: J.priceHistory(), timeoutMs: 8000 }); if (e) estimate = { ...e, low: J.money(e.low), high: J.money(e.high), typical: J.money(e.typical) }; } catch {}
  res.json({ ...s, priceCeiling: J.money(s.priceCeiling), estimate });
});
// the model's scope for the preview (~8-10 s; the instant /api/scope answer is the rules'): the web swaps it in, labelled
app.post("/api/scope/refine", signedIn, async (req, res) => { const b = req.body || {}; const { refineScope } = await import("./ai.js"); const r = await refineScope({ text: String(b.text || "").slice(0, 1000), zip: b.zip || req.person.zip, budgetMax: b.budget != null ? toCents(b.budget) : null }); res.json(r ? { refined: true, scope: r } : { refined: false, why: "No model scope (the model is off, slow or answered with the rules')." }); });
// the gap review of a scope before it's posted (the same review that runs again when an offer is accepted)
app.post("/api/scope/review", signedIn, async (req, res) => {
  const { reviewScope } = await import("./ai.js");
  const s = req.body?.scope;
  if (!s || !Array.isArray(s.checks)) return res.status(400).json({ error: "scope", message: "Send { scope: { title, trade, items, checks, milestones? } }, as /api/scope returns it." });
  const scope = { ...s, priceCeiling: s.priceCeiling?.cents ?? (s.priceCeiling != null && typeof s.priceCeiling === "number" ? toCents(s.priceCeiling) : null) };
  res.json(await reviewScope({ scope, agreed: null }, { proReply: req.body?.proReply || null }));
});
app.post("/api/jobs", signedIn, async (req, res) => {
  const b = req.body || {}, scope = b.scope ? { ...b.scope, priceCeiling: b.scope.priceCeiling != null ? toCents(b.scope.priceCeiling) : undefined } : null;
  // a tenant posts for their landlord (forLandlord: true): the landlord is the payer (j.customer), the tenant documents
  const forL = b.forLandlord === true;
  if (forL && !req.person.landlord) return res.status(409).json({ error: "landlord", message: "Link to your landlord first: POST /api/tenant/landlord { code } (or { demo: true } for the demo landlord)." });
  const j = await J.createJob(forL ? req.person.landlord.id : req.person.id, { text: b.text, zip: b.zip, address: b.address, budget: b.budget != null ? toCents(b.budget) : null, bufferPct: b.bufferPct, scope, options: b.options || {}, actor: asPerson(req), ...(forL ? { tenant: req.person.id } : {}) });
  if (j.error) return send(res, j);
  if (b.requestOffers) await J.requestOffers(j.id, asPerson(req));
  res.json(J.view(J.job(j.id), { as: forL ? "tenant" : "customer" }));
});
app.get("/api/jobs", signedIn, (req, res) => res.json([...J.jobsOf(req.person.id).map((j) => [j, j.tenant ? "landlord" : "customer"]), ...J.jobsAsTenant(req.person.id).map((j) => [j, "tenant"])].sort((a, b) => b[0].created.localeCompare(a[0].created)).map(([j, role]) => ({ id: j.id, number: j.number, status: j.status, title: j.scope?.title, trade: j.scope?.trade, due: J.money(J.due(j)), pro: j.agreed?.proName || null, offers: j.offers.filter((o) => o.status === "open").length, next: J.view(j, { as: role === "tenant" ? "tenant" : "customer" }).next, role, ...(j.tenant ? { tenant: role === "tenant" ? null : person(j.tenant)?.name || null, landlord: role === "tenant" ? person(j.customer)?.name || null : null } : {}), created: j.created, updated: j.updated }))));
const mine = (req, res, next) => { const j = J.job(req.params.id); if (!j || j.customer !== req.person.id) return res.status(404).json({ error: "not_found", message: j?.tenant === req.person.id ? "Your landlord decides this (only the payer can)." : "No such job." }); req.job = j; next(); };
// the payer (customer or landlord) or the tenant who posted it: reads, documents and tenant actions
const party = (req, res, next) => { const j = J.job(req.params.id); if (!j || (j.customer !== req.person.id && j.tenant !== req.person.id)) return res.status(404).json({ error: "not_found", message: "No such job." }); req.job = j; req.as = j.customer === req.person.id ? "customer" : "tenant"; next(); };
// with the job's process, node by node (the same nodes as the chat's flow card)
app.get("/api/jobs/:id", signedIn, party, (req, res) => res.json({ ...J.view(req.job, { as: req.as }), processNodes: assistant.flowOf(req.job).nodes }));
app.post("/api/jobs/:id/tenant/note", signedIn, party, (req, res) => { const r = J.tenantNote(req.job.id, req.body?.text, asPerson(req)); send(res, r.error ? r : { ...J.view(r.job, { as: req.as }), note: r.note.id }); });
app.post("/api/jobs/:id/tenant/pick", signedIn, party, (req, res) => { const r = J.tenantPick(req.job.id, req.body?.offer, asPerson(req)); send(res, r.error ? r : J.view(r.job, { as: req.as })); });
// scheduling: either side moves the visit; the other answers a short-notice proposal
app.post("/api/jobs/:id/reschedule", signedIn, mine, (req, res) => { const r = J.reschedule(req.job.id, { from: req.body?.from, reason: req.body?.reason }, asPerson(req)); send(res, r.error ? r : { ...J.view(r.job), ...(r.rescheduled ? { rescheduled: r.rescheduled } : { proposal: r.proposal, answeredBy: r.answeredBy || null }) }); });
app.post("/api/jobs/:id/reschedule/:pid", signedIn, mine, (req, res) => send(res, out(J.answerReschedule(req.job.id, req.params.pid, { accept: req.body?.accept === true, note: req.body?.note }, asPerson(req)))));
// how the hold can be paid (Pay Later on holds of $300 or more), and tips after a paid job
app.get("/api/jobs/:id/hold/options", signedIn, mine, async (req, res) => { const o = J.holdOptions(req.job); const e = o.amount?.cents ? await pp().findEligible({ amount: o.amount.cents, email: req.person.email || null }).catch((x) => ({ error: why(x) })) : null; res.json({ ...o, ...(e ? { paypalEligible: e } : {}) }); });
app.post("/api/jobs/:id/tip", signedIn, mine, personOnly, async (req, res) => { const r = await J.tip(req.job.id, { amount: toCents(req.body?.amount), payWith: req.body?.payWith || null }, asPerson(req)); send(res, r.error ? r : { ...J.view(r.job), tip: r.tip.id, ...(r.tip.approveUrl ? { approveUrl: r.tip.approveUrl } : {}) }); });
app.post("/api/jobs/:id/tips/:tid/confirm", signedIn, mine, async (req, res) => { const r = await J.confirmTip(req.job.id, req.params.tid, asPerson(req)); send(res, r.error ? r : { ...J.view(r.job), tip: r.tip?.id, ...(r.note ? { note: r.note } : {}) }); });
app.get("/api/jobs/:id/risk", signedIn, mine, async (req, res) => { const { riskOf } = await import("./risk.js"); const o = req.query.offer ? req.job.offers.find((x) => x.id === req.query.offer) : null; const r = await riskOf(req.job, { price: o?.amount ?? req.job.agreed?.price ?? req.job.scope?.priceCeiling, pro: pros.pro(o?.pro || req.job.agreed?.pro || ""), history: J.jobsOf(req.person.id) }); res.json({ ...r, inputs: undefined }); });
app.get("/api/jobs/:id/activity", signedIn, party, (req, res) => res.json(forRef(req.job.id)));
app.patch("/api/jobs/:id/options", signedIn, mine, (req, res) => send(res, out(J.setOptions(req.job.id, req.body || {}, asPerson(req)))));
app.patch("/api/jobs/:id/scope", signedIn, mine, personOnlyIf((req) => req.body?.priceCeiling != null || req.body?.bufferPct != null), (req, res) => { const b = { ...(req.body || {}) }; if (b.priceCeiling != null) b.priceCeiling = toCents(b.priceCeiling); send(res, out(J.editScope(req.job.id, b, asPerson(req)))); });
app.post("/api/jobs/:id/offers/request", signedIn, party, async (req, res) => send(res, out(await J.requestOffers(req.job.id, asPerson(req)))));
app.post("/api/jobs/:id/offers/:offer/counter", signedIn, mine, async (req, res) => send(res, out(await J.counterOffer(req.job.id, req.params.offer, toCents(req.body?.amount), asPerson(req)))));
// who's near the job and asking them; the negotiation on an offer (the same layer the agents use)
app.get("/api/jobs/:id/nearby", signedIn, mine, (req, res) => send(res, J.findNearby(req.job.id, {}, asPerson(req))));
app.post("/api/jobs/:id/reviews", signedIn, mine, async (req, res) => send(res, await J.checkReviews(req.job.id, { ids: req.body?.ids }, asPerson(req))));
app.post("/api/jobs/:id/ask", signedIn, mine, async (req, res) => send(res, await J.askPros(req.job.id, { to: req.body?.to, question: req.body?.question }, asPerson(req))));
app.get("/api/jobs/:id/offers/:offer/negotiation", signedIn, mine, (req, res) => send(res, J.negotiationOf(req.job.id, req.params.offer, asPerson(req))));
app.post("/api/jobs/:id/offers/:offer/negotiate", signedIn, mine, async (req, res) => { const r = await J.negotiate(req.job.id, req.params.offer, { move: req.body?.move, amount: req.body?.amount != null ? toCents(req.body.amount) : null, note: req.body?.note }, asPerson(req)); send(res, r?.error ? r : r.negotiation); });
app.post("/api/jobs/:id/offers/:offer/accept", signedIn, mine, personOnlyIf((req) => !!req.body?.raiseCeiling), async (req, res) => send(res, out(await J.acceptOffer(req.job.id, req.params.offer, { actor: asPerson(req), payWith: req.body?.payWith || null, raiseCeiling: req.body?.raiseCeiling === true, slot: req.body?.slot ?? null }))));
app.post("/api/jobs/:id/hold/order", signedIn, mine, async (req, res) => send(res, out(await J.holdOrder(req.job.id, asPerson(req)))));
app.post("/api/jobs/:id/hold/with", signedIn, mine, async (req, res) => send(res, out(await J.holdWith(req.job.id, asPerson(req), { method: String(req.body?.method || ""), token: req.body?.token || null, cmid: req.body?.cmid ? String(req.body.cmid).slice(0, 32) : null }))));
app.post("/api/jobs/:id/hold/confirm", signedIn, mine, async (req, res) => send(res, out(await J.confirmHold(req.job.id, asPerson(req), { orderId: req.body?.orderId || null }))));
app.post("/api/jobs/:id/hold/retry", signedIn, mine, async (req, res) => send(res, out(await J.retryHold(req.job.id, asPerson(req), { payWith: req.body?.payWith || null }))));
// decline: true puts PayPal's sandbox decline trigger (CCREJECT-REFUSED) as the cardholder name: the bank refuses
app.post("/api/jobs/:id/hold/card", signedIn, mine, async (req, res) => send(res, out(await J.holdByCard(req.job.id, { ...asPerson(req), ...(req.body?.decline === true ? { cardName: "CCREJECT-REFUSED" } : {}) }))));
// the order-update callback (DONE_ADDRESS_CALLBACK=1): PayPal asks whether the address the payer picked is in Austin
app.post("/api/paypal/order-update-callback", async (req, res) => {
  const a = req.body?.shipping_address || req.body?.purchase_units?.[0]?.shipping?.address || {}, zip = String(a.postal_code || "").slice(0, 5);
  if (!(await import("./geo.js")).inAustin(zip)) return res.status(422).json({ name: "UNPROCESSABLE_ENTITY", details: [{ issue: "ADDRESS_ERROR" }], message: "VeriPay serves Austin, TX ZIP codes." });
  res.json({ id: req.body?.id, purchase_units: (req.body?.purchase_units || []).map((u) => ({ reference_id: u.reference_id, amount: u.amount })) });
});
// Apple Pay's domain check: the association file Apple gives the merchant (APPLE_PAY_DOMAIN_FILE), served as Apple asks
app.get("/.well-known/apple-developer-merchantid-domain-association", (req, res) => { const f = process.env.APPLE_PAY_DOMAIN_FILE; if (!f || !fs.existsSync(f)) return res.status(404).type("text/plain").send("Apple Pay isn't set up on this server (APPLE_PAY_DOMAIN_FILE)."); res.type("text/plain").send(fs.readFileSync(f)); });
app.post("/api/jobs/:id/changes/:cid/approve", signedIn, mine, personOnly, async (req, res) => send(res, out(await J.approveChange(req.job.id, req.params.cid, asPerson(req)))));
app.post("/api/jobs/:id/changes/:cid/advance/approve", signedIn, mine, personOnly, async (req, res) => send(res, out(await J.approveMaterialsAdvance(req.job.id, req.params.cid, asPerson(req)))));
app.post("/api/jobs/:id/changes/:cid/advance/decline", signedIn, mine, (req, res) => send(res, out(J.declineMaterialsAdvance(req.job.id, req.params.cid, asPerson(req), req.body?.note))));
app.post("/api/jobs/:id/changes/:cid/decline", signedIn, mine, (req, res) => send(res, out(J.declineChange(req.job.id, req.params.cid, asPerson(req), req.body?.note))));
const msArg = (req) => ({ milestone: req.body?.milestone || null, waiveInspection: req.body?.waiveInspection === true, acknowledgeFailed: req.body?.acknowledgeFailed || null });
// the customer confirms checks the checker left to a person: a pass, then the job's review window and inspector as usual
app.post("/api/jobs/:id/scope/apply-revision", signedIn, mine, personOnly, (req, res) => send(res, out(J.applyRevision(req.job.id, req.body?.from || "review", asPerson(req)))));
app.post("/api/jobs/:id/confirm", signedIn, mine, personOnly, async (req, res) => send(res, out(await J.confirm(req.job.id, asPerson(req), { ...msArg(req), checkIds: Array.isArray(req.body?.checkIds) ? req.body.checkIds : null, fixIds: Array.isArray(req.body?.fixIds) ? req.body.fixIds : null, fix: req.body?.fix || null }))));
app.post("/api/jobs/:id/release", signedIn, mine, personOnly, async (req, res) => send(res, out(await J.release(req.job.id, asPerson(req), msArg(req)))));
app.post("/api/jobs/:id/request-fix", signedIn, mine, (req, res) => send(res, out(J.requestFix(req.job.id, req.body?.reason, asPerson(req), msArg(req)))));
app.post("/api/jobs/:id/dispute", signedIn, mine, async (req, res) => send(res, out(await J.openDispute(req.job.id, req.body?.reason, asPerson(req), msArg(req)))));
// retainage: a defect claim in the warranty window (photos as data: URLs), and the rating once paid
app.post("/api/jobs/:id/defect", signedIn, mine, async (req, res) => send(res, out(await J.claimDefect(req.job.id, { reason: req.body?.reason, items: req.body?.items || [] }, asPerson(req)))));
// paperwork, written by code from the job's records (reports.js)
const R = await import("./reports.js");
const sendDoc = (res, ext, d, name) => ext === "html" ? res.type("html").send(d.html) : ext === "pdf" ? res.type("application/pdf").set("Content-Disposition", `inline; filename="${name}.pdf"`).send(d.pdf()) : res.json(d.data);
app.get("/api/jobs/:id/reports", signedIn, party, (req, res) => res.json({ reports: [...(req.job.reports || []), ...(["released", "resolved"].includes(req.job.status) && !(req.job.reports || []).some((r) => r.kind === "closeout") ? [{ kind: "closeout", at: req.job.paidAt || null, url: `/api/jobs/${req.job.id}/reports/closeout.pdf`, onDemand: true }] : []), ...(req.job.milestones || []).filter((m) => m.release && !(req.job.reports || []).some((r) => r.kind === "progress" && r.milestone === m.id)).map((m) => ({ kind: "progress", milestone: m.id, at: m.release.at, url: `/api/jobs/${req.job.id}/reports/progress/${m.id}.html`, onDemand: true }))], label: R.LABEL, available: { progress: (req.job.milestones || []).filter((m) => m.release).map((m) => `/api/jobs/${req.job.id}/reports/progress/${m.id}.html`), closeout: [`/api/jobs/${req.job.id}/reports/closeout.html`, `/api/jobs/${req.job.id}/reports/closeout.pdf`], daily: `/api/jobs/${req.job.id}/reports/daily.html`, insurance: R.waterJob(req.job) ? [`/api/jobs/${req.job.id}/reports/insurance.html`, `/api/jobs/${req.job.id}/reports/insurance.pdf`] : null } }));
app.get(/^\/api\/jobs\/([^/]+)\/reports\/progress\/(m\d+)\.(html|json)$/, (req, res, next) => { req.params.id = req.params[0]; next(); }, signedIn, party, (req, res) => { const m = req.job.milestones.find((x) => x.id === req.params[1]); if (!m) return res.status(404).json({ error: "not_found" }); sendDoc(res, req.params[2], R.progressReport(req.job, m)); });
// the insurance claim package for a water-damage or leak job (409 not_eligible otherwise): customer, landlord or tenant
app.get(/^\/api\/jobs\/([^/]+)\/reports\/insurance\.(html|pdf|json)$/, (req, res, next) => { req.params.id = req.params[0]; next(); }, signedIn, party, (req, res) => { const d = R.insuranceClaim(req.job); if (d.error) return res.status(409).json(d); sendDoc(res, req.params[1], d, `${req.job.number}-insurance-claim-package`); });
app.get(/^\/api\/jobs\/([^/]+)\/reports\/closeout\.(html|pdf|json)$/, (req, res, next) => { req.params.id = req.params[0]; next(); }, signedIn, party, (req, res) => sendDoc(res, req.params[1], R.closeout(req.job), `${req.job.number}-closeout`));
app.get(/^\/api\/jobs\/([^/]+)\/reports\/daily\.(html|json)$/, (req, res, next) => { req.params.id = req.params[0]; next(); }, signedIn, party, async (req, res) => sendDoc(res, req.params[1], await R.dailyLogWithWeather(req.job)));
app.post("/api/jobs/:id/photos", signedIn, party, (req, res) => send(res, out(J.addReference(req.job.id, req.body?.items || [], asPerson(req)))));
app.post("/api/jobs/:id/rate", signedIn, mine, (req, res) => send(res, out(J.rate(req.job.id, req.body || {}, asPerson(req)))));
if (DEMO) { people_.ensureDemoInspector(); const l = people_.ensureDemoLandlord(); if (!hasPin(l.id)) setPin(l.id, process.env.DONE_DEMO_LANDLORD_PIN || "9753"); }
app.get("/api/inspectors", (req, res) => res.json(allPeople().filter((p) => p.role === "inspector").map((p) => ({ id: p.id, name: p.name, demo: p.demo, note: "A third-party home inspector (fictional, demo) who confirms milestones marked inspect." }))));
app.post("/api/jobs/:id/dispute/propose", signedIn, mine, (req, res) => send(res, out(J.proposeSettlement(req.job.id, toCents(req.body?.release), asPerson(req)))));
app.post("/api/jobs/:id/dispute/accept", signedIn, mine, personOnly, async (req, res) => send(res, out(await J.acceptSettlement(req.job.id, asPerson(req)))));
app.post("/api/jobs/:id/cancel", signedIn, mine, async (req, res) => send(res, out(await J.cancel(req.job.id, asPerson(req), req.body?.reason))));
// PayPal Disputes: escalate a paid job to PayPal; see the record
app.post("/api/jobs/:id/escalate", signedIn, mine, async (req, res) => send(res, await disputes.escalate(req.job.id, req.body?.reason, asPerson(req))));
app.get("/api/jobs/:id/paypal-dispute", signedIn, mine, (req, res) => res.json(disputes.view(req.job)));
// repeat visits (PLAN §3 step 9)
app.post("/api/jobs/:id/repeat", signedIn, mine, (req, res) => send(res, schedules.create(req.job.id, req.body || {}, asPerson(req))));
app.get("/api/schedules", signedIn, (req, res) => res.json(schedules.schedulesOf(req.person.id).map(schedules.view)));
app.get("/api/schedules/:id", signedIn, (req, res) => { const s = schedules.schedule(req.params.id); if (!s || s.customer !== req.person.id) return res.status(404).json({ error: "not_found" }); res.json(schedules.view(s)); });
app.post("/api/schedules/:id/:what", signedIn, async (req, res) => send(res, req.params.what === "run-now" ? (DEMO ? await schedules.runNow(req.params.id, req.person.id) : { error: "not_found" }) : schedules.set(req.params.id, req.person.id, req.params.what)));
app.get("/api/jobs/:id/receipts", signedIn, mine, (req, res) => res.json(req.job.receipts.map((r) => receipts.show(r.id, req.person.id))));
// an evidence file: for the customer, the hired pro, or staff
app.get("/api/jobs/:id/evidence/:eid", (req, res) => {
  const j = J.job(req.params.id), p = me(req), e = j?.evidence.find((x) => x.id === req.params.eid), ag = req.headers.authorization ? agentOf(req) : null;
  const okay = j && e && (isStaff(req) || (ag && (ag.person === j.customer || ag.person === j.tenant) && can(ag, "job_evidence")) || (p && (j.customer === p.id || (j.tenant && j.tenant === p.id) || (p.pro && j.agreed?.pro === p.pro) || (p.role === "inspector" && j.options?.inspector === p.id))));
  if (!okay) return res.status(404).end();
  const b = readFile(e);
  if (!b) return res.status(404).end();
  res.type(e.mime || "application/octet-stream").set("Cache-Control", "private, max-age=3600").send(b);
});
// the demo's built-in customer agent negotiates and hires (PLAN §3: counter once within the ceiling, then accept)
app.post("/api/jobs/:id/auto-hire", signedIn, mine, async (req, res) => send(res, await tools.autoHire(req.job.id, req.person.id, { payWith: req.body?.payWith || null })));

// ---- landlords and tenants (PLAN §15 item 1) --------------------------------------------------------------------------------
const asLandlord = (req, res, next) => (req.person.role === "landlord" ? next() : res.status(403).json({ error: "role", message: "Sign in as a landlord." }));
// invite codes are kept hashed in the people store's invites (people.js makeInvite), so a restart keeps them
app.post("/api/landlord/invites", signedIn, asLandlord, (req, res) => { const { code, unit, expires } = people_.makeInvite(req.person.id, { unit: req.body?.unit || null }); res.json({ code, link: `/tenant/join?code=${code}`, unit, expires, oneUse: true, tell: "Give this code to your tenant: they enter it on the website (POST /api/tenant/landlord { code })." }); });
app.get("/api/landlord/tenants", signedIn, asLandlord, (req, res) => res.json(people_.tenancyView(req.person)));
app.delete("/api/landlord/tenants/:pid", signedIn, asLandlord, (req, res) => { const t = person(req.params.pid); if (!t || t.landlord?.id !== req.person.id) return res.status(404).json({ error: "not_found" }); res.json({ ok: people_.unlinkTenant(t.id) }); });
app.get("/api/demo/landlord", (req, res) => { if (!DEMO) return res.status(404).end(); const l = people_.ensureDemoLandlord(); res.json({ id: l.id, name: l.name, demo: true, signIn: { as: "landlord", demo: true, pinFrom: "DONE_DEMO_LANDLORD_PIN (default 9753)" }, agent: "A demo landlord agent answers within minutes: it hires the tenant's suggested offer (else the cheapest acceptable one) within the landlord's limits, answers change orders, confirms checks left to a person. Labelled \"Demo landlord's agent\"." }); });
app.post("/api/tenant/landlord", signedIn, (req, res) => {
  if (req.person.role !== "customer") return res.status(403).json({ error: "role", message: "A tenant is a customer account." });
  let landlord = null, unit = req.body?.unit || null;
  if (req.body?.demo === true && DEMO) landlord = people_.ensureDemoLandlord().id;
  else { const i = people_.redeemInvite(req.body?.code, req.person.id); if (!i) return res.status(410).json({ error: "code", message: "That invite code has been used or has expired. Ask your landlord for a new one." }); landlord = i.landlord; unit = i.unit || unit; }
  const r = people_.linkTenant(req.person.id, landlord, { unit });
  if (!r) return res.status(400).json({ error: "landlord", message: "Couldn't link: the landlord account isn't a landlord." });
  record({ actor: { kind: "person", person: req.person.id }, who: [landlord], action: "tenant_linked", summary: `${req.person.name} linked as your tenant${unit ? ` (${unit})` : ""}.`, ref: null });
  res.json({ person: viewPerson(person(req.person.id)), tenancy: people_.tenancyView(person(req.person.id)) });
});
app.delete("/api/tenant/landlord", signedIn, (req, res) => res.json({ ok: people_.unlinkTenant(req.person.id) }));

// ---- "Your agent": the one conversation (PLAN §17) ------------------------------------------------------------------------------
assistant.catchUp();
app.get("/api/assistant/thread", signedIn, (req, res) => res.json(assistant.thread(req.person.id, { after: +req.query.after || 0 })));
// { text, photos: [{ dataUrl }] } (up to 6 photos of the problem; a photo alone is fine)
app.post("/api/assistant/message", signedIn, async (req, res) => { const t = String(req.body?.text || "").trim(), photos = Array.isArray(req.body?.photos) ? req.body.photos : []; if (!t && !photos.length) return res.status(400).json({ error: "text", message: "Say something (text), or send photos." }); send(res, await assistant.message(req.person.id, t, { photos })); });
// an action's needsPin is checked here: without the person's PIN step-up it's 403 step_up (the agent never acts as them)
app.post("/api/assistant/act", signedIn, async (req, res) => { const r = await assistant.act(req.person.id, String(req.body?.action || ""), { steppedUp: steppedUp(req) }); res.status(r.error === "step_up" ? 403 : r.error === "not_found" ? 404 : r.error === "state" ? 409 : 200).json(r); });
// ---- the home profile and its maintenance agent (PLAN §16 item 1) ---------------------------------------------------------
app.get("/api/home", signedIn, (req, res) => res.json(home.homeOf(req.person.id)));
app.post("/api/home/appliances", signedIn, (req, res) => send(res, home.addAppliance(req.person.id, req.body || {})));
app.delete("/api/home/appliances/:id", signedIn, (req, res) => res.json({ ok: home.removeAppliance(req.person.id, req.params.id) }));
app.get("/api/home/suggestions", signedIn, (req, res) => res.json({ suggestions: home.suggestionsFor(req.person.id) }));
app.post("/api/home/suggestions/:id/accept", signedIn, async (req, res) => { const r = await home.acceptSuggestion(req.person.id, req.params.id, asPerson(req), { budget: req.body?.budget != null ? toCents(req.body.budget) : null }); send(res, r.error ? r : { ...J.view(r.job), suggestion: r.suggestion.id }); });
app.post("/api/home/suggestions/:id/dismiss", signedIn, (req, res) => res.json({ ok: home.dismissSuggestion(req.person.id, req.params.id) }));
// ---- neighborhood group jobs (PLAN §16 item 3) ------------------------------------------------------------------------------
app.get("/api/groups", signedIn, (req, res) => res.json({ groups: groups.openGroupsNear(req.query.zip || req.person.zip, req.query.type || null).map((g) => groups.viewGroup(g, req.person.id)) }));
app.get("/api/groups/:id", signedIn, (req, res) => { const g = groups.group(req.params.id); if (!g) return res.status(404).json({ error: "not_found" }); res.json(groups.viewGroup(g, req.person.id)); });
app.post("/api/groups", signedIn, (req, res) => { const r = groups.openGroup(req.body?.job, asPerson(req)); send(res, r.error ? r : groups.viewGroup(r.group, req.person.id)); });
app.post("/api/groups/:id/join", signedIn, async (req, res) => { const r = await groups.joinGroup(req.params.id, asPerson(req), { job: req.body?.job || null, text: req.body?.text || null, budget: req.body?.budget != null ? toCents(req.body.budget) : null }); send(res, r.error ? r : { ...groups.viewGroup(r.group, req.person.id), job: J.view(r.job) }); });
// ---- notifications (PLAN §15 item 8): the inbox, settings, and the simulated outbox ---------------------------------------
// Telegram: link a chat (a one-use code for the bot), see whether one is linked, unlink it
app.post("/api/jobs/:id/hold/buffer", signedIn, mine, async (req, res) => { const r = await J.setPendingBuffer(req.job.id, { bufferPct: req.body?.bufferPct }, asPerson(req)); send(res, r?.error ? r : { ...J.view(r.job), amount: J.money(r.amount), was: r.was != null ? J.money(r.was) : null, approveUrl: r.approveUrl || null }); });
app.get("/api/telegram", signedIn, async (req, res) => { await TG.botName(); res.json(TG.statusOf(req.person.id)); });
app.post("/api/telegram/link", signedIn, async (req, res) => send(res, await TG.linkCode(req.person.id)));
app.delete("/api/telegram", signedIn, (req, res) => res.json(TG.unlink(req.person.id)));
app.get("/api/inbox", signedIn, (req, res) => res.json(inbox.inboxOf(req.person.id, { unread: req.query.unread === "1" || req.query.unread === "true", after: +req.query.after || 0, limit: +req.query.limit || 100, category: req.query.category || null })));
app.post("/api/inbox/read", signedIn, (req, res) => res.json(inbox.markRead(req.person.id, { ids: Array.isArray(req.body?.ids) ? req.body.ids : null, all: req.body?.all === true, read: req.body?.read !== false })));
app.get("/api/inbox/settings", signedIn, (req, res) => res.json(inbox.settingsOf(req.person.id)));
app.put("/api/inbox/settings", signedIn, (req, res) => send(res, inbox.setSettings(req.person.id, req.body || {})));
app.get("/api/inbox/outbox", signedIn, (req, res) => res.json(inbox.outboxOf(req.person.id)));

// ---- signed mandates (PLAN §15 item 2): the person's keys, the demo issuer, the record --------------------------------------
app.get("/api/mandates", signedIn, (req, res) => res.json({ keys: (req.person.mandateKeys || []).map((k) => ({ kid: k.kid, x: k.x, label: k.label, created: k.created })), serverKey: mandates.serverPublic(req.person.id), requireMandate: !!limitsOf(req.person).requireMandate, scopes: mandates.SCOPES, merchant: mandates.MERCHANT, mandates: mandates.mandatesOf(req.person.id) }));
app.post("/api/mandates/keys", signedIn, personOnly, (req, res) => send(res, mandates.addKey(req.person.id, { x: req.body?.x ?? req.body?.key, label: req.body?.label })));
app.delete("/api/mandates/keys/:kid", signedIn, personOnly, (req, res) => res.json({ ok: mandates.removeKey(req.person.id, req.params.kid) }));
app.post("/api/mandates/issue", signedIn, personOnly, (req, res) => {
  const b = req.body || {}, toks = tokensOf(req.person.id);
  if (!toks.some((t) => t.id === b.agentClient)) return res.status(400).json({ error: "agentClient", message: "agentClient is the id of one of your agent tokens (GET /api/tokens).", tokens: toks.map((t) => ({ id: t.id, label: t.label })) });
  if (b.jobId && J.job(b.jobId)?.customer !== req.person.id) return res.status(404).json({ error: "not_found", message: "No such job of yours." });
  send(res, mandates.issueForPerson(req.person.id, { agentClient: b.agentClient, maxAmount: b.maxAmount, scope: b.scope, jobId: b.jobId || null, minutes: b.minutes }));
});

// ---- pros on the website ----------------------------------------------------------------------------------------------------
const asPro = (req, res, next) => { const p = me(req), pr = p?.pro ? pros.pro(p.pro) : null; if (!pr) return res.status(401).json({ error: "signin", message: "Sign in as a pro." }); req.person = p; req.pro = pr; next(); };
const proActor = (req) => ({ kind: "pro", pro: req.pro.id, person: req.person.id });
app.get("/api/pros", (req, res) => res.json(pros.allPros().filter((p) => !req.query.trade || p.trade === req.query.trade).map((p) => pros.viewPro(p))));
// a public profile: verification badges, and ratings and photos only from jobs paid through VeriPay
app.get("/api/pros/:id/profile", (req, res) => { const p = pros.pro(req.params.id); if (!p) return res.status(404).json({ error: "not_found" }); res.json({ pro: pros.viewPro(p), ...J.proProfile(p.id) }); });
app.get("/api/pros/:id/photos/:eid", (req, res) => { const e = J.profilePhoto(req.params.id, req.params.eid), b = e && readFile(e); if (!b) return res.status(404).end(); res.type(e.mime).set("Cache-Control", "public, max-age=600").send(b); });
app.get("/api/pros/:id", (req, res) => { const p = pros.pro(req.params.id); if (!p) return res.status(404).json({ error: "not_found" }); res.json(pros.viewPro(p)); });
// a pro created by staff signs in on the website once, with the one-time code from their onboarding link
// onboarding: the pro sets their PIN here (4-6 digits; without one they're given one, shown once). A pro who already has
// a PIN (an onboarding link sent again) must give it: the link alone never signs anyone in.
function onboard(code, pin, meta = null) {
  const peek = pros.peekOnboarding(code);
  if (!peek && meta) pros.noteLateAttempt(code, meta);
  if (!peek) return { status: 410, body: { error: "code", message: "This onboarding link has been used or has expired. Ask staff (or your agent: readiness) for a new one." } };
  const had = peek.person && person(peek.person);
  if (had && hasPin(had.id)) { const c = checkPin(had.id, pin); if (c.error) return { status: c.locked ? 429 : pin == null ? 401 : 403, body: { ...c, needs: "pin", message: `You set a PIN when you first onboarded: enter it. ${c.message}` } }; }
  else if (pin != null && !validPin(pin)) return { status: 400, body: { error: "pin", message: "The PIN is 4 to 6 digits." } };
  const pr = pros.redeemOnboarding(code, meta);
  let p = pr.person && person(pr.person), shown = null;
  if (!p) { p = makePerson({ name: pr.owner || pr.name, role: "pro", zip: pr.zip, demo: false, via: "onboarding" }); updatePerson(p.id, { pro: pr.id }); pros.linkPerson(pr.id, p.id); }
  if (!hasPin(p.id)) { shown = pin != null ? null : String(crypto.randomInt(0, 1e6)).padStart(6, "0"); setPin(p.id, pin != null ? String(pin) : shown); }
  return { status: 200, p, pr, shown, sid: createSession(p.id, { stepUp: true }) };
}
app.post("/api/pro/onboard", (req, res) => {
  const o = onboard(req.body?.code, req.body?.pin, { route: "POST /api/pro/onboard (JSON)", ip: req.ip, ua: String(req.headers["user-agent"] || "").slice(0, 160) });
  if (o.status !== 200) return res.status(o.status).json(o.body);
  res.set("Set-Cookie", cookie(o.sid)).json({ person: viewPerson(o.p), pro: pros.viewPro(o.pr, { self: true }), readiness: pros.readiness(o.pr), ...(o.shown ? { pinOnce: o.shown } : {}), pin: { set: true, says: "You need your PIN to sign in again and to change where you're paid, your licence or insurance, or to take early pay. Your agent never gets it." }, next: "Verify your PayPal (PUT /api/pro/paypal), then your licence and insurance (PUT /api/pro/verification)." });
});
// a GET (a link preview, a probe) never uses the code: it shows a button; the click POSTs and signs in
app.get("/api/pro/onboard", (req, res) => { const pr = pros.peekOnboarding(req.query.code); if (!pr) return res.status(410).type("text/plain").send("This onboarding link has been used or has expired."); const esc = (x) => String(x).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]); res.type("html").send(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>VeriPay: sign in as ${esc(pr.name)}</title><body style="font:16px system-ui;margin:40px"><h1>Sign in as ${esc(pr.name)}</h1><p>This link signs you in on VeriPay once, so you can verify your PayPal, licence and insurance.</p><form method="post" action="/api/pro/onboard/form"><input type="hidden" name="code" value="${esc(req.query.code)}"><p><label>${pr.person && hasPin(pr.person) ? "Your PIN" : "Choose a PIN (4 to 6 digits): you'll need it to sign in again and to change where you're paid. Your agent never gets it."}<br><input name="pin" inputmode="numeric" pattern="\\d{4,6}" required autocomplete="off" style="font:inherit;padding:8px;margin-top:6px"></label></p><button style="font:inherit;padding:10px 18px">Continue</button></form></body>`); });
app.post("/api/pro/onboard/form", express.urlencoded({ extended: false }), (req, res) => { const o = onboard(req.body?.code, req.body?.pin || null, { route: "POST /api/pro/onboard/form (the HTML page)", ip: req.ip, ua: String(req.headers["user-agent"] || "").slice(0, 160) }); if (o.status !== 200) return res.status(o.status).type("text/plain").send(o.body.message); res.set("Set-Cookie", cookie(o.sid)).redirect("/pro"); });
// Spanish for pros (PLAN §15 item 5): a pro whose lang is "es" gets every /api/pro answer in Spanish (errors, next,
// waitingOn, readiness), the English beside it (i18n.js)
app.use("/api/pro", (req, res, next) => { const p = me(req), pr = p?.pro ? pros.pro(p.pro) : null; if (pr?.lang === "es") { const j0 = res.json.bind(res); res.json = (b) => j0(localizePro(pr, b)); } next(); });
const localizePro = (pr, b) => (Array.isArray(b) ? b : i18n.proAnswerIn("es", b?.id?.startsWith?.("job_") ? J.job(b.id) : null, b));
app.put("/api/pro/settings", asPro, (req, res) => send(res, pros.setProSettings(req.pro.id, req.body || {})));
app.put("/api/pro/payout-method", asPro, personOnly, (req, res) => send(res, pros.setPayoutMethod(req.pro.id, req.body || {})));
app.get("/api/pro/availability", asPro, (req, res) => { const av = calendar.availabilityOf(req.pro); res.json({ availability: av, says: calendar.hoursText(av), tz: calendar.TZ, next: calendar.freeSlots(av, { minutes: calendar.visitMinutes(req.pro, null), count: 5 }) }); });
app.put("/api/pro/availability", asPro, (req, res) => { const av = calendar.cleanAvailability(req.body || {}); if (av.error) return send(res, av); pros.setAvailability(req.pro.id, av); res.json({ availability: av, says: calendar.hoursText(av), tz: calendar.TZ }); });
app.get("/api/pros/:id/availability", (req, res) => { const p = pros.pro(req.params.id); if (!p) return res.status(404).json({ error: "not_found" }); const av = calendar.availabilityOf(p); res.json({ pro: p.id, says: calendar.hoursText(av), tz: calendar.TZ, weekly: av?.weekly || null, blocked: av?.blocked || [], open: calendar.freeSlots(av, { minutes: calendar.visitMinutes(p, null), count: Math.max(1, Math.min(20, +req.query.count || 6)), maxDays: Math.max(1, Math.min(60, +req.query.days || 14)) }) }); });
// the earnings dashboard (PLAN §16 item 4) and the verifiable work record (item 2)
app.get("/api/pro/dashboard", asPro, (req, res) => res.json(prodash.dashboard(req.pro.id, { months: +req.query.months || 12, from: /^\d{4}-\d{2}$/.test(req.query.from || "") ? req.query.from : null, to: /^\d{4}-\d{2}$/.test(req.query.to || "") ? req.query.to : null })));
app.get("/api/pro/dashboard.csv", asPro, (req, res) => res.type("text/csv").set("Content-Disposition", 'attachment; filename="done-and-paid-dashboard.csv"').send(prodash.dashboardCsv(prodash.dashboard(req.pro.id, { months: +req.query.months || 12 }))));
app.get("/api/pros/:id/record.json", (req, res) => { const r = workrecord.workRecord(req.params.id); if (!r) return res.status(404).json({ error: "not_found" }); res.json(r); });
app.get("/api/pros/:id/record.html", (req, res) => { const r = workrecord.workRecord(req.params.id); if (!r) return res.status(404).type("text").send("No such pro."); res.type("html").send(workrecord.recordPage(r)); });
app.post("/api/work-record/verify", (req, res) => { const rec = req.body?.record || req.body; if (!rec?.records) return res.status(400).json({ error: "record", message: "Send the record JSON (as GET /api/pros/:id/record.json returns it)." }); res.json(workrecord.verifyRecord(rec, req.body?.publicKey || receipts.publicKey())); });
// the pro's agent: the same short thread, camera-first (proAgent.js)
const proAgent = await import("./proAgent.js");
app.get("/api/pro/assistant/thread", asPro, (req, res) => res.json(proAgent.thread(req.person.id, req.pro.id, { after: +req.query.after || 0 })));
app.post("/api/pro/assistant/message", asPro, async (req, res) => { const t = String(req.body?.text || "").trim(); if (!t) return res.status(400).json({ error: "text", message: "Say something (text)." }); res.json(await proAgent.message(req.person.id, req.pro.id, t)); });
app.post("/api/pro/assistant/act", asPro, async (req, res) => { const r = await assistant.act(req.person.id, String(req.body?.action || ""), { steppedUp: steppedUp(req) }); res.status(r.error === "step_up" ? 403 : r.error === "not_found" ? 404 : r.error === "state" ? 409 : 200).json(r); });
app.get("/api/pro/readiness", asPro, (req, res) => res.json(pros.readiness(req.pro)));
app.post("/api/staff/pros/:id/onboarding", (req, res, next) => staff(req, res, next), (req, res) => { const l = pros.onboardingLink(req.params.id); if (!l) return res.status(404).json({ error: "not_found" }); res.json(l); });
app.get("/api/pro/me", asPro, (req, res) => res.json({ pro: pros.viewPro(req.pro, { self: true }), earnings: J.earnings(req.pro.id) }));
app.put("/api/pro/paypal", asPro, personOnly, (req, res) => send(res, pros.setPayPal(req.pro.id, req.body || {})));
// Log in with PayPal for the payout account: start (the person, PIN-confirmed), then PayPal's redirect back here
// the pro as a PayPal merchant of their own (Partner Referrals v2): start (the person, PIN-confirmed), PayPal's return, status
app.post("/api/pro/paypal-onboarding", asPro, personOnly, async (req, res) => send(res, await (await import("./onboarding.js")).start(req.pro.id, req.person.id)));
app.get("/api/pro/paypal-onboarding", asPro, async (req, res) => { const ob = await import("./onboarding.js"); if (req.query.sync && req.pro.merchant) await ob.sync(req.pro.id); res.json(ob.view(pros.pro(req.pro.id))); });
app.get("/api/pro/paypal-onboarding/return", signedIn, async (req, res) => {
  const pr = req.person.pro && pros.pro(req.person.pro);
  if (!pr) return res.redirect("/pro/payouts?onboarding=sign-in");
  const r = await (await import("./onboarding.js")).sync(pr.id, { fromPayPal: { merchantIdInPayPal: req.query.merchantIdInPayPal ? String(req.query.merchantIdInPayPal).slice(0, 40) : null, permissionsGranted: req.query.permissionsGranted ?? null, consentStatus: req.query.consentStatus ?? null } });
  res.redirect(`/pro/payouts?onboarding=${encodeURIComponent(r.error ? r.message : r.status)}`);
});
app.post("/api/pro/paypal-login", asPro, personOnly, async (req, res) => res.json((await import("./paypallogin.js")).start(req.pro.id, req.person.id)));
app.get("/api/pro/paypal-login/callback", async (req, res) => { const r = await (await import("./paypallogin.js")).callback({ code: req.query.code, state: req.query.state, error: req.query.error }); res.redirect(`/pro/payouts?paypal=${r.ok ? "linked" : encodeURIComponent(r.message || r.error)}`); });
app.post("/api/pro/keys", asPro, personOnly, (req, res) => res.json({ key: pros.keyFor(req.pro.id, req.body?.label || "my agent"), note: "Shown once. Send it as Authorization: Bearer dpk_... to /a2a.", a2a: `${PUBLIC_URL}/a2a` }));
app.delete("/api/pro/keys/:id", asPro, (req, res) => res.json({ ok: pros.revokeKey(req.pro.id, req.params.id) }));
app.put("/api/pro/rates", asPro, (req, res) => send(res, pros.setRates(req.pro.id, req.body || {})));
app.get("/api/pro/feed", asPro, (req, res) => res.json(J.feedFor(req.pro, { since: req.query.since || null, radius: req.query.radius || null })));
app.get("/api/pro/jobs", asPro, (req, res) => res.json({ open: J.openFor(req.pro, { since: req.query.since || null, radius: req.query.radius || null }), mine: J.jobsOfPro(req.pro.id).filter((j) => j.agreed?.pro === req.pro.id).map((j) => ({ id: j.id, number: j.number, status: j.status, title: j.scope.title, due: J.money(J.due(j)), zip: j.address.zip, next: J.view(j, { as: "pro" }).next, updated: j.updated })) }));
const proJob = (req, res, next) => { const j = J.job(req.params.id); if (!j || !(j.agreed?.pro === req.pro.id || j.offers.some((o) => o.pro === req.pro.id) || (["scoped", "offered"].includes(j.status) && j.scope?.trade === req.pro.trade))) return res.status(404).json({ error: "not_found", message: "No such job." }); req.job = j; next(); };
app.get("/api/pro/jobs/:id", asPro, proJob, (req, res) => res.json(J.view(req.job, { as: "pro", pro: req.pro.id })));
app.post("/api/pro/jobs/:id/offer", asPro, proJob, (req, res) => send(res, out(J.proOffer(req.pro.id, req.job.id, { slots: req.body?.slots ?? req.body?.slot ?? null, amount: toCents(req.body?.amount), arrival: req.body?.arrival, helper: req.body?.helper !== false, note: req.body?.note, parts: req.body?.parts != null ? toCents(req.body.parts) : null, partsPolicy: req.body?.partsPolicy ?? null }, proActor(req)), "pro", req.pro?.id)));
app.post("/api/pro/offers/:offer/withdraw", asPro, (req, res) => send(res, out(J.withdrawOffer(req.pro.id, req.params.offer, proActor(req)), "pro", req.pro?.id)));
app.post("/api/pro/offers/:offer/:kind", asPro, async (req, res) => (!["accept", "counter", "decline"].includes(req.params.kind) ? res.status(404).json({ error: "not_found" }) : send(res, out(await J.proAnswer(req.pro.id, req.params.offer, { kind: req.params.kind, amount: toCents(req.body?.amount) }, proActor(req)), "pro", req.pro?.id))));
app.post("/api/pro/jobs/:id/reschedule", asPro, proJob, (req, res) => { const r = J.reschedule(req.job.id, { from: req.body?.from, reason: req.body?.reason }, proActor(req)); send(res, r.error ? r : { ...J.view(r.job, { as: "pro", pro: req.pro.id }), ...(r.rescheduled ? { rescheduled: r.rescheduled } : { proposal: r.proposal }) }); });
app.post("/api/pro/jobs/:id/reschedule/:pid", asPro, proJob, (req, res) => send(res, out(J.answerReschedule(req.job.id, req.params.pid, { accept: req.body?.accept === true, note: req.body?.note }, proActor(req)), "pro", req.pro?.id)));
app.post("/api/pro/jobs/:id/tracking", asPro, proJob, async (req, res) => { const r = await J.addPartsTracking(req.pro.id, req.job.id, { carrier: req.body?.carrier, trackingNumber: req.body?.trackingNumber, note: req.body?.note }, proActor(req)); send(res, r?.error ? r : { job: r.job.id, tracking: r.tracking }); });
app.post("/api/pro/jobs/:id/start", asPro, proJob, (req, res) => send(res, out(J.startWork(req.pro.id, req.job.id, proActor(req), { before: req.body?.before || [] }), "pro", req.pro?.id)));
app.post("/api/pro/jobs/:id/before", asPro, proJob, multipart, (req, res) => { const items = Buffer.isBuffer(req.body) ? formItems(req) : req.body?.items || []; if (items?.error) return send(res, items); send(res, out(J.addBefore(req.pro.id, req.job.id, items, proActor(req)), "pro", req.pro?.id)); });
app.post("/api/pro/jobs/:id/scope-reply", asPro, proJob, async (req, res) => { const r = await J.scopeReply(req.pro.id, req.job.id, req.body?.text, proActor(req)); send(res, r.error ? r : { ...J.view(r.job, { as: "pro", pro: req.pro.id }), reply: r.reply }); });
app.post("/api/pro/jobs/:id/early-pay", asPro, proJob, personOnly, async (req, res) => send(res, out(await J.earlyPay(req.pro.id, req.job.id, { milestone: req.body?.milestone || null }, proActor(req)), "pro", req.pro?.id)));
app.post("/api/pro/jobs/:id/defect-fix", asPro, proJob, multipart, async (req, res) => { const items = Buffer.isBuffer(req.body) ? formItems(req) : req.body?.items || []; if (items?.error) return send(res, items); send(res, out(await J.fixDefect(req.pro.id, req.job.id, items, proActor(req)), "pro", req.pro?.id)); });
app.put("/api/pro/verification", asPro, personOnly, (req, res) => send(res, pros.setVerification(req.pro.id, req.body || {})));
app.post("/api/pro/jobs/:id/changes/:cid/advance", asPro, proJob, async (req, res) => send(res, out(await J.requestMaterialsAdvance(req.pro.id, req.job.id, { change: req.params.cid, items: req.body?.items || [], supplierEmail: req.body?.supplierEmail ?? null }, proActor(req)), "pro", req.pro?.id)));
app.post("/api/pro/jobs/:id/changes/:cid/return", asPro, proJob, (req, res) => send(res, out(J.returnMaterials(req.pro.id, req.job.id, { change: req.params.cid, amount: toCents(req.body?.amount), note: req.body?.note }, proActor(req)), "pro", req.pro?.id)));
app.post("/api/pro/jobs/:id/changes/:cid/withdraw", asPro, proJob, (req, res) => send(res, out(J.withdrawChange(req.pro.id, req.job.id, req.params.cid, proActor(req)), "pro", req.pro?.id)));
app.post("/api/pro/jobs/:id/changes", asPro, proJob, async (req, res) => send(res, out(await J.requestChange(req.pro.id, req.job.id, { amount: toCents(req.body?.amount), reason: req.body?.reason, evidence: req.body?.evidence, kind: req.body?.kind, kind: req.body?.kind }, proActor(req)), "pro", req.pro?.id)));
function formItems(req) {
  const m = parseMultipart(req.body, req.headers["content-type"]);
  if (!m) return { error: "multipart", message: "Couldn't read the form." };
  const f = m.fields, at = (k, i) => f[`${k}_${i}`] ?? f[k];
  const items = m.files.map((x, i) => ({ buf: x.buf, mime: x.mime, name: x.filename, kind: at("kind", i) || (x.mime === "application/pdf" ? "receipt" : "photo"), checkId: at("checkId", i) || null, checkIds: at("checkIds", i) || undefined, text: at("text", i) || undefined, label: at("label", i) || undefined, phase: at("phase", i) || undefined }));
  if (!m.files.length && f.text) items.push({ kind: "note", text: f.text, checkId: f.checkId || null });
  items.submit = f.submit === "true" || f.submit === "1"; items.milestone = f.milestone || null;
  return items;
}
// evidence: multipart/form-data (files named "file", fields kind, checkId, text; or per file kind_<i>, checkId_<i>,
// text_<i>) or JSON { items: [{ kind, dataUrl?, text?, checkId?, name? }] }; submit: true sends it all to the check
app.post("/api/pro/jobs/:id/evidence", asPro, proJob, multipart, async (req, res) => {
  let items, submit = false, milestone = null;
  if (Buffer.isBuffer(req.body)) { items = formItems(req); if (items.error) return send(res, items); submit = items.submit; milestone = items.milestone; }
  else { items = req.body?.items || []; submit = !!req.body?.submit; milestone = req.body?.milestone || null; }
  if (submit) { const pend = req.job.changeOrders.find((c) => c.status === "pending"); if (pend) return send(res, { error: "pending", message: `Nothing was stored: your change order +${J.money(pend.amount).usd} is waiting for the customer (${pend.needs}). Wait, or withdraw it (POST /api/pro/jobs/${req.job.id}/changes/${pend.id}/withdraw) and send again.`, change: pend.id, waitingOn: "customer" }); }
  const r = J.addEvidence(req.pro.id, req.job.id, items, proActor(req));
  if (r.error) return send(res, r);
  if (submit) return send(res, out(await J.submit(req.pro.id, req.job.id, proActor(req), { milestone }), "pro", req.pro?.id));
  res.json({ ...J.view(r.job, { as: "pro", pro: req.pro.id }), added: r.evidence.map((e) => e.id) });
});
app.post("/api/pro/jobs/:id/submit", asPro, proJob, async (req, res) => send(res, out(await J.submit(req.pro.id, req.job.id, proActor(req), { milestone: req.body?.milestone || null }), "pro", req.pro?.id)));
app.post("/api/pro/jobs/:id/dispute", asPro, proJob, async (req, res) => send(res, out(await J.openDispute(req.job.id, req.body?.reason, proActor(req), { milestone: req.body?.milestone || null }), "pro", req.pro?.id)));
app.post("/api/pro/jobs/:id/dispute/propose", asPro, proJob, (req, res) => send(res, out(J.proposeSettlement(req.job.id, toCents(req.body?.release), proActor(req)), "pro", req.pro?.id)));
app.post("/api/pro/jobs/:id/dispute/accept", asPro, proJob, async (req, res) => send(res, out(await J.acceptSettlement(req.job.id, proActor(req)), "pro", req.pro?.id)));
// checked invoices for off-platform jobs: sent only after the checks pass
app.get("/api/pro/invoices", asPro, (req, res) => res.json(invoices.invoicesOf(req.pro.id).map(invoices.view)));
app.post("/api/pro/invoices", asPro, async (req, res) => { const b = req.body || {}; send(res, await invoices.create(req.pro.id, { ...b, amount: toCents(b.amount), allowTip: b.allowTip === true, minDue: b.minDue ? toCents(b.minDue) : null, lines: Array.isArray(b.lines) ? b.lines.map((x) => ({ ...x, amount: toCents(x.amount) })) : null, tripFee: b.tripFee ? toCents(b.tripFee) : 0 })); });
app.get("/api/pro/paylinks", asPro, (req, res) => res.json(paylinks.linksOf(req.pro.id).map(paylinks.view)));
app.post("/api/pro/paylinks", asPro, personOnly, async (req, res) => { const b = req.body || {}; send(res, await paylinks.create(req.pro.id, { title: b.title, amount: toCents(b.amount), purpose: b.purpose, notes: Array.isArray(b.notes) ? b.notes : null, taxPct: b.taxPct || 0 })); });
app.post("/api/pro/paylinks/:id/close", asPro, async (req, res) => send(res, await paylinks.close(req.pro.id, req.params.id)));
app.post("/api/pro/paylinks/:id/sync", asPro, async (req, res) => { const l = paylinks.linksOf(req.pro.id).find((x) => x.id === req.params.id); if (!l) return res.status(404).json({ error: "not_found", message: "No such link." }); await paylinks.sync(l); res.json(paylinks.view(l)); });
app.get("/api/pro/invoice-templates", asPro, (req, res) => res.json(invoices.templatesOf(req.pro.id).map(invoices.templateView)));
app.post("/api/pro/invoice-templates", asPro, async (req, res) => { const b = req.body || {}; send(res, await invoices.saveTemplate(req.pro.id, { ...b, amount: b.amount != null ? toCents(b.amount) : undefined })); });
app.delete("/api/pro/invoice-templates/:id", asPro, async (req, res) => send(res, await invoices.deleteTemplate(req.pro.id, req.params.id)));
app.get("/api/pro/invoice-templates/paypal", asPro, async (req, res) => { try { res.json(await invoices.paypalTemplates()); } catch (e) { res.status(502).json({ error: "paypal", message: why(e) }); } });
app.patch("/api/pro/invoice-templates/:id", asPro, async (req, res) => send(res, await invoices.updateTemplate(req.pro.id, req.params.id, { name: req.body?.name || null, amount: req.body?.amount != null ? toCents(req.body.amount) : null })));
const myInv = (req, res, next) => { const x = invoices.invoice(req.params.id); if (!x || x.pro !== req.pro.id) return res.status(404).json({ error: "not_found", message: "No such invoice." }); req.inv = x; next(); };
app.get("/api/pro/invoices/:id", asPro, myInv, (req, res) => res.json(invoices.view(req.inv)));
app.post("/api/pro/invoices/:id/evidence", asPro, myInv, multipart, async (req, res) => {
  let items, submit = false;
  if (Buffer.isBuffer(req.body)) { const m = parseMultipart(req.body, req.headers["content-type"]); if (!m) return res.status(400).json({ error: "multipart" }); const f = m.fields; items = m.files.map((x, i) => ({ buf: x.buf, mime: x.mime, name: x.filename, kind: f[`kind_${i}`] || f.kind || "photo", checkId: f[`checkId_${i}`] || f.checkId || null, text: f[`text_${i}`] || f.text || undefined })); if (!m.files.length && f.text) items = [{ kind: "note", text: f.text, checkId: f.checkId || null }]; submit = f.submit === "true"; }
  else { items = req.body?.items || []; submit = !!req.body?.submit; }
  const r = invoices.addEvidence(req.pro.id, req.inv.id, items);
  if (r.error || !submit) return send(res, r);
  send(res, await invoices.submit(req.pro.id, req.inv.id));
});
app.post("/api/pro/invoices/:id/submit", asPro, myInv, async (req, res) => send(res, await invoices.submit(req.pro.id, req.inv.id)));
app.post("/api/pro/invoices/:id/cancel", asPro, myInv, async (req, res) => send(res, await invoices.cancel(req.pro.id, req.inv.id, { note: req.body?.note })));
// maintenance plans (PayPal Subscriptions): the customer starts and cancels them (PIN); the pro proves each month
app.post("/api/jobs/:id/plan", signedIn, mine, personOnly, async (req, res) => send(res, await plans.create(req.job.id, { amount: req.body?.amount != null ? toCents(req.body.amount) : null, setupFee: req.body?.setupFee ? toCents(req.body.setupFee) : null, every: req.body?.every ?? 1, visits: req.body?.visits ?? 0, trial: req.body?.trial === true, taxPct: req.body?.taxPct ?? 0, units: req.body?.units ?? 0, startOn: req.body?.startOn || null, payWith: req.body?.payWith === "card" ? "card" : null, ...(req.body?.shared != null ? { shared: req.body.shared === true } : {}) }, asPerson(req))));
app.get("/api/plans", signedIn, async (req, res) => { const list = plans.plansOf(req.person.id); for (const p of list) await plans.sync(p); res.json(list.map(plans.view)); });
app.get("/api/plans/:id/return", async (req, res) => { const p = plans.plan(req.params.id); if (!p) return res.redirect("/"); await plans.sync(p); res.redirect(`/jobs/${p.job}?plan=${p.status}`); });
app.post("/api/plans/:id/pause", signedIn, personOnly, async (req, res) => send(res, await plans.pause(req.params.id, asPerson(req))));
app.post("/api/plans/:id/pay-outstanding", signedIn, personOnly, async (req, res) => send(res, await plans.payOutstanding(req.params.id, asPerson(req))));
app.post("/api/plans/:id/units", signedIn, personOnly, async (req, res) => send(res, await plans.changeUnits(req.params.id, req.body?.units, asPerson(req))));
app.post("/api/plans/:id/resume", signedIn, personOnly, async (req, res) => send(res, await plans.pause(req.params.id, asPerson(req), true)));
app.post("/api/plans/:id/price/accept", signedIn, personOnly, async (req, res) => send(res, await plans.acceptPrice(req.params.id, asPerson(req))));
app.post("/api/pro/plans/:id/price", asPro, (req, res) => send(res, plans.proposePrice(req.pro.id, req.params.id, toCents(req.body?.amount))));
app.post("/api/plans/:id/cancel", signedIn, personOnly, async (req, res) => send(res, await plans.cancel(req.params.id, asPerson(req))));
app.get("/api/pro/plans", asPro, async (req, res) => { const list = plans.plansOfPro(req.pro.id); for (const p of list) await plans.sync(p); res.json(list.map(plans.view)); });
app.post("/api/pro/plans/:id/months/:n/evidence", asPro, async (req, res) => { const r = plans.addEvidence(req.pro.id, req.params.id, req.params.n, req.body?.items || []); if (r.error || !req.body?.submit) return send(res, r); send(res, await plans.submit(req.pro.id, req.params.id, req.params.n)); });
app.post("/api/pro/plans/:id/months/:n/submit", asPro, async (req, res) => send(res, await plans.submit(req.pro.id, req.params.id, req.params.n)));
app.post("/api/pro/invoices/:id/remind", asPro, myInv, async (req, res) => send(res, await invoices.remind(req.pro.id, req.inv.id, { note: req.body?.note })));
app.post("/api/pro/invoices/:id/paid-outside", asPro, myInv, personOnly, async (req, res) => send(res, await invoices.recordPayment(req.pro.id, req.inv.id, { method: req.body?.method, note: req.body?.note })));
app.get("/api/pro/invoices/:id/qr.png", asPro, myInv, async (req, res) => { const r = await invoices.qr(req.pro.id, req.inv.id); if (r.error) return send(res, r); res.type("png").send(Buffer.from(r.png, "base64")); });
app.post("/api/pro/invoices/:id/sync", asPro, myInv, async (req, res) => { await invoices.syncOne(req.inv); res.json(invoices.view(req.inv)); });
app.get(/^\/api\/pro\/jobs\/([^/]+)\/closeout\.(html|pdf|json)$/, asPro, (req, res) => { const j = J.job(req.params[0]); if (!j || j.agreed?.pro !== req.pro.id) return res.status(404).json({ error: "not_found" }); sendDoc(res, req.params[1], R.closeout(j), `${j.number}-closeout`); });
// the pro's books: QuickBooks-importable CSV (format=qbo: Date,Description,Amount) or the detailed one; the year summary
app.get("/api/pro/books.csv", asPro, (req, res) => { const b = R.books(J.allJobs(), req.pro.id, { month: /^\d{4}-\d{2}$/.test(req.query.month || "") ? req.query.month : null, year: /^\d{4}$/.test(req.query.year || "") ? req.query.year : null }); res.type("text/csv").set("Content-Disposition", `attachment; filename="done-and-paid-${req.query.month || req.query.year || "all"}${req.query.format === "qbo" ? "-quickbooks" : ""}.csv"`).send(R.booksCsv(b, { format: req.query.format === "qbo" ? "qbo" : "detail" })); });
app.get("/api/pro/books/summary", asPro, (req, res) => { const y = /^\d{4}$/.test(req.query.year || "") ? req.query.year : String(new Date().getFullYear()); res.json(R.yearSummary(R.books(J.allJobs(), req.pro.id, { year: y }), y, req.pro)); });
app.get("/api/pro/payouts", asPro, (req, res) => res.json(J.earnings(req.pro.id)));

// ---- inspectors (parity #12): a third party the customer names on the job, who confirms milestones marked inspect ----
const asInspector = (req, res, next) => { const p = me(req); if (p?.role !== "inspector") return res.status(401).json({ error: "signin", message: "Sign in as an inspector." }); req.person = p; next(); };
app.get("/api/inspector/jobs", asInspector, (req, res) => res.json(J.jobsForInspector(req.person.id).map((j) => ({ id: j.id, number: j.number, status: j.status, title: j.scope.title, zip: j.address.zip, pro: j.agreed?.proName || null, milestones: (j.milestones || []).filter((m) => m.inspect).map((m) => ({ id: m.id, title: m.title, status: m.status, inspection: m.inspection })) }))));
app.get("/api/inspector/jobs/:id", asInspector, (req, res) => { const j = J.job(req.params.id); if (!j || j.options?.inspector !== req.person.id) return res.status(404).json({ error: "not_found" }); res.json(J.view(j, { as: "inspector" })); });
app.post("/api/inspector/jobs/:id/inspect", asInspector, async (req, res) => send(res, out(await J.inspect(req.person.id, req.params.id, req.body || {}), "inspector")));
// ---- staff: the back office (the demo signs in as staff with one click) -----------------------------------------------------
const staffSessions = new Set();
const isStaff = (req) => { const sid = (req.headers.cookie || "").match(/(?:^|;\s*)done_staff=([^;]+)/)?.[1]; return !!sid && staffSessions.has(sid); };
const staff = (req, res, next) => (isStaff(req) ? next() : res.status(401).json({ error: "staff", message: "Sign in as staff." }));
export const staffAllowed = (demo, adminToken, key) => { if (demo) return true; if (!adminToken || typeof key !== "string") return false; const a = Buffer.from(adminToken), b = Buffer.from(key); return a.length === b.length && crypto.timingSafeEqual(a, b); };
app.post("/api/auth/staff", (req, res) => { if (!staffAllowed(DEMO, process.env.ADMIN_TOKEN, req.body?.key)) return res.status(403).json({ error: "staff", message: DEMO ? "" : "Staff sign-in needs the admin key." }); const sid = crypto.randomBytes(24).toString("base64url"); staffSessions.add(sid); res.set("Set-Cookie", `done_staff=${sid}; HttpOnly; SameSite=Lax; Path=/`).json({ ok: true, label: DEMO ? "Demo staff (demo data only)" : "Staff", note: DEMO ? "Demo mode: anyone may open the staff view, and it shows only the demo's seeded and test data. With demo mode off, staff sign in with ADMIN_TOKEN. Customer and pro sessions never reach /api/staff." : undefined }); });
app.post("/api/auth/staff/signout", (req, res) => { const sid = (req.headers.cookie || "").match(/(?:^|;\s*)done_staff=([^;]+)/)?.[1]; if (sid) staffSessions.delete(sid); res.set("Set-Cookie", "done_staff=; Max-Age=0; Path=/").json({ ok: true }); });
// who let the money go: the checks by themselves, the customer, an expert, the inspector, staff, or the review window
const releasedBy = (j) => { const r = [...(j.milestones || [])].reverse().find((m) => m.release)?.release; if (!r) return null; const k = r.confirmed?.by?.kind || r.by?.kind; return k === "platform" ? (/review window/.test(r.why || "") ? "the review window ended" : "the checks (no person)") : k === "person" ? "the customer" : k === "agent" ? "the customer's agent" : k === "expert" ? "an expert reviewer" : k === "inspector" ? "the inspector" : k === "staff" ? "staff (arbiter)" : k || null; };
const row = (j) => { const b = J.balance(j); return { id: j.id, number: j.number, status: j.status, title: j.scope?.title, trade: j.scope?.trade, zip: j.address.zip, customer: person(j.customer)?.name, pro: j.agreed?.proName || null, price: j.agreed?.price ?? null, due: J.due(j), hold: j.hold?.amount ?? null, holdStatus: j.hold?.status || null, holdExpires: j.hold?.expiresAt || null, flow: j.hold?.flow || null, captured: b.captured, fee: b.fee, refunded: b.refunded, balanced: b.ok, checks: j.checks.at(-1)?.decision || null, checker: j.checks.at(-1)?.checker || null, checkedBy: j.checks.at(-1)?.decidedFrom?.label || j.checks.at(-1)?.checker || null, releasedBy: releasedBy(j), riskDispute: j.risk?.dispute?.p ?? null, riskOverrun: j.risk?.overrun?.p ?? null, riskSource: j.risk?.source || null, created: j.created, updated: j.updated }; };
app.get("/api/staff/overview", staff, (req, res) => {
  const all = J.allJobs(), by = (s) => all.filter((j) => j.status === s).length, sum = (f) => all.reduce((t, j) => t + f(j), 0);
  res.json({ now: nowIso(), paypal: pp().mode, holdMode: getHoldMode(), jobs: all.length, byStatus: Object.fromEntries(Object.keys(J.NEXT).map((s) => [s, by(s)])),
    held: J.money(sum((j) => (j.hold?.status === "held" ? j.hold.amount : 0))), captured: J.money(sum((j) => J.balance(j).captured)), fees: J.money(sum((j) => J.balance(j).fee)), paypalFees: J.money(sum((j) => J.balance(j).paypalFee)),
    paidToPros: J.money(sum((j) => J.balance(j).pro + J.balance(j).helper)), refunded: J.money(sum((j) => J.balance(j).refunded)), unbalanced: all.filter((j) => j.money.ledger.length && !J.balance(j).ok).length,
    autoReleased: all.filter((j) => j.status === "released" && j.timeline.at(-1)?.by?.kind === "platform").length, alerts: alerts.scan().filter((a) => !a.acked).length });
});
app.get("/api/staff/jobs", staff, (req, res) => res.json(J.allJobs().sort((a, b) => b.created.localeCompare(a.created)).map(row)));
app.get("/api/staff/jobs/:id", staff, (req, res) => { const j = J.job(req.params.id); if (!j) return res.status(404).json({ error: "not_found" }); res.json({ ...J.view(j, { as: "staff" }), customer: viewPerson(person(j.customer)), activity: forRef(j.id) }); });
app.get("/api/staff/holds", staff, (req, res) => res.json(J.allJobs().filter((j) => j.hold && ["held", "pending_approval"].includes(j.hold.status)).map((j) => ({ ...row(j), authorization: j.hold.authorization, order: j.hold.order, createdAt: j.hold.createdAt, honorUntil: j.hold.honorUntil, expiresAt: j.hold.expiresAt, reauthorized: !!j.hold.reauthorized })).sort((a, b) => String(a.expiresAt).localeCompare(String(b.expiresAt)))));
app.get("/api/staff/payouts", staff, (req, res) => res.json(J.allJobs().flatMap((j) => (j.money.payouts || (j.money.payout ? [j.money.payout] : [])).map((po) => ({ job: j.id, number: j.number, pro: j.agreed.proName, ...J.explainPayout(po), split: j.money.split })))));
app.get("/api/staff/ledger", staff, (req, res) => res.json(J.allJobs().flatMap((j) => j.money.ledger.map((l) => ({ job: j.id, number: j.number, ...l })))));
app.get("/api/staff/disputes", staff, (req, res) => res.json(J.allJobs().filter((j) => j.dispute).map((j) => ({ ...row(j), dispute: J.view(j, { as: "staff" }).dispute }))));
app.post("/api/staff/disputes/:id/resolve", staff, async (req, res) => send(res, out(await J.resolve(req.params.id, { outcome: req.body?.outcome, release: req.body?.release != null ? toCents(req.body.release) : null, note: req.body?.note }, { kind: "staff" }), "staff")));
app.get("/api/staff/pros", staff, (req, res) => res.json(pros.allPros().map((p) => ({ ...pros.viewPro(p, { self: true }), earnings: J.earnings(p.id).total }))));
app.post("/api/staff/pros", staff, (req, res) => send(res, pros.createPro(req.body || {})));
app.get("/api/staff/people", staff, (req, res) => res.json(allPeople().map((p) => ({ ...viewPerson(p), limits: tools.limitsView(p), jobs: J.jobsOf(p.id).length }))));
app.get("/api/staff/alerts", staff, (req, res) => res.json({ alerts: alerts.scan(), at: nowIso() }));
app.post("/api/staff/alerts/:id/ack", staff, (req, res) => res.json(alerts.ack(req.params.id)));
app.get("/api/staff/recon", staff, (req, res) => res.json({ running: recon.isRunning(), report: recon.latest(), history: recon.history(), agent: recon.latestAgent() }));
// the reconciliation agent: it chooses the PayPal tools step by step; code checks every finding
app.post("/api/staff/recon/agent", staff, async (req, res) => res.json(await recon.agentRun({ by: "on demand", budget: Math.max(3, Math.min(30, +req.body?.budget || 14)), model: req.body?.model !== false })));
app.get("/api/staff/recon/agent", staff, (req, res) => res.json(recon.latestAgent() || { none: true, run: "POST /api/staff/recon/agent" }));
app.post("/api/staff/recon", staff, async (req, res) => { if (req.query.wait) return res.json(await recon.run({ by: "on demand" })); recon.run({ by: "on demand" }).catch((e) => console.error("recon", e.message)); res.status(202).json({ running: true }); });
app.get("/api/staff/paypal-disputes", staff, (req, res) => res.json({ disputes: disputes.all(), sandboxNote: disputes.SANDBOX_NOTE }));
app.post("/api/staff/jobs/:id/paypal-dispute/sync", staff, async (req, res) => send(res, await disputes.sync(req.params.id)));
app.get("/api/staff/jobs/:id/paypal-dispute/packet", staff, (req, res) => { const j = J.job(req.params.id); if (!j?.agreed) return res.status(404).json({ error: "not_found" }); res.json(disputes.packet(j)); });
app.post("/api/staff/jobs/:id/paypal-dispute/evidence", staff, async (req, res) => send(res, await disputes.respond(req.params.id, { note: req.body?.note })));
// the disputes agent: every PayPal dispute read with the Agent Toolkit, tied to its job, a proposed action by code
app.post("/api/staff/paypal-disputes/triage", staff, async (req, res) => res.json(await disputes.triage({ by: "on demand", auto: req.body?.auto === true, via: req.body?.via === "paypal-mcp" ? "paypal-mcp" : "toolkit" })));
app.get("/api/staff/paypal-disputes/triage", staff, (req, res) => res.json(disputes.latestTriage() || { none: true, run: "POST /api/staff/paypal-disputes/triage" }));
app.post("/api/staff/jobs/:id/paypal-dispute/offer", staff, async (req, res) => send(res, await disputes.offer(req.params.id, { amount: req.body?.kind === "redo" ? 0 : toCents(req.body?.amount), note: req.body?.note, kind: req.body?.kind === "redo" ? "redo" : "refund" })));
app.post("/api/staff/jobs/:id/paypal-dispute/message", staff, async (req, res) => send(res, await disputes.message(req.params.id, { message: req.body?.message })));
app.post("/api/staff/jobs/:id/paypal-dispute/acknowledge-return", staff, async (req, res) => send(res, await disputes.acknowledgeReturn(req.params.id, { note: req.body?.note })));
app.post("/api/staff/jobs/:id/paypal-dispute/appeal", staff, async (req, res) => send(res, await disputes.appeal(req.params.id, { notes: req.body?.notes })));
app.post("/api/staff/jobs/:id/paypal-dispute/accept", staff, async (req, res) => send(res, await disputes.accept(req.params.id, { note: req.body?.note, amount: req.body?.amount != null ? toCents(req.body.amount) : null })));
// the platform's PayPal balance (Reporting API), next to what the ledger says should sit at PayPal
// sales / orders by period: PayPal's get_merchant_insights when PayPal answers, else computed from the ledger (labelled)
app.get("/api/staff/insights", staff, async (req, res) => res.json(await (await import("./insights.js")).insights({ type: req.query.type, interval: req.query.interval, start: req.query.start, end: req.query.end, via: req.query.via === "paypal-mcp" ? "paypal-mcp" : "toolkit" })));
// unclaimed payouts: list them; take one back (PayPal returns it) to re-send once a different PayPal is verified
app.get("/api/staff/payouts/unclaimed", staff, (req, res) => res.json(J.unclaimed()));
app.post("/api/staff/jobs/:id/payouts/:item/take-back", staff, async (req, res) => send(res, await J.takeBackUnclaimed(req.params.id, req.params.item, { kind: "staff" })));
app.get("/api/staff/plans", staff, (req, res) => res.json(plans.all().map(plans.view)));
app.post("/api/staff/plans/:id/months/:n/decide", staff, async (req, res) => send(res, await plans.staffDecide(req.params.id, req.params.n, { pay: req.body?.pay === true, note: req.body?.note })));
app.get("/api/staff/paypal-balance", staff, async (req, res) => {
  try {
    const b = await pp().balances("USD"), jobs = J.allJobs(), sum = (f) => jobs.reduce((t, j) => t + f(j), 0);
    const held = sum((j) => (j.hold?.status === "held" && j.hold.authorization ? Math.max(0, (j.hold.amount || 0) - (j.hold.capturedOnThis || 0)) : 0));
    res.json({ ...b, mode: pp().mode, ledger: { captured: sum((j) => j.money.captured || 0), refunded: sum((j) => j.money.refunded || 0), heldNotCaptured: held },
      says: pp().mode === "mock" ? "The stand-in's balance: captures and paid invoices in, less refunds and payouts." : "The sandbox account's balance includes every test this app ever ran, so it won't equal this server's ledger." });
  } catch (e) { res.status(502).json({ error: "paypal", message: why(e) }); }
});
// PayPal's hosted MCP server (sandbox keys only): its tool list, and one read tool call through it
app.get("/api/staff/paypal-mcp", staff, async (req, res) => { const m = await import("./paypalmcp.js"); res.json(m.status().available ? { ...m.status(), ...(await m.tools({ fresh: !!req.query.fresh })) } : m.status()); });
// a write through PayPal's MCP server: proposed (only tools that move no money), then approved or rejected by staff
app.get("/api/staff/paypal-mcp/proposals", staff, async (req, res) => res.json((await import("./paypalmcp.js")).proposals()));
app.post("/api/staff/paypal-mcp/propose", staff, async (req, res) => send(res, (await import("./paypalmcp.js")).propose(String(req.body?.tool || ""), req.body?.args || {}, { by: "staff", why: req.body?.why })));
app.post("/api/staff/paypal-mcp/proposals/:id/:verb", staff, async (req, res) => { const m = await import("./paypalmcp.js"), yes = req.params.verb === "approve"; if (!yes && req.params.verb !== "reject") return res.status(404).json({ error: "not_found" }); if (yes && !m.status().available) return res.status(409).json({ error: "unavailable", message: m.status().note }); send(res, await m.decide(req.params.id, yes)); });
app.post("/api/staff/paypal-mcp/call", staff, async (req, res) => { const m = await import("./paypalmcp.js"); if (!m.status().available) return res.status(409).json({ error: "unavailable", message: m.status().note }); res.json(await m.call(String(req.body?.tool || ""), req.body?.args || {})); });
app.get("/api/staff/invoices", staff, (req, res) => res.json(invoices.all().map(invoices.view)));
app.post("/api/staff/invoices/:id/review", staff, async (req, res) => send(res, await invoices.review(req.params.id, { approve: !!req.body?.approve, note: req.body?.note })));
app.get("/api/staff/outbox", staff, (req, res) => res.json(inbox.allOutbox()));
app.get("/api/staff/mandates", staff, (req, res) => res.json({ mandates: mandates.allMandates() }));
app.get("/api/staff/schedules", staff, (req, res) => res.json(schedules.all().map(schedules.view)));
// "ask the grid": a question in words -> { grid, filters, sort, source: model|rules } for the back office's AG Grid
app.post("/api/staff/ask", staff, async (req, res) => res.json(await grid.plan(req.body?.question)));
// the expert review queue (SLA: 4 business hours, Austin), the arbiter's page and the evidence pack, defect decisions
app.get("/api/staff/queue", staff, (req, res) => res.json({ slaHours: J.SLA_HOURS, businessHours: "Mon-Fri 9:00-17:00 America/Chicago", items: J.queue() }));
app.post("/api/staff/queue/:job/:qid", staff, async (req, res) => send(res, out(await J.expertDecide(req.params.job, req.params.qid, req.body || {}), "staff")));
app.get("/api/staff/jobs/:id/arbiter", staff, (req, res) => { const a = J.arbiter(req.params.id); if (!a) return res.status(404).json({ error: "not_found" }); res.json(a); });
app.get("/api/staff/jobs/:id/evidence-pack", staff, (req, res) => { const p = J.evidencePack(req.params.id); if (!p) return res.status(404).json({ error: "not_found" }); res.set("Content-Disposition", `attachment; filename=${p.job}-evidence-pack.json`).json(p); });
app.post("/api/staff/jobs/:id/defect", staff, async (req, res) => send(res, out(await J.resolveDefect(req.params.id, { outcome: req.body?.outcome, refund: req.body?.refund != null ? toCents(req.body.refund) : null, note: req.body?.note }, { kind: "staff" }), "staff")));
app.post("/api/staff/pros/:id/licence", staff, (req, res) => send(res, pros.staffLicence(req.params.id, req.body || {})));
app.post("/api/staff/pros/:id/review", staff, (req, res) => send(res, pros.staffReview(req.params.id, req.body || {})));
app.get("/api/staff/pros/:id/insurance-doc", staff, (req, res) => { const d = pros.insuranceDocOf(req.params.id), b = d && readFile(d); if (!b) return res.status(404).end(); res.type(d.mime).send(b); });
// catching up: the events PayPal says it sent (its webhooks-events record) against the ones this server handled; a
// missed one is fetched from PayPal and handled here (replay), or PayPal is asked to send it again (resend)
app.get("/api/staff/webhooks/paypal-events", staff, async (req, res) => {
  try {
    const seen = new Set(webhookLog.map((x) => x.id)), ev = await pp().webhookEvents({ since: new Date(Date.now() - 7 * 864e5).toISOString() });
    res.json({ events: ev.map((x) => ({ ...x, handled: seen.has(x.id) })), missed: ev.filter((x) => !seen.has(x.id)).length, says: PUBLIC_URL.startsWith("https://") ? "PayPal's record of the last 7 days, against what this server handled." : "This server has no public https address, so PayPal never delivers to it: every event here was only recorded by PayPal (or simulated)." });
  } catch (e) { res.status(502).json({ error: "paypal", message: why(e) }); }
});
app.post("/api/staff/webhooks/paypal-events/:id/replay", staff, async (req, res) => {
  try { const e = await pp().webhookEvent(String(req.params.id)); res.json({ id: e.id, type: e.event_type, did: await onEvent(e, { replayed: true }), note: "Fetched from PayPal and handled here (not a signed delivery)." }); }
  catch (e) { res.status(502).json({ error: "paypal", message: why(e) }); }
});
app.post("/api/staff/webhooks/paypal-events/:id/resend", staff, async (req, res) => { try { res.json(await pp().resendWebhookEvent(String(req.params.id))); } catch (e) { res.status(502).json({ error: "paypal", message: why(e) }); } });
app.get("/api/staff/paypal-invoices", staff, async (req, res) => {
  const st = String(req.query.status || "").split(",").map((x) => x.trim().toUpperCase()).filter((x) => /^[A-Z_]{3,30}$/.test(x));
  try { const r = await pp().searchInvoices({ status: st, recipient: req.query.recipient ? String(req.query.recipient).slice(0, 120) : null }); const ours = new Map(invoices.all().filter((v) => v.paypal?.id).map((v) => [v.paypal.id, v.number])); res.json({ ...r, items: r.items.map((x) => ({ ...x, veripay: ours.get(x.id) || null })), says: "PayPal's search over the platform's invoices (search-invoices); VeriPay's number where the invoice is one of ours." }); }
  catch (e) { res.status(502).json({ error: "paypal", message: why(e) }); }
});
app.get("/api/staff/webhooks", staff, async (req, res) => res.json({ registered: !!process.env.PAYPAL_WEBHOOK_ID, events: EVENTS, eventCheck, recent: webhookLog.slice().reverse(), ...(req.query.paypal ? { paypal: await pp().listWebhooks().catch((e) => ({ error: why(e) })), lookups: await pp().webhookLookups().catch((e) => ({ error: why(e) })) } : {}) }));
// the webhook moved to a new public address (PATCH /url), instead of a second webhook
app.post("/api/staff/webhooks/move", staff, async (req, res) => { const id = process.env.PAYPAL_WEBHOOK_ID, url = String(req.body?.url || ""); if (!id) return res.status(409).json({ error: "state", message: "No webhook registered." }); if (!/^https:\/\//.test(url)) return res.status(400).json({ error: "url", message: "An https URL." }); try { res.json(await pp().moveWebhook(id, url)); } catch (e) { res.status(502).json({ error: "paypal", message: why(e) }); } });
// PayPal's own records: one payout item, Transaction Search by id (with the payer, every record), a past day's balance
app.get("/api/staff/payout-items/:id", staff, async (req, res) => { try { res.json(await pp().getPayoutItem(String(req.params.id).slice(0, 40))); } catch (e) { res.status(502).json({ error: "paypal", message: why(e) }); } });
app.get("/api/staff/paypal-transactions", staff, async (req, res) => { try { res.json(await pp().searchTransactions({ since: req.query.since || new Date(Date.now() - 7 * 864e5).toISOString(), transactionId: req.query.id ? String(req.query.id).slice(0, 40) : null, all: req.query.all === "1", page: Math.max(1, +req.query.page || 1) })); } catch (e) { res.status(502).json({ error: "paypal", message: why(e) }); } });
app.get("/api/staff/balances", staff, async (req, res) => { const d = req.query.asOf ? Date.parse(req.query.asOf) : null; if (req.query.asOf && !(d < Date.now())) return res.status(400).json({ error: "asOf", message: "A past date." }); try { res.json(await pp().balances("USD", d)); } catch (e) { res.status(502).json({ error: "paypal", message: why(e) }); } });
// the dispute queue (REQUIRED_ACTION, or changed since), and the dispute actions beyond evidence
app.get("/api/staff/paypal-disputes/queue", staff, async (req, res) => send(res, await disputes.queue({ state: req.query.state ? String(req.query.state).toUpperCase().replace(/[^A-Z_]/g, "") : "REQUIRED_ACTION", since: req.query.since || null })));
app.post("/api/staff/jobs/:id/paypal-dispute/supporting-info", staff, async (req, res) => send(res, await disputes.supportingInfo(req.params.id, { notes: req.body?.notes })));
app.post("/api/staff/jobs/:id/paypal-dispute/contact", staff, async (req, res) => send(res, await disputes.setContact(req.params.id, { email: req.body?.email, note: req.body?.note })));
app.post("/api/staff/jobs/:id/paypal-dispute/sandbox", staff, async (req, res) => send(res, await disputes.sandboxDecide(req.params.id, { outcome: req.body?.outcome || null, ask: req.body?.ask || null })));
app.post("/api/staff/plans/:id/failure-threshold", staff, async (req, res) => send(res, await plans.setFailureThreshold(req.params.id, req.body?.threshold)));
// staff fire a PayPal event at the handler: PayPal's own sample (POST /v1/notifications/simulate-event; PayPal can't
// reach a local server, so the sample PayPal returns is handed to the same handler here, marked simulated and not
// signature-verified). With job, the sample is pointed at that job (its order reference, or its capture for a dispute).
app.post("/api/staff/webhooks/simulate", staff, async (req, res) => {
  const type = String(req.body?.event_type || "");
  if (!EVENTS.includes(type)) return res.status(400).json({ error: "event_type", message: `One of: ${EVENTS.join(", ")}.` });
  let e;
  try { e = await pp().simulateWebhook({ url: PUBLIC_URL.startsWith("https://") ? `${PUBLIC_URL}/paypal/webhook` : "https://veripay-demo.invalid/paypal/webhook", eventType: type }); }
  catch (x) { return res.status(502).json({ error: "paypal", message: why(x) }); }
  const j = req.body?.job ? J.job(req.body.job) : null, sampleIds = { custom_id: e.resource?.custom_id || null, capture: e.resource?.disputed_transactions?.[0]?.seller_transaction_id || null };
  if (j) { e.resource ||= {}; if (type.startsWith("CUSTOMER.DISPUTE")) { e.resource.disputed_transactions ||= [{}]; e.resource.disputed_transactions[0].seller_transaction_id = j.hold?.capture || null; } else e.resource.custom_id = j.id; }
  const did = await onEvent(e, { simulated: true });
  res.json({ event: { id: e.id, type: e.event_type, summary: e.summary || null }, from: pp().mode === "mock" ? "the stand-in's sample" : "PayPal's simulate-event sample", pointedAt: j?.number || null, sampleIds, did, note: "Simulated: handled here, not signature-verified." });
});
app.post("/api/staff/tick", staff, async (req, res) => res.json({ tick: await tickAll(), now: nowIso() }));

// ---- public: info, stats, receipts ------------------------------------------------------------------------------------------
app.get("/api/info", async (req, res) => res.json({ app: "VeriPay", paypal: pp().mode, testCard: !!pp().testCard, holdMode: getHoldMode(), multiparty: process.env.DONE_MULTIPARTY === "1", demoSignin: DEMO, publicUrl: PUBLIC_URL, mcpUrl: `${PUBLIC_URL}/mcp`, now: nowIso(), demoDaysSkipped: skipped(), clock: { skippedDays: +skipped().toFixed(4), lastAdvance: (() => { const l = clockStore.data.log.at(-1); return l ? { at: l.at, days: l.days ?? (l.ms != null ? +(l.ms / 864e5).toFixed(4) : null), by: l.why } : null; })(), recent: clockStore.data.log.slice(-5).reverse().map((l) => ({ at: l.at, minutes: l.ms != null ? Math.round(l.ms / 60e3) : l.days != null ? Math.round(l.days * 1440) : null, by: l.why })), note: "The demo clock is shared: the demo panel, the judges' tour and \"finish now\" (the minutes a timed visit takes) move it, every move logged here." }, feeRate: J.FEE_RATE, ai: await (async () => { const a = await aiStatus(), s = await modelStatus({ probe: false }); return { ...a, modelLive: !!s.live, modelReason: s.reason || null, model: s.model || null }; })(), city: "Austin, TX", defaultLimits: Object.fromEntries(Object.entries(DEFAULT_LIMITS).map(([k, v]) => [k, typeof v === "number" && k !== "bufferPct" ? usd(v) : v])) }));
// the live demo page: what the simulated people are doing right now (public; demo servers only)
app.get("/api/live", (req, res) => { if (!DEMO) return res.status(404).end(); res.json(sim.live({ after: +req.query.after || 0 })); });
app.get("/api/stats", (req, res) => {
  const all = J.allJobs(), paid = all.filter((j) => ["released", "resolved"].includes(j.status) && j.money.split?.release > 0);
  const secs = paid.filter((j) => j.submissions.length).map((j) => Math.round((Date.parse(j.paidAt) - Date.parse(j.submissions.at(-1).at)) / 1000)).sort((a, b) => a - b);
  const last = paid.filter((j) => j.timeline.at(-1)?.by?.kind === "platform").sort((a, b) => String(a.paidAt).localeCompare(String(b.paidAt))).at(-1);
  res.json({ jobs: all.length, paid: paid.length, paidToPros: J.money(paid.reduce((t, j) => t + j.money.split.pro + j.money.split.helper, 0)), medianSecondsSubmitToPaid: secs.length ? secs[Math.floor(secs.length / 2)] : null, pros: pros.allPros().length,
    last: last ? { number: last.number, title: last.scope.title, pro: last.agreed.proName, checks: last.checks.at(-1).checks.map((c) => ({ id: c.id, what: c.what, verdict: c.verdict })), checker: last.checks.at(-1).checker, release: J.money(last.money.split.release), payout: last.money.payout?.batchId || null, capture: last.hold.capture, at: last.paidAt } : null });
});
// what the models are, truthfully: configured or not, live by a probe (?probe=0 skips it), the last replies' source and ms
// the model server's address stays private (the site may be public): every URL in the status reads "the model server"
const hideUrls = (o) => JSON.parse(JSON.stringify(o).replace(/https?:\/\/[^"\s)]+/g, "the model server"));
app.get("/api/models/status", async (req, res) => res.json(hideUrls({ ...(await modelStatus({ probe: req.query.probe !== "0", timeoutMs: 1500 })), risk: await (await import("./risk.js")).riskStatus(), lastCheck: J.lastCheck(), rule: "lastCheck is what the last evidence check in this server actually used; a model or VLM is named only when its verdict came back." })));
// one full example job for the home page: the latest paid demo job, as anyone may see it (no names, emails, street or
// person ids; ZIP only), with its synthetic demo photos served below
// which paid demo job the home page shows: the one whose checks the models decided with the fewest conditions left to a
// person (then the most model-judged, then the newest); never one where every photo or note condition passed on code
// alone ("content not judged"). exampleWhy says why it was picked.
const CODE_BY = /^(rules|given text|none|code|typed|rules \(documents\)|person)$/;
function exampleScore(j) {
  const rows = (j.milestones || []).map((m) => j.checks.filter((r) => r.milestone === m.id && r.kind !== "defect").at(-1)).filter(Boolean).flatMap((r) => r.checks.map((c) => ({ c, r })));
  if (!rows.length) return null;
  const kindOf = (id) => j.scope.checks.find((x) => x.id === id)?.evidence;
  const person_ = (c) => !!c.needsPerson || (c.signals || []).some((s) => /^needs_person|model_unavailable|customer_confirmed/.test(s)) || c.by === "person";
  const model = (c) => !person_(c) && !!c.by && !CODE_BY.test(String(c.by));
  const notJudged = (c) => c.verdict === "pass" && !person_(c) && !model(c) && ["photo", "note"].includes(kindOf(c.id)) && !(c.signals || []).some((s) => /^no_parts|code_only/.test(s));
  const content = rows.filter(({ c }) => ["photo", "note"].includes(kindOf(c.id)));
  const confirmedByPerson = rows.filter(({ c }) => person_(c)).length + ((j.milestones || []).some((m) => m.release?.confirmed || m.release?.by?.kind === "person") ? 1 : 0);
  return { total: rows.length, modelJudged: rows.filter(({ c }) => model(c)).length, personConfirmed: confirmedByPerson, notJudged: rows.filter(({ c }) => notJudged(c)).length, allNotJudged: content.length > 0 && content.every(({ c }) => notJudged(c)), checker: rows.at(-1).r.checker };
}
let exampleWhy = null;
const exampleJob = () => {
  const cands = J.allJobs().filter((j) => j.status === "released" && person(j.customer)?.demo && j.checks.length).map((j) => ({ j, s: exampleScore(j) })).filter((x) => x.s && !x.s.allNotJudged);
  cands.sort((a, b) => (b.s.modelJudged > 0) - (a.s.modelJudged > 0) || a.s.personConfirmed - b.s.personConfirmed || b.s.modelJudged - a.s.modelJudged || String(b.j.paidAt).localeCompare(String(a.j.paidAt)));
  const best = cands[0];
  exampleWhy = best ? { ...best.s, says: best.s.modelJudged ? `Picked because the models decided ${best.s.modelJudged} of its ${best.s.total} conditions, with ${best.s.personConfirmed} left to a person (the fewest among paid demo jobs).` : `No paid demo job was judged by the models yet; this one has ${best.s.personConfirmed} condition(s) a person confirmed and none passed on code alone without a look.` } : null;
  return best?.j || null;
};
function publicView(j) {
  const v = J.view(j), strip = (b) => (b ? { kind: b.kind, ...(b.client ? { client: b.client } : {}), ...(b.pro ? { pro: b.pro } : {}) } : b);
  return { ...v, text: v.text, address: { city: "Austin", state: "TX", zip: j.address.zip }, agreed: v.agreed && { ...v.agreed, by: strip(v.agreed.by), payee: { verified: v.agreed.payee?.verified } },
    timeline: v.timeline.map((t) => ({ ...t, by: strip(t.by) })), thread: v.thread.map((m) => ({ ...m, from: m.from.kind === "customer" ? { kind: "customer", name: "Customer" } : m.from })),
    evidence: v.evidence.map((e) => ({ ...e, url: e.url ? `/api/example-job/evidence/${e.id}` : null, exif: e.exif ? { taken: e.exif.taken } : null })),
    changeOrders: v.changeOrders.map((c) => ({ ...c, by: strip(c.by), decided: c.decided && { ...c.decided, by: strip(c.decided.by) } })), money: { ...v.money, payout: v.money.payout && { ...v.money.payout, items: v.money.payout.items?.map(({ id, amount, to, status, says }) => ({ id, amount, to, status, says })) } },
    paypalDispute: null, example: true };
}
// whatever fields are added later, no person ids anywhere in the public example
const scrubPeople = (v) => (Array.isArray(v) ? v.map(scrubPeople) : v && typeof v === "object" ? Object.fromEntries(Object.entries(v).filter(([k, x]) => !(["person", "customer", "inspector"].includes(k) && typeof x === "string")).map(([k, x]) => [k, scrubPeople(x)])) : typeof v === "string" && /^p_[0-9a-f]{10}$/.test(v) ? "(a person)" : v);
app.get("/api/example-job", (req, res) => { const j = exampleJob(); if (!j) return res.status(404).json({ error: "not_found", message: "No paid demo job whose checks were judged (by the models, or confirmed by a person) yet: every paid job's photos passed on code alone. Run the tour with the models serving (POST /api/demo/tour {step: \"all\"})." }); res.json({ ...scrubPeople(publicView(j)), exampleWhy }); });
app.get("/api/example-job/evidence/:eid", (req, res) => { const j = exampleJob(), e = j?.evidence.find((x) => x.id === req.params.eid), b = e && readFile(e); if (!b) return res.status(404).end(); res.type(e.mime).set("Cache-Control", "public, max-age=600").send(b); });
app.get("/.well-known/done-receipts.json", (req, res) => res.json({ keys: [receipts.publicKey()], log: receipts.logInfo() }));
app.get("/api/receipts/:id", (req, res) => { const r = receipts.show(req.params.id, me(req)?.id); if (!r) return res.status(404).json({ error: "receipt" }); res.json(r); });
app.post("/api/receipts/verify", (req, res) => res.json(receipts.verify(req.body || {})));
app.get("/api/receipts/log/checkpoint", (req, res) => res.type("text/plain").send(receipts.logInfo().checkpoint || ""));
// Pay Later messages (PayPal's messages component, sandbox): the app's client id is public; display only
app.get("/api/paypal/messages", (req, res) => res.json({ clientId: process.env.PAYPAL_CLIENT_ID || null, environment: "sandbox", buyerCountry: "US" }));
// a returning payer (their PayPal is in the vault, with PayPal's customer id): the token is minted for them
app.get("/api/paypal/sdk", signedIn, async (req, res) => { const p = req.person, cust = String(p.vault || "").startsWith("paypal:") && p.vaultCustomer ? p.vaultCustomer : null; try { res.json({ mode: pp().mode, clientId: real ? process.env.PAYPAL_CLIENT_ID : null, ...(await pp().clientToken({ customerId: cust })), partnerAttributionId: process.env.PAYPAL_BN_CODE || null, fraudnetSource: process.env.PAYPAL_FRAUDNET_SOURCE || null, locale: p.lang === "es" ? "es-US" : "en-US", testCard: !!pp().testCard }); } catch (e) { res.status(502).json({ error: "paypal", message: e.message }); } });

// ---- PayPal return URL, and the stand-in's approval page ---------------------------------------------------------------------
// The PayPal button with the JS SDK v6 (sandbox): the hold for an agreed job, approved by the buyer in PayPal's own
// window. createOrder is our server's (an AUTHORIZE order for the price plus the buffer); onApprove confirms it here.
// A plain page so it works without the website build; docs/SANDBOX-BUTTON.md walks a person through it.
app.get("/paypal/button", signedIn, (req, res) => {
  const j = J.job(String(req.query.job || ""));
  if (!j || j.customer !== req.person.id) return res.status(404).type("text").send("No such job of yours. Open /paypal/button?job=<your agreed job's id>.");
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  res.type("html").send(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Hold with PayPal</title>
<style>body{font:16px system-ui;max-width:520px;margin:40px auto;padding:0 16px;color:#14181f}p.m{color:#5b6472;font-size:14px}#log{font:12px ui-monospace,monospace;white-space:pre-wrap;background:#f5f7fa;padding:10px;border-radius:8px;min-height:3em}paypal-button{display:block;margin:20px 0}</style></head><body>
<h1>Hold ${esc(j.number)} with PayPal</h1><p>${esc(j.scope?.title)}${j.agreed ? ` · ${esc(j.agreed.proName)} · ${esc(J.money(j.agreed.price).usd)} plus a buffer, held (authorized), not charged` : ""}.</p>
<p class="m">PayPal's JS SDK v6, ${pp().mode === "sandbox" ? "sandbox" : "the stand-in (no keys: the button can't open PayPal)"}. Status: <b id="st">${esc(j.status)} / hold ${esc(j.hold?.status || "none")}</b></p>
<paypal-button id="pp" type="pay" hidden></paypal-button><paypal-pay-later-button id="pl" hidden></paypal-pay-later-button><p class="m" id="plnote">${(j.hold?.amount ?? j.agreed?.price ?? 0) >= J.PAY_LATER_MIN ? `Pay Later is offered on holds of ${esc(J.money(J.PAY_LATER_MIN).usd)} or more, when PayPal finds you eligible (PayPal sets the terms).` : `Pay Later is offered on holds of ${esc(J.money(J.PAY_LATER_MIN).usd)} or more.`}</p><p class="m"><a id="alt" hidden target="_blank" rel="noopener">No PayPal window opened (a blocked pop-up)? Open PayPal's approval page</a></p><div id="log">Loading the PayPal SDK…</div>
<script>
const log = (s) => { document.getElementById("log").textContent += "\\n" + s; };
const job = ${JSON.stringify(j.id)};
async function createOrder() { const r = await fetch("/api/jobs/" + job + "/hold/order", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }); const v = await r.json(); if (!r.ok) throw new Error(v.message || r.status); log("order " + v.orderId + " created (AUTHORIZE " + (v.hold && v.hold.amount ? v.hold.amount.usd : "") + ")"); if (v.approveUrl) { const l = document.getElementById("alt"); l.href = v.approveUrl; l.hidden = false; } return { orderId: v.orderId }; }
async function start() {
  const t = await (await fetch("/api/paypal/sdk")).json();
  if (!t.token) { log("No client token: " + (t.message || "the server has no sandbox keys")); return; }
  const s = document.createElement("script"); s.src = t.sdk; s.async = true;
  s.onload = async () => {
    try {
      const sdk = await window.paypal.createInstance({ clientToken: t.token, components: ["paypal-payments"], pageType: "checkout" });
      const elig = await sdk.findEligibleMethods({ currencyCode: "USD" });
      if (!elig.isEligible("paypal")) { log("PayPal isn't eligible here."); return; }
      const session = sdk.createPayPalOneTimePaymentSession({
        onApprove: async (data) => { log("approved by the buyer: " + data.orderId); const r = await fetch("/api/jobs/" + job + "/hold/confirm", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ orderId: data.orderId }) }); const v = await r.json(); document.getElementById("st").textContent = v.status + " / hold " + (v.hold ? v.hold.status : "?"); log(r.ok ? "held: " + (v.hold ? v.hold.authorization : "") : "confirm failed: " + v.message); },
        onCancel: () => log("cancelled in PayPal"), onError: (e) => log("error: " + (e && e.message || e)) });
      const b = document.getElementById("pp"); b.hidden = false; log("ready: press the PayPal button");
      // Pay Later on holds of $300 or more, when PayPal says the buyer is eligible
      if (${(j.hold?.amount ?? j.agreed?.price ?? 0) >= J.PAY_LATER_MIN} && elig.isEligible("paylater") && sdk.createPayLaterOneTimePaymentSession) { const d = elig.getDetails("paylater"), pl = document.getElementById("pl"), ps = sdk.createPayLaterOneTimePaymentSession({ onApprove: async (data) => { log("approved with Pay Later: " + data.orderId); const r = await fetch("/api/jobs/" + job + "/hold/confirm", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ orderId: data.orderId }) }); const v = await r.json(); document.getElementById("st").textContent = v.status + " / hold " + (v.hold ? v.hold.status : "?"); log(r.ok ? "held: " + (v.hold ? v.hold.authorization : "") : "confirm failed: " + v.message); }, onCancel: () => log("cancelled in PayPal"), onError: (e) => log("error: " + (e && e.message || e)) }); pl.setAttribute("productCode", d.productCode); pl.setAttribute("countryCode", d.countryCode); pl.hidden = false; pl.addEventListener("click", async () => { try { await ps.start({ presentationMode: "auto" }, createOrder()); } catch (e) { log("start: " + (e && e.message || e)); } }); log("Pay Later offered (" + d.productCode + ")"); }
      b.addEventListener("click", async () => { try { await session.start({ presentationMode: "auto" }, createOrder()); } catch (e) { log("start: " + (e && e.message || e)); } });
    } catch (e) { log("SDK: " + (e && e.message || e)); }
  };
  s.onerror = () => log("The SDK script didn't load."); document.head.appendChild(s);
}
start();
</script></body></html>`);
});
app.get("/paypal/tip-return", async (req, res) => {
  const id = String(req.query.job || "");
  try { await J.confirmTip(id, String(req.query.tip || ""), { kind: "paypal" }); } catch (e) { console.error("tip return", e.message); }
  res.redirect(`/jobs/${encodeURIComponent(id)}`);
});
app.get("/paypal/return", async (req, res) => {
  const id = String(req.query.job || "");
  try { await J.confirmHold(id, { kind: "paypal" }); } catch (e) { console.error("return", e.message); }
  res.redirect(`/jobs/${encodeURIComponent(id)}`);
});
if (pp().mode === "mock") {
  const page = (body) => `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>PayPal (simulated)</title><style>body{font:16px system-ui;background:#f5f7fa;margin:0;display:grid;place-items:center;min-height:100vh}.c{background:#fff;padding:32px;border-radius:16px;box-shadow:0 8px 30px #0001;max-width:380px;width:calc(100% - 32px)}h1{font-size:20px;margin:0 0 4px}.n{color:#a15c00;background:#fff4e0;padding:8px 12px;border-radius:8px;font-size:13px;margin:12px 0 20px}button{font:inherit;width:100%;padding:12px;border-radius:999px;border:0;margin-top:8px;cursor:pointer}.y{background:#0070e0;color:#fff;font-weight:600}.x{background:#eee}</style><div class="c">${body}</div>`;
  const q = (req) => ({ token: req.query.token, setup: req.query.setup, invoice: req.query.invoice, subscription: req.query.subscription });
  // a payment link (the stand-in's pay page for it)
  app.get("/mock-paypal/approve", (req, res, next) => { if (!req.query.link) return next(); const l = paylinks.all().find((x) => x.paypal.id === req.query.link); if (!l || l.status !== "open") return res.status(404).send(page("<h1>This link isn't open</h1>")); res.send(page(`<h1>PayPal</h1><p>Pay <b>${usd(l.amount)}</b>: ${String(l.name).replace(/[&<>"]/g, "")}</p><p class="n">Simulated PayPal: this server runs without sandbox keys. No money moves.</p><form method="post"><button class="y" name="a" value="yes">Pay now</button></form>`)); });
  app.post("/mock-paypal/approve", express.urlencoded({ extended: false }), async (req, res, next) => { if (!req.query.link) return next(); const l = paylinks.all().find((x) => x.paypal.id === req.query.link); if (l && req.body?.a === "yes" && pp().payLink(l.paypal.id)) await paylinks.sync(l); res.send(page(`<h1>Paid</h1><p>${l ? usd(l.amount) : ""} paid with (simulated) PayPal. You can close this page.</p>`)); });
  app.get("/mock-paypal/approve", (req, res) => {
    const d = pp().describe(q(req));
    if (!d) return res.status(404).send(page("<h1>Unknown payment</h1>"));
    const what = d.kind === "order" && d.threeDS ? `3-D Secure check for a card hold of <b>${usd(d.amount)}</b>: the card's bank asks the payer to confirm (simulated)` : d.kind === "order" ? `${d.intent === "AUTHORIZE" ? "Authorize (hold, not charge)" : "Pay"} <b>${usd(d.amount)}</b> to VeriPay, and save PayPal for later holds` : d.kind === "invoice" ? `Pay invoice: <b>${usd(d.amount)}</b>` : d.kind === "subscription" ? `Subscribe: <b>${usd(d.amount)}</b> a month to VeriPay for ${String(d.name || "a maintenance plan").replace(/[&<>"]/g, "")}. VeriPay pays the pro each month only when that visit is proven` : "Save PayPal for VeriPay";
    // which job, which pro, whose account: a hold is only ever asked for after an offer is accepted
    const jj = d.reference ? J.job(d.reference) : null, esc = (s) => String(s || "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
    const forWhat = jj ? `<p>For <b>${esc(jj.number)}</b> ${esc(jj.scope?.title)}${jj.agreed ? `: ${esc(jj.agreed.proName)} hired at ${usd(jj.agreed.price)}` : ""}. The account that hired: ${esc((person(jj.customer)?.name || "").replace(/^Demo · /, "").split(" ")[0] || "the customer")}. If that isn't you, someone else on this browser started it: cancel.</p>` : "";
    res.send(page(`<h1>PayPal</h1><p>${what}</p>${forWhat}<p class="n">Simulated PayPal: this server runs without sandbox keys. No money moves.</p><form method="post"><button class="y" name="a" value="yes">Agree and continue</button><button class="x" name="a" value="no">Cancel</button></form>`));
  });
  app.post("/mock-paypal/approve", express.urlencoded({ extended: false }), async (req, res) => {
    const x = q(req), yes = req.body?.a === "yes", d = pp().describe(x);
    if (yes) pp().approve(x);
    // the hold is confirmed here too (as PayPal's webhook would), so it doesn't depend on the browser following the redirect
    { const ref0 = d?.reference && J.job(d.reference) ? d.reference : null; if (yes && ref0 && !x.invoice) { try { await J.confirmHold(ref0, { kind: "paypal" }); } catch (e) { console.error("approve confirm", e.message); } } }
    if (x.invoice) { if (yes) await invoices.tick(); return res.redirect("/pro/invoices"); }
    if (x.setup) return res.redirect(yes ? `/paypal/vault-return?approval_token_id=${encodeURIComponent(x.setup)}` : "/connect#saved-payment");
    if (x.subscription) { const pl = plans.plan(d?.reference); if (pl) await plans.sync(pl); return res.redirect(pl ? `/jobs/${pl.job}?plan=${yes ? pl.status : "cancelled"}` : "/"); }
    // a tip's own order (reference <job>-tip-<n>): captured here when approved
    { const m = String(d?.reference || "").match(/^(job_[0-9a-f]+)-tip-(\d+)$/), tj = m && J.job(m[1]); if (tj) { const t = (tj.tips || []).find((y) => y.n === +m[2]); if (yes && t) await J.confirmTip(tj.id, t.id, { kind: "paypal" }).catch(() => {}); return res.redirect(`/jobs/${tj.id}${yes ? "" : "?tip=cancelled"}`); } }
    const ref = d?.reference && J.job(d.reference) ? d.reference : null;
    res.redirect(ref ? (yes ? `/paypal/return?job=${ref}` : `/jobs/${ref}?hold=cancelled`) : "/");
  });
}

// ---- demo controls and the judges' tour ---------------------------------------------------------------------------------------
const demoOnly = (req, res, next) => (DEMO ? next() : res.status(404).end());
// the stand-in bills a plan's next month now (in the sandbox PayPal bills on its own schedule)
app.post("/api/demo/plans/:id/bill", demoOnly, async (req, res) => { const p = plans.plan(req.params.id); if (!p || pp().mode !== "mock") return res.status(404).json({ error: "not_found" }); pp().billNow(p.paypal.subscription); await plans.sync(p); res.json(plans.view(p)); });
app.post("/api/demo/advance", demoOnly, async (req, res) => {
  if (req.headers.authorization) return res.status(403).json({ error: "forbidden", message: "The demo clock is shared by everyone: only a person on the website or demo staff moves it, not an agent's token." });
  const p = me(req);
  if (!p && !isStaff(req)) return res.status(401).json({ error: "signin", message: "Sign in on the website (or as demo staff) to move the demo clock." });
  const b = req.body || {}, by = isStaff(req) ? "demo staff" : `${p.name} (${p.role})`;
  const r = b.hours != null ? advanceMs(+b.hours * 3600e3, `demo panel: ${by}`) : advance(b.days ?? 1, `demo panel: ${by}`);
  r.tick = await tickAll(); res.json(r);
});
// 7) "Have the demo pro finish now" on a visitor's own job (demo only; a demo pro's job only)
// (the tenant who asked for the job may press it too: it only speeds up the demo pro, it never moves money)
app.post("/api/jobs/:id/demo-finish", demoOnly, signedIn, (req, res, next) => { const j = J.job(req.params.id); if (j && j.tenant === req.person.id) { req.job = j; return next(); } return mine(req, res, next); }, async (req, res) => {
  const p = pros.pro(req.job.agreed?.pro);
  if (p?.agent !== "demo") return res.status(409).json({ error: "state", message: "Only a demo pro's job can be finished by the demo." });
  const steps = await demopro.finishNow(req.job.id, `"finish now" by ${req.person?.name || "the customer"}`, { tour: !!req.job.tour });
  const w = steps.find((x) => x.waiting);
  res.json({ ...J.view(J.job(req.job.id)), demo: { steps, waiting: w ? { until: w.windowFrom || null, why: w.waiting } : null, note: w ? `The pro is waiting: ${w.waiting}.` : "The pro sent what was left and submitted." } });
});
// 8) a read-only, anonymized back office for the tour (no names, no emails, no personal data; nothing can be changed)
app.get("/api/demo/office", demoOnly, (req, res) => {
  const all = J.allJobs(), sum = (f) => all.reduce((t, j) => t + f(j), 0);
  res.json({ demo: true, readOnly: true, note: "The demo's back office, read-only and anonymized: no customer names, emails or street addresses (zip only); pros by business name. Nothing can be changed here.", now: nowIso(),
    jobs: all.length, byStatus: Object.fromEntries(Object.keys(J.NEXT).map((st) => [st, all.filter((j) => j.status === st).length])),
    held: J.money(sum((j) => (["held", "partially_captured"].includes(j.hold?.status) ? j.hold.amount - (j.hold.capturedOnThis || 0) : 0))), captured: J.money(sum((j) => J.balance(j).captured)), fees: J.money(sum((j) => J.balance(j).fee)), paidToPros: J.money(sum((j) => J.balance(j).pro + J.balance(j).helper)), refunded: J.money(sum((j) => J.balance(j).refunded)),
    rows: all.sort((x, y) => y.created.localeCompare(x.created)).slice(0, 50).map((j) => ({ number: j.number, status: j.status, title: j.scope?.title, trade: j.scope?.trade, zip: j.address.zip, pro: j.agreed?.proName || null, due: J.due(j), captured: J.balance(j).captured, balanced: J.balance(j).ok, checker: j.checks.at(-1)?.checker || null, releasedBy: releasedBy(j), created: j.created })),
    queue: J.queue().map((q) => ({ number: q.number, title: q.title, slaDue: q.slaDue, overdue: q.overdue })) });
});
app.post("/api/demo/fail-next-hold", demoOnly, signedIn, (req, res) => { if (pp().mode !== "mock") return res.status(409).json({ error: "mock_only", message: "Only with the PayPal stand-in." }); res.json({ ok: pp().failNextCharge(req.person.vault) }); });
app.get("/api/credits", async (req, res) => { const { realCredits } = await import("./demoassets.js"); res.json({ about: "Real photos used by the demo pros: openly licensed, from Wikimedia Commons. Each is re-dated to the demo job it is used on (time and place); the camera make and model are the original ones.", photos: realCredits() }); });
app.get("/api/demo/assets", demoOnly, (req, res) => res.json(DEMO_ASSETS.map((a) => ({ ...a, url: `/api/demo/assets/${a.file}` }))));
app.get("/api/demo/assets/:file", demoOnly, (req, res) => { const a = DEMO_ASSETS.find((x) => x.file === req.params.file); if (!a) return res.status(404).end(); res.type("jpeg").sendFile(path.join(ASSET_DIR, a.file)); });
// The tour's work order: the AI's (done-chat), then edited by the tour's customer so that every condition is one the
// models and code can check from a photo, a note or the receipt. A still photo can't show "the new cartridge inside"
// or "no drip after 30 seconds" (those rightly go to a person), and the demo library has no before/after pair of the
// same faucet (so a pro BEFORE photo would be "not the same spot" and go to a person too). The customer's own photo of
// the dripping faucet shows the problem instead. The AI's other conditions (a note, the receipt) are kept as written.
// Real jobs are untouched; the checker isn't changed. scope.tourEdit says what was edited and why.
function tourWorkOrder(j, actor) {
  if (!j?.scope) return;
  const photo = j.scope.checks.find((c) => c.evidence === "photo" && !/before/i.test(`${c.id} ${c.what}`)) || j.scope.checks.find((c) => c.evidence === "photo");
  const rule = String(photo?.rule || "min_photos=1;taken_during_job;at_job_address;not_reused").split(";").filter((t) => t && !/^after:/.test(t.trim())).join(";");
  const kept = j.scope.checks.filter((c) => c.evidence !== "photo" && !c.doc);
  const dropped = j.scope.checks.filter((c) => c.evidence === "photo").map((c) => ({ id: c.id, what: c.what }));
  const checks = [{ id: "running", what: "Photo of the faucet with the water running after the repair", evidence: "photo", rule }, { id: "off_dry", what: "Photo of the faucet turned off after the repair, with no water dripping", evidence: "photo", rule }, ...kept];
  const source = j.scope.source;
  const e = J.editScope(j.id, { checks }, actor);
  if (e?.error) return;
  J.job(j.id).scope.tourEdit = { from: source, kept: kept.map((c) => c.id), replaced: dropped, why: "The tour's customer kept the AI work order's other conditions and asked for photos the models can check (the faucet running, the faucet off and not dripping); the problem is shown by the customer's own photo." };
  J.jobsStore.save();
}
async function tourReference(j, actor) {
  const buf = await freshPhoto(j, "valve-worn.jpg", { minutesAgo: 30 });
  J.addReference(j.id, [{ dataUrl: `data:image/jpeg;base64,${buf.toString("base64")}`, label: "the dripping faucet (the customer's photo)", name: buf.realName || "faucet-before.jpg" }], actor);
}
const TOUR_TEXT = "Kitchen faucet keeps dripping even when it's off. Replace the worn cartridge this week, $200 max. Send a photo of the faucet working after the repair, and the parts receipt.";
// ---- the tour's mandates (PLAN §15 item 2 shown): one accepted, one replay refused, one over its limit refused ----------------
const MANDATE_LABEL = "signed by a key the server holds for you";
function tourAgent(j, p) {
  updatePerson(p.id, { limits: { requireMandate: true } });
  if (!j.tourAgent) { const t = makeToken(p.id, "Tour agent (demo, mandate-only)", { requireMandate: true }); j.tourAgent = t.id; J.jobsStore.save(); }
  return { person: p.id, client: "Tour agent (demo, mandate-only)", token: j.tourAgent, scopes: ["read", "hire", "pay"], requireMandate: true };
}
const tourNote = (j, x) => { (j.tourMandates ||= []).push({ at: nowIso(), label: MANDATE_LABEL, ...x }); J.jobsStore.save(); assistant.note(j.customer, x.outcome === "accepted" ? `I approved it with your signed mandate (up to $${x.maxAmount}).` : x.reason === "replay" ? "I tried that mandate again: refused, it's single-use." : "I tried a $20 mandate on it: refused, over its limit.", { job: j, card: { kind: "mandate", data: { job: j.id, outcome: x.outcome, reason: x.reason || null, maxAmount: x.maxAmount ? Math.round(x.maxAmount * 100) : null, receipt: x.receipt || null, label: MANDATE_LABEL } }, key: `tour-mandate:${j.id}:${(j.tourMandates || []).length}` }); };
async function tourApprove(j, p, c) {
  const ag = tourAgent(j, p), iss = mandates.issueForPerson(p.id, { agentClient: ag.token, maxAmount: Math.ceil(c.amount / 100), scope: ["approve_change"], jobId: j.id, minutes: 30 });
  if (iss.error) return iss;
  const r = await tools.CUSTOMER.approve_change(ag, { job: j.id, change: c.id, mandate: iss.mandate });
  if (r?.error) return r;
  j = J.job(j.id); j.tourMandate = iss.mandate;
  tourNote(j, { step: "approve_change", outcome: "accepted", says: `The agent approved the +${J.money(c.amount).usd} change order with a mandate for up to $${iss.mandate.payload.maxAmount} (scope approve_change, this job, 30 minutes).`, mandate: r.mandate?.id || null, receipt: r.mandate?.receipt || null, maxAmount: iss.mandate.payload.maxAmount });
  return J.job(j.id);
}
async function tourOverspend(j, p) {
  if ((j.tourMandates || []).some((x) => x.step === "overspend")) return j;
  const c = j.changeOrders.find((x) => x.status === "approved") || j.changeOrders[0];
  if (!c || !j.tourMandate) return { error: "state", message: "Approve the change order first (step: approve_change)." };
  const ag = tourAgent(j, p);
  const replay = await tools.CUSTOMER.approve_change(ag, { job: j.id, change: c.id, mandate: j.tourMandate });
  tourNote(J.job(j.id), { step: "overspend", outcome: replay?.error === "mandate" ? "refused" : "unexpected", reason: replay?.reason || null, says: `The agent sent the same mandate again: ${replay?.message || "it went through (unexpected)"}` });
  const small = mandates.issueForPerson(p.id, { agentClient: ag.token, maxAmount: 20, scope: ["approve_change"], jobId: j.id, minutes: 30 });
  const over = await tools.CUSTOMER.approve_change(ag, { job: j.id, change: c.id, mandate: small.mandate });
  tourNote(J.job(j.id), { step: "overspend", outcome: over?.error === "mandate" ? "refused" : "unexpected", reason: over?.reason || null, says: `The agent tried a $20 mandate on the ${J.money(c.amount).usd} change order: ${over?.message || "it went through (unexpected)"}` });
  return J.job(j.id);
}
// what the tour's checks actually used, and whether the money moved by itself
function tourAi(j) {
  const r = j.checks.at(-1);
  if (!r) return null;
  const rel = [...(j.milestones || [])].reverse().find((m) => m.release)?.release;
  return { checker: r.checker, decidedFrom: r.decidedFrom || null, decision: r.decision, decidedBy: r.decidedBy, conditions: r.checks.map((c) => ({ id: c.id, verdict: c.verdict, by: c.by || null, confidence: c.confidence ?? null, needsPerson: !!c.needsPerson || (c.signals || []).some((x) => /^needs_person/.test(x)), library: (c.signals || []).includes(J.TOUR_LIBRARY_SIGNAL) })),
    autoReleased: j.status === "released" && (rel?.by?.kind || j.timeline.at(-1)?.by?.kind) === "platform", modelBudgetMs: +(process.env.DONE_TOUR_MODEL_MS || 30000),
    says: j.status === "released" && j.timeline.at(-1)?.by?.kind === "platform" ? `Every condition passed (${r.checker}); code released the money by itself (instant release).` : r.decision === "review" ? `The checks left ${r.checks.filter((c) => c.verdict !== "pass" || c.needsPerson).length} condition(s) to a person (${r.checker}); the customer releases.` : `Decision: ${r.decision} (${r.checker}).` };
}
// The judges' tour, one step at a time on one job (the customer is the signed-in demo customer; the pro side is played
// by the hired demo pro's agent). steps: start, hire, start_work, change, approve_change, evidence, all
app.post("/api/demo/tour", demoOnly, async (req, res) => {
  const b = req.body || {}, step = b.step || "start";
  let p = me(req), setCookie = null;
  let newPin = null;
  if (!p || p.role !== "customer") { p = makePerson({ name: "Jordan Avery", zip: "78704" }); newPin = String(crypto.randomInt(0, 1e6)).padStart(6, "0"); setPin(p.id, newPin); setCookie = cookie(createSession(p.id, { stepUp: true })); }
  if (b.job && J.job(b.job) && J.job(b.job).customer !== p.id) return res.status(404).json({ error: "not_found", message: "No such tour job for you." });
  if (setCookie) res.set("Set-Cookie", setCookie);
  const cust = { kind: "person", person: p.id }, steps = step === "all" ? ["start", "hire", "start_work", "change", "approve_change", "overspend", "evidence", "release"] : [step];
  let j = b.job ? J.job(b.job) : null, r = null;
  try {
    for (const s of steps) {
      if (s === "start") { // the tour's request names what the photos can show (the faucet working after the repair) and the receipt, so the AI
      // work order it writes is checkable by the models and code; "no drips after 30 seconds" can't be seen in a photo and
      // would rightly go to a person
      r = await J.createJob(p.id, { text: b.text || TOUR_TEXT, zip: "78704", address: { line: "1400 S Congress Ave" }, budget: 20000, actor: cust, options: { releaseMode: "instant" }, tour: true }); if (r.error) break; j = r; j.tour = true; tourWorkOrder(J.job(j.id), cust); await tourReference(J.job(j.id), cust); r = await J.requestOffers(j.id, cust, { now: true }); continue; }
      if (!j || j.customer !== p.id) { r = { error: "job", message: "Start the tour first (step: start), and pass job." }; break; }
      const pa = () => ({ kind: "pro_agent", pro: j.agreed.pro, client: `${j.agreed.proName}'s agent` });
      // the tour doesn't wait for the job's window (at night in Austin it opens at 7 am): it moves the demo clock there, logged
      { const from = Date.parse(J.job(j.id).scope?.window?.from || ""); if (["start_work", "change", "evidence"].includes(s) && Number.isFinite(from) && Date.parse(nowIso()) < from) advanceMs(from - Date.parse(nowIso()) + 5 * 60e3, `judge tour: to the job's window (it opens ${new Date(from).toISOString()})`); }
      // each step is idempotent: pressed twice, or after the job already moved on, it answers with the job as it is
      const at = J.job(j.id).status, past = { hire: ["agreed", "held", "working", "submitted", "checking", "review", "needs_fix", "passed", "released"], start_work: ["working", "submitted", "checking", "review", "needs_fix", "passed", "released"], evidence: ["submitted", "checking", "review", "passed", "released"], change: [] }[s] || [];
      if (past.includes(at) || (s === "change" && J.job(j.id).changeOrders.length) || (s === "approve_change" && !J.job(j.id).changeOrders.some((x) => x.status === "pending") && J.job(j.id).changeOrders.length)) { r = J.job(j.id); continue; }
      if (s === "hire") r = await tools.autoHire(j.id, p.id, { payWith: p.vault ? "saved" : "card" });
      // (the tour's work order has no BEFORE condition: the problem is in the customer's own photo, so the pro starts
      // without before photos; a real job keeps them)
      else if (s === "start_work") r = J.startWork(j.agreed.pro, j.id, pa(), { before: J.job(j.id).scope.checks.some((c) => c.evidence === "photo" && /before/i.test(`${c.id} ${c.what}`)) ? await demoBefore(j, j.scope.checks) : [] });
      else if (s === "change") r = await J.requestChange(j.agreed.pro, j.id, { amount: 4705, reason: "the shut-off valve under the sink is corroded and weeps; replacing it, with the new cartridge (parts at cost: $47.05 on the receipt)", evidence: [{ kind: "photo", buf: await freshPhoto(j, "valve-worn.jpg"), mime: "image/jpeg", name: "valve-worn.jpg" }] }, pa());
      // the tour customer requires signed mandates: the agent approves the change order with one (issued on the website
      // after the PIN step-up, signed by a key the server holds for this person: the demo path, labelled)
      else if (s === "approve_change") { const c = j.changeOrders.find((x) => x.status === "pending"); r = c ? await tourApprove(J.job(j.id), p, c) : { error: "change", message: "No change order waiting." }; }
      // the agent tries to overspend: the used mandate again (refused: its nonce is used) and a $20 mandate for the
      // $47.05 change order (refused: over its maxAmount). Nothing moves.
      else if (s === "overspend") r = await tourOverspend(J.job(j.id), p);
      else if (s === "evidence") {
        const tc = j.scope.checks.filter((c) => J.currentMs(j)?.checkIds.includes(c.id) ?? true), { span } = demoPlan(j, tc), el = (Date.parse(nowIso()) - Date.parse(j.startedAt || j.agreed.at)) / 60e3;
        if (el < span) advanceMs(Math.ceil(span - el) * 60e3, `demo tour: the pro's visit on ${j.number} takes ${span} minutes (timed photos)`);
        const items = await demoEvidence(j, tc, { typed: (await aiStatus()).mode === "rules" });
        r = J.addEvidence(j.agreed.pro, j.id, items, pa());
        if (!r.error) r = await J.submit(j.agreed.pro, j.id, pa());
      } else if (s === "release") {
        // the checks left it to the customer (e.g. no model is serving, so a person confirms the photos): they look and release
        if (J.job(j.id).status === "released") continue;
        if (J.job(j.id).status !== "review") { if (step === "all") continue; r = { error: "state", message: "Nothing to release: the job isn't in review." }; break; }
        r = await J.release(j.id, cust);
      } else r = { error: "step", message: "step is start, hire, start_work, change, approve_change, evidence, release or all" };
      if (r?.error) break;
    }
  } catch (e) { r = { error: "tour", message: e.message }; }
  if (r?.error) return send(res, { ...r, job: j?.id || null });
  res.json({ ...J.view(J.job(j.id)), tour: { ...(newPin ? { pinOnce: newPin, pinSays: "Your demo customer PIN, shown once: you need it to come back as this customer and to confirm what only you may do." } : {}), hold: J.job(j.id).hold ? J.view(J.job(j.id)).hold.explain : null, steps, mandates: J.job(j.id).tourMandates || [], ai: tourAi(J.job(j.id)), next: { start: "hire", hire: "start_work", start_work: "change", change: "approve_change", approve_change: "overspend", overspend: "evidence", evidence: J.job(j.id).status === "review" ? "release" : null, release: null, all: null }[step] } });
});

// ---- the website ------------------------------------------------------------------------------------------------------------
// The test history for judges: docs/live-test (index.html, the round reports, rounds.json, ops/*.json, sandbox runs),
// read-only, a fixed allow-list (no scripts, no screenshots), and anything that looks like a secret redacted as served:
// one-time link codes, sign-in codes, agent and pro keys, bearer tokens.
const LIVE = path.join(HERE, "../../docs/live-test");
const LIVE_OK = /^(index\.html|[\w.-]+\.md|rounds\.json|ops\/[\w.-]+\.json|sandbox\/[\w.-]+\.(json|html))$/;
const redact = (s) => s.replace(/([?&](code|token|key)=)(?!REDACTED)[A-Za-z0-9_-]{4,}(\.\.\.|…)?/g, "$1REDACTED").replace(/\b(done|dpk)_[A-Za-z0-9_-]{8,}/g, "$1_REDACTED").replace(/Bearer\s+[A-Za-z0-9._~+/-]{8,}=*/g, "Bearer REDACTED");
const TYPES = { html: "text/html", md: "text/markdown", json: "application/json" };
app.get(/^\/live-test(?:\/(.*))?$/, (req, res) => {
  if (!/^\/live-test\//.test(req.originalUrl)) return res.redirect(301, "/live-test/");
  let rel; try { rel = decodeURIComponent(req.params[0] || "") || "index.html"; } catch { rel = "?"; }
  if (!LIVE_OK.test(rel) || rel.includes("..")) return res.status(404).type("text").send("Not part of the published test history.");
  const f = path.join(LIVE, rel);
  if (!f.startsWith(LIVE) || !fs.existsSync(f)) return res.status(404).type("text").send("No such report.");
  res.set({ "Cache-Control": "no-cache", "X-Content-Type-Options": "nosniff" }).type(`${TYPES[rel.split(".").pop()]}; charset=utf-8`).send(redact(fs.readFileSync(f, "utf8")));
});
// the index links ../live-testing.md (how the rounds are run)
app.get("/live-testing.md", (req, res) => { const f = path.join(HERE, "../../docs/live-testing.md"); if (!fs.existsSync(f)) return res.status(404).end(); res.type("text/markdown; charset=utf-8").send(redact(fs.readFileSync(f, "utf8"))); });
const WEB = path.join(HERE, "../../web/dist");
app.all(/^\/(\.well-known|api)\//, (req, res) => res.status(404).json({ error: "not_found", message: `Nothing at ${req.path}. Agents: start at /llms.txt.` }));
// sandbox negative testing (staff): which error PayPal answers for a code (PayPal-Mock-Response)
app.post("/api/staff/paypal-negative", staff, async (req, res) => { const code = String(req.body?.code || "").toUpperCase(); if (!/^[A-Z_]{4,60}$/.test(code)) return res.status(400).json({ error: "code", message: "An application code, e.g. INSTRUMENT_DECLINED." }); res.json(await pp().negativeTest(code)); });
// ---- round 10: invoices outside PayPal, scheduled invoices, tracking, pay links, onboarding ------------------------------
app.post("/api/pro/invoices/:id/undo-outside", asPro, myInv, async (req, res) => send(res, await invoices.undoOutside(req.pro.id, req.inv.id)));
app.post("/api/pro/invoices/:id/refund-outside", asPro, myInv, async (req, res) => send(res, await invoices.refundOutside(req.pro.id, req.inv.id, { amount: toCents(req.body?.amount), method: req.body?.method || "CASH" })));
app.patch("/api/pro/invoices/:id/scheduled", asPro, myInv, async (req, res) => send(res, await invoices.editScheduled(req.pro.id, req.inv.id, { sendOn: req.body?.sendOn || null, note: req.body?.note || null })));
app.post("/api/pro/jobs/:id/tracking/:tracking", asPro, async (req, res) => send(res, await J.updateTracking(req.params.id, req.params.tracking, { trackingNumber: req.body?.trackingNumber || null, cancel: req.body?.cancel === true }, { kind: "pro", pro: req.pro.id })));
app.patch("/api/pro/paylinks/:id", asPro, personOnly, async (req, res) => send(res, await paylinks.reprice(req.pro.id, req.params.id, toCents(req.body?.amount))));
app.get("/api/pro/paylinks/paypal", asPro, async (req, res) => { try { res.json(await pp().listPayLinks()); } catch (e) { res.status(502).json({ error: "paypal", message: why(e) }); } });
app.get("/api/pro/paypal-onboarding/referral", asPro, async (req, res) => { const id = pros.pro(req.pro.id)?.merchant?.referralId; if (!id) return res.status(404).json({ error: "not_found", message: "No referral yet." }); try { res.json(await pp().getReferral(id)); } catch (e) { res.status(502).json({ error: "paypal", message: why(e) }); } });
// the built scripts and styles carry a content hash in their name: cached for a year; index.html is always asked again
if (fs.existsSync(WEB)) { app.use(express.static(WEB, { setHeaders: (res, f) => { if (/[\\/]assets[\\/]/.test(f)) res.set("Cache-Control", "public, max-age=31536000, immutable"); else if (f.endsWith(".html")) res.set("Cache-Control", "no-cache"); } })); app.get(/^\/(?!api|mcp|paypal|a2a|mock-paypal|\.well-known).*/, (req, res) => res.sendFile(path.join(WEB, "index.html"))); }

setInterval(() => tickAll().catch((e) => console.error("tick", e.message)), +(process.env.TICK_MS || 60e3)).unref();
if (DEMO && demopro.workDelay() >= 0) { demopro.watch(); demopro.resume(); }
if (DEMO) sim.start();
setInterval(() => receipts.batch().catch((e) => console.error("batch", e.message)), +(process.env.RECEIPT_BATCH_MS || 120e3)).unref();
if (process.env.RECON_MS && +process.env.RECON_MS > 0) setInterval(() => recon.run({ by: "schedule" }).catch(() => {}), +process.env.RECON_MS).unref();
app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  const status = err.status || err.statusCode || 500;
  if (status >= 500) console.error(err);
  res.status(status).json({ error: status === 413 ? "too_large" : status === 400 ? "bad_json" : "internal", message: status === 413 ? "The request body is too large." : status === 400 ? "The request body isn't valid JSON." : "Something went wrong." });
});
export { app };
if (process.env.DONE_NO_LISTEN !== "1") TG.start().catch((e) => console.error("telegram:", e.message));
if (process.env.DONE_NO_LISTEN !== "1") {
  // loopback only, on IPv4 and IPv6: a browser asking for "localhost" tries ::1 first, and on Windows a refused ::1
  // cost every new connection about 200 ms before it fell back to 127.0.0.1
  app.listen(PORT, "::1").on("error", () => {});
  app.listen(PORT, "127.0.0.1", () => console.log(`VeriPay on ${PUBLIC_URL}  (PayPal: ${pp().mode}${pp().testCard ? ", test card on" : ""}; hold: ${getHoldMode()}; demo sign-in: ${DEMO ? "on" : "off"})`));
}

