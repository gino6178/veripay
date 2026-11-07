// Log in with PayPal for a pro's payout account (OpenID Connect, authorization-code flow): instead of typing an email,
// the pro signs in at PayPal and PayPal tells us which account it is.
//   start      the pro (the person, PIN-confirmed) asks: a one-use state (10 minutes) and PayPal's sign-in URL
//   callback   PayPal sends the pro back with a code: exchanged for a token (POST /v1/oauth2/token, authorization_code),
//              then GET /v1/identity/oauth2/userinfo?schema=paypalv1.1 → payer id, confirmed email, verified_account
// The payout PayPal becomes that account's confirmed primary email, marked as verified by PayPal, with its payer id.
// Sandbox: the app needs "Log in with PayPal" turned on and this return URL added in the PayPal developer dashboard.
// The stand-in signs the pro in at once (demo data) and says so.
import crypto from "node:crypto";
import { pp, publicUrl, why } from "./pay/index.js";
import * as pros from "./pros.js";
import { record } from "./activity.js";

export const RETURN_PATH = "/api/pro/paypal-login/callback";
const pending = new Map(); // state -> { proId, person, at }
const TTL = 10 * 60e3;

export function start(proId, person) {
  for (const [k, v] of pending) if (Date.now() - v.at > TTL) pending.delete(k);
  const state = crypto.randomBytes(18).toString("base64url");
  pending.set(state, { proId, person, at: Date.now() });
  const redirectUri = publicUrl() + RETURN_PATH;
  return { url: pp().loginUrl({ state, redirectUri }), redirectUri, mode: pp().mode,
    note: pp().mode === "mock" ? "The stand-in signs you in at once with demo data." : "Sign in at PayPal; you come back here. The app's return URL must be set in the PayPal developer dashboard." };
}

export async function callback({ code, state, error }) {
  const s = state && pending.get(state);
  if (!s) return { error: "state", message: "This sign-in link expired or was already used. Start again from Payouts." };
  pending.delete(state);
  if (Date.now() - s.at > TTL) return { error: "state", message: "This sign-in link expired. Start again from Payouts." };
  if (error || !code) return { error: "denied", message: "PayPal sign-in was cancelled." };
  let u;
  try { u = await pp().loginUserinfo({ code, redirectUri: publicUrl() + RETURN_PATH }); } catch (e) { return { error: "paypal", message: why(e) }; }
  const mail = (u.emails || []).find((e) => e.primary && e.confirmed) || (u.emails || []).find((e) => e.confirmed);
  if (!mail?.value) return { error: "email", message: "PayPal didn't share a confirmed email for that account; payouts need one." };
  const r = pros.setPayPalFromLogin(s.proId, { email: mail.value, payerId: u.payer_id || null, verifiedAccount: String(u.verified_account) === "true", demo: pp().mode === "mock" });
  if (r.error) return r;
  record({ actor: { kind: "person" }, who: [s.person], action: "payout_paypal_linked", summary: `Payout PayPal linked with Log in with PayPal${pp().mode === "mock" ? " (stand-in)" : ""}.`, ref: s.proId });
  return { ok: true, pro: s.proId, email: mail.value, payerId: u.payer_id || null, verifiedAccount: String(u.verified_account) === "true" };
}
