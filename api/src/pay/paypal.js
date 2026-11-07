// PayPal REST, sandbox only (this is a hackathon build). The calls VeriPay makes:
//   Orders v2, intent AUTHORIZE: the hold on a job. Charged to a saved payment method without a redirect (a PayPal
//     vault id or a card vault id, merchant-initiated), or, the first time, approved by the customer (redirect or the
//     JS SDK v6 buttons) with store_in_vault so the next holds need no approval
//   Authorizations: capture (full, or partial and final), void, reauthorize after the 3-day honor period
//   Orders v2, intent CAPTURE: the fallback (PLAN §12) when authorize isn't available: charge now, keep at the platform
//   Refunds: a partial refund on a capture (a dispute settled part-and-part)
//   Payouts: one batch per released job, one item per payee (the pro, the helper)
//   Invoicing, Disputes, Webhooks (verify; register only on a public https URL), the JS SDK client token
// Every POST carries a PayPal-Request-Id made from the job and the step, so a call repeated after a crash is the same
// call to PayPal, not a second charge.
const BASE = "https://api-m.sandbox.paypal.com";

// PayPal's published sandbox test card (developer.paypal.com/tools/sandbox/card-testing): a demo can hold money
// without anyone signing in to a sandbox buyer account. Sandbox only, and only with PAYPAL_TEST_CARD=1.
const sca = () => (["SCA_ALWAYS", "SCA_WHEN_REQUIRED", "off"].includes(process.env.PAYPAL_3DS) ? process.env.PAYPAL_3DS : "SCA_WHEN_REQUIRED");
const TEST_CARD = { number: "4012888888881881", expiry: "2030-12", security_code: "123", name: "Sandbox Test Payer" };

export const cents = (v) => (v == null || v === "" ? null : Math.round(+v * 100));
// "card:<id>" or "paypal:<id>" (a bare id is PayPal's)
export const vaultKind = (v) => (String(v).includes(":") ? String(v).split(":") : ["paypal", String(v)]);

export function paypal({ clientId, secret, brand = "VeriPay", testCard = false }) {
  let token = null, until = 0, merchant = null;
  const BN = process.env.PAYPAL_BN_CODE || "VeriPay_SP_PPCP_PLACEHOLDER";
  // PayPal-Auth-Assertion: an unsigned JWT naming this app (iss) and the merchant it acts for (payer_id)
  const b64u = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const assertion = (merchantId) => `${b64u({ alg: "none" })}.${b64u({ iss: clientId, payer_id: merchantId })}.`;
  async function auth() {
    if (token && Date.now() < until - 60e3) return token;
    const r = await fetch(`${BASE}/v1/oauth2/token`, { method: "POST", headers: { Authorization: `Basic ${Buffer.from(`${clientId}:${secret}`).toString("base64")}`, "Content-Type": "application/x-www-form-urlencoded" }, body: "grant_type=client_credentials", signal: AbortSignal.timeout(20e3) });
    if (!r.ok) throw new Error(`PayPal auth failed: ${r.status}`);
    const j = await r.json();
    token = j.access_token; until = Date.now() + j.expires_in * 1000;
    return token;
  }
  async function call(method, path, body, requestId, extra = {}) {
    // PayPal-Partner-Attribution-Id: the BN code PayPal gives a platform partner (PAYPAL_BN_CODE); a placeholder until it does
    const headers = { Authorization: `Bearer ${await auth()}`, "Content-Type": "application/json", Prefer: "return=representation", "PayPal-Partner-Attribution-Id": BN, ...extra };
    if (requestId) headers["PayPal-Request-Id"] = String(requestId).slice(0, 108);
    const r = await fetch(`${BASE}${path}`, { method, headers, body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body), signal: AbortSignal.timeout(25e3) });
    const text = await r.text();
    let j = {};
    try { j = text ? JSON.parse(text) : {}; } catch { j = { message: text.slice(0, 120) }; }
    if (!r.ok) { const e = new Error(`PayPal ${method} ${path.split("?")[0]}: ${r.status} ${j.name || ""} ${j.details?.[0]?.issue || j.message || ""}`.trim()); e.status = r.status; e.issue = j.details?.[0]?.issue || j.name || null; e.debugId = j.debug_id || null; throw e; }
    return j;
  }
  const link = (j, rel) => j.links?.find((l) => l.rel === rel)?.href || null;
  const money = (c, currency = "USD") => ({ currency_code: currency, value: (c / 100).toFixed(2) });
  // multiparty (behind DONE_MULTIPARTY=1): the pro is the payee of the order and the platform takes its fee through
// payment_instruction.platform_fees, so the money never sits with the platform. PayPal requires the payee to be
// onboarded to the platform as a partner merchant; see docs/API.md for what the sandbox answered.
// items: what the hold is for, shown on PayPal's approval page and the buyer's receipt (labor, parts, the change-order
// buffer), with amount.breakdown.item_total; sent only when they add up to the amount. level2: a card's Level 2 data
// (the invoice number and tax), which business cards are priced on.
const lineItems = (items, currency) => items.map((x) => ({ name: String(x.name).slice(0, 127), quantity: "1", unit_amount: money(x.amount, currency), ...(x.category ? { category: x.category } : {}), ...(x.description ? { description: String(x.description).slice(0, 127) } : {}),
  ...(x.sku ? { sku: String(x.sku).slice(0, 127) } : {}), ...(/^https:\/\//.test(x.url || "") ? { url: x.url } : {}) }));
// the job site on the order (shipping type PICKUP_IN_PERSON: nothing is shipped; the address is where the work is done),
// shown on PayPal's receipt and kept with the order for a dispute
const siteOf = (s) => (s ? { type: "PICKUP_IN_PERSON", name: { full_name: String(s.name || "Job site").slice(0, 300) }, address: { address_line_1: String(s.line1 || "Job site").slice(0, 300), admin_area_2: s.city || "Austin", admin_area_1: s.state || "TX", postal_code: String(s.zip), country_code: "US" } } : null);
// the sandbox takes the PICKUP_IN_PERSON shipping type only on a PayPal order the buyer approves; on a card, a saved
// PayPal or Venmo (vault_id) it answers UNSUPPORTED_SHIPPING_TYPE, so those orders go without the job site
const siteFor = (ps, site) => (ps?.paypal && !ps.paypal.vault_id ? site : null);
const itemsFit = (items, amount) => Array.isArray(items) && items.length > 0 && items.every((x) => x.amount > 0) && items.reduce((t, x) => t + x.amount, 0) === amount;
// invoiceId: the job number on the buyer's receipt; level3: a card's line-item data; ip: the buyer's address for risk
const unit = (reference, description, amount, currency, mp = null, { items = null, level2 = null, level3 = null, invoiceId = null, site = null, ip = null } = {}) => [{ reference_id: reference, custom_id: reference, description: String(description || "").slice(0, 127), soft_descriptor: "VERIPAY",
  ...(invoiceId ? { invoice_id: String(invoiceId).slice(0, 127) } : {}), ...(siteOf(site) ? { shipping: siteOf(site) } : {}),
  amount: itemsFit(items, amount) ? { ...money(amount, currency), breakdown: { item_total: money(amount, currency) } } : money(amount, currency),
  ...(itemsFit(items, amount) ? { items: lineItems(items, currency) } : {}),
  ...(level2 || ip ? { supplementary_data: { ...(level2 ? { card: { level_2: { invoice_id: String(level2.invoiceId).slice(0, 127), tax_total: money(level2.tax || 0, currency) },
    ...(level3 && itemsFit(items, amount) ? { level_3: { line_items: items.map((x) => ({ name: String(x.name).slice(0, 127), quantity: "1", unit_amount: money(x.amount, currency), unit_of_measure: "EACH", commodity_code: "73" })), shipping_amount: money(0, currency), duty_amount: money(0, currency), discount_amount: money(0, currency), ...(siteOf(site) ? { shipping_address: siteOf(site).address, ships_from_postal_code: String(site.zip) } : {}) } } : {}) } } : {}),
    ...(ip ? { risk: { customer: { ip_address: String(ip).slice(0, 39) } } } : {}) } } : {}),
  ...(mp ? { payee: mp.merchantId ? { merchant_id: mp.merchantId } : { email_address: mp.payee }, payment_instruction: { disbursement_mode: "INSTANT", platform_fees: [{ amount: money(mp.platformFee, currency) }] } } : {}) }];
  const authOf = (o) => o.purchase_units?.[0]?.payments?.authorizations?.[0] || null;
  // a card's processor response (the issuer's AVS and CVV answers), when PayPal gives one
  const proc = (a) => (a?.processor_response ? { avs: a.processor_response.avs_code || null, cvv: a.processor_response.cvv_code || null, response: a.processor_response.response_code || null } : null);
  // seller_protection (PayPal's Seller Protection for this payment), network_transaction_reference (the card network's
  // id, for the next merchant-initiated charge), status_details.reason (why a payment is PENDING or DENIED)
  const extra = (a) => ({ ...(a?.seller_protection ? { sellerProtection: { status: a.seller_protection.status, categories: a.seller_protection.dispute_categories || [] } } : {}), ...(a?.network_transaction_reference?.id ? { ntr: { id: a.network_transaction_reference.id, network: a.network_transaction_reference.network || null } } : {}), ...(a?.status_details?.reason ? { statusReason: a.status_details.reason } : {}) });
  const authView = (a) => (a ? { id: a.id, status: a.status, amount: cents(a.amount?.value), expiresAt: a.expiration_time || null, createdAt: a.create_time || null, ...(proc(a) ? { processor: proc(a) } : {}), ...extra(a) } : null);
  // the saved payment method an order carries (when it was vaulted with it), as "card:<id>" or "paypal:<id>"
  // what 3-D Secure said: liability shift (POSSIBLE / NO / UNKNOWN) and the issuer's enrollment and authentication status
  const threeDS = (a) => (a ? { liabilityShift: a.liability_shift || null, enrollment: a.three_d_secure?.enrollment_status || null, authentication: a.three_d_secure?.authentication_status || null } : null);
  const saved = (j) => {
    const src = j.payment_source?.paypal || j.payment_source?.card || j.payment_source?.venmo, v = src?.attributes?.vault, sh = j.purchase_units?.[0]?.shipping;
    return { vaultId: v?.id ? `${j.payment_source?.card ? "card" : j.payment_source?.venmo ? "venmo" : "paypal"}:${v.id}` : null,
      // the contact the payer confirmed or updated in PayPal (contact_preference UPDATE_CONTACT_INFO)
      ...(sh?.email_address || sh?.phone_number?.national_number ? { payerContact: { email: sh.email_address || null, phone: sh.phone_number?.national_number || null } } : {}), vaultStatus: v?.status || null, customerId: v?.customer?.id || null,
      payerEmail: j.payment_source?.paypal?.email_address || null, card: j.payment_source?.card ? { brand: j.payment_source.card.brand || null, last4: j.payment_source.card.last_digits || null } : null,
      threeDS: threeDS(j.payment_source?.card?.authentication_result) };
  };
  const captureView = (c) => {
    const b = c?.seller_receivable_breakdown;
    return c ? { id: c.id, status: c.status, amount: cents(c.amount?.value), fee: b?.paypal_fee ? cents(b.paypal_fee.value) : null, net: b?.net_amount ? cents(b.net_amount.value) : null, final: c.final_capture ?? null, ...extra(c), ...(b?.platform_fees?.length ? { platformFees: b.platform_fees.reduce((t, f) => t + cents(f.amount?.value), 0) } : {}) } : null;
  };
  // the payment source for a hold or a charge
  // ctx: locale (the approval page's language), landing (LOGIN or GUEST_CHECKOUT), ua (the buyer's browser: on a phone,
  // app_switch_context lets PayPal open its app), customerRef (VeriPay's person id on the vault record), ntr (the card
  // network's id of the first stored charge), site (the job site: the address PayPal shows, which the payer can't change)
  const mobile = (ua) => /iPhone|iPad|Android|Mobile/i.test(String(ua || ""));
  const custOf = (ref) => (ref ? { customer: { merchant_customer_id: String(ref).slice(0, 22) } } : {});
  function source({ vaultId, card, save, returnUrl, cancelUrl, intent, cardFields = false, bare = false, singleUseToken = null, venmo = false, ctx = {} }) {
    // DONE_ADDRESS_CALLBACK=1 (with a public https URL): the payer picks the job site from their PayPal addresses and
    // PayPal asks VeriPay (order-update callback) whether it's in the service area before they can approve
    const cb = process.env.DONE_ADDRESS_CALLBACK === "1" && /^https:\/\//.test(ctx.callbackBase || "");
    const ship = cb ? "GET_FROM_FILE" : ctx.site ? "SET_PROVIDED_ADDRESS" : "NO_SHIPPING";
    // Venmo approved in the Venmo app or page, saved in the vault like PayPal for the next holds
    if (venmo && !vaultId) return { venmo: { experience_context: { brand_name: brand, shipping_preference: cb ? ship : "NO_SHIPPING", user_action: intent === "CAPTURE" ? "PAY_NOW" : "CONTINUE", return_url: returnUrl, cancel_url: cancelUrl },
      ...(save ? { attributes: { ...custOf(ctx.customerRef), vault: { store_in_vault: "ON_SUCCESS", usage_type: "MERCHANT", permit_multiple_payment_tokens: false } } } : {}) } };
    // the card entered in PayPal's own card fields (JS SDK v6 card-fields): the order says only how to treat the card;
    // the fields attach the number in the browser and submit the order (with 3-D Secure when the bank asks)
    if (cardFields) { const SCA = sca(); return { card: { attributes: { ...(save ? { vault: { store_in_vault: "ON_SUCCESS" } } : {}), verification: { method: SCA === "off" ? "SCA_WHEN_REQUIRED" : SCA } }, experience_context: { return_url: returnUrl, cancel_url: cancelUrl } } }; }
    // Google Pay (v6 googlepay-payments): no payment source on the order; the browser confirms it with Google Pay's token
    if (bare) return undefined;
    // Fastlane: the single-use token Fastlane gave the browser for the guest's card
    if (singleUseToken) return { card: { single_use_token: singleUseToken, attributes: { ...(save ? { vault: { store_in_vault: "ON_SUCCESS" } } : {}) } } };
    if (vaultId) {
      const [kind, id] = vaultKind(vaultId);
      // a saved card charged by the platform when the customer isn't there: merchant-initiated, unscheduled
      // (with the first charge's network id when we have it, so the network links this charge to the customer's consent)
      if (kind === "card") return { card: { vault_id: id, stored_credential: { payment_initiator: "MERCHANT", payment_type: "UNSCHEDULED", usage: "SUBSEQUENT", ...(ctx.ntr?.id ? { previous_network_transaction_reference: { id: ctx.ntr.id, ...(ctx.ntr.network ? { network: ctx.ntr.network } : {}) } } : {}) } } };
      // a saved PayPal or Venmo charged by the platform: merchant-initiated, unscheduled, after the job (postpaid)
      return kind === "venmo" ? { venmo: { vault_id: id } } : { paypal: { vault_id: id, stored_credential: { payment_initiator: "MERCHANT", usage_pattern: "UNSCHEDULED_POSTPAID", usage: "SUBSEQUENT" } } };
    }
    // 3-D Secure (PAYPAL_3DS: SCA_WHEN_REQUIRED by default, SCA_ALWAYS to always ask, off): PayPal answers
    // PAYER_ACTION_REQUIRED with a verification page when the issuer wants it; after it, the order is authorized as usual
    const SCA = sca();
    // a card saved on its first use: customer-initiated, the first of unscheduled charges (the next ones refer to it)
    if (card && testCard) return { card: { ...TEST_CARD, ...(ctx.cardName ? { name: ctx.cardName } : {}), ...(save ? { stored_credential: { payment_initiator: "CUSTOMER", payment_type: "UNSCHEDULED", usage: "FIRST" } } : {}), attributes: { ...(save ? { ...custOf(ctx.customerRef), vault: { store_in_vault: "ON_SUCCESS" } } : {}), ...(SCA !== "off" ? { verification: { method: SCA } } : {}) }, ...(SCA !== "off" ? { experience_context: { return_url: returnUrl, cancel_url: cancelUrl } } : {}) } };
    // IMMEDIATE_PAYMENT_REQUIRED: no eCheck (it funds days later, too late for a hold); app_switch_context (Orders v2's
    // App Switch field) only for a phone's browser
    return { paypal: { experience_context: { brand_name: brand, shipping_preference: ship, user_action: intent === "CAPTURE" ? "PAY_NOW" : "CONTINUE", return_url: returnUrl, cancel_url: cancelUrl, contact_preference: "UPDATE_CONTACT_INFO", payment_method_preference: "IMMEDIATE_PAYMENT_REQUIRED",
      ...(cb ? { order_update_callback_config: { callback_url: `${ctx.callbackBase}/api/paypal/order-update-callback`, callback_events: ["SHIPPING_ADDRESS"] } } : {}), ...(ctx.locale ? { locale: ctx.locale } : {}), ...(ctx.landing ? { landing_page: ctx.landing } : {}), ...(mobile(ctx.ua) ? { app_switch_context: { mobile_web: { return_flow: "AUTO", buyer_user_agent: String(ctx.ua).slice(0, 400) } } } : {}) },
      ...(save ? { attributes: { ...custOf(ctx.customerRef), vault: { store_in_vault: "ON_SUCCESS", usage_type: "MERCHANT", usage_pattern: "UNSCHEDULED_POSTPAID", customer_type: "CONSUMER", permit_multiple_payment_tokens: false } } } : {}) } };
  }

  const products = {}; // the catalog products maintenance plans are billed under, by name (Subscriptions)
  const sharedPlans = {}; // shared billing plans, by name
  return {
    mode: "sandbox", testCard,
    // the OAuth access token, for the PayPal Agent Toolkit (recon.js) to use the same app
    accessToken: auth,
    // ---- the hold -----------------------------------------------------------------------------------------------
    // Orders v2 intent AUTHORIZE. With vaultId (or the test card) PayPal authorizes at once: authorization is set.
    // Otherwise the customer approves (approveUrl, or the JS SDK with the order id), then authorizeOrder.
    async authorize({ amount, currency = "USD", reference, description, vaultId = null, card = false, save = true, returnUrl, cancelUrl, requestId, multiparty = null, cmid = null, cardFields = false, bare = false, singleUseToken = null, venmo = false, items = null, level2 = null, ctx = {} }) {
      const payment_source = source({ vaultId, card, save, returnUrl, cancelUrl, intent: "AUTHORIZE", cardFields, bare, singleUseToken, venmo, ctx });
      let j = await call("POST", "/v2/checkout/orders", { intent: "AUTHORIZE", purchase_units: unit(reference, description, amount, currency, multiparty, { items, level2: payment_source?.card ? level2 : null, level3: !!payment_source?.card, invoiceId: ctx.invoiceId, site: siteFor(payment_source, ctx.site), ip: ctx.ip }), payment_source }, requestId, cmid ? { "PayPal-Client-Metadata-Id": cmid } : {});
      if (j.purchase_units?.[0]?.payee?.merchant_id) merchant ||= j.purchase_units[0].payee.merchant_id;
      // (a card or vaulted order may come back APPROVED but not yet authorized)
      if (!authOf(j) && j.status === "APPROVED") j = await call("POST", `/v2/checkout/orders/${j.id}/authorize`, {}, `${requestId}:auth`);
      return { id: j.id, status: j.status, approveUrl: link(j, "payer-action") || link(j, "approve"), authorization: authView(authOf(j)), ...saved(j) };
    },
    // an order the customer approved (redirect or JS SDK): authorize it; the vault id comes back with it
    async authorizeOrder(id, requestId) {
      const j = await call("POST", `/v2/checkout/orders/${id}/authorize`, {}, requestId);
      return { id: j.id, status: j.status, authorization: authView(authOf(j)), ...saved(j) };
    },
    // a new amount for an order the customer hasn't authorized yet (CREATED or APPROVED): PATCH, same order, same link
    async updateOrderAmount(id, { amount, reference, currency = "USD", items = null }) {
      const at = `/purchase_units/@reference_id=='${reference}'`, fit = itemsFit(items, amount);
      await call("PATCH", `/v2/checkout/orders/${id}`, [{ op: "replace", path: `${at}/amount`, value: fit ? { ...money(amount, currency), breakdown: { item_total: money(amount, currency) } } : money(amount, currency) }, ...(fit ? [{ op: "replace", path: `${at}/items`, value: lineItems(items, currency) }] : [])]);
      const j = await call("GET", `/v2/checkout/orders/${id}`);
      return { id: j.id, status: j.status, amount: cents(j.purchase_units?.[0]?.amount?.value) };
    },
    // shipment tracking on a captured order (Orders v2 track): the parts a pro had shipped for the job
    async addTracking(orderId, { captureId, carrier, trackingNumber, notifyPayer = false }) {
      const j = await call("POST", `/v2/checkout/orders/${orderId}/track`, { capture_id: captureId, tracking_number: trackingNumber, carrier, notify_payer: notifyPayer });
      return { id: j.id || null, status: j.status || null, trackers: (j.purchase_units?.[0]?.shipping?.trackers || []).map((t) => ({ id: t.id, status: t.status })) };
    },
    // other fields of an order the customer hasn't approved yet (PATCH): its description after a scope change, the job number
    async patchOrder(id, { reference, description = null, invoiceId = null }) {
      const at = `/purchase_units/@reference_id=='${reference}'`;
      const ops = [...(description ? [{ op: "replace", path: `${at}/description`, value: String(description).slice(0, 127) }] : []), ...(invoiceId ? [{ op: "add", path: `${at}/invoice_id`, value: String(invoiceId).slice(0, 127) }] : [])];
      if (ops.length) await call("PATCH", `/v2/checkout/orders/${id}`, ops);
      return { patched: ops.map((o) => o.path.split("/").pop()) };
    },
    // the same order, paid another way: confirm-payment-source puts the (sandbox test) card on the order the customer
    // was asked to approve, so its id, items and approval link stay; then it's authorized as usual
    async confirmCard(id, requestId) {
      if (!testCard) throw new Error("PayPal: the test card is off on this server");
      await call("POST", `/v2/checkout/orders/${id}/confirm-payment-source`, { payment_source: { card: TEST_CARD } }, `${requestId}:confirm`);
      const j = await call("POST", `/v2/checkout/orders/${id}/authorize`, {}, `${requestId}:authorize`);
      return { id: j.id, status: j.status, authorization: authView(authOf(j)), ...saved(j) };
    },
    // a parts shipment's tracker corrected or withdrawn (PATCH /v2/checkout/orders/{id}/trackers/{tracker})
    async updateTracker(orderId, trackerId, { status = null, trackingNumber = null, carrier = null, notifyPayer = null }) {
      const ops = [...(status ? [{ op: "replace", path: "/status", value: status }] : []), ...(trackingNumber ? [{ op: "replace", path: "/tracking_number", value: trackingNumber }] : []), ...(carrier ? [{ op: "replace", path: "/carrier", value: carrier }] : []), ...(notifyPayer != null ? [{ op: "replace", path: "/notify_payer", value: !!notifyPayer }] : [])];
      await call("PATCH", `/v2/checkout/orders/${orderId}/trackers/${trackerId}`, ops);
      return { id: trackerId, status: status || "SHIPPED" };
    },
    async getOrder(id) {
      const j = await call("GET", `/v2/checkout/orders/${id}`);
      return { id: j.id, status: j.status, intent: j.intent, authorization: authView(authOf(j)), payerId: j.payer?.payer_id || null, ...saved(j) };
    },
    async getAuthorization(id) {
      const j = await call("GET", `/v2/payments/authorizations/${id}`);
      return authView(j);
    },
    // capture all or part of a hold; final: true releases what's left of it (an unused buffer is never captured)
    // softDescriptor: the card statement text for this capture (e.g. "VERIPAY M2", the milestone)
    async capture(authorizationId, { amount, currency = "USD", final = true, invoiceId, note, requestId, platformFee = null, delayed = false, softDescriptor = null }) {
      const j = await call("POST", `/v2/payments/authorizations/${authorizationId}/capture`, { amount: money(amount, currency), final_capture: final, ...(invoiceId ? { invoice_id: invoiceId } : {}), ...(softDescriptor ? { soft_descriptor: String(softDescriptor).slice(0, 22) } : {}), ...(note ? { note_to_payer: String(note).slice(0, 255) } : {}), ...(platformFee != null ? { payment_instruction: { disbursement_mode: delayed ? "DELAYED" : "INSTANT", platform_fees: [{ amount: money(platformFee, currency) }] } } : {}) }, requestId);
      return captureView(j);
    },
    async getCapture(id) { return captureView(await call("GET", `/v2/payments/captures/${id}`)); },
    async voidAuthorization(authorizationId, requestId) {
      await call("POST", `/v2/payments/authorizations/${authorizationId}/void`, undefined, requestId);
      return { status: "VOIDED" };
    },
    // a new authorization for the same order, after the 3-day honor period (days 4 to 29), once
    async reauthorize(authorizationId, { amount, currency = "USD", requestId }) {
      const j = await call("POST", `/v2/payments/authorizations/${authorizationId}/reauthorize`, amount ? { amount: money(amount, currency) } : {}, requestId);
      return authView(j);
    },
    // ---- the fallback (PLAN §12): charge now (intent CAPTURE), kept at the platform until release ------------------
    async charge({ amount, currency = "USD", reference, description, vaultId = null, card = false, save = true, returnUrl, cancelUrl, requestId, cmid = null, venmo = false, items = null, level2 = null, ctx = {} }) {
      const payment_source = source({ vaultId, card, save, returnUrl, cancelUrl, intent: "CAPTURE", venmo, ctx });
      const j = await call("POST", "/v2/checkout/orders", { intent: "CAPTURE", purchase_units: unit(reference, description, amount, currency, null, { items, level2: payment_source?.card ? level2 : null, invoiceId: ctx.invoiceId, site: siteFor(payment_source, ctx.site), ip: ctx.ip }), payment_source }, requestId, cmid ? { "PayPal-Client-Metadata-Id": cmid } : {});
      return { id: j.id, status: j.status, approveUrl: link(j, "payer-action") || link(j, "approve"), capture: captureView(j.purchase_units?.[0]?.payments?.captures?.[0]), ...saved(j) };
    },
    async captureOrder(id, requestId) {
      const j = await call("POST", `/v2/checkout/orders/${id}/capture`, {}, requestId);
      return { id: j.id, status: j.status, capture: captureView(j.purchase_units?.[0]?.payments?.captures?.[0]), ...saved(j) };
    },
    // onBehalfOf: the onboarded merchant whose capture it is (multiparty): the refund is made as them
    // (PayPal-Auth-Assertion), and platformFee gives back that much of VeriPay's fee with it
    // customId / invoiceId: what the refund is for (the dispute, the milestone), for reconciliation
    async refund(captureId, { amount, currency = "USD", note, requestId, onBehalfOf = null, platformFee = null, customId = null, invoiceId = null }) {
      const j = await call("POST", `/v2/payments/captures/${captureId}/refund`, { amount: money(amount, currency), ...(note ? { note_to_payer: String(note).slice(0, 255) } : {}), ...(customId ? { custom_id: String(customId).slice(0, 127) } : {}), ...(invoiceId ? { invoice_id: String(invoiceId).slice(0, 127) } : {}), ...(platformFee ? { payment_instruction: { platform_fees: [{ amount: money(platformFee, currency) }] } } : {}) }, requestId, onBehalfOf ? { "PayPal-Auth-Assertion": assertion(onBehalfOf) } : {});
      return { id: j.id, status: j.status, amount: cents(j.amount?.value) ?? amount, ...(j.status_details?.reason ? { statusReason: j.status_details.reason } : {}) };
    },
    // sandbox negative testing: PayPal answers an order create with the error code asked for (PayPal-Mock-Response)
    async negativeTest(code) {
      try { await call("POST", "/v2/checkout/orders", { intent: "AUTHORIZE", purchase_units: [{ amount: money(100) }], payment_source: { card: TEST_CARD } }, `veripay-negative-${code}-${Date.now()}`, { "PayPal-Mock-Response": JSON.stringify({ mock_application_codes: code }) }); return { code, answered: "no error" }; }
      catch (e) { return { code, status: e.status, issue: e.issue, debugId: e.debugId }; }
    },
    // a refund's status (GET /v2/payments/refunds/{id}): a PENDING one is COMPLETED (or FAILED) later
    async getRefund(id) { const j = await call("GET", `/v2/payments/refunds/${id}`); return { id: j.id, status: j.status, amount: cents(j.amount?.value), reason: j.status_details?.reason || null }; },
    // which ways to pay PayPal offers this buyer for this amount (POST /v2/payments/find-eligible-methods)
    async findEligible({ amount, email = null, flow = "ONE_TIME_PAYMENT", currency = "USD" }) {
      const j = await call("POST", "/v2/payments/find-eligible-methods", { customer: { country_code: "US", ...(email ? { email } : {}) }, purchase_units: [{ amount: money(amount, currency) }], preferences: { payment_flow: flow, include_account_details: true } });
      return { methods: Object.keys(j.eligible_methods || {}), raw: Object.fromEntries(Object.entries(j.eligible_methods || {}).map(([k, v]) => [k, { canBeVaulted: v.can_be_vaulted ?? null, recommended: v.recommended ?? null }])) };
    },
    // ---- Payouts: one batch, one item per payee -----------------------------------------------------------------
    // an item to a Venmo account: recipientType "PHONE", wallet "VENMO" (recipient_wallet), receiver the US mobile number
    async payoutBatch({ batchId, items, currency = "USD", subject = `${brand}: you've been paid`, note = "" }) {
      const j = await call("POST", "/v1/payments/payouts", { sender_batch_header: { sender_batch_id: batchId, email_subject: subject, email_message: note },
        items: items.map((x) => ({ recipient_type: x.recipientType || "EMAIL", receiver: x.receiver, ...(x.wallet === "VENMO" ? { recipient_wallet: "VENMO" } : {}), purpose: x.purpose || "SERVICES", ...(x.lang ? { notification_language: x.lang } : {}), note: String(x.note || note).slice(0, 4000), sender_item_id: x.id, amount: { value: (x.amount / 100).toFixed(2), currency } })) }, batchId);
      return { batchId: j.batch_header.payout_batch_id, status: j.batch_header.batch_status };
    },
    // an UNCLAIMED item back to the platform (only UNCLAIMED can be cancelled): PayPal marks it RETURNED
    // a delayed-disbursement capture's money, held by PayPal for the payee, released to them (Referenced Payouts)
    async releaseDelayed(captureId) { const j = await call("POST", "/v1/payments/referenced-payouts-items", { reference_id: captureId, reference_type: "TRANSACTION_ID" }); return { itemId: j.item_id || null, status: j.processing_state?.status || "PROCESSING" }; },
    // one payout item (GET /v1/payments/payouts-item/{id}): its status and PayPal's reason when it failed or is held
    async getPayoutItem(itemId) { const j = await call("GET", `/v1/payments/payouts-item/${itemId}`); return { itemId, status: j.transaction_status, transactionId: j.transaction_id || null, error: j.errors?.name || null, purpose: j.payout_item?.purpose || null, amount: cents(j.payout_item?.amount?.value) }; },
    // several delayed captures released in one call (POST /v1/payments/referenced-payouts), and one released item read
    async releaseDelayedBatch(captureIds, requestId) { const j = await call("POST", "/v1/payments/referenced-payouts", { referenced_payouts: captureIds.map((id) => ({ reference_id: id, reference_type: "TRANSACTION_ID" })) }, requestId); return { batchId: j.batch_header?.payout_batch_id || j.payout_batch_id || null, status: j.batch_header?.batch_status || "PENDING" }; },
    async getReleasedItem(itemId) { const j = await call("GET", `/v1/payments/referenced-payouts-items/${itemId}`); return { itemId, status: j.processing_state?.status || null, reason: j.processing_state?.reason || null }; },
    async cancelPayoutItem(itemId) { const j = await call("POST", `/v1/payments/payouts-item/${itemId}/cancel`); return { status: j.transaction_status }; },
    async getPayout(batchId) {
      const j = await call("GET", `/v1/payments/payouts/${batchId}`);
      return { batchId, status: j.batch_header.batch_status, items: (j.items || []).map((x) => ({ id: x.payout_item?.sender_item_id, itemId: x.payout_item_id, transactionId: x.transaction_id || null, status: x.transaction_status, receiver: x.payout_item?.receiver, wallet: x.payout_item?.recipient_wallet || null, error: x.errors?.name || null, amount: cents(x.payout_item?.amount?.value), fee: cents(x.payout_item_fee?.value) })) };
    },
    // ---- Invoicing (a pro's off-platform job, checked the same way, then billed) ---------------------------------
    // allowTip: the customer may add a tip when paying; minDue: they may pay in parts, at least this much at a time
    // lines: [{ name, qty, unit (HOURS|QUANTITY|AMOUNT), amount (each, cents), taxPct }]; tripFee: a "Trip fee" custom
    // line; reference/terms/memo: the job, warranty terms, a private note; invoicer: the pro's business block; payTerm:
    // DUE_ON_RECEIPT or NET_10..NET_90; sendOn: a later invoice date (PayPal holds it as SCHEDULED); cc: other recipients;
    // site: the job-site address; subject/sendNote: the email PayPal sends
    async invoice({ recipient, item, amount, currency = "USD", note = "", requestId, templateId = null, allowTip = false, minDue = null, lines = null, tripFee = 0, reference = null, terms = null, memo = null, invoicer = null, payTerm = "DUE_ON_RECEIPT", sendOn = null, cc = [], site = null, subject = null, sendNote = null, number = null, attachUrl = null }) {
      const its = lines?.length ? lines.map((x) => ({ name: String(x.name).slice(0, 200), quantity: String(x.qty || 1), unit_of_measure: x.unit || "QUANTITY", unit_amount: money(x.amount, currency), ...(x.taxPct ? { tax: { name: "Sales tax", percent: String(x.taxPct) } } : {}) })) : [{ name: item.slice(0, 200), quantity: "1", unit_amount: money(amount, currency) }];
      const j = await call("POST", "/v2/invoicing/invoices", { detail: { currency_code: currency, note: note.slice(0, 4000), payment_term: { term_type: payTerm }, ...(templateId ? { template_id: templateId } : {}), ...(reference ? { reference: String(reference).slice(0, 120) } : {}), ...(terms ? { terms_and_conditions: String(terms).slice(0, 4000) } : {}), ...(memo ? { memo: String(memo).slice(0, 500) } : {}), ...(sendOn ? { invoice_date: sendOn } : {}), ...(attachUrl && /^https:\/\//.test(attachUrl) ? { attachments: [{ id: "veripay-checks", reference_url: attachUrl }] } : {}), ...(number ? { invoice_number: String(number).slice(0, 25) } : {}) },
        ...(invoicer ? { invoicer: { ...(invoicer.business ? { business_name: String(invoicer.business).slice(0, 300) } : {}), ...(invoicer.phone ? { phones: [{ country_code: "001", national_number: String(invoicer.phone).replace(/\D/g, "").slice(-10), phone_type: "MOBILE" }] } : {}), ...(/^https:\/\//.test(invoicer.website || "") ? { website: invoicer.website } : {}), ...(invoicer.note ? { additional_notes: String(invoicer.note).slice(0, 400) } : {}) } } : {}),
        items: its, ...(tripFee ? { amount: { breakdown: { custom: { label: "Trip fee", amount: money(tripFee, currency) } } } } : {}),
        ...(cc.length ? { additional_recipients: cc.slice(0, 5).map((e) => ({ email_address: e })) } : {}),
        ...(allowTip || minDue ? { configuration: { allow_tip: !!allowTip, ...(minDue ? { partial_payment: { allow_partial_payment: true, minimum_amount_due: money(minDue, currency) } } : {}) } } : {}), primary_recipients: [{ billing_info: { email_address: recipient }, ...(site ? { shipping_info: { address: siteOf(site).address } } : {}) }] }, requestId);
      const id = j.id || String(j.href || "").split("/").pop();
      const s = await call("POST", `/v2/invoicing/invoices/${id}/send`, { send_to_recipient: true, send_to_invoicer: false, ...(subject ? { subject: String(subject).slice(0, 4000) } : {}), ...(sendNote ? { note: String(sendNote).slice(0, 4000) } : {}) }, `${requestId}:send`);
      return { id, url: s.href || null, status: sendOn && sendOn > new Date().toISOString().slice(0, 10) ? "SCHEDULED" : "SENT" };
    },
    async getInvoice(id) {
      const j = await call("GET", `/v2/invoicing/invoices/${id}`);
      const tx = j.payments?.transactions || [];
      return { id, status: j.status, url: j.detail?.metadata?.recipient_view_url || null, paid: j.payments?.paid_amount ? cents(j.payments.paid_amount.value) : 0, tip: j.gratuity ? cents(j.gratuity.value) : 0, due: j.due_amount ? cents(j.due_amount.value) : null, total: cents(j.amount?.value), tax: cents(j.amount?.breakdown?.tax_total?.value) || 0, refunded: j.refunds?.refund_amount ? cents(j.refunds.refund_amount.value) : 0,
        external: tx.length > 0 && tx.every((t) => t.type === "EXTERNAL") }; // recorded by hand (cash, check): no money reached PayPal
    },
    // a QR code the customer scans to pay (PNG; PayPal answers multipart with the image as base64 text)
    async invoiceQr(id, { width = 300, height = 300 } = {}) {
      const r = await fetch(`${BASE}/v2/invoicing/invoices/${id}/generate-qr-code`, { method: "POST", headers: { Authorization: `Bearer ${await auth()}`, "Content-Type": "application/json" }, body: JSON.stringify({ width, height, action: "pay" }), signal: AbortSignal.timeout(20e3) });
      if (!r.ok) throw new Error(`PayPal invoice QR: ${r.status}`);
      const b64 = (await r.text()).match(/iVBOR[A-Za-z0-9+/=\s]+/)?.[0]?.replace(/\s/g, "");
      if (!b64) throw new Error("PayPal invoice QR: no image in the answer");
      return { png: b64 };
    },
    // a draft or scheduled invoice changed (GET, then PUT the whole invoice): fields by the caller's function
    async updateInvoice(id, change) { const j = await call("GET", `/v2/invoicing/invoices/${id}`); const n = change(structuredClone(j)); await call("PUT", `/v2/invoicing/invoices/${id}?send_to_recipient=false`, n); return { id, status: j.status }; },
    // a DRAFT or SCHEDULED invoice deleted (one that was sent is cancelled instead)
    async deleteInvoice(id) { await call("DELETE", `/v2/invoicing/invoices/${id}`); return { deleted: true }; },
    // a refund made outside PayPal (cash back), recorded on the invoice; a payment or refund recorded by mistake removed
    async recordInvoiceRefund(id, { method = "CASH", amount, date, currency = "USD" }) { const j = await call("POST", `/v2/invoicing/invoices/${id}/refunds`, { method, refund_date: date, amount: money(amount, currency) }); return { refundId: j.refund_id }; },
    async deleteInvoicePayment(id, paymentId) { await call("DELETE", `/v2/invoicing/invoices/${id}/payments/${paymentId}`); return { deleted: true }; },
    async deleteInvoiceRefund(id, refundId) { await call("DELETE", `/v2/invoicing/invoices/${id}/refunds/${refundId}`); return { deleted: true }; },
    // the next number in PayPal's own invoice sequence (POST /v2/invoicing/generate-next-invoice-number)
    async nextInvoiceNumber() { const j = await call("POST", "/v2/invoicing/generate-next-invoice-number"); return { number: j.invoice_number }; },
    async listInvoiceTemplates() { const j = await call("GET", "/v2/invoicing/templates?page_size=20&fields=all"); return (j.templates || []).map((t) => ({ id: t.id, name: t.name, default: !!t.default_template })); },
    async updateInvoiceTemplate(id, { name, item, amount, currency = "USD" }) { const j = await call("GET", `/v2/invoicing/templates/${id}`); const n = { ...j, ...(name ? { name } : {}) }; if (item || amount) n.template_info.items = [{ ...(n.template_info.items?.[0] || {}), ...(item ? { name: item } : {}), quantity: "1", ...(amount ? { unit_amount: money(amount, currency) } : {}) }]; await call("PUT", `/v2/invoicing/templates/${id}`, n); return { id, name: n.name }; },
    async remindInvoice(id, { note = "" } = {}) { await call("POST", `/v2/invoicing/invoices/${id}/remind`, { subject: `${brand}: a reminder about your invoice`, note: note.slice(0, 400), send_to_invoicer: false }); return { reminded: true }; },
    // a sent invoice withdrawn (POST /v2/invoicing/invoices/{id}/cancel): PayPal tells the customer it's cancelled
    async cancelInvoice(id, { note = "" } = {}) { await call("POST", `/v2/invoicing/invoices/${id}/cancel`, { subject: `${brand}: invoice cancelled`, note: String(note).slice(0, 400), send_to_recipient: true, send_to_invoicer: false }); return { status: "CANCELLED" }; },
    // a payment made outside PayPal (cash, check): the invoice is MARKED_AS_PAID; no money moves in PayPal
    async recordInvoicePayment(id, { method = "CASH", amount, date, note = "", currency = "USD" }) {
      const j = await call("POST", `/v2/invoicing/invoices/${id}/payments`, { method, payment_date: date, amount: money(amount, currency), note: note.slice(0, 200) });
      return { paymentId: j.payment_id };
    },
    // an invoice template in PayPal (POST /v2/invoicing/templates): a pro's usual job, kept in PayPal's invoicer
    async createInvoiceTemplate({ name, item, amount, note = "", currency = "USD" }) {
      const j = await call("POST", "/v2/invoicing/templates", { name: String(name).slice(0, 500), default_template: false, template_info: { detail: { currency_code: currency, note: note.slice(0, 4000), payment_term: { term_type: "DUE_ON_RECEIPT" } }, items: [{ name: String(item).slice(0, 200), quantity: "1", unit_amount: money(amount, currency) }] } });
      return { id: j.id, name: j.name };
    },
    async getInvoiceTemplate(id) { const j = await call("GET", `/v2/invoicing/templates/${id}`); const it = j.template_info?.items?.[0]; return { id: j.id, name: j.name, item: it?.name || null, amount: cents(it?.unit_amount?.value) }; },
    async deleteInvoiceTemplate(id) { await call("DELETE", `/v2/invoicing/templates/${id}`); return { deleted: true }; },
    // ---- Subscriptions (a monthly maintenance plan) -----------------------------------------------------------------
    // one catalog product for every plan, then a billing plan at the plan's price, then the subscription the customer
    // approves at PayPal. Each month PayPal charges it; the money lands with the platform (plans.js holds it for proof).
    // setupFee: a one-time charge when the customer approves (the first visit's extra work), besides the monthly price
    // every: months between visits (1, 3, 6 or 12); cycles: a fixed number of visits (0 = until cancelled); trial: the first
    // visit free (a TRIAL cycle); taxPct: sales tax on each charge; units: priced per unit (e.g. per AC unit, quantity);
    // card: the sandbox test card as the subscriber's card (PayPal activates it at once, no approval); subscriber: the
    // customer's name and email prefilled; startTime: the first charge on the first visit's date; trade: the product's
    // category in PayPal's catalog
    // shared: one ACTIVE plan per product and cadence, with this subscription's price as an override (plan_overridden),
    // instead of a plan per subscription (only for plain plans: no trial, setup fee, tax or units)
    async subscribe({ name, amount, reference, returnUrl, cancelUrl, requestId, currency = "USD", setupFee = 0, every = 1, cycles = 0, trial = false, taxPct = 0, units = 0, card = false, subscriber = null, startTime = null, trade = null, shared = false }) {
      const prod = await this.product(trade), share = shared && !trial && !setupFee && !taxPct && !units;
      if (share) {
        const key = `${brand} shared plan · ${prod} · every ${every} month${every === 1 ? "" : "s"}`;
        sharedPlans[key] ||= ((await call("GET", `/v1/billing/plans?product_id=${prod}&page_size=20&total_required=true`).catch(() => ({}))).plans || []).find((x) => x.name === key && x.status === "ACTIVE")?.id
          || (await call("POST", "/v1/billing/plans", { product_id: prod, name: key, status: "ACTIVE", billing_cycles: [{ frequency: { interval_unit: every === 12 ? "YEAR" : "MONTH", interval_count: every === 12 ? 1 : every }, tenure_type: "REGULAR", sequence: 1, total_cycles: 0, pricing_scheme: { fixed_price: money(amount, currency) } }], payment_preferences: { auto_bill_outstanding: true, payment_failure_threshold: 2 } }, `veripay-shared-${prod}-${every}`)).id;
        const who = subscriber || (card ? { name: "VeriPay Customer", email: null } : null);
        const sub = await call("POST", "/v1/billing/subscriptions", { plan_id: sharedPlans[key], custom_id: reference, ...(startTime ? { start_time: startTime } : {}), plan: { billing_cycles: [{ sequence: 1, total_cycles: cycles, pricing_scheme: { fixed_price: money(amount, currency) } }] },
          ...(who ? { subscriber: { name: { given_name: String(who.name || "Customer").split(" ")[0].slice(0, 140), surname: String(who.name || "").split(" ").slice(1).join(" ").slice(0, 140) || "Customer" }, ...(who.email ? { email_address: who.email } : {}), ...(card && testCard ? { payment_source: { card: TEST_CARD } } : {}) } } : {}),
          application_context: { brand_name: brand, shipping_preference: "NO_SHIPPING", user_action: "SUBSCRIBE_NOW", return_url: returnUrl, cancel_url: cancelUrl } }, `${requestId}:sub`);
        return { id: sub.id, plan: sharedPlans[key], shared: true, product: prod, status: sub.status, approveUrl: link(sub, "approve") };
      }
      const regular = { frequency: { interval_unit: every === 12 ? "YEAR" : "MONTH", interval_count: every === 12 ? 1 : every }, tenure_type: "REGULAR", sequence: trial ? 2 : 1, total_cycles: cycles, pricing_scheme: { fixed_price: money(amount, currency) } };
      const plan = await call("POST", "/v1/billing/plans", { product_id: prod, name: name.slice(0, 127), status: "ACTIVE", ...(units ? { quantity_supported: true } : {}), ...(taxPct ? { taxes: { percentage: String(taxPct), inclusive: false } } : {}),
        billing_cycles: [...(trial ? [{ frequency: regular.frequency, tenure_type: "TRIAL", sequence: 1, total_cycles: 1, pricing_scheme: { fixed_price: money(0, currency) } }] : []), regular],
        // two failed months in a row and PayPal suspends the subscription itself (one missed month can be paid: payOutstanding)
        payment_preferences: { auto_bill_outstanding: true, payment_failure_threshold: 2, ...(setupFee ? { setup_fee: money(setupFee, currency), setup_fee_failure_action: "CANCEL" } : {}) } }, `${requestId}:plan`);
      const who = subscriber || (card ? { name: "VeriPay Customer", email: null } : null);
      const sub = await call("POST", "/v1/billing/subscriptions", { plan_id: plan.id, custom_id: reference, ...(units ? { quantity: String(units) } : {}), ...(startTime ? { start_time: startTime } : {}),
        ...(who ? { subscriber: { name: { given_name: String(who.name || "Customer").split(" ")[0].slice(0, 140), surname: String(who.name || "").split(" ").slice(1).join(" ").slice(0, 140) || "Customer" }, ...(who.email ? { email_address: who.email } : {}), ...(card && testCard ? { payment_source: { card: TEST_CARD } } : {}) } } : {}),
        application_context: { brand_name: brand, shipping_preference: "NO_SHIPPING", user_action: "SUBSCRIBE_NOW", return_url: returnUrl, cancel_url: cancelUrl } }, `${requestId}:sub`);
      return { id: sub.id, plan: plan.id, product: prod, status: sub.status, approveUrl: link(sub, "approve") };
    },
    // the catalog product a trade's plans are billed under: looked up in PayPal's catalog by name, made once if missing
    async product(trade = null) {
      const cat = { plumbing: "HEATING_PLUMBING_AC", hvac: "HEATING_PLUMBING_AC", electrical: "ELECTRICAL_CONTRACTORS", handyman: "GENERAL_CONTRACTORS", landscaping: "LANDSCAPING", lawn: "LANDSCAPING", roofing: "ROOFING_SIDING_SHEET_METAL", cleaning: "MAINTENANCE_AND_REPAIR_SERVICES" }[trade] || "SERVICES";
      const name = cat === "SERVICES" ? `${brand} maintenance plan` : `${brand} maintenance plan · ${cat.toLowerCase().replace(/_/g, " ")}`;
      if (products[name]) return products[name];
      const found = (await call("GET", "/v1/catalogs/products?page_size=20&total_required=true").catch(() => ({}))).products?.find((x) => x.name === name);
      return (products[name] = found?.id || (await call("POST", "/v1/catalogs/products", { name, type: "SERVICE", category: cat, description: "Home maintenance visits, paid to the pro only when each visit is proven" }, `veripay-product-${cat}-${clientId.slice(0, 8)}`)).id);
    },
    async getProduct(id) { const j = await call("GET", `/v1/catalogs/products/${id}`); return { id: j.id, name: j.name, category: j.category }; },
    // a plan is retired when its one subscription ends; its failure threshold changed in place
    async deactivatePlan(planId) { await call("POST", `/v1/billing/plans/${planId}/deactivate`); return { status: "INACTIVE" }; },
    async patchPlan(planId, { failureThreshold = null, description = null }) { const ops = [...(failureThreshold != null ? [{ op: "replace", path: "/payment_preferences/payment_failure_threshold", value: failureThreshold }] : []), ...(description ? [{ op: "replace", path: "/description", value: String(description).slice(0, 127) }] : [])]; await call("PATCH", `/v1/billing/plans/${planId}`, ops); return { patched: ops.length }; },
    // one subscription's price changed (PATCH the subscription's own pricing, not the plan), and a change of plan the
    // customer approves at PayPal (revise)
    async patchSubscriptionPrice(id, { amount, sequence = 1, currency = "USD" }) { await call("PATCH", `/v1/billing/subscriptions/${id}`, [{ op: "replace", path: `/plan/billing_cycles/@sequence==${sequence}/pricing_scheme/fixed_price`, value: money(amount, currency) }]); return { amount }; },
    async reviseSubscription(id, { planId = null, units = null, returnUrl, cancelUrl }) { const j = await call("POST", `/v1/billing/subscriptions/${id}/revise`, { ...(planId ? { plan_id: planId } : {}), ...(units ? { quantity: String(units) } : {}), application_context: { brand_name: brand, return_url: returnUrl, cancel_url: cancelUrl } }); return { approveUrl: link(j, "approve"), planChanged: !!j.plan_overridden || !!planId };
    },
    async getSubscription(id) { const j = await call("GET", `/v1/billing/subscriptions/${id}`), bi = j.billing_info || {}; return { id, status: j.status, nextBilling: bi.next_billing_time || null, failed: bi.failed_payments_count || 0, outstanding: cents(bi.outstanding_balance?.value) || 0,
      // which charge failed and why, and how many cycles have run
      lastFailed: bi.last_failed_payment ? { amount: cents(bi.last_failed_payment.amount?.value), at: bi.last_failed_payment.time || null, reason: bi.last_failed_payment.reason_code || null } : null, lastPaid: bi.last_payment ? { amount: cents(bi.last_payment.amount?.value), at: bi.last_payment.time || null } : null, cyclesDone: (bi.cycle_executions || []).reduce((t, c) => t + (c.cycles_completed || 0), 0), quantity: j.quantity ? +j.quantity : null }; },
    // a month PayPal couldn't charge: charge the outstanding balance now (POST /v1/billing/subscriptions/{id}/capture)
    async captureSubscriptionBalance(id, { amount, note, currency = "USD", requestId }) { const j = await call("POST", `/v1/billing/subscriptions/${id}/capture`, { note: String(note || "the month PayPal couldn't charge").slice(0, 128), capture_type: "OUTSTANDING_BALANCE", amount: money(amount, currency) }, requestId); return { id: j.id || null, status: j.status || "COMPLETED" }; },
    async subscriptionPayments(id, { since }) {
      const j = await call("GET", `/v1/billing/subscriptions/${id}/transactions?start_time=${encodeURIComponent(new Date(since).toISOString())}&end_time=${encodeURIComponent(new Date().toISOString())}`);
      return (j.transactions || []).map((t) => ({ id: t.id, status: t.status, amount: cents(t.amount_with_breakdown?.gross_amount?.value), fee: cents(t.amount_with_breakdown?.fee_amount?.value), at: t.time }));
    },
    async suspendSubscription(id, reason) { await call("POST", `/v1/billing/subscriptions/${id}/suspend`, { reason: String(reason || "paused").slice(0, 120) }); return { status: "SUSPENDED" }; },
    async activateSubscription(id, reason) { await call("POST", `/v1/billing/subscriptions/${id}/activate`, { reason: String(reason || "resumed").slice(0, 120) }); return { status: "ACTIVE" }; },
    // a new monthly price on the plan's own billing plan (each VeriPay plan has one); PayPal applies it to the subscription
    async updatePlanPrice(planId, { amount, currency = "USD", sequence = 1 }) { await call("POST", `/v1/billing/plans/${planId}/update-pricing-schemes`, { pricing_schemes: [{ billing_cycle_sequence: sequence, pricing_scheme: { fixed_price: money(amount, currency) } }] }); return { amount }; },
    async cancelSubscription(id, reason) { await call("POST", `/v1/billing/subscriptions/${id}/cancel`, { reason: String(reason || "cancelled").slice(0, 120) }); return { status: "CANCELLED" }; },
    // a month's payment back to the customer (a subscription payment is a sale: the v1 sale refund)
    // (Payments v1 is deprecated: the v2 capture refund first, the v1 sale refund only if PayPal refuses it)
    async refundSubscriptionPayment(txId, { amount, currency = "USD", requestId }) {
      try { const j = await call("POST", `/v2/payments/captures/${txId}/refund`, { amount: money(amount, currency) }, `${requestId}:v2`); return { id: j.id, status: j.status, via: "v2" }; }
      catch (e) { if (![404, 422, 400].includes(e.status)) throw e; }
      const j = await call("POST", `/v1/payments/sale/${txId}/refund`, { amount: { total: (amount / 100).toFixed(2), currency } }, requestId); return { id: j.id, status: j.state || j.status, via: "v1" };
    },
    // ---- Reporting: the account's balances (GET /v1/reporting/balances) -------------------------------------------
    // asOf: the balance at the end of a past day (month-end close)
    async balances(currency = "USD", asOf = null) {
      const j = await call("GET", `/v1/reporting/balances?currency_code=${currency}${asOf ? `&as_of_time=${encodeURIComponent(new Date(asOf).toISOString().replace(/\.\d{3}Z$/, "Z"))}` : ""}`);
      const b = (j.balances || []).find((x) => x.currency === currency) || {};
      return { currency, total: cents(b.total_balance?.value), available: cents(b.available_balance?.value), withheld: cents(b.withheld_balance?.value), asOf: j.as_of_time || null, account: j.account_id || null };
    },
    // ---- Vault without a purchase (save a payment method on the website) -----------------------------------------
    // venmo: a Venmo setup token (PayPal answers with an approve link, no return URL); customerRef: VeriPay's person id
    // on the vault record; usage_pattern UNSCHEDULED_POSTPAID: holds placed when a job is hired, charged after the work
    async vaultSetup({ returnUrl, cancelUrl, requestId, customerRef = null, venmo = false }) {
      const body = venmo ? { payment_source: { venmo: { usage_type: "MERCHANT", experience_context: { brand_name: brand, shipping_preference: "NO_SHIPPING" } } } }
        : { payment_source: { paypal: { usage_type: "MERCHANT", usage_pattern: "UNSCHEDULED_POSTPAID", customer_type: "CONSUMER", permit_multiple_payment_tokens: false, description: `${brand}: holds for jobs you hire, within your limits`, experience_context: { brand_name: brand, shipping_preference: "NO_SHIPPING", return_url: returnUrl, cancel_url: cancelUrl, ...(process.env.DONE_VAULT_ON_APPROVAL === "1" ? { vault_instruction: "ON_PAYER_APPROVAL" } : {}) } } } };
      const j = await call("POST", "/v3/vault/setup-tokens", { ...(customerRef ? custOf(customerRef) : {}), ...body }, requestId);
      return { id: j.id, approveUrl: link(j, "approve"), status: j.status };
    },
    // a card saved without a purchase (setup token with the card): the sandbox test card is APPROVED at once, so it
    // becomes a payment token with no buyer login; with no card, the token is for the JS SDK's card-fields save session
    async vaultCardSetup({ requestId, customerRef = null, returnUrl, cancelUrl, withTestCard = true }) {
      const j = await call("POST", "/v3/vault/setup-tokens", { ...(customerRef ? custOf(customerRef) : {}), payment_source: { card: { ...(withTestCard && testCard ? TEST_CARD : {}), verification_method: "SCA_WHEN_REQUIRED", experience_context: { brand_name: brand, return_url: returnUrl, cancel_url: cancelUrl } } } }, requestId);
      return { id: j.id, status: j.status, approveUrl: link(j, "approve") };
    },
    async getSetupToken(id) { const j = await call("GET", `/v3/vault/setup-tokens/${id}`); return { id: j.id, status: j.status, customerId: j.customer?.id || null, kind: j.payment_source?.card ? "card" : j.payment_source?.venmo ? "venmo" : "paypal" }; },
    async vaultToken(setupTokenId, requestId) {
      const j = await call("POST", "/v3/vault/payment-tokens", { payment_source: { token: { id: setupTokenId, type: "SETUP_TOKEN" } } }, requestId);
      const kind = j.payment_source?.card ? "card" : j.payment_source?.venmo ? "venmo" : "paypal", c = j.payment_source?.card;
      return { id: `${kind}:${j.id}`, kind, customerId: j.customer?.id || null, ...(c ? { label: `${c.brand || "Card"} •••• ${c.last_digits || ""}`.trim() } : {}) };
    },
    // a browser-safe client token for the JS SDK v6 (short-lived; scoped to initializing the SDK)
    // a saved payment method in PayPal's vault (Payment Method Tokens v3): what it is, every one the customer has, removal
    async getPaymentToken(vaultId) {
      const [kind, id] = vaultKind(vaultId), j = await call("GET", `/v3/vault/payment-tokens/${id}`), c = j.payment_source?.card, pp_ = j.payment_source?.paypal || j.payment_source?.venmo;
      return { id: `${kind}:${j.id}`, kind: c ? "card" : j.payment_source?.venmo ? "venmo" : "paypal", customerId: j.customer?.id || null, label: c ? `${c.brand || "Card"} •••• ${c.last_digits || ""}`.trim() : pp_?.email_address || "PayPal", expiry: c?.expiry || null };
    },
    async listPaymentTokens(customerId, { page = 1 } = {}) { const j = await call("GET", `/v3/vault/payment-tokens?customer_id=${encodeURIComponent(customerId)}&page_size=10&page=${page}&total_required=true`); const k = (t) => (t.payment_source?.card ? "card" : t.payment_source?.venmo ? "venmo" : "paypal"); return (j.payment_tokens || []).map((t) => ({ id: `${k(t)}:${t.id}`, kind: k(t), label: t.payment_source?.card ? `${t.payment_source.card.brand || "Card"} •••• ${t.payment_source.card.last_digits || ""}`.trim() : t.payment_source?.paypal?.email_address || "PayPal" })); },
    async deletePaymentToken(vaultId) { await call("DELETE", `/v3/vault/payment-tokens/${vaultKind(vaultId)[1]}`); return { deleted: true }; },
    // Set Transaction Context (Risk API, PUT /v1/risk/transaction-contexts/{merchant}/{tracking id}): the marketplace
    // tells PayPal's risk models who is paying whom before the order; the order carries the same tracking id as
    // PayPal-Client-Metadata-Id. The merchant id is the platform's own (PAYPAL_MERCHANT_ID, or learned from the payee
    // of an order: once, a $1 order that is never approved and expires).
    async merchantId() {
      if (merchant) return merchant;
      if (process.env.PAYPAL_MERCHANT_ID) return (merchant = process.env.PAYPAL_MERCHANT_ID);
      const j = await call("POST", "/v2/checkout/orders", { intent: "AUTHORIZE", purchase_units: [{ reference_id: "merchant-id-lookup", amount: money(100) }] }, "veripay:merchant-id-lookup");
      return (merchant = j.purchase_units?.[0]?.payee?.merchant_id || null);
    },
    async setTransactionContext(trackingId, data) {
      const m = await this.merchantId();
      if (!m) throw new Error("PayPal: no merchant id for the risk context");
      await call("PUT", `/v1/risk/transaction-contexts/${m}/${encodeURIComponent(trackingId)}`, { additional_data: Object.entries(data).filter(([, v]) => v != null && v !== "").map(([key, value]) => ({ key, value: String(value) })) });
      return { trackingId, merchant: `${m.slice(0, 3)}…`, keys: Object.keys(data).filter((k) => data[k] != null && data[k] !== "") };
    },
    // Transaction Search by one transaction id, with the payer, or every record (not only those that move the balance)
    async searchTransactions({ since, until = Date.now(), transactionId = null, fields = "transaction_info,payer_info", all = false, page = 1 }) {
      const z = (t) => new Date(t).toISOString().replace(/\.\d{3}Z$/, "Z");
      const q = new URLSearchParams({ start_date: z(Math.max(Date.parse(since), Date.now() - 30 * 864e5)), end_date: z(until), fields, page_size: "100", page: String(page), ...(transactionId ? { transaction_id: transactionId } : {}), ...(all ? { balance_affecting_records_only: "N" } : {}) });
      let j; try { j = await call("GET", `/v1/reporting/transactions?${q}`); } catch (e) { if (e.status === 404) return { total: 0, pages: 0, items: [] }; throw e; }
      return { total: j.total_items || 0, pages: j.total_pages || 0, items: (j.transaction_details || []).map((t) => ({ id: t.transaction_info?.transaction_id, code: t.transaction_info?.transaction_event_code, status: t.transaction_info?.transaction_status, amount: cents(t.transaction_info?.transaction_amount?.value), at: t.transaction_info?.transaction_initiation_date, payer: t.payer_info?.email_address || null, invoiceId: t.transaction_info?.invoice_id || null, custom: t.transaction_info?.custom_field || null })) };
    },
    // ---- Payment Links (Pay Links API: POST /v1/checkout/payment-resources) -------------------------------------------
    // notes: questions the payer answers at PayPal (e.g. a gate code); taxPct: sales tax on the line
    async createPayLink({ name, amount, returnUrl, currency = "USD", notes = [], taxPct = 0 }) {
      const j = await call("POST", "/v1/checkout/payment-resources", { integration_mode: "LINK", type: "BUY_NOW", reusable: "MULTIPLE", return_url: returnUrl, line_items: [{ name: String(name).slice(0, 127), unit_amount: money(amount, currency), ...(taxPct ? { taxes: [{ name: "Sales tax", value: String(taxPct), type: "PERCENTAGE" }] } : {}), ...(notes.length ? { customer_notes: notes.slice(0, 3).map((n) => ({ label: String(n.label).slice(0, 60), required: !!n.required })) } : {}) }] });
      return { id: j.id, url: link(j, "payment_link") };
    },
    async listPayLinks() { const j = await call("GET", "/v1/checkout/payment-resources?page_size=20"); return (j.resources || j.payment_resources || []).map((r) => ({ id: r.id, status: r.status || null, name: r.line_items?.[0]?.name || null, amount: cents(r.line_items?.[0]?.unit_amount?.value) })); },
    async getPayLink(id) { const j = await call("GET", `/v1/checkout/payment-resources/${id}`); return { id: j.id, name: j.line_items?.[0]?.name || null, amount: cents(j.line_items?.[0]?.unit_amount?.value), url: link(j, "payment_link") }; },
    // a new price on a link (PUT the whole resource back)
    async updatePayLinkPrice(id, { amount, currency = "USD" }) { const j = await call("GET", `/v1/checkout/payment-resources/${id}`); await call("PUT", `/v1/checkout/payment-resources/${id}`, { ...j, line_items: [{ ...j.line_items[0], unit_amount: money(amount, currency) }] }); return { id, amount }; },
    // tracking on a payment that isn't an Orders v2 order (an invoice or a subscription payment): Tracking v1
    async addShippingTracker({ transactionId, trackingNumber, carrier, status = "SHIPPED" }) { const j = await call("POST", "/v1/shipping/trackers-batch", { trackers: [{ transaction_id: transactionId, tracking_number: trackingNumber, status, carrier }] }); return { added: (j.tracker_identifiers || []).length, errors: (j.errors || []).map((e) => e.name || e.message) }; },
    async deletePayLink(id) { await call("DELETE", `/v1/checkout/payment-resources/${id}`); return { deleted: true }; },
    // payments through a link: Transaction Search since it was made, by the link's item name and amount (the sandbox's
    // search lags by hours)
    async payLinkPayments({ name, amount, since }) {
      const z = (t) => new Date(t).toISOString().replace(/\.\d{3}Z$/, "Z"), start = z(Math.max(Date.parse(since) - 864e5, Date.now() - 30 * 864e5));
      let j;
      try { j = await call("GET", `/v1/reporting/transactions?start_date=${start}&end_date=${z(Date.now())}&fields=transaction_info,cart_info&page_size=100`); }
      catch (e) { if (e.status === 404) return []; throw e; } // PayPal's search has no data for that window yet
      return (j.transaction_details || []).filter((t) => cents(t.transaction_info?.transaction_amount?.value) === amount && (t.cart_info?.item_details || []).some((x) => x.item_name === name))
        .map((t) => ({ id: t.transaction_info.transaction_id, amount, fee: Math.abs(cents(t.transaction_info.fee_amount?.value) || 0), at: t.transaction_info.transaction_initiation_date }));
    },
    // ---- Multiparty onboarding (Partner Referrals v2) --------------------------------------------------------------
    // a pro signs up (or signs in) at PayPal as a merchant of their own and grants VeriPay PAYMENT, REFUND and
    // PARTNER_FEE: the action_url is PayPal's onboarding; PayPal sends them back to returnUrl with merchantIdInPayPal
    // also READ_SELLER_DISPUTE / UPDATE_SELLER_DISPUTE (VeriPay answers disputes on the pro's own account) and
    // ACCESS_MERCHANT_INFORMATION; business/language prefill PayPal's form; PAYPAL_PARTNER_PRODUCTS (e.g. PPCP) once
    // PayPal enables the platform for them
    async partnerReferral({ trackingId, email, returnUrl, business = null, language = "en-US" }) {
      const products = (process.env.PAYPAL_PARTNER_PRODUCTS || "EXPRESS_CHECKOUT").split(",").map((s) => s.trim()).filter(Boolean);
      const j = await call("POST", "/v2/customer/partner-referrals", { tracking_id: trackingId, ...(email ? { email } : {}), preferred_language_code: language, ...(business ? { business_entity: { business_type: { type: "INDIVIDUAL" }, names: [{ business_name: String(business).slice(0, 300), type: "LEGAL_NAME" }] } } : {}),
        operations: [{ operation: "API_INTEGRATION", api_integration_preference: { rest_api_integration: { integration_method: "PAYPAL", integration_type: "THIRD_PARTY", third_party_details: { features: ["PAYMENT", "REFUND", "PARTNER_FEE", "DELAY_FUNDS_DISBURSEMENT", "READ_SELLER_DISPUTE", "UPDATE_SELLER_DISPUTE", "ACCESS_MERCHANT_INFORMATION"] } } } }],
        products, legal_consents: [{ type: "SHARE_DATA_CONSENT", granted: true }], partner_config_override: { return_url: returnUrl, return_url_description: `Back to ${brand}` } });
      return { actionUrl: link(j, "action_url"), referralId: link(j, "self")?.split("/").pop() || null };
    },
    // the referral as PayPal keeps it (GET /v2/customer/partner-referrals/{id}): what was asked of the pro
    async getReferral(id) { const j = await call("GET", `/v2/customer/partner-referrals/${id}`); const f = j.referral_data?.operations?.[0]?.api_integration_preference?.rest_api_integration?.third_party_details?.features || []; return { id, trackingId: j.referral_data?.tracking_id || null, features: f, products: j.referral_data?.products || [] }; },
    // the pro's merchant status (GET /v1/customer/partners/{partner}/merchant-integrations): found by our tracking id
    // until we know their merchant id; 404 until they finish PayPal's onboarding
    async merchantStatus({ trackingId, merchantId = null }) {
      const partner = await this.merchantId();
      let mid = merchantId;
      if (!mid) { try { mid = (await call("GET", `/v1/customer/partners/${partner}/merchant-integrations?tracking_id=${encodeURIComponent(trackingId)}`)).merchant_id; } catch (e) { if (e.status === 404) return { found: false }; throw e; } }
      if (!mid) return { found: false };
      const j = await call("GET", `/v1/customer/partners/${partner}/merchant-integrations/${mid}`);
      const scopes = (j.oauth_integrations || []).flatMap((o) => (o.oauth_third_party || []).flatMap((t) => t.scopes || []));
      return { found: true, merchantId: mid, receivable: !!j.payments_receivable, emailConfirmed: !!j.primary_email_confirmed, consented: scopes.length > 0, products: (j.products || []).map((x) => `${x.name}:${x.vetting_status || x.status || ""}`) };
    },
    // the browser's client token; with customerId (a returning payer whose PayPal is in the vault) it is minted for that
    // customer (target_customer_id), so PayPal's buttons can show their saved PayPal
    async clientToken({ customerId = null } = {}) {
      const r = await fetch(`${BASE}/v1/oauth2/token`, { method: "POST", headers: { Authorization: `Basic ${Buffer.from(`${clientId}:${secret}`).toString("base64")}`, "Content-Type": "application/x-www-form-urlencoded" }, body: `grant_type=client_credentials&response_type=client_token&intent=sdk_init${customerId ? `&target_customer_id=${encodeURIComponent(customerId)}` : ""}`, signal: AbortSignal.timeout(20e3) });
      if (!r.ok) throw new Error(`PayPal client token: ${r.status}`);
      const j = await r.json();
      return { token: j.access_token, expiresIn: j.expires_in, sdk: "https://www.sandbox.paypal.com/web-sdk/v6/core", returningPayer: !!customerId };
    },
    // ---- Disputes ------------------------------------------------------------------------------------------------
    // by capture, or the queue: dispute_state (e.g. REQUIRED_ACTION) and updated since; channel INTERNAL (a PayPal
    // case), EXTERNAL (a card chargeback) or ALERT (a pre-chargeback alert)
    async listDisputes(captureId, { state = null, since = null } = {}) { const q = new URLSearchParams({ ...(captureId ? { disputed_transaction_id: captureId } : {}), ...(state ? { dispute_state: state } : {}), ...(since ? { update_time_after: new Date(since).toISOString() } : {}), page_size: "20" }); const j = await call("GET", `/v1/customer/disputes?${q}`); return (j.items || []).map((d) => ({ id: d.dispute_id, status: d.status, reason: d.reason, amount: cents(d.dispute_amount?.value), channel: d.dispute_channel || null, stage: d.dispute_life_cycle_stage || null, updated: d.update_time || null })); },
    // type: the evidence type matching the claim (a service: PROOF_FOR_SOFTWARE_OR_SERVICE_DELIVERED, COPY_OF_CONTRACT,
    // PROOF_OF_REFUND with refundIds, OTHER); PROOF_OF_FULFILLMENT is for shipped goods and needs tracking
    async provideEvidence(disputeId, { notes, file, fileName = "done-receipt.json", type = "PROOF_FOR_SOFTWARE_OR_SERVICE_DELIVERED", refundIds = [] }) {
      const form = new FormData();
      form.append("input", new Blob([JSON.stringify({ evidences: [{ evidence_type: type, evidence_info: type === "PROOF_OF_REFUND" && refundIds.length ? { refund_ids: refundIds.map((refund_id) => ({ refund_id })) } : {}, notes: notes.slice(0, 2000) }] })], { type: "application/json" }), "input.json");
      form.append("file1", new Blob([file], { type: "application/json" }), fileName);
      const r = await fetch(`${BASE}/v1/customer/disputes/${disputeId}/provide-evidence`, { method: "POST", headers: { Authorization: `Bearer ${await auth()}` }, body: form, signal: AbortSignal.timeout(20e3) });
      if (!r.ok) throw new Error(`PayPal provide-evidence: ${r.status}`);
      return { status: "UNDER_REVIEW" };
    },
    // accept the buyer's claim: PayPal refunds the buyer (POST /v1/customer/disputes/{id}/accept-claim). Called directly,
    // not through the toolkit's accept_dispute_claim, whose schema checks the note against the dispute-id pattern.
    // offer the buyer a partial refund instead (POST /v1/customer/disputes/{id}/make-offer, offer_type REFUND); the buyer
    // accepts or declines in PayPal, and an accepted offer closes the dispute with that refund
    // offerType REFUND (money back) or REPLACEMENT_WITHOUT_REFUND (the pro redoes the work, no money back)
    async makeOffer(disputeId, { amount = 0, note, currency = "USD", offerType = "REFUND" }) { await call("POST", `/v1/customer/disputes/${disputeId}/make-offer`, { note, offer_type: offerType, ...(offerType === "REFUND" ? { offer_amount: money(amount, currency) } : {}) }); return { status: "WAITING_FOR_BUYER_RESPONSE" }; },
    // what PayPal asked for (provide-supporting-info), and how PayPal reaches the seller on this case (PATCH)
    async supportingInfo(disputeId, { notes }) {
      const form = new FormData(); form.append("input", new Blob([JSON.stringify({ notes: String(notes).slice(0, 2000) })], { type: "application/json" }), "input.json");
      const r = await fetch(`${BASE}/v1/customer/disputes/${disputeId}/provide-supporting-info`, { method: "POST", headers: { Authorization: `Bearer ${await auth()}` }, body: form, signal: AbortSignal.timeout(20e3) });
      if (!r.ok) { const e = new Error(`PayPal provide-supporting-info: ${r.status}`); e.status = r.status; throw e; }
      return { sent: true };
    },
    async updateDisputeContact(disputeId, { email, note = "" }) { await call("PATCH", `/v1/customer/disputes/${disputeId}`, [{ op: "add", path: "/communication_detail", value: { email, note: String(note).slice(0, 2000) } }]); return { updated: true }; },
    // sandbox-only aids: PayPal decides a test dispute, or asks a side for evidence; and a card chargeback made on a
    // capture (PayPal's sandbox answered 500 to it on 2026-11-07, so it's kept for when it works)
    async sandboxAdjudicate(disputeId, outcome) { await call("POST", `/v1/customer/disputes/${disputeId}/adjudicate`, { adjudication_outcome: outcome }); return { outcome }; },
    async sandboxRequireEvidence(disputeId, side) { await call("POST", `/v1/customer/disputes/${disputeId}/require-evidence`, { action: side }); return { asked: side }; },
    async sandboxChargeback(captureId) { return call("POST", "/v2/customer-support/process-chargeback", { transaction_id: captureId }); },
    // a message to the buyer on the dispute (POST /v1/customer/disputes/{id}/send-message), and an appeal of PayPal's
    // decision with new evidence (POST /v1/customer/disputes/{id}/appeal, multipart like provide-evidence)
    // the buyer sent the item back (a return PayPal asked for): the seller says it arrived (POST .../acknowledge-return-item)
    async acknowledgeReturn(disputeId, { note }) { await call("POST", `/v1/customer/disputes/${disputeId}/acknowledge-return-item`, { note: String(note).slice(0, 2000), acknowledgement_type: "ITEM_RECEIVED" }); return { acknowledged: true }; },
    async disputeMessage(disputeId, message) {
      const form = new FormData(); form.append("message", String(message).slice(0, 2000));
      const r = await fetch(`${BASE}/v1/customer/disputes/${disputeId}/send-message`, { method: "POST", headers: { Authorization: `Bearer ${await auth()}` }, body: form, signal: AbortSignal.timeout(20e3) });
      if (!r.ok) { const e = new Error(`PayPal send-message: ${r.status}`); e.status = r.status; throw e; }
      return { sent: true };
    },
    async appealDispute(disputeId, { notes, file, fileName = "done-receipt.json", type = "PROOF_FOR_SOFTWARE_OR_SERVICE_DELIVERED" }) {
      const form = new FormData();
      form.append("input", new Blob([JSON.stringify({ evidences: [{ evidence_type: type, evidence_info: {}, notes: notes.slice(0, 2000) }] })], { type: "application/json" }), "input.json");
      if (file) form.append("file1", new Blob([file], { type: "application/json" }), fileName);
      const r = await fetch(`${BASE}/v1/customer/disputes/${disputeId}/appeal`, { method: "POST", headers: { Authorization: `Bearer ${await auth()}` }, body: form, signal: AbortSignal.timeout(20e3) });
      if (!r.ok) { const e = new Error(`PayPal appeal: ${r.status}`); e.status = r.status; throw e; }
      return { status: "UNDER_REVIEW" };
    },
    // amount: accept only part of the claim (PARTIAL_REFUND)
    async acceptClaim(disputeId, { note, amount = null, currency = "USD" }) { await call("POST", `/v1/customer/disputes/${disputeId}/accept-claim`, { note, accept_claim_type: amount ? "PARTIAL_REFUND" : "REFUND", ...(amount ? { refund_amount: money(amount, currency) } : {}) }); return { status: "RESOLVED" }; },
    // ---- Log in with PayPal (OpenID Connect) -------------------------------------------------------------------------
    loginUrl({ state, redirectUri }) { return `https://www.sandbox.paypal.com/connect?${new URLSearchParams({ flowEntry: "static", client_id: clientId, response_type: "code", scope: "openid email https://uri.paypal.com/services/paypalattributes", redirect_uri: redirectUri, state })}`; },
    async loginUserinfo({ code, redirectUri }) {
      const t = await fetch(`${BASE}/v1/oauth2/token`, { method: "POST", headers: { Authorization: `Basic ${Buffer.from(`${clientId}:${secret}`).toString("base64")}`, "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: redirectUri }), signal: AbortSignal.timeout(20e3) });
      if (!t.ok) throw new Error(`PayPal sign-in token: ${t.status}`);
      const { access_token } = await t.json();
      const u = await fetch(`${BASE}/v1/identity/oauth2/userinfo?schema=paypalv1.1`, { headers: { Authorization: `Bearer ${access_token}` }, signal: AbortSignal.timeout(20e3) });
      if (!u.ok) throw new Error(`PayPal userinfo: ${u.status}`);
      return u.json();
    },
    // ---- Webhooks ------------------------------------------------------------------------------------------------
    // the names PayPal accepts (GET /v1/notifications/webhooks-event-types): checked at startup against ours
    async eventTypes() { const j = await call("GET", "/v1/notifications/webhooks-event-types"); return (j.event_types || []).map((e) => e.name); },
    // one webhook for this URL: an existing one gets our current event list (PATCH), not a second webhook
    async ensureWebhook(url, events) {
      const list = await call("GET", "/v1/notifications/webhooks");
      const have = (list.webhooks || []).find((w) => w.url === url);
      if (have) {
        const now = new Set((have.event_types || []).map((e) => e.name));
        if (events.length !== now.size || events.some((e) => !now.has(e))) { await call("PATCH", `/v1/notifications/webhooks/${have.id}`, [{ op: "replace", path: "/event_types", value: events.map((name) => ({ name })) }]); return { id: have.id, created: false, updated: true }; }
        return { id: have.id, created: false };
      }
      const j = await call("POST", "/v1/notifications/webhooks", { url, event_types: events.map((name) => ({ name })) });
      return { id: j.id, created: true };
    },
    // PayPal's sample of an event (POST /v1/notifications/simulate-event); PayPal also tries to deliver it to url
    // PayPal's record of the events it sent us (GET /v1/notifications/webhooks-events), one event, and a resend
    async webhookEvents({ since, until, type } = {}) { const z = (t) => new Date(t).toISOString().replace(/\.\d{3}Z$/, "Z"); const q = new URLSearchParams({ page_size: "50", ...(since ? { start_time: z(since) } : {}), ...(until ? { end_time: z(until) } : {}), ...(type ? { event_type: type } : {}) }); const j = await call("GET", `/v1/notifications/webhooks-events?${q}`); return (j.events || []).map((e) => ({ id: e.id, type: e.event_type, at: e.create_time, summary: e.summary || null, status: e.status || null })); },
    async webhookEvent(id) { return call("GET", `/v1/notifications/webhooks-events/${id}`); },
    async listWebhooks() { const j = await call("GET", "/v1/notifications/webhooks"); return (j.webhooks || []).map((w) => ({ id: w.id, url: w.url, events: (w.event_types || []).length })); },
    async moveWebhook(id, url) { await call("PATCH", `/v1/notifications/webhooks/${id}`, [{ op: "replace", path: "/url", value: url }]); return { id, url }; },
    async deleteWebhook(id) { await call("DELETE", `/v1/notifications/webhooks/${id}`); return { deleted: true }; },
    // events of other accounts (onboarded pros) routed to this app (webhooks-lookup)
    async webhookLookups() { const j = await call("GET", "/v1/notifications/webhooks-lookup"); return (j.webhooks_lookups || []).map((l) => ({ id: l.id, account: l.account_number || l.client_id || null })); },
    async addWebhookLookup() { const j = await call("POST", "/v1/notifications/webhooks-lookup", {}); return { id: j.id }; },
    async resendWebhookEvent(id) { const j = await call("POST", `/v1/notifications/webhooks-events/${id}/resend`, {}); return { status: j.status || "PENDING" }; },
    // the platform's invoices in PayPal, searched (POST /v2/invoicing/search-invoices)
    // reference (the job), an amount range (cents), paid between dates, archived
    async searchInvoices({ status = [], recipient = null, since = null, reference = null, min = null, max = null, paidSince = null, archived = null } = {}) {
      const today = new Date().toISOString().slice(0, 10);
      const j = await call("POST", "/v2/invoicing/search-invoices?page_size=20&total_required=true", { ...(status.length ? { status } : {}), ...(recipient ? { recipient_email: recipient } : {}), ...(since ? { invoice_date_range: { start: since, end: today } } : {}), ...(reference ? { reference } : {}),
        ...(min != null || max != null ? { total_amount_range: { lower_amount: money(min ?? 0), upper_amount: money(max ?? 99999999) } } : {}), ...(paidSince ? { payment_date_range: { start: paidSince, end: today } } : {}), ...(archived != null ? { archived: !!archived } : {}) });
      return { total: j.total_items ?? (j.items || []).length, items: (j.items || []).map((v) => ({ id: v.id, number: v.detail?.invoice_number || null, status: v.status, amount: cents(v.amount?.value), due: cents(v.due_amount?.value), recipient: v.primary_recipients?.[0]?.billing_info?.email_address || null, date: v.detail?.invoice_date || null })) };
    },
    async simulateWebhook({ url, eventType }) { return call("POST", "/v1/notifications/simulate-event", { url, event_type: eventType, resource_version: eventType.startsWith("CUSTOMER.DISPUTE") ? "1.0" : "2.0" }); },
    async verifyWebhook(headers, rawBody, webhookId) {
      const h = (k) => headers[k] || headers[k.toLowerCase()];
      // the event goes back exactly as it came: parsing and writing it again can change it and fail the check
      const head = JSON.stringify({ auth_algo: h("paypal-auth-algo"), cert_url: h("paypal-cert-url"), transmission_id: h("paypal-transmission-id"), transmission_sig: h("paypal-transmission-sig"), transmission_time: h("paypal-transmission-time"), webhook_id: webhookId });
      const j = await call("POST", "/v1/notifications/verify-webhook-signature", `${head.slice(0, -1)},"webhook_event":${rawBody}}`);
      return j.verification_status === "SUCCESS";
    },
  };
}
