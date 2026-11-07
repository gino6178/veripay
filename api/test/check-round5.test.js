// Round 5: receipts and documents reused across jobs, make-assets.ps1 receipt dates, and the demo permit (a reason that
// always matches its verdict, naming the failing field).
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { checkEvidence } from "../src/check/index.js";
import { clearPhotoRows, photoRows } from "../src/check/history.js";
import { validateDocument } from "../src/docs.js";
import { images, parseReceipt } from "../src/ocr.js";
import { rulesScope } from "../src/scope.js";
import { setChat } from "../src/llm.js";
import { setVlm } from "../src/vlm.js";
import { setReader } from "../src/reader.js";

const D = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures", "evidence");
const FX = JSON.parse(fs.readFileSync(path.join(D, "fixtures.json"), "utf8"));
const WIN = process.platform === "win32";
const UP = "2026-11-05T18:00:00Z", NOW = Date.parse("2026-11-04T18:00:00Z");
const passAll = (m) => ({ json: { checks: [...String(m[1].content).matchAll(/^(?:CHECK (\S+):|- (\S+) \()/gm)].map((x) => ({ id: x[1] || x[2], verdict: "pass", reason: "fine", confidence: 0.95 })) } });
const byId = (r, id) => r.checks.find((c) => c.id === id);
const sig = (c, re) => c.signals.some((s) => re.test(s));
const scope = rulesScope({ parts: true, text: "leaky faucet", zip: "78745", now: NOW });
beforeEach(() => { setChat(passAll); setVlm(() => ({ verdict: "pass", sees: "A chrome kitchen faucet installed over a dry steel sink, the new cartridge in place, no water dripping.", confidence: 0.9, same_spot: true })); setReader(null); clearPhotoRows(); });

test("a receipt already used on another job is caught: same file, or the same store, total and date", { skip: !WIN && "needs Windows" }, async () => {
  const rec = (id, file = "receipt_valve.jpg") => ({ id, kind: "receipt", path: path.join(D, file), uploadedAt: UP, checkId: "receipt" });
  const job = (id) => ({ ...FX.job, id, scope });
  await checkEvidence(job("job_1"), [rec("r1")], { model: false });
  assert.ok(photoRows().some((r) => r.kind === "receipt" && r.jobId === "job_1" && r.total === 4487));
  let r = await checkEvidence(job("job_2"), [rec("r2")], { model: false, remember: false });
  let c = byId(r, "receipt");
  assert.equal(c.verdict, "needs_fix"); assert.match(c.reason, /this receipt was already used on another job \(job_1\)/); assert.ok(sig(c, /receipt_reused: r2 ~ job_1\/r1 \(same file\)/));
  // a re-photographed copy: different file, same store, total and date (a custom reader stands in for the OCR)
  setReader(() => ({ store: "HILL COUNTRY HARDWARE (DEMO)", date: "2026-11-05", items: ["Faucet cartridge"], total: 4487, confidence: 0.9 }));
  r = await checkEvidence(job("job_3"), [rec("r3", "receipt_short.jpg")], { model: false, remember: false });
  assert.ok(sig(byId(r, "receipt"), /receipt_reused: r3 ~ job_1\/r1 \(same store, total and date\)/));
  // the same job re-checking its own receipt is not reuse
  setReader(null);
  r = await checkEvidence(job("job_1"), [rec("r1")], { model: false, remember: false });
  assert.ok(!sig(byId(r, "receipt"), /receipt_reused/));
});

test("documents reused on another job (same file or same permit number) are needs_fix with the reason", async () => {
  const text = (n) => `CITY OF AUSTIN DEVELOPMENT SERVICES (demo)\nPLUMBING PERMIT No. ${n}\nIssued: 11/05/2026   Expires: 180 days after issue\nSite: 4100 Demo Rd, Austin TX 78745\nWork: Replace a water heater`;
  const job = (id) => ({ id, address: { zip: "78745" }, window: FX.job.window, scope: { trade: "plumbing" } });
  assert.equal((await validateDocument({ kind: "permit", text: text("BP-2026-004512"), job: job("job_a") })).verdict, "pass");
  const again = await validateDocument({ kind: "permit", text: text("BP-2026-004512"), job: job("job_b") });
  assert.equal(again.verdict, "needs_fix"); assert.match(again.reason, /this permit was already used on another job \(job_a\): same number BP-2026-004512/);
  assert.equal((await validateDocument({ kind: "permit", text: text("BP-2026-004999"), job: job("job_b") })).verdict, "pass");
  assert.equal((await validateDocument({ kind: "permit", text: text("BP-2026-004512"), job: job("job_a") })).verdict, "pass", "the same job again is fine");
});

test("the demo permit (demoassets.js text) passes; a reason always matches its verdict and names the failing field", async () => {
  const today = "11/05/2026";
  const demo = `CITY OF AUSTIN DEVELOPMENT SERVICES (demo)\nPLUMBING PERMIT No. BP-2026-004512\nIssued: ${today}   Expires: 180 days after issue\nSite: 4100 Demo Rd, Austin TX 78745\nWork: Replace a water heater`;
  const job = { id: "job_demo", address: { zip: "78745" }, window: FX.job.window, scope: { trade: "plumbing" } };
  const r = await validateDocument({ kind: "permit", text: demo, job, expect: { stage: "final" } });
  assert.equal(r.verdict, "pass", r.reason); assert.equal(r.label, "APPROVED");
  assert.match(r.reason, /^The permit checks out: permit BP-2026-004512; issued 2026-11-05; site 4100 Demo Rd, Austin TX 78745/);
  assert.ok(!r.checks.some((c) => c.ok === false));
  const noDate = await validateDocument({ kind: "permit", text: demo.replace(/Issued.*\n/, "").replace("004512", "004520"), job: { ...job, id: "job_demo2" } });
  assert.equal(noDate.verdict, "needs_fix"); assert.equal(noDate.reason, "The permit is incomplete: no issue date found.");
  const noSite = await validateDocument({ kind: "permit", text: demo.replace(/Site.*\n/, "").replace("004512", "004521"), job: { ...job, id: "job_demo3" } });
  assert.equal(noSite.reason, "The permit is incomplete: no site address found.");
  const other = await validateDocument({ kind: "permit", text: demo.replace("78745", "78702").replace("004512", "004513"), job: { ...job, id: "job_demo4" } });
  assert.equal(other.verdict, "fail"); assert.equal(other.reason, "The permit doesn't match the job: the site ZIP 78702 isn't the job's 78745.");
  const expired = await validateDocument({ kind: "permit", text: `${demo.replace("004512", "004514")}\nStatus: Expired`, job: { ...job, id: "job_demo5" } });
  assert.equal(expired.verdict, "fail"); assert.match(expired.reason, /status expired/);
  // for every document fixture: pass <=> no failing check <=> the reason says "checks out"
  for (const n of fs.readdirSync(path.join(D, "docs")).filter((f) => f.endsWith(".jpg"))) {
    if (!WIN) break;
    const v = await validateDocument({ path: path.join(D, "docs", n), job: { id: `job_${n}`, address: { zip: "78745" }, window: FX.job.window, scope: { trade: "plumbing" } }, expect: { amount: 22500, paid: false, stage: "progress" } });
    assert.equal(v.verdict === "pass", !v.checks.some((c) => c.ok === false), n); assert.equal(/checks out/.test(v.reason), v.verdict === "pass", `${n}: ${v.reason}`);
  }
});

test("the demo permit sticker photo: number read (unclear digits marked), and it names what a sticker lacks", { skip: !WIN && "needs Windows" }, async () => {
  const r = await validateDocument({ kind: "permit", path: path.join(D, "..", "..", "..", "demo-assets", "permit-sticker.jpg"), job: { id: "job_sticker", address: { zip: "78704" }, window: FX.job.window, scope: { trade: "plumbing" } } });
  assert.match(r.fields.number, /^BP-2026-\d{6}$/); assert.equal(r.verdict, "needs_fix"); assert.equal(r.reason, "The permit is incomplete: no issue date found; no site address found.");
});

test("make-assets.ps1 receipts (Consolas, dotted zero): date, total and store read; '01' read as '91' is fixed", { skip: !WIN && "needs Windows" }, async () => {
  const want = { "r-11-05-2026.jpg": ["2026-11-05", 4705], "r-01-09-2027.jpg": ["2027-01-09", 4705], "h-11-05-2026.jpg": ["2026-11-05", 88873] };
  const dir = path.join(D, "make-assets"), m = await images(Object.keys(want).map((n) => ({ path: path.join(dir, n), ocr: true })));
  for (const [n, [date, total]] of Object.entries(want)) {
    const f = parseReceipt(m.get(path.join(dir, n)).lines.join("\n"));
    assert.equal(f.date, date, n); assert.equal(f.total, total, n);
  }
});

test("reuse history survives a restart: number-only document rows are kept on reload", async () => {
  const { loadPhotoRows } = await import("../src/check/history.js");
  const text = (n) => `CITY OF AUSTIN (demo)\nPLUMBING PERMIT No. ${n}\nIssued: 11/05/2026\nSite: 1 Demo Rd, Austin TX 78745`;
  const job = (id) => ({ id, address: { zip: "78745" }, window: FX.job.window, scope: { trade: "plumbing" } });
  await validateDocument({ kind: "permit", text: text("BP-2026-007001"), job: job("job_x") });   // text only: no file hash
  const saved = JSON.parse(JSON.stringify(photoRows()));
  assert.ok(saved.some((r) => r.kind === "document" && r.number === "BP2026007001" && !r.sha));
  clearPhotoRows(); loadPhotoRows(saved);                                                     // restart
  assert.equal(photoRows().length, saved.length);
  const r = await validateDocument({ kind: "permit", text: text("BP-2026-007001"), job: job("job_y") });
  assert.equal(r.verdict, "needs_fix"); assert.match(r.reason, /already used on another job \(job_x\)/);
});

test("only code claims a duplicate (or a time, place, date, missing item): a model's unproven claim is ignored", async () => {
  // the trained model's short codes: { id, v, r, e }; r "duplicate" on the receipt, "missing" on a note that is there
  setChat((m) => ({ json: { checks: [...String(m[1].content).matchAll(/^- (\S+) \(/gm)].map((x) => ({ id: x[1], v: x[1] === "receipt" ? "fail" : x[1] === "work_note" ? "needs_fix" : "pass", r: x[1] === "receipt" ? "duplicate" : x[1] === "work_note" ? "missing" : "ok", e: null })) } }));
  setReader(() => ({ store: "DEMO", date: "2026-11-05", items: ["Faucet cartridge", "shutoff valve"], total: 4500, confidence: 0.95 }));
  const job = { ...FX.job, id: "job_fresh", scope };
  const ev = [{ id: "r", kind: "receipt", path: path.join(D, "receipt_valve.jpg"), uploadedAt: UP, checkId: "receipt" }, { id: "n", kind: "note", uploadedAt: UP, text: FX.notes.good, checkId: "work_note" }];
  const r = await checkEvidence(job, ev, { history: [], remember: false });
  const rc = byId(r, "receipt"), wn = byId(r, "work_note");
  assert.notEqual(rc.verdict, "fail"); assert.ok(!/same image/.test(rc.reason), rc.reason); assert.match(rc.reason, /decided by code: the receipt total matched/);
  assert.ok(!/No note/.test(wn.reason), wn.reason);
  assert.ok(r.signals.some((s) => /model_claim_ignored: receipt: the model said "duplicate" but code found no matching item in the evidence history/.test(s)));
  assert.ok(r.signals.some((s) => /model_claim_ignored: work_note: the model said "missing" but code found the evidence present/.test(s)));
  // with a real match in the history, the code's own reuse finding fails it (and the model's claim agrees)
  const { codeClaimUnproven } = await import("../src/check/judge.js");
  assert.equal(codeClaimUnproven("duplicate", { signals: ["receipt_reused: r ~ job_1/r1 (same file)"], items: [1] }), null);
  assert.equal(codeClaimUnproven("duplicate", { signals: [], items: [1] }), "no matching item in the evidence history");
  assert.equal(codeClaimUnproven("not_done", { signals: [], items: [1] }), null, "judgement codes are the model's to give");
});

test("a typed receipt: TOTAL beats SUBTOTAL (the demo heater receipt reads $888.73, not $821.00)", async () => {
  const { typedTotal } = await import("../src/reader.js");
  assert.equal(typedTotal("AUSTIN PLUMBING SUPPLY (demo)\nDATE 11/05/2026\n50 GAL GAS WATER HTR 699.00\n2 GAL EXPANSION TANK 54.00\nT&P VALVE + FITTINGS 68.00\nSUBTOTAL 821.00\nTAX 67.73\nTOTAL 888.73"), 88873);
  assert.equal(typedTotal("SUB-TOTAL 10.00 total 10.83"), 1083);
  assert.equal(typedTotal("Subtotal: $821.00"), null);
  assert.equal(typedTotal("Parts receipt, total $45.10"), 4510);
});
