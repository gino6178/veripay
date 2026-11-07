// Neighborhood group jobs (PLAN §16 item 3): households in one ZIP with the same job join one group; the pro prices
// each household less a group discount for one trip. Every household's job stays its own (hold, checks, payment).
import { useState } from "react";
import { api, Link, m, useApi, when, dollars, navigate } from "../api.jsx";
import { useMe } from "../App.jsx";

export default function Groups() {
  const { me, toast } = useMe(), [zip, setZip] = useState(""), z = zip || me?.person?.zip || "";
  const g = useApi(me ? `/api/groups${z ? `?zip=${z}` : ""}` : null), jobs = useApi(me?.person?.role === "customer" ? "/api/jobs" : null);
  const [pick, setPick] = useState({}), [text, setText] = useState({}), [busy, setBusy] = useState(null);
  if (me === null) return <div className="empty"><p>Sign in to see neighborhood groups.</p><Link className="btn accent" to="/signin?next=/groups">Sign in</Link></div>;
  const mine = ((jobs.data?.jobs || jobs.data) || []).filter((x) => ["scoped", "offered"].includes(x.status) && !x.group);
  const join = async (gr) => { setBusy(gr.id); try { const r = await api(`/api/groups/${gr.id}/join`, { method: "POST", body: pick[gr.id] ? { job: pick[gr.id] } : { text: text[gr.id] || gr.title } }); toast(`You're in: ${r.discountPct || gr.nextDiscountPct || ""}% off for every household.`); navigate(`/jobs/${r.job?.id || r.yourJob || pick[gr.id]}`); } catch (e) { if (!e.cancelled) toast(e.message, true); } setBusy(null); };
  const list = g.data?.groups || [];
  return (
    <div className="stack-l" style={{ maxWidth: 900, margin: "0 auto" }}>
      <div className="page-head"><div><h1>Neighborhood groups</h1><p className="lede">Neighbors with the same job join one group: the pro does them in one trip and takes 10% off each with 2 households, 15% with 3, 20% with 4 or more. Each household still has its own hold, checks and payment.</p></div>
        <label className="field" style={{ width: 120 }}><span>ZIP</span><input className="input sm" inputMode="numeric" maxLength={5} value={zip || me?.person?.zip || ""} onChange={(e) => setZip(e.target.value.replace(/\D/g, ""))} /></label></div>
      {g.error ? <div className="note bad small">Groups couldn't load: {g.error.message} <button className="btn sm" onClick={g.reload}>Try again</button></div> : !g.data ? <div aria-busy="true"><p className="small muted">Loading groups…</p><div className="skel" style={{ height: 200 }} /></div> : !list.length ? <p className="small muted">No open groups in {z || "your ZIP"}. Start one from any of your jobs that's waiting for offers (on the job page).</p> :
        list.map((gr) => <article key={gr.id} className="panel marks stack-s">
          <div className="row between"><div><h3>{gr.title}</h3><p className="tiny muted">{gr.trade} · {gr.zip} · open until {when(gr.closes)}{gr.pro ? ` · ${gr.pro.name}` : ""}</p></div><span className="badge good">{gr.households} households · {gr.discountPct}% off</span></div>
          <p className="small ink2">{gr.rule}{gr.nextDiscountPct > gr.discountPct ? ` One more household makes it ${gr.nextDiscountPct}% off for everyone.` : ""}</p>
          {gr.yourJob ? <p className="small">You're in. {gr.yourOffer ? <>Your price: <b>{m(gr.yourOffer.amount)}</b>{gr.yourOffer.solo ? <span className="muted"> (alone {m(gr.yourOffer.solo)})</span> : ""}. </> : ""}<Link to={`/jobs/${gr.yourJob}`}>Open your job</Link></p>
            : gr.status === "open" && me?.person?.role === "customer" && <div className="stack-s">
              {mine.length > 0 && <label className="field"><span>JOIN WITH ONE OF YOUR JOBS</span><select className="input" value={pick[gr.id] || ""} onChange={(e) => setPick({ ...pick, [gr.id]: e.target.value })}><option value="">— or describe a new one below —</option>{mine.map((x) => <option key={x.id} value={x.id}>{x.number} {x.title || ""}</option>)}</select></label>}
              {!pick[gr.id] && <label className="field"><span>OR DESCRIBE YOURS</span><input className="input" value={text[gr.id] || ""} onChange={(e) => setText({ ...text, [gr.id]: e.target.value })} placeholder={gr.title} /></label>}
              <div><button className={`btn accent sm ${busy === gr.id ? "busy" : ""}`} disabled={!!busy} onClick={() => join(gr)}>Join the group</button></div>
              <p className="tiny muted">Joining reprices every household's offer (the old offers are replaced). Nothing is held until you hire.</p>
            </div>}
        </article>)}
    </div>
  );
}
