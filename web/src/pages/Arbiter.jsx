// The arbiter's page (staff): one job on one page for deciding a dispute or a defect claim. Both sides, the dispute,
// each milestone, every check round with its signed verdict hash, BEFORE and AFTER side by side, change orders, the
// thread, the money and the warranty, and the evidence pack to download (every file's sha256, EXIF and URL, every
// verdict with its signed receipt, the ledger).
import { useState } from "react";
import { api, Link, m, useApi, when, dollars, day } from "../api.jsx";
import { useMe } from "../App.jsx";
import { Src, Evidence, Stamp } from "../components/job.jsx";
import { Milestones, MsStatus } from "../components/parts.jsx";

export default function Arbiter({ id }) {
  const { toast } = useMe(), [tick, setTick] = useState(0), a = useApi(`/api/staff/jobs/${id}/arbiter`, tick);
  const [busy, setBusy] = useState(null), [rel, setRel] = useState(""), [refund, setRefund] = useState(""), [note, setNote] = useState("");
  if (a.error?.status === 401) return <div className="empty"><p>Staff only.</p><button className="btn accent" onClick={async () => { await api("/api/auth/staff", { method: "POST", body: {} }); setTick((x) => x + 1); }}>Sign in as staff</button></div>;
  if (a.error) return <div className="empty"><p>{a.error.message}</p><Link className="btn" to="/office">Back office</Link></div>;
  const d = a.data;
  if (!d) return <div className="skel" style={{ height: 400 }} />;
  const run = async (k, path, body) => { setBusy(k); try { await api(path, { method: "POST", body }); toast("Done."); setTick((x) => x + 1); } catch (e) { toast(e.message, true); } setBusy(null); };
  const dsp = d.dispute, w = d.warranty, job = { ...d.job, milestones: d.milestones };
  return (
    <div className="stack-l">
      <div className="page-head">
        <div><span className="badge agent">STAFF · ARBITER</span><h1 style={{ marginTop: 10 }}><span className="signal">#</span>{d.job.number}</h1><p className="lede">{d.job.title} · <MsStatus s={d.job.status} /></p></div>
        <div className="row"><Link className="btn sm" to="/office">Back office</Link><a className="btn sm accent" href={`/api/staff/jobs/${id}/evidence-pack`} download>Download the evidence pack</a></div>
      </div>

      <div className="grid-2">
        <section className="panel stack-s"><h3>The customer says</h3><p className="small">{d.customer?.says || (dsp?.by === "customer" && dsp.reason) || (d.warranty?.claim && `Defect claim: ${d.warranty.claim.reason}`) || "Nothing on record."}</p></section>
        <section className="panel stack-s"><h3>{d.pro?.name || "The pro"} says</h3><p className="small">{d.pro?.says || dsp?.by === "pro" && dsp.reason || "Nothing on record."}</p></section>
      </div>

      {dsp && <section className="panel marks stack-s">
        <div className="panel-h"><h3>Dispute{dsp.milestone ? ` on ${dsp.milestone}` : ""}</h3><span className="data">opened by the {dsp.by} {when(dsp.at)}</span></div>
        <p>“{dsp.reason}”</p>
        {dsp.summary?.suggestion && <p className="small ink2"><Src s={dsp.summary.suggestion.source} prefix="suggested by" /> release {m(dsp.summary.suggestion.release)}, refund {m(dsp.summary.suggestion.refund)}. {dsp.summary.suggestion.why}</p>}
        {(dsp.proposals || []).map((p) => <p key={p.id} className="tiny">{p.by} proposed release {m(p.release)}, refund {m(p.refund)} · {p.status}</p>)}
        {dsp.resolution ? <p className="note good small">Settled: release {m(dsp.resolution.release)}, refund {m(dsp.resolution.refund)}. {dsp.resolution.why}</p> : <div className="row">
          <button className={`btn sm accent ${busy === "r" ? "busy" : ""}`} disabled={!!busy} onClick={() => run("r", `/api/staff/disputes/${id}/resolve`, { outcome: "release", note: note || undefined })}>Release all</button>
          <button className={`btn sm ${busy === "f" ? "busy" : ""}`} disabled={!!busy} onClick={() => run("f", `/api/staff/disputes/${id}/resolve`, { outcome: "refund", note: note || undefined })}>Refund all</button>
          <span className="money-in" style={{ width: 110 }}><input className="input sm" inputMode="decimal" value={rel} onChange={(e) => setRel(e.target.value)} aria-label="Release to the pro, dollars" /></span>
          <button className={`btn sm ${busy === "p" ? "busy" : ""}`} disabled={!!busy || dollars(rel) == null} onClick={() => run("p", `/api/staff/disputes/${id}/resolve`, { outcome: "partial", release: dollars(rel), note: note || undefined })}>Release this, refund the rest</button>
        </div>}
        {d.pastDisputes?.length > 0 && <p className="tiny muted">{d.pastDisputes.length} earlier dispute(s) on this job.</p>}
      </section>}

      {w && <section className="panel marks stack-s">
        <div className="panel-h"><h3>Warranty and retainage</h3><span className="badge">{w.status}</span></div>
        <p className="small">{m(w.retained)} retained · window to {when(w.until)}</p>
        {w.claim && <>
          <p className="small">Defect claimed {when(w.claim.at)}: “{w.claim.reason}”</p>
          {w.claim.check && <p className="tiny"><Src s={w.claim.check.source} /> {w.claim.check.verdict} · {(w.claim.check.reasons || []).join("; ")} · {(w.claim.check.signals || []).join(", ")}</p>}
          {w.claim.fix && <p className="tiny">Fix sent {when(w.claim.fix.at)}: {w.claim.fix.decision}</p>}
          {w.status === "claimed" && <div className="stack-s">
            <textarea className="input" rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Why (goes on the record)" aria-label="Decision note" />
            <div className="row">
              <button className={`btn sm accent ${busy === "dp" ? "busy" : ""}`} disabled={!!busy} onClick={() => run("dp", `/api/staff/jobs/${id}/defect`, { outcome: "pay", note: note || undefined })}>Fixed: pay the retainage</button>
              <button className={`btn sm danger ${busy === "dr" ? "busy" : ""}`} disabled={!!busy} onClick={() => run("dr", `/api/staff/jobs/${id}/defect`, { outcome: "refund", note: note || undefined })}>Refund the retainage</button>
              <span className="money-in" style={{ width: 110 }}><input className="input sm" inputMode="decimal" value={refund} onChange={(e) => setRefund(e.target.value)} aria-label="Refund, dollars" /></span>
              <button className={`btn sm ${busy === "dpart" ? "busy" : ""}`} disabled={!!busy || dollars(refund) == null} onClick={() => run("dpart", `/api/staff/jobs/${id}/defect`, { outcome: "partial", refund: dollars(refund), note: note || undefined })}>Refund this, pay the rest</button>
            </div>
          </div>}
        </>}
      </section>}

      {d.milestones?.length > 0 && <section className="stack-s"><h2 style={{ fontSize: "var(--fs-h3)" }}>Milestones</h2>{d.milestones.length > 1 ? <Milestones job={job} /> : <p className="small">{d.milestones[0].title} · <MsStatus s={d.milestones[0].status} /></p>}</section>}

      <section className="stack-s"><h2 style={{ fontSize: "var(--fs-h3)" }}>Before and after</h2>
        {!d.pairs?.length && <p className="small muted">No photos.</p>}
        {(d.pairs || []).map((p) => <div key={p.check} className="pair"><div className="row" style={{ gap: 8 }}><span className="part">{p.check}</span><b className="small">{p.what}</b></div>
          <div className="pair-cols"><div><span className="eyebrow">BEFORE</span>{p.before?.length ? <Evidence items={p.before} /> : <p className="tiny muted">none</p>}</div><div><span className="eyebrow">AFTER</span>{p.after?.length ? <Evidence items={p.after} /> : <p className="tiny muted">none</p>}</div></div>
          {p.reference?.length > 0 && <div><span className="eyebrow">CUSTOMER'S PROBLEM PHOTO</span><Evidence items={p.reference} /></div>}</div>)}
      </section>

      <section className="stack-s"><h2 style={{ fontSize: "var(--fs-h3)" }}>Every check round, signed</h2>
        <div className="scroll-x"><table className="table"><thead><tr><th>Round</th><th>Milestone</th><th>Decision</th><th>Checker</th><th>Verdicts</th><th>Verdict hash</th><th>Receipt</th></tr></thead>
          <tbody>{(d.checks || []).map((r) => <tr key={r.round}><td className="num">{r.round}{r.kind === "defect" ? " · defect" : ""}</td><td>{r.milestone || "—"}</td><td>{r.decision}</td><td><Src s={r.checker} /></td><td>{(r.checks || []).map((c) => <div key={c.id} className="row" style={{ gap: 6 }}><span className="part">{c.id}</span><Stamp c={c} /></div>)}</td><td className="mono tiny wrap-any">{r.verdictHash || "—"}</td><td>{r.receipt ? <a className="mono tiny" href={`/api/receipts/${r.receipt}`} target="_blank" rel="noreferrer">{r.receipt}</a> : "—"}</td></tr>)}</tbody></table></div>
      </section>

      {d.changeOrders?.length > 0 && <section className="stack-s"><h2 style={{ fontSize: "var(--fs-h3)" }}>Change orders</h2>{d.changeOrders.map((c) => <p key={c.id} className="small"><span className="part">{c.id}</span> +{m(c.amount)} · {c.status} · {c.reason}</p>)}</section>}

      <div className="grid-2">
        <section className="panel stack-s"><h3>Money</h3><ul className="spec">
          <li><span className="lead">Captured</span><span className="val">{m(d.money?.captured)}</span></li>
          <li><span className="lead">Refunded</span><span className="val">{m(d.money?.refunded)}</span></li>
          {d.money?.split && <><li><span className="lead">To the pro</span><span className="val">{m(d.money.split.pro)}</span></li><li><span className="lead">Platform fee</span><span className="val">{m(d.money.split.fee)}</span></li>{d.money.split.retained && <li><span className="lead">Retained</span><span className="val">{m(d.money.split.retained)}</span></li>}</>}
          <li className="total"><span className="lead">Ledger adds up</span><span className={`val ${d.money?.balanced ? "ok" : "bad"}`}>{d.money?.balanced ? "yes" : "NO"}</span></li>
        </ul></section>
        <section className="panel stack-s"><h3>Signed receipts</h3><ul className="ids">{(d.receipts || []).map((r) => <li key={r.id}><span className="k">{r.event}</span><a className="v" href={`/api/receipts/${r.id}`} target="_blank" rel="noreferrer">{r.id}</a><span className="tiny muted">{day(r.at)}</span></li>)}</ul></section>
      </div>
      <details className="panel"><summary>THREAD ({d.thread?.length || 0}) AND TIMELINE ({d.timeline?.length || 0})</summary>
        <ul className="tl">{(d.thread || []).map((t) => <li key={t.id}><time>{when(t.at)}</time><span><b>{t.from?.name || t.from?.kind}</b>: {t.text} <Src s={t.source} /></span></li>)}</ul>
        <ul className="tl">{(d.timeline || []).map((t, i) => <li key={i}><time>{when(t.at)}</time><span className="to">{t.from ? `${t.from} → ` : ""}{t.to}{t.note ? ` · ${t.note}` : ""}</span></li>)}</ul>
      </details>
    </div>
  );
}
