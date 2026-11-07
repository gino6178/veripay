// One real run against PayPal's sandbox, the money path of a job end to end:
//   authorize (sandbox test card, store_in_vault) -> a second hold on the card's vault id (merchant-initiated)
//   -> partial final capture of the first -> one Payouts batch (pro + helper) -> partial refund -> void the second
//   -> reauthorize (expected to be refused inside the 3-day honor period; that's the point of trying)
// Needs api/.env with PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET and PAYPAL_TEST_CARD=1. Prints ids and statuses only,
// never credentials. Usage: node scripts/sandbox-check.mjs [--json out.json]
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { paypal } from "../src/pay/paypal.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
for (const line of fs.readFileSync(path.join(HERE, "../.env"), "utf8").split(/\r?\n/)) { const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/); if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, ""); }
const pp = paypal({ clientId: process.env.PAYPAL_CLIENT_ID, secret: process.env.PAYPAL_CLIENT_SECRET, testCard: process.env.PAYPAL_TEST_CARD === "1" });
const run = `chk-${crypto.randomBytes(4).toString("hex")}`, out = { run, at: new Date().toISOString(), steps: [] };
const step = async (name, fn) => {
  const t0 = Date.now();
  try { const r = await fn(); out.steps.push({ name, ok: true, ms: Date.now() - t0, r }); console.log(`ok   ${name} (${Date.now() - t0} ms)`, JSON.stringify(r)); return r; }
  catch (e) { out.steps.push({ name, ok: false, ms: Date.now() - t0, error: e.message, issue: e.issue, debugId: e.debugId }); console.log(`FAIL ${name}: ${e.message}`); return null; }
};

const hold = await step("authorize $230.00 (test card, store_in_vault)", () => pp.authorize({ amount: 23000, reference: `${run}-job`, description: "Done & Paid sandbox check: kitchen faucet", card: true, save: true, requestId: `${run}:hold` }));
const vault = hold?.vaultId;
const hold2 = vault ? await step("authorize $50.00 on the card's vault id (merchant-initiated)", () => pp.authorize({ amount: 5000, reference: `${run}-job2`, description: "Done & Paid sandbox check: second hold on saved card", vaultId: vault, requestId: `${run}:hold2` })) : null;
const auth = hold?.authorization?.id;
const cap = auth ? await step("capture $200.00 of $230.00, final (buffer released)", () => pp.capture(auth, { amount: 20000, final: true, invoiceId: `${run}-job`, requestId: `${run}:capture` })) : null;
const fee = Math.round(20000 * 0.1), helper = 4000, pro = 20000 - fee - helper;
const batch = cap ? await step(`payouts batch: pro ${pro / 100} + helper ${helper / 100}`, () => pp.payoutBatch({ batchId: `${run}-payout`, items: [{ id: `${run}-pro`, receiver: process.env.DONE_PRO_PAYPAL_EMAIL || "pro-check@done-demo.example", amount: pro, note: "Done & Paid sandbox check: pro" }, { id: `${run}-helper`, receiver: process.env.DONE_HELPER_PAYPAL_EMAIL || "helper-check@done-demo.example", amount: helper, note: "Done & Paid sandbox check: helper" }] })) : null;
if (cap) await step("partial refund $25.00", () => pp.refund(cap.id, { amount: 2500, note: "Done & Paid sandbox check: partial refund", requestId: `${run}:refund` }));
if (cap) await step("capture detail", () => pp.getCapture(cap.id));
if (batch) await step("payout batch detail", () => pp.getPayout(batch.batchId));
if (hold2?.authorization?.id) {
  await step("reauthorize the second hold (inside honor period)", () => pp.reauthorize(hold2.authorization.id, { amount: 5000, requestId: `${run}:reauth` }));
  await step("void the second hold", () => pp.voidAuthorization(hold2.authorization.id, `${run}:void`));
}
const argJson = process.argv.indexOf("--json");
if (argJson > 0) fs.writeFileSync(process.argv[argJson + 1], JSON.stringify(out, null, 1));
