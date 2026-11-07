# Done round 4: Luis Ortega Plumbing (test), pro side, A2A

## Steps (platform clock started 2026-11-04T19:52Z)
1. llms.txt + whoami + readiness: hireable=false, blocker "paypal" (website only). No licence/insurance (recommended).
2. Onboarding: the link in luis-token.json (code -ABTU...) and the readiness link (code xYEpj...) differ; I used the file's. GET page = HTML shell, POST /api/pro/onboard {code} signed me in (cookie). Done on the website, as Luis allowed.
3. PUT /api/pro/paypal {email} -> verified immediately ("demo verification"). PUT /api/pro/verification licence M-41877 + Lone Star Mutual LSM-2290415 $1,000,000 2027-06-30 -> both ok. PUT /api/pro/rates callout 85, hourly 110, radius 20, parts at_cost -> applied. readiness: hireable=true.
4. list_jobs: 5 jobs (water heater $2,400, 3 faucets, 2 drains). Offered $110 on DP-1035: Maria's agent hired Eastside Pipe & Drain (demo) at $175 at 19:54:58 (46 s after my offer) - cheaper hireable offer ignored (that is her agent's choice, but I saw no reason given). Offered $95 on DP-1033 (job_3f6ef31a58, ceiling $220): HIRED ~19:58:50 (about 3 min after the offer), hold $118.75 on saved card, AUTH-49B8F328F5E1.
5. No condition I couldn't prove, so no scope_reply needed (scope review suggested a licence note; I put licence in the final note).
6. start_work with BEFORE photo (valve-worn at 30.3048,-97.6851) -> working.
7. request_change +$47.05 parts with photo (chg_348e032cd5). Customer never answered in ~13 min. Withdrew, re-sent (chg_c0f88d0a44): no answer in ~7 min. Meanwhile taken photos: c1 faucet-installed (platform 20:10:57), c2 sink-dry (20:26:41, >10 min later per platform clock, which others moved), receipt $47.05 dated 11/04/2026 (needed -ExecutionPolicy Bypass for the ps1), note with licence.
8. submit_evidence while change pending: refused, nothing stored, clear message ("withdraw_change ... and send again").
9. Withdrew the change order and submitted (4 items): 3/3 conditions pass by rules but each marked NEEDS_REVIEW (no VLM/model, confidence 0.3) -> status "review", waiting on customer to confirm/release. At the end of my session (~20:26 wall) still in review.

## Money (as of end)
Held $118.75 (price $95 + $23.75 buffer). Captured $0, paid out $0, refunded $0. I earned nothing yet. If released at $95: fee 10% = $9.50, Luis $85.50 via one Payouts batch to luis.ortega@done-demo.example (verified). Parts $47.05 were NOT covered: I withdrew the change order so the $95 must cover callout + parts (he would net $85.50 - $47.05 = $38.45 if he buys the part himself).
Timings: onboarding ~1 min; first win ~6 min after joining; hire -> hold instant; review wait > 6 min and counting.

## Asked my person for anything?
No (he pre-authorized website onboarding and rates).

## Findings
- BLOCKER: demo customer on DP-1033 never answered a change order (two orders, 13 and 7 min). Brief says they do. A pro cannot finish a job needing a part without it. Request: request_change job_3f6ef31a58 47.05 -> status stays "pending", waitingOn customer.
- BUG: hold.bufferWhy says "25% (not 20%): Done-Risk..." and amount is $23.75 (25%), but hold.explain says "$23.75 is buffer (20% of the price...)" and bufferPct=20. Contradictory. Also a $47.05 change order is double the $23.75 buffer, so "change orders need no new approval" is false for it.
- BUG/CONFUSING: timestamps inconsistent: event feed says hired 19:58:50, hold.createdAt 20:08:50 (the shared clock had just been advanced 10 min by a demo pro on another job, DP-1038; again later by other jobs). My "after 10 minutes" condition is therefore at the mercy of other people's demo jobs, and camera timestamps follow the platform clock. Not a problem for me this time but confusing.
- BUG: wait_for_news with `after` returns immediately whenever there are events newer than `after`, including events of other pros' jobs; fine, but it never returned in the feed which job events were mine without filtering. Minor: no way to filter to my jobs.
- CONFUSING: all 3/3 conditions pass but go to "review" because no VLM is configured, so every job needs a person; a pro gets no instant payout (releaseMode was "instant"). Pro-side text: "Every check passed, but some need a person to confirm" is honest but the pro can't do anything (early_pay not tried; costs a fee).
- CONFUSING: the readiness onboarding code differs from the link in luis-token.json; two different codes were valid ("oneUse").
- MINOR: PayPal "verification" is a bare PUT of an email, no proof. Top-level pro.license stays null in whoami/profile even after verification (verified[] says ok).
- MINOR: receipt OCR read by "windows-ocr (zh-Hant-TW)" - worked ($47.05) but spaced letters "A U S T I N".
- MINOR: Maria's agent chose $175 over my verified $110 offer; pro gets no feedback why (declinedWhy null, offer stayed "open").
- MINOR: job_status of a job someone else got hired on returns fields undefined for me (job_0c154e5228) - not an error, just empty.

## Unclear
- Whether offers I make are shown to customer agents with equal prominence (no breakdown: "The pro's own agent gave one price").
- Whether withdrawing the change order should reduce what Luis can claim for parts at all; receipt total vs price check passed with $47.05 receipt and $95 price.
- Whether the customer should have answered the change order, and what "a few minutes" means when the clock is shared.
- Whether early_pay is the expected route when stuck in review.

VERDICT: 1 BLOCKER, 2 BUG, 3 CONFUSING
