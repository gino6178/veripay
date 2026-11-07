// Two small pages: a real pro's onboarding link (/pro/onboard?code=…), and the read-only, anonymised back office the
// tour shows (/demo/office: GET /api/demo/office, no names, nothing to act on).
import { useEffect, useState } from "react";
import { api, Link, m, when, useApi, dollars } from "../api.jsx";
import { PIN_WHY, showPinOnce } from "../components/Pin.jsx";
import { useMe, LangSwitch } from "../App.jsx";
import { t } from "../i18n.js";
import { Status } from "../components/job.jsx";

// what blocks a pro from being hired, and what is recommended (GET /api/pro/readiness)
export function Readiness({ r }) {
  if (!r) return null;
  return (
    <div className={`panel marks stack-s ${r.hireable ? "" : "warn-edge"}`}>
      <div className="panel-h"><h3>{r.hireable ? "Ready to be hired" : "Not hireable yet"}</h3><span className={`badge ${r.hireable ? "good" : "bad"}`}>{r.hireable ? "customers can hire you" : `${r.blockers.length} blocker${r.blockers.length === 1 ? "" : "s"}`}</span></div>
      {r.blockers.map((b) => <p key={b.id} className="small bad">Blocks hiring: {b.say}</p>)}
      {r.recommended.filter((b) => b.id !== "signin").map((b) => <p key={b.id} className="small ink2">Recommended: {b.say}</p>)}
      {!r.blockers.length && !r.recommended.length && <p className="small ink2">{t("PayPal, licence and insurance are all in order.")}</p>}
      {(r.blockers.length > 0 || r.recommended.some((x) => x.id !== "signin")) && <Link className="btn sm accent" to="/pro/payouts">{t("Fix it in payout and verification settings")}</Link>}
    </div>
  );
}

export function Onboard() {
  const { reload } = useMe(), code = new URLSearchParams(location.search).get("code") || "";
  const [r, setR] = useState(null), [err, setErr] = useState(code ? null : "This link has no code. Ask VeriPay staff for a new onboarding link."), [busy, setBusy] = useState(false);
  // the code is used only when the person presses Continue (link previews and scanners don't use it up)
  const [pin, setPin] = useState(""), [returning, setReturning] = useState(false), [pinErr, setPinErr] = useState(null);
  const go = async () => { setBusy(true); setPinErr(null); try { const x = await api("/api/pro/onboard", { method: "POST", body: { code, ...(pin ? { pin } : {}) } }); if (x.pinOnce) await showPinOnce(x.pinOnce, "You need it to sign in again and to change where you're paid, your licence or insurance, your agent's key, or to take early pay."); setR(x); reload(); } catch (e) { if (e.body?.needs === "pin" || e.status === 401 || (e.status === 403 && e.body?.error === "pin") || e.status === 429) { setReturning(true); setPin(""); setPinErr(e.status === 401 && !pin ? null : e.message); setBusy(false); return; } if (e.status === 400) { setPinErr(e.message); setBusy(false); return; } setErr(e.status === 410 ? "This onboarding link has been used or has expired. Ask VeriPay staff for a new one." : e.message); } setBusy(false); };
  return (
    <div className="stack-l" style={{ maxWidth: 720, margin: "0 auto" }}>
      <div className="page-head"><div><div className="row between"><h1>{t("Welcome to VeriPay")}</h1><LangSwitch /></div><p className="lede">{r ? "You're signed in for your business." : "Press Continue to sign in for your business."} Customers hire you through their agents; you're paid with PayPal the moment their done-conditions pass.</p></div></div>
      {err && <div className="note bad">{err}</div>}
      {!r && !err && <div className="panel marks stack-s"><p className="small ink2">This one-time link signs you in for your business on VeriPay. Continue when you're ready; it can't be used again after that.</p>
        <label className="field"><span>{returning ? "YOUR PIN (THE ONE YOU SET WHEN YOU FIRST ONBOARDED)" : "CHOOSE A PIN (4–6 DIGITS, OPTIONAL)"}</span><input className="input mono pin-in" type="password" inputMode="numeric" autoComplete={returning ? "off" : "new-password"} maxLength={6} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} aria-invalid={!!pinErr} />
          <span className="tiny muted" style={{ marginTop: 4 }}>{returning ? "This link was sent again, so it needs your PIN." : "You'll need it to sign in again and to change where you're paid, your licence or your agent's key. Leave it empty and we'll make one and show it once."} {PIN_WHY}</span></label>
        {pinErr && <p className="note bad small" role="alert">{pinErr}</p>}<button className={`btn accent ${busy ? "busy" : ""}`} disabled={busy || (returning ? !/^\d{4,6}$/.test(pin) : pin !== "" && !/^\d{4,6}$/.test(pin))} onClick={go}>Continue</button></div>}
      {r && <>
        <p className="small">Signed in as <b>{r.person?.name}</b> for <b>{r.pro?.name}</b> ({r.pro?.trade}).</p>
        <Readiness r={r.readiness} />
        {r.next && <p className="small ink2">{typeof r.next === "string" ? r.next : JSON.stringify(r.next)}</p>}
        <ol className="nextup">
          <li><span>Verify the PayPal you're paid to (this is the only thing that blocks hiring)</span><span className="data">Payout settings</span></li>
          <li><span>Add your licence number and insurance certificate (badges on your profile)</span><span className="data">Verification</span></li>
          <li><span>Connect your own agent with a key, or quote jobs here</span><span className="data">A2A key · Incoming jobs</span></li>
        </ol>
        <div className="row"><Link className="btn accent" to="/pro/payouts">Verify PayPal, licence and insurance</Link><Link className="btn" to="/pro">Incoming jobs</Link></div>
      </>}
    </div>
  );
}

export function DemoOffice() {
  const d = useApi("/api/demo/office").data;
  return (
    <div className="stack-l">
      <div className="page-head">
        <div><span className="badge sim">READ-ONLY · ANONYMISED · DEMO</span><h1 style={{ marginTop: 10 }}>The back office, as staff see it</h1><p className="lede">Customers' names, emails and street addresses are hidden. Job titles, ZIP codes, pros and amounts are shown as staff see them. Nothing here can be changed; signing in as Demo staff (Demo panel) opens the working version.</p></div>
      </div>
      {!d ? <div className="skel" style={{ height: 300 }} /> : <>
        <div className="stat-row">
          <div className="stat"><b>{d.jobs}</b><span>JOBS</span></div>
          <div className="stat"><b>{m(d.held)}</b><span>HELD NOW</span></div>
          <div className="stat"><b>{m(d.captured)}</b><span>CAPTURED</span></div>
          <div className="stat"><b>{m(d.paidToPros)}</b><span>PAID TO PROS</span></div>
          <div className="stat"><b>{m(d.fees)}</b><span>PLATFORM FEES</span></div>
          <div className="stat"><b>{m(d.refunded)}</b><span>REFUNDED</span></div>
        </div>
        <p className="tiny muted">Jobs: every job on this server. Held now: authorized with PayPal and not yet captured. Captured: taken from holds once work passed. Paid to pros: sent with PayPal Payouts (pro and helper). Platform fees: the 10% kept from each capture, before PayPal's own fee. Refunded: returned to customers after disputes.</p>
        {d.queue?.length > 0 && <section className="stack-s"><h2 style={{ fontSize: "var(--fs-h3)" }}>Expert queue</h2><p className="tiny muted">Checks left to a person wait here; an expert answers within 4 business hours. Nobody staffs this demo's queue, so items can pass that target and show as overdue.</p>{d.queue.map((q, i) => <p key={i} className="small"><span className="part">{q.number}</span> {q.title} · answer by {when(q.slaDue)} {q.overdue && <span className="badge bad">overdue</span>}</p>)}</section>}
        <section className="stack-s"><h2 style={{ fontSize: "var(--fs-h3)" }}>Latest jobs</h2><p className="tiny muted">"Automatic check ran on" is the engine of the last automatic check. A customer, expert or inspector may still have confirmed the photos before the money moved.</p>
          <div className="scroll-x"><table className="table"><thead><tr><th>Job</th><th>Status</th><th>Title</th><th>ZIP</th><th>Pro</th><th className="r">Captured</th><th>Ledger</th><th>Automatic check ran on</th>{(d.rows || []).some((r) => r.releasedBy) && <th>Released by</th>}</tr></thead>
            <tbody>{(d.rows || []).map((r) => <tr key={r.number}><td><span className="part">{r.number}</span></td><td><Status s={r.status} /></td><td>{r.title}</td><td className="num">{r.zip}</td><td className="small">{r.pro || "—"}</td><td className="num r">{(() => { const c = typeof r.captured === "number" ? r.captured : r.captured?.cents || 0, du = typeof r.due === "number" ? r.due : r.due?.cents || 0; return c ? `$${(c / 100).toFixed(2)}` : du ? <span className="muted">none yet (due ${(du / 100).toFixed(2)})</span> : "—"; })()}</td><td>{r.balanced ? <span className="ok tiny mono">adds up</span> : <span className="badge bad">off</span>}</td><td className="small">{r.checker === "rules" ? "code rules" : r.checker || "—"}</td>{(d.rows || []).some((x) => x.releasedBy) && <td className="small">{r.releasedBy || "—"}</td>}</tr>)}</tbody></table></div>
        </section>
      </>}
    </div>
  );
}

// the one-time link an agent gives its person (askPerson): sign in, say exactly what was asked, then go there
const LABEL = { perJobMax: "per-job limit", monthlyMax: "monthly limit", changeMax: "change-order limit" };
export function AgentLink() {
  const { reload } = useMe(), code = new URLSearchParams(location.search).get("code") || "";
  const [r, setR] = useState(null), [err, setErr] = useState(code ? null : "This link has no code."), [busy, setBusy] = useState(false);
  // what was asked, before anyone signs in (the link alone signs nobody in)
  const [info, setInfo] = useState(null), [pin, setPin] = useState(""), [pinErr, setPinErr] = useState(null);
  useEffect(() => { if (code) api(`/api/auth/link/info?code=${encodeURIComponent(code)}`).then(setInfo).catch((e) => setErr(e.status === 410 ? "This link has been used or has expired. Ask your agent for a new one." : e.message)); }, [code]);
  const go = async (e) => { e?.preventDefault(); if (!/^\d{4,6}$/.test(pin)) return; setBusy(true); setPinErr(null); try { const x = await api("/api/auth/link", { method: "POST", body: { code, pin } }); setR(x); await reload(); } catch (e2) { setPin(""); if (e2.status === 410) setErr("This link has been used or has expired. Ask your agent for a new one."); else setPinErr(e2.status === 429 || e2.body?.locked ? `Locked: ${e2.message}` : e2.message); } setBusy(false); };
  const to = r ? (() => { const [path, hash] = String(r.to || "/").split("#"); const extra = [r.limit && `limit=${encodeURIComponent(r.limit)}`, r.wouldBe && `amount=${encodeURIComponent(String(r.wouldBe).replace(/[$,]/g, ""))}`, r.current && `current=${encodeURIComponent(r.current)}`].filter(Boolean).join("&"); return `${path}${path.includes("?") ? "&" : "?"}ask=${encodeURIComponent(r.what || "")}${extra ? `&${extra}` : ""}${hash ? `#${hash}` : ""}`; })() : null;
  const [done, setDone] = useState(false), [saving, setSaving] = useState(false);
  const approve = async () => { setSaving(true); try { await api("/api/limits", { method: "PUT", body: { [r.limit]: dollars(r.wouldBe) } }); setDone(true); } catch (e) { setErr(e.message); } setSaving(false); };
  return (
    <div className="panel marks stack" style={{ maxWidth: 560, margin: "32px auto" }}>
      <span className="eyebrow">FROM YOUR AGENT</span>
      <h1 style={{ fontSize: "var(--fs-h2)" }}>Your agent needs you</h1>
      {err && <p className="note bad">{err}</p>}
      {!r && !err && !info && <div className="skel" style={{ height: 80 }} />}
      {!r && !err && info && <form className="stack-s" onSubmit={go}>
        <p className="small ink2">Your AI agent hit a step only you can take{info.for ? `, ${info.for.replace(/^Demo · /, "")}` : ""}.</p>
        <p><b>It asks you to {info.what}.</b></p>
        {LABEL[info.limit] && info.wouldBe && <p className="small">{info.job?.number ? `For job ${info.job.number}: your` : "Your"} {LABEL[info.limit]} is {info.current || "—"}; the agent needs {info.wouldBe}.</p>}
        <label className="field"><span>YOUR PIN</span><input className="input mono pin-in" type="password" inputMode="numeric" autoComplete="off" maxLength={6} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} aria-invalid={!!pinErr} autoFocus /></label>
        {pinErr && <p className="note bad small" role="alert">{pinErr}</p>}
        <p className="tiny muted">{PIN_WHY} The link alone signs nobody in, so an agent that has it still can't act as you.</p>
        <div><button className={`btn accent ${busy ? "busy" : ""}`} disabled={busy || !/^\d{4,6}$/.test(pin)}>Sign in and see it</button></div>
      </form>}
      {r && <><p><b>Your agent asks you to {r.what}.</b></p>
        {LABEL[r.limit] && r.wouldBe && <p className="small">{r.job?.number ? `For job ${r.job.number}: your` : "Your"} {LABEL[r.limit]} is {r.current || "—"}; the agent needs {r.wouldBe}.</p>}
        <p className="small ink2">Signed in as {r.person?.name?.replace(/^Demo · /, "")}. Nothing changes until you decide.</p>
        {LABEL[r.limit] && r.wouldBe && !done && <div className="row"><button className={`btn accent ${saving ? "busy" : ""}`} disabled={saving} onClick={approve}>Approve: set your {LABEL[r.limit]} to {r.wouldBe}</button><button className="btn" onClick={() => setDone("declined")}>Decline</button></div>}
        {done === true && <p className="note good small">Done: your {LABEL[r.limit]} is now {r.wouldBe}. Tell your agent to try again.</p>}
        {done === "declined" && <p className="note small">Nothing changed. Your agent stays within your limit.</p>}
        <a className="btn" href={to} onClick={(e) => { e.preventDefault(); history.pushState(null, "", to); dispatchEvent(new PopStateEvent("popstate")); }}>Show me</a></>}
    </div>
  );
}

// the real, openly licensed photos the demo pros use, with their credits
export function Credits() {
  const d = useApi("/api/credits").data;
  return (
    <div className="stack-l" style={{ maxWidth: 900, margin: "0 auto" }}>
      <div className="page-head"><div><h1>Photo credits</h1><p className="lede">{d?.about || "The real photos the demo pros send, and who took them."}</p></div></div>
      {!d ? <div className="skel" style={{ height: 240 }} /> : <div className="scroll-x"><table className="table">
        <thead><tr><th>Photo</th><th>Shows</th><th>Author</th><th>Licence</th><th>Camera</th></tr></thead>
        <tbody>{(d.photos || []).map((p) => <tr key={p.file}><td className="small mono"><a href={`/api/demo/assets/${p.file}`} target="_blank" rel="noreferrer">{p.file}</a></td><td className="small">{p.what || p.scene || "—"}</td><td className="small">{p.source ? <a href={p.source} target="_blank" rel="noreferrer">{p.author}</a> : p.author}</td><td className="small">{p.licenseUrl ? <a href={p.licenseUrl} target="_blank" rel="noreferrer">{p.license}</a> : p.license}</td><td className="small">{p.camera || "—"}</td></tr>)}</tbody>
      </table></div>}
      <p className="small ink2">Each photo is re-dated to the demo job it is used on (its time and place), so the time and place checks run on it as they would on a pro's phone. The camera is the one that took it.</p>
    </div>
  );
}

// the single place that says what is and isn't real (the Demo badge in the header links here)
export function RealHere() {
  const { info } = useMe(), mock = info?.paypal === "mock";
  return (
    <div className="stack real-page">
      <div className="page-head"><div><h1>What's real here</h1><p className="lede">VeriPay is a working demo.</p></div></div>
      <section className="panel stack-s"><h2>Real</h2><ul className="small">
        <li>The code paths: work orders, offers, holds, change orders, checks, payouts and receipts all run on this server.</li>
        <li>{mock ? "PayPal calls go to a local stand-in that answers like PayPal's API (this server has no sandbox keys)." : "PayPal calls go to PayPal's sandbox API."}</li>
        <li>The photo and receipt checks run real models; each check says who judged it (model, code or person).</li>
        <li>Receipts are signed; the keys are published.</li>
      </ul></section>
      <section className="panel stack-s"><h2>Not real</h2><ul className="small">
        <li>No real money moves.</li>
        <li>The pros, companies, landlord, inspector and licence registry are fictional. Their agents are run by us from each pro's price rules.</li>
        <li>Job photos are openly licensed photos re-dated to the job, or made for the demo. <Link to="/credits">Photo credits</Link></li>
        <li>Email and text copies land in your inbox's outbox tab; nothing is sent.</li>
        <li>Fictional pros are paid to addresses with no PayPal account, so their payouts stay unclaimed.</li>
        <li>The clock is shared and can be moved ahead to age holds; all times are Austin time.</li>
      </ul></section>
      <p className="small"><a href="/live-test">How we tested it</a> · <Link to="/models">Models</Link></p>
    </div>
  );
}
