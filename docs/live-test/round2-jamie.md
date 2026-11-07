# Jamie (renter, 78751, phone 375x812, built-in browser)

## What I did (platform clock Nov 4 2026, Austin time)
1. Opened localhost:8810. The shared browser profile already held a pro session (Shady Fix-It, then Rosa Delgado) from other testers, and another agent was driving tabs in the same pane. Several of my clicks were overwritten. I switched to http://127.0.0.1:8810 (separate cookie jar), signed out of a leftover demo customer (Riley Chen), and signed in as "Jamie", ZIP 78751 (person p_2d9cbe7a7b).
2. Posted: "My kitchen sink is clogged and drains super slowly, and the landlord takes forever." Budget $250. The rules wrote the order in 0.1 s: 3 to-dos and 4 conditions (before photo, draining photo, cleanup photo, work note). I added the two suggested conditions (parts receipt, TSBPE licence note). Job DP-1039, "Clear a clogged drain", window Nov 4 to Nov 6.
3. Offers: first offer after about 40 s, five in about 2 minutes (Lone Star $185, Eastside $195, Barton Creek $220, Mueller $220, Hill Country $255, which would have raised my ceiling). I chose "PayPal (approve once)", accepted Eastside $195, and the page asked me to approve a $234.00 hold (195 + 20%).
4. The simulated PayPal page said "Authorize (hold, not charge) $234.00 to Done & Paid... Simulated PayPal: No money moves". I clicked Agree and continue. The job became "Money held".
5. I clicked "Have the demo pro finish now". In 12 s: photos, receipt and note were checked. Result was "Your call": "6 of 6 passed code checks; 6 need a person". I released $195.00 myself.
6. Result: Paid Nov 4 11:59 AM. Captured $195.00 from the $234.00 authorization. $175.50 to the pro, $19.50 fee (10%), $39 buffer released. PayPal's own fee to the platform: $7.30. Ids: order MOCK-34F0A80D7356, auth AUTH-F33C0EEE24A0, capture CAP-5DCE594B5B02, batch PAYOUT-7C6724013321 (PENDING). Warranty until 2026-11-18.
7. Judge tour (8 steps, job DP-1040, "Fix a leaking faucet" at 1400 S Congress): offers, agent counters $185 and holds, pro starts, +$45 change order approved by agent, evidence sent, a receipt FAILED ($47.05 vs $45.00 approved), "release as customer", paid $230 captured of $248.50 hold, $207 to pro, $23 fee, then a read-only back office (/demo/office). I did not move the clock.

I did not have to ask my person for anything.

## What each side ends up with
- Me: $195.00 charged (never the $234 hold). Pro (demo, Eastside): $175.50 by Payouts batch (PENDING). Platform: $19.50.
- Time per step: post to order 0.1 s; first offer about 40 s; demo finish about 12 s to the verdict.

## Screenshots
Taken in the pane at: home with tour card, sign-in, post page, work order, offers, PayPal approval page, "Money held", check results (photos), Paid page, tour steps 1 to 8, back office. Not saved to disk.

## Findings
BUG
1. Wrong evidence for my job. The demo pro's note says "Replaced the worn Moen 1225 cartridge and the corroded quarter-turn shut-off valve... no drips under the sink". Photos are synthetic "corroded shut-off valve, weeping". The receipt is a parts receipt. My job is a clogged drain. The same note was accepted for both "what caused the clog" and "licence number" (c6). A licence note with no licence number passed code. A skeptical judge sees the checks pass on evidence that has nothing to do with the job. (Page /jobs/job_840047fe51.)
2. Check labels contradict. My job says "checked by RULES / no VLM configured" while the home page says "MODEL ON" and the tour job says "checked by MODEL" but "no model verdict came back". The same page also says "Decision: A person decides" next to "DECIDED BY CODE". Verdict text mixes "no VLM verdict (no VLM configured)" and "(model unavailable or too slow)".
3. Hold amounts do not match the rule. Tour step 2: "PayPal now holds $200.00: the price plus 20%" (185 + 20% = 222). Later "$248.50 hold" with no explanation. The page text on my own job was right ($234.00 = 195 + 20%).
4. Shared browser state: signing in on localhost silently kept a stale pro session; sign-in on 127.0.0.1 while another customer session existed gave me that account's page (Riley Chen, zip 78704) rather than my entered name and ZIP; the form appears to ignore typed values if programmatically set (ZIP field is prefilled with 78704, not a placeholder). Likely a test-rig effect, but a signed-in user visiting Sign in is not told they are already signed in.

CONFUSING
1. Conditions show raw ids ("before", "draining", "cleanup", "work_note", "c5", "c6") under each title.
2. Status says "Offers in / Waiting on the pro / Send an offer" with zero offers, then "Pick an offer ... answer over the next minutes" stays while offers are listed far below the whole contract (about 2,600 px on a phone). No jump link.
3. Offer list re-sorts as new offers arrive. My first Accept tap landed on nothing/another card because the card moved. One selector change applied to every card. Risky on money buttons.
4. Photo checklist says "8 shots" but each condition says "at least 1 photo" / "2 to 6 shots". Scope review still says "1 worth fixing: licence note" after I added it and after the order was agreed, and says "settle a gap in the messages" with no message box visible.
5. "Before" condition shows an "AFTER" label ("AFTER wide shot showing the room"). A receipt is labelled "AFTER". Receipt read by "windows-ocr (zh-Hant-TW)" for an English receipt.
6. "Release $195 to the pro / I've looked: the photos are right" is the only primary action; the page does not say the photos here are synthetic or that a staff expert is also looking until you read the box. "6 of 6 passed code checks; 6 need a person" is two opposite numbers in one sentence.
7. Paid banner says "PAID" while payout batch and item are "PENDING". Say "sent to PayPal".
8. Tour receipt failure ($47.05 vs $45.00) is scripted but presented as a real rule; no tax allowance is explained. Tour hold amounts jump ($185 offer, $200 hold, $248.50 hold).
9. Duplicate controls: "Approve the hold" link and "Have the demo pro finish now" each appear twice in the DOM.

MINOR
- Judge tour card covers about 40% of a phone screen over the content it points at; step 8 text is clipped ("your customer sign-in stays" cut off) with no scroll.
- Sign-in page defaults to a ZIP of 78704.
- Mobile layout otherwise fine; no horizontal scroll seen.
- Simulated PayPal page does not show the pro or job id, only "Done & Paid".

## Clear and good
Plain money lines: "Nothing is charged", "unused part of the hold was released, never captured", "adds up to the cent: yes", simulated ids labelled "SIMULATED PAYPAL · stand-in ids".

## Unclear (guessed)
- Whether "PayPal (approve once)" or "sandbox test card" is the intended path; I picked PayPal.
- Whether a person (staff) actually reviews within 4 business hours in this demo.
- Why hold was $234 on mine and $200/$248.50 on the tour job.
- Whether "Master Plumber M-39021" satisfies the TSBPE licence condition.
- Which browser account state I was in at first (shared profile).

VERDICT: 0 BLOCKER, 4 BUG, 9 CONFUSING
