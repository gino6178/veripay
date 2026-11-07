// A pro's public profile: who they are, what is verified (PayPal, licence in the demo registry, insurance, staff
// review), ratings and reviews only from jobs paid through VeriPay, and photos from those jobs whose checks passed.
import { useState } from "react";
import { Link, m, useApi, day, api } from "../api.jsx";
import { Badges } from "../components/parts.jsx";

export default function ProProfile({ id }) {
  const r = useApi(`/api/pros/${id}/profile`), d = r.data, p = d?.pro;
  if (r.error) return <div className="empty"><p>No such pro.</p><Link className="btn" to="/">VeriPay</Link></div>;
  if (!d) return <div className="stack"><div className="skel" style={{ height: 90 }} /><div className="skel" style={{ height: 240 }} /></div>;
  return (
    <div className="stack-l">
      <div className="page-head">
        <div>
          <p className="row" style={{ marginBottom: 10 }}><Badges pro={p} /></p>
          <h1>{p.name}</h1>
          <p className="lede">{p.owner} · {p.trade} · Austin, TX {p.zip}. {p.license}.</p>
        </div>
        <div className="stack-s" style={{ textAlign: "right" }}>
          <span className="big-amt">{d.ratings ? `${d.ratingText || (+d.rating).toFixed(1)}★` : "—"}</span>
          <span className="data">{d.ratings} rating{d.ratings === 1 ? "" : "s"} from paid jobs · {d.paidJobs} jobs paid · {m(d.paidTotal)}</span>
        </div>
      </div>
      <p className="note small">{d.rule}</p>
      <WorkRecord id={id} />
      <div className="bo-split">
        <section className="stack-s" aria-labelledby="h-rev">
          <h2 id="h-rev" style={{ fontSize: "var(--fs-h3)" }}>Reviews</h2>
          {!d.reviews.length && <p className="small muted">No reviews yet. Only a customer whose job was paid can leave one.</p>}
          {d.reviews.map((x, i) => <div key={i} className="review"><p className="stars" aria-label={`${x.stars} of 5`}>{"★".repeat(x.stars)}<span className="muted">{"★".repeat(5 - x.stars)}</span></p>{x.text && <p>“{x.text}”</p>}<p className="data">{x.job} · {x.title} · {m(x.paid)} paid · {day(x.at)}</p></div>)}
        </section>
        <section className="stack-s" aria-labelledby="h-ver">
          <h2 id="h-ver" style={{ fontSize: "var(--fs-h3)" }}>Verified</h2>
          <ul className="spec">
            <li><span className="lead">PayPal</span><span className="val">{p.verification?.paypal?.verified ? "verified" : "not yet"}</span></li>
            <li><span className="lead">Licence</span><span className="val">{p.verification?.license?.valid ? `${p.verification.license.class} ${p.verification.license.number}, to ${day(p.verification.license.expires)}` : p.verification?.license?.required === false ? "none needed in Texas" : "not verified"}</span></li>
            <li><span className="lead">Insurance</span><span className="val">{p.verification?.insurance?.valid ? `${p.verification.insurance.limit} general liability` : "not on file"}</span></li>
          </ul>
          {p.verification?.registry && <p className="tiny muted">{p.verification.registry}</p>}
        </section>
      </div>
      <section className="stack-s" aria-labelledby="h-ph">
        <h2 id="h-ph" style={{ fontSize: "var(--fs-h3)" }}>Photos from paid jobs</h2>
        {!d.photos.length && <p className="small muted">None shared yet: customers choose to share a paid job's photos when they rate it.</p>}
        <div className="thumbs">{d.photos.map((x, i) => <figure key={i}><img src={x.url} alt={`${x.what} (${x.job})`} loading="lazy" /><figcaption>{x.job} · {x.what}<br />{x.verified}</figcaption></figure>)}</div>
      </section>
    </div>
  );
}

// the pro's portable record: every job paid on its checks, signed by the platform and tied to the transparency log;
// no customer data. Anyone can verify it with the public key alone.
function WorkRecord({ id }) {
  const r = useApi(`/api/pros/${id}/record.json`).data, [v, setV] = useState(null), [busy, setBusy] = useState(false);
  if (!r) return null;
  const s = r.summary || {};
  const verify = async () => { setBusy(true); try { setV(await api("/api/work-record/verify", { method: "POST", body: { record: r } })); } catch (e) { setV({ error: e.message }); } setBusy(false); };
  return (
    <section className="panel marks stack-s" aria-labelledby="h-rec">
      <div className="panel-h"><h2 id="h-rec" style={{ fontSize: "var(--fs-h3)" }}>Verified work record</h2><span className="src code">SIGNED · IN THE TRANSPARENCY LOG</span></div>
      <p className="small ink2">{s.jobs ?? r.count} jobs paid on their checks{s.conditionsTotal ? `, ${s.conditionsPassed} of ${s.conditionsTotal} conditions passed` : ""}{s.months?.length ? `, ${s.months[0]} to ${s.months.at(-1)}` : ""}. No customer names, addresses or exact amounts: trade, month, conditions passed and an amount band per job.</p>
      {s.byBand && <p className="tiny muted">{Object.entries(s.byBand).map(([k, n]) => `${k}: ${n}`).join(" · ")}</p>}
      <div className="row" style={{ gap: 8 }}>
        <a className="btn sm" href={`/api/pros/${id}/record.html`} target="_blank" rel="noreferrer">Open the public record</a>
        <a className="btn sm" href={`/api/pros/${id}/record.json`} download={`work-record-${id}.json`}>Download it (JSON)</a>
        <button className={`btn sm accent ${busy ? "busy" : ""}`} disabled={busy} onClick={verify}>Verify it now</button>
      </div>
      {v && (v.error ? <p className="note bad small">{v.error}</p> : <div className={`note small ${v.ok ? "good" : "bad"}`}>
        <p><b>{v.ok ? "Verified." : "Not verified."}</b> The record's signature {v.record ? "checks out" : "does not check out"}; {(v.entries || []).filter((x) => x.ok).length} of {(v.entries || []).length} entries are signed correctly{v.allInLog ? ", and every one is in the signed transparency log" : `; ${(v.entries || []).filter((x) => x.inLog).length} are in the log so far (receipts join it every few minutes)`}.</p>
        <p className="tiny">{r.howToVerify || "Checked with the platform's public key alone (/.well-known/done-receipts.json)."}</p></div>)}
    </section>
  );
}
