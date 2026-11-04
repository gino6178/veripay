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

## Money

All amounts the tools take are USD; what they return is formatted ($12.34). Every premium splits 20% to Cover's fee
and 80% to the claims pool of the person's cause; claims and reinsurance are paid from the pool. /api/transparency
shows every pool. Receipts for policies, claims and the giveback are signed and logged: ${base}/.well-known/cover-receipts.json
`;
