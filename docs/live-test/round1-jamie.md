# Jamie (renter, phone 375px, browser UI only) - Done round 1

Platform clock at start: 2026-11-04 17:17Z (11:17 AM Austin). Own tab, mobile preset, reset to desktop at the end.

## What I did
1. Landing page. Understood within ~20 s: "agent writes what done means, PayPal holds money, pays pro when conditions pass". I have no agent, so "Tell your agent..." read as not for me; the "Start a job" button saved it.
2. /post -> typed nothing, page hides the textbox until sign-in. "Continue as a demo customer" / "Choose a name" -> typed Jamie. Account created as ZIP 78704 (I live in 78751).
3. Wrote the sentence, set ZIP 78751, left budget blank. "Write the work order" -> 0.4 s, source RULES: 3 to-dos, 4 conditions (before / draining / cleanup photos + work_note), ceiling $300 ("demo estimate"), window within 2 days.
4. Posted -> DP-1038 (job_0aacd50add): 5 demo offers $185 / $195 / $220 / $220 / $255 plus a 6th from "Luis Ortega Plumbing (test)" (another tester's real agent) at $195. After that 6th offer arrived the job page white-screened (BUG 1).
5. Posted again with "$250 max" -> DP-1040 (job_32c07462ad), 5 offers. Chose "PayPal (approve once)" and accepted Eastside Pipe & Drain $195 (4.7 stars, 3.3 mi). Others auto-marked "declined".
6. "Agreed: hold pending", "Approve the hold" -> simulated PayPal page (clearly says "Simulated PayPal: this server runs without sandbox keys. No money moves.", authorize $234.00) -> "Agree and continue" -> back on job, status Money held. Authorization AUTH-0055971B639A, order MOCK-238C2F0419C5, guaranteed until Nov 7 11:20, expires Dec 3. Timeline: 11:19:53 scoped/offered, 11:20:17 agreed, 11:20:46 held.
7. Waited ~35 s then via panel the clock was already Nov 5 01:32Z (about 8 h later; the tour moved it, see CONFUSING 8). Job stayed "Money held - The pro starts work." No pro action ever came by itself. I as customer had only "Cancel and void the hold".
8. Judge tour (8 steps, ~1 min by clicking; it makes its own job): order+5 offers, counter $185 accepted, hold $222.00, +$45 change order approved, evidence sent, "Code passed - a person confirms", release as customer, "Captured $230.00 of the $248.50 hold, $207.00 to the pro, $23.00 platform fee, payout batch PAYOUT-A78BA5C64843", ends at the Back office.
9. To push my own job I used the demo panel "Sign in as a demo pro" -> Eastside; /pro lists DP-1040; "I'm on site: start the work" -> status Work under way. Evidence needs real camera JPEGs (EXIF), which a visitor cannot supply, so I stopped there.

## What each side ends up with (my job DP-1040)
- Customer (Jamie): $234.00 authorized (price $195 + 20% buffer $39), nothing captured, nothing paid out, nothing refunded. Can still void.
- Pro Eastside: nothing yet; promised $195 less 10% fee on capture (not shown to me before accepting for my own job; shown only in the tour).
- Tour job (DP-1042 or similar): captured $230.00 of $248.50 hold, $207.00 to pro, $23.00 fee, rest released.
Timings: work order 0.4 s; offers instant (same second); hold approval ~30 s of my clicking.

## Did I need to ask my person for anything? No.

## Findings
### BUG 1 (BLOCKER for a real user): job page crashes to a blank screen when any offer has no price breakdown
Job DP-1038 (job_0aacd50add) after "Luis Ortega Plumbing (test)" offered $195: GET /api/jobs/job_0aacd50add returns that offer with `breakdown: null`. Console: `Uncaught TypeError: Cannot read properties of null (reading 'callout')` at index-BjvEMgeg.js:61 inside the offers `.map`. Whole #root renders empty, even after reload, no error message. The customer cannot see, accept or even cancel that job. Any outside agent that posts an offer without a breakdown kills the customer's page. Fix: null-guard breakdown in the offer card, and validate offers server side.

### BUG 2: customer can open the staff back office
Signed in as demo customer Jamie (GET /api/me role "customer"), the tour's last step navigated to /office and rendered "STAFF / BACK OFFICE" with every job, hold, payout (42 jobs, $810.00 ...). Even for a demo, a customer role seeing all other customers' jobs and payouts is a permission leak. Tour switches nothing about my session.

### CONFUSING 3: the job just sits after the hold, nothing says why or what to do
After "Money held" the job says only "The pro starts work." / "Money held. Waiting for the pro". The brief said a demo pro would work it; it did not in 10+ minutes (pro was "arriving Nov 4 7:19 PM", platform clock passed that). No ETA, no "this is a demo pro and will not act on its own, use the demo panel / tour". A visitor has no demo-panel control that says "make the demo pro finish my job"; only the tour (separate job) completes one. Biggest gap for a first-time visitor: I never saw my own job get paid.

### CONFUSING 4: money panel says "HELD WITH PAYPAL $234.00" while still "hold pending"
On the "Agreed: hold pending / Approve the hold" screen the page text already includes "The money: HELD WITH PAYPAL, authorize, capture later $234.00 ... Paid with PayPal ... Order MOCK-..." before I approved anything (Authorization id absent, "Guaranteed until" shows a dash). Reads as if charged/held already. Same page offers "Hold with the PayPal sandbox test card instead" with no explanation of the difference.

### CONFUSING 5: raw machine strings shown to customers
Each condition prints `before`, `draining`, `work_note` and `photo>=1;in_window;near_job;not_reused` / `note>=1;words>=8` under the plain-English sentence (job page, both customer and pro). Landing + /post also print "DONE_MODEL_URL is unset", "DONE_AUDIT_URL", "DONE_VLM_URL" and "Models". A renter does not know any of this; a judge may read it as unfinished. Better: hide behind "how this is checked".

### CONFUSING 6: scope review contradicts itself
"Scope review at agreement: no blocking gaps" followed by two medium gaps: "no receipt asked for parts" and "TSBPE licence note needed", each with a "Rewrite" suggestion but no button to apply it, and agreement/hold already happened, so I cannot add them. Also /post says "Photo checklist: 8 shots" while the order has 4 conditions and "2-6 shots" per photo condition.

### CONFUSING 7: what decided each check is only visible on the tour
For my job: "work order by RULES", checks "not checked yet". On the tour the step "Code passed - a person confirms" is honest and good ("The rules never release money on what nobody judged: it's the customer's call"), but I also saw landing sample DP-1032 "PASSED conf 0.80 ... released by the rules the moment it passed" for photos. Those two statements fit badly: for photos the rules cannot judge content, so why 0.80 confidence and auto-release there but ask the customer in the tour? Also hold math in the tour: $222.00 at step 2, "$248.50 hold" at step 7 after a +$45 change; $248.50 is not 20% of $230 ($276) and not obvious. Explain re-hold.

### CONFUSING 8: shared platform clock jumped about 8 h during my session
/api/info now: 17:18Z at start, 01:32Z (Nov 5) after the tour. Window "Nov 4 - Nov 6" and offers "arrives Nov 4 7:19 PM" were suddenly in the past, but nothing told me. With several visitors on one server the clock moves under everyone (the "Move the clock" buttons +6 h / +4 days / +30 days are global). Label the demo panel "affects everyone on this server".

### CONFUSING 9: demo pro "Sign in as" replaces the customer session
Choosing a demo pro in the panel silently signs out Jamie. My jobs then belong to a customer account I cannot re-enter (sign-in by name creates a new account?). I did not test returning. Warn before switching.

### CONFUSING 10: profile ZIP 78704 is preset, I live in 78751
Sign-in says "account in Austin, TX 78704" with no way to set my ZIP; the /post form lets me override it per job, which worked, but the profile ZIP stays 78704.

### CONFUSING 11: tour job text is about a faucet
Tour always uses "Kitchen faucet drips... $200 max", corroded valve, +$45; I was a clogged-sink user. Fine as a script, but it reads as a different product after I had posted a drain job. A line "this uses a canned job so you can see every step" would help. Tour also ran with "no model answered in time" while landing says model off.

### MINOR
- Landing mobile: floating JUDGE TOUR / DEMO buttons cover content bottom-left/right on every page; on the job page they overlap the PayPal id lines and photos. Tour card covers the lower third of the screen.
- /post condition titles are in narrow text inputs and are cut off ("Photo of the work area cl"); on mobile you cannot read the whole condition you are agreeing to. Type dropdown (photo/receipt/note) is a native select under each.
- /post: budget label is "BUDGET MAX" with placeholder 200 and blank allowed; result says "No budget given ... ceiling $300 demo estimate". Fine, but I did not know the ceiling would be $300 (above what I'd choose) until after posting.
- My jobs list renders only the heading for ~1-2 s before the job shows (looks empty).
- Offers list order is the pro's arrival order, not price or rating; cheapest ($185) is shown first only by chance; "Counter" button disabled with a placeholder price of 176 that seems arbitrary.
- DP-1038 stays "open, asking for offers" on the pro's /pro list after I abandoned it (stale).
- "Cancel and void the hold" is a prominent red button with no confirm shown (not clicked).
- Dropdown "Hold with": "PayPal sandbox test card" vs "PayPal (approve once)" gives no hint which to pick; I chose approve once as the prompt said.
- Accessibility: the approve-once select options are exposed to find/read_page as generic text, not a control (automation could not click them).
- Simulated PayPal page is white/blue and clean; good: states "Simulated", "hold, not charge" and the amount. Page title "PayPal (simulated)".

## Judge view
Strong: explicit "simulated" labels on PayPal pages and ids ("SIMULATED PAYPAL - stand-in ids"), an actual explanation of auth vs capture, split of capture / fee / unused hold released, "RULES vs model" labels on every decision, honest "a person confirms" step. Weak: nothing in the product (outside the scripted tour) lets a visitor see a payout on their own job; the first-run path crashes if any outside offer is malformed; jargon leakage; money panel shows held-before-approved.

## Unclear (guessed)
- Whether "Done" in the sidebar bubble is a person or the system.
- Whether the demo pro would ever act by itself on DP-1040 (it did not in ~10 min of wall clock plus ~8 h platform time).
- Who the "platform fee" 10% is charged to, for my job, before accepting (visible only in the tour).
- Why the held amount was $234.00 = $195 x 1.2 while the page text said "hold price plus 20%" (math ok), but "buffer left $39.00" vs what happens if I never use it (landing says never charged).
- What "Guaranteed until Nov 7" means vs "Expires Dec 3".
- Whether the auth was really "authorize", reported flow "platform_capture_then_payouts" is unexplained.
- Whether "test card" vs "approve once" affects payout.
- Whether the demo panel's "+6 h" etc. affect other users (I did not click them; the clock moved anyway).
- Whether signing in by name again returns my old account.

VERDICT: 1 BLOCKER, 1 BUG, 9 CONFUSING
