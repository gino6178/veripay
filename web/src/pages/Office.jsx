// The back office (staff only, never in the customer's menu): every job, the holds that expire soonest, payouts,
// disputes to settle, alerts, the ledger line by line, and reconciliation against PayPal. On AG Grid 36 and AG Charts
// 14, in the VeriPay theme. A grid agent turns a question into filters and a sort (rules, labelled); it never acts
// on a job.
import { useMemo, useState, lazy, Suspense } from "react";
import { askConfirm } from "../components/Confirm.jsx";
import { api, useApi, m, when, dollars, refresh, Link, navigate } from "../api.jsx";
import { useMe } from "../App.jsx";
import Grid from "../components/backoffice/Grid.jsx";
import { ask } from "../components/backoffice/agent.js";
import { MoneyCell, StatusCell, NumberCell, SourceCell, BalancedCell, DateCell, IdCell, ExpiryCell, money } from "../components/backoffice/cells.jsx";
import { Conditions, CheckHead, Ids, paypalIds, Split, Hold, Src } from "../components/job.jsx";
import { Badges, useLeft, fmtLeft } from "../components/parts.jsx";
import { Why, Chip } from "../components/cards.jsx";
const Chart = lazy(() => import("../components/backoffice/Chart.jsx"));

const cents = (a) => (a == null ? null : typeof a === "object" ? a.cents : a);
const num = { cellClass: "num", type: "rightAligned" };
const JOB_COLS = [
  { field: "number", headerName: "Job", cellRenderer: NumberCell, width: 104, pinned: "left" },
  { field: "status", cellRenderer: StatusCell, width: 176 },
  { field: "title", flex: 1, minWidth: 180 },
  { field: "trade", width: 110 }, { field: "zip", width: 84 },
  { field: "customer", width: 170 }, { field: "pro", width: 200 },
  { field: "due", cellRenderer: MoneyCell, width: 110, ...num }, { field: "hold", cellRenderer: MoneyCell, width: 110, ...num },
  { field: "holdStatus", headerName: "Hold", width: 110 }, { field: "holdExpires", headerName: "Expires in", cellRenderer: ExpiryCell, width: 110 },
  { field: "captured", cellRenderer: MoneyCell, width: 110, ...num }, { field: "fee", cellRenderer: MoneyCell, width: 96, ...num }, { field: "refunded", cellRenderer: MoneyCell, width: 104, ...num },
  { field: "balanced", cellRenderer: BalancedCell, width: 110 }, { field: "checks", headerName: "Last check", width: 116 }, { field: "checker", cellRenderer: SourceCell, width: 120 },
  { field: "riskDispute", headerName: "Dispute risk", width: 120, valueFormatter: (p) => (p.value == null ? "—" : `${(p.value * 100).toFixed(p.value < 0.1 ? 1 : 0)}%`), cellClass: "num" },
  { field: "riskOverrun", headerName: "Overrun risk", width: 120, valueFormatter: (p) => (p.value == null ? "—" : `${(p.value * 100).toFixed(p.value < 0.1 ? 1 : 0)}%`), cellClass: "num" },
  { field: "riskSource", headerName: "Risk by", width: 140 },
  { field: "flow", width: 220, hide: true }, { field: "created", cellRenderer: DateCell, width: 140 },
];
const AGENT_COLS = [{ field: "status", header: "status", kind: "enum" }, { field: "trade", header: "trade", kind: "enum" }, { field: "due", header: "due", kind: "money" }, { field: "pro", header: "pro", kind: "text" }, { field: "zip", header: "ZIP", kind: "text" }, { field: "holdExpires", header: "hold expires", kind: "date" }, { field: "balanced", header: "balanced", kind: "enum" }];
const TABS = [["queue", "Expert queue"], ["jobs", "Jobs"], ["holds", "Holds expiring"], ["payouts", "Payouts"], ["disputes", "Disputes"], ["pros", "Pros"], ["ledger", "Ledger"], ["recon", "Reconciliation"]];

export default function Office() {
  const { toast, info } = useMe(), [tab, setTab] = useState("queue"), [tick, setTick] = useState(0);
  const ov = useApi("/api/staff/overview", tick);
  if (ov.error?.status === 401) return <div className="empty"><p>The back office is for VeriPay staff. In the demo, one click signs you in as Demo staff, or look at the read-only, anonymised copy.</p><div className="row" style={{ justifyContent: "center" }}><button className="btn accent" onClick={async () => { await api("/api/auth/staff", { method: "POST", body: {} }); setTick((x) => x + 1); }}>Sign in as Demo staff</button><Link className="btn" to="/demo/office">Read-only back office</Link></div></div>;
  const o = ov.data, now = o?.now || info?.now;
  const runTick = async () => { try { const r = await api("/api/staff/tick", { method: "POST" }); toast(`Tick ran at ${when(r.now)}.`); setTick((x) => x + 1); refresh(); } catch (e) { toast(e.message, true); } };
  return (
    <div className="stack-l">
      <div className="page-head">
        <div><span className="row" style={{ gap: 8 }}><span className="badge agent">SIGNED IN AS DEMO STAFF</span><button className="link small" onClick={async () => { await api("/api/auth/staff/signout", { method: "POST", body: {} }); navigate("/"); }}>Sign out of Demo staff</button></span><h1 style={{ marginTop: 10 }}>Back office</h1><Why label="What this is"><p>Every job, hold, payout and dispute on this server{o ? `, on PayPal ${o.paypal === "mock" ? "stand-in" : "sandbox"}, hold mode ${o.holdMode}` : ""}. The seeded month is demo data.</p></Why></div>
        <button className="btn sm" onClick={runTick} title="Reauthorize aging holds, expire old ones, refresh payout statuses">Run the tick now</button>
      </div>
      {o ? <div className="stat-row">
        <div className="stat"><b>{o.jobs}</b><span>JOBS</span></div>
        <div className="stat"><b>{o.held.usd}</b><span>HELD NOW</span></div>
        <div className="stat"><b>{o.captured.usd}</b><span>CAPTURED</span></div>
        <div className="stat"><b>{o.paidToPros.usd}</b><span>PAID TO PROS</span></div>
        <div className="stat"><b>{o.fees.usd}</b><span>FEES · PAYPAL COST {o.paypalFees.usd}</span></div>
        <div className="stat"><b className={o.unbalanced ? "bad" : "ok"}>{o.unbalanced}</b><span>LEDGERS OFF BY A CENT</span></div>
      </div> : <div className="skel" style={{ height: 76 }} />}
      <div className="bo-split">
        <Suspense fallback={<div className="skel" style={{ height: 260 }} />}><MoneyChart tick={tick} /></Suspense>
        <Alerts tick={tick} />
      </div>
      <div>
        <Ask onGrid={(g) => setTab(g)} />
        <div className="tabs" role="tablist">{TABS.map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? "on" : ""} onClick={() => setTab(k)}>{l}{k === "disputes" && o?.byStatus?.disputed ? <span className="n">{o.byStatus.disputed}</span> : null}</button>)}</div>
        {tab === "queue" && <QueueTab tick={tick} now={now} bump={() => setTick((x) => x + 1)} />}
        {tab === "pros" && <ProsTab tick={tick} bump={() => setTick((x) => x + 1)} />}
        {tab === "jobs" && <JobsTab tick={tick} now={now} />}
        {tab === "holds" && <HoldsTab tick={tick} now={now} />}
        {tab === "payouts" && <PayoutsTab tick={tick} />}
        {tab === "disputes" && <DisputesTab tick={tick} bump={() => setTick((x) => x + 1)} />}
        {tab === "ledger" && <LedgerTab tick={tick} />}
        {tab === "recon" && <ReconTab />}
      </div>
    </div>
  );
}

function MoneyChart({ tick }) {
  const led = useApi("/api/staff/ledger", tick);
  const data = useMemo(() => {
    const by = {};
    for (const l of led.data || []) {
      const d = new Date(l.at).toLocaleDateString("en-CA", { timeZone: "America/Chicago" }), a = cents(l.amount) / 100;
      by[d] ||= { day: d.slice(5), captured: 0, pros: 0, refunds: 0 };
      if (l.kind === "capture") by[d].captured += a; else if (l.kind === "pro_payout" || l.kind === "helper_payout") by[d].pros += a; else if (l.kind === "refund") by[d].refunds += a;
    }
    return Object.entries(by).sort(([a], [b]) => a.localeCompare(b)).map(([, v]) => v);
  }, [led.data]);
  return (
    <div className="panel bo-chart">
      {!led.data ? <div className="skel" style={{ height: 240 }} /> : <Chart options={{ height: 260, data, title: { text: "Money by day" }, subtitle: { text: "captured · paid to pros and helpers · refunded (USD, from the ledger)" },
        series: [{ type: "bar", xKey: "day", yKey: "captured", yName: "Captured" }, { type: "bar", xKey: "day", yKey: "pros", yName: "Paid to pros" }, { type: "bar", xKey: "day", yKey: "refunds", yName: "Refunded" }],
        axes: [{ type: "category", position: "bottom" }, { type: "number", position: "left", label: { formatter: (p) => `$${p.value}` } }], legend: { position: "bottom" } }} />}
    </div>
  );
}

function Alerts({ tick }) {
  const a = useApi("/api/staff/alerts", tick), list = a.data?.alerts || [];
  return (
    <section className="panel stack-s" aria-labelledby="h-al">
      <div className="panel-h"><h3 id="h-al">Alerts</h3><span className="tiny muted mono">rules over jobs, holds and payouts</span></div>
      {!a.data && <div className="skel" style={{ height: 80 }} />}
      {a.data && !list.length && <p className="small muted">Nothing out of the ordinary.</p>}
      <ol className="bo-alerts">{list.map((x) => <li key={x.id} className={`bo-alert ${x.acked ? "acked" : ""}`}>
        <span className={`bo-sev ${x.level}`}>{(x.level || "").toUpperCase()}</span>
        <div><b className="small">{x.number}{x.pro ? ` · ${x.pro}` : ""}</b><p className="small ink2">{x.says}</p><p className="tiny mono muted">{x.kind}</p></div>
        {!x.acked && <button className="btn sm" onClick={async () => { await api(`/api/staff/alerts/${encodeURIComponent(x.id)}/ack`, { method: "POST" }); a.reload(); }}>Acknowledge</button>}
      </li>)}</ol>
    </section>
  );
}

// ask a grid in plain words: the server plans filters and a sort for one grid (model or rules, labelled)
function Ask({ onGrid }) {
  const [q, setQ] = useState(""), [r, setR] = useState(null), [busy, setBusy] = useState(false);
  const go = async (text) => { const s = (text ?? q).trim(); if (!s) return; setQ(s); setBusy(true); try { const x = await ask(s); setR(x); onGrid(x.grid); } catch (e) { setR({ error: e.message }); } setBusy(false); };
  return (
    <div className="stack-s" style={{ marginBottom: "var(--s4)" }}>
      <form className="bo-ask" onSubmit={(e) => { e.preventDefault(); go(); }}>
        <label className="sr" htmlFor="ask">Ask the grid</label>
        <input id="ask" className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ask the grids, e.g. plumbing over $200, biggest first" />
        <button className={`btn sm accent ${busy ? "busy" : ""}`} disabled={!q.trim() || busy}>Ask</button>
      </form>
      <div className="row" style={{ gap: 6 }}>{["disputed jobs", "holds expiring this week", "plumbing over $200, biggest first", "payouts unclaimed"].map((x) => <button key={x} type="button" className="chip tiny" onClick={() => go(x)}>{x}</button>)}</div>
      {r && <ul className="bo-trace">{r.error ? <li className="bad">{r.error}</li> : <>
        <li>plan by <Src s={r.source} /> for the <b>{r.grid}</b> grid · it only filters and sorts{r.modelDropped ? ` · the model's plan was dropped: ${r.modelDropped}` : ""}</li>
        {(r.filters || []).map((f, i) => <li key={i}>filter {f.field} {f.op} {Array.isArray(f.value) ? f.value.join("–") : String(f.value ?? "")}</li>)}
        {r.sort && <li>sort {r.sort.field} {r.sort.dir}</li>}
        {r.rules && <li className="muted">{typeof r.rules === "string" ? r.rules : JSON.stringify(r.rules)}</li>}
      </>}</ul>}
    </div>
  );
}

// the expert queue: milestones the checks left to a person, with the 4-business-hour SLA counting down
function QueueTab({ tick, now, bump }) {
  const q = useApi("/api/staff/queue", tick), { toast } = useMe(), [busy, setBusy] = useState(null), [note, setNote] = useState({});
  const decide = async (it, decision) => { setBusy(it.id + decision); try { await api(`/api/staff/queue/${it.job}/${it.id}`, { method: "POST", body: { decision, note: note[it.id] || undefined } }); toast(`${it.number}: ${decision === "release" ? "released" : decision === "needs_fix" ? "sent back for a fix" : "left to the customer"}.`); bump(); } catch (e) { toast(e.message, true); } setBusy(null); };
  if (!q.data) return <div className="skel" style={{ height: 200 }} />;
  const items = q.data.items || [];
  return (
    <div className="stack">
      <Why><p>Milestones the checks couldn't settle (a model was unsure, or none answered). Answer within {q.data.slaHours} business hours ({q.data.businessHours}). The customer can still decide first.</p></Why>
      {!items.length && <div className="empty"><p className="small">The queue is empty.</p></div>}
      {items.map((it) => <QueueItem key={it.id} it={it} now={now} busy={busy} note={note} setNote={setNote} decide={decide} />)}
    </div>
  );
}
function QueueItem({ it, now, busy, note, setNote, decide }) {
  const left = useLeft(it.slaDue, now);
  const cls = left != null && left <= 0 ? "over" : left != null && left < 3600e3 ? "soon" : "";
  return (
    <div className="panel stack-s">
      <div className="row between">
        <span className="row" style={{ gap: 8 }}><span className="part">{it.number}</span><b>{it.title}</b>{it.milestoneTitle && it.milestoneTitle !== it.title && <span className="small ink2">· {it.milestoneTitle}</span>}</span>
        <span className="sla-box"><span className={`sla ${cls}`}>{left != null && left <= 0 ? `overdue ${fmtLeft(-left)}` : `${fmtLeft(left)} left`}</span><span className="data">SLA {when(it.slaDue)}</span></span>
      </div>
      <p className="small">{it.why} · {it.pro} · {m(it.due)}</p>
      <div className="row" style={{ gap: 6 }}>{(it.checks || []).map((c) => <span key={c.id} className={`badge ${c.verdict === "pass" ? (c.confidence < 0.6 ? "warn" : "good") : c.verdict === "fail" ? "bad" : "warn"}`}>{c.id} {c.verdict} {c.confidence != null ? (+c.confidence).toFixed(2) : ""}</span>)}</div>
      <div className="row">
        <input className="input sm" style={{ flex: "1 1 200px" }} value={note[it.id] || ""} onChange={(e) => setNote({ ...note, [it.id]: e.target.value })} placeholder="Note (on the record)" aria-label="Note" />
        <button className={`btn sm accent ${busy === it.id + "release" ? "busy" : ""}`} disabled={!!busy} onClick={() => decide(it, "release")}>Release</button>
        <button className={`btn sm ${busy === it.id + "needs_fix" ? "busy" : ""}`} disabled={!!busy} onClick={() => decide(it, "needs_fix")}>Ask for a fix</button>
        <button className={`btn sm ${busy === it.id + "customer" ? "busy" : ""}`} disabled={!!busy} onClick={() => decide(it, "customer")}>Leave to the customer</button>
        <Link className="btn sm" to={`/office/jobs/${it.job}`}>Arbiter view</Link>
      </div>
    </div>
  );
}

// pros: verified badges, the insurance certificate, and the staff review that adds the "Reviewed by staff" badge
function ProsTab({ tick, bump }) {
  const list = useApi("/api/staff/pros", tick), { toast } = useMe(), [busy, setBusy] = useState(null);
  const review = async (p, ok) => { setBusy(p.id + ok); try { await api(`/api/staff/pros/${p.id}/review`, { method: "POST", body: { ok, note: ok ? "documents checked" : "documents need another look" } }); toast(`${p.name}: ${ok ? "reviewed" : "flagged"}.`); bump(); } catch (e) { toast(e.message, true); } setBusy(null); };
  if (!list.data) return <div className="skel" style={{ height: 200 }} />;
  return (
    <div className="scroll-x"><table className="table"><thead><tr><th>Pro</th><th>Verified</th><th>Licence</th><th>Insurance</th><th className="r">Paid</th><th></th></tr></thead>
      <tbody>{list.data.map((p) => <tr key={p.id}>
        <td><Link to={`/pros/${p.id}`}><b>{p.name}</b></Link><div className="tiny muted">{p.trade} · {p.zip}</div></td>
        <td><Badges pro={p} /></td>
        <td className="small">{p.verification?.license ? (p.verification.license.valid ? `${p.verification.license.number}` : p.verification.license.required === false ? "none needed" : p.verification.license.why) : "—"}</td>
        <td className="small">{p.verification?.insurance?.valid ? p.verification.insurance.limit : (p.verification?.insurance?.problems || []).join("; ") || "—"}{p.verification?.insurance?.document && <> · <a href={`/api/staff/pros/${p.id}/insurance-doc`} target="_blank" rel="noreferrer">certificate</a></>}</td>
        <td className="num r">{m(p.earnings)}</td>
        <td><span className="row" style={{ gap: 6, flexWrap: "nowrap" }}><button className={`btn sm ${busy === p.id + true ? "busy" : ""}`} disabled={!!busy} onClick={() => review(p, true)}>Reviewed</button><button className={`btn sm ${busy === p.id + false ? "busy" : ""}`} disabled={!!busy} onClick={() => review(p, false)}>Flag</button></span></td>
      </tr>)}</tbody></table></div>
  );
}

function JobsTab({ tick, now }) {
  const rows = useApi("/api/staff/jobs", tick), [sel, setSel] = useState(null);
  const ctx = useMemo(() => ({ now }), [now]);
  return (
    <div className="stack">
      <div className="bo-split">
        <Grid name="jobs" title="Jobs" rows={rows.data} columnDefs={JOB_COLS} agentColumns={AGENT_COLS} getRowId={(p) => p.data.id} selected={sel} onPick={(r) => setSel(r.id)} height={520} pagination pageSize={20} csv="done-jobs" context={ctx} />
        {sel ? <JobDetail id={sel} /> : <div className="empty"><p className="small">Pick a job to see its conditions, checks, money and PayPal ids.</p></div>}
      </div>
    </div>
  );
}

function JobDetail({ id }) {
  const j = useApi(`/api/staff/jobs/${id}`).data;
  if (!j) return <div className="skel" style={{ height: 320 }} />;
  return (
    <div className="panel marks stack" style={{ position: "sticky", top: 76 }}>
      <div className="panel-h"><h3>{j.number} · {j.scope.title}</h3><span className="tiny muted">{j.customer?.name}</span></div>
      <Link className="btn sm" to={`/office/jobs/${j.id}`}>Open the arbiter view</Link>
      <p className="small ink2">{j.next}</p>
      {j.lastCheck && <CheckHead round={j.lastCheck} job={j} />}
      <Conditions job={j} />
      <Hold job={j} />
      <Split job={j} />
      <Ids rows={paypalIds(j)} />
      {j.offers?.some((o) => o.floor) && <details><summary>OFFER FLOORS (STAFF ONLY)</summary><ul className="spec">{j.offers.map((o) => <li key={o.id}><span className="lead">{o.pro.name}</span><span className="val">{m(o.amount)} · floor {m(o.floor)}</span></li>)}</ul></details>}
    </div>
  );
}

function HoldsTab({ tick, now }) {
  const rows = useApi("/api/staff/holds", tick), ctx = useMemo(() => ({ now }), [now]);
  const cols = [{ field: "number", headerName: "Job", cellRenderer: NumberCell, width: 104 }, { field: "status", cellRenderer: StatusCell, width: 176 }, { field: "pro", width: 200 }, { field: "hold", cellRenderer: MoneyCell, width: 110, ...num }, { field: "expiresAt", headerName: "Expires in", cellRenderer: ExpiryCell, width: 110, sort: "asc" }, { field: "honorUntil", headerName: "Guarantee ends", cellRenderer: DateCell, width: 150 }, { field: "reauthorized", width: 120 }, { field: "authorization", cellRenderer: IdCell, width: 190 }, { field: "order", cellRenderer: IdCell, width: 190 }, { field: "createdAt", headerName: "Held", cellRenderer: DateCell, width: 140 }];
  return <div className="stack-s"><Why><p>Live authorizations, soonest expiry first. Past the 3-day guarantee the tick reauthorizes them; at 29 days a hold expires and the job with it.</p></Why><Grid name="holds" rows={rows.data} columnDefs={cols} getRowId={(p) => p.data.id} autoHeight context={ctx} csv="done-holds" /></div>;
}

function PayoutsTab({ tick }) {
  const rows = useApi("/api/staff/payouts", tick);
  const data = useMemo(() => (rows.data || []).map((p) => ({ ...p, release: p.split?.release, pro_: p.split?.pro, helper: p.split?.helper, fee: p.split?.fee, n: p.items?.length, tx: (p.paypal || []).map((x) => x.transactionId).filter(Boolean).join(" ") })), [rows.data]);
  const cols = [{ field: "number", headerName: "Job", cellRenderer: NumberCell, width: 104 }, { field: "pro", width: 210 }, { field: "batchId", headerName: "Payout batch", cellRenderer: IdCell, width: 200 }, { field: "status", width: 150 }, { field: "n", headerName: "Items", width: 84, ...num }, { field: "release", cellRenderer: MoneyCell, width: 110, ...num }, { field: "pro_", headerName: "To pro", cellRenderer: MoneyCell, width: 110, ...num }, { field: "helper", headerName: "To helper", cellRenderer: MoneyCell, width: 110, ...num }, { field: "fee", cellRenderer: MoneyCell, width: 96, ...num }, { field: "tx", headerName: "Transactions", cellRenderer: IdCell, flex: 1, minWidth: 220 }, { field: "at", headerName: "Sent", cellRenderer: DateCell, width: 140, sort: "desc" }];
  return <div className="stack"><Unclaimed tick={tick} /><Grid name="payouts" rows={data} columnDefs={cols} getRowId={(p) => p.data.job} height={480} pagination csv="done-payouts" /></div>;
}
// payouts nobody claimed (no PayPal account at that email): take them back from PayPal; they go out again only to a
// different PayPal the same person verifies
function Unclaimed({ tick }) {
  const u = useApi("/api/staff/payouts/unclaimed", tick), { toast } = useMe();
  if (!u.data?.length) return null;
  const back = async (x) => { if (!(await askConfirm({ title: `Take back ${$c(x.amount)} from ${x.number}?`, body: "PayPal returns the unclaimed money to VeriPay. It goes out again automatically once the pro verifies a different PayPal.", ok: "Take it back" }))) return; try { await api(`/api/staff/jobs/${x.job}/payouts/${encodeURIComponent(x.item)}/take-back`, { method: "POST", body: {} }); toast("Returned by PayPal; waiting for a new verified PayPal."); u.reload(); } catch (e) { toast(e.message, true); } };
  return (
    <section className="panel stack-s" aria-labelledby="h-unc">
      <h3 id="h-unc">Unclaimed payouts ({u.data.length})</h3>
      <p className="small ink2">Sent, but nobody has a PayPal account at that email. PayPal returns them after 30 days; take one back sooner to re-send it to a corrected PayPal.</p>
      <div className="scroll-x"><table className="table"><thead><tr><th>Job</th><th>To</th><th className="r">Amount</th><th>Waiting</th><th></th></tr></thead>
        <tbody>{u.data.map((x) => <tr key={x.item}><td>{x.number}</td><td>{x.to}</td><td className="num r">{$c(x.amount)}</td><td className="num">{x.days} days</td><td><button className="btn sm" onClick={() => back(x)}>Take back</button></td></tr>)}</tbody></table></div>
    </section>
  );
}

function DisputesTab({ tick, bump }) {
  const rows = useApi("/api/staff/disputes", tick), { toast } = useMe(), [rel, setRel] = useState({}), [busy, setBusy] = useState(null);
  const resolve = async (d, outcome) => { setBusy(d.id + outcome); try { await api(`/api/staff/disputes/${d.id}/resolve`, { method: "POST", body: { outcome, release: outcome === "partial" ? dollars(rel[d.id]) : undefined, note: "settled by staff" } }); toast(`${d.number} settled.`); bump(); } catch (e) { toast(e.message, true); } setBusy(null); };
  if (!rows.data) return <div className="skel" style={{ height: 200 }} />;
  if (!rows.data.length) return <div className="empty"><p className="small">No disputes.</p></div>;
  return (
    <div className="stack">{rows.data.map((d) => { const s = d.dispute, sug = s?.summary?.suggestion; return (
      <div key={d.id} className="panel stack-s">
        <div className="row between"><span className="row"><span className="part">{d.number}</span><b>{d.title}</b><StatusCell value={d.status} /></span><span className="row"><span className="mono tiny muted">{d.customer} · {d.pro} · due {money(d.due)}</span><Link className="btn sm" to={`/office/jobs/${d.id}`}>Arbiter view</Link></span></div>
        <p className="small">Opened by the {s.by}: “{s.reason}”</p>
        {sug && <p className="small ink2"><Src s={sug.source} prefix="suggested by" /> release {m(sug.release)}, refund {m(sug.refund)}. {sug.why}</p>}
        {s.resolution ? <p className="note good small">Settled: release {m(s.resolution.release)}, refund {m(s.resolution.refund)}. {s.resolution.why}</p> : <div className="row">
          <button className={`btn sm accent ${busy === d.id + "release" ? "busy" : ""}`} disabled={!!busy} onClick={() => resolve(d, "release")}>Release all</button>
          <button className={`btn sm ${busy === d.id + "refund" ? "busy" : ""}`} disabled={!!busy} onClick={() => resolve(d, "refund")}>Refund all</button>
          <span className="money-in" style={{ width: 110 }}><input className="input sm" inputMode="decimal" value={rel[d.id] || ""} onChange={(e) => setRel({ ...rel, [d.id]: e.target.value })} placeholder={sug ? String(sug.release.cents / 100) : ""} aria-label="Release to the pro, dollars" /></span>
          <button className={`btn sm ${busy === d.id + "partial" ? "busy" : ""}`} disabled={!!busy || dollars(rel[d.id]) == null} onClick={() => resolve(d, "partial")}>Release this, refund the rest</button>
        </div>}
      </div>); })}</div>
  );
}

function LedgerTab({ tick }) {
  const rows = useApi("/api/staff/ledger", tick);
  const data = useMemo(() => (rows.data || []).map((l, i) => ({ ...l, key: `${l.job}-${l.n}-${i}`, amt: cents(l.amount) })), [rows.data]);
  const cols = [{ field: "number", headerName: "Job", cellRenderer: NumberCell, width: 104 }, { field: "n", headerName: "#", width: 64, ...num }, { field: "kind", width: 150 }, { field: "amt", headerName: "Amount", cellRenderer: MoneyCell, width: 120, ...num }, { field: "ref", headerName: "PayPal id", cellRenderer: IdCell, width: 200 }, { field: "flow", width: 220 }, { field: "note", flex: 1, minWidth: 240 }, { field: "at", cellRenderer: DateCell, width: 140, sort: "desc" }];
  return <Grid name="ledger" rows={data} columnDefs={cols} getRowId={(p) => p.data.key} height={520} pagination pageSize={50} csv="done-ledger" />;
}

function ReconTab() {
  const r = useApi("/api/staff/recon"), { toast } = useMe(), [busy, setBusy] = useState(false);
  const go = async () => { setBusy(true); try { r.set({ report: await api("/api/staff/recon?wait=1", { method: "POST" }), history: r.data?.history || [] }); } catch (e) { toast(e.message, true); } setBusy(false); };
  const rep = r.data?.report;
  const cols = [{ field: "kind", width: 130 }, { field: "job", headerName: "Job", width: 120 }, { field: "ref", headerName: "PayPal id", cellRenderer: IdCell, width: 200 }, { field: "batch", headerName: "Batch", cellRenderer: IdCell, width: 190 }, { field: "ours", headerName: "Our ledger", cellRenderer: MoneyCell, width: 130, ...num }, { field: "paypal", headerName: "PayPal says", cellRenderer: MoneyCell, width: 130, ...num }, { field: "feePaypal", headerName: "PayPal fee", cellRenderer: MoneyCell, width: 120, ...num }, { field: "via", width: 140 }, { field: "status", width: 130, cellClassRules: { bad: (p) => p.value && p.value !== "matched", ok: (p) => p.value === "matched" } }];
  return (
    <div className="stack">
      <div className="row between"><Why><p>Asks PayPal about every capture, refund and payout in our ledger and lists any difference. Via the PayPal Agent Toolkit where it has the call, else the REST API.</p></Why><button className={`btn accent ${busy ? "busy" : ""}`} onClick={go} disabled={busy}>Reconcile now</button></div>
      {rep ? <>
        <p className="data">{when(rep.at)} · PayPal {rep.paypal === "mock" ? "stand-in" : rep.paypal} · {rep.toolkit?.package || "REST"} ({(rep.toolkit?.tools || []).join(", ")}) · {(rep.calls || []).length} toolkit calls · {rep.rows?.length || 0} rows · {(rep.rows || []).filter((x) => x.status !== "matched").length} not matched</p>
        {rep.summary?.text && <p className="note small"><Src s={rep.summary.source} /> {rep.summary.text}</p>}
        {rep.fees && <p className="small">PayPal's fees: {$c(rep.fees.captures)} on captures (Transaction Search, checked against the ledger: {rep.fees.differences ? <b className="bad">{rep.fees.differences} different</b> : "all match"}) and {$c(rep.fees.payouts)} on payouts.</p>}
        <Grid name="recon" rows={(rep.rows || []).map((x, i) => ({ ...x, key: i, ours: cents(x.ours), paypal: cents(x.paypal), feePaypal: x.fee?.paypal != null ? cents(x.fee.paypal) : null }))} columnDefs={cols} getRowId={(p) => String(p.data.key)} height={420} csv="done-recon" />
      </> : <div className="empty"><p className="small">No reconciliation run yet on this server.</p></div>}
      <PayPalBalance />
      <Insights />
      <ReconAgent />
      <PayPalDisputesAgent />
      <PayPalMcp />
      <Webhooks />
      <InvoiceSearch />
      <PayPalTools />
    </div>
  );
}

// the disputes agent: PayPal's disputes read with the Agent Toolkit, tied to jobs; code proposes, staff send or accept
const ACTION = { send_evidence: "Send evidence", review: "Staff review", wait: "Waiting for PayPal", closed: "Closed", look: "Not ours" };
function PayPalDisputesAgent() {
  const a = useApi("/api/staff/paypal-disputes/triage"), { toast } = useMe(), [busy, setBusy] = useState(false), rep = a.data && !a.data.none ? a.data : null;
  const run = async (body = {}) => { setBusy(true); try { a.set(await api("/api/staff/paypal-disputes/triage", { method: "POST", body })); } catch (e) { toast(e.message, true); } setBusy(false); };
  const accept = async (r) => { const note = prompt(`Accept the buyer's claim on ${r.number}? PayPal refunds the buyer. Note for PayPal:`); if (!note) return; try { await api(`/api/staff/jobs/${r.job}/paypal-dispute/accept`, { method: "POST", body: { note } }); toast("Claim accepted: PayPal refunds the buyer."); run(); } catch (e) { toast(e.message, true); } };
  const offer = async (r) => { const amt = prompt(`How much of ${r.amount != null ? `$${(r.amount / 100).toFixed(2)}` : "it"} to offer back on ${r.number}? (USD)`); if (!amt) return; const note = prompt("Note for the buyer (PayPal shows it):"); if (!note) return; try { await api(`/api/staff/jobs/${r.job}/paypal-dispute/offer`, { method: "POST", body: { amount: amt, note } }); toast("Offer sent: PayPal asks the buyer."); run(); } catch (e) { toast(e.message, true); } };
  const message = async (r) => { const m = prompt(`Message the buyer in PayPal's dispute thread on ${r.number}:`); if (!m) return; try { await api(`/api/staff/jobs/${r.job}/paypal-dispute/message`, { method: "POST", body: { message: m } }); toast("Sent in PayPal's dispute thread."); run(); } catch (e) { toast(e.message, true); } };
  const returned = async (r) => { const n = prompt(`${r.number}: what came back, and when? (PayPal is told the returned item arrived)`); if (!n) return; try { await api(`/api/staff/jobs/${r.job}/paypal-dispute/acknowledge-return`, { method: "POST", body: { note: n } }); toast("PayPal told the item arrived back."); run(); } catch (e) { toast(e.message, true); } };
  const appeal = async (r) => { const n = prompt(`Appeal PayPal's decision on ${r.number}: what did PayPal miss? (the job's evidence and signed receipt go with it)`); if (!n) return; try { await api(`/api/staff/jobs/${r.job}/paypal-dispute/appeal`, { method: "POST", body: { notes: n } }); toast("Appeal sent to PayPal."); run(); } catch (e) { toast(e.message, true); } };
  const redo = async (r) => { const note = prompt(`Offer the buyer on ${r.number} that the pro redoes the work, no money back. Note for the buyer:`); if (!note) return; try { await api(`/api/staff/jobs/${r.job}/paypal-dispute/offer`, { method: "POST", body: { kind: "redo", note } }); toast("Offered in PayPal: the work redone."); run(); } catch (e) { toast(e.message, true); } };
  const part = async (r) => { const amt = prompt(`Accept only part of the claim on ${r.number}: how much back (USD)?`); if (!amt) return; const note = prompt("Note for PayPal:"); if (!note) return; try { await api(`/api/staff/jobs/${r.job}/paypal-dispute/accept`, { method: "POST", body: { amount: amt, note } }); toast("Partly accepted: PayPal refunds that much."); run(); } catch (e) { toast(e.message, true); } };
  const info = async (r) => { const n = prompt(`${r.number}: what did PayPal ask for? (sent with the job's evidence summary)`); if (!n) return; try { await api(`/api/staff/jobs/${r.job}/paypal-dispute/supporting-info`, { method: "POST", body: { notes: n } }); toast("Sent to PayPal."); run(); } catch (e) { toast(e.message, true); } };
  const evidence = async (r) => { try { await api(`/api/staff/jobs/${r.job}/paypal-dispute/evidence`, { method: "POST", body: {} }); toast("Evidence sent to PayPal."); run(); } catch (e) { toast(e.message, true); } };
  return (
    <section className="panel stack-s" aria-labelledby="h-pdagent">
      <div className="row between"><h3 id="h-pdagent">PayPal disputes agent</h3><div className="row"><button className={`btn sm ${busy ? "busy" : ""}`} disabled={busy} onClick={() => run()}>Read PayPal's disputes</button><button className="btn sm ghost" disabled={busy} onClick={() => run({ auto: true })}>…and send evidence</button></div></div>
      <Why><p>Reads every dispute in PayPal with the Agent Toolkit (list_disputes, get_dispute) and ties it to its job by the capture. Code proposes: evidence when the release followed a passing check and a signed receipt, else staff review. Sending evidence moves no money. Accepting a claim refunds the buyer, so only staff can do it.</p></Why>
      {!rep ? <p className="small muted">Not run yet on this server.</p> : <>
        <p className="data">{when(rep.at)} · PayPal {rep.paypal === "mock" ? "stand-in" : rep.paypal} · via {rep.via} · {(rep.calls || []).length} calls ({[...new Set((rep.calls || []).map((c) => c.tool))].join(", ")}) · {rep.rows.length} disputes{rep.error ? ` · error: ${rep.error}` : ""}</p>
        {!rep.rows.length ? <p className="small muted">PayPal lists no disputes on this account.</p> : <div className="scroll-x"><table className="table"><thead><tr><th>Dispute</th><th>Job</th><th className="r">Amount</th><th>PayPal</th><th>Due</th><th>Proposed</th><th></th></tr></thead>
          <tbody>{rep.rows.map((r) => <tr key={r.dispute}><td className="mono small">{r.dispute}</td><td>{r.number || "—"}</td><td className="num r">{r.amount != null ? `$${(r.amount / 100).toFixed(2)}` : "—"}</td><td className="small">{String(r.status || "").replace(/_/g, " ").toLowerCase()}</td><td className="num small">{r.dueInHours != null ? `${Math.round(r.dueInHours / 24)} days` : "—"}</td>
            <td><b>{ACTION[r.action] || r.action}</b>{r.sent && <span className="tiny ok"> · sent</span>}<div className="tiny muted">{r.why}</div></td>
            <td className="row">{r.job && r.action !== "closed" && <button className="btn sm ghost" onClick={() => message(r)}>Message buyer</button>}{r.job && r.action !== "closed" && <button className="btn sm ghost" onClick={() => returned(r)}>Item came back</button>}{r.job && r.action !== "closed" && <button className="btn sm ghost" onClick={() => redo(r)}>Offer to redo</button>}{r.job && r.action !== "closed" && <button className="btn sm ghost" onClick={() => part(r)}>Accept part</button>}{r.job && r.action !== "closed" && <button className="btn sm ghost" onClick={() => info(r)}>Send what PayPal asked</button>}{r.job && r.action === "closed" && <button className="btn sm ghost" onClick={() => appeal(r)}>Appeal</button>}{["send_evidence", "review"].includes(r.action) && r.job && <button className="btn sm" onClick={() => evidence(r)}>Send evidence</button>}{["send_evidence", "review"].includes(r.action) && r.job && <button className="btn sm ghost" onClick={() => offer(r)}>Offer part back</button>}{["send_evidence", "review"].includes(r.action) && r.job && <button className="btn sm ghost" onClick={() => accept(r)}>Accept claim</button>}</td></tr>)}</tbody></table></div>}
      </>}
    </section>
  );
}

const $c = (c) => (c == null ? "—" : `${c < 0 ? "-" : ""}$${(Math.abs(c) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`); // raw cents
// sales by period: PayPal's get_merchant_insights when PayPal answers (not in the sandbox), else the ledger by code
function Insights() {
  const [q, setQ] = useState({ type: "SALES", interval: "WEEKLY" }), r = useApi(`/api/staff/insights?type=${q.type}&interval=${q.interval}`), d = r.data;
  const max = Math.max(1, ...((d?.series || []).map((b) => b.value)));
  return (
    <section className="panel stack-s" aria-labelledby="h-ins">
      <div className="row between"><h3 id="h-ins">{q.type === "SALES" ? "Sales" : "Orders"} by {q.interval.toLowerCase().replace("ly", "")}</h3>
        <div className="row"><select className="input sm" value={q.type} onChange={(e) => setQ({ ...q, type: e.target.value })} aria-label="What"><option value="SALES">Sales</option><option value="ORDERS">Orders</option></select>
          <select className="input sm" value={q.interval} onChange={(e) => setQ({ ...q, interval: e.target.value })} aria-label="Period"><option value="DAILY">Daily</option><option value="WEEKLY">Weekly</option><option value="MONTHLY">Monthly</option></select></div></div>
      {d && <p className="tiny muted"><span className={`src ${d.source === "paypal" ? "model" : "rules"}`}>{d.source === "paypal" ? "PAYPAL" : "LEDGER"}</span> {d.says}</p>}
      {d?.series && (!d.series.length ? <p className="small muted">Nothing in this range.</p> : <div className="stack-s">{d.series.slice(-12).map((b) => <div key={b.period} className="row" style={{ gap: "var(--s2)" }}><span className="mono tiny" style={{ width: 84 }}>{b.period}</span><span style={{ flex: 1 }}><span style={{ display: "block", height: 10, width: `${(b.value / max) * 100}%`, background: "var(--signal)", borderRadius: 2 }} /></span><span className="num small" style={{ width: 90, textAlign: "right" }}>{d.unit === "cents" ? $c(b.value) : b.value}</span></div>)}</div>)}
    </section>
  );
}

// the platform's PayPal balance (GET /v1/reporting/balances)
function PayPalBalance() {
  const b = useApi("/api/staff/paypal-balance"), d = b.data;
  return (
    <section className="panel stack-s" aria-labelledby="h-ppbal">
      <div className="row between"><h3 id="h-ppbal">PayPal balance</h3><button className="btn sm ghost" onClick={() => b.reload()}>Refresh</button></div>
      {b.error ? <p className="note bad small">{b.error.message || String(b.error)}</p> : !d ? null : <>
        <div className="stat-row"><div className="stat"><b>{$c(d.available)}</b><span>AVAILABLE</span></div><div className="stat"><b>{$c(d.withheld)}</b><span>WITHHELD</span></div><div className="stat"><b>{$c(d.ledger?.heldNotCaptured)}</b><span>AUTHORIZED, NOT CAPTURED</span></div></div>
        <p className="tiny muted">{d.says} As of {when(d.asOf)}. Authorized holds aren't in a balance until they're captured.</p>
      </>}
    </section>
  );
}

// PayPal webhooks: what arrived, and a simulator (PayPal's own sample event, handed to the same handler, marked simulated)
const WH_EVENTS = ["CUSTOMER.DISPUTE.CREATED", "CHECKOUT.ORDER.APPROVED", "PAYMENT.AUTHORIZATION.CREATED", "PAYMENT.AUTHORIZATION.VOIDED", "PAYMENT.CAPTURE.COMPLETED"];
function Webhooks() {
  const w = useApi("/api/staff/webhooks"), jobs = useApi("/api/staff/jobs"), { toast } = useMe(), [ev, setEv] = useState(WH_EVENTS[0]), [job, setJob] = useState(""), [out, setOut] = useState(null);
  const fire = async () => { try { const r = await api("/api/staff/webhooks/simulate", { method: "POST", body: { event_type: ev, ...(job ? { job } : {}) } }); setOut(r); w.reload(); } catch (e) { toast(e.message, true); } };
  return (
    <section className="panel stack-s" aria-labelledby="h-wh">
      <h3 id="h-wh">PayPal webhooks</h3>
      <Why><p>PayPal tells VeriPay when something changes; each event is verified, then treated as a nudge to look at PayPal's state. The simulator asks PayPal for its own sample of an event (simulate-event) and hands it to the same handler, marked simulated.</p></Why>
      <div className="row"><select className="input sm" value={ev} onChange={(e) => setEv(e.target.value)} aria-label="Event">{WH_EVENTS.map((x) => <option key={x}>{x}</option>)}</select>
        <select className="input sm" value={job} onChange={(e) => setJob(e.target.value)} aria-label="Point it at a job"><option value="">PayPal's sample as is</option>{(jobs.data || []).filter((x) => x.holdStatus).slice(0, 40).map((x) => <option key={x.id} value={x.id}>{x.number} · {x.title}</option>)}</select>
        <button className="btn sm" onClick={fire}>Simulate</button></div>
      <WebhookCatchUp onDone={w.reload} />
      {out && <p className="note small"><b>{out.event.type}</b> · {out.from}{out.pointedAt ? ` → ${out.pointedAt}` : ""}: {out.did.join("; ")}. <span className="tiny muted">{out.note}</span></p>}
      {(w.data?.recent || []).length > 0 && <ol className="tl">{w.data.recent.slice(0, 8).map((x, i) => <li key={i}><time>{when(x.at)}</time><span className="mono small">{x.type}{x.ref ? ` · ${x.ref}` : ""} · {x.simulated ? "simulated" : x.verified ? "verified" : "stand-in"}</span></li>)}</ol>}
    </section>
  );
}

// PayPal's own record of the events it sent (webhooks-events) against what this server handled: replay a missed one here
function WebhookCatchUp({ onDone }) {
  const [d, setD] = useState(null), { toast } = useMe();
  const load = async () => { try { setD(await api("/api/staff/webhooks/paypal-events")); } catch (e) { toast(e.message, true); } };
  const replay = async (x) => { try { const r = await api(`/api/staff/webhooks/paypal-events/${x.id}/replay`, { method: "POST" }); toast(`${r.type}: ${r.did.join("; ")}`); load(); onDone?.(); } catch (e) { toast(e.message, true); } };
  return (
    <div className="stack-s">
      <div className="row"><button className="btn sm ghost" onClick={load}>Check PayPal's event record</button>{d && <span className="tiny muted">{d.events.length} events in 7 days · {d.missed} not handled here</span>}</div>
      {d && <p className="tiny muted">{d.says}</p>}
      {d?.events?.slice(0, 8).map((x) => <div key={x.id} className="row between small"><span className="mono">{x.type} · {when(x.at)}</span>{x.handled ? <span className="tiny ok">handled</span> : <button className="btn sm ghost" onClick={() => replay(x)}>Replay here</button>}</div>)}
    </div>
  );
}
// PayPal's search over the platform's invoices
// staff lookups in PayPal's own records, and the sandbox's negative-testing switch
function PayPalTools() {
  const { toast } = useMe(), [out, setOut] = useState(null), [q, setQ] = useState({ tx: "", item: "", asOf: "", code: "INSTRUMENT_DECLINED" });
  const go = async (path) => { try { setOut(await api(path)); } catch (e) { toast(e.message, true); } };
  const post = async (path, body) => { try { setOut(await api(path, { method: "POST", body })); } catch (e) { toast(e.message, true); } };
  return (
    <section className="panel stack-s" aria-labelledby="h-pptools">
      <h3 id="h-pptools">PayPal tools</h3>
      <div className="row" style={{ flexWrap: "wrap", gap: "var(--s2)" }}>
        <input className="input sm" placeholder="Transaction id" value={q.tx} onChange={(e) => setQ({ ...q, tx: e.target.value })} aria-label="Transaction id" /><button className="btn sm ghost" onClick={() => go(`/api/staff/paypal-transactions?all=1${q.tx ? `&id=${encodeURIComponent(q.tx)}` : ""}`)}>Transaction Search</button>
        <input className="input sm" placeholder="Payout item id" value={q.item} onChange={(e) => setQ({ ...q, item: e.target.value })} aria-label="Payout item id" /><button className="btn sm ghost" onClick={() => q.item && go(`/api/staff/payout-items/${encodeURIComponent(q.item)}`)}>Payout item</button>
        <input className="input sm" type="date" value={q.asOf} onChange={(e) => setQ({ ...q, asOf: e.target.value })} aria-label="Balance as of" /><button className="btn sm ghost" onClick={() => go(`/api/staff/balances${q.asOf ? `?asOf=${q.asOf}T23:59:59Z` : ""}`)}>Balance</button>
        <button className="btn sm ghost" onClick={() => go("/api/staff/paypal-disputes/queue")}>Disputes needing action</button>
        <button className="btn sm ghost" onClick={() => go("/api/staff/webhooks?paypal=1")}>Webhooks in PayPal</button>
        <input className="input sm" value={q.code} onChange={(e) => setQ({ ...q, code: e.target.value })} aria-label="Negative test code" /><button className="btn sm ghost" onClick={() => post("/api/staff/paypal-negative", { code: q.code })}>Negative test</button>
      </div>
      {out && <pre className="tiny mono scroll-x" style={{ maxHeight: 240 }}>{JSON.stringify(out, null, 1).slice(0, 4000)}</pre>}
    </section>
  );
}
function InvoiceSearch() {
  const [st, setSt] = useState("SENT"), [d, setD] = useState(null), { toast } = useMe();
  const go = async () => { try { setD(await api(`/api/staff/paypal-invoices?status=${st}`)); } catch (e) { toast(e.message, true); } };
  return (
    <section className="panel stack-s" aria-labelledby="h-invs">
      <h3 id="h-invs">PayPal invoices</h3>
      <div className="row"><select className="input sm" value={st} onChange={(e) => setSt(e.target.value)} aria-label="Status">{["SENT", "PAID", "MARKED_AS_PAID", "DRAFT", "CANCELLED"].map((x) => <option key={x}>{x}</option>)}</select><button className="btn sm" onClick={go}>Search in PayPal</button>{d && <span className="tiny muted">{d.total} found</span>}</div>
      {d && <p className="tiny muted">{d.says}</p>}
      {d?.items?.length > 0 && <div className="scroll-x"><table className="table"><thead><tr><th>PayPal invoice</th><th>VeriPay</th><th>Status</th><th className="r">Amount</th><th className="r">Due</th></tr></thead>
        <tbody>{d.items.map((x) => <tr key={x.id}><td className="mono small">{x.id}</td><td>{x.veripay || "—"}</td><td className="small">{x.status}</td><td className="num r">{$c(x.amount)}</td><td className="num r">{$c(x.due)}</td></tr>)}</tbody></table></div>}
    </section>
  );
}

function McpProposals() {
  const l = useApi("/api/staff/paypal-mcp/proposals"), { toast } = useMe(), [tool, setTool] = useState("generate_invoice_number"), [args, setArgs] = useState("{}");
  const go = async (path, body) => { try { await api(path, { method: "POST", body }); l.reload(); } catch (e) { toast(e.message, true); } };
  return (
    <div className="stack-s">
      <div className="row"><input className="input sm mono" value={tool} onChange={(e) => setTool(e.target.value)} aria-label="Tool" /><input className="input sm mono" value={args} onChange={(e) => setArgs(e.target.value)} aria-label="Arguments (JSON)" />
        <button className="btn sm ghost" onClick={() => { let a; try { a = JSON.parse(args || "{}"); } catch { return toast("Arguments aren't JSON.", true); } go("/api/staff/paypal-mcp/propose", { tool, args: a, why: "from the back office" }); }}>Propose</button></div>
      {(l.data || []).slice(0, 6).map((p) => <div key={p.id} className="row between small"><span className="mono">{p.tool} {JSON.stringify(p.args).slice(0, 60)}</span><span>{p.status === "proposed" ? <><button className="btn sm" onClick={() => go(`/api/staff/paypal-mcp/proposals/${p.id}/approve`, {})}>Approve and run</button> <button className="btn sm ghost" onClick={() => go(`/api/staff/paypal-mcp/proposals/${p.id}/reject`, {})}>Reject</button></> : <b>{p.status}</b>}</span></div>)}
    </div>
  );
}

// PayPal's own hosted MCP server: VeriPay as its client (sandbox keys only); read tools only
function PayPalMcp() {
  const m = useApi("/api/staff/paypal-mcp"), d = m.data;
  return (
    <section className="panel stack-s" aria-labelledby="h-ppmcp">
      <div className="row between"><h3 id="h-ppmcp">PayPal's MCP server</h3>{d?.available && <button className="btn sm" onClick={() => m.reload()}>Refresh</button>}</div>
      <Why><p>VeriPay connects to PayPal's hosted MCP server as a client, with the app's own token. Only the read tools (get, list, show, search) are allowed through it, so nothing on this path moves money or changes a PayPal record.</p></Why>
      {!d ? null : !d.available ? <p className="small muted">{d.note}</p> : d.error ? <p className="note bad small">{d.error}</p> : <>
        <p className="data"><span className="mono">{d.url}</span> · {d.via} · {d.tools.length} tools · {d.tools.filter((t) => t.read).length} read tools allowed</p>
        <div className="chips">{d.tools.map((t) => <span key={t.name} className={`chip mono tiny ${t.kind === "refused" ? "muted" : ""}`} title={t.says}>{t.kind === "refused" ? "✕ " : t.kind === "write_with_approval" ? "✎ " : ""}{t.name}</span>)}</div>
        <p className="tiny muted">✎ writes that move no money: proposed here, run only after a staff approval. ✕ refused on this path.</p>
        <McpProposals />
      </>}
    </section>
  );
}

// the reconciliation agent: a model chooses which PayPal calls to make (rules when it doesn't answer); code checks every claim it makes
function ReconAgent() {
  const a = useApi("/api/staff/recon/agent"), { toast } = useMe(), [busy, setBusy] = useState(false), rep = a.data && !a.data.none ? a.data : null;
  const go = async () => { setBusy(true); try { a.set(await api("/api/staff/recon/agent", { method: "POST", body: {} })); } catch (e) { toast(e.message, true); } setBusy(false); };
  return (
    <section className="panel stack-s" aria-labelledby="h-ragent">
      <div className="row between"><h3 id="h-ragent">Reconciliation agent</h3><button className={`btn sm ${busy ? "busy" : ""}`} disabled={busy} onClick={go}>Run the agent</button></div>
      <Why><p>A model picks the next PayPal call (the rules pick when it doesn't answer), then says what it found. Code checks every claim against the ledger: a claim code can't confirm is marked.</p></Why>
      {busy && <p className="small">Running: the model chooses one PayPal call at a time, so this can take a minute or two…</p>}
      {!rep ? !busy && <p className="small muted">Not run yet on this server.</p> : <>
        <p className="data">{when(rep.at)} · {rep.ms != null ? `${(rep.ms / 1000).toFixed(1)} s` : ""} · PayPal {rep.paypal === "mock" ? "stand-in" : rep.paypal} · {(rep.steps || []).filter((x) => x.tool).length} calls ({rep.chose?.model || 0} chosen by the model, {rep.chose?.rules || 0} by the rules)</p>
        {rep.summary?.text && <p className="note small">{rep.summary.text}</p>}
        <ol className="tl">{(rep.steps || []).map((x) => <li key={x.n}><time>#{x.n}</time><span><span className={`src ${x.chosenBy === "model" ? "model" : "rules"}`}>{x.chosenBy === "model" ? "MODEL" : "RULES"}</span> {x.tool ? <><b className="mono">{x.tool}</b>{x.args && Object.keys(x.args).length ? <span className="mono tiny muted"> {JSON.stringify(x.args)}</span> : ""}{x.result && <span className="tiny muted"> → {x.result.error ? `error: ${x.result.error}` : Object.entries(x.result).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(", ") : v}`).join(" · ")}</span>}</> : <b>done</b>}{x.why && <span className="tiny"> · {x.why}</span>}</span></li>)}</ol>
        {(rep.claims || []).length > 0 && <div className="scroll-x"><table className="table"><thead><tr><th>PayPal id</th><th>The agent says</th><th>Why</th><th>Code checked</th></tr></thead>
          <tbody>{rep.claims.map((c, i) => <tr key={i}><td className="mono small">{c.ref}</td><td>{String(c.claim).replace(/_/g, " ")}</td><td className="small">{c.why}</td><td className={c.confirmedByCode ? "ok" : "bad"}>{c.confirmedByCode ? "confirmed" : `not confirmed: code says ${String(c.codeSays).replace(/_/g, " ")}`}</td></tr>)}</tbody></table></div>}
        {(rep.codeFollowUps || []).length > 0 && <p className="tiny muted">Code also looked up what the agent skipped: {rep.codeFollowUps.join(", ")}.</p>}
      </>}
    </section>
  );
}
