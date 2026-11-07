// Paperwork (PLAN §14): progress reports at each milestone, the close-out package with Texas lien waivers whose amounts
// match the ledger, a PDF in plain JS, the daily log, the pro's QuickBooks CSV and year summary; routes and tools.
import test, { after } from "node:test";
import assert from "node:assert/strict";
import { J, person, P, PRO, photo, pros, tools, setAI } from "./helpers.js";
process.env.DONE_NO_LISTEN = "1";
const { app } = await import("../src/server.js");
const R = await import("../src/reports.js");
const srv = app.listen(0);
after(() => srv.close());
const base = `http://127.0.0.1:${srv.address().port}`;

async function paidHeater() {
  const c = person();
  const j = await J.createJob(c.id, { text: "Replace our 50 gallon water heater this month", zip: "78704", budget: 300000, actor: P(c) });
  await J.requestOffers(j.id, P(c), { now: true });
  const o = J.job(j.id).offers.filter((x) => x.status === "open").sort((a, b) => a.amount - b.amount)[0];
  await J.acceptOffer(j.id, o.id, { actor: P(c), payWith: "card", raiseCeiling: true });
  const pid = J.job(j.id).agreed.pro;
  J.startWork(pid, j.id, PRO(pid));
  setAI({ check: async (job) => ({ checks: job.scope.checks.map((x) => ({ id: x.id, verdict: "pass", reason: "ok", confidence: 0.95, signals: [] })), decision: "release", source: "rules" }) });
  try {
    for (const m of J.job(j.id).milestones) {
      J.addEvidence(pid, j.id, J.job(j.id).scope.checks.filter((x) => m.checkIds.includes(x.id)).map((x) => ({ kind: x.evidence === "note" ? "note" : x.evidence === "receipt" ? "receipt" : "photo", ...(x.evidence === "note" ? { text: "done" } : { buf: photo(J.job(j.id)), mime: "image/jpeg", text: x.doc === "inspection" ? "CITY OF AUSTIN PLUMBING INSPECTION No. BP-2026-123456-1 Result: PASSED (green tag)" : x.doc ? "PLUMBING PERMIT No. BP-2026-123456 Issued 11/05/2026" : "TOTAL 0.00" }), checkId: x.id })), PRO(pid));
      await J.submit(pid, j.id, PRO(pid), { milestone: m.id });
    }
  } finally { setAI({ check: null }); }
  return { c, j: J.job(j.id), pid };
}

test("progress reports at each milestone; the close-out's lien waivers match the ledger; the PDF is a PDF", async () => {
  const { j } = await paidHeater();
  assert.equal(j.status, "released", JSON.stringify(j.checks.at(-1)?.checks.filter((c) => c.verdict !== "pass")));
  assert.ok(j.reports.filter((r) => r.kind === "progress").length === j.milestones.length);
  const pr = R.progressReport(j, j.milestones[0]);
  assert.equal(pr.data.milestone.release, j.milestones[0].release.release);
  assert.match(pr.html, /Each condition/);
  const co = R.closeout(j), b = J.balance(j);
  const fin = co.data.waivers.filter((w) => w.stage === "final");
  assert.deepEqual(fin.map((w) => w.kind), ["conditional", "unconditional"]);
  assert.equal(fin[0].amount, b.captured - b.refunded, "the final waiver is what was paid for the work");
  const prog = co.data.waivers.filter((w) => w.stage === "progress");
  assert.equal(prog.length, 2 * (j.milestones.length - 1));
  assert.equal(prog[0].amount, j.milestones[0].release.release);
  assert.match(co.html, /Conditional Waiver and Release on Final Payment/);
  const pdf = co.pdf();
  assert.equal(pdf.subarray(0, 8).toString("latin1"), "%PDF-1.4");
  assert.match(pdf.toString("latin1"), /startxref\n\d+\n%%EOF\n$/);
  assert.match(pdf.toString("latin1"), /\/Count \d+/);
  assert.ok((pdf.toString("latin1").match(/\/Type \/Page /g) || []).length >= 1 + fin.length);
  const daily = R.dailyLog(j);
  assert.ok(daily.data.days.length >= 1);
});

test("the pro's books: QuickBooks CSV columns, income and fees from the ledger; the year summary says it isn't tax advice", async () => {
  const { j, pid } = await paidHeater();
  const b = R.books(J.allJobs(), pid, {});
  const mine = b.rows.filter((r) => r.job === j.number);
  const L = j.money.ledger, s = (k) => L.filter((l) => l.kind === k).reduce((t, l) => t + l.amount, 0);
  assert.equal(mine.filter((r) => r.type === "income").reduce((t, r) => t + r.amount, 0), s("pro_payout"));
  assert.equal(-mine.filter((r) => r.type === "fee").reduce((t, r) => t + r.amount, 0), s("platform_fee"));
  const qbo = R.booksCsv(b, { format: "qbo" }).split("\r\n");
  assert.equal(qbo[0], "Date,Description,Amount");
  assert.match(qbo[1], /^\d{2}\/\d{2}\/\d{4},/);
  assert.equal(R.booksCsv(b).split("\r\n")[0], "Date,Job,Type,Account,Description,Amount,PayPal ref");
  const y = R.yearSummary(b, new Date().getFullYear(), pros.pro(pid));
  assert.match(y.notTaxAdvice, /^Not tax advice/);
  assert.match(y.forms, /1099-K/);
  const ex = await tools.PRO.export_books(pros.pro(pid), { format: "qbo" });
  assert.match(ex.csv, /^Date,Description,Amount/);
});

test("routes and the customer's get_report tool", async () => {
  const { c, j } = await paidHeater();
  const signup = await fetch(`${base}/api/auth/link`, { method: "POST" }).catch(() => null);
  assert.ok(signup);
  const auth = await import("../src/auth.js"), ck = `${auth.COOKIE}=${auth.createSession(c.id)}`;
  const html = await fetch(`${base}/api/jobs/${j.id}/reports/closeout.html`, { headers: { cookie: ck } });
  assert.equal(html.status, 200);
  assert.match(await html.text(), /close-out package/);
  const pdf = await fetch(`${base}/api/jobs/${j.id}/reports/closeout.pdf`, { headers: { cookie: ck } });
  assert.equal(pdf.headers.get("content-type"), "application/pdf");
  const pg = await fetch(`${base}/api/jobs/${j.id}/reports/progress/m1.html`, { headers: { cookie: ck } });
  assert.equal(pg.status, 200);
  assert.equal((await fetch(`${base}/api/jobs/${j.id}/reports/closeout.html`)).status, 401, "signed in only");
  const r = await tools.CUSTOMER.get_report({ person: c.id, client: "t", scopes: ["read"] }, { job: j.id });
  assert.equal(r.kind, "closeout");
  assert.ok(r.waivers.length >= 2);
});

test("the daily log's weather: the National Weather Service, cached, labelled; off with DONE_WEATHER=off", async () => {
  const { j } = await paidHeater();
  let calls = 0;
  process.env.DONE_WEATHER = "on";
  R.setWeatherFetch(async (url) => { calls++; if (url.includes("/points/")) return { properties: { observationStations: "https://api.weather.gov/gridpoints/EWX/156,90/stations" } }; if (url.endsWith("/stations")) return { features: [{ properties: { stationIdentifier: "KAUS", name: "Austin-Bergstrom" } }] }; return { features: [{ properties: { textDescription: "Mostly Clear", temperature: { value: 25 } } }, { properties: { textDescription: "Mostly Clear", temperature: { value: 20 } } }] }; });
  const d = await R.dailyLogWithWeather(j);
  assert.equal(d.data.days[0].weather.says, "Mostly Clear, 68-77 °F");
  assert.equal(d.data.days[0].weather.station, "KAUS");
  assert.match(d.data.weather, /National Weather Service/);
  const n = calls; await R.dailyLogWithWeather(j); assert.equal(calls, n, "cached");
  process.env.DONE_WEATHER = "off";
  try { assert.equal((await R.dailyLogWithWeather(j)).data.days[0].weather, null); } finally { process.env.DONE_WEATHER = "off"; }
});
