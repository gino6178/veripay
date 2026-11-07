// The rules the platform falls back on when a model isn't there (ai.js): a scope written from templates, and a check
// of the evidence that only trusts what code can verify (file hashes, camera data, numbers on a receipt). Everything
// here is labelled source: "rules". The evidence/AI side's scope.js and check/index.js replace these when they load.
import { meters } from "./geo.js";
import { now as clockNow } from "./clock.js";

// ---- scope: what to do, and how each part will be checked -----------------------------------------------------------
// Multi-day jobs come with milestones: each with its own done-conditions (indexes into checks), share of the price,
// required documents and whether an inspector confirms it
const TEMPLATES = [
  { trade: "plumbing", match: /water heater.*(replace|new|install)|(replace|new|install).*water heater/i, title: "Replace the water heater", hours: 6, parts: 90000,
    items: ["Pull the permit", "Drain and remove the old heater", "Install the new heater, expansion tank and venting to code", "City inspection"],
    checks: [["Photo of the old heater before removal, with its label", "photo", "taken at the job address before work"], ["Photo of the area cleared and the new heater on site, label visible", "photo", "at the job address"],
      ["Photo of the new heater installed: connections, expansion tank, T&P valve and discharge pipe", "photo", "after the removal photo"], ["Photo of the new heater's label (model and serial)", "photo", "close-up"], ["Receipt for the heater and parts", "receipt", "matches the parts in the price and approved change orders"]],
    milestones: [{ title: "Permit, removal and the new heater on site", share: 0.4, checks: [0, 1], docs: [["permit", "the City of Austin plumbing permit"]] },
      { title: "Installed and inspected", share: 0.6, checks: [2, 3, 4], docs: [["inspection", "the passed inspection report (green tag)"]], inspect: true }] },
  { trade: "handyman", match: /bathroom.*(remodel|renovat|redo)|(remodel|renovat).*bathroom/i, title: "Remodel the bathroom", hours: 40, parts: 250000,
    items: ["Demolition and haul-away", "Rough-in and waterproofing", "Tile, fixtures and finish"],
    checks: [["Photos of the room after demolition: every wall and the floor", "photo", "8 to 15 photos, each wall labelled"], ["Photo of the dumpster or the haul-away receipt", "receipt", "dated during the job"],
      ["Photos of the waterproofing membrane on walls and floor, before tile", "photo", "close-ups of the corners and the drain"], ["Photos of the finished tile, vanity, toilet and shower", "photo", "8 to 15 photos"], ["Photo of the shower running and draining", "photo", "after the finish photos"], ["Receipt for tile and fixtures", "receipt", "matches the parts in the price and approved change orders"]],
    milestones: [{ title: "Demolition", share: 0.2, checks: [0, 1], docs: [["lien_waiver", "a partial lien waiver for the work paid so far"]] },
      { title: "Rough-in and waterproofing", share: 0.35, checks: [2], docs: [["permit", "the building permit (if the plumbing moves)"]], inspect: true },
      { title: "Tile, fixtures and finish", share: 0.45, checks: [3, 4, 5], docs: [["lien_waiver", "a final lien waiver"]] }] },
  { trade: "plumbing", match: /faucet|tap|drip|cartridge/i, title: "Fix the leaking faucet", hours: 1, parts: 3500,
    items: ["Find where the faucet leaks", "Replace the cartridge or the faucet", "Test for drips with the water on"],
    checks: [["Photo of the new cartridge or faucet installed", "photo", "a photo taken during the job, at the job address"],
      ["Photo under the sink with the water on for 10 minutes: no drips", "photo", "taken at the job address at least 10 minutes after the repair photo; after:c1>=10m"],
      ["Receipt for the parts", "receipt", "the receipt's total matches the parts in the price plus any approved change order"]] },
  { trade: "plumbing", match: /toilet|running|flush/i, title: "Fix the running toilet", hours: 1.25, parts: 2500,
    items: ["Find why the toilet runs", "Replace the flapper or fill valve", "Check the tank refills and stops"],
    checks: [["Photo of the new flapper or fill valve in the tank", "photo", "taken during the job at the job address"], ["Photo of the full tank, water still, after 10 minutes", "photo", "taken at least 10 minutes after the repair photo; after:c1>=10m"], ["Receipt for the parts", "receipt", "the total matches parts plus approved change orders"]] },
  { trade: "plumbing", match: /drain|clog|sink.*slow|backed/i, title: "Clear the clogged drain", hours: 1, parts: 0,
    items: ["Clear the drain", "Run water to confirm it drains"],
    checks: [["Photo of the drain opened or the clog removed", "photo", "taken during the job at the job address"], ["Photo of the sink draining with the water running", "photo", "taken after the first photo"], ["Note: what caused the clog", "note", "a note from the pro"]] },
  { trade: "plumbing", match: /water heater|hot water/i, title: "Repair the water heater", hours: 3, parts: 9000,
    items: ["Diagnose the water heater", "Replace the failed part", "Confirm hot water at a tap"],
    checks: [["Photo of the replaced part installed", "photo", "taken during the job"], ["Photo of the heater's label and the lit burner or status light", "photo", "taken after the repair"], ["Receipt for the parts", "receipt", "the total matches parts plus approved change orders"]] },
  { trade: "plumbing", match: /pipe|leak|plumb|water/i, title: "Fix the leak", hours: 2, parts: 4000,
    items: ["Find the leak", "Repair or replace the leaking section", "Run water and check it stays dry"],
    checks: [["Photo of the repaired section", "photo", "taken during the job at the job address"], ["Photo of the area dry with the water on for 10 minutes", "photo", "taken after the repair photo"], ["Receipt for the parts", "receipt", "the total matches parts plus approved change orders"]] },
  { trade: "cleaning", match: /deep clean|move.?out|move.?in/i, title: "Deep clean the home", hours: 5, parts: 0,
    items: ["Kitchen: counters, stovetop, inside the oven and fridge", "Bathrooms: tub, shower, toilet, mirrors", "Floors vacuumed and mopped"],
    checks: [["Photo of the kitchen after: counters and stovetop", "photo", "taken during the job at the job address"], ["Photo of each bathroom after", "photo", "taken during the job"], ["Photo of the floors after", "photo", "taken during the job"]] },
  { trade: "cleaning", match: /clean|maid|tidy|dust/i, title: "Clean the home", hours: 3, parts: 0,
    items: ["Kitchen counters and sink", "Bathrooms", "Floors vacuumed and mopped"],
    checks: [["Photo of the kitchen after", "photo", "taken during the job at the job address"], ["Photo of the bathroom after", "photo", "taken during the job"], ["Photo of the floors after", "photo", "taken during the job"]] },
  { trade: "handyman", match: /tv|mount/i, title: "Mount the TV", hours: 1.5, parts: 0,
    items: ["Find the studs", "Mount the bracket level", "Hang the TV and hide the cables"],
    checks: [["Photo of the bracket on the wall with a level on it", "photo", "taken during the job at the job address"], ["Photo of the TV mounted and on", "photo", "taken after the bracket photo"]] },
  { trade: "handyman", match: /assembl|ikea|furniture|desk|bed frame/i, title: "Assemble the furniture", hours: 2, parts: 0,
    items: ["Assemble the furniture", "Anchor it to the wall if it's tall", "Take away the packaging"],
    checks: [["Photo of the assembled furniture", "photo", "taken during the job at the job address"], ["Photo of the wall anchor (tall pieces) or a note why none was needed", "photo", "taken during the job"]] },
  { trade: "handyman", match: /drywall|hole|patch/i, title: "Patch the drywall", hours: 2, parts: 1500,
    items: ["Patch the hole", "Sand and prime", "Paint to match"],
    checks: [["Photo of the patch before painting", "photo", "taken during the job"], ["Photo of the finished wall", "photo", "taken after the first photo"], ["Receipt for materials", "receipt", "the total matches parts plus approved change orders"]] },
  { trade: "handyman", match: /door|hinge|lock|shelf|shelves|fix|repair|install/i, title: "Handyman repair", hours: 1.5, parts: 1500,
    items: ["Do the repair described", "Test that it works", "Clean up"],
    checks: [["Photo of the finished repair", "photo", "taken during the job at the job address"], ["Note: what was done", "note", "a note from the pro"]] },
];
export const TRADES = ["plumbing", "cleaning", "handyman"];
const GENERIC = { plumbing: "Fix the leak", cleaning: "Clean the home", handyman: "Handyman repair" };
export const templateFor = (text, trade = null) => TEMPLATES.find((t) => (!trade || t.trade === trade) && t.match.test(String(text || ""))) || TEMPLATES.find((t) => t.title === GENERIC[trade || "handyman"]);

const DAY = 864e5;
// "this week", "today", "tomorrow", "by Friday", "weekend": a window from now
function windowOf(text, nowMs) {
  const s = String(text || "").toLowerCase(), d = new Date(nowMs);
  const end = (days) => new Date(nowMs + days * DAY).toISOString();
  if (/today|asap|urgent|right now|emergency/.test(s)) return { from: d.toISOString(), to: end(1) };
  if (/tomorrow/.test(s)) return { from: d.toISOString(), to: end(2) };
  if (/weekend/.test(s)) { const toSat = (6 - d.getDay() + 7) % 7; return { from: end(toSat), to: end(toSat + 2) }; }
  if (/next week/.test(s)) return { from: end(7 - d.getDay() + 1), to: end(14 - d.getDay() + 1) };
  if (/this month/.test(s)) return { from: d.toISOString(), to: end(30) };
  return { from: d.toISOString(), to: end(7) };
}
// "$200", "200 dollars", "under 200", "budget 150"
export const budgetIn = (text) => { const m = String(text || "").match(/\$\s?(\d{2,5}(?:\.\d{2})?)|(\d{2,5})\s*(?:dollars|usd|bucks)\b|(?:under|below|max(?:imum)?|budget(?: of)?|up to|within)\s*\$?\s?(\d{2,5})/i); return m ? Math.round(+(m[1] || m[2] || m[3]) * 100) : null; };

export function rulesScope({ text, zip, budgetMax = null, now = clockNow(), trade = null } = {}) {
  const t = templateFor(text, trade), ceiling = budgetMax ?? budgetIn(text) ?? null;
  const checks = t.checks.map(([what, evidence, rule], i) => ({ id: `c${i + 1}`, what, evidence, rule, ...(evidence === "photo" ? { shots: shotsFor(what, rule) } : {}) }));
  const milestones = t.milestones ? t.milestones.map((m, i) => ({ id: `m${i + 1}`, title: m.title, share: m.share, checkIds: m.checks.map((k) => checks[k].id), docs: (m.docs || []).map(([kind, what]) => ({ kind, what })), inspect: !!m.inspect })) : null;
  return { title: t.title, trade: t.trade, items: t.items.slice(), checks, ...(milestones ? { milestones } : {}),
    priceCeiling: ceiling, window: windowOf(text, now), estimate: { hours: t.hours, parts: t.parts }, source: "rules" };
}

// what to shoot for a photo condition (parity #4): how many, which shots, close-ups, context
export function shotsFor(what, rule = "") {
  const m = `${what} ${rule}`.match(/(\d+)\s*(?:to|-)\s*(\d+)\s*photos/i);
  const labels = /every wall|each wall/i.test(what) ? ["north wall", "east wall", "south wall", "west wall", "floor", "ceiling"] : /label|model|serial/i.test(what) ? ["label close-up"] : ["wide shot showing the room", "close-up of the work"];
  return { min: m ? +m[1] : labels.length >= 2 ? 2 : 1, max: m ? +m[2] : 6, labels, closeUps: true, context: "include something that shows where it is (a fixture, a window, the room)" };
}
// required documents (parity #9): a permit, a lien waiver, an inspection report, an invoice, as far as code can read them
const DOC_WORDS = { permit: /permit/i, lien_waiver: /lien|waiver|release of lien/i, inspection: /inspect|green tag|approved|passed/i, invoice: /invoice|total/i, license: /licen[cs]e/i };
export const DOC_KINDS = Object.keys(DOC_WORDS);
export function docCheck(c, items) {
  const mine = items.filter((e) => e.checkId === c.id);
  if (!mine.length) return { id: c.id, verdict: "needs_fix", reason: `Upload ${c.what}.`, confidence: 0.95, signals: ["missing_document"] };
  const text = mine.map((e) => `${e.text || ""} ${e.name || ""}`).join(" ");
  if (looksLikeInstructions(text)) return { id: c.id, verdict: "fail", reason: "The document's text tries to instruct the checker.", confidence: 0.9, signals: ["injection"] };
  if (DOC_WORDS[c.doc] && !DOC_WORDS[c.doc].test(text)) return { id: c.id, verdict: "needs_fix", reason: `The file doesn't read as a ${c.doc.replace("_", " ")}: type its title and number.`, confidence: 0.75, signals: ["document_unread"] };
  return { id: c.id, verdict: "pass", reason: `A ${c.doc.replace("_", " ")} was uploaded and reads as one; a person can open it.`, confidence: 0.75, signals: ["document_present"] };
}
// the rules' gap review of an agreed scope (parity #20; reviewScope() from the AI side replaces it when it exists)
export function rulesScopeReview(job) {
  const s = job.scope || {}, gaps = [], add = (severity, what, suggestion) => gaps.push({ severity, what, suggestion });
  const ms = s.milestones?.length ? s.milestones : [{ title: s.title, checkIds: (s.checks || []).map((c) => c.id) }];
  for (const m of ms) {
    const cs = (s.checks || []).filter((c) => m.checkIds.includes(c.id));
    if (!cs.some((c) => c.evidence === "photo")) add("medium", `"${m.title}" has no photo condition`, "Add an after photo of the finished work.");
  }
  if ((job.agreed?.parts || s.estimate?.parts) > 0 && !(s.checks || []).some((c) => c.evidence === "receipt")) add("medium", "Parts are in the price but no receipt is asked for", "Add a parts receipt condition.");
  if (s.trade === "plumbing" && /water heater|gas line|sewer|repipe/i.test(`${s.title} ${(s.items || []).join(" ")}`) && !(s.checks || []).some((c) => c.doc === "permit")) add("high", "This plumbing work usually needs a City of Austin permit", "Add a permit document to the first milestone.");
  if ((job.agreed?.price || 0) >= 100000 && ms.length < 2) add("low", "A job this size is usually paid in milestones", "Split it into milestones, each with its own conditions.");
  return { gaps, ok: !gaps.some((g) => g.severity === "high"), source: "rules" };
}
// ---- check: what code can verify ---------------------------------------------------------------------------------------
// words that try to give instructions instead of describing the work (evidence is untrusted text: it is never obeyed,
// and this flags it so a person looks)
const INSTRUCTION = /(ignore|disregard|forget)\s+(all|any|the|your|previous|prior|above)|system\s*prompt|you are (now|an?)\b|(approve|release|pay)\s+(this|the|my|all|immediately|now|in full)|mark (all|every|this)\s+(checks?|conditions?)?\s*(as )?pass|override|jailbreak|as an ai/i;
export const looksLikeInstructions = (s) => INSTRUCTION.test(String(s || ""));
// the total on a receipt's text: the number after TOTAL, else the largest dollar amount
export function receiptTotal(text) {
  const s = String(text || "");
  const tot = [...s.matchAll(/(?:grand\s+)?total[^0-9$\n]{0,12}\$?\s?(\d{1,5}(?:,\d{3})*\.\d{2})/gi)].map((m) => +m[1].replace(/,/g, ""));
  if (tot.length) return Math.round(tot.at(-1) * 100);
  const all = [...s.matchAll(/\$\s?(\d{1,5}(?:,\d{3})*\.\d{2})/g)].map((m) => +m[1].replace(/,/g, ""));
  return all.length ? Math.round(Math.max(...all) * 100) : null;
}
// how close a receipt must be to what was approved: $5 or 10%
export const receiptSlack = (c) => Math.max(500, Math.round(c * 0.1));

let otherUse = () => null;
// jobs.js tells the rules where else a file was used (by its SHA-256)
export const setEvidenceIndex = (fn) => { otherUse = fn; };

export function rulesCheck(job, evidence) {
  const startedAt = Date.parse(job.agreed?.at || job.created), addr = job.address || {};
  const near = addr.precise ? 400 : 3000;
  const changes = (job.changeOrders || []).filter((c) => c.status === "approved");
  const changeTotal = changes.reduce((t, c) => t + c.amount, 0), partsAllowance = job.agreed?.parts ?? 0;
  const items = evidence.slice();
  const flagged = items.filter((e) => looksLikeInstructions(`${e.text || ""} ${e.name || ""}`));
  // what every file says about itself, once
  const fileSignals = new Map(items.map((e) => {
    const s = [], reasons = [];
    const other = e.sha ? otherUse(e.sha, job.id) : null;
    if (other) { s.push("reused_file"); reasons.push(`the same file was already used on job ${other}`); }
    if (e.kind === "photo") {
      const x = e.exif || {};
      if (!x.taken) s.push("no_exif_time");
      else {
        const t = Date.parse(x.taken), up = Date.parse(e.uploadedAt);
        if (t < startedAt - 3600e3) { s.push("exif_before_job"); reasons.push(`the photo was taken ${x.taken.slice(0, 16).replace("T", " ")}, before the job was agreed`); }
        else if (t > up + 10 * 60e3) { s.push("exif_after_upload"); reasons.push("the photo's camera time is after it was uploaded"); }
      }
      if (x.lat == null || x.lng == null) s.push("no_gps");
      else if (addr.lat != null) {
        const m = meters({ lat: x.lat, lng: x.lng }, { lat: addr.lat, lng: addr.lng });
        if (m > near) { s.push("gps_far"); reasons.push(`the photo was taken ${(m / 1609.344).toFixed(1)} miles from the job address`); }
      }
    }
    return [e.id, { signals: s, reasons }];
  }));
  const used = new Set();
  const checks = (job.scope?.checks || []).map((c) => {
    // the evidence for this condition: what was tagged with it, else the next unused item of its kind
    let mine = items.filter((e) => e.checkId === c.id && e.kind === c.evidence);
    if (!mine.length) { const e = items.find((x) => x.kind === c.evidence && !x.checkId && !used.has(x.id)); if (e) mine = [e]; }
    mine.forEach((e) => used.add(e.id));
    const signals = [...new Set(mine.flatMap((e) => fileSignals.get(e.id).signals))], bad = mine.flatMap((e) => fileSignals.get(e.id).reasons);
    if (!mine.length) return { id: c.id, verdict: "needs_fix", reason: `No ${c.evidence} was sent for: ${c.what}.`, confidence: 0.95, signals: ["missing"] };
    if (bad.length) return { id: c.id, verdict: "fail", reason: `${bad.join("; ")}.`, confidence: 0.9, signals };
    if (c.evidence === "receipt") {
      const total = mine.map((e) => receiptTotal(e.text)).find((x) => x != null);
      if (total == null) return { id: c.id, verdict: "needs_fix", reason: "The receipt's total couldn't be read: send a clearer photo, or type its total.", confidence: 0.8, signals: [...signals, "unreadable"] };
      const allowed = partsAllowance + changeTotal;
      if (changeTotal > 0 && Math.abs(total - changeTotal) > receiptSlack(changeTotal) && Math.abs(total - allowed) > receiptSlack(allowed))
        return { id: c.id, verdict: "fail", reason: `The receipt reads $${(total / 100).toFixed(2)}; the approved change orders come to $${(changeTotal / 100).toFixed(2)}.`, confidence: 0.85, signals: [...signals, "receipt_mismatch"] };
      if (changeTotal === 0 && allowed > 0 && total > allowed + receiptSlack(allowed))
        return { id: c.id, verdict: "fail", reason: `The receipt reads $${(total / 100).toFixed(2)}, more than the $${(allowed / 100).toFixed(2)} of parts in the price, with no change order approved.`, confidence: 0.8, signals: [...signals, "receipt_mismatch"] };
      return { id: c.id, verdict: "pass", reason: `Receipt total $${(total / 100).toFixed(2)} matches what was agreed.`, confidence: 0.85, signals };
    }
    if (c.evidence === "note") {
      const text = mine.map((e) => e.text || "").join(" ").trim();
      return text.length >= 8 ? { id: c.id, verdict: "pass", reason: "The pro wrote a note.", confidence: 0.75, signals } : { id: c.id, verdict: "needs_fix", reason: "The note is empty.", confidence: 0.9, signals: [...signals, "empty_note"] };
    }
    // a photo: the rules can't see what's in it, only that it is a new photo taken at the right time and place
    const conf = signals.includes("no_exif_time") || signals.includes("no_gps") ? 0.72 : 0.8;
    return { id: c.id, verdict: "pass", reason: `A ${signals.includes("no_exif_time") ? "photo with no camera data" : "photo taken during the job at the address"} was sent; the rules can't see what it shows.`, confidence: conf, signals };
  });
  if (flagged.length) for (const c of checks) c.signals = [...new Set([...c.signals, "injection"])];
  return { checks, decision: decide(checks), source: "rules", ...(flagged.length ? { note: `Text in ${flagged.length} evidence item(s) tried to instruct the checker; it was read as data and not followed.` } : {}) };
}

// The decision is code: all pass with enough confidence and nothing suspicious -> release; something to send again ->
// needs_fix; a failure, low confidence or text that tries to give instructions -> review (the customer decides).
export const MIN_CONFIDENCE = 0.7;
export function decide(checks) {
  if (!checks.length) return "review";
  if (checks.some((c) => c.verdict === "fail" || (c.signals || []).includes("injection"))) return "review";
  if (checks.some((c) => c.verdict === "needs_fix")) return "needs_fix";
  if (checks.some((c) => !(c.confidence >= MIN_CONFIDENCE))) return "review";
  return "release";
}
