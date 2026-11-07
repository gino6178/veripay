// Filming bug: on a fresh server, a seeded job's demo pro sent the tour's faucet library photos, so a judges' tour started
// after it met them as another job's photos (reused) and didn't release. The tour's library photos are reserved for tours.
// Here: real library photos on (as on a server), background demo pros do a seeded faucet job, then the tour is run.
import test, { after } from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import fs from "node:fs";
import path from "node:path";
process.env.DONE_REAL_PHOTOS = "1";
process.env.DONE_STATE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "done-tour-reserved-")); // the used-photo list lands here (stores stay in memory under the test runner)
process.env.DONE_NO_LISTEN = "1";
const { J, person, P, people } = await import("./helpers.js");
const { app } = await import("../src/server.js");
const demopro = await import("../src/demopro.js");
const { TOUR_RESERVED } = await import("../src/demoassets.js");
const srv = app.listen(0);
after(() => srv.close());
const base = `http://127.0.0.1:${srv.address().port}`;

test("seeded demo pros never send the tour's library photos; a tour after them still releases", async () => {
  // a seeded customer's faucet job, done by a demo pro in the background (as right after a fresh start)
  const c = person({ via: "seed" });
  const j = await J.createJob(c.id, { text: "Kitchen faucet keeps dripping even when it's off. Fix it this week, $250 max.", zip: "78704", budget: 25000, actor: P(c) });
  await J.requestOffers(j.id, P(c), { now: true });
  const o = J.job(j.id).offers.filter((x) => x.status === "open").sort((a, b) => a.amount - b.amount)[0];
  assert.ok(!(await J.acceptOffer(j.id, o.id, { actor: P(c), payWith: "card" })).error);
  await demopro.finishNow(j.id, "test: the background demo pro");
  const seededPhotos = J.job(j.id).evidence.filter((e) => e.kind === "photo").map((e) => e.name);
  assert.ok(seededPhotos.length, "the demo pro sent photos");
  assert.ok(!seededPhotos.some((n) => TOUR_RESERVED.has(n)), `a seeded job used a tour photo: ${seededPhotos.join(", ")}`);
  // then the judges' tour
  const r = await fetch(`${base}/api/demo/tour`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ step: "all" }) }).then((x) => x.json());
  const t = J.job(r.id);
  const tourPhotos = t.evidence.filter((e) => e.kind === "photo").map((e) => e.name);
  assert.ok(tourPhotos.some((n) => TOUR_RESERVED.has(n)), `the tour uses its library photos: ${tourPhotos.join(", ")}`);
  const last = t.checks.at(-1);
  assert.ok(!last.checks.some((x) => (x.signals || []).some((s) => /reused/.test(s))), JSON.stringify(last.checks.map((x) => x.signals)));
  assert.equal(r.status, "released", JSON.stringify(last.checks.map((x) => [x.id, x.verdict, x.reason])).slice(0, 600));
  // and a second tour, the same photos again: a labelled library signal, still released
  const r2 = await fetch(`${base}/api/demo/tour`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ step: "all" }) }).then((x) => x.json());
  assert.equal(r2.status, "released");
  assert.ok(J.job(r2.id).checks.at(-1).checks.some((x) => (x.signals || []).includes(J.TOUR_LIBRARY_SIGNAL)));
});
