// Judges' round 2: Done-Chat timed out at the general 4 s model timeout, and an off-template job ("cracked bathroom
// tile, water seeping, $300") became "Handyman job" / "Do the work described". The scope writer has its own timeout,
// common jobs have templates, and the general order is written from the person's own words.
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { writeScope, refineScope, rulesScope, pickTemplate, genericFromText, TEMPLATES, scopeTimeoutMs, refineTimeoutMs } from "../src/scope.js";
import { parseRule } from "../src/check/rules.js";
import { setChat } from "../src/llm.js";

afterEach(() => { setChat(null); delete process.env.DONE_SCOPE_TIMEOUT_MS; delete process.env.DONE_SCOPE_REFINE_TIMEOUT_MS; });

test("the scope writer has its own timeout (DONE_SCOPE_TIMEOUT_MS, 12 s), not the 4 s model default; refine at least as long", async () => {
  assert.equal(scopeTimeoutMs(), 12000); assert.equal(refineTimeoutMs(), 25000);
  process.env.DONE_SCOPE_TIMEOUT_MS = "30000"; assert.equal(refineTimeoutMs(), 30000);
  delete process.env.DONE_SCOPE_TIMEOUT_MS;
  let got = null;
  setChat((m, o) => { got = o.timeoutMs; return null; });
  await writeScope({ text: "cracked bathroom tile, water seeping, $300" });
  assert.equal(got, 12000);
  await refineScope({ text: "cracked bathroom tile, water seeping, $300" });
  assert.equal(got, 25000);
});

test("a model slower than 4 s still writes the scope (within the scope timeout)", async () => {
  const ml = await import("../../ml/prompts.mjs");
  setChat(async () => { await new Promise((r) => setTimeout(r, 4500)); return { json: { t: "Repair cracked bathroom tile", tr: "handyman", i: ["Remove the cracked tiles", "Set new tile and regrout"], c: [{ id: "tiled", e: "photo", w: "Photo of the new tile grouted" }], p: 30000 } }; });
  const s = await writeScope({ text: "cracked bathroom tile, water seeping, $300" });
  assert.equal(s.source, "model", JSON.stringify(s.notes)); assert.equal(s.priceCeiling, 30000); assert.ok(ml);
});

test("refine retries once when the model was busy", async () => {
  let n = 0;
  setChat(() => (++n === 1 ? Promise.reject(Object.assign(new Error("model busy (HTTP 503)"), {})) : { json: { t: "Repair cracked bathroom tile", tr: "handyman", i: ["Set new tile"], c: [{ id: "tiled", e: "photo", w: "Photo of the new tile grouted" }] } }));
  process.env.DONE_MODEL_URL = "http://127.0.0.1:9"; // configured, so the rules' order is refinable
  try {
    const s = await refineScope({ text: "cracked bathroom tile, water seeping, $300" });
    assert.equal(n, 2); assert.equal(s.source, "model"); assert.equal(s.retried, true);
  } finally { delete process.env.DONE_MODEL_URL; }
});

test("common jobs get their own template with sensible checks", () => {
  const cases = { "cracked bathroom tile, water seeping, $300": "tile", "regrout the shower": "tile", "recaulk the bathtub": "caulk",
    "garbage disposal is jammed and humming": "disposal", "water stain on the ceiling under the bathroom": "leak", "pipe under the sink is leaking": "leak",
    "install a ceiling fan in the bedroom": "fan_light", "replace the dining room light fixture": "fan_light", "front door deadbolt sticks": "door_lock",
    "smoke detector keeps chirping": "smoke_alarm", "clean the gutters before winter": "gutter", "pressure wash the driveway": "pressure_wash",
    "move-out deep clean 2br apartment": "move_out",
    // the old ones still win where they fit
    "leaky faucet": "faucet", "kitchen faucet dripping": "faucet", "toilet keeps running": "toilet", "sink drain is clogged": "drain", "no hot water, water heater is old": "water_heater" };
  for (const [t, id] of Object.entries(cases)) assert.equal(pickTemplate(t).id, id, t);
  for (const id of ["tile", "caulk", "disposal", "leak", "fan_light", "door_lock", "smoke_alarm", "gutter", "pressure_wash", "move_out"]) {
    const t = TEMPLATES.find((x) => x.id === id);
    assert.ok(t && t.items.length >= 3 && t.checks.length >= 3, id);
    assert.ok(["plumbing", "cleaning", "handyman"].includes(t.trade), `${id}: a trade the job store knows`);
    assert.ok(t.checks.some((c) => c.evidence === "note") && t.checks.filter((c) => c.evidence === "photo").length >= 2, id);
    for (const c of t.checks) assert.ok(parseRule(c.rule), `${id}.${c.id}`);
  }
  const tile = rulesScope({ text: "cracked bathroom tile, water seeping, $300" });
  assert.equal(tile.priceCeiling, 30000); assert.notEqual(tile.title, "Handyman job"); assert.ok(!tile.items.includes("Do the work described"));
});

test("the general order says what the person asked for, never 'Do the work described'", () => {
  const cases = [["the porch swing squeaks", "Fix the porch swing", /porch swing \(squeaks\)/], ["fix my mailbox post, it's leaning", "Fix the mailbox post", /mailbox post \(leaning\)/],
    ["hang 3 shelves in the garage", "Hang 3 shelves in the garage", /Hang 3 shelves/], ["my fence gate won't close", "Fix the fence gate", /fence gate \(won't close\)/],
    ["hang three pictures and fix a squeaky door", "Hang three pictures, fix the door", /Fix the door \(squeaky\)/]];
  for (const [t, title, item] of cases) {
    const s = rulesScope({ text: t });
    assert.equal(s.template, "handyman", t); assert.equal(s.title, title, t);
    assert.ok(s.items.some((x) => item.test(x)), `${t}: ${s.items.join(" / ")}`);
    assert.ok(!s.items.some((x) => /do the work described/i.test(x)), t);
    assert.ok(s.checks.every((c) => !/^Photo of the finished work$/.test(c.what)), t);
  }
  assert.match(rulesScope({ text: "Something weird" }).items[0], /^Something weird$/);
  assert.equal(genericFromText(""), null);
});
