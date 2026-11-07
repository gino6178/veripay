import { clockInfo } from "./clock.js";
// The tools agents use, the same over MCP (mcp.js), REST (/api/agent/<tool>) and A2A (/a2a).
//   Customer's agent (Bearer done_..., scopes read / hire / pay): post_job, job_status, my_jobs, list_offers,
//     counter_offer, accept_offer (holds the money at once), approve_change, decline_change, release, request_fix,
//     open_dispute, cancel_job, my_limits, whoami, wait_for_news
//   Pro's agent (Bearer dpk_..., A2A): list_jobs, offer, counter, accept, decline, start_work, request_change,
//     submit_evidence, job_status, payout_status
// Amounts agents send are US dollars; what comes back carries cents and a formatted "$12.34". No tool takes a payee:
// money goes only to the pro's verified PayPal, set by the pro on the website. Any payee-like field is ignored and
// the answer says so.
import * as J from "./jobs.js";
import { person, limitsOf, viewPerson } from "./people.js";
import * as people from "./people.js";
import { reviewScope } from "./ai.js";
import { personLink } from "./auth.js";
import { readFile } from "./evidence.js";
// a way onto the website for the pro's person, every time it's asked: the onboarding link before anyone signed in, else
// a fresh one-time sign-in link for that person (the dpk key's holder is the pro)
const signInFor = (p) => (p.person ? { signIn: personLink(p.person, { to: "/pro", what: `sign in as ${p.name} on the website (payout PayPal, licence, insurance, rates)` }), onboarding: null } : { onboarding: onboardingLink(p.id), signIn: null });
// the person, not the agent, decides this milestone (in review, and the agent may not release or confirm)
const personDecides = (a, j) => ["review"].includes(j.status) && !limitsOf(person(a.person)).agentMayRelease;
import { pro as getPro, viewPro, readiness as readinessOf, onboardingLink, setRates, setAvailability, setProSettings } from "./pros.js";
import { forPerson, onActivity, activityStore } from "./activity.js";
import { usd, toCents } from "./pay/index.js";

const PAYEE_FIELDS = ["payee", "payees", "receiver", "email", "paypal", "paypalEmail", "payoutEmail", "payTo", "pay_to", "recipient"];
const guard = (args = {}) => { const bad = PAYEE_FIELDS.filter((k) => k in (args || {})); return bad.length ? { ignored: bad, payeeRule: "Payouts go only to the pro's verified PayPal, set by the pro on the website. Agents can't set or change a payee; those fields were ignored." } : null; };
const withGuard = (args, r) => { const g = guard(args); return g && r && typeof r === "object" ? { ...r, ...g } : r; };
const actorOf = (a) => ({ kind: "agent", person: a.person, client: a.client || "agent" });
const mine = (a, id) => { const j = J.job(String(id || "")); return j && j.customer === a.person ? j : null; };
// a job the person pays for (landlord or customer) or posted as its tenant: read-only and tenant tools only
const party = (a, id) => { const j = J.job(String(id || "")); return j && (j.customer === a.person || j.tenant === a.person) ? j : null; };
const asOf = (a, j) => (j.tenant === a.person && j.customer !== a.person ? "tenant" : "agent");
const notFound = { error: "not_found", message: "No such job for your person: my_jobs lists theirs." };
const v = (r, as = "agent") => (r?.error ? r : r?.customer && r?.timeline ? J.view(r, { as }) : r?.job ? { ...J.view(r.job, { as }), ...(r.offer ? { offer: r.offer.id } : {}), ...(r.change ? { change: r.change.id } : {}), ...(r.waiting ? { waiting: "their agent answers over A2A; check list_offers" } : {}) } : r);
const dollars = (x, name) => { const c = toCents(x); return c == null || c < 0 ? { error: "amount", message: `${name} is a number of US dollars.` } : c; };

export function limitsView(p) {
  const L = limitsOf(p), spent = J.spentThisMonth(p.id);
  return { perJobMax: usd(L.perJobMax), monthlyMax: usd(L.monthlyMax), spentThisMonth: usd(spent), leftThisMonth: usd(Math.max(0, L.monthlyMax - spent)), changeMax: usd(L.changeMax), materialsAdvanceMax: usd(L.materialsAdvanceMax), bufferPct: L.bufferPct,
    agentMayRelease: L.agentMayRelease, agentMayCancel: L.agentMayCancel, requireMandate: !!L.requireMandate, cents: { perJobMax: L.perJobMax, monthlyMax: L.monthlyMax, spentThisMonth: spent, changeMax: L.changeMax, materialsAdvanceMax: L.materialsAdvanceMax },
    rule: "Only your person changes these, on the website. Payouts go only to the pro's verified PayPal." };
}

export const CUSTOMER = {
  whoami: (a) => { const p = person(a.person); return { person: viewPerson(p), you: { client: a.client, scopes: a.scopes, token: a.token, agentClient: a.token, requireMandate: !!a.requireMandate }, limits: limitsView(p) }; },
  my_limits: (a) => limitsView(person(a.person)),
  my_jobs: (a) => J.jobsOf(a.person).map((j) => ({ id: j.id, number: j.number, status: j.status, title: j.scope?.title, due: J.money(J.due(j)), pro: j.agreed?.proName || null, next: J.view(j).next, updated: j.updated })),
  job_status: (a, x) => { const jt = party(a, x.job); if (jt && asOf(a, jt) === "tenant") return J.view(jt, { as: "tenant" }); const j = mine(a, x.job); if (!j) return notFound; const v = J.view(j, { as: "agent" });
    const big = j.changeOrders.find((c) => c.status === "pending" && !c.agentMayApprove);
    if (big) return { ...v, askPerson: personLink(a.person, { to: `/jobs/${j.id}`, what: `approve or decline the change order +${usd(big.amount)} on ${j.number} (above your agent's limit: the person decides)`, limit: "changeMax", job: { id: j.id, number: j.number } }) };
    return personDecides(a, j) ? { ...v, askPerson: personLink(a.person, { to: `/jobs/${j.id}`, what: `look at the evidence for ${j.number} and confirm, release, ask for a fix or dispute`, limit: "agentMayRelease", job: { id: j.id, number: j.number } }) } : v; },
  // the job's evidence for the customer's agent: each item with its camera data and a URL the agent can fetch with its
  // own token (Authorization: Bearer done_...); include: "data" adds small images as data: URLs
  job_evidence: (a, x = {}) => {
    const j = mine(a, x.job);
    if (!j) return notFound;
    const items = J.view(j, { as: "agent" }).evidence.map((e) => ({ ...e, exifSummary: e.exif ? `${e.exif.taken ? `taken ${e.exif.taken}` : "no camera time"}${e.exif.lat != null ? `, at ${e.exif.lat.toFixed(5)}, ${e.exif.lng.toFixed(5)}` : ", no GPS"}` : e.kind === "note" ? null : "no camera data" }));
    if (x.include === "data") for (const e of items) { const raw = J.job(j.id).evidence.find((y) => y.id === e.id); if (raw?.path && raw.size <= 1.5e6) { const b = readFile(raw); if (b) e.dataUrl = `data:${raw.mime};base64,${b.toString("base64")}`; } }
    return { job: j.id, number: j.number, evidence: items, howToFetch: "GET each url with your token (Authorization: Bearer done_...)." };
  },
  list_offers: (a, x) => { const j = party(a, x.job); if (!j) return notFound; const vw = J.view(j); return { job: j.id, status: j.status, priceCeiling: vw.scope.priceCeiling, offers: vw.offers.filter((o) => ["open", "countered", "accepted"].includes(o.status)), thread: vw.thread.slice(-20), rules: "Counter once per offer (the pro's agent may counter back once), then accept_offer: accepting holds the price plus the buffer with PayPal at once." }; },
  async post_job(a, x = {}) {
    if (x.text == null && (x.description != null || x.problem != null)) x = { ...x, text: x.description ?? x.problem };
    const budget = x.budget != null ? dollars(x.budget, "budget") : null;
    if (budget?.error) return budget;
    const opts = { ...(x.options || {}) }, ms = opts.milestones ?? x.milestones;
    delete opts.milestones;
    if (opts.inspector && people.person(opts.inspector)?.role !== "inspector") return { error: "inspector", message: "options.inspector is an id from GET /api/inspectors." };
    // a tenant posts for their landlord: the landlord is the job's payer (j.customer); the tenant documents it
    const me = person(a.person), forL = x.forLandlord === true;
    if (forL && !me?.landlord) return { error: "landlord", message: "Your person isn't linked to a landlord: they link on the website (Tenancy) with their landlord's invite code, or the demo landlord." };
    const j = await J.createJob(forL ? me.landlord.id : a.person, { text: x.text, zip: x.zip, address: x.address, budget, bufferPct: x.bufferPct, options: opts, actor: actorOf(a), ...(forL ? { tenant: a.person } : {}) });
    if (j.error) return j;
    if (Array.isArray(ms)) { const e = J.editScope(j.id, { milestones: ms }, actorOf(a)); if (e?.error) return e; if (!J.job(j.id).scope.milestones) return { ...J.view(J.job(j.id), { as: "agent" }), warning: "The milestones weren't usable (2 to 8, each with a title and share, and either checks: [{what, evidence}] or checkIds from the scope): the job was posted as one milestone. set_options {job, options: {milestones}} can set them before offers are asked for." }; }
    else if (ms === "none") J.editScope(j.id, { milestones: null }, actorOf(a));
    if (x.offers !== false) await J.requestOffers(j.id, actorOf(a));
    return withGuard(x, J.view(J.job(j.id), { as: forL ? "tenant" : "agent" }));
  },
  request_offers: async (a, x) => { const j = mine(a, x.job); return j ? v(await J.requestOffers(j.id, actorOf(a))) : notFound; },
  // nearby pros and businesses, and asking them (pros on VeriPay directly; listed businesses: an invitation the person sends)
  find_nearby_pros: (a, x = {}) => { const j = party(a, x.job); if (!j) return notFound; return J.findNearby(j.id, { radiusMi: Math.min(+x.radius || 15, 40), limit: Math.min(+x.limit || 8, 20) }, { ...actorOf(a), person: j.customer }); },
  async check_reviews(a, x = {}) { const j = party(a, x.job); if (!j) return notFound; return J.checkReviews(j.id, { ids: x.ids }, { ...actorOf(a), person: j.customer }); },
  async ask_pros(a, x = {}) { const j = mine(a, x.job); if (!j) return notFound; return J.askPros(j.id, { to: x.to, question: x.question }, actorOf(a)); },
  // the negotiation layer: rounds both sides' agents take, inside the rules code enforces
  negotiation: (a, x = {}) => { const j = mine(a, x.job); if (!j) return notFound; return J.negotiationOf(j.id, x.offer, actorOf(a)); },
  async propose_price(a, x = {}) { const j = mine(a, x.job); if (!j) return notFound; const c = dollars(x.amount, "amount"); if (c?.error) return c; const r = await J.negotiate(j.id, x.offer, { move: "propose", amount: c, note: x.note }, actorOf(a)); return r?.error ? r : r.negotiation; },
  async accept_price(a, x = {}) { const j = mine(a, x.job); if (!j) return notFound; const r = await J.negotiate(j.id, x.offer, { move: "accept" }, actorOf(a)); return r?.error ? r : r.negotiation; },
  async set_hold_buffer(a, x = {}) { const j = mine(a, x.job); if (!j) return notFound; const r = await J.setPendingBuffer(j.id, { bufferPct: x.bufferPct }, actorOf(a)); return r?.error ? r : { job: j.id, number: j.number, amount: J.money(r.amount), was: r.was != null ? J.money(r.was) : null, approveUrl: r.approveUrl || null, unchanged: !!r.unchanged }; },
  async walk_away(a, x = {}) { const j = mine(a, x.job); if (!j) return notFound; const r = await J.negotiate(j.id, x.offer, { move: "walk_away" }, actorOf(a)); return r?.error ? r : r.negotiation; },
  async counter_offer(a, x = {}) { const j = mine(a, x.job); if (!j) return notFound; const c = dollars(x.amount, "amount"); if (c?.error) return c; return withGuard(x, v(await J.counterOffer(j.id, x.offer, c, actorOf(a)))); },
  set_options: (a, x = {}) => { const j = mine(a, x.job); return j ? v(J.setOptions(j.id, x.options || {}, actorOf(a))) : notFound; },
  // take the last review_scope suggestion for this job (before an offer is accepted; pros with offers are told)
  apply_scope_suggestion: async (a, x = {}) => {
    const j = mine(a, x.job); if (!j) return notFound;
    const had = j.offers.length > 0 || j.status === "offered";
    if (x.suggestion === "all") return { error: "limit", limit: "scopeChange", message: "Applying every suggestion at once is your person's decision: apply them one by one (g1, g2...) when they only add or clarify, or ask your person." };
    const r = x.suggestion ? J.applySuggestion(j.id, x.suggestion, actorOf(a)) : J.applyRevision(j.id, x.from || "suggestion", actorOf(a));
    if (r?.error) return r;
    // the pros quote the new scope: offers are asked for again at once (unless offers: false)
    let asked = null;
    if (had && x.offers !== false && J.job(j.id).status === "scoped") { const q = await J.requestOffers(j.id, actorOf(a)); asked = q?.error ? q.message : "Offers asked for again: the pros quote the changed scope."; }
    return { ...v(J.job(j.id)), changed: J.job(j.id).scope.lastChange || null, offersAgain: asked || (J.job(j.id).status === "scoped" ? "Call request_offers {job} when the scope is ready." : null) };
  },
  async review_scope(a, x = {}) {
    const j = x.job ? mine(a, x.job) : null;
    if (x.job && !j) return notFound;
    const scope = j ? j.scope : x.scope;
    if (!scope?.checks) return { error: "scope", message: "Send job, or scope (as post_job's answer gives it)." };
    const r0 = await reviewScope({ scope, agreed: j?.agreed || null }, { proReply: x.proReply || null });
    // every suggestion gets an id the agent can apply (apply_scope_suggestion {job, suggestion: "g1" | "all"})
    const done = (j?.scopeSuggestion?.gaps || []).filter((g) => g.applied), key = (g) => String(g.suggestion || g.what || "").trim().toLowerCase();
    const inScope = (g) => scope.checks.some((c) => String(c.what || "").trim().toLowerCase() === key(g) || (g.suggestion && String(c.what || "").toLowerCase() === key(g).replace(/^add (a |an )?/, "")));
    const fresh = (r0.gaps || []).filter((g) => !done.some((d) => key(d) === key(g)) && !inScope(g)), dropped = (r0.gaps || []).length - fresh.length;
    const r = { ...r0, gaps: fresh.map((g, i) => ({ id: `g${i + 1}`, ...g, applicable: !!(g.suggestion || g.what) })), ...(dropped ? { alreadyApplied: dropped } : {}), ...(dropped && !fresh.length ? { ok: true } : {}) };
    if (j) { J.job(j.id).scopeSuggestion = { ...r, at: new Date().toISOString() }; J.jobsStore.save(); }
    return { job: j?.id || null, ...r, ...(j && (r.revisedScope || r.gaps.length) ? { next: `apply_scope_suggestion {job, suggestion: "g1".."g${r.gaps.length}" or "all"}${r.revisedScope ? ", or without suggestion for the whole revised scope" : ""} (until an offer is accepted).` } : {}) };
  },
  async retry_hold(a, x = {}) { const j = mine(a, x.job); return j ? v(await J.retryHold(j.id, actorOf(a), { payWith: x.payWith || null })) : notFound; },
  async accept_offer(a, x = {}) { const j = mine(a, x.job); if (!j) return notFound; const r = withGuard(x, v(await J.acceptOffer(j.id, x.offer, { actor: actorOf(a), payWith: x.payWith || null, slot: x.slot ?? null }))); return r?.hold ? { ...r, paidWith: r.hold.paidWith, ...(r.hold.note ? { note: r.hold.note } : {}) } : r; },
  async approve_change(a, x = {}) { const j = mine(a, x.job); return j ? withGuard(x, v(await J.approveChange(j.id, x.change, actorOf(a)))) : notFound; },
  approve_materials_advance: async (a, x = {}) => { const j = mine(a, x.job); return j ? v(await J.approveMaterialsAdvance(j.id, x.change, actorOf(a))) : notFound; },
  decline_materials_advance: (a, x = {}) => { const j = mine(a, x.job); return j ? v(J.declineMaterialsAdvance(j.id, x.change, actorOf(a), x.note)) : notFound; },
  async get_report(a, x = {}) {
    const j = party(a, x.job); if (!j) return notFound;
    const R = await import("./reports.js"), kind = x.kind || "closeout";
    if (kind === "insurance") { const d = R.insuranceClaim(j); return d.error ? d : { ...d.data, html: `/api/jobs/${j.id}/reports/insurance.html`, pdf: `/api/jobs/${j.id}/reports/insurance.pdf` }; }
    if (kind === "progress") { const m = j.milestones.find((y) => y.id === (x.milestone || j.milestones.filter((z) => z.release).at(-1)?.id)); if (!m?.release) return { error: "state", message: "A progress report is made when a milestone is paid." }; return { ...R.progressReport(j, m).data, html: `/api/jobs/${j.id}/reports/progress/${m.id}.html` }; }
    if (kind === "daily") return { ...(await R.dailyLogWithWeather(j)).data, html: `/api/jobs/${j.id}/reports/daily.html` };
    return { ...R.closeout(j).data, html: `/api/jobs/${j.id}/reports/closeout.html`, pdf: `/api/jobs/${j.id}/reports/closeout.pdf`, note: "The links open on the website for your person (signed in)." };
  },
  decline_change: (a, x = {}) => { const j = mine(a, x.job); return j ? v(J.declineChange(j.id, x.change, actorOf(a), x.note)) : notFound; },
  async release(a, x = {}) { const j = mine(a, x.job); return j ? withGuard(x, v(await J.release(j.id, actorOf(a), { milestone: x.milestone || null, acknowledgeFailed: x.acknowledgeFailed || null }))) : notFound; },
  request_fix: (a, x = {}) => { const j = mine(a, x.job); return j ? v(J.requestFix(j.id, x.reason, actorOf(a), { milestone: x.milestone || null })) : notFound; },
  async open_dispute(a, x = {}) { const j = mine(a, x.job); return j ? v(await J.openDispute(j.id, x.reason, actorOf(a), { milestone: x.milestone || null })) : notFound; },
  async confirm_checks(a, x = {}) {
    const j = mine(a, x.job); if (!j) return notFound;
    const c0 = J.balance(j).captured || 0, r = await J.confirm(j.id, actorOf(a), { milestone: x.milestone || null, checkIds: Array.isArray(x.checkIds) ? x.checkIds : null, fixIds: Array.isArray(x.fixIds) ? x.fixIds : null, fix: x.fix || null });
    if (r?.error) return r;
    const b = J.balance(J.job(j.id)), got = (b.captured || 0) - c0;
    return { ...v(r), paid: got > 0 ? `Confirming paid now: ${usd(got)} captured; the pro is paid from it (see money.releases).` : "Confirmed: the money is paid when the review window, inspector or retainage allows (see next)." };
  },
  async claim_defect(a, x = {}) { const j = mine(a, x.job); return j ? v(await J.claimDefect(j.id, { reason: x.reason, items: x.items || [] }, actorOf(a))) : notFound; },
  async tip(a, x = {}) { const j = mine(a, x.job); if (!j) return notFound; const c = dollars(x.amount, "amount"); if (c?.error) return c; const r = await J.tip(j.id, { amount: c, payWith: x.payWith || null }, actorOf(a)); return r?.error ? r : { ...v(r), tip: r.tip.id, ...(r.tip.approveUrl ? { approveUrl: r.tip.approveUrl } : {}) }; },
  reschedule: (a, x = {}) => { const j = mine(a, x.job); if (!j) return notFound; const r = J.reschedule(j.id, { from: x.from, reason: x.reason }, actorOf(a)); return r?.error ? r : { ...v(r), ...(r.rescheduled ? { rescheduled: r.rescheduled } : { proposal: r.proposal, ...(r.answeredBy ? { answeredBy: r.answeredBy } : {}) }) }; },
  answer_reschedule: (a, x = {}) => { const j = mine(a, x.job); return j ? v(J.answerReschedule(j.id, x.proposal, { accept: x.accept === true, note: x.note }, actorOf(a))) : notFound; },
  hold_options: (a, x = {}) => { const j = mine(a, x.job); return j ? J.holdOptions(j) : notFound; },
  my_inbox: async (a, x = {}) => (await import("./inbox.js")).inboxOf(a.person, { unread: !!x.unread, after: x.after || 0 }),
  tenant_note: (a, x = {}) => { const j = party(a, x.job); if (!j) return notFound; const r = J.tenantNote(j.id, x.text, actorOf(a)); return r?.error ? r : J.view(r.job, { as: "tenant" }); },
  suggest_offer: (a, x = {}) => { const j = party(a, x.job); if (!j) return notFound; const r = J.tenantPick(j.id, x.offer, actorOf(a)); return r?.error ? r : J.view(r.job, { as: "tenant" }); },
  // the home profile and its maintenance agent (home.js), neighborhood groups (groups.js)
  my_home: async (a) => (await import("./home.js")).homeOf(a.person),
  maintenance_suggestions: async (a) => ({ suggestions: (await import("./home.js")).suggestionsFor(a.person), rule: "Rules on your person's home record (age, last service, warranty dates). accept_suggestion {suggestion} posts it as a job within your person's limits." }),
  async accept_suggestion(a, x = {}) { const H = await import("./home.js"); const b = x.budget != null ? dollars(x.budget, "budget") : null; if (b?.error) return b; const r = await H.acceptSuggestion(a.person, x.suggestion, actorOf(a), { budget: b }); return r.error ? r : { ...J.view(r.job, { as: "agent" }), suggestion: r.suggestion.id }; },
  list_groups: async (a, x = {}) => { const G = await import("./groups.js"); return { groups: G.openGroupsNear(x.zip || person(a.person)?.zip, x.type || null).map((g) => G.viewGroup(g, a.person)) }; },
  async open_group(a, x = {}) { const G = await import("./groups.js"); const r = G.openGroup(x.job, actorOf(a)); return r.error ? r : G.viewGroup(r.group, a.person); },
  async join_group(a, x = {}) { const G = await import("./groups.js"); const b = x.budget != null ? dollars(x.budget, "budget") : null; if (b?.error) return b; const r = await G.joinGroup(x.group, actorOf(a), { job: x.job || null, text: x.text || null, budget: b }); return r.error ? r : { ...G.viewGroup(r.group, a.person), job: J.view(r.job, { as: "agent" }) }; },
  async mandate_template(a, x = {}) {
    const M = await import("./proof/mandates.js");
    if (x.job && !mine(a, x.job)) return notFound;
    const p = M.template({ payer: a.person, agentClient: a.token, maxAmount: x.maxAmount, scope: [x.action], jobId: x.job || null, minutes: x.minutes || 60 });
    if (p.error) return p;
    return { payload: p, sign: M.payloadBytes(p).toString("utf8"), how: "Your person signs the exact UTF-8 bytes of `sign` (the payload's canonical JSON: keys sorted, no spaces) with their Ed25519 private key; the public key is registered on the website (POST /api/mandates/keys, PIN). Send { mandate: { payload, signature: base64url } } with the action. One use; it expires. Without a key, your person issues one on the website (POST /api/mandates/issue, PIN): a demo path signed by the server's per-person key.", signedFor: { payer: a.person, agentClient: a.token } };
  },
  async cancel_job(a, x = {}) { const j = mine(a, x.job); return j ? v(await J.cancel(j.id, actorOf(a), x.reason)) : notFound; },
  // waits (up to 50 s) for something new for the person: an offer, a counter answer, a change order, a check, a payout
  async wait_for_news(a, x = {}) {
    const after = Math.max(0, +x.after || 0), seconds = Math.max(1, Math.min(50, +x.seconds || 30));
    const now = () => forPerson(a.person, { after });
    const jobs = () => J.jobsOf(a.person).filter((j) => !["cancelled", "expired"].includes(j.status)).slice(0, 10).map((j) => ({ job: j.id, number: j.number, status: j.status, waitingOn: J.waitingOn(j), next: J.view(j).next }));
    if (now().length) return { events: now(), last: now().at(-1).id, jobs: jobs() };
    await new Promise((res) => { const t = setTimeout(done, seconds * 1000); const off = onActivity((e) => { if (e.who.includes(a.person) && e.id > after) done(); }); function done() { clearTimeout(t); off(); res(); } });
    const e = now();
    return { events: e, last: e.at(-1)?.id ?? after, jobs: jobs() };
  },
};

// ---- view: "summary" (MCP's default): the job in brief; view: "full" for everything ----------------------------------
const u = (m) => (m && typeof m === "object" && "usd" in m ? m.usd : m ?? null);
export function summarize(r) {
  if (!r || typeof r !== "object" || r.error) return r;
  if (Array.isArray(r)) return r.map(summarize);
  if (!(typeof r.id === "string" && r.id.startsWith("job_") && r.status)) {
    // lists of jobs inside (wait_for_news, my_jobs) stay as they are; a job inside { job: {...} } is summarized
    return r.job && typeof r.job === "object" && r.job.id ? { ...r, job: summarize(r.job) } : r;
  }
  const j = r, open = (j.offers || []).filter((o) => ["open", "countered"].includes(o.status));
  const known = new Set(["id", "number", "status", "text", "created", "updated", "address", "scope", "offers", "thread", "agreed", "hold", "changeOrders", "evidence", "checks", "lastCheck", "money", "milestones", "timeline", "next", "waitingOn", "due", "flow", "options", "risk", "warranty", "dispute", "receipts", "submissions", "clock", "queue", "ratings", "scopeReview", "warnings", "budget", "bufferPct"]);
  const extra = Object.fromEntries(Object.entries(j).filter(([k]) => !known.has(k)));
  return {
    view: "summary", id: j.id, number: j.number, status: j.status, title: j.scope?.title || null, next: j.next || null, waitingOn: j.waitingOn || null,
    priceCeiling: u(j.scope?.priceCeiling), due: u(j.due),
    conditions: (j.scope?.checks || []).map((c) => ({ id: c.id, what: c.what, evidence: c.evidence, ...(c.doc ? { doc: c.doc } : {}) })),
    ...(j.scope?.milestones?.length || j.milestones?.length ? { milestones: (j.milestones?.length ? j.milestones : j.scope.milestones).map((m) => ({ id: m.id, title: m.title, status: m.status || null, amount: u(m.amount), checkIds: m.checkIds })) } : {}),
    ...(open.length ? { offers: open.map((o) => ({ id: o.id, pro: o.pro?.name || o.proName || null, amount: u(o.amount), parts: u(o.parts), arrival: o.arrival || null, status: o.status, acceptable: o.acceptable ?? null, acceptableWhy: o.acceptableWhy || null })) } : {}),
    ...(j.agreed ? { hired: { pro: j.agreed.pro?.name || j.agreed.proName || null, price: u(j.agreed.price), parts: u(j.agreed.parts) } } : {}),
    ...(j.hold ? { hold: { status: j.hold.status, amount: u(j.hold.amount), buffer: u(j.hold.buffer), explain: j.hold.explain || null, approveUrl: j.hold.approveUrl || null } } : {}),
    ...((j.changeOrders || []).some((c) => c.status === "pending") ? { changeOrders: j.changeOrders.filter((c) => c.status === "pending").map((c) => ({ id: c.id, amount: u(c.amount), reason: c.reason, needs: c.needs || null })) } : {}),
    ...(j.lastCheck ? { lastCheck: { decision: j.lastCheck.decision, checker: j.lastCheck.checker || null, notPassed: (j.lastCheck.checks || []).filter((c) => c.verdict !== "pass").map((c) => ({ id: c.id, verdict: c.verdict, reason: c.reason })) } } : {}),
    ...(j.money && u(j.money.captured) ? { money: { captured: u(j.money.captured), refunded: u(j.money.refunded), payout: j.money.payout ? { status: j.money.payout.status, says: j.money.payout.says } : null } } : {}),
    ...extra, full: "Send view: \"full\" for the whole job (scope, thread, evidence, ledger, timeline).",
  };
}

// ---- a pro's agent ---------------------------------------------------------------------------------------------------
const proActor = (p, client = "pro agent") => ({ kind: "pro_agent", pro: p.id, client });
const offerJob = (offerId) => J.allJobs().find((y) => y.offers.some((o) => o.id === offerId)) || null;
const noOffer = { error: "not_found", message: "No such offer." };
const theirs = (p, id) => { const j = J.job(String(id || "")); return j && (j.agreed?.pro === p.id || j.offers.some((o) => o.pro === p.id) || (["scoped", "offered"].includes(j.status) && j.scope?.trade === p.trade)) ? j : null; };
const proView = (j, p) => J.view(j, { as: "pro", pro: p?.id || null });
const ok = (p, r) => (r?.error ? r : r?.job ? { ...proView(r.job, p), ...(r.warning ? { warning: r.warning, readiness: r.readiness } : {}), ...(r.offer ? { offer: r.offer.id } : {}), ...(r.change ? { change: r.change.id } : {}) } : r?.customer && r?.timeline ? proView(r, p) : r);
// the arguments each pro action takes (plus view); anything else is refused with the list. Payout routing (PayPal
// emails, the helper and their share) is never among them: only the pro changes it, on the website, with their PIN.
export const PRO_ARGS = { add_parts_tracking: ["job", "carrier", "trackingNumber", "note"], negotiation: ["offer"], propose_price: ["offer", "amount", "note"], accept_price: ["offer"], walk_away: ["offer"], my_inquiries: [], readiness: [], my_profile: [], whoami: [], list_jobs: ["since", "radius"], set_rates: ["callout", "hourly", "perMile", "freeMiles", "radius", "lead", "rush", "floor", "crew", "partsPolicy"], wait_for_news: ["after", "seconds", "since"], job_status: ["job"], offer: ["job", "amount", "arrival", "slots", "note", "helper", "parts", "partsPolicy"], counter: ["offer", "amount", "parts", "partsPolicy"], accept: ["offer"], decline: ["offer"], withdraw_change: ["job", "change"], withdraw_offer: ["offer"], start_work: ["job", "before"], scope_reply: ["job", "text"], add_before: ["job", "items"], early_pay: ["job", "milestone"], fix_defect: ["job", "items"], request_change: ["job", "amount", "reason", "evidence", "kind"], submit_evidence: ["job", "items", "submit", "milestone", "dryRun"], payout_status: ["job"], ask_for_review: ["job", "checkId", "note"], reschedule: ["job", "from", "reason"], answer_reschedule: ["job", "proposal", "accept", "note"], set_availability: ["weekly", "blocked", "visitMinutes"], my_availability: [], set_language: ["lang"], my_dashboard: ["months"], my_work_record: [], request_materials_advance: ["job", "change", "items", "supplierEmail"], export_books: ["month", "year", "format"], return_materials: ["job", "change", "amount", "note"] };
export function unknownProArgs(action, args) {
  const ok = PRO_ARGS[action];
  if (!ok || !args || typeof args !== "object") return null;
  const bad = Object.keys(args).filter((k) => k !== "view" && !ok.includes(k));
  return bad.length ? { error: "arguments", message: `${action} doesn't take ${bad.join(", ")}. It takes: ${ok.join(", ") || "nothing"}.${bad.some((k) => PAYEE_FIELDS.includes(k) || /helper|payout|paypal/i.test(k)) ? " Where you're paid is changed only by the pro on the website, with their PIN." : ""}`, unknown: bad, allowed: ok } : null;
}
export const PRO = {
  // what blocks hiring, and the website link the pro (the person) must open to fix it
  readiness: (p) => ({ ...readinessOf(p), ...signInFor(p) }),
  my_profile: (p) => ({ clock: clockInfo(), pro: viewPro(p, { self: true }), readiness: { ...readinessOf(p), ...signInFor(p) }, jobs: J.jobsOfPro(p.id).filter((j) => j.agreed?.pro === p.id).map((j) => ({ id: j.id, number: j.number, status: j.status, waitingOn: J.waitingOn(j) })) }),
  whoami: (p) => ({ pro: viewPro(p), payoutRule: "You're paid only to the PayPal you verified on the website; no agent can change it." }),
  list_jobs: (p, x = {}) => J.feedFor(p, { since: x.since || null, radius: x.radius || null }),
  set_rates: (p, x = {}) => setRates(p.id, x),
  // waits (up to 50 s) for news for this pro: new jobs in the feed, answers to offers, hires, check results, payouts
  async wait_for_news(p, x = {}) {
    const after = Math.max(0, +x.after || 0), seconds = Math.max(1, Math.min(50, +x.seconds || 30));
    // hired: everything after the hire; an offer still open: the negotiation; the feed: new jobs in the trade and radius
    const hired = (ref) => J.job(ref)?.agreed?.pro === p.id, offering = (ref) => !!J.job(ref)?.offers.some((o) => o.pro === p.id && ["open", "countered"].includes(o.status));
    const feedIds = () => new Set(J.openFor(p).map((f) => f.id));
    const why = (e) => {
      if (!(e.id > after && e.ref?.startsWith?.("job_"))) return null;
      if (hired(e.ref) && ["job_agreed", "money_held", "counter_sent", "change_approved", "change_declined", "fix_requested", "dispute_opened", "checked", "money_released", "dispute_resolved", "job_cancelled", "confirmed", "hold_pending", "payout_sent", "payout_failed", "defect_claimed", "scope_review"].includes(e.action)) return "your job";
      if (e.data?.pro === p.id && (hired(e.ref) || offering(e.ref) || ["offer_declined", "offer_expired", "job_agreed", "terms_changed"].includes(e.action))) return "your offer";
      if (offering(e.ref) && ["counter_sent", "terms_changed", "job_agreed", "job_cancelled"].includes(e.action)) return "your offer";
      if (["job_scoped", "offers_requested"].includes(e.action) && feedIds().has(e.ref)) return "new in your feed";
      return null;
    };
    const relevant = (e) => !!why(e);
    const now = () => activityStore.data.entries.filter(relevant).slice(-50).map((e) => ({ id: e.id, at: e.at, action: e.action, job: e.ref, number: J.job(e.ref)?.number, summary: e.summary, why: why(e) }));
    if (!now().length) await new Promise((res) => { const t = setTimeout(done, seconds * 1000); const off = onActivity((e) => { if (relevant(e)) done(); }); function done() { clearTimeout(t); off(); res(); } });
    const ev = now();
    return { events: ev, last: ev.at(-1)?.id ?? Math.max(after, activityStore.data.entries.at(-1)?.id || 0), feed: J.feedFor(p, { since: x.since || null }).jobs.slice(0, 10), clock: clockInfo() };
  },
  job_status: (p, x) => { const j = theirs(p, x.job); return j ? proView(j, p) : notFound; },
  // scheduling (calendar.js): the pro's hours, and moving a hired job's visit
  set_availability: async (p, x = {}) => { const C = await import("./calendar.js"); const av = C.cleanAvailability(x); if (av.error) return av; setAvailability(p.id, av); return { availability: av, says: C.hoursText(av), tz: C.TZ }; },
  my_availability: async (p) => { const C = await import("./calendar.js"); const av = C.availabilityOf(p); return { availability: av, says: C.hoursText(av), tz: C.TZ, next: C.freeSlots(av, { minutes: C.visitMinutes(p, null), count: 5 }) }; },
  reschedule: (p, x = {}, client) => { const r = J.reschedule(String(x.job || ""), { from: x.from, reason: x.reason }, proActor(p, client)); return r?.error ? r : { ...proView(r.job, p), ...(r.rescheduled ? { rescheduled: r.rescheduled } : { proposal: r.proposal }) }; },
  answer_reschedule: (p, x = {}, client) => ok(p, J.answerReschedule(String(x.job || ""), x.proposal, { accept: x.accept === true, note: x.note }, proActor(p, client))),
  // the earnings dashboard and the verifiable work record (PLAN §16)
  my_dashboard: async (p, x = {}) => { const { months, ...d } = (await import("./prodash.js")).dashboard(p.id, { months: x.months || 12 }); return d; },
  my_work_record: async (p) => (await import("./workrecord.js")).workRecord(p.id),
  // the language everything the API says to this pro is in (PLAN §15 item 5)
  set_language: (p, x = {}) => { const r = setProSettings(p.id, { lang: x.lang }); return r.error ? r : { lang: r.lang, says: r.lang === "es" ? "Listo: desde ahora le respondemos en español." : "Done: answers are in English from now on." }; },
  offer: (p, x = {}, client) => { const j = theirs(p, x.job); if (!j) return notFound; const c = dollars(x.amount, "amount"); if (c?.error) return c; const pc = x.parts != null ? dollars(x.parts, "parts") : null; if (pc?.error) return pc; return withGuard(x, ok(p, J.proOffer(p.id, j.id, { amount: c, arrival: x.arrival, slots: x.slots ?? null, helper: x.helper !== false, note: x.note, parts: pc, partsPolicy: x.partsPolicy ?? null }, proActor(p, client)))); },
  // the negotiation layer, the pro's side (its own offers only)
  negotiation: (p, x = {}, client) => { const j = offerJob(x.offer); return j ? J.negotiationOf(j.id, x.offer, proActor(p, client)) : noOffer; },
  propose_price: async (p, x = {}, client) => { const j = offerJob(x.offer); if (!j) return noOffer; const c = dollars(x.amount, "amount"); if (c?.error) return c; const r = await J.negotiate(j.id, x.offer, { move: "propose", amount: c, note: x.note }, proActor(p, client)); return r?.error ? r : r.negotiation; },
  accept_price: async (p, x = {}, client) => { const j = offerJob(x.offer); if (!j) return noOffer; const r = await J.negotiate(j.id, x.offer, { move: "accept" }, proActor(p, client)); return r?.error ? r : r.negotiation; },
  walk_away: async (p, x = {}, client) => { const j = offerJob(x.offer); if (!j) return noOffer; const r = await J.negotiate(j.id, x.offer, { move: "walk_away" }, proActor(p, client)); return r?.error ? r : r.negotiation; },
  // customers' agents' questions to this pro (ask_pros), newest first
  add_parts_tracking: async (p, x = {}, client) => { const r = await J.addPartsTracking(p.id, String(x.job || ""), { carrier: x.carrier, trackingNumber: x.trackingNumber, note: x.note }, proActor(p, client)); return r?.error ? r : { job: r.job.id, number: r.job.number, tracking: r.tracking }; },
  my_inquiries: (p) => J.allJobs().flatMap((j) => (j.inquiries || []).filter((q) => q.to.id === p.id).map((q) => ({ job: j.id, number: j.number, title: j.scope.title, zip: j.address.zip, ...q }))).sort((a, b) => b.at.localeCompare(a.at)).slice(0, 30),
  counter: async (p, x = {}, client) => { const c = dollars(x.amount, "amount"); if (c?.error) return c; const pc = x.parts != null ? dollars(x.parts, "parts") : null; if (pc?.error) return pc; return ok(p, await J.proAnswer(p.id, x.offer, { kind: "counter", amount: c, parts: pc, partsPolicy: x.partsPolicy ?? null }, proActor(p, client))); },
  accept: async (p, x = {}, client) => ok(p, await J.proAnswer(p.id, x.offer, { kind: "accept" }, proActor(p, client))),
  withdraw_change: (p, x = {}, client) => ok(p, J.withdrawChange(p.id, x.job, x.change, proActor(p, client))),
  withdraw_offer: (p, x = {}, client) => ok(p, J.withdrawOffer(p.id, x.offer, proActor(p, client))),
  decline: async (p, x = {}, client) => ok(p, await J.proAnswer(p.id, x.offer, { kind: "decline" }, proActor(p, client))),
  // a BEFORE photo taken far from the job is accepted (the check judges it later) but the pro hears it at once
  start_work: async (p, x = {}, client) => { const r = ok(p, J.startWork(p.id, x.job, proActor(p, client), { before: x.before || [] })); if (r?.error) return r; const j = J.job(String(x.job || "")); const { km } = await import("./exif.js"); const far = (j?.evidence || []).filter((e) => e.phase === "before" && e.exif?.gps && j.address?.lat != null).map((e) => ({ e, d: km(e.exif.gps, j.address) })).filter((x) => x.d > 0.5); return far.length ? { ...r, warnings: far.map((x) => `a before photo was taken ${x.d.toFixed(1)} km from the job address; the check will flag it: retake it on site`) } : r; },
  scope_reply: async (p, x = {}, client) => { const r = await J.scopeReply(p.id, x.job, x.text, proActor(p, client)); return r.error ? r : { ...proView(r.job, p), reply: r.reply }; },
  add_before: (p, x = {}, client) => ok(p, J.addBefore(p.id, x.job, x.items || [], proActor(p, client))),
  // early pay takes a fee out of the pro's money: the pro decides it on the website, with their PIN, not their agent
  early_pay: (p, x = {}) => (J.job(String(x.job || ""))?.agreed?.pro !== p.id ? { error: "not_found", message: "No such job of yours: early pay is for a job you were hired for." } : { error: "person_only", message: "Early pay is the pro's own decision: they take it on the website with their PIN. Show them signIn.", ...(p.person ? { signIn: personLink(p.person, { to: x.job ? `/pro/jobs/${x.job}` : "/pro", what: `take early pay on ${J.job(String(x.job || ""))?.number || "the job"} (a fee comes out of your pay)` }) } : {}) }),
  fix_defect: async (p, x = {}, client) => ok(p, await J.fixDefect(p.id, x.job, x.items || [], proActor(p, client))),
  request_change: async (p, x = {}, client) => { const c = dollars(x.amount, "amount"); if (c?.error) return c; return withGuard(x, ok(p, await J.requestChange(p.id, x.job, { amount: c, reason: x.reason, evidence: x.evidence, kind: x.kind }, proActor(p, client)))); },
  // items: [{ kind: "photo" | "receipt" | "note", dataUrl?, text?, checkId?, name? }]; sent to the check once every condition
  // of the current milestone has evidence (submit: true checks now anyway; submit: false only stores)
  submit_evidence: async (p, x = {}, client) => {
    const items = Array.isArray(x.items) ? x.items : [];
    // timed conditions: retaking a photo another condition is timed from makes that one need a retake too: said first
    const jj0 = J.job(String(x.job || "")), warnings = jj0 ? J.timingWarnings(jj0, items) : [];
    if (x.dryRun) return { dryRun: true, stored: false, warnings, says: warnings.length ? "Nothing stored. Send these too, in order, or the timed conditions will need a retake." : "Nothing stored; no timing problems." };
    const jj = J.job(String(x.job || "")), pend = x.submit !== false && jj?.changeOrders.find((c) => c.status === "pending");
    if (pend) return { error: "pending", message: `Nothing was stored: your change order +${J.money(pend.amount).usd} is waiting for the customer (${pend.needs}). Wait, or withdraw_change {job, change: "${pend.id}"} and send again.`, change: pend.id, waitingOn: "customer" };
    if (items.length) { const r = J.addEvidence(p.id, x.job, items, proActor(p, client)); if (r.error) return r; }
    if (x.submit === false) { const j = J.job(x.job); return j ? proView(j, p) : notFound; }
    // submit unless told to: but a partial set is only stored, not checked, until every condition of the current milestone
    // has evidence (or submit: true says check it now anyway)
    if (x.submit !== true) { const j = J.job(x.job), missing = j ? J.missingEvidence?.(j) || [] : []; if (missing.length) return { ...proView(j, p), stored: true, checked: false, missing, says: `Stored. Not checked yet: still missing evidence for ${missing.map((c) => c.what || c.id).join("; ")}. Send those (or submit: true to check now).` }; }
    const sub = withGuard(x, ok(p, await J.submit(p.id, x.job, proActor(p, client), { milestone: x.milestone || null })));
    return warnings.length && sub && !sub.error ? { ...sub, warnings } : sub;
  },
  request_materials_advance: async (p, x = {}, client) => ok(p, await J.requestMaterialsAdvance(p.id, String(x.job || ""), { change: x.change, items: x.items || [], supplierEmail: x.supplierEmail ?? null }, proActor(p, client))),
  return_materials: (p, x = {}, client) => { const c = dollars(x.amount, "amount"); if (c?.error) return c; return ok(p, J.returnMaterials(p.id, String(x.job || ""), { change: x.change, amount: c, note: x.note }, proActor(p, client))); },
  async export_books(p, x = {}) {
    const R = await import("./reports.js"), month = /^\d{4}-\d{2}$/.test(x.month || "") ? x.month : null, year = /^\d{4}$/.test(String(x.year || "")) ? String(x.year) : null;
    const b = R.books(J.allJobs(), p.id, { month, year });
    return { month, year, totals: Object.fromEntries(Object.entries(b.totals).map(([k, v]) => [k, J.money(v)])), rows: b.rows.length, csv: R.booksCsv(b, { format: x.format === "qbo" ? "qbo" : "detail" }), format: x.format === "qbo" ? "QuickBooks Online bank upload: Date,Description,Amount" : "detailed: Date,Job,Type,Account,Description,Amount,PayPal ref", ...(year ? { summary: R.yearSummary(b, year, p) } : {}) };
  },
  ask_for_review: (p, x = {}, client) => ok(p, J.askForReview(p.id, String(x.job || ""), { checkId: x.checkId, note: x.note }, proActor(p, client))),
  payout_status: (p, x = {}) => {
    const j = J.job(String(x.job || ""));
    if (!j || j.agreed?.pro !== p.id) return notFound;
    const vw = J.view(j);
    return { job: j.id, status: j.status, split: vw.money.split, payout: vw.money.payout, to: viewPro(p, { self: false }).payout, ledger: vw.money.ledger };
  },
};
// a person-only step: the error carries a one-time link the agent shows its person (askPerson)
const ASK = { perJobMax: ["/connect#limits", "raise the per-job limit"], monthlyMax: ["/connect#limits", "raise the monthly limit"], changeMax: ["/connect#limits", "raise the change-order limit, or approve this change order"], agentMayRelease: ["/jobs/{job}", "look at the evidence and confirm, release, ask for a fix or dispute on the job page (or let the agent do it, in Limits)"], agentMayCancel: ["/connect#limits", "let the agent cancel, or cancel on the job page"], priceCeiling: ["/jobs/{job}", "raise the price ceiling by accepting the offer on the job page"], materialsAdvanceMax: ["/jobs/{job}", "approve the materials advance on the job page (or raise the materials-advance limit)"], licenceUnverified: ["/jobs/{job}", "decide whether to hire a pro whose licence isn't verified, on the job page"], scopeChange: ["/jobs/{job}", "review and apply the scope change (it drops or loosens something)"] };
// AP2-style mandates (proof/mandates.js): what each money-moving tool would move, in cents (null: nothing to check yet)
function mandateAmount(name, a, x) {
  const j = J.job(String(x.job || ""));
  if (!j) return null;
  if (name === "accept_offer") return j.offers.find((o) => o.id === x.offer)?.amount ?? null;
  if (name === "approve_change") return j.changeOrders.find((c) => c.id === x.change)?.amount ?? null;
  if (name === "approve_materials_advance") { const c = j.changeOrders.find((y) => y.id === x.change); return c?.advance?.amount ?? c?.amount ?? null; }
  if (name === "tip") return toCents(x.amount);
  if (name === "release" || name === "confirm_checks") { const m = (x.milestone && j.milestones?.find((y) => y.id === x.milestone)) || j.milestones?.find((y) => ["review", "needs_fix", "passed"].includes(y.status)) || J.currentMs(j); return m ? J.msDue(j, m) : null; }
  return null;
}
const MONEY_TOOLS = ["accept_offer", "approve_change", "confirm_checks", "release", "approve_materials_advance", "tip"];
for (const [name, fn0] of Object.entries(CUSTOMER)) if (MONEY_TOOLS.includes(name)) CUSTOMER[name] = async (a, x = {}) => {
  const required = !!limitsOf(person(a.person)).requireMandate || !!a.requireMandate;
  const { mandate, ...args } = x;
  if (!mandate && !required) return fn0(a, args);
  const M = await import("./proof/mandates.js");
  const amount = mandateAmount(name, a, args);
  if (!mandate) return { error: "mandate", reason: "missing", message: `Your person requires a signed mandate for ${name}: get one (mandate_template, signed by them; or issued on the website with their PIN) and send it as mandate.`, needs: { action: name, scope: M.ACTION_SCOPE[name], amount: amount != null ? usd(amount) : null, job: args.job || null } };
  if (amount == null) return fn0(a, args); // nothing to check against (the tool answers not_found or state itself)
  const c = M.check(mandate, { payer: a.person, agentClient: a.token, action: name, amount, jobId: args.job || null });
  if (c.error) { M.refused(mandate, c, { payer: a.person, action: name, amount, jobId: args.job || null }); return c; }
  M.reserve(c);
  const r = await fn0(a, args);
  if (r?.error) { M.release(c); return r; }
  const rec = M.used(c, { action: name, amount, jobId: args.job || null, result: r?.status || "ok" });
  const j = J.job(String(args.job || ""));
  if (j) { j.mandates = [...(j.mandates || []), { id: rec.id, action: name, amount, hash: rec.hash, signedBy: c.signedBy, receipt: rec.receipt, at: rec.at }]; J.jobsStore.save(); }
  return r && typeof r === "object" ? { ...r, mandate: { id: rec.id, hash: rec.hash, signedBy: c.signedBy, receipt: rec.receipt, used: true } } : r;
};
for (const [name, fn] of Object.entries(CUSTOMER)) CUSTOMER[name] = async (a, x = {}) => {
  const r = await fn(a, x);
  if (r?.error === "limit" && ASK[r.limit] && a?.person) { const [to, what] = ASK[r.limit]; r.askPerson = personLink(a.person, { to: to.replace("{job}", x.job || ""), what: `${what}${x.job ? ` (job ${J.job(x.job)?.number || x.job})` : ""}`, limit: r.limit, wouldBe: r.wouldBe || null, current: r.limitUsd || null, job: x.job ? { id: x.job, number: J.job(x.job)?.number || null } : null }); }
  return r;
};
export const toolNames = { customer: Object.keys(CUSTOMER), pro: Object.keys(PRO) };

// ---- the demo's built-in customer agent: negotiate the way PLAN §3 says, then accept ----------------------------------
// It picks the best offer within the ceiling (price, then rating), counters it once at about 88% of the ask, and
// accepts what the pro's agent answers if it's within the ceiling. Labelled "Done demo agent (rules)".
export async function autoHire(jobId, personId, { payWith = null, counterPct = 0.88 } = {}) {
  const a = { kind: "agent", person: personId, client: "Done demo agent (rules)" }, steps = [];
  let j = J.job(jobId);
  if (!j || j.customer !== personId) return notFound;
  if (j.status === "scoped") { await J.requestOffers(j.id, a, { now: true }); steps.push("asked for offers"); }
  if (J.job(jobId).status === "offered" && J.job(jobId).demoOffers?.some((d) => !d.done)) for (const d of J.job(jobId).demoOffers.filter((x) => !x.done)) await J.demoOffer(jobId, d.pro);
  j = J.job(jobId);
  if (j.status !== "offered") return { error: "state", message: `Job ${j.number} is ${j.status}.` };
  const ceiling = j.scope.priceCeiling || Infinity;
  const open = j.offers.filter((o) => o.status === "open").sort((x, y) => x.amount - y.amount || (getPro(y.pro).rating || 0) - (getPro(x.pro).rating || 0));
  if (!open.length) return { error: "no_offers", message: "No open offers." };
  const best = open.find((o) => o.amount <= ceiling * 1.15) || open[0];
  if (!best.counter) {
    // about 88% of the ask, kept inside the job's fair-price range (estimate.js: between its low end and the typical
    // price) when the job has one; labelled as the estimate, never a quote
    let c = Math.round((best.amount * counterPct) / 500) * 500, fairSays = "";
    const est = J.job(jobId).estimate;
    if (est) { const fr = J.fairRange(J.job(jobId)); c = Math.max(fr.low, Math.min(c, fr.typical)); fairSays = ` (inside the fair range ${usd(fr.low)}-${usd(fr.high)}: ${fr.label}, ${fr.source})`; }
    // an offer over the budget gets the whole budget (one counter per pro; a pro's agent takes the customer's budget
    // when it's at least 75% of the ask): a lower counter could come back still over it, a dead end
    if (best.amount > ceiling) { c = ceiling; fairSays = " (the whole budget: the offer was over it)"; }
    if (c < best.amount) { await J.counterOffer(j.id, best.id, Math.min(c, ceiling), a); steps.push(`countered ${getPro(best.pro).name} at ${usd(Math.min(c, ceiling))}${fairSays}`); }
  }
  const now = J.job(jobId).offers.find((o) => o.id === best.id);
  if (now.status !== "open") return { ...J.view(J.job(jobId)), steps, note: "waiting for the pro's agent" };
  if (now.amount > ceiling) return { ...J.view(J.job(jobId)), steps, error: "ceiling", message: `The best offer is ${usd(now.amount)}, over the ${usd(ceiling)} ceiling: your person decides.` };
  const r = await J.acceptOffer(j.id, best.id, { actor: a, payWith });
  steps.push(`accepted at ${usd(now.amount)}`);
  return { ...r, steps };
}
