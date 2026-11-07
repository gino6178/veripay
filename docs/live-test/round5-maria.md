# Done round 5: Maria Lopez's agent (job DP-1035, job_f2d7dbacff)

Used MCP throughout (no REST fallback needed). Times are platform clock (Austin time = UTC-6 shown on site).

## Steps
1. whoami / my_limits: perJob $500, monthly $1,500, changeMax $75, agentMayRelease false, agentMayCancel true, savedPayment null.
2. post_job (text, zip 78702, budget 200) at 20:47:08Z. Status "offered" at once; rules-written scope, 5 checks, ceiling $200.
3. review_scope: 1 gap g1 (TSBPE licence note, medium, applicable). Applied g1 (fair, legally required). Job went offered -> scoped ("waitingOn customer: ask for offers"); no tool for "ask for offers". Workaround: set_options (no-op reviewHours:48) moved it back to "offered". See finding 1.
4. wait_for_news: Luis Ortega (test) replied to scope and offered $150 (arrival Nov 5 15:00Z) at 20:48:43; Mueller (demo) $220 (over ceiling, acceptable:false); Lone Star Rooter (demo) $195 at 20:48:56. About 1.5 min.
5. Luis's licence M-41877 "Not found in the demo registry" (license verified:false), so I did not hire him even though cheapest; Lone Star Rooter licence J-90431 active. Countered Lone Star at $165; their agent came back at $180 within a few seconds ("below our cost").
6. accept_offer (no payWith) at $180: status agreed, hold pending_approval, hold $200 ($180 + $20 buffer; buffer capped from 20%=$36 by the $200 ceiling).
7. PERSON STEP 1 (hold approval): server gave approveUrl /mock-paypal/approve?token=... ("Authorize (hold, not charge) $200.00 ... and save PayPal for later holds"). Opened it as Maria, clicked "Agree and continue" (a $200 hold is exactly her ceiling; nothing charged). 20:50:51Z: held, AUTH-7044C73BB88A.
8. Pro started 21:06:08Z (3 before photos), submitted 5 evidence items 21:31:16Z (platform minutes, about 20 real minutes), checked 21:31:21Z: all 6 pass but 5 need a person (no VLM). Status review.
9. I looked at the evidence myself (job_evidence + fetched the 6 images with my token). Photos are labelled synthetic demo photos: before = "corroded shut-off valve, weeping"; new_part = "under the sink, water on 10 min, dry"; no_drip = same, dry. EXIF times and GPS 34-53 m from the job; no_drip taken 11 min after new_part. Note names Moen 1225 cartridge, licence J-90431. No parts, no receipt needed (waived). No change order.
10. confirm_checks refused: error "limit", agentMayRelease, with askPerson. PERSON STEP 2: opened askPerson url /link?code=... as Maria (Continue -> Show me), job page showed "The photos are right: confirm" and "The photos look right: pay $180.00". Clicked confirm (she confirms photos that look right; the no_drip proof and EXIF/GPS were fine; caveat below on the cartridge photo).
11. Result 21:33:36Z: captured $180.00 (CAP-10E1F3DE8A98), $20 buffer released unused. Payout batch PAYOUT-880A4243282E.

## Timing
Posted 20:47:08Z, pro paid (money_released, payout sent) 21:33:36Z = 46 min 28 s platform time (the platform clock runs about 22 min ahead of real time and was moved by other tests during the run; real elapsed was roughly 26 min). Offers 1.5 min; accept to hold 43 s; hold to work start 15 min; work start to submit 25 min; submit to check 5 s; confirm to paid about 1 s.

## What each side ends up with
- Maria: held $200.00 (price $180 + $20 buffer); captured $180.00 (cheaper than budget by $20); $20.00 buffer released uncaptured; spentThisMonth $180.00. Warranty to Nov 18.
- Split: fee $18.00 (10%); pro Lone Star Rooter $137.70; helper Jesse Ortiz $24.30; PayPal fee $6.77, platform net $11.23. Ledger balanced: true.
- Payout PayPal status: batchStatus SUCCESS, but both items UNCLAIMED (demo address, no PayPal account; claimable within 30 days). Immediately after release it was PENDING (item status), a few seconds later UNCLAIMED.

## Asked person for
Two things: (1) approve the $200 PayPal hold (no saved method); (2) confirm checks left to a person (agentMayRelease false).

## Findings
- BUG: apply_scope_suggestion drops the job back to "scoped" (waitingOn customer "ask for offers") although its own timeline note says "offers are asked for again", and no customer tool does that. apply response: status "scoped", next "Review the scope, then ask for offers." Only an undocumented side effect of set_options {job, options:{reviewHours:48}} re-opened it (status "offered"). Agents that follow the flow get stuck.
- CONFUSING: after the licence suggestion was applied, review_scope still lists g1 as an unapplied gap (applicable: true) even though check s6 exists; job page after agreement also shows "1 worth fixing".
- CONFUSING: a check left to a person yields confirm_checks -> error limit agentMayRelease, which is described as "release" permission; confirming photos and releasing money are one switch. The person page also offers "pay $180" next to "confirm", and confirm instantly captured and paid (confirm and release not distinct for instant mode). That is okay but the page says "Confirm" without saying it pays.
- CONFUSING: the demo pro's evidence is a generic image set: the "before" photo is a weeping shut-off valve, not the faucet, and the "new part" photo shows no cartridge (dry under-sink scene). Rules and EXIF passed it; no model looked ("no VLM configured"). All 5 judgment checks became "NEEDS_REVIEW" with confidence 0.3. If this were a real job I'd have asked for a fix on the new_part photo. I confirmed because the dry no-drip proof, note and licence were consistent and the photos are declared synthetic.
- CONFUSING: the "before" check is satisfied by an after-phase photo (page shows BEFORE photo taken at 3:06 and "AFTER the faucet or the worn part before the repair" taken 21 min after start).
- MINOR: the work note was submitted twice (ev_c1451ee78f and ev_690dd264b7 with identical text, shared evidence for work_note and s6).
- MINOR: Mueller and Lone Star both said "arriving in about 7 minutes (2:55 PM)" yet work started 3:06 PM; fine but arrival time is not enforced.
- MINOR: askPerson links are shown in my tool output in full; one-use, expire in 24 h. A second link is created at every call (job_status and confirm_checks each issued one).
- MINOR: the job page "If you wait: an expert at Done & Paid answers by Nov 5, 11:31 AM" and a "staff (expert queue)" party can decide: not mentioned in llms.txt.
- Good: PAYOUT item states are explained clearly (UNCLAIMED explained, "Not a failure").

## Unclear
- Whether "paid" means item status PENDING at release or UNCLAIMED/SUCCESS shortly after (I reported UNCLAIMED/SUCCESS as final).
- batchStatus SUCCESS while items UNCLAIMED: field semantics guessed from statusNote.
- Whether set_options was meant to re-request offers; it worked but is undocumented.
- Whether buffer hold of $20 (11%) instead of 20% is a problem for change orders ($75 limit would not fit in the $20 buffer); I assumed a new hold would be requested.
- Whether Luis (licence not found in registry, but his reply claimed M-41877) was a valid hire; I judged no.
- Why Luis withdrew his offer (not stated), and why accept_offer after counter-counter needed no further step.
- Link from job_status askPerson vs confirm_checks askPerson: used the first one; unclear if both would work.
- Time: platform "Demo clock ... 22 minutes ahead of real time" moved during my run by other tests, so the 46 min figure includes others' moves.

VERDICT: 0 BLOCKER, 1 BUG, 4 CONFUSING
