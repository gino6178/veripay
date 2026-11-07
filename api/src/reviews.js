// The review agent: what other customers say about a business before the customer's agent asks or hires it.
// Google reviews come only through Google's Places API (New), with the operator's own key (GOOGLE_PLACES_API_KEY):
// never scraped. Without a key there are no Google reviews: the agent says so and links to the business on Google
// Maps. The read is written by code from the reviews (rating, how many, themes people mention, things to ask), never
// by a model; Google's content is shown with its authors and links, and kept in memory for an hour only.
const PLACES = "https://places.googleapis.com/v1/places:searchText";
const FIELDS = "places.id,places.displayName,places.formattedAddress,places.rating,places.userRatingCount,places.googleMapsUri,places.reviews";
const cache = new Map(), HOUR = 3600e3;
export const googleKeySet = () => !!process.env.GOOGLE_PLACES_API_KEY;
export const mapsSearch = (name, address) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([name, address, "Austin TX"].filter(Boolean).join(" "))}`;

// what reviews tend to say, good and bad; each bad one comes with what to ask the pro
const THEMES = [
  ["on time", /\b(on time|punctual|prompt|arrived (early|on time)|showed up (early|on time|when))/i, "good"],
  ["fair price", /\b(fair price|fairly priced|reasonabl|affordable|honest (price|quote)|good price|great price|price was (fair|great|reasonable))/i, "good"],
  ["explains the work", /\b(explain|walked (me|us) through|kept (me|us) (informed|updated)|great communication|communicat)/i, "good"],
  ["cleans up", /\b(clean(ed)? up|tidy|neat|left (it|the (place|area|house)) clean)/i, "good"],
  ["fixed it right", /\b(fixed (it|the (problem|issue|leak))|works (great|perfectly)|no more (leak|drip)|first (try|time))/i, "good"],
  ["overcharging", /\b(overcharg|rip.?off|too expensive|hidden fee|upsell|price (doubled|went up)|charged (me|us) more)/i, "bad", "Get the price in writing first (a VeriPay offer is a fixed price; more needs your approval)."],
  ["no-shows or late", /\b(no.?show|never showed|didn'?t show|stood (me|us) up|hours late|late again|kept rescheduling)/i, "bad", "Ask them to confirm the visit window (VeriPay books it and logs any change)."],
  ["problem came back", /\b(still leak|leak(ed|ing)? again|came back|had to call (them )?back|broke again|redo|didn'?t fix)/i, "bad", "Ask about their warranty (VeriPay can hold back part of the pay until it ends)."],
  ["hard to reach", /\b(never (called|returned|got back)|no response|couldn'?t reach|ghosted|won'?t answer)/i, "bad", "Ask how they keep you updated during the job."],
  ["rude", /\b(rude|unprofessional|attitude|disrespectful)/i, "bad", null],
];
// the read: a verdict line, what people praise, what to watch, what to ask
export function readReviews({ rating = null, count = 0, reviews = [] } = {}) {
  const hits = (kind) => THEMES.filter((t) => t[2] === kind).map(([name, re, , ask]) => ({ name, n: reviews.filter((r) => re.test(r.text || "")).length, ask })).filter((t) => t.n > 0).sort((a, b) => b.n - a.n);
  const good = hits("good"), watch = hits("bad"), low = reviews.filter((r) => r.rating != null && r.rating <= 2).length;
  const verdict = rating == null || !count ? "No ratings to go on."
    : count < 10 ? `${rating.toFixed(1)}★ from only ${count} review${count === 1 ? "" : "s"}: too few to lean on.`
    : rating >= 4.6 ? `${rating.toFixed(1)}★ from ${count} reviews: a strong record.`
    : rating >= 4.0 ? `${rating.toFixed(1)}★ from ${count} reviews: good, with some complaints worth a look.`
    : `${rating.toFixed(1)}★ from ${count} reviews: mixed; check before hiring.`;
  return { verdict, praised: good.map((t) => `${t.name} (${t.n})`), watch: watch.map((t) => `${t.name} (${t.n})`), lowRecent: low, ask: watch.map((t) => t.ask).filter(Boolean),
    basis: `Read by code from the ${reviews.length} most relevant review${reviews.length === 1 ? "" : "s"} Google returns, plus the overall rating and count.` };
}

// one business on Google: { available, rating, count, mapsUrl, reviews, read } or { available: false, why, mapsUrl }
export async function googleReviews({ name, address = null, lat = null, lng = null }) {
  const fallback = { available: false, mapsUrl: mapsSearch(name, address) };
  if (!googleKeySet()) return { ...fallback, why: "No Google key on this server (GOOGLE_PLACES_API_KEY): open the business on Google Maps to read its reviews." };
  const k = `${name}|${address}`, hit = cache.get(k);
  if (hit && Date.now() - hit.at < HOUR) return hit.v;
  try {
    const body = { textQuery: [name, address, "Austin TX"].filter(Boolean).join(", "), maxResultCount: 1, ...(lat != null ? { locationBias: { circle: { center: { latitude: lat, longitude: lng }, radius: 3000 } } } : {}) };
    const r = await fetch(PLACES, { method: "POST", headers: { "content-type": "application/json", "X-Goog-Api-Key": process.env.GOOGLE_PLACES_API_KEY, "X-Goog-FieldMask": FIELDS }, body: JSON.stringify(body), signal: AbortSignal.timeout(8000) });
    if (!r.ok) return { ...fallback, why: `Google Places answered ${r.status}.` };
    const p = (await r.json()).places?.[0];
    if (!p) return { ...fallback, why: "Google has no listing that matches this business." };
    const reviews = (p.reviews || []).map((x) => ({ rating: x.rating ?? null, text: x.text?.text || x.originalText?.text || "", when: x.relativePublishTimeDescription || null, at: x.publishTime || null, author: x.authorAttribution?.displayName || "A Google user", authorUrl: x.authorAttribution?.uri || null, url: x.googleMapsUri || null }));
    const v = { available: true, source: "Google", name: p.displayName?.text || name, address: p.formattedAddress || address, rating: p.rating ?? null, count: p.userRatingCount ?? 0, mapsUrl: p.googleMapsUri || fallback.mapsUrl, reviews, read: readReviews({ rating: p.rating ?? null, count: p.userRatingCount ?? 0, reviews }) };
    cache.set(k, { at: Date.now(), v });
    return v;
  } catch (e) { return { ...fallback, why: `Couldn't reach Google Places (${e.name === "TimeoutError" ? "timed out" : e.message}).` }; }
}
