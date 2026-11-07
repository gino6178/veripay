// Pros and their agents. Every demo pro is fictional (Austin, TX; demo: true); each has an agent that quotes
// from its own rules (callout fee, hourly rate, hours for the task, distance, how soon) and answers a counter-offer
// once. The words the agent says may come from the model (ai.chat, labelled "model"); the numbers always come from the
// rules, and a model sentence that changes a number is thrown away.
// Real pros' agents connect over A2A with a pro key (Bearer dpk_..., issued by staff or by the pro on the website),
// kept only as a hash. A pro is paid only to their own verified PayPal, set on the website, never by an agent.
import crypto from "node:crypto";
import { store, stateFile } from "./store.js";
import { now, nowIso } from "./clock.js";
import { where, miles } from "./geo.js";
import { chat } from "./ai.js";
import { usd } from "./pay/index.js";
import { humanize } from "./human.js";
import { licenceLookup, insuranceCheck, REGISTRY_LABEL } from "./registry.js";
import { saveFile, fromDataUrl } from "./evidence.js";
import { availabilityOf, hoursText } from "./calendar.js";

const db = store(stateFile("pros"), { pros: {} });
export const prosStore = db;
const save = () => db.save();
const sha = (s) => crypto.createHash("sha256").update(s).digest("hex");
const round5 = (c) => Math.round(c / 500) * 500;

// rules: callout (cents), hourly (cents), perMile (cents, beyond freeMiles, each way), lead (hours before the first
// slot), rush (multiplier for a window under 48 hours), floor (the least they take, as a share of their ask),
// radius (miles), helper (a teammate who comes along, and the share of the pro's money they're paid)
const DEMO = [
  // plumbing
  { id: "barton-creek-plumbing", name: "Barton Creek Plumbing", owner: "Rosa Delgado", trade: "plumbing", zip: "78704", rating: 4.9, jobs: 212, license: "TX M-90417", rules: { callout: 7500, hourly: 9500, perMile: 150, freeMiles: 6, lead: 4, rush: 1.1, floor: 0.88, radius: 25 }, helper: { name: "Marco Ruiz (apprentice)", share: 0.2 } },
  { id: "eastside-pipe-drain", name: "Eastside Pipe & Drain", owner: "Darnell Brooks", trade: "plumbing", zip: "78702", rating: 4.7, jobs: 148, license: "TX M-90392", rules: { callout: 5900, hourly: 8900, perMile: 120, freeMiles: 5, lead: 8, rush: 1.15, floor: 0.9, radius: 20 }, helper: null },
  { id: "hill-country-leak-pros", name: "Hill Country Leak Pros", owner: "Kim Nguyen", trade: "plumbing", zip: "78745", rating: 4.8, jobs: 301, license: "TX M-90405", rules: { callout: 8900, hourly: 11000, perMile: 100, freeMiles: 8, lead: 2, rush: 1.0, floor: 0.85, radius: 30 }, helper: { name: "Leo Tran", share: 0.25 } },
  { id: "mueller-plumbing", name: "Mueller Plumbing Co.", owner: "Sam Whitaker", trade: "plumbing", zip: "78723", rating: 4.6, jobs: 96, license: "TX M-90422", rules: { callout: 6900, hourly: 9900, perMile: 150, freeMiles: 6, lead: 24, rush: 1.2, floor: 0.92, radius: 18 }, helper: null },
  { id: "lone-star-rooter", name: "Lone Star Rooter", owner: "Ana Morales", trade: "plumbing", zip: "78758", rating: 4.5, jobs: 77, license: "TX J-90431", rules: { callout: 4900, hourly: 8500, perMile: 200, freeMiles: 4, lead: 12, rush: 1.15, floor: 0.9, radius: 22 }, helper: { name: "Jesse Ortiz", share: 0.15 } },
  // cleaning
  { id: "zilker-clean-co", name: "Zilker Clean Co.", owner: "Priya Shah", trade: "cleaning", zip: "78704", rating: 4.9, jobs: 530, rules: { callout: 0, hourly: 4500, perMile: 100, freeMiles: 8, lead: 20, rush: 1.1, floor: 0.9, radius: 20, crew: 2 }, helper: { name: "Maya Lopez", share: 0.45 } },
  { id: "bluebonnet-home-cleaning", name: "Bluebonnet Home Cleaning", owner: "Grace Kim", trade: "cleaning", zip: "78757", rating: 4.7, jobs: 410, rules: { callout: 2500, hourly: 3900, perMile: 100, freeMiles: 6, lead: 30, rush: 1.15, floor: 0.88, radius: 20, crew: 2 }, helper: { name: "Elena Ruiz", share: 0.45 } },
  { id: "tidy-armadillo", name: "Tidy Armadillo", owner: "Chris Bell", trade: "cleaning", zip: "78741", rating: 4.6, jobs: 188, rules: { callout: 0, hourly: 4200, perMile: 150, freeMiles: 5, lead: 12, rush: 1.2, floor: 0.9, radius: 15, crew: 1 }, helper: null },
  { id: "south-congress-maids", name: "South Congress Maids", owner: "Lupe Garza", trade: "cleaning", zip: "78704", rating: 4.8, jobs: 266, rules: { callout: 1500, hourly: 4000, perMile: 100, freeMiles: 6, lead: 24, rush: 1.1, floor: 0.92, radius: 18, crew: 2 }, helper: { name: "Rita Gomez", share: 0.4 } },
  // handyman
  { id: "brick-and-bolt", name: "Brick & Bolt Handyman", owner: "Tom Reyes", trade: "handyman", zip: "78751", rating: 4.8, jobs: 233, rules: { callout: 4500, hourly: 7500, perMile: 120, freeMiles: 6, lead: 6, rush: 1.1, floor: 0.88, radius: 22 }, helper: null },
  { id: "austin-fix-it-crew", name: "Austin Fix-It Crew", owner: "Nia Carter", trade: "handyman", zip: "78702", rating: 4.7, jobs: 175, rules: { callout: 3900, hourly: 6900, perMile: 150, freeMiles: 5, lead: 18, rush: 1.15, floor: 0.9, radius: 20 }, helper: { name: "Devon Price", share: 0.3 } },
  { id: "pecan-street-repairs", name: "Pecan Street Repairs", owner: "Oscar Lee", trade: "handyman", zip: "78701", rating: 4.6, jobs: 92, rules: { callout: 5500, hourly: 8000, perMile: 100, freeMiles: 8, lead: 4, rush: 1.0, floor: 0.9, radius: 25 }, helper: null },
  { id: "two-rivers-handyman", name: "Two Rivers Handyman", owner: "Beth Hall", trade: "handyman", zip: "78745", rating: 4.9, jobs: 140, rules: { callout: 4900, hourly: 7200, perMile: 120, freeMiles: 6, lead: 24, rush: 1.2, floor: 0.87, radius: 20 }, helper: null },
];
// where demo pros are paid: sandbox stand-in addresses, unless DONE_PRO_PAYPAL_EMAIL points every demo pro at one
// real sandbox personal account (and DONE_HELPER_PAYPAL_EMAIL every helper), so the payouts land in PayPal's sandbox
// (without DONE_HELPER_PAYPAL_EMAIL the helpers are paid to the same sandbox account as the pro, as their own labelled item)
const demoEmail = (id) => process.env.DONE_PRO_PAYPAL_EMAIL || `${id}@done-demo.example`;
const helperEmail = (pid, name) => process.env.DONE_HELPER_PAYPAL_EMAIL || process.env.DONE_PRO_PAYPAL_EMAIL || `${pid}-${name.split(" ")[0].toLowerCase()}@done-demo.example`;
export function seedDemoPros() {
  // (earlier versions stored the demo pros as "... (demo)": plain names now; demo: true still marks them)
  for (const d of DEMO) { const h = db.data.pros[d.id]; if (h) { h.name = d.name; if (h.license) h.license = String(h.license).replace(/\s*\(demo\)$/, ""); } }
  for (const d of DEMO) {
    // DONE_PRO_PAYPAL_EMAIL set later: demo pros (and helpers) still on a stand-in address move to the real sandbox account
    { const h = db.data.pros[d.id]; if (h && process.env.DONE_PRO_PAYPAL_EMAIL && /@done-demo.example$/i.test(h.paypal?.email || "")) { h.paypal = { ...h.paypal, email: demoEmail(d.id) }; if (h.helper?.paypal && /@done-demo.example$/i.test(h.helper.paypal.email || "")) h.helper.paypal = { ...h.helper.paypal, email: helperEmail(d.id, h.helper.name) }; } }
    const num0 = d.license ? d.license.replace(/^TX\s+/, "").replace(/\s*\(demo\)$/, "") : null, had = db.data.pros[d.id];
    if (had?.verification && (!num0 || had.verification.license?.number === num0)) continue;
    if (had && d.license) had.license = d.license;
    if (!had) db.data.pros[d.id] = { ...structuredClone(d), demo: true, agent: "demo", base: where(d.zip), keys: [], person: null, created: nowIso(),
      paypal: { email: demoEmail(d.id), verified: true, verifiedAt: nowIso(), method: "demo account (verified at sign-up)" },
      helper: d.helper ? { ...d.helper, paypal: { email: helperEmail(d.id, d.helper.name), verified: true, method: "demo account" } } : null };
    const p = db.data.pros[d.id], num = d.license ? d.license.replace(/^TX\s+/, "").replace(/\s*\(demo\)$/, "") : null;
    p.verification = verify(p, { license: num ? { number: num } : null, insurance: { carrier: "Lone Star Mutual (demo insurer)", policy: `GL-${d.id.slice(0, 4).toUpperCase()}-2026`, limit: 100000000, expires: "2027-06-30" } });
  }
  save();
}
// what a pro has proved (parity #17): a verified PayPal, a licence the registry knows (plumbing), insurance
const NOT_IN_REGISTRY = "Not found in the licence registry.";
function verify(p, { license, insurance, insuranceDoc = null, licenseDoc = null } = {}) {
  const v = p.verification || {};
  let lic = license !== undefined ? (license ? licenceLookup(license.number, { trade: p.trade, holder: p.owner }) : licenceLookup(null, { trade: p.trade })) : v.license || licenceLookup(null, { trade: p.trade });
  // the same licence number already registered to another pro here: a duplicate or someone else's licence
  const other = lic?.number && Object.values(db.data.pros).find((x) => x.id !== p.id && x.verification?.license?.number === lic.number);
  if (other) lic = { ...lic, valid: false, duplicateOf: other.id, why: `Licence ${lic.number} is already registered to another pro on VeriPay (${other.name}): a duplicate, or someone else's licence. Staff review it.`, signal: "licence_duplicate" };
  // a valid-format number the demo registry doesn't know: verified by staff from the licence document (a live TSBPE
  // public lookup is out of scope for the demo)
  if (lic && license === undefined && v.license?.document) lic.document = v.license.document;
  if (lic && licenseDoc) { lic.document = licenseDoc; if (lic.staffVerified && lic.staffVerified.document !== licenseDoc.id) delete lic.staffVerified; }
  if (lic && !lic.valid && !lic.duplicateOf && (lic.why === NOT_IN_REGISTRY || ["pending_review", "not_verified"].includes(lic.status))) {
    lic.status = lic.document ? "pending_review" : "not_verified";
    lic.why = lic.document ? "Not in the licence registry. Not yet verified (staff review pending): staff check the licence document you sent." : "Not in the licence registry. Not yet verified: send a photo or PDF of your licence (licenseDoc) and staff review it.";
  }
  if (lic?.staffVerified && !lic.duplicateOf) { lic.valid = !!lic.staffVerified.ok; lic.status = lic.staffVerified.ok ? "verified_by_staff" : "rejected_by_staff"; lic.why = lic.staffVerified.ok ? `Verified by staff from the licence document (${lic.staffVerified.at.slice(0, 10)}), not the registry.` : `Staff couldn't verify the licence document: ${lic.staffVerified.note || "no reason given"}.`; }
  const ins = insurance !== undefined ? (insurance ? insuranceCheck(insurance) : null) : v.insurance || null;
  if (ins && insuranceDoc) ins.document = insuranceDoc;
  else if (ins && v.insurance?.document) ins.document = v.insurance.document;
  return { paypal: { verified: !!p.paypal?.verified, method: p.paypal?.method || null, ...(/@done-demo\.example$/i.test(p.paypal?.email || "") ? { demoAddress: true } : {}) }, license: lic, insurance: ins, reviewed: v.reviewed || null, registry: REGISTRY_LABEL };
}
export function badges(p) {
  const v = p.verification || verify(p, {}), out = [];
  if (v.paypal.verified) out.push({ id: "paypal", label: "PayPal verified", ok: true });
  if (v.license?.required === false) out.push({ id: "license", label: "No state licence required for this trade", ok: true });
  else if (v.license?.valid) out.push({ id: "license", label: `${v.license.class} ${v.license.number}`, ok: true });
  else out.push({ id: "license", label: "Licence not verified", ok: false });
  if (v.insurance?.valid) out.push({ id: "insurance", label: `Insured: ${usd(v.insurance.limit)} general liability`, ok: true });
  else out.push({ id: "insurance", label: "Insurance not verified", ok: false });
  if (v.reviewed?.ok) out.push({ id: "reviewed", label: "Reviewed by VeriPay staff", ok: true });
  return out;
}
// the pro sends their licence number and insurance certificate on the website (a COI file as a data: URL, optional)
// fields a request may carry: anything else is a 400, so a typo doesn't silently change nothing
export function unknownFields(body, allowed) { const bad = Object.keys(body || {}).filter((k) => !allowed.includes(k)); return bad.length ? { error: "fields", message: `Unknown field${bad.length > 1 ? "s" : ""}: ${bad.join(", ")}. Allowed: ${allowed.join(", ")}.`, unknown: bad, allowed } : null; }
// A pro's own rates, in US dollars (stored in cents): what their demo-style quotes and the job feed's radius use
export const RATE_FIELDS = ["callout", "hourly", "perMile", "freeMiles", "radius", "lead", "rush", "floor", "crew", "partsPolicy"];
export function setRates(proId, body = {}) {
  const p = pro(proId);
  if (!p) return { error: "pro" };
  const bad = unknownFields(body, RATE_FIELDS);
  if (bad) return bad;
  const r = { ...p.rules }, num = (k, lo, hi, cents = false) => { if (body[k] == null) return null; const v = +body[k]; if (!(v >= lo && v <= hi)) return `${k} is ${lo} to ${hi}`; r[k] = cents ? Math.round(v * 100) : v; return null; };
  const errs = [num("callout", 0, 1000, true), num("hourly", 10, 1000, true), num("perMile", 0, 20, true), num("freeMiles", 0, 100), num("radius", 1, 100), num("lead", 0, 168), num("rush", 1, 3), num("floor", 0.5, 1), num("crew", 1, 10)].filter(Boolean);
  if (errs.length) return { error: "rates", message: errs.join("; ") };
  if (body.partsPolicy != null) { if (!["at_cost", "markup_10", "included"].includes(body.partsPolicy)) return { error: "rates", message: "partsPolicy is at_cost, markup_10 or included" }; r.partsPolicy = body.partsPolicy; }
  p.rules = r; save();
  return viewPro(p, { self: true });
}
export function setVerification(proId, body = {}) {
  const p = pro(proId);
  if (!p) return { error: "pro" };
  const bad = unknownFields(body, ["license", "insurance", "insuranceDoc", "licenseDoc"]) || (body.insurance && unknownFields(body.insurance, ["carrier", "policy", "limit", "expires"])) || (body.license && unknownFields(body.license, ["number"]));
  if (bad) return bad;
  // insurance.limit is US dollars, like every amount sent to the API
  const { license, insuranceDoc } = body, insurance = body.insurance ? { ...body.insurance, limit: body.insurance.limit != null ? Math.round(+body.insurance.limit * 100) : undefined } : body.insurance;
  let doc = null;
  if (insuranceDoc) {
    const d = fromDataUrl(insuranceDoc);
    if (!d) return { error: "file", message: "insuranceDoc is a data: URL (PDF or photo of the certificate)." };
    const f = saveFile(`pros-${p.id}`, { buf: d.buf, mime: d.mime, kind: "receipt", name: "insurance-certificate", uploadedAt: nowIso() });
    if (f.error) return f;
    doc = { id: f.id, sha256: f.sha, mime: f.mime, path: f.path, at: f.uploadedAt };
  }
  let ldoc = null;
  if (body.licenseDoc) {
    const d = fromDataUrl(body.licenseDoc);
    if (!d) return { error: "file", message: "licenseDoc is a data: URL (PDF or photo of the licence)." };
    const f = saveFile(`pros-${p.id}`, { buf: d.buf, mime: d.mime, kind: "receipt", name: "licence", uploadedAt: nowIso() });
    if (f.error) return f;
    ldoc = { id: f.id, sha256: f.sha, mime: f.mime, path: f.path, at: f.uploadedAt };
  }
  p.verification = verify(p, { ...(license !== undefined ? { license } : {}), ...(insurance !== undefined ? { insurance } : {}), insuranceDoc: doc, licenseDoc: ldoc });
  p.verification.reviewed = null;
  save();
  return viewPro(p, { self: true });
}
export function staffReview(proId, { ok, note = "" } = {}) {
  const p = pro(proId);
  if (!p) return { error: "pro" };
  p.verification = verify(p, {});
  p.verification.reviewed = { ok: !!ok, note: String(note).slice(0, 200), at: nowIso() };
  save();
  return viewPro(p, { self: true });
}
// staff look at the licence document and verify (or reject) it: { ok: true|false, note }
export function staffLicence(proId, { ok, note = "" } = {}) {
  const p = pro(proId);
  if (!p) return { error: "pro" };
  const lic = p.verification?.license;
  if (!lic?.number) return { error: "state", message: "This pro hasn't sent a licence number." };
  if (lic.duplicateOf) return { error: "duplicate", message: lic.why };
  if (!lic.document) return { error: "document", message: "No licence document to review yet: the pro sends one (licenseDoc)." };
  lic.staffVerified = { ok: !!ok, note: String(note).slice(0, 200), at: nowIso(), document: lic.document.id };
  p.verification = verify(p, {});
  save();
  return viewPro(p, { self: true });
}
export const insuranceDocOf = (proId) => pro(proId)?.verification?.insurance?.document || null;
seedDemoPros();
export const pro = (id) => db.data.pros[id] || null;
export const allPros = () => Object.values(db.data.pros);
export const prosFor = (trade) => allPros().filter((p) => p.trade === trade && !p.suspended);

// ---- keys for real pros' agents --------------------------------------------------------------------------------------
const slug = (s) => String(s || "").toLowerCase().replace(/\(.*?\)/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 32) || "pro";
function issueKey(p, label) {
  const secret = `dpk_${crypto.randomBytes(24).toString("base64url")}`;
  p.keys.push({ id: `pk_${crypto.randomBytes(4).toString("hex")}`, hash: sha(secret), hint: secret.slice(0, 8), label: String(label || "pro agent").slice(0, 40), created: nowIso(), revoked: false, lastUsed: null });
  save();
  return secret;
}
// a real pro (or another key for one). Their payout PayPal starts unverified: they verify it on the website.
export function createPro({ id, name, owner, trade, zip = "78701", email, rules = {}, label } = {}) {
  let p = id ? pro(String(id)) : null;
  if (!p) {
    if (!String(name || "").trim()) return { error: "name", message: "A pro needs a name." };
    if (!["plumbing", "cleaning", "handyman"].includes(trade)) return { error: "trade", message: "trade is plumbing, cleaning or handyman." };
    let pid = slug(name);
    while (pro(pid)) pid = `${pid.slice(0, 26)}-${crypto.randomBytes(2).toString("hex")}`;
    p = db.data.pros[pid] = { id: pid, name: String(name).trim().slice(0, 60), owner: owner ? String(owner).slice(0, 60) : null, trade, zip: String(zip), base: where(zip), rating: null, jobs: 0, demo: false, agent: "external", keys: [], person: null, created: nowIso(),
      rules: { callout: 6000, hourly: 9000, perMile: 150, freeMiles: 6, lead: 12, rush: 1.1, floor: 0.9, radius: 25, ...pickRules(rules) },
      paypal: email ? { email: String(email).slice(0, 120), verified: false, method: null } : null, helper: null };
  }
  const key = issueKey(p, label), onboarding = onboardingLink(p.id);
  return { pro: viewPro(p), key, onboarding, readiness: readiness(p), note: "Keep the key: only its hash is stored. Send it as Authorization: Bearer dpk_... to /a2a. Give the onboarding link to the pro (the person): it signs them in on the website once, where they verify their PayPal, licence and insurance." };
}
// ---- onboarding: a one-time link that signs the pro's person in on the website ------------------------------------------
// Staff (or the pro's own agent, through readiness) get a link /pro/onboard?code=...; the website exchanges the code
// (POST /api/pro/onboard) for a session as that pro. One use, 7 days; only its hash is kept.
export function onboardingLink(proId, { days = 7 } = {}) {
  const p = pro(proId);
  if (!p) return null;
  const code = crypto.randomBytes(18).toString("base64url");
  const expires = new Date(Date.now() + days * 864e5).toISOString();
  // several links can be valid at once (one from staff, one from the agent's readiness): each is used once
  p.onboardingCodes = [...(p.onboardingCodes || []).filter((x) => !x.used && Date.parse(x.expires) > Date.now()), { hash: sha(code), expires, used: false, made: nowIso() }].slice(-5);
  save();
  return { link: `/pro/onboard?code=${code}`, api: "POST /api/pro/onboard { code }", expires, oneUse: true, note: "Opening the link shows a page with a button; only that click (POST) signs in, so link previews don't use it up." };
}
export const peekOnboarding = (code) => { const h = sha(String(code || "")); for (const p of allPros()) { const c = (p.onboardingCodes || []).find((x) => x.hash === h); if (c) return !c.used && Date.parse(c.expires) > Date.now() ? p : null; } return null; };
// a used or expired code presented again: kept on the code (when, from where), so a 410 can be traced
export function noteLateAttempt(code, meta) {
  const h = sha(String(code || ""));
  for (const p of allPros()) { const c = (p.onboardingCodes || []).find((x) => x.hash === h); if (c) { (c.lateAttempts ||= []).push({ at: nowIso(), ...meta }); c.lateAttempts = c.lateAttempts.slice(-10); save(); return p.id; } }
  return null;
}
export function redeemOnboarding(code, meta = null) {
  const h = sha(String(code || ""));
  for (const p of allPros()) {
    const c = (p.onboardingCodes || []).find((x) => x.hash === h) || (p.onboarding?.hash === h ? p.onboarding : null);
    if (!c) continue;
    if (c.used || Date.parse(c.expires) < Date.now()) return null;
    c.used = true; c.usedAt = nowIso(); if (meta) c.usedBy = meta; save();
    if (meta) console.log(`onboarding: ${p.id}'s code redeemed via ${meta.route} from ${meta.ip} (${meta.ua || "no user agent"})`);
    return p;
  }
  return null;
}
// what stands between a pro and being hired, in words an agent can pass on (parity #17 and the payout rule)
export function readiness(p) {
  const v = p.verification || verify(p, {}), blockers = [], recommended = [];
  if (!p.paypal?.verified) blockers.push({ id: "paypal", say: "Verify the PayPal you're paid to, on the website (Payout settings). Until then customers can't hire you: payouts go only to a verified PayPal.", where: "website" });
  if (p.helper && !p.helper.paypal?.verified) blockers.push({ id: "helper_paypal", say: `Your helper ${p.helper.name} needs a verified PayPal before a job with them is paid.`, where: "website" });
  if (v.license?.required && !v.license.valid) recommended.push({ id: "license", say: "Add your TSBPE licence number (M-, J-, T- or RMP- and five digits) on the website.", where: "website" });
  if (!v.insurance?.valid) recommended.push({ id: "insurance", say: "Add your insurance certificate (general liability, at least $300,000) on the website.", where: "website" });
  if (!p.person) recommended.push({ id: "signin", say: "Nobody has signed in for this pro on the website yet: open the onboarding link.", where: "website" });
  return { hireable: !blockers.length, blockers, recommended, badges: badges(p) };
}
const pickRules = (r) => Object.fromEntries(Object.entries(r || {}).filter(([k, v]) => ["callout", "hourly", "perMile", "freeMiles", "lead", "rush", "floor", "radius", "crew"].includes(k) && Number.isFinite(+v)).map(([k, v]) => [k, +v]));
export const keyFor = (proId, label) => { const p = pro(proId); return p ? issueKey(p, label) : null; };
export const isProKey = (req) => /^Bearer\s+dpk_/.test(String(req.headers.authorization || ""));
export function proOf(req) {
  const m = String(req.headers.authorization || "").match(/^Bearer\s+(dpk_[\w-]+)$/);
  if (!m) return null;
  const h = sha(m[1]);
  for (const p of allPros()) { const k = p.keys.find((x) => x.hash === h && !x.revoked); if (k) { if (!k.lastUsed || Date.now() - Date.parse(k.lastUsed) > 60e3) { k.lastUsed = nowIso(); save(); } return p; } }
  return null;
}
export function revokeKey(proId, keyId) { const p = pro(proId), k = p?.keys.find((x) => x.id === keyId); if (!k) return false; k.revoked = true; save(); return true; }
// The payout PayPal: set by the pro on the website, verified there. In this demo the verification is a stand-in for
// Log in with PayPal (which returns the account's verified email); an agent has no way to call it.
// Log in with PayPal (paypallogin.js): PayPal says which account, so it is verified by PayPal, with its payer id
export function setMerchant(proId, m) { const p = pro(proId); if (!p) return null; p.merchant = m; save(); return p; }
export function setPayPalFromLogin(proId, { email, payerId, verifiedAccount, demo }) {
  const p = pro(proId);
  if (!p) return { error: "pro" };
  p.paypal = { email: String(email).slice(0, 120), verified: true, verifiedAt: nowIso(), payerId, verifiedAccount, method: demo ? "Log in with PayPal (stand-in)" : "Log in with PayPal (sandbox)" };
  p.verification = verify(p, {});
  save();
  return viewPro(p, { self: true });
}
export function setPayPal(proId, body = {}) {
  const p = pro(proId);
  if (!p) return { error: "pro" };
  const bad = unknownFields(body, ["email", "helperName", "helperEmail", "helperShare"]);
  if (bad) return bad;
  const { email, helperName, helperEmail: hEmail, helperShare } = body;
  if (email !== undefined) {
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(email))) return { error: "email", message: "That isn't an email address." };
    p.paypal = { email: String(email).slice(0, 120), verified: true, verifiedAt: nowIso(), method: "demo verification (stands in for Log in with PayPal)" };
    p.verification = verify(p, {});
  }
  if (helperName !== undefined) {
    if (!helperName) p.helper = null;
    else {
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(hEmail || ""))) return { error: "email", message: "A helper needs their PayPal email." };
      const share = +helperShare;
      if (!(share > 0 && share <= 0.5)) return { error: "share", message: "A helper's share is more than 0 and at most 0.5 of the pro's money." };
      p.helper = { name: String(helperName).slice(0, 60), share, paypal: { email: String(hEmail).slice(0, 120), verified: true, verifiedAt: nowIso(), method: "demo verification" } };
    }
  }
  save();
  return viewPro(p, { self: true });
}
// Venmo payouts (PLAN §15 item 3): the pro may choose to be paid to their Venmo (a US phone number) instead of their
// PayPal email; Payouts sends it with recipient_type PHONE and recipient_wallet VENMO. Set on the website with the PIN
// (verified there: a stand-in for Venmo's own confirmation). The verified PayPal stays: it's what makes a pro hireable,
// and what a payout falls back to if Venmo is turned off. No agent can set or change it.
export const usPhone = (s) => { const d = String(s || "").replace(/\D/g, ""); return d.length === 10 ? `+1${d}` : d.length === 11 && d[0] === "1" ? `+${d}` : null; };
export function setPayoutMethod(proId, body = {}) {
  const p = pro(proId);
  if (!p) return { error: "pro" };
  const bad = unknownFields(body, ["method", "phone"]);
  if (bad) return bad;
  if (!["paypal", "venmo"].includes(body.method)) return { error: "method", message: "method is \"paypal\" or \"venmo\"." };
  if (body.method === "venmo") {
    const ph = usPhone(body.phone ?? p.venmo?.phone);
    if (!ph) return { error: "phone", message: "Venmo payouts go to the US mobile number on the pro's Venmo account: 10 digits." };
    p.venmo = { phone: ph, verified: true, verifiedAt: nowIso(), method: "demo verification on the website with the PIN (stands in for Venmo's own confirmation)" };
  }
  if (body.method === "venmo" && !p.paypal?.verified) return { error: "paypal", message: "Verify a PayPal first: it's what makes you hireable, and payouts fall back to it." };
  p.payoutMethod = body.method;
  save();
  return viewPro(p, { self: true });
}
// the pro's language for everything the API says to them (PLAN §15 item 5): "en" or "es"
export function setProSettings(proId, body = {}) {
  const p = pro(proId);
  if (!p) return { error: "pro" };
  const bad = unknownFields(body, ["lang"]);
  if (bad) return bad;
  if (body.lang !== undefined) { if (!["en", "es"].includes(body.lang)) return { error: "lang", message: "lang is \"en\" or \"es\"." }; p.lang = body.lang; }
  save();
  return viewPro(p, { self: true });
}
export function setAvailability(proId, av) { const p = pro(proId); if (!p) return { error: "pro" }; p.availability = av; save(); return viewPro(p, { self: true }); }
// where a payout item goes: Venmo (phone) when the pro chose it and it's verified, else their verified PayPal email
export function payoutTarget(p) {
  if (p?.payoutMethod === "venmo" && p.venmo?.verified && p.paypal?.verified) return { receiver: p.venmo.phone, recipientType: "PHONE", wallet: "VENMO", via: "venmo" };
  // a PayPal that PayPal itself vouched for (Log in with PayPal): paid to its account id, so a changed email can't misroute it
  if (p?.paypal?.verified && p.paypal.payerId && /Log in with PayPal/.test(p.paypal.method || "")) return { receiver: p.paypal.payerId, recipientType: "PAYPAL_ID", wallet: "PAYPAL", via: "paypal_id" };
  const e = payee(p);
  return e ? { receiver: e, recipientType: "EMAIL", wallet: "PAYPAL", via: "paypal" } : null;
}
export const linkPerson = (proId, personId) => { const p = pro(proId); if (p) { p.person = personId; save(); } return p; };
export const proOfPerson = (personId) => allPros().find((p) => p.person === personId) || null;

export function viewPro(p, { self = false } = {}) {
  if (!p) return null;
  const v = p.verification || verify(p, {});
  return { id: p.id, name: p.name, owner: p.owner, trade: p.trade, zip: p.zip, rating: p.rating, jobs: p.jobs, license: p.license || null, demo: !!p.demo, agent: p.agent,
    verified: badges(p), verification: { paypal: v.paypal, license: v.license && { required: v.license.required, valid: v.license.valid, number: v.license.number, class: v.license.class, status: v.license.status, expires: v.license.expires, why: v.license.why, document: !!v.license.document, ...(v.license.status === "pending_review" ? { says: "not yet verified (staff review pending)" } : {}) }, insurance: v.insurance && { valid: v.insurance.valid, carrier: v.insurance.carrier, limit: v.insurance.limit != null ? usd(v.insurance.limit) : null, expires: v.insurance.expires, problems: v.insurance.problems, document: !!v.insurance.document }, reviewed: v.reviewed, registry: v.registry },
    agentNote: null,
    rules: { callout: usd(p.rules.callout), hourly: usd(p.rules.hourly), perMileBeyond: `${usd(p.rules.perMile)} a mile past ${p.rules.freeMiles} miles`, leadHours: p.rules.lead, rushMultiplier: p.rules.rush, radiusMiles: p.rules.radius, partsPolicy: p.rules.partsPolicy || "at_cost", ...(p.rules.crew ? { crew: p.rules.crew } : {}) },
    helper: p.helper ? { name: p.helper.name, share: p.helper.share, ...(self ? { paypal: p.helper.paypal } : { paypalVerified: !!p.helper.paypal?.verified }) } : null,
    payout: p.paypal ? { ...(self ? p.paypal : { verified: !!p.paypal.verified, to: maskEmail(p.paypal.email) }), ...(isDemoAddress(p.paypal.email) ? { demoAddress: true } : {}) } : null,
    lang: p.lang === "es" ? "es" : "en", payoutMethod: p.payoutMethod === "venmo" && p.venmo?.verified ? { method: "venmo", to: self ? p.venmo.phone : p.venmo.phone.replace(/^(\+1)(\d{3})\d{3}(\d{4})$/, "$1 $2-•••-$3"), verified: true, says: "Paid to Venmo (Payouts, recipient_wallet VENMO); the verified PayPal is the fallback." } : { method: "paypal" },
    availability: (() => { const av = availabilityOf(p); return av ? { ...av, says: hoursText(av), tz: "America/Chicago" } : null; })(),
    ...(self ? { keys: p.keys.filter((k) => !k.revoked).map((k) => ({ id: k.id, label: k.label, hint: `${k.hint}…`, created: k.created, lastUsed: k.lastUsed })) } : {}) };
}
export const isDemoAddress = (e) => /@done-demo\.example$/i.test(String(e || ""));
export const maskEmail = (e) => String(e || "").replace(/^(.)(.*)(@.*)$/, (m, a, b, c) => `${a}${"•".repeat(Math.min(6, b.length))}${c}`);
// where a pro's money may go: their verified PayPal, or nowhere
export const payee = (p) => (p?.paypal?.verified ? p.paypal.email : null);
export const helperPayee = (p) => (p?.helper?.paypal?.verified ? p.helper.paypal.email : null);

// ---- a pro's agent: the rules ------------------------------------------------------------------------------------------
const HOURS = { plumbing: 1.5, cleaning: 3, handyman: 1.5 };
// what a pro would ask for a job, with each part of the price written out
export function quoteFor(p, job) {
  const r = p.rules, addr = job.address || where(job.zip), dist = miles(p.base, addr);
  if (dist > r.radius) return { decline: `outside our ${r.radius}-mile service area (${dist.toFixed(1)} miles)` };
  const hours = job.scope?.estimate?.hours ?? HOURS[p.trade] ?? 1.5, parts = job.scope?.estimate?.parts ?? 0, crew = r.crew || 1;
  // in the demo a demo pro can come within minutes (DEMO_FAST_ARRIVAL, on unless 0), so a visitor sees the job done
  const fast = p.agent === "demo" && process.env.DEMO_FAST_ARRIVAL !== "0", t = now(), first = fast ? t + (5 + Math.round(Math.random() * 5)) * 60e3 : t + r.lead * 3600e3, winTo = Date.parse(job.scope?.window?.to || "") || t + 7 * 864e5;
  if (first > winTo) return { decline: humanize(`our first opening is ${new Date(first).toISOString()}, after your window`) };
  const labor = Math.round(hours * crew * r.hourly), travel = Math.max(0, Math.round((dist - r.freeMiles) * 2 * r.perMile / 100) * 100), rush = winTo - t < 48 * 3600e3 ? r.rush : 1;
  const ask = round5((r.callout + labor + parts + travel) * rush);
  return { ask, floor: round5(ask * r.floor), parts, arrival: new Date(Math.max(first, Date.parse(job.scope?.window?.from || "") || first)).toISOString(), miles: +dist.toFixed(1),
    breakdown: { callout: r.callout, labor, hours: hours * crew, parts, travel, rush }, helper: p.helper ? { name: p.helper.name, share: p.helper.share } : null };
}
// The answer to a counter-offer of `amount` on an offer whose ask was `ask` (floor: the least the pro takes)
//   at or above the floor: accept it; under 60% of the ask: decline; else counter once, halfway, never under the floor
export function answerCounter({ ask, floor, amount, countered = false, atCeiling = false }) {
  if (amount >= ask) return { kind: "accept", amount: ask };
  if (amount >= floor) return { kind: "accept", amount };
  // the customer's whole budget (a counter at the job's price ceiling): taken when it's at least 75% of the ask
  if (atCeiling && amount >= ask * 0.75) return { kind: "accept", amount, why: "meets the customer's budget" };
  if (amount < ask * 0.6) return { kind: "decline", amount: null };
  if (countered) return { kind: "decline", amount: null };
  return { kind: "counter", amount: Math.max(floor, round5((amount + ask) / 2)) };
}

// what the pro's agent says: the rules' sentence, or the model's if it keeps every number the rules put in it
export async function say(p, kind, facts) {
  const rules = rulesSentence(p, kind, facts), need = (rules.match(/\$\d[\d,]*\.\d{2}/g) || []);
  const r = await chat([{ role: "system", content: `You write one or two short, friendly sentences for ${p.name}, a ${p.trade} business in Austin, TX, replying to a customer's AI agent about a job. Use exactly these dollar amounts and no others: ${need.join(", ") || "none"}. Don't promise anything not in the facts. Plain text, no greeting line.` },
    { role: "user", content: JSON.stringify({ kind, ...facts, draft: rules }) }], { timeoutMs: 3500 });
  const text = typeof r?.text === "string" ? r.text.trim().slice(0, 400) : "";
  const amounts = text.match(/\$\d[\d,]*(?:\.\d{2})?/g) || [];
  const norm = (s) => s.replace(/[$,]/g, "").replace(/\.00$/, "");
  const sameNumbers = need.every((a) => amounts.map(norm).includes(norm(a))) && amounts.every((a) => need.map(norm).includes(norm(a)));
  // nor may it claim a step that didn't happen (a booking, an acceptance) or ask the customer for one, unless this is the accept
  const claims = kind !== "accept" && /\b(confirm(ed)? the (job|booking)|(job|booking) is confirmed|it'?s a deal|accepted|booked|would you like to confirm|shall i book)\b/i.test(text);
  const ok = r?.source === "model" && text && sameNumbers && !claims;
  return ok ? { text, source: "model", ms: r.ms ?? null } : { text: rules, source: "rules", ...(r?.source === "model" ? { modelDropped: claims ? "the model's sentence claimed a step that didn't happen" : "the model's sentence changed a number" } : {}) };
}
function rulesSentence(p, kind, f) {
  const when = f.arrival ? new Date(f.arrival).toLocaleString("en-US", { timeZone: "America/Chicago", weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : null;
  const soon = f.arrival ? Math.round((Date.parse(f.arrival) - now()) / 60e3) : null;
  if (kind === "offer") return `${p.name} can do it for ${usd(f.amount)}${when ? `, arriving ${soon != null && soon <= 15 ? `in about ${soon} minutes (${when})` : when}` : ""}: ${usd(f.breakdown.callout)} call-out, ${f.breakdown.hours} h labor, ${f.breakdown.parts ? `${usd(f.breakdown.parts)} parts, ` : ""}${f.breakdown.travel ? `${usd(f.breakdown.travel)} travel` : "no travel charge"}${f.breakdown.rush > 1 ? ", rush rate" : ""}.${f.helper ? ` ${f.helper.name} comes along.` : ""}`;
  if (kind === "accept") return `We can do ${usd(f.amount)}. Accept it and we'll book the slot.`;
  if (kind === "counter") return `${usd(f.asked)} is below our cost for this one; we can meet you at ${usd(f.amount)}.`;
  if (kind === "decline") return `Sorry, we can't do it for ${usd(f.asked)}. Our offer of ${usd(f.ask)} stands until it expires.`;
  if (kind === "change") return `While working we found more: ${f.reason}. That adds ${usd(f.amount)}.`;
  return "";
}
