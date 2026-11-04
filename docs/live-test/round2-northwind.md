# Northwind round 2 report (stopped before binding)

## What I did
1. GET /llms.txt and /.well-known/agent-card.json: partner flow is offer_trip_cover -> counter_offer (once) -> bind_cover -> cover_status, via POST /api/partner/<action> with Bearer cvpk_ key, or A2A at /a2a.
2. GET /api/info: Cover's now = 2026-12-05. Out in 12 days = 2026-12-17, back 5 days later = 2026-12-22.
3. POST /api/partner/offer_trip_cover, destination "Cancun, Mexico", flights AA1220 2026-12-17 / AA1221 2026-12-22, travelers 2, tripCost 1300:
   {"error":"answers","missing":["oldest"],"bad":["destination must be one of domestic, americas, europe, asia, other"]}
4. Same with destination "americas": {"error":"answers","missing":["oldest"],"bad":[]}.

## Stopped here
"oldest" (age of the oldest traveler) is required and my owner did not give it. It drives price and eligibility, and a guessed age on an insurance application is a misstatement, so I did not invent one. No offer, no counter, no bind, no money moved.

## What my owner needs to supply
Age of the oldest traveler (Sam's and the second traveler's). Then I run offer -> counter_offer budget 70 -> bind_cover payer test_card.

## Findings
- CONFUSING: destination is a fixed list (domestic, americas, europe, asia, other); free text "Cancun, Mexico" is refused. Cancun is "americas" by my reading, which is a guess. The agent-card example shows no list of allowed values.
- CONFUSING: error "Cover can't offer this trip online." reads like a refusal, but it just means missing fields; "said" repeats the message twice.
- MINOR: llms.txt partner section marks "oldest" and "tripCost" as plain fields, not saying which are required.

## Unclear
- Whether Cancun maps to "americas" or "other".
- Whether tripCost is the total (1300) or per traveler (650).
- Whether the date of the return flight must equal "return".

VERDICT: 0 BLOCKER, 0 BUG, 2 CONFUSING
