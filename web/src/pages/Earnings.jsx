// The pro's earnings dashboard (PLAN §16 item 4): every figure from the jobs' ledgers, in AG Charts and AG Grid,
// themed like the back office. Loaded on its own (lazy) so only pros fetch AG Grid and AG Charts.
import { lazy, Suspense, useMemo, useState } from "react";
import { Link, useApi, m, usd } from "../api.jsx";
import { useMe } from "../App.jsx";
import { t } from "../i18n.js";
import Grid from "../components/backoffice/Grid.jsx";
import { MoneyCell, DateCell } from "../components/backoffice/cells.jsx";
const Chart = lazy(() => import("../components/backoffice/Chart.jsx"));

const dollarsOf = (c) => Math.round((c || 0)) / 100;
const mins = (n) => (n == null ? "—" : n < 1 ? "under a minute" : n < 90 ? `${Math.round(n)} min` : n < 60 * 48 ? `${(n / 60).toFixed(1)} h` : `${(n / 1440).toFixed(1)} days`);

export default function Earnings() {
  const { me } = useMe(), [months, setMonths] = useState(12);
  const d = useApi(me?.person?.role === "pro" ? `/api/pro/dashboard?months=${months}` : null).data;
  const monthly = useMemo(() => (d?.monthly || []).map((x) => ({ month: x.month, net: dollarsOf(x.net), fees: dollarsOf(x.fees), tips: dollarsOf(x.tips), materials: dollarsOf(x.materials), jobs: x.paidJobs })), [d]);
  const cols = useMemo(() => [
    { field: "number", headerName: t("Job"), width: 110, pinned: "left" },
    { field: "title", headerName: t("Title"), flex: 1, minWidth: 180 },
    { field: "trade", headerName: t("Trade"), width: 110 },
    { field: "zip", headerName: "ZIP", width: 90 },
    { field: "paidAt", headerName: t("Paid"), width: 130, cellRenderer: DateCell },
    { field: "gross", headerName: t("Gross"), width: 110, cellRenderer: MoneyCell, type: "rightAligned" },
    { field: "fee", headerName: t("Fee"), width: 100, cellRenderer: MoneyCell, type: "rightAligned" },
    { field: "helper", headerName: t("Helper"), width: 100, cellRenderer: MoneyCell, type: "rightAligned" },
    { field: "materials", headerName: t("Materials"), width: 110, cellRenderer: MoneyCell, type: "rightAligned" },
    { field: "tips", headerName: t("Tips"), width: 90, cellRenderer: MoneyCell, type: "rightAligned" },
    { field: "net", headerName: t("Net to you"), width: 120, cellRenderer: MoneyCell, type: "rightAligned" },
    { field: "minutesToPaid", headerName: t("Time to paid"), width: 120, valueFormatter: (p) => mins(p.value) },
    { field: "fixRounds", headerName: t("Fix rounds"), width: 100, type: "rightAligned" },
    { field: "rating", headerName: t("Rating"), width: 90 },
    { field: "status", headerName: t("Status"), width: 110 },
  ], []);
  if (me === null) return <div className="empty"><p>Sign in as a pro.</p><Link className="btn accent" to="/signin?as=pro">Sign in</Link></div>;
  if (!d) return <div className="skel" style={{ height: 420 }} />;
  const T = d.totals || {};
  const tile = (label, v, sub) => <div className="stat"><b>{v}</b><span>{label}</span>{sub && <small className="tiny muted">{sub}</small>}</div>;
  return (
    <div className="stack-l">
      <div className="page-head"><div><h1>{t("Earnings")}</h1><p className="lede">{d.label || t("Every figure comes from your jobs' ledgers.")}</p></div>
        <div className="row" style={{ gap: 8, alignItems: "end" }}><label className="field"><span>{t("MONTHS")}</span><select className="input sm" value={months} onChange={(e) => setMonths(+e.target.value)}>{[3, 6, 12, 24].map((n) => <option key={n} value={n}>{n}</option>)}</select></label>
          <a className="btn sm" href={`/api/pro/dashboard.csv?months=${months}`}>{t("Download CSV")}</a></div></div>
      <div className="stat-row">
        {tile(t("Net to you"), m(T.net), `${T.paidJobs ?? 0} ${t("paid jobs")}`)}
        {tile(t("Gross"), m(T.gross))}
        {tile(t("Fees"), m(T.fees), T.feeRate != null ? `${Math.round(T.feeRate * 100)}%` : "")}
        {tile(t("Tips"), m(T.tips))}
        {tile(t("Materials advanced"), m(T.materialsAdvances))}
        {tile(t("Median time to paid"), mins(d.timeToPaid?.medianMinutes), d.timeToPaid?.n ? `${d.timeToPaid.n} ${t("jobs")}` : "")}
        {tile(t("Sent back to fix"), d.fixRate?.rate != null ? `${Math.round(d.fixRate.rate * 100)}%` : "—", d.fixRate?.checked ? `${d.fixRate.sentBack} / ${d.fixRate.checked}` : "")}
        {tile(t("Rating"), d.ratings?.mean != null ? `${d.ratings.mean.toFixed ? d.ratings.mean.toFixed(1) : d.ratings.mean} ★` : "—", d.ratings?.n ? `${d.ratings.n} ${t("ratings")}` : "")}
      </div>
      <div className="panel bo-chart">
        <Suspense fallback={<div className="skel" style={{ height: 260 }} />}>
          <Chart options={{ height: 280, data: monthly, title: { text: t("By month") }, subtitle: { text: t("net to you, fees, tips and materials advances (USD, from the ledger)") },
            series: [{ type: "bar", xKey: "month", yKey: "net", yName: t("Net to you"), stacked: true }, { type: "bar", xKey: "month", yKey: "tips", yName: t("Tips"), stacked: true }, { type: "bar", xKey: "month", yKey: "materials", yName: t("Materials"), stacked: true }, { type: "line", xKey: "month", yKey: "fees", yName: t("Fees") }],
            axes: [{ type: "category", position: "bottom" }, { type: "number", position: "left", label: { formatter: (p) => `$${p.value}` } }], legend: { position: "bottom" } }} />
        </Suspense>
      </div>
      <Grid name="pro-earnings" title={t("Jobs")} rows={(d.rows || []).map((r) => ({ ...r, key: r.job }))} columnDefs={cols} getRowId={(p) => String(p.data.key)} height={460} csv="done-earnings" />
      <p className="tiny muted">{d.timeToPaid?.says} {d.fixRate?.says} {t("Not tax advice; the Books panel has the QuickBooks export.")}</p>
    </div>
  );
}
