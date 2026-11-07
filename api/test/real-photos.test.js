// The demo pros' real photos (openly licensed, demo-assets/real/): re-dated to the job with the camera that took them
// kept, used once per server, and credited.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

test("a real demo photo keeps its camera, is re-dated to the job, is used once, and has a credit", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "done-real-"));
  const prev = { s: process.env.DONE_STATE_DIR, r: process.env.DONE_REAL_PHOTOS };
  process.env.DONE_STATE_DIR = dir; process.env.DONE_REAL_PHOTOS = "1";
  try {
    const A = await import(`../src/demoassets.js?real=${Date.now()}`);
    const { exifOf } = await import("../src/exif.js");
    const credits = A.realCredits();
    assert.ok(credits.length >= 10, "credits for the real photos");
    assert.ok(credits.every((c) => c.author && c.license && c.source));
    const j = { id: "job_t", address: { lat: 30.26, lng: -97.74 }, scope: { title: "Fix the running toilet", trade: "plumbing" } };
    // (the faucet scenes are the judges' tour's, reserved for tours: other demo jobs get the synthetic scene)
    assert.equal((await A.freshPhoto({ ...j, scope: { title: "Fix the dripping faucet", trade: "plumbing" } }, "faucet-installed.jpg")).realName, undefined, "the tour's photos are reserved");
    assert.ok(A.TOUR_RESERVED.has((await A.freshPhoto({ ...j, id: "job_tour", tour: true, evidence: [] }, "faucet-installed.jpg", { what: "the faucet with the water running" })).realName), "a tour job gets them");
    const one = await A.freshPhoto(j, "toilet-tank.jpg");
    assert.ok(one.realName, "a real photo is used the first time");
    const e = exifOf(one);
    assert.ok(e.camera, "the original camera is kept");
    assert.ok(Math.abs(Date.parse(e.taken) - Date.now()) < 36e5 * 26, "re-dated to now");
    assert.ok(e.gps && Math.abs(e.gps.lat - 30.26) < 0.01, "placed at the job");
    assert.ok(A.creditOf(one.realName), "credited");
    // the slot has two real photos: both get used, then the synthetic scene comes back
    const two = await A.freshPhoto(j, "toilet-tank.jpg"), three = await A.freshPhoto(j, "toilet-tank.jpg");
    assert.notEqual(two.realName, one.realName);
    assert.equal(three.realName, undefined, "after the real ones, the synthetic scene");
  } finally {
    process.env.DONE_STATE_DIR = prev.s; if (prev.r === undefined) delete process.env.DONE_REAL_PHOTOS; else process.env.DONE_REAL_PHOTOS = prev.r;
  }
});
