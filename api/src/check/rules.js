// The deterministic half of the evidence check: which evidence answers which done-condition, and what the evidence's
// own facts say (count, capture time, place, reuse, receipt totals against change orders, injection). Each check gets
// a verdict from code with a cap on how confident anyone (the model included) may later be about it.
import { km, hamming, varied } from "../exif.js";
import { looksLikeInstructions, instructionParts, reuseOf, SAME_PICTURE_BITS } from "../fraud.js";
import { noteRequirements, relevance, partsRelevance } from "./relevance.js";
import { sameReceipt } from "./history.js";

// every text a piece of evidence carries, for the injection scan: the pro's text, caption, label and file name, the
// photo's own EXIF text fields (description, comment, title, artist), and what OCR read on a receipt
export function textsOf(e, f) {
  const base = String(e.path || e.name || "").split(/[\\/]/).pop();
  return [["text", e.text], ["caption", e.caption], ["label", e.label], ["name", e.name], ["file name", base.replace(/\.[a-z0-9]{2,5}$/i, "").replace(/[_-]+/g, " ")],
    ["EXIF description", f?.exif?.description], ["EXIF comment", f?.exif?.comment], ["EXIF title", f?.exif?.title], ["EXIF artist", f?.exif?.artist], ["receipt text", f?.receipt?.text]]
    .filter(([, v]) => v && String(v).trim()).map(([k, v]) => [k, String(v)]);
}

export const LIMITS = () => ({
  gpsKm: +(process.env.DONE_GPS_KM || 0.5),               // a photo farther than this from the job fails
  slackMin: +(process.env.DONE_WINDOW_SLACK_MIN || 60),   // minutes either side of the window still counted as inside
  lowConfidence: +(process.env.DONE_LOW_CONFIDENCE || 0.6),
  receiptEarlyDays: 7,                                    // a parts receipt up to a week before the job is fine
  paddingTol: +(process.env.DONE_PADDING_TOL_CENTS || 100), // a change order up to $1 over the receipts is rounding
});
// a change order counts once approved: { approved: true } or the job store's { status: "approved" }
export const isApproved = (c) => c?.approved === true || c?.status === "approved";
const $ = (c) => `$${(c / 100).toFixed(2)}`;
const RANK = { pass: 0, needs_fix: 1, fail: 2 };
export const worse = (a, b) => (RANK[b] > RANK[a] ? b : a);

// a date the pro typed next to a receipt: "date 11/05/2026", "bought 2026-11-05", "11/5/26"
export function typedDate(text) {
  const t = String(text || "");
  let m = t.match(/(?<!\d)(\d{1,2})\/(\d{1,2})\/(\d{4}|\d{2})(?!\d)/);
  if (m) { const y = +m[3] < 100 ? 2000 + +m[3] : +m[3], mo = +m[1], d = +m[2]; if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31) return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`; }
  m = t.match(/(?<!\d)(20\d{2})-(\d{2})-(\d{2})(?!\d)/);
  return m ? m[0] : null;
}
export const BEFORE_CHECK = /^(before|old_unit)$/;
// when the work started: job.startedAt, else agreedAt, else created (the core passes what it has)
export function workStart(job) {
  for (const k of ["startedAt", "agreedAt", "created"]) { const t = Date.parse(job?.[k]); if (Number.isFinite(t)) return { at: t, from: k }; }
  return null;
}
// a time as a person reads it, in Austin: "12:34 PM", or "Nov 4, 12:34 PM" when the day matters
const fmtT = new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", hour: "numeric", minute: "2-digit" }), fmtD = new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", month: "short", day: "numeric" });
export const when = (ms) => (Number.isFinite(ms) ? `${fmtD.format(ms)}, ${fmtT.format(ms)}` : "?");

export function parseRule(rule) {
  const r = { kind: null, min: 1, words: 0, flags: new Set() };
  for (const tok of String(rule || "").split(";").map((s) => s.trim()).filter(Boolean)) {
    let m = tok.match(/^(photo|receipt|note)>=(\d+)$/);
    if (m) { r.kind = m[1]; r.min = +m[2]; continue; }
    m = tok.match(/^words>=(\d+)$/);
    if (m) { r.words = +m[1]; continue; }
    r.flags.add(tok);
  }
  return r;
}

const words = (s) => String(s || "").toLowerCase().match(/[a-z]{3,}/g) || [];
const STOP = new Set(["the", "and", "for", "with", "photo", "after", "before", "this", "that", "from", "into", "each", "note", "receipt", "least", "minutes", "anything", "else", "found"]);

// evidence -> checks. An explicit evidence.checkId wins; otherwise each piece goes to the check of its kind whose id and
// wording share the most words with its caption, or to the least-served check of its kind.
export function assign(checks, evidence) {
  const by = new Map(checks.map((c) => [c.id, []]));
  const kindOf = (c) => parseRule(c.rule).kind || c.evidence;
  for (const e of evidence) {
    if (Array.isArray(e.checkIds) && e.checkIds.some((id) => by.has(id))) { for (const id of new Set(e.checkIds)) if (by.has(id)) by.get(id).push(e); continue; }
    if (e.checkId && by.has(e.checkId)) { by.get(e.checkId).push(e); continue; }
    const cands = checks.filter((c) => kindOf(c) === e.kind);
    if (!cands.length) continue;
    const cap = new Set(words(`${e.text || ""} ${e.label || ""} ${String(e.path || "").split(/[\\/]/).pop()}`).filter((w) => !STOP.has(w)));
    const score = (c) => [...new Set([...c.id.split(/[_-]/), ...words(c.what)].filter((w) => !STOP.has(w)))].filter((w) => cap.has(w) || cap.has(w.replace(/s$/, ""))).length;
    const best = cands.map((c) => ({ c, s: score(c), n: by.get(c.id).length, need: parseRule(c.rule).min }))
      .sort((a, b) => b.s - a.s || (a.n >= a.need) - (b.n >= b.need) || a.n - b.n)[0];
    by.get(best.c.id).push(e);
  }
  // a fix replaces what it fixes: when evidence carries its submission round, each check keeps only its latest round
  const superseded = [];
  for (const [id, es] of by) {
    const rounds = es.map((e) => +e.round).filter(Number.isFinite);
    if (rounds.length) { const last = Math.max(...rounds); by.set(id, es.filter((e) => !Number.isFinite(+e.round) || +e.round === last)); superseded.push(...es.filter((e) => Number.isFinite(+e.round) && +e.round !== last)); }
  }
  by.superseded = superseded;
  return by;
}

// what one check's evidence says, from code alone
export function ruleCheck(check, assigned, facts, job, ctx) {
  const L = LIMITS(), rule = parseRule(check.rule), kind = rule.kind || check.evidence;
  const signals = [], reasons = [];
  let verdict = "pass", cap = 1, money = null;
  const flag = (v, why, sig, c = 1) => { verdict = worse(verdict, v); if (why) reasons.push(why); if (sig) signals.push(sig); cap = Math.min(cap, c); };
  const items = assigned.map((e) => ({ e, f: facts.get(e.id) || {} }));
  const present = items.filter((x) => x.f.exists || (kind !== "photo" && x.e.text));
  if (present.length < rule.min) flag("needs_fix", `needs ${rule.min} ${kind}${rule.min > 1 ? "s" : ""}, got ${present.length}`, `missing_evidence: ${present.length}/${rule.min} ${kind}`);
  for (const x of items.filter((x) => !x.f.exists && kind === "photo")) flag("needs_fix", `file for ${x.e.id} was not found`, `missing_file: ${x.e.id}`);

  // text that tries to instruct the system, in a caption, note or receipt: flagged, kept out of the model's input
  for (const x of items) {
    const hit = textsOf(x.e, x.f).find(([, v]) => looksLikeInstructions(v)), t = hit ? hit[1] : "";
    if (hit) { flag("pass", null, `injection: ${x.e.id} ${hit[0]} contains text that tries to instruct the checker ("${(instructionParts(t)[0] || t).slice(0, 120)}"); it was ignored`, 0.4); x.injected = true; }
  }

  const from = Date.parse(job.window?.from), to = Date.parse(job.window?.to), slack = L.slackMin * 6e4;
  if (kind === "photo") {
    for (const { e, f } of present) {
      const ex = f.exif;
      // what the photo's own words (file name, label, caption) say it shows: another kind of job's words and none of this
      // one's -> needs_fix; no words -> nothing here (the VLM, or a person, judges the picture)
      const words = textsOf(e, f).filter(([k]) => ["text", "caption", "label", "name", "file name"].includes(k)).map(([, v]) => v).join(" ").replace(/\b(img|dsc|pxl|photo|image)[\s_-]*\d+\b/gi, " ");
      const prel = relevance(words, job.scope);
      if (prel.ok === false) flag("needs_fix", `${e.id} is labelled as ${prel.other.words.slice(0, 3).join(", ")} (${prel.other.template.replace("_", " ")} work), not this job (${job.scope?.title || "the order"})`, `photo_topic_mismatch: ${e.id} about ${prel.other.template}`);
      if (!ex || ex.kind !== "jpeg") flag("needs_fix", `${e.id} is not a camera photo (${ex?.kind || "unknown"}): upload the original JPEG`, `not_camera_photo: ${e.id}`);
      if (rule.flags.has("in_window")) {
        if (!ex?.taken) flag("needs_fix", `${e.id} has no capture time (a screenshot or an edited copy?): upload the original`, `no_exif_time: ${e.id}`);
        else {
          const at = Date.parse(ex.taken), isBefore = BEFORE_CHECK.test(check.id);
          // the work can't be photographed before it started: the lower bound is the later of the window's start and the
          // job's start (startedAt, else agreedAt, else created). A BEFORE shot may be up to 15 minutes before the start.
          const start = workStart(job), early = isBefore ? 15 * 6e4 : 0;
          const lastBefore = !isBefore && ctx.beforeTimes ? ctx.beforeTimes(check.id) : null;
          if (Number.isFinite(from) && Number.isFinite(to) && (at < from - slack || at > to + slack)) flag("fail", `${e.id} was taken ${when(at)}, outside the job window (${when(from)} to ${when(to)})`, `exif_time_outside: ${e.id} taken ${ex.taken}`);
          else if (start && at < start.at - early) flag("fail", `${e.id} was taken ${when(at)}, before work started at ${when(start.at)}${start.from !== "startedAt" ? ` (${start.from === "agreedAt" ? "the job was agreed" : "the job was posted"} then)` : ""}`, `exif_before_start: ${e.id} taken ${ex.taken}, ${start.from} ${new Date(start.at).toISOString()}`);
          else if (lastBefore && at < lastBefore.at) flag("fail", `${e.id} was taken ${when(at)}, before the BEFORE photo ${lastBefore.id} (${when(lastBefore.at)}): an AFTER photo must come after it`, `exif_before_before_photo: ${e.id} < ${lastBefore.id}`);
          else signals.push(`exif_time_ok: ${e.id} taken ${ex.taken}${ex.offsetFrom === "assumed" ? " (zone assumed)" : ""}`);
          const up = Date.parse(e.uploadedAt);
          if (Number.isFinite(up) && at > up + 10 * 6e4) flag("fail", `${e.id} claims to be taken after it was uploaded`, `exif_time_after_upload: ${e.id}`);
        }
      }
      if (rule.flags.has("near_job")) {
        const here = job.address && Number.isFinite(+job.address.lat) && Number.isFinite(+job.address.lng) ? { lat: +job.address.lat, lng: +job.address.lng } : null;
        if (!ex?.gps) flag("pass", null, `no_gps: ${e.id} has no location`, 0.75);
        else if (!here) signals.push(`gps_unchecked: the job has no coordinates`);
        else {
          const d = km(ex.gps, here);
          if (d > L.gpsKm) flag("fail", `${e.id} was taken ${d.toFixed(1)} km from the job address`, `gps_far: ${e.id} ${d.toFixed(2)} km away`);
          else signals.push(`gps_ok: ${e.id} ${Math.round(d * 1000)} m from the job`);
        }
      }
      if (rule.flags.has("not_reused")) {
        for (const h of reuseOf({ ...f, jobId: job.id }, ctx.history.filter((r) => r.jobId !== job.id)))
          flag("fail", `${e.id} ${h.kind === "same_file" ? "is the same file as" : "looks like"} a photo sent with job ${h.jobId}`, `photo_reused: ${e.id} ~ ${h.jobId}/${h.evidenceId} (${h.kind}${h.kind === "same_picture" ? `, ${h.bits} bits` : ""})`);
        // one picture can't prove two conditions ("before" and "after")
        for (const o of ctx.photosElsewhere(check.id)) {
          if ((f.sha && o.f.sha === f.sha) || (varied(f.dhash) && varied(o.f.dhash) && hamming(f.dhash, o.f.dhash) <= SAME_PICTURE_BITS))
            flag("needs_fix", `${e.id} is the same picture as ${o.e.id} sent for "${o.checkId}"`, `duplicate_in_job: ${e.id} = ${o.e.id}`);
        }
        if (!f.dhash) signals.push(`dhash_unavailable: ${e.id}${f.imageError ? ` (${f.imageError})` : ""}`);
      }
    }
  }

  if (kind === "receipt") {
    let total = 0, read = 0;
    for (const { e, f } of present) {
      const r = f.receipt;
      if (!r || r.error) { flag("needs_fix", `${e.id} could not be read (${r?.error || "no reader"}): upload a clearer photo or type the total`, `receipt_unread: ${e.id}`); continue; }
      read++; total += r.total || 0;
      // the same receipt already sent with another job: the same file, or the same picture and the same store, total
      // and date, or (OCR'd) the same store, total and date. A store's receipts share a layout, so a close picture
      // alone isn't enough.
      for (const h of (ctx.history || []).filter((x) => x.jobId !== job.id && (x.kind === "receipt" || !x.kind))) {
        const sameFile = f.sha && h.sha === f.sha, samePic = varied(f.dhash) && varied(h.dhash) && hamming(f.dhash, h.dhash) <= SAME_PICTURE_BITS, sameRead = sameReceipt(r, h);
        if (sameFile || sameRead) { flag("needs_fix", `${e.id}: this receipt was already used on another job (${h.jobId}); send the receipt for this job's parts`, `receipt_reused: ${e.id} ~ ${h.jobId}/${h.evidenceId} (${sameFile ? "same file" : samePic ? "same picture, same store, total and date" : "same store, total and date"})`); break; }
      }
      // a receipt for another kind of job (a shut-off valve on a clogged-drain job) doesn't prove this one's parts
      const pr = partsRelevance(r.items, job.scope);
      if (pr.ok === false) flag("needs_fix", `${e.id} lists ${(r.items || []).slice(0, 3).join(", ")}: nothing for this job (${job.scope?.title || "the order"})${pr.other ? `; those are ${pr.other.template.replace("_", " ")} parts` : ""}`, `receipt_unrelated: ${e.id}`);
      else if (pr.ok) signals.push(`receipt_items_match: ${pr.matched.slice(0, 3).join(", ")}`);
      signals.push(`receipt: ${e.id} ${r.store || "store?"}, ${r.date || "date?"}, total ${r.total != null ? $(r.total) : "?"} (read by ${r.by}, confidence ${r.confidence})`);
      if (r.by === "typed") flag("pass", null, `receipt_typed: ${e.id} total was typed by the pro, not read`, 0.5);
      else cap = Math.min(cap, Math.max(0.3, r.confidence ?? 0.5));
      if (r.typedDiffers) flag("pass", `the total typed (${$(r.typedTotal)}) differs from the receipt (${$(r.total)})`, `receipt_typed_differs: ${e.id}`, 0.5);
      if (rule.flags.has("in_window")) {
        // an undated receipt proves nothing about when the parts were bought: needs_fix, unless the pro typed the date
        // (then it is checked like a read one, at a confidence a person confirms)
        const typed = r.date ? null : typedDate(e.text);
        if (!r.date && !typed) flag("needs_fix", `${e.id}: the receipt's date can't be read; send a clearer photo or type the date`, `receipt_no_date: ${e.id}`);
        else {
          if (typed) flag("pass", null, `receipt_date_typed: ${e.id} ${typed} (typed by the pro, not read)`, 0.5);
          const day = r.date || typed;
          const d = Date.parse(`${day}T12:00:00Z`);
          if (Number.isFinite(to) && d > to + 36 * 36e5) flag("fail", `${e.id} is dated ${day}, after the job ended`, `receipt_after_job: ${e.id} ${day}`);
          else if (Number.isFinite(from) && d < from - L.receiptEarlyDays * 864e5) flag("needs_fix", `${e.id} is dated ${day}, more than a week before the job`, `receipt_old: ${e.id} ${day}`);
        }
      }
    }
    if (rule.flags.has("matches_change_orders") && read) {
      // only parts change orders are matched to receipts: labor has no receipt, and "both" mixes the two, so its amount
      // caps what receipts are paid at but a receipt below it isn't padding
      const cos = job.changeOrders || [], ok = cos.filter(isApproved), kindOf = (c) => c.kind || "parts";
      const sum = (xs) => xs.reduce((s, c) => s + (+c.amount || 0), 0);
      const approved = sum(ok.filter((c) => ["parts", "materials"].includes(kindOf(c)))), mixed = sum(ok.filter((c) => kindOf(c) === "both"));
      for (const c of cos.filter((c) => !isApproved(c))) signals.push(`change_order_unapproved: ${$(+c.amount || 0)} (${String(c.reason || "").slice(0, 60)}) not counted`);
      for (const c of ok.filter((c) => kindOf(c) === "labor")) signals.push(`change_order_labor: ${$(+c.amount || 0)} (${String(c.reason || "").slice(0, 60)}) is labor: no receipt to match`);
      if (mixed) signals.push(`change_order_mixed: ${$(mixed)} of parts and labor; receipts up to it are paid`);
      // parts are paid at what the receipts show, never more than approved: matchedTotal = min(receipts, approved).
      // A change order more than $1 over the receipts (rounding) is padding until receipts for the difference arrive.
      const cap = approved + mixed, matchedTotal = cap ? Math.min(total, cap) : total, difference = approved - total;
      money = { receiptsTotal: total, approvedChangeOrders: approved, matchedTotal, difference, padding: approved > 0 && difference > L.paddingTol };
      if (!approved) signals.push(`receipts_total: ${$(total)} (no approved parts change orders to match)`);
      else if (Math.abs(difference) <= L.paddingTol) signals.push(`receipt_matches_change_orders: receipts ${$(total)}, approved ${$(approved)}, parts paid ${$(matchedTotal)}`);
      else if (difference > 0) flag("needs_fix", `receipts total ${$(total)}, but approved change orders total ${$(approved)} (${$(difference)} more): parts are paid at ${$(matchedTotal)} unless receipts for the difference are shown`, `receipt_short: receipts ${$(total)} < approved ${$(approved)} by ${$(difference)}; parts paid ${$(matchedTotal)}`);
      else signals.push(`receipt_over_change_orders: receipts ${$(total)} > approved ${$(approved)} (only approved amounts are paid: ${$(matchedTotal)})`);
    }
  }

  if (kind === "note") {
    const said = present.map((x) => String(x.e.text || "").split(/(?<=[.!?\n])\s+/).filter((t) => !looksLikeInstructions(t)).join(" ")).join(" ");
    // what this condition's wording asks for, checked by code: a model's pass doesn't stand without it
    const reqs = noteRequirements(check, job.scope), unmet = reqs.filter((q) => present.length && !q.test(said));
    for (const q of unmet) flag("needs_fix", `the note doesn't give ${q.say}`, `requirement_missing: ${q.id}`);
    if (present.length && reqs.length && !unmet.length) signals.push(`note_requirements_met: ${reqs.map((q) => q.id).join(", ")}`);
    // a note about another kind of job
    const rel = relevance(said, job.scope);
    if (present.length && rel.ok === false) flag("needs_fix", `the note is about ${rel.other.words.slice(0, 3).join(", ")} (${rel.other.template.replace("_", " ")} work), not this job (${job.scope?.title || "the order"})`, `topic_mismatch: note about ${rel.other.template}`);
  }
  // one piece of evidence sent for several conditions answers each only if each one's requirement is in it
  for (const x of present) {
    const others = ctx.sharedWith ? ctx.sharedWith(check.id, x.e) : [];
    if (!others.length) continue;
    signals.push(`shared_evidence: ${x.e.id} also sent for ${others.join(", ")}`);
    if (kind === "note" && !noteRequirements(check, job.scope).length) flag("needs_fix", `the same note was sent for ${others.join(", ")}; this condition needs its own answer`, `shared_note: ${x.e.id}`);
  }
  if (kind === "note" && rule.words) {
    const clean = present.filter((x) => !x.injected || instructionParts(x.e.text).length < String(x.e.text).split(/(?<=[.!?\n])\s+/).length)
      .map((x) => String(x.e.text || "").split(/(?<=[.!?\n])\s+/).filter((s) => !looksLikeInstructions(s)).join(" "));
    const n = Math.max(0, ...clean.map((s) => (s.match(/\S+/g) || []).length));
    if (present.length && n < rule.words) flag("needs_fix", `the note has ${n} words; it needs at least ${rule.words} describing the work`, `note_short: ${n} words`);
  }
  return { verdict, reasons, signals, cap, items, ...(money ? { money } : {}) };
}
