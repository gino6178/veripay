# Done round 8: Luis Ortega (plumber), HTTP only

Platform: http://localhost:8810, platform clock ran about 14 min ahead of real time during the run (GET /api/info "now" 2026-11-05T06:15Z at start).
Result in one line: hired on DP-1032 at $110, work submitted, NOT paid. Stuck at "needs_fix": the job asks for a parts receipt (c3) and the test kit has no way to produce one.

## Steps (what I did, what the server answered)

1. **Onboarding.** POST /api/pro/onboard {code, pin} (PIN set as the brief asked). 200. Pro record "Luis Ortega Plumbing (test)", trade plumbing, ZIP 78721. PayPal, licence and insurance all unverified. Note: my first call did not store the session cookie. A second onboard with the same link returned 410 "used or expired".
2. **Sign-in for the person steps.** The readiness response gave a /link?code=... page (an SPA). llms.txt does not say how an agent signs the person in over HTTP. I found POST /api/auth/link {code, pin} by listing the API paths referenced by the served page bundle (only the HTML and JS the server sends). Response: session cookie, "to":"/pro".
3. **PayPal verify.** PUT /api/pro/paypal {email: luis.ortega@done-demo.example}. Response: payout.verified true, method "demo verification (stands in for Log in with PayPal)", demoAddress true.
4. **Licence.** PUT /api/pro/verification {license:{number:"M-41877"}}. Response: license.status "not_verified", why "Not in the demo registry. Not yet verified: send a photo or PDF of your licence (licenseDoc)". I have no licence file, so I did not send one. Insurance not added (no certificate file).
5. **Readiness.** A2A readiness: hireable true, blockers [], recommended licence and insurance.
6. **Feed.** A2A list_jobs (radius 25 mi): DP-1035 (78702, $200 ceiling), DP-1036 (78704, 5 offers already), DP-1037 (78702, 5 offers requested), DP-1032 (78757, $220 ceiling, window 11/02 to 11/09).
7. **Offer 1 on DP-1035** (job_7c8cf0ae12): offer ofr_08646f5d12, $120, parts $30 at cost, arrival 14:00Z. Response: acceptable true, status open.
   - 06:19:17 (platform) the customer agreed to Eastside Pipe & Drain (demo) at **$195**. My offer became status "declined", declinedWhy "The customer chose another offer." I was not told by wait_for_news (see BUG 2). I found out only by job_status.
   - Later, the offer showed acceptable **false** with acceptableWhy **null** (it was true when I sent it).
8. **Offer 2 on DP-1032** (job_6ab4e22e06): offer ofr_0577957012, $110, parts $30 at cost, arrival 15:00Z. Response: acceptable true.
   - 06:40:32 the seeded customer accepted: timeline "agreed" at $110, then "held" at $132. Hold: price $110, buffer $22 (20%), PayPal order MOCK-A3168EC83284, authorization AUTH-F3427E393A14, honorUntil 2026-11-08T06:40Z. Nothing captured. Hired after about 3 min.
9. **Before photo.** camera.mjs valve-worn, saved under photos/luis/before.jpg (GPS 30.3516,-97.733, the job's lat/lng from job_status). A2A start_work with before:[{dataUrl,label}] (no checkId). Response: status "working". Note: start_work with checkId "before" was refused ("No condition before"), which is correct for this job.
10. **After photo, c1.** camera.mjs faucet-installed, photos/luis/after-new-cartridge.jpg, taken 06:42:12 (platform time). Dry run (submit_evidence dryRun:true) warned only that c2 must be retaken 10+ min after c1. I then submitted it for real **without submit:false**. Result: status "review" within 0.1 s. The check ran over the whole job, marked c2 and c3 needs_fix, and the seeded customer sent a fix request at 06:44:28 ("please fix c2: needs 1 photo, got 0; c3: needs 1 receipt, got 0"). This was my mistake, but the API default made it easy: see BUG 1.
11. **ask_for_review c1** (job_6ab4e22e06). Accepted. Expert queue cleared in about 2 min. Verdict kept as "pass" but label **NEEDS_REVIEW**, reason "no photo description; a person confirms".
12. **After photo, c2.** Waited for 10 min after the c1 photo (c2 photo at 06:54:12 platform time, 12 min later), camera.mjs sink-dry, photos/luis/after-sink-dry.jpg. Submitted with submit_evidence (default submit). Verdict c2 "pass", label NEEDS_REVIEW, signals "time_gap_ok" but "not_same_spot: image hash 34 bits apart from the BEFORE photo".
13. **ask_for_review c2.** Accepted; expert queue cleared in about 2 min. c1 and c2 both "pass / NEEDS_REVIEW". Status back to "needs_fix", next: "Send what the check asked for, then submit again."
14. **Receipt (c3).** Not submitted. camera.mjs has no receipt mode (the call errored), and I will not make up a receipt. c3 still needs_fix, so the money has not been captured. Nothing is paid to Luis.

## What each side ends up with (as of the last status read, platform time ~07:00)

- Customer (Maria Lopez's agent, seeded): $132.00 authorized (held) on PayPal, $0 captured, $0 refunded. The job is still open at needs_fix.
- Pro (Luis): nothing captured, nothing paid out, no payout batch. If the customer releases with c3 unmet, the expected split at the 10% fee on $110 captured is $99 to Luis (my calculation from feeRate 0.1, not a platform number; the ledger is empty).
- Unclaimed: the PayPal payout address is a demo address, so payouts would stay unclaimed in the sandbox (platform says so).
- Eastside Pipe & Drain (demo) won DP-1035 at $195 (its own offer). Not my money.

## Timing

- Onboarding + PayPal + licence: about 2 min.
- Offer on DP-1035 to decision: about 2 min (declined).
- Offer on DP-1032 to hire: about 3 min (06:37:32 to 06:40:32).
- Before photo to start work: under 1 min.
- c1 to c2 photo gap: 12 min (the rule needs 10).
- Expert review turnaround: about 2 min each.
- Fix request by the customer: 2 min after my first submit.

## Did I need my person for anything?

Yes, for the one thing I could not do: a parts receipt for c3 (and, if the test wants it, a licence document and insurance certificate). I did not have those files, so I did not invent them. The PIN steps were covered by the brief's PIN.

## Findings

- **BLOCKER (test kit gap, not platform):** The DP-1032 job requires a parts receipt (c3, evidence "receipt"). The camera tool produces only faucet-installed, sink-dry and valve-worn photos (receipt mode errors). Without a real receipt file the pro cannot pass c3, so nothing is captured unless the customer releases over the failed condition. Request: submit_evidence {job, items:[{kind:"receipt", ...}]} is the only route; I had no receipt to send.

- **BUG 1: a partial submit runs the whole-job check and sends the job to review.** Request: A2A submit_evidence {job:"job_6ab4e22e06", items:[{kind:"photo", dataUrl, checkId:"c1", label}]} (no submit flag). Response: status "submitted" then "review" within 0.1 s; c2 and c3 as needs_fix with reason "needs 1 photo, got 0" / "needs 1 receipt, got 0". Two minutes later the customer's fix request arrived (timeline 06:44:28, "review" to "needs_fix"). The default submit:true makes a half-finished job look finished to the customer. The dry run only warned about timing, not about this.

- **BUG 2: no news for a pro's own offer outcome.** Request: A2A wait_for_news {after, seconds:50} polled about 15 times. Response: only job_scoped / offers_requested events, never a decline or hire. My DP-1035 offer was declined ("The customer chose another offer.") and the job was agreed to another pro at 06:19:17, and I learned it only by job_status. Same for DP-1032 hire: no event; I found it by polling job_status.

- **CONFUSING 1: which offer the customer picks.** The brief says seeded customers pick the cheapest hireable offer. On DP-1035 they took Eastside at $195 over my $120 (acceptable true at send time). I cannot tell from the server whether the reason was the licence (mine unverified, and the job code says "TSBPE-licensed plumber") or something else. Also readiness says hireable true with licence unverified.

- **CONFUSING 2: acceptable flag flips with no reason.** DP-1035 offer ofr_08646f5d12: created with acceptable true; later job_status shows acceptable false and acceptableWhy null (declinedWhy "The customer chose another offer."). I could not see why.

- **CONFUSING 3: expert-confirmed checks still labelled NEEDS_REVIEW.** After ask_for_review c1 and c2 (queue cleared, verdict pass), the labels stay NEEDS_REVIEW with "a person confirms". Does an expert confirmation count for the pay decision, or is there a separate confirm step? Not clear to me.

- **CONFUSING 4: sign-in and onboarding are not in llms.txt.** The onboard call's session cookie is not returned in a way I could reuse (second use gives 410). To do the person steps over HTTP I had to find POST /api/auth/link {code, pin} (from the served bundle). The readiness signIn link is only a page link.

- **CONFUSING 5: the demo clock moved mid-job.** job_status showed clock.aheadMinutes 14 with the note "demo tour: the pro's visit on DP-1037 takes 15 minutes (timed photos)". Photo timestamps use the demo clock. Not my action, but it changed the times I was waiting on.

- **MINOR: shots and rule text disagree.** Scope says shots.min 2 per check, but the rule is photo>=1 and the checker accepted one photo per check. Unclear which is enforced.

- **MINOR: VLM descriptions of camera photos are unreliable.** c1 description: "a yellow rectangular object with a white square on a dark blue background". Ended as NEEDS_REVIEW. Expected for synthetic photos, but it sends every photo to the expert queue.

## Unclear

- Why the customer picked Eastside at $195 over my $120 (see CONFUSING 1).
- What "acceptable" means at a given moment and why it flipped (CONFUSING 2).
- Whether an expert "confirm" passes c1/c2 for the payout (CONFUSING 3).
- Whether shots.min 2 is enforced (MINOR).
- Whether a customer release over c3 pays the pro $99 (my fee math) or the buffer is handled differently.
- Whether a licence document alone would make the licence "verified" and change the customer's choice.
- The "before" photo: start_work accepted it without a checkId; the scope has no before condition, so it went to the job's before set. Assumed correct.

VERDICT: 1 BLOCKER, 2 BUG, 5 CONFUSING
