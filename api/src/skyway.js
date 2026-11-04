// Skyway Travel's checkout agent, as the /partners demo page runs it: the seller's side of the conversation. It is a
// separate party from Cover in everything but the process it runs in: it holds only Skyway's partner key and talks to
// Cover's agent over HTTP, A2A JSON-RPC at /a2a, exactly as examples/skyway-agent.mjs does from outside.
// Its rules are the seller's: ask for Standard cover first, pass on the buyer's budget for protection if they set one,
// and bind what the buyer accepted at checkout.
import crypto from "node:crypto";
import { now } from "./clock.js";

const day = (n) => new Date(now() + n * 864e5).toISOString().slice(0, 10);
// the booking in the demo cart: two travelers, San Francisco to Tokyo and back, three weeks out (Cover's clock)
export function cart() {
  const out = day(21), back = day(29);
  return { seller: "Skyway Travel (demo)", travelers: 2, oldest: 34, destination: "asia", departure: out, return: back,
    flights: [{ flight: "UA837", date: out, from: "SFO", to: "NRT" }, { flight: "UA838", date: back, from: "NRT", to: "SFO" }],
    ticket: { what: "Round trip SFO ⇄ NRT, 2 travelers, economy", each: 64200, total: 128400, paidWith: "Skyway's own PayPal checkout (simulated in this demo)" }, tripCost: 642 };
}

// One message to Cover's agent and its answer, both kept whole for the page to show
export async function send(url, key, { text, data, contextId }) {
  const sent = { jsonrpc: "2.0", id: crypto.randomInt(1e9), method: "message/send", params: { message: { kind: "message", role: "user", messageId: crypto.randomUUID(), ...(contextId ? { contextId } : {}), parts: [{ kind: "text", text }, { kind: "data", data }] } } };
  const t = Date.now();
  const r = await fetch(url, { method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, body: JSON.stringify(sent), signal: AbortSignal.timeout(30e3) });
  const received = await r.json().catch(() => ({ error: { message: `HTTP ${r.status}` } }));
  return { sent, received, ms: Date.now() - t, at: new Date().toISOString() };
}

// The seller's moves. step: offer | counter | bind | status
export function message(step, x = {}) {
  const c = cart();
  if (step === "offer") return { text: `Skyway checkout: a customer is booking ${c.travelers} travelers, SFO to Tokyo ${c.departure} and back ${c.return}, $${c.tripCost} prepaid each. What would Standard trip cover cost?`,
    data: { action: "offer_trip_cover", trip: { destination: c.destination, departure: c.departure, return: c.return, flights: c.flights, travelers: c.travelers, oldest: c.oldest, tripCost: c.tripCost }, plan: "standard" } };
  if (step === "counter") return x.plan
    ? { text: `The customer wants flight cover only. Counter on ${x.offer}: plan ${x.plan}.`, data: { action: "counter_offer", offer: x.offer, plan: x.plan } }
    : { text: `The customer will spend at most $${x.budget} on protection. Can you meet that?`, data: { action: "counter_offer", offer: x.offer, budget: +x.budget } };
  if (step === "bind") return { text: `The customer accepted ${x.offer} at checkout and is paying now. Bind it for them.`, data: { action: "bind_cover", offer: x.offer, customer: x.customer, payer: x.payer } };
  if (step === "status") return { text: `Is ${x.sale} paid?`, data: { action: "cover_status", sale: x.sale } };
  return null;
}
