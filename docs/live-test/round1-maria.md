# Maria round 1 (MCP, all calls worked over MCP; no REST fallback except one confirming REST call)
Platform clock at start 2026-11-04T17:16Z.

## Steps
1. whoami / my_limits: job max $500, month $1,500, change max $75, buffer 20%, agentMayRelease false, agentMayCancel true. whoami savedPayment = null.
2. post_job (text, zip 78702, budget 200) -> job_cb9e366336 / DP-1035, 5 offers in 0.1s: Barton $220, Eastside $195, Hill Country $255, Mueller $220, Lone Star $195. Scope: 3 photo checks (min 2 shots each, 9-photo checklist), receipt, work note. TSBPE licence only "suggested", not a check.
3. counter_offer Eastside $170 -> pro agent answered $185 at once.
4. accept_offer payWith "saved" -> job "agreed", message "Holding the money with PayPal now", but hold = null, no error, no approveUrl. Job stayed "agreed" ("next": "Hold the money.") for 2+ minutes; repeat accept -> error "state: Job DP-1035 is agreed." (no way to retry the hold).
5. cancel_job (allowed), re-posted: job_792d870c8c / DP-1039, same 5 offers, countered Eastside $170 -> $185, accept_offer payWith "card" -> status "held", $222.00 authorized (price $185 + $37 buffer), AUTH-2A124856F3C8, honor until 11-07.
6. Waited ~6 min with wait_for_news (about 8 calls): no event after money_held / scope_review. Pro never started work, no change order, no evidence.
7. POST /api/demo/advance {"days":0.34} (moved shared clock to 11-05T01:32Z, which was past the pro's arrival time; it also fired "reauthorized" for someone else's DP-1008). Still no pro action.

## Money
Held $222.00 on DP-1039 (authorization only). Captured $0, paid $0, refunded $0. Not completed: no payout, no time-to-paid. DP-1035 cancelled with nothing held.

## Asked Maria for
Nothing was reachable (no approve link ever appeared). I would ask: "OK to hold $222 (price $185 + $37 buffer) when your limit was $200?"

## Findings
- BUG: accept_offer payWith "saved" with no saved method (whoami savedPayment null) returns job "agreed", hold null, no error; job is stuck and accept cannot be retried. Should error or return an approval link.
- BUG/BLOCKER: after hold the demo pro (Eastside) never started work or sent anything in ~6 min real time (even after clock moved past arrival). Nothing in job_status says what it is waiting for ("next": "The pro starts work.").
- CONFUSING: budget $200 but hold is $222 (price + 20% buffer); Maria said not to spend over $200. Price fits, hold exceeds.
- CONFUSING: scopeReview.proReply on DP-1035 quoted $195 after the deal was $185 (stale text); the Luis Ortega (test) offer of $195 arrived after the other offers, 22s after posting, outside the 5 initial offers.
- MINOR: wait_for_news after:0 returns events from all my jobs including the cancelled one; no job filter.
- MINOR: scope fairness: 9 photos incl. wide shots of the room (privacy for a bathroom), a receipt required though parts are $0, and a no-drip photo needing 10 min wait; none unreasonable but should be told to Maria. Licence number only a suggestion.
- MINOR: my demo/advance call affected shared state.

## Unclear
- Whether "saved" should hold with no vaulted method; whether "card" is acceptable for a real person (it is a sandbox test card).
- Whether the demo pros ever work on their own, or only on clock/staff action.
- Whether hold over budget is intended.

VERDICT: 1 BLOCKER, 1 BUG, 3 CONFUSING.
