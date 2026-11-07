# Luis Ortega Plumbing (test): done round 9 report

Agent: luis (pro side, A2A). Platform: http://localhost:8810. Demo times are platform times.

## What I did, step by step

1. **Onboarding (person step, PIN <pin>).** `POST /api/pro/onboard {code, pin}` with the onboarding code from the token file. Answer: pro `luis-ortega-plumbing`, verification not yet done, PIN set.
2. **PayPal (person step).** `PUT /api/pro/paypal {email: luis.ortega@done-demo.example}`. Answer: "PayPal verified", method "demo verification (stands in for Log in with PayPal)", payout `verified: true`, `demoAddress: true`.
3. **Licence (person step).** `PUT /api/pro/verification {license: {number: M-41877}}`. Answer: number stored, class "Master Plumber", status `not_verified`, "Not in the demo registry", and it asks for a licence photo or PDF (`licenseDoc`). I have no licence document, so I did not send one.
4. **Readiness (A2A).** `hireable: true`, no blockers. Recommended only: licence and insurance.
5. **Feed (list_jobs).** Open plumbing jobs: DP-1036 (ceiling $200, 5 offers), DP-1037 ($199, 0 offers, no receipt check), DP-1032 ($220, 0 offers, has a parts receipt check).
6. **DP-1037 (job_c0eac1de89), first try, lost.** Offer $120, arrival 09:00Z. The customer chose another pro's offer about 3 minutes later (`offer_declined`, event 465). The job was agreed at another price, so I did not get it.
7. **DP-1032 (job_d8b1e16420), won.** Offer $95 (ofr_15e7f4f1df) at about 07:41, arrival 09:30Z. Customer agreed at 07:43:01 (`job_agreed`): "Hired Luis Ortega Plumbing (test) for $95.00". Hold `AUTH-A87FF6CEE39B`: $118.75 = $95.00 price + $23.75 buffer (25%, raised from the 20% default by the overrun-risk model).
8. **Before photos and start_work.** Two `valve-worn` photos at 30.3516,-97.733 (camera stamps 07:43:56 and 07:44:14). `start_work` answered status `working`, with two before evidence items (ev_7ebd37dfa8, ev_7cd8e2962f). Work started at 07:45:45.
9. **After photos c1 and receipt c3.** Two `faucet-installed` photos (07:46:22, 07:46:31) submitted as c1. Receipt from make-assets, TOTAL $47.05, dated 11/05/2026, submitted as c3. Note submitted too, but DP-1032 has no note check, so it had no check id.
10. **Waited for the timed condition.** c2 needs its photo at least 10 minutes after the c1 photo. I waited on the platform clock until 07:57 (c1 + 10 min). A Monitor loop watched `/api/info` for it.
11. **c2 photos and submit.** Two `sink-dry` photos stamped 14:17:41 and 14:17:55 platform time (see finding on the clock below). Submitted as c2. Result at 14:18:36: all three checks passed by model+vlm, but c1 was `NEEDS_REVIEW` (confidence 0.3, "the photo's description doesn't name the faucet"). The job went to `review`.
12. **ask_for_review on c1.** Sent at 14:18:58 with a note. No expert event followed. The customer's person confirmed all conditions at 14:20:36 (`confirmed`), and the job was released at 14:20:36 (`money_released`).

## What each side ends up with

| | |
|---|---|
| Price | $95.00 |
| Held at hire | $118.75 ($95.00 price + $23.75 buffer) |
| Captured | $95.00 (release) |
| Refunded | $0.00 |
| Platform fee (10%) | $9.50 |
| PayPal fee (per the ledger) | $3.81 |
| Platform net | $5.69 |
| Pro (Luis) | $85.50, Payouts batch PAYOUT-7D977B58DF13 |
| Helper | none |
| Payout status | `UNCLAIMED` (batch SUCCESS). Expected for a demo address with no PayPal account behind it, per the server's note. |

The unused buffer ($23.75) was not captured and was released from the hold.

Timing: onboarding 07:21, DP-1037 offer 07:22 (lost at 07:25), DP-1032 offer about 07:41, hired 07:43, work started 07:45, c1 submitted 07:46, c2 submitted 14:18 (demo clock), review 14:18, released 14:20 (demo clock). Real elapsed time for the job was about 35 minutes, of which about 10 minutes were the mandatory c2 wait.

## Did I have to ask my person for anything?

Yes, three person steps, all with the PIN the brief gave me: onboarding, PayPal verification, and the licence number. I did not need to ask anyone else for anything. The c1 review could have needed a person, and the customer's person confirmed it, not the expert queue.

## Findings

- **BUG (c1 review).** The photo model misread the new cartridge. Its description says the image shows "a new cartridge installed in a printer" and "a yellow and black rectangular object". The reason given is `description_gap`, and the signal says the image is "not same spot" versus the BEFORE photos (hash 26 bits apart). My photos were a real cartridge at the job site. The expert queue was never answered, the customer confirmed c1 instead, and the job paid out about 2 minutes after the review.
  - Request: `POST /api/agent/...` submit_evidence for c1 (two `faucet-installed` photos, 07:46:22 and 07:46:31).
  - Response: check c1 `verdict: "pass"`, `label: "NEEDS_REVIEW"`, `needsPerson: true`, `confidence: 0.3`.
- **CONFUSING (clock).** `/api/info` shows the clock 415 minutes ahead. The clock record lists a "finish now" move of 375 minutes at 07:21:36 by "Demo · Jamie" (to the job window, 14:00Z), but my before photos were stamped about 07:43 and c2 at 14:17. So the clock jumped from about 07:47 to 14:17 between my c1 and c2 submissions. The 10-minute rule was still met under either reading, but the history does not show the jump at that point.
- **CONFUSING (scope review).** The scope review (model) says "No BEFORE photo" and "No note from the pro". I did send both, but DP-1032's scope has no before or note check, so I had nowhere to attach them and the warning persists. It also says the receipt "names evidence that can't show it", yet check c3 passed.
- **CONFUSING (licence).** The licence number M-41877 is accepted and shown as "not_verified: not in the demo registry", yet readiness still says `hireable: true`. There is no way to send the licence document from the agent. I only had the number.
- **CONFUSING (DP-1037).** A $120 offer lost to another pro within about 3 minutes, with no price or ranking shown. The offer list shows only the winning and declined status, so I could not see the price I needed to beat.

## Unclear

- The clock jump described above: when the platform clock moved from about 07:47 to 14:17, and whether that was a demo "finish now" or something else.
- Whether the c1 review was answered by the expert queue at all. The `review_asked` event is there, but the next event was the customer's person confirming, with no expert result.
- Why the job record shows `checkedAt: 07:25:33` in `payout` while the payout `at` is 14:20:36. I assume it is the last PayPal status check time, but it is not labelled as such.
- The $23.75 buffer: 25% instead of the 20% default because of the overrun risk. Explained by `hold.explain`, but the risk model is not something I can check.
- Whether `view` defaults and the `note` submitted without a check id are kept anywhere; the job record shows the note as evidence (ev_69c58427d2) with no checkId.
- The fee: the ledger shows a PayPal fee of $3.81 taken from the platform side. I did not know whether that comes out of the pro's $85.50 or the platform's $9.50. The pro payout is $85.50, so it appears to come from the platform.

VERDICT: 0 BLOCKER, 1 BUG, 4 CONFUSING
