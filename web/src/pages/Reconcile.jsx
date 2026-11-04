// Reconciliation: PayPal's record of Cover's money against Cover's ledger, row by row, run by the reconciliation agent
// on the PayPal Agent Toolkit (api/src/recon.js). Orange marks only what disagrees and the one action on the page.
import { useEffect, useState } from "react";
import { api, useApi, useT, usd, when } from "../api.jsx";
import { useMe } from "../App.jsx";
import { StaffGate } from "./Desk.jsx";

const KIND = { premium: ["保費", "Premium"], subscription: ["訂閱保費", "Subscription"], refund: ["退費", "Refund"], payout: ["理賠付款", "Claim payout"], giveback: ["公益捐款", "Giveback"], invoice: ["繳費單", "Invoice"], dispute: ["爭議", "Dispute"] };
const STATUS = { matched: ["相符", "matched"], amount_differs: ["金額不符", "amount differs"], state_differs: ["狀態不符", "state differs"], missing_in_paypal: ["PayPal 沒有", "missing in PayPal"], missing_in_cover: ["Cover 沒有", "missing in Cover"], pending: ["處理中", "pending"], open: ["未處理", "open"] };
const ISSUES = ["amount_differs", "state_differs", "missing_in_paypal", "missing_in_cover", "open"];
const money = (c) => (c == null ? "—" : usd(c));
const Ids = ({ id }) => (id ? <span className="row" style={{ gap: 4 }}>{String(id).split(",").map((x) => <span key={x} className="part">{x}</span>)}</span> : <span className="muted">—</span>);

export default function Reconcile() {
  const t = useT(), { toast } = useMe(), [tick, setTick] = useState(0), [show, setShow] = useState("issues"), [busy, setBusy] = useState(false);
  const r = useApi("/api/staff/recon", tick);
  const running = r.data?.running;
  useEffect(() => { if (!running) return; const h = setInterval(() => setTick((x) => x + 1), 2500); return () => clearInterval(h); }, [running]);
  if (r.error?.status === 401) return <StaffGate onIn={() => r.reload()} />;
  const rep = r.data?.report;
  const runNow = async () => { setBusy(true); try { await api("/api/staff/recon", { method: "POST", body: {} }); setTick((x) => x + 1); } catch (e) { toast(e.message); } setBusy(false); };
  const rows = (rep?.rows || []).filter((x) => show === "all" || (show === "issues" ? ISSUES.includes(x.status) : x.kind === show));
  const issues = rep ? ISSUES.reduce((s, k) => s + (rep.counts[k] || 0), 0) : 0;
  return (
    <div className="stack-l">
      <div className="page-head" style={{ marginBottom: 0 }}>
        <div>
          <h1>{t("對帳", "Reconciliation")}</h1>
          <p className="muted small">{t("PayPal 的紀錄對 Cover 的帳本：每筆保費、退費、理賠付款、捐款、繳費單和爭議。用 PayPal Agent Toolkit 查，每六小時一次，也可以現在跑。", "PayPal's record against Cover's ledger: every premium, refund, claim payout, giveback, invoice and dispute. Checked with the PayPal Agent Toolkit every six hours, or now.")}</p>
        </div>
        <button className="btn accent" disabled={busy || running} onClick={runNow}>{running ? t("對帳中…", "Reconciling…") : t("現在對帳", "Reconcile now")}</button>
      </div>

      {!rep && !r.loading && <div className="empty card"><p>{running ? t("第一次對帳進行中。", "The first reconciliation is running.") : t("還沒有對帳紀錄。", "No reconciliation yet.")}</p></div>}

      {rep && <div className="grid-2">
        <div className="card stack">
          <h3>{t("這次對帳", "This run")}</h3>
          <dl className="kv">
            <dt>{t("時間", "When")}</dt><dd className="num">{when(rep.at)} · {rep.seconds} s · {rep.by === "schedule" ? t("排程", "scheduled") : t("手動", "on demand")}</dd>
            <dt>{t("誰對的", "Run by")}</dt><dd>{rep.mode === "agent"
              ? <><span className="badge agent">{t("AI agent", "AI agent")}</span> <span className="small">{rep.model.name} {t("（本機 Ollama）", "(local, Ollama)")}{t("，數字都經程式核對過", "; every number checked by code")}</span></>
              : <><span className="badge warn">{t("純程式", "plain code")}</span> <span className="small">{t("模型連不上，用同一套程式直接對帳：", "No model reachable, so the same reconciliation ran as plain code: ")}{rep.model.why}</span></>}</dd>
            <dt>PAYPAL</dt><dd className="small">{rep.paypal === "mock" ? t("模擬器（沒有沙盒金鑰）", "the stand-in (no sandbox keys)") : t("沙盒", "sandbox")} · {t(`查了 ${rep.searched.days} 天的交易 ${rep.searched.transactions} 筆、繳費單 ${rep.searched.invoices} 張、爭議 ${rep.searched.disputes} 件`, `${rep.searched.transactions} transactions over ${rep.searched.days} days, ${rep.searched.invoices} invoices, ${rep.searched.disputes} disputes searched`)}</dd>
            <dt>TOOLKIT</dt><dd className="row" style={{ gap: 4 }}><span className="part">{rep.toolkit.package}@{rep.toolkit.version}</span>{rep.toolkit.tools.map((x) => <span key={x} className="part">{x}</span>)}</dd>
          </dl>
        </div>
        <div className="card stack">
          <h3>{t("結果", "Result")}</h3>
          <ul className="spec">
            {Object.entries(STATUS).map(([k, l]) => <li key={k}><span className="lead">{t(...l)}</span><span className="val" style={{ color: ISSUES.includes(k) && rep.counts[k] ? "var(--signal)" : undefined }}>{rep.counts[k] || 0}</span></li>)}
            <li><span className="lead muted">{t("帳戶上不是 Cover 的（同一個 PayPal 帳戶的其他 app）", "On the PayPal account but not Cover's (other apps)")}</span><span className="val muted">{rep.others.transactions} / {rep.others.invoices} / {rep.others.disputes}</span></li>
          </ul>
        </div>
      </div>}

      {rep && <div className="card stack">
        <div className="row between">
          <h3>{t(`逐筆 · ${issues} 筆要處理`, `Line by line · ${issues} to look at`)}</h3>
          <div className="chips">
            {[["issues", t("要處理的", "To look at")], ["all", t("全部", "All")], ...Object.keys(KIND).filter((k) => rep.byKind[k]).map((k) => [k, t(...KIND[k])])].map(([k, l]) => <button key={k} className={`chip ${show === k ? "on" : ""}`} onClick={() => setShow(k)}>{l}{rep.byKind[k] ? ` ${rep.byKind[k].rows}` : ""}</button>)}
          </div>
        </div>
        <div className="scroll-x"><table className="table">
          <thead><tr><th>{t("項目", "Kind")}</th><th>{t("結果", "Result")}</th><th>{t("Cover 帳本", "Cover's ledger")}</th><th className="r">{t("Cover 金額", "Cover")}</th><th>PayPal</th><th className="r">{t("PayPal 金額", "PayPal")}</th><th>{t("說明", "Note")}</th></tr></thead>
          <tbody>{rows.map((x, i) => { const bad = ISSUES.includes(x.status), diff = x.status === "amount_differs";
            return <tr key={i}>
              <td>{t(...(KIND[x.kind] || [x.kind, x.kind]))}{x.cover?.to && x.kind !== "giveback" ? <div className="tiny muted">{x.cover.to}</div> : null}</td>
              <td className="num small" style={{ color: bad ? "var(--signal)" : "var(--ink-3)", whiteSpace: "nowrap" }}>{t(...STATUS[x.status])}</td>
              <td><Ids id={x.cover?.id} />{x.cover?.policy || x.cover?.claim ? <div className="tiny muted" style={{ marginTop: 4 }}>{x.cover.claim || x.cover.policy}{x.cover.line ? ` · #${x.cover.line}` : ""}</div> : null}</td>
              <td className="r num">{money(x.cover?.amount)}</td>
              <td><Ids id={x.paypal?.item && x.paypal.item !== x.paypal.id ? `${x.paypal.id},${x.paypal.item}` : x.paypal?.id} />{x.paypal?.status ? <div className="tiny muted" style={{ marginTop: 4 }}>{String(x.paypal.status)}</div> : null}</td>
              <td className="r num" style={{ color: diff ? "var(--signal)" : undefined }}>{money(x.paypal?.amount)}</td>
              <td className="small" style={{ minWidth: 200 }}>{x.note || ""}{x.paypal?.source ? <div className="tiny muted">{x.paypal.source}</div> : null}</td>
            </tr>; })}</tbody>
        </table></div>
        {!rows.length && <p className="muted small">{show === "issues" ? t("沒有要處理的：PayPal 和帳本每一筆都相符。", "Nothing to look at: every line agrees with PayPal.") : t("沒有資料。", "Nothing here.")}</p>}
        {rep.notes?.length > 0 && <ul className="tiny muted" style={{ margin: 0, paddingLeft: 18 }}>{rep.notes.map((n, i) => <li key={i}>{n}</li>)}</ul>}
      </div>}

      {rep?.agent && <div className="card stack">
        <h3>{t("AI agent 說了什麼（程式核對過）", "What the agent said (checked by code)")}</h3>
        {rep.agent.summary ? <p>{rep.agent.summary}</p> : <p className="muted small">{t("agent 的摘要沒有一句通過核對。", "No sentence of the agent's summary checked out.")}</p>}
        <p className="small muted">{t(`agent 列了 ${rep.agent.findings.length} 項：${rep.agent.verified} 項和 PayPal 的回應相符，${rep.agent.rejected} 項不符、不採用。agent 只能用唯讀工具，不能動錢。`, `The agent stated ${rep.agent.findings.length} findings: ${rep.agent.verified} agree with PayPal's answers, ${rep.agent.rejected} didn't and are not used. It has read-only tools only and cannot move money.`)}</p>
        {rep.agent.rejected + rep.agent.dropped.length > 0 && <div className="scroll-x"><table className="table">
          <thead><tr><th>{t("agent 說", "The agent said")}</th><th>{t("程式查到", "Code found")}</th></tr></thead>
          <tbody>
            {rep.agent.findings.filter((f) => !f.verified).map((f, i) => <tr key={`f${i}`}><td><span className="part">{f.id}</span> <span className="small">{f.status}{f.cover_amount != null ? ` · Cover $${f.cover_amount}` : ""}{f.paypal_amount != null ? ` · PayPal $${f.paypal_amount}` : ""}</span></td><td className="small" style={{ color: "var(--signal)" }}>{f.problems.join("; ")}</td></tr>)}
            {rep.agent.dropped.map((d, i) => <tr key={`d${i}`}><td className="small">“{d.sentence}”</td><td className="small" style={{ color: "var(--signal)" }}>{t(`沒有出處的數字：${d.unverified.join(", ")}`, `numbers not in PayPal's answers: ${d.unverified.join(", ")}`)}</td></tr>)}
          </tbody></table></div>}
      </div>}

      {rep && <details className="card">
        <summary className="small">{t(`工具呼叫 ${rep.calls.length} 次`, `${rep.calls.length} tool calls`)}{rep.agent ? t(`（agent ${rep.calls.filter((c) => c.by === "agent").length} 次）`, ` (${rep.calls.filter((c) => c.by === "agent").length} by the agent)`) : ""}</summary>
        <div className="scroll-x" style={{ marginTop: 12 }}><table className="table">
          <thead><tr><th>#</th><th>{t("誰", "By")}</th><th>{t("工具", "Tool")}</th><th>{t("參數", "Arguments")}</th><th className="r">ms</th><th>{t("結果", "Result")}</th></tr></thead>
          <tbody>{rep.calls.map((c, i) => <tr key={i}><td className="num">{i + 1}</td><td>{c.by === "agent" ? <span className="badge agent">agent</span> : <span className="badge">code</span>}</td><td><span className="part">{c.tool}</span></td><td className="tiny muted" style={{ fontFamily: "var(--mono)", maxWidth: 360, overflowWrap: "anywhere" }}>{c.args ? JSON.stringify(c.args) : ""}</td><td className="r num">{c.cached ? "cache" : c.ms ?? ""}</td><td className="small" style={{ color: c.refused || !c.ok ? "var(--signal)" : "var(--ink-3)" }}>{c.refused ? t("拒絕：不是唯讀工具", "refused: not read-only") : c.ok ? "ok" : c.error}</td></tr>)}</tbody>
        </table></div>
      </details>}

      {r.data?.history?.length > 1 && <div className="card stack">
        <h3>{t("之前的對帳", "Earlier runs")}</h3>
        <div className="scroll-x"><table className="table">
          <thead><tr><th>{t("時間", "When")}</th><th>{t("誰對的", "Run by")}</th><th className="r">{t("筆數", "Lines")}</th><th className="r">{t("相符", "Matched")}</th><th className="r">{t("要處理", "To look at")}</th></tr></thead>
          <tbody>{r.data.history.slice().reverse().map((h) => { const n = ISSUES.reduce((s, k) => s + (h.counts[k] || 0), 0); return <tr key={h.id}><td className="num">{when(h.at)}</td><td className="small">{h.mode === "agent" ? "agent" : t("純程式", "plain code")} · {h.by === "schedule" ? t("排程", "scheduled") : t("手動", "on demand")}</td><td className="r num">{h.rows}</td><td className="r num">{h.counts.matched}</td><td className="r num" style={{ color: n ? "var(--signal)" : undefined }}>{n}</td></tr>; })}</tbody>
        </table></div>
      </div>}
    </div>
  );
}
