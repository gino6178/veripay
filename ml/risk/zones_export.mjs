// The app's US hazard levels (api/src/zones.js) as JSON for the portfolio generator (fit.py): every 3-digit ZIP
// prefix is run through the app's own zoneOf(), so each sampled policy gets exactly the levels a quote would use
// (state table, sharpened by the metro prefixes). Prefixes no state claims are left out.
//   node ml/risk/zones_export.mjs > ml/risk/zones.json
const Z = await import(new URL("../../api/src/zones.js", import.meta.url));
const prefixes = [];
for (let p = 0; p < 1000; p++) {
  const zip = `${String(p).padStart(3, "0")}01`, z = Z.zoneOf(zip);
  if (!z.state) continue;
  prefixes.push({ prefix: zip.slice(0, 3), state: z.state, area: z.area, metro: z.source.startsWith("metro"), levels: Object.fromEntries(Z.PERILS.map((k) => [k, z[k]])) });
}
console.log(JSON.stringify({ perils: Z.PERILS, factor: Z.ZONE_FACTOR, prefixes }));
