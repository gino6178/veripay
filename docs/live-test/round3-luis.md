# Luis Ortega Plumbing (test): round 3 report

Platform clock at start 2026-11-04T19:02Z, at end ~19:23Z. About 45 tool calls.

## What I did
1. Read llms.txt and /api/info (paypal mock, fee 10%, rules not model).
2. Onboarding on the website (Luis opened the link on his phone and let me finish it; I used the link code via POST /api/pro/onboard):
   PUT /api/pro/paypal luis.ortega@done-demo.example -> verified (demo verification). PUT /api/pro/verification M-41877 + Lone Star Mutual LSM-2290415 $1M exp 2027-06-30 -> both valid. PUT /api/pro/rates callout 85, hourly 110, at_cost, radius 20 -> accepted. readiness: hireable true.
3. list_jobs: DP-1035 (faucet, ceiling $200), DP-1033 (faucet, $220, 5 demo offers already), DP-1028 (drain, 8.1 mi, window expired 10/31).
4. offer DP-1033 $110 (19:03:09); offer DP-1035 $85 (19:03:50). DP-1035 went to "Eastside Pipe & Drain (demo)" at $175 (my $85 offer was marked "declined" with no reason shown). DP-1033: HIRED at $110 at 19:04:11 (about 1 min after offer). Hold: $132.00 (110 + 22 buffer), AUTH-F8F73FA00A4B.
5. start_work with 2 before photos 19:05:34 -> status working.
6. request_change +$47.05 parts with photo (19:06:06), chg_7aa205c59a. Status pending ever since (17+ min).
7. Installed photos (c1) x2, receipt $47.05 (c3), note, all submit:false -> accepted.
8. After 10+ min (19:17:35) sink-dry photos (c2) x2, submit:true -> refused: error "pending", "A change order is waiting for the customer: it's decided before the check."

## Money
Held $132.00 (authorization). Captured $0, paid out $0, refunded $0. NOT PAID: job still "working"; I could not finish. Expected if it had gone through: price $110 (+$47.05 parts), 10% fee, rest to luis.ortega@done-demo.example in a Payouts batch. I do not know the PayPal payout status because no payout happened.

## Asked my person for anything?
No (he needed to do nothing beyond the onboarding link). Nothing I could do for the stuck change order from the pro side.

## Findings
BLOCKER: Seeded demo customer never answers a change order. request_change {amount 47.05, kind parts} -> chg_7aa205c59a status "pending", waitingOn customer "approve or decline the change order". 17+ min, no event. submit_evidence {submit:true} then returns {"error":"pending","message":"A change order is waiting for the customer: it's decided before the check."}. The pro has no action to withdraw the change order, so the job is stuck and the money stays held. Whole job unfinishable.
BUG/CONFUSING: Retrying the failed submit_evidence stored the c2 photos again each time (6 c2 photos, 13 evidence items in total) even though the submit was rejected. Duplicates accumulate.
CONFUSING: Customer accepted my $110 offer on DP-1033 while 5 other offers existed; also "decline" of my $85 on DP-1035 (the cheaper one) with no reason: offer status "declined", answer null, customer hired a $175 pro. Not clear why the cheapest hireable offer lost.
CONFUSING: scope_review event on DP-1033 (after hire) says "No BEFORE photo" and "No note from the pro", but the scope has no before check and requireBefore is false; start_work still demanded a checkId per before photo, and the scope has no id for "before" on DP-1033 (I used c1, which is the installed-photo check).
CONFUSING: A change order of a known part cost needs the receipt total to equal the approved change order; the customer's agent limit on change orders is $75 by default; nothing tells the pro what limit applies.
MINOR: list_jobs shows DP-1028 whose window ended 10/31 (before the platform date) as open. wait_for_news returns events from `after` again if you pass the same id; the `last` value must be tracked by hand.
MINOR: make-assets.ps1 fails under default execution policy (needed -NoProfile -ExecutionPolicy Bypass and an absolute output path).
MINOR: The job's address is only a ZIP centroid (precise:false); I used its lat/lng for photos.

## Unclear
- Arrival: I gave 21:00Z for DP-1033; unknown if it matters for the "window".
- Whether before photos should be tied to c1 (I guessed c1).
- Whether pending change order should auto-expire or auto-approve for the demo customer.
- Why the offer was "declined" rather than "lost".

VERDICT: 1 BLOCKER, 1 BUG, 4 CONFUSING
