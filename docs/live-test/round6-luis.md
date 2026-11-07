# Done round 6: Luis Ortega Plumbing (test), pro side

Platform clock at start 2026-11-05T01:10Z. It ran 12 min ahead of real time from 01:18 (another tester's "finish now" on DP-1037 moved it; I did not move it).

## What I did
1. Read /llms.txt. A2A whoami: not hireable (PayPal not verified, licence null, insurance null, default rates $60/$90/25 mi).
2. Onboarding for Luis (done on the website for him, as he allowed). POST /api/pro/onboard {code} from luis-token.json. Answer: signed in, with `"pinOnce":"050263"` (a server-generated PIN shown once). I found no endpoint or page to set Luis's chosen PIN <pin>, so it was never used and the account keeps the generated one.
3. PUT /api/pro/paypal {email: luis.ortega@done-demo.example}: verified at once ("demo verification"), no PIN asked. PUT /api/pro/rates {callout 85, hourly 110, radius 20, at_cost}: accepted. PUT /api/pro/verification: insurance accepted ("Insured: $1,000,000.00", expires 2027-06-30). Licence M-41877 came back `status: not_verified, "Not in the demo registry... send a photo or PDF of your licence (licenseDoc)"`. I had no licence document, so it stays unverified (readiness still says hireable: true).
4. list_jobs: DP-1035 faucet (Maria, ceiling $200), DP-1033 faucet ($220), DP-1028 drain; later DP-1036 water heater, DP-1037/1038 drains. I offered on DP-1035: $187 (parts $47, at_cost).
5. DP-1035: at 01:11:58 the customer revised the scope and my offer was withdrawn ("The customer revised the scope: offers are asked for again"). At 01:13:48 Maria hired Lone Star Rooter (demo) at $175. I got no wait_for_news event for the withdrawal and the job left list_jobs; I learned it only from job_status. Lost that job.
6. Offered on DP-1033 (seed faucet job): $150 (parts $47 at_cost; callout $85 + 0.5 h at $110). Hired at 01:17:35, 3 minutes after the offer (event 335). Hold $180 ($150 + $30 buffer) on the saved test card, AUTH-E989DC5657A1.
7. scope_reply after hire: `{"error":"state","message":"Replies to the scope are for open jobs in your trade."}`. The scope review showed gaps (no BEFORE photo condition, no pro note, no licence note) and flagged the receipt check c3 as "uncheckable: change the evidence type", although c3 is a receipt check.
8. Before photos: camera valve-worn (tagged c1) and sink-dry (tagged c2) at 30.3048,-97.6851 (job lat/lng from job_status, `precise:false`). start_work -> status working.
9. Change order +$5.00 parts (worn-valve photo as evidence): approved by the customer agent in about 2 minutes. Job became $155.
10. After photos: faucet-installed (c1) at 01:30:58 platform time; sink-dry (c2) at 01:41:35, 10 min 37 s later, waited in real time. Receipt from make-assets.ps1, date 11/05/2026: read as "AUSTIN PLUMBING SUPPLY, 2026-11-05, total $47.05" (OCR confidence 0.95). A work note with licence M-41877 was sent too.
11. submit_evidence: the check took 28 s -> status review, 1/3 passed. c1 needs_fix: the vision model saw "a new cartridge installed in a printer", plus "not_same_spot (image hash 30 bits apart)". c2 needs_fix: "a white rectangular object... brown surface", confidence 1. c3 receipt: pass, but `needsPerson: true`, "no model verdict; a person confirms".
12. The customer agent (seeded demo) asked for a fix (event 375). I retook c1 at 01:43:16: the vision model said "screenshot of a webpage... product page" -> needs_fix, and the c2 time check then failed (-101 s after the new c1 photo) because a retaken c1 moves the 10-minute base. I waited for real and retook c2 at 01:53:52 (time_gap_ok): the vision model said "a wooden table with two wooden chairs" -> needs_fix. The customer asked for a fix again (event 398). I stopped there (call and time budget). Final status: needs_fix, nothing captured.

## Agent tries to move money (as his agent, no person)
- early_pay: `{"error":"person_only","message":"Early pay is the pro's own decision: they take it on the website with their PIN. Show them signIn.","signIn":{"url":"/link?code=...","oneUse":true,"what":"take early pay on DP-1033 (a fee comes out of your pay)"}}`. Correct refusal with a clear link; I did not use it.
- Payout email: no such action (`set_payout` -> -32602 "data.action is one of ..."). `my_profile` and `submit_evidence` with `payee` -> -32602 "doesn't take payee. It takes: ... Where you're paid is changed only by the pro on the website, with their PIN." REST PUT /api/pro/paypal with the agent key as Bearer -> `{"error":"signin","message":"Sign in as a pro."}`. All refused; payout unchanged.

## Money (DP-1033, final)
- Held: $180.00 authorization (price $150 + $30 buffer); after the approved change order the job is $155.
- Captured: $0.00. Refunded: $0.00. Fee: none taken yet (10% would apply, e.g. $15.50 on $155). Payout: none. payout_status: payout null; payee l******@done-demo.example is verified but a demo address ("payouts to it stay UNCLAIMED in the sandbox").
- Luis earned $0.00. DP-1035 went to a demo pro at $175.
- Timings: offer to hire 3 min (DP-1033); change order approval about 2 min; evidence check 28 s; customer fix request about 1 min after each check.

## Did I ask my person for anything?
In principle yes: his chosen PIN <pin> could not be applied (the server issued its own at onboarding, no way found to set his), and the licence needs a document photo he has not given me. Neither blocked hiring.

## Findings
- BLOCKER: honest, correctly placed and timed evidence from the supplied camera is rejected by the vision checker, so the pro is not paid. Request: submit_evidence with c1 faucet-installed and c2 sink-dry photos. Answers over three rounds: c1 "a new cartridge installed in a printer", then "screenshot of a webpage... product page"; c2 "a wooden table with two wooden chairs". The checker also compares to the BEFORE photos by image hash ("not_same_spot, 30-35 bits apart") although each camera take of the same scene differs. A pro's A2A has no appeal action (no dispute, no ask-staff).
- BUG: retaking an earlier photo silently breaks a later timed condition. Resubmitting only c1 at 01:43 made the existing c2 photo fail "Taken -101 seconds after the \"c1\" photo" and restarted the 10-minute base. The submit answer gave no warning that c2 would now fail.
- BUG: a pro whose offer is withdrawn by a scope revision gets no news event (wait_for_news showed only job_scoped / offers_requested "new in your feed"). The job also left list_jobs once hired by someone else, with no "lost" event. Only job_status showed offers[].status = "withdrawn" and the thread message.
- BUG: scope review marks the receipt check c3 "uncheckable: names evidence that can't show it: change the evidence type" although it is a receipt check. The receipt then passes with `needsPerson: true` ("no model verdict; a person confirms"), so a receipt alone seems unable to pay out automatically, and the pro is not told who confirms or why.
- CONFUSING: onboarding returns a one-time server PIN ("pinOnce") while the person wants to choose his own; no visible way to set it.
- CONFUSING: PUT /api/pro/paypal verified at once with no step-up, although llms.txt says changing where a pro is paid needs the PIN. It was the first set from the onboarding session, so maybe intended, but not stated.
- CONFUSING: licence M-41877 is "not_verified" ("Not in the demo registry"), asking for licenseDoc; llms.txt lists no licenseDoc field for /api/pro/verification. readiness still says hireable: true and the customer's scope asks for the licence number in a note.
- CONFUSING: my $150 offer carried "parts $47 estimate"; the receipt is $47.05. I sent a $5 change order to be safe. Unclear whether 5 cents over would fail "receipt total matches parts in the price"; no tolerance is documented.
- CONFUSING: wait_for_news with `after` returns every later event at once, so a loop with a fixed `after` spins without waiting; also hire events arrive but scope-revision withdrawals do not.
- MINOR: the platform clock was moved by another tester mid-job (+12 min); camera times and "after" rules depend on it.
- MINOR: start_work accepted before photos tied to c1/c2 (the after checks) because the scope had no before check; the pro cannot reply to the scope after being hired, so the scope gaps stay.

## Unclear (guessed)
- Whether the camera should use the job's lat/lng with `precise:false` (I used them; no location error appeared).
- Which checkId to give before photos when the scope has no before check (used c1 and c2).
- Whether a retaken photo replaces or adds to the earlier one for the time rule (it behaved as "latest c1 photo is the base").
- Whether a 5-cent receipt overshoot needs a change order (sent $5 to be safe).
- Whether the seeded customer's fix request is automatic after each failed check (it came about 1 minute after each).
- What `needsPerson` on the receipt means for a pro: who confirms, and does it block payment?
- How to set the chosen PIN <pin>; why a different PIN was issued.
- Why DP-1035 vanished from the feed with no event (hired by another pro).

VERDICT: 1 BLOCKER, 3 BUG, 5 CONFUSING
