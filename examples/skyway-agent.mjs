// Skyway Travel's checkout agent, end to end against a Cover server: it reads Cover's agent card, asks for an offer on
// the trip in its cart, counters once with the buyer's budget, binds the cover for its customer, waits for Cover's
// premium to be captured and its commission paid. Every A2A message both agents send is printed.
//   node examples/skyway-agent.mjs                      (Cover at http://localhost:8816)
//   COVER_URL=http://localhost:8816 BUDGET=100 CUSTOMER_EMAIL=you@example.com node examples/skyway-agent.mjs
//   SKYWAY_KEY=cvpk_...  uses a partner key you already have; otherwise the script signs in as Cover staff (a demo
//                        server's one-click staff sign-in) and asks for a new key for Skyway.
// The payer: Cover's premium is its own PayPal order. With PAYPAL_TEST_CARD=1 on a sandbox server it is paid with
// PayPal's published sandbox test card (judges have no sandbox buyer login). Against the PayPal stand-in, the script
// plays the customer clicking "Agree" on the stand-in's approval page. Otherwise it prints the approveUrl and waits.
// Node 20+, no packages.
import crypto from "node:crypto";

const BASE = (process.env.COVER_URL || "http://localhost:8816").replace(/\/$/, "");
const day = (n) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
const log = (who, text, data) => console.log(`\n${who === "skyway" ? "→ Skyway's agent" : "← Cover's agent"}  ${text}${data ? `\n${JSON.stringify(data, null, 1).split("\n").map((l) => `   ${l}`).join("\n")}` : ""}`);

async function json(path, { method = "GET", body, headers = {} } = {}) {
  const r = await fetch(`${BASE}${path}`, { method, headers: { ...(body ? { "Content-Type": "application/json" } : {}), ...headers }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  return { r, j };
}
async function partnerKey() {
  if (process.env.SKYWAY_KEY) return process.env.SKYWAY_KEY;
  const { r } = await json("/api/auth/staff", { method: "POST", body: {} });
  if (!r.ok) throw new Error("Staff sign-in refused: set SKYWAY_KEY to a partner key.");
  const cookie = r.headers.get("set-cookie").split(";")[0];
  const { j } = await json("/api/staff/partners", { method: "POST", headers: { Cookie: cookie }, body: { id: "skyway", label: "skyway-agent.mjs" } });
  if (!j.key) throw new Error(`No partner key: ${j.message || j.error}`);
  console.log(`(staff issued a partner key for ${j.partner.name}: ${j.key.slice(0, 9)}…, commission ${j.partner.rate * 100}% to ${j.partner.paypal})`);
  return j.key;
}

let contextId = null;
async function say(key, text, data) {
  log("skyway", text, data);
  const { j } = await json("/a2a", { method: "POST", headers: { Authorization: `Bearer ${key}` }, body: { jsonrpc: "2.0", id: crypto.randomInt(1e9), method: "message/send", params: { message: { kind: "message", role: "user", messageId: crypto.randomUUID(), ...(contextId ? { contextId } : {}), parts: [{ kind: "text", text }, { kind: "data", data }] } } } });
  if (j.error) throw new Error(`A2A error ${j.error.code}: ${j.error.message}`);
  contextId = j.result.contextId;
  const answer = j.result.parts.find((p) => p.kind === "data").data;
  log("cover", j.result.parts.find((p) => p.kind === "text").text, pick(answer));
  return answer;
}
// the parts of an answer worth printing (the full answer is in the data part)
const pick = (a) => a.error ? { error: a.error } : a.sale ? { sale: a.sale, policy: a.policy && { number: a.policy.number, status: a.policy.status, price: a.policy.price }, payment: a.payment, commission: a.commission, ledger: a.ledger }
  : { offer: a.offer, plan: a.plan, price: a.price, expires: a.expires, covers: a.covers?.map((c) => `${c.clause} ${c.limit || ""}`.trim()), ...(a.dropped ? { dropped: a.dropped.map((d) => d.clause) } : {}), ...(a.floor ? { floor: a.floor } : {}), whereTheMoneyGoes: a.whereTheMoneyGoes };

const card = (await json("/.well-known/agent-card.json")).j;
const skill = card.skills?.find((s) => s.id === "partner_checkout");
if (!skill) throw new Error(`${BASE} has no partner_checkout skill in its agent card.`);
console.log(`Cover's agent card: ${card.name} at ${card.url}; skill "${skill.name}"`);
const info = (await json("/api/info")).j, key = await partnerKey();

// the cart: two travelers, San Francisco to Tokyo and back, three weeks out
const out = day(21), back = day(29);
const trip = { destination: "asia", departure: out, return: back, flights: [{ flight: "UA837", date: out, from: "SFO", to: "NRT" }, { flight: "UA838", date: back, from: "NRT", to: "SFO" }], travelers: 2, oldest: 34, tripCost: 642 };
const offer = await say(key, `A customer is booking 2 travelers, SFO to Tokyo ${out} and back ${back}. What would Standard trip cover cost?`, { action: "offer_trip_cover", trip, plan: "standard" });
if (offer.error) process.exit(1);

// the buyer's budget for protection: BUDGET, or by default a little under the Standard price (so Cover has to drop lines)
const budget = +(process.env.BUDGET || Math.floor(parseFloat(offer.price.slice(1)) * 0.75));
const counter = await say(key, `The customer will spend at most $${budget} on protection. Can you meet that?`, { action: "counter_offer", offer: offer.offer, budget });
const take = counter.error ? offer : counter;
console.log(`\n(Skyway's checkout shows: "Add flight-delay protection by Cover, ${take.price}". The customer adds it and pays.)`);

const email = process.env.CUSTOMER_EMAIL || `traveler+${crypto.randomBytes(3).toString("hex")}@example.com`;
let sale = await say(key, `The customer accepted ${take.offer} at checkout and is paying now. Bind it for them.`, { action: "bind_cover", offer: take.offer, customer: { name: process.env.CUSTOMER_NAME || "Mei Lin", email }, payer: info.testCard ? "test_card" : "paypal" });
if (sale.error) process.exit(1);

if (sale.payment?.approveUrl) {
  if (info.paypal === "mock") {
    // the PayPal stand-in's approval page: the customer clicks "Agree and continue"
    const u = new URL(sale.payment.approveUrl);
    await fetch(`${BASE}/mock-paypal/approve${u.search}`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: "a=yes", redirect: "manual" });
    console.log("\n(the customer approved Cover's premium on the PayPal stand-in's page)");
  } else console.log(`\n(the customer pays Cover's premium in PayPal: ${sale.payment.approveUrl})`);
}
for (let i = 0; i < 40 && !(sale.policy?.status === "active" && ["paid", "failed"].includes(sale.commission?.status)); i++) {
  if (i) await new Promise((r) => setTimeout(r, 3000));
  sale = await say(key, `Is ${sale.sale} paid?`, { action: "cover_status", sale: sale.sale });
}
console.log(`\nDone. Policy ${sale.policy.number} (${sale.policy.status}) for ${email}; premium PayPal capture ${sale.payment.paypalCapture}; Skyway's commission ${sale.commission.amount} via PayPal Payouts ${sale.commission.paypalPayout} (${sale.commission.from}).`);
