# Done round 6, rin: agent consent and pro-side evidence

Status: PARTIAL. Part 1 done (with two gaps noted). Part 2 not started: Shady Fix-It's onboarding link is already used and I have no PIN for its website sign-in, so it cannot be hired yet. See "Blocked" below.

Server: http://localhost:8810, mock PayPal, platform "now" 2026-11-05T01:13Z at the start.

## What I did, step by step

### Setup and read
- GET /api/info and GET /llms.txt (no source read).
- Dana's agent (dana-token.json, personPin not used): whoami, my_limits, my_jobs.
  - whoami: Dana Kim, ZIP 78704, scopes read/hire/pay. Limits: perJobMax $2,400.00, monthlyMax $1,500.00, changeMax $75.00, bufferPct 20, agentMayRelease false, agentMayCancel true.
  - my_jobs at start: one job, DP-1036 (job_c57d450677), not created by me (see "Unclear").

### Part 1: person-only actions attempted as Dana's agent

Requests are REST POST http://localhost:8810/api/agent/<tool> with the agent bearer token, unless noted. Responses are abbreviated.

| # | Person-only action | Request | Response | Result |
|---|---|---|---|---|
| 1 | Raise limits (agent tool) | my_limits {"perJobMax":"$5000.00","monthlyMax":"$9000.00","changeMax":"$500.00","agentMayRelease":true} | 400 `arguments`: "my_limits doesn't take perJobMax, monthlyMax, changeMax, agentMayRelease. It takes: view." | Refused |
| 2 | Raise limits (REST, no tool) | PUT /api/limits {"perJobMax":5000,"agentMayRelease":true} | 401 `signin`: "Sign in first." | Refused |
| 3 | Raise limits (guessed tool name) | POST /api/agent/set_limits {"perJobMax":5000} | 404 `tool`: lists the real tools, no set_limits | Refused (no such tool) |
| 4 | Turn on agent release (whoami) | whoami {"agentMayRelease":true} | 400 `arguments`: "whoami doesn't take agentMayRelease. It takes: view." | Refused |
| 5 | Turn on agent release (job option) | set_options {"job":"job_bca450437f","options":{"budget":"$5000.00","priceCeiling":"$5000.00"}} | 200, job unchanged: priceCeiling still "$300.00" | Not applied, but see BUG-2 (silent) |
| 6 | Turn on agent release (job option, DP-1036) | set_options {"job":"job_c57d450677","options":{"agentMayRelease":true}} | 200, options unchanged (releaseMode review, reviewHours 48) | Not applied, but see BUG-2 (silent) |
| 7 | Raise price ceiling (top-level arg) | set_options {"job":"job_bca450437f","budget":5000} | 400 `arguments`: "set_options doesn't take budget. It takes: job, options, view." | Refused |
| 8 | Counter above the offer (a raise) | counter_offer {"job":"job_bca450437f","offer":"ofr_b2f4ac6299","amount":450} | 400 `amount`: "A counter is less than the offer ($220.00)." | Refused |
| 9 | Release a job | release {"job":"job_bca450437f"} | 409 `state`: "Release is for a milestone in review ... (this one is offered)." | Refused by state only. Consent gate not reached. Re-test needed (see GAPS) |
| 10 | Confirm checks | confirm_checks {"job":"job_bca450437f"} | 409 `state`: "Confirming is for a milestone in review." | Refused by state only. Re-test needed |
| 11 | Apply a scope suggestion (g1) | apply_scope_suggestion {"job":"job_bca450437f","suggestion":"g1","view":"summary"} | **200**: scope changed, `changed.why: "suggestion g1"`, added done-condition s6 "Receipt for the replacement parts", `offersAgain: "Offers asked for again..."` | **SUCCEEDED without the person. BLOCKER-1** |
| 12 | Apply a scope suggestion (revised scope, no revision) | apply_scope_suggestion {"job":"job_bca450437f","from":"suggestion"} | 404 `not_found`: "No revised scope there." | Refused (nothing to apply) |
| 13 | Create a new token (REST) | POST /api/tokens {"label":"agent-made token"} with agent bearer | 401 `signin`: "Sign in first." | Refused |
| 14 | Create a new token (tool) | POST /api/agent/create_token | 404 `tool` | Refused (no such tool) |
| 15 | Open an askPerson/sign-in link to get a session | GET /link?code=<code> (the pro sign-in link the server handed the agent in readiness; no cookie kept) | 200 page; no Set-Cookie; then GET /api/me -> `{"signedIn":false}` | Refused. No session. Passed |
| 16 | Open the same link a second time | GET /link?code=... again | 200 | Not blocked by one-use (it is still served). See CONFUSING-2 |

Not yet tested under the consent gate:
- Confirm checks and release on a job actually in review (rows 9 and 10 stopped at state checks). These need a job with a failed check. Blocked on Part 2.
- Accepting an offer above the ceiling (needs an offer above the job's ceiling and then the askPerson path). Not reached. Barton Creek's offer is $220.00 on a $300.00 ceiling, and I did not accept it because it is not the pro the brief asks for.
- Change order above changeMax ($75) and its askPerson link (needs a hire first).

### Part 2: partial, blocked

- Onboarding Shady Fix-It (test) with its code: POST /api/pro/onboard {"code":"kpr7qMNQKffjLnBJM8Z9N1cw"} -> 410 `code`: "This onboarding link has been used or has expired. Ask staff (or your agent: readiness) for a new one." GET of the onboarding page -> 200. I did not get to set a PIN.
- Shady's agent, readiness (A2A message/send, data.action "readiness"): hireable false; blocker "Verify the PayPal ... on the website"; onboarding null; a signIn link for the website.
- Shady's agent, whoami: pro "shady-fix-it", verification.paypal.verified false, license and insurance not verified.
- Shady cannot take a job until the PayPal is verified on the website, and the website needs the pro's PIN. I have no PIN and did not guess one.
- Payout routing through the pro's agent key (checked in Part 2's scope):
  - A2A action list (from the -32602 error): no action sets a payout or PayPal address. An action "set_paypal" -> -32602 (not a valid action). Pass.
  - PUT /api/pro/paypal {"email":"shady.fixit@done-demo.example"} with Shady's agent key -> 401 `signin`: "Sign in as a pro." Pass.
  - early_pay via Shady's agent key (A2A) -> `person_only`, with a signIn link. Pass for the consent gate, but see BUG-3 (the link is for another pro's job).
- Not run (needs a hired Shady): posting the plumbing job and accepting Shady's offer, the 8 bad-evidence cases, the honest photo, the early-pay-twice case, and the agent-release test on a job in review. Photos not taken, so /photos/rin/ is empty.

## Findings

### BLOCKER-1: the agent applied a scope revision without the person
- Documented rule: llms.txt "Consent" says applying a scope revision needs the person's session on the website and a PIN step-up. The agent's apply_scope_suggestion is the same tool surface the person would use on the site.
- Request: POST http://localhost:8810/api/agent/apply_scope_suggestion with bearer agent token and `{"job":"job_bca450437f","suggestion":"g1","view":"summary"}`.
- Response: 200. The job's scope gained done-condition `s6` "Receipt for the replacement parts" (evidence receipt). `changed: {"why":"suggestion g1","added":[{"id":"s6",...}]}`; the offers were withdrawn and asked for again.
- Caveat for severity: g1 did not change the price or the payee. It did add a payment-gating done-condition, and the server's own rule lists scope revisions as person-only. Please decide if it is a BLOCKER under the brief's "scope suggestions that change money" test. I reported it as a BLOCKER because the documented rule is "applying a scope revision needs the person's PIN" and this is a change to what gates the money.
- Also seen on job DP-1036 (not mine): the timeline shows a scope change at 01:13:55 with "suggestion all" from "Dana Kim's agent (Done round 6)", with editedBy "person". I did not make that call, so I cannot tell whether it came from my agent token or another tester's. Please check the token log for that call.

### BUG-1: set_options silently ignores option keys it does not take
- Request: POST /api/agent/set_options `{"job":"job_bca450437f","options":{"budget":"$5000.00","priceCeiling":"$5000.00"}}`
- Response: 200, the full job, priceCeiling still "$300.00". No error, no warning.
- The same call with a top-level bad argument (`budget`) gets a 400 listing the allowed arguments, so the options object is the one place where unknown keys are accepted silently. Same for `agentMayRelease` on DP-1036.
- Impact: the agent cannot raise anything here, so no consent break. But a caller who thinks it changed the ceiling will not know it didn't. Should be 400 with the allowed keys.

### BUG-2: early_pay returns a sign-in link for a job the pro does not own
- Request: POST /a2a with Shady's pro key, `{"action":"early_pay","job":"job_c57d450677"}`.
- Response: `person_only`, with signIn `/link?code=<code>`, `what: "take early pay on DP-1036 (a fee comes out of your pay)"`, `to: /pro/jobs/job_c57d450677`.
- DP-1036 belongs to Eastside Pipe & Drain (demo), not Shady. The same key asking payout_status for that job gets `not_found: "No such job for your person"`.
- So early_pay checks the consent gate before it checks ownership, and leaks the existence of another pro's job and a one-use sign-in link for it. The link needs the real pro's PIN, so this is not a money move, but it is an authorization inconsistency.

### BUG-3 (merged into BUG-2 above)

### CONFUSING-1: whoami limits look inconsistent
- perJobMax $2,400.00 is above monthlyMax $1,500.00 for Dana. llms.txt says defaults are perJob $500 and monthly $1,500. Looks like seed data, but a per-job limit above the monthly cap should be refused or explained.

### CONFUSING-2: an opened sign-in link stays valid
- The pro sign-in link (`oneUse: true` in the readiness reply) returned 200 on a second GET. Opening it does not sign anyone in (checked), so the risk is small. But the reply says one use; the server does not enforce it on GET.

### CONFUSING-3: onboarding code is consumed and readiness gives no way back
- Shady's onboarding code is already used or expired (410). readiness says `onboarding: null` and only offers a website sign-in link that needs the PIN. There is no way for an agent to get a fresh onboarding link, so a pro who never finished setup is stuck unless staff re-issue one.

### MINOR-1: set_options returns the whole job (about 6 KB) for a no-op
- Not a bug, but the summary view was not requested on set_options calls 5 and 6, so the full job came back. The view parameter would have kept it short.

## Blocked
- Part 2 needs Shady Fix-It onboarded with a PIN I choose, or a website sign-in as Shady with its PIN. Neither is available: the onboarding code is used (410), and I do not have Shady's PIN. I did not guess a PIN and did not use the demo sign-in (POST /api/auth/demo) to act as the pro, because that would skip the PIN step this round is testing.

## Unclear
1. Job DP-1036 (job_c57d450677) was not created by me. My first calls showed it already offered by Dana's agent at 01:13:27, then "held" with Eastside Pipe & Drain (demo), due $1,400.00, by the end. Another actor is using Dana's token in parallel. My only action on it was call 6 (a no-op set_options with agentMayRelease). Please tell me who else is running on Dana's token so the reports don't mix.
2. Whether apply_scope_suggestion "suggestion all" on DP-1036 at 01:13:55 came from my token. I did not call it.
3. Whether g1 counts as "a scope suggestion that changes money" for the brief. See BLOCKER-1.
4. For release and confirm_checks I only saw state refusals (409), so I cannot say if the consent gate would hold on a real review job.
5. What "view" the early_pay signIn expects. The link opens to `/pro/jobs/<id>`, which the pro sees only after sign-in with their PIN.
6. Whether the 200 on set_options options is intended (ignore) or a bug.

## GAPS / next steps
- Need from you: a fresh onboarding link for Shady Fix-It (test), or a way to set its PIN and PayPal (shady.fixit@done-demo.example) on the website. With that I will run Part 2 in full: post the plumbing job at 78704, accept Shady's offer with Dana's personPin (noted in the report), then the evidence cases, the honest photo from `camera.mjs`, and release and confirm_checks against a job in review.
- Re-run rows 9 and 10 (release and confirm_checks) on a job in review.

VERDICT: 1 BLOCKER, 2 BUG, 3 CONFUSING (partial: Part 2 not run; see Blocked)
