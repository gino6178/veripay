# Done & Paid basic-flow check: Jamie (customer), desktop, http://127.0.0.1:8810/

Tester: jamie. Browser: built-in pane, my own tab (tab-31). Server clock at start: Nov 5, 1:16 AM Austin (shared demo clock).

Tool calls: about 105, over the ~70 budget. The overrun went to the tour (step 6 failure investigation) and to reading the close-out.

## 1. Judge tour (Demo panel > Judge tour)

Steps (the tour's own labels):

| Step | Title | Result |
|---|---|---|
| 1/8 | The work order, and five offers | OK. Tour signed me in as "Jordan Avery" (PIN until 1:16 AM). |
| 2/8 | Agreed, and the money is held | OK. Tour's agent countered; $200.00 authorized (held, not charged); price $185.00. |
| 3/8 | Something else is broken | OK. Change order sent (+$47.00). |
| 4/8 | The demo agent decides for you | OK. Change order approved (within $75 limit). |
| 5/8 | The pro sends the evidence | OK. Evidence sent, check ran. |
| 6/8 | A person confirms the photos | **FAILED.** "Release it as the customer" returned 400 twice (once by click, once by element ref). Tour stayed on 6/8. |
| 7/8, 8/8 | not reached | Not run. |

Failure detail (`read_network_requests`, requestId 375824.183):
- Request: `POST http://127.0.0.1:8810/api/demo/tour` -> 400 Bad Request
- Body: `{"error":"acknowledge","message":"These conditions didn't pass: receipt. To release anyway, send acknowledgeFailed: [\"receipt\"].","failed":[{"id":"receipt","verdict":"needs_fix","reason":"receipt 1: this receipt was already used on another job (job_151beecfe0); send the receipt for this job's parts"}],"job":"job_f6391cf758"}`
- So the tour's canned receipt was already used by another job on this server (job_151beecfe0, not one of mine). The tour cannot pass step 6 on a server where it has run before. I did not re-run the tour after "Restart" (the Restart button only resets the intro card, text: "uses a canned faucet job"). Whether Restart reuses the receipt is unverified.
- Also: the tour job `job_f6391cf758` (Jordan Avery) still has an open $200.00 authorization. Nothing cancelled it.

## 2. Customer flow: Jamie

- Sign-in: Signed out Jordan Avery first. Signed up as "Jamie", ZIP 78751, PIN <pin> (my choice). Went to /post. OK.
- Post: "My kitchen sink drains super slowly". Work order written by RULES in 4.1 s (model did not answer in time). Created 5 done-conditions, 3 things to do, window Nov 5 to Nov 7, ceiling $300 (demo estimate, I gave no budget). Job id **DP-1038 / job_96986958f7**. Title auto-set to "Clear a clogged drain".
- Offers: first offer about 1 min after posting; 4 offers total in about 1.5 min. Eastside Pipe & Drain (demo), $195.00, lowest. Others: Barton Creek $220, Hill Country $255, Mueller $220.
- Accept: Chose PayPal as hold method (first try with the offer select failed because the option was off-screen; used form_input on the select). Dialog: "PayPal will hold $234.00 ($195 + $39 buffer)". Simulated PayPal approve page: "Agree and continue". Money held: **$234.00 authorization**, job moved to Hold in about 1 min.
- "Have the demo pro finish now": confirmed. Work took about 1.5 min real. Photos stamped Nov 5, 8:05 to 8:17 AM. Job went to "Your call" with 3 conditions waiting for a person and 2 not passed.
- Decision: I clicked "All look right" for the 3 waiting conditions. **I did not open or look at the photos.** I decided on the check text only. Then "Release $195.00 anyway" (dialog: "2 conditions didn't pass ... You can't take this back with a fix request"). Confirmed. No PIN prompt appeared (PIN still valid until 1:25 AM at that point, or the dialog did not ask).
- Paid: "PAYOUT SENT Nov 5, 8:19 AM". Pro paid $175.50 in one Payouts batch. Unused hold released, never captured.

## 3. Reports and close-out

- Job Reports panel: has `daily.html` (open) and `closeout.html` / `closeout.pdf`. I opened `closeout.html`. It lists all five conditions with result: pass x3, needs_fix x2. Money: captured $195.00; to pro $175.50; to helper $0.00; platform fee $19.50; refunded $0.00. Warranty Nov 5 to Nov 19, 2026. Permit: none. Texas lien waivers (conditional and unconditional, $195.00) are prefilled and present no sign of the two failed conditions.
- Did not open closeout.pdf or daily.html content.

## 4. Live test and credits

- /live-test/ loads. Shows 8 rounds, 36 runs, 13 real PayPal sandbox runs (5 with payouts SUCCESS), 22 blockers found, 57 changes. Round table and sandbox list rendered.
- /credits loads after about 3 s. Table of 13+ photos, all CC BY-SA, CC0 or public domain, with authors and camera. Renders OK.

## Money at the end

| Item | Amount | Where |
|---|---|---|
| Hold authorized on DP-1038 | $234.00 | PayPal (simulated). Hold released for $39.00 (never captured). |
| Captured on DP-1038 | $195.00 | Customer, after I released |
| Platform fee | $19.50 | Kept |
| Paid to pro (Eastside Pipe & Drain, demo) | $175.50 | One Payouts batch, to a demo payout address (stays unclaimed) |
| Refunded | $0.00 | none |
| Tour job job_f6391cf758 (Jordan Avery) | $200.00 authorized, still open | Not captured, not cancelled |

Capture and payout ids for DP-1038 were not in the text I read, so I do not list them.

## Timings

- Post to first offer: about 1 min.
- Accept to hold: about 1 min (one PayPal approve screen).
- Finish now to "Your call": about 1.5 min.
- Release to payout sent: under 1 min.
- Note: "Finish now" advanced the shared demo clock from about 1:50 AM to about 8:15 AM (pro visit is scheduled 8:00 AM). The dialog says it moves the clock "by the minutes the work takes (often 10-15)".

## Had to ask my person?

Nothing was asked; I followed the brief. Two judgment calls I made on my own, both worth reviewing:
1. I approved "All look right" without viewing the photos (see above).
2. I released $195 with two failed conditions because the brief said to pay. The close-out does not mark that release as an override.

## Findings

**BLOCKER**
- Judge tour stops at step 6/8 when its canned receipt has already been used on another job. Exact request/response is in section 1. The step's button "Release it as the customer" fails with 400 and the tour stays on step 6. Restart is not verified to help.

**BUG**
- Close-out for DP-1038 (job_96986958f7) shows two conditions `needs_fix` next to "Captured $195.00", and still prints an Unconditional Waiver and Release on Final Payment for $195.00 with no note that the job was released with failing conditions. Source: `GET /api/jobs/job_96986958f7/reports/closeout.html`.
- Condition check for "Photo of what was pulled out of the drain, or the opened trap" says: "photo 2 is labelled as trap (drain work), not this job (Clear a clogged drain)". That is a drain job. The mismatch rule flags the job's own subject as wrong (`photo_topic_mismatch: ev_ce0915c699 about drain`).
- "Finish now" dialog says it moves the shared clock "often 10-15" minutes, but it moved about 6.5 hours (1:50 AM to about 8:15 AM) because the pro's visit is set for 8:00 AM.

**CONFUSING**
- Photo labels contradict each other: the job page says "Demo: the photos here are synthetic, made by the demo pro's agent", while each photo says "Photo: Steven Pavlov, CC0 · real photo re-dated to this demo job".
- Note check text is garbled: "Note note 1 shows it isn't done yet: note saying what caused the clog and how it was cleared is not true."
- Scope review suggestion is garbled: "Photo of the finished what caused the clog and how it was cleared from 2 m away..."
- Work-area photo check says the model described "a white eye with a blue iris", and the check still asks for a person to confirm. Not visible to me as a customer without opening the photo.

**MINOR**
- Auto title "Clear a clogged drain" for a request that said "My kitchen sink drains super slowly". The title is fine but the sink wording is lost.

## Unclear

- Whether Restart on the tour reuses the same canned receipt (not tested).
- Whether the tour's canned receipt is reset between runs. Only job_151beecfe0 is named as the earlier user.
- Which PIN prompt, if any, applies to release. The dialog did not ask for my PIN; the header still showed "PIN until 1:25 AM".
- The "receipt" in the tour is a canned receipt. It is not clear whether the server re-tests reuse for every tour run or only once.
- The offer's hold-method select showed "Demo test card" as default; the Hire dialog changed to PayPal only after I set the select. I could not confirm that default is intended.
- Whether the "Your call" queue's "expert answers by Nov 5, 1:03 PM" would have released anything. The page says nobody staffs it in the demo.
- Capture and payout ids for DP-1038 (not read).

VERDICT: 1 BLOCKER, 3 BUG, 4 CONFUSING
