// Landlord and tenant (PLAN §15 item 1). A tenant links their landlord (an invite code, or the demo landlord) and posts
// jobs the landlord decides and pays. A landlord invites tenants and sees their jobs. Every money rule is the payer's.
import { useEffect, useState } from "react";
import { api, Link, navigate, useApi, when } from "../api.jsx";
import { useMe } from "../App.jsx";
import { askConfirm } from "../components/Confirm.jsx";

export function Tenancy() {
  const { me, reload, toast } = useMe(), role = me?.person?.role, ten = me?.person?.tenancy;
  if (me === undefined) return <div className="skel" style={{ height: 200 }} />;
  if (!me) return <div className="empty"><p>Sign in to link a landlord or invite tenants.</p><Link className="btn accent" to="/signin?next=/tenancy">Sign in</Link></div>;
  return role === "landlord" ? <Landlord me={me} toast={toast} /> : role === "customer" ? <Tenant me={me} ten={ten} reload={reload} toast={toast} /> : <div className="empty"><p>Landlords and tenants only.</p></div>;
}

function Tenant({ ten, reload, toast }) {
  const [code, setCode] = useState(""), [unit, setUnit] = useState(""), [busy, setBusy] = useState(false);
  const link = async (body) => { setBusy(true); try { await api("/api/tenant/landlord", { method: "POST", body }); await reload(); toast("Linked to your landlord."); } catch (e) { toast(e.status === 410 ? "That invite has been used or has expired. Ask your landlord for a new one." : e.message, true); } setBusy(false); };
  const unlink = async () => { if (!(await askConfirm({ title: "Unlink your landlord?", body: "New jobs you post will be yours to pay. Jobs already posted for your landlord stay theirs.", ok: "Unlink", danger: true }))) return; await api("/api/tenant/landlord", { method: "DELETE" }).catch((e) => toast(e.message, true)); await reload(); };
  const l = ten?.role === "tenant" ? ten.landlord : null;
  return (
    <div className="stack-l" style={{ maxWidth: 720, margin: "0 auto" }}>
      <div className="page-head"><div><h1>Your landlord</h1><p className="lede">Renting? Link your landlord and post repairs for them to approve and pay. You document the problem and can suggest an offer; your landlord (or their agent) hires, approves and pays, with their own limits and PIN.</p></div></div>
      {l ? <div className="panel marks stack-s">
        <p><b>{l.name}</b>{l.demo && <span className="badge sim" style={{ marginLeft: 8 }}>a demo account</span>}{l.unit ? <span className="muted"> · unit {l.unit}</span> : ""}</p>
        <p className="small ink2">Linked {when(ten.linkedAt)}. When you post a job, tick "for my landlord" and they're asked to decide.</p>
        <div className="row"><Link className="btn accent" to="/post">Post a repair for them</Link><button className="btn sm" onClick={unlink}>Unlink</button></div>
      </div> : <>
        <div className="panel marks stack-s">
          <h3>Join with your landlord's invite</h3>
          <div className="row" style={{ alignItems: "end" }}><label className="field" style={{ flex: 1 }}><span>INVITE CODE</span><input className="input mono" value={code} onChange={(e) => setCode(e.target.value.trim())} /></label>
            <button className={`btn accent ${busy ? "busy" : ""}`} disabled={busy || code.length < 4} onClick={() => link({ code })}>Join</button></div>
        </div>
        <div className="panel stack-s">
          <h3>Or use the demo landlord</h3>
          <p className="small ink2">Riverside Property Management's agent answers within a couple of minutes: it hires the offer you suggest if it's acceptable, else the cheapest acceptable one.</p>
          <div className="row" style={{ alignItems: "end" }}><label className="field"><span>YOUR UNIT (OPTIONAL)</span><input className="input" value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="2B" /></label>
            <button className={`btn ${busy ? "busy" : ""}`} disabled={busy} onClick={() => link({ demo: true, ...(unit.trim() ? { unit: unit.trim() } : {}) })}>Link the demo landlord</button></div>
        </div>
      </>}
    </div>
  );
}

function Landlord({ me, toast }) {
  const t = useApi("/api/landlord/tenants"), [unit, setUnit] = useState(""), [inv, setInv] = useState(null), [busy, setBusy] = useState(false);
  const invite = async () => { setBusy(true); try { setInv(await api("/api/landlord/invites", { method: "POST", body: unit.trim() ? { unit: unit.trim() } : {} })); } catch (e) { toast(e.message, true); } setBusy(false); };
  const remove = async (p) => { if (!(await askConfirm({ title: `Remove ${p.name}?`, body: "They can no longer post jobs for you to pay. Jobs already posted stay yours.", ok: "Remove", danger: true }))) return; await api(`/api/landlord/tenants/${p.person}`, { method: "DELETE" }).catch((e) => toast(e.message, true)); t.reload(); };
  const full = inv ? `${location.origin}${inv.link}` : "";
  return (
    <div className="stack-l" style={{ maxWidth: 820, margin: "0 auto" }}>
      <div className="page-head"><div><h1>Tenants</h1><p className="lede">Your tenants post repairs and document them; you (or your agent, within your limits) hire, approve change orders and pay, held with your PayPal. You both see the job.</p></div><Link className="btn" to="/jobs">Their jobs</Link></div>
      {t.data?.demo && <p className="note small">You're the demo landlord: its agent also answers your tenants' jobs by itself.</p>}
      <section className="panel stack-s"><h3>Your tenants</h3>
        {!t.data ? <div className="skel" style={{ height: 60 }} /> : (t.data.tenants || []).length ? <ul className="spec">{t.data.tenants.map((p) => <li key={p.person}><span className="lead">{p.name.replace(/^Demo · /, "")}{p.unit ? ` · unit ${p.unit}` : ""}</span><span className="val"><span className="tiny muted">since {when(p.linkedAt)}</span> <button className="btn sm" onClick={() => remove(p)}>Remove</button></span></li>)}</ul> : <p className="small muted">No tenants yet.</p>}
      </section>
      <section className="panel marks stack-s"><h3>Invite a tenant</h3>
        <div className="row" style={{ alignItems: "end" }}><label className="field"><span>UNIT (OPTIONAL)</span><input className="input" value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="2B" /></label><button className={`btn accent ${busy ? "busy" : ""}`} disabled={busy} onClick={invite}>Make an invite</button></div>
        {inv && <div className="note small stack-s"><p>Send this to your tenant (one use, until {when(inv.expires)}):</p><p className="mono" style={{ overflowWrap: "anywhere" }}>{full}</p><p>Or the code: <b className="mono">{inv.code}</b></p><div><button className="btn sm" onClick={() => { navigator.clipboard?.writeText(full); toast("Link copied."); }}>Copy the link</button></div></div>}
      </section>
    </div>
  );
}

// /tenant/join?code=…: a signed-in customer joins at once (one click); otherwise sign in first
export function TenantJoin() {
  const { me, reload, toast } = useMe(), code = new URLSearchParams(location.search).get("code") || "", [done, setDone] = useState(false), [err, setErr] = useState(null);
  const join = async () => { try { await api("/api/tenant/landlord", { method: "POST", body: { code } }); await reload(); setDone(true); } catch (e) { setErr(e.status === 410 ? "This invite has been used or has expired. Ask your landlord for a new one." : e.message); } };
  if (me === undefined) return <div className="skel" style={{ height: 120 }} />;
  return (
    <div className="panel marks stack" style={{ maxWidth: 560, margin: "32px auto" }}>
      <h1 style={{ fontSize: "var(--fs-h2)" }}>Join your landlord</h1>
      {err && <p className="note bad">{err}</p>}
      {done ? <><p>Linked. Post a repair and your landlord decides and pays.</p><Link className="btn accent" to="/post">Post a repair</Link></>
        : !me ? <><p className="small ink2">Sign in (or start as a new demo customer) to accept this invite.</p><Link className="btn accent" to={`/signin?next=${encodeURIComponent(`/tenant/join?code=${code}`)}`}>Sign in</Link></>
        : me.person.role !== "customer" ? <p className="small">Only a customer (a tenant) can accept an invite. You're signed in as a {me.person.role}.</p>
        : <><p className="small ink2">Your landlord invited you to post repairs for them to approve and pay.</p><div><button className="btn accent" onClick={join}>Accept the invite</button></div></>}
    </div>
  );
}
