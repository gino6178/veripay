// Austin, TX, the demo city: ZIP code centroids (approximate, public USPS/Census ZCTA centers) and distances.
export const CITY = { name: "Austin", state: "TX", lat: 30.2672, lng: -97.7431 };
export const ZIPS = {
  78701: [30.2713, -97.7426], 78702: [30.2632, -97.7166], 78703: [30.2937, -97.7660], 78704: [30.2430, -97.7653],
  78705: [30.2950, -97.7392], 78721: [30.2717, -97.6834], 78722: [30.2895, -97.7151], 78723: [30.3048, -97.6851],
  78724: [30.2964, -97.6080], 78727: [30.4254, -97.7195], 78731: [30.3471, -97.7684], 78741: [30.2310, -97.7222],
  78744: [30.1777, -97.7395], 78745: [30.2069, -97.7956], 78746: [30.2960, -97.8098], 78748: [30.1653, -97.8238],
  78749: [30.2165, -97.8497], 78751: [30.3104, -97.7234], 78752: [30.3315, -97.7003], 78753: [30.3820, -97.6738],
  78756: [30.3223, -97.7395], 78757: [30.3516, -97.7330], 78758: [30.3876, -97.7071], 78759: [30.4037, -97.7526],
};
export const inAustin = (zip) => String(zip) in ZIPS;
export const where = (zip) => { const z = ZIPS[String(zip)]; return z ? { lat: z[0], lng: z[1] } : { lat: CITY.lat, lng: CITY.lng }; };
// great-circle distance, miles
export function miles(a, b) {
  const R = 3958.8, rad = (d) => (d * Math.PI) / 180, dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
export const meters = (a, b) => miles(a, b) * 1609.344;
