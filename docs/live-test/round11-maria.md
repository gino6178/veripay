# Done round 11: Maria Lopez agent (maria)

Scope: basic-flow check over HTTP (REST /api/agent/<tool> with Maria's agent token; person steps as Maria over HTTP). No browser tools, no source reading. Platform: http://localhost:8810.

## Outcome in one line

The job did NOT reach payment. Eastside Pipe & Drain was hired at $175.00 and $199.00 is authorized (held, not captured). The pro's work was judged unclear, I asked for a fix, and the pro never answered. Nothing captured, nothing paid out, nothing refunded.

## Step by step

1. whoami / my_limits: Maria, ZIP 78702, perJobMax $500, monthlyMax $1,500, changeMax $75, buffer 20%, agentMayRelease false, agentMayCancel true.
2. post_job (job_a2a7758ccb, DP-1042), budget $199.00, ZIP 78702, text as given. Server returned status offered, scope "Fix a leaking faucet" with 4 done-conditions (before, new_part, no_drip, work_note), price ceiling $199.00, window to 2026-11-09T03:00Z. Fair-price estimate: typical $175 (range $165 to $180, median $175, from 13 completed faucet jobs, "an estimate from similar jobs, not a quote").
3. Offers arrived within about 75 seconds (6 offers, all fair-price checked by the server):
   - Barton Creek Plumbing (demo) $220, above range, over ceiling (not acceptable)
   - Luis Ortega Plumbing (test) $150, below range, acceptable. License NOT verified, insurance NOT verified, payout to a demo address (unclaimed in sandbox). Server still said hireable: true.
   - Eastside Pipe & Drain (demo) $195, above range, acceptable. License, insurance, PayPal verified.
   - Hill Country Leak Pros (demo) $255, over ceiling
   - Mueller Plumbing Co. (demo) $220, over ceiling
   - Lone Star Rooter (demo) $195, above range, acceptable
4. Chose Eastside Pipe & Drain. counter_offer once: $175.00 (within the typical range). The pro's agent accepted the counter at once.
5. accept_offer, payWith "paypal", slot index 1 (2026-11-05 13:00Z, 7:00 AM Central). Returned status agreed, hold pending_approval, $199.00 = $175.00 price + $24.00 buffer (buffer capped by the $199 ceiling, not 20% = $35).
6. Person step (Maria): GET the simulated PayPal approval page, then POST it with a=yes. 302 to /paypal/return. Hold status became held: auth AUTH-D4252D559A17, honorUntil 2026-11-08T10:35:36Z, expiresAt 2026-12-04T10:35:36Z. capture null.
7. Waited about 8 minutes (wait_for_news); no pro action. Work had actually started on its own at 10:47 platform time (before the booked 13:00Z slot).
8. Evidence: pro submitted 6 photos and 1 note at 11:02. Checker result at 11:03: status review ("0/4 done-conditions passed, 3 wait for a person to confirm").
9. Reviewed the evidence myself. Pulled the photos with job_evidence include:"data" and looked at them. All 6 photos carry the caption "DEMO PHOTO (synthetic): corroded shut-off valve, weeping" and show a valve, not a faucet cartridge. The note says "Part replaced: the worn Moen 1225 cartridge." The photos do not match the note or the job.
10. Confirm decision: none. None of the three photo conditions fits the evidence, so I did not confirm anything. (confirm_checks also needs agentMayRelease, which is false.)
11. Person step: askPerson link returned by job_status (code for DP-1042). Called /api/auth/link/info, then POST /api/auth/link with Maria's PIN. Session signed in as Maria.
12. request_fix (via Maria's agent token; the session-only call was refused with "Send a person's agent token") with a reason stating the photo mismatch and what to send. Status became needs_fix, waitingOn pro.
13. Waited about 9 minutes (wait_for_news and polling). Pro sent nothing.
14. demo-finish as Maria (signed in with PIN) per the brief. First call earlier (before the fix request) moved the visit clock 15 more minutes and sent the job to review. This second call on needs_fix returned 200, status still needs_fix, no change, no explanation.
15. my_home: 1 job (DP-1042, needs_fix, no paid closeout), appliances [], warranties [], suggestions []. maintenance_suggestions: suggestions []. list_groups zip 78702: groups []. Nothing to join. open_group and join_group not used.
16. payout_status is not a customer tool (the server's error listed the customer tools). Used job_status money instead: captured $0.00, retained $0.00, payouts [], releases [], ledger 1 line.

## What each side ends up with (at the time of this report)

- Maria: $199.00 authorized on her PayPal (held, not charged). No capture, no refund. Her monthly "spentThisMonth" shows $175.00 and "left" $1,325.00 (see C4).
- Eastside Pipe & Drain (demo): $0 captured, $0 paid out. Hired at $175.00; 10% fee and payout would apply only at release/capture. Not yet paid. Their check results were not accepted.
- Helper (Marco or other): none (Eastside has no helper).
- Refunded: none.

## Time per step (approximate, wall clock)

- Post to first offer: about 65 s. All offers in about 2 min.
- Counter to accept: about 5 s (platform: 10:33:54 counter, 10:35:00 agreed).
- Approve hold to money_held: about 36 s (10:35:00 to 10:35:36 platform).
- Work submitted to checked: about 20 s after evidence (11:02:43 to 11:03:03 platform).
- Fix requested to today's end: nothing from the pro in about 9 minutes (11:05:45 to 11:14:48 platform), then demo-finish did nothing.
- Total: about 25 minutes including waiting, under the 25 minute limit.

## Did I need to ask my person?

Yes, for the PIN-protected steps only: the PayPal hold approval (my instruction from the brief), the askPerson link (PIN), and the fix request. I did not ask anything outside the brief. No dispute, no release, no change order, no tip.

## Findings

### BUG

B1. Check verdict says "pass" while the check is NEEDS_REVIEW and the job says 0/4 passed.
Request: job_status (full). Response: checks[0].checks[] for before, new_part, no_drip each have verdict "pass", confidence 0.3, label "NEEDS_REVIEW", needsPerson true. The same check's summary says "0/4 done-conditions passed, 3 wait for a person to confirm". A reader of the verdict field sees "pass" three times. The label, verdict and summary disagree.

B2. Checker accepted photos that do not match the job as "pass".
Request: job_evidence include:"data" for DP-1042. The photos are captioned "DEMO PHOTO (synthetic): corroded shut-off valve, weeping" (ev_8ea1744ef4, ev_bc11d36d20, ev_e7eeabaa6b and the second set ev_90e78f473e, ev_110b4bebf9, ev_b3deeb7ed1). The checker's own reasons say "the BEFORE photo's description doesn't name this job's fixture or problem" and "looks unlike the BEFORE photos", yet the verdict is "pass". Nothing paid out here because it went to review, but a "pass" with a 0.3 confidence on photos the reason itself calls unrecognised is risky.

B3. work_note needs_fix reason is garbled and contradicts the note.
Request: job_status, toFix[0]. Response: {"checkId":"work_note","verdict":"needs_fix","reason":"Note note 1 shows it isn't done yet: note naming the part replaced and anything else found is not true."}. The note text is "Part replaced: the worn Moen 1225 cartridge. Ran the water 10 minutes after the repair: no drips under the sink." That fits the condition, and the reason repeats the condition's own wording ("note naming the part replaced ...") as if it were a claim. Doubled "note note", and it doesn't say what is wrong.

### CONFUSING

C1. demo-finish: no feedback on what it did.
Request: POST /api/jobs/job_a2a7758ccb/demo-finish as Maria (cookie session). First call: job went to review, clock note "visit takes 15 more minutes (timed photos)". Second call on needs_fix: 200, status still needs_fix, no note, nothing changed. The brief says demo-finish is for "nothing moves"; the response does not say whether it applies to a fix request or why it did nothing.

C2. Work started before the booked visit window.
Request: job_status timeline. The booked slot was 13:00Z (7:00 AM Central). The pro's "work started" was at 10:47Z (platform), about 2 hours early, and the photos are timed 04:49 to 05:02 Central. The job showed "they arrive about 7:00 AM" as waitingOn after hold, yet work was already running. No reschedule, no note.

C3. Scope review flagged a gap that was not fixed before the pro worked.
Request: PayPal hold step (money_held), event 556 scope_review. "'Note naming the part replaced and anything else found' has no observable standard: say what a photo or receipt must show." That is the exact condition that later came back needs_fix. The scope was not tightened (apply_scope_suggestion is allowed for stricter wording), and the job was not held back. Customer tools do not say the flag matters when accepting.

C4. spentThisMonth shows the price, not the hold.
Request: my_limits after hold. spentThisMonth $175.00, leftThisMonth $1,325.00, while the held amount is $199.00 (buffer $24 on top). It is unclear whether the monthly cap counts the held amount or only the price.

C5. Luis Ortega Plumbing (test) is hireable with an unverified license and insurance.
Request: list_offers (full). Offer ofr_ed897f2acd: license valid false, status "not_verified", insurance null, payout to a demo address (unclaimed in sandbox), acceptable true, hireable true. The scope said a TSBPE-licensed plumber is needed. Not hired by me; flagged because hireable is true.

C6. Offer slot in the past.
Request: list_offers at 10:33 platform time. Eastside's first slot was 2026-11-05T10:24:50Z, already past by the platform clock. I used slot index 1 (13:00Z) to avoid it. A past slot should not be offered.

C7. Clock is inconsistent across fields.
- Counter event: "at" 10:33:56 but "realAt" 10:19:56, a 14-minute gap.
- Approve page HTTP Date header: 10:21:36 GMT while platform now was 10:35.
- /api/info clock said "29 minutes ahead of real time" at one point.
Times on jobs are demo times, but nothing in the API says which clock a given field uses.

C8. Customer cannot see payout status.
Request: payout_status {job} as customer. Response: error "Tools: whoami, my_limits, ..." with payout_status not in the customer list. The only money view for a customer is job_status money (captured, retained, payouts, ledger). Asked for "payout status" in the brief; had to use job_status instead.

### MINOR

None recorded beyond the above. (My own slip: I passed the old news cursor to wait_for_news once and saw duplicate events; this was my error, not the server.)

## Unclear

- Whether a fix request to a pro that never answers ever times out for the customer. The job sits at needs_fix, waiting on the pro. The next person-only step (release, dispute) was not tried. The brief did not say to release, and agentMayRelease is false.
- Whether demo-finish is supposed to finish a fix as well as a visit.
- Whether the "pass" label with NEEDS_REVIEW counts as a pass for the release rules (the summary says it does not).
- Why the monthly limit shows $175 while $199 is held.
- What "buffer capped by the ceiling" means for a later change order: how much more can be held if a change order is approved.
- Whether the work_note needs_fix was about the note's wording or about the photos (the reason text is garbled, so I could not tell).
- The platform clock vs wall clock: which one a pro's "arrive at" time uses.
- The pro did not explain why it had started work two hours before its booked visit.
- Whether my_home should show the faucet job's warranty once the job is paid (nothing paid, so empty is reasonable, but not stated).

## New tools (summary)

- my_home: returned the job in history (needs_fix, no closeout, no insurance), empty appliances, warranties and suggestions. Accurate, but empty because the job is unpaid. Clear enough.
- maintenance_suggestions: empty ([]). Rule notes said suggestions come from appliance age, last service and warranty dates. With no paid jobs there is nothing to suggest. Nothing accepted (not within limits to accept anything).
- list_groups zip 78702: empty ([]). Nothing to join. Did not call open_group or join_group.

VERDICT: 0 BLOCKER, 3 BUG, 8 CONFUSING
