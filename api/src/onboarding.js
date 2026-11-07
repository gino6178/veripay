// A pro as a PayPal merchant of their own (PayPal multiparty: Partner Referrals v2). The pro, on the website with
// their PIN, starts PayPal's onboarding; PayPal sends them back and we read their merchant status from PayPal:
//   started  -> PayPal's onboarding link is out (action_url), nothing found at PayPal yet
//   linked   -> PayPal knows the merchant but can't take payments yet (email unconfirmed, or no consent)
//   ready    -> payments_receivable, email confirmed, VeriPay granted PAYMENT/REFUND/PARTNER_FEE
// When ready, the pro's holds go to the pro as the order's payee (by merchant id) with VeriPay's fee as platform_fees,
// and no Payouts are needed. If PayPal refuses that order (this sandbox app isn't an approved Commerce Platform
// partner), the hold falls back to the platform flow and says so (jobs.js). The stand-in onboards at once.
import { pp, publicUrl, why } from "./pay/index.js";
import * as pros from "./pros.js";
import { record } from "./activity.js";

export const RETURN_PATH = "/api/pro/paypal-onboarding/return";
const trackingOf = (p) => `veripay-${p.id}`.replace(/[^A-Za-z0-9-]/g, "").slice(0, 127);

export async function start(proId, personId) {
  const p = pros.pro(proId);
  if (!p) return { error: "pro", message: "No such pro." };
  if (p.merchant?.status === "ready") return { error: "state", message: "You're already set up as a PayPal merchant." };
  const trackingId = trackingOf(p);
  let r;
  // PayPal's form prefilled with the business name and the pro's language
  try { r = await pp().partnerReferral({ trackingId, email: p.paypal?.email || null, returnUrl: publicUrl() + RETURN_PATH, business: p.name, language: p.lang === "es" ? "es-US" : "en-US" }); } catch (e) { return { error: "paypal", message: why(e) }; }
  if (!r.actionUrl) return { error: "paypal", message: "PayPal gave no onboarding link." };
  pros.setMerchant(proId, { trackingId, status: "started", actionUrl: r.actionUrl, referralId: r.referralId || null, startedAt: new Date().toISOString(), by: personId });
  return { url: r.actionUrl, mode: pp().mode, note: pp().mode === "mock" ? "The stand-in onboards you at once." : "Finish PayPal's sign-up as a business; you come back here." };
}

export async function sync(proId, { fromPayPal = null } = {}) {
  const p = pros.pro(proId);
  if (!p?.merchant?.trackingId) return { error: "state", message: "Start PayPal's onboarding first." };
  let s;
  try { s = await pp().merchantStatus({ trackingId: p.merchant.trackingId, merchantId: p.merchant.merchantId || fromPayPal?.merchantIdInPayPal || null }); }
  catch (e) { pros.setMerchant(proId, { ...p.merchant, checkedAt: new Date().toISOString(), paypalSays: why(e) }); return { error: "paypal", message: why(e) }; }
  const was = p.merchant.status;
  const m = { ...p.merchant, checkedAt: new Date().toISOString(), paypalSays: null, ...(fromPayPal ? { returned: { permissionsGranted: fromPayPal.permissionsGranted ?? null, consentStatus: fromPayPal.consentStatus ?? null, at: new Date().toISOString() } } : {}) };
  if (!s.found) m.status = "started";
  else Object.assign(m, { merchantId: s.merchantId, receivable: s.receivable, emailConfirmed: s.emailConfirmed, consented: s.consented, products: s.products, status: s.receivable && s.emailConfirmed && s.consented ? "ready" : "linked" });
  pros.setMerchant(proId, m);
  if (m.status !== was && p.person) record({ actor: { kind: "paypal" }, who: [p.person], action: "merchant_onboarding", summary: m.status === "ready" ? "PayPal: you're set up as a merchant. Customers' holds now go to your PayPal, with VeriPay's fee taken by PayPal." : m.status === "linked" ? `PayPal knows your merchant account but can't take payments yet${!m.emailConfirmed ? ": confirm your email at PayPal" : !m.consented ? ": VeriPay wasn't granted permissions" : ""}.` : "PayPal's onboarding isn't finished." });
  return view(pros.pro(proId));
}
export const merchantPayee = (p) => (p?.merchant?.status === "ready" && p.merchant.merchantId ? p.merchant.merchantId : null);
export function view(p) {
  const m = p?.merchant;
  // PayPal holds a payment to a merchant that hasn't finished onboarding, and returns it to the buyer after 30 days
  const firstPayment = "Until PayPal's onboarding is finished, a payment to your merchant account stays pending, and PayPal returns it to the customer after 30 days; VeriPay keeps paying you with Payouts until you're ready.";
  if (!m) return { status: "none", says: "Not a PayPal merchant with VeriPay: you're paid with Payouts.", firstPayment };
  return { firstPayment, referralId: m.referralId || null, status: m.status, merchantId: m.merchantId ? `${m.merchantId.slice(0, 4)}…` : null, receivable: m.receivable ?? null, emailConfirmed: m.emailConfirmed ?? null, consented: m.consented ?? null, products: m.products || [], startedAt: m.startedAt, checkedAt: m.checkedAt || null, paypalSays: m.paypalSays || null,
    says: { started: "PayPal's onboarding isn't finished: open it again, or check after you've finished.", linked: "PayPal found your merchant account, but it can't take payments yet.", ready: "Ready: customers' holds go to your PayPal; PayPal takes VeriPay's fee (platform_fees). No Payouts." }[m.status] };
}
