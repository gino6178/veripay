# Done round 5: Luis Ortega Plumbing (test), pro side

## What I did
1. Read /llms.txt and GET /api/info (platform now 2026-11-04T20:46Z). Pro key from luis-token.json (not printed here).
2. Onboarding on the website (Luis allowed it): POST /api/pro/onboard {code} gave a session cookie; PUT /api/pro/paypal {email luis.ortega@done-demo.example} -> payout verified:true ("demo verification"); PUT /api/pro/verification (licence M-41877, Lone Star Mutual LSM-2290415, $1,000,000, expires 2027-06-30) -> insurance valid, licence valid:false "Not found in the demo registry."; PUT /api/pro/rates {callout 85, hourly 110, partsPolicy at_cost, radius 20} -> readiness hireable:true.
   Note: before the rates PUT the defaults were callout $60 / hourly $90 / radius 25.
3. list_jobs (A2A): DP-1033 faucet ($220 ceiling, 2.3 mi) and DP-1028 drain ($160, window ended 2026-10-31). Offered on DP-1033 at $190 (offer ofr_037e2fd9a2); wait_for_news showed new jobs DP-1035, DP-1036.
4. Offered on DP-1036 at $165 (lost: a customer hired Shady Fix-It at $140 after a $120 counter). On DP-1035 (customer-added condition s6 "Note with the plumber's TSBPE licence number") sent scope_reply (I can give M-41877 in a note) and offered $150; the customer hired Lone Star Rooter (demo) at $180, so I never got it (offer was withdrawn by me after I was hired elsewhere).
5. Withdrew the $190 offer on DP-1033 and re-offered $140 (ofr_b35b27b5ab). Hired at $140.00 at 20:48:56 (about 80 s after the offer). Hold: $175.00 authorized (AUTH-F2D8C59C017A): price 140 + buffer 35 (25%, raised from 20% by "Done-Risk").
6. start_work with 1 before photo (valve-worn, checkId c1) -> status working.
7. request_change +$47.05 kind parts with the before photo as evidence (chg_355aea2f0e). Customer agent approved at 20:52:32 (~90 s after request). Re-hold $201.05 (AUTH-B7584AAEB9FD, replaced the first, as the change exceeded the buffer left). Job price now $187.05.
8. submit_evidence submit:false: c1 photo (faucet-installed, taken 20:52:08), a note (part replaced, licence number), c3 receipt ($47.05, dated 11/04/2026). Then waited for real until the platform clock was past c1 + 10 min, took c2 photo (sink-dry, 21:25:30) and submitted. Checks: 3/3 passed (rules) but status "review": "some need a person to confirm". The seeded customer confirmed about 2 minutes later.
9. Released: $187.05 captured; fee $18.71 (10%); pro $168.34; helper $0; retained $0; refunded $0. PayPal fee absorbed by platform $7.02; platform net $11.69. Ledger balanced:true. Payout batch PAYOUT-C29B86806259, batchStatus SUCCESS, item DP-1033-pro status UNCLAIMED ("no PayPal account with that email yet; receiver claims within 30 days. Not a failure."). Expected for a demo address.

## What each side ends up with
- Customer: $187.05 charged (hold of $201.05 released down to what was due; unused buffer never captured).
- Luis: $168.34 to luis.ortega@done-demo.example, UNCLAIMED in PayPal until a PayPal account exists with that email.
- Platform: $18.71 fee, minus $7.02 PayPal fee.
Timings: offer->hire ~80 s; change order->approval ~90 s; evidence->customer confirm ~2 min; confirm->payout immediate.

## Asked my person for anything?
No. Onboarding was pre-authorised.

## Findings
- BUG: price vs. parts. My offer said "parts at cost" but the offer's `parts` was $0.00 and breakdown "The pro's own agent gave one price, not a breakdown." The receipt rule ("total matches the parts in the price plus any approved change order") therefore needed a change order for all $47.05. Worked, but a pro can't state parts separately in `offer` (arguments: job, amount, arrival, note, helper only), and the earnings consequence (change order must be approved by the customer) is not stated in llms.txt.
- CONFUSING: licence. PUT /api/pro/verification with M-41877 returns valid:false "Not found in the demo registry." although it fits the format. Offers show "Licence not verified" yet remain hireable. The scope review then flagged "TSBPE-licensed plumber is needed" as a gap, and DP-1035's customer added a licence-note condition. A licensed pro has no way to get it verified (no action named; "reviewed": null).
- CONFUSING: clock. /api/info "now" was 20:53:35 and later 21:25:07 after a ~10 minute wait on my side; event timestamps in wait_for_news (e.g. 21:03:31 for evidence I sent at platform 21:25) disagree with that clock and with the photo timestamps. I couldn't tell which clock the 10-minute rule uses; it passed.
- CONFUSING: wait_for_news with `after` returns immediately if any event newer than `after` exists for any job, including other pros' jobs (feed of all jobs + feed). Needed local filtering; not usable as a quiet wait.
- CONFUSING: status "review" with "Every check passed, but some need a person to confirm (low confidence or no model verdict)" although job_status said "3/3 passed (rules)". The pro cannot do anything except wait.
- MINOR: withdraw_offer after hire elsewhere is needed manually; offers on the other jobs stay open (I withdrew ofr_4d4bca5930 on DP-1035 after being hired on DP-1033 - it was already lost).
- MINOR: make-assets.ps1 fails under the default PowerShell execution policy (needed -ExecutionPolicy Bypass).
- MINOR: I accidentally generated a faucet-installed photo before the work had started (camera stamps now); I discarded it and did not submit it.
- MINOR: demo pros undercut: Shady got hired at $140 after countering $120; I only won at $140 on an old (2-day) job. My $190 and $165 offers lost/were ignored.

## Unclear
- Whether the offer `amount` should include parts (it is treated as the total price with parts $0).
- Whether the licence not found in the registry affects the 'licence' check of customers' conditions (DP-1035) or just the badge.
- Which clock the "10 minutes after c1" rule uses (platform vs photo EXIF); I waited for real and the platform clock jumped about 30 min over ~10 min of real waiting.
- Why the hold buffer was 25% not the person's 20%.
- Payout UNCLAIMED: whether "Luis was paid" counts before he signs up to PayPal.
- Whether DP-1028 (window ended 10-31) is still biddable; I did not try it.

VERDICT: 0 BLOCKER, 1 BUG, 4 CONFUSING
