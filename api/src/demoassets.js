// Synthetic demo evidence: what the demo pros' "phones" send. Every image says "DEMO (synthetic)". Each job gets new
// pictures, not the same files again: the scene is re-drawn from a random seed (demo-assets/make-assets.ps1 -Batch:
// shifted, re-tinted, light and shade moved; ~25 of 64 dHash bits apart), then stamped with EXIF (now, at the job's
// address). Reuse detection stays fully on for every job. Without PowerShell (not Windows) it falls back to the stored
// files, which the checks will then rightly flag as reused. Drawing runs in a child process, off the event loop.
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { nowIso } from "./clock.js";
import { withExif } from "./evidence.js";
import { timeGap } from "./jobs.js";

const run = promisify(execFile);
const HERE = path.dirname(fileURLToPath(import.meta.url));
export const ASSET_DIR = path.join(HERE, "../demo-assets");
const SCRIPT = path.join(ASSET_DIR, "make-assets.ps1");
export const DEMO_ASSETS = [
  { file: "faucet-installed.jpg", kind: "photo", what: "New cartridge installed" },
  { file: "sink-dry.jpg", kind: "photo", what: "Under the sink after 10 minutes: dry" },
  { file: "receipt.jpg", kind: "receipt", what: "Parts receipt, TOTAL $47.05", text: "AUSTIN PLUMBING SUPPLY (demo)\nMoen 1225 cartridge 28.97\n1/4-turn stop valve 14.49\nSUBTOTAL 43.46\nTAX 3.59\nTOTAL 47.05" },
  { file: "valve-worn.jpg", kind: "photo", what: "Corroded shut-off valve, the 'before'" },
];
// the renderer can be slow when several jobs run at once: a longer timeout and one retry, because a fallback to the shared
// canned file would honestly look like a reused photo or receipt on the next job
const ps1 = (args) => run("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", SCRIPT, ...args], { timeout: 60e3, windowsHide: true });
const ps = (args) => ps1(args).catch(() => ps1(args));
// the demo parts receipt, dated today in Austin
const receipts = new Map();
// per job: its own permit number, and its own store (a branch and a register code) on the parts receipt, so the
// cross-job reuse checks never see two demo jobs with the same document or the same store, total and date
const hashOf = (s) => parseInt(crypto.createHash("sha1").update(String(s)).digest("hex").slice(0, 8), 16);
// the demo pro's extra materials on a water heater: a second expansion tank and a pressure-reducing valve
export const MATERIALS = { amount: 8703, reason: "the house pressure is high (85 psi): a second 2-gal expansion tank and a pressure-reducing valve, bought at the supplier this morning", text: (j) => `${storeOf(j)} (demo)\nSUPPLIER INVOICE\nDATE ${today()}\n2 GAL EXPANSION TANK 54.00\nPRESSURE REDUCING VALVE 26.40\nTAX 6.63\nTOTAL 87.03` };
export async function materialsEvidence(j, { typed = false } = {}) {
  return [{ kind: "receipt", buf: await receiptToday("materials", gallonsOf(j), "Austin TX", j), mime: "image/jpeg", name: "supplier-invoice.jpg", ...(typed ? { text: MATERIALS.text(j) } : {}) },
    { kind: "photo", buf: await freshPhoto(j, "wh-tp-valve.jpg"), mime: "image/jpeg", name: "materials-on-site.jpg", label: "materials delivered on site" }];
}
export const permitNo = (j) => `BP-2026-${String(100000 + (hashOf(j?.id || "job") % 900000))}`;
const BRANDS = ["AUSTIN PLUMBING SUPPLY", "HILL COUNTRY PLUMBING SUPPLY", "LONE STAR PIPE AND VALVE", "CAPITAL CITY PLUMBING PARTS", "TRAVIS PLUMBING WHOLESALE", "BARTON PLUMBING HOUSE"];
const STREETS = ["LAMAR", "BURNET", "OLTORF", "RIVERSIDE", "CONGRESS", "MANCHACA", "GUADALUPE", "ANDERSON", "BEN WHITE", "SLAUGHTER", "WILLIAM CANNON", "AIRPORT"];
const L = "ABCDEFGHJKLMNPQRSTUVWXYZ";
export const storeOf = (j) => { const h = hashOf(`store:${j?.id || "job"}`); return `${BRANDS[h % BRANDS.length]} ${STREETS[(h >>> 4) % STREETS.length]} ${L[(h >>> 9) % L.length]}${L[(h >>> 14) % L.length]}`; };
export async function receiptToday(kind = "faucet", gal = 40, site = "Austin TX", j = null) {
  const d = new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", month: "2-digit", day: "2-digit", year: "numeric" }).format(new Date(Date.parse(nowIso())));
  const ref = kind === "permit" ? permitNo(j) : `R-${String(hashOf(`r:${j?.id || "job"}`) % 1e6).padStart(6, "0")}`, store = storeOf(j);
  const key = `${kind}:${gal}:${d}:${site}:${j?.id || ""}`;
  if (!receipts.has(key)) {
    let buf;
    try {
      const out = path.join(os.tmpdir(), `done-receipt-${kind}-${gal}-${crypto.createHash("sha1").update(`${site}|${j?.id || ""}`).digest("hex").slice(0, 10)}-${d.split("/").join("-")}.jpg`);
      if (!fs.existsSync(out)) await ps(["-Receipt", out, "-Date", d, "-Kind", kind, "-Gal", String(gal), "-Site", site, "-Ref", ref, "-Store", store]);
      buf = fs.readFileSync(out);
    } catch { buf = fs.readFileSync(path.join(ASSET_DIR, "receipt.jpg")); }
    receipts.set(key, buf);
  }
  // each upload is its own photo of the receipt (a new file each round, never the same bytes again)
  return withExif(receipts.get(key), { taken: nowIso(), lat: 30.2433 + Math.random() * 1e-4, lng: -97.7656 - Math.random() * 1e-4 });
}
// the job's heater size: the scope's spec, else the job's words ("50 gallon"), else 40
export const gallonsOf = (j) => +(j.scope?.spec?.capacityGal || String(`${j.text || ""} ${j.scope?.title || ""}`).match(/(\d{2,3})[\s-]*(?:gal|gallon)/i)?.[1] || 40);
// Real photos (openly licensed, from Wikimedia Commons; demo-assets/real/attribution.json names the author and licence of
// each). A demo pro uses one, re-dated to the job (time and place; the camera's own make and model are kept), the first
// time its scene is needed on this server; after that the synthetic scene is used, because the same real photo on a
// second job is honestly a reused photo and the checks say so.
const REAL_DIR = path.join(ASSET_DIR, "real");
const REAL_SLOT = { "valve-worn.jpg": "faucet_before", "faucet-installed.jpg": "faucet_installed", "drain-clogged.jpg": "drain_before", "drain-clear.jpg": "draining", "trap-cleared.jpg": "trap_opened", "wh-old.jpg": "heater_old", "wh-new.jpg": "heater_installed", "tv-mounted.jpg": "tv_mounted", "bracket-level.jpg": "level_used", "furniture-built.jpg": "bed", "wall-patched.jpg": "painting", "clean-bathroom.jpg": "mirror_clean", "clean-floor.jpg": "floor_mopped", "toilet-tank.jpg": "toilet_tank", "toilet-done.jpg": "toilet_installed", "sink-dry.jpg": "faucet_installed" };
const REAL = (() => { try { return JSON.parse(fs.readFileSync(path.join(REAL_DIR, "attribution.json"), "utf8")).photos.filter((p) => p.has_camera_metadata && fs.existsSync(path.join(REAL_DIR, p.file))); } catch { return []; } })();
const usedFile = () => path.join(process.env.DONE_STATE_DIR && process.env.DONE_STATE_DIR !== "memory" ? process.env.DONE_STATE_DIR : os.tmpdir(), "demo-real-used.json");
const used = (() => { try { return new Set(JSON.parse(fs.readFileSync(usedFile(), "utf8"))); } catch { return new Set(); } })();
const markUsed = (f) => { used.add(f); if (process.env.DONE_STATE_DIR === "memory") return; try { fs.writeFileSync(usedFile(), JSON.stringify([...used])); } catch {} };
// the credits for every real photo (the website's credits page)
export const realCredits = () => REAL.map((p) => ({ file: p.file, scene: p.scene, what: p.condition, author: p.author || "unnamed on Commons (see the source page)", license: p.license, licenseUrl: p.license_url, source: p.source, camera: [p.original_exif?.Make, p.original_exif?.Model].filter(Boolean).join(" ") || null, originalTaken: p.original_exif?.DateTimeOriginal || null }));
export const creditOf = (file) => realCredits().find((c) => c.file === file) || null;
// the judges' tour always uses the real photos (its own library, the same on every tour job: the checks report it as a
// "demo library photo (tour)" rather than a reuse); other demo jobs use each real photo once
// which faucet photo shows what a condition asks, by its words: water running ("flows", "runs", "turned on", "working")
// is faucet_installed-1 (done-vlm: "water flowing from it"), the faucet off and dry is faucet_installed-3
const tourPref = (file, what) => (REAL_SLOT[file] !== "faucet_installed" ? null : /\b(flow|flows|running|runs|turned on|water on|working|works)\b/i.test(what || "") ? "faucet_installed-1.jpg" : "faucet_installed-3.jpg");
// the library photos the judges' tour uses (its faucet scenes: the customer's photo of the problem, the change order's
// photo, the faucet running, the faucet off)
export const TOUR_RESERVED = new Set(["faucet_before-3.jpg", "faucet_installed-1.jpg", "faucet_installed-3.jpg"]);
const tourPicked = new Map(); // a tour job's library photos picked in this round, before they're stored
function realFor(file, j = null, what = "") {
  // off with DONE_REAL_PHOTOS=0, and in memory-only runs (the tests) unless DONE_REAL_PHOTOS=1, so tests stay repeatable
  if (process.env.DONE_REAL_PHOTOS === "0" || (process.env.DONE_STATE_DIR === "memory" && process.env.DONE_REAL_PHOTOS !== "1")) return null;
  const slot = REAL_SLOT[file];
  // (each photo condition of a tour job gets its own library photo where the slot has more than one)
  if (slot && (j?.tour || j?.sim)) {
    const c = REAL.filter((p) => p.slot === slot), picked = (tourPicked.get(j.id) || new Set()), had = new Set([...(j.evidence || []).map((e) => e.name), ...picked]);
    // the library photo that shows what the scene is for: the faucet off over a dry sink for "no drips", the faucet
    // running for the new part (by what done-vlm describes in each: faucet_installed-1 has water running, -3 doesn't)
    const pref = tourPref(file, what), p = (pref && c.find((x) => x.file === pref && !had.has(x.file))) || c.find((x) => !had.has(x.file)) || c[0] || null;
    if (p) { picked.add(p.file); tourPicked.set(j.id, picked); }
    return p;
  }
  // the tour's photos are reserved for tours: no other demo job ever sends them (it uses another library photo, or the
  // synthetic scene), so a tour any time after a fresh start never meets them as another job's photos
  return slot ? REAL.find((p) => p.slot === slot && !used.has(p.file) && !TOUR_RESERVED.has(p.file)) || null : null;
}
export async function freshPhoto(j, file, { minutesAgo = 0, what = "" } = {}) {
  const real = realFor(file, j, what);
  if (real) {
    if (!(j?.tour || j?.sim)) markUsed(real.file);
    const out = withExif(fs.readFileSync(path.join(REAL_DIR, real.file)), { taken: new Date(Date.parse(nowIso()) - minutesAgo * 60e3).toISOString(), lat: j.address.lat + 0.0002 + Math.random() * 0.0002, lng: j.address.lng - 0.0002 - Math.random() * 0.0002, make: real.original_exif?.Make, model: real.original_exif?.Model });
    // the name says which real photo it is (the website shows its credit); the original capture date is in the credits
    return Object.assign(out, { realName: real.file });
  }
  if (!fs.existsSync(path.join(ASSET_DIR, file))) file = /toilet/.test(file) ? "faucet-installed.jpg" : file;
  let buf;
  try {
    const out = path.join(os.tmpdir(), `done-demo-${crypto.randomBytes(6).toString("hex")}.jpg`);
    await ps(["-Batch", `${file}>${out}`, "-Seed", String(crypto.randomInt(1, 2 ** 31 - 1)), "-Gal", String(gallonsOf(j))]);
    buf = fs.readFileSync(out); fs.rmSync(out, { force: true });
  } catch { buf = fs.readFileSync(path.join(ASSET_DIR, file)); }
  return withExif(buf, { taken: new Date(Date.parse(nowIso()) - minutesAgo * 60e3).toISOString(), lat: j.address.lat + 0.0002 + Math.random() * 0.0002, lng: j.address.lng - 0.0002 - Math.random() * 0.0002 });
}
// a scene that fits the job's trade and the condition's words
// which job this is, by its template or title: the scenes come from that job type only, never another trade's
export const jobType = (j) => { const t = `${j.scope?.template || ""} ${j.scope?.title || ""} ${j.text || ""}`.toLowerCase(); return j.scope?.trade === "cleaning" ? "cleaning" : j.scope?.trade === "handyman" ? "handyman" : /water ?heater|heater/.test(t) ? "water_heater" : /drain|clog/.test(t) ? "drain" : /toilet|flush|running/.test(t) ? "toilet" : /faucet|tap|drip|cartridge/.test(t) ? "faucet" : "plumbing"; };
function pickFile(c, j) {
  const s = `${c.id} ${c.what} ${j.scope?.title || ""}`.toLowerCase(), t = j.scope?.trade, title = (j.scope?.title || "").toLowerCase(), w = `${c.id} ${c.what}`.toLowerCase();
  if (jobType(j) === "water_heater") return /old|before|remov|existing/.test(w) ? "wh-old.jpg" : /permit|sticker|inspect/.test(w) ? "permit-sticker.jpg" : /label|plate|model|serial/.test(w) ? "wh-label.jpg" : /vent|flue/.test(w) ? "wh-venting.jpg" : /t&p|relief|discharge|valve/.test(w) ? "wh-tp-valve.jpg" : "wh-new.jpg";
  if (jobType(j) === "toilet") return /before|old|worn/.test(w) ? "toilet-tank.jpg" : /tank|flapper|fill|valve/.test(w) ? "toilet-tank.jpg" : "toilet-done.jpg";
  if (t === "cleaning") return /bath/.test(s) ? "clean-bathroom.jpg" : /floor/.test(s) ? "clean-floor.jpg" : "clean-kitchen.jpg";
  if (t === "handyman") return /tv|mount|bracket/.test(s) ? (/bracket|level/.test(`${c.what}`.toLowerCase()) ? "bracket-level.jpg" : "tv-mounted.jpg") : /furniture|assembl|shelf|desk|anchor/.test(s) ? "furniture-built.jpg" : /drywall|patch|wall/.test(s) ? "wall-patched.jpg" : "repair-done.jpg";
  if (/drain|clog/.test(title) || /drain|clog|trap/.test(`${c.what}`.toLowerCase())) return /trap|opened|removed|clog/.test(`${c.what}`.toLowerCase()) && !/drain(ing)?\s+(freely|with)/.test(`${c.what}`.toLowerCase()) ? "trap-cleared.jpg" : /before/.test(s) ? "drain-clogged.jpg" : "drain-clear.jpg";
  // the new part first ("the new cartridge installed, after the repair" is the part, not the dry cabinet)
  return /before|worn|old|damage|corrod/.test(w) ? "valve-worn.jpg" : /new|install|cartridge|replac|part\b/.test(w) && !/dry|drip|leak|10 minutes/.test(w) ? "faucet-installed.jpg" : /dry|drip|water on|leak|after|running|10 minutes/.test(s) ? "sink-dry.jpg" : "faucet-installed.jpg";
}
// a condition's short name: its first words, cut at a word
export const shortName = (s) => { const w = String(s || "").replace(/^(photo|picture|a photo|a picture)( of)?\s+/i, "").split(/\s+/); let o = ""; for (const x of w) { if ((o + " " + x).trim().length > 32) break; o = (o + " " + x).trim(); } return o.replace(/[,;:.]$/, "") || String(s || "").slice(0, 32); };
// an after photo never shows the unfixed scene: the "before" pictures map to the fixed one
const UNFIXED = { "valve-worn.jpg": "faucet-installed.jpg", "wh-old.jpg": "wh-new.jpg", "drain-clogged.jpg": "drain-clear.jpg" };
// (unless the condition asks for the old part itself: "the old heater before removal", "the removed cartridge")
// only a condition that IS the old part or the starting state keeps the "before" scene; "the new cartridge (the old one
// removed)" is the new part
export const afterFile = (c, j) => { const f = pickFile(c, j); const isOld = /^(before|old|removed|old_unit)/i.test(c.id || "") || /^(photo of )?(the )?(old|removed|existing)\b/i.test(c.what || "") || /\bbefore (the )?(repair|work|removal)\b/i.test(c.what || ""); return isOld ? f : UNFIXED[f] || f; };
const beforeFile = (j) => ({ cleaning: "clean-kitchen.jpg", handyman: "repair-done.jpg", water_heater: "wh-old.jpg", drain: "drain-clogged.jpg", toilet: "toilet-tank.jpg" })[jobType(j)] || "valve-worn.jpg";
// a note that answers what the condition asks (the cause, the part, what was done), by job type
function noteFor(j, c) {
  const t = `${j.scope?.title || ""} ${j.text || ""}`.toLowerCase();
  if (/drain|clog/.test(t)) return "Cause of the clog: hair and soap buildup in the P-trap. How it was cleared: removed and cleaned the trap, snaked the line about 3 feet, put the trap back and ran hot water 5 minutes; it drains freely and the trap doesn't leak.";
  if (/toilet|running|flush/.test(t)) return "Part replaced: the worn flapper (and the fill valve washer). The tank now refills and stops; checked it stays still for 5 minutes, no water running into the bowl.";
  if (/water heater/.test(t)) return "Replaced the 40-gallon water heater with a matching unit; new expansion tank and T&P discharge pipe; permit pulled; hot water at the kitchen tap.";
  if (/faucet|tap|drip|cartridge/.test(t)) return `Work finished and checked: the faucet is working correctly, with no leaks or drips. Part replaced: the worn Moen 1225 cartridge.${(j.changeOrders || []).some((x) => x.status === "approved") ? " Also replaced the weeping shut-off valve (the approved change order)." : ""} Ran the water 10 minutes after the repair: no drips under the sink.`;
  if (j.scope?.trade === "cleaning") return "Cleaned every room on the list: kitchen counters, stovetop and sink, the bathroom (tub, toilet, mirror), then vacuumed and mopped the floors.";
  return `Done as asked (${c.what.toLowerCase()}): ${j.scope?.items?.join("; ") || "the repair described"}; checked it works and cleaned up.`;
}
const NOTES = { plumbing: "Found the cause, replaced or cleared it, ran the water 10 minutes: no leaks.", drain: "Hair and soap in the P-trap; opened the trap, cleared it and snaked the line, then ran hot water 5 minutes: it drains freely.", cleaning: "Cleaned every room on the list: kitchen, bathroom, floors last.", handyman: "Done as described, checked it works, cleaned up." };
const today = () => new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", month: "2-digit", day: "2-digit", year: "numeric" }).format(new Date(Date.parse(nowIso())));
const docText = (kind, j) => ({ permit: `CITY OF AUSTIN DEVELOPMENT SERVICES (demo)\nPLUMBING PERMIT No. ${permitNo(j)}\nIssued: ${today()}   Expires: 180 days after issue\nSite: ${j.address?.line || "job address"}, Austin TX ${j.address?.zip || ""}\nWork: ${j.scope?.title || "plumbing"}`, inspection: `CITY OF AUSTIN (demo)\nPLUMBING INSPECTION No. ${permitNo(j)}-1\nDate: ${today()}  Result: PASSED (green tag)\nSite: Austin TX ${j.address?.zip || ""}` })[kind] || DOC_TEXT[kind];
const DOC_TEXT = { permit: "CITY OF AUSTIN plumbing permit BP-2026-004512 (demo)", inspection: "City inspection PASSED, green tag (demo)", lien_waiver: "Conditional lien waiver and release on progress payment (demo)", invoice: "INVOICE (demo) TOTAL", license: "TSBPE licence (demo)" };
// the evidence for a set of done-conditions (a milestone's, or all): a fresh photo per photo condition, the receipt
// dated today, the documents, a note. typed: with the rules alone nothing reads an image, so the receipt's total is
// typed, as the website lets a pro do.
export async function evidenceFor(j, checks, { typed = false, partsCents = null } = {}) {
  const out = [], photos = checks.filter((c) => !c.doc && c.evidence === "photo"), lic = (await import("./pros.js")).pro(j.agreed?.pro || "")?.verification?.license?.number || null;
  // a visit's photos are taken minutes apart, in the order of the conditions (12 min, so "10 minutes after" holds)
  // the visit's timing (planVisit): every after photo inside [work started, now], in condition order, timed gaps met
  const { mins } = planVisit(j, checks);
  const ago = (c) => mins.get(c.id) || 0;
  const noParts = !(j.agreed?.parts > 0) && !(j.changeOrders || []).some((x) => x.status === "approved");
  const note = /licen/i.test(checks.map((c) => c.what).join(" ")) && lic ? ` Licence ${lic}.` : "";
  for (const c of checks) {
    if (c.doc) out.push({ kind: "receipt", buf: c.doc === "permit" ? await receiptToday("permit", gallonsOf(j), `${j.address?.line ? `${j.address.line}, ` : ""}Austin TX ${j.address?.zip || ""}`.trim(), j) : c.doc === "inspection" ? await freshPhoto(j, "permit-sticker.jpg") : await receiptToday(jobType(j) === "water_heater" ? "heater" : "faucet", gallonsOf(j), "Austin TX", j), mime: "image/jpeg", name: `${c.doc}.jpg`, checkId: c.id, text: docText(c.doc, j) || c.what });
    else if (c.evidence === "receipt" && noParts) continue; // no parts, no receipt
    else if (c.evidence === "receipt") { const heater = jobType(j) === "water_heater"; out.push({ kind: "receipt", buf: await receiptToday(heater ? "heater" : "faucet", gallonsOf(j), "Austin TX", j), mime: "image/jpeg", name: "receipt.jpg", checkId: c.id, ...(typed ? { text: `${storeOf(j)} (demo)\nDATE ${today()}\n` + (heater ? `${gallonsOf(j)} GAL GAS WATER HTR 699.00` + "\n2 GAL EXPANSION TANK 54.00\nT&P VALVE + FITTINGS 68.00\nSUBTOTAL 821.00\nTAX 67.73\nTOTAL 888.73" : partsCents != null && partsCents !== 4705 ? `PARTS\nTOTAL ${(partsCents / 100).toFixed(2)}` : DEMO_ASSETS[2].text.split("\n").slice(1).join("\n")) } : {}) }); }
    else if (c.evidence === "note") out.push({ kind: "note", checkId: c.id, text: `${noteFor(j, c)}${note}` });
    else { const f = afterFile(c, j); out.push({ kind: "photo", buf: await freshPhoto(j, f, { minutesAgo: ago(c), what: c.what }), mime: "image/jpeg", name: undefined, checkId: c.id, label: (c.shots?.labels || [])[0] || "wide shot" }); out.at(-1).name = out.at(-1).buf.realName || f; }
  }
  return out;
}
// When a visit's after photos are taken, as minutes before "now": 2 minutes apart in condition order, and a timed
// condition ("after:new_part>=10m") at least its gap (+1) after the photo it names. span is how long the visit needs
// since work started: the demo pro waits until then (or the demo moves its clock), so every photo is after the start and
// none is in the future.
export function planVisit(j, checks) {
  const photos = checks.filter((c) => !c.doc && c.evidence === "photo"), all = j.scope?.checks || checks;
  const mins = new Map(photos.map((c, i) => [c.id, (photos.length - 1 - i) * 2]));
  for (let pass = 0; pass < 3; pass++) for (const c of photos) {
    const g = timeGap(c, all);
    if (!g || !mins.has(g.after)) continue;
    const need = mins.get(c.id) + g.minutes + 1;
    if (mins.get(g.after) < need) mins.set(g.after, need);
  }
  // a "before" condition's photo is taken first, before every after photo (the checks enforce the order)
  const isBefore = (c) => c.id === "before" || c.id === "old_unit" || (/\bbefore\b/i.test(c.what) && !/\bafter\b/i.test(c.what));
  const firsts = photos.filter(isBefore), rest = photos.filter((c) => !isBefore(c));
  if (firsts.length && rest.length) { const top = Math.max(...rest.map((c) => mins.get(c.id))); firsts.forEach((c, i) => mins.set(c.id, top + 2 + (firsts.length - 1 - i) * 2)); }
  return { mins, span: Math.max(0, ...mins.values()) + 2 };
}
// before photos for each photo condition, at the start
export async function beforeFor(j, checks) {
  const out = [];
  for (const c of checks.filter((x) => x.evidence === "photo" && !x.doc).slice(0, 4)) out.push({ kind: "photo", buf: await freshPhoto(j, beforeFile(j)), mime: "image/jpeg", name: "before.jpg", checkId: c.id, label: `before ${c.id}: ${shortName(c.what)}` }), out.at(-1).buf.realName && (out.at(-1).name = out.at(-1).buf.realName);
  return out;
}
