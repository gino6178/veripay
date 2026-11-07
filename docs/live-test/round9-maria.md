# Done round 9: Maria Lopez agent report

Task: "The bathroom sink faucet in my house at 78702 drips all night. Get someone out this week, under $200, and don't pay until it's fixed."
Channel: MCP (Streamable HTTP, @modelcontextprotocol/sdk 1.32.2) for all customer tools. REST only for the steps MCP does not expose: the PayPal approve form, the person sign-in, hold/confirm, demo-finish and evidence download. Roughly 40 tool calls.

Result: NOT paid. Job DP-1037 (job_c0eac1de89) is in status `review`. $199.00 is held. Four done-conditions passed on the model check but at low confidence, so they wait for Maria to confirm. I did not confirm them (reason below). Nothing captured, no payout.

## What I did, step by step

1. `whoami`, `my_limits` (MCP): Maria, zip 78702, scopes read/hire/pay. Limits: per job $500, monthly $1,500, change order max $75, buffer 20%, agentMayRelease false, agentMayCancel true. savedPayment: null.
2. `post_job` (MCP, budget $199.00, zip 78702, view full): job_c0eac1de89, DP-1037, status `offered`. Scope "Fix a leaking faucet", trade plumbing. Four conditions: before (photo, 2 to 6 shots), new_part (photo), no_drip (photo, at least 10 min after new_part), work_note (note, at least 8 words). Ceiling $199.00. Window to 2026-11-09T03:00Z. Code note: a TSBPE-licensed plumber is needed.
3. `wait_for_news` then `list_offers`. Offers arrived within about 2 minutes: Luis Ortega Plumbing (test) $120.00 (licence NOT verified), Barton Creek Plumbing (demo) $220.00 (over ceiling, licensed and insured), then Eastside Pipe & Drain $195, Hill Country Leak Pros $255 (over ceiling), Mueller $220 (over ceiling), Lone Star Rooter $195 and others.
4. `counter_offer` (MCP) on Barton Creek ofr_ff55bfa3a3 to $199.00 (its ceiling-compliant price). Barton Creek's agent accepted the counter within about 15 seconds. The choice was mine: Barton Creek is fully verified (PayPal, licence M-90417, insurance $1M). Eastside and Lone Star at $195 were cheaper and were not acceptable-blocked; I did not compare their licence and insurance.
5. `accept_offer` (MCP, payWith saved). Status `agreed`. Hold `pending_approval`. Because there is no saved payment method, the server returned approveUrl /mock-paypal/approve?token=MOCK-75D8642281DE. Per the brief I acted as Maria on the PayPal approve page: POST a=yes. The page named Maria as the hiring account. Result: 302 to /paypal/return?job=job_c0eac1de89. Hold still `pending_approval`.
6. `POST /api/jobs/job_c0eac1de89/hold/confirm` with Maria's agent token: `{"error":"signin","message":"Sign in first."}`. The approval was not enough on its own.
7. Maria's sign-in. There was no askPerson link for this step, and `job_status` showed no link either. I used `POST /api/auth/demo` with `{"as":"customer","personId":"p_139cb99e52","pin":"<pin>"}` (her PIN from her token file, used only for this person step). Session established.
8. `POST /api/jobs/job_c0eac1de89/hold/confirm` with Maria's session: status `held`. Money: $199.00 authorized (held, not charged). Buffer $0.00 (capped by the ceiling). Authorization AUTH-B962D5B0EFBC (from the event log). Event 479 said Barton Creek "can start".
9. `wait_for_news` polls. Barton Creek "started work, with 3 before photos" (event 482). Then no change for about 14 minutes (pro sat at "send the evidence and submit").
10. At the 8-minute mark (no movement since event 482) I used `POST /api/jobs/job_c0eac1de89/demo-finish` as Maria. Status stayed `working` for that call. I then called demo-finish a second time by mistake, in the recheck step. The second response also said `working`. Within about two minutes the pro sent 4 evidence items (event 526 region), then "4/4 done-conditions passed (model+vlm): the customer decides", status `review`.
11. `job_status` (full) and `job_evidence`: each condition is `pass` with `needsPerson: true`. Confidence was 0.3 for before, new_part and no_drip, and 0.53 for work_note. Reasons: "photo's description doesn't name this job's fixture or problem", "photo's description doesn't say it is mounted, installed or connected", "doesn't name the faucet", "confidence 0.53 under 0.6".
12. I downloaded the six photos as Maria and looked at each. Decision below.

## Decisions made as Maria (each noted)

- Hold approval (PayPal approve page, $199.00, Barton Creek hire): APPROVED by Maria. Hold confirmed by Maria's session after sign-in.
- Barton Creek counter to $199.00: decided by me (agent), within her $199 budget. Maria's personal choice was not asked.
- Confirm checks (before, new_part, no_drip, work_note): NOT confirmed. Reasoning:
  - before (ev_488bdf86ce, ev_b874d44fae, ev_d512324e77; the three "before" shots): each shows a corroded, weeping shut-off valve. Plausibly the leak source, but the scope asked for the faucet or the worn part. Reasonable, but not clearly the faucet.
  - new_part (ev_27bff85917): under the sink, a pipe and a white item. No installed cartridge, washer or O-ring visible. Does not show the new part installed. Maria would not confirm this one on what I can see.
  - no_drip (ev_d785097391): under the sink, dry, labelled "water on 10 min, dry". Matches the condition's wording, though the shot is under the sink, not the faucet itself.
  - work_note (ev_65f7c9dd91): text reads "Part replaced: the worn Moen 1225 cartridge. Ran the water 10 minutes after the repair: no drips under the sink." Clear and specific; the note is fine.
  - Why not confirmed: confirm_checks confirms the whole milestone at once (no per-check selection), so I could not approve the three photos that match and leave new_part open. Maria has not been asked; this is the decision for her.
- Release, fix request, dispute: not taken. The agent may not release (agentMayRelease false), and the brief does not ask for these.

## Money and timing

- Held: $199.00 (AUTH-B962D5B0EFBC), not captured.
- Captured: $0.00. Refunded: $0.00. Payout: null (job still in review).
- Would pay: Barton Creek Plumbing (demo) $199.00 (less the 10% fee), with helper Marco Ruiz (apprentice) at 20% share, once confirmed or released.
- Timing (approximate, from my polls and the server's event times): post to offers about 2 min; counter to accept about 15 s; accept to approval about 2 min; hold confirmed about 3 min after approval (after sign-in); pro started about 3 min after hold; pro then sat about 14 min before evidence; demo-finish got evidence in about 2 min; checks done in about 1 min. Total to review about 35 min (demo clock). The 25-minute budget was reached before payment, and I stopped there.

## Findings

- BLOCKER: Hold approval does not finish on its own for an agent-driven customer. The PayPal approve POST (a=yes) returned 302 to /paypal/return but left the hold `pending_approval`. Confirming the hold needs a signed-in customer session, and the server gave no askPerson link for it. Request: `POST /api/jobs/job_c0eac1de89/hold/confirm` with the agent token. Response: `{"error":"signin","message":"Sign in first."}`. I could only get past it by signing Maria in with her PIN through POST /api/auth/demo.
- BUG: Luis Ortega Plumbing (test) offer ofr_d7c080a0ba was `hireable: true` and `acceptable: true` while its licence was "not verified" and the scope says a TSBPE-licensed plumber is required. A customer could accept an unlicensed-verified pro at $120 from the list.
- BUG: The checks passed by the model but at confidence 0.3 to 0.53 for photos that do not clearly match their conditions (a valve shown for a faucet cartridge; no installed part visible). The verdict "pass" is shown with needsPerson, so this is safe only because a person must confirm. Still, the wording "pass" next to a reason that says the photo does not show the subject is confusing.
- CONFUSING: job_status returned `next: "...show them askPerson (from job_status)..."`, but job_status had no askPerson field for the confirmation step.
- CONFUSING: `POST /api/auth/demo {"as":"customer"}` with no personId created a NEW demo customer, "Demo · Jordan Avery" (p_34d166fb9c), with its own PIN shown once. It did not sign me in as Maria. I did not use that account for the job. Side effect: an extra demo person exists on this server. Maria's sign-in needed personId + pin in the same call; neither is documented in llms.txt.
- CONFUSING: The demo clock is shared with other testers. Jamie's "finish now" moved the clock from about +28 min to +415 min mid-job (to the 14:00Z window). The after photos are EXIF-dated 14:11 to 14:24, while the before photos are 07:41. My demo-finish calls did not appear in the clock log at all.
- CONFUSING: demo-finish returned status `working` both times, with no visible change. The change came about 2 minutes later, after the pro's own upload. I cannot tell from the response whether my call did anything.
- CONFUSING: I called demo-finish twice (once intended, once by mistake in a recheck). Both calls returned `working`.
- CONFUSING: The offers' pricing: Eastside and Lone Star at $195 were cheaper than the $199 I accepted. The brief asked for a fair one; I picked the verified pro over the cheapest. No tool shows a "best value" comparison.
- MINOR: The note evidence downloads as a 0-byte .jpg via the evidence URL. Text notes need the job_evidence `text` field instead.
- MINOR: The brief's "wait_for_news" returns the same job summary repeatedly while in review ("customer decides") with no new events; fine, but noisy.

## Unclear

- Whether a customer's agent may approve the PayPal hold page with a bare POST (I did; it worked, but only the hold confirm, which needs a session, completed it).
- Whether the demo-finish call reached the pro's work or only accelerated the clock (the response does not say).
- Whether "confirm" is allowed to approve a subset of checks, or only the whole milestone (the tool description suggests the whole milestone).
- Whether Barton Creek's $199 counter is final, or whether the server would have shown Eastside at $195 as a better offer.
- Whether the Luis offer's "hireable: true" with unverified licence is intended for a demo pro.
- What "approve the hold" means in a stand-in PayPal: the page says "save PayPal for later holds"; I did not check whether that saved a payment method on Maria's account.
- Event timestamps: `at` is demo time, `realAt` is a different clock. I used `at` in the timing estimate above.

VERDICT: 1 BLOCKER, 1 BUG, 6 CONFUSING
