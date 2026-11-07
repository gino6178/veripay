# Dana's agent: STOPPED at step 1 (per-job limit), needs a decision

1. GET /llms.txt, /api/info (platform now 2026-11-04). whoami: Dana Kim p_8e3bd82357, scopes read/hire/pay, no savedPayment.
   my_limits: perJobMax $500.00, monthly $1,500.00, changeMax $75.00, agentMayRelease false.
2. post_job {text, zip 78704, budget 2400} -> {"error":"limit","message":"A $2,400.00 budget is over your person's per-job limit of $500.00. They can raise it on the website (Connect your agent > Limits, PUT /api/limits), or post it themselves.","limitUsd":"$500.00","wouldBe":"$2,400.00"}. No job posted, no money moved.
3. Question I would ask Dana: "This job can cost up to $2,400 (price plus a 20% hold buffer, capped at the budget). May I raise your per-job limit to $2,400 and your monthly limit to at least that? I'd also keep release off so you confirm the final payout."
4. Acting as Dana: PUT /api/limits with her agent token -> {"error":"signin","message":"Sign in first."}. The only website sign-in found is POST /api/auth/demo {"as":"customer"}; it never signs in as p_8e3bd82357. It creates a NEW demo person each call (I made 3 by accident: p_b393ef32da "Demo · Dana Kim", p_49862951eb "Demo · Sam Patel", plus one more attempt with a personId field that was ignored). Raising limits on those would not change Dana's token limits, and using one would mean spending as a different person.
5. Also: Dana has no saved payment method (savedPayment null), so accept_offer with payWith "saved" would likely fail; "card" (sandbox test card) is the fallback.

Findings
- BLOCKER (for this task): no way for an agent to authenticate as the token's own person on the website API; /api/auth/demo ignores personId/name and makes a new person. Request: POST /api/auth/demo {"as":"customer","personId":"p_8e3bd82357"} -> new person p_49862951eb "Sam Patel".
- CONFUSING: the limit error says "post it themselves" / "PUT /api/limits" but gives no way to get a session for the person who owns the token.
- MINOR: demo sign-in with "name":"Dana Kim" returns "Demo · Dana Kim" with a different id from the existing Dana.

Unclear: whether a demo sign-in is meant to be tied to an existing demo person; whether the token-owner can be reached some other way.

VERDICT: 1 BLOCKER, 0 BUG, 1 CONFUSING

---
## Update after Dana raised her limits (per job $2,400, monthly $3,000, change order $300, release off)

6. post_job (same text, budget 2400) -> job_02a6f52868 (DP-1036), status offered. Scope by rules: items (pull permit, remove old, install new + expansion tank + venting, city inspection); checks c1..c5 plus m1d1 (permit document) and m2d1 (passed inspection report). Milestones: m1 "Permit, removal and the new heater on site" 40% (c1,c2,m1d1, inspect:false); m2 "Installed and inspected" 60% (c3,c4,c5,m2d1, inspect:true). Estimate 6 h, parts $900. Price ceiling $2,400.
   Defaults in options: releaseMode instant, reviewHours 48, retainPct 0, warrantyDays 14, inspector null, requireBefore false. scopeReview null.
   Scope read: permit and inspection are covered as documents; no licence check in the done-conditions (licence is shown on the offers: all pros TX M-xxxxx demo registry, active). Fairness: m1 holds 40% for permit + removal + heater on site, which pays out before any install works; the BEFORE photo (c1) is not required unless requireBefore is on; no retainage by default, so nothing is kept back after the inspection; old-heater disposal is not a done-condition.
7. Offers arrived within about 1 minute 40 s of posting: Barton Creek $1,545, Eastside Pipe & Drain $1,495, Hill Country $1,650, Mueller $1,565, Lone Star Rooter $1,485 (all hireable, licensed/insured/PayPal verified).
8. counter_offer ofr_403f813db9 (Eastside) $1,400 -> answered at once by the demo agent: accept at $1,400.00 (thread msg_242ba1efc1).
9. BLOCKER: the agent API cannot set job options or run the scope review. post_job ignores retainPct/warrantyDays/inspector/requireBefore/reviewHours/options (probe job_36029a9a12 came back with all defaults; I cancelled it, status cancelled). No tool, in REST, MCP tools/list or the A2A card, edits options or reviews the scope; /api/jobs/<id> with the agent token answers {"error":"signin"}. These are website-only for Dana, so I stopped before accept_offer (accepting would hire with 0% retainage, no inspector and no BEFORE photos, against what Dana asked).
   Asked the coordinator to have Dana set on the website for job_02a6f52868: run the scope review, keep the two milestones, retainage (e.g. 10%), warranty (e.g. 30 days), a real inspector, BEFORE photos required, review window. Then I accept ofr_403f813db9 ($1,400, payWith card).

---
## Final: stopped on coordinator's instruction

10. Dana tried the options on the website: refused with "The scope is the contract: it can be edited until offers are asked for". GET /api/inspectors returned an empty list, so there is no inspector to choose.
11. cancel_job job_02a6f52868 -> status cancelled, hold null, captured $0.00. job_36029a9a12 (my probe) also cancelled. job_a9c9bf78cc (needs_fix) belongs to the other tester; untouched. spentThisMonth shows $180.00 from that job, not mine.

Money summary: nothing held, captured, paid out, refunded or retained on my jobs. Totals trivially balance ($0.00).
Timings: offers 1m40s after post; counter answered instantly.
Asked my person for: raising the per-job limit (done by Dana on the website); the options (impossible, see below).

## Findings
- BLOCKER: post_job offers no way to choose options (milestones, retainage, warranty, inspector, BEFORE photos, review window) and posting asks for offers immediately (status "offered" in the same response), after which the scope is locked. An agent-led job can therefore never get what the person asked for ("pay in stages, keep some back, real inspector"). Request: POST /api/agent/post_job with retainPct, warrantyDays, inspector, requireBefore, reviewHours, options -> job_36029a9a12 options all defaults (retainPct 0, warrantyDays 14, inspector null, requireBefore false).
- BLOCKER: no inspector exists to choose (GET /api/inspectors empty, per Dana), though milestone m2 is inspect:true and the scope promises a "City inspection" report.
- BLOCKER (earlier): an agent cannot get a website session for its token's own person; POST /api/auth/demo {"as":"customer","personId":"p_8e3bd82357"} created Sam Patel p_49862951eb. The over-limit error says "post it themselves" with no link for the person.
- BUG/CONFUSING: scope review is not reachable by the agent either (no tool; scopeReview null on the job).
- CONFUSING: default scope pays 40% at milestone 1 for permit + removal + heater on site, and BEFORE photo (c1) is not enforced unless requireBefore is on; default retainage 0 despite a multi-day milestone template; no licence done-condition.
- CONFUSING: my_limits spentThisMonth ($180) includes the other tester's job on the shared token.
- MINOR: demo sign-in with name creates "Demo · Dana Kim" with a new id.

## Unclear
- Whether options belong in post_job, a draft state before request_offers (request_offers exists as a tool, but post_job already asks for offers), or website-only.
- Whether "inspector: null" means no inspection or the city's inspection.
- Whether a person is meant to be linked to the job (an approve/edit URL) by the agent.

VERDICT: 3 BLOCKER, 1 BUG, 3 CONFUSING
