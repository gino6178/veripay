// /llms.txt: what an agent reads first. How to get a token, the tools, and the rules.
import { INSTRUCTIONS, toolsManifest } from "./mcp.js";
// every customer tool with its arguments, from the MCP schemas (the same over REST and A2A)
const argsOf = (schema) => Object.entries(schema?.properties || {}).map(([k, v]) => `${k}${(schema.required || []).includes(k) ? "" : "?"}: ${v.enum ? v.enum.map((x) => JSON.stringify(x)).join("|") : v.type || "any"}${v.description ? ` (${v.description})` : ""}`).join(", ");
const customerTools = () => toolsManifest().tools.map((t) => `- ${t.name} { ${argsOf(t.inputSchema)} }: ${t.description.split(". ")[0].replace(/\.$/, "")}.`).join("\n");
const PRO_ARGS = [
  ["whoami", "", "your pro record"], ["my_profile", "", "your profile, badges, readiness and jobs"], ["readiness", "", "what blocks being hired and the website link your person opens to fix it"],
  ["list_jobs", "since? (ISO, the newest created you've seen), radius? (miles)", "every open job in your trade within your service radius, newest first (ZIP and miles only)"], ["wait_for_news", "after? (event id), seconds? (1-50), since?", "waits for news: new jobs in your feed, counters, hires, change answers, check results, payouts"], ["set_rates", "callout?, hourly?, perMile? (USD), freeMiles?, radius? (miles), lead? (hours), rush?, floor?, crew?, partsPolicy?: at_cost|markup_10|included", "your rates and service radius"], ["job_status", "job", "one job (your own offers only)"], ["scope_reply", "job, text", "your words on the scope before agreeing; reviewed for gaps"],
  ["offer", "job, amount (USD), arrival? (ISO), note?, helper? (bool), parts? (USD, the parts estimate inside the price), partsPolicy?: at_cost|markup_10|included", "an offer; it says if you can't be hired yet"], ["counter", "offer, amount (USD), parts?, partsPolicy?", "answer the customer's counter once"], ["accept", "offer", "accept the customer's counter"], ["decline", "offer", "decline the counter"], ["withdraw_offer", "offer", "withdraw your open offer"], ["withdraw_change", "job, change", "withdraw a change order the customer hasn't answered"], ["request_materials_advance", "job, change, items, supplierEmail?", "after an approved materials change order: the supplier's invoice + a photo on site; paid now when the checks pass"], ["return_materials", "job, change, amount (USD), note?", "materials returned unused: they come off the final payment"], ["export_books", "month? (YYYY-MM), year?, format?: qbo", "your bookkeeping CSV (QuickBooks with format qbo) from the ledger; with year, a year summary (not tax advice)"], ["ask_for_review", "job, checkId, note", "a person (the expert queue) looks at a condition the model misread"],
  ["start_work", "job, before?: [{ dataUrl, checkId, label? }]", "start once the money is held"], ["add_before", "job, items: [{ dataUrl, checkId, label? }]", "before photos of each spot"],
  ["request_change", "job, amount (USD), reason, kind?: parts|labor|both (default parts: paid at the receipt's total if less), evidence?: [{ dataUrl }]", "a change order"], ["submit_evidence", "job, items: [{ kind: photo|receipt|note, dataUrl?, text?, checkId?, label? }], milestone?, submit? (default true)", "evidence, then the check"],
  ["early_pay", "job, milestone?", "the pro takes early pay themselves on the website (PIN): this returns person_only with their signIn link"], ["fix_defect", "job, items: [{ dataUrl }]", "photos of a warranty fix"], ["payout_status", "job", "what you've been paid"],
];
PRO_ARGS.push(
  ["set_availability", "weekly: { mon: [[\"08:00\", \"17:00\"]], ... } (Austin time), blocked?: [\"YYYY-MM-DD\"], visitMinutes?", "your hours: offers propose visit slots inside them and the job's window"], ["my_availability", "", "your hours and your next open slots"],
  ["reschedule", "job, from (ISO), reason", "move a hired job's visit before work starts: 24 h notice or more moves it at once, less is a proposal the customer answers"], ["answer_reschedule", "job, proposal, accept (bool), note?", "answer the customer's proposal to move the visit"],
  ["my_dashboard", "months?", "your earnings dashboard: earnings, fees, time to paid, fix rate, ratings, materials advances, tips, a monthly series"], ["my_work_record", "", "your verifiable work record (no customer data; signed and tied to the transparency log; public at /api/pros/<id>/record.json)"],
  ["set_language", "lang: \"en\"|\"es\"", "the language every answer to you is in (Spanish: errors, next, readiness, news; the English beside it)"]);
import { CUSTOMER, PRO } from "./tools.js";

export const guide = (base) => `# VeriPay

PayPal's developer docs for agents: https://developer.paypal.com/llms.txt (each page also as .md).

> Your agent hires a local pro, writes a machine-checkable definition of done, negotiates with the pro's agent, holds
> the money with a PayPal authorization, checks the pro's photos and receipts against each done-condition, and the
> moment they all pass captures the payment and pays the pro (and helper) with one PayPal Payouts batch.
> This server is a demonstration on PayPal's sandbox, in Austin, TX. Every pro is fictional and marked "(demo)".

${INSTRUCTIONS}

## Connecting (a customer's agent)

- MCP (Streamable HTTP): ${base}/mcp with Authorization: Bearer done_...
- REST: POST ${base}/api/agent/<tool> with JSON arguments, the same tools.

### Customer tools and their arguments (USD amounts; "?" = optional)

${customerTools()}
(post_job also takes description as another name for text.)
- A2A: ${base}/.well-known/agent-card.json, then POST ${base}/a2a (message/send, one data part {"action": ..., ...})
- Your person makes the token on the website (Connect your agent) and picks its scopes: read, hire, pay.
  Testing with a demo account: POST ${base}/api/auth/demo {"as": "customer"} (keeps a cookie), then
  POST ${base}/api/tokens {"label": "my agent"} with that cookie returns a token once.

## Connecting (a pro's agent)

- A2A only: POST ${base}/a2a with Authorization: Bearer dpk_... (staff issue the key, or the pro makes one on the
  website). Actions and their arguments:
${PRO_ARGS.map(([n, a, d]) => `  - ${n} { ${a} }: ${d}`).join("\n")}
- On the website (the person, not the agent): onboarding /pro/onboard?code=... (POST /api/pro/onboard {code}); payout
  PayPal PUT /api/pro/paypal {email, helperName?, helperEmail?, helperShare?}; licence and insurance PUT
  /api/pro/verification {license: {number}, insurance: {carrier, policy, limit (USD), expires}, insuranceDoc?: dataUrl};
  rates PUT /api/pro/rates (as set_rates). Unknown fields are refused with 400 and the allowed list.
- A pro staff created has no website login yet: readiness (or the staff create call) gives a one-time onboarding link
  /pro/onboard?code=... for the person; there they verify their PayPal (required before anyone can hire them), licence
  and insurance. Offers sent before that are allowed but flagged to both sides.
- list_jobs shows open jobs in your trade (ZIP only, no customer details). offer {job, amount, arrival}. If the
  customer counters, answer once: accept {offer}, counter {offer, amount} or decline {offer}.
- After you're hired and the money is held: start_work {job}; request_change {job, amount, reason, evidence?};
  submit_evidence {job, items: [{kind: "photo"|"receipt"|"note", dataUrl?, text?, checkId?}]}. payout_status {job}.
- You're paid only to the PayPal you verified on the website. No action takes a payee.

## Money

Amounts you send are USD; answers carry cents and "$12.34". The hold is the price plus a buffer for change orders
(20% by default), capped so the hold never exceeds the job's price ceiling. A re-hold for an approved change order may go above the ceiling
only by the approved change orders themselves. An offer above the ceiling is shown as overCeiling (acceptable: false):
the person accepts it only by raising the ceiling on the website. hold.explain says what was held and why. Money is
captured only when every condition passed, or the person released over named failed ones (acknowledgeFailed).
confirm_checks (for checks that passed but needed a person) pays at once, like release: it needs agentMayRelease too,
and its answer says how much was captured. A change order above your agent's limit is the person's: job_status gives
askPerson.
Consent: what only the person may do (their limits and permissions, agent tokens, the price ceiling, confirm, release,
waiving an inspection, approving a change order, applying a scope revision, a dispute settlement) needs the person's
session on the website AND a step-up with their PIN (4-6 digits, set at sign-up, never in any API response or token;
5 wrong tries lock it for 15 minutes). An askPerson link opens the page but signs nobody in: the person enters their
PIN there (the page calls POST /api/auth/link {code, pin}; GET /api/auth/link/info?code= says what was asked). Show your person the link; never use it yourself. Resuming a demo customer needs the PIN too: POST /api/auth/demo {as: "customer", person: "p_...", pin} (without person it makes a NEW demo customer). Pros and the inspector have PINs too: a pro sets theirs
at onboarding (the onboarding page asks for it; over the API POST /api/pro/onboard {code, pin: "4-6 digits"}, or
without pin one is made and shown once as pinOnce). Right after onboarding the pro is confirmed for 10 minutes, so
verifying PayPal then asks no PIN; later it does. A pro's agent can ask_for_review {job, checkId, note} when the
photo model misreads a condition (an expert looks), and submit_evidence {dryRun: true} lists timing warnings first; changing where a pro is paid (PayPal, helper, share), their licence or insurance, their agent keys and
taking early pay need the pro’s step-up on the website. A pro’s agent never changes payout routing (no action takes it)
and can’t take early pay (it returns person_only with a signIn link). In production this step-up is Log in with
PayPal, not a PIN.
Scope changes: you may apply a review suggestion (apply_scope_suggestion) when it only makes the scope stricter or
clearer: a new condition, or a condition reworded that keeps its evidence and its meaning. A change that drops or
loosens a condition, moves its evidence kind, or touches the price, ceiling, window, buffer, milestone shares or
release options is your person's: the answer is limit scopeChange with askPerson, and nothing is changed.
set_options takes only job options (releaseMode, reviewHours, retainPct, warrantyDays, inspector, requireBefore,
milestones); the price ceiling, budget, buffer and agentMayRelease are the person's (askPerson).
Materials advance: after a materials change order is approved, the pro may ask to be paid for the materials now
(request_materials_advance with the supplier's invoice and a photo on site). Code checks them; you may
approve_materials_advance within your person's materialsAdvanceMax (never a payment straight to a supplier: that's
the person's, with askPerson). At the end the advance is counted and returned materials come off the release.
Signed mandates (AP2-style): your person may require that every money-moving call you make (accept_offer: scope
"hold"; approve_change; confirm_checks: "confirm"; release; approve_materials_advance: "materials_advance"; tip) carries
mandate: { payload, signature } that THEY signed: payload { type: "DoneMandate", version: 1, payer: <their person id>,
agentClient: <your token id, whoami.you.agentClient>, maxAmount: <USD>, currency: "USD", scope: [...], merchant:
"VeriPay", jobId: <job> | null, expires: <ISO, at most 30 days>, nonce }, signature = Ed25519 over the UTF-8 bytes of
the payload's canonical JSON (keys sorted, no spaces), base64url. mandate_template {action, maxAmount, job?} builds the
payload and the exact string to sign; your person signs it with their own key (registered on the website with their
PIN) and gives it back to you. Without a key, your person issues one on the website after their PIN step-up (a demo
path, signed by a key the server holds for them, labelled). The server checks the signature, payer, agent, scope,
amount, job, expiry and that the nonce was never used: one mandate, one action. A refusal is 403 mandate with reason
(missing, amount, scope, job, expired, replay, signature, ...). Every mandate used or refused is recorded in a signed
receipt in the transparency log. my_limits.requireMandate says whether it's required; when it isn't, a mandate you
send is still checked.
Landlords and tenants: a tenant's agent posts for the landlord with post_job {..., forLandlord: true}; it can read the
job, add tenant_note {job, text} and suggest_offer {job, offer}, but only the landlord (or the landlord's agent, within
the landlord's limits) hires, approves and pays, from the landlord's PayPal.
Scheduling: offers carry slots (visit times inside the pro's hours and the job's window); accept_offer {..., slot: 0-2 or
its from} picks one; reschedule {job, from, reason} moves it before work starts (24 h notice or more: at once; less:
the pro answers); answer_reschedule {job, proposal, accept} answers the pro's.
Pay Later and tips: hold_options {job} lists how a hold can be paid (Pay Later on holds of $300 or more, via the PayPal
buttons; PayPal decides eligibility). After a paid job, tip {job, amount} is its own PayPal order, captured at once,
100% to the pro (no platform fee), within your person's change-order limit.
Home and neighbors: my_home shows your person's appliances, service history and warranties; maintenance_suggestions
are rules (age, last service, warranty dates); accept_suggestion {suggestion} posts one as a job within their limits.
list_groups / open_group {job} / join_group {group, job? | text} put households in one ZIP with the same job type in a
group (10% off with 2 households, 15% with 3, 20% with 4+); each household still accepts, holds and pays on its own job.
Notifications: my_inbox {unread?, after?} is your person's inbox; email and SMS copies are simulated, never sent.
Paperwork: get_report {job, kind: closeout|progress|daily|insurance} (insurance: for a leak or water-damage job, the
package for the homeowner's insurer, prepared from the records; not a claim filing) gives the close-out package (evidence per condition,
parts and materials, permit and inspection, warranty, Texas lien waivers prefilled from the payments; HTML and PDF
links for your person), a paid milestone's progress report, or the daily log. Written by code from the records.
Every tool refuses arguments it doesn't take (400, listing the allowed ones). Tool results are a job summary by
default over MCP (view: "full" for everything; over REST and A2A, view: "summary" asks for it).
At release the platform captures what's due (the unused buffer is never captured), keeps a 10% fee, and pays the rest
to the pro and their helper in one Payouts batch; every job's ledger adds up to the cent. Disputes end in a release,
a refund, or part of each (a PayPal refund on the capture). Signed receipts: ${base}/.well-known/done-receipts.json

## Demo controls (this demo server only; off when DEMO_SIGNIN=0)

- POST ${base}/api/demo/advance {"days": 4} moves the platform clock (holds age; the 3-day honor period passes).
- GET ${base}/api/info shows the platform's "now", PayPal mode, and whether the models or the rules are live.
`;
