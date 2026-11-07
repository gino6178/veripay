# Round 5: Jamie, a first-time visitor on a phone, then a judge's look

This tester didn't write a report file. This page records its final message. The browser profile was shared with other
testers, and one of them navigated this tab, so the first PayPal screen and the "No such job" link below may be
interference rather than product bugs.

## The job (DP-1038, mobile width, ZIP 78751)

- **Sign-in:** the tab was already signed in as "Demo · Dana Kim" from another tester. Jamie signed out, then signed in
  as "Jamie" with "I need a job done", a demo account with no password.
- **Work order:** the sentence became 3 tasks and 5 done-conditions in 0.4 s, labelled RULES, with a $300 ceiling and a
  Nov 4–6 window. Jamie added the two suggested conditions (receipt, licence note), making 7.
- **Before any offer:** posting led to a simulated PayPal page asking to authorize $200.00. After it, the job page said
  "No money is held yet", and hiring asked for PayPal approval again.
- **Offers:** five arrived in about 2 minutes. Jamie took Lone Star Rooter at $185; the hold was $222, the price plus
  20%.
- **Finish now:** the demo pro finished in about 12 s. Six of the seven conditions waited for Jamie (the receipt was
  waived), with "no model looked at the photos" shown.
- **Paid:**
  - $185.00 captured and $37 of the hold released.
  - $18.50 platform fee, $141.52 to the pro and $24.98 to the helper.
  - It adds up to the cent, and every PayPal id is tagged simulated.
- **Judge tour (8 steps):** a second job, DP-1041. It captured $232.05 of a $247.05 hold: $208.84 to the pro and $23.21
  fee. The math is right.
- **Judge views:** the read-only back office, Home and Models all load at desktop width. No live-test history is linked
  anywhere on the site.

## Findings

- **BUG:** the first job link after the PayPal return (`/jobs/job_f2d7dbacff`) said "No such job", while Jamie's job
  was `job_77bdbe1830`. This may be interference from the shared browser.
- **CONFUSING:**
  - A PayPal screen for $200 came before any offer, naming no job or pro, and the sign-in page doesn't say the account
    is a throwaway demo identity.
  - The pay confirmation puts a claim in the customer's mouth: "You've looked at the photos and they show the work was
    done".
  - The waived-receipt note says the scope writer added the condition, but Jamie added it.
  - "7/7 CODE ✓" sits next to "6 person confirmed".
  - "✓ PayPal verified" sits next to "this payout address has no PayPal account".
  - Every photo carries the same BEFORE/AFTER label, "AFTER wide shot showing the room", even close-ups.
  - The tour speaks of "the customer's agent" to someone with no agent. It also says the $200 ceiling capped the
    buffer, then shows a $247.05 hold.
  - The Models page is jargon-dense (AUC, stand-in, intervals) and gives judges no plain answer to "what decided a
    check".
- **MINOR:**
  - The post form says $200 while the order says the ceiling is $300.
  - "Cancel and void the hold" sits right under "Have the demo pro finish now".
  - Job pages take a few seconds to render.

VERDICT: 0 BLOCKER, 1 BUG, 7 CONFUSING
