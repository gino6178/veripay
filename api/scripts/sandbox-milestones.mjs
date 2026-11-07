// Probe: milestone payments on one PayPal authorization, against the real sandbox.
//   authorize $600 (test card, vaulted) -> capture $200 (final_capture=false) -> capture $150 (final=false)
//   -> refund $50 of the second capture (a dispute scoped to one milestone) -> reauthorize (expected refused: partly
//   captured / too soon) -> void the rest of a partly captured hold (does PayPal allow it?) on a second $300 hold
//   with one $100 partial capture -> final capture $180 of the first (closes it; the rest released)
// Prints ids, statuses and errors only. Usage: node scripts/sandbox-milestones.mjs [--json out.json]
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { paypal } from "../src/pay/paypal.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
for (const line of fs.readFileSync(path.join(HERE, "../.env"), "utf8").split(/\r?\n/)) { const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/); if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, ""); }
const pp = paypal({ clientId: process.env.PAYPAL_CLIENT_ID, secret: process.env.PAYPAL_CLIENT_SECRET, testCard: true });
const run = `ms-${crypto.randomBytes(4).toString("hex")}`, out = { run, at: new Date().toISOString(), steps: [] };
const step = async (name, fn) => {
  try { const r = await fn(); out.steps.push({ name, ok: true, r }); console.log(`ok   ${name}`, JSON.stringify(r)); return r; }
  catch (e) { out.steps.push({ name, ok: false, error: e.message, issue: e.issue, debugId: e.debugId }); console.log(`FAIL ${name}: ${e.message}`); return null; }
};
const h = await step("authorize $600 (3 milestones + buffer)", () => pp.authorize({ amount: 60000, reference: `${run}-job`, description: "Done & Paid milestone probe", card: true, save: true, requestId: `${run}:hold` }));
const a = h?.authorization?.id;
if (a) {
  await step("milestone 1: capture $200, final_capture=false", () => pp.capture(a, { amount: 20000, final: false, invoiceId: `${run}-m1`, requestId: `${run}:m1` }));
  const c2 = await step("milestone 2: capture $150, final_capture=false", () => pp.capture(a, { amount: 15000, final: false, invoiceId: `${run}-m2`, requestId: `${run}:m2` }));
  await step("authorization after two partial captures", () => pp.getAuthorization(a));
  if (c2) await step("refund $50 of milestone 2's capture", () => pp.refund(c2.id, { amount: 5000, requestId: `${run}:r2` }));
  await step("reauthorize a partly captured hold (expected refused)", () => pp.reauthorize(a, { amount: 25000, requestId: `${run}:reauth` }));
  if (h.vaultId) {
    const h2 = await step("second hold $300 on the vaulted card", () => pp.authorize({ amount: 30000, reference: `${run}-job2`, description: "Done & Paid milestone probe 2", vaultId: h.vaultId, requestId: `${run}:hold2` }));
    if (h2?.authorization?.id) {
      await step("second hold: partial capture $100", () => pp.capture(h2.authorization.id, { amount: 10000, final: false, invoiceId: `${run}-j2m1`, requestId: `${run}:j2m1` }));
      await step("void the rest of a partly captured hold", () => pp.voidAuthorization(h2.authorization.id, `${run}:void2`));
      await step("second hold after void", () => pp.getAuthorization(h2.authorization.id));
    }
  }
  await step("milestone 3: capture $180, final_capture=true (the rest released)", () => pp.capture(a, { amount: 18000, final: true, invoiceId: `${run}-m3`, requestId: `${run}:m3` }));
  await step("authorization after the final capture", () => pp.getAuthorization(a));
}
const i = process.argv.indexOf("--json");
if (i > 0) fs.writeFileSync(process.argv[i + 1], JSON.stringify(out, null, 1));
