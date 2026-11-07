# Jamie (renter, Austin 78751, phone width, no agent) - Done & Paid round 4

Own tab tab-19 on http://127.0.0.1:8810/. Mobile preset 375x812 for the customer flow and the first tour; desktop pane (about 727 px wide) for home, Models, back office. Viewport emulation reset to desktop. I never moved the platform clock; the banner moved by itself (see CONFUSING 11).

## What I did
1. Home (mobile). Clear headline and two buttons. "Post a job yourself" -> /post says "Sign in to post. In the demo a name is enough." with "Continue as a demo customer" and "Choose a name". I chose a name: Jamie, ZIP 78751, role "I need a job done" -> back on /post, signed in.
2. Typed "My kitchen sink is clogged and drains super slowly, and the landlord takes forever." Left budget empty. Work order in 0.1 s, labelled RULES: "Clear a clogged drain", 3 things to do, 5 done-conditions, ceiling $300 ("No budget given: the ceiling is a demo estimate"), window within 2 days, "No model is answering on this server right now, so the rules wrote this order."
3. Scope review suggested 2 additions (receipt for parts; note with TSBPE licence number). I added the receipt one (6 conditions). Posted: DP-1038 (job_fd0a88c50f).
4. Offers: none for about 60 s on the page; I had to reload (BUG 1). After reload 5 offers: Barton Creek $220, Eastside Pipe & Drain $195, Hill Country $255, Mueller $220, Lone Star Rooter $185 (lowest). Picked Eastside $195 (4.7 stars, 3.3 mi). Set "Hold with" to "PayPal (approve once)". Modal: "PayPal will hold $234.00: the price $195.00 plus $39.00 for change orders. It's an authorization, not a charge". Clicked Hold $234.00.
5. Page then showed "Approve the hold (simulated PayPal page)" (I was left scrolled mid-page, BUG 2). Simulated PayPal page: "Authorize (hold, not charge) $234.00 to Done & Paid, and save PayPal for later holds. Simulated PayPal: this server runs without sandbox keys. No money moves." Clicked "Agree and continue" -> job "Money held". Order MOCK-48609A43B305, auth AUTH-BAEDAF6863F1.
6. "Have the demo pro finish now" (confirm dialog, then "Finish now"). Page did not update by itself; after a reload (about 25 s later) status was "Your call". Timeline says work started 1:57:58 PM and submitted 2:08:11 PM: ten minutes of simulated time in about 20 real seconds, not explained.
7. Checks: "Code checks: 6 of 6 passed - no model verdict came back: rules only - 5 photo or note conditions need a person to confirm". I looked at the photos (synthetic, captioned DEMO PHOTO) and pressed "I've looked: the photos are right". No confirmation dialog. Result: captured $195.00 (CAP-8D96E5ADEE4D), $175.50 to pro, $19.50 platform fee, unused $39 released, payout batch PAYOUT-DE179F66ABC7. About 15 s later batch SUCCESS but item "UNCLAIMED". Rated 5 stars (the form disappeared; I did not verify it posted).
8. Judge tour (mobile: DP-1039; again at desktop: DP-1043): 8 steps, all worked. DP-1039: counter $170 -> met at $185, hold $200; change order, hold re-made $250.55; captured $232.05, $208.84 to pro, $23.21 fee, batch PAYOUT-1C3492EF4879. Step 8 offers "See it read-only (anonymised)" -> /demo/office.
9. Desktop: home, /models, /demo/office read.

## What each side ends up with (my job DP-1038)
- Jamie: held $234.00 (about 3 s after approve), charged $195.00, $39.00 released never captured. Nothing refunded.
- Pro (Eastside): $175.50 in one Payouts batch; item status SENT: UNCLAIMED.
- Platform: $19.50 fee (PayPal's fee to the platform shown: $7.30).
Time: post to offers about 60-90 s; accept to held about 20 s; finish-now to review about 20 s; release to payout sent instant.

## Asked my person for anything?
No.

## Findings

BUG 1 (job page, offers). Page says "new offers appear by themselves" but after about 60 s it still showed "Offers in / WAITING ON THE PRO / Send an offer" and no offers; a manual reload showed 5. Same after "finish now": unchanged until reload. I saw no live refresh anywhere on /jobs/<id>. A first-time phone user will think it is stuck.

BUG 2 (job page, scroll). After "Hold $234.00" the page kept the old scroll position (middle of the conditions list); the next required action ("Approve the hold in PayPal") is at the top. Same after Finish now.

BUG 3 (payout contradiction). Offer card says "paid to e******@done-demo.example (verified)" and the pro block says "PayPal verified", but the money panel says "There's no PayPal account with that email yet ... SENT: UNCLAIMED". Batch says SUCCESS while the item says UNCLAIMED. A customer cannot tell whether the pro got paid. Headline "Released: payout sent / WAITING ON THE PRO" adds to it.

BUG 4 (buffer copy). Copy says "buffer (20% of the price...)" but when the ceiling caps the hold the buffer is smaller: tour DP-1039 "$200.00 authorized: price $185.00; $15.00 is buffer (20% of the price...)" (15 is 8%). In my job, Hill Country "hold $300 (you pay $255)" is capped too, while the offers help says "Accepting holds the price plus 20%".

BUG 5 (receipt condition passes with no receipt). I added "Receipt for the replacement parts" and the demo pro sent none; the check says "No parts in the price and no change orders: no receipt is needed" -> PASSED conf 1.00. The scope review had said parts "will likely be bought, but no receipt is asked for". A condition I added is silently waived and counted in "6 of 6 passed".

BUG 6 (receipt OCR). Tour receipt line: "AU S T I N P L U M B I NG S U P P LY ... read by windows-ocr (zh-Hant-TW), confidence 0.8"; the card shows "APPROVED conf 0.75" under "decided by code". Wrong language pack in use, spaced text, two different confidences with no explanation.

BUG 7 (sign-in link). On /signin?next=/post the header "Sign in" link is /signin?next=%2Fsignin (destination lost). Minor.

CONFUSING 1 (status words). Right after posting: badge "Offers in" and "WAITING ON THE PRO - Send an offer" with zero offers.

CONFUSING 2 ("6 of 6 passed" vs "a person confirms"). The headline says all code checks passed, then 5 of 6 conditions say "CODE tick, a person confirms". What decided each check is only in small mono text ("needs_person: no VLM verdict (no VLM configured)"). Jargon: "VLM", "exif_time_ok", "time_gap_ok", "round 1 - m1 - 3.2 s", "signed verdict 9296443a49a2", "staff (expert queue)", "cleared photo". The plain sentence "No model looked at the photos, so you confirm them" is good but sits below the numbers.

CONFUSING 3 (two near-identical buttons). "Release $195.00 to the pro" and "I've looked: the photos are right" sit side by side. The second is the real "confirm" (explained only by a hover tooltip: "Counts as a pass: your review window and the inspector still apply"), which does not exist on a phone. Neither asks for confirmation before money moves.

CONFUSING 4 (photos). At phone width photos are about 170 px wide and captions are truncated mid-word ("Photo of the blocked drain or standing w", "pulled out of the drai"). Condition 1 ("blocked drain, BEFORE") shows a BEFORE and an AFTER label, and its AFTER image is the same "sink full of standing water, drain clogged" picture, which reads as if the work failed. Before photos stamped 1:57 PM but the pro "arrives 2:01 PM".

CONFUSING 5 (offer prices). Barton: call-out $75 + 1.5 h labor $142.50 = $217.50, price $220. Eastside $59 + $133.50 = $192.50, price $195. Mueller $69 + $148.50 = $217.50, price $220. $2.50 unexplained (Hill Country and Lone Star add up). The "Hold with" selector sits far above the offers; the confirm modal does not say which funding source was chosen.

CONFUSING 6 (funding choice). "PayPal sandbox test card" vs "PayPal (approve once)": a renter has no idea what a sandbox test card is, and the default is the one that is not the real flow. The simulated PayPal page is clearly labelled simulated (good) but never names the job, pro or price, only "$234.00 to Done & Paid".

CONFUSING 7 (tour copy vs numbers). Tour steps 4-5 and the home page say "+$45 change order ... inside the $75 limit"; the actual change order and receipt are $47.05 and the hold went to $250.55.

CONFUSING 8 (tour panel). On phone the panel covers about a third of the screen; the body is hidden behind "More". The step-1 intro on desktop is very clear about what is canned and real. On the narrow desktop pane the step-8 panel hides the page it points to, and after "See it read-only" the panel still says step 8 with the same button, as if nothing happened.

CONFUSING 9 (back office). /demo/office has no menu link; only tour step 8 leads there (/staff and other guesses show "Nothing at this address"). It says "customers are not named" but shows ZIP, exact titles and prices (my job DP-1038, 78751, Eastside, $195). "Checked by: rules" is shown for jobs a customer confirmed by hand (DP-1038), contradicting "photos: a person confirms". The expert queue shows two items "overdue" (Oct 12, Nov 3) next to a 4-hour SLA claim. "Due" and "Captured" columns mostly repeat. Cards: JOBS 43 / HELD NOW $2,360.25 / CAPTURED $4,746.15 / PAID TO PROS $4,181.52 / PLATFORM FEES $464.63 / REFUNDED $100.00, with no definitions.

CONFUSING 10 (Models page). Honest and detailed, good. But "Done-Audit: configured yes ... did not answer (fetch failed)" prints a local URL (http://127.0.0.1:11471) and env var names (DONE_MODEL_URL) to judges. Row "Rules with the fail-safe (as the app runs)" shows accuracy "-" and 0/22 and 0/6 under "False release" and "Attacks passed"; a reader may take "0/6 attacks passed" as bad. Unexplained: "false release", "fail-safe", "dHash", "Glimmer 30B stand-in".

CONFUSING 11 (demo clock banner). "Demo clock: 1 hours ahead of real time (Nov 4, 2:41 PM in Austin); last moved 0 hours by demo tour: the pro's visit on DP-1043 takes 13 minutes (timed photos)". Earlier the same banner said "0 hours ahead". It says "1 hours ahead" and "moved 0 hours" together. The system date is Nov 5 but the platform shows Nov 4 with no hint.

MINOR. Budget box placeholder "$ 200" while the draft ceiling is $300. The floating "DEMO" badge covers text at bottom right on every phone page. After rating, the form vanished with no visible thanks. Both job_fd0a88c50f and DP-1038 identifiers appear.

## Is it clear?
- What happens to my money: yes, very good at each step ("an authorization, not a charge", "$39.00 released, never captured", fee 10% shown, "Adds up to the capture: yes, to the cent"). Weak: UNCLAIMED payout, buffer-20% copy, no confirmation before release.
- What is simulated: yes on the PayPal page, footer, ids tagged "SIMULATED PAYPAL - stand-in ids", "synthetic" photos, "demo pro - agent run by us". Weak: "sandbox test card" default.
- What decided each check: stated (CODE tick / "a person confirms" / "decided by code") but in jargon, and "6 of 6 passed" over-promises.

## Unclear (things I had to guess)
- Whether empty budget meant "no limit" ($300 in the order, $200 in the box).
- Whether the receipt condition I added would be enforced (it was not).
- Whether "Release" or "I've looked" was the right button; I picked "I've looked".
- Whether "sandbox test card" was the same flow as PayPal; I chose PayPal.
- Whether the page was stuck or just not refreshing (waited about 60 s before reloading).
- Why ten minutes passed on the timeline in 20 seconds.
- Whether the rating posted.
- Whether "UNCLAIMED" means the pro got paid.
- What "Checked by: rules" means for a job a person confirmed.
- Demo staff sign-in not tried (scope was the read-only view).

VERDICT: 0 BLOCKER, 7 BUG, 11 CONFUSING
