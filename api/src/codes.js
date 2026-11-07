// Texas code pre-screen, by rules: does this job likely need a permit, and a state-licensed trade? Rules of thumb for
// the demo city (Austin), shown with their source and a plain disclaimer; they flag, they don't decide. The scope writer
// adds them to the work order (permit and licence checks), the gap review lists them as dispute risks.
//
//   codePrescreen({ text, template, trade, zip }) -> {
//     permit: "required" | "likely" | "not_usually" | "unknown", licence: { needed: boolean, who: string|null },
//     rules: [{ id, says, cite }], addChecks: [checks the order must carry], suggestChecks?: [checks the gap review
//     proposes], inAustin: boolean|null, disclaimer }
const R = {
  plumbing_licence: { says: "Plumbing work for pay in Texas is done by, or under, a plumber licensed by the Texas State Board of Plumbing Examiners (TSBPE).", cite: "Texas Occupations Code ch. 1301" },
  water_heater_permit: { says: "Replacing a water heater needs a plumbing permit and an inspection in Austin (and most Texas cities).", cite: "City of Austin Development Services (plumbing permits)" },
  gas_permit: { says: "Gas piping or a gas appliance connection needs a permit and a licensed plumber with a gas endorsement.", cite: "Texas Occupations Code ch. 1301; City of Austin" },
  electrical_licence: { says: "Electrical wiring for pay needs a Texas Department of Licensing and Regulation (TDLR) licensed electrician; new circuits or outlets usually need a permit.", cite: "Texas Occupations Code ch. 1305" },
  hvac_licence: { says: "Air-conditioning and heating work needs a TDLR-licensed ACR contractor; equipment replacement usually needs a permit.", cite: "Texas Occupations Code ch. 1302" },
  structural_permit: { says: "Removing or changing walls, framing or structure needs a building permit.", cite: "City of Austin Development Services (building permits)" },
  minor_repair: { says: "Like-for-like repairs (a faucet cartridge, a flapper, a clog) don't usually need a permit; the plumbing licence rule still applies to work for pay.", cite: "City of Austin; Texas Occupations Code ch. 1301" },
  no_permit: { says: "Cosmetic and assembly work (drywall patch, paint, furniture, cleaning, mounting a TV without new wiring) doesn't usually need a permit or a state licence.", cite: "City of Austin" },
};
const rule = (id) => ({ id, ...R[id] });
const DISCLAIMER = "Rules of thumb for the demo, not legal advice: confirm with the City of Austin Development Services Department and the TSBPE or TDLR.";
const c = (id, what, evidence) => ({ id, what, evidence, rule: evidence === "photo" ? "photo>=1;in_window;near_job;not_reused" : evidence === "note" ? "note>=1;words>=4" : "receipt>=1;read;in_window" });

export function codePrescreen({ text = "", template = null, trade = null, zip = null } = {}) {
  const t = String(text).toLowerCase(), out = { permit: "unknown", licence: { needed: false, who: null }, rules: [], addChecks: [] };
  const inAustin = zip ? /^787\d{2}$/.test(String(zip)) : null;
  const gas = /\bgas\b/.test(t), electric = /\b(wir(e|ing)|outlet|circuit|breaker|panel|ceiling fan|light fixture|electrical|in-wall power|recessed power)\b/.test(t);
  const hvac = /\b(a\/?c|air condition|hvac|furnace|heat pump|condenser|ductwork)\b/.test(t), structural = /\b(remove|knock (down|out)|load.?bearing|new wall|frame|framing|beam)\b/.test(t) && /\bwall|beam|frame/.test(t);
  if (template === "water_heater" || /water heater/.test(t)) {
    out.permit = "required"; out.licence = { needed: true, who: "TSBPE-licensed plumber" };
    out.rules.push(rule("water_heater_permit"), rule("plumbing_licence"));
    out.addChecks.push(c("permit", "Photo or scan of the plumbing permit for this address (number, issue date)", "photo"), c("licence", "Note with the plumber's TSBPE licence number", "note"));
  } else if (trade === "plumbing" || ["faucet", "drain", "toilet"].includes(template)) {
    out.permit = "not_usually"; out.licence = { needed: true, who: "TSBPE-licensed plumber" };
    out.rules.push(rule("minor_repair"));
    out.suggestChecks = [c("licence", "Note with the plumber's TSBPE licence number", "note")];
  } else if (!electric && !hvac && !gas && !structural) { out.permit = "not_usually"; out.rules.push(rule("no_permit")); }
  if (gas) { out.permit = "required"; out.licence = { needed: true, who: "TSBPE-licensed plumber with a gas endorsement" }; out.rules.push(rule("gas_permit")); }
  if (electric) { out.permit = out.permit === "required" ? "required" : "likely"; out.licence = { needed: true, who: out.licence.who ? `${out.licence.who}; TDLR-licensed electrician` : "TDLR-licensed electrician" }; out.rules.push(rule("electrical_licence")); }
  if (hvac) { out.permit = out.permit === "required" ? "required" : "likely"; out.licence = { needed: true, who: "TDLR-licensed ACR contractor" }; out.rules.push(rule("hvac_licence")); }
  if (structural) { out.permit = "required"; out.rules.push(rule("structural_permit")); }
  return { ...out, inAustin, disclaimer: inAustin === false ? `${DISCLAIMER} This ZIP is outside Austin: check that city's rules.` : DISCLAIMER };
}
