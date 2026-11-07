# Done & Paid basic-flow check (jamie)

Browser: built-in pane, my own tab tab-32, http://127.0.0.1:8810/, desktop width. Server clock at start: 2026-11-05 ~08:12 UTC (about 2:12 AM Austin). Stopped at about 78 tool calls, past the ~70 budget, so steps 2 to 4 are only partly done (see "Not done").

## Steps

1. **Judge tour (Demo panel "Take the 3-minute tour"): did NOT complete as written.** Tour ran on job DP-1035 "Fix a leaking faucet".
   - 01/08 to 05/08 worked. Offers: 5 agents quoted from $195. Counter at $185, hold $200 authorized (price $185 + $15 buffer). Change order +$47.05 approved by the demo agent. Evidence sent, checks ran (about 50 s in "Checking").
   - 06/08 "Release it as the customer" **failed silently**. Clicking it does nothing visible. The network call `POST /api/demo/tour` returned 400 with this body: `"error":"acknowledge"`, "These conditions didn't pass: new_part, no_drip. To release anyway, send acknowledgeFailed: [...]". Failed reasons: `new_part` and `no_drip` both `needs_fix`, "photo 2 is the same picture as photo 3 sent for no_drip" (duplicate_in_job: ev_88dbc518e8 = ev_ac1feedcdb). So the tour's own canned pro photos are duplicates, and the tour button has no way to acknowledge.
   - Workaround I used: on the job page, "Release $232.05 anyway" then the confirm dialog "Release $232.05". That is a real (simulated) capture, done by me, not by the tour. After that the tour advanced: 06/08 (button still said "Release it as the customer", which now repeats without error) to 07/08 "Paid, to the cent", 08/08 "The back office is for staff", then "Finish the tour" worked. I did not click the staff sign-in options.
   - Tour ran while the browser was already signed in as **Jordan Avery** (PIN until 2:02 AM), which I did not sign out before starting the tour. I signed out before step 2.
   - The tour moved the demo clock by 14 minutes (/api/info clock.recent: "the pro's visit on DP-1035 takes 15 minutes").

2. **Sign up as Jamie, ZIP 78751, PIN: worked.** Used /signin via "Choose a name" (not "Continue as a demo customer"). Role "I need a job done", name Jamie, ZIP 78751, test PIN of my own choice. Header then showed "Jamie · PIN ✓ until 2:09 AM".
   - Posted "My kitchen sink drains super slowly", budget left blank, dates left at default. Work order written: job **DP-1037 "Clear a clogged drain"**, ceiling $300 (demo estimate), window Nov 5 to Nov 7 (within 2 days), 5 done-conditions. The page said "The model didn't answer in time, so the rules wrote this order."
   - Posted job id job_0388a83c2a. Status "offered".
   - **Offers: none.** Page said "usually arrive within 1 to 2 minutes". After about 4 minutes, `/api/jobs/job_0388a83c2a` still showed `offers: 0`, status `offered`. Not yet explained.
   - Accept offer, PayPal hold approval, "Have the demo pro finish now", pay: **not done** (no offer to accept).

3. **Reports panel and close-out package: NOT done.**
4. **/live-test and /credits: NOT done.**

## Money at the end

- DP-1035 (tour job, not Jamie's): hold $200.00 authorized, change order +$47.05 made the total $247.05 authorized. **$232.05 captured** (the tour's "release"). Platform fee 10% = $23.21. **$208.84 paid out** to Eastside Pipe & Drain (demo) in one Payouts batch, "Paid, Nov 5, 2:10 AM". The unused $15.00 of the hold was released, never captured. Warranty until Nov 19.
- DP-1037 (Jamie): no money held, no charge, no payout. Nothing was accepted.
- Whole run: Jamie spent $0.

## Findings

- **BUG (tour, step 06/08):** "Release it as the customer" returns 400 `acknowledge` and shows nothing. The tour cannot advance without a manual release from the job page. Request: `POST /api/demo/tour` (step 6 click). Response: 400, `{"error":"acknowledge", "failed":[{"id":"new_part","verdict":"needs_fix",...},{"id":"no_drip","verdict":"needs_fix",...}]}`. The tour should either send acknowledgeFailed or show the reason on screen. The duplicate photo that causes it is in the tour's own canned evidence.
- **CONFUSING (new job, no offers):** DP-1037 got no offers in about 4 minutes, while the page promises 1 to 2 minutes and the tour gets 5 offers at once. Could be that the work order came from the rules fallback. Not confirmed.
- **CONFUSING (address):** the post form has a ZIP field (78751, filled in) and a "STREET (ZIP 78751)" field that I did not fill. The job page shows only "Austin, TX 78751". It is unclear whether a street is required before offers.
- **CONFUSING (order text):** "The model didn't answer in time, so the rules wrote this order." The conditions are generic ("Photo of the blocked drain...") even though the request was about a kitchen sink; the title became "Clear a clogged drain".
- **CONFUSING (tour sign-in state):** the tour started while signed in as Jordan Avery, with no notice that it runs under that account.

VERDICT: 0 BLOCKER, 1 BUG, 3 CONFUSING

## Unclear

- Whether the rules-fallback order (the model timed out) is expected in the demo.
- Why DP-1037 got no offers. I did not check the pros' price rules.
- What "PIN until 2:09 AM" means exactly: a session that expires, or a PIN lock window. It was 2:02 AM for Jordan, and I did not test the expiry.
- Whether the street field is optional.
- Whether "Release anyway" on the tour job was the intended path. I used it to get past the tour's stuck step. I did not sign in as Demo staff.

## Not done

- Step 2 remainder: accept an offer, approve the simulated PayPal hold, "Have the demo pro finish now", confirm and pay (PIN if asked). Blocked by no offers on DP-1037.
- Step 3: the job's Reports panel and close-out package.
- Step 4: "How we tested it" (/live-test) and "Photo credits" (/credits).
- The brief's budget (70 tool calls) was exceeded. Stopped to stay in budget. Can continue from DP-1037 if wanted.
