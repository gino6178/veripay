# Product

## Register

product (the app pages: post a job, the job's work order, the pro's side, connect your agent, the back office);
brand for the home page only.

## Users

- **The customer**: a homeowner or renter in Austin, TX, with a leaking faucet, a running toilet, a TV to mount or a
  move-out clean, and increasingly an AI agent that acts for them. They want it fixed this week, for a price they set,
  and they don't want to pay before it's done. They read the job page on a phone, often standing next to the problem.
- **The customer's agent** (Claude or any MCP / A2A client): posts the job, negotiates, holds the money and approves a
  change order, inside limits in dollars that only the person sets on the website.
- **The pro** (a plumber, a cleaner, a handyman, and sometimes their helper): wants to be paid the day the work is done,
  to their own PayPal, without chasing an invoice. Sends photos and a receipt from the phone at the job.
- **A third-party inspector** (demo: Capitol Home Inspections) the customer may name: confirms milestones marked for
  inspection before money moves.
- **Staff** at VeriPay: answer the expert queue within 4 business hours, arbitrate disputes and defect claims with
  the evidence pack, review pros' licences and insurance, watch holds about to expire, payouts and alerts, and
  reconcile with PayPal.
- **Judges** reading closely: every claim about money must be traceable to an id on the screen.

## Product Purpose

VeriPay is a work order with the money attached. One sentence becomes a written definition of done: what to do,
and the conditions it is checked against, each naming the photo, receipt or note that proves it. PayPal holds the price
(an authorization, not a charge); the pro's evidence is checked condition by condition; the moment every condition
passes, code captures exactly what's due and one PayPal Payouts batch pays the pro and their helper.

Bigger jobs split into **milestones**, each with its own conditions and amount, paid by partial captures of one hold.
The customer chooses per job: release the moment the checks pass, or after a **review window** (the pro may take early
pay meanwhile for a 2% fee); hold back **retainage** until a **warranty window** ends and claim a defect with photos; name
an **inspector**; require **before photos** of each spot. Before work starts the agreed order gets a **scope review**
(vague or uncheckable conditions, missing permits or licences). Pros are **verified** (PayPal, a TSBPE-format licence in a
demo registry, insurance) and have a public profile whose ratings and photos come only from paid jobs. The platform fee
(10%) is shown on every release.

Success: a customer who never paid up front and never had to chase a fix; a pro paid in seconds instead of weeks; a
judge who can follow one job from a sentence to a payout id without leaving the page.

## Brand Personality

Exact, fair, workmanlike. VeriPay speaks like a good work order: the job number, the conditions, the stamp. Short
sentences, real numbers, no adjectives doing the work of facts. It says what decided (a model, the rules, a person, code). What is
simulated is said once, on the "What's real here" page behind the one Demo badge by the logo: no small-print disclaimers
anywhere else.

## Anti-references

- Marketplace apps with stock photos of smiling contractors and five-star badges everywhere.
- Fintech gradients, glass cards, a row of hero metrics.
- "AI magic" language: sparkles, "our AI decides". Here models give verdicts with reasons; code moves money.
- Escrow sites that look like a bank statement and hide the rules.

## Design Principles

1. One story. Every screen is a part of one job: scope → offers → hold → work → checks → paid.
2. The work order is the contract. Done-conditions are shown the same way to the customer, the pro and staff, with the
   rule each one is checked by.
3. Stamp, don't summarise. Each condition gets its own inspection stamp (passed, fix, failed, or "code passed, a person
   confirms"), with the reason and the signals under it.
4. Say where it came from. Every model-touched field carries MODEL or RULES; every decision says DECIDED BY CODE; agents
   are labelled as agents. Demo status is not repeated per item: one Demo badge, one "What's real here" page.
5. Every PayPal id on the screen: order, authorization (and any it replaced), capture, payout batch and items, refunds.
6. Staff pages are never in the customer's menu.
7. Only the person consents. Anything only the person may do (pay, release, limits, agent keys, change orders, scope
   revisions, settlements, the price ceiling) asks for their PIN in the page, says why in one line ("Your PIN proves
   it's you, not your agent; in production: Log in with PayPal"), then carries on with the same action. An agent's link
   shows what was asked but signs nobody in without the PIN.

## Accessibility & Inclusion

WCAG 2.2 AA: body text at least 4.5:1 on white and on the light page ground, visible focus, everything keyboard reachable, labelled
inputs, live regions for the chat and the tour. English only (US product; `<html lang="en">`). Phone first: no
horizontal page scroll at 375 px; the decision panel comes first on narrow screens. Reduced motion shows final states.
