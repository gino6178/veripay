// Round 3: photos from before the work started, AFTER photos older than the BEFORE photos, permit numbers in Austin's
// formats, and photos labelled as another kind of job.
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { checkEvidence } from "../src/check/index.js";
import { workStart, when } from "../src/check/rules.js";
import { validateDocument, permitNumberIn } from "../src/docs.js";
import { noteRequirements } from "../src/check/relevance.js";
import { rulesScope } from "../src/scope.js";
import { setChat } from "../src/llm.js";
import { setVlm } from "../src/vlm.js";
import { setReader } from "../src/reader.js";

const D = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures", "evidence");
const FX = JSON.parse(fs.readFileSync(path.join(D, "fixtures.json"), "utf8"));
const UP = "2026-11-05T18:00:00Z", NOW = Date.parse("2026-11-04T18:00:00Z");
const passAll = (m) => ({ json: { checks: [...String(m[1].content).matchAll(/^(?:CHECK (\S+):|- (\S+) \()/gm)].map((x) => ({ id: x[1] || x[2], verdict: "pass", reason: "fine", confidence: 0.95 })) } });
const photo = (id, file, checkId, extra = {}) => ({ id, kind: "photo", path: path.join(D, file), uploadedAt: UP, checkId, ...extra });
const byId = (r, id) => r.checks.find((c) => c.id === id);
const sig = (c, re) => c.signals.some((s) => re.test(s));
const scope = rulesScope({ parts: true, text: "leaky faucet", zip: "78745", now: NOW });
// before.jpg 10:05, new_part.jpg 10:41, no_drip.jpg 11:02 (Austin, Nov 5)
const ev = () => [photo("e1", "before.jpg", "before"), photo("e2", "new_part.jpg", "new_part"), photo("e3", "no_drip.jpg", "no_drip"), { id: "n", kind: "note", uploadedAt: UP, text: FX.notes.good, checkId: "work_note" }, { id: "r", kind: "receipt", path: path.join(D, "receipt_valve.jpg"), uploadedAt: UP }];
const run = (j, e = ev()) => checkEvidence({ ...FX.job, scope, ...j }, e, { history: [], remember: false });
beforeEach(() => { setChat(passAll); setVlm(() => ({ verdict: "pass", sees: "A chrome kitchen faucet installed over a dry steel sink, the new cartridge in place, no water dripping.", confidence: 0.9, same_spot: true })); setReader(() => ({ store: "DEMO", date: "2026-11-05", items: ["Faucet cartridge", "shutoff valve"], total: 4500, confidence: 0.95 })); });

test("the photo time's lower bound is when work started (startedAt, else agreedAt, else created), with a reason a person reads", async () => {
  assert.equal(workStart({ startedAt: "2026-11-05T16:15:00Z", created: "2026-11-01T00:00:00Z" }).from, "startedAt");
  assert.equal(workStart({ agreedAt: "2026-11-05T16:15:00Z" }).from, "agreedAt");
  assert.equal(workStart({}), null);
  assert.equal(when(Date.parse("2026-11-05T18:34:00Z")), "Nov 5, 12:34 PM");
  // started 10:15: the BEFORE photo at 10:05 is within its 15 minutes; everything passes
  let r = await run({ startedAt: "2026-11-05T16:15:00Z" });
  assert.equal(r.decision, "release", JSON.stringify(r.checks.filter((c) => c.verdict !== "pass").map((c) => c.reason)));
  // started 10:50: the new-part photo (10:41) predates the work
  r = await run({ startedAt: "2026-11-05T16:50:00Z" });
  const c = byId(r, "new_part");
  assert.equal(c.verdict, "fail"); assert.equal(c.reason, "e2 was taken Nov 5, 10:41 AM, before work started at Nov 5, 10:50 AM"); assert.ok(sig(c, /exif_before_start/));
  assert.equal(byId(r, "before").verdict, "fail", "a BEFORE shot 45 minutes before the start is too early too");
  assert.equal(r.decision, "review");
  // no startedAt: a photo taken before the job was even agreed fails, saying so
  r = await run({ agreedAt: "2026-11-05T17:30:00Z" });
  assert.match(byId(r, "no_drip").reason, /before work started at Nov 5, 11:30 AM \(the job was agreed then\)/);
});

test("AFTER photos must be taken after the BEFORE photos", async () => {
  const e = ev().map((x) => (x.id === "e1" ? photo("e1", "no_drip.jpg", "before") : x.id === "e3" ? photo("e3", "before.jpg", "no_drip") : x));
  const r = await run({}, e);
  const c = byId(r, "new_part");
  assert.equal(c.verdict, "fail"); assert.match(c.reason, /e2 was taken Nov 5, 10:41 AM, before the BEFORE photo e1 \(Nov 5, 11:02 AM\)/);
  assert.ok(sig(byId(r, "no_drip"), /exif_before_before_photo: e3 < e1/));
});

test("permit numbers in Austin/Texas formats are recognised (documents and notes)", async () => {
  for (const [t, n] of [["BP-2026-004512", "BP-2026-004512"], ["Plumbing permit issued: 2026-004512 PR", "2026-004512 PR"], ["Permit #: 2026-123456 PP", "2026-123456 PP"], ["Permit # 88123", "88123"], ["Permit No: PP-2026-0001", "PP-2026-0001"]]) assert.equal(permitNumberIn(t), n, t);
  assert.equal(permitNumberIn("Finished 11/05/2026 at 3 PM, 50 gal"), null);
  const d = await validateDocument({ kind: "permit", text: "CITY OF AUSTIN (DEMO)\nPLUMBING\nBP-2026-004512\nSite Address: 1 Demo Rd, Austin TX 78745\nIssued: 11/04/2026\nStatus: Issued", job: { address: { zip: "78745" }, window: FX.job.window, scope: { trade: "plumbing" } } });
  assert.equal(d.fields.number, "BP-2026-004512"); assert.ok(d.checks.find((c) => c.id === "number").ok);
  const wh = rulesScope({ text: "replace water heater", now: NOW });
  const q = noteRequirements(wh.checks.find((c) => c.id === "work_note"), wh).find((x) => x.id === "permit");
  assert.ok(q.test("Pulled BP-2026-004512, leak check done")); assert.ok(q.test("2026-004512 PR on file"));
});

test("photos labelled as another kind of job (a faucet photo on a water-heater job) don't pass, with or without a VLM", async () => {
  const wh = rulesScope({ text: "replace water heater", zip: "78745", now: NOW });
  const e = [photo("p1", "vlm-set/faucet_dry.jpg", "new_unit")];
  for (const vlm of [true, false]) {
    setVlm(vlm ? () => ({ verdict: "pass", sees: "ok", confidence: 0.9 }) : null);
    const r = await checkEvidence({ ...FX.job, scope: wh }, e, { history: [], remember: false });
    const c = byId(r, "new_unit");
    assert.equal(c.verdict, "needs_fix", `vlm ${vlm}`); assert.match(c.reason, /p1 is labelled as faucet .*not this job \(Replace a water heater\)/);
  }
  // a photo whose words say nothing (IMG_1234) isn't judged by its name: without a VLM it goes to a person
  setVlm(null);
  const tmp = path.join(D, "IMG_1234.jpg"); fs.copyFileSync(path.join(D, "no_drip.jpg"), tmp);
  try {
    const r = await checkEvidence({ ...FX.job, scope: wh }, [photo("p2", "IMG_1234.jpg", "new_unit")], { history: [], remember: false });
    const c = byId(r, "new_unit");
    assert.ok(!sig(c, /photo_topic_mismatch/)); assert.equal(c.needsPerson, true); assert.notEqual(c.label, "APPROVED");
  } finally { fs.rmSync(tmp, { force: true }); }
});

test("round 4: an undated receipt doesn't pass in_window; a typed date in the window is checked but a person confirms", async () => {
  const e = ev().map((x) => (x.id === "r" ? { ...x, text: undefined } : x));
  setReader(() => ({ store: "DEMO", date: null, items: ["Faucet cartridge", "shutoff valve"], total: 4500, confidence: 0.9 }));
  let r = await run({}, e);
  let c = byId(r, "receipt");
  assert.equal(c.verdict, "needs_fix"); assert.match(c.reason, /the receipt's date can't be read; send a clearer photo or type the date/); assert.ok(sig(c, /receipt_no_date: r/));
  r = await run({}, e.map((x) => (x.id === "r" ? { ...x, text: "bought it 11/05/2026" } : x)));
  c = byId(r, "receipt");
  assert.equal(c.verdict, "pass"); assert.ok(sig(c, /receipt_date_typed: r 2026-11-05/)); assert.ok(c.confidence <= 0.5); assert.equal(r.decision, "review");
  r = await run({}, e.map((x) => (x.id === "r" ? { ...x, text: "date 11/20/2026" } : x)));
  c = byId(r, "receipt");
  assert.equal(c.verdict, "fail"); assert.match(c.reason, /dated 2026-11-20, after the job ended/);
});
