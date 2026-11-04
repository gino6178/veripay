// Cover's server: the website's API for people, the same actions for their agents (MCP, REST, A2A), PayPal's return
// URLs and webhooks, the claims desk and the carrier's back office, and the built website. Configure with environment
// variables (api/.env.example). Without PayPal keys it runs against the PayPal stand-in (pay/mock.js) and says so.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { paypal } from "./pay/paypal.js";
import { mockPaypal } from "./pay/mock.js";
import { setPay, pp, usd } from "./pay/index.js";
import { agentOf, sessionOf, createSession, endSession, makeToken, tokensOf, revoke, can, scopeError, COOKIE } from "./auth.js";
import { makePerson, person, updatePerson } from "./people.js";
import { PRODUCTS, product, summary, check as checkProducts, clause } from "./products/index.js";
import { quote } from "./quote.js";
import * as policies from "./policy.js";
import { pools, CAUSES, causesOf, checkCauses, lines as ledgerLines } from "./pool.js";
import { forPerson, onActivity } from "./activity.js";
import { advance, nowIso, skipped } from "./clock.js";
import * as receipts from "./proof/receipts.js";
import * as claims from "./claims.js";
import * as carrier from "./carrier.js";
import * as flights from "./flights.js";
import * as advisor from "./advisor.js";
import * as community from "./community.js";
import * as mcp from "./mcp.js";
import { limitsOf, setLimits } from "./ops.js";
import { guide } from "./guide.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
// a small .env reader, so the server needs no package for it
for (const f of [path.join(HERE, "../.env")]) if (fs.existsSync(f)) for (const line of fs.readFileSync(f, "utf8").split(/\r?\n/)) { const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/); if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, ""); }

const PORT = +(process.env.PORT || 8800);
const PUBLIC_URL = (process.env.PUBLIC_URL || `http://localhost:${PORT}`).replace(/\/$/, "");
const DEMO = process.env.DEMO_SIGNIN !== "0";
const real = !!(process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET) && process.env.PAYPAL_MODE !== "mock";
setPay(real ? paypal({ clientId: process.env.PAYPAL_CLIENT_ID, secret: process.env.PAYPAL_CLIENT_SECRET, testCard: process.env.PAYPAL_TEST_CARD === "1" }) : mockPaypal({ publicUrl: PUBLIC_URL }), PUBLIC_URL);
receipts.setOrigin(process.env.LOG_ORIGIN || `${new URL(PUBLIC_URL).host}/cover-receipts`);
const bad = checkProducts();
if (bad.length) { console.error("products cite missing clauses:", bad); process.exit(1); }

const app = express();
app.set("trust proxy", "loopback");
app.disable("x-powered-by");

// PayPal's webhook needs the body exactly as sent, for its signature check
const EVENTS = ["PAYMENT.CAPTURE.COMPLETED", "PAYMENT.CAPTURE.DENIED", "PAYMENT.CAPTURE.REFUNDED", "BILLING.SUBSCRIPTION.ACTIVATED", "BILLING.SUBSCRIPTION.PAYMENT.FAILED", "BILLING.SUBSCRIPTION.CANCELLED", "PAYMENT.SALE.COMPLETED", "PAYMENT.PAYOUTSBATCH.SUCCESS", "PAYMENT.PAYOUTS-ITEM.UNCLAIMED", "PAYMENT.PAYOUTS-ITEM.RETURNED", "INVOICING.INVOICE.PAID", "CUSTOMER.DISPUTE.CREATED", "VAULT.PAYMENT-TOKEN.DELETED"];
if (real && PUBLIC_URL.startsWith("https://") && !process.env.PAYPAL_WEBHOOK_ID)
  pp().ensureWebhook(`${PUBLIC_URL}/paypal/webhook`, EVENTS).then((w) => { process.env.PAYPAL_WEBHOOK_ID = w.id; console.log(`PayPal webhook ${w.created ? "created" : "found"}: ${w.id}`); }).catch((e) => console.error("webhook setup", e.message));
app.post("/paypal/webhook", express.raw({ type: "*/*", limit: "256kb" }), async (req, res) => {
  res.status(200).end();
  try {
    const raw = req.body.toString("utf8");
    if (real && !(process.env.PAYPAL_WEBHOOK_ID && await pp().verifyWebhook(req.headers, raw, process.env.PAYPAL_WEBHOOK_ID))) return console.error("webhook: signature not verified, ignored");
    const e = JSON.parse(raw), ref = e.resource?.custom_id || e.resource?.purchase_units?.[0]?.custom_id;
    // Cover treats a webhook as a nudge: it asks PayPal for the state itself (the same code as the return URL and the
    // billing run), so a missed or repeated event changes nothing
    if (ref && policies.policy(ref)) await policies.confirm(ref);
    await policies.tick();
  } catch (e) { console.error("webhook", e.message); }
});

// claims carry photos and documents (base64, up to 6 MB each); everything else stays small
const limitBody = (req, res, next) => next();
app.use(["/api/claims", "/api/agent/file_claim", "/api/agent/add_claim_evidence", "/mcp"], express.json({ limit: "9mb", verify: (req, res, buf) => { req.rawBody = buf; } }));
app.use(express.json({ limit: "64kb", verify: (req, res, buf) => { req.rawBody = buf; } }));

// Rate limits: a fixed window per caller (the agent's token when there is one, else the address)
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
app.use(["/api/auth", "/api/tokens"], limit("people", 30));

// ==== BEGIN partners block (partners.js): Cover sold inside a partner's checkout, agent to agent =======================
// A partner's agent speaks A2A at /a2a with its partner key (Bearer cvpk_...; a person's token goes on to mcp.a2a
// below), or the same actions as REST at /api/partner/<action>. Staff add partners. The demo page (/partners) runs
// Skyway Travel's checkout agent (skyway.js), which talks to this server's /a2a over HTTP like any outside agent.
// (staff and send are defined further down; they are only looked up when a request comes in.)
const partners = await import("./partners.js"), skyway = await import("./skyway.js");
const asStaff = (req, res, next) => staff(req, res, next);
app.post("/a2a", (req, res, next) => partners.a2a(req, res, next).catch((e) => { console.error("partner a2a", e); if (!res.headersSent) res.status(500).end(); }));
app.use("/api/partner", limit("partner", +(process.env.AGENT_RPM || 120)));
app.get("/api/partner/welcome/:t", (req, res) => {
  const w = partners.welcome(req.params.t);
  if (!w) return res.status(410).type("text/plain").send("This link has been used or has expired. Sign in to Cover to see your policy.");
  res.set("Set-Cookie", `${COOKIE}=${createSession(w.person)}; HttpOnly; SameSite=Lax; Path=/`).redirect(`/policies/${w.policy}`);
});
app.post("/api/partner/:action", async (req, res) => {
  const p = partners.partnerOf(req);
  if (!p) return res.status(401).json({ error: "partner_key", message: "Send a partner key Cover issued: Authorization: Bearer cvpk_..." });
  const r = await partners.act(p, req.params.action, req.body || {});
  res.status(r.data?.error ? (r.data.error === "action" ? 404 : 400) : 200).json({ ...r.data, said: r.text });
});
app.get("/api/staff/partners", asStaff, (req, res) => res.json(partners.allPartners().map((p) => ({ ...partners.viewPartner(p), recent: partners.salesOf(p.id).slice(-10).reverse() }))));
app.post("/api/staff/partners", asStaff, (req, res) => send(res, partners.createPartner(req.body || {})));
// the demo page: one move of Skyway's agent (offer, counter, bind, status), sent to Cover's /a2a, both messages back
app.post("/api/demo/skyway", async (req, res) => {
  if (!DEMO) return res.status(404).end();
  const b = req.body || {}, m = skyway.message(b.step, b);
  if (b.step === "cart") return res.json({ cart: skyway.cart(), testCard: !!pp().testCard, paypal: pp().mode, rate: partners.partner("skyway").rate });
  if (!m) return res.status(400).json({ error: "step", message: "step is cart, offer, counter, bind or status" });
  try {
    const x = await skyway.send(`http://127.0.0.1:${PORT}/a2a`, partners.demoKey(), { ...m, contextId: b.contextId });
    const sale = x.received?.result?.parts?.find((p) => p.kind === "data")?.data?.sale;
    res.json({ exchange: x, inbox: sale ? partners.inbox(sale) : null });
  } catch (e) { res.status(502).json({ error: "a2a", message: e.message }); }
});
// ==== END partners block ===========================================================================================

// ---- agents -------------------------------------------------------------------------------------------------------
app.all("/mcp", (req, res) => mcp.handle(req, res).catch((e) => { console.error("mcp", e); if (!res.headersSent) res.status(500).json({ jsonrpc: "2.0", error: { code: -32603, message: "internal error" }, id: null }); }));
app.post("/a2a", (req, res) => mcp.a2a(req, res).catch((e) => { console.error("a2a", e); res.status(500).end(); }));
app.get("/.well-known/agent-card.json", (req, res) => res.json(mcp.card(PUBLIC_URL)));
app.get("/.well-known/mcp-tools.json", (req, res) => res.json(mcp.toolsManifest()));
app.get("/.well-known/mcp.json", (req, res) => { const t = mcp.toolsManifest(); res.json({ name: "Cover", description: "Insurance settled with PayPal (sandbox): quotes, policies and claims for a person's agent.", url: `${PUBLIC_URL}/mcp`, transport: "streamable-http", authentication: { type: "bearer", howToGetOne: `${PUBLIC_URL}/llms.txt` }, guide: `${PUBLIC_URL}/llms.txt`, tools: t.tools.map((x) => x.name), toolsDigest: t.digest }); });
app.get("/llms.txt", (req, res) => res.type("text/plain").send(guide(PUBLIC_URL)));
app.post("/api/agent/:tool", async (req, res) => {
  const a = agentOf(req), fn = mcp.REST[req.params.tool];
  if (!a) return res.status(401).json({ error: "token", message: "Send a person's agent token: Authorization: Bearer cover_..." });
  if (!fn) return res.status(404).json({ error: "tool", message: `Tools: ${Object.keys(mcp.REST).join(", ")}` });
  if (!can(a, req.params.tool)) return res.status(403).json(scopeError(req.params.tool));
  send(res, await fn(a, req.body || {}));
});

// ---- people on the website ----------------------------------------------------------------------------------------
const me = (req) => { const s = sessionOf(req); return s ? person(s.person) : null; };
const signedIn = (req, res, next) => { const p = me(req); if (!p) return res.status(401).json({ error: "signin", message: "Sign in first." }); req.person = p; next(); };
const lang = (req) => (req.query.lang === "en" || req.query.lang === "zh" ? req.query.lang : req.person?.lang || "zh");
const send = (res, r) => res.status(r?.error ? (r.error === "policy" || r.error === "quote" ? 404 : 400) : 200).json(r);

app.get("/api/info", (req, res) => res.json({ paypal: pp().mode, testCard: !!pp().testCard, demoSignin: DEMO, publicUrl: PUBLIC_URL, mcpUrl: `${PUBLIC_URL}/mcp`, now: nowIso(), demoDaysSkipped: skipped() }));
app.post("/api/auth/demo", (req, res) => {
  if (!DEMO) return res.status(404).end();
  const p = makePerson({ name: req.body?.name, email: req.body?.email || null, lang: req.body?.lang });
  res.set("Set-Cookie", `${COOKIE}=${createSession(p.id)}; HttpOnly; SameSite=Lax; Path=/`).json(p);
});
app.post("/api/auth/signout", (req, res) => { const s = sessionOf(req); if (s) endSession(s.sid); res.set("Set-Cookie", `${COOKIE}=; Max-Age=0; Path=/`).json({ ok: true }); });
app.get("/api/me", signedIn, (req, res) => res.json({ ...req.person, vault: !!req.person.vault }));
app.patch("/api/me", signedIn, (req, res) => {
  const { name, email, lang, cause, causes } = req.body || {};
  const bad = checkCauses(causes ?? cause);
  if (bad) return res.status(400).json({ error: "cause", message: bad });
  res.json(updatePerson(req.person.id, { name, email, lang, ...(causes != null || cause != null ? { causes: causesOf(causes ?? cause) } : {}) }));
});

app.get("/api/products", (req, res) => res.json(Object.values(PRODUCTS).map((p) => summary(p, req.query.lang === "zh" ? "zh" : "en"))));
app.get("/api/products/:id", (req, res) => { const p = product(req.params.id); if (!p) return res.status(404).json({ error: "product" }); res.json({ ...summary(p, req.query.lang === "zh" ? "zh" : "en"), clauses: p.clauses }); });
app.get("/api/clauses/:id", (req, res) => { const c = clause(req.params.id); if (!c) return res.status(404).json({ error: "clause" }); res.json(c); });
app.get("/api/causes", (req, res) => res.json(Object.entries(CAUSES).map(([id, c]) => ({ id, zh: c.zh, en: c.en }))));

// Lumi, the advisor: chat in, the one cover you need most out (advisor.js)
app.post("/api/advisor", async (req, res) => { const m = Array.isArray(req.body?.messages) ? req.body.messages.slice(-20).map((x) => ({ role: x.role === "assistant" ? "assistant" : "user", content: String(x.content || "").slice(0, 2000) })) : []; res.json(await advisor.advise({ messages: m, state: req.body?.state || {}, lang: req.body?.lang === "zh" ? "zh" : "en", person: me(req)?.id || null })); });
app.post("/api/quote", (req, res) => { const p = me(req); send(res, quote(req.body?.product, req.body?.answers, { addons: req.body?.addons || [], person: p?.id || null, lang: req.body?.lang === "zh" ? "zh" : "en" })); });
app.post("/api/policies", signedIn, async (req, res) => send(res, await policies.buy(req.person.id, { ...req.body, actor: { kind: "person", person: req.person.id } })));
app.get("/api/policies", signedIn, (req, res) => res.json(policies.policiesOf(req.person.id).map((x) => policies.view(x, lang(req)))));
const mine = (req, res, next) => { const x = policies.policy(req.params.id); if (!x || x.person !== req.person.id) return res.status(404).json({ error: "policy" }); req.policy = x; next(); };
app.get("/api/policies/:id", signedIn, mine, (req, res) => res.json(policies.view(req.policy, lang(req))));
app.post("/api/policies/:id/change", signedIn, mine, async (req, res) => send(res, await policies.change(req.policy.id, { ...req.body, actor: { kind: "person", person: req.person.id } })));
app.post("/api/policies/:id/cancel", signedIn, mine, async (req, res) => send(res, await policies.cancel(req.policy.id, { actor: { kind: "person", person: req.person.id } })));
app.post("/api/policies/:id/pay-card", signedIn, mine, async (req, res) => send(res, await policies.payByCard(req.policy.id)));
app.post("/api/policies/:id/confirm", signedIn, mine, async (req, res) => send(res, await policies.confirm(req.policy.id)));

app.get("/api/limits", signedIn, (req, res) => res.json(limitsOf(req.person.id)));
app.put("/api/limits", signedIn, (req, res) => send(res, setLimits(req.person.id, req.body || {})));
app.get("/api/activity", signedIn, (req, res) => res.json(forPerson(req.person.id, { after: +req.query.after || 0 })));
app.get("/api/tokens", signedIn, (req, res) => res.json(tokensOf(req.person.id)));
app.post("/api/tokens", signedIn, (req, res) => res.json(makeToken(req.person.id, req.body?.label, { scopes: req.body?.scopes, days: req.body?.days, key: req.body?.key })));
app.delete("/api/tokens/:id", signedIn, (req, res) => res.json({ ok: revoke(req.person.id, req.params.id) }));

// ---- neighborhood funds (community.js) -----------------------------------------------------------------------------
app.get("/api/neighborhood", signedIn, (req, res) => res.json({ suggestion: community.suggestion(req.person.id), funds: community.fundsOf(req.person.id).map((f) => community.view(f, req.person.id)) }));
app.post("/api/neighborhood/join", signedIn, async (req, res) => send(res, await community.join(req.person.id, { zip: req.body?.zip })));
app.post("/api/neighborhood/:id/leave", signedIn, (req, res) => send(res, community.leave(req.person.id, req.params.id)));
app.post("/api/neighborhood/:id/propose", signedIn, (req, res) => send(res, community.propose(req.person.id, req.params.id, req.body || {})));
app.post("/api/neighborhood/:id/vote", signedIn, (req, res) => send(res, community.vote(req.person.id, req.params.id, req.body?.project)));
// the demo: a few neighbors in your ZIP with renters cover, paid with the sandbox test card (or the stand-in), who join the fund
app.post("/api/demo/neighbors", signedIn, async (req, res) => {
  if (!DEMO) return res.status(404).end();
  const mine = policies.policiesOf(req.person.id).find((p) => ["active", "grace"].includes(p.status) && ["renters", "home"].includes(p.product) && p.zone?.zip);
  if (!mine) return res.status(400).json({ error: "eligible", message: "Buy renters or home cover at a ZIP code first." });
  const made = [];
  for (const name of ["Demo · Ana Ruiz", "Demo · Ben Okafor", "Demo · Chloe Kim"].slice(0, Math.max(1, Math.min(3, +req.body?.count || 3)))) {
    const p = makePerson({ name, email: `${name.split("· ")[1].toLowerCase().replace(/\W+/g, ".")}@example.com`, lang: "en" });
    const q = quote("renters", { place: mine.zone.zip, size: 700, floor: "low", building: "apartment", contents: 7000, valuables: 0, claims3y: 0, deductible: "500" }, { person: p.id });
    const b = await policies.buy(p.id, { quote: q.quote, plan: "monthly", cause: "disaster" });
    if (b.approveUrl && pp().mode === "mock") { pp().approve({ token: b.payments[0].paypal }); await policies.confirm(b.policy); } else if (b.status === "awaiting_payment") await policies.payByCard(b.policy);
    made.push({ name, person: p.id, policy: policies.policy(b.policy)?.status });
  }
  // they join once all of them are covered (a fund needs 3 households to start)
  for (const m of made) { const j = m.policy === "active" ? await community.join(m.person, {}) : { error: "not paid" }; m.fund = j.error ? j.message || j.error : j.fund; delete m.person; }
  res.json({ zip: mine.zone.zip, made });
});
// ---- claims ----------------------------------------------------------------------------------------------------------
app.post("/api/claims", signedIn, limitBody, async (req, res) => send(res, await claims.file(req.person.id, { ...req.body, device: req.headers["x-cover-device"], actor: { kind: "person", person: req.person.id } })));
app.get("/api/claims", signedIn, (req, res) => res.json(claims.claimsOf(req.person.id).map((c) => claims.view(c, { lang: lang(req) }))));
const myClaim = (req, res, next) => { const c = claims.claim(req.params.id); if (!c || c.person !== req.person.id) return res.status(404).json({ error: "claim" }); req.claim = c; next(); };
app.get("/api/claims/:id", signedIn, myClaim, (req, res) => res.json(claims.view(req.claim, { lang: lang(req) })));
app.post("/api/claims/:id/evidence", signedIn, myClaim, limitBody, async (req, res) => send(res, await claims.addEvidence(req.claim.id, req.body || {}, { actor: { kind: "person", person: req.person.id } })));
app.post("/api/claims/:id/appeal", signedIn, myClaim, (req, res) => send(res, claims.appeal(req.claim.id, req.person.id, req.body?.why)));
app.post("/api/claims/:id/withdraw", signedIn, myClaim, (req, res) => send(res, claims.withdraw(req.claim.id, req.person.id)));
app.get("/api/claims/:id/evidence/:eid", signedIn, myClaim, (req, res) => { const b = claims.evidenceFile(req.claim, req.params.eid); if (!b) return res.status(404).end(); res.type(b[0] === 0x89 ? "png" : "jpeg").send(b); });

// ---- Cover's staff: the claims desk, underwriting, the back office (the demo signs in as staff with one click) -------
const staffSessions = new Set();
app.post("/api/auth/staff", (req, res) => { if (!DEMO && req.body?.key !== process.env.ADMIN_TOKEN) return res.status(403).end(); const sid = crypto.randomBytes(24).toString("base64url"); staffSessions.add(sid); res.set("Set-Cookie", `cover_staff=${sid}; HttpOnly; SameSite=Lax; Path=/`).json({ ok: true }); });
const staff = (req, res, next) => { const sid = (req.headers.cookie || "").match(/(?:^|;\s*)cover_staff=([^;]+)/)?.[1]; if (!sid || !staffSessions.has(sid)) return res.status(401).json({ error: "staff", message: "Sign in as Cover staff." }); next(); };
app.get("/api/staff/claims", staff, (req, res) => res.json({ queue: claims.queue().map((c) => claims.view(c, { staff: true, lang: req.query.lang })), recent: claims.allClaims().slice(-50).reverse().map((c) => claims.view(c, { staff: true, lang: req.query.lang })) }));
app.get("/api/staff/claims/:id", staff, (req, res) => { const c = claims.claim(req.params.id); if (!c) return res.status(404).end(); res.json(claims.view(c, { staff: true })); });
app.get("/api/staff/claims/:id/evidence/:eid", staff, (req, res) => { const c = claims.claim(req.params.id), b = c && claims.evidenceFile(c, req.params.eid); if (!b) return res.status(404).end(); res.type(b[0] === 0x89 ? "png" : "jpeg").send(b); });
app.post("/api/staff/claims/:id", staff, async (req, res) => send(res, await claims.adjust(req.params.id, { ...req.body, adjuster: "Cover adjuster" })));
app.get("/api/staff/underwriting", staff, (req, res) => res.json(policies.allPolicies().filter((p) => p.status === "review").map((p) => ({ ...policies.view(p), answers: p.answers }))));
app.post("/api/staff/underwriting/:id", staff, async (req, res) => send(res, await policies.review(req.params.id, { approve: !!req.body?.approve, note: req.body?.note })));
app.get("/api/staff/dashboard", staff, (req, res) => res.json(carrier.dashboard()));
app.get("/api/staff/exposure", staff, (req, res) => res.json(carrier.exposure()));
app.get("/api/staff/scenario", staff, (req, res) => res.json(carrier.scenario({ peril: req.query.peril, strength: req.query.strength })));
app.get("/api/staff/rates", staff, (req, res) => res.json(carrier.filings()));
app.post("/api/staff/rates", staff, (req, res) => send(res, carrier.fileRate(req.body || {})));
app.post("/api/staff/rates/:id", staff, (req, res) => send(res, carrier.answerRate(req.params.id, !!req.body?.approve)));
app.post("/api/staff/close-year", staff, async (req, res) => res.json(await carrier.closeYear()));
// ---- BEGIN reconciliation agent (recon.js): PayPal's record against Cover's ledger, on the PayPal Agent Toolkit --------
// GET: the latest report (and whether a run is going); POST: run now (answers at once; the page polls GET). It also runs
// every RECON_MS (6 hours by default; 0 turns the schedule off).
const recon = await import("./recon.js");
app.get("/api/staff/recon", staff, (req, res) => res.json({ running: recon.isRunning(), report: recon.latest(), history: recon.history() }));
app.post("/api/staff/recon", staff, (req, res) => { const was = recon.isRunning(); recon.run({ by: "on demand", useModel: req.body?.model !== false }).catch((e) => console.error("recon", e.message)); res.status(202).json({ running: true, started: !was }); });
if (process.env.RECON_MS !== "0") recon.schedule();
// ---- END reconciliation agent ------------------------------------------------------------------------------------------
// ---- BEGIN anomaly-alert agent (alerts.js): what it watches, and plans for the back office's grids ----------------------
const alerts = await import("./alerts.js");
app.get("/api/staff/alerts", staff, (req, res) => { const a = alerts.scan(); res.json({ alerts: a, facts: alerts.facts(a), payouts: alerts.payoutsBy(), limits: alerts.LIMITS, agent: alerts.agentMode(), at: nowIso() }); });
app.post("/api/staff/alerts/:id/ack", staff, (req, res) => res.json(alerts.ack(req.params.id)));
app.post("/api/staff/ask", staff, async (req, res) => send(res, await alerts.ask(req.body || {})));
// ---- END anomaly-alert agent ---------------------------------------------------------------------------------------------
app.get("/api/staff/report", staff, (req, res) => {
  const d = carrier.dashboard(), rows = [["product", "in_force", "premiums_usd", "refunds_usd", "earned_usd", "claims_paid_usd", "recoveries_usd", "loss_ratio", "claims", "instant", "referred", "denied"]];
  for (const r of d.products) rows.push([r.product, r.inForce, r.premiums / 100, r.refunds / 100, r.earned / 100, r.claimsPaid / 100, r.recoveries / 100, r.lossRatio ?? "", r.claims, r.instant, r.referred, r.denied]);
  res.type("text/csv").set("Content-Disposition", `attachment; filename=cover-year-${d.year}.csv`).send(rows.map((r) => r.join(",")).join("\n"));
});

// ---- the front page's numbers, counted ---------------------------------------------------------------------------
app.get("/api/stats", (req, res) => {
  const all = claims.allClaims(), instant = all.filter((c) => c.status === "paid" && c.decision?.by === "rules").map((c) => c.secondsToPay).sort((a, b) => a - b);
  res.json({ policies: policies.allPolicies().filter((p) => p.start).length, claimsPaid: all.filter((c) => c.status === "paid").length, instantPaid: instant.length, medianSecondsToPay: instant.length ? instant[Math.floor(instant.length / 2)] : null,
    givenBack: carrier.givebacks().reduce((t, g) => t + (g.payout ? g.amount : 0), 0), poolsNow: pools().reduce((t, p) => t + Math.max(0, p.balance), 0),
    // the latest claim paid without a person, as the front page shows it: what kind, its checks, the amount, the seconds (no one's name)
    last: (() => { const c = all.filter((x) => x.status === "paid" && x.decision?.by === "rules").at(-1); if (!c) return null; const ct = product(c.product).claims.find((x) => x.type === c.type);
      return { what: { zh: ct.zh, en: ct.en }, product: c.product, amount: c.paid, seconds: c.secondsToPay, checks: c.decision.checks.map((x) => ({ id: x.id, clause: x.clause })), payout: c.payout?.batchId, at: c.paidAt }; })(),
    // the latest flight that paid by itself: the flight, what happened, how many travelers, and the seconds from the
    // flight's departure being reported to the PayPal payout
    lastFlight: (() => { const c = all.filter((x) => x.status === "paid" && x.auto).at(-1); if (!c) return null; const r = JSON.parse(c.evidence[0]?.typed || "{}");
      return { flight: r.flight, date: r.date, from: r.from, to: r.to, status: r.status, delayMin: r.delayMin, amount: c.paid, travelers: Math.round(c.claimed / (r.status === "cancelled" || r.delayMin >= 360 ? 30000 : 10000)), seconds: Math.max(0, Math.round((Date.parse(c.paidAt) - Date.parse(c.flightReportedAt || c.reportedAt)) / 1000)), checks: c.decision.checks.map((x) => ({ id: x.id, clause: x.clause })), payout: c.payout?.batchId }; })(),
    autoPaid: all.filter((c) => c.status === "paid" && c.auto).length,
    premiums: pools().reduce((t, p) => t + p.premiums, 0), claimsPaidAmount: pools().reduce((t, p) => t + p.claims, 0) });
});
// ---- transparency: anyone can see where the money is ---------------------------------------------------------------
app.get("/api/transparency", (req, res) => res.json({ pools: pools().map((p) => ({ cause: p.cause, name: { zh: p.name.zh, en: p.name.en }, policies: p.policies, premiums: usd(p.premiums), fees: usd(p.fees), claims: usd(p.claims), claimCount: p.claimCount, reinsurance: usd(p.reinsurance), giveback: usd(p.giveback), balance: usd(p.balance) })),
  givebacks: carrier.givebacks().map((g) => ({ year: g.year, cause: g.cause, name: { zh: CAUSES[g.cause].zh, en: CAUSES[g.cause].en }, amount: usd(g.amount), payout: g.payout, receipt: g.receipt })) }));

// the JS SDK v6's browser-safe client token, for PayPal's own buttons on the policy page
app.get("/api/paypal/sdk", signedIn, async (req, res) => {
  if (!pp().clientToken) return res.json({ mode: pp().mode, token: null });
  try { res.json({ mode: pp().mode, ...(await pp().clientToken()) }); } catch (e) { res.status(502).json({ error: "paypal", message: e.message }); }
});
// ---- PayPal: return URLs, and the stand-in's approval page ---------------------------------------------------------
app.get("/paypal/return", async (req, res) => {
  const id = String(req.query.policy || "");
  try { await policies.confirm(id); } catch (e) { console.error("return", e.message); }
  res.redirect(`/policies/${encodeURIComponent(id)}`);
});
if (pp().mode === "mock") {
  const page = (body) => `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>PayPal (simulated)</title><style>body{font:16px system-ui;background:#f5f7fa;margin:0;display:grid;place-items:center;min-height:100vh}.c{background:#fff;padding:32px;border-radius:16px;box-shadow:0 8px 30px #0001;max-width:380px;width:calc(100% - 32px)}h1{font-size:20px;margin:0 0 4px}.n{color:#a15c00;background:#fff4e0;padding:8px 12px;border-radius:8px;font-size:13px;margin:12px 0 20px}button{font:inherit;width:100%;padding:12px;border-radius:999px;border:0;margin-top:8px;cursor:pointer}.y{background:#0070e0;color:#fff;font-weight:600}.x{background:#eee}</style><div class="c">${body}</div>`;
  const q = (req) => ({ token: req.query.token, setup: req.query.setup, invoice: req.query.invoice, subscription: req.query.subscription });
  app.get("/mock-paypal/approve", (req, res) => {
    const d = pp().describe(q(req));
    if (!d) return res.status(404).send(page("<h1>Unknown payment</h1>"));
    const what = d.kind === "invoice" ? `Pay invoice: <b>${usd(d.amount)}</b> for ${d.reference}` : d.kind === "subscription" ? `Subscribe: <b>${usd(d.amount)}</b> a month` : d.kind === "order" ? `Pay <b>${usd(d.amount)}</b> to Cover, and save PayPal for the next premiums` : "Save PayPal for Cover";
    res.send(page(`<h1>PayPal</h1><p>${what}</p><p class="n">Simulated PayPal: Cover is running without sandbox keys. No money moves.</p><form method="post"><button class="y" name="a" value="yes">Agree and continue</button><button class="x" name="a" value="no">Cancel</button></form>`));
  });
  app.post("/mock-paypal/approve", express.urlencoded({ extended: false }), (req, res) => {
    const x = q(req), yes = req.body?.a === "yes";
    if (yes) pp().approve(x);
    if (x.invoice) return res.redirect("/policies");
    const pol = policies.allPolicies().find((p) => p.payments[0]?.order === x.token || p.subscription?.id === x.subscription);
    res.redirect(pol ? (yes ? `/paypal/return?policy=${pol.id}` : `/policies/${pol.id}?cancelled=1`) : "/");
  });
}

// ---- the demo's controls: move Cover's clock, make a premium fail ---------------------------------------------------
app.post("/api/demo/advance", async (req, res) => { if (!DEMO) return res.status(404).end(); const r = advance(req.body?.days, "demo panel"); r.billing = await policies.tick(); await claims.tick(); await community.tick(); r.flights = (await claims.flightTick()).length; res.json(r); });
// the simulated flight feed: report an insured flight late, departed late or cancelled; insured travelers are paid at once
app.post("/api/demo/flight", async (req, res) => { if (!DEMO) return res.status(404).end(); const r = flights.report(req.body || {}); if (r.error) return res.status(400).json(r); r.paid = (await claims.flightTick()).filter(Boolean).map((c) => ({ claim: c.claim, status: c.status, amount: c.payout?.amount || null })); res.json(r); });
app.get("/api/flights/:flight/:date", async (req, res) => res.json(await flights.statusOf({ flight: String(req.params.flight).toUpperCase(), date: req.params.date }, req.query.region)));
app.post("/api/demo/fail-next-premium", signedIn, (req, res) => { if (pp().mode !== "mock") return res.status(404).json({ error: "only with the PayPal stand-in" }); res.json({ ok: pp().failNextCharge(req.person.vault) }); });

// ---- receipts ---------------------------------------------------------------------------------------------------------
app.get("/.well-known/cover-receipts.json", (req, res) => res.json({ keys: [receipts.publicKey()], log: receipts.logInfo() }));
app.get("/api/receipts/:id", (req, res) => { const r = receipts.show(req.params.id, me(req)?.id); if (!r) return res.status(404).json({ error: "receipt" }); res.json(r); });
app.get("/api/receipts/log/checkpoint", (req, res) => res.type("text/plain").send(receipts.logInfo().checkpoint || ""));

// ==== BEGIN models block (Cover's own models: Cover-Risk in quotes, GET /api/models) =================================
// Cover-Risk prices a quote when its exported trees exist and still fit the product (api/src/risk.js says why not
// when they don't). /api/models: each model's round-1 numbers (ml/results.json) and what is live in this server now.
{
  const { installRisk, riskState } = await import("./risk.js");
  const { readerMode } = await import("./reader.js");
  const rs = await installRisk();
  console.log(`Cover-Risk: ${rs.live ? `live for ${Object.entries(rs.products).filter(([, s]) => s.live).map(([id]) => id).join(", ")}` : `not live (${rs.reason})`}`);
  const RESULTS = path.join(HERE, "../../ml/results.json");
  app.get("/api/models", async (req, res) => {
    let results = null;
    try { results = JSON.parse(fs.readFileSync(RESULTS, "utf8")); } catch { /* not generated */ }
    const mode = readerMode(), risk = riskState();
    let ocr = { live: false, why: `the reader is ${mode === "none" ? "off" : mode}` };
    if (mode === "cover-ocr") {
      const url = (process.env.READER_URL || "http://127.0.0.1:11449").replace(/\/$/, "");
      try { const h = await (await fetch(`${url}/health`, { signal: AbortSignal.timeout(1500) })).json(); ocr = { live: !!h.ok, version: h.version }; }
      catch { ocr = { live: false, why: "reader mode is cover-ocr but its worker is not answering" }; }
    }
    const live = {
      "cover-risk": { live: risk.live, products: risk.products, ...(risk.reason ? { why: risk.reason } : {}) },
      "cover-ocr": ocr,
      "cover-1b": { live: mode === "cover", why: mode === "cover" ? undefined : "not served in this server" },
      "cover-audit": { live: false, why: "not served in this server" },
    };
    res.json({ reader: mode, live, results });
  });
}
// ==== END models block ==============================================================================================

// ---- the website ----------------------------------------------------------------------------------------------------------
const WEB = path.join(HERE, "../../web/dist");
app.all(/^\/(\.well-known|api)\//, (req, res) => res.status(404).json({ error: "not_found", message: `Nothing at ${req.path}. Agents: start at /llms.txt.` }));
if (fs.existsSync(WEB)) { app.use(express.static(WEB)); app.get(/^\/(?!api|mcp|paypal|a2a|mock-paypal|\.well-known).*/, (req, res) => res.sendFile(path.join(WEB, "index.html"))); }

setInterval(() => Promise.all([policies.tick(), claims.tick(), claims.flightTick(), community.tick()]).catch((e) => console.error("tick", e.message)), +(process.env.TICK_MS || 60e3)).unref();
setInterval(() => receipts.batch().catch((e) => console.error("batch", e.message)), +(process.env.RECEIPT_BATCH_MS || 120e3)).unref();
app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  const status = err.status || err.statusCode || 500;
  if (status >= 500) console.error(err);
  res.status(status).json({ error: status === 413 ? "too_large" : status === 400 ? "bad_json" : "internal", message: status === 413 ? "The request body is too large." : status === 400 ? "The request body isn't valid JSON." : "Something went wrong." });
});
app.listen(PORT, () => console.log(`Cover on ${PUBLIC_URL}  (PayPal: ${pp().mode}; products: ${Object.keys(PRODUCTS).join(", ")}; demo sign-in: ${DEMO ? "on" : "off"})`));
export { onActivity };
