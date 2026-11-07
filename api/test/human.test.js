// Times for people (Austin, "Nov 7, 7:00 AM") in every human sentence, ISO kept in data fields; risk factors in words.
import test from "node:test";
import assert from "node:assert/strict";
import { J, person, P, PRO } from "./helpers.js";
import { when, humanize } from "../src/human.js";
import { riskOf } from "../src/risk.js";

const ISO = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;
test("human times: Austin, short; sentences never carry raw ISO; data fields keep it", async () => {
  assert.equal(when("2026-11-07T13:00:00.000Z"), "Nov 7, 7:00 AM");
  assert.equal(humanize("releases at 2026-11-07T13:00:00.000Z unless disputed; warranty until 2026-11-21"), "releases at Nov 7, 7:00 AM unless disputed; warranty until Nov 21, 2026");
  assert.equal(humanize("permit BP-2026-004512"), "permit BP-2026-004512");
  const c = person(), j = await J.createJob(c.id, { text: "Kitchen faucet keeps dripping. Fix it this week.", zip: "78704", budget: 25000, options: { releaseMode: "review" }, actor: P(c) });
  await J.requestOffers(j.id, P(c), { now: true });
  const o = J.job(j.id).offers.filter((x) => x.status === "open").sort((a, b) => a.amount - b.amount)[0];
  const v = await J.acceptOffer(j.id, o.id, { actor: P(c), payWith: "card" });
  assert.equal(v.waitingOn.who, "pro");
  assert.doesNotMatch(v.waitingOn.what, ISO);
  assert.match(v.waitingOn.at || "", ISO, "the ISO time is in its own field");
  assert.doesNotMatch(v.next, ISO);
  assert.ok(v.thread.every((m) => !ISO.test(m.text || "")));
  // risk factors in words, none with value 0
  const r = await riskOf(J.job(j.id));
  for (const w of [...r.dispute.why, ...r.overrun.why]) { assert.ok(w.says && !/_/.test(w.says), JSON.stringify(w)); assert.match(w.says, /(raises|lowers) the (dispute|overrun) risk/); }
  assert.ok(![...r.dispute.why, ...r.overrun.why].some((w) => /0 past disputes|has 0 jobs/.test(w.says)));
});
