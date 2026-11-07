// Materials advance (PLAN §13): mid-job, a pro who had to buy extra materials is paid for them now, out of the held
// money, instead of carrying the cost to the end. The change order is already approved (the core's flow); this checks
// the proof before the advance is paid. Code decides; models only read and describe; unsure goes to a person.
//
//   checkMaterialsAdvance(job, changeOrder, evidence, opts?) -> {
//     verdict: "pass" | "needs_fix" | "fail", decision: "advance" | "needs_fix" | "review", needsPerson,
//     reasons: [string], signals: [string],
//     invoice: { evidenceId, store, items, total, date, readBy, confidence } | null,
//     approved (cents), matchedTotal (cents: pay this = min(invoice total, approved)), difference,
//     photo: { evidenceId, taken, gps, sees, describedBy } | null,
//     source: "rules" | "vlm", ms, attestation }
//   job:          { id, scope: { title, items, template, trade }, address: { lat, lng, zip }, window: { from, to },
//                   startedAt?, agreedAt?, created? }
//   changeOrder:  { id, amount (cents), reason, approved | status: "approved" }
//   evidence:     [{ id, kind: "receipt", path, uploadedAt, text? }  (the supplier's invoice or receipt),
//                  { id, kind: "photo", path, uploadedAt, text? }    (the materials delivered, on site)]
//   opts:         { history (default: the shared evidence history), remember: true, vlm: true, vlmTimeoutMs }
import { facts as gather } from "./vision.js";
import { photoRows, rememberPhotos, sameReceipt } from "./history.js";
import { partsRelevance, relevance } from "./relevance.js";
import { textsOf, workStart, when, LIMITS, isApproved } from "./rules.js";
import { looksLikeInstructions, instructionParts } from "../fraud.js";
import { km } from "../exif.js";
import { vlmAvailable, describePhoto } from "../vlm.js";
import { verdictRecord } from "./attest.js";

const $ = (c) => `$${(c / 100).toFixed(2)}`;
const RANK = { pass: 0, needs_fix: 1, fail: 2 };
const words = (s) => (String(s || "").toLowerCase().match(/[a-z]{4,}/g) || []).filter((w) => !/^(with|from|that|this|also|need|needs|replace|replacing|new|the|and|parts|part|materials?|extra)$/.test(w));

export async function checkMaterialsAdvance(job, changeOrder, evidence, opts = {}) {
  const t0 = Date.now(), L = LIMITS();
  const reasons = [], signals = [];
  let verdict = "pass", person = false;
  const flag = (v, why, sig) => { if (RANK[v] > RANK[verdict]) verdict = v; if (why) reasons.push(why); if (sig) signals.push(sig); };
  const toPerson = (why, sig) => { person = true; reasons.push(why); if (sig) signals.push(sig); };
  const approved = isApproved(changeOrder) ? Math.max(0, Math.round(+changeOrder.amount || 0)) : 0;
  if (!isApproved(changeOrder)) flag("fail", "the change order isn't approved: nothing is advanced before it is", "change_order_not_approved");
  const list = (evidence || []).filter((e) => e && e.id);
  const inv = list.find((e) => e.kind === "receipt"), pic = list.find((e) => e.kind === "photo");
  if (!inv) flag("needs_fix", "send the supplier's invoice or receipt for these materials", "missing_evidence: invoice");
  if (!pic) flag("needs_fix", "send a photo of the materials delivered on site", "missing_evidence: photo");
  const { facts } = await gather(list);

  // instructions anywhere (a note on the invoice, a caption, the photo's EXIF text) -> a person
  for (const e of list) { const hit = textsOf(e, facts.get(e.id)).find(([, v]) => looksLikeInstructions(v)); if (hit) toPerson(`${e.id}'s ${hit[0]} tries to instruct the checker; a person confirms`, `injection: ${e.id} ${hit[0]} ("${(instructionParts(hit[1])[0] || hit[1]).slice(0, 80)}")`); }

  // ---- the invoice ---------------------------------------------------------------------------------------------------
  let invoice = null, matchedTotal = 0, difference = null;
  const from = Date.parse(job?.window?.from), to = Date.parse(job?.window?.to);
  if (inv) {
    const f = facts.get(inv.id) || {}, r = f.receipt;
    if (!r || r.error) flag("needs_fix", `${inv.id} could not be read (${r?.error || "no reader"}): send a clearer photo, or type the total and date`, `invoice_unread: ${inv.id}`);
    else {
      invoice = { evidenceId: inv.id, store: r.store || null, items: r.items || [], total: r.total ?? null, date: r.date || null, readBy: r.by, confidence: r.confidence ?? null };
      signals.push(`invoice: ${r.store || "store?"}, ${r.date || "date?"}, total ${r.total != null ? $(r.total) : "?"} (read by ${r.by}, confidence ${r.confidence})`);
      if (r.by === "typed" || (r.confidence ?? 0) < L.lowConfidence) toPerson(`the invoice was ${r.by === "typed" ? "typed by the pro, not read" : `read at confidence ${r.confidence}`}; a person confirms the amount`, `invoice_unsure: ${r.by}`);
      // the amount: never more than approved
      if (r.total == null) flag("needs_fix", "the invoice's total can't be read; send a clearer photo", "invoice_no_total");
      else {
        matchedTotal = Math.min(r.total, approved); difference = r.total - approved;
        if (difference > L.paddingTol) signals.push(`invoice_over_approved: invoice ${$(r.total)} > approved ${$(approved)}; the advance is ${$(matchedTotal)}`);
        else if (difference < -L.paddingTol) signals.push(`invoice_under_approved: invoice ${$(r.total)} < approved ${$(approved)}; the advance is ${$(matchedTotal)}`);
        else signals.push(`invoice_matches_change_order: ${$(r.total)} vs approved ${$(approved)}`);
      }
      // the date: during the job (a week before it starts at most), never after today
      if (!r.date) flag("needs_fix", "the invoice's date can't be read; send a clearer photo or type the date", "invoice_no_date");
      else {
        const d = Date.parse(`${r.date}T12:00:00Z`), now = opts.now ?? Date.now();
        if (d > Math.max(now, Number.isFinite(to) ? to : now) + 36 * 36e5) flag("fail", `the invoice is dated ${r.date}, in the future`, `invoice_future: ${r.date}`);
        else if (Number.isFinite(from) && d < from - L.receiptEarlyDays * 864e5) flag("needs_fix", `the invoice is dated ${r.date}, more than a week before the job`, `invoice_old: ${r.date}`);
      }
      // the items: for this job or the change order's reason
      const pr = partsRelevance(r.items, job?.scope);
      const reasonWords = words(changeOrder?.reason), itemText = (r.items || []).join(" ").toLowerCase();
      const byReason = reasonWords.filter((w) => itemText.includes(w));
      if (byReason.length || pr.ok) signals.push(`invoice_items_match: ${[...byReason, ...(pr.matched || [])].slice(0, 4).join(", ")}`);
      else if (!(r.items || []).length) toPerson("the invoice's items can't be read; a person confirms they are this job's materials", "invoice_no_items");
      else flag("needs_fix", `the invoice lists ${(r.items || []).slice(0, 3).join(", ")}: nothing for this job or the change order ("${String(changeOrder?.reason || "").slice(0, 60)}")`, "invoice_unrelated");
      // the same invoice already advanced on another job, or on another change order of this one
      const hist = (opts.history || photoRows()).filter((h) => (h.kind === "receipt" || h.kind === "materials") && (h.jobId !== job?.id || (h.changeOrderId && h.changeOrderId !== changeOrder?.id)));
      const hit = hist.find((h) => (f.sha && h.sha === f.sha) || sameReceipt(r, h));
      if (hit) flag("needs_fix", `this invoice was already used ${hit.jobId !== job?.id ? `on another job (${hit.jobId})` : `for change order ${hit.changeOrderId}`}`, `invoice_reused: ~ ${hit.jobId}/${hit.changeOrderId || hit.evidenceId}`);
    }
  }

  // ---- the photo of the delivered materials ----------------------------------------------------------------------------
  let photo = null, describedBy = null;
  if (pic) {
    const f = facts.get(pic.id) || {}, ex = f.exif;
    photo = { evidenceId: pic.id, taken: ex?.taken || null, gps: ex?.gps || null, sees: null, describedBy: null };
    if (!ex || ex.kind !== "jpeg" || !ex.taken) flag("needs_fix", `${pic.id} has no capture time: send the original photo from the phone`, `no_exif_time: ${pic.id}`);
    else {
      const at = Date.parse(ex.taken), start = workStart(job);
      if (Number.isFinite(from) && Number.isFinite(to) && (at < from - L.slackMin * 6e4 || at > to + L.slackMin * 6e4)) flag("fail", `${pic.id} was taken ${when(at)}, outside the job window`, `exif_time_outside: ${pic.id}`);
      else if (start && at < start.at) flag("fail", `${pic.id} was taken ${when(at)}, before work started at ${when(start.at)}`, `exif_before_start: ${pic.id}`);
      else signals.push(`photo_time_ok: ${pic.id} ${ex.taken}`);
    }
    const here = job?.address && Number.isFinite(+job.address.lat) ? { lat: +job.address.lat, lng: +job.address.lng } : null;
    if (ex?.gps && here) { const d = km(ex.gps, here); if (d > L.gpsKm) flag("fail", `${pic.id} was taken ${d.toFixed(1)} km from the job: materials must be photographed on site`, `gps_far: ${pic.id}`); else signals.push(`photo_on_site: ${Math.round(d * 1000)} m`); }
    else toPerson(`${pic.id} has no location; a person confirms the materials are on site`, `no_gps: ${pic.id}`);
    // what the photo shows: the VLM describes it (never told what to expect); its words must name the materials
    if (opts.vlm !== false && vlmAvailable()) {
      const ds = await describePhoto(pic.path, { timeoutMs: opts.vlmTimeoutMs });
      if (ds.source === "model") {
        photo.sees = ds.sees; photo.describedBy = describedBy = ds.model;
        const look = `${(invoice?.items || []).join(" ")} ${changeOrder?.reason || ""}`;
        const named = words(look).filter((w) => ds.sees.toLowerCase().includes(w));
        if (looksLikeInstructions(ds.sees)) toPerson(`words in ${pic.id} try to instruct the checker; a person confirms`, `injection_in_image: ${pic.id}`);
        else if (named.length || relevance(ds.sees, job?.scope || {}).ok) signals.push(`photo_shows_materials: ${named.slice(0, 3).join(", ") || "this job's parts"}`);
        else toPerson(`the photo shows "${ds.sees.slice(0, 100)}", not clearly the materials; a person confirms`, "photo_materials_unclear");
        if (!ex?.camera) toPerson(`${pic.id} has no camera make or model (a drawn or edited image?); a person confirms`, `needs_person: synthetic_photo ${pic.id}`);
      } else toPerson(`no description of ${pic.id} (${ds.error || "VLM"}); a person confirms the materials`, "needs_person: no VLM description");
    } else toPerson("no photo model is running; a person confirms the materials in the photo", "needs_person: no VLM");
  }

  const decision = verdict === "fail" ? "review" : verdict === "needs_fix" ? "needs_fix" : person ? "review" : "advance";
  if (opts.remember !== false && job?.id && inv && facts.get(inv.id)?.receipt && !signals.some((s) => s.startsWith("invoice_reused"))) {
    rememberPhotos(job.id, [{ ...facts.get(inv.id), kind: "receipt" }], { changeOrderId: changeOrder?.id || null, use: "materials_advance" });
  }
  const attestation = verdictRecord({ jobId: job?.id || null, kind: "materials_advance", models: [describedBy], prompts: [],
    evidence: list.map((e) => ({ id: e.id, sha256: facts.get(e.id)?.sha || null })), answer: { decision, verdict, matchedTotal, changeOrder: changeOrder?.id || null } });
  return { verdict, decision, needsPerson: person, reasons, signals, invoice, approved, matchedTotal: decision === "advance" || decision === "review" ? matchedTotal : 0, difference, photo,
    source: describedBy ? "vlm" : "rules", ms: Date.now() - t0, attestation };
}
