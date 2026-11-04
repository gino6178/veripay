# Priya Nair agent report (round 2)

## What I did
1. GET /llms.txt, GET /api/info -> Cover "now" 2026-12-05T12:49Z (real clock was 2026-11-04). 9 days -> departure 2026-12-14, return 2026-12-21.
2. whoami: monthlyMax $400, mayBuy/mayCancel/autopay true, causes [] (REST, curl, no MCP).
3. POST /api/agent/insure_trip: europe, 2026-12-14..2026-12-21, TP236 EWR-LIS 12-14, TP235 LIS-EWR 12-21, tripCost 1100, travelers 3, oldest 41, plan standard, causes {animals:50, ocean:50}.
   -> policy pol_eafb11d1c9 / CV-TR-246598, active, $307.08 (claims pool $238.50 incl. reinsurance $7.16, fee $61.42), paid at once from saved PayPal (payment 7LS133287X606553B, COMPLETED). Within the $400 limit, so no approval asked. Cover: flight delay $1800, cancelled $1800, baggage $600, medical $50,000, trip cancellation $3,300.
4. POST /api/demo/flight TP236 2026-12-14 cancelled -> claim clm_9e35d13bff (CL-W246I25) paid $900.00 ($300 x 3), by "parametric", all checks passed.
5. wait_for_news, flight_status, claim_status, policy_status, explain_clause TR-2.2/2.4/2.5.

## What each traveller got
- Priya paid $307.08 once (~$102.36 each if split; the other two paid nothing to Cover). Prepaid trip cost $3,300 total is not refunded by Cover for an airline cancellation.
- Cancellation payout: $900.00 total, ONE PayPal Payouts item (M4AU5VPT8QSHS) "to you" (Priya), created 2026-12-05T12:49:59Z (Cover clock), "secondsToPay 1". Status went PENDING -> UNCLAIMED on my second read, so I cannot confirm the money actually landed. The other two travellers got nothing directly: Priya holds their $600 share.
- Medical: all three are covered (TR-2.4, $50k each, $100 deductible, human-reviewed), from 2026-12-05 start to 2026-12-22.

## Return flight TP235 (2026-12-21)
Policy stays active; TP235 is still listed, status "scheduled". It is still covered by TR-2.1/2.2 (automatic payment if delayed 2h+/cancelled). Per TR-2.2 the cap is $600 per traveler per trip combined with delay, and $300 per traveler is used, so at most $300 each ($900 total) is left; a 6h delay would pay $300 each, a cancellation $300 each. Medical and baggage cover are untouched. The server's own cap check says "cap is $1800.00", which does not match the clause. Trip cancellation (TR-2.5) is not available for an airline cancellation and needs departure not yet happened. Leftover pool: 50% animals / 50% ocean at year end.

## Asked person for anything?
No. Price was within the $400 limit and autopay was on. Caveat: insure_trip prices AND buys in one call, so I could not show the price first; I bought on Priya's instruction without seeing a quote.

## Findings
- BUG: giveback_status (POST /api/agent/giveback_status {}) returns only {"id":"hunger","share":100}, not Priya's animals 50 / ocean 50. whoami also says "causes":[] after the purchase. Her earlier cancelled policy (pol_0b5b8fecdb) has causes {hunger:100}. So the cause choice is not visible at person level.
- BUG: cap check says $1800 for this trip while TR-2.2 says max $600 per traveler per trip (= $1800 for 3, but the check text "$0.00 paid so far; cap $1800" is fine; the remaining-per-traveler logic for the return flight is not exposed anywhere). Remaining return-flight cover is not stated by flight_status or policy_status.
- CONFUSING: $900 for three travellers is paid to Priya only. No way to give the others their $300 each; response does not say who the other travellers are (policy has only a count).
- CONFUSING: payout status PENDING then UNCLAIMED with "secondsToPay":1; no explanation of what UNCLAIMED means or what Priya must do (PayPal email not registered in sandbox?).
- CONFUSING: wait_for_news timestamps use the real clock (2026-11-04) while everything else uses Cover's clock (2026-12-05).
- CONFUSING: whoami "monthlyNow" is $307.08 for a one-off trip premium; after an old cancelled policy refunded.
- MINOR: the old cancelled policy and news items from an earlier test appear in Priya's account.
- MINOR: insure_trip quote has no quote id and no separate dry-run.
- MINOR: choose_cause {} gives "cause (one), or causes (...)" error, fine but unhelpful on what it returns.

## Unclear (guessed)
- Whether destination "europe" and airports EWR/LIS were right (llm said from/to optional; I supplied them).
- Whether "medical for all three" means plan standard ($50k) or plus ($250k + evacuation); I chose standard as the cheaper one that includes medical.
- Whether the policy end 2026-12-22 and a trip from the first flight matters after the outbound is cancelled (is medical cover still in force for a trip that never started on that flight?). Not tested.
- Whether UNCLAIMED means the money did not arrive.
- Whether "leave in 9 days" should use Cover's now (I used it, per the brief).
- Whether the $50k medical limit is per traveler (clause TR-2.4 says so; policy says $50000.00 total).
- Whether tripCost 1100 per traveler yields $3,300 cancellation limit (it did).

VERDICT: 0 BLOCKER, 2 BUG, 4 CONFUSING
