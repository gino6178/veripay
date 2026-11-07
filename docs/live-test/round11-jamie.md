# Done round 11: jamie (partial, written at ~75 tool calls; steps 3-4 still in progress)

Browser: built-in pane, tab tab-33, http://127.0.0.1:8810/, desktop width. Signed out before sign-up.

## 1. Judge tour (8 of 8 steps reached, finished)
- Start on home page: "Take the 3-minute tour" opened the aside. Step 1/8 "work order" showed 4 done-conditions, 5 offers from $195.
- 2/8 Agreed: $200.00 authorized at first (price $185 + $15 buffer), held, not charged.
- 3/8 "Something else is broken": change order for corroded valve, $75 limit.
- 4/8 Agent approved +$47.05 change order; hold grew to $247.05 (new hold placed, old voided).
- 5/8 Evidence sent: "Send it and run the check". This step took about 15-20 s before the next step appeared. The button shows no spinner or disabled state, and I clicked it twice (the second click may have been a duplicate submit; not verified).
- 6/8 "A person confirms the photos": code checks passed, no model verdict, so the customer must release.
- 7/8 Released as customer: captured $232.05 of $247.05, released $15.00. Pro $208.84, platform fee $23.21, payout batch PAYOUT-CB027E4BEB6D. Check: 208.84 + 23.21 = 232.05. OK.
- 8/8 Back office: told me to sign in as Demo staff or view an anonymised copy. I chose "Finish the tour". The tour had already signed me in as a demo customer "Demo · Jordan Avery" (not a choice I made, shown by /api/me). I signed that out before sign-up.

## 2. Sign up and landlord
- Signed up as "I need a job done", name Jamie, ZIP 78751, PIN chosen by me (not recorded here). Result: "Demo · Jamie", zip 78751, no saved payment method.
- Renting? page (/tenancy): "Link the demo landlord" worked. Linked to Riverside Property Management (demo). Timestamp shown "Linked Nov 5, 4:37 AM".
- Posted "My kitchen sink drains super slowly" via /post. Rules wrote the work order in 4.1 s: plumbing, 5 conditions, ceiling $300 (demo estimate, no budget given), window Nov 5 to Nov 7, "For my landlord to approve and pay: Riverside" pre-ticked (true). Job DP-1043, id job_2baa1ee1fa.
- Offers (all in about 2 min): Barton Creek $220, Eastside $195 (lowest), Hill Country $255, Mueller $220, Lone Star Rooter $185.
- I suggested Eastside ($195) as tenant (POST /api/jobs/:id/tenant/pick, recorded as by person).
- Landlord's agent agreed at $195.00 at 10:41:08 (about 2.5 min after my suggestion). Hold: $234.00 authorized (price $195 + buffer $39 = 20%), AUTH-7227648202F8, order MOCK-9023163CA2CC, payer "your landlord's PayPal". Nothing captured yet.
- Status now: held, waitingOn pro, "they arrive about Nov 5, 4:46 AM".

## Findings so far
- BUG (suspected): Mueller Plumbing's agent message, source "model", reads "That works for me, thank you. I can confirm the job at $220.00". Nobody had countered or accepted, so the message claims a confirmation that did not happen. Request: GET /api/jobs/job_2baa1ee1fa, thread message msg_3f5958fa23.
- CONFUSING: Eastside agent message (source "model") ends "Would you like to confirm the booking?" while the offer itself is already open. It asks the customer a question that the landlord is supposed to answer (msg_6a3f7aa46d).
- CONFUSING: Demo clock is 14 minutes ahead ("aheadMinutes":14), so "arrives Nov 5, 4:46 AM" is not real time. Stated on the job, but easy to miss.
- CONFUSING: Tour step 5 gives no feedback while checks run, so the button appears to do nothing for ~15-20 s.
- CONFUSING: The tour silently signed me in as a demo customer (Jordan Avery) with a spent $232.05 this month.

## Money so far
- Tour job: captured $232.05 (pro $208.84, fee $23.21), $15.00 released, nothing refunded. Tour customer Jordan Avery.
- Jamie job DP-1043: $234.00 authorized on the landlord's PayPal, $0.00 captured, price $195.00.

## 3. Later steps (run after the first write-up; over the call budget)
- DP-1043 status is still "held". Waiting on the pro: "they arrive about Nov 5, 4:46 AM" (visit booked by the landlord's agent as a demo on-call slot, 90 min). No "finish now" control appears on the job page for a customer, and none in the DEMO button panel (the panel showed nothing I could use). The pro's evidence and the checks never ran, so no payout happened.
- Inbox (/inbox): works. 14 unread, items include "Scope reviewed", "Money held with PayPal", and "Offer not chosen" x3 (the loser offers).
- My home (/home) and Groups (/groups): get_page_text returned only the footer, body empty. Not confirmed whether still loading or broken; I did not retry.
- Step 4 (pro public profile and "Verify it now" on a work record): NOT DONE. Out of budget.

## Money at the end (DP-1043 and tour)
- DP-1043: $234.00 authorized (AUTH-7227648202F8) on the landlord's PayPal. $0.00 captured, $0.00 refunded, $0.00 paid to the pro. Hold expires 2026-12-04; honored until 2026-11-08.
- Tour job: $232.05 captured, $15.00 released, pro $208.84, platform fee $23.21.

## Unclear
- Whether "Would you like to confirm the booking?" is a message to the landlord or to me.
- Whether "source: model" vs "source: rules" affects anything visible to a user.
- Why the tour shows a canned job (DP-1038) while my job takes live offers.
