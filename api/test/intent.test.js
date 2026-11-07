// The assistant's reading of what a person types (judging bug: "My bathroom sink drains slowly. Fix it this week, under
// $150." was read as a reschedule). A sentence that describes work is a new job, whatever day it names; the other
// intents need their own words.
import test from "node:test";
import assert from "node:assert/strict";
import "./helpers.js";
const { rulesIntent } = await import("../src/assistant.js");

const POSTS = [
  "My bathroom sink drains slowly. Fix it this week, under $150.",
  "kitchen faucet keeps dripping fix it this week under 200",
  "The pipe under the kitchen sink is leaking, need someone tomorrow",
  "toilet runs all night, budget 180",
  "Shower drain is clogged. By Friday please, $250 max",
  "Water heater is making a banging noise and the water is lukewarm",
  "Replace our 50 gallon water heater this month, budget $1,800",
  "Deep clean my 2-bedroom apartment this weekend, $300",
  "need a move-out clean by friday",
  "Mount a 55 inch TV on drywall and hide the cables",
  "assemble an ikea desk and a bookshelf tomorrow under $150",
  "bathtub is backed up again",
  "Garbage disposal stopped working",
  "can someone patch a hole in the bedroom wall next week",
  "Mi fregadero gotea, arréglenlo esta semana por menos de $150",
  "the outlet in the kitchen doesn't work",
];
test("descriptions of work are new jobs (with or without when and budget, any case, no punctuation, Spanish)", () => {
  for (const t of POSTS) assert.equal(rulesIntent(t).intent, "post_job", t);
  assert.equal(rulesIntent(POSTS[0]).budget, 15000);
  assert.equal(rulesIntent("toilet runs all night, budget 180").budget, 18000);
  assert.equal(rulesIntent("Replace our 50 gallon water heater this month, budget $1,800").budget, 180000);
});
test("the other intents need their own words", () => {
  const cases = { "What's happening?": "status", "any news": "status", "how's my job going": "status", "where is the plumber": "status", "yes": "hire", "ok do it": "hire", "hire them": "hire",
    "counter at $150": "counter", "would they do $140": "counter", "approve": "approve", "decline": "decline", "reschedule to Friday": "reschedule", "can we move the visit to tomorrow": "reschedule",
    "another day please": "reschedule", "cancel": "cancel", "hi": "help" };
  for (const [t, want] of Object.entries(cases)) assert.equal(rulesIntent(t).intent, want, t);
  assert.equal(rulesIntent("counter at $150").amount, 15000);
  assert.equal(rulesIntent("hmm").intent, "unclear");
  assert.equal(rulesIntent("I would like some help around here").intent, "maybe_post", "unsure: ask with a Post button");
});
