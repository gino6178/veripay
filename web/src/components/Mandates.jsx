// AP2-style signed mandates (PLAN §15 item 2): the person signs what their agent may do, up to how much, for which job,
// until when, once. Issuing needs the PIN; the server verifies every mandate an agent sends and keeps each in a receipt.
import { useState } from "react";
import { api, useApi, when, usd } from "../api.jsx";
import { useMe } from "../App.jsx";

const SCOPE = { hold: "hire (hold the price)", approve_change: "approve a change order", confirm: "confirm the checks", release: "release money", materials_advance: "pay a materials advance", tip: "tip the pro" };

export function Mandates({ tokens = [] }) {
  const { toast } = useMe(), d = useApi("/api/mandates"), [agent, setAgent] = useState(""), [max, setMax] = useState(""), [scope, setScope] = useState(["hold"]), [job, setJob] = useState(""), [mins, setMins] = useState("60"), [made, setMade] = useState(null), [busy, setBusy] = useState(false);
  const live = tokens.filter((x) => !x.revoked);
  const issue = async () => { setBusy(true); try { const r = await api("/api/mandates/issue", { method: "POST", body: { agentClient: agent || live[0]?.id, maxAmount: +max, scope, ...(job.trim() ? { jobId: job.trim() } : {}), minutes: +mins || 60 } }); setMade(r); d.reload(); } catch (e) { if (!e.cancelled) toast(e.message, true); } setBusy(false); };
  const requireIt = async (on) => { try { await api("/api/limits", { method: "PUT", body: { requireMandate: on } }); d.reload(); toast(on ? "Your agent now needs a signed mandate to move money." : "Mandates are optional again."); } catch (e) { if (!e.cancelled) toast(e.message, true); } };
  const recs = d.data?.mandates || [];
  return (
    <section className="panel marks stack-s" aria-labelledby="h-mdt">
      <h3 id="h-mdt">Signed mandates</h3>
      <p className="small ink2">A mandate is your signed permission for one thing: what your agent may do, up to how much, for which job, until when, once (like Google's AP2). The server checks it before any money moves and keeps it in a signed receipt. Issuing one asks for your PIN.</p>
      {d.data && <label className="check-row"><input type="checkbox" checked={!!d.data.requireMandate} onChange={(e) => requireIt(e.target.checked)} /><span>Require a signed mandate before my agent moves money <span className="muted">(off: your limits alone decide)</span></span></label>}
      {!live.length ? <p className="small muted">Make an agent token above first: a mandate names the token it's for.</p> : <div className="stack-s">
        <div className="fields-3">
          <label className="field"><span>FOR THE AGENT</span><select className="input" value={agent || live[0].id} onChange={(e) => setAgent(e.target.value)}>{live.map((x) => <option key={x.id} value={x.id}>{x.label} ({x.id})</option>)}</select></label>
          <label className="field"><span>UP TO</span><span className="money-in"><input className="input" inputMode="decimal" value={max} onChange={(e) => setMax(e.target.value)} placeholder="200" /></span></label>
          <label className="field"><span>VALID FOR (MINUTES)</span><input className="input" inputMode="numeric" value={mins} onChange={(e) => setMins(e.target.value.replace(/\D/g, ""))} /></label>
        </div>
        <fieldset className="looks"><legend className="eyebrow">IT MAY</legend><div className="row" style={{ gap: 12, flexWrap: "wrap" }}>{Object.entries(SCOPE).map(([k, l]) => <label key={k} className="check-row"><input type="checkbox" checked={scope.includes(k)} onChange={(e) => setScope(e.target.checked ? [...scope, k] : scope.filter((x) => x !== k))} /><span>{l}</span></label>)}</div></fieldset>
        <label className="field"><span>FOR ONE JOB (OPTIONAL: ITS ID, job_…)</span><input className="input mono" value={job} onChange={(e) => setJob(e.target.value)} /></label>
        <div><button className={`btn accent ${busy ? "busy" : ""}`} disabled={busy || !(+max > 0) || !scope.length} onClick={issue}>Sign the mandate</button></div>
        {made && <div className="note good stack-s"><p><b>Signed.</b> Give this to your agent; it sends it with the action. {made.label || ""}</p><pre className="terminal" style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{JSON.stringify(made.mandate, null, 1)}</pre><div><button className="btn sm" onClick={() => { navigator.clipboard?.writeText(JSON.stringify(made.mandate)); toast("Copied."); }}>Copy</button></div><p className="tiny muted">Signed by {made.signedBy}. Hash {String(made.hash || "").slice(0, 16)}…</p></div>}
      </div>}
      {recs.length > 0 && <details><summary>MANDATES ({recs.length})</summary><div className="scroll-x"><table className="table" style={{ marginTop: 8 }}><thead><tr><th>When</th><th>Status</th><th>For</th><th>Up to</th><th>Result</th><th>Receipt</th></tr></thead>
        <tbody>{recs.map((r) => <tr key={r.id}><td className="small">{when(r.at)}</td><td><span className={`badge ${r.status === "used" ? "good" : r.status === "refused" ? "bad" : ""}`}>{r.status}</span></td><td className="small">{r.action ? SCOPE[r.action] || r.action : (r.payload?.scope || []).map((x) => SCOPE[x] || x).join(", ")}{r.jobId ? ` · ${r.jobId}` : ""}</td><td className="num">{r.amount != null ? usd(r.amount) : r.payload?.maxAmount != null ? `$${r.payload.maxAmount}` : "—"}</td><td className="small">{r.reason ? `refused: ${r.reason}` : r.result || "—"}</td><td className="mono tiny">{r.receipt ? <a href={`/api/receipts/${r.receipt}`} target="_blank" rel="noreferrer">{r.receipt}</a> : "—"}</td></tr>)}</tbody></table></div></details>}
    </section>
  );
}

// on a job: the mandates its agent actions carried
export function JobMandates({ j }) {
  if (!(j.mandates || []).length) return null;
  return <div className="panel stack-s"><h3>Signed mandates used</h3><ul className="spec">{j.mandates.map((x) => <li key={x.id}><span className="lead"><span className="badge good">mandate</span> {SCOPE[x.action] || x.action}</span><span className="val">{x.amount != null ? usd(x.amount?.cents ?? x.amount) : ""} · <span className="tiny muted">{x.signedBy}</span> · <a className="mono tiny" href={`/api/receipts/${x.receipt}`} target="_blank" rel="noreferrer">receipt</a></span></li>)}</ul></div>;
}
