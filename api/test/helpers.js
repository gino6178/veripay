// Shared setup for the tests: the PayPal stand-in, the rules (no model), uploads in a temporary folder, in-memory state.
import os from "node:os";
import path from "node:path";
process.env.PAYPAL_MODE = "mock";
process.env.DONE_AI = "rules";
process.env.DONE_WEATHER ??= "off"; // no network in tests (reports.test turns it on with a stand-in)
process.env.DONE_DEMO_PRO_DELAY_MS ||= "0"; // demo pros offer at once in tests
process.env.DONE_DEMO_PRO_WORK_MS ||= "-1"; // and never work by themselves (tests drive them)
process.env.DONE_UPLOADS ||= path.join(os.tmpdir(), `done-test-uploads-${process.pid}`);

export const { mockPaypal } = await import("../src/pay/mock.js");
export const { setPay, pp, setHoldMode } = await import("../src/pay/index.js");
export const J = await import("../src/jobs.js");
export const pros = await import("../src/pros.js");
export const people = await import("../src/people.js");
export const clock = await import("../src/clock.js");
export const ev = await import("../src/evidence.js");
export const tools = await import("../src/tools.js");
export const receipts = await import("../src/proof/receipts.js");
export const { setAI } = await import("../src/ai.js");

export const fresh = (opts = {}) => { const m = mockPaypal({ file: null, publicUrl: "http://test", ...opts }); setPay(m, "http://test"); return m; };
fresh();
export const person = (o = {}) => people.makePerson({ name: "Test Customer", zip: "78704", ...o });
export const P = (p) => ({ kind: "person", person: p.id });
export const AGENT = (p, client = "test agent") => ({ kind: "agent", person: p.id, client, scopes: ["read", "hire", "pay"] });
export const PRO = (id) => ({ kind: "pro_agent", pro: id, client: "test pro agent" });
const FAUCET = "Kitchen faucet keeps dripping. Fix it this week, $200 max.";

// a job with offers in
export async function offered(c, { text = FAUCET, budget = 20000 } = {}) {
  const j = await J.createJob(c.id, { text, zip: "78704", budget, actor: P(c) });
  await J.requestOffers(j.id, P(c));
  return J.job(j.id);
}
// a job hired and held with the (stand-in's) test card at the cheapest offer
export async function held(c, opts = {}) {
  const j = await offered(c, opts);
  const o = j.offers.filter((x) => x.status === "open").sort((a, b) => a.amount - b.amount)[0];
  const r = await J.acceptOffer(j.id, o.id, { actor: opts.actor || P(c), payWith: opts.payWith || (c.vault ? "saved" : "card") });
  if (r.error) throw new Error(`${r.error}: ${r.message}`);
  return J.job(j.id);
}
// a photo from "the pro's phone": taken now (or at `taken`), at the job's address (or `at`)
// a job's photos are taken 12 minutes apart, as on a real visit (timed conditions like "10 minutes after the repair"
// are checked from the cameras' times): the first 45 minutes ago, never later than now
const shots = new Map();
const autoTaken = (j) => { const k = shots.get(j.id || j) || 0; shots.set(j.id || j, k + 1); return new Date(clock.now() - Math.max(-5, 45 - 12 * k) * 60e3).toISOString(); };
export const photo = (j, { taken = autoTaken(j), at = { lat: j.address.lat + 0.0002, lng: j.address.lng - 0.0002 }, salt = Math.random() } = {}) =>
  ev.withExif(Buffer.concat([ev.TINY_JPEG.slice(0, -2), Buffer.from(String(salt)), ev.TINY_JPEG.slice(-2)]), { taken, lat: at?.lat, lng: at?.lng });
// the evidence for the faucet job's three done-conditions
export function faucetEvidence(j, { receiptText = "TOTAL 35.00", c1 = {}, c2 = {} } = {}) {
  return [{ kind: "photo", buf: photo(j, c1), mime: "image/jpeg", checkId: "c1" }, { kind: "photo", buf: photo(j, c2), mime: "image/jpeg", checkId: "c2" },
    { kind: "receipt", buf: photo(j), mime: "image/jpeg", checkId: "c3", text: receiptText }];
}
export async function deliver(j, items = faucetEvidence(j)) {
  const p = j.agreed.pro;
  const a = J.addEvidence(p, j.id, items, PRO(p));
  if (a.error) return a;
  return J.submit(p, j.id, PRO(p));
}
// every cent: captured = pro + helper + fee + refunds
export const cents = (j) => J.balance(J.job(j.id));
