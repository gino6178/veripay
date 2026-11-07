// The inbox (PLAN §15 item 8): every event about the person, newest first; settings per category and channel; and the
// outbox of email and SMS copies, which are never sent ("simulated: not sent").
import { useEffect, useState } from "react";
import { api, Link, useApi, when, navigate } from "../api.jsx";
import { useMe } from "../App.jsx";
import Icon from "../components/Icon.jsx";
import { Why, Chip } from "../components/cards.jsx";
const CICON = { offers: "people", hire: "check", changes: "wrench", work: "camera", money: "pay", disputes: "flag", schedule: "clock", tenancy: "home", reports: "doc", mandates: "key", other: "chat" };

const CAT = { offers: "Offers", hire: "Hiring", changes: "Change orders", work: "Work", money: "Money", disputes: "Disputes", schedule: "Schedule", tenancy: "Landlord and tenant", reports: "Reports", mandates: "Mandates", other: "Other" };

export function Inbox() {
  const { me } = useMe(), [tab, setTab] = useState("inbox"), [unreadOnly, setUnreadOnly] = useState(false), [tick, setTick] = useState(0);
  const box = useApi(me ? `/api/inbox?limit=100${unreadOnly ? "&unread=1" : ""}` : null, tick);
  if (me === null) return <div className="empty"><p>Sign in to see your inbox.</p><Link className="btn accent" to="/signin?next=/inbox">Sign in</Link></div>;
  const read = async (body) => { await api("/api/inbox/read", { method: "POST", body }).catch(() => {}); setTick((x) => x + 1); dispatchEvent(new Event("done:inbox")); };
  const items = box.data?.items || [];
  return (
    <div className="stack-l" style={{ maxWidth: 860, margin: "0 auto" }}>
      <div className="page-head"><div><h1>Inbox</h1><p className="lede">Everything on your jobs, newest first.</p></div></div>
      <div className="seg" role="tablist">{[["inbox", `Inbox${box.data?.unread ? ` (${box.data.unread})` : ""}`], ["settings", "Settings"], ["outbox", "Email and texts"]].map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? "on" : ""} onClick={() => setTab(k)}>{l}</button>)}</div>
      {tab === "inbox" && <section className="stack-s">
        <div className="row between"><label className="check-row"><input type="checkbox" checked={unreadOnly} onChange={(e) => setUnreadOnly(e.target.checked)} /><span>Unread only</span></label>{box.data?.unread > 0 && <button className="btn sm" onClick={() => read({ all: true })}>Mark all read</button>}</div>
        {!box.data ? <div className="skel" style={{ height: 200 }} /> : !items.length ? <p className="small muted">Nothing here yet.</p> :
          <ul className="inbox">{items.map((x) => <li key={x.id} className={`inbox-i ${x.read ? "" : "unread"}`}><span className="ib-ic" aria-hidden="true"><Icon name={CICON[x.category] || "chat"} size={18} /></span><div className="ib-b">
            <div className="row between" style={{ gap: 8 }}><span className="tiny muted">{CAT[x.category] || x.category} · {when(x.at)}{x.number ? ` · ${x.number}` : ""}</span>{!x.read ? <button className="btn sm" onClick={() => read({ ids: [x.id] })}>Mark read</button> : <button className="linkish tiny" onClick={() => read({ ids: [x.id], read: false })}>Mark unread</button>}</div>
            <p className="small"><b>{x.title}</b></p>{x.body && <p className="small ink2">{x.body}</p>}
            <div className="row" style={{ gap: 8 }}>{x.job && <button className="btn sm" onClick={() => { if (!x.read) read({ ids: [x.id] }); navigate(me?.person?.role === "pro" ? `/pro/jobs/${x.job}` : `/jobs/${x.job}`); }}>Open the job</button>}
              </div>
          </div></li>)}</ul>}
      </section>}
      {tab === "settings" && <><Telegram /><Settings /></>}
      {tab === "outbox" && <Outbox />}
    </div>
  );
}

// Telegram: the inbox in a chat, and the jobs worked from it (the bot never hires: that's the website, with the PIN)
function Telegram() {
  const { toast } = useMe(), [tick, setTick] = useState(0), st = useApi("/api/telegram", tick), [link, setLink] = useState(null), [busy, setBusy] = useState(false);
  // while a code is out, look every 3 seconds for the chat to link
  useEffect(() => { if (!link || st.data?.linked) return; const t = setInterval(() => setTick((x) => x + 1), 3000); return () => clearInterval(t); }, [link, st.data?.linked]);
  const s = st.data;
  if (!s) return <div className="skel" style={{ height: 90 }} />;
  const connect = async () => { setBusy(true); try { setLink(await api("/api/telegram/link", { method: "POST" })); } catch (e) { toast(e.message, true); } setBusy(false); };
  const off = async () => { setBusy(true); try { await api("/api/telegram", { method: "DELETE" }); setLink(null); setTick((x) => x + 1); toast("Telegram unlinked."); } catch (e) { toast(e.message, true); } setBusy(false); };
  return (
    <section className="panel stack-s tg">
      <div className="row between" style={{ gap: 12, alignItems: "flex-start" }}>
        <div className="stack-xs">
          <h3 className="h3">Telegram</h3>
          <p className="small ink2" style={{ maxWidth: "62ch" }}>Your inbox in a Telegram chat as it happens. From the chat you can post a job, see offers and where each price sits, bargain, check reviews and ask pros near you. Hiring holds money, so the chat sends you here to confirm it with your PIN.</p>
        </div>
        {s.linked ? <span className="badge good">Linked{s.name ? ` · ${s.name}` : ""}</span> : null}
      </div>
      {!s.on ? <p className="small muted">Telegram isn't set up on this server yet: it needs a bot token (TELEGRAM_BOT_TOKEN).</p>
        : s.linked ? <div className="row" style={{ gap: 10 }}><span className="small muted">Since {when(s.since)}{s.bot ? ` · @${s.bot}` : ""}</span><button className={`btn sm ${busy ? "busy" : ""}`} disabled={busy} onClick={off}>Unlink</button></div>
        : link ? <div className="stack-xs">
            {link.url && <a className="btn accent" href={link.url} target="_blank" rel="noreferrer">Open @{link.bot} in Telegram</a>}
            <p className="small">Or send <code>/start {link.code}</code> to {link.bot ? `@${link.bot}` : "the bot"}. The code works once, for 15 minutes. This page updates when the chat is linked.</p>
          </div>
        : <div><button className={`btn accent ${busy ? "busy" : ""}`} disabled={busy} onClick={connect}>Connect Telegram</button></div>}
    </section>
  );
}

function Settings() {
  const { toast } = useMe(), st = useApi("/api/inbox/settings"), [s, setS] = useState(null), [busy, setBusy] = useState(false);
  useEffect(() => { if (st.data) setS(JSON.parse(JSON.stringify(st.data))); }, [st.data]);
  if (!s) return <div className="skel" style={{ height: 200 }} />;
  const cats = Object.keys(s.inApp || CAT);
  const save = async () => { setBusy(true); try { const r = await api("/api/inbox/settings", { method: "PUT", body: { inApp: s.inApp, email: { on: !!s.email?.on, to: s.email?.to || undefined, categories: s.email?.categories }, sms: { on: !!s.sms?.on, to: s.sms?.to || undefined, categories: s.sms?.categories } } }); setS(r); toast("Saved."); } catch (e) { toast(e.message, true); } setBusy(false); };
  const togg = (ch, c) => { const list = new Set(s[ch]?.categories || []); list.has(c) ? list.delete(c) : list.add(c); setS({ ...s, [ch]: { ...s[ch], categories: [...list] } }); };
  return (
    <section className="panel stack-s">
      <div className="scroll-x"><table className="table"><thead><tr><th>Category</th><th>In the inbox</th><th>Email</th><th>Text</th></tr></thead><tbody>
        {cats.map((c) => <tr key={c}><td>{CAT[c] || c}</td>
          <td><input type="checkbox" aria-label={`${CAT[c] || c} in the inbox`} checked={s.inApp?.[c] !== false} onChange={(e) => setS({ ...s, inApp: { ...s.inApp, [c]: e.target.checked } })} /></td>
          <td><input type="checkbox" aria-label={`${CAT[c] || c} by email`} checked={(s.email?.categories || []).includes(c)} onChange={() => togg("email", c)} /></td>
          <td><input type="checkbox" aria-label={`${CAT[c] || c} by text`} checked={(s.sms?.categories || []).includes(c)} onChange={() => togg("sms", c)} /></td></tr>)}
      </tbody></table></div>
      <div className="fields-3">
        <label className="check-row"><input type="checkbox" checked={!!s.email?.on} onChange={(e) => setS({ ...s, email: { ...s.email, on: e.target.checked } })} /><span>Email copies</span></label>
        <label className="field"><span>EMAIL{s.email?.demoAddress ? " (A DEMO ADDRESS)" : ""}</span><input className="input" type="email" value={s.email?.to || ""} onChange={(e) => setS({ ...s, email: { ...s.email, to: e.target.value } })} /></label>
        <span />
        <label className="check-row"><input type="checkbox" checked={!!s.sms?.on} onChange={(e) => setS({ ...s, sms: { ...s.sms, on: e.target.checked } })} /><span>Text copies</span></label>
        <label className="field"><span>US MOBILE</span><input className="input" type="tel" value={s.sms?.to || ""} onChange={(e) => setS({ ...s, sms: { ...s.sms, to: e.target.value } })} placeholder="(512) 555-0123" /></label>
      </div>
      <div><button className={`btn accent ${busy ? "busy" : ""}`} disabled={busy} onClick={save}>Save settings</button></div>
    </section>
  );
}

function Outbox() {
  const o = useApi("/api/inbox/outbox"), items = o.data?.items || [];
  return (
    <section className="stack-s">
      {!o.data ? <div className="skel" style={{ height: 160 }} /> : !items.length ? <p className="small muted">Nothing yet.</p> :
        <ul className="inbox">{items.map((x) => <li key={x.id}><div className="row between"><span className="tiny muted">{x.channel === "sms" ? "TEXT" : "EMAIL"} to {x.toShown || x.to} · {when(x.at)}</span><span className="badge sim">{x.status}</span></div>
          {x.subject && <p className="small"><b>{x.subject}</b></p>}<p className="small ink2" style={{ whiteSpace: "pre-wrap" }}>{x.body}</p></li>)}</ul>}
    </section>
  );
}

// the bell in the header: the unread count, refreshed every 30 seconds and when the inbox changes
export function Bell() {
  const { me } = useMe(), [n, setN] = useState(me?.inbox?.unread || 0);
  useEffect(() => {
    if (!me) return;
    const f = () => api("/api/inbox?unread=1&limit=1").then((r) => setN(r.unread || 0)).catch(() => {});
    f(); const t = setInterval(f, 30000); addEventListener("done:inbox", f); addEventListener("done:refresh", f);
    return () => { clearInterval(t); removeEventListener("done:inbox", f); removeEventListener("done:refresh", f); };
  }, [me?.person?.id]);
  if (!me) return null;
  return <Link to="/inbox" className="bell" aria-label={`Inbox${n ? `, ${n} unread` : ""}`} title="Inbox"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" /></svg>{n > 0 && <span className="bell-n">{n > 99 ? "99+" : n}</span>}</Link>;
}
