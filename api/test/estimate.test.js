import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { estimatePrice, fairRange, BANDS, sizeOf } from "../src/estimate.js";
import { setVlm } from "../src/vlm.js";

const REAL = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "demo-assets", "real");
beforeEach(() => { setVlm(null); delete process.env.DONE_VLM_URL; });
const hist = (template, prices) => prices.map((p, i) => ({ template, price: p, at: `2026-10-${10 + i}` }));

test("no photo, no history: the rules' band for the job type, labelled as an estimate, not a quote", async () => {
  const e = await estimatePrice({ text: "my kitchen faucet drips", zip: "78704" });
  assert.equal(e.source, "rules"); assert.equal(e.template, "faucet"); assert.deepEqual([e.low, e.high, e.typical], BANDS.faucet);
  assert.equal(e.label, "an estimate from similar jobs, not a quote"); assert.match(e.basis.join(" "), /demo band for faucet jobs/);
});

test("history: the middle half of completed jobs of that type; fewer than 3 falls back to rules", async () => {
  const e = await estimatePrice({ text: "faucet drips", history: [...hist("faucet", [15000, 17000, 19000, 21000, 23000]), ...hist("drain", [90000])] });
  assert.equal(e.source, "history"); assert.equal(e.matched, 5); assert.deepEqual([e.low, e.typical, e.high], [17000, 19000, 21000]);
  const few = await estimatePrice({ text: "faucet drips", history: hist("faucet", [15000, 17000]) });
  assert.equal(few.source, "rules"); assert.match(few.basis[0], /only 2 completed faucet jobs so far/);
});

test("the problem photo, described without a prompt about the job, names the fixture and the size", async () => {
  setVlm(() => ({ sees: "The image shows a large cylindrical water tank with various pipes and valves attached to it." }));
  const e = await estimatePrice({ text: "it's broken, please help", photos: [path.join(REAL, "heater_old-3.jpg")] });
  assert.equal(e.template, "water_heater"); assert.equal(e.size, "large"); assert.equal(e.source, "model+rules");
  assert.ok(e.basis.some((b) => /job type from the photo: water heater/.test(b)));
  assert.equal(e.typical, Math.round((BANDS.water_heater[2] * 1.3) / 500) * 500);
  setVlm(() => { throw new Error("model busy (HTTP 503); not retried"); });
  const down = await estimatePrice({ text: "faucet drips", photos: [path.join(REAL, "faucet_before-3.jpg")] });
  assert.equal(down.source, "rules"); assert.ok(down.basis.some((b) => /couldn't be described/.test(b)));
});

test("Done-Risk's overrun probability raises the upper end only; sizes from words", async () => {
  const e = await estimatePrice({ text: "faucet drips", risk: { overrun: 0.4 } });
  assert.equal(e.high, Math.round((BANDS.faucet[1] * 1.2) / 500) * 500); assert.equal(e.low, BANDS.faucet[0]);
  assert.equal(sizeOf("two bathrooms"), "large"); assert.equal(sizeOf("a small hole"), "small"); assert.equal(sizeOf("leaky faucet"), "usual");
});

test("fairRange for the customer's agent: the job's estimate when kept, else the rules' band; counter between low and typical", () => {
  const f = fairRange({ estimate: { low: 17000, high: 21000, typical: 19000, source: "history" } });
  assert.deepEqual(f, { low: 17000, high: 21000, typical: 19000, counterAt: 18000, source: "history", label: "an estimate from similar jobs, not a quote" });
  const r = fairRange({ scope: { template: "drain" } });
  assert.equal(r.source, "rules"); assert.equal(r.low, BANDS.drain[0]); assert.ok(r.counterAt >= r.low && r.counterAt <= r.typical);
});
