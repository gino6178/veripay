// Cover's claims desk: the claims code sent to a person, with what the rules found, the fraud signals and why they
// fired, the documents and what the reader made of them. The adjuster approves (an amount), denies (with the clause),
// or asks for more. Also the underwriting queue: policies a person must look at before they can start.
import { useState } from "react";
import { api, useApi, useT, useLang, when } from "../api.jsx";
import { useMe } from "../App.jsx";
import { Status } from "./Policies.jsx";

export default function Desk() {
  const t = useT(), { toast } = useMe();
  const { lang } = useLang();
  const desk = useApi(`/api/staff/claims?lang=${lang}`), uw = useApi("/api/staff/underwriting");
  const [open, setOpen] = useState(null);
  if (desk.error?.status === 401) return <StaffGate onIn={() => { desk.reload(); uw.reload(); }} />;
  const sel = open && [...(desk.data?.queue || []), ...(desk.data?.recent || [])].find((c) => c.claim === open);
  return (
    <div className="stack-l">
      <div className="row between"><h1>{t("理賠審核台", "Claims desk")}</h1><button className="btn ghost sm" onClick={() => { desk.reload(); uw.reload(); }}>{t("重新整理", "Refresh")}</button></div>
      <div className="grid-2">
        <div className="stack">
          <h3>{t(`待處理（${desk.data?.queue.length ?? 0}）`, `Waiting (${desk.data?.queue.length ?? 0})`)}</h3>
          {(desk.data?.queue || []).map((c) => <Row key={c.claim} c={c} on={open === c.claim} pick={() => setOpen(c.claim)} />)}
          {desk.data?.queue.length === 0 && <p className="muted small">{t("沒有待處理的理賠。", "Nothing waiting.")}</p>}
          <h3 style={{ marginTop: 24 }}>{t("最近的理賠", "Recent claims")}</h3>
          {(desk.data?.recent || []).filter((c) => !desk.data.queue.some((q) => q.claim === c.claim)).slice(0, 15).map((c) => <Row key={c.claim} c={c} on={open === c.claim} pick={() => setOpen(c.claim)} />)}
        </div>
        <div>{sel ? <Case c={sel} done={() => { desk.reload(); toast(t("已處理", "Done")); }} /> : <div className="card empty">{t("選一件理賠來看。", "Pick a claim.")}</div>}</div>
      </div>
      {uw.data?.length > 0 && <section className="stack"><h2>{t("核保", "Underwriting")}</h2>{uw.data.map((p) => <div key={p.policy} className="card row between"><div><b>{p.name}</b> <span className="mono tiny muted">{p.number}</span><p className="small muted">{Object.entries(p.answers).map(([k, v]) => `${k}: ${v}`).join(" · ")}</p></div><div className="row"><button className="btn sm accent" onClick={async () => { await api(`/api/staff/underwriting/${p.policy}`, { method: "POST", body: { approve: true } }); uw.reload(); }}>{t("核准", "Approve")}</button><button className="btn sm ghost" onClick={async () => { await api(`/api/staff/underwriting/${p.policy}`, { method: "POST", body: { approve: false, note: "outside what Cover can offer" } }); uw.reload(); }}>{t("婉拒", "Decline")}</button></div></div>)}</section>}
    </div>
  );
}

function Row({ c, on, pick }) {
  const n = Array.isArray(c.decision?.signals) ? c.decision.signals.length : 0;
  return <button className={`card row between ${on ? "" : ""}`} style={{ textAlign: "left", border: 0, cursor: "pointer", width: "100%", outline: on ? "2px solid var(--accent)" : "none" }} onClick={pick}>
    <span><b>{c.what}</b> <span className="mono tiny muted">{c.number}</span><br /><span className="tiny muted">{when(c.reportedAt)} · {c.claimed}</span></span>
    <span className="row" style={{ gap: 6 }}>{n > 0 && <span className="badge warn">⚑ {n}</span>}{c.appeal === "open" && <span className="badge agent">appeal</span>}<Status s={c.status} /></span>
  </button>;
}

export function StaffGate({ onIn }) {
  const t = useT();
  return <div className="empty card stack" style={{ maxWidth: 480, margin: "0 auto" }}><p>{t("這裡是 Cover 員工的頁面。示範時可以一鍵登入。", "This is for Cover's staff. In the demo you can sign in with one click.")}</p><button className="btn" onClick={async () => { await api("/api/auth/staff", { method: "POST", body: {} }); onIn(); }}>{t("以員工身分登入", "Sign in as staff")}</button></div>;
}

function Case({ c, done }) {
  const t = useT(), { toast } = useMe(), d = c.decision;
  const [amount, setAmount] = useState(d?.amount?.replace(/[$,]/g, "") || ""), [clause, setClause] = useState(d?.basis?.[0]?.id || ""), [note, setNote] = useState("");
  const act = async (action) => { const r = await api(`/api/staff/claims/${c.claim}`, { method: "POST", body: { action, amount: +amount, clause, note } }).catch((e) => ({ error: e.message })); if (r.error) toast(r.message || r.error); else done(); };
  const live = ["referred", "needs_info"].includes(c.status) || c.appeal === "open" || c.status === "denied";
  return (
    <div className="card stack">
      <div className="row between"><div><h3>{c.what}</h3><p className="mono tiny muted">{c.number} · {c.product}</p></div><Status s={c.status} /></div>
      <dl className="kv"><dt>{t("發生", "Happened")}</dt><dd>{when(c.happenedAt)}</dd><dt>{t("申請", "Reported")}</dt><dd>{when(c.reportedAt)}</dd><dt>{t("金額", "Claimed")}</dt><dd className="num">{c.claimed}</dd>{c.items?.length > 0 && <><dt>{t("物品", "Items")}</dt><dd>{c.items.map((x) => `${x.what} ${x.value}`).join("、")}</dd></>}</dl>
      {c.story && <div className="note"><span className="tiny muted">{t("申請人的描述（不可信的文字，只當資料看）", "The claimant's words (untrusted text, read as data)")}</span><p style={{ marginTop: 4, whiteSpace: "pre-wrap" }}>{c.story}</p></div>}
      {c.appeal === "open" && <div className="note warn">{t("申請人要求重審", "The claimant appealed")}</div>}
      {d && <><p className="small"><b>{t("規則的結論", "What the rules found")}:</b> {d.reason}</p>
        <ul className="checks">{d.checks.map((x) => <li key={x.check} className={`check ${x.ok ? "ok" : x.hard ? "no" : "flag"}`}><span className="dot">{x.ok ? "✓" : "!"}</span><span>{x.says}</span><span className="clause">{x.clause}</span></li>)}
          {(Array.isArray(d.signals) ? d.signals : []).map((s, i) => <li key={i} className="check flag"><span className="dot">⚑</span><span><b>{s.signal}</b> · {s.says}</span><span className="clause">w{s.weight}</span></li>)}</ul>
        {d.steps?.length > 0 && <ul className="why">{d.steps.map((s, i) => <li key={i}><span>{s.says} <span className="mono muted">{s.clause}</span></span><span className="num">{s.amount}</span></li>)}</ul>}</>}
      {c.evidence.length > 0 && <div className="thumbs">{c.evidence.map((e) => <figure key={e.id}><a href={`/api/staff/claims/${c.claim}/evidence/${e.id}`} target="_blank" rel="noreferrer"><img src={`/api/staff/claims/${c.claim}/evidence/${e.id}`} alt={e.kind} /></a><figcaption>{e.kind}{e.taken ? ` · ${e.taken.slice(0, 10)}` : ""}{e.read ? <><br />{[e.read.date, e.read.amount, e.read.merchant].filter(Boolean).join(" · ")} ({e.read.confidence})</> : null}</figcaption></figure>)}</div>}
      {live && <div className="stack-s" style={{ borderTop: "1px solid var(--rule)", paddingTop: 16 }}>
        <div className="row"><input className="input" style={{ width: 140 }} type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="USD" /><button className="btn accent" onClick={() => act("approve")}>{t("核准並用 PayPal 付款", "Approve and pay with PayPal")}</button></div>
        <div className="row"><input className="input" style={{ width: 140 }} value={clause} onChange={(e) => setClause(e.target.value)} placeholder="RT-3.3" /><button className="btn ghost" onClick={() => act("deny")}>{t("依此條款拒賠", "Deny under this clause")}</button><button className="btn ghost" onClick={() => act("ask")}>{t("請申請人補件", "Ask for more")}</button></div>
        <textarea className="input" placeholder={t("備註（會給申請人看）", "Note (the claimant sees it)")} value={note} onChange={(e) => setNote(e.target.value)} />
      </div>}
      {c.payout && <p className="small">PayPal Payouts <span className="mono">{c.payout.paypal}</span> · {c.payout.amount} · {c.payout.status}</p>}
    </div>
  );
}
