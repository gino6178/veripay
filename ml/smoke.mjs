// One real call to every model the site uses, through the same endpoint and token the site has (api/.env):
// done-chat, done-audit, done-vlm (with a photo), Done-OCR /read (with a receipt), and the local risk model.
// Exit code 1 if any of them doesn't answer.  node --env-file=api/.env ml/smoke.mjs   (NODE_EXTRA_CA_CERTS for the cert)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const auth = process.env.DONE_MODEL_TOKEN ? { Authorization: `Bearer ${process.env.DONE_MODEL_TOKEN}` } : {};
const img = (p) => fs.readFileSync(path.join(HERE, "..", p)).toString("base64");
const url = (k) => (process.env[k] || process.env.DONE_MODEL_URL || "").replace(/\/$/, "");

async function chat(base, model, content, images) {
  const r = await fetch(`${base}/api/chat`, { method: "POST", headers: { "content-type": "application/json", ...auth }, signal: AbortSignal.timeout(60e3),
    body: JSON.stringify({ model, stream: false, options: { num_predict: 40 }, messages: [{ role: "user", content, ...(images ? { images } : {}) }] }) });
  const j = await r.json();
  const t = j.message?.content?.trim();
  if (!r.ok || !t) throw new Error(`HTTP ${r.status} ${JSON.stringify(j).slice(0, 120)}`);
  return t.replace(/\s+/g, " ").slice(0, 70);
}
const checks = {
  "done-chat": () => chat(url("DONE_MODEL_URL"), process.env.DONE_MODEL || "done-chat", "Say hello to a homeowner in one short sentence."),
  "done-audit": () => chat(url("DONE_AUDIT_URL"), process.env.DONE_AUDIT_MODEL || "done-audit", 'Condition: "faucet off, no drip". Description: "A chrome faucet, handle down, spout dry." Answer JSON {"verdict":"pass|fail|unsure"}.'),
  "done-vlm": () => chat(url("DONE_VLM_URL"), process.env.DONE_VLM_MODEL || "done-vlm", "Describe this photo in one sentence.", [img("api/demo-assets/receipt.jpg")]),
  "done-ocr": async () => {
    const r = await fetch(`${url("DONE_OCR_URL")}/read`, { method: "POST", headers: { "content-type": "application/json", ...auth }, signal: AbortSignal.timeout(60e3), body: JSON.stringify({ image: img("api/demo-assets/receipt.jpg") }) });
    const j = await r.json();
    const t = (j.text || (j.lines || []).map((l) => l.text || l).join(" ") || "").trim();
    if (!r.ok || !t) throw new Error(`HTTP ${r.status} ${JSON.stringify(j).slice(0, 120)}`);
    return t.replace(/\s+/g, " ").slice(0, 70);
  },
  "done-risk": async () => {
    const { riskStatus } = await import("../api/src/risk.js");
    const s = await riskStatus();
    if (!s.live) throw new Error(s.source || "not loaded");
    return s.version;
  },
};
let bad = 0;
for (const [name, run] of Object.entries(checks)) {
  const t0 = Date.now();
  try { const said = await run(); console.log(`ok   ${name.padEnd(10)} ${String(Date.now() - t0).padStart(5)}ms · ${said}`); }
  catch (e) { bad++; console.log(`DOWN ${name.padEnd(10)} ${e.message}`); }
}
process.exit(bad ? 1 : 0);
