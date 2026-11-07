// AP2-style signed mandates (PLAN §15 item 2): before an agent moves its person's money (hiring and holding, approving a
// change order, confirming or releasing, a materials advance, a tip), it shows a mandate the PERSON signed:
//   payload: { type: "DoneMandate", version: 1, payer: <person id>, agentClient: <the agent's token id, tok_...>,
//              maxAmount: <USD>, currency: "USD", scope: ["hold" | "approve_change" | "confirm" | "release" |
//              "materials_advance" | "tip"], merchant: "VeriPay", jobId: <job id> | null, expires: <ISO>, nonce }
//   signature: Ed25519 over the payload's canonical JSON (keys sorted, no spaces; merkle.js canonical), base64url
// The server checks the signature (the person's own registered key, or for the demo the per-person key the server
// holds and signs with only after the person's PIN step-up), the payer and agent, the scope, the amount, the job, the
// expiry, and that the nonce was never used. Every mandate used or refused is kept here and goes into a signed receipt,
// so it lands in the transparency log (receipts.js batches) and can be audited later.
// Like AP2's "intent mandate": what the person allowed, in their own signature; the platform never signs for them
// except through the labelled demo path.
import crypto from "node:crypto";
import { store, stateFile } from "../store.js";
import { canonical, sha256 } from "./merkle.js";
import * as receipts from "./receipts.js";
import { person, peopleStore } from "../people.js";

const db = store(stateFile("mandates"), { mandates: [], nonces: {} });
const keyDb = store(stateFile("mandate-server-keys"), { keys: {} }); // the demo path's private keys: never in any response
export const mandatesStore = db;
const save = () => db.save();
export const MERCHANT = "VeriPay";
export const SCOPES = ["hold", "approve_change", "confirm", "release", "materials_advance", "tip"];
// which scope each money-moving tool needs
export const ACTION_SCOPE = { accept_offer: "hold", approve_change: "approve_change", confirm_checks: "confirm", release: "release", approve_materials_advance: "materials_advance", tip: "tip" };
export const MAX_DAYS = 30;
const b64u = (b) => Buffer.from(b).toString("base64url");
const validX = (x) => typeof x === "string" && Buffer.from(x, "base64url").length === 32;
export const payloadBytes = (p) => Buffer.from(canonical(p), "utf8");

// the person's own public keys (Ed25519 JWK "x"), registered on the website with the PIN
export function addKey(personId, { x, label = "my key" } = {}) {
  const p = person(personId), xx = typeof x === "string" ? x : x?.x;
  if (!p) return { error: "person", message: "No such person." };
  if (!validX(xx)) return { error: "key", message: "key is an Ed25519 public key as a JWK's x (base64url, 32 bytes)." };
  const kid = `mk_${sha256(xx).slice(0, 12)}`;
  p.mandateKeys = [...(p.mandateKeys || []).filter((k) => k.kid !== kid), { kid, x: xx, label: String(label).slice(0, 40), created: new Date().toISOString() }];
  peopleStore.save();
  return { kid, x: xx, label: String(label).slice(0, 40) };
}
export function removeKey(personId, kid) { const p = person(personId); if (!p?.mandateKeys) return false; const n = p.mandateKeys.length; p.mandateKeys = p.mandateKeys.filter((k) => k.kid !== kid); peopleStore.save(); return p.mandateKeys.length < n; }
// the demo path: one Ed25519 key per person, held by the server, used only by issueForPerson (after a PIN step-up)
function serverKey(personId) {
  let k = keyDb.data.keys[personId];
  if (!k) {
    const { privateKey, publicKey } = crypto.generateKeyPairSync("ed25519");
    k = keyDb.data.keys[personId] = { private: privateKey.export({ format: "jwk" }), x: publicKey.export({ format: "jwk" }).x, kid: `sk_${crypto.randomBytes(5).toString("hex")}`, created: new Date().toISOString() };
    keyDb.save();
  }
  return k;
}
export const serverPublic = (personId) => { const k = serverKey(personId); return { kid: k.kid, x: k.x, label: "VeriPay's server-held demo key for this person (signs only after the person's PIN step-up on the website)" }; };
export const nonce = () => b64u(crypto.randomBytes(16));

// a payload to sign, filled in and checked; amounts in USD as everywhere an amount is sent
export function template({ payer, agentClient, maxAmount, scope, jobId = null, minutes = 60, expires = null } = {}) {
  const sc = [...new Set((Array.isArray(scope) ? scope : [scope]).map((s) => ACTION_SCOPE[s] || s))].filter(Boolean);
  if (!sc.length || sc.some((s) => !SCOPES.includes(s))) return { error: "scope", message: `scope is a list of: ${SCOPES.join(", ")}.` };
  const amt = +maxAmount;
  if (!(amt > 0 && amt <= 20000)) return { error: "maxAmount", message: "maxAmount is USD, more than 0 and at most 20,000." };
  const exp = expires ? Date.parse(expires) : Date.now() + Math.max(1, Math.min(MAX_DAYS * 1440, +minutes || 60)) * 60e3;
  if (!Number.isFinite(exp) || exp <= Date.now() || exp > Date.now() + MAX_DAYS * 864e5 + 60e3) return { error: "expires", message: `expires is in the future, at most ${MAX_DAYS} days away.` };
  return { type: "DoneMandate", version: 1, payer, agentClient, maxAmount: Math.round(amt * 100) / 100, currency: "USD", scope: sc, merchant: MERCHANT, jobId: jobId || null, expires: new Date(exp).toISOString(), nonce: nonce() };
}
// the demo path: the website issues a mandate for the person's agent, signed with the server-held key for this person.
// The caller (server.js) has already required the person's session and a fresh PIN step-up.
export function issueForPerson(personId, args) {
  const p = template({ ...args, payer: personId });
  if (p.error) return p;
  const k = serverKey(personId), signature = b64u(crypto.sign(null, payloadBytes(p), crypto.createPrivateKey({ key: k.private, format: "jwk" })));
  const m = { payload: p, signature, kid: k.kid };
  record({ m, status: "issued", personId, signedBy: "server-held demo key", note: "issued on the website after the person's PIN step-up" });
  return { mandate: m, signedBy: "server-held demo key", label: "Demo: signed by VeriPay's server-held key for you, only after your PIN step-up. With your own key, sign the payload yourself (POST /api/mandates/keys registers it).", hash: sha256(canonical(m)) };
}

// is this mandate good for this action? { ok, mandate, hash, signedBy } or { error: "mandate", reason, message }
export function check(m, { payer, agentClient, action, amount, jobId = null }) {
  const bad = (reason, message) => ({ error: "mandate", reason, message: `Mandate refused: ${message}` });
  if (!m || typeof m !== "object" || !m.payload || typeof m.signature !== "string") return bad("shape", "send mandate: { payload, signature, kid? } (see mandate_template).");
  const p = m.payload, need = ACTION_SCOPE[action];
  if (p.type !== "DoneMandate" || p.version !== 1) return bad("type", "payload.type is \"DoneMandate\", version 1.");
  if (p.merchant !== MERCHANT) return bad("merchant", `the merchant is "${MERCHANT}".`);
  if (p.payer !== payer) return bad("payer", "it was signed for another person.");
  if (p.agentClient !== agentClient) return bad("agent", "it names another agent (agentClient is your token's id, from whoami).");
  if (!need || !Array.isArray(p.scope) || !p.scope.includes(need)) return bad("scope", `it doesn't allow "${need}" (scope: ${(p.scope || []).join(", ") || "none"}).`);
  const exp = Date.parse(p.expires);
  if (!Number.isFinite(exp) || exp <= Date.now()) return bad("expired", "it has expired.");
  if (exp > Date.now() + MAX_DAYS * 864e5 + 60e3) return bad("expires", `it lasts more than ${MAX_DAYS} days.`);
  if (p.jobId && p.jobId !== jobId) return bad("job", "it is for another job.");
  if (!(+p.maxAmount > 0) || Math.round(+p.maxAmount * 100) < amount) return bad("amount", `this needs $${(amount / 100).toFixed(2)}, more than its maxAmount ($${(+p.maxAmount || 0).toFixed(2)}).`);
  if (typeof p.nonce !== "string" || p.nonce.length < 8) return bad("nonce", "nonce is a random string (at least 8 characters).");
  if (db.data.nonces[p.nonce]) return bad("replay", "its nonce was already used: a mandate is good for one action.");
  const who = person(payer), bytes = payloadBytes(p), sig = Buffer.from(m.signature, "base64url");
  const tries = [...(who?.mandateKeys || []).map((k) => ({ kid: k.kid, x: k.x, signedBy: `the person's own key (${k.label})` })), ...(keyDb.data.keys[payer] ? [{ kid: keyDb.data.keys[payer].kid, x: keyDb.data.keys[payer].x, signedBy: "server-held demo key" }] : [])];
  const hit = tries.find((k) => { try { return crypto.verify(null, bytes, crypto.createPublicKey({ key: { kty: "OKP", crv: "Ed25519", x: k.x }, format: "jwk" }), sig); } catch { return false; } });
  if (!hit) return bad("signature", "the signature doesn't verify with the person's registered keys.");
  return { ok: true, mandate: m, hash: sha256(canonical(m)), signedBy: hit.signedBy, kid: hit.kid };
}
// one use: the nonce is taken before the action runs, given back if the action didn't happen
export function reserve(c) { db.data.nonces[c.mandate.payload.nonce] = { at: new Date().toISOString(), hash: c.hash, status: "reserved" }; save(); }
export function release(c) { delete db.data.nonces[c.mandate.payload.nonce]; save(); }
export function used(c, { action, amount, jobId, result }) {
  db.data.nonces[c.mandate.payload.nonce] = { at: new Date().toISOString(), hash: c.hash, status: "used" };
  return record({ m: c.mandate, status: "used", personId: c.mandate.payload.payer, signedBy: c.signedBy, action, amount, jobId, result });
}
export function refused(m, why, { payer, action, amount, jobId }) { return record({ m, status: "refused", personId: payer, action, amount, jobId, reason: why.reason, note: why.message }); }
function record({ m, status, personId, signedBy = null, action = null, amount = null, jobId = null, result = null, reason = null, note = null }) {
  const hash = m?.payload ? sha256(canonical(m)) : null;
  const r = { id: `mdt_${crypto.randomBytes(5).toString("hex")}`, at: new Date().toISOString(), status, payer: personId, hash, payload: m?.payload || null, signature: m?.signature || null, kid: m?.kid || null, signedBy, action, amount, jobId, result, reason, note, receipt: null };
  // into a signed receipt, so the mandate is in the transparency log (facts only: the payload is the person's signed data)
  if (hash) { const rc = receipts.issue({ kind: "mandate", subject: jobId || personId, event: `mandate ${status}`, data: { mandateHash: hash, payload: m.payload, signature: m.signature, signedBy, action, amount, result: result ? String(result).slice(0, 80) : null, reason }, people: [personId] }); r.receipt = rc.id; }
  db.data.mandates.push(r);
  if (db.data.mandates.length > 5000) db.data.mandates.splice(0, db.data.mandates.length - 5000);
  save();
  return r;
}
export const mandatesOf = (personId) => db.data.mandates.filter((x) => x.payer === personId).slice(-100).reverse();
export const allMandates = () => db.data.mandates.slice(-200).reverse();
