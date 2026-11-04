// Everything that happened for the signed-in person, and who did it: them, their agent, Cover, PayPal or an adjuster.
// The sentences are Cover's, written from the facts; nothing here is model-written.
import { useEffect } from "react";
import { Link, useApi, useT, when } from "../api.jsx";
import { useMe } from "../App.jsx";

const BY = { agent: ["你的 agent", "your agent", "agent"], person: ["你", "you", ""], platform: ["Cover", "Cover", "good"], paypal: ["PayPal", "PayPal", "warn"], adjuster: ["理賠人員", "an adjuster", "agent"], model: ["Cover 的模型", "Cover's model", "agent"] };
export default function Activity() {
  const t = useT(), { me } = useMe();
  const { data, reload } = useApi(me ? "/api/activity" : null);
  useEffect(() => { const f = () => reload(); addEventListener("cover:refresh", f); const tm = setInterval(reload, 8000); return () => { removeEventListener("cover:refresh", f); clearInterval(tm); }; }, [reload]);
  if (me === null) return <div className="empty"><Link className="btn" to="/signin?next=/activity">{t("登入", "Sign in")}</Link></div>;
  return (
    <div className="stack" style={{ maxWidth: 820 }}>
      <h1>{t("發生了什麼", "What happened")}</h1>
      <p className="muted">{t("你、你的 AI agent、Cover 和 PayPal 做的每一件事。這裡的句子是 Cover 依事實寫的，不是模型寫的。", "Every step you, your AI agent, Cover and PayPal took. Cover writes these sentences from the facts; no model writes them.")}</p>
      <ul className="feed card">{(data || []).slice().reverse().map((e) => { const b = BY[e.actor?.kind] || [e.actor?.kind, e.actor?.kind, ""]; return (
        <li key={e.id}><time>{when(e.at)}</time><div><span className={`badge by ${b[2]}`}>{t(b[0], b[1])}{e.actor?.client ? ` · ${e.actor.client}` : ""}</span><div style={{ marginTop: 4 }}>{e.summary}</div></div></li>); })}
        {data?.length === 0 && <li><span /><span className="muted">{t("還沒有紀錄。", "Nothing yet.")}</span></li>}
      </ul>
    </div>
  );
}
