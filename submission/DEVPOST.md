# Devpost submission: VeriPay

Paste each block into the matching Devpost field. Facts come from README.md and docs/IMPACT.md (sources are there).
Still to fill in by hand: the video link (after uploading), the public demo URL (not opened yet), and the team.

---

## Project name

VeriPay

## Elevator pitch (tagline, 200 characters max)

Your AI agent hires a local pro. PayPal holds the money. The pro is paid the second the work is proven done.

---

## About the project

### Inspiration

A small home repair is a bet for both sides. The homeowner pays first and hopes: in 2024 the FTC received 81,925
reports in its "Home Improvement, Repair, and Solar" category, and in BBB Scam Tracker's 2025 data the median
reported loss was $1,405. The pro works first and waits: in Intuit QuickBooks' 2026 report, 59% of US small businesses
had invoices 30 or more days overdue. The FTC's own advice is "never make the final payment until the work is done and
you're satisfied with it". We wanted to turn that advice into a payment flow, and to make it work when the buyer is an
AI agent instead of a person.

### What it does

Tell your agent "the kitchen faucet keeps dripping, fix it this week, under $200".

1. **A work order with a definition of done.** VeriPay asks for a photo, where it is and what service you want, then
   writes the job's conditions. Each condition names the photo, receipt or note that proves it.
2. **Agents negotiate.** Your agent and the pros' agents negotiate the price agent-to-agent (A2A), inside the limits
   you set in dollars.
3. **You tap Confirm; PayPal holds the money.** An authorization on your saved PayPal or card (Orders v2,
   `intent: AUTHORIZE`, Vault v3), not a charge. Your agent never sees a card number.
4. **Extra costs are negotiated too.** If the pro finds something else broken, their agent asks for a change order with
   a photo and the receipt; your agent negotiates it and approves it only within your limit. Above it, you confirm.
5. **The proof is checked.** Code checks when and where each photo was taken and whether it was reused from another
   job, and reads the receipt against the approved change orders. Our own small models judge what the photos and notes
   show. Code decides; every result says MODEL or RULES.
6. **Paid the moment it passes.** Code captures exactly what is due, and one PayPal Payouts batch pays the pro and their
   helper. Disagreements go to partial refunds or PayPal Disputes, with the checks as evidence.

The person only confirms. Anything only they may do (limits, releasing, waiving, approving a change order over the
limit, settling a dispute) needs their website session and a PIN the agent never sees.

### How we built it

- **API:** Node.js and Express. A job state machine from draft to released, with holds and reauthorization, milestones,
  change orders and a ledger where every cent adds up (capture = pro + helper + 10% fee).
- **PayPal:** Orders v2 (authorize, capture, partial capture, void, reauthorize), Vault v3, Payouts, Invoicing,
  Disputes, Pay Later messaging, card fields and Fastlane on the PayPal sandbox.
- **Agents:** MCP, REST and A2A tools, so any personal agent can hire through VeriPay. AP2-style signed mandates and an
  append-only transparency log of signed receipts.
- **Models:** our own small models, served on our own GPU machine behind an Ollama-compatible endpoint: Done-Chat and
  Done-Audit (Qwen3-0.6B, fine-tuned), Done-VLM (SmolVLM2-500M), Done-OCR (our receipt reader) and Done-Risk. Training
  labels come from code and from an open-weights 30B teacher we served ourselves. The app holds no hosted AI key.
- **Web:** React and Vite; the back office uses AG Grid and AG Charts.
- **Testing:** 390 API tests, plus rounds of scripted AI-agent users (first-time visitor, judge, dishonest pro) against
  the live site, recorded in docs/live-test.

### Challenges we ran into

- **Holding money without becoming an escrow company.** We kept the money as a PayPal authorization on the buyer's own
  account and capture only when the checks pass. Authorizations last 29 days, with a 3-day honor period, so long jobs
  need milestones and reauthorization.
- **Letting an agent pay without letting it act as the person.** Limits are set in dollars by the person; the agent
  can't raise them or change who gets paid.
- **Making checks fast enough to feel instant.** A general 30B model took 18.9 s per check. We distilled small models
  instead and run independent checks in parallel, so a job's check takes a few seconds.
- **Evidence can be faked.** EXIF can be edited and photos staged. We check time, place and reuse against every
  earlier job, and send anything code can't prove to a person instead of paying.

### Accomplishments that we're proud of

- The whole flow (post, negotiate, hold, change order, evidence, checks, payout) runs on the real PayPal sandbox.
- A model never moves money: verdicts come with a reason and a confidence, and code rules decide.
- Done-Audit got 99.9% of checks right on 300 held-out orders, and 0 of 262 hidden instructions in the evidence changed
  a verdict (held-out synthetic sets from our own generator).

### What we learned

Most of the work in "agentic payments" is not the payment call. It is writing down what "done" means in a form a
machine can check, and deciding who is allowed to do what with the money.

### What's next for VeriPay

Start as a PayPal marketplace in one city (Austin, jobs under about $500 that finish in a day), move pros to PayPal
Multiparty for onboarding and payouts, use Log in with PayPal for the step-up, and add trades whose completion can be
shown with evidence. Honest limits are listed in docs/IMPACT.md.

---

## Built with

node.js, express, react, vite, paypal, paypal-orders-v2, paypal-vault, paypal-payouts, paypal-invoicing,
paypal-disputes, fastlane, mcp, a2a, llama.cpp, qwen, smolvlm, pytorch, ag-grid, ag-charts, remotion

## Try it out

- Code: (repository link)
- Demo site: (public URL, not opened yet)
- Judge tour: Demo → Judge tour, about three minutes

## Video

- Main demo film: video/out/ (upload to YouTube, paste the link)
- 15-second pain-point short (16:9, no sound): video/out/veripay-pain-15s.mp4

## AI tools disclosure

The code was written with Claude Code (Anthropic). Training labels for our models come from code and from an
open-weights 30B teacher we served ourselves; no Claude or GPT outputs were used as training data. The app itself
calls no hosted AI service.
