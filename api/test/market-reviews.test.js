// Where a price sits in the market, the stuck-negotiation warning, and the review agent (Google Places, mocked).
import test, { after } from "node:test";
import assert from "node:assert/strict";
import "./helpers.js";
process.env.DONE_NO_LISTEN = "1";
delete process.env.GOOGLE_PLACES_API_KEY;
const { app } = await import("../src/server.js");
const J = await import("../src/jobs.js");
const pros = await import("../src/pros.js");
const R = await import("../src/reviews.js");
const { forRef } = await import("../src/activity.js");
const srv = app.listen(0);
after(() => srv.close());
const base = `http://127.0.0.1:${srv.address().port}`;
const customer = (j) => ({ kind: "agent", person: j.customer, client: "test agent" });
async function offeredJob() {
  let ck = "";
  const c = async (method, p, body) => { const r = await fetch(base + p, { method, headers: { "content-type": "application/json", cookie: ck }, body: body ? JSON.stringify(body) : undefined }); for (const x of r.headers.getSetCookie?.() || []) ck = x.split(";")[0]; return r.json(); };
  await c("POST", "/api/auth/demo", { as: "customer" });
  const j = await c("POST", "/api/jobs", { text: "Kitchen faucet drips, fix it this week", zip: "78704", budget: 300, requestOffers: true });
  for (let i = 0; i < 40 && !J.job(j.id).offers.length; i++) await new Promise((r) => setTimeout(r, 100));
  return J.job(j.id);
}

test("market: a price below, within and above the job's typical range, with the raw cents for the bar", async () => {
  const j = await offeredJob();
  const mid = J.marketFor(j, 20000), r = mid.cents;
  assert.ok(r.low < r.high);
  assert.equal(J.marketFor(j, r.low - 1).where, "below");
  assert.equal(J.marketFor(j, Math.round((r.low + r.high) / 2)).where, "within");
  assert.equal(J.marketFor(j, r.high + 1).where, "above");
  assert.match(J.marketFor(j, r.high + 1).says, /above the typical range/);
  if (mid.percentile != null) { assert.ok(mid.percentile >= 0 && mid.percentile <= 100); assert.ok(mid.paidJobs >= 3); }
});

test("negotiation view tells the customer where both prices sit, and warns once when the customer is out of moves", async () => {
  const j = await offeredJob(), o = j.offers[0], p = pros.pro(o.pro), was = p.agent;
  p.agent = "external";
  try {
    const proSide = { kind: "pro_agent", pro: p.id, client: "pro agent" };
    let ask = o.amount, mine = Math.round(ask * 0.6);
    for (let i = 0; i < 3; i++) {
      const r = await J.negotiate(j.id, o.id, { move: "propose", amount: mine }, customer(j));
      assert.ok(!r.error, r.message);
      assert.ok(r.negotiation.market.theirs.says && r.negotiation.market.yours.says);
      if (i < 2) { ask -= 1; assert.ok(!(await J.negotiate(j.id, o.id, { move: "propose", amount: ask }, proSide)).error); mine += 1; }
    }
    const v = J.negotiationOf(j.id, o.id, customer(j));
    assert.ok(v.stuck, "the view says it's stuck");
    assert.ok(v.stuck.why && v.stuck.suggest);
    assert.equal(J.negotiationOf(j.id, o.id, proSide).market, undefined, "the pro doesn't see the customer's market read");
    await J.negotiate(j.id, o.id, { move: "propose", amount: ask - 1 }, proSide);
    const told = forRef(j.id).filter((a) => a.action === "negotiation_stuck");
    assert.equal(told.length, 1, "told once");
  } finally { p.agent = was; }
});

test("review agent: a VeriPay pro gets its record here; a listed business falls back to Google Maps without a key", async () => {
  const j = await offeredJob(), n = J.findNearby(j.id, {}, customer(j));
  const ids = [n.onVeriPay[0].id, ...(n.local[0] ? [n.local[0].id] : []), "nope"];
  const r = await J.checkReviews(j.id, { ids }, customer(j));
  assert.match(r.google, /^off/);
  assert.equal(r.results[0].onVeriPay, true); assert.match(r.results[0].source, /VeriPay/); assert.ok(r.results[0].read.verdict);
  if (n.local[0]) { assert.equal(r.results[1].available, false); assert.match(r.results[1].mapsUrl, /google\.com\/maps/); }
  assert.equal(r.results.at(-1).error, "unknown");
  assert.equal((await J.checkReviews(j.id, { ids: [] }, customer(j))).error, "ids");
});

test("review agent: reads themes from review text, and parses a Places answer (fetch mocked)", async () => {
  const read = R.readReviews({ rating: 4.2, count: 40, reviews: [
    { rating: 5, text: "Arrived on time and cleaned up after." }, { rating: 1, text: "They overcharged me, hidden fee on the bill." }, { rating: 2, text: "The leak came back a week later." } ] });
  assert.match(read.verdict, /4\.2/);
  assert.ok(read.praised.some((x) => x.startsWith("on time"))); assert.ok(read.watch.some((x) => x.startsWith("overcharging")));
  assert.ok(read.ask.length >= 2); assert.equal(read.lowRecent, 2);
  process.env.GOOGLE_PLACES_API_KEY = "test-key";
  const real = globalThis.fetch;
  let sent;
  globalThis.fetch = async (url, init) => { sent = { url, init }; return new Response(JSON.stringify({ places: [{ displayName: { text: "Mocked Plumbing" }, formattedAddress: "1 Test St, Austin, TX", rating: 4.8, userRatingCount: 120, googleMapsUri: "https://maps.google.com/?cid=1",
    reviews: [{ rating: 5, text: { text: "Fixed the leak first time, fair price." }, relativePublishTimeDescription: "a month ago", authorAttribution: { displayName: "Pat", uri: "https://www.google.com/maps/contrib/1" } }] }] }), { status: 200 }); };
  try {
    const g = await R.googleReviews({ name: "Mocked Plumbing (unique)", address: "1 Test St" });
    assert.match(String(sent.url), /places:searchText/); assert.equal(sent.init.headers["X-Goog-Api-Key"], "test-key");
    assert.equal(g.available, true); assert.equal(g.rating, 4.8); assert.equal(g.count, 120);
    assert.equal(g.reviews[0].author, "Pat"); assert.match(g.read.verdict, /strong/);
  } finally { globalThis.fetch = real; delete process.env.GOOGLE_PLACES_API_KEY; }
});
