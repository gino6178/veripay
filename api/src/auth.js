// Who is asking.
//   People sign in on the website. The demo signs in with one click as a demo customer or a demo pro (DEMO_SIGNIN, on
//   unless set to 0); a real deployment puts its own login in front of createSession. A session is an HttpOnly cookie.
//   A customer's agent uses a personal token the person made on the website ("Connect your agent"): Bearer done_...,
//   kept only as a SHA-256 hash, named after the agent, revocable, scoped to that one person. A token can do what the
//   person chose (read; hire: post, negotiate, accept and hold within their limits; pay: release, ask for a fix,
//   dispute) and nothing else: it can't change the limits, make other tokens or say where money is paid.
//   A token may be tied to a public key: then every request must be signed with it (HTTP Message Signatures, RFC 9421,
//   the basis of Web Bot Auth), so a leaked token alone is useless.
//   Pros' agents use a pro key (Bearer dpk_..., pros.js) over A2A.
import crypto from "node:crypto";
import { store, stateFile } from "./store.js";
import { person, peopleStore } from "./people.js";

const db = store(stateFile("tokens"), { tokens: [] });
export const tokensStore = db;
const sessions = new Map();
const sha = (s) => crypto.createHash("sha256").update(s).digest("hex");
export const COOKIE = "done_session";

export function createSession(personId, { stepUp = false } = {}) {
  if (!person(personId)) return null;
  const sid = crypto.randomBytes(24).toString("base64url");
  sessions.set(sid, { person: personId, at: Date.now(), stepUpUntil: stepUp ? Date.now() + STEP_UP_MS : 0 });
  return sid;
}
// ---- the person's PIN: proof an agent doesn't have ----------------------------------------------------------------------
// A demo customer sets a 4-6 digit PIN when they sign up (the website shows it once; it is stored only as a scrypt hash,
// and no API response or token ever carries it). Everything only the person may do (their limits and permissions, agent
// tokens, the price ceiling, confirm, release, waiving, approving a change order, applying a scope revision, a dispute
// settlement) needs the person's session AND a fresh step-up with the PIN (10 minutes). Resuming a demo customer and
// opening an askPerson link need the PIN too: a link alone never signs anyone in. Five wrong PINs lock the person's
// step-up for 15 minutes. In production this step-up is the person's own login (Log in with PayPal), not a PIN.
export const STEP_UP_MS = 10 * 60e3;
const PIN = /^\d{4,6}$/, fails = new Map();
export const validPin = (pin) => PIN.test(String(pin ?? ""));
export function setPin(personId, pin) {
  const p = person(personId);
  if (!p || !validPin(pin)) return false;
  const salt = crypto.randomBytes(16).toString("hex");
  p.pin = { salt, hash: crypto.scryptSync(String(pin), salt, 32).toString("hex"), at: new Date().toISOString() };
  peopleStore.save();
  return true;
}
export const hasPin = (personId) => !!person(personId)?.pin?.hash;
// { ok } or { error, message, locked?, retryAfter? }
export function checkPin(personId, pin) {
  const p = person(personId), f = fails.get(personId) || { n: 0, until: 0 };
  if (!p) return { error: "person", message: "No such person." };
  if (f.until > Date.now()) return { error: "locked", message: `Too many wrong PINs: try again in ${Math.ceil((f.until - Date.now()) / 60e3)} minutes.`, locked: true, retryAfter: Math.ceil((f.until - Date.now()) / 1000) };
  // people made before PINs existed: the operator may give them one shared demo PIN (DONE_LEGACY_PIN), else they sign up again
  if (!p.pin?.hash && validPin(process.env.DONE_LEGACY_PIN) && validPin(pin) && String(pin) === String(process.env.DONE_LEGACY_PIN)) { fails.delete(personId); return { ok: true }; }
  if (!p.pin?.hash) return { error: "no_pin", message: "This person has no PIN yet: sign up again on the website (a new demo customer sets one)." };
  if (pin == null || pin === "") return { error: "pin", missing: true, message: "This person’s PIN is needed to sign in as them." };
  if (!validPin(pin)) return { error: "pin", message: "The PIN is 4 to 6 digits." };
  const ok = crypto.timingSafeEqual(Buffer.from(p.pin.hash, "hex"), crypto.scryptSync(String(pin), p.pin.salt, 32));
  if (ok) { fails.delete(personId); return { ok: true }; }
  f.n += 1; if (f.n >= 5) { f.until = Date.now() + 15 * 60e3; f.n = 0; }
  fails.set(personId, f);
  return { error: "pin", message: f.until > Date.now() ? "Wrong PIN. Too many tries: step-up is locked for 15 minutes." : `Wrong PIN (${5 - f.n} tries left before a 15-minute lock).` };
}
// the step-up window runs on real time (Date.now), never the demo clock: moving the demo clock doesn’t extend or end it
// (tests age a session with ageSession)
// ---- accounts: email and password ---------------------------------------------------------------------------------------
// Anyone can make a real account (POST /api/auth/signup) and sign in again with it (POST /api/auth/login). The password is
// kept only as a scrypt hash; the PIN stays separate (the step-up for what only the person may do). Ten wrong passwords
// for one email lock it for 15 minutes.
const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;
export const validEmail = (e) => EMAIL.test(String(e ?? "").trim());
export const validPassword = (pw) => typeof pw === "string" && pw.length >= 8 && pw.length <= 200;
export const personByEmail = (email) => { const e = String(email || "").trim().toLowerCase(); return e ? Object.values(peopleStore.data.people).find((p) => p.password?.hash && String(p.email || "").toLowerCase() === e) || null : null; };
export function setPassword(personId, pw) {
  const p = person(personId);
  if (!p || !validPassword(pw)) return false;
  const salt = crypto.randomBytes(16).toString("hex");
  p.password = { salt, hash: crypto.scryptSync(pw, salt, 32).toString("hex"), at: new Date().toISOString() };
  peopleStore.save();
  return true;
}
const loginFails = new Map();
// { person } or { error, message, locked?, retryAfter? }: the same answer for an unknown email and a wrong password
export function checkPassword(email, pw) {
  const key = String(email || "").trim().toLowerCase(), f = loginFails.get(key) || { n: 0, until: 0 };
  if (f.until > Date.now()) return { error: "locked", message: `Too many wrong passwords: try again in ${Math.ceil((f.until - Date.now()) / 60e3)} minutes.`, locked: true, retryAfter: Math.ceil((f.until - Date.now()) / 1000) };
  const p = personByEmail(key);
  const ok = !!p && typeof pw === "string" && crypto.timingSafeEqual(Buffer.from(p.password.hash, "hex"), crypto.scryptSync(pw, p.password.salt, 32));
  if (ok) { loginFails.delete(key); return { person: p }; }
  f.n += 1; if (f.n >= 10) { f.until = Date.now() + 15 * 60e3; f.n = 0; }
  loginFails.set(key, f);
  return { error: "login", message: "That email and password don't match an account." };
}
export function ageSession(sid, ms) { const s = sessions.get(sid); if (s) { s.at -= ms; if (s.stepUpUntil) s.stepUpUntil -= ms; } }
export const stepUpLeft = (req) => { const s = sessions.get(cookie(req, COOKIE) || ""); return s ? Math.max(0, s.stepUpUntil - Date.now()) : 0; };
export function stepUp(sid) { const s = sessions.get(sid); if (s) s.stepUpUntil = Date.now() + STEP_UP_MS; }
export const steppedUp = (req) => { const s = sessions.get(cookie(req, COOKIE) || ""); return !!s && s.stepUpUntil > Date.now(); };
export const endSession = (sid) => sessions.delete(sid);
// When an agent reaches a step only its person can take (a limit, the price ceiling, a permission), its error carries
// askPerson: a one-time link (24 h) for the agent to show its person. Opening it signs the person in on the website and
// lands on that setting; nothing is changed until the person changes it there. (In this demo anyone can sign in as a
// demo person anyway; a real deployment puts the person's own login in front of this link.)
const links = new Map();
export function personLink(personId, { to = "/connect#limits", what = "", hours = 24, limit = null, wouldBe = null, current = null, job = null } = {}) {
  const code = crypto.randomBytes(18).toString("base64url"), expires = new Date(Date.now() + hours * 3600e3).toISOString();
  const need = { limit, wouldBe, current, job };
  links.set(sha(code), { person: personId, to: String(to).startsWith("/") ? to : "/", what: String(what).slice(0, 200), expires, used: false, ...need });
  // url is the website's page (it shows what was asked first; approving there is the person's own click); api is the
  // plain redirect for clients without that page
  return { url: `/link?code=${code}`, what, to, expires, oneUse: true, ...need, tell: "Show this link to your person: it opens the website, shows what you asked, and they sign in with their own PIN (you don't have it) and change it themselves if they agree." };
}
export function peekLink(code) { const l = links.get(sha(String(code || ""))); return !l || l.used || Date.parse(l.expires) < Date.now() ? null : l; }
export function redeemLink(code) {
  const l = peekLink(code);
  if (!l) return null;
  l.used = true;
  return l;
}
const cookie = (req, k) => (req.headers.cookie || "").split(/;\s*/).map((c) => c.split("=")).find(([n]) => n === k)?.[1];
export function sessionOf(req) { const s = sessions.get(cookie(req, COOKIE) || ""); return s ? { person: s.person, sid: cookie(req, COOKIE) } : null; }

// What each scope allows
export const SCOPES = ["read", "hire", "pay"];
const NEEDS = { whoami: "read", my_limits: "read", my_jobs: "read", job_status: "read", list_offers: "read", wait_for_news: "read",
  post_job: "hire", request_offers: "hire", counter_offer: "hire", accept_offer: "hire", approve_change: "hire", approve_materials_advance: "hire", get_report: "read", decline_materials_advance: "hire", decline_change: "hire", cancel_job: "hire",
  release: "pay", request_fix: "pay", open_dispute: "pay", claim_defect: "pay", confirm_checks: "pay", retry_hold: "hire", set_options: "hire", review_scope: "read", job_evidence: "read", apply_scope_suggestion: "hire",
  tip: "pay", reschedule: "hire", answer_reschedule: "hire", hold_options: "read", mandate_template: "read", my_inbox: "read", tenant_note: "hire", suggest_offer: "hire",
  my_home: "read", maintenance_suggestions: "read", accept_suggestion: "hire", list_groups: "read", join_group: "hire", open_group: "hire" };
export const needs = (tool) => NEEDS[tool] || "hire";
export const can = (a, tool) => !a?.scopes || a.scopes.includes(needs(tool));
export const scopeError = (tool) => ({ error: "scope", message: `This agent's token doesn't have the "${needs(tool)}" scope: its person chose its scopes on the website (Connect your agent). Ask them for a token with that scope.` });

export function makeToken(personId, label, { scopes = SCOPES, days = 90, key = null, requireMandate = false } = {}) {
  const secret = `done_${crypto.randomBytes(24).toString("base64url")}`;
  const sc = SCOPES.filter((s) => (Array.isArray(scopes) ? scopes : SCOPES).includes(s));
  const t = { id: `tok_${crypto.randomBytes(4).toString("hex")}`, hash: sha(secret), person: personId, label: String(label || "My agent").slice(0, 40), created: new Date().toISOString(), lastUsed: null, revoked: false, hint: secret.slice(0, 9),
    scopes: sc.length ? sc : ["read"], expires: new Date(Date.now() + Math.min(365, Math.max(1, +days || 90)) * 864e5).toISOString(), key: validKey(key), ...(requireMandate ? { requireMandate: true } : {}) };
  db.data.tokens.push(t); db.save();
  return { ...view(t), token: secret };
}
const view = (t) => ({ id: t.id, label: t.label, hint: `${t.hint}…`, created: t.created, lastUsed: t.lastUsed, revoked: t.revoked, scopes: t.scopes || SCOPES, expires: t.expires || null, signed: !!t.key, requireMandate: !!t.requireMandate });
// an Ed25519 public key as a JWK's "x" (base64url, 32 bytes), or null
function validKey(k) { const x = typeof k === "string" ? k : k?.x; return typeof x === "string" && Buffer.from(x, "base64url").length === 32 ? x : null; }
export const tokensOf = (personId) => db.data.tokens.filter((t) => t.person === personId && !t.revoked && !(t.expires && Date.parse(t.expires) < Date.now())).map(view);
export function revoke(personId, id) {
  const t = db.data.tokens.find((x) => x.id === id && x.person === personId);
  if (!t) return false;
  t.revoked = true; db.save(); return true;
}

// the agent behind a request: { person, client, token, scopes } or null. Worked out once per request (a signed
// request's signature is accepted only once, so a second look would see a replay)
export function agentOf(req) {
  if (req && "_agent" in req) return req._agent;
  const a = agentOfOnce(req);
  if (req) req._agent = a;
  return a;
}
function agentOfOnce(req) {
  const m = String(req.headers.authorization || "").match(/^Bearer\s+(done_[\w-]+)$/);
  if (!m) return null;
  const t = db.data.tokens.find((x) => x.hash === sha(m[1]) && !x.revoked);
  if (!t) return null;
  const now = Date.now();
  if (t.expires && Date.parse(t.expires) < now) return null;
  if (t.key && !signedBy(req, t.key)) return null;
  if (person(t.person)?.role && !["customer", "landlord"].includes(person(t.person).role)) return null;
  if (!t.lastUsed || now - Date.parse(t.lastUsed) > 60e3) { t.lastUsed = new Date(now).toISOString(); db.save(); }
  return { person: t.person, client: t.key ? `${t.label}, signed` : t.label, token: t.id, scopes: t.scopes || SCOPES, requireMandate: !!t.requireMandate };
}

// HTTP Message Signatures (RFC 9421), as Web Bot Auth uses them: the request must carry Signature-Input and Signature
// covering at least "@method", "@authority", "@path" and, with a body, "content-digest" (RFC 9530, sha-256 of the exact
// bytes received); created within the last five minutes; alg ed25519; signed by the token's key.
// A signature is accepted once: the same signature again within its five minutes is a replay.
const seen = new Map();
const firstTime = (sig) => { const t = Date.now(); for (const [k, at] of seen) if (t - at > 310e3) seen.delete(k); if (seen.has(sig)) return false; seen.set(sig, t); return true; };
export function signedBy(req, x) {
  const input = String(req.headers["signature-input"] || ""), sigHeader = String(req.headers.signature || "");
  const m = input.match(/^([\w-]+)=\(([^)]*)\)((?:;[\w-]+=(?:"[^"]*"|\d+))*)$/);
  if (!m) return false;
  const label = m[1], fields = [...m[2].matchAll(/"([^"]+)"/g)].map((f) => f[1]), params = Object.fromEntries([...m[3].matchAll(/;([\w-]+)=("([^"]*)"|\d+)/g)].map((p) => [p[1], p[3] ?? +p[2]]));
  const need = ["@method", "@authority", "@path", ...(req.rawBody?.length ? ["content-digest"] : [])];
  if (!need.every((f) => fields.includes(f)) || (params.alg && params.alg !== "ed25519") || !(Math.abs(Date.now() / 1000 - params.created) < 300)) return false;
  if (req.rawBody?.length && req.headers["content-digest"] !== `sha-256=:${crypto.createHash("sha256").update(req.rawBody).digest("base64")}:`) return false;
  const value = (f) => (f === "@method" ? req.method : f === "@authority" ? req.headers.host : f === "@path" ? req.originalUrl.split("?")[0] : f === "@query" ? `?${req.originalUrl.split("?")[1] || ""}` : f.startsWith("@") ? null : req.headers[f]);
  if (fields.some((f) => value(f) == null)) return false;
  const base = [...fields.map((f) => `"${f}": ${value(f)}`), `"@signature-params": (${fields.map((f) => `"${f}"`).join(" ")})${m[3]}`].join("\n");
  const sig = sigHeader.match(new RegExp(`(?:^|,\\s*)${label}=:([A-Za-z0-9+/=]+):`));
  if (!sig) return false;
  try { return crypto.verify(null, Buffer.from(base), crypto.createPublicKey({ key: { kty: "OKP", crv: "Ed25519", x }, format: "jwk" }), Buffer.from(sig[1], "base64")) && firstTime(sig[1]); } catch { return false; }
}
