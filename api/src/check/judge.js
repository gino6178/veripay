// The judging half: does the evidence, as described, satisfy each check's wording? Done-Audit (the model) answers when
// it is served; otherwise rules answer from the captions. Either way the answer is one input: check/index.js keeps the
// worse of this and the code's verdict, and the code's confidence cap.
import { chat, data, modelConfig, UNTRUSTED } from "../llm.js";
import { looksLikeInstructions } from "../fraud.js";
import { km } from "../exif.js";

const $ = (c) => `$${(c / 100).toFixed(2)}`;
export const NEGATIVE = /\b(still (leak|drip|run|clog|broken)\w*|not (fixed|working|done|finished|complete)|(could ?n.?t|couldn.t|can.?t|unable to|did ?n.?t|wasn.?t able to) (fix|finish|complete|get|find|stop|clear|mount|install|reach)|need(s)? (another|a second|a return) (visit|trip)|will (come back|return)|wrong part|back ?order(ed)?|leaks? (again|still)|partially)\b/i;

// what the model may read about one piece of evidence: the pro's words (minus sentences that try to instruct) and the
// code's facts. Never the raw instruction text.
export function describe(x, job, { raw = false } = {}) {
  const { e, f } = x, bits = [`${e.kind} ${e.id}`];
  if (f.exif?.taken) bits.push(`taken ${f.exif.taken}`);
  if (f.exif?.camera) bits.push(`camera ${f.exif.camera}`);
  if (f.receipt && !f.receipt.error) bits.push(`receipt read by ${f.receipt.by}: store ${f.receipt.store || "?"}, date ${f.receipt.date || "?"}, items ${(f.receipt.items || []).join("; ") || "?"}, total ${f.receipt.total != null ? $(f.receipt.total) : "?"}`);
  const said = raw ? String(e.text || "").trim() : String(e.text || "").split(/(?<=[.!?\n])\s+/).filter((s) => s.trim() && !looksLikeInstructions(s)).join(" ").trim();
  if (x.injected) bits.push("(part of its text tried to instruct the checker and was removed)");
  return { line: bits.join(", "), said };
}

export function judgeMessages(job, rows, { raw = false } = {}) {  // raw: keep instruction text (only the eval does, to measure the model alone)
  const sys = `You are Done-Audit at VeriPay. A homeowner pays a pro only when the pro's evidence proves each done-condition of the work order. ` +
    `For each check, judge whether the evidence described satisfies its wording. ${UNTRUSTED}\n` +
    `Reply in JSON: {"checks": [{"id", "verdict": "pass" | "needs_fix" | "fail", "reason": one sentence, "confidence": 0..1}]}. ` +
    `pass = the evidence shows the condition is met; needs_fix = evidence is missing, unclear, or shows the work is not finished (the pro can fix it); ` +
    `fail = the evidence contradicts the condition or looks fake. A photo with no description can only be judged by its facts: if nothing is wrong, pass with confidence about 0.7. ` +
    `You do not decide payment; code does.`;
  const body = rows.map((r) => [`CHECK ${r.check.id}: ${r.check.what} (evidence: ${r.check.evidence})`,
    ...(r.items.length ? r.items.map((x) => { const d = describe(x, job, { raw }); return `- ${d.line}${d.said ? `\n${data("  pro's words", d.said, 500)}` : ""}`; }) : ["- (no evidence)"])].join("\n")).join("\n\n");
  return [{ role: "system", content: sys }, { role: "user", content: `Work order: ${job.scope?.title || "job"}${(job.scope?.items || []).length ? ` (${job.scope.items.join("; ")})` : ""}\n\n${body}` }];
}

const SCHEMA = { type: "object", required: ["checks"], properties: { checks: { type: "array", items: { type: "object", required: ["id", "verdict", "reason", "confidence"], properties: { id: { type: "string" }, verdict: { type: "string", enum: ["pass", "needs_fix", "fail"] }, reason: { type: "string" }, confidence: { type: "number" } } } } } };

// Without a model verdict the fallback is fail-safe: money never moves on wording nobody judged.
//   - the pro's own words say it isn't finished -> needs_fix (goes back to the pro; nothing is paid)
//   - the check is fully decidable by code -> pass (today: a receipt check whose read total matched the approved change
//     orders; or a rule carrying the token "code_only", where present-and-clean evidence is all the condition asks)
//   - anything else (a photo's content, a note's content, a receipt with nothing to match) -> a person confirms:
//     verdict stays the code's "pass" but confidence 0.3 and needsPerson, so the decision is "review"
export const NEEDS_PERSON_CONFIDENCE = 0.3;
export function codeDecidable(r) {
  if (String(r.check.rule || "").split(";").map((t) => t.trim()).includes("code_only")) return "the rule asks only for what code checks";
  const sig = r.signals || [];
  if ((r.check.evidence === "receipt" || /^receipt>=/.test(r.check.rule || "")) && sig.some((s) => s.startsWith("receipt_matches_change_orders:"))) return "the receipt total matched the approved change orders";
  return null;
}
// The model's reason in words a customer reads: ml/prompts.mjs writes "<Kind> <ref> ..." (so a note with id "note 1"
// reads "Note note 1 shows it isn't done yet: note naming the part replaced ... is not true"). Code rewrites the
// reason from the reason code and the evidence it names: "The note", "Photo p3", "The receipt".
const KIND = { photo: "photo", receipt: "receipt", note: "note", document: "document" };
export function naturalReason(c, row) {
  const items = row?.items || [], e = items.find((x) => String(x.e.id) === String(c.e ?? c.evidence ?? "")) || items[0];
  const kind = KIND[e?.e?.kind] || KIND[row?.check?.evidence] || "evidence";
  const id = e ? String(e.e.id) : "", alone = items.filter((x) => x.e.kind === e?.e?.kind).length <= 1;
  // "the note", or "the note (note 2)" when there are several; a bare id that already says its kind isn't repeated
  const ref = !e || alone ? `the ${kind}` : new RegExp(`^${kind}(?![a-z])`, "i").test(id) ? `the ${id}` : `the ${kind} ${id}`;
  const Ref = ref.charAt(0).toUpperCase() + ref.slice(1);
  const what = String(row?.check?.what || "this condition").replace(/^(photo|note|receipt)( of| showing| naming| with)?\s+/i, "").replace(/[.:]+$/, "");
  const w = what.charAt(0).toLowerCase() + what.slice(1);
  switch (c.code) {
    case "ok": return `${Ref} shows it: ${w}.`;
    case "unclear": return `${Ref} is too unclear to show ${w}.`;
    case "wrong_subject": return `${Ref} seems to be about something else, not ${w}.`;
    case "not_done": return kind === "note" ? `${Ref} doesn't say the work is finished (${w}).` : `${Ref} seems to show the work isn't finished (${w}).`;
    case "wrong_item": return `${Ref} doesn't list a part for this job.`;
  }
  // other codes are facts code checked (time, place, reuse, totals): the expanded sentence, with the doubled kind fixed
  return String(c.reason || "").replace(/^(Photo|Receipt|Note|Document) (photo|receipt|note|document)\b/i, (m, k, k2) => `${k.charAt(0).toUpperCase()}${k.slice(1).toLowerCase()} ${k2.toLowerCase()}`.replace(/^(\w+) /i, "The $1"));
}
export function rulesJudge(rows) {
  return new Map(rows.map((r) => {
    const said = r.items.map((x) => String(x.e.text || "")).filter((s) => !looksLikeInstructions(s)).join(" ");
    if (NEGATIVE.test(said)) return [r.check.id, { verdict: "needs_fix", reason: `the pro's own words say the work is not finished ("${said.match(NEGATIVE)[0]}")`, confidence: 0.7, by: "rules" }];
    const why = codeDecidable(r);
    if (why) return [r.check.id, { verdict: "pass", reason: `decided by code: ${why}`, confidence: 0.75, by: "rules" }];
    return [r.check.id, { verdict: "pass", reason: "no model verdict; a person confirms", confidence: NEEDS_PERSON_CONFIDENCE, by: "rules", needsPerson: true }];
  }));
}

// ---- the prompts Done-Audit was trained on (ml/prompts.mjs) -----------------------------------------------------------
// The served Done-Audit learned ml/prompts.mjs checkMessages(): the whole order, every check, and one line per piece of
// evidence with its facts. The app sends exactly that (DONE_AUDIT_PROMPTS=ml, the default when the file is there);
// "app" sends the older prompt above (judgeMessages), for a general model. Instruction sentences are still removed from
// the pro's words before either prompt is built.
let mlp;
export async function mlPrompts() {
  if (mlp !== undefined) return mlp;
  try { mlp = await import(new URL("../../../ml/prompts.mjs", import.meta.url).href); } catch { mlp = null; }
  return mlp;
}
const RULE_WORDS = { in_window: "taken inside the job window", near_job: "taken at the job address", not_reused: "not an image from another job", read: "readable", matches_change_orders: "total matching the approved change orders", label: "the label readable", code_only: "present" };
export function ruleText(rule) {
  const parts = String(rule || "").split(";").map((t) => t.trim()).filter(Boolean), out = [];
  for (const t of parts) { let m = t.match(/^(photo|receipt|note)>=(\d+)$/); if (m) { out.unshift(`at least ${m[2]} ${m[1]}${+m[2] > 1 ? "s" : ""}`); continue; } m = t.match(/^words>=(\d+)$/); if (m) { out.push(`at least ${m[1]} words`); continue; } m = t.match(/^progress>=(\d+)$/); if (m) { out.push(`${m[1]}% complete`); continue; } if (RULE_WORDS[t]) out.push(RULE_WORDS[t]); }
  return out.join(", ") || String(rule || "");
}
const localDate = (iso) => { const t = Date.parse(iso); if (!Number.isFinite(t)) return null; return new Date(t - 6 * 36e5).toISOString().slice(0, 10); }; // Austin (CST); a day's edge is all this needs
const localTime = (iso) => (iso ? String(iso).slice(0, 16) : null);
// the training prompt's evidence lines, from the check's rows (items: [{ e, f }]) and the code's signals
export function mlEvidence(allRows, { raw = false } = {}) {
  const out = [];
  for (const r of allRows) for (const x of r.items || []) {
    const { e, f } = x, said = raw ? String(e.text || "").trim() : String(e.text || "").split(/(?<=[.!?\n])\s+/).filter((s) => s.trim() && !looksLikeInstructions(s)).join(" ").trim();
    const reused = (r.signals || []).map((s) => s.match(new RegExp(`^photo_reused: ${e.id} ~ ([^/]+)/`))).find(Boolean);
    const here = r.jobAddress, d = f?.exif?.gps && here ? km(f.exif.gps, here) : null;
    out.push({ ref: e.id, type: e.kind, for: r.check.id, text: said || null, taken: localTime(f?.exif?.taken), distanceMi: d != null ? +(d * 0.621371).toFixed(2) : null, duplicateOf: reused ? reused[1] : null,
      ...(e.kind === "receipt" && f?.receipt && !f.receipt.error ? { receipt: { merchant: f.receipt.store, items: f.receipt.items, total: f.receipt.total, date: f.receipt.date } } : {}) });
  }
  return out;
}
export function mlJob(job, allRows) {
  const approved = (job?.changeOrders || []).filter((c) => c?.approved === true || c?.status === "approved").reduce((s, c) => s + (+c.amount || 0), 0);
  return { title: job?.scope?.title || "Job", items: job?.scope?.items || [], checks: allRows.map((r) => ({ id: r.check.id, what: r.check.what, evidence: r.check.evidence, rule: r.check.ruleText || ruleText(r.check.rule) })),
    window: { from: localDate(job?.window?.from) || "", to: localDate(job?.window?.to) || "" }, address: job?.address?.label || `Austin, TX ${job?.address?.zip || ""}`.trim(), partsAllowance: job?.partsAllowance ?? (approved || null) };
}
// the probability of each verdict where the model wrote it, from the top tokens it returned (as ml/client.mjs reads them)
export function verdictConfidences(logprobs) {
  if (!Array.isArray(logprobs)) return [];
  const VS = ["pass", "needs_fix", "fail"], out = []; let text = "";
  for (const t of logprobs) {
    if (/"(verdict|v)"\s*:\s*"$/.test(text)) {
      const ps = {};
      for (const c of t.top_logprobs || [{ token: t.token, logprob: t.logprob }]) { const v = VS.find((x) => x.startsWith(String(c.token).replace(/^\s+/, "").slice(0, 4)) && String(c.token).trim().length > 0); if (v) ps[v] = (ps[v] || 0) + Math.exp(c.logprob); }
      const z = Object.values(ps).reduce((a, b) => a + b, 0);
      out.push(z ? Object.fromEntries(Object.entries(ps).map(([k, v]) => [k, v / z])) : null);
    }
    text += t.token;
  }
  return out;
}
export async function auditRequest(job, rows, allRows = rows, { raw = false } = {}) {
  const p = (process.env.DONE_AUDIT_PROMPTS || "ml") === "ml" ? await mlPrompts() : null;
  if (p?.checkMessages) { const mj = mlJob(job, allRows), ev = mlEvidence(allRows, { raw }), { messages, schema } = p.checkMessages({ job: mj, evidence: ev }); return { messages, schema, prompts: "ml/prompts.mjs", n: allRows.length, expand: p.expandChecks ? (o) => p.expandChecks(o, mj, ev) : null }; }
  return { messages: judgeMessages(job, rows, { raw }), schema: SCHEMA, prompts: "app", n: rows.length };
}

// The trained model's reason codes that state a fact code checks; the claim needs the matching code signal on that
// condition (rules.js), or evidence actually missing for "missing"
const CODE_FACTS = {
  duplicate: [/^(photo_reused|receipt_reused|duplicate_in_job|shared_evidence):/, "no matching item in the evidence history"],
  before_window: [/^(exif_time_outside|exif_before_start|exif_before_before_photo):/, "the photo's time inside the window"],
  far_away: [/^gps_far:/, "the photo at the job (or no location)"],
  date_outside: [/^(receipt_after_job|receipt_old):/, "the receipt dated in the window"],
  over_allowance: [/^(receipt_over_change_orders|receipt_short):/, "the receipt within the approved amounts"],
};
export function codeClaimUnproven(code, row) {
  if (!code || !row) return null;
  if (code === "missing") return (row.items || []).length ? "the evidence present" : null;
  const f = CODE_FACTS[code];
  if (!f) return null;
  return (row.signals || []).some((s) => f[0].test(s)) ? null : f[1];
}

export async function modelJudge(job, rows, { timeoutMs, allRows } = {}) {
  if (!rows.length) return { verdicts: new Map(), source: "rules" };
  const cfg = modelConfig();
  const q = await auditRequest(job, rows, allRows || rows);
  const r = await chat(q.messages, { json: true, schema: q.schema, url: cfg.auditUrl || undefined, model: cfg.auditModel, timeoutMs: timeoutMs ?? cfg.auditTimeoutMs, maxTokens: q.prompts === "app" ? 200 + 90 * q.n : 80 + 40 * q.n, logprobs: q.prompts !== "app", purpose: "audit" });
  const ids = new Set(rows.map((x) => x.check.id)), got = new Map(), ignored = [];
  if (r.source === "model" && Array.isArray(r.json?.checks)) {
    const conf = verdictConfidences(r.logprobs), order = r.json.checks.map((c) => String(c?.id));
    // the trained model answers in short codes ({ id, v, r, e }); ml/prompts.mjs expands them to verdict + reason
    const list = q.expand && r.json.checks.some((c) => c && "v" in c) ? q.expand(r.json).filter((c) => c.code !== "no_verdict") : r.json.checks;
    const rowOf = new Map(rows.map((x) => [x.check.id, x]));
    for (const c of list) {
      if (!c || !ids.has(String(c.id)) || !["pass", "needs_fix", "fail"].includes(c.verdict)) continue;
      // facts only code can establish (a duplicate, a time or place, a receipt's date or total, missing evidence): the
      // model's claim stands only when code found the same thing; otherwise it is ignored and that condition gets the
      // rules' fallback (so a model's "same image as another job" with an empty history can't fail a receipt)
      const unproven = codeClaimUnproven(c.code, rowOf.get(String(c.id)));
      if (unproven) { ignored.push(`${c.id}: the model said "${c.code}" but code found ${unproven}; ignored`); continue; }
      const lp = conf[order.indexOf(String(c.id))]?.[c.verdict];
      // the trained model gives no confidence field: it comes from the verdict token's probability; a model that gives
      // neither gets 0.5 (under the 0.6 bar: a person looks)
      const cf = Number.isFinite(+c.confidence) ? +c.confidence : lp != null ? lp : 0.5;
      got.set(String(c.id), { verdict: c.verdict, code: c.code || null, reason: naturalReason(c, rowOf.get(String(c.id))).slice(0, 240), confidence: +Math.max(0, Math.min(1, cf)).toFixed(3), by: "model", confidenceFrom: Number.isFinite(+c.confidence) ? "model" : lp != null ? "logprobs" : "none" });
    }
  }
  const fallback = rulesJudge(rows.filter((x) => !got.has(x.check.id)));
  for (const [k, v] of fallback) got.set(k, v);
  return { ignored, verdicts: got, source: [...got.values()].some((v) => v.by === "model") ? "model" : "rules", ms: r.ms, model: r.model, prompts: q.prompts, promptSha256: r.promptSha256, error: r.source === "model" && !r.json?.checks ? "the model's reply was not valid JSON" : r.error };
}
