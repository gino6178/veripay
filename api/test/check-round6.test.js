// Round 6: plate conditions read by plate OCR first; "area" conditions can't pass on a label close-up; a busy photo
// model says so; an unrecognised description goes to a person, not back to the pro.
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { checkEvidence } from "../src/check/index.js";
import { withExif } from "../src/evidence.js";
import { rulesScope } from "../src/scope.js";
import { setChat } from "../src/llm.js";
import { setVlm } from "../src/vlm.js";
import { setReader } from "../src/reader.js";
import { clearPhotoRows } from "../src/check/history.js";

const HERE = path.dirname(fileURLToPath(import.meta.url)), A = path.join(HERE, "..", "demo-assets");
const WIN = process.platform === "win32";
const FX = JSON.parse(fs.readFileSync(path.join(HERE, "fixtures", "evidence", "fixtures.json"), "utf8"));
const UP = "2026-11-05T18:00:00Z";
// the demo assets carry no EXIF: give each copy the job's time and place, as the demo pro's phone does
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "done-r6-"));
const shot = (file, minute = 30) => { const p = path.join(tmp, `${minute}-${file}`); fs.writeFileSync(p, withExif(fs.readFileSync(path.join(A, file)), { taken: `2026-11-05T16:${String(minute).padStart(2, "0")}:00Z`, lat: 30.25, lng: -97.75 })); return p; };
const photo = (id, p, checkId) => ({ id, kind: "photo", path: p, uploadedAt: UP, checkId });
const audit = (over = {}) => (m) => ({ json: { checks: [...String(m[1].content).matchAll(/^- (\S+) \(/gm)].map((x) => ({ id: x[1], ...(over[x[1]] || { v: "pass", r: "ok" }), e: null })) } });
const byId = (r, id) => r.checks.find((c) => c.id === id);
beforeEach(() => { process.env.DONE_VLM_MODE = "describe"; clearPhotoRows(); setReader(null); setChat(audit()); });

const wh = () => {
  const scope = rulesScope({ text: "replace my 40 gallon water heater", zip: "78745", now: Date.parse("2026-11-04T18:00:00Z") });
  scope.checks = scope.checks.filter((c) => ["label", "new_unit"].includes(c.id));
  scope.checks.push({ id: "area", what: "Photo of the area around the heater cleared and swept", evidence: "photo", rule: "photo>=1;in_window;near_job;not_reused" });
  return { ...FX.job, id: "job_wh", scope: { ...scope, spec: { capacityGal: 40 } }, changeOrders: [] };
};

test("a rating-plate condition is read by plate OCR first: the demo plate passes it even when the VLM calls it something else", { skip: !WIN && "needs Windows OCR" }, async () => {
  setVlm(() => ({ sees: "A white sign with black text on a grey wall." }));
  setChat(audit({ new_unit: { v: "needs_fix", r: "wrong_subject" } }));
  const r = await checkEvidence(wh(), [photo("p1", shot("wh-label.jpg", 31), "label"), photo("p2", shot("wh-new.jpg", 32), "new_unit")], { history: [], remember: false });
  const l = byId(r, "label");
  assert.equal(l.verdict, "pass", l.reason); assert.ok(!l.needsPerson); assert.match(l.by, /ocr/);
  assert.match(l.reason, /the plate reads: model GX-40T, serial 2611-04A-7731, 40 gal/); assert.equal(l.plate.matchesOrder, true);
  // the VLM's "wrong subject" on the installed heater isn't the pro's problem: a person looks
  assert.equal(byId(r, "new_unit").needsPerson, true); assert.notEqual(byId(r, "new_unit").verdict, "needs_fix");
});

test("an 'area cleared' condition doesn't pass on a close-up of a rating plate, nor on a description without the area", { skip: !WIN && "needs Windows OCR" }, async () => {
  setVlm(() => ({ sees: "A rating plate with text." }));
  let r = await checkEvidence(wh(), [photo("p3", shot("wh-label.jpg", 33), "area")], { history: [], remember: false });
  let a = byId(r, "area");
  assert.equal(a.verdict, "needs_fix"); assert.match(a.reason, /close-up of a label, not the area/);
  setVlm(() => ({ sees: "A water heater next to a wall." }));
  r = await checkEvidence(wh(), [photo("p4", shot("wh-new.jpg", 34), "area")], { history: [], remember: false });
  a = byId(r, "area");
  assert.equal(a.needsPerson, true); assert.match(a.reason, /doesn't show the area/);
  setVlm(() => ({ sees: "A clean, swept garage floor around a new water heater." }));
  r = await checkEvidence(wh(), [photo("p5", shot("wh-new.jpg", 35), "area")], { history: [], remember: false });
  assert.ok(!/area/.test(byId(r, "area").reason) || !byId(r, "area").needsPerson || /drawn/.test(byId(r, "area").reason));
});

test("the photo model busy (503) says so; an unrecognised description goes to a person; a contradiction Done-Audit is sure of goes back", async () => {
  const faucet = { ...FX.job, id: "job_f", scope: rulesScope({ parts: true, text: "leaky faucet", zip: "78745", now: Date.parse("2026-11-04T18:00:00Z") }) };
  const D = path.join(HERE, "fixtures", "evidence");
  setVlm(() => { throw new Error("model busy (HTTP 503); not retried"); });
  let r = await checkEvidence(faucet, [photo("e3", path.join(D, "no_drip.jpg"), "no_drip")], { history: [], remember: false });
  assert.match(byId(r, "no_drip").reason, /photo model busy; a person confirms/);
  // "a cartridge in a printer": not the faucet, but nothing that contradicts it either -> a person, not needs_fix
  setVlm(() => ({ sees: "A cartridge in a printer on a desk." }));
  setChat(audit({ no_drip: { v: "needs_fix", r: "wrong_subject" } }));
  r = await checkEvidence(faucet, [photo("e3", path.join(D, "no_drip.jpg"), "no_drip")], { history: [], remember: false });
  assert.equal(byId(r, "no_drip").needsPerson, true); assert.notEqual(byId(r, "no_drip").verdict, "needs_fix"); assert.equal(r.decision, "review");
  // a description of another job's things (a toilet tank and flapper) doesn't name the faucet: a person, never a pass
  setVlm(() => ({ sees: "An open toilet tank with a new flapper and a fill valve." }));
  r = await checkEvidence(faucet, [photo("e3", path.join(D, "no_drip.jpg"), "no_drip")], { history: [], remember: false });
  assert.equal(byId(r, "no_drip").needsPerson, true); assert.match(byId(r, "no_drip").reason, /doesn't name the faucet/);
});
