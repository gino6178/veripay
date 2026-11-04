// A claim, from "this happened" to money in PayPal.
//   needs_evidence -> deciding -> paid | denied | referred (an adjuster decides) -> paid | denied
//   needs_info (an adjuster asked for more) -> deciding ...;  withdrawn
// The decision is code: every check below names the clause it applies and what it found, so the claimant, an adjuster
// and anyone checking the receipt later see the same reasons. Documents are read by reader.js (fields, never a
// verdict) and fraud.js adds signals. A claim is paid at once, with PayPal Payouts, only when every check passes, its
// documents were read, no signal fired and the amount is within the claim type's instant limit; otherwise a person
// decides. Code denies only on hard facts (the policy wasn't in force, the waiting period, a coverage the policy
// doesn't have), and every denial can be appealed to a person.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { store, stateFile } from "./store.js";
import { now, nowIso, DAY } from "./clock.js";
import { product, claimType, clause } from "./products/index.js";
import { policy as getPolicy, inForce, causesOfPolicy } from "./policy.js";
import { person, allPeople, payoutAddress, updatePerson } from "./people.js";
import { postSplit } from "./pool.js";
import { record } from "./activity.js";
import { exifOf } from "./exif.js";
import { signals } from "./fraud.js";
import { read } from "./reader.js";
import * as receipts from "./proof/receipts.js";
import { tr } from "./zh.js";
import { statusOf } from "./flights.js";
import { allPolicies } from "./policy.js";
import { pp, usd, why } from "./pay/index.js";

const db = store(stateFile("claims"), { claims: {} });
export const claimsStore = db;
const EVIDENCE = stateFile("claims") ? path.join(path.dirname(stateFile("claims")), "evidence") : null;
const mem = new Map(); // evidence bytes when there is no state folder (tests)
export const claim = (id) => db.data.claims[id] || null;
export const claimsOf = (personId) => Object.values(db.data.claims).filter((c) => c.person === personId);
export const allClaims = () => Object.values(db.data.claims);
const save = () => db.save();
const say = (c, action, summary, actor = { kind: "platform" }, data = null) => record({ actor, who: [c.person], action, summary, ref: c.id, data });
const KINDS = ["photo", "receipt", "receipt_or_photo", "police_report", "repair_quote", "vet_invoice", "diagnosis", "records", "fire_report", "list", "statement", "medical", "inspection", "death_certificate", "id_beneficiary", "specialist_statement", "registration", "flight_record", "pir", "other"];
const READS = ["receipt", "receipt_or_photo", "police_report", "repair_quote", "vet_invoice", "fire_report", "medical", "diagnosis"];
// these may start in the waiting period (the clauses say so)
const NO_WAIT = { renters: ["theft", "fire"], home: ["theft", "fire"] };

// File a claim. Evidence can come with it or later (add_evidence); it is decided once the evidence the type needs is in.
export async function file(personId, { policy: pid, type, happenedAt, where = "", story = "", amount, items = [], payee = "me", vetEmail = null, evidence = [], device = null, event = null, actor }) {
  const pol = getPolicy(pid);
  if (!pol || pol.person !== personId) return { error: "policy", message: "No such policy for this person." };
  const ct = claimType(pol.product, type);
  if (!ct) return { error: "type", message: `For ${pol.product}, type is one of: ${product(pol.product).claims.map((c) => c.type).join(", ")}.` };
  // a kind of claim this policy's plan doesn't include is said up front, before any evidence is asked for
  if (!pol.coverages.some((x) => x.id === ct.coverage) && !(ct.needsAddon && pol.addons.includes(ct.needsAddon))) return { error: "not_covered", clause: ct.clause, message: `This policy doesn't include ${ct.en.toLowerCase()} (${ct.clause})${ct.needsAddon ? `: it needs the ${ct.needsAddon} add-on` : pol.answers?.plan ? `: the ${pol.answers.plan} plan doesn't have it` : ""}. Nothing was filed.` };
  if (ct.parametric) return { error: "automatic", message: `${ct.en} is paid automatically from the flight's status (${ct.clause}); there is nothing to file. flight_status shows each insured flight.` };
  const at = Date.parse(happenedAt);
  if (!Number.isFinite(at) || at > now() + 3600e3) return { error: "happenedAt", message: "When it happened, as an ISO date and time, not in the future." };
  const claimed = Math.round(+amount * 100);
  if (!(claimed > 0) && pol.product !== "life") return { error: "amount", message: "How much the claim is for, in USD." };
  const id = `clm_${crypto.randomBytes(5).toString("hex")}`;
  const c = { id, number: `CL-${Date.now().toString(36).toUpperCase().slice(-7)}`, person: personId, policy: pol.id, product: pol.product, type, coverage: ct.coverage,
    happenedAt: new Date(at).toISOString(), reportedAt: nowIso(), where: String(where).slice(0, 120), story: String(story).slice(0, 2000), claimed: claimed || 0,
    items: (items || []).slice(0, 20).map((x) => ({ what: String(x.what || "").slice(0, 80), value: Math.round(+x.value * 100) || 0 })),
    payee: payee === "vet" && ct.directToVet ? "vet" : "me", vetEmail: payee === "vet" ? String(vetEmail || "").slice(0, 120) : null,
    device: device ? String(device).slice(0, 64) : null, event: event ? String(event).slice(0, 40) : null, evidence: [], status: "needs_evidence", decision: null, payout: null, history: [] };
  db.data.claims[id] = c; save();
  if (c.device) { const p = person(personId); updatePerson(personId, { devices: [...new Set([...(p.devices || []), c.device])].slice(-5) }); }
  say(c, "claim_filed", `Claim ${c.number} filed: ${ct.en}, ${usd(c.claimed)}, on policy ${pol.number}.`, actor);
  for (const e of evidence) await addEvidence(id, e, { decide: false });
  return decideIfReady(c, actor);
}

// One document or photo: { kind, name, data (base64), dhash (the browser's difference hash, optional), text (typed) }
export async function addEvidence(id, { kind, name = "", data = null, dhash = null, text = null }, { decide = true, actor } = {}) {
  const c = claim(id);
  if (!c || !["needs_evidence", "needs_info", "deciding", "referred"].includes(c.status)) return { error: "claim", message: "This claim can't take more evidence now." };
  if (!KINDS.includes(kind)) return { error: "kind", message: `kind is one of: ${KINDS.join(", ")}` };
  if (c.evidence.length >= 12) return { error: "too_many", message: "At most 12 documents per claim." };
  const buf = data ? Buffer.from(String(data), "base64") : null;
  if (buf && buf.length > 6e6) return { error: "too_large", message: "A file can be at most 6 MB." };
  const e = { id: `ev_${crypto.randomBytes(4).toString("hex")}`, kind, name: String(name).slice(0, 80), at: nowIso(), size: buf?.length || 0,
    sha: buf ? crypto.createHash("sha256").update(buf).digest("hex") : null, dhash: /^[0-9a-f]{16}$/.test(dhash || "") ? dhash : null, exif: buf ? exifOf(buf) : null, typed: text ? String(text).slice(0, 2000) : null, read: null };
  if (buf) { if (EVIDENCE) { fs.mkdirSync(path.join(EVIDENCE, c.id), { recursive: true }); fs.writeFileSync(path.join(EVIDENCE, c.id, e.id), buf); } else mem.set(e.id, buf); }
  if (buf && READS.includes(kind)) e.read = await read(e, buf);
  c.evidence.push(e); save();
  say(c, "evidence_added", `Added ${kind.replace(/_/g, " ")}${e.read && !e.read.error ? ` (read: ${[e.read.date, e.read.amount != null ? usd(e.read.amount) : null, e.read.merchant].filter(Boolean).join(", ")})` : ""} to claim ${c.number}.`, actor);
  return decide ? decideIfReady(c, actor) : view(c);
}
export const evidenceFile = (c, eid) => (EVIDENCE ? (fs.existsSync(path.join(EVIDENCE, c.id, eid)) ? fs.readFileSync(path.join(EVIDENCE, c.id, eid)) : null) : mem.get(eid) || null);

function missingEvidence(c) {
  const need = claimType(c.product, c.type)?.evidence || [], have = new Set(c.evidence.map((e) => e.kind));
  return need.filter((k) => !(have.has(k) || (k === "receipt_or_photo" && (have.has("receipt") || have.has("photo"))) || (k === "list" && c.items.length) || (k === "statement" && c.story.length > 20)));
}
async function decideIfReady(c, actor) {
  if (["needs_evidence", "needs_info"].includes(c.status)) {
    const miss = missingEvidence(c);
    if (miss.length) { c.status = "needs_evidence"; save(); return { ...view(c), missing: miss }; }
  }
  return decide(c.id, actor);
}

// What the policy pays for this claim, before any person looks: each step and its clause
function payable(c, pol, p, ct) {
  const steps = [], lim = pol.coverages.find((x) => x.id === c.coverage);
  const read = c.evidence.map((e) => e.read).find((r) => r && !r.error && r.amount != null);
  let amount = read ? Math.min(c.claimed, read.amount) : c.claimed;
  steps.push({ step: "claimed", amount: c.claimed, says: read ? `the documents read ${usd(read.amount)}; the lower of that and the claim is used` : "the amount claimed" });
  // one item over $1,500 that isn't listed is paid up to $1,500 (renters RT-4.3, home HO-2.2)
  const cap = { renters: "RT-4.3", home: "HO-2.2" }[p.id];
  if (cap && c.coverage === "contents" && c.items.length) {
    const listed = (pol.items || []).map((x) => x.what.toLowerCase());
    const over = c.items.filter((x) => x.value > 150000 && !(pol.addons.includes("valuables") && listed.some((w) => w && x.what.toLowerCase().includes(w))));
    const cut = over.reduce((t, x) => t + (x.value - 150000), 0);
    if (cut > 0) { amount = Math.max(0, amount - cut); steps.push({ step: "item_cap", clause: cap, amount: -cut, says: `${over.map((x) => x.what).join(", ")}: over $1,500 and not listed, paid up to $1,500 each` }); }
  }
  // what is left of the coverage this year
  const used = allClaims().filter((x) => x.policy === pol.id && x.coverage === c.coverage && x.id !== c.id && x.status === "paid").reduce((t, x) => t + (x.paid || 0), 0);
  if (lim?.limit != null && amount > lim.limit - used) { steps.push({ step: "limit", clause: lim.clause, amount: -(amount - (lim.limit - used)), says: `the ${c.coverage} cover has ${usd(lim.limit - used)} left this year` }); amount = Math.max(0, lim.limit - used); }
  // the deductible, or the pet's share
  const cov = p.coverages.find((x) => x.id === c.coverage), addon = p.addons.find((x) => x.id === c.coverage || x.id === ct.needsAddon);
  if (p.id === "pet" && c.coverage === "vet") { const share = Math.round(amount * (+pol.answers.copay / 100)); amount -= share; steps.push({ step: "copay", clause: "PT-2.1", amount: -share, says: `your ${pol.answers.copay}% share` }); }
  else if (p.id === "car") {
    const d = c.coverage === "own_damage" ? p.deductibleFixed.own_damage : c.coverage === "theft" ? Math.round(amount * p.deductibleFixed.theft) : 0;
    if (d) { amount = Math.max(0, amount - d); steps.push({ step: "deductible", clause: c.coverage === "theft" ? "CR-2.2" : "CR-2.3", amount: -d, says: "the deductible" }); }
  } else if (addon?.deductible != null && ct.needsAddon) {
    const d = Math.min(amount, addon.deductible); amount -= d;
    steps.push({ step: "deductible", clause: addon.clause, amount: -d, says: `the add-on's ${usd(addon.deductible)} deductible` });
  } else if (pol.deductible && !cov?.noDeductible && !(addon && /RT-5.1|HO-5.2/.test(addon.clause))) {
    const d = Math.min(amount, pol.deductible); amount -= d;
    steps.push({ step: "deductible", clause: { renters: "RT-4.4", home: "HO-4.3" }[p.id] || cov?.clause, amount: -d, says: `the ${usd(pol.deductible)} deductible` });
  }
  return { amount: Math.max(0, amount), steps, read: !!read, readConfidence: read?.confidence ?? null };
}

// The decision. Runs again whenever new evidence comes in, until a person has decided.
export async function decide(id, actor) {
  const c = claim(id), pol = getPolicy(c.policy), p = product(c.product), ct = claimType(c.product, c.type);
  const checks = [], check = (id, ok, clauseId, says, hard = false) => checks.push({ id, ok, clause: clauseId, says, hard });
  const force = inForce(pol, c.happenedAt);
  check("in_force", force.ok, p.clauses.find((x) => x.kind === "policy")?.id, force.ok ? "the policy was in force when it happened" : `it happened ${force.why}`, true);
  const waitDays = p.id === "pet" && c.type === "accident" ? p.accidentWaitingDays : p.waitingDays;
  const waitEnd = pol.start ? Date.parse(pol.start) + waitDays * DAY : 0, exempt = (NO_WAIT[p.id] || []).includes(c.type);
  if (waitDays && !exempt) check("waiting", Date.parse(c.happenedAt) >= waitEnd, { renters: "RT-3.4", home: "HO-3.3", pet: "PT-3.2" }[p.id], Date.parse(c.happenedAt) >= waitEnd ? "after the waiting period" : `within the ${waitDays}-day waiting period (it ends ${new Date(waitEnd).toISOString().slice(0, 10)})`, true);
  const has = pol.coverages.some((x) => x.id === c.coverage) || (ct.needsAddon && pol.addons.includes(ct.needsAddon));
  const needs = ct.needsAddon && !pol.addons.includes(ct.needsAddon);
  check("covered", has && !needs, ct.clause, needs ? `this needs the ${ct.needsAddon} add-on, which the policy doesn't have` : has ? (ct.needsAddon ? `the policy has the ${ct.needsAddon} add-on` : `the policy covers ${c.coverage.replace(/_/g, " ")}`) : `the policy doesn't include ${c.coverage.replace(/_/g, " ")} cover`, true);
  const late = (Date.parse(c.reportedAt) - Date.parse(c.happenedAt)) / DAY;
  check("reported", late <= 90, p.clauses.find((x) => x.kind === "condition")?.id, late <= 90 ? `reported ${Math.round(late)} days after it happened` : `reported ${Math.round(late)} days after it happened (over 90)`);
  if (c.type === "theft") {
    const rep = c.evidence.find((e) => e.kind === "police_report");
    const rd = rep?.read?.date ? Date.parse(`${rep.read.date}T23:59:59+08:00`) : null;
    check("police_24h", rd == null ? !!rep : rd - Date.parse(c.happenedAt) <= 2 * DAY, { renters: "RT-2.1", home: "HO-2.2", car: "CR-4.1" }[p.id], rd == null ? (rep ? "a police report is attached (its date wasn't read)" : "no police report") : rd - Date.parse(c.happenedAt) <= 2 * DAY ? `reported to the police on ${rep.read.date}` : `the police report is dated ${rep.read.date}, more than 24 hours after`);
  }
  const money = payable(c, pol, p, ct);
  const docs = c.evidence.filter((e) => READS.includes(e.kind));
  check("documents_read", !docs.length || money.read, null, !docs.length ? "no document of a kind Cover reads" : money.read ? `documents read (confidence ${money.readConfidence})` : "the documents couldn't be read by Cover's reader, so a person checks them");
  const sig = signals(c, { policy: pol, allClaims: allClaims(), people: allPeople(), instantMax: ct.instantMax });
  const hardFail = checks.filter((x) => x.hard && !x.ok), soft = checks.filter((x) => !x.hard && !x.ok);
  let outcome, reason;
  if (hardFail.length) { outcome = "deny"; reason = hardFail.map((x) => x.says).join("; "); }
  else if (sig.length) { outcome = "refer"; reason = `fraud signals: ${sig.map((s) => s.says).join("; ")}`; }
  else if (soft.length) { outcome = "refer"; reason = soft.map((x) => x.says).join("; "); }
  else if (!ct.instantMax || money.amount > ct.instantMax) { outcome = "refer"; reason = !ct.instantMax ? "this kind of claim is always decided by a person" : `${usd(money.amount)} is over the ${usd(ct.instantMax)} Cover pays without a person`; }
  else if (money.read && money.readConfidence != null && money.readConfidence < 0.8) { outcome = "refer"; reason = `the reader wasn't sure of the documents (confidence ${money.readConfidence})`; }
  else if (money.amount === 0) { outcome = "deny"; reason = "after the deductible nothing is due"; }
  else { outcome = "pay"; reason = "every check passed"; }
  c.decision = { outcome, amount: outcome === "deny" ? 0 : money.amount, reason, checks, signals: sig, steps: money.steps, by: "rules", at: nowIso(), basis: [...new Set([ct.clause, ...checks.filter((x) => x.clause).map((x) => x.clause), ...money.steps.filter((s) => s.clause).map((s) => s.clause)])] };
  c.history.push({ at: nowIso(), outcome, amount: c.decision.amount, by: "rules" });
  if (outcome === "deny") { c.status = "denied"; save(); say(c, "claim_denied", `Claim ${c.number} isn't covered: ${reason}. You can ask a person to look again (appeal).`); issue(c, "denied"); return view(c); }
  if (outcome === "refer") { c.status = "referred"; save(); say(c, "claim_referred", `Claim ${c.number} goes to an adjuster: ${reason}.`); return view(c); }
  return pay(c, money.amount, { by: "rules" });
}

// Money to the claimant (or straight to the vet) with PayPal Payouts, from the cause's pool
async function pay(c, amount, { by, note = null }) {
  const pol = getPolicy(c.policy), who = person(c.person), to = c.payee === "vet" && c.vetEmail ? c.vetEmail : payoutAddress(who);
  c.status = "paying"; save();
  try {
    const r = await pp().payout({ batchId: `${c.id}-pay`, receiver: to, amount, note: `Cover claim ${c.number}: ${usd(amount)}${c.payee === "vet" ? ` for ${who.name}'s pet` : ""}.`, subject: "Cover: your claim is paid" });
    c.payout = { batchId: r.batchId, status: r.status, to: c.payee === "vet" ? "the vet" : "you", amount, at: nowIso() };
    c.status = "paid"; c.paid = amount; c.paidAt = nowIso(); c.secondsToPay = Math.round((Date.parse(c.paidAt) - Date.parse(c.reportedAt)) / 1000);
    save();
    postSplit({ kind: "claim", causes: causesOfPolicy(pol), amount, policy: pol.id, claim: c.id, product: c.product, ref: r.batchId });
    say(c, "claim_paid", `Claim ${c.number} paid: ${usd(amount)} sent with PayPal Payouts to ${c.payout.to}${by === "rules" ? `, ${c.secondsToPay} seconds after it was filed` : by === "parametric" ? ", with no claim filed" : ""}.`, { kind: "paypal" });
    issue(c, "paid");
    (await import("./carrier.js")).afterClaim?.(c);
    await (await import("./community.js")).afterClaim(c).catch(() => null);
  } catch (e) { c.status = "referred"; c.payoutError = why(e); save(); say(c, "payout_failed", `The payout for claim ${c.number} failed (${c.payoutError}); an adjuster will retry it.`); }
  return view(c);
}
function issue(c, event) {
  const r = receipts.issue({ kind: "claim", subject: c.id, event, people: [c.person],
    data: { number: c.number, policy: c.policy, product: c.product, type: c.type, happenedAt: c.happenedAt, claimed: c.claimed, outcome: c.decision?.outcome, amount: c.paid ?? 0, by: c.decision?.by, basis: c.decision?.basis, checks: c.decision?.checks.map((x) => ({ id: x.id, ok: x.ok, clause: x.clause })), signals: c.decision?.signals.map((s) => s.signal), payout: c.payout?.batchId || null, evidence: c.evidence.map((e) => e.sha).filter(Boolean) } });
  c.receipts = [...(c.receipts || []), r.id]; save();
}

// ---- travel: flights that pay by themselves (TR-2.1, TR-2.2) ----------------------------------------------------------
// Every run, each insured flight on a live travel policy is looked up. Once it has departed 2 hours or more late, or
// been cancelled, Cover files the claim itself, checks it like any other (in force, the flight is on the policy, the
// disruption wasn't already known when the policy was bought, the trip's cap) and pays every traveler on the policy
// with PayPal Payouts. Nobody files anything; the flight's record is the evidence, its hash in the receipt.
const TIER = (st) => (st.status === "cancelled" ? { type: "flight_cancelled", each: 30000, clause: "TR-2.2" } : st.delayMin >= 360 ? { type: "flight_delay", each: 30000, clause: "TR-2.1" } : st.delayMin >= 120 ? { type: "flight_delay", each: 10000, clause: "TR-2.1" } : null);
export async function flightTick() {
  const out = [];
  for (const pol of allPolicies().filter((p) => p.product === "travel" && ["active", "grace", "expired"].includes(p.status) && p.start)) {
    for (const f of pol.answers.flights || []) {
      if (allClaims().some((c) => c.policy === pol.id && c.flight === `${f.flight}@${f.date}` && c.status !== "withdrawn")) continue;
      const st = await statusOf(f, pol.answers.destination), tier = TIER(st);
      if (!tier || (st.status !== "departed" && st.status !== "cancelled")) continue;
      out.push(await parametric(pol, f, st, tier));
    }
  }
  return out;
}
async function parametric(pol, f, st, tier) {
  const n = +pol.answers.travelers || 1, p = product("travel");
  const record = { flight: f.flight, date: f.date, from: st.from, to: st.to, scheduled: st.scheduled, status: st.status, delayMin: st.delayMin, source: st.source, reportedAt: st.reportedAt, firstSeenDisrupted: st.firstSeenDisrupted, seenAt: st.at };
  const recordJson = JSON.stringify(record), sha = crypto.createHash("sha256").update(recordJson).digest("hex");
  const id = `clm_${crypto.randomBytes(5).toString("hex")}`;
  const c = { id, number: `CL-${Date.now().toString(36).toUpperCase().slice(-7)}`, person: pol.person, policy: pol.id, product: "travel", type: tier.type, coverage: tier.type, flight: `${f.flight}@${f.date}`,
    happenedAt: `${f.date}T12:00:00.000Z`, reportedAt: nowIso(), where: `${st.from} → ${st.to}`, story: "", claimed: tier.each * n, items: [], payee: "me", vetEmail: null, device: null, event: `${st.from}:${f.date}`,
    evidence: [{ id: `ev_${crypto.randomBytes(4).toString("hex")}`, kind: "flight_record", name: `${f.flight} ${f.date}`, at: nowIso(), size: recordJson.length, sha, dhash: null, exif: null, typed: recordJson, read: { date: f.date, amount: null, merchant: f.flight, items: [], text: recordJson, confidence: 1, by: "flight status" } }],
    status: "deciding", decision: null, payout: null, history: [], auto: true, flightReportedAt: st.reportedAt || st.at };
  db.data.claims[id] = c; save();
  const checks = [], check = (cid, ok, clauseId, says, hard = true) => checks.push({ id: cid, ok, clause: clauseId, says, hard });
  const force = inForce(pol, new Date(Math.min(Date.parse(pol.end) - 1, Math.max(Date.parse(pol.start), Date.parse(`${f.date}T12:00:00Z`)))).toISOString());
  check("in_force", force.ok, "TR-6.1", force.ok ? "the policy was in force for this flight" : `the flight was ${force.why}`);
  check("listed", true, "TR-1.1", `${f.flight} on ${f.date} is an insured flight on this policy`);
  const known = st.firstSeenDisrupted && Date.parse(st.firstSeenDisrupted) < Date.parse(pol.created);
  check("not_known", !known, "TR-3.1", known ? `the disruption was known (${st.firstSeenDisrupted.slice(0, 16)}) before the policy was bought` : "the disruption wasn't known when the policy was bought");
  check("threshold", true, tier.clause, st.status === "cancelled" ? "the airline cancelled the flight" : `departed ${Math.floor(st.delayMin / 60)} h ${st.delayMin % 60} min late (${st.source})`);
  const paidSoFar = allClaims().filter((x) => x.policy === pol.id && x.auto && x.status === "paid").reduce((t, x) => t + (x.paid || 0), 0);
  const cap = 60000 * n, amount = Math.max(0, Math.min(tier.each * n, cap - paidSoFar));
  check("cap", amount > 0, "TR-2.2", amount > 0 ? `${usd(paidSoFar)} paid on this trip so far; the cap is ${usd(cap)}` : `the trip's cap of ${usd(cap)} is reached`);
  const fail = checks.filter((x) => !x.ok);
  c.decision = { outcome: fail.length ? "deny" : "pay", amount: fail.length ? 0 : amount, reason: fail.length ? fail.map((x) => x.says).join("; ") : "every check passed", checks, signals: [],
    steps: [{ step: "parametric", clause: tier.clause, amount: tier.each * n, says: `${usd(tier.each)} for each of ${n} traveler${n > 1 ? "s" : ""}` }, ...(amount < tier.each * n ? [{ step: "cap", clause: "TR-2.2", amount: amount - tier.each * n, says: "the trip's cap" }] : [])],
    by: "parametric", at: nowIso(), basis: [...new Set(checks.map((x) => x.clause))] };
  c.history.push({ at: nowIso(), outcome: c.decision.outcome, amount: c.decision.amount, by: "parametric" });
  say(c, "flight_disrupted", `${f.flight} on ${f.date} (${st.from} → ${st.to}) ${st.status === "cancelled" ? "was cancelled" : `departed ${Math.round(st.delayMin / 6) / 10} hours late`}. Cover filed claim ${c.number} for you.`);
  if (fail.length) { c.status = "denied"; save(); say(c, "claim_denied", `Claim ${c.number} isn't covered: ${c.decision.reason}.`); issue(c, "denied"); return view(c); }
  return pay(c, amount, { by: "parametric" });
}

// ---- the adjusters' desk ------------------------------------------------------------------------------------------
export const queue = () => allClaims().filter((c) => ["referred", "needs_info"].includes(c.status) || c.appeal === "open").sort((a, b) => a.reportedAt.localeCompare(b.reportedAt));
export async function adjust(id, { action, amount, clause: cl, note = "", adjuster = "adjuster" }) {
  const c = claim(id);
  if (!c) return { error: "claim" };
  const actor = { kind: "adjuster", client: adjuster };
  if (action === "approve") {
    if (!["referred", "denied"].includes(c.status)) return { error: "status", message: `The claim is ${c.status}.` };
    const amt = amount != null ? Math.round(+amount * 100) : c.decision?.amount;
    if (!(amt > 0)) return { error: "amount" };
    c.decision = { ...c.decision, outcome: "pay", amount: amt, by: adjuster, note, at: nowIso() }; c.history.push({ at: nowIso(), outcome: "pay", amount: amt, by: adjuster, note }); delete c.appeal;
    say(c, "claim_approved", `An adjuster approved claim ${c.number} for ${usd(amt)}${note ? `: ${note}` : ""}.`, actor);
    return pay(c, amt, { by: adjuster, note });
  }
  if (action === "deny") {
    if (!clause(cl)) return { error: "clause", message: "Deny with the clause it rests on." };
    c.status = "denied"; c.decision = { ...c.decision, outcome: "deny", amount: 0, by: adjuster, reason: note, basis: [cl], at: nowIso() }; c.history.push({ at: nowIso(), outcome: "deny", clause: cl, by: adjuster, note }); c.appeal = c.appeal ? "decided" : undefined; save();
    say(c, "claim_denied", `An adjuster decided claim ${c.number} isn't covered under ${cl}${note ? `: ${note}` : ""}.`, actor); issue(c, "denied");
    return view(c);
  }
  if (action === "ask") { c.status = "needs_info"; c.asked = String(note).slice(0, 300); save(); say(c, "claim_info_requested", `An adjuster asks for more on claim ${c.number}: ${c.asked}`, actor); return view(c); }
  return { error: "action", message: "action is approve, deny or ask." };
}
export function appeal(id, personId, why = "") {
  const c = claim(id);
  if (!c || c.person !== personId || c.status !== "denied" || c.appeal) return { error: "claim", message: "Only a denied claim can be appealed, once." };
  c.appeal = "open"; c.appealWhy = String(why).slice(0, 500); save();
  say(c, "claim_appealed", `You asked a person to look again at claim ${c.number}.`, { kind: "person", person: personId });
  return view(c);
}
export function withdraw(id, personId) {
  const c = claim(id);
  if (!c || c.person !== personId || ["paid", "paying"].includes(c.status)) return { error: "claim" };
  c.status = "withdrawn"; save(); say(c, "claim_withdrawn", `Claim ${c.number} withdrawn.`, { kind: "person", person: personId });
  return view(c);
}
// payouts that were sent: PayPal's final word on each (an address with no PayPal account comes back unclaimed)
export async function tick() {
  for (const c of allClaims().filter((x) => x.status === "paid" && x.payout && !["SUCCESS", "UNCLAIMED", "RETURNED", "FAILED"].includes(x.payout.item))) {
    const r = await pp().getPayout(c.payout.batchId).catch(() => null);
    if (!r?.item) continue;
    c.payout.item = r.item; save();
    if (r.item !== "SUCCESS") say(c, "payout_unclaimed", `PayPal says the payout for claim ${c.number} was ${r.item.toLowerCase()}: add a PayPal email on your account and Cover sends it again.`);
  }
}

export function view(c, { staff = false, lang = "en" } = {}) {
  // (a claim whose type a later product version dropped still shows, under its own type id)
  const p = product(c.product), ct = claimType(c.product, c.type) || { en: c.type, zh: c.type, evidence: [] }, d = c.decision, L = (x) => (lang === "zh" ? tr(x) : x);
  return { claim: c.id, number: c.number, policy: c.policy, product: c.product, type: c.type, what: ct[lang] || ct.en, status: c.status, happenedAt: c.happenedAt, reportedAt: c.reportedAt, claimed: usd(c.claimed),
    ...(c.status === "needs_evidence" ? { missing: missingEvidence(c), next: "Add the missing evidence (add_claim_evidence)." } : {}),
    ...(c.status === "needs_info" ? { asked: c.asked } : {}),
    decision: d && { outcome: d.outcome, amount: usd(d.amount), reason: L(d.reason), by: d.by, at: d.at, basis: d.basis.map((id) => ({ id, text: clause(id)?.[lang] || clause(id)?.en })),
      checks: d.checks.map((x) => ({ check: x.id, ok: x.ok, hard: !!x.hard, clause: x.clause, says: L(x.says) })), steps: d.steps.map((s) => ({ ...s, says: L(s.says), amount: usd(s.amount) })), ...(staff || d.outcome !== "refer" ? { signals: d.signals.map((g) => ({ ...g, says: L(g.says) })) } : { signals: d.signals.length ? (lang === "zh" ? `有 ${d.signals.length} 件事需要真人確認` : `${d.signals.length} thing(s) for a person to check`) : [] }) },
    ...(c.payout ? { payout: { amount: usd(c.payout.amount), to: c.payout.to, paypal: c.payout.batchId, status: c.payout.item || c.payout.status, secondsToPay: c.secondsToPay } } : {}),
    evidence: c.evidence.map((e) => ({ id: e.id, kind: e.kind, name: e.name, at: e.at, ...(e.exif?.taken ? { taken: e.exif.taken } : {}), ...(e.read && !e.read.error ? { read: { date: e.read.date, amount: e.read.amount != null ? usd(e.read.amount) : null, merchant: e.read.merchant, confidence: e.read.confidence, by: e.read.by } } : {}) })),
    ...(staff ? { story: c.story, items: c.items.map((x) => ({ what: x.what, value: usd(x.value) })), person: c.person, history: c.history } : {}),
    appeal: c.appeal || null, receipts: c.receipts || [] };
}
