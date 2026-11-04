// Where a policy is, as risk: a US ZIP code (or "City, ST") to its state and five hazard levels, each 1 (low), 2
// (middle) or 3 (high): flood, wildfire, hurricane, earthquake and theft. These levels are rough and stated as such: by
// state from public pictures of each hazard (FEMA flood exposure, the Forest Service's Wildfire Risk to Communities,
// the Atlantic and Gulf hurricane coasts, USGS seismic hazard including the New Madrid zone, FBI property-crime rates),
// sharpened for a few metro ZIP prefixes where a state's average misleads (Houston, Miami, New Orleans, the Bay Area).
// Cover-Risk (ml/risk) is fitted on a portfolio drawn from this same table; every quote says which table priced it.
const T = (flood, wildfire, hurricane, quake, theft) => ({ flood, wildfire, hurricane, quake, theft });
export const STATES = {
  AL: ["Alabama", T(2, 1, 2, 1, 2)], AK: ["Alaska", T(1, 2, 1, 3, 3)], AZ: ["Arizona", T(1, 2, 1, 1, 2)], AR: ["Arkansas", T(2, 1, 1, 2, 3)],
  CA: ["California", T(1, 3, 1, 3, 2)], CO: ["Colorado", T(1, 3, 1, 1, 3)], CT: ["Connecticut", T(2, 1, 2, 1, 1)], DE: ["Delaware", T(2, 1, 2, 1, 2)],
  DC: ["District of Columbia", T(1, 1, 1, 1, 3)], FL: ["Florida", T(3, 1, 3, 1, 2)], GA: ["Georgia", T(2, 1, 2, 1, 2)], HI: ["Hawaii", T(2, 2, 2, 2, 2)],
  ID: ["Idaho", T(1, 2, 1, 2, 1)], IL: ["Illinois", T(2, 1, 1, 2, 2)], IN: ["Indiana", T(2, 1, 1, 1, 2)], IA: ["Iowa", T(2, 1, 1, 1, 1)],
  KS: ["Kansas", T(1, 1, 1, 1, 2)], KY: ["Kentucky", T(2, 1, 1, 2, 2)], LA: ["Louisiana", T(3, 1, 3, 1, 3)], ME: ["Maine", T(1, 1, 1, 1, 1)],
  MD: ["Maryland", T(2, 1, 2, 1, 2)], MA: ["Massachusetts", T(2, 1, 2, 1, 1)], MI: ["Michigan", T(1, 1, 1, 1, 2)], MN: ["Minnesota", T(1, 1, 1, 1, 2)],
  MS: ["Mississippi", T(3, 1, 3, 2, 2)], MO: ["Missouri", T(2, 1, 1, 2, 2)], MT: ["Montana", T(1, 2, 1, 2, 2)], NE: ["Nebraska", T(1, 1, 1, 1, 1)],
  NV: ["Nevada", T(1, 2, 1, 2, 2)], NH: ["New Hampshire", T(1, 1, 1, 1, 1)], NJ: ["New Jersey", T(2, 1, 2, 1, 1)], NM: ["New Mexico", T(1, 2, 1, 1, 3)],
  NY: ["New York", T(2, 1, 2, 1, 1)], NC: ["North Carolina", T(2, 1, 3, 1, 2)], ND: ["North Dakota", T(2, 1, 1, 1, 1)], OH: ["Ohio", T(1, 1, 1, 1, 2)],
  OK: ["Oklahoma", T(1, 2, 1, 2, 2)], OR: ["Oregon", T(1, 2, 1, 2, 3)], PA: ["Pennsylvania", T(2, 1, 1, 1, 1)], RI: ["Rhode Island", T(2, 1, 2, 1, 1)],
  SC: ["South Carolina", T(2, 1, 3, 2, 2)], SD: ["South Dakota", T(1, 1, 1, 1, 1)], TN: ["Tennessee", T(2, 1, 1, 2, 3)], TX: ["Texas", T(2, 2, 2, 1, 2)],
  UT: ["Utah", T(1, 2, 1, 2, 2)], VT: ["Vermont", T(1, 1, 1, 1, 1)], VA: ["Virginia", T(2, 1, 2, 1, 1)], WA: ["Washington", T(1, 2, 1, 3, 3)],
  WV: ["West Virginia", T(2, 1, 1, 1, 1)], WI: ["Wisconsin", T(1, 1, 1, 1, 1)], WY: ["Wyoming", T(1, 2, 1, 1, 1)],
};
// first three ZIP digits → state (USPS sectional centers, in ranges)
const RANGES = [[10, 27, "MA"], [28, 29, "RI"], [30, 38, "NH"], [39, 49, "ME"], [50, 59, "VT"], [60, 69, "CT"], [70, 89, "NJ"], [100, 149, "NY"], [150, 196, "PA"], [197, 199, "DE"],
  [200, 205, "DC"], [206, 219, "MD"], [220, 246, "VA"], [247, 268, "WV"], [270, 289, "NC"], [290, 299, "SC"], [300, 319, "GA"], [320, 349, "FL"], [350, 369, "AL"], [370, 385, "TN"],
  [386, 397, "MS"], [398, 399, "GA"], [400, 427, "KY"], [430, 459, "OH"], [460, 479, "IN"], [480, 499, "MI"], [500, 528, "IA"], [530, 549, "WI"], [550, 567, "MN"], [570, 577, "SD"],
  [580, 588, "ND"], [590, 599, "MT"], [600, 629, "IL"], [630, 658, "MO"], [660, 679, "KS"], [680, 693, "NE"], [700, 714, "LA"], [716, 729, "AR"], [730, 749, "OK"], [750, 799, "TX"],
  [800, 816, "CO"], [820, 831, "WY"], [832, 838, "ID"], [840, 847, "UT"], [850, 865, "AZ"], [870, 884, "NM"], [885, 885, "TX"], [889, 898, "NV"], [900, 961, "CA"], [967, 968, "HI"],
  [970, 979, "OR"], [980, 994, "WA"], [995, 999, "AK"]];
// metro ZIP prefixes where the state's average is wrong
const METRO = {
  "770": ["Houston", { flood: 3, hurricane: 3 }], "773": ["Houston", { flood: 3, hurricane: 3 }], "775": ["Galveston", { flood: 3, hurricane: 3 }], "787": ["Austin", { flood: 2, hurricane: 1, wildfire: 2 }],
  "331": ["Miami", { flood: 3, hurricane: 3, theft: 3 }], "330": ["Miami", { flood: 3, hurricane: 3 }], "701": ["New Orleans", { flood: 3, hurricane: 3, theft: 3 }],
  "941": ["San Francisco", { quake: 3, wildfire: 1, theft: 3 }], "900": ["Los Angeles", { quake: 3, wildfire: 3, theft: 3 }], "902": ["Los Angeles", { quake: 3, wildfire: 3 }],
  "981": ["Seattle", { quake: 3, theft: 3 }], "972": ["Portland", { quake: 2, theft: 3 }], "100": ["New York", { flood: 2, hurricane: 2, theft: 1 }], "112": ["Brooklyn", { flood: 2, hurricane: 2 }],
  "606": ["Chicago", { theft: 3 }], "802": ["Denver", { wildfire: 2, theft: 3 }], "852": ["Phoenix", { wildfire: 2 }], "891": ["Las Vegas", { wildfire: 1 }],
  "381": ["Memphis", { quake: 3, theft: 3 }], "631": ["St. Louis", { quake: 2, theft: 3 }], "191": ["Philadelphia", { flood: 2, theft: 2 }], "021": ["Boston", { flood: 2, hurricane: 2 }],
};
const NAMES = Object.fromEntries(Object.entries(STATES).map(([k, [n]]) => [n.toLowerCase(), k]));

// A place someone typed ("78704", "Austin, TX 78704", "Brooklyn, New York"): its state, ZIP and levels, and where
// the levels came from
export function zoneOf(place) {
  const s = String(place || "").trim(), zip = s.match(/\b(\d{5})(?:-\d{4})?\b/)?.[1];
  let st = null, metro = null;
  if (zip) { const p = +zip.slice(0, 3); st = RANGES.find(([a, b]) => p >= a && p <= b)?.[2] || null; metro = METRO[zip.slice(0, 3)] || null; }
  if (!st) { const m = s.match(/(?:,|\s)\s*([A-Z]{2})\b(?!.*\b[A-Z]{2}\b)/); if (m && STATES[m[1]]) st = m[1]; }
  if (!st) { const low = s.toLowerCase(); for (const [n, k] of Object.entries(NAMES)) if (low.includes(n)) { st = k; break; } }
  if (!st) return { state: null, zip: zip || null, area: null, ...T(2, 2, 2, 2, 2), source: "national average (place not recognised)" };
  const lv = { ...STATES[st][1], ...(metro?.[1] || {}) };
  return { state: st, zip: zip || null, area: metro ? `${metro[0]}, ${st}` : STATES[st][0], ...lv, source: metro ? `metro table for ${metro[0]} (rough, see zones.js)` : "state table (rough, see zones.js)" };
}
// how much each level changes the expected claims
export const ZONE_FACTOR = { flood: [0, 0.9, 1.0, 1.35], wildfire: [0, 0.9, 1.0, 1.4], hurricane: [0, 0.9, 1.0, 1.4], quake: [0, 0.9, 1.0, 1.3], theft: [0, 0.85, 1.0, 1.25] };
export const PERILS = ["flood", "wildfire", "hurricane", "quake", "theft"];
