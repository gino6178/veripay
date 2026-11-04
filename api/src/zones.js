// Where a policy is, as risk: each Taiwan district's level (1 low, 2 middle, 3 high) for flooding, earthquakes,
// typhoon wind and theft. These first levels are rough: flood from the districts' low-lying share and the government's
// flood-potential maps in outline, quake from the active faults nearby, typhoon from the east and south coasts'
// exposure, theft from the police's reported thefts per person. Cover-Risk (ml/risk) replaces them with levels fitted
// from the open data itself; until then every quote says the level came from this table.
const T = (flood, quake, typhoon, theft) => ({ flood, quake, typhoon, theft });
export const DISTRICTS = {
  "臺北市": { 中正區: T(1, 2, 1, 2), 大同區: T(2, 2, 1, 2), 中山區: T(2, 2, 1, 3), 松山區: T(2, 2, 1, 2), 大安區: T(1, 2, 1, 2), 萬華區: T(2, 2, 1, 3), 信義區: T(1, 2, 1, 2), 士林區: T(2, 3, 1, 2), 北投區: T(2, 3, 1, 2), 內湖區: T(3, 2, 1, 2), 南港區: T(2, 2, 1, 1), 文山區: T(2, 2, 2, 1) },
  "新北市": { 板橋區: T(2, 2, 1, 2), 三重區: T(3, 2, 1, 3), 中和區: T(2, 2, 1, 2), 永和區: T(2, 2, 1, 2), 新莊區: T(3, 3, 1, 2), 新店區: T(2, 3, 2, 1), 土城區: T(2, 2, 1, 2), 蘆洲區: T(3, 2, 1, 2), 汐止區: T(3, 2, 1, 1), 淡水區: T(2, 3, 2, 1), 林口區: T(1, 3, 2, 1) },
  "桃園市": { 桃園區: T(2, 2, 1, 2), 中壢區: T(2, 2, 1, 2), 龜山區: T(1, 2, 1, 1) },
  "新竹市": { 東區: T(1, 3, 2, 1), 北區: T(2, 3, 2, 1) },
  "臺中市": { 西屯區: T(1, 3, 1, 2), 北屯區: T(1, 3, 1, 2), 南屯區: T(1, 3, 1, 1), 西區: T(1, 3, 1, 2), 北區: T(2, 3, 1, 2), 大里區: T(2, 3, 1, 1), 豐原區: T(1, 3, 1, 1) },
  "臺南市": { 東區: T(2, 3, 2, 2), 中西區: T(2, 3, 2, 2), 永康區: T(3, 3, 2, 2), 安南區: T(3, 3, 2, 1) },
  "高雄市": { 苓雅區: T(2, 2, 3, 2), 前鎮區: T(3, 2, 3, 2), 三民區: T(3, 2, 3, 2), 左營區: T(2, 2, 3, 2), 鳳山區: T(2, 2, 3, 2), 鼓山區: T(2, 2, 3, 1) },
  "基隆市": { 仁愛區: T(2, 2, 3, 1), 中正區: T(2, 2, 3, 1) },
  "宜蘭縣": { 宜蘭市: T(3, 3, 3, 1), 羅東鎮: T(3, 3, 3, 1) },
  "花蓮縣": { 花蓮市: T(2, 3, 3, 1), 吉安鄉: T(2, 3, 3, 1) },
  "臺東縣": { 臺東市: T(2, 3, 3, 1) },
};
// Places people say instead of a district: stations and well-known areas
const ALIAS = { 台北: "臺北市", 台中: "臺中市", 台南: "臺南市", 台東: "臺東縣", 捷運大安站: "臺北市大安區", 捷運忠孝復興站: "臺北市大安區", 公館: "臺北市中正區", 台北車站: "臺北市中正區", 西門: "臺北市萬華區", 信義安和: "臺北市大安區", 市政府站: "臺北市信義區", 台北101: "臺北市信義區", 天母: "臺北市士林區", 板橋車站: "新北市板橋區", 淡水站: "新北市淡水區", 逢甲: "臺中市西屯區", 一中街: "臺中市北區", 新竹科學園區: "新竹市東區", 竹科: "新竹市東區", 成大: "臺南市東區", 駁二: "高雄市鹽埕區" };
const CITY_LEVEL = T(2, 2, 2, 2);

// A place a person typed: the district it is in, its levels, and where they came from
export function zoneOf(place) {
  let s = String(place || "").replace(/台(?=[北中南東])/g, "臺").trim();
  for (const [k, v] of Object.entries(ALIAS)) if (s.includes(k.replace(/台(?=[北中南東])/g, "臺")) || s.includes(k)) { s = `${v} ${s}`; break; }
  for (const [city, ds] of Object.entries(DISTRICTS)) {
    const cityHit = s.includes(city) || s.includes(city.replace(/[市縣]$/, ""));
    for (const [d, lv] of Object.entries(ds)) {
      const name = d.replace(/[區市鎮鄉]$/, "");
      if ((cityHit && (s.includes(d) || s.includes(name))) || (!cityHit && s.includes(d) && uniqueDistrict(d))) return { city, district: d, ...lv, source: "district table (rough, see zones.js)" };
    }
    if (cityHit) return { city, district: null, ...CITY_LEVEL, source: "city average (district not recognised)" };
  }
  return { city: null, district: null, ...CITY_LEVEL, source: "national average (place not recognised)" };
}
const uniqueDistrict = (d) => Object.values(DISTRICTS).filter((ds) => d in ds).length === 1;
// how much each level changes the expected loss
export const ZONE_FACTOR = { flood: [0, 0.9, 1.0, 1.3], quake: [0, 0.9, 1.0, 1.25], typhoon: [0, 0.92, 1.0, 1.3], theft: [0, 0.85, 1.0, 1.25] };
