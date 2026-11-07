// Probe: can this sandbox app run the multiparty flow (the pro as the order's payee, our 10% as platform_fees)?
// PayPal requires the payee to be onboarded to the platform as a partner merchant (PayPal Commerce Platform); this
// records exactly what the sandbox answers. Prints ids, statuses and errors only, never credentials.
// Usage: node scripts/sandbox-multiparty.mjs [payee-email] [--json out.json]
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { paypal } from "../src/pay/paypal.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
for (const line of fs.readFileSync(path.join(HERE, "../.env"), "utf8").split(/\r?\n/)) { const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/); if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, ""); }
const pp = paypal({ clientId: process.env.PAYPAL_CLIENT_ID, secret: process.env.PAYPAL_CLIENT_SECRET, testCard: true });
const payee = process.argv[2] && !process.argv[2].startsWith("--") ? process.argv[2] : process.env.DONE_PRO_PAYPAL_EMAIL || "pro-check@done-demo.example";
const run = `mp-${crypto.randomBytes(4).toString("hex")}`, out = { run, at: new Date().toISOString(), payeeKind: process.env.DONE_PRO_PAYPAL_EMAIL ? "sandbox account from env" : "stand-in address", steps: [] };
const step = async (name, fn) => {
  try { const r = await fn(); out.steps.push({ name, ok: true, r }); console.log(`ok   ${name}`, JSON.stringify(r)); return r; }
  catch (e) { out.steps.push({ name, ok: false, error: e.message, issue: e.issue, debugId: e.debugId }); console.log(`FAIL ${name}: ${e.message} (debug_id ${e.debugId})`); return null; }
};
const h = await step("authorize $200 with payee = pro, platform_fees $20 (test card)", () => pp.authorize({ amount: 20000, reference: `${run}-job`, description: "Done & Paid multiparty probe", card: true, save: false, requestId: `${run}:hold`, multiparty: { payee, platformFee: 2000 } }));
if (h?.authorization?.id) {
  await step("capture $200 with platform_fees $20", () => pp.capture(h.authorization.id, { amount: 20000, final: true, platformFee: 2000, requestId: `${run}:capture` }));
}
const i = process.argv.indexOf("--json");
if (i > 0) fs.writeFileSync(process.argv[i + 1], JSON.stringify(out, null, 1));
