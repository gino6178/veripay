// One real run against PayPal's sandbox for PLAN §15 item 3: a Venmo payout and a tip.
//   1. Payouts: one item to a Venmo account (recipient_type PHONE, recipient_wallet VENMO, a US mobile number)
//   2. a tip: a separate Orders v2 order, intent CAPTURE, captured at once (the sandbox test card)
//   3. Payouts: the whole tip to the pro's PayPal (no platform fee)
//   4. read both batches back (after a short wait)
// Needs api/.env with PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET, PAYPAL_TEST_CARD=1. Prints ids and statuses only,
// never credentials. Usage: node scripts/sandbox-venmo-tips.mjs [--json out.json] [--phone 4085551234]
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { paypal } from "../src/pay/paypal.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
for (const line of fs.readFileSync(path.join(HERE, "../.env"), "utf8").split(/\r?\n/)) { const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/); if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, ""); }
const pp = paypal({ clientId: process.env.PAYPAL_CLIENT_ID, secret: process.env.PAYPAL_CLIENT_SECRET, testCard: process.env.PAYPAL_TEST_CARD === "1" });
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const phone = `+1${String(arg("--phone", "4085551234")).replace(/\D/g, "").slice(-10)}`;
const run = `vt-${crypto.randomBytes(4).toString("hex")}`, out = { run, at: new Date().toISOString(), phone: phone.replace(/(\d{3})\d{3}(\d{4})$/, "$1•••$2"), steps: [] };
const step = async (name, fn) => {
  const t0 = Date.now();
  try { const r = await fn(); out.steps.push({ name, ok: true, ms: Date.now() - t0, r }); console.log(`ok   ${name} (${Date.now() - t0} ms)`, JSON.stringify(r)); return r; }
  catch (e) { out.steps.push({ name, ok: false, ms: Date.now() - t0, error: e.message, issue: e.issue, debugId: e.debugId }); console.log(`FAIL ${name}: ${e.message}`); return null; }
};
const proEmail = process.env.DONE_PRO_PAYPAL_EMAIL || "pro-check@done-demo.example";
const venmo = await step("payouts: $1.00 to a Venmo phone (recipient_wallet VENMO)", () => pp.payoutBatch({ batchId: `${run}-venmo`, items: [{ id: `${run}-venmo-pro`, receiver: phone, recipientType: "PHONE", wallet: "VENMO", amount: 100, note: "Done & Paid sandbox check: Venmo payout" }], note: "Venmo payout check" }));
const tip = await step("tip: $5.00 order, intent CAPTURE, captured at once (sandbox test card)", () => pp.charge({ amount: 500, reference: `${run}-tip`, description: "Done & Paid sandbox check: a tip for the pro", card: true, save: false, requestId: `${run}:tip` }));
const tipPay = tip?.capture ? await step("payouts: the whole $5.00 tip to the pro's PayPal (no platform fee)", () => pp.payoutBatch({ batchId: `${run}-tip-payout`, items: [{ id: `${run}-tip-pro`, receiver: proEmail, amount: 500, note: "A tip from your customer: 100% yours." }], note: "Tip" })) : null;
await new Promise((r) => setTimeout(r, 12e3));
if (venmo) await step("venmo batch read back", () => pp.getPayout(venmo.batchId));
if (tipPay) await step("tip batch read back", () => pp.getPayout(tipPay.batchId));
if (tip?.capture) await step("tip capture detail", () => pp.getCapture(tip.capture.id));
const f = arg("--json", null);
if (f) fs.writeFileSync(f, JSON.stringify(out, null, 1));
console.log(`${out.steps.filter((s) => s.ok).length}/${out.steps.length} steps ok`);
