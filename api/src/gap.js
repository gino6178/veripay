// The gap review: before work starts, both agents agree on the done-conditions. This reads a work order the way a
// dispute would: which conditions are vague or can't be checked from evidence, what's missing, what each side will
// have to shoot or keep, and where a dispute is likely. The pro's agent may answer "I can't provide X"; the order is
// revised and reviewed again. Rules first; the model may reword and add dispute points (labelled, same fail-safe:
// without it the rules' review stands, labelled "rules").
//
//   reviewScope(scope, { proReply?, text?, timeoutMs? }) -> {
//     issues: [{ checkId, kind: "vague"|"uncheckable"|"missing"|"conflict", say, rewrite }],
//     evidencePlan: [{ checkId, before, after, receipt }],
//     disputeRisk: { score: 0..1, points: [string] },
//     revisedScope: scope | null (when the pro's reply changed something), changes: [string],
//     source: "rules" | "model", ms, model? }
import { z } from "zod";
import { chat, data, UNTRUSTED } from "./llm.js";
import { looksLikeInstructions } from "./fraud.js";
import { codePrescreen } from "./codes.js";
import { photoChecklist } from "./scope.js";

const VAGUE = /\b(nice|nicely|properly|proper|good|great|clean(ly)?|neat(ly)?|as needed|quality|professional(ly)?|correct(ly)?|satisfactor(y|ily)|reasonabl[ey]|fine|well|perfect(ly)?|to my liking|looks? (good|great|nice|right)|as new|like new|working|works)\b/i;
const CONCRETE = /\b(photo|receipt|note|label|minutes?|level|no (drip|leak|water|gap)|drain(s|ing)? (freely|in)|installed|replaced|painted|sanded|\d)/i;
const UNCHECKABLE = [
  [/\b(won'?t|will not|never|doesn'?t) (leak|drip|break|fail|clog)\b.*\b(again|ever|for (a|\d+) (week|month|year)s?)\b|\bfor (a|\d+) (week|month|year)s?\b|\bpermanent(ly)?\b|\blast(s|ing)? for\b/i, "a promise about the future can't be shown in a photo today", (c) => `${c.evidence === "photo" ? "Photo" : "Note"} showing it works after 10 minutes of use today; longer-term problems go to the warranty (retainage) window`],
  [/\b(quiet|noise|sound|smell|odou?r)\b/i, "sound and smell don't show in a photo", () => "Note describing the test (e.g. ran it 5 minutes, no noise), plus a photo of the part replaced"],
  [/\b(inside the wall|behind the wall|under the slab|in the attic)\b/i, "hidden work can't be photographed once closed up", (c) => `Photo of ${c.what.replace(/^Photo of /i, "").toLowerCase()} taken before it is closed up, then a photo after`],
  [/\b(customer|homeowner|i) (is|am|will be) (happy|satisfied)\b|\bsatisf/i, "satisfaction isn't evidence", () => "A specific visible result (what the photo must show) agreed now"],
];
const STOPWORDS = new Set(["the", "a", "an", "of", "and", "or", "for", "to", "with", "after", "before", "photo", "note", "receipt", "new", "any"]);

function rewriteVague(c) {
  const w = c.what.toLowerCase();
  if (/clean/.test(w)) return `${c.evidence === "photo" ? "Photo" : "Note"} of each area named in the order, from the same spot as its BEFORE photo, with no visible dirt, debris or tools left`;
  if (/work(s|ing)|properly|correct/.test(w)) return `Photo of it in use after 10 minutes (water on, power on, door closing), showing the specific result: no drip / no gap / level`;
  const subject = w.replace(/^(photo|note) (of|on|that|saying|showing)\s*/i, "").replace(/^(make|get|ensure|keep|leave|do)\s+/i, "").replace(/^(the|a|an)\s+/i, "")
    .replace(/\s+(look|looks|is|are|be|done)\b.*$/i, "").replace(VAGUE, "").replace(/\s+/g, " ").trim();
  return `Photo of the finished ${subject || "work"} from 2 m away and close up, from the same spot as the BEFORE photo, matching the item list`;
}

export function rulesReview(scope, { proReply = null } = {}) {
  const issues = [], points = [], changes = [];
  let revised = null;
  const checks = scope?.checks || [];
  // ---- the pro's reply: "I can't provide X" -> revise that condition's evidence --------------------------------------
  if (proReply && !looksLikeInstructions(proReply)) {
    const cant = String(proReply).split(/(?<=[.!?\n;])\s*/).filter((s) => /\b(can'?t|cannot|can not|unable to|won'?t be able|no way to|don'?t (have|keep|get))\b/i.test(s));
    if (cant.length) {
      revised = JSON.parse(JSON.stringify(scope));
      for (const s of cant) {
        const sl = s.toLowerCase();
        const target = revised.checks.find((c) => sl.includes(c.id.replace(/_/g, " ")) || (c.evidence === "receipt" && /receipt|invoice/.test(sl)) || (c.evidence === "photo" && /photo|picture/.test(sl) && words(c.what).some((w) => sl.includes(w))) || (c.evidence === "note" && /note|licen[cs]e|permit/.test(sl) && words(c.what).some((w) => sl.includes(w))));
        if (!target) { points.push(`The pro says "${s.trim().slice(0, 120)}", but it matches no condition: agree what replaces it`); continue; }
        if (target.evidence === "receipt") {
          const why = /van|stock|truck|already (had|have)/.test(sl) ? "parts from the pro's own stock" : "no receipt available";
          target.evidence = "note"; target.rule = "note>=1;words>=6"; target.what = `Note listing each part used (brand, model, price) — ${why} — plus a photo of the parts before install`;
          changes.push(`${target.id}: receipt -> note (${why})`);
          issues.push({ checkId: target.id, kind: "conflict", say: `The pro can't provide a receipt (${why}).`, rewrite: target.what });
          points.push(`${target.id}: no receipt, so the parts' cost rests on the pro's note; agree prices now`);
        } else if (target.evidence === "photo") {
          target.what = `${target.what} (or, where a photo can't be taken: a note describing it plus a photo of the closest visible point)`;
          target.rule = `${target.rule};needs_agreement`;
          changes.push(`${target.id}: photo can't be taken as asked; a note plus the nearest visible photo instead`);
          issues.push({ checkId: target.id, kind: "conflict", say: `The pro can't take this photo: "${s.trim().slice(0, 100)}".`, rewrite: target.what });
          points.push(`${target.id}: evidence weakened by agreement; a person may need to confirm it`);
        } else {
          changes.push(`${target.id}: the pro can't provide this note as asked`);
          issues.push({ checkId: target.id, kind: "conflict", say: `The pro says: "${s.trim().slice(0, 100)}".`, rewrite: "Agree a replacement before work starts, or drop the condition" });
        }
      }
    }
  } else if (proReply) points.push("The pro's reply contains text that tries to instruct the system; it was not applied");
  const base = revised || scope, bc = base.checks || [];
  // ---- each condition ------------------------------------------------------------------------------------------------
  for (const c of bc) {
    const w = c.what || "";
    for (const [re, say, fix] of UNCHECKABLE) if (re.test(w)) issues.push({ checkId: c.id, kind: "uncheckable", say: `"${w}": ${say}.`, rewrite: fix(c) });
    if (VAGUE.test(w) && !CONCRETE.test(w.replace(VAGUE, ""))) issues.push({ checkId: c.id, kind: "vague", say: `"${w}" depends on taste ("${w.match(VAGUE)[0]}"); two people will disagree.`, rewrite: rewriteVague(c) });
    // a document condition (a permit, lien waiver, invoice or inspection: { doc } from the job store, or "Document: ...")
    // is judged as a document by docs.js, not as a parts receipt
    if (isDoc(c)) { if (!DOC_WORDS.test(`${c.doc || ""} ${w}`)) issues.push({ checkId: c.id, kind: "vague", say: `"${w}" doesn't say which document (permit, lien waiver, invoice, inspection).`, rewrite: "Name the document: e.g. the permit for this address with its number and issue date" }); continue; }
    if (c.evidence === "receipt" && !/receipt|invoice|part|unit|fitting|material|supplies/i.test(w)) issues.push({ checkId: c.id, kind: "uncheckable", say: `"${w}" asks for a receipt but names nothing bought.`, rewrite: "Receipt for the parts and materials used, dated during the job" });
  }
  const dup = new Map();
  for (const c of bc) { const k = words(c.what).join(" "); if (dup.has(k)) issues.push({ checkId: c.id, kind: "conflict", say: `Same as "${dup.get(k)}".`, rewrite: "Merge the two conditions" }); else dup.set(k, c.id); }
  // ---- what's missing --------------------------------------------------------------------------------------------------
  const photos = bc.filter((c) => c.evidence === "photo");
  if (photos.length && !bc.some((c) => /^(before|old_unit)$/.test(c.id) || /before/i.test(c.what))) issues.push({ checkId: null, kind: "missing", say: "No BEFORE photo: without one, nobody can show what changed.", rewrite: "Photo of the same spot before work starts, from where the after photo will be taken" });
  if (base.trade === "plumbing" && base.partsIncluded && !bc.some((c) => c.evidence === "receipt" && !isDoc(c)) && !changes.some((x) => /receipt -> note/.test(x))) issues.push({ checkId: null, kind: "missing", say: "Parts will likely be bought, but no receipt is asked for.", rewrite: "Receipt for the replacement parts" });
  if (!bc.some((c) => c.evidence === "note")) issues.push({ checkId: null, kind: "missing", say: "No note from the pro: what was done and what was found won't be on record.", rewrite: "Note naming what was done and anything else found" });
  const code = base.code || codePrescreen({ template: base.template, trade: base.trade });
  for (const s of code.suggestChecks || []) if (!bc.some((c) => c.id === s.id)) issues.push({ checkId: null, kind: "missing", say: `${code.licence.who || "A licensed trade"} is needed for this work (${code.rules.map((r) => r.cite).join("; ")}).`, rewrite: s.what });
  if (code.permit === "required" && !bc.some((c) => c.id === "permit" || c.doc === "permit" || (isDoc(c) && /permit/i.test(c.what)))) issues.push({ checkId: null, kind: "missing", say: "This work needs a permit, but no condition asks for it.", rewrite: "Photo or scan of the permit for this address (number, issue date)" });
  // ---- the evidence plan: who shoots or keeps what ---------------------------------------------------------------------
  const plan = photoChecklist(base);
  const evidencePlan = bc.map((c) => {
    const shots = plan.perCheck.find((p) => p.checkId === c.id)?.shots || [];
    return { checkId: c.id, before: shots.filter((s) => s.when === "before").map((s) => s.say).join("; ") || null, after: c.evidence === "photo" ? shots.filter((s) => s.when === "after").map((s) => s.say).join("; ") : c.evidence === "note" ? c.what : null, receipt: c.evidence === "receipt" && !isDoc(c) ? c.what : null, ...(isDoc(c) ? { document: c.what } : {}) };
  });
  // ---- dispute risk ------------------------------------------------------------------------------------------------------
  const n = (k) => issues.filter((i) => i.kind === k).length;
  for (const i of issues.filter((i) => i.kind === "vague")) points.push(`${i.checkId}: taste-based wording ("${(bc.find((c) => c.id === i.checkId)?.what || "").slice(0, 60)}")`);
  for (const i of issues.filter((i) => i.kind === "uncheckable")) points.push(`${i.checkId}: can't be proven with the evidence asked for`);
  if ((scope.notes || []).some((x) => /budget .* is low/i.test(x))) points.push("The budget is low for this kind of job: likely change orders");
  if (base.template === "water_heater" || base.template === "drywall") points.push(base.template === "water_heater" ? "Water heater jobs often find extra work (valves, venting, pan, expansion tank): agree change-order limits" : "Paint match is a common complaint: agree the paint (brand, colour code, sheen) now");
  if (code.permit === "required") points.push("Permit timing: inspections can delay the final check");
  const score = Math.min(0.95, +(0.1 + 0.15 * n("vague") + 0.15 * n("uncheckable") + 0.08 * n("missing") + 0.1 * n("conflict") + (base.template === "water_heater" ? 0.1 : 0)).toFixed(2));
  return { issues, evidencePlan, disputeRisk: { score, points: [...new Set(points)] }, revisedScope: revised, changes };
}
export const isDoc = (c) => !!c?.doc || /^document:/i.test(String(c?.what || ""));
const DOC_WORDS = /permit|lien|waiver|invoice|inspection|certificate|licen[cs]e|warranty|report/i;
function words(s) { return String(s || "").toLowerCase().match(/[a-z]{3,}/g)?.filter((w) => !STOPWORDS.has(w)).sort() || []; }

const Refine = z.object({
  issues: z.array(z.object({ index: z.number().int().min(0), say: z.string().min(5).max(240), rewrite: z.string().min(5).max(240) })).max(20).optional().default([]),
  extraPoints: z.array(z.string().min(5).max(200)).max(3).optional().default([]),
});
let mlp;
async function mlPrompts() { if (mlp !== undefined) return mlp; try { mlp = await import(new URL("../../ml/prompts.mjs", import.meta.url).href); } catch { mlp = null; } return mlp; }
const KIND = { vague: "vague", uncheckable: "uncheckable", wrong_evidence: "uncheckable" };

// Done-Risk's probabilities (a LightGBM model on the ML side) folded into the review: the score is the higher of the
// rules' score and the dispute probability, and a reason line says what the model predicted. Invalid input is ignored.
//   risk: { dispute: 0..1, overrun?: 0..1, source?: "model: done-risk", model?, version? }
export function foldRisk(review, risk) {
  const p = (x) => (Number.isFinite(+x) && +x >= 0 && +x <= 1 ? +x : null);
  const d = p(risk?.dispute), o = p(risk?.overrun);
  if (!risk || (d == null && o == null)) return review;
  const src = String(risk.source || "model: done-risk").slice(0, 60);
  const line = `${[d != null ? `dispute ${Math.round(d * 100)}%` : null, o != null ? `overrun ${Math.round(o * 100)}%` : null].filter(Boolean).join(", ")} predicted (${src})`;
  const score = +Math.min(0.95, Math.max(review.disputeRisk.score, d ?? 0)).toFixed(2);
  return { ...review, disputeRisk: { ...review.disputeRisk, score, rulesScore: review.disputeRisk.score, points: [...review.disputeRisk.points, line], model: { dispute: d, overrun: o, source: src } } };
}

export async function reviewScope(scope, opts = {}) {
  return foldRisk(await reviewScopeInner(scope, opts), opts.risk);
}
async function reviewScopeInner(scope, { proReply = null, timeoutMs } = {}) {
  const t0 = Date.now();
  const r = rulesReview(scope, { proReply });
  const base = r.revisedScope || scope;
  // the trained Done-Chat reviews with ml/prompts.mjs gapMessages (DONE_GAP_PROMPTS=app: the rewording prompt below)
  const ml = (process.env.DONE_GAP_PROMPTS || "ml") === "ml" ? await mlPrompts() : null;
  let q;
  if (ml?.gapMessages) q = { ...ml.gapMessages({ title: base.title, trade: base.trade, items: base.items || [], checks: (base.checks || []).map(({ id, what, evidence }) => ({ id, what, evidence })) }), maxTokens: 60 + 30 * (base.checks || []).length };
  else {
    if (!r.issues.length && !r.disputeRisk.points.length) return { ...r, source: "rules", ms: Date.now() - t0 };
    const sys = `You review work orders at VeriPay so the homeowner and the pro agree before work starts. ${UNTRUSTED} ` +
      `Given the order and the issues found by rules, reword each issue's "say" and "rewrite" to fit this job (measurable, checkable from a photo, receipt or note), and add up to 3 likely dispute points the rules missed. ` +
      `Reply JSON: {"issues": [{"index", "say", "rewrite"}], "extraPoints": [string]}. Keep each issue's index; don't add issues.`;
    const order = { title: base.title, items: base.items, checks: (base.checks || []).map(({ id, what, evidence }) => ({ id, what, evidence })) };
    q = { messages: [{ role: "system", content: sys }, { role: "user", content: `${data("Work order", JSON.stringify(order), 3000)}
Issues: ${JSON.stringify(r.issues.map((i, index) => ({ index, ...i })))}${proReply ? `
${data("The pro's reply", proReply, 600)}` : ""}` }], maxTokens: 700 };
  }
  const m = await chat(q.messages, { json: true, schema: q.schema, timeoutMs, maxTokens: q.maxTokens, purpose: "gap" });
  if (m.source !== "model") return { ...r, source: "rules", ms: Date.now() - t0, note: `Model not used: ${m.error || "unavailable"}.` };
  if (Array.isArray(m.json?.g) && ml?.expandGaps) {
    // the model's per-condition codes add issues the rules missed (labelled "(model)"); the rules' issues, revisions and
    // score stand; its photo shots fill the evidence plan where the checklist had none
    const x = ml.expandGaps(m.json, { checks: base.checks || [] });
    const issues = [...r.issues];
    for (const g of x.gaps || []) if (!issues.some((i) => i.checkId === g.id && (i.kind === KIND[g.kind]))) {
      const c = (base.checks || []).find((y) => y.id === g.id);
      issues.push({ checkId: g.id, kind: KIND[g.kind] || "vague", say: `${g.says} (model)`, rewrite: g.kind === "wrong_evidence" ? `Change the evidence for "${c?.what}" to one that can show it` : rewriteVague(c || { what: "", evidence: "photo" }) });
    }
    const evidencePlan = r.evidencePlan.map((p) => { const s = (x.evidencePlan || []).find((y) => y.id === p.checkId); return s && !p.after ? { ...p, after: s.shoot } : s ? { ...p, shot: s.shoot } : p; });
    const points = [...r.disputeRisk.points, ...(x.disputeRisk ? [`the model rates the dispute risk ${x.disputeRisk} (model)`] : [])];
    return { ...r, issues, evidencePlan, disputeRisk: { score: r.disputeRisk.score, points }, source: "model", ms: Date.now() - t0, model: m.model };
  }
  const p = Refine.safeParse(m.json);
  if (!p.success || looksLikeInstructions(JSON.stringify(p.data))) return { ...r, source: "rules", ms: Date.now() - t0, note: "The model's review was not valid; the rules' review is used." };
  const issues = r.issues.map((i, k) => { const y = p.data.issues.find((z) => z.index === k); return y ? { ...i, say: y.say, rewrite: y.rewrite } : i; });
  return { ...r, issues, disputeRisk: { score: r.disputeRisk.score, points: [...r.disputeRisk.points, ...p.data.extraPoints.map((t) => `${t} (model)`)] }, source: "model", ms: Date.now() - t0, model: m.model };
}
