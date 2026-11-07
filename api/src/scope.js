// Writing the scope: one sentence from an employer (or their agent) becomes a work order that is also the contract.
// Its done-conditions ("checks") say what evidence proves each one, and check/ later tests the evidence against them.
//
//   writeScope({ text, zip, budgetMax, now?, tz? }) ->
//     { title, trade, items, checks: [{ id, what, evidence, rule }], priceCeiling, window: { from, to },
//       source: "model" | "rules", ms, template, notes, flags, model? }
//
// Rules first: a template for the job (plumbing: leaky faucet, clogged drain, running toilet, water heater; cleaning;
// handyman: TV mount, furniture assembly, drywall patch; anything else gets a general handyman order). Then the model
// (Done-Chat, llm.js) may reword the title, items and checks and add at most two checks, inside ~4 s. Its reply is
// validated against a schema and merged: check ids, evidence kinds' rules, the price ceiling and the window always come
// from the rules, never from the model. If the model is slow, absent or sends something invalid, the rules' order is
// returned as is, labelled "rules".
import { z } from "zod";
import { chat, data, UNTRUSTED, modelStatus } from "./llm.js";
import { looksLikeInstructions } from "./fraud.js";
import { TZ, zoned, localDay, plusDays } from "./check/time.js";
import { codePrescreen } from "./codes.js";

export { TZ };

const EVIDENCE = ["photo", "receipt", "note"];

// Check ids are at most 12 characters ([\w-], the job store's limit).
// A rule is machine-checkable: ";"-separated tokens that check/rules.js reads.
//   photo>=N   at least N photos for this check; each taken inside the window, near the job, not reused
//   receipt>=N at least N receipts, read (OCR or model), dated in the window, totals matched to change orders
//   note>=N    at least N notes;   words>=W  a note of at least W words
const R = { photo: "photo>=1;in_window;near_job;not_reused", photo2: "photo>=2;in_window;near_job;not_reused", receipt: "receipt>=1;read;in_window;matches_change_orders", note: (w = 8) => `note>=1;words>=${w}` };
const c = (id, what, evidence, rule) => ({ id, what, evidence, rule: rule || (evidence === "note" ? R.note() : R[evidence]) });

// typical Austin prices are demo estimates (labelled in notes), used only when the employer gives no budget
export const TEMPLATES = [
  { id: "faucet", trade: "plumbing", match: /faucet|tap\b|spout|drip(s|ping)?\b.*(sink|kitchen|bath)|(sink|kitchen|bath).*drip/i, title: "Fix a leaking faucet", days: 3, ceiling: 25000,
    items: ["Find the source of the leak (cartridge, washer or O-ring)", "Replace the worn part with a matching one", "Test with the water back on"],
    checks: [c("before", "Photo of the faucet or the worn part before the repair", "photo"), c("new_part", "Photo of the new cartridge, washer or O-ring installed", "photo"),
      c("no_drip", "Photo of the faucet with the water on and no drip, at least 10 minutes after the repair", "photo"), c("receipt", "Receipt for the replacement parts", "receipt"),
      c("work_note", "Note naming the part replaced and anything else found", "note")] },
  { id: "disposal", trade: "plumbing", match: /disposal|disposer|garbage grinder|insinkerator/i, title: "Fix the garbage disposal", days: 3, ceiling: 35000,
    items: ["Find why the disposal is jammed, humming or leaking (reset, jam, seal or the unit)", "Free the jam or replace the disposal or its seal", "Run water and the disposal and check under the sink for leaks"],
    checks: [c("before", "Photo of the disposal under the sink before the repair", "photo"), c("repaired", "Photo of the disposal repaired or the new disposal installed under the sink", "photo"),
      c("running", "Photo under the sink with the disposal running and the water on, no leak, at least 5 minutes after the repair", "photo"), c("receipt", "Receipt for the replacement parts", "receipt"),
      c("work_note", "Note saying what was wrong with the disposal and what was done", "note")] },
  { id: "drain", trade: "plumbing", match: /clog|drain|backed up|won.?t drain|slow(ly)? drain|standing water/i, title: "Clear a clogged drain", days: 2, ceiling: 30000,
    items: ["Clear the clog (snake or auger; no harsh chemicals unless agreed)", "Flush and check the drain runs freely", "Clean up the work area"],
    checks: [c("before", "Photo of the blocked drain or standing water before the work", "photo"), c("cleared", "Photo of what was pulled out of the drain, or the opened trap", "photo"),
      c("draining", "Photo of the sink or tub draining freely with the water running, at least 5 minutes after the clog was cleared", "photo"),
      c("cleanup", "Photo of the work area cleaned up", "photo"), c("work_note", "Note saying what caused the clog and how it was cleared", "note")] },
  { id: "toilet", trade: "plumbing", match: /toilet|running water.*tank|flapper|fill valve/i, title: "Fix a running toilet", days: 3, ceiling: 25000,
    items: ["Find why the toilet keeps running (flapper, fill valve or chain)", "Replace the faulty part", "Check the tank refills and stops"],
    checks: [c("before", "Photo inside the tank before the repair", "photo"), c("new_part", "Photo of the new flapper or fill valve installed in the tank", "photo"),
      c("stopped", "Photo of the tank refilled and quiet, the water stopped at the fill line, at least 5 minutes after the repair", "photo"),
      c("receipt", "Receipt for the replacement parts", "receipt"), c("work_note", "Note naming the part replaced and confirming the tank stops filling", "note")] },
  { id: "water_heater", trade: "plumbing", match: /water heater|hot water|no hot|boiler|tank heater/i, title: "Replace a water heater", days: 5, ceiling: 220000,
    items: ["Drain and disconnect the old water heater", "Install the new unit with a discharge pipe on the relief valve", "Haul away the old unit", "Check for leaks and hot water at a tap"],
    checks: [c("old_unit", "Photo of the old water heater and its label before removal", "photo"), c("new_unit", "Photo of the new water heater installed, showing the relief-valve discharge pipe", "photo"),
      c("label", "Photo of the new unit's rating label (model, capacity)", "photo", `${R.photo};label`), c("unit_receipt", "Receipt for the new water heater and fittings", "receipt"),
      c("work_note", "Note on the permit (number or why none is needed) and the leak check", "note", R.note(10))] },
  { id: "tile", trade: "handyman", match: /\btiles?\b|grout|backsplash/i, title: "Repair cracked tile and grout", days: 4, ceiling: 40000,
    items: ["Find where water gets behind the tile and check the wall or floor under it", "Remove the cracked tiles and loose grout", "Set matching tiles and regrout", "Seal the grout and caulk the joints"],
    checks: [c("before", "Photo of the cracked tile and the damage before the repair", "photo"), c("substrate", "Photo of the wall or floor behind the removed tile, before new tile goes on", "photo"),
      c("tiled", "Photo of the new tile set and grouted", "photo"), c("sealed", "Photo of the finished tile, grout sealed and joints caulked, at least 30 minutes after the grout", "photo"),
      c("work_note", "Note saying what caused the water to get in and what was used (tile, grout, sealer)", "note")] },
  { id: "caulk", trade: "handyman", match: /caulk|sealant|silicone (around|along)/i, title: "Re-caulk the tub or shower", days: 3, ceiling: 25000,
    items: ["Remove the old caulk and clean the joint", "Let the joint dry, then lay a new bead of mildew-resistant caulk", "Leave it to cure before use"],
    checks: [c("before", "Photo of the old or moldy caulk before the work", "photo"), c("stripped", "Photo of the joint with the old caulk removed and cleaned", "photo"),
      c("caulked", "Photo of the new caulk bead, smooth and continuous", "photo"), c("work_note", "Note naming the caulk used and the cure time", "note")] },
  { id: "leak", trade: "plumbing", match: /\bleak(s|ing|ed|y)?\b|water (stain|spot|damage)|seep|wet (spot|wall|ceiling|floor)|damp/i, title: "Find and stop a water leak", days: 3, ceiling: 30000,
    items: ["Find where the water is coming from (supply line, drain, fixture or roof)", "Stop the leak at its source, or report what is needed", "Show the area dry with the water back on"],
    checks: [c("before", "Photo of the wet spot, stain or dripping water before the work", "photo"), c("source", "Photo of where the leak comes from", "photo"),
      c("dry", "Photo of the same area dry with the water back on, at least 30 minutes after the repair", "photo"), c("receipt", "Receipt for the replacement parts", "receipt"),
      c("work_note", "Note saying what caused the leak and what was done", "note")] },
  { id: "fan_light", trade: "handyman", match: /ceiling fan|\bfan\b|light fixture|chandelier|pendant light|\blights? (doesn.?t|won.?t|not)|(replace|install|hang) (a |the |new )?light/i, title: "Install a ceiling fan or light fixture", days: 3, ceiling: 30000,
    items: ["Turn off the breaker and check the box is rated for the fan or fixture", "Mount and wire the fan or fixture", "Restore power and test it (speeds, light, switch)"],
    checks: [c("before", "Photo of the old fixture or the ceiling box before the work", "photo"), c("box", "Photo of the ceiling box and its mounting bracket before the fixture goes up", "photo"),
      c("installed", "Photo of the fan or light fixture installed and working, switched on", "photo"),
      c("work_note", "Note saying the breaker was off, the box rating, and that the fan or light was tested", "note")] },
  { id: "door_lock", trade: "handyman", match: /\bdoors?\b|\blocks?\b|deadbolt|door ?knob|hinge|latch|strike plate/i, title: "Fix a door or lock", days: 3, ceiling: 25000,
    items: ["Find why the door or lock sticks, won't latch or won't lock", "Adjust or replace the hinge, strike, latch or lock", "Check the door closes, latches and locks smoothly"],
    checks: [c("before", "Photo of the door or lock before the work", "photo"), c("fixed", "Photo of the new or adjusted lock, latch or hinge on the door", "photo"),
      c("closed", "Photo of the door closed and latched or locked", "photo"), c("receipt", "Receipt for the replacement parts", "receipt"),
      c("work_note", "Note saying what was wrong with the door or lock and what was replaced", "note")] },
  { id: "smoke_alarm", trade: "handyman", match: /smoke (detector|alarm)|carbon monoxide|\bco (detector|alarm)|fire alarm|detector|chirp/i, title: "Install or replace smoke alarms", days: 3, ceiling: 20000,
    items: ["Replace or install the smoke alarms (and CO alarms) where needed", "Mount each alarm on the ceiling or high on the wall", "Press test on every alarm"],
    checks: [c("before", "Photo of the old alarm or the spot before the work", "photo"), c("installed", "Photo of each new smoke alarm mounted on the ceiling", "photo"),
      c("label", "Photo of the new alarm's label (model, date)", "photo", `${R.photo};label`),
      c("work_note", "Note listing the rooms with alarms and that each one was tested", "note")] },
  { id: "gutter", trade: "handyman", match: /gutter|downspout/i, title: "Clean the gutters", days: 4, ceiling: 30000,
    items: ["Clear leaves and debris from every gutter", "Flush the downspouts so water runs through", "Bag and haul away the debris"],
    checks: [c("before", "Photo of the full or clogged gutter before cleaning", "photo"), c("cleared", "Photo of the gutter cleared of leaves and debris", "photo"),
      c("flowing", "Photo of water running out of the downspout after flushing", "photo"), c("cleanup", "Photo of the debris bagged and the ground cleaned up", "photo"),
      c("work_note", "Note listing the gutters and downspouts cleaned and any damage found", "note")] },
  { id: "pressure_wash", trade: "cleaning", match: /pressure.?wash|power.?wash/i, title: "Pressure wash outdoor surfaces", days: 4, ceiling: 35000,
    items: ["Cover plants and outlets nearby", "Pressure wash the surfaces asked for (driveway, patio, deck, siding)", "Rinse the area and clear the runoff"],
    checks: [c("before", "Photo of the dirty driveway, patio, deck or siding before washing", "photo"), c("washed", "Photo of the same surface after pressure washing, clean", "photo"),
      c("cleanup", "Photo of the area rinsed and cleaned up", "photo"), c("work_note", "Note listing the surfaces washed and the area in square feet", "note")] },
  { id: "move_out", trade: "cleaning", match: /move.?out|move.?in clean|deep clean|end of (lease|tenancy)|deposit/i, title: "Deep clean for move-out", days: 3, ceiling: 50000,
    items: ["Kitchen: inside the fridge, oven and cabinets, counters and sink", "Bathrooms: toilet, shower or tub, sink, mirror, descaled", "Baseboards, doors, light switches and windowsills wiped", "Floors vacuumed and mopped in every room", "Trash taken out, the home left empty"],
    checks: [c("kitchen", "Photo of the kitchen after cleaning, with the oven and fridge open", "photo"), c("bathroom", "Photo of each bathroom after cleaning", "photo"),
      c("floors", "Photo of each empty room with the floors vacuumed and mopped", "photo"), c("work_note", "Note listing the rooms cleaned and anything that could not be done", "note")] },
  { id: "cleaning", trade: "cleaning", match: /clean|maid|move.?out|deep clean|tidy|housekeep/i, title: "Clean the home", days: 3, ceiling: 30000,
    items: ["Kitchen: counters, sink, stovetop, outside of appliances", "Bathrooms: toilet, shower or tub, sink, mirror", "Floors: vacuum and mop every room", "Take out the trash"],
    checks: [c("kitchen", "Photo of the kitchen after cleaning (counters, sink, stovetop)", "photo"), c("bathroom", "Photo of each bathroom after cleaning", "photo"),
      c("floors", "Photo of the floors after vacuuming and mopping", "photo"), c("work_note", "Note listing the rooms cleaned and anything that could not be done", "note")] },
  { id: "tv_mount", trade: "handyman", match: /\btv\b|television|mount.*(screen|tv)|wall.?mount/i, title: "Mount a TV on the wall", days: 3, ceiling: 25000,
    items: ["Find studs or use anchors rated for the TV's weight", "Mount the bracket level", "Hang the TV and tidy the cables"],
    checks: [c("bracket", "Photo of the bracket on the wall with a level on it, before the TV goes up", "photo"), c("mounted", "Photo of the TV mounted, level, with cables tidied", "photo"),
      c("work_note", "Note saying whether it went into studs or anchors, and their weight rating", "note")] },
  { id: "furniture", trade: "handyman", match: /assembl|ikea|furniture|bed frame|bookshel|dresser|desk|wardrobe/i, title: "Assemble furniture", days: 3, ceiling: 20000,
    items: ["Assemble the furniture per the maker's instructions", "Anchor tall pieces to the wall if supplied", "Remove the packaging"],
    checks: [c("assembled", "Photo of each piece assembled, in place", "photo"), c("anchored", "Photo of the wall anchor or tip-over strap on tall pieces (or a note that none applies)", "photo"),
      c("work_note", "Note listing the pieces assembled and any missing parts", "note")] },
  { id: "drywall", trade: "handyman", match: /drywall|sheetrock|hole in (the )?wall|patch|plaster/i, title: "Patch a drywall hole", days: 4, ceiling: 35000,
    items: ["Cut back and patch the damaged drywall", "Tape, mud and sand smooth", "Prime and paint to match"],
    checks: [c("before", "Photo of the damaged wall before the repair", "photo"), c("patched", "Photo of the patch sanded smooth before paint", "photo"),
      c("painted", "Photo of the finished wall, painted to match", "photo"), c("work_note", "Note on the paint used and the drying time", "note")] },
];
const GENERIC = { id: "handyman", trade: "handyman", title: "Handyman job", days: 3, ceiling: 30000, items: ["Do the work described", "Clean up the work area"],
  checks: [c("before", "Photo of the problem before the work", "photo"), c("after", "Photo of the finished work", "photo"), c("work_note", "Note describing what was done", "note")] };

export function pickTemplate(text) {
  const t = String(text || "");
  const tpl = TEMPLATES.find((x) => x.match.test(t)) || GENERIC;
  // several handyman jobs in one post ("hang three pictures and fix a squeaky door"): a template for only one of them
  // would drop the others, so it is a general order with an item per job (genericFromText)
  if (tpl !== GENERIC && tpl.trade === "handyman") {
    const jobs = t.split(/,|;|\band\b|\balso\b|\bplus\b/i).filter((x) => ACTION.test(x));
    if (jobs.length > 1 && jobs.some((x) => !TEMPLATES.some((y) => y.trade === "handyman" && y.match.test(x)))) return GENERIC;
  }
  return tpl;
}

// ---- a job no template fits: the order still says what the person asked for ----------------------------------------
// The object and the problem from the person's words ("the porch swing squeaks", "fix my mailbox post, it's leaning",
// "hang 3 shelves in the garage"), never "Do the work described".
const ACTION = /\b(fix|repair|replace|install|hang|remove|paint|build|put up|take down|assemble|mount|seal|adjust|tighten|level|unclog|clean|check|look at|inspect|move|haul|reattach|secure|rehang|patch)\b/i;
const PROBLEM = /\b(?:is |are |it'?s |keeps |not )?(broken|cracked|leaning|loose|wobbly|wobbles|squeaks?|squeaky|stuck|sticks|sagging|sags|falling|fell|bent|torn|ripped|peeling|rotted|rotten|rusted|rusty|dented|missing|leaking|leaks|dripping|noisy|rattles?|rattling|jammed|(?:won'?t|wont|doesn'?t|does not|will not) (?:open|close|shut|turn|work|stay|latch|stop)|not working|stopped working|damaged|worn|chipped|smells?|moldy|crooked)\b/i;
const FILLER = /\b(please|asap|today|tomorrow|this (week|weekend)|next week|soon|someone to|someone|a pro to|need(s|ed)? to|need(s|ed)?|can you|i want to|i want|looking for|help with|help|budget|under|about|around)\b/gi;
function clauses(text) {
  return String(text || "").replace(/\$\s?\d[\d,.]*k?/gi, " ").replace(/\b\d+\s*(dollars|bucks|usd)\b/gi, " ").split(/[.,;!?\n]|\band\b|\bbut\b/i)
    .map((x) => x.replace(FILLER, " ").replace(/\s+/g, " ").trim()).filter((x) => /[a-z]{3,}/i.test(x));
}
const cap = (x) => x.charAt(0).toUpperCase() + x.slice(1);
const COUNTED = /^(\d|a few|some|all|each|every|both|two|three|four|five|six)\b/i;
const STOP = /^(the|a|an|my|our|some|this|that|these|those|its|it|there|here|is|are|on|in|at|of|to|for)$/i;
function nounPhrase(x) {
  const w = String(x).replace(/[^a-z0-9' -]/gi, " ").split(/\s+/).filter(Boolean);
  while (w.length && STOP.test(w[0])) w.shift();
  while (w.length && STOP.test(w[w.length - 1])) w.pop();
  return w.slice(0, 6).join(" ").toLowerCase();
}
export function genericFromText(text) {
  const cs = clauses(text);
  let action = null, object = null, problem = null, from = null;
  for (const x of cs) {
    if (object && problem) break;
    const a = x.match(ACTION);
    if (a && !object) { action = a[1].toLowerCase(); object = nounPhrase(x.slice(a.index + a[0].length).replace(PROBLEM, " ")) || null; from = x; }
    const p = x.match(PROBLEM);
    // a problem belongs to the first job when it is in the same clause, or in a clause that is not another job
    if (p && !problem && (!object || from === x || !a)) { problem = p[1].toLowerCase(); if (!object) object = nounPhrase(x.slice(0, p.index)) || nounPhrase(x.slice(p.index + p[0].length)) || null; }
  }
  if (!object) {
    // no action and no problem named: the person's own words are the item, as they wrote them
    const said = (cs[0] || "").replace(/\s+/g, " ").trim().slice(0, 80);
    if (!said) return null;
    return { title: cap(said), items: [cap(said), "Show the finished result", "Clean up the work area"],
      checks: [c("before", `Photo before the work: ${said}`, "photo"), c("after", `Photo after the work: ${said}, finished`, "photo"), c("work_note", "Note describing what was done", "note")] };
  }
  if (!action) action = problem === "missing" ? "replace" : "fix";
  // more jobs in the same post: an item each, in the person's words
  const more = cs.filter((x) => ACTION.test(x)).slice(1, 4).map((x) => { const m = x.match(ACTION), o = nounPhrase(x.slice(m.index + m[0].length).replace(PROBLEM, " ")), p2 = x.match(PROBLEM);
    return o ? cap(`${m[1].toLowerCase()} ${COUNTED.test(o) ? "" : "the "}${o}${p2 ? ` (${p2[1].toLowerCase()})` : ""}`) : null; }).filter(Boolean);
  const thing = `${COUNTED.test(object) ? "" : "the "}${object}`;
  const first = cap(`${action} ${thing}`);
  return { title: (more.length ? `${first}, ${more[0].charAt(0).toLowerCase()}${more[0].slice(1).replace(/ \([^)]*\)$/, "")}${more.length > 1 ? " and more" : ""}` : first).slice(0, 80),
    items: [cap(`${action} ${thing}${problem ? ` (${problem})` : ""}`), ...more, more.length ? "Check each job is finished and working" : cap(`check ${thing} afterwards (${/clean|paint/.test(action) ? "finished" : "solid and working"})`), "Clean up the work area"],
    checks: more.length
      ? [c("before", `Photo of each job before the work (${[thing, ...more.map((x) => x.replace(/^\w+ /, "").replace(/ \([^)]*\)$/, ""))].join(", ")})`, "photo"), c("after", "Photo of each job after the work, finished", "photo"),
        c("work_note", "Note describing what was done for each job", "note")]
      : [c("before", `Photo of ${thing}${problem ? ` (${problem})` : ""} before the work`, "photo"), c("after", `Photo of ${thing} after the work, finished`, "photo"),
        c("work_note", `Note describing what was done to ${thing}`, "note")] };
}

// ---- the window, in Austin's local time ----
// The window opens at the posting time when the work can start now ("this week", "asap", "today", "soon", nothing said),
// inside working hours (7 am-9 pm Austin time: at night it opens at the next 7 am), and closes at 9 pm on the last day
// of the period asked for. "tomorrow" opens at 7 am tomorrow; "this weekend" at 7 am Saturday (or now, if it's Saturday).
export const DAY_START = 7, DAY_END = 21;
export function windowFor(text, { now = Date.now(), days = 3, tz = TZ } = {}) {
  const t = String(text || "").toLowerCase(), today = localDay(now, tz), iso = (ms) => new Date(ms).toISOString();
  const at = (d, h) => zoned(d.y, d.m, d.d, h, 0, tz), end = (d) => at(d, DAY_END);
  const nowMin = Math.floor(now / 6e4) * 6e4;
  // DONE_WORK_HOURS=any (the demo server): pros work any hour, so a job posted at night in Austin can be shown at once
  const anyHour = process.env.DONE_WORK_HOURS === "any";
  const open = anyHour ? nowMin : today.h < DAY_START ? at(today, DAY_START) : today.h >= DAY_END ? at(plusDays(today, 1, tz), DAY_START) : nowMin;
  const openDay = localDay(open, tz);
  if (/\btomorrow\b/.test(t)) { const d = plusDays(today, 1, tz); return { from: iso(at(d, DAY_START)), to: iso(end(d)), said: "tomorrow" }; }
  if (/\b(this )?weekend\b|\bsaturday\b/.test(t)) {
    const sat = today.wd === 6 && today.h < DAY_END ? today : plusDays(today, (6 - today.wd + 7) % 7 || 7, tz), sun = plusDays(sat, 1, tz);
    return { from: iso(Math.max(open, at(sat, DAY_START))), to: iso(end(sun)), said: "this weekend" };
  }
  if (/\b(today|tonight|right now|emergency)\b/.test(t)) return { from: iso(open), to: iso(Math.max(end(openDay), open + 2 * 36e5)), said: "today" };
  if (/\b(asap|urgent|soon|as soon as)\b/.test(t)) return { from: iso(open), to: iso(end(plusDays(openDay, 1, tz))), said: "as soon as possible (by tomorrow night)" };
  if (/\bthis week\b|\bby (the end of the week|friday|sunday)\b/.test(t)) {
    const sunday = plusDays(openDay, (7 - openDay.wd) % 7, tz);
    return { from: iso(open), to: iso(end(sunday)), said: "this week (by Sunday)" };
  }
  return { from: iso(open), to: iso(end(plusDays(openDay, days, tz))), said: `within ${days} days` };
}

// ---- a budget written in the text ----------------------------------------------------------------------------------
// "under $150", "$150 max", "no more than 150 bucks", "budget is $1,200", "up to $300", "$200 budget", "less than 150
// dollars", "max $90" -> cents. Only amounts tied to a budget word or a $/dollars/bucks unit count ("a 65 inch TV",
// "2 bed" don't). When several match, the smallest is the ceiling.
const MONEY_RE = /(\$\s?)?(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{1,2}))?(\s?k\b)?(\s?(?:dollars?|bucks|usd)\b)?/gi;
const CUE_BEFORE = /\b(under|below|less than|no more than|not more than|not over|at most|up to|max(imum)?|cap(ped)?( at)?|budget|spend|pay|within|around|about)\b[^.\d$]{0,20}$/i;
const CUE_AFTER = /^\s*(max(imum)?|tops|budget|or less|cap|limit|at most)\b/i;
const BUDGET_RIGHT_BEFORE = /\bbudget( is| of)?:?\s*$/i;
export function budgetFromText(text) {
  const t = String(text || ""), found = [];
  for (const m of t.matchAll(MONEY_RE)) {
    const before = t.slice(Math.max(0, m.index - 30), m.index), after = t.slice(m.index + m[0].length, m.index + m[0].length + 16);
    const money = !!m[1] || !!m[5];                          // "$150", "150 dollars", "150 bucks"
    const cue = CUE_BEFORE.test(before) || CUE_AFTER.test(after);
    // a bare number counts only right after "budget" ("budget: 1.5k"); "under 2 hours", "a 65 inch TV" don't
    // "$300" on its own in a list ("cracked tile, water seeping, $300") is what they'll pay; "a $300 TV" is not
    const alone = money && /(^|[.,;:(\-–—])\s*$/.test(before) && /^\s*([,.;)!\-–—]|$)/.test(after);
    if (!(money && (cue || alone)) && !BUDGET_RIGHT_BEFORE.test(before)) continue;
    let v = +`${m[2].replace(/,/g, "")}.${m[3] || "0"}`;
    if (m[4]) v *= 1000;
    if (v >= 10 && v <= 100000) found.push(Math.round(v * 100));
  }
  return found.length ? Math.min(...found) : null;
}

// ---- rules -----------------------------------------------------------------------------------------------------------
// ---- parts receipts only when parts are paid for ------------------------------------------------------------------------
// A receipt condition belongs in the order only when the price includes parts (or the job is the unit itself, like a
// water heater), or once a parts/materials change order is approved: otherwise the checker would have to waive it,
// which reads as a contradiction. writeScope({ parts: true }) keeps it; addPartsCondition() adds it later.
const PARTS_RECEIPT = new Set(["receipt"]); // the templates' parts-receipt conditions that depend on parts being paid for
export const partsReceipt = (why = "the parts") => ({ id: "receipt", what: `Receipt for ${why}, dated during the job`, evidence: "receipt", rule: R.receipt, ruleText: describeRule(R.receipt), addedFor: "parts" });
// a change order's reason, short enough for a condition: its first clause (before ";" or a parenthesis), else cut at a
// word with an ellipsis; never a cut mid-phrase like "with the )"
export function shortReason(s, max = 80) {
  const t = String(s || "").replace(/\s+/g, " ").trim(), first = t.split(/\s*[;(]\s*/)[0].replace(/[\s,.:-]+$/, "");
  if (first && first.length <= max) return first;
  const w = t.replace(/\([^)]*\)/g, "").replace(/\s+/g, " ").trim(), cut = w.slice(0, max + 1).replace(/\s+\S*$/, "").replace(/(\s+(with|and|or|the|a|an|of|to|for|in|on|at|by))+$/i, "").replace(/[\s,;:-]+$/, "");
  return w.length <= max ? w : `${cut}…`;
}
export function addPartsCondition(scope, { reason = null } = {}) {
  if (!scope || (scope.checks || []).some((c) => c.evidence === "receipt" && !c.doc)) return scope;
  const why = reason ? `the parts and materials (${shortReason(reason)})` : "the replacement parts";
  const out = { ...scope, checks: [...scope.checks, partsReceipt(why)], notes: [...(scope.notes || []), `A parts receipt is now a condition: ${reason ? `the change order "${shortReason(reason, 60)}" was approved` : "the price includes parts"}.`] };
  out.photoChecklist = photoChecklist(out);
  return out;
}
// the rule in plain words, one number: "At least 2 photos, taken during the job at the job address, not used on another job"
export function describeRule(rule) {
  const t = String(rule || "").split(";").map((x) => x.trim()).filter(Boolean), out = [];
  for (const x of t) {
    let m = x.match(/^(photo|receipt|note)>=(\d+)$/);
    if (m) { out.unshift(`At least ${m[2]} ${m[1]}${+m[2] === 1 ? "" : "s"}`); continue; }
    m = x.match(/^words>=(\d+)$/); if (m) { out.push(`at least ${m[1]} words`); continue; }
    m = x.match(/^after:([\w-]+)>=(\d+)m$/); if (m) { out.push(`taken at least ${m[2]} minutes after the "${m[1]}" photo`); continue; }
    m = x.match(/^progress>=(\d+)$/); if (m) { out.push(`showing at least ${m[1]}% done`); continue; }
    const W = { in_window: "taken during the job", near_job: "at the job address", not_reused: "not used on another job", read: "readable", matches_change_orders: "its total matching the approved change orders", label: "the label readable", code_only: "checked by code" };
    if (W[x]) out.push(W[x]);
  }
  return out.length ? out[0] + (out.length > 1 ? `, ${out.slice(1).join(", ")}` : "") : "";
}

export function rulesScope({ text, zip, budgetMax, now = Date.now(), tz = TZ, parts = false } = {}) {
  let tpl = pickTemplate(text);
  const notes = [], flags = [];
  // no template fits: the order is written from the person's own words (the object and the problem)
  if (tpl === GENERIC) { const g = genericFromText(text); if (g) tpl = { ...GENERIC, ...g }; }
  const given = Number.isFinite(+budgetMax) && +budgetMax > 0 ? Math.round(+budgetMax) : null;
  const written = given ? null : budgetFromText(text);
  const budget = given ?? written;
  if (written) notes.push(`Budget read from the description: $${(written / 100).toFixed(written % 100 ? 2 : 0)}.`);
  const priceCeiling = budget ?? tpl.ceiling;
  if (!budget) notes.push(`No budget given: the ceiling is a demo estimate for this kind of job in Austin ($${(tpl.ceiling / 100).toFixed(0)}).`);
  else if (budget < tpl.ceiling * 0.3) notes.push(`The budget ($${(budget / 100).toFixed(0)}) is low for this kind of job; pros may decline.`);
  if (zip && !/^\d{5}$/.test(String(zip))) notes.push("The ZIP code is not 5 digits.");
  if (looksLikeInstructions(text)) flags.push("injection: the description contains text that tries to instruct the system; it was treated as a description only");
  const { said, ...window } = windowFor(text, { now, days: tpl.days, tz });
  notes.push(`Window: ${said} (Austin time).`);
  const code = codePrescreen({ text, template: tpl.id, trade: tpl.trade, zip });
  const checks = tpl.checks.filter((x) => parts || !PARTS_RECEIPT.has(x.id)).map((x) => ({ ...x }));
  if (!parts && tpl.checks.some((x) => PARTS_RECEIPT.has(x.id))) notes.push("No parts receipt asked for yet: it is added when the agreed price includes parts or a parts change order is approved.");
  for (const a of code.addChecks) if (!checks.some((x) => x.id === a.id)) checks.push({ ...a });
  checks.splice(0, checks.length, ...withTimedRules(checks));
  if (code.permit === "required") notes.push(`Code pre-screen: a permit is required (${code.rules.map((r) => r.cite).join("; ")}). ${code.disclaimer}`);
  const spec = specFromText(text);
  for (const c of checks) c.ruleText = describeRule(c.rule);
  const out = { title: tpl.title, trade: tpl.trade, items: [...tpl.items], checks, priceCeiling, window, template: tpl.id, notes, flags, code, partsIncluded: !!parts, ...(spec ? { spec } : {}) };
  out.photoChecklist = photoChecklist(out);
  return out;
}

// ---- what the order specifies (matched against a product label later: labels.js matchSpec) ---------------------------
export function specFromText(text) {
  const t = String(text || ""), s = {};
  let m = t.match(/(\d{2,3})\s?-?\s?(?:gal|gallon)s?\b/i); if (m) s.capacityGal = +m[1];
  m = t.match(/\b(\d{1,3}(?:,\d{3})+|\d{4,6})\s?BTU/i); if (m) s.btu = +m[1].replace(/,/g, "");
  for (const b of ["A.O. Smith", "Bradford White", "Rheem", "Ruud", "Rinnai", "Navien", "Moen", "Delta", "Kohler", "Pfister"]) if (t.toLowerCase().includes(b.toLowerCase())) { s.brand = b; break; }
  return Object.keys(s).length ? s : null;
}

// ---- the photo checklist: what to shoot for each condition (PayKeeper-style capture guidance) -------------------------
//   photoChecklist(scope) -> { total, required, big, target, perCheck: [{ checkId, shots: [{ id, when: "before"|"after", framing:
//     "wide"|"close"|"label"|"context", say, required }] }] }
// Every photo condition gets a BEFORE shot of the same spot (unless it is itself the before shot), a wide AFTER shot
// that shows where it is (location context), and a close-up; new parts and units add a label shot. Big jobs (a water
// heater, anything with 5+ photo conditions) aim for 8-15 shots; small jobs require one photo per condition plus the
// BEFORE shot (3-5 photos) and list the other angles as optional.
const EXTRA = { water_heater: [["vent", "after", "context", "Venting or flue connection at the top of the new unit"], ["pan", "after", "close", "Drain pan and its drain line under the unit"], ["supply", "after", "close", "Water supply, shut-off valve and any expansion tank"], ["removed", "after", "context", "The old unit removed (truck or curb)"]],
  drywall: [["texture", "after", "close", "The patch in raking light, to show it is flat"]], tv_mount: [["level", "after", "close", "A level on top of the TV"], ["cables", "after", "close", "Cables hidden or tidied"]] };
// ---- timed conditions: "at least N minutes after ..." -> the rule token after:<id>>=Nm (the core enforces it from the
// photos' camera times). The reference is the condition the wording names (the repair, the clearing, the install), else
// the nearest earlier photo condition that isn't the BEFORE shot, else the BEFORE shot.
const UNIT = { m: 1, min: 1, mins: 1, minute: 1, minutes: 1, h: 60, hr: 60, hrs: 60, hour: 60, hours: 60 };
export function timedRule(check, checks) {
  const m = String(check.what || "").match(/\b(\d{1,3})\s*(minutes?|mins?|m|hours?|hrs?|h)\b[^.]{0,40}?\bafter\b\s*(?:the\s+)?([a-z -]{0,40})/i);
  if (!m || check.evidence !== "photo") return null;
  const minutes = +m[1] * (UNIT[m[2].toLowerCase()] || 1), named = m[3].toLowerCase();
  const earlier = checks.slice(0, checks.indexOf(check)).filter((c) => c.evidence === "photo");
  const by = (re) => earlier.find((c) => !/^(before|old_unit)$/.test(c.id) && re.test(`${c.id} ${c.what}`));
  const ref = (/repair|fix|install|replac|part/.test(named) && by(/new_part|new_unit|installed|replaced|repair/i)) || (/clear|clog|snak/.test(named) && by(/cleared|clog|pulled|trap/i))
    || [...earlier].reverse().find((c) => !/^(before|old_unit)$/.test(c.id)) || earlier.find((c) => /^(before|old_unit)$/.test(c.id));
  return ref ? `after:${ref.id}>=${minutes}m` : null;
}
export function withTimedRules(checks) {
  return checks.map((c) => { const t = timedRule(c, checks); return t && !String(c.rule || "").includes(t) ? { ...c, rule: `${c.rule || ""};${t}`.replace(/^;/, "") } : c; });
}

export function photoChecklist(scope) {
  const photoChecks = (scope.checks || []).filter((c) => c.evidence === "photo");
  const big = scope.template === "water_heater" || photoChecks.length >= 5, hasBefore = photoChecks.some((c) => /^(before|old_unit)$/.test(c.id));
  let firstBefore = 0; // a small job with no BEFORE condition still needs one BEFORE shot
  const perCheck = photoChecks.map((c) => {
    const isBefore = /^(before|old_unit)$/.test(c.id), shots = [];
    const sh = (id, when, framing, say, required = true) => shots.push({ id: `${c.id}.${id}`, when, framing, say, required });
    if (isBefore) { sh("wide", "before", "wide", `Before work starts, step back 2 m: ${c.what.replace(/^Photo of /i, "")}, with the room around it`); sh("close", "before", "close", "Close-up of the problem (the leak, the damage, the old part)", big); }
    else {
      // a small job asks for one photo per condition (plus the BEFORE shot); the extra angles are suggestions
      if (!/^(permit|label)$/.test(c.id)) sh("before", "before", "wide", "Before work starts: the same spot, from where the after photo will be taken", !hasBefore && (big || !(firstBefore++)));
      sh("wide", "after", c.id === "permit" ? "close" : "wide", c.what);
      if (c.id !== "permit") sh("close", "after", "close", "Close-up of the finished detail", big);
      if (/new|unit|part|label|mounted|installed/i.test(`${c.id} ${c.what}`)) sh("label", "after", "label", "The product label or model plate, readable", c.id === "label" || big);
    }
    return { checkId: c.id, shots };
  });
  for (const [id, when, framing, say] of EXTRA[scope.template] || []) perCheck.push({ checkId: null, shots: [{ id: `extra.${id}`, when, framing, say, required: false }] });
  const total = perCheck.reduce((n, x) => n + x.shots.length, 0), required = perCheck.reduce((n, x) => n + x.shots.filter((s) => s.required).length, 0);
  return { total, required, big, target: big ? "8-15 photos" : `${Math.min(required, 5)}-5 photos`, perCheck };
}

// ---- the model's refinement ------------------------------------------------------------------------------------------
const Refine = z.object({
  title: z.string().min(3).max(80),
  items: z.array(z.string().min(3).max(160)).min(1).max(8),
  checks: z.array(z.object({ id: z.string(), what: z.string().min(8).max(200) })).max(12),
  extra: z.array(z.object({ what: z.string().min(8).max(200), evidence: z.enum(EVIDENCE) })).max(2).optional().default([]),
});
const SCHEMA = { type: "object", required: ["title", "items", "checks", "extra"], properties: {
  title: { type: "string" }, items: { type: "array", items: { type: "string" } },
  checks: { type: "array", items: { type: "object", required: ["id", "what"], properties: { id: { type: "string" }, what: { type: "string" } } } },
  extra: { type: "array", items: { type: "object", required: ["what", "evidence"], properties: { what: { type: "string" }, evidence: { type: "string", enum: EVIDENCE } } } } } };

export function refineMessages(draft, text) {
  const sys = `You write work orders for VeriPay, where a US homeowner hires a local pro and pays only when the pro's evidence proves each done-condition. ${UNTRUSTED}\n` +
    "Given the homeowner's description and a draft order, reply in JSON: title (short, specific to their problem), items (the work, plain English), " +
    "checks (the draft's checks, same ids, each 'what' reworded to fit this job: say exactly what the photo, receipt or note must show), " +
    "extra (0-2 more checks only if this job clearly needs them, each with evidence photo, receipt or note). Do not mention prices, dates or payment.";
  const d = { title: draft.title, items: draft.items, checks: draft.checks.map(({ id, what, evidence }) => ({ id, what, evidence })) };
  return [{ role: "system", content: sys }, { role: "user", content: `${data("Homeowner's description", text, 600)}\nDraft order (from rules):\n${JSON.stringify(d)}` }];
}

// merge a validated refinement into the rules' draft; returns null when nothing usable came back
export function mergeRefinement(draft, raw) {
  const p = Refine.safeParse(raw);
  if (!p.success) return null;
  const r = p.data, byId = new Map(r.checks.map((x) => [x.id, x.what.trim()]));
  if (looksLikeInstructions(JSON.stringify(r))) return null; // a reply echoing orders is not a work order
  const checks = draft.checks.map((x) => (byId.has(x.id) ? { ...x, what: byId.get(x.id) } : x));
  const used = new Set(checks.map((x) => x.id));
  r.extra.filter((e) => e.evidence !== "receipt" || draft.partsIncluded).forEach((e, i) => { let id = `extra_${i + 1}`; while (used.has(id)) id += "x"; used.add(id); checks.push(c(id, e.what.trim(), e.evidence)); });
  return { ...draft, title: r.title.trim(), items: r.items.map((s) => s.trim()), checks: withTimedRules(checks.map((x) => ({ ...x, rule: String(x.rule || "").split(";").filter((t) => !/^after:/.test(t)).join(";") }))).map((x) => ({ ...x, ruleText: describeRule(x.rule) })) };
}

// ---- the trained Done-Chat's order (ml/prompts.mjs: { t, tr, i, c: [{ id, e, w }], p, f, to }) --------------------------
let mlp;
export async function mlPrompts() {
  if (mlp !== undefined) return mlp;
  try { mlp = await import(new URL("../../ml/prompts.mjs", import.meta.url).href); } catch { mlp = null; }
  return mlp;
}
const localDate = (ms, tz = TZ) => { const d = localDay(ms, tz); return `${d.y}-${String(d.m).padStart(2, "0")}-${String(d.d).padStart(2, "0")}`; };
const Trained = z.object({ t: z.string().min(3).max(100), tr: z.string().optional(), i: z.array(z.string().min(2).max(200)).min(1).max(10),
  c: z.array(z.object({ id: z.string().min(1).max(40), e: z.enum(EVIDENCE), w: z.string().min(5).max(240) })).min(1).max(8) }).passthrough();
// The model writes the order; code keeps what money depends on: the price ceiling and window (rules'), each check's
// machine-checkable rule (from its evidence kind; the model's sentence is kept as ruleText), the BEFORE photo when the
// template has one, and the conditions the code pre-screen requires (permit, licence).
export function mergeTrained(draft, raw, ml) {
  const p = Trained.safeParse(raw);
  if (!p.success || looksLikeInstructions(JSON.stringify(p.data))) return null;
  const o = p.data, used = new Set();
  // a receipt condition only when the order's parts are paid for (the rules' draft says so): see addPartsCondition
  const partsOk = draft.partsIncluded || draft.checks.some((d) => d.evidence === "receipt" && !d.doc);
  const checks = o.c.filter((c) => c.e !== "receipt" || partsOk).map((c) => {
    // ids fit the job store's 12 characters by dropping leading words ("faucet_no_drip" -> "no_drip"), then cutting
    let parts = c.id.toLowerCase().replace(/[^a-z0-9_-]/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "").split("_");
    while (parts.length > 1 && parts.join("_").length > 12) parts = parts.slice(1);
    let id = parts.join("_").slice(0, 12) || "c";
    while (used.has(id)) id = `${id.slice(0, 10)}_${used.size}`;
    used.add(id);
    return { id, what: c.w.trim(), evidence: c.e, rule: c.e === "note" ? R.note() : R[c.e] };
  });
  const before = draft.checks.find((c) => /^(before|old_unit)$/.test(c.id));
  if (before && !checks.some((c) => c.evidence === "photo" && /before|old/i.test(`${c.id} ${c.what}`))) checks.unshift({ ...before });
  for (const a of draft.code?.addChecks || []) if (!checks.some((c) => c.id === a.id)) checks.push({ ...a });
  const trade = ["plumbing", "cleaning", "handyman", "electrical", "other"].includes(o.tr) ? o.tr : draft.trade;
  const notes = [...draft.notes];
  if (Number.isInteger(o.p) && o.p !== draft.priceCeiling) notes.push(`The model read a price of $${(o.p / 100).toFixed(0)}; the ceiling stays $${(draft.priceCeiling / 100).toFixed(0)} (the budget given, or the rules' reading).`);
  const out = { ...draft, title: o.t.trim(), trade, items: o.i.map((s) => s.trim()), checks: withTimedRules(checks).map((c) => ({ ...c, ruleText: describeRule(c.rule) })), notes };
  out.photoChecklist = photoChecklist(out);
  return out;
}

// The instant order: writeScope() waits for Done-Chat only DONE_MODEL_TIMEOUT_MS (4 s); the served done-chat writes a
// whole order in about 8-10 s on the CPU, so the instant answer is usually the rules' order (labelled "rules", with
// refinable: true). refineScope() is the same call with a longer budget (DONE_SCOPE_REFINE_TIMEOUT_MS, 25 s) for the
// core to run in the background and swap in while the order is still a draft. Either way code keeps the price ceiling,
// the window, each condition's rule, the BEFORE photo and the permit/licence conditions.
// The scope writer's own timeout (DONE_SCOPE_TIMEOUT_MS, 12 s): not the general DONE_MODEL_TIMEOUT_MS (4 s), which a
// whole order from Done-Chat on the CPU doesn't fit in. The background refine gets at least as long (25 s), and one
// retry when the model was busy or slow and the budget still allows it.
export const scopeTimeoutMs = () => +(process.env.DONE_SCOPE_TIMEOUT_MS || 12000);
export const refineTimeoutMs = () => Math.max(+(process.env.DONE_SCOPE_REFINE_TIMEOUT_MS || 25000), scopeTimeoutMs());
export async function refineScope(input = {}) {
  const budget = input.timeoutMs ?? refineTimeoutMs(), t0 = Date.now();
  const r = await writeScope({ ...input, timeoutMs: budget });
  const left = budget - (Date.now() - t0);
  if (r.source !== "model" && r.refinable && /busy|503|timed out|timeout|no answer|abort/i.test(r.notes?.at(-1) || "") && left > 5000) {
    const again = await writeScope({ ...input, timeoutMs: left });
    return { ...again, retried: true };
  }
  return r;
}
export async function writeScope({ text, zip, budgetMax, now, tz, timeoutMs, parts } = {}) {
  const t0 = Date.now();
  const draft = rulesScope({ text, zip, budgetMax, now, tz, parts });
  if (!String(text || "").trim()) return { ...draft, source: "rules", ms: Date.now() - t0 };
  // the prompt Done-Chat was trained on (ml/prompts.mjs scopeMessages), unless DONE_SCOPE_PROMPTS=app (the refine prompt)
  const ml = (process.env.DONE_SCOPE_PROMPTS || "ml") === "ml" ? await mlPrompts() : null;
  const q = ml?.scopeMessages ? { ...ml.scopeMessages(String(text).slice(0, 600), { today: localDate(now ?? Date.now(), tz), address: zip ? `Austin, TX ${zip}` : null }), maxTokens: 400 } : { messages: refineMessages(draft, text), schema: SCHEMA, maxTokens: 500 };
  const r = await chat(q.messages, { json: true, schema: q.schema, timeoutMs: timeoutMs ?? scopeTimeoutMs(), maxTokens: q.maxTokens, purpose: "scope" });
  if (r.source === "model") {
    const merged = r.json && ("t" in r.json || "c" in r.json) ? mergeTrained(draft, r.json, ml) : mergeRefinement(draft, r.json);
    if (merged) { merged.photoChecklist = photoChecklist(merged); return { ...merged, source: "model", ms: Date.now() - t0, model: r.model }; }
    return { ...draft, source: "rules", ms: Date.now() - t0, notes: [...draft.notes, "The model's wording was not valid for a work order; the rules' order is used."] };
  }
  // the same status /api/models/status reports (llm.js modelStatus), without a probe so the order isn't delayed
  const st = await modelStatus({ probe: false });
  return { ...draft, source: "rules", ms: Date.now() - t0, ...(st.configured ? { refinable: true } : {}), notes: [...draft.notes, `Model not used: ${r.error || "unavailable"} (${st.reason}).`], model: { configured: st.configured, url: st.url, model: st.model, reason: st.reason } };
}
