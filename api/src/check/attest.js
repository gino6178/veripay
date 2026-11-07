// What a verdict rests on, as one hash the core agent signs and logs (proof/): the models' ids, a hash of each prompt
// they were sent, a hash of each evidence file, the code's version of the rules, and the answer. Anyone holding the
// same inputs can recompute it later; nothing secret is in it.
//
//   verdictRecord({ jobId, kind, models, prompts, evidence, answer, at }) -> { alg: "sha256", hash, payload }
//   verifyRecord(record) -> boolean (the payload hashes to the hash)
// Also: the names other products use for the same outcomes (Veridom-style APPROVED / REJECTED / NEEDS_MORE_EVIDENCE).
import crypto from "node:crypto";

export const RULES_VERSION = "done-check-2026-11-05";
// one canonical form: keys sorted at every level, no whitespace
export const canonical = (x) => (Array.isArray(x) ? `[${x.map(canonical).join(",")}]` : x && typeof x === "object" ? `{${Object.keys(x).filter((k) => x[k] !== undefined).sort().map((k) => `${JSON.stringify(k)}:${canonical(x[k])}`).join(",")}}` : JSON.stringify(x ?? null));
const h = (s) => crypto.createHash("sha256").update(s).digest("hex");

export function verdictRecord({ jobId = null, kind = "evidence_check", models = [], prompts = [], evidence = [], answer, at = new Date().toISOString() }) {
  const payload = { v: 1, kind, jobId, at, rules: RULES_VERSION, models: [...new Set(models.filter(Boolean))].sort(), prompts: [...new Set(prompts.filter(Boolean))].sort(),
    evidence: evidence.filter((e) => e && e.id).map((e) => ({ id: e.id, sha256: e.sha256 || null })).sort((a, b) => (a.id < b.id ? -1 : 1)), answer };
  return { alg: "sha256", hash: h(canonical(payload)), payload };
}
export const verifyRecord = (r) => !!r && r.alg === "sha256" && h(canonical(r.payload)) === r.hash;

// our names -> the market's names
export const CHECK_LABEL = { pass: "APPROVED", fail: "REJECTED", needs_fix: "NEEDS_MORE_EVIDENCE" };
export const DECISION_LABEL = { release: "APPROVED", needs_fix: "NEEDS_MORE_EVIDENCE", review: "NEEDS_REVIEW" };
export const checkLabel = (c) => (c.needsPerson && c.verdict === "pass" ? "NEEDS_REVIEW" : CHECK_LABEL[c.verdict] || "NEEDS_REVIEW");
