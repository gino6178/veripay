// A description belongs to the photo it was made from: two different photos in one job never share one, whatever
// their ids, names or conditions (the judge's tour log was traced to the right photo; this keeps it so).
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { checkEvidence } from "../src/check/index.js";
import { setChat } from "../src/llm.js";
import { setVlm, describePhoto } from "../src/vlm.js";
import { clearPhotoRows } from "../src/check/history.js";
import { rulesScope } from "../src/scope.js";
import { withExif } from "../src/evidence.js";

const D = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures", "evidence");
const FX = JSON.parse(fs.readFileSync(path.join(D, "fixtures.json"), "utf8"));
const REAL = path.join(D, "..", "..", "..", "demo-assets", "real");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "done-map-"));
const sha = (p) => crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex");
// a VLM that "describes" each file by its own bytes, slowly and out of order, so any mix-up shows
const SAYS = new Map();
beforeEach(() => {
  clearPhotoRows(); process.env.DONE_VLM_MODE = "describe";
  setChat((m) => ({ json: { checks: [...String(m[1].content).matchAll(/^- (\S+) \(/gm)].map((x) => ({ id: x[1], v: "pass", r: "ok", e: null })) } }));
  setVlm(async (task, input) => { const p = input.photos[0], s = sha(p); await new Promise((r) => setTimeout(r, Math.random() * 30)); return { sees: SAYS.get(s) || `unknown photo ${s.slice(0, 8)}` }; });
});
let n = 0;
const put = (src, name, says) => { const p = path.join(tmp, name); fs.writeFileSync(p, withExif(fs.readFileSync(src), { taken: `2026-11-05T16:${String(30 + n++).padStart(2, "0")}:00Z`, lat: 30.25, lng: -97.75, make: "Canon", model: "EOS" })); SAYS.set(sha(p), says); return p; };

test("two different photos in one job never share a description, even with the same evidence id", async () => {
  const scope = rulesScope({ text: "leaky faucet", zip: "78745", now: Date.parse("2026-11-04T18:00:00Z") });
  const a = put(path.join(REAL, "faucet_before-3.jpg"), "IMG_1.jpg", "A white sink and a chrome faucet with a worn cartridge, before the repair, dripping.");
  const b = put(path.join(REAL, "level_used-1.jpg"), "IMG_2.jpg", "A yellow level and a red laser on a wall bracket.");
  const c = put(path.join(REAL, "faucet_installed-1.jpg"), "IMG_3.jpg", "A new chrome faucet installed over a dry sink, the new cartridge in place, no water dripping.");
  const e = put(path.join(REAL, "faucet_installed-3.jpg"), "IMG_4.jpg", "A chrome faucet with the water running into a dry sink, no drips under it.");
  const UP = "2026-11-05T18:00:00Z";
  const ev = [{ id: "p1", kind: "photo", path: a, uploadedAt: UP, checkId: "before" }, { id: "p1", kind: "photo", path: b, uploadedAt: UP, checkId: "new_part" },
    { id: "p3", kind: "photo", path: c, uploadedAt: UP, checkId: "new_part" }, { id: "p4", kind: "photo", path: e, uploadedAt: UP, checkId: "no_drip" }];
  const r = await checkEvidence({ ...FX.job, scope }, ev, { history: [], remember: false });
  const all = r.checks.flatMap((k) => (k.described || []).map((x) => ({ check: k.id, ...x })));
  assert.ok(all.length >= 4, JSON.stringify(r.checks.map((k) => [k.id, k.verdict, k.reason, k.signals])));
  for (const x of all) assert.equal(x.sees, SAYS.get(x.sha256), `${x.check}/${x.evidenceId}: described ${x.sha256.slice(0, 8)} as "${x.sees}"`);
  // each photo's description is the one made from its own bytes
  const np = r.checks.find((k) => k.id === "new_part");
  assert.deepEqual(np.described.map((x) => x.sha256), [sha(b), sha(c)]);
  assert.deepEqual(np.described.map((x) => x.evidenceId), ["p1~2", "p3"]);
  assert.ok(r.signals.some((x) => x.startsWith("duplicate_evidence_id: p1 -> p1~2")));
  assert.ok(!r.checks.some((k) => k.signals.some((x) => /duplicate_in_job/.test(x))), "two different photos are not 'the same picture'");
  assert.notEqual(np.described[0].sees, np.described[1].sees);
  assert.equal(r.checks.find((k) => k.id === "before").described[0].sha256, sha(a));
});

test("the describe cache is keyed by the file's bytes: a path rewritten with another photo is described again", async () => {
  const p = put(path.join(REAL, "faucet_before-3.jpg"), "IMG_9.jpg", "A sink and a faucet.");
  assert.equal((await describePhoto(p)).sees, "A sink and a faucet.");
  fs.copyFileSync(path.join(REAL, "level_used-1.jpg"), p); SAYS.set(sha(p), "A yellow level.");
  const d = await describePhoto(p);
  assert.equal(d.sees, "A yellow level."); assert.ok(!d.cached); assert.equal(d.sha256, sha(p));
});
