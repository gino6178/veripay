// Cover's back office: the year's numbers by product, the reinsurance, where the risk sits, a hurricane, earthquake or wildfire
// scenario, rate filings and the regulator's answer, and the year's close (the giveback). Each table is an AG Grid in
// Cover's theme, the loss ratio and the scenario are AG Charts, a click on a chart filters its grid, and the
// anomaly-alert agent watches the book and answers questions about any of the grids.
import { lazy, Suspense, useMemo, useState } from "react";
import { api, useApi, useT, usd, secs } from "../api.jsx";
import { useMe } from "../App.jsx";
import { StaffGate } from "./Desk.jsx";
const Grid = lazy(() => import("../components/backoffice/Grid.jsx"));
const AgCharts = lazy(() => import("../components/backoffice/Chart.jsx"));
import AgentPanel, { useWatcher } from "../components/backoffice/AgentPanel.jsx";
import { TOOLS } from "../components/backoffice/agent.js";
import { C } from "../components/backoffice/tokens.js";
import { DeciderCell, NAME, nameOf, pct, ProductCell, MoneyCell, RatioCell, LevelCell, DateCell, IdCell } from "../components/backoffice/cells.jsx";

const COLS = {
  products: [{ field: "product", kind: "enum", header: "Product", zh: "險種" }, { field: "lossRatio", kind: "percent", header: "Loss ratio", zh: "損失率", main: true }, { field: "earned", kind: "money", header: "Earned", zh: "保費" }, { field: "claimsPaid", kind: "money", header: "Claims paid", zh: "理賠" }, { field: "inForce", kind: "number", header: "In force", zh: "有效保單" }, { field: "claims", kind: "number", header: "Claims", zh: "件數" }, { field: "denied", kind: "number", header: "Denied", zh: "拒賠" }, { field: "referred", kind: "number", header: "Referred", zh: "轉真人" }],
  rates: [{ field: "product", kind: "enum", header: "Product", zh: "險種" }, { field: "status", kind: "enum", header: "Status", zh: "狀態" }, { field: "change", kind: "percent", header: "Change", zh: "調幅", main: true }, { field: "filed", kind: "date", header: "Filed", zh: "申請日" }],
  payouts: [{ field: "by", kind: "enum", header: "Decided by", zh: "決定者" }, { field: "amount", kind: "money", header: "Paid", zh: "金額", main: true }, { field: "count", kind: "number", header: "Claims", zh: "件數" }],
  pools: [{ field: "name", kind: "text", header: "Cause", zh: "公益" }, { field: "balance", kind: "money", header: "Balance", zh: "餘額", main: true }, { field: "premiums", kind: "money", header: "Premiums", zh: "保費" }, { field: "claims", kind: "money", header: "Claims", zh: "理賠" }],
};

// Exposure rows are read by their keys, since a zone's shape is the US one ({ state, county?, zip, flood, wildfire,
// hurricane, quake, theft }) and older data may still carry another
const LOC = ["state", "county", "zip", "city", "district", "area"], PERILS = ["flood", "wildfire", "hurricane", "quake", "theft", "typhoon"];
const LOC_NAME = { state: ["州", "State"], county: ["郡", "County"], zip: ["郵遞區號", "ZIP"], city: ["城市", "City"], district: ["地區", "District"], area: ["地區", "Area"] };
const PERIL_NAME = { flood: ["淹水", "Flood"], wildfire: ["野火", "Wildfire"], hurricane: ["颶風", "Hurricane"], quake: ["地震", "Earthquake"], theft: ["竊盜", "Theft"], typhoon: ["颱風", "Typhoon"] };
const SCENARIOS = ["hurricane", "quake", "wildfire"];
const placeOf = (h) => LOC.map((k) => h[k]).filter(Boolean).join(" · ") || "—";

export default function Carrier() {
  const t = useT(), { toast } = useMe();
  const { data: causes } = useApi("/api/causes"), cname = (id) => { const c = causes?.find((x) => x.id === id); return c ? t(c.zh, c.en) : id; };
  const dash = useApi("/api/staff/dashboard"), exp = useApi("/api/staff/exposure"), rates = useApi("/api/staff/rates");
  const watcher = useWatcher();
  const [sc, setSc] = useState(null), [peril, setPeril] = useState("hurricane"), [strength, setStrength] = useState(1), [rf, setRf] = useState({ product: "home", change: "0.15", why: "" }), [busy, setBusy] = useState(false);
  const d = dash.data;
  const shape = useMemo(() => {
    const keys = new Set((exp.data || []).flatMap((r) => Object.keys(r)));
    const loc = LOC.filter((k) => keys.has(k)), perils = PERILS.filter((k) => keys.has(k));
    return { loc: loc.length ? loc : ["state", "zip"], perils: perils.length ? perils : ["flood", "wildfire", "hurricane", "quake", "theft"] };
  }, [exp.data]);
  const expAgent = useMemo(() => [...shape.loc.map((k) => ({ field: k, kind: "text", header: LOC_NAME[k][1], zh: LOC_NAME[k][0] })), { field: "policies", kind: "number", header: "Policies", zh: "保單" }, { field: "insured", kind: "money", header: "Insured", zh: "保額", main: true }, ...shape.perils.map((k) => ({ field: k, kind: "number", header: PERIL_NAME[k][1], zh: PERIL_NAME[k][0] }))], [shape]);

  const answer = async (f, approve) => { const r = await api(`/api/staff/rates/${f.id}`, { method: "POST", body: { approve } }).catch((e) => toast(e.message)); if (r?.error) toast(r.message || r.error); rates.reload(); };
  const cols = useMemo(() => ({
    products: [
      { field: "product", headerName: t("險種", "Product"), pinned: "left", width: 150, cellRenderer: ProductCell },
      { field: "inForce", headerName: t("有效保單", "In force"), width: 110, type: "rightAligned", cellClass: "num" },
      { field: "earned", headerName: t("保費（扣退費）", "Earned"), width: 130, type: "rightAligned", cellRenderer: MoneyCell },
      { field: "claimsPaid", headerName: t("理賠", "Claims paid"), width: 130, type: "rightAligned", cellRenderer: MoneyCell },
      { field: "recoveries", headerName: t("再保攤回", "Recovered"), width: 120, type: "rightAligned", cellRenderer: MoneyCell },
      { field: "lossRatio", headerName: t("損失率", "Loss ratio"), minWidth: 190, flex: 1, cellRenderer: RatioCell, filter: "agNumberColumnFilter" },
      { field: "claims", headerName: t("件數", "Claims"), width: 90, type: "rightAligned", cellClass: "num" },
      { field: "instant", headerName: t("秒賠", "Instant"), width: 90, type: "rightAligned", cellClass: "num" },
      { field: "referred", headerName: t("轉真人", "Referred"), width: 100, type: "rightAligned", cellClass: "num" },
      { field: "denied", headerName: t("拒賠", "Denied"), width: 90, type: "rightAligned", cellClass: "num" },
      { field: "medianSecondsToPay", headerName: t("秒賠中位時間", "Median to pay"), width: 140, type: "rightAligned", cellClass: "num", valueFormatter: (p) => secs(p.value) },
    ],
    exposure: [
      ...shape.loc.map((k, i) => ({ field: k, headerName: t(...LOC_NAME[k]), ...(i === 0 ? { flex: 1, minWidth: 120 } : { width: 120 }), ...(k === "zip" ? { cellRenderer: IdCell } : {}) })),
      { field: "policies", headerName: t("保單", "Policies"), width: 100, type: "rightAligned", cellClass: "num" },
      { field: "insured", headerName: t("保額", "Insured"), width: 140, type: "rightAligned", cellRenderer: MoneyCell, sort: "desc" },
      ...shape.perils.map((k) => ({ field: k, headerName: t(...PERIL_NAME[k]), width: 110, cellRenderer: LevelCell, filter: "agNumberColumnFilter", headerTooltip: t("等級 1 低、3 高", "Level 1 low to 3 high") })),
    ],
    rates: [
      { field: "id", headerName: "id", width: 90, cellRenderer: IdCell },
      { field: "product", headerName: t("險種", "Product"), width: 140, cellRenderer: ProductCell },
      { field: "change", headerName: t("調幅", "Change"), width: 100, type: "rightAligned", cellClass: "num", valueFormatter: (p) => `${p.value > 0 ? "+" : ""}${Math.round(p.value * 100)}%` },
      { field: "filed", headerName: t("申請日", "Filed"), width: 150, cellRenderer: DateCell, sort: "desc" },
      { field: "status", headerName: t("主管機關", "Regulator"), flex: 1, minWidth: 220, cellRenderer: (p) => p.value === "filed"
        ? <span className="bo-cell"><button className="btn sm accent" onClick={() => answer(p.data, true)}>{t("核准", "Approve")}</button><button className="btn sm ghost" onClick={() => answer(p.data, false)}>{t("駁回", "Refuse")}</button></span>
        : <span className={`badge ${p.value === "approved" ? "good" : "bad"}`}>{p.value === "approved" ? t("已核准，新報價生效", "approved: new quotes use it") : t("被駁回", "refused")}</span> },
    ],
    payouts: [
      { field: "by", headerName: t("決定者", "Decided by"), width: 150, cellRenderer: DeciderCell },
      { field: "count", headerName: t("件數", "Claims"), width: 90, type: "rightAligned", cellClass: "num" },
      { field: "amount", headerName: t("金額", "Paid"), width: 130, type: "rightAligned", cellRenderer: MoneyCell },
      { field: "medianSecondsToPay", headerName: t("中位時間", "Median to pay"), flex: 1, minWidth: 130, type: "rightAligned", cellClass: "num", valueFormatter: (p) => secs(p.value) },
    ],
    pools: [
      { field: "name", headerName: t("公益池", "Cause pool"), flex: 1, minWidth: 180 },
      { field: "premiums", headerName: t("保費", "Premiums"), width: 120, type: "rightAligned", cellRenderer: MoneyCell },
      { field: "claims", headerName: t("理賠", "Claims"), width: 120, type: "rightAligned", cellRenderer: MoneyCell },
      { field: "balance", headerName: t("可捐", "To give"), width: 130, type: "rightAligned", cellRenderer: MoneyCell, cellClassRules: { "bo-neg": (p) => p.value < 0 } },
    ],
  }), [t, shape]); // eslint-disable-line react-hooks/exhaustive-deps

  const pools = useMemo(() => d?.pools.map((p) => ({ ...p, id: p.cause, name: cname(p.cause) })), [d, causes, t]); // eslint-disable-line react-hooks/exhaustive-deps
  const lossChart = useMemo(() => d && ({
    height: 300,
    title: { text: t("損失率（扣再保攤回）", "Loss ratio, net of reinsurance") },
    subtitle: { text: t("點一個險種，表格只顯示它", "Click a product to show only it in the grid"), color: C.ink3 },
    data: d.products.map((r) => ({ product: t(...nameOf(r.product)), id: r.product, ratio: r.lossRatio == null ? 0 : +(r.lossRatio * 100).toFixed(1), none: r.lossRatio == null })),
    series: [{ type: "bar", xKey: "product", yKey: "ratio", yName: t("損失率", "Loss ratio"),
      itemStyler: (p) => ({ fill: p.datum.ratio > 100 ? C.bad : p.datum.ratio > 80 ? C.warn : C.ink3 }),
      label: { enabled: true, placement: "outside-end", color: C.ink, formatter: (p) => (p.datum.none ? "—" : `${p.value}%`) },
      tooltip: { renderer: (p) => ({ heading: p.datum.product, data: [{ label: t("損失率", "Loss ratio"), value: p.datum.none ? "—" : `${p.datum.ratio}%` }] }) },
      listeners: { seriesNodeClick: (e) => TOOLS.filter_grid.run({ grid: "products", filters: [{ field: "product", op: "eq", value: e.datum.id }] }) } }],
    axes: { x: { type: "category", position: "bottom" }, y: { type: "number", position: "left", min: 0, label: { formatter: (p) => `${p.value}%` },
      crossLines: [{ type: "line", value: 80, stroke: C.signal, lineDash: [4, 4], label: { text: "80%", position: "right", color: C.signal } }] } },
  }), [d, t]);

  const run = async () => { const r = await api(`/api/staff/scenario?peril=${peril}&strength=${strength}`).catch((e) => toast(e.message)); if (r) setSc({ ...r, asked: peril }); };
  // payouts by who decided them: the flight data (parametric), the rules, or a person
  const DECIDER = { parametric: ["參數自動", "Parametric", C.agent], rules: ["規則秒賠", "Rules", C.ok], adjuster: ["理賠員", "Adjuster", C.ink3] };
  const payouts = useMemo(() => watcher.data?.payouts?.map((p) => ({ ...p, id: p.by, name: t(...(DECIDER[p.by] || [p.by, p.by])) })), [watcher.data, t]); // eslint-disable-line react-hooks/exhaustive-deps
  const payChart = useMemo(() => payouts && payouts.some((p) => p.amount) && ({
    height: 240, title: { text: t("誰決定了理賠款", "Who decided the payouts") }, subtitle: { text: t("依金額", "By amount paid"), color: C.ink3 },
    data: payouts.filter((p) => p.amount).map((p) => ({ ...p, usd: p.amount / 100 })),
    series: [{ type: "donut", angleKey: "usd", legendItemKey: "name", innerRadiusRatio: 0.62, fills: payouts.filter((p) => p.amount).map((p) => (DECIDER[p.by] || [0, 0, C.ink3])[2]), strokes: [C.ground2], strokeWidth: 2,
      tooltip: { renderer: (p) => ({ heading: p.datum.name, data: [{ label: t("金額", "Amount"), value: usd(p.datum.amount) }, { label: t("件數", "Claims"), value: String(p.datum.count) }, { label: t("中位時間", "Median to pay"), value: secs(p.datum.medianSecondsToPay) }] }) },
      innerLabels: [{ text: usd(payouts.reduce((a, p) => a + p.amount, 0)), fontSize: 16, color: C.ink, fontFamily: "Martian Mono, monospace" }, { text: t("已付", "paid"), fontSize: 11, color: C.ink3 }] }],
    legend: { position: "right" },
  }), [payouts, t]); // eslint-disable-line react-hooks/exhaustive-deps
  const scChart = useMemo(() => sc && ({
    height: Math.max(180, 70 + Math.min(10, sc.hit.length) * 30),
    title: { text: t(`${(PERIL_NAME[sc.peril] || [sc.peril, sc.peril])[0]}：受災地區的損失`, `${(PERIL_NAME[sc.peril] || [sc.peril, sc.peril])[1]}: loss where it hits`) },
    subtitle: { text: t("點一個地點，曝險表只顯示它", "Click a place to show it in the exposure grid"), color: C.ink3 },
    data: sc.hit.slice().sort((a, b) => b.loss - a.loss).slice(0, 10).map((h) => ({ ...h, place: placeOf(h), usd: h.loss / 100 })),
    series: [{ type: "bar", direction: "horizontal", xKey: "place", yKey: "usd", yName: t("損失", "Loss"),
      itemStyler: (p) => ({ fill: p.datum.level >= 3 ? C.bad : p.datum.level === 2 ? C.warn : C.ink3 }),
      tooltip: { renderer: (p) => ({ heading: p.datum.place, data: [{ label: t("損失", "Loss"), value: usd(p.datum.loss) }, { label: t("等級", "Level"), value: String(p.datum.level) }, { label: t("保單", "Policies"), value: String(p.datum.policies) }] }) },
      listeners: { seriesNodeClick: (e) => { const k = shape.loc.find((x) => e.datum[x] != null) || LOC.find((x) => e.datum[x] != null); if (k) TOOLS.filter_grid.run({ grid: "exposure", filters: [{ field: k, op: "eq", value: e.datum[k] }] }); } } }],
    axes: { y: { type: "category", position: "left" }, x: { type: "number", position: "bottom", label: { formatter: (p) => `$${Number(p.value).toLocaleString("en-US")}` } } },
  }), [sc, t, shape]);
  const splitChart = useMemo(() => sc && ({
    height: 120, padding: { top: 4, bottom: 4 },
    data: [{ what: t("總損失", "Gross"), keeps: sc.net / 100, ceded: sc.ceded / 100 }],
    series: [
      { type: "bar", direction: "horizontal", stacked: true, xKey: "what", yKey: "keeps", yName: t("Cover 自留", "Cover keeps"), fill: C.signal, tooltip: { renderer: () => ({ data: [{ label: t("Cover 自留", "Cover keeps"), value: usd(sc.net) }] }) } },
      { type: "bar", direction: "horizontal", stacked: true, xKey: "what", yKey: "ceded", yName: t("再保負擔", "Reinsurer pays"), fill: C.ink3, tooltip: { renderer: () => ({ data: [{ label: t("再保負擔", "Reinsurer pays"), value: usd(sc.ceded) }] }) } },
    ],
    axes: { y: { type: "category", position: "left" }, x: { type: "number", position: "bottom", min: 0, max: Math.ceil(Math.max(sc.gross, d?.treaty.catRetention || 0) * 1.15 / 100), label: { formatter: (p) => `${Number(p.value).toLocaleString("en-US")}` },
      crossLines: [{ type: "line", value: (d?.treaty.catRetention || 0) / 100, stroke: C.ink, lineDash: [2, 3], label: { text: t("自留額", "retention"), position: "top", color: C.ink2 } }] } },
    legend: { position: "bottom" },
  }), [sc, d, t]);

  if (dash.error?.status === 401) return <StaffGate onIn={() => { dash.reload(); exp.reload(); rates.reload(); watcher.refresh(); }} />;
  const close = async () => { setBusy(true); try { const g = await api("/api/staff/close-year", { method: "POST" }); toast(t(`年度結算完成：捐出 ${usd(g.reduce((s, x) => s + (x.payout ? x.amount : 0), 0))}`, `Year closed: ${usd(g.reduce((s, x) => s + (x.payout ? x.amount : 0), 0))} given`)); dash.reload(); watcher.refresh(); } catch (e) { toast(e.message); } setBusy(false); };
  const file = async () => { const r = await api("/api/staff/rates", { method: "POST", body: { ...rf, change: +rf.change } }).catch((e) => toast(e.message)); if (r?.error) toast(r.message); rates.reload(); };
  const grids = [{ name: "products", label: t("險種", "Products") }, { name: "exposure", label: t("曝險", "Exposure") }, { name: "rates", label: t("費率申請", "Rate filings") }, { name: "payouts", label: t("理賠款", "Payouts") }, { name: "pools", label: t("公益池", "Pools") }];

  return (
    <Suspense fallback={<p className="muted small">Loading AG Grid…</p>}><div className="stack-l">
      <div className="page-head" style={{ marginBottom: 0 }}><div><h1>{t("後台", "Back office")}</h1><p className="muted small">{t(`第 ${d?.year ?? "—"} 年 · 全部從帳本、保單和理賠算出來`, `Year ${d?.year ?? "—"} · all counted from the ledger, policies and claims`)}</p></div><a className="btn ghost sm" href="/api/staff/report">{t("下載監理報表 CSV", "Download the regulator's CSV")}</a></div>
      {d && <div className="stat-row" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))" }}>
        <div className="stat"><b>{usd(d.total.earned)}</b><span>{t("已收保費（扣退費）", "Premiums earned (less refunds)")}</span></div>
        <div className="stat"><b>{usd(d.total.claimsPaid)}</b><span>{t("理賠支出", "Claims paid")}</span></div>
        <div className="stat"><b style={{ color: d.total.lossRatio > 0.8 ? "var(--bad)" : undefined }}>{pct(d.total.lossRatio)}</b><span>{t("損失率（扣再保攤回）", "Loss ratio (net of reinsurance)")}</span></div>
        <div className="stat"><b>{pct(d.total.instantShare)}</b><span>{t("秒賠比例", "Paid instantly")}</span></div>
        <div className="stat"><b>{usd(d.total.fees)}</b><span>{t("Cover 的 20% 費用", "Cover's 20% fee")}</span></div>
      </div>}

      <AgentPanel watcher={watcher} grids={grids} suggestions={[
        { grid: "products", q: t("損失率超過 80%", "loss ratio over 80%"), label: t("損失率 > 80%", "Loss ratio > 80%") },
        { grid: "exposure", q: "high hurricane risk, most insured first", label: t("颶風高風險", "High hurricane risk") },
        { grid: "rates", q: t("申請中的費率", "filed rates"), label: t("待核准的費率", "Filings waiting") },
        { grid: "pools", q: t("餘額由小到大", "pools with the lowest balance"), label: t("餘額最低的池", "Lowest pools") },
      ]} />

      <section className="stack">
        <Grid name="products" title={t("今年各險種", "This year, by product")} rows={d?.products.map((r) => ({ ...r, id: r.product }))} columnDefs={cols.products} agentColumns={COLS.products} autoHeight getRowId={(p) => p.data.id} csv={`cover-products-year-${d?.year}`} />
        {d && <p className="tiny muted">{t(`再保合約：單一理賠 Cover 自留 ${usd(d.treaty.perClaimRetention)}，超過的由再保公司付；單一颶風、地震或野火 Cover 自留 ${usd(d.treaty.catRetention)}，再保最高付 ${usd(d.treaty.catLimit)}。`, `Treaty: Cover keeps the first ${usd(d.treaty.perClaimRetention)} of any claim; for one hurricane, earthquake or wildfire it keeps ${usd(d.treaty.catRetention)} and the reinsurer pays the rest up to ${usd(d.treaty.catLimit)}.`)}</p>}
      </section>

      <section className="card bo-split">
        <div className="bo-chart">{payChart ? <AgCharts options={payChart} /> : <p className="muted small">{t("還沒有付出任何理賠。", "No claim has been paid yet.")}</p>}</div>
        <div className="stack">
          <h3>{t("參數自動理賠和其他的分開看", "Parametric payouts, kept apart")}</h3>
          <p className="small muted">{t("旅遊險的航班延誤和取消由航班資料觸發、自動付款；其他理賠由規則或理賠員決定。分開算，才看得出哪一種在吃掉損失率。", "Flight delays and cancellations pay when the flight data says so, with no claim to check; other claims are decided by rules or an adjuster. Counting them apart shows which one moves the loss ratio.")}</p>
          <Grid name="payouts" rows={payouts} columnDefs={cols.payouts} agentColumns={COLS.payouts} autoHeight getRowId={(p) => p.data.id} csv="cover-payouts-by-decider" />
        </div>
      </section>

      <div className="grid-2">
        <div className="card bo-chart">{lossChart ? <AgCharts options={lossChart} /> : <p className="muted small">{t("載入中…", "Loading…")}</p>}</div>
        <div className="card stack">
          <h3>{t("如果明天來一場颶風、地震或野火", "If a hurricane, earthquake or wildfire hit tomorrow")}</h3>
          <div className="row">
            <div className="chips">{SCENARIOS.map((k) => <button key={k} className={`chip ${peril === k ? "on" : ""}`} aria-pressed={peril === k} onClick={() => setPeril(k)}>{t(...PERIL_NAME[k])}</button>)}</div>
            <label className="field" style={{ flex: 1, minWidth: 160 }}><span>{t(`強度 ×${strength}`, `Strength ×${strength}`)}</span><input type="range" min="0.5" max="3" step="0.5" value={strength} onChange={(e) => setStrength(+e.target.value)} /></label>
            <button className="btn" onClick={run}>{t("模擬", "Run it")}</button>
          </div>
          {sc && <div className="stack-s">
            <dl className="kv"><dt>{t("總損失", "Gross loss")}</dt><dd className="num">{usd(sc.gross)}</dd><dt>{t("再保負擔", "Reinsurer pays")}</dt><dd className="num">{usd(sc.ceded)}</dd><dt>{t("Cover 自留", "Cover keeps")}</dt><dd className="num">{usd(sc.net)}</dd>
              <dt>{t("損失率", "Loss ratio")}</dt><dd className="num">{pct(sc.lossRatioNow)} → <b style={{ color: sc.lossRatioAfter > 1 ? "var(--bad)" : undefined }}>{pct(sc.lossRatioAfter)}</b></dd>
              <dt>{t("今年可捐", "Giveback this year")}</dt><dd className="num">{usd(sc.givebackNow)} → <b>{usd(sc.givebackAfter)}</b></dd></dl>
            {sc.gross > 0 && <div className="bo-chart"><AgCharts options={splitChart} /></div>}
            {sc.hit.length > 0 ? <div className="bo-chart"><AgCharts options={scChart} /></div> : <p className="small muted">{t("沒有任何有效保單在受影響的地區。", "No policy in force sits where this would hit.")}</p>}
            {sc.asked && sc.peril !== sc.asked && <p className="tiny muted">{t(`伺服器還不認得「${sc.asked}」，算的是 ${sc.peril}。`, `The server doesn't know "${sc.asked}" yet, so it ran ${sc.peril}.`)}</p>}
            <p className="tiny muted">{sc.assumption}. {t("這不是巨災模型，是用來看形狀：再保擋掉多少、會吃掉多少公益捐款。", "Not a catastrophe model: it shows the shape, how much the treaty takes and what it does to the giveback.")}</p>
          </div>}
        </div>
      </div>

      <section className="stack">
        <Grid name="exposure" title={t("風險集中在哪裡", "Where the risk sits")} rows={exp.data?.map((e) => ({ ...e, id: shape.loc.map((k) => e[k]).join("|") }))} columnDefs={cols.exposure} agentColumns={expAgent} autoHeight pagination pageSize={10} getRowId={(p) => p.data.id} csv="cover-exposure" />
        {exp.data?.length === 0 && <p className="muted small">{t("還沒有有效保單。", "No policies in force yet.")}</p>}
      </section>

      <div className="grid-2">
        <div className="card stack">
          <h3>{t("費率申請", "Rate filings")}</h3>
          <p className="small muted">{t("損失率太高就要調費率，但要主管機關核准；核准前價格不能動。示範時你扮演主管機關。", "When losses run high the price has to rise, and the regulator must agree first; until then prices can't move. In the demo, you play the regulator.")}</p>
          <div className="row"><select className="input" style={{ width: 150 }} value={rf.product} onChange={(e) => setRf({ ...rf, product: e.target.value })} aria-label={t("險種", "Product")}>{Object.keys(NAME).map((k) => <option key={k} value={k}>{t(...NAME[k])}</option>)}</select><input className="input" style={{ width: 100 }} type="number" step="0.05" value={rf.change} onChange={(e) => setRf({ ...rf, change: e.target.value })} aria-label={t("調幅（0.15 = +15%）", "Change (0.15 is +15%)")} /><button className="btn ghost" onClick={file}>{t("送出申請", "File it")}</button></div>
          <Grid name="rates" rows={rates.data?.map((f) => ({ ...f }))} columnDefs={cols.rates} agentColumns={COLS.rates} autoHeight getRowId={(p) => p.data.id} csv="cover-rate-filings" defaultColDef={{ minWidth: 70 }} />
        </div>
        <div className="card stack">
          <h3>{t("年度結算", "Close the year")}</h3>
          <p className="small muted">{t("每個公益池先付再保費，剩下的用 PayPal Payouts 捐給那個公益，並記進透明帳本。賠超過收的池子這年就沒有捐款。", "Each cause's pool pays its reinsurance, then what is left is given to the cause with PayPal Payouts and logged. A pool that paid out more than it took in gives nothing this year.")}</p>
          <Grid name="pools" rows={pools} columnDefs={cols.pools} agentColumns={COLS.pools} autoHeight getRowId={(p) => p.data.id} csv={`cover-pools-year-${d?.year}`} />
          <button className="btn accent" disabled={busy} onClick={close}>{t("結算今年並捐出", "Close the year and give")}</button>
        </div>
      </div>
    </div></Suspense>
  );
}
