// /llms.txt: what an agent reads first. How to get a token, the tools, and the rules.
import { INSTRUCTIONS } from "./mcp.js";
export const guide = (base) => `# Cover

> Insurance for young people, settled with PayPal (sandbox): renters, homeowners, pet, term life, car and scooter.
> A quote in about 90 seconds, simple claims paid in minutes with PayPal Payouts, a flat 20% fee, and what is left of
> each cause's claims pool given to that cause at the end of the year. This server is a demonstration on PayPal's
> sandbox: Cover is not a licensed insurer and no real insurance is sold.

${INSTRUCTIONS}

## Connecting

- MCP (Streamable HTTP): ${base}/mcp with Authorization: Bearer cover_...
- REST: POST ${base}/api/agent/<tool> with JSON arguments, the same tools
- A2A: ${base}/.well-known/agent-card.json
- Your person makes the token on the website (Connect your agent), choosing its scopes: read, buy, claim.
  Testing with a demo account: POST ${base}/api/auth/demo {"name": "..."} (keeps a cookie), then POST ${base}/api/tokens
  {"label": "my agent"} with that cookie returns a token.

<!-- BEGIN partner skill (partners.js) -->
## Selling Cover at your checkout (partners)

A travel seller's checkout agent can offer, negotiate and bind trip cover for its customer, agent to agent.
- Key: Cover's staff issue a partner key (POST ${base}/api/staff/partners {"name", "email" (PayPal for the commission), "rate"}),
  kept only as a hash. Send it as Authorization: Bearer cvpk_...
- A2A: ${base}/a2a, message/send with one data part {"action": ..., ...}; or REST: POST ${base}/api/partner/<action>.
  1. offer_trip_cover {"trip": {"destination", "departure", "return", "flights": [{"flight", "date"}], "travelers", "oldest", "tripCost"}, "plan": "standard"}
     -> offer id (15 minutes), price, cover lines with clause ids, where the money goes, your commission.
  2. counter_offer {"offer", "plan": "flight"} or {"offer", "budget": 100}, once. Cover never discounts the risk price:
     it drops cover lines to fit a budget and names them, or says no and gives the lowest price.
  3. bind_cover {"offer", "customer": {"name", "email"}, "payer": "test_card" | "paypal"}: the policy is the customer's
     (a person at Cover by that email; flight payouts go to it). The premium is Cover's own PayPal order, beside your
     ticket order; "paypal" returns an approveUrl for your customer.
  4. cover_status {"sale"}: the payment, the policy, and your commission (paid with PayPal Payouts once the premium is
     captured, out of Cover's 20% fee, never the claims pool).
<!-- END partner skill -->

## Demo controls (this demo server only; off when DEMO_SIGNIN=0)

- POST ${base}/api/demo/flight {"flight": "UA837", "date": "YYYY-MM-DD", "status": "departed" | "cancelled" | "delayed", "delayMin": 150}
  reports a flight in the simulated flight feed. Insured travelers on a departed-late or cancelled flight are paid at once.
- POST ${base}/api/demo/advance {"days": 15} moves Cover's clock forward. GET ${base}/api/info shows Cover's "now".

## Money

All amounts the tools take are USD; what they return is formatted ($12.34). Every premium splits 20% to Cover's fee
and 80% to the claims pool of the person's cause; claims and reinsurance are paid from the pool. /api/transparency
shows every pool. Receipts for policies, claims and the giveback are signed and logged: ${base}/.well-known/cover-receipts.json
`;
