// The customer's home (PLAN §16 item 1): appliances from their paid jobs (and ones they add), service history,
// warranties, and the maintenance agent's suggestions (rules on age and dates), each one click from a posted job.
import { useState } from "react";
import { api, Link, m, useApi, when, day, dollars, navigate } from "../api.jsx";
import { useMe } from "../App.jsx";
import { askConfirm } from "../components/Confirm.jsx";
import { STATUS } from "../components/job.jsx";

// a date-only value (YYYY-MM-DD) shown as written, with the year (no timezone shift)
const ymd = (v) => { if (!v) return "—"; const d = String(v).slice(0, 10); const t = new Date(`${d}T12:00:00Z`); return isNaN(t) ? String(v) : t.toLocaleDateString("en-US", { timeZone: "UTC", month: "short", day: "numeric", year: "numeric" }); };
const KIND = { water_heater: "Water heater", faucet: "Faucet", toilet: "Toilet", drain: "Drain", dishwasher: "Dishwasher", garbage_disposal: "Garbage disposal", water_softener: "Water softener", hvac: "Heating and cooling", other: "Other" };

export default function MyHome() {
  const { me, toast } = useMe(), h = useApi(me?.person?.role === "customer" ? "/api/home" : null), d = h.data;
  const [add, setAdd] = useState({ kind: "water_heater" }), [busy, setBusy] = useState(null), [budget, setBudget] = useState({});
  if (me === null) return <div className="empty"><p>Sign in to see your home.</p><Link className="btn accent" to="/signin?next=/home">Sign in</Link></div>;
  if (me && me.person.role !== "customer") return <div className="empty"><p>The home record is for customers.</p></div>;
  if (h.error) return <div className="empty"><p>Your home record couldn't load: {h.error.message}</p><button className="btn" onClick={h.reload}>Try again</button></div>;
  if (!d) return <div className="stack" aria-busy="true"><p className="small muted">Loading your home…</p><div className="skel" style={{ height: 320 }} /></div>;
  const run = async (k, fn) => { setBusy(k); try { await fn(); } catch (e) { if (!e.cancelled) toast(e.message, true); } setBusy(null); };
  const accept = (s) => run(s.id, async () => { const b = dollars(budget[s.id]); if (!(await askConfirm({ title: `Post “${s.title}”?`, body: [s.text, `Pros' agents are asked for offers${b ? ` under ${m({ cents: Math.round(b * 100) })}` : s.budget ? ` (typical ${m(s.budget)})` : ""}. Nothing is held until you hire.`], ok: "Post it" }))) return; const r = await api(`/api/home/suggestions/${s.id}/accept`, { method: "POST", body: b ? { budget: b } : {} }); navigate(`/jobs/${r.id || r.job?.id}`); });
  const dismiss = (s) => run(s.id, async () => { await api(`/api/home/suggestions/${s.id}/dismiss`, { method: "POST", body: {} }); h.reload(); });
  const save = () => run("add", async () => { await api("/api/home/appliances", { method: "POST", body: { ...add, capacityGal: add.capacityGal ? +add.capacityGal : undefined } }); setAdd({ kind: "water_heater" }); h.reload(); });
  const remove = (a) => run(a.id, async () => { await api(`/api/home/appliances/${a.id}`, { method: "DELETE" }); h.reload(); });
  return (
    <div className="stack-l">
      <div className="page-head"><div><h1>Your home</h1><p className="lede">{d.label || "What's in your home, what's been done, and what's due: built by code from your paid jobs and what you add."}{d.address?.zip ? ` ZIP ${d.address.zip}.` : ""}</p></div></div>

      <section className="panel marks stack-s" aria-labelledby="h-sug">
        <div className="panel-h"><h2 id="h-sug" style={{ fontSize: "var(--fs-h3)" }}>Suggested next</h2><span className="src rules">RULES · MAINTENANCE AGENT</span></div>
        {!(d.suggestions || []).length ? <p className="small muted">Nothing due right now.</p> : d.suggestions.map((s) => <div key={s.id} className="row between sug" style={{ gap: 12, flexWrap: "wrap" }}>
          <div style={{ flex: "1 1 280px" }}><p><b>{s.title}</b> <span className="tiny muted">{s.due ? `due ${ymd(s.due)}` : ""}</span></p><p className="small ink2">{s.why}</p></div>
          {s.action ? <a className="btn sm" href={s.action.claimDefect || s.action.repeat}>{s.action.claimDefect ? "Claim under warranty" : "Book it again"}</a> : <div className="row" style={{ gap: 6 }}>
            <span className="money-in" style={{ width: 90 }}><input className="input sm" inputMode="decimal" placeholder={s.budget ? String(Math.round(s.budget.cents / 100)) : "budget"} value={budget[s.id] || ""} onChange={(e) => setBudget({ ...budget, [s.id]: e.target.value })} aria-label={`Budget for ${s.title}`} /></span>
            <button className={`btn sm accent ${busy === s.id ? "busy" : ""}`} disabled={!!busy} onClick={() => accept(s)}>Post it</button>
            <button className="btn sm" disabled={!!busy} onClick={() => dismiss(s)}>Not now</button></div>}
        </div>)}
      </section>

      <section className="stack-s" aria-labelledby="h-app"><h2 id="h-app" style={{ fontSize: "var(--fs-h3)" }}>Appliances</h2>
        {!(d.appliances || []).length ? <p className="small muted">None yet. A water-heater replacement adds one by itself; or add yours below.</p> :
          <div className="scroll-x"><table className="table"><thead><tr><th>What</th><th>Installed</th><th>Details</th><th>Warranty</th><th>Serviced</th><th /></tr></thead><tbody>
            {d.appliances.map((a) => <tr key={a.id}><td>{a.label || KIND[a.kind] || a.kind}<div className="tiny muted">{a.source}{a.number ? ` · ${a.number}` : ""}</div></td><td className="small">{a.installed ? `${ymd(a.installed)} (${a.ageYears ?? "?"} y)` : "—"}{a.expectedLifeYears ? <div className="tiny muted">usual life {a.expectedLifeYears} y</div> : ""}</td>
              <td className="small">{[a.brand, a.model, a.serial && `serial ${a.serial}`, a.capacityGal && `${a.capacityGal} gal`].filter(Boolean).join(" · ") || "—"}{a.plateReadBy && <div className="tiny muted">read from the rating plate by {a.plateReadBy}</div>}</td>
              <td className="small">{a.warranty ? `until ${ymd(a.warranty.until)}` : "—"}{a.warranty?.source && <div className="tiny muted">{a.warranty.source}</div>}</td>
              <td className="small">{(a.service || []).length ? a.service.map((x) => x.number).join(", ") : "—"}</td>
              <td>{a.source === "you" || a.source === "the person" || !a.job ? <button className="btn sm" disabled={!!busy} onClick={() => remove(a)}>Remove</button> : null}</td></tr>)}
          </tbody></table></div>}
        <details className="panel"><summary>ADD AN APPLIANCE</summary>
          <div className="fields-3" style={{ marginTop: 10 }}>
            <label className="field"><span>WHAT</span><select className="input" value={add.kind} onChange={(e) => setAdd({ ...add, kind: e.target.value })}>{Object.entries(KIND).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
            <label className="field"><span>INSTALLED</span><input className="input" type="date" value={add.installed || ""} onChange={(e) => setAdd({ ...add, installed: e.target.value })} /></label>
            <label className="field"><span>BRAND</span><input className="input" value={add.brand || ""} onChange={(e) => setAdd({ ...add, brand: e.target.value })} /></label>
            <label className="field"><span>MODEL</span><input className="input" value={add.model || ""} onChange={(e) => setAdd({ ...add, model: e.target.value })} /></label>
            {add.kind === "water_heater" && <label className="field"><span>GALLONS</span><input className="input" inputMode="numeric" value={add.capacityGal || ""} onChange={(e) => setAdd({ ...add, capacityGal: e.target.value.replace(/\D/g, "") })} /></label>}
            <label className="field"><span>NOTES</span><input className="input" value={add.notes || ""} onChange={(e) => setAdd({ ...add, notes: e.target.value })} /></label>
          </div>
          <div style={{ marginTop: 8 }}><button className={`btn sm ${busy === "add" ? "busy" : ""}`} disabled={!!busy} onClick={save}>Add it</button></div>
        </details>
      </section>

      <section className="grid-2">
        <div className="panel stack-s"><h3>Warranties</h3>
          {!(d.warranties || []).length ? <p className="small muted">None yet.</p> : <ul className="spec">{d.warranties.map((w, i) => <li key={i}><span className="lead">{w.title || w.label || w.kind}{w.number ? ` · ${w.number}` : ""}<div className="tiny muted">{w.kind}{w.source ? ` · ${w.source}` : ""}</div></span><span className="val">{ymd(w.until)}{w.daysLeft != null ? <div className="tiny muted">{w.daysLeft >= 0 ? `${w.daysLeft} days left` : "ended"}</div> : ""}</span></li>)}</ul>}
        </div>
        <div className="panel stack-s"><h3>Service history</h3>
          {!(d.history || []).length ? <p className="small muted">No jobs yet.</p> : <ul className="spec">{d.history.map((x) => <li key={x.job}><span className="lead"><Link to={`/jobs/${x.job}`}>{x.number}</Link> {x.title}<div className="tiny muted">{x.pro || "—"} · {x.paidAt ? `paid ${day(x.paidAt)}` : STATUS[x.status]?.[0] || x.status}</div></span><span className="val">{x.paid ? m(x.paid) : "—"}{x.closeout && <div className="tiny"><a href={x.closeout} target="_blank" rel="noreferrer">close-out</a></div>}</span></li>)}</ul>}
        </div>
      </section>
    </div>
  );
}
