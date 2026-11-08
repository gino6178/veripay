# VeriPay

Your AI agent hires a local pro, PayPal holds the money, and the pro is paid as soon as the work is proven done.

![VeriPay: the money waits for the proof](docs/img/cover.jpg)

We built this for the PayPal AI Hackathon. It runs on PayPal's sandbox, and the demo pros in Austin, TX are
fictional. The demo video is on the Devpost page.

## In 30 seconds

1. You tell your agent "the kitchen faucet keeps dripping, fix it this week, under $200".
2. VeriPay turns that into a work order with a definition of done. Each condition names the photo, receipt or note
   that will prove it.
3. Your agent bargains with the pros' agents and never goes over your ceiling.
4. PayPal authorizes the amount on your saved PayPal or card. Nothing is captured yet.
5. The pro sends before and after photos and the parts receipt. VeriPay checks when and where each photo was taken,
   whether it was reused, what it shows, and whether the receipt matches the approved change orders.
6. When every condition passes, code captures exactly what's due and one PayPal Payouts batch pays the pro and their
   helper. Anything the checks can't decide goes to a person.

## Why it needs PayPal

| What the job needs | How PayPal does it |
|---|---|
| Hold the money until the work is done, without a licensed escrow account | Orders `intent: AUTHORIZE`, then capture, partial capture per milestone, void, reauthorize |
| Let an agent pay without ever seeing a card number | Vault v3 saved PayPal or card, merchant-initiated holds within limits only the person sets |
| Pay the pro and their helper in seconds, to an email, with no bank details | Payouts, one batch, one item per payee |
| Settle a disagreement fairly | Partial refunds, PayPal Disputes with the checks as evidence |
| Bill work found off-platform with the same checks | Invoicing, sent only after the checks pass |
| Both sides already have accounts | 440 million active PayPal accounts |

## How it fits together

```mermaid
flowchart TD
  subgraph Agents
    C[Customer's agent] <-->|A2A / MCP| P[Pros' agents]
  end
  C -->|MCP · REST · A2A| J[Job state machine<br/>limits · PIN · mandates]
  P --> J
  J -->|authorize · void · reauthorize| PP[(PayPal<br/>Orders · Vault)]
  E[Photos · receipt · notes] --> M[Our models<br/>Risk · OCR · VLM · Audit]
  M -->|verdicts + reasons| R{Code rules}
  R -->|all pass| PC[Capture + Payouts]
  R -->|unsure| H[A person decides]
  PC --> PP
  PP --> K[Agent Toolkit<br/>reconciliation]
```

The models return a verdict, a reason and a confidence for each condition. Code makes the decision, and the screen
labels every result MODEL or RULES.

## For the judges

The hackathon scores five criteria equally. The sections below cover four of them with what we built and measured.
The fifth, Presentation, is the video.

### Technological implementation: 219 PayPal features, tracked one by one

We listed every PayPal capability that could help pay for a job on proof, and tracked the status of each one.

| | |
|---|---|
| PayPal features evaluated | **219** |
| Implemented in code | **188** |
| Verified against the real PayPal sandbox by VeriPay's own client (`api/src/pay/paypal.js`) | **91** |

<details>
<summary>Full breakdown of the 219</summary>

| Status | Items |
|---|---|
| Verified against the real sandbox | 91 |
| Partly verified: PayPal accepted the call; the effect needs a buyer account, a phone or a real event | 37 |
| Built in the web app, waiting for a browser check | 29 |
| Only in the PayPal stand-in (e.g. the sandbox has no disputes to test against) | 16 |
| Refused by the sandbox, or needs PayPal approval or a public domain | 9 |
| Integrated, no separate record; or mixed status | 6 |
| Docs, copy or switches only | 6 |
| Not built, each with a reason (retired product, native app only, no developer docs) | 25 |

Item-by-item lists (written in Chinese, one row per PayPal feature with its status and evidence):
[docs/PAYPAL-整合總表.md](docs/PAYPAL-整合總表.md) (the first 61 items) and
[docs/PAYPAL-候選清單.md](docs/PAYPAL-候選清單.md) (158 more).

</details>

PayPal products in the code: Orders v2 (authorize, confirm-payment-source, capture, tracking), Payments v2 (capture,
reauthorize, void, refund, eligible methods), Vault v3, Payouts and Referenced Payouts, Invoicing v2, Payment Links,
Subscriptions and Catalog, Partner Referrals and merchant integrations, Log in with PayPal (OpenID Connect), the Risk
API (Set Transaction Context), Disputes, Webhooks (with signature verification and event replay), Transaction Search
and Balances, the JS SDK v6 (buttons, card fields, Fastlane, Google Pay, Pay Later messages), the PayPal Agent Toolkit
and PayPal's hosted MCP server. Every POST carries a `PayPal-Request-Id` so a retried call is the same call.

The AI is our own: five models served from one NVIDIA L4 GPU, with no hosted AI key.

| Model | Job | Measured on held-out sets |
|---|---|---|
| Done-Audit (Qwen3-0.6B + LoRA) | judges evidence against each condition | 1032 / 1033 verdicts right; 525 / 526 attacks hidden in evidence caught |
| Done-Chat (Qwen3-0.6B + LoRA) | the agent's conversation, work orders, negotiation | 120 / 120 negotiation moves right; 160 / 181 work orders with every field right |
| Done-VLM (SmolVLM2-500M) | describes each photo for Done-Audit | 24 / 24 demo photos named correctly |
| Done-OCR (our own detector + recogniser) | reads receipts and invoices | 27 / 30 receipt totals read to the cent |
| Done-Risk (LightGBM, not an LLM) | dispute and overrun probability, sizes the hold's buffer | within 0.003 AUC of the ceiling |

With the models deciding every condition, the judge tour takes about 23 seconds of server time. 390 API tests pass,
and 11 rounds of scripted AI-agent users (first-time visitor, judge, dishonest pro) are recorded in
[docs/live-test/](docs/live-test/). Models and their measured numbers: [docs/MODELS.md](docs/MODELS.md).

### Design: a complete product, not a proof of concept

![Six real pages, one per role](docs/img/bento.jpg)

There are about 28 pages for five roles, all working on the same jobs and the same money.

- Customer: one conversation with their agent (with a side panel for the job in focus on wide screens), job pages
  with offers, the hold, each condition's verdict and the money to the cent, groups of neighbours, a home record with
  warranties, and the page where they connect their own AI agent and set its limits in dollars.
- Pro: a phone-first job flow in English or Spanish (one photo prompt at a time, scan a receipt), earnings, payouts,
  invoices, onboarding with Log in with PayPal.
- Landlord and tenant: the tenant posts, the landlord's agent hires within the landlord's limits.
- Inspector and arbiter: confirm a milestone, settle a dispute with the evidence in front of them.
- Back office: every job, hold and payout in AG Grid and AG Charts, with reconciliation against PayPal's records.

A `/demo` page opens any step as the person it belongs to, and **Demo → Judge tour** walks the whole path in about
three minutes.

### Potential impact: the problem in numbers

| | Figure | Source |
|---|---|---|
| Market | US homeowners spend about **$525 billion** a year on improvements and repairs | [Harvard JCHS](https://www.jchs.harvard.edu/press-releases/remodeling-spending-continues-stagnate) via [docs/IMPACT.md](docs/IMPACT.md) |
| Who does the work | over **1.9 million** specialty trade contractors (79%) have no employees | [NAHB, Aug 2025](https://eyeonhousing.org/2025/08/most-home-builders-are-small-businesses/) |
| Homeowners | home improvement is the **No. 5** riskiest scam; **69.1%** of people targeted lost money; median loss **$1,405** (all scams: $93); worst 10%: **$14,050** | [BBB Scam Tracker Risk Report 2025](https://bbbmarketplacetrust.org/wp-content/uploads/2026/08/Risk-Report-2025-US.pdf) |
| Pros | **59%** of US small businesses have invoices 30+ days overdue (47% a year earlier); **49%** say payment timing causes cash-flow gaps | [QuickBooks 2026 Late Payments Report](https://quickbooks.intuit.com/r/small-business-data/small-business-late-payments-report-2026/) |
| Construction | **49%** of payments are made late | [Levelset 2019](https://levelset.com/blog/2019-national-construction-payments-report) |
| Why now | generative-AI referrals to US retail sites up **693.4%** in the 2025 holidays | [Adobe, 2026-01-07](https://news.adobe.com/news/downloads/pdfs/2026/01/010726-2025-holiday-shopping-season.pdf) |
| Reach | **440 million** active PayPal accounts on both sides of the job | [PayPal Q3 2026 earnings](https://www.sec.gov/Archives/edgar/data/0001633917/000163391726000086/pypl3q-26earningsrelease.htm) |

The FTC's own advice to homeowners is not to pay in full up front and to hold the final payment until the work is done.
VeriPay makes that the default. The money is authorized but not charged, and it moves when the proof passes, so the
pro is paid in minutes and doesn't have to chase an invoice. Every figure, with its quoted line, is in
[docs/IMPACT.md](docs/IMPACT.md), including what we could not verify and a realistic path to market.

### Innovation: what we did not find anywhere else

We looked at the marketplaces (Angi, Thumbtack, TaskRabbit, Upwork, Escrow.com) and at recent agentic-commerce work.
Research proposals for "verify, then pay" exist, mostly as crypto escrow contracts (TessPay, ERC-8183, the IETF PACT
draft). We did not find a deployed product for local services that does these four things:

1. An open agent-to-agent platform for local work. The customer's agent and each pro's agent talk over A2A (agent
   card at `/.well-known/agent-card.json`) and MCP (48 tools). Anyone can bring their own agent; VeriPay is not the only
   agent on the platform.
2. Agents do everything by default. The person says one sentence and confirms. Their agent writes the work order, gathers
   offers, hires, approves change orders and releases the money, all inside dollar limits only the person can change.
3. A negotiation layer. Price, visit time and extra costs are negotiated agent to agent, counter by counter, toward
   the typical price and never over the customer's ceiling. Every move is shown in a process view.
4. AI checks at every payment step. The hold is sized by a risk model, change orders and materials advances are
   matched against a receipt read by our OCR, and the release waits for each condition's verdict from our vision and
   audit models. The models give verdicts with reasons, code moves the money, and anything the models can't decide
   goes to a person.

![A note that tries to instruct the checker is flagged, and the money waits](docs/img/checks.jpg)

Marketplaces that truly hold funds (Upwork, Escrow.com) leave approval to a human; home-services marketplaces don't
hold funds and compensate after the fact. None writes a definition of done up front and checks evidence against it.
Details and sources: [docs/IMPACT.md](docs/IMPACT.md).

## Safety: what an agent can and cannot do

An agent can do the work, but it can't act as its person.

- The person sets the limits in dollars on the website. The agent can't raise them or change who gets paid.
- Everything only the person may do needs a PIN the agent never sees: limits and permissions, agent tokens, the price
  ceiling, confirming, releasing, waiving, approving a change order, applying a scope revision, and settling a dispute.
- The PIN has 4 to 6 digits, is set at demo sign-up and is stored only as a hash. Five wrong tries lock it for 15
  minutes. In production this step-up would be Log in with PayPal.
- An askPerson link opens the page but signs nobody in, and resuming a demo customer needs the PIN too.
- When the person requires it, their agent moves money only under an AP2-style mandate they signed. Each mandate is
  checked and logged (`api/src/proof/mandates.js`).
- If a note or receipt contains text that tries to instruct the checker, that text is removed before any model reads
  it, and the job is flagged and sent to a person.

## Try it

    npm run setup        # installs api/ and web/, builds the site
    npm run seed         # a believable demo month (stand-in PayPal)
    npm start            # http://localhost:8810

Open **Demo → Judge tour** for the three-minute path: post a job, agents negotiate, hold, evidence, checks, payout,
back office.

Two parts of our setup aren't public, so a fresh checkout behaves a little differently:

- PayPal: without `api/.env` the server uses a PayPal stand-in that follows PayPal's rules, and every id it makes
  is tagged SIMULATED on screen. With your own sandbox keys in `api/.env` (see `api/.env.example`), every call goes to
  the real PayPal sandbox.
- Our models run on our own GPU behind a token, so a fresh checkout has none. The app still runs end to end. Code
  still checks what it can decide on its own (when and where a photo was taken, reused photos, a receipt total that
  matches the approved change orders). Every condition that needs judgment goes to Review, where you confirm it as the
  customer, so no money is released on a condition nobody judged. The demo video shows the same tour with the models
  deciding.

Connect your own agent (Claude Code, Claude Desktop, or any MCP or A2A client): see **Connect your agent** on the site
or `/llms.txt`.

    npm test             # api tests (node --test)

## Code map

- `api/src/jobs.js`: the job state machine, from draft through scoped, offered, agreed, held, working, submitted and
  checking to released, with needs_fix, review, disputed, resolved, cancelled and expired. It covers holds and
  reauthorization, change orders, milestones and the ledger. Every cent adds up: capture = pro + helper + 10% fee, and
  refunds are recorded.
- `api/src/pay/`: the PayPal client (`paypal.js`) and the stand-in (`mock.js`).
- `api/src/scope.js`: writes the definition of done from one sentence.
- `api/src/check/`: checks the evidence condition by condition. Code reads the photo signals and the receipt; the
  models judge what the evidence shows; code decides.
- `api/src/mcp.js`, `tools.js`: the agent tools over MCP, REST and A2A. `pros.js` holds the demo pros and their
  negotiating agents.
- `api/src/proof/`: signed receipts in an append-only transparency log, and the mandate checks.
- More roles and payment options: landlords and tenants (the tenant posts, the landlord's PayPal pays), Pay Later on
  holds of $300+, Venmo payouts (the sandbox refuses Venmo wallets, so they fall back to PayPal and say so), tips (100%
  to the pro), scheduling (`calendar.js`), an inbox with a simulated email/SMS outbox (`inbox.js`, nothing is sent),
  Spanish for pros (`i18n.js`), and an insurance claim package for leak jobs (`reports.js`). The seed adds one of each.
- `web/`: the site (React + Vite). The back office uses AG Grid and AG Charts.
- `ml/`: our own small models, distilled from an open-weights teacher.

API reference: [docs/API.md](docs/API.md). Why it matters, with sources: [docs/IMPACT.md](docs/IMPACT.md). Real
sandbox runs and agent test rounds: [docs/live-test/](docs/live-test/).

## What's simulated

The PayPal sandbox and its stand-in; the demo pros, their agents and their addresses; the demo clock that can move
forward. VeriPay is not a licensed money transmitter. See "Honest limits" in [docs/IMPACT.md](docs/IMPACT.md) for
how a real launch would work.

## License

MIT, see [LICENSE](LICENSE).
