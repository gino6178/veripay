# Done round 7: Maria Lopez agent report

Job: DP-1035 (job_c38cb4d000), "Fix a leaking faucet", 78702. Brief: drip all night, this week, under $200, do not pay until fixed.
Outcome: did NOT reach payment. Stalled in review at about 03:06 UTC (platform clock). No finish-now reachable as Maria.

## Step by step (platform time, UTC)

1. whoami (MCP): Maria, scopes read/hire/pay, per-job limit $500, monthly $1,500, change max $75, buffer 20%, agentMayRelease false. savedPayment: null.
2. post_job 02:53:22: job_c38cb4d000, DP-1035, status offered, budget $200. Scope written by rules: 5 done-conditions (before, new_part, no_drip, receipt, work_note) plus a suggested licence note. Window to Nov 9.
3. wait_for_news: 02:54:07 Luis Ortega Plumbing (test) offered $140.00. 02:54:29 Barton Creek Plumbing (demo) offered $220.00 (overCeiling, acceptable false). Later events: Eastside Pipe & Drain offered $195.00 and Hill Country Leak Pros offered $255.00.
4. Chose Luis at $140 (acceptable, hireable true). His licence showed "Not a TSBPE licence number", licence not verified (see findings). accept_offer payWith "paypal" at about 02:55: status agreed, hold pending_approval, $168.00 = $140 + $28 buffer, approveUrl /mock-paypal/approve?token=... (order MOCK-1DD7549302B2).
5. Maria approved the hold on the simulated PayPal page ("Agree and continue"). Server: status held, money_held event, authorization AUTH-866F6E20AB79. Captured $0.00.
6. Pro started work at about 02:56 with 1 before photo (work_started). Evidence submitted 02:57:03: 4 items (before photo, two new_part photos, work note).
7. Check at 02:57:53 (49.9 s): decision review. no_drip: needs_fix, "needs 1 photo, got 0". before and new_part: pass with confidence 0.3, reason "photo model busy; a person confirms". receipt: pass, "No parts in the price and no change orders: no receipt is needed". work_note: pass.
8. Maria: the askPerson link /link?code=... Signed in with her PIN from the token file (not printed here). Viewed the 3 photos. Ticked the new cartridge condition only. Did NOT click "Confirm these 1, ask for a fix on the other 3", "All look right", or "Release $140.00 anyway" (see findings).
9. About 02:59 the pro's agent asked an expert to look at new_part (review_asked: photo model busy, HTTP 503). The page says the expert queue answers by Nov 5, 1:12 PM and "in this demo nobody staffs that queue".
10. No movement from 02:59 to 03:06 (about 7 minutes; the five-minute threshold passed). The no_drip photo can only be taken 10 minutes after new_part (new_part 02:56:41), so the pro could submit it no earlier than about 03:07.
11. Finish now: not reachable with Maria's session. The job's DEMO panel offers Judge tour, switching to a demo customer or pro, and "Sign in as Demo staff (back office)". POST /api/demo/advance returns "Sign in on the website (or as demo staff) to move the demo clock." I did not sign in as demo staff, because that changes identity and was not part of Maria's role.
12. Stopped at review. Nothing released, no fix requested, no dispute opened.

## What each side ends up with (as of about 03:06 UTC)

- Maria: $168.00 authorized and held (not charged). Price $140.00, buffer $28.00. Captured $0.00. Refunded $0.00. Nothing paid out.
- Luis Ortega Plumbing (test): hired at $140.00, work done per his note, not paid. Payout address is a demo address (unclaimed).
- Time taken: post to first offer 45 s; first offer to hire about 1 min; hire to hold approved about 1 min; hold to work start and evidence about 1 min; check 50 s; then stalled in review from about 02:59.

## Did I need to ask my person?

No questions to the user. Maria's person-only steps were done as Maria in the browser: approving the hold and PIN sign-in to view evidence. I did not release money, which the brief forbids before the fix.

## Findings

BLOCKER: The job stalls in review and the test cannot reach payment through a customer agent.
- Request: job_status job_c38cb4d000 after 02:57:53. Response: status review, lastCheck notPassed no_drip "needs 1 photo, got 0", askPerson "look at the evidence ... confirm, release, ask for a fix or dispute", expires 2026-11-06.
- The only paths to finish are the expert queue (unstaffed in this demo, due 1:12 PM Nov 5) or a person release. A release is a money action and would pay over a failed check, against the brief. Finish-now is only behind a demo staff sign-in.
- The no_drip photo is also timed (10 minutes after new_part), so it cannot be finished earlier.

BUG: The receipt condition passed by rule although a cartridge was replaced.
- The scope requires "Receipt for the replacement parts". The offer said "No parts in the price", partsPolicy at_cost, parts $0.00. The check says receipt: pass, "No parts in the price and no change orders: no receipt is needed (the scope writer added this condition; the customer didn't)". Yet the work note says "Replaced the worn valve cartridge". Replacing a cartridge means parts were bought; the rule waives the receipt the customer's own scope asked for.

BUG: A hireable pro whose licence fails the server's own check is accepted.
- Request: list_offers job_c38cb4d000. Response for ofr_e2fb8135ea: license.required true, valid false, "Not a TSBPE licence number", hireable true, acceptable true. The scope review says "TSBPE-licensed plumber is needed for this work". Accepting this pro is allowed.

BUG: The before-photo check passed with a low-confidence "needs a person" verdict, and the photo does not show the faucet.
- Check before: pass, confidence 0.3, reason "photo model busy; a person confirms", needs_person. The photo caption reads "DEMO PHOTO (synthetic): corroded shut-off valve, weeping". The scope asks for "the faucet or the worn part before the repair". A check that needs a person should not show as pass.

CONFUSING: The "Your call" buttons.
- Buttons: "Confirm these 1, ask for a fix on the other 3", "All look right", "Release $140.00 anyway". The three checkboxes cover before, new_part and receipt only. The no_drip and work_note conditions have no box, yet "the other 3" counts them. The confirm button appears to send fix requests for everything unticked. I did not click it.

CONFUSING: The event summary contradicts the check.
- Event "checked": "DP-1035: the job: 4/5 done-conditions passed (model): the customer decides." The job page says 2 of 5 settled by code, 2 waiting for a person, 1 didn't pass. The "4/5 passed" count includes the two needs-person checks and the waived receipt.

MINOR: The first click on a checkbox ref did not toggle it; a click on its label did.

## Unclear

- payWith "saved": savedPayment is null for Maria, so I chose paypal. I did not test saved.
- Whether no_drip would have passed: no photo arrived before I stopped.
- Whether "Confirm these 1" confirms only ticked conditions or also sends fix requests on the rest: the label says it asks for fixes; I did not test it.
- "Expires 2026-11-06" on askPerson versus "oneUse": unclear whether the link is single-use or expires after 24 hours.
- Whether the expert queue is staffed in any mode: the page says "in this demo nobody staffs that queue".
- Whether finish-now is a job-level control at all: the brief names it, the server only exposes it behind demo staff sign-in in the DEMO panel, and llms.txt does not document it.
- Whether the receipt waiver is intended for an at-cost parts policy.

## Mistakes on my side

- I sent one POST to /api/demo/advance with {"minutes":1}. It was refused ("Sign in on the website..."). llms.txt documents "days", not "minutes". No clock change happened.
- post_job with view "full" returned a very large payload; I used summary afterwards.

VERDICT: 1 BLOCKER, 3 BUG, 2 CONFUSING
