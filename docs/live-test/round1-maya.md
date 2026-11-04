# Cover round 1 - maya (Maya Chen)

## What I did
1. GET /llms.txt, GET /api/info: Cover now = 2026-12-05. Trip dates (12-20, 12-30) are in the future on Cover's clock: OK.
2. whoami: monthlyMax $150.00, monthlyNow $0.00, mayBuy true, mayCancel false, scopes read/buy/claim.
3. list_products: travel plans flight / standard / plus. Only standard and plus include medical.
4. insure_trip {} -> error "answers", missing destination, departure, return, flights, oldest. I do NOT know "oldest" (age of oldest traveler); Maya never said. I did not guess it for a purchase.
5. get_quote (quotes only, nothing bought), asia, 2 travelers, tripCost 1400 each (server shows "$2800 prepaid"), UA837 2026-12-20 + UA838 2026-12-30:
   - flight, any age: $108.15 total (q_1c6928ae10). Delay $100@2h/$300@6h per traveler (limit $1200), cancel $300, bag $200. NO medical.
   - standard, oldest 30: $232.26; oldest 60: $266.25. Medical $50,000 + trip cancellation.
   - plus, oldest 30: $252.66; oldest 60: $307.04.
6. my_policies: nothing bought.

## Outcome
Nothing bought, no money moved. Maya's requirements conflict: medical is only in standard/plus, cheapest $232.26 (age 30), over her "under $150" and over her monthlyMax $150 (Cover would refuse). Flight-only fits ($108.15) but has no medical. Also need the oldest traveler's age.
I did not trigger the demo flight-delay control: it needs a policy first.
Asked of person: (a) oldest traveler's age, (b) choose: flight-only $108.15 (no medical) or raise budget AND monthlyMax on the website for standard ~$232-266.
Late flight, if insured: UA837 3h late = $100 per traveler = $200 total (2h tier; $300 only at 6h), paid automatically via PayPal Payouts, no claim. Speed untested.

## Findings
- CONFUSING: quote price depends on "oldest" only for medical plans; flight plan price ignores it, yet insure_trip requires it. Request: POST /api/agent/insure_trip {}.
- CONFUSING: tripCost is "per traveler" but the quote reports "$2800 prepaid" (sum); fine but unlabeled.
- MINOR: get_quote without product returns "No such product: renters, home, pet, life or car." - omits "travel" from the list. Request: POST /api/agent/get_quote {}.
- MINOR: llms.txt does not mention the demo flight-feed control; I did not search for it.

## Unclear
- Whether Cover would reject standard plan purchase against monthlyMax $150 (assumed yes, did not try as it exceeds her stated budget anyway).
- Whether the 2h/6h delay tiers are paid cumulatively ($400 at 6h) or the higher tier only (clause text says "$300 at 6 hours").
- Whether "under $150 in total" includes anything besides premium.

VERDICT: 0 BLOCKER, 0 BUG, 2 CONFUSING
