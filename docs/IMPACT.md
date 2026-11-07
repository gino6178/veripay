# VeriPay: potential impact

Research note for the "Potential Impact" criterion of the PayPal AI Hackathon. VeriPay lets a person's AI agent
hire a local pro (plumber, cleaner, handyman): it writes a checkable definition of done, negotiates with the pro's
agent, holds the money with a PayPal authorization, checks the pro's photo and receipt evidence, and pays the pro with
PayPal the moment every check passes. Every figure below was checked on 2026-11-04 against the source linked next to
it. "Primary" means we read it in the publisher's own release, report, filing, statute or help page. "Reported" means
we could only read it in someone else's write-up, because the original was blocked to us. Anything marked
"estimate" or "our arithmetic" is ours, not the source's. Figures we could not verify are listed at the end and are not
used in the argument. The demo city is Austin, TX; every pro and company in the demo is fictional.

## The problem, numbers first

Homeowners spend about $520 billion a year on improvements and repairs, and most of the people doing the work are
tiny businesses: over 1.9 million specialty trade contractors (79% of all such establishments) have no employees at
all. Both sides of a small job take a risk on the other.

**The homeowner pays first and hopes.** In 2024 the FTC received 81,925 reports in its "Home Improvement, Repair, and
Solar" category. In BBB Scam Tracker's 2025 data, home improvement was the fifth riskiest scam type: 69.1% of the people
who reported one lost money, the median loss was $1,405, and the worst tenth of cases had a median loss of $14,050.
BBB describes the pattern in one line: solicitors "take payment without returning, do shoddy work", or invent problems
that raise the price. The FTC's own advice is the rule VeriPay automates: "Don't pay the full amount for the
project up front" and "never make the final payment until the work is done and you're satisfied with it."

**The pro does the work first and waits.** In Intuit QuickBooks' 2026 report, 59% of US small businesses had invoices
overdue by 30 days or more (up from 47% a year earlier), those with unpaid invoices were owed $17.7K on average, and
49% said standard payment processing times create cash-flow gaps. In construction, about half of payments (49%) are not
made on time. Angi, the largest US home services marketplace, charges its pros for leads "regardless of whether the Pro
ultimately provides the requested service", and none of the marketplaces we checked pays the pro the moment a
documented checklist is met.

**And the buyer is changing.** Traffic from generative AI tools to US retail sites rose 693.4% in the 2025 holiday
season. PayPal launched agentic commerce services in October 2025, and Thumbtack announced an app inside ChatGPT so users
can "hire skilled professionals" without leaving the chat. Agents can now find and book a pro. What is missing is a
machine-readable definition of "done" and a neutral party that holds the money until it is met.

## Sourced facts

### Market size and who does the work

| Fact | Figure | Year | Source | Quoted line |
|---|---|---|---|---|
| Homeowner spending on improvements and repairs (owner-occupied homes) | about $525 billion a year, flat through 2027-Q3 | projection made Oct 2026 | Reported: [Harvard JCHS, Leading Indicator of Remodeling Activity, "Remodeling Spending Continues to Stagnate"](https://www.jchs.harvard.edu/press-releases/remodeling-spending-continues-stagnate). JCHS is behind a bot check, so we read the quote through a search engine's extract, not the page | "We expect annual spending to hover around $525 billion through the third quarter of next year." |
| Same index, earlier release | $522 billion projected for 2026 | Jan 2026 | Reported: [Composite Panel Association, 2026-01-30](https://www.compositepanel.org/harvard-lira-predicts-remodeling-softening-through-2026/), reporting the JCHS release | "totaling a projected $522 billion for the year"; the LIRA "provides a short-term outlook on U.S. home improvement and repair spending for owner-occupied homes" |
| Specialty trade contractors with no employees | over 1.9 million, 79% of all specialty trade establishments, 9% of the trades' revenue | 2022 | Primary: [NAHB Eye on Housing, "Most Home Builders are Small Businesses", Aug 2025](https://eyeonhousing.org/2025/08/most-home-builders-are-small-businesses/), from the 2022 Economic Census and Census Nonemployer Statistics | "Over 1.9 million specialty trade independent contractors make up 79% of all STC establishments" |
| Plumbers | about 510,600 jobs, 8% self-employed, median pay $63,800 | 2025 | Primary: [BLS Occupational Outlook Handbook, Plumbers](https://www.bls.gov/ooh/construction-and-extraction/plumbers-pipefitters-and-steamfitters.htm) | "Plumbers, pipefitters, and steamfitters held about 510,600 jobs in 2025." "Most states require plumbers to be licensed." |
| Carpenters | about 889,700 jobs, 25% self-employed | 2025 | Primary: [BLS Occupational Outlook Handbook, Carpenters](https://www.bls.gov/ooh/construction-and-extraction/carpenters.htm) | "Carpenters held about 889,700 jobs in 2025." |
| Angi's network | about 111,000 average monthly active pros; about 16 million projects | 2025 | Primary: [Angi Inc. 10-K for 2025](https://www.sec.gov/Archives/edgar/data/1705110/000170511026000011/angi-20251231.htm) | "There were approximately 111,000 Average Monthly Active Pros ... during the three months ended December 31, 2025." |
| Thumbtack's network | about 300,000 service providers | 2025 | Primary: [Thumbtack release on Business Wire, 2025-10-06](https://www.businesswire.com/news/home/20251006760229/en/Thumbtack-Partners-with-OpenAI-to-Power-Home-Services-in-ChatGPT) | "Thumbtack's 300,000-strong community of service providers" |

The JCHS figure covers owner-occupied homes only; landlords' and renters' spending on repairs is not in it.

### Homeowner side: scams, complaints and losses

| Fact | Figure | Year | Source | Quoted line |
|---|---|---|---|---|
| FTC reports, Home Improvement, Repair, and Solar | 81,925 reports, rank 16 of 29 categories, 1.27% of 6,471,708 Sentinel reports | 2024 | Primary: [FTC Consumer Sentinel Network Data Book 2024, March 2025](https://www.ftc.gov/system/files/ftc_gov/pdf/csn-annual-data-book-2024.pdf), p. 7 | table "Report Categories": "16 Home Improvement, Repair, and Solar 81,925 1.27%" |
| What the FTC category covers | includes "problems with home repair services and contractors", but also appliances, warranties and solar, so not every report is about a contractor | 2024 | Same, Appendix B1 | "problems with home repair services and contractors" |
| All fraud reported to the FTC | 3 million fraud reports, $15.9 billion lost | 2025 | Primary: [FTC prepared statement to the Joint Economic Committee, 2026-03-25](https://www.ftc.gov/system/files/ftc_gov/pdf/ftc-testimony-jec-hearing-on-the-rising-scam-economy.pdf) | "In 2025, consumers submitted 3 million fraud reports to CSN and reported $15.9 billion" |
| BBB riskiest scams | home improvement No. 5 riskiest (No. 5 in 2024 too) | 2025 | Primary: [BBB Institute, 2025 BBB Scam Tracker Risk Report](https://bbbmarketplacetrust.org/wp-content/uploads/2026/08/Risk-Report-2025-US.pdf), Table 1 (more than 146,000 reported scams) | Table 1: "5 5 Home improvement 96.2 0.9% 1.4% 69.1% 70.1% $1,405 $1,800" |
| Share of people targeted who lost money | 69.1% | 2025 | Same | (susceptibility column, Table 1) |
| Median loss | $1,405 (2024: $1,800); the median for all scam types was $93 | 2025 | Same | (median loss column, Table 1) |
| Median loss in the worst 10% of cases | $14,050, third highest of any scam type after investment and romance scams | 2025 | Same, Table 2 | "3 Home improvement $14,050" |
| The pay-then-disappear pattern | taking payment and not returning, shoddy work, invented problems; often after storms | 2025 | Same, Appendix A definition | "Door-to-door solicitors offer quick, low-cost repairs and then either take payment without returning, do shoddy work, or 'find' issues that dramatically raise the price." |
| What the FTC tells homeowners to do | do not pay in full up front; hold the final payment until the work is done; some states cap down payments | current | Primary: [FTC, "How To Avoid a Home Improvement Scam"](https://consumer.ftc.gov/articles/how-avoid-home-improvement-scam) | "never make the final payment until the work is done and you're satisfied with it." |

FTC and BBB figures are reports people chose to file, not a count of all incidents. Both agencies say most losses go
unreported.

### Pro side: getting paid late or not at all

| Fact | Figure | Year | Source | Quoted line |
|---|---|---|---|---|
| Small businesses with invoices 30+ days overdue | 59%, up from 47% the year before | survey Dec 2025, published 2026-07-07 | Primary: [Intuit QuickBooks, 2026 Small Business Late Payments Report](https://quickbooks.intuit.com/r/small-business-data/small-business-late-payments-report-2026/) (1,305 US business owners, plus its quarterly survey of about 5,000) | "Nearly 3 in 5 businesses (59%) have invoices overdue by 30+ days, up from 47% last year." |
| Average amount owed | $17.7K, among businesses with unpaid invoices | same | Same | "Businesses with unpaid invoices are owed $17.7K on average." |
| Payment speed hurts cash flow | 49% say processing times cause critical or moderate cash-flow gaps; 59% paid extra fees to reach money already earned | same | Same | "49% of owners say standard payment processing times create critical or moderate cash-flow gaps." |
| Construction payments made late | 49% | survey Aug 2019 (503 construction professionals) | Primary: [Levelset with QuickBooks, 2019 National Construction Payments Report](https://levelset.com/blog/2019-national-construction-payments-report) | "About half (49%) of construction payments are not made on time." |
| Freelancers not paid at all for some work | 34% in the past year; 81% paid late; average unpaid $5,968 | 2015 (5,358 freelancers) | Reported: Freelancers Union 2015 nonpayment survey, as summarised in search results; we did not open the original report. Old and not trades-specific, so background only | |

The QuickBooks report has no breakdown for construction or trades. The Levelset figure is mostly commercial
construction, where subcontractors wait on general contractors; a homeowner job is simpler, but no source we found
measures how fast residential pros are paid by homeowners.

### Why now: AI agents and PayPal

| Fact | Figure | Year | Source | Quoted line |
|---|---|---|---|---|
| Generative AI referrals to US retail sites | up 693.4% year on year, Nov 1 to Dec 31 2025 | 2025 holiday | Primary: [Adobe release, 2026-01-07](https://news.adobe.com/news/downloads/pdfs/2026/01/010726-2025-holiday-shopping-season.pdf) (the PDF's dateline misprints the year as 2025) | "traffic to retail sites from generative AI tools (shoppers clicking on a link to a retail site) increased by 693.4% compared to the year prior" |
| The base is still small | Adobe's own caveat | same | Same | "While the base of users remains modest, the uptick shows the value AI can deliver as a shopping assistant." |
| Consumers ready to let an agent complete a purchase alone | 9%; 74% would delegate routine tasks on instruction | Jan 2026 (25,590 consumers, 16 countries, US included, no US split) | Primary: [Accenture, Consumer Pulse Research 2026](https://www.accenture.com/nz-en/insights/consulting/talk-my-ai-agent) | "surveyed a representative sample of 25,590 consumers in 16 countries" |
| PayPal agentic commerce services | agent ready (payments on AI surfaces for existing PayPal merchants) and store sync; agent ready due early 2026 | 2025-10-28 | Primary: [PayPal newsroom](https://newsroom.paypal-corp.com/2025-10-28-PayPal-Launches-Agentic-Commerce-Services-to-Power-AI-Driven-Shopping) | agent ready "instantly unlocks for the millions of existing PayPal merchants the ability to accept payments on AI surfaces" |
| PayPal in other agents | Copilot Checkout (Microsoft), Perplexity Instant Buy, Cymbio acquisition | Nov 2025 to Jan 2026 | Primary: PayPal newsroom, [Copilot Checkout 2026-01-08](https://newsroom.paypal-corp.com/2026-01-08-PayPal-Powers-Microsofts-Launch-of-Copilot-Checkout), [Cymbio 2026-01-22](https://newsroom.paypal-corp.com/2026-01-22-PayPal-to-Acquire-Cymbio,-Accelerating-Agentic-Commerce-Capabilities) | (headlines) |
| PayPal's reach on both sides | 440 million active accounts | Q3 2026 | Primary: [PayPal Q3 2026 earnings release, 8-K, 2026-10-27](https://www.sec.gov/Archives/edgar/data/0001633917/000163391726000086/pypl3q-26earningsrelease.htm) | "Active accounts increased 0.6% to 440 million." |
| Home services inside an AI assistant | Thumbtack app in ChatGPT for US users | 2025-10-06 | Primary: [Thumbtack on Business Wire](https://www.businesswire.com/news/home/20251006760229/en/Thumbtack-Partners-with-OpenAI-to-Power-Home-Services-in-ChatGPT) | users "will soon be able to seamlessly ask home questions and discover, connect with, and hire skilled professionals" |

PayPal's agentic launches so far are about buying goods from merchants' catalogues. Services that are paid only after
someone checks the work are not covered by them; that is the gap VeriPay fills, on PayPal's own rails.

### What comparable products do about the money

| Product | Holds money until done? | Verifies completion? | Source | Quoted line |
|---|---|---|---|---|
| Angi | Mostly a lead marketplace: pros pay per match; consumers can pay on-platform for "pre-priced" services | No checklist; a guarantee covers bookings paid through Angi | Primary: [Angi 10-K for 2025](https://www.sec.gov/Archives/edgar/data/1705110/000170511026000011/angi-20251231.htm). Angi's guarantee page blocked us | lead revenue "comprises fees paid by Pros for consumer matches (regardless of whether the Pro ultimately provides the requested service)" |
| Thumbtack | No; the customer pays the pro. Thumbtack refunds afterwards, up to $2,500, if the job isn't done as agreed and you notify it within 45 days | No; it asks you to "get everything in writing" and first mediates | Primary: [Thumbtack Guarantee](https://www.thumbtack.com/guarantee) | "If a pro takes payment and does not perform any work, the Money-Back Guarantee can cover up to $2500." |
| TaskRabbit | Card on file, charged after the task (some web bookings take a one-hour deposit) | The Tasker marks the job complete; no evidence check | Primary: [TaskRabbit Support, "Why Do You Need My Credit Card?"](https://support.taskrabbit.com/hc/en-us/articles/360035345851-Why-Do-You-Need-My-Credit-Card) | "you won't be charged until after the task is completed." |
| Upwork (fixed-price) | Yes, through a licensed escrow subsidiary; funds release automatically 14 days after the freelancer submits unless the client acts | The client approves; no automated check | Primary: [Upwork Legal Center, Fixed-Price Escrow Instructions and Payment Escrow Inc.](https://www.upwork.com/legal#fp) | "This escrow company holds California Department of Financial Protection and Innovation License No. 963 5086." |
| Upwork escrow is business-only | Not offered for household purposes | | Same | escrow services are "not for consumer, personal, family, or household purposes." |
| Escrow.com | Yes, as a licensed escrow company; aimed at goods, domains and vehicles | The buyer inspects and approves | Reported: BBB business profile lists a California DFPI escrow licence; we could not confirm it in DFPI's own search | |

The pattern: the companies that truly hold funds (Upwork, Escrow.com) do it with a state escrow licence and leave
approval to a human; the home services marketplaces don't hold funds and compensate after the fact. None writes the
definition of done up front or checks evidence against it.

### The rules

| Fact | Source | Quoted line |
|---|---|---|
| Federal definition of a money transmitter | Primary: [31 CFR 1010.100(ff)(5)](https://www.ecfr.gov/current/title-31/subtitle-B/chapter-X/part-1010/subpart-A/section-1010.100) | "money transmission services" means "the acceptance of currency, funds, or other value that substitutes for currency from one person and the transmission of ... to another location or person by any means." |
| Federal payment processor exception | Same, (ff)(5)(ii)(B) | a person who "Acts as a payment processor to facilitate the purchase of, or payment of a bill for, a good or service through a clearance and settlement system by agreement with the creditor or seller" |
| Texas: licence needed to transmit money | Primary: [Texas Finance Code §152.101](https://statutes.capitol.texas.gov/Docs/FI/htm/FI.152.htm) (Money Services Modernization Act, in force 2023-09-01) | "A person may not engage in the business of money transmission ... unless the person is licensed under this chapter." |
| Texas: agent-of-payee exemption, and its conditions | Same, §152.004(2) | exempt if there is a written agreement with the payee, the payee holds the agent out as accepting payments, and payment "is treated as received by the payee on receipt by the agent, the payor's obligation is extinguished, and there is no risk of loss to the payor if the agent fails to remit" |
| A PayPal authorization holds funds without capturing them | Primary: [PayPal Developer, Authorize a payment](https://developer.paypal.com/docs/checkout/standard/customize/authorization/) | "An authorization places a hold on the funds and is valid for 29 days." "capture the payment within the 3-day honor period." |
| PayPal can hold a marketplace payment for the seller | Primary: [PayPal Developer, Multiparty delayed disbursement](https://developer.paypal.com/docs/multiparty/checkout/delayed-disbursement/) | "Hold funds from a buyer before disbursing to the seller with delayed disbursement." "Funds are automatically disbursed to the seller after 28 days" |
| Marketplace fees on PayPal | Primary: [PayPal Developer, Multiparty](https://developer.paypal.com/docs/multiparty/) | partner fees let partners "charge commissions or brokerage fees for each transaction" |
| Payouts reach a pro by email or phone | Primary: [PayPal Developer, Payouts](https://developer.paypal.com/docs/payouts/) | "Recipients can claim payments through PayPal or Venmo with just an email or phone number." |
| Texas plumbing needs a licence and a responsible master plumber | Primary: [Texas Occupations Code §1301.351](https://statutes.capitol.texas.gov/Docs/OC/htm/OC.1301.htm) | "A person that advertises or otherwise offers to perform or provide plumbing must secure the services of a responsible master plumber." |
| Texas homeowners may do their own plumbing | Same, §1301.051 | "A property owner is not required to be licensed under this chapter to perform plumbing in the property owner's homestead." |

**How VeriPay stays out of custody.** In the demo, the money sits as a PayPal authorization on the employer's own
payment method until the checks pass; VeriPay never receives it during the job. On release it is captured and paid
out. Today's demo captures into the platform's PayPal account and then pays the pro and helper with Payouts, which
means the platform briefly holds the pro's money; that step is what money transmission law looks at (see Honest
limits). The production design removes it: use PayPal's marketplace (Multiparty) flow with the pro as the payee, so the
capture lands in the pro's own PayPal account and VeriPay's 10% arrives as a partner fee. PayPal, a licensed money
transmitter, holds and moves the money; VeriPay acts for the pro under a written agreement, which is the shape of
both the federal processor exception and Texas's agent-of-payee exemption. This is our reading, not legal advice, and
needs counsel's sign-off before launch.

## Who VeriPay serves

**Maria, 41, a homeowner in East Austin, TX.** Her kitchen faucet has been dripping for a week. She has read about
"pay half up front" handymen who never come back, which is the No. 5 riskiest scam in BBB's 2025 data, where 69.1% of
people targeted lost money and the median loss was $1,405. She tells her AI agent: "kitchen faucet leaks, fix it this
week, under $200." The agent writes the definition of done (new cartridge fitted, no drip after 10 minutes with the
water on, a receipt for the part), gets offers from three pros' agents, accepts one, and holds $200 on her PayPal. She
pays nothing until every item is checked, which is exactly the FTC's advice turned into software. If the pro never
shows, the authorization is voided and nothing was ever charged.

**Luis, 34, a licensed master plumber who runs a one-truck business in Austin with a part-time helper.** He is one of
the 1.9 million specialty trade businesses with no payroll. He does the job, then chases the invoice: like the 59% of
small businesses with invoices more than 30 days overdue, and the 49% who say payment timing squeezes their cash, he
floats parts and his helper's wages while he waits. On VeriPay he knows before he drives over that the money is
already held, and what "done" means. When his photos and the parts receipt pass the checks, he and his helper are paid
in the same minute, each to their own PayPal, with the platform's 10% shown on the receipt. No lead fees for jobs he
doesn't win.

Both personas are fictional; every number in them is a row above.

## How what the demo shows answers each pain

| Pain (from the numbers) | What the demo does | Where to see it |
|---|---|---|
| Homeowners pay up front and the pro disappears (BBB No. 5, median $1,405) | Money is held as a PayPal authorization, not paid. No pass, no capture; if the job is cancelled or expires, the hold is voided | job state machine `held → released / cancelled / expired` |
| "Done as agreed" is argued after the fact (Thumbtack and Angi compensate later) | The agent writes the definition of done before any offer; each item names the evidence that proves it. The work order is the contract | the scope page and work order |
| Fake or reused evidence | Each photo is checked for capture time and place (EXIF), reuse on another job (dHash), and receipt amounts (OCR); text inside evidence is treated as data, never as instructions | Done-Audit result per item |
| An AI deciding about money | The model only grades each item pass / needs fix / fail with a reason and confidence. A fixed rule decides payment: all pass pays, any needs-fix goes back to the pro, any fail or low confidence goes to the employer | check results and the release rule |
| Pros wait 30+ days to be paid | Release captures and pays the pro and helper with PayPal at once, each their own share, with ids on screen | release receipt with PayPal ids |
| Surprise extras ("we found another problem") | Change orders with photos; within the employer's cap the agent may approve, above it the employer must click | change-order flow |
| Agents need a way in | Employer's agent over MCP, pros' agents negotiate agent-to-agent, both within limits set by the person on the website | MCP and A2A endpoints |

Times from submission to payout should be quoted from recorded demo runs (`docs/live-test`), not from a target. At the
time of writing, `docs/live-test` has no recorded rounds yet.

## Honest limits

- **Sandbox only, and not legal advice.** VeriPay runs on PayPal's sandbox with fictional pros. The regulatory
  reading above is ours and needs a lawyer before real money moves.
- **The demo's payout step touches the money.** Capturing into the platform's account and then sending Payouts means
  the platform receives funds for a moment. A live product should use Multiparty with the pro as payee (or prove an
  exemption state by state). Payouts also needs PayPal's approval to use in production.
- **Authorizations are short.** An authorization lasts 29 days, with a 3-day honor period that needs reauthorizing.
  That fits a faucet or a cleaning, not a kitchen remodel; longer jobs need milestones, each held and released
  separately, or Multiparty delayed disbursement (up to 28 days).
- **Evidence checks can be fooled.** EXIF can be edited and photos staged. The checks raise the cost of cheating; they
  don't remove it. Low confidence goes to a person, and PayPal's dispute process remains the backstop.
- **"Done" is not "done well."** A photo shows a new cartridge, not that it will last a year. Warranties and
  workmanship disputes still need a human, and a check that fails a good pro unfairly hurts the pro side we want to
  serve.
- **Licensing.** Texas requires a licence and a responsible master plumber for plumbing for hire. A live product must
  verify each pro's licence (TSBPE for plumbing) and city permits where needed; the demo does neither for real.
- **The data has gaps.** FTC and BBB counts are self-reported. The QuickBooks late-payment figures cover all small
  businesses, not trades, and the construction figure is from 2019 and mostly commercial work.
- **Agent buying is early.** Only 9% of consumers in Accenture's 2026 survey would let an agent finish a purchase
  alone. That is why the employer sets the limits on the website and confirms anything above them.

## Realistic path to market

1. **Start as a PayPal marketplace in one city.** Austin, with jobs under about $500 that finish in a day: plumbing
   repairs, cleaning, handyman tasks, appliance installs. Short jobs fit inside one authorization, and photos plus a
   receipt can prove most of them.
2. **Use PayPal Multiparty from day one in production.** Pros onboard as PayPal sellers (PayPal handles their KYC), the
   capture goes straight to the pro, VeriPay takes a disclosed 10% partner fee. The platform never holds customer
   funds, which keeps it out of escrow and money-transmitter licensing for this flow.
3. **Recruit pros on payment speed, not leads.** No lead fees; paid the minute the checks pass. The pitch rests on the
   QuickBooks numbers (59% with invoices 30+ days overdue) and on Angi charging for matches whether or not the pro gets
   the job.
4. **Be the checkout agents call.** Expose the scope-hold-check-pay flow over MCP so any personal agent can hire
   through it, and pursue PayPal's agentic commerce channels for discovery.
5. **Grow by trade and by proof.** Add trades whose completion can be shown with evidence, add milestone holds for
   larger jobs, and publish the check pass rates and dispute rates so homeowners and pros can see the system works.
6. **Only if needed, license.** Holding funds beyond PayPal's windows, for months-long projects, would mean an escrow
   or money transmission licence (as Upwork does through a licensed subsidiary). That is a later choice, not the
   first step.

## What we could not verify

- **The JCHS page itself.** It is behind a bot check; the $525 billion quote comes from a search engine's extract and
  the $522 billion from a trade-press report of the earlier release.
- **The FTC's 2025 Data Book category table.** We found 2025 totals (testimony) but not the 2025 home improvement row,
  so the category count is from 2024.
- **Census Nonemployer Statistics directly.** The Census API now requires a key; we used NAHB's analysis of the same
  2022 data. Austin- or Texas-level counts of nonemployer plumbers are not in this note.
- **Angi's Happiness Guarantee terms.** angi.com blocked us; we describe Angi from its 10-K only.
- **Escrow.com's licence.** Seen only on a BBB profile, not in DFPI's licensee search.
- **How fast residential pros are paid by homeowners.** No reputable source we found measures it; the payment figures
  are for small businesses in general or for commercial construction.
- **Freelancers Union figures.** We did not open the 2015 report itself, and it is old; it is background only.
- **A US-only figure for consumers letting agents buy.** Accenture's survey includes the US but gives no US split.
- **Texas handyman and general contractor licensing.** We confirmed plumbing law only; we found no statewide source on
  handyman work in the time available, so the demo makes no claim about it.

## The paperwork burden (added 2026-11-05)

Trades businesses report spending a working day or more every week on paperwork. Every figure below comes from an
industry or software-vendor survey, not a government statistic, so we treat them as indications:

- **Small HVAC owners (1–10 employees):** an average of 15.4 hours a week, from a WorkHero survey run with HVAC School
  (WorkHero sells software), per [WorkHero](https://workhero.pro/about).
- **Heating and plumbing business owners:** an average of 7.1 hours a week on admin, from the 2025 Heating & Plumbing
  Report (UK) by
  [Gas Engineer Software](https://gasengineersoftware.co.uk/blog/heating-business-owners-spend-one-day-on-admin-time/).
- **Offshore help:** many US trades businesses buy back that time from offshore virtual assistants, mostly in the
  Philippines, at roughly $6.50/hr and up. These are vendor price lists, e.g.
  [VA Masters](https://vamasters.com/construction-admin-virtual-assistants/) and
  [Stealth Agents](https://stealthagents.com/virtual-assistant-for-contractors).

**What VeriPay does about it:** every job already holds the evidence, the checks and the money trail. From those,
the progress reports, the close-out package, the lien waivers and a bookkeeping export are generated, with nothing to
re-type.
