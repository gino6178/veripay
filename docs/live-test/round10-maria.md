# Done round 10: Maria Lopez agent report

Agent: Maria Lopez's AI agent, over MCP (@modelcontextprotocol/sdk, Streamable HTTP at http://localhost:8810/mcp). REST was used only for the person steps the server gives as links or website actions (PayPal approval page, /api/auth/link, the website session for the fix request and demo-finish). Job: DP-1036, job_534dfecf3e.

Task: "The bathroom sink faucet in my house at 78702 drips all night. Get someone out this week, under $200, and don't pay until it's fixed."

## Result

- Reached payment (hold): yes. Accepted an offer, approved the PayPal hold, $199.00 authorized.
- Reached capture: no. Captured $0.00, refunded $0.00, no payout. Money stays held.
- Current state: job status `needs_fix` (second fix request sent, pro is fixing). Not finished.
- Time: started about 07:51 real, ended about 08:19 real (about 28 min, slightly over the 25 min guide). Pro idle after start about 10 min, so the 8-minute demo-finish was used (see step 14).

## What I did, step by step

1. `whoami` and `my_limits` (MCP). Limits: $500 per job, $1,500 per month, change orders up to $75, buffer 20%, agentMayRelease false, agentMayCancel true. No saved payment method yet (`savedPayment: null`).
2. `post_job` text as given, zip 78702, budget 199. Server: job DP-1036 (job_534dfecf3e), ceiling $199.00, scope with 4 done-conditions (before, new_part, no_drip, work_note), status offered.
3. `wait_for_news` 50 s, then `list_offers`. Offers came in from 07:53 to 07:54 real time:
   - Luis Ortega Plumbing (test): $140.00, licence NOT verified (no licence doc), acceptable.
   - Eastside Pipe & Drain (demo): $195.00, licence and insurance verified, acceptable.
   - Lone Star Rooter (demo): $195.00, acceptable.
   - Barton Creek Plumbing (demo): $220.00, over ceiling, not acceptable without raising it.
   - Mueller Plumbing Co. (demo): $220.00, over ceiling.
   - Hill Country Leak Pros (demo): $255.00, over ceiling.
4. Decision on offers (Maria's brief: fair, under $200, don't pay until fixed). I chose Eastside Pipe & Drain: fully verified, under the ceiling, arrival 08:01 same day. I countered once at $165 (`counter_offer`). The pro's agent countered back at $180.00 (event 438).
5. `accept_offer` offer ofr_2a8064834b, payWith "paypal" (saved method was not available). Server: status agreed, PayPal order MOCK-00FDA8759A25, approveUrl /mock-paypal/approve?token=MOCK-00FDA8759A25. The other offers were declined by the platform as "not chosen".
6. Person step, simulated PayPal approval: GET the approve page (it shows $199.00 hold for DP-1036, Eastside $180.00, "the account that hired: Maria"), then POST `a=yes` as Maria. Response 302 to /paypal/return. Status became `held`, hold $199.00 = price $180.00 + buffer $19.00 (buffer capped by the $199 ceiling, not 20%). Event money_held: AUTH-32AE11DAD45D.
7. `wait_for_news`: scope review noted a TSBPE-licensed plumber is needed (City of Austin / Texas Occupations Code ch. 1301). Work started 07:57 real with 3 before photos.
8. No further news for about 8 minutes: no evidence submitted.
9. Used the demo "finish now" (see step 14 for how it worked). Pro's evidence arrived on the platform: 4 items (3 photos + 1 note).
10. Read the job with `job_status` (full) and `job_evidence`. Checker verdicts: all 4 conditions "pass" in code, but three photo conditions are NEEDS_REVIEW (confidence 0.3 to 0.5) and the work note is NEEDS_REVIEW too (0.66). Downloaded the 6 photos and looked at them as Maria would:
    - before (2 photos): both show a corroded, weeping shut-off valve (caption "DEMO PHOTO (synthetic): corroded shut-off valve, weeping"). Not the faucet, not a worn cartridge.
    - new_part (2 photos): the same valve. No new cartridge or washer is visible.
    - no_drip (2 photos): one shows the same valve (08:11). The other shows the under-sink pipes, dry, caption "under the sink, water on 10 min, dry". No faucet in frame.
    - work_note: "Part replaced: the worn Moen 1225 cartridge. Ran the water 10 minutes after the repair: no drips under the sink." The note names a part and a test. It does not match the photos (cartridge named, valve photographed).
11. Maria's decision 1 (`POST /api/auth/link` with code from askPerson and her PIN, then the website action): `POST /api/jobs/job_534dfecf3e/request-fix` with milestone m1 and reason: before and new-part photos show a shut-off valve, not the faucet cartridge; no-drip photo shows no faucet; send faucet photos and a 10-minute no-drip photo. Status `needs_fix`.
    - I did not confirm any condition. The work note was not confirmed because it conflicts with the photos. Confirm would also have needed the same step-up and could pay out.
    - I did not release. agentMayRelease is false and the photos do not show the work.
12. Pro's second submission arrived 08:43 platform time (4 items, same kind of photos: the valve and the under-sink pipes). Checker again: 4/4 "passed", three NEEDS_REVIEW. I looked at the new photos: same valve and under-sink pictures, no faucet, no cartridge installed.
13. Maria's decision 2: `request_fix` again with a more specific reason (second round still shows the valve, not the faucet; asks for faucet with cartridge before, new part installed, faucet running 10 min later). Status `needs_fix`. Pro has it now. I left it there because the 25 min window was up.
14. Demo "finish now": `POST /api/jobs/job_534dfecf3e/demo-finish` as Maria. Returned 401 "Sign in first" with the agent Bearer token. It worked with Maria's website session (see findings). Clock jumped 14 to 29 minutes ahead of real time. This is the shared demo clock, so it also moved other jobs' times.
15. Money check after each step: captured $0.00 throughout. Hold still $199.00 authorized, expiry on the hold per platform.

## What each side ends up with (now)

- Maria: $199.00 authorized on her PayPal (held, not charged). Nothing captured, nothing refunded. Job DP-1036 in `needs_fix`.
- Eastside Pipe & Drain (demo): nothing paid. Agreed price $180.00. Would be paid $180 less 10% fee on capture of the price (the buffer is never captured), per platform rules. No payout yet.
- Other offerers: offers declined by the platform ("not chosen"). Luis Ortega Plumbing (test) was also notified.
- Sam Patel (see findings, unintended): a new demo customer account was created by accident; nothing transacted on it.

## Who decided each condition

- before: Maria (me, as Maria), fix requested twice. Reason: photos show a shut-off valve, not the faucet or its cartridge.
- new_part: Maria, fix requested twice. Reason: no installed cartridge visible; same valve photos.
- no_drip: Maria, fix requested twice. Reason: no faucet in frame; only under-sink pipes.
- work_note: no decision yet. Held back, because the note names a cartridge and the photos show a valve. Pending the fix round.
- Release: not done. Dispute: not opened.

## Findings

- BUG: After the first submission the event says "DP-1036: the job: 4/4 done-conditions passed (model+vlm): the customer decides." Three of the four are NEEDS_REVIEW (confidence 0.3 to 0.5), and the job is in review. The "passed" wording reads as if money is ready. Exact request: POST /api/jobs/job_534dfecf3e/demo-finish (as Maria), then GET job_status; event 507 and lastCheck.checks[*].verdict "pass" with label "NEEDS_REVIEW".
- BUG (minor, wording cut): lastCheck.checks[before].reason reads "...There are no ; confidence 0.5 is under 0.6, so a person confirms". The sentence is cut off mid-clause.
- CONFUSING: `POST http://localhost:8810/api/auth/demo {"as":"customer"}` with no other fields did NOT resume Maria. It created a new demo customer, "Demo · Sam Patel" (p_6ed7d67717), and showed a new PIN once in the response. I did not use it. I could not delete it (no tool). Resuming Maria needed `{"as":"customer","personId":"p_23aa5645cd","pin":"<her PIN>"}` in the same call; llms.txt says resuming needs the PIN but not the field names.
- CONFUSING: `POST /api/jobs/<id>/demo-finish` with the agent Bearer token gives 401 "signin". It needs the website session (cookie). llms.txt says "as Maria" but not how.
- CONFUSING: The website action for a fix request (`POST /api/jobs/<id>/request-fix {milestone, reason}`) is not in llms.txt. I used the name by analogy with the agent tool `request_fix`; it worked. Confirm and release endpoints on the website were not tested by me.
- CONFUSING: Clock. Event `at` values are demo time, `realAt` is real time. At acceptance the demo clock was 14 minutes ahead, and after demo-finish 29 minutes ahead. A "finish now" on one job moves the clock for every job. The `at` times look like they came from the future to a reader who does not check `realAt`.
- CONFUSING: The photo checker says "pass" with `needsPerson: true` and label NEEDS_REVIEW at confidence 0.3 to 0.5, while its description says the photo does not show the faucet. The two verdicts disagree. Also the model descriptions of the same photo change between rounds (e.g. "red and black object" in round 1, "green and brown with a brown circle" in round 2), while the caption says "corroded shut-off valve". The checks rely on the model, not on what a person sees.
- Not a platform bug, but notable: the pro's agent sent the same kind of photos (valve, under-sink) twice, after a specific fix request each time. The "4/4 passed" language made it look more complete than it was.
- Good: accept with PayPal approval gave the hold at once. The buffer capping message ("$19.00, not 20%") was clear. Counter-offer worked once; the pro's agent countered back. The offer list with `acceptable` and `acceptableWhy` was clear for the over-ceiling offers.

## Unclear

- Whether the 14-minute clock offset is intended, or a sign the demo clock moved from my "finish now" before my job's own events.
- Whether `accept_offer` with payWith "saved" needs a saved method first (savedPayment was null, so I used "paypal"). No error appeared, so I did not test "saved".
- The exact website endpoints for confirm, release and dispute (I did not call them).
- Whether `request-fix` on the website is the same action as the agent tool `request_fix` (I assume yes).
- Whether the hold expires before the pro's fix is in (expiry date is on the hold; not checked after the second fix).
- Whether the pro's agent is allowed to keep submitting the same photos without a timeout.
- Which of the three photo conditions a person would confirm if the valve were the faucet's own shut-off. I judged no.
- Whether Eastside (licence verified, licence required) actually has a verified TSBPE licence in the platform's registry (the record says verified; I did not check the registry).

## Cleanup

- Deleted my helper scripts in D:/paypal/join/examples (done10-maria-*.mjs).
- Downloaded evidence photos and job JSON are in the scratchpad (done10 folder), not in the project. The token file was only read, never printed. The PIN was used only in the link and session steps above.
- Left the job DP-1036 in needs_fix, with the hold of $199.00 still authorized. Nothing was captured.

VERDICT: 0 BLOCKER, 2 BUG, 4 CONFUSING

Top three findings:
1. The checker says "4/4 done-conditions passed" while three of four are NEEDS_REVIEW and the photos do not show the faucet (BUG). Money is not captured, but the wording suggests it is ready.
2. `POST /api/auth/demo {"as":"customer"}` without her PIN silently created a new demo customer instead of an error (CONFUSING). Resuming needs `personId` and `pin` in the same call, which the docs do not say.
3. The demo-finish needs a website session, not the agent token (401 with Bearer), and the shared demo clock jumps when used (CONFUSING).
