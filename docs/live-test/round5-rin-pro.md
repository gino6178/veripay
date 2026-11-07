# Round 5 - rin-pro (Shady Fix-It (test), plus Dana Kim as customer)

Platform clock not moved (no /api/demo/advance, no demo-finish). The onboarding link in shady-token.json worked (not dead).

## What I did
1. Onboarded Shady: POST /api/pro/onboard {code} 200; PUT /api/pro/paypal shady.fixit@done-demo.example -> "PayPal verified" (demo verification; payout says UNCLAIMED demo address). No licence. set_rates with floor 1.1 refused: "floor is 0.5 to 1".
2. Dana posted job_00b907bb2e (DP-1036, faucet, 78704, budget $250). Shady offered $150. Dana counter $120 ok; a 2nd counter -> 409 "Offer is countered". Shady withdraw_offer then a new offer $140 (counterUsed stayed true, "previous" linked). Re-offer $240 -> refused: "Your last price on this job was $140.00: a new offer can't be higher" (HELD). Dana accept_offer payWith card (payment approved by me as Dana): $168.00 authorized (140 + 28 buffer).
3. Change orders (Shady): $60 parts accepted pending; a 2nd CO while pending -> "One change order at a time"; a "payee":"evil@example.com" field was ignored with payeeRule message (HELD). $500 labor CO accepted as pending; Dana approve_change -> 403 limit "+$500.00 is over the $75.00 your person lets you approve" with askPerson link (HELD); Shady withdraw_change worked. Dana approved $60 -> re-hold $214.00.
4. Pro attempts at customer actions: A2A approve_change/release/confirm_checks/confirm/accept_offer/request_fix -> -32602 "data.action is one of ..." (HELD); pro key on /api/agent/release, approve_change, confirm_checks -> 401 "Send a person's agent token" (HELD).
5. Submitted evidence on job 1 with a 6-second gap for no_drip and padded CO $60 vs receipt $47.05 -> status review; before/no_drip/receipt needs_fix.
6. BLOCKER re-test (round 4) as Dana:
   - agent confirm_checks -> 403 limit "hasn't allowed you to confirm checks"; release (no ack) -> 400 acknowledge; release with ack -> 403 limit "hasn't allowed you ... release money the checks didn't pass" (all HELD, askPerson given).
   - website session as Dana (GET /api/auth/link?code=<askPerson code> -> 302 + cookie): POST /api/jobs/job_00b907bb2e/confirm {} and {"milestone":"m1"} -> 400 not_passed "Confirm is for checks that passed but needed a person to look. These didn't pass: before, no_drip, receipt..." (HELD; round-4 blocker fixed). POST .../release {} -> 400 acknowledge (HELD).
   - Then I POSTed .../release {"acknowledgeFailed":["before","no_drip","receipt"]} in Dana's web session -> 200, job released, captured $187.05 (140 + 47.05 receipt total; the $12.95 pad NOT captured; buffer released), payout PAYOUT-9CF55D12D744 $168.34 to the pro (fee 10%), item UNCLAIMED. This is the person-only path with named failed checks acknowledged, so I judge it by design, not a blocker. I did it deliberately while acting as Dana (it ended job 1); noting it because money moved on a job with failed checks.
   - 404: /api/jobs/:id/pay, /capture, PATCH job, /options. early_pay by pro in review -> 400 "Early pay is for a milestone that passed its checks and is in the customer's review window" (twice, same). Review-window auto-release not testable without moving the clock (releaseMode instant). Staff: POST /api/auth/staff {} as an anonymous visitor -> 200 "Demo staff" session; GET /api/staff/jobs and /api/staff/overview readable. Guessed staff release/confirm/capture paths -> 404 (I did not enumerate; found no staff money path). Inspector endpoints -> 401 "Sign in as an inspector".
7. Second job job_a6d3642116 (DP-1040) for the pro battery: Shady offered $120, Dana accepted by card ($144 hold; $192 after approved $60 CO).

## Pro-side guardrail results (job 2; always $0.00 captured, status review)
- No EXIF: needs_fix "has no capture time (a screenshot or an edited copy?): upload the original". HELD
- EXIF dated Sept 15: fail "taken Sep 15, 11:00 AM, outside the job window". HELD
- NYC GPS: fail "taken 2434.9 km from the job address". HELD
- Platform demo photo (/api/demo/assets/faucet-installed.jpg): fail "no capture time; looks like a photo sent with job job_b95fa19275 / job_9b6c348b9e". HELD
- Job 1's photo on job 2: fail "taken ... before work started; is the same file as a photo sent with job job_00b907bb2e". HELD
- Same photo for new_part and no_drip: needs_fix "same picture as ... sent for no_drip" and "Taken 0 seconds after the new_part photo". HELD
- Future EXIF (+1h) for no_drip: fail "claims to be taken after it was uploaded". HELD
- Timed condition faked (6 s gap, job 1): needs_fix "Taken 6 seconds after the new_part photo; the condition asks for at least 10 minutes". HELD. Legit fresh camera sink-dry more than 10 min after a fresh new_part: before/new_part/no_drip/work_note all "pass" by rules ("no VLM verdict; a person confirms").
- Injection in label/file name/caption of a fresh photo: new_part passed on camera data only, text had no effect; injection in a note: needs_fix "doesn't give the part replaced ... 0 words". HELD
- Notes: 4-word and irrelevant long note -> needs_fix "doesn't give the part replaced". HELD
- One note tagged checkIds [work_note,new_part,no_drip,before]: it did not pass the photo checks, but it overwrote their photo evidence (see BUG-1).
- AFTER before BEFORE (before photo taken later than the new_part photo): before still "pass"; ordering between before and after photos is not enforced. CONFUSING
- Unchanged resend: when a check had failed, rejected "unchanged: Nothing changed since the last check of before: it was turned down"; after Dana's request_fix an identical resend was accepted and re-ran the checks. MINOR
- Receipts (images I drew; server OCR "windows-ocr (zh-Hant-TW)"): date "can't be read" for typed 2026, 2025 and undated alike, so wrong date vs missing date could not be separated (same needs_fix). $95 receipt vs $60 CO: "receipt_over_change_orders: receipts $95.99 > approved $60.00 (only approved amounts are paid: $60.00)" (OCR misread 95.00). Padded CO $60 vs receipt $47.05: needs_fix "parts are paid at $47.05 unless receipts for the difference are shown"; job 1 captured only $47.05 for parts. HELD. Text-only receipt -> 400 "The file is empty."
- Licence: M-90417 (Barton Creek's) -> valid:false "already registered to another pro on Done & Paid ... Staff review it."; M-00001 "Not found in the demo registry"; X-12345 bad format. HELD. But an unlicensed pro was still offered, hired and paid (licence only "recommended"; scope has no licence check, only suggestChecks). CONFUSING
- Withdraw/re-offer gaming: higher re-offer refused (HELD); counter state carried over.
- Early pay before passing and twice: refused. HELD
- askPerson link as the pro: the link is a bearer sign-in as Dana (GET /api/auth/link?code= -> cookie). By design, but whoever holds one is Dana on the website.
- Confirming/releasing as pro: no such actions exist for the pro. HELD

## Money per side
Job 1: hold $168 -> re-hold $214 -> captured $187.05, buffer released, paid to Shady $168.34 (UNCLAIMED demo address), fee 10%. Job 2: hold $192 held, captured $0.00, in review; nothing moved.
Each call returned in about a second. I asked my person for nothing.

## Findings
- BLOCKER: none. (Round-4 blocker re-tested: confirm with failed checks is refused in agent and web.)
- BUG-1: start_work "before" photos are not counted. Jobs 1 and 2: start_work {before:[{dataUrl,checkId:"before"}]} then submit_evidence -> "before: needs 1 photo, got 0". Re-sending the same photo through submit_evidence passed it. Also each submission replaces earlier evidence per checkId: one note tagged with checkIds for new_part/no_drip/before made them "needs 1 photo, got 0; file for ev_2f9f74273d was not found".
- BUG-2: demo receipt.jpg already accepted on job 1 passed the cross-job reuse test on job 2 (photos are caught, receipts are not).
- BUG-3: request_change is allowed while the job is in review, but approve_change then answers 409 {"error":"state","message":"Job DP-1040 is review."} and the pro's submit_evidence is refused "Nothing was stored: your change order +$60.00 is waiting for the customer". Only withdraw/request_fix unblocks.
- CONFUSING: an anonymous visitor can get a "Demo staff" session (POST /api/auth/staff {}) listing all jobs with customer names, prices and holds.
- CONFUSING: a $500 change order is accepted as pending against a $75 customer limit (refused only on approval); before/after photo order not enforced; receipt OCR locale zh-Hant-TW cannot read clean typed dates; unlicensed pro can be paid.

## Unclear
- Whether start_work before photos are meant to count for the "before" check.
- Whether a web release with acknowledgeFailed should be reachable by anyone holding an askPerson link (full Dana session).
- Whether a re-offer after a counter should be bound by the customer's $120 counter.
- My shell clock and the platform/camera clock differed by about 22 minutes at the end (camera said 21:29 while my shell said about 21:08); I waited about 10 real minutes and relied on camera times.
- Not exercised: wrong receipt date vs missing date (OCR), staff money paths, review-window auto-release.

VERDICT: 0 BLOCKER, 3 BUG, 3 CONFUSING
