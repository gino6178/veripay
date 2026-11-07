// Licence and insurance checks for pros (parity #17). Texas licenses plumbers through the Texas State Board of Plumbing
// Examiners (TSBPE); its licence numbers are a class letter and a number: M-12345 (Master Plumber), J-12345
// (Journeyman), T-12345 (Tradesman Plumber-Limited), RMP-12345 (Responsible Master Plumber). Texas has no state licence
// for handyman or house-cleaning work. This demo has no access to TSBPE's live lookup, so it checks the format and looks
// the number up in a DEMO registry (fictional records, every one labelled), never a real person's licence.
export const TSBPE = /^(M|J|T|RMP)-\d{5}$/;
export const CLASSES = { M: "Master Plumber", J: "Journeyman Plumber", T: "Tradesman Plumber-Limited", RMP: "Responsible Master Plumber" };
export const REGISTRY_LABEL = "DEMO registry in TSBPE's format: fictional records, not a lookup of TSBPE's real database";
const DEMO = {
  "M-90417": { holder: "Rosa Delgado", status: "active", expires: "2027-06-30" },
  "M-90392": { holder: "Darnell Brooks", status: "active", expires: "2027-02-28" },
  "M-90405": { holder: "Kim Nguyen", status: "active", expires: "2027-09-30" },
  "M-90422": { holder: "Sam Whitaker", status: "active", expires: "2026-12-31" },
  "J-90431": { holder: "Ana Morales", status: "active", expires: "2027-03-31" },
  "J-50311": { holder: "Expired Example", status: "expired", expires: "2025-08-31" },
};
export const normalizeLicence = (s) => { const t = String(s || "").toUpperCase().replace(/[\u2010-\u2015]/g, "-").replace(/\(.*?\)/g, " ").replace(/^\s*(TX|TEXAS)[\s#:]*/, "").trim(); const m = t.match(/^(RMP|M|J|T)\s*-?\s*(\d{5})$/); return m ? `${m[1]}-${m[2]}` : t; };
export function licenceLookup(number, { trade = "plumbing", holder = null } = {}) {
  const n = normalizeLicence(number);
  if (trade !== "plumbing") return { required: false, why: "Texas has no state licence for this trade (handyman and cleaning work isn't licensed by the state).", registry: REGISTRY_LABEL };
  if (!TSBPE.test(n)) return { required: true, valid: false, number: n || null, why: "Not a TSBPE licence number (M-, J-, T- or RMP- and five digits).", registry: REGISTRY_LABEL };
  const r = DEMO[n], cls = CLASSES[n.split("-")[0]];
  if (!r) return { required: true, valid: false, number: n, class: cls, why: "Not found in the licence registry.", registry: REGISTRY_LABEL };
  const ok = r.status === "active" && Date.parse(r.expires) > Date.now() && (!holder || holder.toLowerCase() === r.holder.toLowerCase());
  return { required: true, valid: ok, number: n, class: cls, holder: r.holder, status: r.status, expires: r.expires, why: ok ? "Active in the licence registry." : r.status !== "active" ? `The licence is ${r.status}.` : holder && holder.toLowerCase() !== r.holder.toLowerCase() ? "The licence belongs to someone else." : "Expired.", registry: REGISTRY_LABEL, checkedAt: new Date().toISOString() };
}
// an insurance certificate (COI): carrier, policy number, general-liability limit, expiry. Valid when it isn't
// expired and covers at least $300,000 (a common floor for home-service marketplaces).
export function insuranceCheck({ carrier, policy, limit, expires } = {}) {
  const lim = Math.round(+limit || 0), exp = Date.parse(expires || "");
  const problems = [];
  if (!String(carrier || "").trim()) problems.push("no carrier");
  if (!/^[A-Z0-9-]{6,24}$/i.test(String(policy || ""))) problems.push("no policy number");
  if (!(lim >= 30000000)) problems.push("general liability under $300,000");
  if (!(exp > Date.now())) problems.push("expired or no expiry date");
  return { valid: !problems.length, carrier: carrier || null, policy: policy || null, limit: lim || null, expires: expires || null, problems, checkedAt: new Date().toISOString() };
}
