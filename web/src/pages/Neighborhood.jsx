// Neighborhood funds: when several households at your ZIP code have home or renters cover on Cover, you can chip in
// together. The fund pays half of a member's deductible when Cover pays their claim, and gives the year's leftover to
// a local project the members vote for. Cover takes nothing from it.
import { useState } from "react";
import { api, Link, useApi, useT, day } from "../api.jsx";
import { useMe } from "../App.jsx";

export default function Neighborhood() {
  const t = useT(), { me, toast, info } = useMe();
  const { data, reload } = useApi(me ? "/api/neighborhood" : null);
  const [busy, setBusy] = useState(false), [title, setTitle] = useState(""), [payee, setPayee] = useState(""), [why, setWhy] = useState("");
  if (me === null) return <div className="empty"><Link className="btn" to="/signin?next=/neighborhood">{t("登入", "Sign in")}</Link></div>;
  const run = async (fn, ok) => { setBusy(true); try { const r = await fn(); if (r?.error) toast(r.message || r.error); else if (ok) toast(ok); reload(); } catch (e) { toast(e.message); } setBusy(false); };
  if (!data) return null;
  const s = data.suggestion, funds = data.funds || [];
  return (
    <div className="stack-l">
      <div className="page-head" style={{ marginBottom: 0 }}><div><h1>{t("社區保險金", "Neighborhood fund")}</h1>
        <p className="lede">{t("同一個郵遞區號、都在 Cover 投保的鄰居，每戶每月出一點錢。有人出事被 Cover 理賠時，基金幫他付一半自負額；年底剩下的錢，捐給大家投票選的在地計畫。Cover 不從裡面拿一毛錢。", "Neighbors at one ZIP code who are all on Cover each add a little a month. When Cover pays one of you a claim, the fund pays half the deductible; at the year's end, what's left goes to a local project you vote for. Cover takes nothing from it.")}</p></div></div>

      {s && !s.fund?.member && <div className="card marks stack">
        <p className="eyebrow">{t(`建議 · ${s.zip}`, `SUGGESTED FOR ${s.zip}`)}</p>
        <div className="row" style={{ alignItems: "baseline", gap: 16 }}><span className="big">{s.households}</span><span className="lede" style={{ fontSize: 18 }}>{t(`戶人家在 ${s.zip}（${s.area || ""}）有 Cover 的租屋或房屋險`, `households at ${s.zip} (${s.area || ""}) have renters or home cover with Cover`)}</span></div>
        <p className="muted">{t("一場暴風雨打到一戶，通常也打到整條街。一起出一點錢，出事的時候自負額就不用一個人扛。", "A storm that hits one of you usually hits the whole street. Chip in a little together, and nobody carries their deductible alone.")}</p>
        <ul className="spec"><li><span className="lead">{t("每戶每月", "Each household, a month")}</span><span className="val">{s.monthly}</span></li><li><span className="lead">{t("出事時基金付", "When a member's claim is paid")}</span><span className="val">{t("一半自負額，最多 $250", "half the deductible, up to $250")}</span></li><li><span className="lead">{t("年底剩下的", "What's left at the year's end")}</span><span className="val">{t("給大家選的在地計畫", "a local project you choose")}</span></li></ul>
        <div><button className="btn accent" disabled={busy} onClick={() => run(() => api("/api/neighborhood/join", { method: "POST", body: { zip: s.zip } }), t("已加入", "You joined"))}>{s.fund ? t(`加入 ${s.zip} 的基金`, `Join the ${s.zip} fund`) : t(`成立 ${s.zip} 的基金`, `Start the ${s.zip} fund`)} <span className="arrow">→</span></button></div>
        <p className="tiny muted">{t("每月從你存好的 PayPal 扣款，隨時可以退出。", "Charged monthly to your saved PayPal; leave any time.")}</p>
      </div>}

      {!s && !funds.length && <div className="card stack-s"><p>{t("目前你的郵遞區號還沒有足夠的鄰居在 Cover。只要同一區有 3 戶人家有租屋或房屋險，就能成立基金。", "Not enough neighbors at your ZIP code are on Cover yet. A fund starts once 3 households there have renters or home cover.")}</p>
        {info?.demoSignin && <div><button className="btn" disabled={busy} onClick={() => run(() => api("/api/demo/neighbors", { method: "POST", body: { count: 3 } }), t("加了 3 戶示範鄰居", "Added 3 demo neighbors"))}>{t("示範：加 3 戶鄰居", "Demo: add 3 neighbors")}</button></div>}
      </div>}

      {funds.map((f) => (
        <section key={f.fund} className="stack">
          <div className="row between"><h2>{t(`${f.zip} 社區基金`, `The ${f.zip} fund`)}</h2><span className="badge good">{t(`${f.households} 戶`, `${f.households} households`)}</span></div>
          <div className="stat-row">
            <div className="stat"><b>{f.balance}</b><span>{t("基金現有", "IN THE FUND")}</span></div>
            <div className="stat"><b>{f.deductibleHelp}</b><span>{t(`幫鄰居付自負額（${f.helped} 次）`, `TOWARD NEIGHBORS' DEDUCTIBLES (${f.helped})`)}</span></div>
            <div className="stat"><b>{f.givenToProjects}</b><span>{t("給在地計畫", "GIVEN TO LOCAL PROJECTS")}</span></div>
            <div className="stat"><b>{f.monthly}</b><span>{t(`你每月出 · 已付 ${f.paid} 期`, `YOU ADD A MONTH · ${f.paid} PAID`)}</span></div>
          </div>
          <p className="small muted">{t(`每戶每月 ${f.monthly}。Cover 理賠成員的租屋或房屋險時，基金付一半自負額，最多 $250（基金有錢時）。年底剩下的捐給成員投票選的在地計畫。Cover 不從基金拿任何錢。`, f.rules)}</p>
          <div className="grid-2">
            <div className="stack-s"><h3>{t(`今年的在地計畫（第 ${f.year} 年）`, `This year's local projects (year ${f.year})`)}</h3>
              {f.projects.length ? <ul className="spec">{f.projects.map((p) => <li key={p.id}><span className="lead"><b>{p.title}</b>{p.why ? <span className="muted"> · {p.why}</span> : null}</span><span className="val">{p.votes} {t("票", "votes")}</span><button className="btn sm" disabled={busy || p.mine} aria-pressed={p.mine} onClick={() => run(() => api(`/api/neighborhood/${f.fund}/vote`, { method: "POST", body: { project: p.id } }))}>{p.mine ? t("已投", "Voted") : t("投票", "Vote")}</button></li>)}</ul>
                : <p className="muted small">{t("還沒有人提案。", "Nobody has proposed one yet.")}</p>}
            </div>
            <form className="stack-s" onSubmit={(e) => { e.preventDefault(); run(() => api(`/api/neighborhood/${f.fund}/propose`, { method: "POST", body: { title, payee, why } }), t("已提案", "Proposed")); setTitle(""); setWhy(""); }}>
              <h3>{t("提一個計畫", "Propose a project")}</h3>
              <label className="field"><span>{t("做什麼", "What")}</span><input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t("例如：整條街的防洪沙包", "e.g. flood sandbags for the block")} /></label>
              <label className="field"><span>{t("負責人的 PayPal email（錢付給他）", "The organizer's PayPal email (paid to them)")}</span><input className="input" type="email" value={payee} onChange={(e) => setPayee(e.target.value)} /></label>
              <label className="field"><span>{t("為什麼（選填）", "Why (optional)")}</span><input className="input" value={why} onChange={(e) => setWhy(e.target.value)} /></label>
              <div><button className="btn" disabled={busy || !title.trim() || !payee.trim()}>{t("提案", "Propose")}</button></div>
            </form>
          </div>
          <div className="row"><span className="tiny muted">{t(`加入於 ${day(f.since)} · 下次扣款 ${day(f.nextDue)}`, `Joined ${day(f.since)} · next ${day(f.nextDue)}`)}</span><button className="link small" onClick={() => run(() => api(`/api/neighborhood/${f.fund}/leave`, { method: "POST" }), t("已退出", "You left the fund"))}>{t("退出基金", "Leave the fund")}</button></div>
        </section>
      ))}
    </div>
  );
}
