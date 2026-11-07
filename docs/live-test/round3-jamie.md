# Jamie (renter, 78751, phone width) - Done & Paid round 3

Browser: own tab (tab-16), 375x812, then desktop (pane was ~727px wide). Platform clock not touched. Platform time ~Nov 4 1:06 PM.

## What I did
1. Home (mobile): copy says "Tell your agent..." but Jamie has no agent. "Start a job" leads to /post.
2. /post: "Continue as a demo customer" or "Choose a name". Chose name Jamie + ZIP 78751 (roles: I need a job done / I'm a pro / Inspector).
3. Typed the sink sentence, left budget blank. Rules wrote DP-1038 "Clear a clogged drain", plumbing, 5 conditions (4 photos + 1 note), ceiling $300 (demo estimate), window Nov 4-6, hold 20%, "no model is answering, rules wrote this order". Scope review: 2 "worth fixing" (no parts receipt asked; TSBPE licence note); I did not add them. Posted (job_2a3d6be9bc).
4. Offers: 4 arrived 1:07:46-1:08:22 (~1.5 min), a 5th ($185 Lone Star Rooter) shortly after. $220, $195, $255, $220, $185. The page did not visibly refresh until I used the "See the N offers" link.
5. Chose hold method "PayPal (approve once)", accepted $185 (Lone Star Rooter, helper Jesse Ortiz 15%). A native browser confirm() ("PayPal will hold up to $222.00 ...") appeared; the automation suppressed it (returned false), so my first clicks did nothing; I then auto-accepted it.
6. Simulated PayPal page: "Authorize (hold, not charge) $222.00 to Done & Paid, and save PayPal for later holds. Simulated PayPal: no sandbox keys. No money moves." Clicked Agree and continue.
7. Job page: "Money held, waiting for the pro", pro arrives Nov 5 1:08 AM. Used "Have the demo pro finish now" (another confirm()). Then "Your call": code checks 5/5, rules only, no model verdict, 5 conditions "a person confirms"; round 1 m1 4.2 s, signed verdict.
8. Photos: could not view them visually (pane hidden, lazy images; files serve 200 image/jpeg). Read metadata. Clicked "Release $185.00 to the pro / I've looked: the photos are right" at 1:12 PM.
9. Result: Paid. Hold $222.00 (AUTH-C03889AD408B); captured $185.00 (CAP-53C1E6BAF7D1); platform fee 10% $18.50; pro $141.52 + helper $24.98 = $166.50 (PAYOUT-4AA863F9510D, items PENDING); unused $37 released, never charged; PayPal fee (platform cost) $6.95; warranty until Nov 18. Order MOCK-D1A813C8C07E. Math checks out to the cent.
10. Judge tour (8 steps, canned faucet job DP-1039): scope, hire, +$45 change order, approve (hold grew to $250.55, old one replaced), evidence, check, one condition ("before") failed -> customer releases anyway, captured $232.05, $208.84 pro, $23.21 fee, PAYOUT-65795C6E10FE; step 8 back office. No clock moves.
11. Desktop: home, /models, /demo/office (read-only anonymised): 39 jobs, $1,846.00 held, $4,797.05 captured, $4,185.58 paid to pros, $469.71 fees, $100 refunded.

Jamie ends with: $185 captured of a $222 hold, $37 never charged. Pro and helper paid in one batch (pending). I asked my person for nothing.

## Findings
- BUG (evidence on DP-1038): AFTER photos stamped 12:34:35, 12:46:37, 12:58:40 PM, i.e. before the job was posted (1:06 PM) and before the pro was accepted, yet "exif_time_ok" passed and "time_gap_ok" ok. The BEFORE photos are stamped 1:10:24-31 PM, after the AFTER shots. "Taken during the job" shows as passing for photos that predate the job.
- CONFUSING (job page, release state): "Your call: Confirm, release, ask for a fix or dispute", "staff (expert queue)", "An expert at Done & Paid is also looking (answer within 4 business hours). You can decide first." Not said: what happens if I wait, or if the expert decides differently; nor that money is still only held at that moment. "CODE ✓ 5/5" next to five "A PERSON CONFIRMS" badges reads contradictory.
- CONFUSING (home and /post): everything addresses "your agent" (hero, "Connect your agent" nav, "Let your agent negotiate", "demo customer agent"). A person with no agent has to guess that the human path exists.
- CONFUSING (offers panel): "Let your agent negotiate / Negotiate and hire" is the biggest control above the offers on mobile; unclear it is a demo auto-buy that counters at ~88%. Offers trickle in: a 5th appeared and the list changed while I was clicking; no "more may come" counter near the accept buttons. The page did not repaint by itself.
- CONFUSING (accept): the money consent is a native confirm() ("PayPal will hold up to $222.00...") - suppressed in embedded browsers, easy to dismiss on a phone. Same for "finish now". Put it in the page. Button says "Accept $185.00 and hold" while PayPal page says $222.00; say "Hold $222.00 (you pay $185.00)".
- CONFUSING (offer arrival): cheapest offer "arrives Nov 5, 1:08 AM"; a 1 AM arrival is not flagged. Another "arrives Nov 4, 3:08 PM".
- CONFUSING (scope review after accept): "Nothing blocks the work; 2 worth fixing" persists on the job page with suggested conditions, but the order is locked ("can't be rewritten now"): unactionable noise. Work order labelled "EDITED BY THE CUSTOMER" though I edited nothing.
- CONFUSING (status while waiting for offers): header "WAITING ON THE PRO / Send an offer" is shown to the customer.
- CONFUSING (tour step 6): "The rules won't release money over a failed condition", then the tour releases it anyway as customer. Needs a line that a customer may override. Step bodies hidden behind "More".
- CONFUSING (/demo/office): "Checked by" column says only "rules" even when a person released the money (DP-1038 was "released by the customer, after looking"); answers "what decided the check" with rules while the decision was a person. Expert queue: DP-1008 overdue since Oct 12, DP-1034 since Nov 3, unexplained. Totals do not reconcile on screen: captured $4,797.05 - refunded $100 - paid $4,185.58 - fees $469.71 leaves ~$41.76 unexplained.
- MINOR (/demo/office anonymised view): names hidden but ZIP and job title shown, so my own job (78751) is identifiable.
- MINOR (/models): EXIF, dHash, OCR, VLM, "false release", 95% intervals unexplained to a lay judge. Home strip says "Done-Audit: served" while my check said "no model verdict", so a judge may think the model decided.
- MINOR (simulated PayPal): clearly labelled, but payout items stay PENDING and never reach SUCCESS in the demo; the "Paid" pill wording is honest about it.
- MINOR (mobile): the "DEMO" badge floats over content at bottom right.

## Unclear
- Whether the "$300 ceiling" with no budget given should have been asked about.
- What "4.2 s" and "signed verdict 8b1541d2d507..." mean to a customer.
- Whether the expert queue would override my release or race it.
- Why every condition has a BEFORE photo that is the same before.jpg.
- What happens to the helper share if the helper's payout fails.
- A tab of mine was navigated mid-test to another job on localhost:8810 (probably another agent); I returned to my job.
- Hold expiry ("past 3 days reauthorized; can't outlive 29") is never explained from the customer's seat.

VERDICT: 0 BLOCKER, 1 BUG, 9 CONFUSING
