# Cover round 1 - agent for Leo Park

Setup: read /llms.txt; GET /api/info -> Cover now 2026-12-05 (demoDaysSkipped 31). Token OK. whoami: monthlyMax $30.00, monthlyNow $0.00, mayBuy true, mayCancel false, autopay false, scopes read/buy/claim, paypalSaved false, cause null. my_policies: [].

## Task 1: AA2301 2026-12-12 / AA2302 2026-12-14, flights only
- insure_trip {} -> error "answers", missing destination, departure, return, flights, oldest.
- insure_trip with arguments nested under "answers" -> same error (it wants them flat).
- insure_trip flat (destination domestic, departure 2026-12-12, return 2026-12-14, flights as "AA2301 2026-12-12\nAA2302 2026-12-14", plan flight) -> missing ["oldest"] only. tripCost and travelers were not required (defaults apparently). flights as an array of objects was accepted too (same "oldest" error).
- Leo never gave the oldest traveler's age, so I did NOT buy. For information only, get_quote travel with oldest 25 / 45 / 70 (tripCost 0, travelers 1, plan flight): all $41.20 for the trip (claims pool $32.00, reinsurance $0.96, fee $8.24). Quote ids q_b5f4654c47, q_7fcbc04556, q_d940b3b721, expire 2027-01-04. Cover: delay $100 at 2h / $300 at 6h (limit $600), cancel $300 (limit $600), bag delay $200. Price is independent of age for this plan.
- Nothing bought. $41.20 is above monthlyMax $30.00 anyway, so it would likely need Leo to raise the limit on the website (I did not test the buy call, since it would have needed a guessed age).
- Flight risk factors shown: AA2301 "from MIA" (8% 2h late, 1.6% cancel), AA2302 "from SEA" (6%, 1.2%). Leo said Chicago; these origins look odd for a Chicago weekend (see Unclear).

## Task 2: renters quote only (not bought)
- get_quote with place 78704, size 600, floor low (3rd floor), building apartment (walk-up), contents 9000, deductible 500 -> error missing valuables, claims3y.
- Leo did not say these. Probed: claims3y 0 -> $92.88/yr = $7.74/month; claims3y 1 -> $111.36/yr = $9.28/month. valuables 0 vs 3000 gave identical prices. Deductible $500, contents $9,000, liability $100,000, stay $3,000 ($100/day), guest medical $1,000. Zone Austin TX: hurricane 1 (x0.9). Quotes q_1cf75bd9d0 (0 claims), q_1495f52417 (1 claim).
- Answer for Leo if he has had no claims: about $7.74/month ($92.88/yr), pending his answers on valuables and claims.

## Outcome
Person paid $0. No money moved. Nothing bought, no approveUrl produced.

## Asked of the person
- Age of the oldest traveler (required to buy the trip cover).
- Valuables over $1,500 per item and number of renters/homeowners claims in 3 years (to firm up the renters price).
- Probably raising monthlyMax above $30 on the website to buy the $41.20 trip cover; he must do that himself. He also needs to connect PayPal (paypalSaved false) and pay via the approveUrl at purchase.

## Findings
- CONFUSING: insure_trip nested {"answers":{...}} returns "missing" for every field, with no hint that arguments must be flat. Request: POST /api/agent/insure_trip {"answers":{...}}.
- CONFUSING: get_quote does take {"product","answers"} but insure_trip does not; inconsistent shape between the two.
- CONFUSING: insure_trip's required "oldest" age has no effect on the flight-only price (25/45/70 all $41.20) yet blocks the call.
- CONFUSING: trip price $41.20 exceeds monthlyMax $30 and a quote gives no warning about the limit; unknown whether a purchase would be refused or need approval.
- MINOR: "valuables" is required for renters but did not change the price (0 vs 3000), and its effect seems tied to an add-on not shown in "addons":[] of the quote.
- MINOR: get_quote with no product says "No such product: renters, home, pet, life or car." but the product id for travel is "travel" (list not including travel), and the car id is "car".

## Unclear
- Whether the flat insure_trip arguments for flights accept the array-of-objects form (error was the same, so it parsed or was ignored).
- Why AA2301 originates in MIA and AA2302 in SEA for a "Chicago" trip; I did not verify.
- Whether tripCost and travelers default to 0 and 1 in insure_trip.
- Whether monthlyMax counts a one-off trip premium.
- Whether "3rd floor" maps to "low" (2nd to 5th floor): I assumed yes. "Walk-up" mapped to "apartment".
- Whether contents 9000 means replacement cost (Leo said "worth maybe $9,000").

VERDICT: 0 BLOCKER, 0 BUG, 4 CONFUSING
