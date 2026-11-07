// The third-party inspector (a demo account: Capitol Home Inspections): the jobs that name them, and for each milestone
// marked for inspection a form to confirm or reject it, with notes and photos. A rejection sends it to review.
import { useEffect, useState } from "react";
import { Link, m, useApi, when } from "../api.jsx";
import { useMe } from "../App.jsx";
import { NeedSignIn, useAct, B, DoneWhen } from "./Jobs.jsx";
import { WoHead, Rail, Status } from "../components/job.jsx";
import { MsStatus, PhotoPicker, readData } from "../components/parts.jsx";

const notInspector = (me) => me && me.person.role !== "inspector";
function NotInspector() { return <div className="empty"><p>This is the inspector's side.</p><Link className="btn" to="/signin?as=inspector">Sign in as the demo inspector</Link></div>; }

export function InspectorHome() {
  const { me } = useMe(), list = useApi(me?.person?.role === "inspector" ? "/api/inspector/jobs" : null);
  if (me === null) return <NeedSignIn what="your inspections" as="inspector" />;
  if (notInspector(me)) return <NotInspector />;
  const jobs = list.data || [];
  return (
    <div>
      <div className="page-head"><div><h1>Inspections</h1><p className="lede">{me?.person?.name}: jobs whose customer named you. Milestones marked for inspection wait for your confirmation before any money moves.</p></div></div>
      {list.data && !jobs.length && <div className="empty"><p className="small">No job names you yet. A customer picks an inspector when posting a job.</p></div>}
      {jobs.map((j) => (
        <Link key={j.id} to={`/inspect/${j.id}`} className="jobrow">
          <span className="no">{j.number}</span>
          <span><b>{j.title}</b><div className="nx">ZIP {j.zip} · {j.pro || "no pro hired yet"} · {(j.milestones || []).map((x) => `${x.title}: ${x.inspection ? x.inspection.verdict : x.status}`).join(" · ") || "no milestone to inspect yet"}</div></span>
          <span className="amt"><Status s={j.status} /></span>
        </Link>
      ))}
    </div>
  );
}

export function InspectorJob({ id }) {
  const { me } = useMe(), job = useApi(me?.person?.role === "inspector" ? `/api/inspector/jobs/${id}` : null);
  const [busy, act] = useAct(job.set);
  const j = job.data;
  useEffect(() => { if (!j) return; const t = setTimeout(job.reload, 8000); return () => clearTimeout(t); }, [j]);
  if (me === null) return <NeedSignIn what="this inspection" as="inspector" />;
  if (notInspector(me)) return <NotInspector />;
  if (job.error) return <div className="empty"><p>{job.error.message}</p><Link className="btn" to="/inspect">Inspections</Link></div>;
  if (!j) return <div className="skel" style={{ height: 320 }} />;
  const todo = (j.milestones || []).filter((x) => x.inspect);
  return (
    <div>
      <WoHead job={j} as="inspector"><Link className="btn sm" to="/inspect">All inspections</Link></WoHead>
      <Rail job={j} />
      <div className="wo-body">
        <div className="stack-l"><DoneWhen j={j} intro="What the pro must show, and what the checks said." /></div>
        <aside className="wo-side first">
          {!todo.length && <div className="panel"><p className="small">No milestone on this job is marked for inspection.</p></div>}
          {todo.map((x) => <Inspect key={x.id} j={j} x={x} busy={busy} act={act} />)}
        </aside>
      </div>
    </div>
  );
}

function Inspect({ j, x, busy, act }) {
  const [note, setNote] = useState(""), [files, setFiles] = useState([]);
  const go = async (verdict) => act(`${verdict}${x.id}`, `/api/inspector/jobs/${j.id}/inspect`, { milestone: x.id, verdict, note: note || undefined, items: files.length ? await Promise.all(files.map(async (f) => ({ dataUrl: await readData(f) }))) : undefined }, () => { setNote(""); setFiles([]); });
  const ready = ["passed", "review", "submitted", "needs_fix"].includes(x.status) && !x.inspection;
  return (
    <div className="panel marks stack-s">
      <div className="panel-h"><h3>{x.title}</h3><MsStatus s={x.status} /></div>
      <p className="tiny muted">{m(x.due || x.amount)} · {x.checkIds.join(", ")}</p>
      {x.inspection ? <p className={`small ${x.inspection.verdict === "pass" ? "ok" : "bad"}`}>You {x.inspection.verdict === "pass" ? "confirmed" : "rejected"} it {when(x.inspection.at)}{x.inspection.note ? `: “${x.inspection.note}”` : ""}</p> : !ready ? <p className="small ink2">Not ready: the pro hasn't sent this milestone's evidence yet.</p> : <>
        <textarea className="input" rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="What you checked on site" aria-label="Inspection note" />
        <PhotoPicker files={files} setFiles={setFiles} label="Inspection photos (optional)" small />
        <div className="row"><B busy={busy} k={`pass${x.id}`} className="accent sm" onClick={() => go("pass")}>Confirm: passes inspection</B><B busy={busy} k={`fail${x.id}`} className="danger sm" disabled={!note.trim() || !!busy} onClick={() => go("fail")}>Reject</B></div>
        <p className="tiny muted">Confirming lets the money move by the usual rules; rejecting sends the milestone to the customer's review.</p>
      </>}
    </div>
  );
}
