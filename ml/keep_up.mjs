// Keeps the VeriPay site up on this PC (the one port, 8810) and keeps it able to reach the models on the L4.
//  - runs the site server, and starts it again if it exits or stops answering (3 failed checks, 20 s apart)
//  - every 5 minutes: if this PC's public IP changed, moves the L4 firewall rule (veripay-l4-models) to it, since
//    the model port admits only this IP
//  - logs to api/data/keep_up.log
//  node ml/keep_up.mjs            SITE_PUBLIC_URL=https://... for a temporary public address (a tunnel): the PayPal
//                                  return links use it, no webhook is registered, receipts keep their localhost origin
import { spawn, execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const API = path.join(ROOT, "api"), LOG = path.join(API, "data/keep_up.log");
const PORT = 8810, RULE = "veripay-l4-models";
const ENV = { ...process.env, NODE_EXTRA_CA_CERTS: path.join(API, "certs/veripay-models.pem"), PORT: String(PORT), PUBLIC_URL: process.env.SITE_PUBLIC_URL || `http://localhost:${PORT}`,
  ...(process.env.SITE_PUBLIC_URL ? { DONE_NO_WEBHOOK: "1", LOG_ORIGIN: `localhost:${PORT}/done-receipts` } : {}),
  PAYPAL_TEST_CARD: "1", TELEGRAM_BOT_TOKEN: "", DONE_STATE_DIR: path.join(API, "data/state-sbx10") };
const log = (s) => { const l = `${new Date().toISOString()} ${s}`; console.log(l); fs.appendFileSync(LOG, l + "\n"); };

let child = null, misses = 0, stopping = false;
function start() {
  child = spawn(process.execPath, ["--env-file=.env", "src/server.js"], { cwd: API, env: ENV, stdio: "inherit" });
  log(`site started (pid ${child.pid})`);
  child.on("exit", (code, sig) => { child = null; if (stopping) return; log(`site exited (${code ?? sig}); starting again in 3 s`); setTimeout(start, 3000); });
}
async function health() {
  if (!child) return;
  try { const r = await fetch(`http://127.0.0.1:${PORT}/api/models/status?probe=0`, { signal: AbortSignal.timeout(10e3) }); if (!r.ok) throw new Error(`HTTP ${r.status}`); misses = 0; }
  catch (e) { if (++misses >= 3 && child) { log(`site not answering (${e.message}); restarting`); misses = 0; child.kill(); } }
}
const gcloud = (args) => new Promise((ok) => execFile("gcloud", args, { shell: true, timeout: 120e3 }, (e, out) => ok(e ? null : String(out).trim())));
async function firewall() {
  const ip = await fetch("https://api.ipify.org", { signal: AbortSignal.timeout(10e3) }).then((r) => r.text()).catch(() => null);
  if (!/^\d+\.\d+\.\d+\.\d+$/.test(ip || "")) return;
  const now = await gcloud(["compute", "firewall-rules", "describe", RULE, "--format=value(sourceRanges)"]);
  if (now == null || now.includes(`${ip}/32`)) return;
  log(`public IP is now ${ip} (rule had ${now}); updating ${RULE}`);
  log((await gcloud(["compute", "firewall-rules", "update", RULE, `--source-ranges=${ip}/32`, "--quiet"])) == null ? "firewall update failed" : "firewall updated");
}
for (const s of ["SIGINT", "SIGTERM", "SIGBREAK"]) process.on(s, () => { stopping = true; child?.kill(); process.exit(0); });
start();
setInterval(health, 20e3);
firewall(); setInterval(firewall, 5 * 60e3);
