// Times for people: Austin time ("Nov 7, 7:00 AM"), never a raw ISO string in a sentence. Data fields keep ISO.
const TZ = "America/Chicago";
const fmtDT = new Intl.DateTimeFormat("en-US", { timeZone: TZ, month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
const fmtD = new Intl.DateTimeFormat("en-US", { timeZone: TZ, month: "short", day: "numeric", year: "numeric" });
// "Nov 7, 7:00 AM" (a moment), or "Nov 7, 2026" (a calendar date)
export function when(iso, { date = false } = {}) {
  const t = typeof iso === "number" ? iso : Date.parse(iso);
  if (!Number.isFinite(t)) return String(iso);
  return date ? fmtD.format(new Date(t)) : fmtDT.format(new Date(t));
}
// every ISO moment (and bare YYYY-MM-DD date) inside a human sentence, written for people
const ISO = /\b\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})\b/g;
const DATE = /\b(\d{4}-\d{2}-\d{2})\b(?!T)/g;
export function humanize(s) {
  if (typeof s !== "string" || !/\d{4}-\d{2}-\d{2}/.test(s)) return s;
  return s.replace(ISO, (m) => when(m)).replace(DATE, (m) => when(`${m}T12:00:00Z`, { date: true }));
}
