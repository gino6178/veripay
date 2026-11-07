# Maria's agent, Done round 2 (job DP-1035 / job_0d1e1e7d91)

Transport: MCP (Streamable HTTP, SDK) worked for every call; no REST fallback. Platform clock not moved. Platform time 2026-11-04.

## Steps
1. whoami / my_limits: perJob $500, month $1,500, changeMax $75, buffer 20%, agentMayRelease=false, agentMayCancel=true. savedPayment = null.
2. post_job (17:50:06Z, text as Maria said, zip 78702, budget 200): status offered at once; scope written by rules in 11 ms: "Fix a leaking faucet", 5 done-conditions (before photo, new part photo, no-drip photo, parts receipt, work note), ceiling $200, window Nov 4 18:00Z to Nov 8 02:00Z (covers "this week"). Licence needed (TSBPE); suggested extra check "licence number note" was NOT added automatically (addChecks empty).
3. Offers: Barton Creek $220 (17:51:06), Eastside Pipe & Drain $195 (17:51:18), Hill Country $255 (17:51:30), later Mueller $220 and Lone Star Rooter $195. First offer came 60 s after posting. Only $195 offers fit the $200 budget.
4. counter_offer Eastside $175 (17:51:34): the pro agent accepted instantly ("We can do $175.00").
5. accept_offer (17:51:56) with no payWith: status held. Hold $200 = price $175 + buffer $25 (20% would be $35, capped to the $200 ceiling). payWith came back "card", PayPal order MOCK-308571B9F2CF, authorization AUTH-90DECE28C5EE, approveUrl null, honor until Nov 7 17:51Z, expires Dec 3. Nothing captured.
6. Pro started 17:53:33 (3 before photos), submitted 5 evidence items 17:55:10 (worked about 1m40s per the server clock), checks done 17:55:19 (9 s).
7. Result: all 5 checks "pass" but status = review, waiting on the customer ("some need a person to confirm"; expert queue SLA 4 h). Photo checks: confidence 0.3, "no VLM verdict; a person confirms". Receipt: $47.05 (Austin Plumbing Supply, 1/4 turn stop valve + cartridge), OCR garbled (zh-Hant-TW), confidence 0.57, APPROVED. Work note: replaced Moen 1225 cartridge and corroded shut-off valve, ran water 10 min.
8. I waited about 3 more minutes with wait_for_news: no change. I stopped there.

## Money now
Held (authorized, not charged): $200.00. Captured: $0. Paid out: $0. Refunded: $0. my_limits shows spentThisMonth $175.00 (the price, though nothing is captured yet).
Maria has paid nothing so far. If released: captures $175 (buffer $25 released), fee 10% = $17.50, pro gets $157.50 (no helper).
Time from posting to pro paid: NOT PAID YET. Posting 17:50:06 to review 17:55:19 = 5 min 13 s.

## What I need from Maria
I could not and did not release: agentMayRelease=false, and I cannot see the photos (see findings). I did not try release or confirm_checks. Ask for Maria: "The plumber says the faucet cartridge and the shut-off valve were replaced, parts receipt $47.05 (included in the $175 price). Is the faucet no longer dripping? Please look at the 3 after photos (website) and, if happy, press Confirm/Release so he is paid $175; otherwise ask for a fix." Also: the pro also replaced the shut-off valve, which was not in the scope; she should know it was done at no extra charge.
I could not act as Maria on the website: POST /api/auth/demo {"as":"customer"} creates a different person (Morgan Diaz), not Maria, so I did not.

## Findings
- CONFUSING/BUG: all five checks "pass" yet the job sits in review. Photos get confidence 0.3 only because no VLM is configured (modelReason: DONE_MODEL_URL unset); reason text "no VLM verdict; a person confirms". With no model, no demo job can ever auto-pay; an agent without release rights is stuck until the person acts. job_status.next says "look at the evidence and release, or ask for a fix", which an agent without the right can't do.
- BUG: the check "photo ... at least 10 minutes after the repair" is not enforced. Photos EXIF 11:55:05, :08, :10 (-06:00), all within 5 s, and the pro started at 17:53:33Z, so 10 min after the repair is impossible; the note still claims 10 minutes. Rules text for no_drip is only photo>=1;in_window;near_job;not_reused.
- BUG/CONFUSING: Evidence labels look wrong: ev_701da5f76b (check "before") is labelled "wide shot showing the room" but named valve-worn.jpg and phase "after"; before photos from start_work show phase after? (not verified further).
- BUG: GET /api/jobs/job_0d1e1e7d91/evidence/ev_... with the agent bearer token returns 404 and no agent tool returns photo content, so the customer's agent cannot look at the evidence it is told to look at (only a signed-in website user can, if at all).
- CONFUSING: accept_offer with no payWith and savedPayment=null did not fail; it silently used payWith "card" (the sandbox test card) and held $200. whoami says savedPayment null. A real customer would be surprised.
- CONFUSING: my_limits spentThisMonth shows $175.00 right after the hold, before anything is captured.
- CONFUSING: scope suggests a licence-number note check (suggestChecks) but doesn't add it, and the scope review event says only "TSBPE-licensed plumber is needed". No unfair condition in the scope otherwise; the receipt must match approved change orders ($47.05 receipt vs $0 parts in the price: the check said "within the allowance").
- MINOR: counter-offer response is the whole job (about 600 lines); offers/thread are huge for an agent. wait_for_news "after" returns old events/jobs block each time.
- MINOR: the first wait_for_news after the pro accepted my counter returned instantly and showed offers from two more pros (Mueller, Lone Star) that list_offers had not yet shown; offers arrive up to ~2 min.

## Unclear
- Whether release or confirm_checks would have been refused for me (not tried on purpose).
- Whether payWith:"card" with no saved method is intended.
- Whether the expert queue (SLA 4 h) ever acts without moving the clock.
- Whether spentThisMonth should include an uncaptured hold.
- Where the person confirms on the website (no URL was given in any answer).
- The phase/label on the before photos.

VERDICT: 0 BLOCKER, 3 BUG, 4 CONFUSING
