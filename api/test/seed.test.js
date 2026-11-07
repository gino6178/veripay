// The demo seed runs from scratch (in memory) and every job's ledger adds up: it must keep working as the code changes.
import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

test("the seed builds a demo month in memory, every ledger balanced", { timeout: 600e3 }, async () => {
  const script = fileURLToPath(new URL("../scripts/seed.mjs", import.meta.url));
  // a clean environment for the child: no test-runner context (the seed sets its own), the PayPal stand-in, no real keys
  const env = { ...process.env, NODE_TEST_CONTEXT: "", PAYPAL_MODE: "mock", DEMO_PRO_DELAY_MS: "60000" };
  delete env.NODE_TEST_CONTEXT;
  const { stdout } = await promisify(execFile)(process.execPath, [script, "memory"], { env, timeout: 590e3, maxBuffer: 4e6 });
  assert.match(stdout, /Seeded \d+ jobs/);
  assert.match(stdout, /every job's ledger adds up to the cent/);
  const n = +stdout.match(/Seeded (\d+) jobs/)[1];
  assert.ok(n >= 20, `${n} jobs`);
  const released = +(stdout.match(/"released":(\d+)/) || [0, 0])[1];
  assert.ok(released >= 15, `only ${released} seeded jobs were paid: the demo month looks broken`);
  assert.ok(+(stdout.match(/expert queue open: (\d+)/) || [0, 9])[1] <= 1, "at most one open expert-queue item after the seed");
});
