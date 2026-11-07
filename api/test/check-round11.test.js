// Round 11: reasons read naturally ("The note ...", never "Note note 1 shows it isn't done yet"); a note code finds
// complete that the model calls not done goes to a person, not back to the pro; a photo whose own caption names a
// different thing than its condition (a corroded shut-off valve for the new cartridge) says so, and a person confirms.
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { checkEvidence } from "../src/check/index.js";
import { naturalReason } from "../src/check/judge.js";
import { captionMismatch } from "../src/check/relevance.js";
import { rulesScope } from "../src/scope.js";
import { setChat } from "../src/llm.js";
import { setVlm } from "../src/vlm.js";
import { setReader } from "../src/reader.js";

const D = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures", "evidence");
const FX = JSON.parse(fs.readFileSync(path.join(D, "fixtures.json"), "utf8"));
const UP = "2026-11-05T18:00:00Z", NOW = Date.parse("2026-11-04T18:00:00Z");
const scope = rulesScope({ parts: true, text: "leaky faucet", zip: "78745", now: NOW });
const byId = (r, id) => r.checks.find((c) => c.id === id);
const NOTE = "Replaced the worn faucet cartridge with a new Moen 1225 cartridge and a new O-ring; the old one had a cracked seal. Tested 10 minutes, no drips.";
// Done-Audit's short codes: everything passes but the note, which it calls not done
const codes = (over) => (m) => ({ json: { checks: [...String(m[1].content).matchAll(/^- (\S+) \(/gm)].map((x) => ({ id: x[1], v: "pass", r: "ok", e: null, ...(over[x[1]] || {}) })) } });
beforeEach(() => { delete process.env.DONE_AUDIT_PROMPTS; setVlm(null); setReader(() => ({ store: "DEMO", date: "2026-11-05", items: ["Faucet cartridge"], total: 4500, confidence: 0.95 })); });

test("reasons name the evidence naturally: 'The note', never 'Note note 1'", () => {
  const row = { check: { id: "work_note", what: "Note naming the part replaced and anything else found", evidence: "note" }, items: [{ e: { id: "note 1", kind: "note" } }] };
  const r = naturalReason({ code: "not_done", e: "note 1", reason: "Note note 1 shows it isn't done yet: note naming the part replaced is not true." }, row);
  assert.doesNotMatch(r, /Note note|is not true/); assert.match(r, /^The note /);
  const two = { ...row, items: [{ e: { id: "note 1", kind: "note" } }, { e: { id: "note 2", kind: "note" } }] };
  assert.match(naturalReason({ code: "unclear", e: "note 2" }, two), /^The note 2 is too unclear/);
  const ph = { check: { id: "c1", what: "Photo of the new cartridge installed", evidence: "photo" }, items: [{ e: { id: "p3", kind: "photo" } }, { e: { id: "p4", kind: "photo" } }] };
  assert.equal(naturalReason({ code: "wrong_subject", e: "p4" }, ph), "The photo p4 seems to be about something else, not the new cartridge installed.");
});

test("a note code finds complete, called not done by the model: a person confirms, it doesn't go back to the pro", async () => {
  setChat(codes({ work_note: { v: "needs_fix", r: "not_done", e: "note 1" } }));
  const ev = [{ id: "note 1", kind: "note", uploadedAt: UP, text: NOTE, checkId: "work_note" }];
  const r = await checkEvidence({ ...FX.job, scope }, ev, { history: [], remember: false });
  const c = byId(r, "work_note");
  assert.equal(c.verdict, "pass", c.reason); assert.equal(c.needsPerson, true); assert.equal(c.label, "NEEDS_REVIEW");
  assert.match(c.reason, /^the note gives what this condition asks for, but the check model doubted it \(The note doesn't say the work is finished/);
  assert.doesNotMatch(c.reason, /Note note|is not true/);
  assert.ok(c.signals.includes("needs_person: note_model_doubt (not_done)"));
  // the pro's own words saying it isn't finished still go back to the pro
  const ev2 = [{ ...ev[0], text: "Replaced the cartridge but it still drips, will come back with a new O-ring." }];
  assert.equal(byId(await checkEvidence({ ...FX.job, scope }, ev2, { history: [], remember: false }), "work_note").verdict, "needs_fix");
  // a note missing what the condition asks for still goes back (code's requirement, not the model's)
  const ev3 = [{ ...ev[0], text: "All done, everything works great now and the customer is happy with it." }];
  const c3 = byId(await checkEvidence({ ...FX.job, scope }, ev3, { history: [], remember: false }), "work_note");
  assert.equal(c3.verdict, "needs_fix"); assert.match(c3.reason, /the note doesn't give the part replaced/);
});

test("captions naming a different thing than the condition", () => {
  const np = scope.checks.find((c) => c.id === "new_part"), nd = scope.checks.find((c) => c.id === "no_drip");
  assert.deepEqual(captionMismatch(np, "corroded shut-off valve", scope).names, ["shut-off valve"]);
  assert.ok(captionMismatch(nd, "corroded shut-off valve", scope));
  for (const ok of ["new cartridge installed", "new faucet", "IMG_2231", ""]) assert.equal(captionMismatch(np, ok, scope), null, ok);
  assert.equal(captionMismatch(nd, "faucet on, no drips", scope), null);
});

test("synthetic photos captioned 'corroded shut-off valve' on new_part / no_drip: the reason says so, a person confirms, never APPROVED", async () => {
  setChat(codes({}));
  setVlm(() => ({ sees: "A chrome kitchen faucet installed over a dry steel sink, the new cartridge in place, no water dripping.", verdict: "pass", confidence: 0.9 }));
  const ev = [{ id: "e2", kind: "photo", path: path.join(D, "new_part.jpg"), uploadedAt: UP, checkId: "new_part", caption: "corroded shut-off valve" },
    { id: "e3", kind: "photo", path: path.join(D, "no_drip.jpg"), uploadedAt: UP, checkId: "no_drip", caption: "corroded shut-off valve" }];
  const r = await checkEvidence({ ...FX.job, scope }, ev, { history: [], remember: false });
  for (const id of ["new_part", "no_drip"]) {
    const c = byId(r, id);
    assert.notEqual(c.label, "APPROVED", id); assert.equal(c.needsPerson, true, id);
    assert.match(c.reason, /caption says "corroded shut-off valve", a shut-off valve, but this condition asks for the /, id);
    assert.ok(c.signals.some((s) => s.startsWith("caption_mismatch:")), id);
  }
  assert.notEqual(r.decision, "release");
});
