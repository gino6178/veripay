// The anomaly-alert agent's panel: what it is watching, the alerts it raised (each one shows its rows in the grid),
// and a box to ask the grid a question in plain words. Below, the run's trace: which agent took it, whether the local
// model or the rules wrote the plan, and each tool call the grid ran.
import { useEffect, useMemo, useRef, useState } from "react";
import { api, useT, when } from "../../api.jsx";
import { useMe } from "../../App.jsx";
import { createHarness, watch } from "./agent.js";

// the watcher's loop, for a page: the latest alerts and facts, and a toast for each new alert
export function useWatcher(every = 20e3) {
  const [state, set] = useState({ data: null, error: null }), { toast } = useMe(), t = useT(), w = useRef(null);
  useEffect(() => {
    w.current = watch((data, fresh, error) => {
      set((s) => ({ data: data || s.data, error: error || null }));
      if (fresh.length) toast(t(`異常警示：${fresh[0].title[0]}${fresh.length > 1 ? `（還有 ${fresh.length - 1} 件）` : ""}`, `Alert: ${fresh[0].title[1]}${fresh.length > 1 ? ` (and ${fresh.length - 1} more)` : ""}`));
    }, { every });
    return () => w.current?.stop();
  }, [every]); // eslint-disable-line react-hooks/exhaustive-deps
  return { ...state, refresh: () => w.current?.now() };
}

const harness = createHarness();

export default function AgentPanel({ watcher, grids, suggestions = [] }) {
  const t = useT(), [q, setQ] = useState(""), [grid, setGrid] = useState(grids[0]?.name), [trace, setTrace] = useState([]), [busy, setBusy] = useState(false), [showAcked, setShowAcked] = useState(false);
  const alerts = watcher.data?.alerts || [], open = alerts.filter((a) => !a.acked), list = showAcked ? alerts : open;
  const here = useMemo(() => new Set(grids.map((g) => g.name)), [grids]);
  const run = async (input) => {
    setBusy(true); setTrace([]);
    await harness.run(input, (e) => setTrace((x) => [...x, e]));
    setBusy(false);
  };
  const ask = (text) => { const s = (text ?? q).trim(); if (!s) return; setQ(s); run({ question: s, grid }); };
  const ack = async (a) => { await api(`/api/staff/alerts/${encodeURIComponent(a.id)}/ack`, { method: "POST" }); watcher.refresh(); };
  const gridOf = (a) => a.plan?.find((c) => c.args?.grid)?.args.grid;

  return (
    <section className="bo-agent card" aria-labelledby="bo-agent-h">
      <header className="bo-agent-head">
        <div>
          <h3 id="bo-agent-h">{t("異常警示代理人", "Anomaly-alert agent")}</h3>
          <p className="tiny muted mono"><span className={`bo-live ${watcher.error ? "off" : ""}`} aria-hidden="true" />{watcher.error ? t("連不上，稍後再試", "can't reach the server; retrying") : t(`監看理賠和帳本 · 每 20 秒 · ${watcher.data?.agent || "…"}`, `watching claims and the ledger · every 20 s · ${watcher.data?.agent || "…"}`)}</p>
        </div>
        <span className="bo-tally"><b className={open.some((a) => a.severity === "high") ? "hot" : ""}>{open.length}</b><span className="tiny mono muted">{t("待處理警示", "open alerts")}</span></span>
      </header>

      <ol className="bo-alerts">
        {list.map((a) => {
          const g = gridOf(a), can = g && here.has(g);
          return <li key={a.id} className={`bo-alert ${a.severity} ${a.acked ? "acked" : ""}`}>
            <span className="bo-sev mono">{a.severity === "high" ? t("高", "HIGH") : t("中", "MED")}</span>
            <div className="bo-alert-body">
              <b>{t(...a.title)}</b>
              <p className="small muted">{t(...a.says)}</p>
              <p className="tiny mono muted">{a.kind} · {t("首次發現", "first seen")} {when(a.firstSeen)}{a.claims?.length ? ` · ${a.claims.length} ${t("件理賠", "claims")}` : ""}</p>
            </div>
            <div className="bo-alert-act">
              {a.plan?.length > 0 && (can ? <button className="btn sm" onClick={() => run({ alert: a })}>{t("在表中顯示", "Show rows")}</button> : <a className="btn sm ghost" href={g === "products" ? "/carrier" : "/desk"}>{g === "products" ? t("到後台", "In back office") : t("到審核台", "On the desk")}</a>)}
              {!a.acked && <button className="btn sm ghost" onClick={() => ack(a)}>{t("已知悉", "Acknowledge")}</button>}
            </div>
          </li>;
        })}
        {!list.length && <li className="bo-alert none small muted">{watcher.data ? t("目前沒有異常。", "Nothing out of the ordinary right now.") : t("載入中…", "Loading…")}</li>}
      </ol>
      {alerts.length > open.length && <button className="link tiny" onClick={() => setShowAcked(!showAcked)}>{showAcked ? t("隱藏已知悉的", "Hide acknowledged") : t(`顯示已知悉的（${alerts.length - open.length}）`, `Show acknowledged (${alerts.length - open.length})`)}</button>}

      <form className="bo-ask" onSubmit={(e) => { e.preventDefault(); ask(); }}>
        <label className="sr" htmlFor="bo-q">{t("問這張表", "Ask the grid")}</label>
        <input id="bo-q" className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("例如：有可疑訊號的租屋險理賠，金額由大到小", "e.g. flagged renters claims over $300, biggest first")} />
        {grids.length > 1 && <select className="input" value={grid} onChange={(e) => setGrid(e.target.value)} aria-label={t("哪張表", "Which grid")}>{grids.map((g) => <option key={g.name} value={g.name}>{g.label}</option>)}</select>}
        <button className="btn accent" disabled={busy || !q.trim()}>{busy ? t("處理中", "Working") : t("問", "Ask")}</button>
      </form>
      {suggestions.length > 0 && <div className="bo-suggest">{suggestions.map((s) => <button key={s.q} type="button" className="bo-chip" onClick={() => { if (s.grid) setGrid(s.grid); setQ(s.q); run({ question: s.q, grid: s.grid || grid }); }}>{s.label || s.q}</button>)}</div>}

      {trace.length > 0 && <ol className="bo-trace mono tiny" aria-live="polite">
        {trace.map((e, i) => <li key={i} className={e.type}>
          <span className="who">{e.agent}</span>
          {e.type === "delegate" && <span>→ {e.to}</span>}
          {e.type === "model" && <span>{t("計畫來自", "plan by")} <b>{e.by}</b>{e.fellBack ? ` · ${e.fellBack}` : ""}</span>}
          {e.type === "tool" && <span><b>{e.tool}</b> {e.text}</span>}
          {e.type === "say" && <span className="said">{e.text}</span>}
          {e.type === "error" && <span className="err">{e.text}</span>}
        </li>)}
      </ol>}
      <p className="tiny muted">{t("代理人只會篩選和排序表格，不會核准或拒絕任何理賠。", "The agent only filters and sorts the grids; it never approves or denies a claim.")} <span className="mono">{t("可用的表", "grids")}: {grids.map((g) => g.name).join(", ")}</span></p>
    </section>
  );
}
