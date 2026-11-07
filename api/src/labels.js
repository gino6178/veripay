// Reading a product label, rating plate or serial plate (a water heater's plate, a faucet box, a TV mount's rating
// sticker) and matching it to what the work order specified. Done-OCR's second job: the same Windows OCR engine and
// spacing repairs as receipts (ocr.js), then rules for plate fields. The VLM can read the same plate (vlm.js "label").
//
//   parseLabel(lines) -> { brand, model, serial, capacityGal, btu, volts, watts, manufactured, specs: [string], confidence }
//   readLabel(path, { ocr }) -> parseLabel(...) + { by, text, error? }
//   matchSpec(label, spec) -> { ok: boolean|null, mismatches: [string], matched: [string] }
//     spec: { brand?, model?, capacityGal?, btu?, volts? } (from the work order: scope.spec)
import { images, tidy } from "./ocr.js";

export const BRANDS = ["A.O. Smith", "AO Smith", "Bradford White", "Rheem", "Ruud", "State", "Whirlpool", "American Standard", "Rinnai", "Navien", "Noritz",
  "Moen", "Delta", "Kohler", "Pfister", "Glacier Bay", "Fluidmaster", "Korky", "Sanus", "Mounting Dream", "Echogear", "USG", "Sheetrock", "Behr", "Sherwin-Williams", "IKEA", "Demo Heat", "DemoFlow"];
const norm = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
// OCR confuses O/0, I/1, S/5 inside codes; compare codes on a folded alphabet
export const fold = (s) => norm(s).replace(/O/g, "0").replace(/[IL]/g, "1").replace(/S/g, "5").replace(/B/g, "8").replace(/Z/g, "2");

export function parseLabel(lines) {
  // OCR habits on plates: "X" read as ")(", a zero as "€" between digits; then the receipt spacing repairs (tidy)
  const L = (lines || []).map((l) => tidy(String(l).replace(/\)\(/g, "X").replace(/(\d[,.]?)€/g, "$10"))).filter(Boolean), T = L.join("\n");
  // a field's value: the first match that has a digit in it (a model or serial number does; "model and serial" in a
  // caption doesn't), else the first match
  const pick = (re) => { let first = null; for (const l of L) { const m = l.match(re); if (m) { const v = m[1].trim(); if (/\d/.test(v)) return v; first ??= v; } } return first; };
  const code = (s) => (s ? s.replace(/\s+/g, "").replace(/[^A-Za-z0-9\-./]/g, "").slice(0, 40) || null : null);
  const f = { brand: null, model: null, serial: null, capacityGal: null, btu: null, volts: null, watts: null, manufactured: null, specs: [] };
  // the brand: the earliest whole-word match, in the first lines (a plate's maker is printed at the top; "U.S. GAL"
  // must not read as "USG")
  const top = L.slice(0, 4).join("\n");
  let best = null;
  for (const b of BRANDS) {
    const re = new RegExp(`(^|[^A-Za-z])${b.replace(/[.]/g, "\\.?").replace(/\s+/g, "\\s*")}(?![A-Za-z])`, "i"), m = top.match(re);
    if (m && (!best || m.index < best.i || (m.index === best.i && b.length > best.b.length))) best = { b, i: m.index };
  }
  f.brand = best?.b || null;
  f.model = code(pick(/\b(?:MODEL\s*(?:NO|NUMBER)\.?|MODEL|MOD\.?|M\/N)(?![A-Z])\s*[:#.]?\s*([A-Z0-9][A-Z0-9 \-./]{2,30})/i));
  f.serial = code(pick(/\b(?:SERIAL\s*(?:NO|NUMBER)\.?|SERIAL|S\/N|SER\.?)(?![A-Z])\s*[:#.]?\s*([A-Z0-9][A-Z0-9 \-]{3,30})/i));
  const T2 = T.replace(/(\d{1,3}) ?, ?(\d{3})(?!\d)/g, "$1,$2");
  let m = T2.match(/(\d{2,3}(?:\.\d)?)\s?(?:U\.?\s?S\.?\s?)?GAL(?:LONS?|\.)?\b/i); if (m) f.capacityGal = +m[1];
  m = T2.match(/(\d{1,3}(?:,\d{3})+|\d{4,6})\s?BTU/i); if (m) f.btu = +m[1].replace(/,/g, "");
  m = T.match(/\b(\d{3})\s?V(?:OLTS?|AC)?\b/i); if (m) f.volts = +m[1];
  m = T.match(/\b(\d{3,5})\s?W(?:ATTS?)?\b/i); if (m) f.watts = +m[1];
  m = T.match(/\b(?:MFG|MFD|MANUFACTURED|DATE)\b[^0-9]{0,12}((?:\d{1,2}\/){1,2}\d{2,4}|\d{4}-\d{2}(?:-\d{2})?)/i); if (m) f.manufactured = m[1];
  if (f.capacityGal) f.specs.push(`${f.capacityGal} gal`);
  if (f.btu) f.specs.push(`${f.btu} BTU`);
  if (f.volts) f.specs.push(`${f.volts} V`);
  if (f.watts) f.specs.push(`${f.watts} W`);
  const got = [f.brand, f.model, f.serial].filter(Boolean).length;
  f.confidence = +(0.2 + 0.25 * got + (f.specs.length ? 0.1 : 0)).toFixed(2);
  return f;
}

export async function readLabel(path, { ocr } = {}) {
  const o = ocr || (await images([{ path, ocr: true }])).get(path);
  if (!o?.lines?.length) return { error: o?.error || "no text found on the label", by: "none" };
  return { ...parseLabel(o.lines), text: o.lines.join("\n").slice(0, 1000), by: o.ocrBy || `windows-ocr${o.lang ? ` (${o.lang})` : ""}` };
}

export function matchSpec(label, spec) {
  if (!spec || !label) return { ok: null, mismatches: [], matched: [] };
  const mismatches = [], matched = [];
  const cmp = (k, ok, say) => { if (spec[k] == null) return; if (label[k] == null) { mismatches.push(`${say}: not readable on the label`); return; } (ok ? matched : mismatches).push(`${say}: label ${label[k]}, order ${spec[k]}`); };
  cmp("brand", label.brand && norm(label.brand).includes(norm(spec.brand).slice(0, 6)), "brand");
  cmp("model", label.model && fold(label.model) === fold(spec.model), "model");
  cmp("capacityGal", label.capacityGal != null && Math.abs(label.capacityGal - spec.capacityGal) <= 1, "capacity (gal)");
  cmp("btu", label.btu != null && Math.abs(label.btu - spec.btu) <= spec.btu * 0.02, "BTU");
  cmp("volts", label.volts === spec.volts, "volts");
  return { ok: mismatches.length ? false : matched.length ? true : null, mismatches, matched };
}
