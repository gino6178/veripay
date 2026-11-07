# Done round 7: Luis Ortega (pro agent) report

## Outcome
- Onboarded: yes (PIN <pin> used for the person step, as authorized in the brief).
- PayPal verified: yes (luis.ortega@done-demo.example, demo verification).
- Hireable: yes, after PayPal verification (readiness had only the PayPal blocker).
- Hired: yes. DP-1035 (job_c38cb4d000), "Fix a leaking faucet", 78702.
- Price: $140.00 (my offer, accepted by the customer agent at the same price). Ceiling $200.00.
- Hold: $168.00 authorized (price $140.00 + $28.00 buffer, 20%), AUTH-866F6E20AB79, honor until 2026-11-08T02:55:37Z.
- Captured: $0.00. Fee: not yet computed (no capture). Payout: none. Payout status: null, ledger shows only the hold.
- Current state: status `review`, waitingOn the customer ("confirm, release, ask for a fix or dispute"), also staff expert queue.
- Not paid. Job is not finished from the platform's side.

## Steps (times are platform/UTC, 2026-11-05)
1. 02:53 readiness: blocker = PayPal only. Licence and insurance were recommended, not blocking. The onboarding link in the token file (code 0DsWo...) was not used; readiness issued a fresh one (code SyOl..., expires 2026-11-12).
2. 02:53:39 POST /api/pro/onboard {code, pin "<pin>"}: OK, PIN set, pro signed in.
3. 02:53:40 PUT /api/pro/paypal {email}: "PayPal verified" immediately, no PIN asked (within the 10-minute post-onboarding window).
4. 02:53:4x list_jobs: 3 open plumbing jobs (DP-1035, DP-1033, DP-1028 expired). Chose DP-1035.
5. 02:54:07 A2A offer {job job_c38cb4d000, amount 140, arrival 2026-11-05T15:00Z}: ofr_e2fb8135ea, acceptable: true.
6. 02:54:58 customer accepted at $140.00 (job_agreed). Money not held yet: "approve the hold in PayPal" (customer side, not mine).
7. 02:55:37 hold authorized (customer side). $168.00 held, status `held`.
8. 02:56:25 start_work with one BEFORE photo (valve-worn, wide, GPS 30.2632,-97.7166, EXIF ok, 0 m from job). Status `working`.
9. 02:56:41 and 02:56:45 new_part photos (faucet-installed, wide + close). Work note sent in the same submit.
10. 02:57:03 submit_evidence (3 items: 2 photos new_part, 1 note). A dry run first (dryRun: true) warned that no_drip is timed from new_part and must be retaken after it.
11. 02:57:53 checker: 4/5 passed. `before` and `new_part` = NEEDS_REVIEW ("photo model busy; a person confirms", model HTTP 503). `no_drip` = needs_fix (no photo yet). `receipt` = pass by rule (no parts in price). `work_note` = APPROVED.
12. 02:58:03 ask_for_review on `before` and on `new_part` (expert queue). Both accepted. SLA due 19:12:53 and 19:13:03 platform time (about 16 hours away).
13. 02:58 to 03:06 waited on the platform clock: no_drip photo must be at least 10 minutes after new_part (02:56:41), so the earliest was 03:06:41.
14. 03:06:44 and 03:06:47 no_drip photos (faucet-installed, wide + close). Submitted at about 03:06:56 (2 items).
15. 03:08:16 checker: 5/5 model verdicts pass. `before`, `new_part` and `no_drip` still NEEDS_REVIEW (503), so the job is in `review` with a person to confirm. Expert SLA due 19:08:16 platform time.
16. 03:08 wait_for_news and payout_status: no new customer decision, no payout.

## What each side ends up with
- Customer: $168.00 authorized on PayPal (not captured). Nothing refunded.
- Pro: $0.00 captured, $0.00 paid. Nothing due until the customer releases or the expert queue confirms.
- Platform: nothing captured.

## Time
- Hire to hold: about 39 seconds (02:54:58 to 02:55:37).
- Hold to first evidence: about 1.5 minutes.
- Evidence to the checker decision: about 1 minute, then an expert queue of ~16 hours on the 503-affected checks.
- Total so far: about 15 minutes of my own work from onboarding to review.

## Did I need my person?
- Yes, for the PIN step (onboarding), which the brief supplied (<pin>). I did not ask again.
- No other person step was needed. A receipt was not provided (see findings).

## Findings

**BLOCKER**
- The photo checker returned NEEDS_REVIEW for all three photo checks, with the reason "photo model busy (HTTP 503); not retried". It is a model outage that the platform did not retry, so the job cannot be paid automatically. Payment now depends on the customer or the expert queue (about 16 hours SLA). Request: POST /a2a message/send, action `submit_evidence` for job_c38cb4d000; response `status: "review"`, `checks[].checks[]`: `{"id":"before","verdict":"pass","label":"NEEDS_REVIEW","reason":"photo model busy; a person confirms","signals":["needs_person: no VLM description (model busy (HTTP 503); not retried)"]}`.

**BUG**
- The scope adds a `receipt` condition ("Receipt for the replacement parts"), but the rule passes it when "no parts in the price and no change orders" (`"No parts in the price and no change orders: no receipt is needed (the scope writer added this condition; the customer didn't)"`). The scope and the checker disagree: the condition is in the scope but never needed. Cannot tell which is intended.
- The `before` and `new_part` photos were marked "same spot" / "not same spot" in signals with a 34 to 37 bit hash difference. Not sure it's a bug, but the checker's own signals did not decide them.

**CONFUSING**
- The token file's onboarding link (code 0DsWo...) differs from the one readiness returns (SyOl...). Readiness returned the new code, but the file was not updated. It was not clear which one is current; I used the readiness one, which worked.
- `submit_evidence` asks for "photo>=1" in the rule but shows `shots.min: 2`. I sent 2 photos per check; the response did not say whether 1 would have been enough.
- The receipt condition: I had no receipt to send (no source of a supplier receipt for the cartridge in this test, and I did not generate one). The scope asks for it, the checker passes it by rule, so the job did not need it, but the scope still lists it. Unclear whether a pro must always upload one.
- `wait_for_news` events say "your offer" / "your job" inconsistently in the `why` field.
- The expert-queue SLA (about 16 hours) is far beyond the usual wait stated in the brief, and the response does not say whether the demo will advance it.

**MINOR**
- `my_jobs` is not a pro A2A action (error lists the allowed ones). Expected from the pro side; the error message was clear.
- The customer's hold was approved on the customer side; there was no pro-side way to nudge it.

## Unclear
- Whether the customer agent (Maria Lopez's agent) will release on its own or whether a person has to confirm the release. The job is `waitingOn: customer`, and `agentMayRelease` is not shown for the customer side.
- Whether the expert queue SLA (19:08 platform time) is reachable in the demo, or whether the demo clock (`/api/demo/advance`) should be used. I did NOT advance the shared demo clock.
- Whether the `receipt` condition should exist when no parts are in the price.
- The `shots.min` vs `photo>=1` wording (above).
- Whether the photo model's HTTP 503 was an intended test of the review path. It looked like an outage.

## Files
- Photos: <scratch> (before-wide.jpg, new-part-wide.jpg, new-part-close.jpg, no-drip-wide.jpg, no-drip-close.jpg)
- Helper scripts in D:/paypal/join/examples (done7-luis-*.mjs) were deleted after use.

VERDICT: 1 BLOCKER, 1 BUG, 5 CONFUSING
