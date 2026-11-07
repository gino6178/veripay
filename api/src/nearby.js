// Who's near a job: the pros on VeriPay (verified, quoting through their agents) and the local trade businesses that
// OpenStreetMap lists around Austin (data/osm-austin-trades.json, a dated snapshot, ODbL: © OpenStreetMap contributors).
// Businesses that aren't on VeriPay are never contacted by VeriPay: the customer's agent can only prepare an invitation
// that the person sends themselves (their phone, their email).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { allPros, readiness } from "./pros.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SNAP = (() => { try { return JSON.parse(fs.readFileSync(path.join(HERE, "../data/osm-austin-trades.json"), "utf8")); } catch { return { places: [] }; } })();
export const OSM = { source: SNAP.source || "OpenStreetMap", license: SNAP.license || "ODbL 1.0: © OpenStreetMap contributors", fetched: SNAP.fetched || null };
// which listed businesses fit a trade
const FITS = { plumbing: ["plumbing"], handyman: ["handyman", "electrical", "plumbing"], cleaning: [] };
// great-circle distance in miles
export function miles(a, b) {
  const R = 3958.8, r = (d) => (d * Math.PI) / 180, dLat = r(b[0] - a[0]), dLng = r(b[1] - a[1]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(r(a[0])) * Math.cos(r(b[0])) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
const round1 = (x) => Math.round(x * 10) / 10;
export const listed = (id) => SNAP.places.find((p) => p.id === id) || null;

// nearest first: { onVeriPay: [...], local: [...] }
export function nearby({ lat, lng, trade = "plumbing", radiusMi = 15, limit = 8 } = {}) {
  const at = [lat, lng];
  const onVeriPay = allPros().filter((p) => p.trade === trade && !p.suspended && p.base?.lat != null)
    .map((p) => ({ id: p.id, name: p.name, trade: p.trade, miles: round1(miles(at, [p.base.lat, p.base.lng])), rating: p.rating ?? null, jobs: p.jobs ?? 0, hireable: readiness(p).hireable, onVeriPay: true, how: "Ask them: their agent answers on VeriPay, usually within minutes." }))
    .filter((p) => p.miles <= radiusMi).sort((a, b) => a.miles - b.miles).slice(0, limit);
  const fits = FITS[trade] || [trade];
  const local = SNAP.places.filter((p) => fits.includes(p.trade))
    .map((p) => ({ id: p.id, name: p.name, trade: p.trade, miles: round1(miles(at, [p.lat, p.lng])), address: [p.street, p.city, p.zip].filter(Boolean).join(", ") || null, phone: p.phone, website: p.website, osm: `https://www.openstreetmap.org/${p.id.replace("osm:", "")}`, onVeriPay: false, how: "Not on VeriPay: your agent can write an invitation for your person to send. VeriPay never contacts them." }))
    .filter((p) => p.miles <= radiusMi).sort((a, b) => a.miles - b.miles).slice(0, limit);
  return { onVeriPay, local, source: OSM };
}
