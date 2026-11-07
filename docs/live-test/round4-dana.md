# Done round 4: Dana Kim's agent (water heater, job_5e6183fcf0 / DP-1037)

Platform clock note: /api/info "now" was 19:52 at start, 19:57 after ~5 real minutes, then 20:25 about 7 real minutes later with demoDaysSkipped 0. I never moved the clock. Photo EXIF said 20:10 while "now" was about 20:02.

## Steps
1. GET /llms.txt, /api/info, whoami, my_limits: limits $500 per job, $1,500 per month, change order max $75, agentMayRelease false. No saved payment (savedPayment null).
2. post_job (budget 2400, options releaseMode review, reviewHours 48, retainPct 10, warrantyDays 90, inspector p_9657267fe3 Capitol Home Inspections, requireBefore true) gave error limit: "A $2,400.00 budget is over your person's per-job limit of $500.00", with askPerson.url /link?code=...
3. ASKED DANA: handed her that link (http://localhost:8810/link?code=...). Acting as Dana I opened it (GET /api/auth/link?code=..., 302 to /connect#limits) and, as her, PUT /api/limits {perJobMax:2400, monthlyMax:2400}, 200; now $2,400 / $2,400. I left agentMayRelease false and changeMax $75.
4. post_job again: job_5e6183fcf0, DP-1037, status offered. Milestones (I passed none) came from "the rules' multi-day template": m1 "Permit, removal and the new heater on site" 40% (c1, c2, m1d1 permit), m2 "Installed and inspected" 60% (c3, c4, c5 receipt, m2d1 inspection report), m2 inspect:true. Options echoed back as requested.
5. review_scope: ok:true, gaps only about the pro (note, TSBPE licence); no revisedScope, so nothing to apply.
6. Offers (first about 60 s after post): Barton Creek $1,545 (ofr_900d6322a7), Eastside Pipe & Drain $1,495 (ofr_cfedf53cf4), Hill Country $1,650, Mueller $1,565, Lone Star Rooter $1,485.
7. counter_offer once on Eastside to $1,350: pro agent accepted within about 1 s ("We can do $1,350.00").
8. accept_offer ofr_cfedf53cf4 (no payWith): status held, "paidWith: saved card", PayPal order MOCK-74EFE16A670F, authorization AUTH-5B4AC46B7B75, $1,687.50 authorized (price $1,350.00 + buffer $337.50). m1 $540.00, m2 $810.00.
9. Pro (arrival 20:00:40) started work about 5 min after the hold and submitted m1 about 1.5 min later.
10. m1 check round 1 (rules, no VLM): c1 pass but NEEDS_REVIEW (person confirms), c2 same, m1d1 permit needs_fix "no issue date". Status review, waiting on customer. askPerson link given; opened as Dana (302 to /jobs/job_5e6183fcf0).
11. I fetched the evidence and looked at it as Dana would: the "after" photos for c1 and c2 are the NEW heater's rating plate (GX-40T, 40 GAL, 40,000 BTU/h, serial 2611-04A-7731), not an old heater with its label, and it is 40 gal, not the 50 gal she ordered. Only the before photo shows the old heater (rust at base). She would not confirm or release.
12. request_fix with agent token (the website session cookie is refused by /api/agent/*: "Send a person's agent token"): permit no issue date, 40 gal vs 50 gal, c1 photo not the old heater. Status needs_fix. Pro resubmitted in about 1.5 min the identical permit text "CITY OF AUSTIN plumbing permit BP-2026-004512 (demo)", still "no issue date" (round 2, review). A new askPerson link came each time; I opened each as Dana.
13. request_fix #2 (round 3) and #3 (spelled out the "Issued: <date>" line it needs; round 4): same result. The pro agent ignores the reason text and resends the same permit.
14. Used "finish now" (POST /api/jobs/job_5e6183fcf0/demo-finish, as Dana via her link cookie). NOTE: nothing sat idle for 5 minutes; I judged it stuck after 4 rounds over about 10 min. It only re-ran the check on the same evidence: still review, m1d1 needs_fix.
15. Stopped. I did not release over the failed permit (Dana releases only what passed; agentMayRelease is false), did not dispute, did not cancel. m2 and the inspector step were never reached, so I did not act as the inspector.

## Money (job_5e6183fcf0)
- Held: $1,687.50 (AUTH-5B4AC46B7B75, order MOCK-74EFE16A670F), honorUntil 2026-11-07T19:55:32Z, expires 2026-12-03.
- Captured $0.00, payouts none, retainage $0.00, refunded $0.00. money.balanced true (ledger holds only the hold). m1 $540.00 + m2 $810.00 = $1,350.00 = agreed price. Fee, retainage and inspector payouts were never exercised.
- Eastside payee verified (masked e•••@done-demo.example). No helper.

## Timing
Post to first offer about 60 s; counter answered about 1 s; accept to pro start about 5 min; start to submit about 1.5 min; each fix round about 1.5 min.

## Asked Dana
1) Raise per-job and monthly limits (limit error, askPerson). 2) Each time the server returned askPerson on a review (4 times) I opened it for her. Nothing else.

## Findings
- BLOCKER: the permit check cannot pass. The pro agent resends the same permit text with no issue date after every request_fix (rounds 1 to 4; ev_945b0021d7, ev_e9771b67d7, ev_e7f6177193 and one more). request_fix {job, milestone m1, reason} gives needs_fix, pro resubmits identical, back to review with toFix m1d1 "no issue date". The only ways forward are release over a failed check or dispute, so no clean paid milestone is possible. "finish now" does not help (same evidence rechecked).
- BUG: delivered heater does not match the job and nothing flags it. Job and scope say 50-gallon; the plate photo says 40 GAL, GX-40T. c1 "old heater before removal" is "satisfied" by a photo of the new unit's plate. c1 and c2 show verdict "pass" with confidence 0.3 and reason "no VLM verdict; a person confirms", so "pass" is shown for unjudged photos (label NEEDS_REVIEW, needsPerson true).
- BUG: hold buffer explanation contradicts amounts. accept_offer hold.bufferWhy: "25% (not 20%): Done-Risk puts the overrun chance at 26%" while hold.explain says "$337.50 is buffer (20% of the price ...)"; $337.50 is 25% of $1,350. Job bufferPct shows 20.
- BUG: hold says paidWith "saved card" although whoami savedPayment is null and I did not pass payWith.
- CONFUSING: retainPct 10 is accepted but appears nowhere in milestone amounts ($540 + $810 = $1,350) or hold; unclear when the 10% is held back.
- CONFUSING: platform clock advanced about 30 platform minutes in about 7 real minutes without me moving it; EXIF "taken" times were later than "now".
- CONFUSING: website cookie is refused by /api/agent/*, so "as Dana" a fix request needed the agent token. The website's own fix/release endpoints are not documented in llms.txt.
- CONFUSING: job_status next says "Some checks need more evidence and the checker left it to you" even when the failing check is a document needs_fix.
- MINOR: wait_for_news {after:N} returned old events again and returned immediately; "seconds" did not wait. I polled instead.
- MINOR: a new one-use askPerson link appears on every job_status call.
- MINOR: the demo pro agent accepts a counter of 9.8% below its ask instantly.

## Unclear
- Who moved the clock (no way to see).
- Whether milestones came from my options (I passed none) or the template; response says "from the rules' multi-day template".
- What reviewHours 48 does for m1 after confirm; never reached.
- Whether confirm_checks would clear the permit check (it is needs_fix, not left-to-person); not tried, since Dana would not confirm photos showing a 40 gal unit.
- Whether demo-finish is meant to repair evidence or just re-run the check.
- Who "staff (expert queue)" in waitingOn.also is and whether they would ever act.
- Retainage and inspector steps: untested because m1 never passed.

VERDICT: 1 BLOCKER, 3 BUG, 4 CONFUSING.
