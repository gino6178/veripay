// Empty or vague photo descriptions never reach a pass: code checks the description names the condition's object (and
// how it is placed, for mounted/installed conditions) before Done-Audit sees it. Run on real, openly licensed photos
// (api/demo-assets/real, attribution.json) with the descriptions done-vlm gave them, as fixtures.
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { checkEvidence, descriptionGap } from "../src/check/index.js";
import { withExif } from "../src/evidence.js";
import { setChat } from "../src/llm.js";
import { setVlm } from "../src/vlm.js";
import { clearPhotoRows } from "../src/check/history.js";

const HERE = path.dirname(fileURLToPath(import.meta.url)), REAL = path.join(HERE, "..", "demo-assets", "real");
const ATTR = JSON.parse(fs.readFileSync(path.join(REAL, "attribution.json"), "utf8")).photos;
const FX = JSON.parse(fs.readFileSync(path.join(HERE, "fixtures", "evidence", "fixtures.json"), "utf8"));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "done-r8-"));
let n = 0;
const copy = (file) => { const p = path.join(tmp, `IMG_${1000 + n++}.jpg`); // a phone's name: the file name says nothing
  fs.writeFileSync(p, withExif(fs.readFileSync(path.join(REAL, file)), { taken: "2026-11-05T16:30:00Z", lat: 30.25, lng: -97.75 })); return p; };
const one = (file) => { const a = ATTR.find((x) => x.file === file); return { a, job: { ...FX.job, id: `job_${file}`, scope: { title: a.condition, items: [], checks: [{ id: "c1", what: a.condition, evidence: "photo", rule: "photo>=1;in_window;near_job" }] }, changeOrders: [] } }; };
let asked;
beforeEach(() => { process.env.DONE_VLM_MODE = "describe"; clearPhotoRows(); asked = null;
  // Done-Audit as the ML side found it: it passes whatever it is given, empty or vague
  setChat((m) => { asked = m[1].content; return { json: { checks: [...String(m[1].content).matchAll(/^- (\S+) \(/gm)].map((x) => ({ id: x[1], v: "pass", r: "ok", e: null })) } }; }); });
const run = async (file, sees) => { const { a, job } = one(file); setVlm(() => ({ sees: sees ?? a.done_vlm_description })); return { a, r: await checkEvidence(job, [{ id: "p", kind: "photo", path: copy(file), uploadedAt: "2026-11-05T18:00:00Z", checkId: "c1" }], { history: [], remember: false }) }; };

test("real photos, real done-vlm descriptions: vague ones go to a person and never reach Done-Audit", async () => {
  for (const file of ["toilet_tank-2.jpg", "heater_installed-2.jpg", "faucet_installed-1.jpg", "trap_opened-2.jpg"]) {
    const { r } = await run(file);
    const c = r.checks[0];
    assert.equal(c.needsPerson, true, file); assert.notEqual(c.label, "APPROVED", file); assert.match(c.reason, /doesn't say it is mounted, installed or connected; a person confirms/, file);
    assert.equal(asked, null, `${file}: Done-Audit wasn't asked`);
  }
});

test("a description naming the object (and its placement) goes on to Done-Audit; the file still needs a camera to be passed", async () => {
  for (const file of ["tv_mounted-1.jpg", "faucet_installed-3.jpg", "dresser-2.jpg"]) {
    const { r } = await run(file);
    assert.ok(asked && /- c1 \(photo\)/.test(asked), `${file}: sent to Done-Audit`);
    // these copies carry the job's time and place but no camera make: a person confirms, as for any drawn or edited file
    assert.match(r.checks[0].reason, /looks drawn or edited \(no camera make or model/, file);
  }
});

test("empty, near-empty and 'TV placed on a table' descriptions: a person, not a pass", async () => {
  let { r } = await run("tv_mounted-1.jpg", "");
  assert.equal(r.checks[0].needsPerson, true); assert.match(r.checks[0].reason, /no photo description|empty or too short/);
  ({ r } = await run("tv_mounted-1.jpg", "A table."));
  assert.match(r.checks[0].reason, /empty or too short/); assert.equal(asked, null);
  ({ r } = await run("tv_mounted-1.jpg", "The image shows a television placed on a wooden table in a living room."));
  assert.match(r.checks[0].reason, /doesn't say it is mounted, installed or connected/); assert.equal(asked, null);
  assert.equal(descriptionGap({ what: "The TV is mounted on the wall" }, "A black television mounted on a white wall above a cabinet."), null);
  assert.match(descriptionGap({ what: "The bathroom mirror is clean" }, "A kitchen with a stove, a window and a table by the door."), /doesn't name the bathroom or mirror/);
});
