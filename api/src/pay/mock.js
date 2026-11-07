// A stand-in for PayPal with the same calls as paypal.js, for tests and for running VeriPay before sandbox keys are
// set (PAYPAL_MODE=mock, the default without PAYPAL_CLIENT_ID). The payer's approval is a page this server shows itself
// (/mock-paypal/approve), clearly marked as a simulation. It follows PayPal's rules where the platform depends on them:
//   an authorization is good for 29 days, with a 3-day honor period; it can be reauthorized once, on days 4 to 29
//   (REAUTHORIZATION_TOO_SOON before); captures can't exceed it; a final capture closes it; void only an open one
//   refunds can't exceed the capture; the same PayPal-Request-Id gives the same answer
// Times come from the platform's clock (clock.js), so the demo's skipped days age a hold the way real days would.
// Fees follow PayPal's US rate for the demo: 3.49% + $0.49 per capture. Nothing here moves money or talks to PayPal.
import crypto from "node:crypto";
import { store, stateFile } from "../store.js";
import { now } from "../clock.js";
import { vaultKind } from "./paypal.js";

const id = (p) => `${p}${crypto.randomBytes(6).toString("hex").toUpperCase()}`;
const fee = (c) => Math.round(c * 0.0349) + 49;
const DAY = 864e5;
const noAccount = (r) => /^unclaimed/i.test(r) || /@done-demo.example$/i.test(r);
// a Venmo item (recipient_wallet VENMO, a phone): PayPal's sandbox refuses the whole batch with 400 VALIDATION_ERROR
// "Recipient wallet not supported in sandbox" (our run, docs/live-test/sandbox/venmo-tips-1.json), so the stand-in does
// the same by default; DONE_MOCK_VENMO=accept makes it answer as production would (SUCCESS), for showing the flow.
const venmoAccepted = () => process.env.DONE_MOCK_VENMO === "accept";
const venmoStatus = (x) => (x.wallet === "VENMO" ? "SUCCESS" : null);
const err = (status, issue, msg) => Object.assign(new Error(`PayPal (stand-in): ${status} ${issue}${msg ? ` ${msg}` : ""}`), { status, issue });
const KINDS = ["orders", "auths", "captures", "refunds", "payouts", "setups", "tokens", "byRequest", "invoices", "disputes", "logins", "subs", "events", "templates", "merchants", "stc", "links", "plans", "seq"];
// the event names PayPal's webhooks-event-types listed (2026-11-07) that VeriPay subscribes to or handles
export const EVENT_NAMES = ["CHECKOUT.ORDER.APPROVED", "CHECKOUT.ORDER.COMPLETED", "CHECKOUT.PAYMENT-APPROVAL.REVERSED", "PAYMENT.AUTHORIZATION.CREATED", "PAYMENT.AUTHORIZATION.VOIDED", "PAYMENT.CAPTURE.COMPLETED", "PAYMENT.CAPTURE.DENIED", "PAYMENT.CAPTURE.DECLINED", "PAYMENT.CAPTURE.PENDING", "PAYMENT.CAPTURE.REVERSED", "PAYMENT.CAPTURE.REFUNDED", "PAYMENT.REFUND.PENDING", "PAYMENT.REFUND.FAILED", "PAYMENT.PAYOUTSBATCH.SUCCESS", "PAYMENT.PAYOUTSBATCH.DENIED", "PAYMENT.PAYOUTS-ITEM.SUCCEEDED", "PAYMENT.PAYOUTS-ITEM.UNCLAIMED", "PAYMENT.PAYOUTS-ITEM.RETURNED", "PAYMENT.PAYOUTS-ITEM.FAILED", "PAYMENT.PAYOUTS-ITEM.BLOCKED", "PAYMENT.PAYOUTS-ITEM.HELD", "PAYMENT.PAYOUTS-ITEM.REFUNDED", "PAYMENT.PAYOUTS-ITEM.CANCELED", "CUSTOMER.DISPUTE.CREATED", "CUSTOMER.DISPUTE.UPDATED", "CUSTOMER.DISPUTE.RESOLVED", "INVOICING.INVOICE.PAID", "INVOICING.INVOICE.CANCELLED", "INVOICING.INVOICE.REFUNDED", "INVOICING.INVOICE.SCHEDULED", "INVOICING.INVOICE.UPDATED", "BILLING.SUBSCRIPTION.ACTIVATED", "BILLING.SUBSCRIPTION.SUSPENDED", "BILLING.SUBSCRIPTION.CANCELLED", "BILLING.SUBSCRIPTION.EXPIRED", "BILLING.SUBSCRIPTION.PAYMENT.FAILED", "PAYMENT.SALE.COMPLETED", "PAYMENT.SALE.REFUNDED", "PAYMENT.SALE.REVERSED", "VAULT.PAYMENT-TOKEN.CREATED", "VAULT.PAYMENT-TOKEN.DELETED", "VAULT.PAYMENT-TOKEN.DELETION-INITIATED", "MERCHANT.ONBOARDING.COMPLETED", "MERCHANT.PARTNER-CONSENT.REVOKED", "CUSTOMER.MERCHANT-INTEGRATION.SELLER-CONSENT-GRANTED", "CUSTOMER.MERCHANT-INTEGRATION.SELLER-EMAIL-CONFIRMED", "CUSTOMER.MERCHANT-INTEGRATION.CAPABILITY-UPDATED"];

export function mockPaypal({ publicUrl = "http://localhost:8810", file = stateFile("paypal-standin"), allowMultiparty = false } = {}) {
  const db = store(file, Object.fromEntries(KINDS.map((k) => [k, {}])));
  const T = (k) => (db.data[k] ||= {}); // a kind added later is created on first use in an older state file
  const save = () => db.save();
  const once = (rid, fn) => { if (rid && rid in T("byRequest")) return structuredClone(T("byRequest")[rid]); const r = fn(); if (rid) T("byRequest")[rid] = r; save(); return structuredClone(r); };
  const iso = (t) => new Date(t).toISOString();
  const authView = (a) => ({ id: a.id, status: a.status, amount: a.amount, expiresAt: iso(a.expires), createdAt: iso(a.created), honorUntil: iso(a.created + 3 * DAY), ...(a.processor ? { processor: a.processor } : {}), sellerProtection: { status: "NOT_ELIGIBLE", categories: [] }, ...(a.ntr ? { ntr: a.ntr } : {}), ...(a.statusReason ? { statusReason: a.statusReason } : {}) });
  const newAuth = (order, amount, { expires, parent = null } = {}) => {
    const t = now(), a = { id: id("AUTH-"), order, amount, captured: 0, status: "CREATED", created: t, expires: expires ?? t + 29 * DAY, parent, reauthorized: false };
    T("auths")[a.id] = a; return a;
  };
  const tokenOf = (vaultId) => {
    const [kind, vid] = vaultKind(vaultId), t = T("tokens")[vid];
    if (!t || t.deleted) throw err(422, "INVALID_PAYMENT_SOURCE", "unknown vault_id");
    if (t.failNext) { t.failNext = false; save(); throw err(422, "INSTRUMENT_DECLINED"); }
    return { kind, t };
  };
  const mkEvent = (eventType) => ({ id: id("WH-SIM-"), event_type: eventType, create_time: new Date().toISOString(), summary: `Simulated ${eventType}`, resource_type: eventType.split(".")[1]?.toLowerCase() || "event", resource: eventType.startsWith("CUSTOMER.DISPUTE") ? { dispute_id: id("PP-D-"), reason: "MERCHANDISE_OR_SERVICE_NOT_AS_DESCRIBED", disputed_transactions: [{ seller_transaction_id: id("CAP-") }] } : { id: id("SIM-"), custom_id: null } });
  const vault = (kind, o) => { const t = { id: id(kind === "card" ? "CARD-" : "VT-"), kind, customerId: id("CUST-"), created: now() }; T("tokens")[t.id] = t; o.vaultId = `${kind}:${t.id}`; return o.vaultId; };
  const live = (a) => a.status === "CREATED" || a.status === "PARTIALLY_CAPTURED";
  const capView = (c) => ({ id: c.id, status: c.refunded >= c.amount ? "REFUNDED" : c.refunded ? "PARTIALLY_REFUNDED" : "COMPLETED", amount: c.amount, fee: c.fee, net: c.amount - c.fee, final: c.final ?? true });

  const api = {
    mode: "mock", testCard: true,
    async authorize({ amount, reference, description = "", vaultId = null, card: testCardUsed = false, singleUseToken = null, save: keep = true, requestId, multiparty = null, venmo = false, items = null, level2 = null, ctx = {} }) {
      const card = testCardUsed || !!singleUseToken; // a Fastlane token authorizes at once, like the card
      return once(requestId, () => {
        // like the sandbox without partner onboarding (docs/live-test/sandbox/multiparty-1.json), unless told otherwise
        if (multiparty && !allowMultiparty && !multiparty.merchantId) throw err(422, "UNSUPPORTED_PAYMENT_INSTRUCTION"); // an onboarded merchant (Partner Referrals) is accepted
        const o = { id: id("MOCK-"), intent: "AUTHORIZE", amount, reference, description, status: "PAYER_ACTION_REQUIRED", save: keep, created: now(), authorization: null, vaultId: null, venmo, items: items?.length && items.reduce((t, x) => t + x.amount, 0) === amount ? items : null, level2: (testCardUsed || singleUseToken || String(vaultId || "").startsWith("card:")) ? level2 : null, invoiceId: ctx.invoiceId || null, site: ctx.site || null, locale: ctx.locale || null, prevNtr: ctx.ntr || null };
        T("orders")[o.id] = o;
        if (vaultId) {
          const { kind } = tokenOf(vaultId);
          o.status = "COMPLETED"; o.source = kind; o.authorization = newAuth(o.id, amount).id;
          return { id: o.id, status: o.status, approveUrl: null, authorization: authView(T("auths")[o.authorization]), vaultId: null, customerId: null, payerEmail: null, card: kind === "card" ? { brand: "VISA", last4: "1881" } : null };
        }
        // 3-D Secure asked every time (PAYPAL_3DS=SCA_ALWAYS): the card order waits for the (simulated) verification page
        if (card && process.env.PAYPAL_3DS === "SCA_ALWAYS") { o.card3ds = true; return { id: o.id, status: o.status, approveUrl: `${publicUrl}/mock-paypal/approve?token=${o.id}`, authorization: null, vaultId: null }; }
        // the sandbox's decline trigger: CCREJECT-* as the cardholder name (sandbox answered DENIED, 0500, on 2026-11-07)
        if (card && /^CCREJECT/.test(ctx.cardName || "")) { o.status = "COMPLETED"; o.source = "card"; const a = newAuth(o.id, amount); a.status = "DENIED"; a.processor = { avs: "G", cvv: "P", response: "0500" }; a.statusReason = "DECLINED_BY_PROCESSOR"; o.authorization = a.id; return { id: o.id, status: o.status, approveUrl: null, authorization: authView(a), vaultId: null }; }
        if (card) {
          o.status = "COMPLETED"; o.source = "card"; o.authorization = newAuth(o.id, amount).id; T("auths")[o.authorization].processor = { avs: null, cvv: "M", response: "0000" }; T("auths")[o.authorization].ntr = { id: String(1e14 + Math.floor(Math.random() * 9e14)), network: "VISA" }; // what the sandbox answered for its test card (2026-11-07)
          const v = keep ? vault("card", o) : null;
          return { id: o.id, status: o.status, approveUrl: null, authorization: authView(T("auths")[o.authorization]), vaultId: v, vaultStatus: v ? "VAULTED" : null, customerId: null, payerEmail: null, card: { brand: "VISA", last4: "1881" } };
        }
        return { id: o.id, status: o.status, approveUrl: `${publicUrl}/mock-paypal/approve?token=${o.id}`, authorization: null, vaultId: null };
      });
    },
    // PayPal: PATCH /v2/checkout/orders/{id} replaces the amount while the order is CREATED or APPROVED (not after)
    async addTracking(oid, { captureId, carrier, trackingNumber }) {
      const o = T("orders")[oid];
      if (!o) throw err(404, "RESOURCE_NOT_FOUND");
      const c = T("captures")[captureId];
      if (!c || c.order !== oid) throw err(422, "CAPTURE_ID_NOT_FOUND");
      if (!carrier || !trackingNumber) throw err(400, "MISSING_REQUIRED_PARAMETER");
      (o.trackers ||= []).push({ id: `${captureId}-${trackingNumber}`, status: "SHIPPED", carrier, trackingNumber });
      return { id: o.id, status: "COMPLETED", trackers: o.trackers.map((t) => ({ id: t.id, status: t.status })) };
    },
    async patchOrder(oid, { description = null, invoiceId = null }) { const o = T("orders")[oid]; if (!o) throw err(404, "RESOURCE_NOT_FOUND"); if (!["PAYER_ACTION_REQUIRED", "CREATED", "APPROVED"].includes(o.status)) throw err(422, "ORDER_ALREADY_COMPLETED"); if (description) o.description = description; if (invoiceId) o.invoiceId = invoiceId; save(); return { patched: [description && "description", invoiceId && "invoice_id"].filter(Boolean) }; },
    // the test card put on the order the customer was asked to approve (confirm-payment-source), then authorized
    async confirmCard(oid, requestId) { return once(requestId, () => { const o = T("orders")[oid]; if (!o) throw err(404, "RESOURCE_NOT_FOUND"); if (o.status !== "PAYER_ACTION_REQUIRED" && o.status !== "APPROVED") throw err(422, "ORDER_ALREADY_COMPLETED"); o.status = "COMPLETED"; o.source = "card"; const a = newAuth(o.id, o.amount); a.processor = { avs: null, cvv: "M", response: "0000" }; o.authorization = a.id; const v = o.save ? vault("card", o) : null; return { id: o.id, status: "COMPLETED", authorization: authView(a), vaultId: v, card: { brand: "VISA", last4: "1881" } }; }); },
    async updateTracker(oid, tid, { status = null, trackingNumber = null }) { const o = T("orders")[oid]; const t = o?.trackers?.find((x) => x.id === tid); if (!t) throw err(404, "RESOURCE_NOT_FOUND"); if (status) t.status = status; if (trackingNumber) t.trackingNumber = trackingNumber; save(); return { id: tid, status: t.status }; },
    async updateOrderAmount(oid, { amount, items = null }) {
      const o = T("orders")[oid];
      if (!o) throw err(404, "RESOURCE_NOT_FOUND");
      if (!["PAYER_ACTION_REQUIRED", "CREATED", "APPROVED"].includes(o.status)) throw err(422, "ORDER_ALREADY_COMPLETED");
      if (!(amount > 0)) throw err(422, "INVALID_PARAMETER_VALUE");
      if (o.items && !(items?.length && items.reduce((t, x) => t + x.amount, 0) === amount)) throw err(422, "ITEM_TOTAL_MISMATCH"); // PayPal checks the items still add up
      if (o.items) o.items = items;
      o.amount = amount;
      return { id: o.id, status: o.status === "PAYER_ACTION_REQUIRED" ? "CREATED" : o.status, amount };
    },
    async authorizeOrder(oid, requestId) {
      return once(requestId, () => {
        const o = T("orders")[oid];
        if (!o) throw err(404, "RESOURCE_NOT_FOUND");
        if (o.status === "COMPLETED" && o.authorization) return { id: o.id, status: o.status, authorization: authView(T("auths")[o.authorization]), vaultId: o.vaultId, payerEmail: o.payerEmail || null };
        if (o.status !== "APPROVED") throw err(422, "ORDER_NOT_APPROVED");
        o.status = "COMPLETED"; o.source = o.card3ds ? "card" : o.venmo ? "venmo" : "paypal"; o.authorization = newAuth(o.id, o.amount).id;
        const v = o.save ? vault(o.source, o) : null;
        if (o.card3ds) { save(); return { id: o.id, status: o.status, authorization: authView(T("auths")[o.authorization]), vaultId: v, vaultStatus: v ? "VAULTED" : null, payerEmail: null, card: { brand: "VISA", last4: "1881" }, threeDS: { liabilityShift: "POSSIBLE", enrollment: "Y", authentication: "Y" } }; }
        return { id: o.id, status: o.status, authorization: authView(T("auths")[o.authorization]), vaultId: v, vaultStatus: v ? "VAULTED" : null, payerEmail: o.payerEmail, ...(o.payerEmail ? { payerContact: { email: o.payerEmail, phone: "5125550142" } } : {}) };
      });
    },
    async getOrder(oid) {
      const o = T("orders")[oid];
      if (!o) throw err(404, "RESOURCE_NOT_FOUND");
      const a = o.authorization ? T("auths")[o.authorization] : null;
      return { id: o.id, status: o.status, intent: o.intent, authorization: a ? authView(a) : null, payerId: o.payerId || null, vaultId: o.vaultId || null, items: o.items || null, level2: o.level2 || null, invoiceId: o.invoiceId || null, site: o.site || null, description: o.description, locale: o.locale || null, prevNtr: o.prevNtr || null };
    },
    async getAuthorization(aid) {
      const a = T("auths")[aid];
      if (!a) throw err(404, "RESOURCE_NOT_FOUND");
      if (live(a) && a.expires < now()) { a.status = "EXPIRED"; save(); }
      return authView(a);
    },
    async capture(aid, { amount, final = true, requestId, delayed = false, softDescriptor = null }) {
      return once(requestId, () => {
        const a = T("auths")[aid];
        if (!a) throw err(404, "RESOURCE_NOT_FOUND");
        if (live(a) && a.expires < now()) a.status = "EXPIRED";
        if (a.status === "EXPIRED") throw err(422, "AUTHORIZATION_EXPIRED");
        if (!live(a)) throw err(422, a.status === "VOIDED" ? "AUTHORIZATION_VOIDED" : "AUTHORIZATION_ALREADY_CAPTURED");
        // PayPal's over-capture: up to 115% of the authorization or $75 more, whichever is less (an account that isn't
        // enabled for it refuses: PAYPAL_MOCK_NO_OVERCAPTURE=1 plays that account)
        const over = process.env.PAYPAL_MOCK_NO_OVERCAPTURE === "1" ? 0 : Math.min(Math.round(a.amount * 0.15), 7500);
        if (!(amount > 0) || a.captured + amount > a.amount + over) throw err(422, "MAX_CAPTURE_AMOUNT_EXCEEDED");
        a.captured += amount; a.status = final || a.captured >= a.amount ? "CAPTURED" : "PARTIALLY_CAPTURED";
        const c = { id: id("CAP-"), auth: aid, order: a.order, amount, fee: fee(amount), refunded: 0, final, at: now(), ...(delayed ? { delayed: true } : {}) };
        T("captures")[c.id] = c;
        return capView(c);
      });
    },
    async getCapture(cid) { const c = T("captures")[cid]; if (!c) throw err(404, "RESOURCE_NOT_FOUND"); return capView(c); },
    async voidAuthorization(aid, requestId) {
      return once(requestId, () => {
        const a = T("auths")[aid];
        if (!a) throw err(404, "RESOURCE_NOT_FOUND");
        if (a.status === "VOIDED") return { status: "VOIDED" };
        if (!live(a)) throw err(422, "CANNOT_BE_VOIDED"); // (the rest of a partly captured one can be voided, as in the sandbox)
        a.status = "VOIDED";
        return { status: "VOIDED" };
      });
    },
    async reauthorize(aid, { amount, requestId }) {
      return once(requestId, () => {
        const a = T("auths")[aid];
        if (!a) throw err(404, "RESOURCE_NOT_FOUND");
        const t = now();
        if (!live(a) || a.captured > 0) throw err(422, "AUTHORIZATION_ALREADY_CAPTURED");
        if (a.reauthorized || a.parent) throw err(422, "MAX_NUMBER_OF_REAUTHORIZATIONS_EXCEEDED");
        if (t < a.created + 3 * DAY) throw err(422, "REAUTHORIZATION_TOO_SOON");
        if (t > a.expires) { a.status = "EXPIRED"; throw err(422, "AUTHORIZATION_EXPIRED"); }
        a.reauthorized = true; a.status = "REAUTHORIZED";
        const n = newAuth(a.order, amount ?? a.amount, { expires: a.expires, parent: a.id });
        T("orders")[a.order].authorization = n.id;
        return authView(n);
      });
    },
    // the fallback: intent CAPTURE, charged now
    async charge({ amount, reference, description = "", vaultId = null, card = false, save: keep = true, requestId, ctx = {} }) {
      return once(requestId, () => {
        const o = { id: id("MOCK-"), intent: "CAPTURE", amount, reference, description, status: "PAYER_ACTION_REQUIRED", save: keep, created: now() };
        T("orders")[o.id] = o;
        if (!vaultId && !card) return { id: o.id, status: o.status, approveUrl: `${publicUrl}/mock-paypal/approve?token=${o.id}`, capture: null, vaultId: null };
        if (vaultId) tokenOf(vaultId);
        const c = { id: id("CAP-"), order: o.id, amount, fee: fee(amount), refunded: 0, final: true, at: now() };
        T("captures")[c.id] = c; o.status = "COMPLETED"; o.capture = c.id;
        return { id: o.id, status: "COMPLETED", approveUrl: null, capture: capView(c), vaultId: !vaultId && keep ? vault("card", o) : null };
      });
    },
    async captureOrder(oid, requestId) {
      return once(requestId, () => {
        const o = T("orders")[oid];
        if (!o || o.status !== "APPROVED") throw err(422, "ORDER_NOT_APPROVED");
        const c = { id: id("CAP-"), order: o.id, amount: o.amount, fee: fee(o.amount), refunded: 0, final: true, at: now() };
        T("captures")[c.id] = c; o.status = "COMPLETED"; o.capture = c.id;
        return { id: o.id, status: "COMPLETED", capture: capView(c), vaultId: o.save ? vault("paypal", o) : null, payerEmail: o.payerEmail };
      });
    },
    async refund(cid, { amount, requestId, onBehalfOf = null, customId = null, invoiceId = null }) {
      return once(requestId, () => {
        const c = T("captures")[cid];
        if (!c) throw err(404, "RESOURCE_NOT_FOUND");
        if (!(amount > 0) || c.refunded + amount > c.amount) throw err(422, "REFUND_AMOUNT_EXCEEDED");
        c.refunded += amount;
        const r = { id: id("REF-"), capture: cid, amount, at: now() };
        T("refunds")[r.id] = r;
        return { id: r.id, status: "COMPLETED", amount };
      });
    },
    // (a receiver with no PayPal account comes back UNCLAIMED, as in the sandbox: an address starting with "unclaimed",
    // or a demo stand-in address @done-demo.example)
    async payoutBatch({ batchId, items }) {
      if (items.some((x) => x.wallet === "VENMO") && !venmoAccepted()) throw err(400, "VALIDATION_ERROR", "Recipient wallet not supported in sandbox.");
      return once(`payout:${batchId}`, () => {
        const p = { batchId: id("PAYOUT-"), sender: batchId, at: now(), items: items.map((x) => ({ id: x.id, itemId: id("ITEM-"), receiver: x.receiver, wallet: x.wallet === "VENMO" ? "VENMO" : "PAYPAL", amount: x.amount, status: venmoStatus(x) || (noAccount(x.receiver) ? "UNCLAIMED" : "SUCCESS"), transactionId: venmoStatus(x) === "UNCLAIMED" || (!venmoStatus(x) && noAccount(x.receiver)) ? null : id("TX-") })) };
        T("payouts")[p.batchId] = p;
        return { batchId: p.batchId, status: "PENDING" };
      });
    },
    async releaseDelayed(cid) { const c = T("captures")[cid]; if (!c) throw err(422, "TRANSACTION_NOT_VALID"); if (!c.delayed) throw err(422, "TRANSACTION_NOT_DELAYED"); if (c.released) throw err(422, "ALREADY_RELEASED"); c.released = now(); save(); return { itemId: id("RPI-"), status: "SUCCESS" }; },
    async cancelPayoutItem(itemId) { for (const p of Object.values(T("payouts"))) { const x = p.items.find((y) => y.itemId === itemId); if (x) { if (x.status !== "UNCLAIMED") throw err(400, "ITEM_INCORRECT_STATUS", "Only items in Unclaimed status can be cancelled."); x.status = "RETURNED"; save(); return { status: "RETURNED" }; } } throw err(404, "RESOURCE_NOT_FOUND"); },
    async getPayout(batchId) {
      const p = T("payouts")[batchId];
      if (!p) throw err(404, "RESOURCE_NOT_FOUND");
      return { batchId, status: "SUCCESS", items: p.items.map((x) => ({ ...x, fee: 25 })) };
    },
    async invoice({ recipient, item, amount, requestId, allowTip = false, minDue = null, lines = null, sendOn = null, reference = null, payTerm = "DUE_ON_RECEIPT" }) {
      const tax = (lines || []).reduce((t, x) => t + Math.round((x.amount * (x.qty || 1) * (x.taxPct || 0)) / 100), 0), later = sendOn && sendOn > new Date().toISOString().slice(0, 10);
      return once(requestId, () => { const v = { id: id("INV2-"), recipient, item, amount: amount + tax, base: amount, tax, reference, payTerm, sendOn, status: later ? "SCHEDULED" : "SENT", allowTip: !!allowTip, minDue, paid: 0, tip: 0 }; T("invoices")[v.id] = v; return { id: v.id, url: `${publicUrl}/mock-paypal/approve?invoice=${v.id}`, status: v.status }; });
    },
    async getInvoice(iid) { const v = T("invoices")[iid]; return { id: iid, status: v?.status || "UNKNOWN", url: `${publicUrl}/mock-paypal/approve?invoice=${iid}`, paid: ["PAID", "MARKED_AS_PAID"].includes(v?.status) ? v.amount : v?.paid || 0, tip: v?.tip || 0, total: v?.amount ?? null, tax: v?.tax || 0, refunded: (v?.refunds || []).reduce((t, r) => t + r.amount, 0), due: v ? Math.max(0, v.amount - (v.status === "PAID" ? v.amount : v.paid || 0)) : null, external: v?.status === "MARKED_AS_PAID" }; },
    // the customer pays the stand-in's invoice: in full, or a part (at least minDue), with a tip when it allows one
    payInvoice(iid, { amount = null, tip = 0 } = {}) { const v = T("invoices")[iid]; if (!v || !["SENT", "PARTIALLY_PAID"].includes(v.status)) return null; const left = v.amount - (v.paid || 0), a = amount ?? left;
      if (a < left && !(v.minDue && a >= v.minDue)) throw err(422, "PARTIAL_PAYMENT_NOT_ALLOWED"); if (tip && !v.allowTip) throw err(422, "TIP_NOT_ALLOWED");
      v.paid = (v.paid || 0) + Math.min(a, left); v.tip = (v.tip || 0) + tip; v.status = v.paid >= v.amount ? "PAID" : "PARTIALLY_PAID"; save(); return v.status; },
    // a real QR code, of the stand-in's pay page for the invoice
    async invoiceQr(iid) { if (!T("invoices")[iid]) throw err(404, "RESOURCE_NOT_FOUND"); const QR = (await import("qrcode")).default; return { png: (await QR.toDataURL(`${publicUrl}/mock-paypal/approve?invoice=${iid}`, { width: 300, margin: 1 })).split(",")[1] }; },
    async remindInvoice(iid) { const v = T("invoices")[iid]; if (!v) throw err(404, "RESOURCE_NOT_FOUND"); if (v.status !== "SENT") throw err(422, "INVALID_INVOICE_STATUS"); v.reminders = (v.reminders || 0) + 1; save(); return { reminded: true }; },
    async createInvoiceTemplate({ name, item, amount }) { const v = { id: id("TEMP-"), name, item, amount }; T("templates")[v.id] = v; save(); return { id: v.id, name }; },
    async getInvoiceTemplate(tid) { const v = T("templates")[tid]; if (!v) throw err(404, "RESOURCE_NOT_FOUND"); return { ...v }; },
    async deleteInvoiceTemplate(tid) { if (!T("templates")[tid]) throw err(404, "RESOURCE_NOT_FOUND"); delete T("templates")[tid]; save(); return { deleted: true }; },
    async cancelInvoice(iid) { const v = T("invoices")[iid]; if (!v) throw err(404, "RESOURCE_NOT_FOUND"); if (v.status !== "SENT") throw err(422, "INVALID_INVOICE_STATUS"); v.status = "CANCELLED"; save(); return { status: "CANCELLED" }; },
    async recordInvoicePayment(iid, { method, amount }) { const v = T("invoices")[iid]; if (!v) throw err(404, "RESOURCE_NOT_FOUND"); if (v.status !== "SENT") throw err(422, "INVALID_INVOICE_STATUS"); v.status = "MARKED_AS_PAID"; v.external = { method, amount }; save(); return { paymentId: id("EXTR-") }; },
    // Subscriptions: approved on the simulated page; the first month is charged on approval, later ones by billNow
    // card: like the sandbox (2026-11-07), a card subscriber is ACTIVE at once and charged; trial: the first cycle is free
    async subscribe({ name, amount, reference, setupFee = 0, every = 1, cycles = 0, trial = false, taxPct = 0, units = 0, card = false, startTime = null, trade = null }) { const sid = id("I-"); const plan = id("P-"); T("subs")[sid] = { id: sid, plan, name, amount: amount * (units || 1) + Math.round(amount * (units || 1) * (taxPct || 0) / 100), reference, setupFee, every, cycles, trial, taxPct, units, startTime, trade, status: "APPROVAL_PENDING", payments: [] }; if (card) this.approve({ subscription: sid }); save(); return { id: sid, plan, product: "PROD-STANDIN", status: T("subs")[sid].status, shared: !!arguments[0].shared && !trial && !setupFee && !taxPct && !units, approveUrl: `${publicUrl}/mock-paypal/approve?subscription=${sid}` }; },
    async getSubscription(sid) { const x = T("subs")[sid]; if (!x) throw err(404, "RESOURCE_NOT_FOUND"); return { id: sid, status: x.status, nextBilling: x.next || null, failed: x.outstanding ? 1 : 0, outstanding: x.outstanding || 0, lastFailed: x.outstanding ? { amount: x.amount, at: x.failedAt || null, reason: "PAYMENT_DENIED" } : null, lastPaid: x.payments.at(-1) ? { amount: x.payments.at(-1).amount, at: x.payments.at(-1).at } : null, cyclesDone: x.payments.length, quantity: x.units || null }; },
    async product(trade = null) { return `PROD-STANDIN${trade ? `-${trade}` : ""}`; },
    async getProduct(pid) { return { id: pid, name: "VeriPay maintenance plan", category: "SERVICES" }; },
    async deactivatePlan(planId) { (T("plans")[planId] ||= {}).status = "INACTIVE"; save(); return { status: "INACTIVE" }; },
    async patchPlan(planId, { failureThreshold = null }) { (T("plans")[planId] ||= {}).failureThreshold = failureThreshold; save(); return { patched: 1 }; },
    async patchSubscriptionPrice(sid, { amount }) { const x = T("subs")[sid]; if (!x) throw err(404, "RESOURCE_NOT_FOUND"); if (x.status !== "ACTIVE" && x.status !== "SUSPENDED") throw err(422, "SUBSCRIPTION_STATUS_INVALID"); x.amount = amount; save(); return { amount }; },
    async reviseSubscription(sid, { units = null }) { const x = T("subs")[sid]; if (!x) throw err(404, "RESOURCE_NOT_FOUND"); x.reviseTo = units; save(); return { approveUrl: `${publicUrl}/mock-paypal/approve?subscription=${sid}&revise=1`, planChanged: false }; },
    async captureSubscriptionBalance(sid, { amount, requestId }) { return once(requestId, () => { const x = T("subs")[sid]; if (!x) throw err(404, "RESOURCE_NOT_FOUND"); if (!x.outstanding) throw err(422, "ZERO_OUTSTANDING_BALANCE"); const p = { id: id("SUBTX-"), status: "COMPLETED", amount: Math.min(amount, x.outstanding), fee: fee(Math.min(amount, x.outstanding)), at: new Date().toISOString() }; x.payments.push(p); x.outstanding -= p.amount; save(); return { id: p.id, status: "COMPLETED" }; }); },
    // the stand-in's card declines a month: the balance stays outstanding
    failBill(sid) { const x = T("subs")[sid]; if (!x || x.status !== "ACTIVE") return null; x.outstanding = (x.outstanding || 0) + x.amount; save(); return x.outstanding; },
    async subscriptionPayments(sid) { const x = T("subs")[sid]; if (!x) throw err(404, "RESOURCE_NOT_FOUND"); return x.payments.map((p) => ({ ...p })); },
    async suspendSubscription(sid) { const x = T("subs")[sid]; if (!x) throw err(404, "RESOURCE_NOT_FOUND"); if (x.status !== "ACTIVE") throw err(422, "SUBSCRIPTION_STATUS_INVALID"); x.status = "SUSPENDED"; save(); return { status: "SUSPENDED" }; },
    async activateSubscription(sid) { const x = T("subs")[sid]; if (!x) throw err(404, "RESOURCE_NOT_FOUND"); if (x.status !== "SUSPENDED") throw err(422, "SUBSCRIPTION_STATUS_INVALID"); x.status = "ACTIVE"; save(); return { status: "ACTIVE" }; },
    async updatePlanPrice(planId, { amount }) { const x = Object.values(T("subs")).find((y) => y.plan === planId); if (!x) throw err(404, "RESOURCE_NOT_FOUND"); x.amount = amount; save(); return { amount }; },
    async cancelSubscription(sid) { const x = T("subs")[sid]; if (!x) throw err(404, "RESOURCE_NOT_FOUND"); x.status = "CANCELLED"; save(); return { status: "CANCELLED" }; },
    async refundSubscriptionPayment(txId, { amount }) { for (const x of Object.values(T("subs"))) { const p = x.payments.find((y) => y.id === txId); if (p) { if (p.status === "REFUNDED") throw err(422, "TRANSACTION_ALREADY_REFUNDED"); p.status = "REFUNDED"; p.refunded = amount; save(); return { id: id("RF-"), status: "completed" }; } } throw err(404, "RESOURCE_NOT_FOUND"); },
    billNow(sid) { const x = T("subs")[sid]; if (!x || x.status !== "ACTIVE") return null; const p = { id: id("SUBTX-"), status: "COMPLETED", amount: x.amount, fee: fee(x.amount), at: new Date().toISOString() }; x.payments.push(p); x.next = new Date(Date.now() + 30 * 864e5).toISOString(); save(); return p; },
    // the platform's PayPal balance: what came in (captures, paid invoices) less what went out (refunds, payouts)
    async balances(currency = "USD") {
      const sum = (xs) => xs.reduce((t, x) => t + (x || 0), 0);
      const inn = sum(Object.values(T("captures")).map((c) => c.amount - (c.fee || 0))) + sum(Object.values(T("invoices")).filter((v) => v.status === "PAID").map((v) => v.amount)) + sum(Object.values(T("subs")).flatMap((x) => x.payments.map((p) => p.amount - p.fee - (p.refunded || 0))));
      const out = sum(Object.values(T("refunds")).map((r) => r.amount)) + sum(Object.values(T("payouts")).flatMap((p) => p.items.map((x) => x.amount)));
      return { currency, total: inn - out, available: inn - out, withheld: 0, asOf: new Date().toISOString(), account: "STAND-IN" };
    },
    async vaultSetup({ requestId, customerRef = null, venmo = false }) { return once(requestId, () => { const s = { id: id("SETUP-"), status: "PAYER_ACTION_REQUIRED", kind: venmo ? "venmo" : "paypal", customerRef }; T("setups")[s.id] = s; return { id: s.id, approveUrl: `${publicUrl}/mock-paypal/approve?setup=${s.id}`, status: s.status }; }); },
    // a card setup token: the test card is APPROVED at once, as the sandbox answered (2026-11-07)
    async vaultCardSetup({ requestId, customerRef = null, withTestCard = true }) { return once(requestId, () => { const s = { id: id("SETUP-"), status: withTestCard ? "APPROVED" : "PAYER_ACTION_REQUIRED", kind: "card", customerRef }; T("setups")[s.id] = s; return { id: s.id, status: s.status, approveUrl: null }; }); },
    async getSetupToken(sid) { const s = T("setups")[sid]; if (!s) throw err(404, "RESOURCE_NOT_FOUND"); return { id: s.id, status: s.status, customerId: null, kind: s.kind || "paypal" }; },
    async vaultToken(setupId, requestId) {
      return once(requestId, () => {
        const s = T("setups")[setupId];
        if (!s || s.status !== "APPROVED") throw err(422, "SETUP_TOKEN_NOT_APPROVED");
        const kind = s.kind || "paypal", o = {}; vault(kind, o); return { id: o.vaultId, kind, customerId: id("CUST-"), ...(kind === "card" ? { label: "VISA •••• 1881" } : {}) };
      });
    },
    async getPaymentToken(vaultId) { const [kind, vid] = vaultKind(vaultId), t = T("tokens")[vid]; if (!t || t.deleted) throw err(404, "RESOURCE_NOT_FOUND"); return { id: `${kind}:${vid}`, kind, customerId: t.customerId, label: kind === "card" ? "Visa •••• 1881" : "PayPal (stand-in)", expiry: kind === "card" ? "2030-12" : null }; },
    async listPaymentTokens(customerId) { return Object.values(T("tokens")).filter((t) => t.customerId === customerId && !t.deleted).map((t) => ({ id: `${t.kind}:${t.id}`, kind: t.kind, label: t.kind === "card" ? "Visa •••• 1881" : "PayPal (stand-in)" })); },
    async deletePaymentToken(vaultId) { const t = T("tokens")[vaultKind(vaultId)[1]]; if (!t || t.deleted) throw err(404, "RESOURCE_NOT_FOUND"); t.deleted = true; save(); return { deleted: true }; },
    async setTransactionContext(trackingId, data) { T("stc")[trackingId] = { data, at: now() }; save(); return { trackingId, merchant: "STA…", keys: Object.keys(data).filter((k) => data[k] != null && data[k] !== "") }; },
    async getPayoutItem(itemId) { for (const p of Object.values(T("payouts"))) { const x = p.items.find((i) => i.itemId === itemId); if (x) return { itemId, status: x.status, transactionId: x.transactionId || null, error: null, purpose: "SERVICES", amount: x.amount }; } throw err(404, "RESOURCE_NOT_FOUND"); },
    async releaseDelayedBatch(captureIds) { const out = []; for (const c of captureIds) out.push(await this.releaseDelayed(c)); return { batchId: id("RPB-"), status: "PROCESSING", items: out }; },
    async getReleasedItem(itemId) { return { itemId, status: "SUCCESS", reason: null }; },
    async updateInvoice(iid, change) { const v = T("invoices")[iid]; if (!v) throw err(404, "RESOURCE_NOT_FOUND"); if (!["DRAFT", "SCHEDULED"].includes(v.status)) throw err(422, "INVALID_INVOICE_STATUS"); Object.assign(v, change({ ...v }) || {}); save(); return { id: iid, status: v.status }; },
    async deleteInvoice(iid) { const v = T("invoices")[iid]; if (!v) throw err(404, "RESOURCE_NOT_FOUND"); if (!["DRAFT", "SCHEDULED"].includes(v.status)) throw err(422, "CANT_DELETE_INVOICE"); delete T("invoices")[iid]; save(); return { deleted: true }; },
    async recordInvoiceRefund(iid, { amount }) { const v = T("invoices")[iid]; if (!v) throw err(404, "RESOURCE_NOT_FOUND"); const r = { id: id("EXTR-"), amount }; (v.refunds ||= []).push(r); save(); return { refundId: r.id }; },
    async deleteInvoicePayment(iid, pid) { const v = T("invoices")[iid]; if (!v) throw err(404, "RESOURCE_NOT_FOUND"); if (v.status === "MARKED_AS_PAID") v.status = "SENT"; save(); return { deleted: true }; },
    async deleteInvoiceRefund(iid, rid) { const v = T("invoices")[iid]; if (!v) throw err(404, "RESOURCE_NOT_FOUND"); v.refunds = (v.refunds || []).filter((r) => r.id !== rid); save(); return { deleted: true }; },
    async nextInvoiceNumber() { const k = (T("seq").n = (T("seq").n || 0) + 1); save(); return { number: String(k).padStart(4, "0") }; },
    async listInvoiceTemplates() { return Object.values(T("templates")).map((t) => ({ id: t.id, name: t.name, default: false })); },
    async updateInvoiceTemplate(tid, { name, item, amount }) { const t = T("templates")[tid]; if (!t) throw err(404, "RESOURCE_NOT_FOUND"); Object.assign(t, name ? { name } : {}, item ? { item } : {}, amount ? { amount } : {}); save(); return { id: tid, name: t.name }; },
    async searchTransactions({ transactionId = null } = {}) { const caps = Object.values(T("captures")).filter((c) => !transactionId || c.id === transactionId); return { total: caps.length, pages: 1, items: caps.map((c) => ({ id: c.id, code: "T0006", status: "S", amount: c.amount, at: iso(c.at), payer: null, invoiceId: null, custom: null })) }; },
    async listPayLinks() { return Object.values(T("links")).map((l) => ({ id: l.id, status: l.deleted ? "INACTIVE" : "ACTIVE", name: l.name, amount: l.amount })); },
    async getPayLink(lid) { const l = T("links")[lid]; if (!l) throw err(404, "RESOURCE_NOT_FOUND"); return { id: l.id, name: l.name, amount: l.amount, url: `${publicUrl}/mock-paypal/approve?link=${l.id}` }; },
    async updatePayLinkPrice(lid, { amount }) { const l = T("links")[lid]; if (!l) throw err(404, "RESOURCE_NOT_FOUND"); l.amount = amount; save(); return { id: lid, amount }; },
    async addShippingTracker({ transactionId }) { return { added: transactionId ? 1 : 0, errors: [] }; },
    async getReferral(rid) { return { id: rid, trackingId: null, features: ["PAYMENT", "REFUND", "PARTNER_FEE", "DELAY_FUNDS_DISBURSEMENT", "READ_SELLER_DISPUTE", "UPDATE_SELLER_DISPUTE", "ACCESS_MERCHANT_INFORMATION"], products: ["EXPRESS_CHECKOUT"] }; },
    async supportingInfo(did, { notes }) { const d = T("disputes")[did]; if (!d) throw err(404, "RESOURCE_NOT_FOUND"); (d.supporting ||= []).push(notes); save(); return { sent: true }; },
    async updateDisputeContact(did, { email }) { const d = T("disputes")[did]; if (!d) throw err(404, "RESOURCE_NOT_FOUND"); d.contact = email; save(); return { updated: true }; },
    async sandboxAdjudicate(did, outcome) { const d = T("disputes")[did]; if (!d) throw err(404, "RESOURCE_NOT_FOUND"); d.status = outcome === "SELLER_FAVOR" ? "RESOLVED" : "RESOLVED"; d.outcome = outcome === "SELLER_FAVOR" ? "RESOLVED_SELLER_FAVOUR" : "RESOLVED_BUYER_FAVOUR"; save(); return { outcome }; },
    async sandboxRequireEvidence(did, side) { const d = T("disputes")[did]; if (!d) throw err(404, "RESOURCE_NOT_FOUND"); d.status = "WAITING_FOR_SELLER_RESPONSE"; d.asked = side; save(); return { asked: side }; },
    async sandboxChargeback() { throw err(500, "INTERNAL_SERVER_ERROR", "what the sandbox answered on 2026-11-07"); },
    async eventTypes() { return [...EVENT_NAMES]; },
    async listWebhooks() { return [{ id: "WH-MOCK", url: `${publicUrl}/api/paypal/webhook`, events: EVENT_NAMES.length }]; },
    async moveWebhook(wid, url) { return { id: wid, url }; },
    async deleteWebhook() { return { deleted: true }; },
    async webhookLookups() { return []; },
    async addWebhookLookup() { return { id: id("WL-") }; },
    async negativeTest(code) { return { code, status: 422, issue: code, debugId: "STAND-IN" }; },
    async getRefund(rid) { const r = T("refunds")[rid]; if (!r) throw err(404, "RESOURCE_NOT_FOUND"); return { id: rid, status: "COMPLETED", amount: r.amount, reason: null }; },
    async findEligible({ amount }) { return { methods: amount >= 3000 ? ["paypal", "venmo", "paylater"] : ["paypal", "venmo"], raw: {} }; },
    async createPayLink({ name, amount }) { const l = { id: id("PLB-"), name, amount, payments: [], at: now() }; T("links")[l.id] = l; save(); return { id: l.id, url: `${publicUrl}/mock-paypal/approve?link=${l.id}` }; },
    async deletePayLink(lid) { if (!T("links")[lid]) throw err(404, "RESOURCE_NOT_FOUND"); T("links")[lid].deleted = true; save(); return { deleted: true }; },
    async payLinkPayments({ name, amount }) { return Object.values(T("links")).filter((l) => l.name === name && l.amount === amount).flatMap((l) => l.payments); },
    // the stand-in's buyer pays a link
    payLink(lid) { const l = T("links")[lid]; if (!l || l.deleted) return null; const p = { id: id("TX-"), amount: l.amount, fee: fee(l.amount), at: new Date(now()).toISOString() }; l.payments.push(p); save(); return p; },
    async partnerReferral({ trackingId, returnUrl }) { const mid = id("MERCH-"); T("merchants")[trackingId] = { merchantId: mid, at: now() }; save(); return { actionUrl: `${returnUrl}${returnUrl.includes("?") ? "&" : "?"}${new URLSearchParams({ merchantId: trackingId, merchantIdInPayPal: mid, permissionsGranted: "true", consentStatus: "true", isEmailConfirmed: "true" })}` }; },
    async merchantStatus({ trackingId }) { const m = T("merchants")[trackingId]; return m ? { found: true, merchantId: m.merchantId, receivable: true, emailConfirmed: true, consented: true, products: ["EXPRESS_CHECKOUT:SUBSCRIBED"] } : { found: false }; },
    async clientToken({ customerId = null } = {}) { return { token: null, mock: true, returningPayer: !!customerId }; },
    async listDisputes(captureId, { state = null } = {}) { return Object.values(T("disputes")).filter((d) => (!captureId || d.capture === captureId) && (!state || (state === "REQUIRED_ACTION" ? !/RESOLVED|UNDER_REVIEW/.test(d.status) : true))).map((d) => ({ channel: "INTERNAL", ...d })); },
    async provideEvidence(disputeId, { notes }) { const d = T("disputes")[disputeId]; if (!d) throw err(404, "RESOURCE_NOT_FOUND"); d.evidence = notes; d.status = "UNDER_REVIEW"; save(); return { status: "UNDER_REVIEW" }; },
    async acknowledgeReturn(disputeId, { note }) { const d = T("disputes")[disputeId]; if (!d) throw err(404, "RESOURCE_NOT_FOUND"); if (/RESOLVED/.test(d.status)) throw err(422, "DISPUTE_ALREADY_RESOLVED"); d.returnAcknowledged = { note, at: now() }; save(); return { acknowledged: true }; },
    async disputeMessage(disputeId, message) { const d = T("disputes")[disputeId]; if (!d) throw err(404, "RESOURCE_NOT_FOUND"); (d.messages ||= []).push({ from: "SELLER", message, at: now() }); save(); return { sent: true }; },
    async appealDispute(disputeId, { notes }) { const d = T("disputes")[disputeId]; if (!d) throw err(404, "RESOURCE_NOT_FOUND"); if (!/RESOLVED/.test(d.status)) throw err(422, "DISPUTE_NOT_APPEALABLE", "Only a dispute PayPal decided can be appealed."); d.appeal = notes; d.status = "UNDER_REVIEW"; save(); return { status: "UNDER_REVIEW" }; },
    async makeOffer(disputeId, { amount = 0, offerType = "REFUND" }) { const d = T("disputes")[disputeId]; if (!d) throw err(404, "RESOURCE_NOT_FOUND"); if (/RESOLVED/.test(d.status)) throw err(422, "DISPUTE_ALREADY_RESOLVED"); if (amount > d.amount) throw err(422, "INVALID_OFFER_AMOUNT"); d.offer = amount; d.status = "WAITING_FOR_BUYER_RESPONSE"; save(); return { status: d.status }; },
    // the stand-in's buyer answers an offer (the sandbox's /accept-offer and /deny-offer are the buyer side too)
    buyerAnswersOffer(disputeId, yes) { const d = T("disputes")[disputeId]; if (!d?.offer) return null; d.status = yes ? "RESOLVED" : "WAITING_FOR_SELLER_RESPONSE"; d.outcome = yes ? "RESOLVED_WITH_PAYOUT" : d.outcome; if (!yes) delete d.offer; save(); return d; },
    async acceptClaim(disputeId, { amount = null } = {}) { const d = T("disputes")[disputeId]; if (!d) throw err(404, "RESOURCE_NOT_FOUND"); if (/RESOLVED/.test(d.status)) throw err(422, "DISPUTE_ALREADY_RESOLVED"); d.status = "RESOLVED"; d.outcome = "RESOLVED_BUYER_FAVOUR"; save(); return { status: "RESOLVED" }; },
    // Log in with PayPal: the stand-in "signs in" at once and sends the pro straight back with a code
    loginUrl({ state, redirectUri }) { const code = id("LC-"); T("logins")[code] = { at: Date.now() }; save(); return `${redirectUri}?${new URLSearchParams({ code, state })}`; },
    async loginUserinfo({ code }) { if (!T("logins")[code]) throw err(400, "invalid_grant"); delete T("logins")[code]; save(); const payer = id("PAYER-"); return { user_id: `https://www.paypal.com/webapps/auth/identity/user/${payer}`, payer_id: payer, verified_account: "true", emails: [{ value: `pro-${payer.slice(-6).toLowerCase()}@done-demo.example`, primary: true, confirmed: true }] }; },
    async ensureWebhook() { return { id: "WH-MOCK", created: false }; },
    async balancesAsOf(currency, asOf) { return { ...(await this.balances(currency)), asOf: new Date(asOf).toISOString() }; },
    async verifyWebhook() { return true; },
    async webhookEvents() { return Object.values(T("events")).map((e) => ({ id: e.id, type: e.event_type, at: new Date(e.at).toISOString(), summary: e.summary, status: "SUCCESS" })).reverse(); },
    async webhookEvent(eid) { const e = T("events")[eid]; if (!e) throw err(404, "RESOURCE_NOT_FOUND"); return e; },
    async resendWebhookEvent(eid) { if (!T("events")[eid]) throw err(404, "RESOURCE_NOT_FOUND"); return { status: "PENDING" }; },
    async searchInvoices({ status = [] } = {}) { const items = Object.values(T("invoices")).filter((v) => !status.length || status.includes(v.status)).map((v) => ({ id: v.id, number: null, status: v.status, amount: v.amount, due: v.status === "SENT" ? v.amount : 0, recipient: v.recipient, date: null })); return { total: items.length, items }; },
    async simulateWebhook({ eventType }) { const e = mkEvent(eventType); T("events")[e.id] = { ...e, at: now() }; save(); return e; },

    // ---- the stand-in's own controls (demo and tests) ---------------------------------------------------------------
    failNextCharge(vaultId) { try { const [, vid] = vaultKind(vaultId); const t = T("tokens")[vid]; if (!t) return false; t.failNext = true; save(); return true; } catch { return false; } },
    openDispute(captureId, reason = "MERCHANDISE_OR_SERVICE_NOT_AS_DESCRIBED") { const c = T("captures")[captureId]; if (!c) return null; const d = { id: id("PP-D-"), capture: captureId, reason, status: "WAITING_FOR_SELLER_RESPONSE", amount: c.amount, created: new Date().toISOString() }; T("disputes")[d.id] = d; save(); return d; },
    // what the PayPal Agent Toolkit's read-only tools would answer, from the stand-in's records (recon.js)
    toolkit(method, arg = {}) {
      const money = (c, neg = false) => ({ currency_code: "USD", value: ((neg ? -c : c) / 100).toFixed(2) });
      if (method === "list_transactions") {
        const tx = [];
        for (const c of Object.values(T("captures"))) tx.push({ transaction_info: { transaction_id: c.id, transaction_event_code: "T0006", transaction_amount: money(c.amount), fee_amount: money(c.fee, true), custom_field: T("orders")[c.order]?.reference || null, transaction_status: "S" } });
        for (const r of Object.values(T("refunds"))) tx.push({ transaction_info: { transaction_id: r.id, transaction_event_code: "T1107", transaction_amount: money(r.amount, true), paypal_reference_id: r.capture, paypal_reference_id_type: "TXN", transaction_status: "S" } });
        for (const p of Object.values(T("payouts"))) for (const x of p.items) if (x.transactionId) tx.push({ transaction_info: { transaction_id: x.transactionId, transaction_event_code: "T0000", transaction_amount: money(x.amount, true), custom_field: x.id, transaction_status: "S" } });
        const t = arg.transaction_id ? tx.filter((x) => x.transaction_info.transaction_id === arg.transaction_id) : tx;
        return { transaction_details: t, total_items: t.length, total_pages: 1, page: 1 };
      }
      if (method === "get_refund") { const r = T("refunds")[arg.refund_id]; return r ? { id: r.id, status: "COMPLETED", amount: money(r.amount), links: [{ rel: "up", href: `/v2/payments/captures/${r.capture}` }] } : { error: { message: "RESOURCE_NOT_FOUND" } }; }
      if (method === "list_disputes") return { items: Object.values(T("disputes")).map((d) => ({ dispute_id: d.id, status: d.status, reason: d.reason, dispute_amount: money(d.amount), disputed_transactions: [{ seller_transaction_id: d.capture }] })) };
      if (method === "get_dispute") { const d = T("disputes")[arg.dispute_id]; return d ? { dispute_id: d.id, status: d.status, reason: d.reason, dispute_amount: money(d.amount), seller_response_due_date: new Date(Date.parse(d.created || Date.now()) + 10 * 864e5).toISOString(), disputed_transactions: [{ seller_transaction_id: d.capture }], ...(d.outcome ? { dispute_outcome: { outcome_code: d.outcome, ...(d.offer && d.outcome === "RESOLVED_WITH_PAYOUT" ? { amount_refunded: money(d.offer) } : {}) } } : {}), ...(d.offer ? { offer: { seller_offered_amount: money(d.offer) } } : {}) } : { error: { message: "RESOURCE_NOT_FOUND" } }; }
      if (method === "get_invoice") { const v = T("invoices")[arg.invoice_id]; return v ? { id: v.id, status: v.status, amount: money(v.amount) } : { error: { message: "RESOURCE_NOT_FOUND" } }; }
      if (method === "list_invoices") return { items: Object.values(T("invoices")).map((v) => ({ id: v.id, status: v.status, amount: money(v.amount) })) };
      return null;
    },
    // what the simulated approval page does
    approve({ token, setup, invoice, subscription }) {
      if (subscription) { const x = T("subs")[subscription]; if (!x) return false; if (x.status === "APPROVAL_PENDING") { x.status = "ACTIVE"; if (x.setupFee) x.payments.push({ id: id("SUBTX-"), status: "COMPLETED", amount: x.setupFee, fee: fee(x.setupFee), at: new Date().toISOString() }); save(); this.billNow(subscription); } return true; }
      if (invoice) { const v = T("invoices")[invoice]; if (!v) return false; v.status = "PAID"; save(); return true; }
      if (token) { const o = T("orders")[token]; if (!o) return false; if (o.status === "PAYER_ACTION_REQUIRED") { o.status = "APPROVED"; o.payerId = id("PAYER-"); o.payerEmail = "sandbox-buyer@done-demo.example"; save(); } return true; }
      if (setup) { const s = T("setups")[setup]; if (!s) return false; s.status = "APPROVED"; save(); return true; }
      return false;
    },
    describe({ token, setup, invoice, subscription }) {
      if (subscription) { const x = T("subs")[subscription]; return x ? { kind: "subscription", amount: x.amount, reference: x.reference, name: x.name, status: x.status } : null; }
      if (invoice) { const v = T("invoices")[invoice]; return v ? { kind: "invoice", amount: v.amount, reference: v.item, status: v.status } : null; }
      if (token) { const o = T("orders")[token]; return o ? { kind: "order", threeDS: !!o.card3ds, intent: o.intent, amount: o.amount, reference: o.reference, description: o.description, status: o.status } : null; }
      if (setup) { const s = T("setups")[setup]; return s ? { kind: "vault", status: s.status } : null; }
      return null;
    },
    // (tests) the raw records
    _db: db,
  };
  return api;
}
