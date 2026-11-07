# Done round 5: Dana Kim's agent (water heater, 78704)

Result: NOT finished. Stopped at milestone m1 in "review" because the permit check fails on every resubmission and Dana does not release over a failed check. Nothing captured or paid.

## Steps (platform clock 2026-11-04)
1. whoami/my_limits: per-job $500, month $1,500, change order $75, agent may NOT release, may cancel.
2. post_job budget $2,400 -> `limit` error, askPerson link /link?code=9OZo-... (what: raise the per-job limit). Handed to Dana. Opening it in the browser pane landed on the home page, not /connect#limits (page redirected; the shared browser pane was also being driven by other testers). I redid it with a fresh link over HTTP: Dana's session raised limits via PUT /api/limits to per-job $2,400, month $3,000 (month also had to rise: $200 already spent by the other tester's jobs). Agent release stays OFF.
3. post_job (DP-1037) with options releaseMode review, reviewHours 48, retainPct 10, warrantyDays 90, inspector p_10ce21697b (Capitol Home Inspections), requireBefore true. Scope came back with auto milestones: m1 40% (c1,c2, permit doc), m2 60% (c3,c4,c5, inspection report, inspect:true).
4. review_scope: g1 (pro note), g2 (TSBPE licence note). apply_scope_suggestion "all" DROPPED the permit and inspection-report document conditions (m1d1, m2d1) from the milestones and withdrew offers (job back to scoped). set_options milestones refused after offers were asked. I cancelled DP-1037 (no hold) and reposted as DP-1039 (job_91260ffa38) with the licence/note wish in the text; did not apply suggestions.
5. Offers (about 1 to 2 min): Barton Creek $1,545, Eastside $1,495, Hill Country $1,650, Mueller $1,565, Lone Star $1,485. Countered Barton Creek (4.9 stars, licence verified) at $1,400; pro's agent accepted at once. accept_offer payWith saved: price $1,400.
6. Hold: AUTH-9ADAC10501AB, order MOCK-0A03E08E85BE, $1,750.00 authorized = $1,400 + $350 buffer (25%, raised from Dana's 20% by overrun risk 26%; disclosed in hold.explain). Paid with "sandbox test card, saved by an earlier hold" (another tester's), though whoami showed savedPayment null.
7. Waited about 7 real minutes after the hold: no pro movement ("start work", arrival said 21:01 platform time). Used "finish now" (POST /api/jobs/:id/demo-finish as Dana) as allowed. It only started the work (platform clock jumped to 21:23, including other testers' moves); the demo pro then sent evidence about every 1.5 to 2 min.
8. Before photos: 4 (c1..c4), GPS near the address. m1 submitted 21:27:46 (c1 photo, c2 photo, permit doc). Check: c1,c2 pass "no VLM verdict; a person confirms"; m1d1 `needs_fix` reason "The permit reads as one." Status review, askPerson link /link?code=<code>, handed to Dana, opened as Dana.
9. Dana viewed the three items (old heater with rust; rating plate GX-50T; permit text BP-2026-004512 plus a photo of a permit+"INSPECTION PASSED" sticker). Website confirm refused: `not_passed ... m1d1 (needs_fix)`. Dana asked for a fix twice (request-fix); the pro resent an identical permit both times (ev_b0ff6bb41f, ev_5770b19629, third round again), verdict identical. Link used the second time: /link?code=<code>.
10. Stopped. Dana did not release over m1d1 (she releases only what passed) and did not open a dispute. m2 (inspector) never reached; inspector demo sign-in never used.

## Money (job_91260ffa38 / DP-1039, pro Barton Creek Plumbing (demo), helper Marco Ruiz 20%)
- Held $1,750.00 (AUTH-9ADAC10501AB). Captured $0.00. Payouts none. Retainage none yet. Refunded $0. Ledger: one entry (hold), money.balanced true. Expected if finished: m1 $560, m2 $840, 10% retainage ($140) kept until the 90-day warranty window.
- Cancelled DP-1037: no hold ever placed.
- Dana's limits changed: per-job $2,400, month $3,000 (spent shown includes other tester's jobs). I did not touch DP-1036/1038/1040/1041.

## Whether I asked Dana
Yes, twice (limit raise; the m1 review/permit). Both times the server's askPerson link was given as is. A "finish now" was used once (nothing moved for 7 minutes).

## Findings
- BLOCKER: Permit document check cannot pass. Response: m1d1 {"verdict":"needs_fix","reason":"The permit reads as one.","confidence":0.86,"label":"NEEDS_MORE_EVIDENCE"} on rounds 1, 2, 3 for an identical document (permit number, date, site, work). Reason contradicts verdict; the job only has a ZIP (address.line null), which may be the cause but is not stated. Dana is stuck unless she releases over it, waives, or disputes. Confirm says "release anyway with acknowledgeFailed".
- BUG: apply_scope_suggestion "all" silently removed the permit and inspection-report conditions (m1d1, m2d1) from checks and milestones, leaving the inspect flag on m2 with no report document. Request: apply_scope_suggestion {job, suggestion:"all"}. Offers were withdrawn as a side effect.
- BUG: the pro's "permit" photo (permit.jpg) shows an "INSPECTION PASSED" sticker at milestone 1, before install; a before-install sign-off is a false claim.
- BUG/CONFUSING: hold said "paid with the sandbox test card, saved by an earlier hold" though whoami savedPayment was null; payWith saved succeeded.
- BUG: request-fix with an identical resend gives the same verdict three times with no escalation or explanation; "also: staff (expert queue)" has a 24 h SLA.
- CONFUSING: hold buffer 25% instead of Dana's 20% (explained in hold.explain, fine) but accept raised hold above what limits stated.
- CONFUSING: askPerson link /link?code=... for a limit lands on the home page after the Continue button (no redirect to /connect#limits). Links are one use; a second ask makes a new one.
- CONFUSING: "request_offers" is not in llms.txt or mcp-tools.json, but after scope edit the job sits in "scoped" saying "ask for offers"; I guessed request_offers and it worked.
- MINOR: review_scope still lists g1/g2 gaps even though the job text asked for licence number and a note.
- MINOR: demo pro took 7 real minutes to start; llms.txt says a step about every minute and a half. "finish now" is only on the website.
- MINOR: the shared clock jumped about 22 min from other testers' moves; arrival times unreliable.

## Unclear
- Whether the permit check fails for lack of a street address, the sticker image, or a rule I cannot see.
- Whether Dana is supposed to release over a failed permit with acknowledgeFailed (I assumed no: "releases only what passed").
- Whether 25% buffer exceeds her wish for 20%.
- Whether "finish now" was warranted at 7 minutes (the demo pro's arrival time was still ahead on the platform clock when I used it).
- Which saved card was used.
- What the retainage/warranty amounts will be at payout (not reached).

VERDICT: 1 BLOCKER, 4 BUG, 4 CONFUSING
