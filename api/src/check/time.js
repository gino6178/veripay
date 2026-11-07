// Wall-clock time in a US zone (the demo city is Austin, TX) without a package: Intl gives the offset at any instant.
export const TZ = "America/Chicago";
const parts = (ms, tz) => Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", weekday: "short" })
  .formatToParts(new Date(ms)).filter((p) => p.type !== "literal").map((p) => [p.type, p.value]));
export const tzOffsetMin = (ms, tz = TZ) => { const p = parts(ms, tz); return Math.round((Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - Math.floor(ms / 1000) * 1000) / 6e4); };
// local wall time in tz -> epoch ms
export function zoned(y, mo, d, h = 0, mi = 0, tz = TZ) {
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  let ms = guess - tzOffsetMin(guess, tz) * 6e4;
  ms = guess - tzOffsetMin(ms, tz) * 6e4; // second pass settles DST edges
  return ms;
}
export const localDay = (ms, tz) => { const p = parts(ms, tz); return { y: +p.year, m: +p.month, d: +p.day, h: +p.hour, wd: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(p.weekday) }; };
export const plusDays = (ld, n, tz) => localDay(zoned(ld.y, ld.m, ld.d, 12, 0, tz) + n * 864e5, tz);

