// Done-Audit: the pro's evidence against each done-condition of the work order.
//
//   checkEvidence(job, evidence, opts?) -> {
//     checks: [{ id, what, verdict, label, reason, confidence, signals, by, evidence, needsPerson?, vlm?, plate?, progress? }],
//     decision: "release" | "needs_fix" | "review", decisionLabel: "APPROVED" | "NEEDS_MORE_EVIDENCE" | "NEEDS_REVIEW",
//     source: "rules" | "model" | "vlm" | "model+vlm", ms, receipts, signals, attestation: { alg, hash, payload } }
//     job      { id, scope: { title, items, checks, spec? }, address: { zip, lat, lng }, window: { from, to },
//                changeOrders: [{ amount, reason, approved | status }], referencePhotos?: [path], previousPhotos?: [path] }
//     evidence [{ id, kind: "photo"|"receipt"|"note", path, uploadedAt, text?, checkId?, dhash?, round?, stage? }]
//              checkId: which check a piece answers; round: submission round (each check keeps its latest);
//              stage: "before" (BEFORE shot taken when work starts) or "reference" (the customer's problem photo):
//              comparison material for the VLM, not evidence for a check
//     opts     { history, remember: true, model: true, vlm: true, timeoutMs, vlmTimeoutMs, tz }
//
// 1. Facts (vision.js): sha256, EXIF time and GPS, dHash, receipt OCR.
// 2. Code (rules.js): per check, missing or duplicate evidence, capture time in the window, place near the job, reuse
//    against earlier jobs, receipt date and total against approved change orders, injection text. A verdict and a cap.
// 3. Judges: Done-Audit (judge.js) reads notes, receipts and captions; Done-VLM (vlm.js) looks at each photo check's
//    photos against the condition, compared with the BEFORE shots and the customer's problem photo; plate OCR
//    (labels.js) for label checks; a progress estimate for "progress>=N" checks. The worse verdict stands; confidence
//    never exceeds the code's cap.
// 4. Fail-safe: a photo check with no VLM verdict, or a note/receipt check with no model verdict that code can't decide,
//    is left to a person (needsPerson). Decision, by code only: any fail, any needsPerson or any confidence under
//    DONE_LOW_CONFIDENCE (0.6) -> review; else any needs_fix -> needs_fix; else release.
// 5. attestation: a hash of the models, prompts, evidence hashes and answer (attest.js), for the core to sign.
import { facts as gather } from "./vision.js";
import { assign, ruleCheck, worse, LIMITS, parseRule } from "./rules.js";
import { modelJudge, rulesJudge, NEGATIVE } from "./judge.js";
import { photoRows, rememberPhotos } from "./history.js";
import { TZ } from "./time.js";
import { vlmLook, vlmAvailable, vlmMode, describePhoto } from "../vlm.js";
import { hamming } from "../exif.js";
import { looksLikeInstructions } from "../fraud.js";
import { relevance, captionMismatch } from "./relevance.js";
import { readLabel, matchSpec } from "../labels.js";
import { images } from "../ocr.js";
import { verdictRecord, checkLabel, DECISION_LABEL } from "./attest.js";

export { photoRows, loadPhotoRows, clearPhotoRows } from "./history.js";
export { CHECK_LABEL, DECISION_LABEL, verdictRecord, verifyRecord } from "./attest.js";
// checks whose photos are the job's BEFORE set (the templates' "before" shots)
const BEFORE_IDS = new Set(["before", "old_unit"]);
// words that say a picture is drawn, rendered or a demo stand-in, not a photo
// plate/label conditions, "area" conditions, and what a description of an area says
export const isLabelCheck = (d) => d?.rule?.flags?.has("label") || d?.check?.id === "label" || /\b(rating (label|plate)|data plate|name ?plate|serial (number|plate)|model (number|plate)|label)\b/i.test(d?.check?.what || "");
export const isAreaCheck = (c) => /\b(area|cleared|clean(ed)?[ -]?up|swept|floor|space|room|hauled|removed|empty)\b/i.test(c?.what || "") && !/\blabel|plate\b/i.test(c?.what || "");
const AREA_WORDS = /\b(floor|area|room|space|ground|garage|closet|utility|corner|basement|attic|driveway|curb|clear|empty|swept|clean)\b/i;
export const plateRead = (r) => !!r && !r.error && !!(r.brand || (r.model && /\d/.test(r.model)) || r.serial || r.capacityGal || r.btu);
// what a description must name for a condition: the condition's objects (any one of them, by synonym groups), and for
// a condition about placement (mounted, installed, attached, reconnected) a word saying how it is placed
const OBJECTS = [["faucet", "tap", "spout"], ["sink", "basin"], ["drain"], ["trap", "p-trap", "pipe"], ["toilet"], ["tank"], ["flapper", "fill valve"], ["valve"],
  ["water heater", "heater", "boiler"], ["tv", "television", "screen", "monitor"], ["bracket", "mount"], ["level"], ["dresser", "chest of drawers", "drawers"], ["bed", "bed frame"],
  ["desk"], ["wardrobe", "closet"], ["shelf", "shelves", "bookcase"], ["wall"], ["paint", "painted", "roller"], ["patch", "drywall"], ["bathroom"], ["tub", "bathtub"], ["shower"],
  ["mirror"], ["floor"], ["fridge", "refrigerator", "freezer"], ["trash", "bin", "garbage"], ["cabinet", "cupboard"], ["counter", "countertop"], ["stove", "stovetop", "oven"], ["box", "boxes", "carton"], ["receipt"], ["label", "plate", "sticker"]];
const has = (t, w) => new RegExp(`\\b${w.replace(/[-]/g, "[- ]?")}s?\\b`, "i").test(t);
export function descriptionGap(check, said) {
  const t = String(said || "").trim();
  if ((t.match(/[a-z]{2,}/gi) || []).length < 5) return "the photo's description is empty or too short";
  const groups = OBJECTS.filter((g) => g.some((w) => has(check?.what || "", w)));
  if (groups.length && !groups.some((g) => g.some((w) => has(t, w)))) return `the photo's description doesn't name the ${groups.map((g) => g[0]).slice(0, 3).join(" or ")}`;
  if (/\b(mounted|installed|hung|attached|reconnected|connected|bolted)\b/i.test(check?.what || "") && !/\b(mounted|installed|attached|hung|hanging|on (the|a) wall|connected|fitted|in place|bolted|fixed to|secured)\b/i.test(t))
    return "the photo's description doesn't say it is mounted, installed or connected";
  return null;
}
const SYNTHETIC = /\b(synthetic|illustration|illustrated|drawing|drawn|cartoon|clip ?art|rendered|render|diagram|icon|vector|demo photo|stock image)\b/i;
// a BEFORE condition shows the problem as it was: it is never judged as finished work. Done-Audit was trained only on
// after-the-work conditions (ml/prompts.mjs has no "before" role: it answers "not_done" for a dripping faucet), so in
// describe mode code decides these: a description that names this job's fixture or problem (with the code's time and
// place checks) passes; one that doesn't goes to a person; never needs_fix for "not done".
export const isBeforeCheck = (c) => BEFORE_IDS.has(c?.id) || /\bbefore (the |any )?(repair|work|job|removal|it starts|work starts)\b|\bbefore photo\b|^photo of the (problem|damage)\b/i.test(c?.what || "");

// a model's needs_fix on a note code found complete: requirements all met (or none asked), no topic mismatch, no words
// of unfinished work, no other code flag
// the description made for this very piece of evidence: the same object, else the same file path; never another photo's
// (an id alone is not enough: two uploads can carry the same id, and a description then would land on the wrong photo)
function descOf(list, e) {
  return (list || []).find((y) => y.e === e) || (e?.path ? (list || []).find((y) => y.e?.path && y.e.path === e.path) : null) || null;
}
function noteDoubt(d, j) {
  if (d.check.evidence !== "note" || j.by !== "model" || j.verdict !== "needs_fix" || !["not_done", "wrong_subject", "unclear"].includes(j.code)) return false;
  if (d.verdict !== "pass" || d.reasons.length) return false;
  const said = (d.items || []).map((x) => String(x.e.text || "")).join(" ");
  return !!said.trim() && !NEGATIVE.test(said);
}
export function decide(checks, low = LIMITS().lowConfidence) {
  if (!checks.length) return "review";
  if (checks.some((c) => c.verdict === "fail" || c.needsPerson || c.confidence < low)) return "review";
  if (checks.some((c) => c.verdict === "needs_fix")) return "needs_fix";
  return "release";
}

export async function checkEvidence(job, evidence, opts = {}) {
  const t0 = Date.now();
  // every fact, description and verdict is keyed by evidence id: two different files under one id would share them
  // (the second photo would get the first one's time, hash and description). A repeated id on a different file is
  // renamed ("p1~2") and flagged; the same file sent twice keeps its id.
  const seenIds = new Map(), renamed = [];
  const all0 = (evidence || []).filter((e) => e && e.id && ["photo", "receipt", "note"].includes(e.kind)).map((e) => {
    const k = String(e.id), same = seenIds.get(k), me = e.path || e.text || "";
    if (same === undefined) { seenIds.set(k, me); return e; }
    if (same === me) return e;
    let n = 2; while (seenIds.has(`${k}~${n}`)) n++;
    seenIds.set(`${k}~${n}`, me); renamed.push(`${k} -> ${k}~${n}`);
    return { ...e, id: `${k}~${n}`, idWas: k };
  });
  const compare = all0.filter((e) => e.kind === "photo" && (e.stage === "before" || e.stage === "reference"));
  const list = all0.filter((e) => !compare.includes(e));
  const scopeChecks = job?.scope?.checks || [];
  // the photos are described while the evidence is gathered (a receipt read can take seconds): each photo once, by path
  const early = new Map(), vlmFirst = opts.vlm !== false && vlmAvailable() && vlmMode() === "describe";
  if (vlmFirst) for (const e of list) if (e.kind === "photo" && e.path && !early.has(e.path)) early.set(e.path, describePhoto(e.path, { timeoutMs: opts.vlmTimeoutMs }));
  const { facts } = await gather(all0, { tz: opts.tz || TZ });
  const byCheck = assign(scopeChecks, list);
  const history = opts.history || photoRows();
  const all = [...byCheck].flatMap(([checkId, es]) => es.filter((e) => e.kind === "photo").map((e) => ({ checkId, e, f: facts.get(e.id) || {} })));
  // the same piece (same id, same file, or the same note text) sent for more than one condition
  const keyOf = (e) => [e.id, facts.get(e.id)?.sha, e.kind === "note" && e.text ? `note:${String(e.text).trim().toLowerCase()}` : null].filter(Boolean);
  const placed = [...byCheck].flatMap(([checkId, es]) => es.map((e) => ({ checkId, keys: keyOf(e) })));
  const sharedWith = (checkId, e) => { const k = keyOf(e); return [...new Set(placed.filter((p) => p.checkId !== checkId && p.keys.some((x) => k.includes(x))).map((p) => p.checkId))]; };
  // the latest BEFORE photo an AFTER photo must come after: this condition's own BEFORE shots (stage "before"), else the
  // general BEFORE shots and the template's before/old_unit photos
  const takenAt = (e) => { const t = Date.parse(facts.get(e.id)?.exif?.taken); return Number.isFinite(t) ? { id: e.id, at: t } : null; };
  const beforeTimes = (checkId) => {
    const own = all0.filter((e) => e.kind === "photo" && e.stage === "before" && e.checkId === checkId);
    const set = own.length ? own : [...all0.filter((e) => e.kind === "photo" && e.stage === "before" && !e.checkId), ...[...byCheck].filter(([id]) => BEFORE_IDS.has(id)).flatMap(([, es]) => es.filter((e) => e.kind === "photo"))];
    return set.map(takenAt).filter(Boolean).sort((a, b) => b.at - a.at)[0] || null;
  };
  const ctx = { history, photosElsewhere: (id) => all.filter((x) => x.checkId !== id), sharedWith, beforeTimes };

  const det = scopeChecks.map((c) => ({ check: c, rule: parseRule(c.rule), ...ruleCheck(c, byCheck.get(c.id) || [], facts, job, ctx) }));
  const toJudge = det.filter((d) => d.verdict === "pass");
  const here = job?.address && Number.isFinite(+job.address.lat) ? { lat: +job.address.lat, lng: +job.address.lng } : null;
  // Done-Audit reads the note and receipt conditions the code passed, and (describe mode) the photo conditions as
  // the VLM's descriptions of their photos: the small VLM only says what it sees, Done-Audit judges that against the
  // condition (vlm.js "describe, then judge"). In judge mode (a big VLM) the VLM judges photos itself (below).
  const isPhotoRow = (d) => (d.rule.kind || d.check.evidence) === "photo";
  const textRows = toJudge.filter((d) => !isPhotoRow(d)), photoRowsJ = toJudge.filter(isPhotoRow);
  const vlmOn = opts.vlm !== false && vlmAvailable(), describeMode = vlmOn && vlmMode() === "describe";
  // plate/label conditions are read by plate OCR first (labels.js); "area" conditions get their photos read too, so a
  // close-up of a label can't pass as the area
  const plates = new Map(), closeups = new Map();
  // the conditions' photo reads and descriptions run at the same time, not one after another: each is a round trip to
  // the model server, and a job's wait is their sum otherwise
  const reading = Promise.all(photoRowsJ.map(async (d) => {
    const ps = (byCheck.get(d.check.id) || []).filter((e) => e.kind === "photo").map((e) => e.path);
    if (!ps.length || !(isLabelCheck(d) || isAreaCheck(d.check))) return;
    const m = await images(ps.map((p) => ({ path: p, ocr: true })));
    const reads = await Promise.all(ps.map((p) => readLabel(p, { ocr: m.get(p) })));
    const best = reads.filter((r) => !r.error).sort((a, b) => b.confidence - a.confidence)[0] || reads[0];
    if (isLabelCheck(d)) plates.set(d.check.id, { ...best, spec: matchSpec(best.error ? null : best, job?.scope?.spec) });
    else closeups.set(d.check.id, reads.find((r) => plateRead(r)) || null);
  }));
  const descs = new Map(); // checkId -> [{ e, sees, source, error, ms, model }]
  const describing = describeMode ? Promise.all(photoRowsJ.map(async (d) => {
    const es = (byCheck.get(d.check.id) || []).filter((x) => x.kind === "photo");
    descs.set(d.check.id, await Promise.all(es.map(async (e) => ({ e, ...(await (early.get(e.path) || describePhoto(e.path, { timeoutMs: opts.vlmTimeoutMs }))) }))));
  })) : null;
  await Promise.all([reading, describing]);
  // before Done-Audit sees a description, code checks it says something: Done-Audit passes empty and vague
  // descriptions (ml side). Near-empty, or not naming the condition's object (and, for "mounted/installed", how it is
  // placed) -> not sent; a person confirms.
  const gateFail = new Map();
  for (const d of photoRowsJ) {
    const ds = descs.get(d.check.id) || [];
    if (!ds.length || ds.some((x) => x.source !== "model") || isBeforeCheck(d.check)) continue;
    const why = descriptionGap(d.check, ds.map((x) => x.sees).join(" "));
    if (why) gateFail.set(d.check.id, why);
  }
  // a described photo goes to Done-Audit with its description as its text (the pro's caption stays out: it proves nothing)
  const described = photoRowsJ.filter((d) => !isBeforeCheck(d.check) && !gateFail.has(d.check.id) && !(isLabelCheck(d) && plateRead(plates.get(d.check.id)))).filter((d) => (descs.get(d.check.id) || []).length && descs.get(d.check.id).every((x) => x.source === "model"))
    .map((d) => ({ ...d, items: d.items.map((x) => ({ ...x, e: { ...x.e, text: descOf(descs.get(d.check.id), x.e)?.sees || "", caption: undefined, label: undefined } })) }));
  const auditRows = [...textRows, ...described];
  const judged = opts.model === false || !auditRows.length ? { verdicts: rulesJudge(textRows), source: "rules" }
    : await modelJudge(job, auditRows, { timeoutMs: opts.timeoutMs, allRows: auditRows.map((d) => ({ ...d, jobAddress: here })) });
  // the pro's own words on a photo ("will come back", "still drips") still send it back
  const captionJudge = rulesJudge(photoRowsJ);

  // ---- the photos themselves: Done-VLM, plate OCR, progress ------------------------------------------------------------
  const pathOf = (e) => e.path;
  const reference = [...compare.filter((e) => e.stage === "reference").map(pathOf), ...(job?.referencePhotos || []).map((p) => p?.path || p)].filter(Boolean);
  const beforeFor = (checkId) => {
    const own = compare.filter((e) => e.stage === "before" && e.checkId === checkId).map(pathOf);
    if (own.length) return own;
    const general = compare.filter((e) => e.stage === "before" && !e.checkId).map(pathOf);
    if (general.length) return general;
    return BEFORE_IDS.has(checkId) ? [] : [...byCheck].filter(([id]) => BEFORE_IDS.has(id)).flatMap(([, es]) => es.filter((e) => e.kind === "photo").map(pathOf));
  };
  const isPhoto = (d) => (d.rule.kind || d.check.evidence) === "photo";
  const look = new Map(), progress = new Map();
  for (const d of det) {
    if (!isPhoto(d) || d.verdict !== "pass") continue;
    const mine = (byCheck.get(d.check.id) || []).filter((e) => e.kind === "photo");
    const photos = mine.map(pathOf);
    if (!photos.length) continue;
    const caption = mine.map((e) => e.text).filter(Boolean).join(" / ");
    if (vlmOn && !describeMode) look.set(d.check.id, await vlmLook("condition", { what: d.check.what, photos, before: beforeFor(d.check.id), reference, caption, jobTitle: job?.scope?.title, timeoutMs: opts.vlmTimeoutMs }));
    const pm = [...d.rule.flags].map((t) => t.match(/^progress>=(\d+)$/)).find(Boolean);
    if (pm) progress.set(d.check.id, { need: +pm[1], ...(vlmOn ? await vlmLook("progress", { what: d.check.what, photos, previous: (job?.previousPhotos || []).map((p) => p?.path || p), quantityOf: d.check.quantityOf, jobTitle: job?.scope?.title, timeoutMs: opts.vlmTimeoutMs }) : { source: "none", error: "no VLM configured" }) });
  }

  const checks = det.map((d) => {
    const j = judged.verdicts.get(d.check.id), v = look.get(d.check.id), pl = plates.get(d.check.id), pg = progress.get(d.check.id);
    let verdict = d.verdict, confidence = d.cap, needsPerson = false;
    const reasons = [...d.reasons], signals = [...d.signals], by = [];
    if (isPhoto(d) && d.verdict === "pass") {
      // a photo's content is judged by the VLM; the caption judge counts only when a model read it, or when the pro's
      // own words say the work is unfinished
      const cj = captionJudge.get(d.check.id);
      if (cj?.verdict === "needs_fix" && !isBeforeCheck(d.check)) { verdict = worse(verdict, "needs_fix"); reasons.push(cj.reason); }
      if (describeMode) {
        const ds = descs.get(d.check.id) || [], missing = ds.filter((x) => x.source !== "model");
        for (const x of ds.filter((y) => y.source === "model")) {
          signals.push(`vlm_sees: ${x.e.id}${x.sha256 ? ` (sha ${x.sha256.slice(0, 12)})` : ""} ${x.sees.slice(0, 160)}`);
          if (looksLikeInstructions(x.sees)) { confidence = Math.min(confidence, 0.4); signals.push(`injection_in_image: ${x.e.id}: words in the photo tried to instruct the checker; ignored`); }
        }
        // same spot, by code: the AFTER photo's image hash against the BEFORE photos' (a different room is far apart)
        const bs = beforeFor(d.check.id).map((p) => all0.find((e) => e.path === p)).filter(Boolean).map((e) => facts.get(e.id)?.dhash).filter(Boolean);
        for (const x of ds) {
          const h = facts.get(x.e.id)?.dhash;
          if (!h || !bs.length) continue;
          const dist = Math.min(...bs.map((b) => hamming(h, b)));
          if (dist >= 26) { confidence = Math.min(confidence, 0.5); signals.push(`not_same_spot: ${x.e.id} looks unlike the BEFORE photos (image hash ${dist} bits apart)`); }
          else if (dist <= 12) signals.push(`same_spot_likely: ${x.e.id} (image hash ${dist} bits from a BEFORE photo)`);
        }
        const plateOk = isLabelCheck(d) && plateRead(plates.get(d.check.id));
        if (plateOk) {
          by.push("ocr");
          const pl = plates.get(d.check.id);
          reasons.push(`the plate reads: ${[pl.brand, pl.model && `model ${pl.model}`, pl.serial && `serial ${pl.serial}`, ...(pl.specs || [])].filter(Boolean).join(", ")}`);
          confidence = Math.min(confidence, pl.spec?.ok === true ? 0.9 : 0.75);
        } else if (missing.length || !ds.length) {
          const busy = missing.some((x) => /busy|503/.test(x.error || ""));
          if (!d.rule.flags.has("code_only")) { needsPerson = true; confidence = Math.min(confidence, 0.3); reasons.push(busy ? "photo model busy; a person confirms" : "no photo description; a person confirms"); signals.push(`needs_person: no VLM description${missing[0]?.error ? ` (${missing[0].error})` : vlmOn ? "" : " (no VLM configured)"}`); }
        } else if (isAreaCheck(d.check) && closeups.get(d.check.id)) {
          // code read a rating plate in the photo: a close-up of a label can't show the area, whatever the description
          verdict = worse(verdict, "needs_fix"); reasons.push("that photo is a close-up of a label, not the area: send a wide photo of the area"); signals.push("closeup_not_area");
        } else if (gateFail.has(d.check.id)) {
          by.push("vlm");
          if (!d.rule.flags.has("code_only")) { needsPerson = true; confidence = Math.min(confidence, 0.3); reasons.push(`${gateFail.get(d.check.id)}; a person confirms`); signals.push(`needs_person: description_gap (${gateFail.get(d.check.id).slice(0, 80)})`); }
        } else if (isBeforeCheck(d.check)) {
          by.push("vlm");
          const said = ds.map((x) => x.sees).join(" / "), rel = relevance(said, job?.scope || {});
          if (rel.ok === true) { confidence = Math.min(confidence, 0.7); reasons.push(`BEFORE photo shows: ${said.slice(0, 200)}`); signals.push(`before_named: ${rel.own.slice(0, 3).join(", ")}`); }
          else if (!d.rule.flags.has("code_only")) { needsPerson = true; confidence = Math.min(confidence, 0.3); reasons.push("the BEFORE photo's description doesn't name this job's fixture or problem; a person confirms"); signals.push("needs_person: BEFORE photo not recognised"); }
        } else if (j?.by === "model") {
          by.push("vlm", "model");
          const said = ds.map((x) => x.sees).join(" / ");
          if (j.verdict === "pass") { confidence = Math.min(confidence, j.confidence); reasons.push(`photo shows: ${said.slice(0, 200)}`); }
          else {
            // The small VLM names the right thing in about 57% of real photos, so "the description doesn't show it" is not
            // evidence of a problem: that goes to a person, never back to the pro. needs_fix only when the description
            // positively names another job's things (code's word lists) and Done-Audit is sure of it (≥ 0.9).
            const rel = relevance(said, job?.scope || {}), contradicts = rel.ok === false && j.confidence >= 0.9 && ["wrong_subject", "not_done"].includes(j.code);
            if (contradicts) { verdict = worse(verdict, "needs_fix"); confidence = Math.min(confidence, j.confidence); reasons.push(`${j.reason} (the photo shows ${rel.other.words.slice(0, 3).join(", ")})`); }
            else { needsPerson = true; confidence = Math.min(confidence, 0.3); reasons.push(`the photo model couldn't confirm it (it describes: "${said.slice(0, 120)}"); a person confirms`); signals.push(`needs_person: vlm_unconfirmed (${j.code || j.verdict})`); }
          }
          // a drawn or edited picture (no camera make/model in it, or words that say so) is not evidence a model can pass:
          // until real photos are checked, it ends with a person
          const drawn = ds.map((x) => ({ x, f: facts.get(x.e.id) || {} })).find(({ x, f }) => !f.exif?.camera || SYNTHETIC.test(`${x.sees} ${x.e.name || ""} ${x.e.text || ""} ${String(x.e.path || "").split(/[\/]/).pop()}`));
          // an "area" condition (cleared, cleaned up, the floor, the space) needs a photo of the area: not a close-up of a
          // label, and a description that names the area
          if (isAreaCheck(d.check) && j.verdict === "pass") {
            const cu = closeups.get(d.check.id), said = ds.map((x) => x.sees).join(" ");
            if (cu) { verdict = worse(verdict, "needs_fix"); reasons.push("that photo is a close-up of a label, not the area: send a wide photo of the area"); signals.push("closeup_not_area"); }
            else if (!AREA_WORDS.test(said)) { needsPerson = true; confidence = Math.min(confidence, 0.3); reasons.push("the photo's description doesn't show the area (floor, room, space); a person confirms"); signals.push("needs_person: area_not_described"); }
          }
          if (drawn && j.verdict === "pass") { needsPerson = true; confidence = Math.min(confidence, 0.3); reasons.push(`${drawn.x.e.id} looks drawn or edited (${!drawn.f.exif?.camera ? "no camera make or model in the file" : "described or named as one"}); a person confirms`); signals.push(`needs_person: synthetic_photo ${drawn.x.e.id}`); }
        } else if (!d.rule.flags.has("code_only")) {
          needsPerson = true; confidence = Math.min(confidence, 0.3); reasons.push("no Done-Audit verdict on the photo description; a person confirms");
          signals.push(`needs_person: no audit verdict on the description${judged.error ? ` (${judged.error})` : ""}`);
        }
      } else if (v?.source === "model") {
        by.push("vlm");
        verdict = worse(verdict, v.verdict); confidence = Math.min(confidence, v.confidence);
        if (v.verdict !== "pass" || !reasons.length) reasons.push(`photo shows: ${v.sees || "?"}`);
        signals.push(`vlm: ${v.verdict} (${v.confidence}) ${v.sees || ""}`.trim());
        if (v.sameSpot === false) { confidence = Math.min(confidence, 0.5); signals.push("not_same_spot: the AFTER photo does not look like the same place as the BEFORE photos"); }
        if (v.sameSpot === true && v.changed) signals.push(`before_after: ${v.changed}`);
        if (v.matchesReference === false) { confidence = Math.min(confidence, 0.5); signals.push("not_reference: not the fixture or place in the customer's problem photo"); }
        if (v.instructionsInImage) { confidence = Math.min(confidence, 0.4); signals.push(`injection_in_image: words in a photo tried to instruct the checker${v.textInImage ? ` ("${v.textInImage.slice(0, 80)}")` : ""}; ignored`); }
      } else if (!d.rule.flags.has("code_only")) {
        needsPerson = true; confidence = Math.min(confidence, 0.3);
        reasons.push("no VLM verdict; a person confirms");
        signals.push(`needs_person: no VLM verdict${v?.error ? ` (${v.error})` : vlmOn ? "" : " (no VLM configured)"}`);
      }
    } else if (j && noteDoubt(d, j)) {
      // Code found the note gives everything its condition asks for (and no words saying the work isn't finished), but
      // the model says it isn't done or is about something else: like a photo the model can't confirm, a person looks;
      // it doesn't go back to the pro
      by.push("model"); needsPerson = true; confidence = Math.min(confidence, 0.3);
      reasons.push(`the note gives what this condition asks for, but the check model doubted it (${j.reason.replace(/\.$/, "")}); a person confirms`);
      signals.push(`needs_person: note_model_doubt (${j.code || j.verdict})`);
    } else if (j) {
      verdict = worse(verdict, j.verdict); confidence = Math.min(confidence, j.confidence);
      if (!d.reasons.length || j.verdict !== "pass") reasons.push(j.reason);
      if (j.needsPerson) { needsPerson = true; signals.push("needs_person: no model verdict; a person confirms"); }
      by.push(j.by);
    }
    if (pl) {
      signals.push(pl.error ? `label_unread: ${pl.error}` : `label: ${[pl.brand, pl.model && `model ${pl.model}`, pl.serial && `serial ${pl.serial}`, ...(pl.specs || [])].filter(Boolean).join(", ")} (read by ${pl.by})`);
      if (pl.spec.ok === false) { verdict = worse(verdict, "needs_fix"); reasons.push(`the label doesn't match the order: ${pl.spec.mismatches.join("; ")}`); }
      if (pl.spec.ok === true) signals.push(`label_matches_order: ${pl.spec.matched.join("; ")}`);
    }
    if (pg) {
      if (pg.source === "model") {
        signals.push(`progress: ${pg.percentComplete}% complete${pg.quantity != null ? `, ${pg.quantity} ${pg.unit || ""}`.trimEnd() : ""} (VLM, ${pg.confidence})`);
        confidence = Math.min(confidence, pg.confidence);
        if (pg.percentComplete < pg.need) { verdict = worse(verdict, "needs_fix"); reasons.push(`the photos show about ${pg.percentComplete}% complete; this milestone needs ${pg.need}%`); }
      } else if (!needsPerson) { needsPerson = true; confidence = Math.min(confidence, 0.3); signals.push(`needs_person: no progress estimate (${pg.error || "no VLM"})`); reasons.push("no progress estimate; a person confirms"); }
    }
    const c = { id: d.check.id, what: d.check.what, verdict, reason: reasons.filter(Boolean).join("; ") || "ok", confidence: +confidence.toFixed(2), signals, ...(needsPerson ? { needsPerson: true } : {}),
      by: [...new Set(["rules", ...by.filter((x) => x && x !== "rules")])].join("+"), evidence: (byCheck.get(d.check.id) || []).map((e) => e.id),
      ...(v?.source === "model" ? { vlm: { verdict: v.verdict, sees: v.sees, confidence: v.confidence, sameSpot: v.sameSpot, changed: v.changed, matchesReference: v.matchesReference } } : {}),
      ...(pl ? { plate: { brand: pl.brand ?? null, model: pl.model ?? null, serial: pl.serial ?? null, specs: pl.specs || [], by: pl.by, matchesOrder: pl.spec.ok } } : {}),
      // which description was made from which file (sha256 of the exact bytes described), so a log can be traced
      ...((descs.get(d.check.id) || []).length ? { described: descs.get(d.check.id).map((x) => ({ evidenceId: x.e.id, sha256: x.sha256 || null, sees: x.sees || null, source: x.source, ...(x.cached ? { cached: true } : {}) })) } : {}),
      ...(pg?.source === "model" ? { progress: { percentComplete: pg.percentComplete, quantity: pg.quantity, unit: pg.unit, need: pg.need } } : {}) };
    // the photo's own caption or label names a different thing than this condition ("corroded shut-off valve" sent for
    // the new cartridge): the reason says so first, and a pass goes to a person (code doesn't send it back on words)
    if (d.check.evidence === "photo" && !isBeforeCheck(d.check)) {
      const mm = (byCheck.get(d.check.id) || []).map((e) => ({ e, m: captionMismatch(d.check, [e.caption, e.label].filter(Boolean).join(" / "), job?.scope || {}) })).find((x) => x.m);
      if (mm) {
        const cap = [mm.e.caption, mm.e.label].filter(Boolean).join(" / ").slice(0, 80);
        const say = `${mm.e.id}'s caption says "${cap}"${mm.m.names.length ? `, a ${mm.m.names.slice(0, 2).join(" and ")}` : ""}${mm.m.state && !mm.m.names.length ? ` (${mm.m.state})` : ""}, but this condition asks for ${mm.m.wants.length ? `the ${mm.m.wants.slice(0, 3).join(", ")}` : "something else"}${mm.m.state && mm.m.names.length ? ` (and "${mm.m.state}" doesn't sound like finished work)` : ""}`;
        c.signals.push(`caption_mismatch: ${mm.e.id} names ${mm.m.names.join(", ") || mm.m.state}; condition wants ${mm.m.wants.join(", ")}`);
        if (c.verdict === "pass") { c.needsPerson = true; c.confidence = Math.min(c.confidence, 0.3); c.reason = `${say}; a person confirms. ${c.reason === "ok" ? "" : c.reason}`.trim(); if (!c.signals.some((x) => x.startsWith("needs_person"))) c.signals.push("needs_person: caption names something else"); }
        else c.reason = `${c.reason}; ${say}`;
      }
    }
    // a pass below the confidence bar is not a pass anyone acted on: a person confirms it (code, whatever decided it)
    // (only a receipt read from the image at a confidence code trusts: not a typed total or date, not one with instructions)
    const codeDecidedReceipt = c.verdict === "pass" && d.cap >= LIMITS().lowConfidence && d.signals.some((x) => x.startsWith("receipt_matches_change_orders:"));
    if (codeDecidedReceipt) { if (c.needsPerson) { delete c.needsPerson; c.signals = c.signals.filter((x) => !x.startsWith("needs_person")); } c.confidence = Math.max(c.confidence, 0.9); c.decidedByCode = true; }
    if (c.verdict === "pass" && !c.needsPerson && c.confidence < LIMITS().lowConfidence) { c.needsPerson = true; c.reason += `; confidence ${c.confidence} is under ${LIMITS().lowConfidence}, so a person confirms`; c.signals.push(`needs_person: low_confidence ${c.confidence}`); }
    // who decided this condition: "person" (pending), else "model" when a model's verdict set it, else "code"
    c.decidedBy = c.needsPerson ? "person" : c.decidedByCode ? "code" : /model|vlm/.test(c.by) && !d.reasons.length ? "model" : "code";
    delete c.decidedByCode;
    c.label = checkLabel(c);
    return c;
  });
  const superseded = byCheck.superseded || [];
  const unassigned = list.filter((e) => !superseded.includes(e) && ![...byCheck.values()].some((es) => es.includes(e))).map((e) => e.id);
  const signals = [...(renamed.length ? [`duplicate_evidence_id: ${renamed.join(", ")} (two different files sent under one id; each is checked as itself)`] : []), ...(unassigned.length ? [`unassigned_evidence: ${unassigned.join(", ")} (no check asks for that kind)`] : []), ...(superseded.length ? [`superseded: ${superseded.map((e) => e.id).join(", ")} (replaced by a later round)`] : []),
    ...(judged.ignored || []).map((x) => `model_claim_ignored: ${x}`), ...(judged.error && judged.source !== "model" && opts.model !== false ? [`model_unavailable: ${judged.error}`] : []), ...(compare.length ? [`comparison_photos: ${compare.map((e) => `${e.id} (${e.stage})`).join(", ")}`] : [])];
  const receipts = list.filter((e) => e.kind === "receipt").map((e) => ({ evidenceId: e.id, ...(facts.get(e.id)?.receipt || {}) })).map(({ text, ...r }) => r);
  if (opts.remember !== false && job?.id) rememberPhotos(job.id, [...facts.values()].filter((f) => !compare.some((e) => e.id === f.id)));
  const decision = decide(checks);
  // what the parts are paid at: the receipts' total, never more than the approved change orders (rules.js)
  const md = det.find((d) => d.money), parts = md ? { checkId: md.check.id, ...md.money } : null;
  const vl = [...look.values(), ...[...progress.values()].filter((p) => p.source), ...[...descs.values()].flat()];
  const source = [judged.source === "model" ? "model" : null, vl.some((x) => x.source === "model") ? "vlm" : null].filter(Boolean).join("+") || "rules";
  const attestation = verdictRecord({ jobId: job?.id || null, models: [judged.source === "model" ? judged.model : null, ...vl.filter((x) => x.source === "model").map((x) => x.model)],
    prompts: [judged.promptSha256, ...vl.map((x) => x.promptSha256)], evidence: all0.map((e) => ({ id: e.id, sha256: facts.get(e.id)?.sha || null })),
    answer: { decision, parts: parts ? { matchedTotal: parts.matchedTotal, padding: parts.padding } : null, checks: checks.map((c) => ({ id: c.id, verdict: c.verdict, confidence: c.confidence, needsPerson: !!c.needsPerson })) } });
  return { checks, decision, decisionLabel: DECISION_LABEL[decision], source, ms: Date.now() - t0, receipts, parts, signals, attestation, ...(judged.model && judged.source === "model" ? { model: judged.model } : {}) };
}
