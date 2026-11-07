# Done round 8: Maria Lopez agent (tester: maria)

Status at end: job DP-1035 (job_7c8cf0ae12) is HELD, not paid. Stopped at the 8-minute no-movement mark, before any "finish now". No payment, no capture, no payout yet.

## Steps (MCP over @modelcontextprotocol/sdk; no REST needed)
1. whoami: Maria Lopez (p_ec6f3e27a2), scopes read/hire/pay, limits $500 per job, $1,500 per month, change max $75, agentMayRelease false. savedPayment: null.
2. post_job: "The bathroom sink faucet ... under $200 ..." zip 78702, budget $200. Result: DP-1035, status offered, scope "Fix a leaking faucet", 4 done-conditions (before, new_part, no_drip, work_note), window 2026-11-05 13:00Z to 2026-11-09 03:00Z, buffer 20%.
3. wait_for_news: scope and offers-requested events within 1 s. Offers arrived in about 90 s:
   - Luis Ortega Plumbing (test) $120 (parts $30), licence NOT verified, hireable true
   - Barton Creek Plumbing (demo) $220, over ceiling, not acceptable without raising ceiling
   - Eastside Pipe & Drain (demo) $195, licence active, insured, acceptable
   - Hill Country Leak Pros (demo) $255, over ceiling
   - Mueller Plumbing Co. (demo) $220, over ceiling
   - Lone Star Rooter (demo) $195, acceptable, helper Jesse Ortiz
4. Chose Eastside Pipe & Drain (ofr_4eea0456b1) at $195: licensed, insured, acceptable, within $200 ceiling, arrival 13:00Z. No counter sent. Reason: cheapest acceptable option with a verified licence (Luis at $120 is cheaper but unverified).
5. accept_offer payWith "paypal" (saved is null for Maria). Status agreed. hold: pending_approval, $200 = $195 price + $5 buffer (the 20% buffer is capped at $5 by the $200 ceiling). approveUrl /mock-paypal/approve?token=MOCK-30CA94112DE0.
6. Acting as Maria, over HTTP: GET the approve page (a simulated PayPal page, shows $200 hold for DP-1035), then POST a=yes. Response 302 to /paypal/return, then /jobs/. The page asked for no PIN. Hold then showed status held, authorization AUTH-24ED342D40E4, honorUntil 2026-11-08, expiresAt 2026-12-04. Ledger: hold $200.00.
7. wait_for_news / job_status polls until 06:32 real time. Pro has NOT started work. Waiting on pro: "start work: they arrive about 2026-11-05T13:00Z". No events after the money_held event (id 346).

## Money, to now
- held: $200.00 (AUTH-24ED342D40E4)
- captured: $0.00; refunded: $0.00; payout: none; release: none
- Pro: Eastside Pipe & Drain (demo), owner Darnell Brooks, payout to a verified demo address

## Time taken
- post to offers: about 2 min (last offer at 06:18:09 real)
- accept to held: about 14 min real (accept 06:19:17; the platform says the hold was authorized at 06:34:17 platform time)
- held to 06:32 real: no pro movement, no evidence, no change orders. Under 8 min idle would have been from 06:20; passed the 8-minute mark at about 06:28. Stopped there; see below.

## Did not do
- No "finish now". The brief's job-level finish-now control is not in what the server sent me. The only documented clock control is POST /api/demo/advance, which moves the shared demo clock. Another tester is on the same server (the demo tour on DP-1037 is already using 14 minutes of demo time), so advancing it affects their run. I stopped instead. Say if you want it.
- No photos, approvals or release (the pro has not done any work).

## Findings
- CONFUSING (hold confirm needs a session, not the token): the accept response says the next step is "POST /api/jobs/:id/hold/confirm" after PayPal approval. Called with Maria's bearer token: HTTP 401 {"error":"signin","message":"Sign in first."}. The hold went to held anyway after the PayPal approve redirect, so the confirm may be done by the return page. Unclear which one the server expects.
- CONFUSING (clock): the platform "now" is 14 minutes ahead of wall clock (api/info: demoDaysSkipped 0.0097, lastAdvance "demo tour: the pro's visit on DP-1037 takes 15 minutes"). Hold times (createdAt 06:34, expiresAt 2026-12-04) and events (at vs realAt, 14 min apart) are demo times. A tester cannot tell which clock a deadline uses.
- CONFUSING (pro arrival): the pro's arrival is 13:00Z platform time, about 6 hours after the hold. Nothing moves in real time, so the job can only progress with a clock advance.
- CONFUSING (buffer): buffer is $5 on a $195 price (20% setting capped by the $200 ceiling). The hold explain text says so, but nothing warns Maria before she approves.
- CONFUSING (licence): Luis's $120 offer is hireable with licence "not_verified", while Eastside is verified. Scope review said a TSBPE-licensed plumber is needed. The offer is marked acceptable: true, so an unlicensed pro reads as hireable.
- CONFUSING (payWith saved): savedPayment is null, so payWith "saved" is unusable for Maria. I did not test it; I used paypal.
- MY MISTAKE, not a server bug: I ran POST /api/auth/demo {"as":"customer"} to try a session for hold/confirm. It signed a session in as a different demo customer, Jordan Avery (p_eb7e8389a4), and created that person record. I did not use it further and deleted the cookie file. It is not Maria's account and not Maria's PIN.

## Unclear
- Which step confirms the hold: the PayPal approve page, the return redirect, or hold/confirm (see above).
- Whether a PIN was needed for approving the hold (the approve page asked for none; the brief expected one).
- Whether "finish now" exists on the job itself (not found) or only as the demo clock advance.
- Which clock governs the 3-day honor period and the 3-day window.
- Why Maria's hold reads createdAt 06:34 when I approved at 06:19 real time.

VERDICT: 0 BLOCKER, 0 BUG, 5 CONFUSING
Top findings: (1) hold confirm wants a session that an agent token cannot give (401); (2) the demo clock is 14 minutes ahead and shared, so there is no real-time way to reach the pro's 13:00Z arrival and no clean "finish now" for this job; (3) an unlicensed $120 offer shows as hireable and acceptable.
