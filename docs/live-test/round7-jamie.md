# Done & Paid round 7, jamie: basic customer flow (PARTIAL, stopped early)

Status: stopped at Judge tour step 3 of 8. Jamie sign-up, posting, offers, hold approval, finish and payment were NOT run. Stopped because the browser tab was shared with other sessions (see "Shared browser" below), and I did not want to approve or cancel payments that are not mine.

## Setup problems

- `tabs_create` failed twice ("Browser pane gone, gate off, or tab cap reached"). I had no tab of my own.
- I used `tab-27`, an existing localhost:8810 tab, and navigated it to http://127.0.0.1:8810/. Other localhost:8810 tabs were open at the same time (tab-16, tab-17, tab-19, tab-24, tab-26), so the browser is shared.
- The tab changed under me while I worked. Its URL moved from `/jobs/job_5d46218321` to a PayPal (simulated) approve page for DP-1035, then to `/jobs/job_c38cb4d000`. I did not make those navigations.
- The viewport was 727 px wide at first. I set 1280x900 to get the Judge tour panel in view, then cleared the emulation at the end.

## Steps

1. Home page, not signed in (a "Sign in" link was showing). Clicked DEMO, then "JUDGE TOUR". The tour started and created job DP-1036 "Fix a leaking faucet", Austin TX 78704, window Nov 4 to Nov 5.
   - Tour step 01/08 "The work order, and five offers": 5 done-conditions, written by the rules template ("no model answered in time"). 5 pro agents quoted, from $195.00. Lowest: Eastside Pipe & Drain (demo) at $195.00. Ceiling $200.00.
   - Step 01 was already showing when I first read the page (about 02:54:21Z).
2. Tour step 02/08 "Agreed, and the money is held" (about 02:54:34Z, about 13 s after step 1). Counter-offer met at $185.00. Hold: $200.00 authorized (held, not charged). Price $185.00, buffer $15.00 (about 8%, capped by the $200 ceiling). Server ids were not visible in the text I read.
3. Tour step 03/08 "Something else is broken" (about 02:55:04Z). Change order for a corroded valve, limit $75.00.
   - My click on "Send the change order" did not register on the first try (the button was below the visible pane). Then the tab navigated to the simulated PayPal approve page for DP-1035 (not my job), so I stopped there.

## Money at the point I stopped

- DP-1036 (tour job): $200.00 authorized (held) per tour step 2. Not captured. Tour not finished, so no capture or payout was seen.
- DP-1035 PayPal approval, not mine: "Authorize (hold, not charge) $168.00 to Done & Paid ... For DP-1035 Fix a leaking faucet: Luis Ortega Plumbing (test) hired at $140.00. The account that hired: Maria." I did NOT click Agree or Cancel. Someone else's flow.
- Jamie: nothing created or paid.

## Findings

- BUG (test interference, probably not the app): a Judge tour step completed in a tab that another session was also using. The tab was navigated to another job's PayPal approval mid-tour. Shared localhost browser tabs make the tour unsafe to run alongside others. Request and response: tour step 3 click at ref_167 "Send the change order", then the tab showed `http://localhost:8810/mock-paypal/approve?token=REDACTED`.
- CONFUSING: the tour's step buttons sit below the fold at 1280x900 and the 800x562 pane. A click by ref can land off-screen and do nothing without an error. I had to scroll_to the ref before each click.
- CONFUSING: "Sign out" was shown on the job page after the demo panel ran, but I never signed in. I could not tell which account the page was using, so I did not sign out or sign in.
- CONFUSING: the tour timer shows no time to completion. My estimate is about 30 s per step, with steps 1 to 3 at 02:54:21, 02:54:34 and 02:55:04Z.
- MINOR: /api/info reports "modelLive": false with "the last call fell back: model timed out after 25000 ms" for done-chat. The tour text says "no model answered in time", so the rules template was used.

## Unclear

- Whether the demo tour and the simulated PayPal approve page share a session with other open tabs on this browser. Many localhost:8810 tabs were open.
- Whether the DP-1035 approval for "Maria" belongs to another tester on this server. I assumed so and did not touch it.
- Why `tabs_create` said "tab cap reached" while only 9 tabs were listed.
- Which account the job page showed as signed in ("Sign out" present, no name shown).
- Whether the tour's step 3 change-order click ever reached the server. The DP-1036 change order was not confirmed.

## Not done

- Step 2 of the brief (Jamie sign-up, PIN, posting, offer acceptance, PayPal approval, finish, payment).
- Step 3 (close-out package download).
- Step 4 (/live-test page).

VERDICT: 0 BLOCKER, 1 BUG, 3 CONFUSING (partial run; the BUG is shared-browser interference, not confirmed as an app defect)
