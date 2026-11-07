// Documents, the Texas code pre-screen, plate OCR and defect claims.
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateDocument, parseDocument } from "../src/docs.js";
import { codePrescreen } from "../src/codes.js";
import { parseLabel, matchSpec } from "../src/labels.js";
import { checkDefectClaim } from "../src/check/defect.js";
import { verifyRecord } from "../src/check/attest.js";
import { setVlm } from "../src/vlm.js";
import { clearPhotoRows, loadPhotoRows } from "../src/check/history.js";

const D = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures", "evidence");
const WIN = process.platform === "win32";
const JOB = { id: "job_fx", address: { zip: "78745", lat: 30.25, lng: -97.75 }, window: { from: "2026-11-05T14:00:00Z", to: "2026-11-08T02:00:00Z" }, scope: { title: "Fix a leaking faucet", trade: "plumbing" } };
beforeEach(() => { setVlm(null); clearPhotoRows(); });

test("documents from text: invoice, conditional/unconditional Texas lien waivers, permit", async () => {
  const inv = await validateDocument({ text: "LONE STAR (DEMO)\nINVOICE\nInvoice #: 77\nDate: 11/05/2026\nAustin TX 78745\nRepair $180.00\nTOTAL DUE $225.00", job: JOB, expect: { amount: 22500 } });
  assert.equal(inv.kind, "invoice"); assert.equal(inv.fields.total, 22500); assert.equal(inv.verdict, "pass"); assert.equal(inv.label, "APPROVED");
  const bad = await validateDocument({ text: "X\nINVOICE\nInvoice #: 78\nDate: 11/05/2026\nAustin TX 78745\nTOTAL DUE $300.00", job: JOB, expect: { amount: 22500 } });
  assert.equal(bad.verdict, "fail"); assert.equal(bad.label, "REJECTED");
  const unc = await validateDocument({ text: "UNCONDITIONAL WAIVER AND RELEASE ON PROGRESS PAYMENT\nJob Location: Austin TX 78745\nClaimant: Demo Pro\nsum of $225.00\nSignature: /s/ Demo", job: JOB, expect: { amount: 22500, paid: false } });
  assert.equal(unc.kind, "lien_waiver"); assert.equal(unc.fields.conditional, false); assert.equal(unc.verdict, "fail"); assert.ok(unc.checks.some((c) => c.id === "type_fits" && c.ok === false));
  const noSig = await validateDocument({ text: "CONDITIONAL WAIVER AND RELEASE ON PROGRESS PAYMENT\nJob Location: Austin TX 78745\nClaimant: Demo Pro\nsum of $225.00", job: JOB, expect: { amount: 22500, paid: false } });
  assert.equal(noSig.verdict, "needs_fix"); assert.equal(noSig.label, "NEEDS_MORE_EVIDENCE");
  const notWaiver = await validateDocument({ kind: "lien_waiver", text: "INVOICE\nInvoice #: 1\nTOTAL $5.00", job: JOB });
  assert.ok(notWaiver.checks.some((c) => c.id === "kind" && c.ok === false));
  const per = parseDocument(["CITY OF AUSTIN (DEMO)", "PLUMBING PERMIT", "Permit No: 2026-1 PP", "Site Address: 1 Demo Rd, Austin TX 78745", "lssued: 11/04/2026", "Status: lssued"], "permit");
  assert.equal(per.fields.issued, "2026-11-04"); assert.equal(per.fields.type, "plumbing");
});

test("documents from images (OCR): the six rendered documents get the intended verdicts", { skip: !WIN && "needs Windows" }, async () => {
  const want = { "invoice_ok.jpg": "pass", "invoice_wrong_total.jpg": "fail", "waiver_conditional_progress.jpg": "pass", "waiver_unconditional_final.jpg": "fail", "permit_plumbing.jpg": "pass", "permit_wrong_address.jpg": "fail" };
  for (const [n, v] of Object.entries(want)) {
    const r = await validateDocument({ path: path.join(D, "docs", n), job: JOB, expect: { amount: 22500, paid: false, stage: "progress" } });
    assert.equal(r.verdict, v, `${n}: ${r.checks.filter((c) => c.ok !== true).map((c) => c.say).join("; ")}`);
  }
});

test("Texas code pre-screen: water heater needs a permit and a TSBPE plumber; drywall needs neither; wiring needs TDLR", () => {
  const w = codePrescreen({ template: "water_heater", text: "replace water heater", zip: "78745" });
  assert.equal(w.permit, "required"); assert.equal(w.licence.who, "TSBPE-licensed plumber"); assert.ok(w.rules.some((r) => /1301/.test(r.cite))); assert.equal(w.inAustin, true);
  assert.deepEqual(w.addChecks.map((c) => c.id), ["permit", "licence"]);
  const d = codePrescreen({ template: "drywall", trade: "handyman", text: "patch a hole" });
  assert.equal(d.permit, "not_usually"); assert.equal(d.licence.needed, false);
  const e = codePrescreen({ template: "tv_mount", trade: "handyman", text: "mount the TV and add an outlet behind it" });
  assert.equal(e.licence.who, "TDLR-licensed electrician"); assert.equal(e.permit, "likely");
  const g = codePrescreen({ template: "water_heater", text: "gas water heater", zip: "75201" });
  assert.match(g.licence.who, /gas endorsement/); assert.equal(g.inAustin, false); assert.match(g.disclaimer, /outside Austin/);
});

test("plate fields by rules, and matching to the order's spec", () => {
  const f = parseLabel(["RHEEM (DEMO)", "MODEL: PRO50T066", "SERIAL NO: TB52518562", "CAPACITY: 50 U.S. GAL", "INPUT: 40 , 000 BTU/HR"]);
  assert.equal(f.brand, "Rheem"); assert.equal(f.model, "PRO50T066"); assert.equal(f.serial, "TB52518562"); assert.equal(f.capacityGal, 50); assert.equal(f.btu, 40000);
  assert.equal(parseLabel(["DEMO HEAT (DEMO)", "CAPACITY: 30 U.S. GAL"]).brand, "Demo Heat", "U.S. GAL is not the brand USG");
  assert.deepEqual(matchSpec(f, { capacityGal: 50, model: "PR050T066" }).ok, true, "O/0 folded");
  assert.equal(matchSpec(f, { capacityGal: 40 }).ok, false);
  assert.equal(matchSpec(f, null).ok, null);
});

test("defect claims: valid with a VLM that sees it; rejected only for reasons code proves; otherwise a person", { skip: !WIN && "needs Windows" }, async () => {
  const job = { ...JOB, releasedAt: "2026-11-06T00:00:00Z", warrantyUntil: "2026-12-06T00:00:00Z" };
  const claim = { text: "The faucet started dripping again two weeks after the repair", at: "2026-11-20T19:00:00Z", checkId: "no_drip" };
  const p = (id, f) => ({ id, kind: "photo", path: path.join(D, f), uploadedAt: "2026-11-20T19:00:00Z" });
  let r = await checkDefectClaim(job, claim, [p("d1", "defect_drip.jpg")], { history: [] });
  assert.equal(r.verdict, "review"); assert.match(r.reasons[0], /no VLM verdict/);
  setVlm(() => ({ verdict: "shows_defect", related_to_condition: true, sees: "water dripping from the spout", confidence: 0.85 }));
  r = await checkDefectClaim(job, claim, [p("d1", "defect_drip.jpg")], { history: [] });
  assert.equal(r.verdict, "valid"); assert.equal(r.decision, "hold_and_fix"); assert.equal(r.source, "vlm"); assert.ok(verifyRecord(r.attestation));
  r = await checkDefectClaim(job, claim, [p("d1", "defect_old.jpg")], { history: [] });
  assert.equal(r.verdict, "invalid"); assert.match(r.reasons.join(" "), /before the job was paid/);
  r = await checkDefectClaim(job, { ...claim, at: "2027-01-10T00:00:00Z" }, [p("d1", "defect_drip.jpg")], { history: [] });
  assert.equal(r.decision, "reject"); assert.match(r.reasons.join(" "), /warranty window ended/);
  setVlm(() => ({ verdict: "no_defect", related_to_condition: false, sees: "a dry faucet", confidence: 0.9 }));
  r = await checkDefectClaim(job, claim, [p("d1", "defect_drip.jpg")], { history: [] });
  assert.equal(r.verdict, "review", "a VLM 'no defect' never rejects a customer's claim by itself");
});

test("documents say who decided (rules) and who read the text, also when nothing could be read", async () => {
  const a = await validateDocument({ text: "PLUMBING PERMIT\nPermit No: 1\nIssued: 11/04/2026", kind: "permit", job: JOB });
  assert.equal(a.by, "rules"); assert.equal(a.readBy, "given text");
  const pdf = path.join(D, "docs", "tmp-permit.pdf");
  fs.writeFileSync(pdf, "%PDF-1.4\n%demo\n");
  try {
    const b = await validateDocument({ path: pdf, kind: "permit", job: JOB });
    assert.equal(b.by, "rules"); assert.equal(b.readBy, "none (PDF)"); assert.equal(b.verdict, "needs_fix"); assert.match(b.checks[0].say, /PDF/);
  } finally { fs.rmSync(pdf, { force: true }); }
  const c = await validateDocument({ path: path.join(D, "docs", "missing.jpg"), kind: "permit", job: JOB });
  assert.equal(c.by, "rules"); assert.match(c.readBy, /file not found/);
  if (WIN) { const d = await validateDocument({ path: path.join(D, "docs", "permit_plumbing.jpg"), job: JOB }); assert.equal(d.by, "rules"); assert.match(d.readBy, /^windows-ocr/); }
});
