# Done round 11: Luis Ortega (pro side, A2A + onboarding REST)

Platform: http://localhost:8810. Pro: Luis Ortega Plumbing (test), id luis-ortega-plumbing, pro person p_2a75d231a6. Platform clock at start: 2026-11-05 ~10:17 UTC (America/Chicago = UTC-6).
Calls: about 60 HTTP calls (curl and small node fetch scripts). No browser tools used. I did not read any Done & Paid source.

## Result in one line

Luis was hired on DP-1033 "Fix the leak" for $175.00, the work was checked, the customer released the money, $175.00 was captured and $157.50 was sent to his PayPal. PayPal says the payout is UNCLAIMED (the address is a demo address with no PayPal account behind it). The dashboard and work record match the ledger.

## Step by step

| # | Time (UTC) | Step | Server answer |
|---|---|---|---|
| 1 | 10:17:31 | POST /api/pro/onboard {code, pin <pin>} | 200. Person p_2a75d231a6 created, pin set, PayPal "not verified", licence "not verified". `next`: verify PayPal, then licence and insurance. |
| 2 | 10:17:48 | PUT /api/pro/paypal {email luis.ortega@done-demo.example} | 200, no PIN asked (within the 10 min after onboarding). "PayPal verified" with method "demo verification". payout.demoAddress = true. |
| 3 | 10:17:5x | PUT /api/pro/verification {license {number M-41877}} | 200. License number stored, status "not_verified": "Not in the demo registry. Send a photo or PDF (licenseDoc)". Insurance not added (not asked). |
| 4 | 10:18:07 | A2A set_availability Mon-Sat 08:00-18:00 | OK, tz America/Chicago, Sun closed. |
| 5 | 10:18:10 | A2A readiness | hireable: true, blockers []. Recommended only: licence, insurance. |
| 6 | 10:18:17 | A2A list_jobs | DP-1042 "Fix a leaking faucet" (job_a2a7758ccb, 78702, $199 ceiling), DP-1040, DP-1039, DP-1033 "Fix the leak" (job_db2607baae, 78723, $250 ceiling). |
| 7 | 10:18:48 | A2A offer DP-1042: $150, arrival 2026-11-06T10:00-06:00 | Offer ofr_ed897f2acd open, slot 16:00Z-17:30Z. Fair check: "below the range $165-$180". |
| 8 | 10:35:00 | wait_for_news | Event 551: "Your offer wasn't chosen: the customer chose another offer." DP-1042 agreed with another pro. No reason given. |
| 9 | 10:36:12 | A2A offer DP-1033: $175, arrival 2026-11-06T13:00-06:00 | Offer ofr_a49e09c959 open, slot 19:00Z-21:00Z, "fair: within" ($85-$255 band). |
| 10 | 10:39:12 | customer accepted (demo customer agent) | Hired at $175.00 (event 577). Visit booked Nov 6 1-3 PM (578). Money held 10:39:12: $218.75 = $175 price + $43.75 buffer (event 579). Scope review flagged: no BEFORE photo, no pro note, licence needed, receipt evidence type wrong (event 580). |
| 11 | 10:40:59 | A2A start_work with one before photo (checkId c1) | status working. Note: this photo was taken at the WRONG coordinates (see findings). |
| 12 | 10:41:32 to 10:42:05 | camera.mjs for valve-worn, faucet-installed, sink-dry at job coordinates 30.3048, -97.6851 (job address lat/lng from job_status), plus receipt via make-assets.ps1 (store "LUIS PARTS QVMK", $47.05 MOEN 1225 cartridge in the OCR) | Files under scratchpad/done11/photos/luis/. |
| 13 | 10:42:5x | A2A add_before (called twice by mistake, see findings) | Duplicate before rows stored. |
| 14 | 10:42:59 | A2A submit_evidence dryRun, then real submit: 3 photos (c1, c2, c3 receipt) + 1 note | Dry run: no warnings. Real: status submitted, then checking. |
| 15 | 10:43:19 | Platform checks | c1 verdict "pass" but label NEEDS_REVIEW, needsPerson true ("photo model could not confirm: describes a yellow object"). c2 same ("describes a screen showing a DEMO PHOTO"). c3 receipt APPROVED ($47.05, OCR read the store as "LUIS PARTS OVMK"). Job to status review. Expert queue SLA 19:13 UTC. |
| 16 | 10:43:xx | A2A ask_for_review for c1, then for c2 (with notes) | Both accepted: events 607 and 608, queue entries added with SLA about 19:14. |
| 17 | 10:45:20 | Customer confirmed the two checks and released (person p_fff8d01df3, "the demo customer ... confirmed the checks left to a person") | Status released. Capture CAP-669037A52F01 $175.00. Fee $17.50 (10%). Pro $157.50. Payout batch PAYOUT-3C36195FA50E. Expert queue cleared. |
| 18 | 10:45 onward | payout_status | Batch status SUCCESS, item DP-1033-pro $157.50 status UNCLAIMED: "There's no PayPal account with that email yet... claims it within 30 days". Not counted as a failure by the platform. |
| 19 | 10:4x | my_dashboard | jobs 1, paid 1, gross $175.00, fees $17.50, net $157.50, toPro $157.50, time to paid median 2 min, fix rate 0 of 1 checked, ratings none, disputes 0. Matches the ledger. |
| 20 | 10:4x | my_work_record | Signed DoneWorkRecord, 1 entry, conditionsPassed 3/3, byBand "$100-$250", paidVia PayPal. |
| 21 | 10:4x | POST /api/work-record/verify (the record from step 20) | {"ok": true, "allInLog": true}, entry hash, signature, proof and log all true. |

Public record /api/pros/luis-ortega-plumbing/record.json later showed a different entry hash (issued 10:32:12) from the one I verified (issued 10:31:46). Not checked further.

## What each side ends up with

- Customer (Maria Lopez's agent, demo customer): hold $218.75 authorized at 10:39:12 (AUTH-F194EA4C0D20). Captured $175.00 at 10:45:20 (CAP-669037A52F01). Hold released for the unused $43.75 (per hold.explain). Nothing refunded. Warranty runs to 2026-11-19.
- Platform: fee $17.50 (10% of $175.00). Ledger balances (hold 218.75 = capture 175.00 + released 43.75).
- Luis (pro): $157.50 in payout batch PAYOUT-3C36195FA50E, batch SUCCESS, item UNCLAIMED. Nothing is in a PayPal account yet. Helper $0. Tips $0. Materials advances $0.
- DP-1042 (faucet): not won, offer declined at 10:35 without reason.

Time per step: onboarding to hireable about 1 min. Offer 1 to decision about 17 min (no news). Offer 2 to hire about 3 min. Hire to held: instant. Start work to submit: about 2 min. Submit to review: 20 s. Ask for review to release: about 2 min (the customer released, the expert SLA was 19:13 UTC, about 8 hours away).

## Did I have to ask my person?

No. The brief gave me the onboarding PIN (<pin>) and the PayPal and licence values. No askPerson link was returned. I did not need any step-up. (My agent-side `readiness` gave a signIn link that I did not use.)

## Findings

BUG-1: release happened while two checks were still NEEDS_REVIEW, the expert queue silently cleared, and the record counts all 3 as passed.
- Request: A2A {"action":"job_status","job":"job_db2607baae"} after ask_for_review c1 and c2.
- Response before release: checks c1 and c2 verdict "pass", label NEEDS_REVIEW, needsPerson true; queue with SLA 19:13 and 19:14 UTC.
- After release (10:45:20): queue [], timeline "review -> released", person p_fff8d01df3, note "every condition of the job passed; the ones that needed a person were confirmed by the customer". Demo platform note: "the demo customer ... looked at the photos and confirmed the checks left to a person". The expert never answered. The record then says conditions 3/3 passed, byBand $100-$250.
- Impact: the work record and the dashboard present the job as fully verified. The record has no field that says two conditions were confirmed by the customer, not by the checker or an expert.

BUG-2: a before photo taken about 2.9 km from the job address was accepted without a flag.
- Request: A2A start_work {"job":"job_db2607baae","before":[{dataUrl, checkId "c1"}]} with a photo at 30.2835,-97.7010 (taken 2026-11-05T10:40:05Z).
- Job address: lat 30.3048, lng -97.6851 (from the job_status address).
- Response: status working, "1 before photos". No warning. The evidence ev_c5812b4985 is still listed, and the scope rule for c1 says "near_job".
- Expected: the photo should be flagged as not at the job, or rejected. I did not confirm whether the before photo is counted anywhere. Note: I made that mistake (used the wrong coordinates, see Unclear), so the photo itself is my error, but the platform let it through.

CONFUSING-1: verdict "pass" alongside label NEEDS_REVIEW and status "review" for the same check. Request: job_status, lastCheck.checks[0]. Response: {"verdict":"pass","label":"NEEDS_REVIEW","needsPerson":true}. Hard to read which one counts.

CONFUSING-2: photo model reads my camera.mjs output as a screen. c2 reason: "it describes: a screenshot of a computer screen displaying a DEMO PHOTO ... water droplet". c1: "a yellow object on a dark blue background". The photos were the sink-dry and faucet-installed captures. This may be a limit of the demo photos, but it caused both needsPerson flags.

CONFUSING-3: the hold was 25%, not the 20% in my limits and the job settings. Request: A2A job_status after hire. Response hold.explain: "$43.75 is buffer (about 25% of the price, raised from your 20% by the overrun risk ...)". The pro's offer did not show this before accepting. Hold was $218.75 not $210.00.

CONFUSING-4: after hire the offer reports acceptable: false with acceptableWhy null (start_work response, offers[0]). No reason given.

CONFUSING-5: "PayPal verified" for a demo address. PUT /api/pro/paypal {"email":"luis.ortega@done-demo.example"} returned verified true, method "demo verification", demoAddress true. The payout then went UNCLAIMED. The work record says "paid with PayPal" (paidVia PayPal) while the item is UNCLAIMED. The dashboard labels $157.50 as "toPro" with no note that nothing is in an account yet.

CONFUSING-6: hireable: true while the licence is not verified. readiness returned hireable true with blockers []. The licence badge says "Licence not verified" and the licence was "Not in the demo registry". The scope review also said a TSBPE licence is needed for this work.

CONFUSING-7: the receipt store name. I passed "LUIS PARTS QVMK" to make-assets.ps1. The OCR (done-ocr) read "LUIS PARTS OVMK". Only the Q/O character differs. MINOR.

CONFUSING-8: the lost bid had no reason. DP-1042 offer ofr_ed897f2acd at $150 was declined with "the customer chose another offer". The offer had a fair check "below the range $165-$180" when I sent it. No counter was made. I cannot tell whether price, arrival or the other pro decided it.

CONFUSING-9: list_jobs DP-1033 showed "offers": 0 at 10:19 and 10:38, while the 11-03 event said "DP-1033: 5 offers in". Offers count on the list does not match the event.

CONFUSING-10: add_before returns the whole job summary. It does not show the evidence that was stored, and "updated" did not change (still 10:40:59). I could only confirm the stored evidence through job_status.

CONFUSING-11: the timed rule was not tested. The faucet job DP-1042 had the 10-minute rule ("no_drip after new_part >= 10m"), which I lost. DP-1033 has no timed condition ("taken after the repair photo" only), so I did not exercise the platform clock wait. The platform clock also moved: job_status said "demo clock 14 minutes ahead ... moved by the demo tour" at 10:40.

## My own mistakes (not platform bugs)

- First set of photos was taken at 30.2835,-97.7010 (I did not have the job coordinates). I retook them at 30.3048,-97.6851, but the first before photo was already attached by start_work. That is the photo in BUG-2.
- I called add_before twice (once piped through python, which did nothing, then again). Result: 3 before rows stored (ev_c5812b4985 from start_work, ev_628e97996e and ev_8ef8091b3f from my two add_before calls). The duplicates may confuse any reviewer.
- I called ask_for_review on c1 and c2 with the photos already flagged. That was per the brief and it was accepted, but the release came first, so the expert never looked.

## Unclear

- Who released the job at 10:45:20 and why it did not wait for the expert: the timeline says "person p_fff8d01df3" and the platform note says the demo customer confirmed. I did not check whether this was the customer agent or a platform action.
- Whether the first (mis-geotagged) before photo should have been rejected. The platform gave no answer.
- The 25% buffer: "raised from your 20% by the overrun risk". Whose rule raised it, and when, is not shown to the pro.
- Why offer 1 (faucet, $150) lost. Only the text "the customer chose another offer".
- What "acceptable: false" after hire means (CONFUSING-4).
- The record's "paidVia PayPal" with an UNCLAIMED item, and whether a record entry should be issued before the payout is claimed.
- Which record is current: my_work_record issued 10:31:46 and the public record.json issued 10:32:12 have different entry hashes.
- The receipt store name read by OCR (OVMK vs QVMK).
- Whether the camera's "DEMO PHOTO" content is intended.
- The licence number I added: it did not verify and the platform did not say what happens to the scope review's licence note.

## Cleanup

Deleted my helper scripts and the key and cookie files written under the Temp folder. The token was not printed in this report. Photos kept in scratchpad/done11/photos/luis/. No files were written in D:/paypal/join/examples (no MCP calls were needed).

## Timing and budget

About 29 minutes end to end (brief said 25). About 60 tool calls (brief said about 70).

VERDICT: 0 BLOCKER, 2 BUG, 11 CONFUSING
