# Report: jordan (Jordan Lee, Austin 78704) - Cover round 2

Cover's clock: now = 2026-12-05 (GET /api/info; demoDaysSkipped 31). All via REST POST /api/agent/<tool> with Bearer token. No source code read.

## Steps
1. GET /llms.txt, /api/info, /.well-known/agent-card.json; MCP tools/list to see tool schemas (REST tools list is not in llms.txt).
2. whoami / my_policies: existing renters policy pol_d8f6310fcb (CV-RE-243Z15), $11.20/mo, status active, first payment COMPLETED (PayPal 71H6700868001523L), waiting period until 2026-12-19, deductible $250, causes {disaster:100}. Limits: monthlyMax $60, monthlyNow $11.20, mayBuy true, mayCancel false, autopay true.
3. choose_cause {"causes":{"disaster":67,"hunger":33}} -> accepted: disaster "Rebuilding after hurricanes, wildfires and earthquakes" 67, hunger "Food banks" 33. my_policies afterwards shows causes {disaster:67,hunger:33}. (67/33 = "about two thirds"; shares must sum to 100.)
4. giveback_status ("where money goes right now"): disaster pool 9 policies, premiums $177.46, claims $700.00, balance $-558.06; hunger pool 4 policies, premiums $81.20, claims $0, balance $3.47. So if the year closed today, disaster would get nothing (pool is negative) and food banks $3.47.
5. neighborhood_fund: suggestion for 78704 Austin TX, 4 households; fund nf_de8ee77d, 3 households, $3.00/mo each, balance $9.00, member false, projects []. Rules: fund pays half of a member's home/renters deductible, up to $250, when Cover pays the claim; year-end leftover goes to a local project members vote on; Cover takes nothing.
6. Judged: $3/mo ($36/yr) is cheap, well inside monthlyMax ($60 - 11.20), and useful: on Jordan's $250 deductible it would pay $125 per paid claim. Person pre-authorised joining if cheap and useful. join_neighborhood_fund {} -> member true, since 2026-12-05, paid 1, balance $12.00 (4 households), nextDue 2027-01-04, projects [].

## What Jordan ends up with / paid
- Renters policy $11.20/mo (already bought) + neighborhood fund $3.00/mo = $14.20/mo. First fund payment of $3 charged at once (paid:1, contributed $12 total across 4 households). Money "arrived" instantly in the fund; no PayPal transaction id is shown for the $3.
- Gets: half the deductible (max $125 on a $250 deductible, up to $250 for bigger ones) when a renters claim is paid, while the fund has money; vote on a local project for the year-end leftover. No project exists to vote on yet.
- No approval or limit needed from the person; I did not need to ask them anything.

## What Jordan and neighbors could do with leftover money (for the answer to Jordan)
- Their own premium leftover: split 67% disaster rebuilding / 33% food banks, paid at year end in one PayPal Payouts batch. Caveat: disaster pool is currently negative, so likely $0 unless claims stop.
- Neighborhood fund leftover: goes to a local project the 4 members vote for; no projects have been listed yet, so nothing to vote on today. The fund is tiny ($12) so far, deductible help is only first-come while it has money.

## Findings
- CONFUSING: choose_cause / giveback_status. Disaster pool balance is $-558.06 (claims $700 vs premiums $177.46, pool shared by 9 policies) so Jordan's 67% share would likely give nothing. Nothing in choose_cause warns of this; only giveback_status shows it, and its "premiums $177.46" does not obviously equal 80% of anything. Request: POST /api/agent/giveback_status {}.
- CONFUSING: hunger pool shows premiums $81.20, fees $0.87, balance $3.47 while disaster shows fees $35.52 on $177.46 (20%). Hunger fees look wrong (20% would be about $16). Possibly pools received different splits; unexplained. GET /api/transparency.
- CONFUSING: after join_neighborhood_fund, whoami limits.monthlyNow stays "$11.20" so the $3 fund payment is not counted against monthlyMax. Unclear whether fund dues count toward the cap. POST /api/agent/whoami {}.
- CONFUSING: join_neighborhood_fund response does not state the amount charged, the PayPal transaction id, or how cancel/leave works. Also the join response omits the "monthly" and "suggestion" explanations that neighborhood_fund gave; mayCancel is false and there is no leave_neighborhood_fund tool. Request: POST /api/agent/join_neighborhood_fund {}.
- CONFUSING: neighborhood_fund suggestion says 4 households while fund.households says 3 before joining (4 after). Understandable (4 in ZIP, 3 joined), but wording is ambiguous.
- MINOR: choose_cause with {"cause":"disaster"} style vs "causes" map: the person's old policy field "cause":"disaster" still shows beside new "causes":{"disaster":67,"hunger":33} in my_policies.
- MINOR: tools are not listed in llms.txt; REST needs MCP tools/list or guessing names. llms.txt mentions list_products -> get_quote flow only.
- MINOR: Fund has no projects list yet, so "vote for a local project" cannot be exercised; no voting tool exists in the tool list at all (no vote_project tool).
- No BLOCKER found.

## Unclear (guessed)
- "Food banks" = cause id hunger (name matched); "disaster rebuilding" = disaster.
- "About two thirds" -> 67/33 (shares sum to 100).
- Whether the choose_cause change applies retroactively to premium already paid (the first $11.20 was split 100% disaster at purchase); the note says "premiums from now on".
- Whether $3 fund dues count against monthlyMax (whoami says no change) - I assumed fine since $14.20 < $60.
- Whether "cheap and useful" was satisfied: judged yes ($3/mo vs up to $125 per claim), but usefulness depends on claim likelihood and the fund balance ($12) being enough; the fund pays only "while it has the money".
- Whether joining was a purchase needing mayBuy; the tool accepted it with mayBuy true and autopay true.
- How the neighbors vote on projects, and when the fund year ends.
- The fund payment's PayPal id was not shown; I have no way to verify money moved other than paid:1 and balance +$3.

VERDICT: 0 BLOCKER, 0 BUG, 5 CONFUSING
