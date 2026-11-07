// PayPal's own sandbox answers for the ids the film shows (GET only). Credentials come from api/.env and are never
// printed or written; the output keeps ids, statuses, amounts and times only.
import fs from "node:fs";
import path from "node:path";
import { st, save, HERE } from "./lib3.mjs";
const env = Object.fromEntries(fs.readFileSync(path.join(HERE, "../../../api/.env"), "utf8").split(/\r?\n/).map((l) => l.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/)).filter(Boolean).map((m) => [m[1], m[2].replace(/^["']|["']$/g, "")]));
const API = "https://api-m.sandbox.paypal.com";
const tok = await (await fetch(`${API}/v1/oauth2/token`, { method: "POST", headers: { authorization: "Basic " + Buffer.from(`${env.PAYPAL_CLIENT_ID}:${env.PAYPAL_CLIENT_SECRET}`).toString("base64"), "content-type": "application/x-www-form-urlencoded" }, body: "grant_type=client_credentials" })).json();
const get = async (p) => { const r = await fetch(API + p, { headers: { authorization: `Bearer ${tok.access_token}` } }); return { http: r.status, j: await r.json() }; };
const m = st().m, f = m.final;
const amt = (a) => (a ? `${a.value} ${a.currency_code || a.currency}` : null);
const out = { at: new Date().toISOString(), env: "sandbox", calls: [] };
const add = (what, p, pick) => out.calls.push({ what, request: `GET ${p}` , ...pick });
for (const [what, id] of [["first hold: order", m.hold.paypalOrder], ["re-hold: order", m.rehold.paypalOrder]]) { const r = await get(`/v2/checkout/orders/${id}`); add(what, `/v2/checkout/orders/${id}`, { http: r.http, id: r.j.id, status: r.j.status, intent: r.j.intent, amount: amt(r.j.purchase_units?.[0]?.amount), create_time: r.j.create_time }); }
for (const [what, id] of [["first hold: authorization", m.hold.authorization], ["re-hold: authorization", m.rehold.authorization]]) { const r = await get(`/v2/payments/authorizations/${id}`); add(what, `/v2/payments/authorizations/${id}`, { http: r.http, id: r.j.id, status: r.j.status, amount: amt(r.j.amount), create_time: r.j.create_time, update_time: r.j.update_time }); }
{ const id = f.hold.capture; const r = await get(`/v2/payments/captures/${id}`); add("capture", `/v2/payments/captures/${id}`, { http: r.http, id: r.j.id, status: r.j.status, amount: amt(r.j.amount), final_capture: r.j.final_capture, create_time: r.j.create_time }); }
{ const id = f.money.payout.batchId; const r = await get(`/v1/payments/payouts/${id}`); const h = r.j.batch_header || {}; add("Payouts batch", `/v1/payments/payouts/${id}`, { http: r.http, id: h.payout_batch_id, status: h.batch_status, amount: amt(h.amount), time_created: h.time_created, items: (r.j.items || []).map((i) => ({ transaction_id: i.transaction_id, transaction_status: i.transaction_status, amount: amt(i.payout_item?.amount), sender_item_id: i.payout_item?.sender_item_id })) }); }
fs.writeFileSync(path.join(HERE, "paypal-answers.json"), JSON.stringify(out, null, 1));
save({ paypal: out });
console.log(JSON.stringify(out.calls.map((c) => [c.what, c.http, c.id, c.status, c.amount, c.items?.map((i) => [i.transaction_status, i.amount])])));
