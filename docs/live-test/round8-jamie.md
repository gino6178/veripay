# Done round 8: jamie (basic flow, desktop, http://127.0.0.1:8810)

Status: PARTIAL. Stopped at about 68 tool calls (budget). Steps 2 (after the hold), 3 and 4 were NOT done.

Clock notes: real UTC at start 06:15:56. Server/demo clock was 14 minutes ahead of real time (set by an earlier tour run). Job times below are the demo clock, shown in Austin local time (CST, UTC-6).

## 1. Judge tour (Demo panel) on job DP-1036 then DP-1037

Restarted once by accident (see C2). Tour counted from DP-1037, first run's steps 1-2 were the same.

| Step | What the server did | Time (real) |
|---|---|---|
| 1/8 Work order and five offers | DP-1037 posted with 4 conditions, 5 offers from $195.00 | 06:17:36 click, about 10 s to load |
| 2/8 Agreed, money held | Agent countered and got Eastside at $185.00. Hold $200.00 authorized (AUTH via PayPal stand-in), price $185.00 | about 10 s |
| 3/8 Something else is broken | Change order requested | about 10 s |
| 4/8 Demo agent decides | Change order +$47.05 approved by rules (inside $75.00 limit) | about 10 s |
| 5/8 Pro sends evidence | Check run. Took about 40 s (spinner) | about 40 s |
| 6/8 A condition failed | Three conditions failed (before, new_part, no_drip) | about 20 s |
| 6/8 "Release it as the customer" | FAILED. See B1 and BUG1 | stuck |

Tour did not reach 7/8 or 8/8. Each step took roughly 10-40 s; total to the stuck step about 5 minutes.

Judge tour answer: NO, the tour does not complete.

Photo credit and MODEL labels (on DP-1037, DP-1038, from page text):
- The BEFORE photo of DP-1037 has the line "Photo: Roy Zuo, CC BY-SA 4.0 · real photo re-dated to this demo job". I did not check the credit line on the AFTER photos.
- MODEL labels appear on: Scope review ("MODEL", medium/missing permit note); change order chg_da189ef381 ("MODEL", +$47.05); note check ("MODEL · rules+model", APPROVED 0.96); receipt check ("MODEL · rules+model", APPROVED 0.90); several agents' offer messages ("MODEL").
- Page says "a model (done-audit) read the notes and captions".

## 2. Sign up as Jamie and post a job (DP-1038)

- Signed out of the tour's "Jordan Avery" session first. Sign-in page: "I need a job done", name Jamie, ZIP 78751, a 4-digit PIN I chose (not repeated here). Sign-up worked, header showed "Jamie PIN until 12:32 AM".
- Posted "My kitchen sink drains super slowly". Rules wrote the order in 4.0 s (the model did not answer in time; the page says so). Title "Clear a clogged drain", 5 conditions, ceiling defaulted to $300.00 ("demo estimate"), window Nov 5 to Nov 7. Posted at 06:24.
- Offers: first offer Barton Creek Plumbing at $220.00 (hold $264.00) at about 06:25. Second offer Eastside Pipe & Drain at $195.00 arrived shortly after; I did not use it.
- Accepted Barton Creek at $220.00 with the "PayPal (you approve once)" hold option, confirm dialog "Hold $264.00", then "Approve the hold (simulated PayPal page)" and "Agree and continue" on the simulated PayPal page (text: "Authorize (hold, not charge) $264.00").
- Result: "Money held. Waiting for the pro." Timeline: agreed 06:39:08 (demo clock), held 06:39:40 "$264.00 authorized". Status "held".
- "Have the demo pro finish now" (the job's demo button): clicked and confirmed twice (about 06:31 and 06:41 real). Each returned HTTP 200. Nothing changed: status stays "held", no submissions, no checks, no new timeline entries, demo clock still 14 minutes ahead (B2).
- Did not reach the pro's photos, checks, or the "confirm/pay" step, so no PIN entry was asked for.

## 3. Reports panel and close-out package

NOT DONE (budget). Not checked.

## 4. "How we tested it" (/live-test) and "Photo credits" (/credits)

NOT DONE (budget). Not checked.

## Money at the end

- DP-1038 (Jamie): agreed price $220.00. Held $264.00 (PayPal authorization, not charged). Captured $0.00. Paid out $0.00. Refunded $0.00. Platform fee not yet taken. Hold valid until about Dec 4 (demo).
- DP-1037 (tour, Jordan Avery): price moved $185.00 plus change order $47.05 = $232.05 to release. Still held (initial hold $200.00). Nothing captured, nothing paid out. Page says release would take a 10% fee.
- Nothing was released, captured or refunded on either job.

## Findings

BLOCKER
- B1. Judge tour cannot reach the end. At step 6/8 the "Release it as the customer" button fails. The three canned photos are stamped with the real local time (12:18 to 12:34 AM Austin) and the job window opens Nov 5, 7:00 AM (page) or 8:00 AM (API `window.from` 14:00Z). Every condition fails "outside the job window". The tour is therefore unfinishable between midnight and the window opening. Page text for step 6: "A condition failed: the customer decides ... The rules won't release money over a failed condition."
- B2. "Have the demo pro finish now" does nothing on DP-1038. Request:
  `POST http://127.0.0.1:8810/api/jobs/job_5b6f3e554a/demo-finish` returned `200 OK` (twice). The job JSON afterwards: `"status":"held"`, `"submissions":0`, `"checks":0`, `"clock":{"aheadMinutes":14}`, timeline ends at `"to":"held","note":"$264.00 authorized"`. The dialog text says it "moves the shared demo clock forward by the minutes the work takes (often 10-15)". The clock did not move. Result: the job cannot progress past "held" in the demo.

BUG
- BUG1. The tour's release call is wrong. `POST http://127.0.0.1:8810/api/demo/tour` returned `400 Bad Request` with body: `{"error":"acknowledge","message":"These conditions didn't pass: before, new_part, no_drip. To release anyway, send acknowledgeFailed: [\"before\",\"new_part\",\"no_drip\"].",...}`. The tour's button sends no `acknowledgeFailed`, so the tour cannot continue even in the window. (The real job page does offer "Release $232.05 anyway", so the product path exists.)
- BUG2. Model-written offer text contradicts the offer's own breakdown. Lone Star Rooter, DP-1037 page: agent message says "$49.00 call-out, labor of $26.00, and travel", while the offer breakdown says "call-out $49.00 + 1.5 h labor $127.50 + travel $26.00", total $205.00.
- BUG3. Receipt condition text is garbled on DP-1037: "Receipt for the parts and materials (the shut-off valve under the sink is corroded and weeps; replacing it, with the ), dated during the job". Blank where text should be.

CONFUSING
- C1. DP-1038 conditions show a badge "EDITED BY THE CUSTOMER", but I did not edit any condition. API: `scope.editedBy:"person"`, `scope.source:"rules"`.
- C2. On the tour's step 1 card, "Restart" sits directly beside the primary button, and the card moves under the cursor when it reloads. I clicked Restart by mistake once (DP-1036 started over as DP-1037). Nothing warns about it.
- C3. Arrival and window times disagree: tour text and DP-1037 show "arrives Nov 5, 7:00 AM"; DP-1038 offers show "arrives Nov 5, 8:00 AM"; API `window.from` is 2026-11-05T14:00:00Z (8:00 AM CST).
- C4. The tour step 6 headline "A condition failed: the customer decides" reads as an intended demo outcome, but the cause is the clock (B1). The page does not say so.

## Unclear

- Whether the two MODEL-labelled checks (note, receipt) passed by model or by rules: label reads "MODEL · rules+model" with no split.
- Whether the hold on DP-1037 was increased when the change order came in (the page said a new hold could be placed first); I saw only the $200.00 hold and the $232.05 release figure.
- Ceiling: I did not set one; the default $300.00 was marked "demo estimate". Fine for the test, but the hold on DP-1038 ($264.00 = $220.00 + 20%) is computed from the default buffer.
- Start and end of the job window: 7:00 AM vs 8:00 AM (C3).
- Whether "finish now" needs the pro to be in a particular state; the button label implies it is always available on a held job.
- Demo clock is 14 minutes ahead of real time before my first action; I did not change it.
- The 10% fee shown on release: not checked on any captured amount, since nothing was captured.
- Whether the "EDITED BY THE CUSTOMER" badge (C1) means the rules text was altered by the post flow.
- Which AFTER photos carry the credit line: only the BEFORE photo of DP-1037 was checked.

VERDICT: 2 BLOCKER, 3 BUG, 4 CONFUSING
