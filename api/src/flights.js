// Flights: what Cover knows about each insured flight, and the price of insuring it. Travel cover pays on facts, not
// on forms: a flight that departs 2 hours late or is cancelled pays every traveler on the policy automatically
// (parametric, TR-2.1 and TR-2.2), so the only evidence is the flight's status, recorded here with the time Cover
// first saw each change (which also enforces TR-3.1: a disruption already known when the policy was bought isn't
// covered).
// The status source here is a simulated feed: each flight's route and schedule are drawn from its number, and it
// departs on time unless the demo panel (or a test) reports a delay or a cancellation. A live source (an airline-data
// API) plugs in as statusSource; nothing else changes. Every record says which source it came from.
import crypto from "node:crypto";
import { store, stateFile } from "./store.js";
import { now, nowIso } from "./clock.js";

const db = store(stateFile("flights"), { reports: {}, seen: {} });
export const flightsStore = db;
let statusSource = null;
export const setStatusSource = (fn) => { statusSource = fn; };

const HUBS = ["SFO", "LAX", "JFK", "EWR", "ORD", "ATL", "DFW", "DEN", "SEA", "MIA", "BOS", "IAH", "AUS", "PHX"];
const ABROAD = { americas: ["YYZ", "YVR", "CUN", "MEX", "SJU"], europe: ["LHR", "CDG", "FRA", "AMS", "MAD", "FCO"], asia: ["NRT", "HND", "ICN", "TPE", "SIN", "HKG", "SYD"], other: ["DXB", "GRU", "JNB", "DOH"] };
// how often a flight from each hub leaves 2 h late, 6 h late, or is cancelled: rough, stated, and the same numbers the
// price is built on (a busy northeast or Chicago hub in winter is worse than Phoenix)
const RATE = { EWR: [0.11, 0.025, 0.025], ORD: [0.10, 0.022, 0.022], JFK: [0.10, 0.02, 0.02], BOS: [0.09, 0.02, 0.02], DEN: [0.09, 0.018, 0.018], ATL: [0.08, 0.016, 0.015], DFW: [0.09, 0.018, 0.02], IAH: [0.08, 0.016, 0.016], MIA: [0.08, 0.016, 0.016], SFO: [0.08, 0.015, 0.014], LAX: [0.07, 0.013, 0.012], SEA: [0.06, 0.012, 0.012], AUS: [0.07, 0.013, 0.013], PHX: [0.05, 0.01, 0.009] };
const DEFAULT_RATE = [0.08, 0.016, 0.015];
const h = (s) => crypto.createHash("sha256").update(s).digest();
export const keyOf = (flight, date) => `${flight}@${date}`;

// "UA857 2026-12-20, ua 858 2027-01-03" or [{ flight, date }] → [{ flight: "UA857", date: "2026-12-20" }]
export function parseFlights(v) {
  const items = Array.isArray(v) ? v.map((x) => (typeof x === "string" ? x : `${x.flight} ${x.date}`)) : String(v || "").split(/[\n,;]+/);
  const out = [], bad = [];
  for (const raw of items.map((s) => s.trim()).filter(Boolean)) {
    const m = raw.toUpperCase().match(/^([A-Z0-9]{2})\s*(\d{1,4})\s+(\d{4}-\d{2}-\d{2})$/);
    if (!m || Number.isNaN(Date.parse(`${m[3]}T00:00:00Z`))) bad.push(raw); else out.push({ flight: `${m[1]}${m[2]}`, date: m[3] });
  }
  return { flights: out.slice(0, 8), bad };
}

// a flight's route and schedule, the same every time it is asked for
export function routeOf({ flight, date }, region = "domestic") {
  const b = h(flight), from = HUBS[b[0] % HUBS.length], pool = region === "domestic" ? HUBS.filter((x) => x !== from) : ABROAD[region] || ABROAD.other;
  const to = pool[b[1] % pool.length], dep = 6 * 60 + (b[2] % 64) * 15; // between 06:00 and 21:45
  return { flight, date, from, to, scheduled: `${date}T${String(Math.floor(dep / 60)).padStart(2, "0")}:${String(dep % 60).padStart(2, "0")}:00`, rates: RATE[from] || DEFAULT_RATE };
}

// The status Cover holds for a flight now: scheduled, delayed (estimated), departed (with its delay) or cancelled
export async function statusOf(f, region) {
  const r = routeOf(f, region), k = keyOf(f.flight, f.date);
  let s = db.data.reports[k];
  if (!s && statusSource) { try { s = await statusSource(r); } catch {} }
  if (!s) s = Date.parse(`${r.scheduled}Z`) <= now() ? { status: "departed", delayMin: 0 } : { status: "scheduled", delayMin: 0 };
  const rec = { ...r, status: s.status, delayMin: s.delayMin || 0, reportedAt: s.at || null, source: s.source || (db.data.reports[k] ? "demo report (simulated feed)" : statusSource ? "live source" : "simulated feed: on time unless reported"), at: nowIso() };
  // the first time Cover saw each status (TR-3.1 compares it with when the policy was bought)
  const seen = (db.data.seen[k] ||= {}), mark = rec.status === "cancelled" ? "cancelled" : rec.delayMin >= 120 ? "disrupted" : null;
  if (mark && !seen[mark]) { seen[mark] = rec.at; db.save(); }
  rec.firstSeenDisrupted = seen.cancelled || seen.disrupted || null;
  return rec;
}

// The demo panel (and tests): report a flight delayed, departed late, or cancelled
export function report({ flight, date, status = "departed", delayMin = 0 }) {
  const p = parseFlights([{ flight, date }]).flights[0];
  if (!p || !["delayed", "departed", "cancelled", "scheduled"].includes(status)) return { error: "flight", message: "flight like UA857, date YYYY-MM-DD, status delayed | departed | cancelled" };
  db.data.reports[keyOf(p.flight, p.date)] = { status, delayMin: Math.max(0, Math.min(2880, Math.round(+delayMin || 0))), at: nowIso() };
  db.save();
  return { flight: p.flight, date: p.date, status, delayMin: db.data.reports[keyOf(p.flight, p.date)].delayMin };
}

// What a trip costs to insure: each flight's chance of each payout, emergency medical by region, days and age, and
// cancellation as a share of the prepaid cost. Cents; the reasons in the same shape as quote.js's.
const MED = { domestic: 0, americas: 90, europe: 110, asia: 120, other: 140 }; // cents a traveler-day, Standard, age 30
export function estimateTrip(a) {
  const { flights } = parseFlights(a.flights), n = +a.travelers || 1, why = [];
  const days = Math.max(1, Math.round((Date.parse(a.return) - Date.parse(a.departure)) / 864e5) + 1);
  let flight = 0;
  for (const f of flights) {
    const [p2, p6, pc] = routeOf(f, a.destination).rates, e = n * (p2 * 10000 + p6 * 20000 + pc * 30000);
    flight += e; why.push({ factor: "flight", value: `${f.flight} ${f.date} from ${routeOf(f, a.destination).from}`, effect: `${(p2 * 100).toFixed(0)}% chance of 2 h late, ${(pc * 100).toFixed(1)}% of cancellation` });
  }
  let medical = 0, cancel = 0;
  if (a.plan !== "flight") {
    const ageF = a.oldest >= 70 ? 3 : a.oldest >= 60 ? 2 : a.oldest >= 45 ? 1.3 : 1;
    medical = Math.round(MED[a.destination] * days * n * ageF * (a.plan === "plus" ? 1.6 : 1));
    cancel = Math.round(+a.tripCost * 100 * n * 0.025);
    if (medical) why.push({ factor: "medical", value: `${days} days, ${a.destination}, oldest ${a.oldest}`, effect: `$${(medical / 100).toFixed(2)} expected medical` });
    if (cancel) why.push({ factor: "cancellation", value: `$${(+a.tripCost * n).toFixed(0)} prepaid`, effect: "2.5% chance of a covered cancellation" });
  }
  const bags = Math.round(n * 0.02 * 20000);
  return { claims: Math.round(flight) + medical + cancel + bags, why, days, flights };
}
