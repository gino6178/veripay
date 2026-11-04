// Connecting a person's own AI agent: a token with the scopes they choose, the limits only they can set, and how to
// add Cover to Claude (MCP).
import { useEffect, useState } from "react";
import { api, Link, useApi, useT, usd, cents, when } from "../api.jsx";
import { useMe } from "../App.jsx";

export default function Connect() {
  const t = useT(), { me, toast, info } = useMe();
  const tokens = useApi(me ? "/api/tokens" : null), limits = useApi(me ? "/api/limits" : null);
  const [label, setLabel] = useState("Claude"), [scopes, setScopes] = useState(["read", "buy", "claim"]), [made, setMade] = useState(null), [l, setL] = useState(null);
  useEffect(() => { if (limits.data) setL({ ...limits.data, monthlyMax: (limits.data.monthlyMax / 100).toFixed(2) }); }, [limits.data]);
  if (me === null) return <div className="empty"><Link className="btn" to="/signin?next=/connect">{t("登入", "Sign in")}</Link></div>;
  const make = async () => { try { setMade(await api("/api/tokens", { method: "POST", body: { label, scopes } })); tokens.reload(); } catch (e) { toast(e.message); } };
  const saveLimits = async () => { try { await api("/api/limits", { method: "PUT", body: { monthlyMax: cents(l.monthlyMax), mayBuy: l.mayBuy, mayCancel: l.mayCancel, autopay: l.autopay } }); toast(t("已儲存", "Saved")); limits.reload(); } catch (e) { toast(e.message); } };
  const mcp = info?.mcpUrl || `${location.origin}/mcp`;
  const SC = { read: ["查看", "Read"], buy: ["投保和改保單", "Buy and change"], claim: ["報理賠", "Claim"] };
  return (
    <div className="grid-2">
      <div className="stack">
        <h1>{t("我的 AI agent", "My AI agent")}</h1>
        <p className="muted">{t("讓你自己的 agent（例如 Claude）透過 MCP 幫你報價、投保、報理賠。它能做什麼由這頁決定，agent 自己改不了。", "Let your own agent (Claude, for example) quote, buy and claim for you over MCP. What it may do is set here, and the agent can't change it.")}</p>
        {l && <div className="card stack">
          <h3>{t("限制", "Limits")}</h3>
          <label className="field"><span>{t("agent 每月最多能幫你增加的保費（所有保單合計，USD）", "The most your agent may add to your premiums a month, all policies (USD)")}</span><input className="input" type="number" min="0" step="1" value={l.monthlyMax} onChange={(e) => setL({ ...l, monthlyMax: e.target.value })} /></label>
          {[["mayBuy", "可以幫我買新保單", "May buy new policies"], ["mayCancel", "可以幫我退保", "May cancel policies"], ["autopay", "可以直接用我存好的 PayPal 付款（不用每次問我）", "May pay from my saved PayPal without asking each time"]].map(([k, zh, en]) => <label key={k} className="row" style={{ gap: 10 }}><input type="checkbox" checked={!!l[k]} onChange={(e) => setL({ ...l, [k]: e.target.checked })} /> {t(zh, en)}</label>)}
          <p className="tiny muted">{t("理賠款永遠只付到你自己的 PayPal（或你指定的動物醫院），agent 無法更改。", "Claims are only ever paid to your own PayPal (or the vet you name); an agent can't change that.")}</p>
          <button className="btn" onClick={saveLimits}>{t("儲存限制", "Save limits")}</button>
        </div>}
      </div>
      <div className="stack">
        <div className="card stack">
          <h3>{t("建立 agent token", "Make an agent token")}</h3>
          <label className="field"><span>{t("給哪個 agent", "For which agent")}</span><input className="input" value={label} onChange={(e) => setLabel(e.target.value)} /></label>
          <div className="chips">{Object.keys(SC).map((s) => <button key={s} className={`chip ${scopes.includes(s) ? "on" : ""}`} onClick={() => setScopes(scopes.includes(s) ? scopes.filter((x) => x !== s) : [...scopes, s])}>{t(...SC[s])}</button>)}</div>
          <button className="btn accent" onClick={make}>{t("建立", "Make it")}</button>
          {made && <div className="note good stack-s"><b>{t("只會顯示這一次：", "Shown only this once:")}</b><code className="mono" style={{ wordBreak: "break-all" }}>{made.token}</code>
            <p className="small">{t("加到 Claude Code：", "Add it to Claude Code:")}</p><code className="mono tiny" style={{ wordBreak: "break-all" }}>{`claude mcp add --transport http cover ${mcp} --header "Authorization: Bearer ${made.token}"`}</code></div>}
        </div>
        <div className="card stack-s"><h3>{t("你的 token", "Your tokens")}</h3>
          {(tokens.data || []).map((x) => <div key={x.id} className="row between"><span>{x.label} <span className="mono tiny muted">{x.hint}</span><br /><span className="tiny muted">{x.scopes.join(", ")} · {t("最後使用", "last used")} {when(x.lastUsed)}</span></span><button className="btn ghost sm" onClick={async () => { await api(`/api/tokens/${x.id}`, { method: "DELETE" }); tokens.reload(); }}>{t("撤銷", "Revoke")}</button></div>)}
          {tokens.data?.length === 0 && <p className="muted small">{t("還沒有。", "None yet.")}</p>}
        </div>
        <p className="tiny muted">MCP: <span className="mono">{mcp}</span> · <a href="/llms.txt">llms.txt</a></p>
      </div>
    </div>
  );
}
