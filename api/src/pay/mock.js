// A stand-in for PayPal with the same calls as paypal.js, for tests and for running Cover before sandbox keys are set
// (PAYPAL_MODE=mock, the default without PAYPAL_CLIENT_ID). The payer's approval is a page this server shows itself
// (/mock-paypal/approve), clearly marked as a simulation. Fees follow PayPal's US rate for the demo: 3.49% + $0.49 per
// capture. Nothing here moves money or talks to PayPal.
import crypto from "node:crypto";
import { store, stateFile } from "../store.js";

const id = (p) => `${p}${crypto.randomBytes(6).toString("hex").toUpperCase()}`;
const fee = (cents) => Math.round(cents * 0.0349) + 49;

// Its records are kept like Cover's own (store.js), so a restart doesn't lose the orders the policies point at.
const KINDS = ["orders", "auths", "captures", "payouts", "setups", "tokens", "byRequest", "invoices", "disputes", "plans", "subs"];
const table = (db, k) => ({ get: (id) => db.data[k][id], has: (id) => id in db.data[k], set: (id, v) => { db.data[k][id] = v; db.save(); } });

export function mockPaypal({ publicUrl = "http://localhost:8790", file = stateFile("paypal-standin") } = {}) {
  const db = store(file, Object.fromEntries(KINDS.map((k) => [k, {}])));
  const [orders, auths, captures, payouts, setups, tokens, byRequest, invoices, disputes] = KINDS.map((k) => table(db, k));
  // the same PayPal-Request-Id gives the same answer, as PayPal does (objects below are changed in place, then saved)
  const once = (rid, fn) => { if (rid && byRequest.has(rid)) return byRequest.get(rid); const r = fn(); if (rid) byRequest.set(rid, r); db.save(); return r; };
  const authorize = (o) => {
    const a = { id: id("AUTH-"), order: o.id, amount: o.amount, status: "CREATED", expiresAt: new Date(Date.now() + 29 * 864e5).toISOString(), captured: 0 };
    auths.set(a.id, a); o.authorization = a.id; o.status = "COMPLETED";
    return { id: a.id, status: a.status, expiresAt: a.expiresAt };
  };
  const captureNow = (o) => {
    const c = { id: id("CAP-"), amount: o.amount, status: "COMPLETED", net: o.amount - fee(o.amount), refunded: 0 };
    captures.set(c.id, c); o.status = "COMPLETED"; o.capture = c.id;
    return { capture: { id: c.id, status: "COMPLETED", amount: c.amount, fee: c.amount - c.net } };
  };
  const api = {
    mode: "mock",
    async createOrder({ amount, reference, vaultId = null, requestId }) {
      return once(requestId, () => {
        const o = { id: id("MOCK-"), amount, reference, status: "PAYER_ACTION_REQUIRED", authorization: null };
        orders.set(o.id, o);
        if (vaultId) {
          if (!tokens.has(vaultId)) throw Object.assign(new Error("PayPal: unknown vault_id"), { status: 422 });
          const a = authorize(o);
          return { id: o.id, status: o.status, approveUrl: null, authorization: a };
        }
        return { id: o.id, status: o.status, approveUrl: `${publicUrl}/mock-paypal/approve?token=${o.id}`, authorization: null };
      });
    },
    // a premium (intent CAPTURE): charged at once to a vault token, or waiting for the payer's approval
    async createPayment({ amount, reference, vaultId = null, save = false, requestId }) {
      return once(requestId, () => {
        const o = { id: id("MOCK-"), amount, reference, intent: "CAPTURE", save, status: "PAYER_ACTION_REQUIRED" };
        orders.set(o.id, o);
        if (vaultId) {
          const t = tokens.get(vaultId);
          if (!t) throw Object.assign(new Error("PayPal: unknown vault_id"), { status: 422 });
          if (t.failNext) { t.failNext = false; db.save(); throw Object.assign(new Error("PayPal POST /v2/checkout/orders: 422 UNPROCESSABLE_ENTITY INSTRUMENT_DECLINED"), { status: 422 }); }
          return { id: o.id, status: "COMPLETED", approveUrl: null, ...captureNow(o), vaultId };
        }
        return { id: o.id, status: o.status, approveUrl: `${publicUrl}/mock-paypal/approve?token=${o.id}`, capture: null, vaultId: null };
      });
    },
    async captureOrder(oid, requestId) {
      return once(requestId, () => {
        const o = orders.get(oid);
        if (!o || o.status !== "APPROVED") throw Object.assign(new Error(`PayPal: order ${oid} is not approved`), { status: 422 });
        let vaultId = null;
        if (o.save) { const t = { id: id("VT-"), customerId: id("CUST-") }; tokens.set(t.id, t); vaultId = t.id; }
        return { id: o.id, status: "COMPLETED", ...captureNow(o), vaultId, payerEmail: "sandbox-buyer@example.com" };
      });
    },
    // the stand-in's way to make the next charge on a saved PayPal fail (a declined premium, for the demo and the tests)
    failNextCharge(vaultId) { const t = tokens.get(vaultId); if (!t) return false; t.failNext = true; db.save(); return true; },
    async subscriptionPlan({ name, monthly, requestId }) { return once(requestId, () => { const p = { id: id("P-"), name, monthly }; db.data.plans ||= {}; db.data.plans[p.id] = p; return { id: p.id }; }); },
    async subscribe({ planId, reference, requestId }) { return once(requestId, () => { const s = { id: id("I-"), plan: planId, reference, status: "APPROVAL_PENDING", payments: 0 }; db.data.subs ||= {}; db.data.subs[s.id] = s; return { id: s.id, status: s.status, approveUrl: `${publicUrl}/mock-paypal/approve?subscription=${s.id}` }; }); },
    async getSubscription(sid) { const s = db.data.subs?.[sid]; if (!s) throw Object.assign(new Error("PayPal: no such subscription"), { status: 404 }); const p = db.data.plans[s.plan]; return { id: sid, status: s.status, lastPayment: s.payments ? { amount: p.monthly, at: s.lastAt } : null, nextBilling: null, failed: 0 }; },
    async repriceSubscription(planId, monthly) { db.data.plans[planId].monthly = monthly; db.save(); return { status: "UPDATED" }; },
    async cancelSubscription(sid) { const s = db.data.subs?.[sid]; if (s) { s.status = "CANCELLED"; db.save(); } return { status: "CANCELLED" }; },
    async getOrder(oid) {
      const o = orders.get(oid);
      if (!o) throw Object.assign(new Error("PayPal: no such order"), { status: 404 });
      const a = o.authorization ? auths.get(o.authorization) : null;
      return { id: o.id, status: o.status, authorization: a ? { id: a.id, status: a.status, expiresAt: a.expiresAt } : null, payerId: o.payerId || null };
    },
    async authorizeOrder(oid, requestId) {
      return once(requestId, () => {
        const o = orders.get(oid);
        if (!o || o.status !== "APPROVED") throw Object.assign(new Error(`PayPal: order ${oid} is not approved`), { status: 422 });
        return authorize(o);
      });
    },
    async capture(aid, { amount, final = true, requestId }) {
      return once(requestId, () => {
        const a = auths.get(aid);
        if (!a || !["CREATED", "PARTIALLY_CAPTURED"].includes(a.status)) throw Object.assign(new Error(`PayPal: authorization ${aid} can't be captured`), { status: 422 });
        if (a.captured + amount > a.amount) throw Object.assign(new Error("PayPal: capture exceeds the authorization"), { status: 422 });
        a.captured += amount; a.status = final ? "CAPTURED" : "PARTIALLY_CAPTURED";
        const c = { id: id("CAP-"), amount, status: "COMPLETED", net: amount - fee(amount), refunded: 0 };
        captures.set(c.id, c);
        return { id: c.id, status: c.status, net: c.net };
      });
    },
    async getCapture(cid) { const c = captures.get(cid); if (!c) throw Object.assign(new Error("PayPal: no such capture"), { status: 404 }); return { id: cid, status: c.refunded ? "REFUNDED" : "COMPLETED", amount: c.amount, fee: c.amount - c.net, net: c.net }; },
    async voidAuthorization(aid, requestId) {
      return once(requestId, () => {
        const a = auths.get(aid);
        if (!a) throw Object.assign(new Error("PayPal: no such authorization"), { status: 404 });
        if (a.status === "CREATED") a.status = "VOIDED";
        return { status: "VOIDED" };
      });
    },
    async refund(cid, { amount, requestId }) {
      return once(requestId, () => {
        const c = captures.get(cid);
        if (!c || c.refunded + amount > c.amount) throw Object.assign(new Error("PayPal: refund exceeds the capture"), { status: 422 });
        c.refunded += amount;
        return { id: id("REF-"), status: "COMPLETED" };
      });
    },
    // (a receiver address starting with "unclaimed" is one with no PayPal account: the item comes back UNCLAIMED)
    async payout({ batchId, receiver, amount }) {
      return once(`payout:${batchId}`, () => { const p = { batchId: id("PAYOUT-"), receiver, amount, status: /^unclaimed/i.test(receiver) ? "UNCLAIMED" : "SUCCESS" }; payouts.set(p.batchId, p); return { batchId: p.batchId, status: "PENDING" }; });
    },
    async payoutBatch({ batchId, items }) {
      return once(`payout:${batchId}`, () => { const p = { batchId: id("PAYOUT-"), receiver: items.map((x) => x.receiver).join(","), amount: items.reduce((t, x) => t + x.amount, 0), status: "SUCCESS", items: items.map((x) => ({ ...x, status: /^unclaimed/i.test(x.receiver) ? "UNCLAIMED" : "SUCCESS", tx: id("TX-") })) }; payouts.set(p.batchId, p); return { batchId: p.batchId, status: "PENDING" }; });
    },
    async getPayout(batchId) { const p = payouts.get(batchId); return { batchId, status: p ? "SUCCESS" : "DENIED", item: p ? p.status : null }; },
    async invoice({ recipient, item, amount, requestId }) {
      return once(requestId, () => { const v = { id: id("INV2-"), recipient, item, amount, status: "SENT" }; invoices.set(v.id, v); return { id: v.id, url: `${publicUrl}/mock-paypal/approve?invoice=${v.id}`, status: "SENT" }; });
    },
    async getInvoice(iid) { const v = invoices.get(iid); return { id: iid, status: v?.status || "UNKNOWN", url: `${publicUrl}/mock-paypal/approve?invoice=${iid}`, paid: v?.status === "PAID" ? v.amount : 0 }; },
    async vaultSetup({ requestId }) {
      return once(requestId, () => { const s = { id: id("SETUP-"), status: "PAYER_ACTION_REQUIRED" }; setups.set(s.id, s); return { id: s.id, approveUrl: `${publicUrl}/mock-paypal/approve?setup=${s.id}` }; });
    },
    async vaultToken(setupId, requestId) {
      return once(requestId, () => {
        const s = setups.get(setupId);
        if (!s || s.status !== "APPROVED") throw Object.assign(new Error("PayPal: setup token not approved"), { status: 422 });
        const t = { id: id("VT-"), customerId: id("CUST-") }; tokens.set(t.id, t); return t;
      });
    },
    async verifyWebhook() { return true; },
    async provideEvidence(disputeId, { notes }) { const d = disputes.get(disputeId); if (!d) throw Object.assign(new Error("PayPal: no such dispute"), { status: 404 }); d.evidence = notes; d.status = "UNDER_REVIEW"; db.save(); return { status: "UNDER_REVIEW" }; },
    // a chargeback on a capture, as a buyer would open one (for the demo and the tests)
    openDispute(captureId, reason = "MERCHANDISE_OR_SERVICE_NOT_RECEIVED") { const c = captures.get(captureId); if (!c) return null; const d = { dispute_id: id("PP-D-"), reason, status: "WAITING_FOR_SELLER_RESPONSE", dispute_amount: { currency_code: "USD", value: (c.amount / 100).toFixed(2) }, disputed_transactions: [{ seller_transaction_id: captureId }] }; disputes.set(d.dispute_id, d); return d; },
    // what the PayPal Agent Toolkit's tools answer, from the stand-in's records (toolkit.js uses it without sandbox keys)
    toolkit(method, arg) {
      if (method === "list_transactions") return { transaction_details: [
        ...Object.entries(db.data.captures).map(([k, c]) => ({ transaction_info: { transaction_id: k, transaction_event_code: "T0006", transaction_amount: { value: (c.amount / 100).toFixed(2) }, fee_amount: { value: (-(c.amount - c.net) / 100).toFixed(2) } } })),
      ] };
      if (method === "create_invoice") { const v = { id: id("INV2-"), recipient: arg.primary_recipients?.[0]?.billing_info?.email_address, item: arg.items.map((x) => x.name).join(", "), amount: arg.items.reduce((a, x) => a + Math.round(+x.unit_amount.value * 100), 0), status: "DRAFT" }; invoices.set(v.id, v); return { id: v.id }; }
      if (method === "send_invoice") { const v = invoices.get(arg.invoice_id); v.status = "SENT"; db.save(); return { href: `${publicUrl}/mock-paypal/approve?invoice=${v.id}` }; }
      if (method === "get_invoice") return { id: arg.invoice_id, status: invoices.get(arg.invoice_id)?.status || "UNKNOWN" };
      if (method === "list_disputes") return { items: Object.values(db.data.disputes) };
      return null;
    },
    // ---- for the reconciliation agent (recon.js): the Agent Toolkit's read-only tools as PayPal answers them, with
    // the fields recon reads (custom_field, paypal_reference_id, event codes), and the Payouts API's batch detail.
    // Refunds are kept in their own table (refundsLog) as they happen, so get_refund can answer.
    reconToolkit(method, arg = {}) {
      const money = (c, neg = false) => ({ currency_code: "USD", value: ((neg ? -c : c) / 100).toFixed(2) });
      const refs = db.data.refundsLog || {};
      if (method === "list_transactions") {
        const tx = [];
        for (const o of Object.values(db.data.orders)) {
          const c = o.capture && captures.get(o.capture);
          if (c) tx.push({ transaction_info: { transaction_id: o.capture, transaction_event_code: "T0006", transaction_amount: money(c.amount), fee_amount: money(c.amount - c.net, true), custom_field: o.reference, transaction_status: "S" } });
        }
        for (const r of Object.values(refs)) tx.push({ transaction_info: { transaction_id: r.id, transaction_event_code: "T1107", transaction_amount: money(r.amount, true), paypal_reference_id: r.capture, paypal_reference_id_type: "TXN", transaction_status: "S" } });
        for (const p of Object.values(db.data.payouts)) if (p.status === "SUCCESS") tx.push({ transaction_info: { transaction_id: `TX${p.batchId.slice(7)}`, transaction_event_code: "T0000", transaction_amount: money(p.amount, true), transaction_status: "S" } });
        const t = arg.transaction_id ? tx.filter((x) => x.transaction_info.transaction_id === arg.transaction_id) : tx;
        return { transaction_details: t, total_items: t.length, total_pages: 1, page: 1 };
      }
      if (method === "list_invoices") { const all = Object.values(db.data.invoices); return { total_items: all.length, total_pages: 1, items: all.map((v) => ({ id: v.id, status: v.status, amount: money(v.amount), primary_recipients: [{ billing_info: { email_address: v.recipient } }] })) }; }
      if (method === "get_invoice") { const v = invoices.get(arg.invoice_id); if (!v) return { error: { message: "RESOURCE_NOT_FOUND", type: "paypal_error" } }; return { id: v.id, status: v.status, amount: money(v.amount), items: [{ name: v.item, quantity: "1", unit_amount: money(v.amount) }], payments: v.status === "PAID" ? { paid_amount: money(v.amount) } : undefined }; }
      if (method === "list_disputes") return { items: Object.values(db.data.disputes).filter((d) => !arg.disputed_transaction_id || d.disputed_transactions.some((t) => t.seller_transaction_id === arg.disputed_transaction_id)) };
      if (method === "show_subscription_details") { const s = db.data.subs?.[arg.subscription_id]; if (!s) return { error: { message: "RESOURCE_NOT_FOUND", type: "paypal_error" } }; const p = db.data.plans[s.plan]; return { id: s.id, status: s.status, plan_id: s.plan, billing_info: { last_payment: s.payments ? { amount: money(p.monthly), time: s.lastAt } : undefined, cycle_executions: [{ tenure_type: "REGULAR", cycles_completed: s.payments }] } }; }
      if (method === "get_dispute") return disputes.get(arg.dispute_id) || { error: { message: "RESOURCE_NOT_FOUND", type: "paypal_error" } };
      if (method === "get_refund") { const r = refs[arg.refund_id]; if (!r) return { error: { message: "RESOURCE_NOT_FOUND", type: "paypal_error" } }; return { id: r.id, status: "COMPLETED", amount: money(r.amount), links: [{ rel: "up", href: `/v2/payments/captures/${r.capture}` }] }; }
      return null;
    },
    payoutDetail(batchId) {
      const p = payouts.get(batchId);
      if (!p) return null;
      const sender = Object.entries(db.data.byRequest).find(([k, v]) => k.startsWith("payout:") && v?.batchId === batchId)?.[0].slice(7) || null;
      if (p.items) return { batchId, status: "SUCCESS", sender, items: p.items.map((x) => ({ transaction_id: x.status === "SUCCESS" ? x.tx : null, status: x.status, amount: x.amount, receiver: x.receiver, sender_item_id: x.id })) };
      return { batchId, status: "SUCCESS", sender, items: [{ transaction_id: p.status === "SUCCESS" ? `TX${batchId.slice(7)}` : null, status: p.status, amount: p.amount, receiver: p.receiver, sender_item_id: sender }] };
    },
    // what the simulated approval page does
    approve({ token, setup, invoice, subscription }) {
      if (subscription) { const x = db.data.subs?.[subscription]; if (!x) return false; x.status = "ACTIVE"; x.payments = 1; x.lastAt = new Date().toISOString(); db.save(); return true; }
      if (invoice) { const v = invoices.get(invoice); if (!v) return false; v.status = "PAID"; db.save(); return true; }
      if (token) { const o = orders.get(token); if (!o) return false; if (o.status === "PAYER_ACTION_REQUIRED") { o.status = "APPROVED"; o.payerId = id("PAYER-"); db.save(); } return true; }
      if (setup) { const s = setups.get(setup); if (!s) return false; s.status = "APPROVED"; db.save(); return true; }
      return false;
    },
    describe({ token, setup, invoice, subscription }) {
      if (subscription) { const x = db.data.subs?.[subscription]; return x ? { kind: "subscription", amount: db.data.plans[x.plan].monthly, reference: x.reference, status: x.status } : null; }
      if (invoice) { const v = invoices.get(invoice); return v ? { kind: "invoice", amount: v.amount, reference: v.item, status: v.status } : null; }
      if (token) { const o = orders.get(token); return o ? { kind: "order", amount: o.amount, reference: o.reference, status: o.status } : null; }
      if (setup) { const s = setups.get(setup); return s ? { kind: "vault", status: s.status } : null; }
      return null;
    },
  };
  // (recon) each refund is also kept with its capture and amount, for get_refund; the refund itself is unchanged
  const refundOnly = api.refund;
  api.refund = async (cid, opts) => {
    const r = await refundOnly(cid, opts);
    db.data.refundsLog ||= {};
    if (!db.data.refundsLog[r.id]) { db.data.refundsLog[r.id] = { id: r.id, capture: cid, amount: opts.amount }; db.save(); }
    return r;
  };
  return api;
}
