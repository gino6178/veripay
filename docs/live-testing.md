# Live testing

AI agents used Done & Paid the way real customers, agents and pros would, on the live server. Every round's reports,
operations and screenshots are in [live-test/](live-test/); [live-test/index.html](live-test/index.html) is the
one-page history. Real PayPal sandbox runs are listed there too (`live-test/sandbox/runs.json`).

## Round 1 (2026-11-05): 5 agents, 210 calls

The server ran on localhost:8810 with the PayPal stand-in. No model was serving yet, so every check ran on rules.

| Tester | Via | What they tried | Result |
|---|---|---|---|
| Maria's agent | MCP | fix a dripping faucet under $200 | posted, 5 offers in a second, countered $195 → $185, held $222; the demo pro never started |
| Jamie | website, phone | first visit: clogged sink, then the judge tour | held $234; job never worked; one bad offer blanked the page; the tour led into the staff office |
| Rin, customer side | REST | limits, payee, other people's jobs, release and cancel | every guardrail held; budget above the per-job cap accepted at posting; a pro could mint a customer token |
| Rin, dishonest pro | A2A | get paid without the work | could not be hired (no verified PayPal); the fraud tests never ran |
| Luis's agent | A2A | a real pro's own agent | outbid by demo pros answering in under a second; could never verify PayPal |

**No money moved wrongly.** Two things kept every customer's job from reaching payment: demo pros didn't work the jobs
they were hired for, and a pro who joined through their agent had no way to verify PayPal. All of it is fixed (see
`rounds.json`): demo pros now do their jobs, pros get an onboarding link plus a `readiness` check, demo pros wait a
minute before bidding, and the role, limit, staff and page-safety bugs are closed.

## Round 2 (2026-11-05): 5 agents (10 in total, 556 calls)

This round ran on a freshly seeded server with round 1's fixes in. Done-Audit, our own model, judged receipts and
notes. No vision model was serving, so photos waited for a person.

| Tester | Via | What they tried | Result |
|---|---|---|---|
| Maria's agent | MCP | dripping faucet under $200 | posted → all checks done in 5 min 13 s; $175 agreed, $200 held; waiting on Maria to confirm the photos |
| Jamie | website, phone | clogged sink, then the tour | **paid end to end**: $195; $175.50 to the pro, $19.50 fee, $39 of the hold never charged |
| Rin, dishonest pro | A2A | fake photos, receipts, injected text | no money moved wrongly; every fake photo failed; a caption with instructions slipped through |
| Dana's agent | REST | $2,400 water heater with milestones | blocked: an agent couldn't set retainage, inspector or BEFORE photos, and no inspector existed |
| Luis's agent | A2A | a real pro onboards and bids | verified and hireable, but never won a job; Maria's job never showed in his feed |

The fixes are listed in `live-test/rounds.json` under round 2.

## Round 3 (2026-11-05): 5 agents (15 in total, 860 calls)

The same five scenarios, run on a freshly seeded server with round 2's fixes in. Partway through the round the GPU VM
was preempted, so checks fell back to rules.

| Tester | Via | Result |
|---|---|---|
| Jamie | website | **paid**: $185 captured; $18.50 fee, $141.52 to the pro, $24.98 to the helper; $37 never charged |
| Dana's agent | REST | **both milestones paid**: $1,450 captured, $104.40 retained; but releasing m2 skipped the inspector |
| Luis's agent | A2A | **hired at $110**, a first for a real pro; stalled when the demo customer never answered his change order |
| Maria's agent | MCP | $200 held; the demo pro's arrival was 8 h away |
| Rin, dishonest pro | A2A | the onboarding code was used up before Rin's first try; withdraw-and-re-offer reset counter-once |

Fixes are listed in `live-test/rounds.json` under round 3.

## Round 4 (2026-11-05): 5 agents (20 in total, 1,196 calls)

| Tester | Via | Result |
|---|---|---|
| Maria's agent | MCP | **paid end to end in 22 min**; Maria approved the hold and confirmed the photos through the server's links; $175, of which $157.50 went to the pro |
| Jamie | website | **paid**: $195, of which $175.50 went to the pro; payout state and the checks headline confusing |
| Luis's agent | A2A | **won and finished a job** at $95; the demo customer never answered his change order |
| Dana's agent | REST | milestone 1 never passed: the demo pro resent the same permit with no issue date |
| Rin, dishonest pro | A2A + web | **blocker**: confirm on the website released money over failed checks ($187.05); everything else held |

All fixes, including a single capture guard covering every way money can move, are listed in `live-test/rounds.json` under round 4.

## Round 5 (2026-11-05): 5 agents (25 in total, 1,569 calls)

| Tester | Via | Result |
|---|---|---|
| Maria's agent | MCP | **paid**: $180; $137.70 to the pro and $24.30 to the helper |
| Luis's agent | A2A | **a real pro paid for the first time**: $168.34 of $187.05, including an approved $47.05 parts change order |
| Jamie | website | **paid**: $185; 0 blockers |
| Rin, dishonest pro | A2A + web | round 4's blocker closed: confirm over failed checks refused on every path; padded parts captured at the receipt amount |
| Dana's agent | REST | blocked: the permit check failed the demo permit with a reason that contradicted its verdict |

Fixes are listed in `live-test/rounds.json` under round 5.
