# Done round 2 - Luis Ortega Plumbing (test) - pro side

## Outcome
No job won. Earned $0.00, fee $0.00, no PayPal payout (nothing to pay). Two offers sit open and unanswered; no job reached hold, work, evidence or payout, so the BEFORE/AFTER photo, change-order and receipt steps were not exercised. Stopped at the 25-minute limit.

## What I did
1. GET /llms.txt, /api/info (platform now 2026-11-04T17:49Z, mock PayPal, rules-only checker), agent-card.
2. A2A `readiness` -> hireable:false, one blocker "paypal" (website only); recommended: licence, insurance, sign-in. It also returned a NEW onboarding link (expires 11-11, oneUse).
3. Luis's link from luis-token.json was already used: POST /api/pro/onboard -> 410 "used or has expired. Ask staff (or your agent: readiness) for a new one." (Luis opened it on his phone.) I used the fresh link from `readiness` -> 200, cookie done_session. NOTE: this is the one time I acted as Luis on the website API, as allowed.
4. Website API, by guessing paths (nothing documents them): PUT /api/pro/paypal {email} -> PayPal verified ("demo verification (stands in for Log in with PayPal)"). PUT /api/pro/verification {"license":{"number":"M-41877"}} -> valid, Master Plumber, active, expires 2027-06-30. Insurance via {"insurance":{"carrier":"Lone Star Mutual","policy":"LSM-2290415","limit":100000000,"expires":"2027-06-30"}} -> valid, "$1,000,000.00" (limit is in CENTS; limit 1000000 gave "$10,000.00" and "general liability under $300,000"). Readiness then: hireable:true, badges PayPal/Licence/Insured. Took ~4 min mostly guessing field names.
5. list_jobs: DP-1028 clog 78745 $160, DP-1033 faucet 78723 $220, DP-1036 water heater 78704 $2,400 (needs permit + inspection docs I was not going to promise). A DP-1035 faucet vanished between two calls; DP-1038 (78704 $250), DP-1039 clog (78751 $250), DP-1040 faucet (78704 $200) each appeared and disappeared within ~1 minute (hired/closed). I never saw Maria's 78702 job (her report exists, so it was probably taken before I looked / before I was hireable).
6. offer DP-1033 (job_cf02d1f17c) $215.00 = $85 call-out + 1h x $110 + cartridge ~ $20 (ceiling $220; $85+$110+$35 estimate would have been $230, over ceiling). Offer id ofr_49c56dacad, status open, 17:57.
7. offer DP-1028 (job_be2b624083) $140.00 = $85 + ~30 min, offer ofr_fbb6776f54, 18:08.
8. Polled both jobs and the job list every 3-10 s for ~12 minutes. No counter, no accept, no hold, no new job after DP-1040. Both offers still "open".
9. scope_reply not needed: every condition on the faucet/clog jobs is something Luis can photograph.

## Money
Held $0, captured $0, paid $0, refunded $0, fee $0.

## Asked Luis for anything?
Only what the brief allowed: used the onboarding step myself. Luis's own link had already been consumed.

## Findings
- BLOCKER: Pro-side website setup (PayPal, licence, insurance) has no documented API. llms.txt only says "open the onboarding link". I found PUT /api/pro/paypal and PUT /api/pro/verification by trial; unknown JSON fields are silently ignored (200 with unchanged data), so e.g. {"licenseNumber":...} and {"license":"M-41877"} return 200 and nothing changes. An agent finishing onboarding for its person cannot do it without guessing.
- BUG/CONFUSING: insurance `limit` is in cents while everything else in the API says USD ("amount (USD)"). 1000000 was read as $10,000 and flagged "under $300,000".
- CONFUSING: onboarding link in luis-token.json was dead (used on the phone), the usable one only came from `readiness`; the 410 message does point to that, which helped.
- CONFUSING: pro "rules" default to callout $60 / hourly $90 / 25 mi (visible in GET /api/pro/me); I found no endpoint to set $85/$110 (PUT/POST /api/pro, /rules, /price, /prices, /profile, /me all 404). Offers are free-form amounts so it didn't block, but the stored rates are not Luis's.
- CONFUSING: no sense of how a quote relates to the scope estimate. job_status shows estimate {hours:1, parts:3500}; $85+$110+$35 = $230 exceeds a $220 ceiling, so an honest rate card can be over a budget with no hint or "offer too high" answer (the offer call did not say whether $215 was competitive).
- CONFUSING: there is no pro-side news/wait tool (customers have wait_for_news). I had to poll job_status and list_jobs; open jobs disappear from list_jobs with no reason (hired, cancelled?) and offers on stale jobs (DP-1028 created 10-29, DP-1033 created 11-02, platform date 11-04) stay "open" forever with no customer answering.
- MINOR: a job ceiling shown "priceCeiling" but the offer call's answer is the whole job object (large; hard to see if offer accepted/flagged).
- MINOR: the A2A reply for job_status for list_jobs shows zip only, so a pro can't tell Maria's job (78702) from others at 78704 until it's gone.

## Unclear
- Whether a pro can be hired by the seeded old jobs at all (no customer agent seems attached).
- Whether the callout includes the first hour; whether "parts at cost" belongs inside the offer or only in a change order (receipt rule says total matches "parts in the price plus approved change orders").
- Why DP-1035/1038/1039/1040 vanished (who hired them, whether before my offer window).
- Whether license/insurance need a "document" (insurance shows document:false and is still valid).
- Whether verifying PayPal with only the email (no real login) is intended in this demo.

VERDICT: 1 BLOCKER, 1 BUG, 5 CONFUSING
