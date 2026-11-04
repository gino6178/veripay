// The app's district hazard levels (api/src/zones.js) as JSON, so the portfolio generator (gen.py) and the exported
// model use exactly the levels quotes use.  node ml/risk/zones_export.mjs > ml/risk/zones.json
const { DISTRICTS, ZONE_FACTOR } = await import(new URL("../../api/src/zones.js", import.meta.url));
console.log(JSON.stringify({ districts: DISTRICTS, factor: ZONE_FACTOR }));
