// The models, at arm's length. Three modules belong to the evidence/AI side (llm.js, scope.js, check/index.js); this
// file loads them lazily and, when one is missing, broken or slow, falls back to plain rules (rules.js) and says so.
// Whatever a model returns is fields and verdicts with reasons: code decides money (jobs.js), never the model.
//   chat(messages, opts)        -> { text, json?, source: "model" | "rules" | "none", ms }
//   writeScope({ text, zip, budgetMax }) -> the job's scope and done-conditions
//   checkEvidence(job, evidence) -> a verdict per done-condition
// Tests and seeding run on the rules (DONE_AI=rules, the default under the test runner); DONE_AI=live uses the models.
import { rulesScope, rulesCheck, rulesScopeReview } from "./rules.js";

const cache = new Map();
async function load(file) {
  if (cache.has(file)) return cache.get(file);
  try {
    const m = await import(new URL(file, import.meta.url).href);
    cache.set(file, m);
    return m;
  } catch (e) {
    // a module that doesn't exist yet is looked for again next time; one that is there but fails is reported once
    if (e?.code !== "ERR_MODULE_NOT_FOUND" && !cache.has(`${file}:warned`)) { cache.set(`${file}:warned`, true); console.error(`ai: ${file} failed to load (${String(e?.message || e).slice(0, 160)}); using rules`); }
    return null;
  }
}
const rulesOnly = () => process.env.DONE_AI === "rules" || (process.env.NODE_TEST_CONTEXT && process.env.DONE_AI !== "live");
const over = { chat: null, scope: null, check: null, review: null, defect: null, doc: null };
// (tests) put a function in place of a model
export const setAI = (o = {}) => { for (const k of ["chat", "scope", "check", "review", "defect", "doc", "refine", "materials"]) if (o[k] !== undefined) over[k] = o[k]; };

async function chat_(messages, opts = {}) {
  const t0 = Date.now();
  if (over.chat) return over.chat(messages, opts);
  if (rulesOnly()) return { text: null, source: "none", ms: 0 };
  const m = await load("./llm.js");
  if (!m?.chat) return { text: null, source: "none", ms: Date.now() - t0 };
  try { return await m.chat(messages, { timeoutMs: 4000, ...opts }); } catch { return { text: null, source: "none", ms: Date.now() - t0 }; }
}

const validScope = (s) => s && typeof s.title === "string" && Array.isArray(s.items) && Array.isArray(s.checks) && s.checks.length > 0 && s.checks.every((c) => c && c.id && c.what && ["photo", "receipt", "note"].includes(c.evidence));
async function writeScope_(input) {
  const t0 = Date.now();
  if (over.scope) return over.scope(input);
  if (!rulesOnly()) {
    const m = await load("./scope.js");
    if (m?.writeScope) {
      try {
        const s = await m.writeScope(input);
        if (validScope(s)) return { ...s, priceCeiling: Number.isFinite(s.priceCeiling) ? Math.round(s.priceCeiling) : input.budgetMax ?? null };
        console.error("ai: scope.js returned a scope without valid checks; using rules");
      } catch (e) { console.error(`ai: scope.js failed (${String(e?.message || e).slice(0, 120)}); using rules`); }
    }
  }
  return { ...rulesScope(input), ms: Date.now() - t0 };
}

// the model's scope with a longer budget, for the background (scope.js refineScope); null when there is none
export async function refineScope(input) {
  if (over.refine) return over.refine(input);
  if (rulesOnly()) return null;
  const m = await load("./scope.js");
  if (!m?.refineScope) return null;
  try { const s = await m.refineScope(input); return validScope(s) && s.source !== "rules" ? { ...s, priceCeiling: Number.isFinite(s.priceCeiling) ? Math.round(s.priceCeiling) : input.budgetMax ?? null } : null; }
  catch (e) { console.error(`ai: refineScope failed (${String(e?.message || e).slice(0, 120)})`); return null; }
}

// a parts receipt condition once parts are paid for (scope.js addPartsCondition), else code's own
export async function addPartsCondition(scope, opts = {}) {
  const m = await load("./scope.js");
  if (m?.addPartsCondition) { try { return m.addPartsCondition(scope, opts); } catch {} }
  if ((scope.checks || []).some((c) => c.evidence === "receipt" && !c.doc)) return scope;
  const why = opts.reason ? `the parts and materials (${String(opts.reason).split(/\s*[;(]\s*/)[0].replace(/[\s,.:-]+$/, "").slice(0, 80)})` : "the replacement parts";
  return { ...scope, checks: [...scope.checks, { id: "receipt", what: `Receipt for ${why}, dated during the job`, evidence: "receipt", rule: "receipt>=1;read;in_window;matches_change_orders", addedFor: "parts" }] };
}
// the materials-advance check (check/materials.js); without it, code reads a typed total and leaves the rest to a person
export async function checkMaterials(job, co, evidence, opts = {}) {
  if (over.materials) return over.materials(job, co, evidence, opts);
  const m = await load("./check/materials.js");
  if (m?.checkMaterialsAdvance) { try { return await m.checkMaterialsAdvance(job, co, evidence, rulesOnly() ? { ...opts, vlm: false } : opts); } catch (e) { console.error(`ai: checkMaterialsAdvance failed (${String(e?.message || e).slice(0, 120)})`); } }
  const inv = evidence.find((e) => e.kind === "receipt"), pic = evidence.find((e) => e.kind === "photo");
  const t = String(inv?.text || "").match(/total\D{0,10}(\d+(?:\.\d{2})?)/i), total = t ? Math.round(+t[1] * 100) : null;
  if (!inv || !pic || total == null) return { verdict: "needs_fix", decision: "needs_fix", needsPerson: false, reasons: [!inv ? "send the supplier's invoice" : !pic ? "send a photo of the materials on site" : "the invoice's total can't be read"], signals: [], invoice: null, approved: co.amount, matchedTotal: 0, source: "rules" };
  return { verdict: total <= co.amount ? "pass" : "needs_fix", decision: total <= co.amount ? "review" : "needs_fix", needsPerson: true, reasons: [total <= co.amount ? "a person confirms the invoice and the photo (no checker loaded)" : `the invoice (${(total / 100).toFixed(2)}) is more than the approved change order`], signals: ["no_checker"], invoice: { evidenceId: inv.id, total, readBy: "typed" }, approved: co.amount, matchedTotal: Math.min(total, co.amount), source: "rules" };
}

const VERDICTS = ["pass", "needs_fix", "fail"];
async function checkEvidence_(job, evidence, opts = {}) {
  const t0 = Date.now();
  if (over.check) return over.check(job, evidence, opts);
  if (!rulesOnly()) {
    const m = await load("./check/index.js");
    if (m?.checkEvidence) {
      try {
        const r = await m.checkEvidence(job, evidence, opts);
        if (r && Array.isArray(r.checks) && r.checks.every((c) => c && c.id && VERDICTS.includes(c.verdict))) return r;
        console.error("ai: check/index.js returned no usable verdicts; using rules");
      } catch (e) { console.error(`ai: check/index.js failed (${String(e?.message || e).slice(0, 120)}); using rules`); }
    }
  }
  return { ...rulesCheck(job, evidence), ms: Date.now() - t0 };
}
// The checker's photo history (sha and dHash of photos seen on earlier jobs) lives in its process; jobs.js keeps a copy
// in its store after each check and gives it back at start, so reuse detection survives a restart.
export async function photoHistory() { const m = await load("./check/history.js"); return m?.photoRows ? m.photoRows() : null; }
export async function restorePhotoHistory(rows) { if (!rows?.length) return false; const m = await load("./check/history.js"); if (!m?.loadPhotoRows) return false; m.loadPhotoRows(rows); return true; }
// the last answer of each kind, as it really came back (for /api/models/status): where from, how long
const lastSeen = {};
const track = (kind, fn) => async (...a) => { const t0 = Date.now(); const r = await fn(...a); lastSeen[kind] = { at: new Date().toISOString(), source: r?.source || "none", ms: r?.ms ?? Date.now() - t0 }; return r; };
export const chat = track("chat", chat_), writeScope = track("scope", writeScope_), checkEvidence = track("check", checkEvidence_);
export const lastReplies = () => structuredClone(lastSeen);
// the gap review of an agreed scope (docs/MODELS.md "Interfaces": reviewScope(job) -> { gaps: [{ severity, what,
// suggestion }], ok, source, ms }), from scope.js or check/index.js when either exports it; else the rules
const GAP_SEVERITY = { conflict: "high", uncheckable: "high", missing: "medium", vague: "low" };
export async function reviewScope(job, opts = {}) {
  if (over.review) return over.review(job);
  if (!rulesOnly()) {
    const m = await load("./gap.js");
    if (m?.reviewScope) {
      try {
        const r = await m.reviewScope(job.scope, opts);
        if (r && Array.isArray(r.issues)) return { gaps: r.issues.map((i) => ({ severity: GAP_SEVERITY[i.kind] || "medium", kind: i.kind, checkId: i.checkId || null, what: i.say, suggestion: i.rewrite || null })), ok: !r.issues.some((i) => ["conflict", "uncheckable"].includes(i.kind)),
          evidencePlan: r.evidencePlan || [], disputeRisk: r.disputeRisk || null, revisedScope: r.revisedScope || null, changes: r.changes || [], source: r.source || "unknown", ms: r.ms ?? null, model: r.model || null };
      } catch (e) { console.error(`ai: gap.js reviewScope failed (${String(e?.message || e).slice(0, 120)}); using rules`); }
    }
  }
  return rulesScopeReview(job);
}
// a defect claim during the warranty window (check/defect.js checkDefectClaim); without it, the pro is asked to fix and
// staff decide (it never releases or refunds by itself)
export async function checkDefect(job, claim, evidence) {
  if (over.defect) return over.defect(job, claim, evidence);
  if (!rulesOnly()) { const m = await load("./check/defect.js"); if (m?.checkDefectClaim) { try { return await m.checkDefectClaim(job, claim, evidence); } catch (e) { console.error(`ai: defect check failed (${String(e?.message || e).slice(0, 120)})`); } } }
  return { verdict: "review", decision: "hold_and_fix", reasons: ["no defect checker is loaded: the pro is asked to fix it and staff decide"], signals: [], source: "rules" };
}
// a permit, lien waiver or invoice (docs.js validateDocument); null when it isn't loaded (the rules' docCheck is used)
export async function validateDoc(args) {
  if (over.doc) return over.doc(args);
  if (rulesOnly()) return null;
  const m = await load("./docs.js");
  if (!m?.validateDocument) return null;
  try { return await m.validateDocument(args); } catch (e) { console.error(`ai: docs.js failed (${String(e?.message || e).slice(0, 120)})`); return null; }
}
// llm.js's own status (configured, live from a probe, why not) plus the last real replies seen here
export async function modelStatus(opts = {}) {
  if (rulesOnly()) return { configured: false, live: false, reason: "DONE_AI=rules: the server never calls the models", mode: "rules", last: lastReplies() };
  const m = await load("./llm.js");
  if (!m?.modelStatus) return { configured: false, live: false, reason: "llm.js isn't loaded", mode: "live", last: lastReplies() };
  try { return { ...(await m.modelStatus(opts)), mode: "live", replies: lastReplies() }; } catch (e) { return { configured: false, live: false, reason: String(e?.message || e).slice(0, 160), mode: "live", replies: lastReplies() }; }
}
export async function modelConfig() { if (rulesOnly()) return null; const m = await load("./llm.js"); return m?.modelConfig ? m.modelConfig() : null; }
// which of them are live in this process (for /api/info and the models page)
export async function aiStatus() {
  if (rulesOnly()) return { mode: "rules", llm: false, scope: false, check: false };
  const [l, s, c] = await Promise.all([load("./llm.js"), load("./scope.js"), load("./check/index.js")]);
  return { mode: "live", llm: !!l?.chat, scope: !!s?.writeScope, check: !!c?.checkEvidence };
}
