// A defect claim during the warranty (retainage) window: the homeowner says something the pro did has failed and sends
// photos. The same checks as the evidence check, turned around: the photos must be new (taken after the job was paid),
// at the job, not reused, and the VLM must see the defect and relate it to a done-condition. Code decides; a claim is
// only ever auto-rejected for reasons code can prove, and never auto-accepted without a VLM verdict.
//
//   checkDefectClaim(job, claim, evidence, opts?) -> {
//     verdict: "valid" | "invalid" | "review", decision: "hold_and_fix" | "reject" | "review",
//     reasons: [string], signals: [string], checkId, vlm?, source: "rules" | "vlm", ms, attestation }
//   job:      { id, address, scope, releasedAt, warrantyUntil, photos?: [path] (the accepted AFTER photos) }
//   claim:    { text, at, checkId? }
//   evidence: [{ id, kind: "photo", path, uploadedAt }]
// valid -> the retainage stays held and the pro is asked to fix; invalid (outside the window, photos taken before the
// job was paid, elsewhere or reused) -> rejected with the reason; anything else -> a person decides.
import { facts as gather } from "./vision.js";
import { km, hamming, varied } from "../exif.js";
import { reuseOf, looksLikeInstructions } from "../fraud.js";
import { photoRows } from "./history.js";
import { vlmLook, vlmAvailable } from "../vlm.js";
import { verdictRecord } from "./attest.js";
import { LIMITS } from "./rules.js";

export async function checkDefectClaim(job, claim, evidence, opts = {}) {
  const t0 = Date.now(), L = LIMITS();
  const reasons = [], signals = [], hard = [];
  const at = Date.parse(claim?.at || new Date().toISOString()), released = Date.parse(job?.releasedAt), until = Date.parse(job?.warrantyUntil);
  if (Number.isFinite(released) && at < released) hard.push("the claim is dated before the job was paid");
  if (Number.isFinite(until) && at > until) hard.push(`the warranty window ended ${job.warrantyUntil}`);
  const photos = (evidence || []).filter((e) => e && e.kind === "photo");
  if (!photos.length) { reasons.push("no photo of the defect"); signals.push("missing_evidence: 0 photos"); }
  if (looksLikeInstructions(claim?.text)) signals.push("injection: the claim's text tries to instruct the checker; ignored");
  const { facts } = await gather(photos);
  const here = job?.address && Number.isFinite(+job.address.lat) ? { lat: +job.address.lat, lng: +job.address.lng } : null;
  const history = (opts.history || photoRows());
  for (const e of photos) {
    const f = facts.get(e.id) || {}, ex = f.exif;
    if (!ex?.taken) signals.push(`no_exif_time: ${e.id}`);
    else if (Number.isFinite(released) && Date.parse(ex.taken) < released) hard.push(`${e.id} was taken ${ex.taken}, before the job was paid (a pre-existing problem)`);
    else signals.push(`exif_time_ok: ${e.id} taken ${ex.taken}`);
    if (ex?.gps && here) { const d = km(ex.gps, here); if (d > L.gpsKm) hard.push(`${e.id} was taken ${d.toFixed(1)} km from the job`); else signals.push(`gps_ok: ${e.id}`); }
    else signals.push(`no_gps: ${e.id}`);
    for (const h of reuseOf({ ...f, jobId: `claim:${job?.id}` }, history.filter((r) => r.jobId !== job?.id))) hard.push(`${e.id} is a photo already sent with job ${h.jobId}`);
    // the claim's photo must not be one of the job's own accepted AFTER photos
    for (const r of history.filter((r) => r.jobId === job?.id)) if ((f.sha && r.sha === f.sha) || (varied(f.dhash) && varied(r.dhash) && hamming(f.dhash, r.dhash) <= 4)) hard.push(`${e.id} is the pro's own AFTER photo, not a new one`);
  }
  let v = null;
  if (photos.length && opts.vlm !== false && vlmAvailable()) {
    v = await vlmLook("defect", { what: String(claim?.text || "").slice(0, 400), photos: photos.map((e) => e.path), before: (job?.photos || []).map((p) => p?.path || p), jobTitle: job?.scope?.title, timeoutMs: opts.vlmTimeoutMs });
    if (v.source === "model") signals.push(`vlm: ${v.verdict} (${v.confidence}), related ${v.relatedToCondition}: ${v.sees || ""}`);
  }
  let verdict = "review", decision = "review";
  if (hard.length) { verdict = "invalid"; decision = "reject"; reasons.push(...hard); }
  else if (v?.source === "model" && v.verdict === "shows_defect" && v.relatedToCondition === true && v.confidence >= L.lowConfidence && !signals.some((s) => /^(injection|no_exif_time)/.test(s))) { verdict = "valid"; decision = "hold_and_fix"; reasons.push(`the photo shows the defect: ${v.sees || ""}`.trim()); }
  else reasons.push(v?.source === "model" ? `the VLM is not sure enough (${v.verdict}, ${v.confidence}); a person decides` : "no VLM verdict; a person decides");
  const checkId = claim?.checkId || null;
  const attestation = verdictRecord({ jobId: job?.id || null, kind: "defect_claim", models: [v?.source === "model" ? v.model : null], prompts: [v?.promptSha256], evidence: photos.map((e) => ({ id: e.id, sha256: facts.get(e.id)?.sha || null })), answer: { verdict, decision } });
  return { verdict, decision, reasons, signals, checkId, ...(v?.source === "model" ? { vlm: { verdict: v.verdict, relatedToCondition: v.relatedToCondition, sees: v.sees, confidence: v.confidence } } : {}), source: v?.source === "model" ? "vlm" : "rules", ms: Date.now() - t0, attestation };
}
