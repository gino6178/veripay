# Done round 6: Jamie (renter, phone, no agent)

Persona: Jamie, 29, Austin 78751, phone width (375x812), built-in browser, own tab, http://127.0.0.1:8810/.
Problem: "My kitchen sink is clogged and drains super slowly, and the landlord takes forever."
Platform clock at start: Nov 4, ~7:12 PM Austin (/api/info now 2026-11-05T01:1xZ).

## Setup notes (browser pane, not the product)
- Tab cap was reached. I first (by mistake) resized an existing tab (tab-26, /demo/office) to mobile, then reset it to desktop at once. I closed only tab-15 (localhost:8810/pro/onboard?code=..., loaded 21,876 s earlier, clearly stale), then opened my own tab (tab-27).
- My tab was navigated away 3 times by something else to http://localhost:8810/link?code=... and /job/job_b8823a5d02 / job_c57d450677 (not my jobs, "localhost" origin, "YOUR AGENT NEEDS YOU" page). Other round-6 agents appear to share the pane; I re-navigated to 127.0.0.1 each time and always passed tabId. Cost me about 6 extra calls. Not a product bug.
- In the mobile emulation, screenshots are rendered zoomed/cropped at times (first home screenshot showed clipped hero text); scrollWidth was 375 = viewport on /post, so I do NOT count it as overflow.

## What I did, step by step (Jamie's view)

1. Home (/). Headline "PAY THE PRO THE SECOND IT'S DONE." Understood: pay a local pro only when work is proven done, PayPal holds money. Two big buttons: "Post a job yourself", "Or let your AI agent do it". Jargon I did not know: "CODE CHECKS TIME, PLACE, REUSE, RECEIPTS", "MCP", "EXIF, dHash, OCR", "payout batch". A featured "REAL RECORD" work order (DP-1032) sits below the fold; fine. Nav shows "Sign in" only when signed out.
2. /post shows the form but no sign-in prompt in the page text for a signed-out visitor. The interactive list shows "Continue as a demo customer", "Choose a name", and a floating "DEMO" button. I had to find /signin?next=/post via the header "Sign in" button.
3. /signin, "SIGN IN TO THE DEMO": tabs "I need a job done / I'm a pro / Inspector", name (optional), "Your Austin ZIP", "Choose a PIN (4-6 digits, optional)". Typed Jamie / 78751 / PIN <pin> (my PIN, remembered). Copy says "no email and nothing real", "default limits for your agent ($500 a job, $1,500 a month)" - I have no agent, so that line meant nothing to me. I accidentally hit the always-visible "DEMO" button (bottom right, same size as a primary button) which opened a Demo panel containing "Move the clock +6 h/+4 days/+30 days"; I did not use it (closed it). Then pressed Continue. Result: header showed "My jobs" and "Sign out"; no "welcome" or "account created" confirmation, and the PIN was not echoed back (fine, I chose it).
4. /post: typed the sentence, pressed "Write the work order". 4.1 s later (label RULES): "Here's the work order: 3 things to do and 5 done-conditions". Title "Clear a clogged drain", trade plumbing, ceiling $300 (I gave no budget: "a demo estimate for this kind of job in Austin ($300)"), window Nov 4 - Nov 6 (header says "within 2 days"), conditions: before photo of blocked drain; photo of what was pulled out/opened trap; photo of sink draining freely at least 5 min after the clog was cleared; photo of work area cleaned; a note (8+ words) on cause and fix. Also: "Model not used: model timed out after 4000 ms (the server lists done-chat, but the last call fell back...)". Form also showed: extra hold 20%, milestones, retainage, warranty window, inspector, "The pro must photograph each spot BEFORE starting", photo upload, a rules block ("Permit: not usually - licence: TSBPE-licensed plumber", "Photo checklist: 11 shots (4-5 photos)"). STREET field was empty (placeholder "1400 S Congress Ave"); I left it empty and the post worked. Pressed "Post it and ask for offers" -> /jobs/job_807bafa2a6, DP-1037.
5. Job page right after posting: badge "Offers in" but status line "WAITING ON THE PRO / Send an offer" and "Pros' agents answer over the next minutes ... (none yet)". Nothing said how many minutes. First offers appeared about 1 min later (agent messages stamped 7:14:33 onward), fifth at 7:15:21; I saw "none yet" until about 2 min after posting.
6. Offers (collapsed behind a "See the 4 offers" link, later "5 offers"): Barton Creek $220 (hold $264), Eastside Pipe & Drain $195 ($234), Hill Country Leak Pros $255 ($300), Mueller $220 ($264), Lone Star Rooter $185 ($222, "lowest price"). Each shows rating, jobs, licence, distance, arrival time, price breakdown (call-out + labour + travel) and "paid to s••••••@personal.example.com (demo payout address: stays unclaimed)" (identical for every pro). A "Hold with" selector: "PayPal sandbox test card" (default) or "PayPal (approve once)". I chose PayPal (approve once). Chose Lone Star Rooter, $185.
7. Confirm dialog (clear): "PayPal will hold $222.00: the price $185.00 plus $37.00 for change orders. It's an authorization, not a charge: you pay only what's due, when the checks pass, and the rest is released. Held with: PayPal: you approve it once on the next screen." Buttons "Hold $222.00" / "Not yet". Pressed Hold (7:16:25 PM).
8. Job state "Agreed: hold pending", "WAITING ON YOU: Approve the hold in PayPal", link "Approve the hold (simulated PayPal page)" -> /mock-paypal/approve?token=MOCK-7141135060B6. Page "PayPal (simulated)": "Authorize (hold, not charge) $222.00 to Done & Paid, and save PayPal for later holds ... The account that hired: Jamie. If that isn't you ... cancel. Simulated PayPal: this server runs without sandbox keys. No money moves." Pressed "Agree and continue". 7:16:54 PM: "agreed -> held, paypal, $222.00 authorized". I was NOT asked for my PIN at any point in hiring/paying.
9. Held state: "Money held. Waiting for the pro. Lone Star Rooter arrives Nov 4, 7:23 PM". Demo box says the demo pro works by itself, a step about every 1.5 min, "Have the demo pro finish now". Also "Cancel and void the hold". Work started 7:17:57 PM. I pressed Finish now (dialog "Have the demo pro finish now?" -> Finish now). Timeline: working -> submitted 7:30:09 PM (platform clock jumped 12 min in about 60 s of real time: the demo pro's photos are stamped 7:20, 7:22, 7:28, 7:30) -> checking -> review 7:30:53. So "finish now" moves the shared platform clock forward (not stated).
10. Checks (round 1, 43.1 s): "3 of 5 settled by code, 2 didn't pass - a model (done-audit) read the notes and captions - the customer decides; money moves by code after that." Conditions: before-drain photo "!" MORE EVIDENCE conf 1.00 (vlm_sees "a white and brown eye with a black iris"); trap photo MORE EVIDENCE conf 0.50 (vlm: "a piece of equipment or a device"; not_same_spot hash 34 bits); sink-draining photo APPROVED conf 0.50 (vlm: "a digital representation of a water droplet"); clean-area photo APPROVED conf 0.50 (vlm: "a water filter or water treatment system"); note APPROVED conf 0.54. Panel: "The money is still only held, not charged. If you wait: an expert at Done & Paid answers by Nov 5, 1:00 PM (4 business hours) ... Whoever decides first decides." Buttons: Release $185.00 anyway; Ask for a fix; Open a dispute (these two are greyed until you type text, no hint why).
11. I looked at the photos (synthetic icons: eye, device, droplet, filter; drain-clear.jpg did not load in one slot, naturalWidth 0). Typed "The photos do not show my sink: they look like an eye, a device and a droplet icon." and pressed Ask for a fix ("Sent back to the pro to fix"). The pro needed another "finish now" (7:31:56 resubmitted); round 2 (28.8 s) was WORSE: "2 of 5 settled by code, 3 didn't pass". Sink photo failed with "Taken -230 seconds after the 'cleared' photo; the condition asks for at least 5 minutes".
12. Release: pressed "Release $185.00 anyway". Dialog (clear): "3 conditions didn't pass: [names]. PayPal captures $185.00 from the hold now and the pro is paid (minus the 10% fee). You can't take this back with a fix request; only a dispute or warranty claim." Pressed Release (7:32 PM). No PIN prompt (the signin page promised "to pay, change limits or approve changes" would need it; the demo-signup said "enter your PIN when asked" and I never was).
13. End state, DP-1037: "Released: payout sent. PayPal is processing it. Warranty until Nov 19, 2026". Money: hold $222.00 (AUTH-DD860F8225A8), captured $185.00 (CAP-D4BC0676C1DD), platform fee 10% $18.50, to Lone Star Rooter $141.52, to helper Jesse Ortiz $24.98 (sum $166.50 + $18.50 = $185.00, "adds up to the cent: yes"), PayPal's fee $6.95 (platform's cost), unused $37.00 released, never captured. Payout batch PAYOUT-172669DFBFCB accepted; items DP-1037-pro and DP-1037-helper "processing". Order MOCK-7141135060B6. Signed receipts (5), ledger (7 lines). Timing: post 7:13:30, offers 7:14:33-7:15:21, hire 7:16:25, held 7:16:54, work 7:17:57, submitted 7:30:09, checked 7:30:53, fix round 7:31:32-7:32:25, released 7:32. Real time about 20 min including waiting.
    Jamie's money: nothing charged until release, then $185.00 (of the $222 hold). I never see the "$37 buffer left over, released" confirmed as a line item (it's in the text only).

## Home after my job (mobile and desktop)
The home page's featured "REAL RECORD" became MY job DP-1037, headline chips "3 OF 5 DIDN'T PASS", "MODEL done-audit", "RELEASED, PAYOUT SENT ... BY THE CUSTOMER, AFTER LOOKING". But the per-condition list on that card shows only 2 "MORE EVIDENCE" and 3 "APPROVED" (sink photo APPROVED conf 0.95) which contradicts "3 of 5 didn't pass" (the sink photo failed in round 2; the card seems to mix round 1 and 2). Home counters also changed from 35 jobs to 39 in minutes (live; fine).

## Judge tour (mobile, then desktop)
- Started from home "Take the 3-minute tour" -> a bottom sheet "JUDGE TOUR: one job, about 3 minutes" with "Start: write the work order / Not now". It created DP-1039 "Fix a leaking faucet" at "1400 S Congress Ave (demo), Austin, TX 78704", window Nov 4 - Nov 8, ceiling $200, and signed me in as ... the header showed "Jamie" (so the tour appears to reuse my account; no new identity was announced).
- 01/08 "The work order, and five offers": "(by the rules template; no model answered in time). 5 pros' agents quoted, from $195.00." CTA "Let the demo agent negotiate and hire for you".
- 02/08 "Agreed, and the money is held": agent countered $170 -> "$170.00 is below our cost for this one; we can meet you at $185.00"; $200.00 authorized, price $185.00, $15.00 buffer ("about 8% ... capped by your $200.00 ceiling, below the 20% you set"). Clear and honest. "Why it matters: Orders v2 with intent AUTHORIZE ..."
- Then BLOCKED: the CTA "The pro arrives and starts" showed a spinner, then returned to 02/08 each of 4 tries; job stayed `working` with 3 evidence items and 0 submissions for over 3 minutes (also after pressing the page's own "Finish now" and waiting ~1.5 min). I stopped at 02/08 and did not reach steps 3-8. Network log showed 304 GET /api/jobs/job_5ca25dc319 requests (bursts of ~8 at the same millisecond), so the page polls heavily.
- On desktop (pane 800x656) the tour card covers the hero headline and the first CTA of the home page.

## Judge at desktop width
- Home: OK; same text; nav shows "Jamie / Sign out".
- /models: clear structure ("WHAT DECIDES EACH CHECK, AND WHAT A MODEL CAN NEVER DO"). Honest status paragraph. It states the borrowed model "measured 18.9 s per check ... in the app it usually times out and the rules answer, labelled RULES" and Done-VLM "151 s a case, too slow to serve ... With no verdict, a photo condition always goes to a person". But in my job the checks were labelled "MODEL ... rules+vlm+model" with durations 43.1 s and 28.8 s and vlm_sees text, and the checks were done without any person. Inconsistent with the page (see findings).
- /demo/office: banner "READ-ONLY - ANONYMISED - DEMO"; tiles: 39 jobs, $2,330.00 held, $4,305.00 captured, $3,784.50 paid to pros, $420.50 fees, $100.00 refunded (4,305 - 100 = 3,784.50 + 420.50: adds up). Table "LATEST JOBS" with a column "Automatic check ran on" and "Released by" ("the checks (no person)", "the customer", "staff (arbiter)"). My job shows model+vlm / the customer. The page content only appeared after about 4 s (first text read showed only the banner).
- /live-test (redirects to /live-test/, title "Done & Paid Testing"): 5 rounds, 25 runs, "7 -> 11 blockers and bugs, round 1 -> 5" and "16 -> 22 things an agent had to guess" (both get worse, with no explanation), bar chart. A long table of 11+ sandbox runs with raw file paths (api/scripts/...mjs), plus candid corrections (run 4 and run 6 "Correction: ... captured anyway", "INSUFFICIENT_FUNDS"). Honest, but very dense for a judge. I read about 12,000 characters; it was truncated.

## What was clear about money, simulation, and who decided

Clear:
- "authorization, not a charge" and the $222 = $185 + $37 buffer, stated on the offer, in the confirm dialog, on the PayPal page and in "The money" panel.
- "Simulated PayPal: ... No money moves." on the approval page, ids tagged "SIMULATED PAYPAL - stand-in ids" and a footer on every page.
- Release dialog names the failed conditions, says exactly what is captured and that a fix request is no longer possible.
- Split math shown to the cent.
- Each check labelled RULES or MODEL, with confidence, vlm text and a signed verdict id.

Not clear:
- The hiring confirm dialog and "Hold $222.00" button say nothing about simulation; only the next page does. Jamie reading only the offer page might think it is real.
- "Who decided each check" is contradictory in places (see findings 2 and 3).

## Whether I had to ask my person for anything
No.

## Findings

### BLOCKER
1. Judge tour stalls at step 2/08 ("Agreed, and the money is held"): CTA "The pro arrives and starts" spins, then comes back unchanged (4 attempts, plus the page's own Finish now). Job job_5ca25dc319 (DP-1039) stayed `working`, `evidence` 3 items, `submissions` 0 for more than 3 minutes. Request seen: GET /api/jobs/job_5ca25dc319 x304 -> 200, no error shown. A judge with the "3-minute tour" would get stuck on step 2. Possibly server load (several agents running at once), but there is no error or retry text.

### BUG
2. The checker says the work is wrong for obviously fake photos and the decision text is internally inconsistent. Round 1 approved "a water droplet" as "the sink draining freely" and "a water filter" as the cleaned work area (conf 0.50, status APPROVED) while failing "an eye" and "a device" for the other two. Approving a droplet icon at conf 0.50 contradicts /models ("pass counts only at confidence 0.6 or more"). Seen at /jobs/job_807bafa2a6, conditions 2-4.
3. /models says Done-VLM is "151 s a case, too slow to serve" and photos "usually" get RULES / go to a person, yet my job's checks were labelled "MODEL ... rules+vlm+model", 43.1 s and 28.8 s, with vlm_sees text. Home says "PHOTOS: A PERSON CONFIRMS / NOTES: MODEL done-audit". Which one is true on this server is unclear.
4. Round 2 after "Ask for a fix" returned worse results (3 of 5 failed vs 2 of 5) and one reason text reads "Taken -230 seconds after the 'cleared' photo; the condition asks for at least 5 minutes": a negative number shown to a customer. Also earlier the same photo (ev_40a46d6e5a, 7:28:06) had `time_gap_ok` in round 1 and `time_gap_short` in round 2 with the same timestamps.
5. Home "real record" card for DP-1037 shows "3 OF 5 DIDN'T PASS" but the per-condition rows show 2 MORE EVIDENCE and 3 APPROVED (sink photo APPROVED conf 0.95): header and rows disagree.
6. One evidence image failed to load on the job page: alt "photo for cleanup: drain-clear.jpg", naturalWidth 0, complete=false.
7. PIN never asked. /signin says the PIN "proves it's you ... to pay, change limits or approve changes", and the brief says "enter your PIN when asked", but accepting an offer, approving PayPal and releasing $185 all went through with no PIN prompt (same browser session). Either the step-up is not wired in or it only fires for agents; either way the copy overpromises for a human.

### CONFUSING
8. Offers are slow and the page does not say how slow: "Pros' agents answer over the next minutes" for ~2 min with the badge "Offers in" and the status "WAITING ON THE PRO - Send an offer" (the pro is not who is waited on; the contradiction is "Offers in" + "none yet").
9. Offers hidden behind a "See the 4 offers" link on mobile; the "Hold with" selector (default "PayPal sandbox test card") sits above the offers and nothing says the default is not PayPal. "Sandbox test card" means nothing to a renter.
10. "Finish now" moves the platform clock (about 12 minutes in 1 min) to satisfy "at least 5 minutes after" without warning, while the Demo panel warns that moving the clock "affects everyone on this server" (and I was told not to do it). Also the first Finish click had no visible feedback for ~10 s on mobile.
11. After "Ask for a fix", "Release $185.00 anyway" and "Have the demo pro finish now" are both shown at once, and it is unclear whether pressing Finish now answers my fix request (it did: 2 new evidence items).
12. "staff (expert queue)" label on the review state plus "an expert at Done & Paid answers by Nov 5, 1:00 PM (4 business hours)" while the real clock is Nov 4 7:30 PM: Jamie cannot tell whether a person is actually looking, or whether this is simulated. In a demo, say so.
13. Sign-in copy: "default limits for your agent ($500 a job, $1,500 a month)" for someone with no agent; "Sign in" for what is really sign-up; the "Continue" button is off-screen on mobile after the PIN field and the always-visible DEMO button is easier to hit (I hit it by mistake). Read_page listed only the DEMO button as a button on /signin.
14. Work order screen: "Within 2 days" in the explanation but the dates run Nov 4 - Nov 6 (3 calendar dates); street is empty with an example placeholder and not required; jargon on first view: milestones, retainage, "EXTRA HOLD FOR CHANGE ORDERS", "Inspector". "Model not used: model timed out after 4000 ms (the server lists done-chat, but the last call fell back...)" is developer text on a customer page.
15. Tour: reuses my signed-in account ("Jamie" in header) without saying so; on a small desktop pane (800x656) the tour card covers the hero headline and CTA.
16. Every pro's payout address is the identical masked "s••••••@personal.example.com". It's labelled demo/unclaimed, but looks like a bug.
17. /live-test headline stats "7 -> 11 blockers and bugs", "16 -> 22 things an agent had to guess" read as getting worse, with no explanation; page is mostly raw run logs and file paths. /models: mixes "Done-Chat ... not measured yet" with detailed numbers (OK) but the text "usual on this server" for models timing out conflicts with finding 3.

### MINOR
18. "Ask for a fix" / "Open a dispute" are greyed (disabled) until text is typed; no hint.
19. Check wording: "The photo shows it isn't done yet: photo of the blocked drain ... is not true." and "Photo ev_494278185f shows it isn't done yet" are awkward for customers, and the BEFORE photo condition says "shows it isn't done yet" even though a BEFORE photo is meant to show the problem.
20. Timeline wording "held -> working" uses raw states (needs_fix, agreed, checking) and "paypal"/"platform" as actors.
21. "Offers stay in the order they arrived; the lowest price is marked": Lone Star ($185) appeared last and was shown last, so the cheapest was at the bottom of a long list.
22. Page title is the same on every page ("Done & Paid - Pay the pro when the job is done"), except /live-test.
23. /demo/office text appears after about 4 s (banner first, table later) with no loading indicator.

## Unclear (things I had to guess)
- Whether "Sign in" creates an account (no confirmation; PIN not confirmed back).
- Whether I would ever need the PIN, and when (it never came up).
- How long offers take ("next minutes") and whether the demo pros work by themselves while I wait.
- Whether "PayPal sandbox test card" default charges anything different from "PayPal (approve once)".
- What "(demo payout address: stays unclaimed)" means for the pro actually being paid.
- Whether "Offers in" means I should act or wait.
- Whether the expert "answers by Nov 5, 1:00 PM" is a real person or simulated.
- Whether releasing $185 on 3 failed conditions is what a normal renter should do; the site lets me but the demo photos are icons, so I had no true "work done" to judge.
- Whether "MODEL" or "RULES" decided each check in my job (labels say model; /models says usually rules).
- Why the sink photo flipped between approved (conf 0.50, 0.95 on the home card) and failed in round 2.
- If the platform clock moved because of "Finish now", and whether the 6 h/4 d/30 d buttons are the only way it moves.
- Whether the buffer left over ($37) is released automatically and when (text says "the unused part was released when the last capture was made").
- Whether the warranty "until Nov 19, 2026" is 14 days (the order said 14 days; fine) and how a renter would claim.
- What the tour does after 02/08.

## Cleanup
Viewport reset to desktop. I only closed tab-15 (stale localhost:8810 onboard page). No scripts written, none to delete. PIN not written anywhere else than this report (it was a demo PIN).

VERDICT: 1 BLOCKER, 6 BUG, 10 CONFUSING
