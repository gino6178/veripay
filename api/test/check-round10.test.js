// Round 10: a job's own trade words never send a condition back. DP-1032 ("Fix the leaking faucet") was written with
// template null, so faucet words (spout, tap, cartridge...) were read as "another job type" for its own photo.
import { test } from "node:test";
import assert from "node:assert/strict";
import { relevance, partsRelevance, ownTemplates } from "../src/check/relevance.js";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { checkEvidence } from "../src/check/index.js";
import { setChat } from "../src/llm.js";
import { setVlm } from "../src/vlm.js";
import { setReader } from "../src/reader.js";

const D = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures", "evidence");
const FX = JSON.parse(fs.readFileSync(path.join(D, "fixtures.json"), "utf8"));

// DP-1032's scope as the round-10 server stored it (api/data/state/jobs.json)
const DP1032 = { title: "Fix the leaking faucet", trade: "plumbing", template: null,
  items: ["Find where the faucet leaks", "Replace the cartridge or the faucet", "Test for drips with the water on"],
  checks: [
    { id: "c1", what: "Photo of the new cartridge or faucet installed", evidence: "photo", rule: "a photo taken during the job, at the job address" },
    { id: "c2", what: "Photo under the sink with the water on for 10 minutes: no drips", evidence: "photo", rule: "taken at the job address at least 10 minutes after the repair photo; after:c1>=10m" },
    { id: "c3", what: "Receipt for the parts", evidence: "receipt", rule: "the receipt's total matches the parts in the price plus any approved change order" }] };

const FAUCET_WORDS = ["spout", "tap", "cartridge", "aerator", "handle", "faucet", "new faucet spout, no drips"];

test("DP-1032: the faucet job's own words are its own, with template null", () => {
  assert.ok(ownTemplates(DP1032).has("faucet"));
  for (const w of FAUCET_WORDS) {
    const r = relevance(w, DP1032);
    assert.notEqual(r.ok, false, `${w} read as ${r.other?.template}`);
  }
  assert.equal(partsRelevance(["Moen 1225 cartridge", "faucet aerator"], DP1032).ok, true);
});

test("a title that names another fixture (bathroom sink) still owns faucet words", () => {
  const s = { ...DP1032, title: "Bathroom sink drips", items: ["Stop the drip at the bathroom sink"], checks: [DP1032.checks[0]] };
  for (const w of FAUCET_WORDS) assert.notEqual(relevance(w, s).ok, false, w);
});

test("other trades are still caught on the faucet job", () => {
  const r = relevance("TV bracket on the studs, cables hidden", DP1032);
  assert.equal(r.ok, false);
});

test("no condition sent back on DP-1032 for photos labelled spout / tap / cartridge", async () => {
  setChat(() => ({ json: { checks: [] } })); setVlm(null); setReader(() => null);
  for (const label of ["spout", "tap", "cartridge", "aerator", "handle"]) {
    const ev = [{ id: "p5", kind: "photo", path: path.join(D, "new_part.jpg"), uploadedAt: "2026-11-05T18:00:00Z", checkId: "c1", label: "new cartridge" },
      { id: "p6", kind: "photo", path: path.join(D, "no_drip.jpg"), uploadedAt: "2026-11-05T18:00:00Z", checkId: "c2", label }];
    const r = await checkEvidence({ ...FX.job, id: "DP-1032", scope: DP1032, changeOrders: [] }, ev, { history: [], remember: false });
    for (const c of r.checks) {
      assert.ok(!c.signals.some((s) => /photo_topic_mismatch|topic_mismatch/.test(s)), `${label}: ${c.id} ${c.reason}`);
      assert.doesNotMatch(String(c.reason), /not this job/, `${label}: ${c.id}`);
    }
  }
});
