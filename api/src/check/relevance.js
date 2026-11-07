// Is the evidence about this job, and does it say what the condition asks? Code, so a model's "pass" can be vetoed:
//   noteRequirements(check, scope) -> [{ id, say, test(text) -> boolean }]   what a note must contain for this condition
//   topicOf(text) -> { templates: Set, hits: { template: [words] } }           which kind of job the words are about
//   relevance(text, scope) -> { ok: boolean|null, own: [words], other: { template, words } | null }
// A note or receipt whose words are about another kind of job (a "corroded shut-off valve" on a clogged-drain job) and
// not about this one is off-topic. A condition that names something checkable (a licence number, the cause, the part,
// a weight rating, a permit number) needs that thing in the note: a model's pass doesn't stand without it.

import { PERMIT_NUMBER } from "../docs.js";
import { pickTemplate } from "../scope.js";

// strong words per job type (the templates in scope.js); shared words (sink, tank, water, pipe) are left out
export const TOPIC = {
  faucet: ["faucet", "tap", "spout", "cartridge", "aerator", "o-ring", "oring", "washer", "handle", "shut-off valve", "shutoff valve", "shut off valve", "stop valve", "supply line", "drip", "dripping"],
  drain: ["drain", "drains", "clog", "clogged", "clogs", "snake", "snaked", "auger", "p-trap", "trap", "hair", "grease", "wipes", "roots", "stopper", "plunger", "cleanout", "blockage", "blocked", "standing water", "slow drain", "buildup", "build-up", "soap scum", "food"],
  toilet: ["toilet", "flapper", "fill valve", "flush", "chain", "wax ring", "bowl", "running"],
  water_heater: ["water heater", "anode", "thermostat", "relief valve", "t&p", "expansion tank", "gas valve", "heating element", "burner", "flue", "vent", "gallon", "pilot"],
  cleaning: ["clean", "cleaned", "vacuum", "vacuumed", "mop", "mopped", "dust", "dusted", "stovetop", "counters", "scrubbed", "trash", "bathroom", "kitchen"],
  tv_mount: ["tv", "television", "mount", "mounted", "bracket", "stud", "studs", "anchor", "anchors", "lag", "level", "cables", "wall plate"],
  furniture: ["assemble", "assembled", "assembly", "dresser", "desk", "shelf", "shelves", "bed frame", "wardrobe", "drawer", "drawers", "cam lock", "dowel", "tip-over", "strap"],
  drywall: ["drywall", "sheetrock", "patch", "patched", "hole", "mud", "joint compound", "mesh", "tape", "taped", "sand", "sanded", "primer", "primed", "texture"],
  disposal: ["disposal", "garbage disposal", "disposer", "insinkerator", "flywheel"],
  tile: ["tile", "tiles", "grout", "regrout", "thinset", "backsplash", "backer board", "cement board"],
  caulk: ["caulk", "caulking", "recaulk", "silicone bead"],
  leak: ["water stain", "wet spot", "seeping", "water damage", "moisture meter"],
  fan_light: ["ceiling fan", "fan blade", "fan blades", "light fixture", "chandelier", "ceiling box", "light kit", "downrod"],
  door_lock: ["deadbolt", "door knob", "doorknob", "lockset", "strike plate", "door hinge", "door frame", "jamb"],
  smoke_alarm: ["smoke alarm", "smoke detector", "co alarm", "carbon monoxide", "chirp", "chirping"],
  gutter: ["gutter", "gutters", "downspout", "downspouts", "gutter guard"],
  pressure_wash: ["pressure wash", "pressure washed", "power wash", "power washed", "driveway", "siding"],
  move_out: ["move-out", "move out", "deep clean", "baseboards", "windowsills"],
};
// parts a receipt or a "name the part" note would list, per job type
export const PARTS = {
  faucet: ["cartridge", "washer", "o-ring", "oring", "aerator", "stem", "seat", "spring", "faucet", "handle", "valve", "supply line", "plumber tape", "teflon"],
  drain: ["drain", "snake", "auger", "p-trap", "trap", "stopper", "cleaner", "enzyme", "plunger", "tailpiece", "slip nut", "washer", "zip-it", "cable"],
  toilet: ["flapper", "fill valve", "flush valve", "chain", "wax ring", "toilet", "handle", "bolts", "supply line"],
  water_heater: ["water heater", "heater", "anode", "thermostat", "relief valve", "t&p", "expansion tank", "gas connector", "flex", "nipple", "dielectric", "pan", "vent", "element", "supply line", "fittings"],
  cleaning: ["cleaner", "spray", "sponge", "microfiber", "bags", "bleach", "mop", "towels"],
  tv_mount: ["mount", "bracket", "anchor", "lag", "bolts", "screws", "cable", "hdmi", "wall plate", "toggle"],
  furniture: ["screws", "anchor", "strap", "dowel", "hardware", "bracket"],
  drywall: ["drywall", "patch", "mesh", "joint compound", "spackle", "tape", "primer", "paint", "sanding", "sponge", "texture"],
  disposal: ["disposal", "garbage disposal", "disposer", "insinkerator", "sink flange", "mounting ring", "discharge tube", "dishwasher kit", "power cord", "gasket"],
  tile: ["tile", "grout", "thinset", "mortar", "sealer", "spacers", "backer board", "cement board", "trowel", "caulk"],
  caulk: ["caulk", "silicone", "sealant", "caulk gun", "remover", "mineral spirits"],
  leak: ["supply line", "compression fitting", "fitting", "pipe", "coupling", "sharkbite", "valve", "washer", "plumber tape", "teflon", "sealant"],
  fan_light: ["ceiling fan", "fan", "light fixture", "fixture", "fan brace", "ceiling box", "wire nuts", "bulbs", "downrod", "light kit"],
  door_lock: ["deadbolt", "lock", "lockset", "knob", "handle", "latch", "strike plate", "hinge", "screws", "weatherstrip"],
  smoke_alarm: ["smoke alarm", "smoke detector", "co alarm", "detector", "batteries", "battery", "mounting plate"],
  gutter: ["gutter guard", "gutter", "downspout", "sealant", "bags", "hangers", "screws"],
  pressure_wash: ["degreaser", "detergent", "cleaner", "surface cleaner", "bleach"],
  move_out: ["cleaner", "degreaser", "oven cleaner", "microfiber", "sponge", "bags", "bleach", "mop"],
};
const norm = (s) => ` ${String(s || "").toLowerCase().replace(/[^a-z0-9&-]+/g, " ").replace(/\s+/g, " ")} `;
const has = (t, w) => t.includes(` ${w} `);
export function topicOf(text) {
  const t = norm(text), hits = {};
  for (const [k, ws] of Object.entries(TOPIC)) { const h = ws.filter((w) => has(t, w)); if (h.length) hits[k] = h; }
  return { templates: new Set(Object.keys(hits)), hits };
}
// the scope's own words count as on-topic too (a general handyman order is about whatever its items say)
const scopeWords = (scope) => (norm(`${scope?.title || ""} ${(scope?.items || []).join(" ")}`).match(/[a-z][a-z-]{3,}/g) || []).filter((w) => !/^(with|from|that|this|work|area|after|before|photo|note|clean|replace|check|test|back)$/.test(w));
// The job's own kinds: its template when the scope has one, the scope writer's reading of its title and items when it
// doesn't (a model- or customer-written order has template null), and every job type its title names
// ("Fix the leaking faucet" is faucet work, so "spout", "tap", "cartridge" are its own words, never another job's).
export function ownTemplates(scope) {
  if (scope?.template) return new Set([scope.template]);
  const words = `${scope?.title || ""} ${(scope?.items || []).join(" ")}`, own = new Set();
  const picked = pickTemplate(words).id;
  if (picked && picked !== "handyman") own.add(picked);
  // a title is the job in the customer's words: every job type it names is this job's own (not the checks' wording,
  // where a water heater's "shut-off valve" or "drip pan" would make faucet words its own)
  for (const k of Object.keys(topicOf(scope?.title || "").hits)) own.add(k);
  return own;
}
export function relevance(text, scope) {
  const mine = ownTemplates(scope), t = norm(text);
  if (!String(text || "").trim()) return { ok: null, own: [], other: null };
  const { hits } = topicOf(text);
  const own = [...new Set([...[...mine].flatMap((k) => hits[k] || []), ...scopeWords(scope).filter((w) => has(t, w))])];
  const others = Object.entries(hits).filter(([k]) => !mine.has(k)).sort((a, b) => b[1].length - a[1].length);
  if (own.length) return { ok: true, own, other: null };
  if (others.length) return { ok: false, own, other: { template: others[0][0], words: others[0][1] } };
  return { ok: null, own, other: null };
}
export function partsRelevance(items, scope) {
  const mine = [...ownTemplates(scope)].filter((k) => PARTS[k]), list = (items || []).map((x) => norm(x));
  if (!list.length || !mine.length) return { ok: null, matched: [], other: null };
  const matched = list.filter((t) => mine.some((k) => PARTS[k].some((w) => has(t, w))) || scopeWords(scope).some((w) => has(t, w)));
  if (matched.length) return { ok: true, matched: matched.map((x) => x.trim()), other: null };
  const other = Object.entries(PARTS).filter(([k]) => !mine.includes(k)).map(([k, ws]) => [k, list.filter((t) => ws.some((w) => has(t, w)))]).sort((a, b) => b[1].length - a[1].length)[0];
  return { ok: false, matched: [], other: other && other[1].length ? { template: other[0], items: other[1].map((x) => x.trim()) } : null };
}

// ---- what a note must contain, from the condition's wording ----------------------------------------------------------
export const TSBPE = /\b(?:RMP|MPL|MP|M|J|T|A|PI|RPI|WSPS|RGI)[- ]?\d{4,6}\b/i;          // Texas plumbing licences: M-12345, J-12345, RMP-12345
const LICENCE_NUMBER = /\b(?:licen[cs]e|lic\.?|tsbpe|tdlr)\s*(?:#|no\.?|number)?\s*[:#]?\s*[A-Z]{0,4}[- ]?\d{4,8}\b/i;
const CAUSE = /\b(because|caused by|cause (was|is)|due to|from (a|an|the|built|years)|was (a |an )?[a-z ]{0,20}(clog|buildup|build-up|blockage|corrosion)|blocked by|clogged (with|by)|full of|hair|grease|wipes|roots|food|soap scum|debris|buildup|build-up|mineral|corroded|corrosion|worn|cracked|broken|loose|sediment)\b/i;
const NUM_LB = /\b\d{2,3}\s?(lb|lbs|pounds?)\b/i;
export function noteRequirements(check, scope) {
  const w = `${check.id} ${check.what}`.toLowerCase(), tpl = scope?.template || [...ownTemplates(scope)].find((k) => PARTS[k]) || null, req = [];
  if (/licen[cs]e|tsbpe|tdlr/.test(w)) {
    const plumbing = scope?.trade === "plumbing" || /tsbpe|plumb/.test(w);
    req.push({ id: "licence_number", say: plumbing ? "a TSBPE licence number (e.g. M-12345 or J-12345)" : "a licence number", test: (t) => (plumbing ? TSBPE.test(t) && (/licen[cs]e|tsbpe|lic\b/i.test(t) || /\b(RMP|MPL|M|J)[- ]\d{4,6}\b/.test(t)) : LICENCE_NUMBER.test(t)) });
  }
  if (/\b(cause|caused)\b|\bwhy (it|the|this)\b/.test(w)) req.push({ id: "cause", say: `the cause, in words about this job (${tpl ? (TOPIC[tpl] || []).slice(0, 4).join(", ") : "the problem"}...)`, test: (t) => CAUSE.test(t) && relevance(t, scope).ok === true });
  if (/naming the part|name the part|part replaced|parts? used|which part/.test(w)) req.push({ id: "part_named", say: `the part replaced (${(PARTS[tpl] || ["the part"]).slice(0, 4).join(", ")}...)`, test: (t) => (PARTS[tpl] || []).some((p) => norm(t).includes(` ${p} `)) });
  if (/weight rating|rated|studs or anchors/.test(w)) req.push({ id: "mounting", say: "studs or anchors, and a weight rating in lb", test: (t) => /\bstuds?|anchors?|toggle|lag\b/i.test(t) && NUM_LB.test(t) });
  if (/\bpermit\b/.test(w)) req.push({ id: "permit", say: "the permit number, or why none is needed", test: (t) => /permit\s*(#|no\.?|number)?\s*[:#]?\s*[A-Z0-9-]*\d{3,}/i.test(t) || PERMIT_NUMBER.test(t) || /no permit (is |was )?(needed|required)|not (needed|required)/i.test(t) });
  if (/paint used|paint/.test(w) && /dry/.test(w)) req.push({ id: "paint", say: "the paint used and the drying time", test: (t) => /paint|primer|eggshell|satin|semi-?gloss|matte|flat finish|coats?\b|behr|sherwin|valspar|benjamin moore|color[- ]matched/i.test(t) && /\b\d+\s?(hours?|hrs?|minutes?|mins?|days?)\b/i.test(t) });
  if (/rooms? cleaned|listing the rooms/.test(w)) req.push({ id: "rooms", say: "the rooms cleaned", test: (t) => /\b(kitchen|bath(room)?s?|bedrooms?|living|dining|hall|floors?|laundry)\b/i.test(t) });
  if (/pieces assembled|listing the pieces/.test(w)) req.push({ id: "pieces", say: "the pieces assembled", test: (t) => (TOPIC.furniture || []).some((x) => norm(t).includes(` ${x} `)) || /\b(table|chair|cabinet|bookcase|crib|bench)\b/i.test(t) });
  if (/leak check|stops filling|tank stops/.test(w)) req.push({ id: "test_result", say: "the test and its result", test: (t) => /\b(no (leak|leaks|drip|drips)|stops?|stopped|dry|tested|checked)\b/i.test(t) });
  return req;
}

// The things a short text names, from every job type's words (TOPIC and PARTS), longest first so "shut-off valve"
// isn't also "valve". Plurals count ("drips" is "drip").
const THINGS = [...new Set([...Object.values(TOPIC), ...Object.values(PARTS)].flat())].sort((a, b) => b.length - a.length);
const VERBS = new Set(["clean", "cleaned", "vacuum", "vacuumed", "mop", "mopped", "dust", "dusted", "scrubbed", "assemble", "assembled", "assembly", "mount", "mounted", "patch", "patched", "sand", "sanded", "primed", "taped", "snaked", "running", "clogged", "blocked", "level", "flush", "dripping"]);
export function thingsIn(text) {
  let t = norm(text).replace(/(\w)s /g, "$1 ");
  const out = [];
  for (const w of THINGS) if (!VERBS.has(w) && has(t, w)) { out.push(w); t = t.split(` ${w} `).join(" | "); }
  return out;
}
// A photo's own caption or label naming a different thing than its condition asks for ("corroded shut-off valve" on
// "Photo of the new cartridge, washer or O-ring installed"), or an old/broken state on an after-the-work condition.
// Words for the job's fixture itself (the faucet on a faucet job) never count as a different thing.
const BAD_STATE = /\b(corroded|corrosion|rusted|rusty|old|worn|broken|cracked|leaking|leaky|damaged|clogged|before)\b/i;
export function captionMismatch(check, caption, scope) {
  const said = String(caption || "").trim();
  if (!said) return null;
  const fixture = new Set([...thingsIn(scope?.title || ""), ...[...ownTemplates(scope)].flatMap((k) => k.split("_"))]);
  const want = thingsIn(check?.what || ""), got = thingsIn(said).filter((w) => !fixture.has(w));
  const st = said.match(BAD_STATE);
  if (got.length && want.length && !got.some((w) => want.includes(w))) return { names: got, wants: want.filter((w) => !fixture.has(w)).length ? want.filter((w) => !fixture.has(w)) : want, state: st?.[0] || null };
  if (st && /\b(new|installed|replaced|no drip|no leak|after|working|fixed|repaired)\b/i.test(check?.what || "")) return { names: got, wants: want, state: st[0] };
  return null;
}
