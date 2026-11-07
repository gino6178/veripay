// Measuring VeriPay's models on small labelled sets (api/test/fixtures/evidence). True numbers only: what this prints
// is what was measured, with 95% Wilson intervals, which on sets this small are wide.
//
//   node src/check/eval.mjs ocr                       Done-OCR: 30 held-out receipts (ocr-set/, make_ocr_set.py)
//   node src/check/eval.mjs audit [--limit N] [--timeout MS] [--out file.json]
//        Done-Audit: 36 labelled check/evidence cases (audit-set.jsonl), 6 of them attacks. Always scores the rules
//        judge; scores the model too when DONE_MODEL_URL is set (DONE_AUDIT_MODEL or DONE_MODEL names it). Attack
//        cases go to the model raw (instructions left in), to measure the model itself; in the app those sentences
//        are removed before the model sees them and the check goes to review regardless.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { images, parseReceipt } from "../ocr.js";
import { judgeMessages, rulesJudge } from "./judge.js";
import { chat, modelConfig } from "../llm.js";
import { looksLikeInstructions } from "../fraud.js";
import { noteRequirements, relevance } from "./relevance.js";
import { rulesScope } from "../scope.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIX = path.join(HERE, "..", "..", "test", "fixtures", "evidence");
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
export function wilson(k, n, z = 1.96) {
  if (!n) return [0, 0];
  const p = k / n, d = 1 + z * z / n, c = (p + z * z / (2 * n)) / d, h = (z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n))) / d;
  return [+Math.max(0, c - h).toFixed(3), +Math.min(1, c + h).toFixed(3)];
}
const rate = (k, n) => ({ k, n, rate: n ? +(k / n).toFixed(3) : null, ci95: wilson(k, n) });

async function ocr() {
  const folder = process.argv[3] && !process.argv[3].startsWith("--") ? process.argv[3] : "ocr-set", dir = path.join(FIX, folder), truth = JSON.parse(fs.readFileSync(path.join(dir, "truth.json"), "utf8"));
  const names = Object.keys(truth);
  const t0 = Date.now();
  const m = await images(names.map((n) => ({ path: path.join(dir, n), ocr: true })));
  const ms = Date.now() - t0;
  // --reader: through reader.js as the app reads a receipt (Done-OCR, then Windows' OCR when Done-OCR is unsure)
  const { readReceipt } = await import("../reader.js");
  const viaReader = process.argv.includes("--reader") ? new Map(await Promise.all(names.map(async (n) => [n, await readReceipt({ path: path.join(dir, n) }, { ocr: m.get(path.join(dir, n))?.lines ? m.get(path.join(dir, n)) : undefined })]))) : null;
  const rows = names.map((n) => {
    const o = m.get(path.join(dir, n)), rr = viaReader?.get(n), f = rr && !rr.error ? rr : o?.lines ? parseReceipt(o.lines.join("\n")) : {}, t = truth[n];
    return { n, layout: t.layout, font: t.font, total: f.total === t.total, date: f.date === t.date, store: f.store === t.store, conf: f.confidence ?? 0, error: o?.error || null, got: { total: f.total, date: f.date, store: f.store }, want: { total: t.total, date: t.date, store: t.store } };
  });
  const k = (key, rs = rows) => rate(rs.filter((r) => r[key]).length, rs.length);
  const all3 = rows.filter((r) => r.total && r.date && r.store).length;
  const confident = rows.filter((r) => r.conf >= 0.6);
  const out = {
    set: `${folder} (${names.length} rendered receipts)`, engine: `${m.get(path.join(dir, names[0]))?.ocrBy || "no OCR"} + ocr.js rules`,
    total: k("total"), date: k("date"), store: k("store"), all_three: rate(all3, rows.length),
    total_when_confidence_ge_0_6: k("total", confident), coverage_confidence_ge_0_6: rate(confident.length, rows.length),
    by_layout: Object.fromEntries(["column", "inline"].map((l) => [l, k("total", rows.filter((r) => r.layout === l))])),
    by_font: Object.fromEntries([...new Set(rows.map((r) => r.font))].map((f) => [f, k("total", rows.filter((r) => r.font === f))])),
    ms_per_receipt: Math.round(ms / rows.length), failures: rows.filter((r) => !(r.total && r.date && r.store)).map(({ n, got, want, font, layout, conf, error }) => ({ n, font, layout, confidence: conf, got, want, error })),
  };
  return out;
}

async function audit() {
  const cases = fs.readFileSync(path.join(FIX, "audit-set.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l)).slice(0, +arg("--limit", 1e9));
  const rowOf = (c) => ({ check: c.check, items: c.evidence.map((e) => ({ e: { id: e.id, kind: e.kind, text: e.said }, f: {} })) });
  const score = (preds) => {
    const ok = preds.filter((p) => p.pred === p.label).length;
    const notPass = preds.filter((p) => p.label !== "pass"), falseRelease = notPass.filter((p) => p.pred === "pass").length;
    const pass = preds.filter((p) => p.label === "pass"), missed = pass.filter((p) => p.pred !== "pass").length;
    const att = preds.filter((p) => p.attack), attWon = att.filter((p) => p.pred === "pass").length;
    const answered = preds.filter((p) => p.by === "model").length;
    // what the app would do with this one check: release only on a pass that is confident and not left to a person
    const outcome = (p) => (p.pred === "pass" && !p.needsPerson && (p.conf ?? 1) >= 0.6 ? "release" : p.pred === "needs_fix" && !p.needsPerson ? "needs_fix" : "review");
    const rel = notPass.filter((p) => outcome(p) === "release").length, goodToReview = pass.filter((p) => outcome(p) === "review").length, goodReleased = pass.filter((p) => outcome(p) === "release").length;
    return { cases: preds.length, answered_by_model: answered, accuracy_3class: rate(ok, preds.length), false_release: rate(falseRelease, notPass.length), pass_missed: rate(missed, pass.length), attacks_that_got_pass: rate(attWon, att.length),
      app: (() => { const o = (p) => p.gate || outcome(p), np = notPass.filter((p) => o(p) === "release"), gp = pass.filter((p) => o(p) === "release");
        return { released_when_it_should_not: rate(np.length, notPass.length), wrong_releases: np.map((p) => p.id), good_released: rate(gp.length, pass.length), good_released_by_kind: Object.fromEntries(["photo", "note", "receipt"].map((k) => [k, `${gp.filter((p) => p.kind === k).length}/${pass.filter((p) => p.kind === k).length}`])), attacks_released: rate(preds.filter((p) => p.attack && o(p) === "release").length, preds.filter((p) => p.attack).length) }; })(),
      decision: { released_when_it_should_not: rate(rel, notPass.length), good_released: rate(goodReleased, pass.length), good_sent_to_review: rate(goodToReview, pass.length), attacks_released: rate(att.filter((p) => outcome(p) === "release").length, att.length) } };
  };
  const out = { set: `audit-set.jsonl (${cases.length} cases, ${cases.filter((c) => c.attack).length} attacks)` };
  const rules = cases.map((c) => { const v = rulesJudge([rowOf(c)]).get(c.check.id); return { id: c.id, label: c.label, attack: c.attack, pred: v.verdict, conf: v.confidence, needsPerson: !!v.needsPerson, by: "rules" }; });
  out.rules = score(rules);
  const cfg = modelConfig();
  if (cfg.auditUrl) {
    const { auditRequest, verdictConfidences } = await import("./judge.js");
    const preds = [], ms = [];
    let promptsUsed = null;
    for (const c of cases) {
      // clean facts for every photo (taken inside the window, 20 m from the job): the set tests the wording, not EXIF
      const base = rowOf(c), here = { lat: 30.25, lng: -97.75 };
      const row = { ...base, signals: [], jobAddress: here, items: base.items.map((x) => (x.e.kind === "photo" ? { ...x, f: { exif: { taken: "2026-11-05T11:00:00-06:00", gps: { lat: 30.2502, lng: -97.75 } } } } : x)) };
      const q = await auditRequest({ scope: { title: c.title }, window: { from: "2026-11-05T14:00:00Z", to: "2026-11-08T02:00:00Z" }, address: { zip: "78745", lat: 30.25, lng: -97.75 } }, [row], [row], { raw: !arg("--app") });
      promptsUsed = q.prompts;
      const r = await chat(q.messages, { json: true, schema: q.schema, url: cfg.auditUrl, model: cfg.auditModel, timeoutMs: +arg("--timeout", 60e3), maxTokens: q.prompts === "app" ? 300 : 120, logprobs: q.prompts !== "app" });
      const list = r.json?.checks ? (q.expand && r.json.checks.some((x) => x && "v" in x) ? q.expand(r.json) : r.json.checks) : [];
      const v = list.find((x) => String(x.id) === c.check.id) || list[0];
      const lp = verdictConfidences(r.logprobs)[0];
      const ok = r.source === "model" && v?.verdict && v.code !== "no_verdict";
      const conf = ok ? (Number.isFinite(+v.confidence) ? +v.confidence : lp?.[v.verdict] ?? 0.5) : null;
      // what the app would do with this check, from code that runs whatever the model says: injection text -> review;
      // a photo condition needs a VLM verdict (none served) -> review; a note under 8 words -> needs_fix
      const said = c.evidence.map((e) => e.said).join(" "), kind = c.evidence[0]?.kind, clean = said.split(/(?<=[.!?\n])\s+/).filter((t) => !looksLikeInstructions(t)).join(" ");
      // notes also go through the code's wording requirements and topic check (relevance.js), as in rules.js
      const tplScope = { ...rulesScope({ text: c.title }), title: c.title };
      const noteGate = kind === "note" && ((clean.match(/\S+/g) || []).length < 8 || noteRequirements(c.check, tplScope).some((q) => !q.test(clean)) || relevance(clean, tplScope).ok === false);
      const gate = looksLikeInstructions(said) ? "review" : kind === "photo" ? "review" : noteGate ? "needs_fix" : null;
      preds.push({ id: c.id, label: c.label, attack: c.attack, kind, gate, pred: ok ? v.verdict : "none", by: ok ? "model" : "none", conf, reason: v?.reason, error: r.error });
      if (r.source === "model") ms.push(r.ms);
      process.stderr.write(`${c.id} ${c.label} -> ${preds.at(-1).pred} ${conf != null ? conf.toFixed(2) : ""} (${r.ms} ms)
`);
    }
    ms.sort((a, b) => a - b);
    out.model = { name: cfg.auditModel, url: cfg.auditUrl.replace(/\/\/[^/]*@/, "//"), prompts: promptsUsed, ...score(preds), ms_median: ms[Math.floor(ms.length / 2)] ?? null, ms_p90: ms[Math.floor(ms.length * 0.9)] ?? null, unanswered: preds.filter((p) => p.by !== "model").map((p) => `${p.id}: ${p.error || "no verdict"}`), wrong: preds.filter((p) => p.by === "model" && p.pred !== p.label).map((p) => `${p.id} ${p.label}->${p.pred}${p.attack ? " (attack)" : ""}: ${p.reason || ""}`) };
  } else out.model = "not measured: DONE_AUDIT_URL / DONE_MODEL_URL unset";
  return out;
}

// ---- Done-VLM: vlm-set/cases.jsonl (illustrated scenes; see make_more.py) ------------------------------------------------
async function vlm() {
  const { vlmLook, vlmConfig } = await import("../vlm.js");
  const cases = fs.readFileSync(path.join(FIX, "vlm-set", "cases.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l)).filter((c) => !arg("--task") || c.task === arg("--task")).slice(0, +arg("--limit", 1e9));
  const abs = (ps) => ps.map((p) => path.join(FIX, p));
  const rows = [];
  for (const c of cases) {
    const r = await vlmLook(c.task, { what: c.what, photos: abs(c.photos), before: abs(c.before || []), quantityOf: c.quantityOf, timeoutMs: +arg("--timeout", 600e3) });
    rows.push({ c, r });
    process.stderr.write(`${c.id} ${c.task} want ${c.label ?? c.quantity} -> ${r.source === "model" ? (c.task === "progress" ? `${r.quantity} / ${r.percentComplete}%` : `${r.verdict} ${r.confidence} same_spot=${r.sameSpot} instr=${r.instructionsInImage}`) : `none (${r.error})`} (${r.ms} ms)\n`);
  }
  const cond = rows.filter((x) => x.c.task === "condition"), ans = cond.filter((x) => x.r.source === "model");
  const passWhenNot = ans.filter((x) => x.c.label === "not_pass" && x.r.verdict === "pass" && x.r.confidence >= 0.6 && x.r.instructionsInImage !== true && x.r.sameSpot !== false);
  const ok = ans.filter((x) => (x.c.label === "pass") === (x.r.verdict === "pass"));
  const ss = ans.filter((x) => x.c.same_spot != null), ssOk = ss.filter((x) => x.r.sameSpot === x.c.same_spot);
  const inj = ans.filter((x) => x.c.instructions_in_image), injOk = inj.filter((x) => x.r.instructionsInImage === true || x.r.verdict !== "pass");
  const prog = rows.filter((x) => x.c.task === "progress"), pAns = prog.filter((x) => x.r.source === "model");
  const ms = ans.map((x) => x.r.ms).sort((a, b) => a - b);
  return { set: `vlm-set (${cases.length} cases: ${cond.length} condition, ${prog.length} progress; illustrated scenes)`, model: vlmConfig().model, answered: rate(ans.length + pAns.length, rows.length),
    pass_vs_not_accuracy: rate(ok.length, ans.length), released_when_it_should_not: rate(passWhenNot.length, ans.filter((x) => x.c.label === "not_pass").length),
    good_passed: rate(ans.filter((x) => x.c.label === "pass" && x.r.verdict === "pass").length, ans.filter((x) => x.c.label === "pass").length),
    same_spot: rate(ssOk.length, ss.length), injection_in_image_resisted: rate(injOk.length, inj.length),
    count_exact: rate(pAns.filter((x) => x.r.quantity === x.c.quantity).length, pAns.length), percent_within_15: rate(pAns.filter((x) => Math.abs(x.r.percentComplete - x.c.percent) <= 15).length, pAns.length),
    ms_median: ms[Math.floor(ms.length / 2)] ?? null, rows: rows.map(({ c, r }) => ({ id: c.id, want: c.label ?? { quantity: c.quantity, percent: c.percent }, got: r.source === "model" ? (c.task === "progress" ? { quantity: r.quantity, percent: r.percentComplete } : { verdict: r.verdict, confidence: r.confidence, sameSpot: r.sameSpot, instructionsInImage: r.instructionsInImage }) : null, sees: r.sees || null, error: r.error || null, ms: r.ms })) };
}

// ---- plate OCR: labels-set/ ----------------------------------------------------------------------------------------------
async function labels() {
  const { readLabel } = await import("../labels.js");
  const folder = process.argv[3] && !process.argv[3].startsWith("--") ? process.argv[3] : "labels-set", dir = path.join(FIX, folder), truth = JSON.parse(fs.readFileSync(path.join(dir, "truth.json"), "utf8")), names = Object.keys(truth);
  const m = await images(names.map((n) => ({ path: path.join(dir, n), ocr: true })));
  const { fold } = await import("../labels.js");
  const rows = await Promise.all(names.map(async (n) => { const f = await readLabel(path.join(dir, n), { ocr: m.get(path.join(dir, n)) }), t = truth[n];
    return { n, brand: f.brand === t.brand, model: !!f.model && fold(f.model) === fold(t.model), serial: !!f.serial && fold(f.serial) === fold(t.serial), capacity: f.capacityGal === t.capacityGal, rating: t.btu ? f.btu === t.btu : f.volts === t.volts, got: { brand: f.brand, model: f.model, serial: f.serial, capacityGal: f.capacityGal, btu: f.btu, volts: f.volts }, want: t }; }));
  const k = (key) => rate(rows.filter((r) => r[key]).length, rows.length);
  return { set: `${folder} (${rows.length} rendered rating plates)`, engine: "windows-ocr + labels.js rules", brand: k("brand"), model: k("model"), serial: k("serial"), capacity: k("capacity"), rating: k("rating"),
    note: "model and serial compared after folding O/0, I/L/1, S/5, B/8, Z/2", failures: rows.filter((r) => !(r.brand && r.model && r.serial && r.capacity)).map(({ n, got, want }) => ({ n, got, want })) };
}

// ---- documents: docs/ ------------------------------------------------------------------------------------------------------
async function docsEval() {
  const { validateDocument } = await import("../docs.js");
  const dir = path.join(FIX, "docs"), truth = JSON.parse(fs.readFileSync(path.join(dir, "truth.json"), "utf8"));
  const job = { address: { zip: "78745" }, window: { from: "2026-11-05T14:00:00Z", to: "2026-11-08T02:00:00Z" }, scope: { trade: "plumbing" } };
  const rows = [];
  for (const [n, t] of Object.entries(truth)) {
    const r = await validateDocument({ path: path.join(dir, n), job, expect: { amount: 22500, paid: false, stage: "progress" } });
    const f = r.fields || {};
    rows.push({ n, kind: r.kind === t.kind, fields: Object.entries(t).filter(([key]) => !["kind", "verdict"].includes(key)).every(([key, v]) => f[key === "type" ? "type" : key] === v), verdict: r.verdict, got: f, checks: r.checks.filter((c) => c.ok !== true).map((c) => `${c.id}: ${c.say}`) });
  }
  return { set: `docs (${rows.length} rendered documents)`, kind: rate(rows.filter((r) => r.kind).length, rows.length), fields_exact: rate(rows.filter((r) => r.fields).length, rows.length), rows };
}

const mode = process.argv[2];
const MODES = { ocr, audit, vlm, labels, docs: docsEval, gap: gapEval, notes: notesEval, vlmapp: vlmAppEval };
if (MODES[mode]) {
  const r = await MODES[mode]();
  r.at = new Date().toISOString();
  const s = JSON.stringify(r, null, 1);
  if (arg("--out")) fs.writeFileSync(arg("--out"), s + "\n");
  console.log(s);
} else if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  console.log("usage: node src/check/eval.mjs ocr [folder] | audit | vlm | labels [folder] | docs | gap [--limit N] [--timeout MS] [--out file.json]");
}

// ---- the gap review: gap-set.jsonl (24 hand-labelled conditions: vague / uncheckable / ok) -------------------------------
export async function gapEval() {
  const { rulesReview } = await import("../gap.js");
  const rows = fs.readFileSync(path.join(FIX, "gap-set.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l)).map((c) => {
    const r = rulesReview({ title: "x", trade: "handyman", template: "handyman", checks: [{ id: "before", what: "Photo of the problem before the work", evidence: "photo" }, { id: c.id, what: c.what, evidence: c.evidence }, { id: "n", what: "Note describing what was done", evidence: "note" }] });
    const got = r.issues.filter((i) => i.checkId === c.id).map((i) => i.kind);
    const pred = got.includes("uncheckable") ? "uncheckable" : got.includes("vague") ? "vague" : "ok";
    return { ...c, pred };
  });
  const flagged = (x) => x !== "ok";
  return { set: `gap-set.jsonl (${rows.length} conditions)`, judge: "rules (gap.js)", exact_kind: rate(rows.filter((r) => r.pred === r.label).length, rows.length),
    problem_caught: rate(rows.filter((r) => flagged(r.label) && flagged(r.pred)).length, rows.filter((r) => flagged(r.label)).length),
    false_alarm_on_ok: rate(rows.filter((r) => r.label === "ok" && flagged(r.pred)).length, rows.filter((r) => r.label === "ok").length),
    wrong: rows.filter((r) => r.pred !== r.label).map((r) => `${r.id} "${r.what}": ${r.label} -> ${r.pred}`) };
}

// ---- note conditions against their wording: notes-set.jsonl (22 notes, written after round 2's red team) ------------------
export async function notesEval() {
  const { rulesScope: rs } = await import("../scope.js");
  const { ruleCheck } = await import("./rules.js");
  const { auditRequest } = await import("./judge.js");
  const cfg = modelConfig();
  const cases = fs.readFileSync(path.join(FIX, "notes-set.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
  const rows = [];
  for (const c of cases) {
    const scope = rs({ text: c.title });
    const check = c.checkId === "licence" ? { id: "licence", what: "Note with the plumber's TSBPE licence number", evidence: "note", rule: "note>=1;words>=4" } : scope.checks.find((x) => x.id === c.checkId);
    const e = { id: "n", kind: "note", text: c.note };
    const det = ruleCheck(check, [e], new Map([["n", {}]]), { scope, window: {}, changeOrders: [] }, { history: [], photosElsewhere: () => [] });
    let model = null;
    if (cfg.auditUrl) {
      const row = { check, items: [{ e, f: {} }], signals: [] };
      const q = await auditRequest({ scope, window: { from: "2026-11-05T14:00:00Z", to: "2026-11-08T02:00:00Z" }, address: { zip: "78745" } }, [row], [row]);
      const r = await chat(q.messages, { json: true, schema: q.schema, url: cfg.auditUrl, model: cfg.auditModel, timeoutMs: +arg("--timeout", 8000), maxTokens: 120 });
      const list = r.json?.checks ? (q.expand && r.json.checks.some((x) => x && "v" in x) ? q.expand(r.json) : r.json.checks) : [];
      model = list[0]?.verdict && list[0].code !== "no_verdict" ? list[0].verdict : null;
    }
    const app = det.verdict !== "pass" ? det.verdict : model ?? "review";
    rows.push({ id: c.id, label: c.label, rules: det.verdict, model, app, why: det.reasons.join("; ") });
  }
  const passWrong = (k) => rows.filter((r) => r.label !== "pass" && r[k] === "pass").length, neg = rows.filter((r) => r.label !== "pass").length, pos = rows.filter((r) => r.label === "pass").length;
  const good = (k) => rows.filter((r) => r.label === "pass" && r[k] === "pass").length;
  return { set: `notes-set.jsonl (${rows.length} notes: ${pos} meet the condition, ${neg} don't)`, model: cfg.auditUrl ? cfg.auditModel : "not measured",
    rules_alone: { wrong_pass: rate(passWrong("rules"), neg), good_pass: rate(good("rules"), pos) },
    model_alone: cfg.auditUrl ? { wrong_pass: rate(passWrong("model"), neg), good_pass: rate(good("model"), pos) } : null,
    app_model_vetoed_by_code: cfg.auditUrl ? { wrong_pass: rate(passWrong("app"), neg), good_pass: rate(good("app"), pos) } : null,
    disagreements: rows.filter((r) => r.app !== r.label || r.model !== r.label).map((r) => `${r.id} ${r.label}: rules ${r.rules}, model ${r.model}, app ${r.app}${r.why ? ` (${r.why})` : ""}`) };
}

// ---- Done-VLM through the app: describe -> Done-Audit -> code, on vlm-set/cases.jsonl (condition cases) ------------------
// Each case is a one-condition job; released = the app would pay it (pass, not left to a person, confidence >= 0.6).
export async function vlmAppEval() {
  const { checkEvidence } = await import("./index.js");
  const { vlmConfig, vlmMode } = await import("../vlm.js");
  const cases = fs.readFileSync(path.join(FIX, "vlm-set", "cases.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l)).filter((c) => c.task === "condition");
  const rows = [];
  for (const c of cases) {
    const job = { id: `vlmapp_${c.id}`, scope: { title: c.what, items: [], checks: [{ id: "c1", what: c.what, evidence: "photo", rule: "photo>=1" }] }, address: { zip: "78745", lat: 30.25, lng: -97.75 }, window: { from: "2026-11-05T14:00:00Z", to: "2026-11-08T02:00:00Z" }, changeOrders: [] };
    const ev = [...c.photos.map((p, k) => ({ id: `a${k}`, kind: "photo", path: path.join(FIX, p), uploadedAt: "2026-11-05T18:00:00Z", checkId: "c1" })), ...(c.before || []).map((p, k) => ({ id: `b${k}`, kind: "photo", path: path.join(FIX, p), uploadedAt: "2026-11-05T18:00:00Z", checkId: "c1", stage: "before" }))];
    const t0 = Date.now(), r = await checkEvidence(job, ev, { history: [], remember: false, timeoutMs: +arg("--timeout", 20000), vlmTimeoutMs: +arg("--timeout", 20000) });
    const ch = r.checks[0], released = ch.verdict === "pass" && !ch.needsPerson && ch.confidence >= 0.6;
    rows.push({ id: c.id, label: c.label, released, verdict: ch.verdict, needsPerson: !!ch.needsPerson, confidence: ch.confidence, by: ch.by, sees: (ch.signals.find((s) => s.startsWith("vlm_sees")) || "").slice(0, 160), reason: ch.reason.slice(0, 160), ms: Date.now() - t0 });
    process.stderr.write(`${c.id} ${c.label} -> ${released ? "RELEASED" : ch.needsPerson ? "person" : ch.verdict} (${Date.now() - t0} ms) ${rows.at(-1).sees}\n`);
  }
  const bad = rows.filter((r) => r.label === "not_pass"), good = rows.filter((r) => r.label === "pass");
  const ms = rows.map((r) => r.ms).sort((a, b) => a - b);
  return { set: `vlm-set condition cases (${rows.length}; illustrated scenes) through checkEvidence`, mode: vlmMode(), vlm: vlmConfig().model, audit: modelConfig().auditModel,
    released_when_it_should_not: rate(bad.filter((r) => r.released).length, bad.length), good_released: rate(good.filter((r) => r.released).length, good.length),
    left_to_a_person: rate(rows.filter((r) => r.needsPerson).length, rows.length), ms_median_per_case: ms[Math.floor(ms.length / 2)], rows };
}
