# Cover

AI insurance for young people where every dollar moves through PayPal: a quote in about 90 seconds, simple claims paid
in minutes, a flat 20% fee, and what is left of each cause's claims pool given to that cause at the end of the year.
Your own AI agent can quote, buy, change and claim for you over MCP, within limits only you set.

Work in progress for the PayPal AI Hackathon. The plan is in `../PLAN-cover.md`.

- `api/` the server: products and clauses (`src/products/*.json`), quotes (`quote.js`), policies and premiums
  (`policy.js`), the claims pool ledger (`pool.js`), PayPal (`pay/`), receipts in a transparency log (`proof/`).
- `ml/` Cover's own models, distilled on a GCP A100 from Muse Glimmer (Meta, open weights), following Serve's `jev/`.
- `web/` the website.

    npm run setup && npm start        # http://localhost:8800, with the PayPal stand-in unless api/.env has sandbox keys
    npm test

Cover is a demonstration on PayPal's sandbox. It is not a licensed insurer and sells no real insurance.
