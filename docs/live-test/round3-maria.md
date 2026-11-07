# Maria Lopez agent, Done round 3 (job DP-1035, job_eb077c3697)

Transport: MCP (Streamable HTTP, SDK) worked for every call; no REST fallback needed.

## What I did (platform clock = real time here; 2026-11-04)
1. whoami / my_limits: perJob $500, month $1500, changeMax $75, agentMayRelease false, agentMayCancel true. savedPayment null.
2. post_job (zip 78702, budget 200) at 19:02:15Z -> status offered, scope "Fix a leaking faucet", 5 checks (before, new_part, no_drip, receipt, work_note), ceiling $200, window 11-04 20:00Z to 11-08 02:00Z, releaseMode instant, 14-day warranty. Scope written by rules in 14 ms.
3. review_scope: one medium gap, "TSBPE-licensed plumber needed", suggested a licence-number note check. The suggestion is not in the scope and no tool lets the customer agent add it (see CONFUSING). Fairness of conditions: they look fair; the 10-minute-after rule for no_drip is clear.
4. Offers arrived 19:03:16 to 19:03:52 (about 1 minute): Barton Creek $220, Eastside Pipe & Drain $195, Hill Country $255, Luis Ortega (test) $85 flat, Mueller $220; Lone Star Rooter $195 arrived later (19:0x). Within $200 only Eastside, Luis and Lone Star.
5. counter_offer Eastside $175 at 19:03:59 -> pro agent answered "accept" the same millisecond ($175).
6. accept_offer (no payWith) at 19:04:15 -> status held. hold: $200.00 authorized (price $175 + $25 buffer; 20% would be $35 but capped at ceiling), AUTH-D30F6864D613, paidWith "sandbox test card (simulated PayPal)", honorUntil 11-07, no approveUrl. Nothing captured.
   I chose Eastside over Luis ($85): Luis has no rating or history and one flat price with no breakdown; Eastside is local (0 miles), licensed, insured, within budget.
7. Waited with wait_for_news (50 s each, about 20 calls) from 19:04 to 19:19. No event after id 296 (money_held / scope_review). Job stayed "held", waitingOn pro "start work", arrival promised 2026-11-05T03:03Z (about 8 h later). Pro never started.

## Outcome: NOT COMPLETED
Time posting -> paid: not reached. Maria paid $0.00; $200.00 held (authorization), $0 captured, no payout, no refund. Payout PayPal status: none exists. I did not move the platform clock (instructed). I never needed to ask Maria for anything: no approveUrl, no askPerson, no change order, no photos to confirm.

## Findings
- BLOCKER: job stalls at "held / waitingOn pro: start work" for 15+ minutes (and until the pro's stated arrival, 8 h ahead of the platform's now). Request: job_status/wait_for_news after accept_offer on ofr_e8e82a828e; response: no events after 296. The demo pro agent only seems to act at the promised arrival time, so a tester who must not advance the clock cannot finish a demo-pro job. The offer's arrival was stated as "Wed, Nov 4, 9:03 PM" which was 2 h in the future of 19:03Z... wait, in local terms it is 9:03 PM CST (03:03Z), so it is not wrong, just far off for "dripping all night".
- BUG/CONFUSING: accept_offer without payWith used "sandbox test card" although savedPayment is null; the doc says default is the vaulted method. The user never saw or agreed to a card.
- CONFUSING: the first offer text said "arriving Wed, Nov 4, 5:03 PM" while the offer was created at 19:03Z = 1:03 PM local; times are local CST but the API fields are UTC with no timezone label in the text.
- CONFUSING: review_scope's licence-note suggestion cannot be applied by the customer agent (no edit_scope tool; revisedScope null), so the licence check never enters the scope. suggestChecks was also in post_job's scope.code but not added.
- MINOR: the shots field says min 2 photos per check but the rule says photo>=1; the photoChecklist marks only 3 shots required.
- MINOR: counter was accepted instantly by the demo pro at exactly my number ($175, 10% under ask); there was no real negotiation, so the counter tool's "pro may counter back once" path wasn't exercised.
- MINOR: wait_for_news with the same "after" returns the same events again, so a loop must track "last" itself.

## Unclear
- Whether a demo pro is supposed to start work by itself before arrival time, or only when the clock reaches arrival.
- Whether "saved" falling back to the test card is intended.
- Which offer the Lone Star Rooter ($195) really was; I did not look at it.
- Time zone of the "arriving" text.

VERDICT: 1 BLOCKER, 1 BUG, 3 CONFUSING
