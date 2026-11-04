# Cover, tested by AI agents

Each round, AI agents use Cover on the live server the way real people's agents would: they get only an agent token and
`/llms.txt`, never the source. Their reports are in `docs/live-test/round<N>-<who>.md`, every call they made is in
`docs/live-test/ops/`, and `docs/live-test/index.html` (built from `rounds.json` by `build.mjs`) charts the rounds.

## Round 1: a person's own AI agent uses Cover

Three Sonnet agents on the PayPal sandbox: Maya's agent insured a Tokyo trip for two under a $150 budget, Leo's agent
worked under a $30 limit with no autopay, and Rin's agent was a red-team tester.

- **Verdicts:** Maya 0 blockers, 0 bugs, 2 confusing; Leo 0, 0, 4; Rin 0, 1, 3.
- **Every guardrail held:** an already-delayed flight was refused (TR-3.1); the agent couldn't raise its own limit or
  change where payouts go; an over-limit purchase was refused; a claim whose story told the system to approve itself
  stalled for evidence; ids that weren't the person's were refused.
- **The automatic payout:** Rin's trip paid $100 with PayPal Payouts about a second after AM410 was reported 2.5 hours
  late, with no claim filed.
- **Fixed after:** flight-only trips no longer need the oldest traveler's age; `insure_trip` accepts wrapped arguments;
  flights may name their airports; a claim type the plan doesn't include is refused up front; trip premiums count toward
  the monthly limit; `/llms.txt` documents the demo controls as demo-only.
- **The one bug:** the demo's flight-feed control isn't tied to a person (anyone can mark any flight late). It exists only
  on this demo server and is off when `DEMO_SIGNIN=0`; a live deployment takes flight status from an airline-data
  source instead.

## Round 2: giving to several causes, a neighborhood fund, and a seller's agent

Three Sonnet agents on the PayPal sandbox. Jordan's agent split his giveback and looked into a neighborhood fund (three
neighbors at his ZIP already on Cover); Priya's agent insured a three-person trip to Lisbon with medical and cancelled the
outbound flight in the demo feed; Northwind Trips' checkout agent tried to embed Cover in a customer's checkout with only
a partner key and `/llms.txt`.

- **Verdicts:** Jordan 0 blockers, 0 bugs, 5 confusing; Priya 0, 2, 4; Northwind 0, 0, 2.
- **What worked:** Jordan's agent set a 67/33 split and joined the 78704 fund on its own, within his limits. Priya's agent
  bought $307.08 of cover for three in one call, and the cancelled TP236 paid $900 automatically.
- **Where agents stopped, rightly:** Northwind's agent wouldn't invent the oldest traveler's age, so it never got an offer.
- **Fixed after:** a seller's offer needs no age (it offers flight cover) and reads a destination in words; the causes
  chosen with a purchase become the person's current choice (the giveback status had shown the old one); a cause pool in
  deficit is flagged when chosen; flight status shows what is left per traveler; each payout status says what it means;
  the fund's monthly amount counts toward the person's limit, and agents can leave, propose and vote.
