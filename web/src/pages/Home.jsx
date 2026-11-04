// The front page: what Cover is in one line, its live numbers (counted from the ledger and the claims), the five
// products, and where a premium goes.
import { Link, useApi, useT, useLang, usd, secs } from "../api.jsx";
import Icon from "../components/Icon.jsx";

export default function Home() {
  const t = useT(), { lang } = useLang();
  const { data: products } = useApi(`/api/products?lang=${lang}`);
  const { data: stats } = useApi("/api/stats");
  return (
    <div className="stack-l">
      <section className="hero">
        <div>
          <p className="eyebrow">{t("給年輕人的保險，錢全部走 PayPal", "Insurance for young people, every dollar through PayPal")}</p>
          <h1 style={{ marginTop: 12 }}>{t(<>90 秒投保，<br /><em>幾分鐘</em>就理賠。</>, <>Covered in 90 seconds.<br />Paid in <em>minutes</em>.</>)}</h1>
          <p className="lead">{t("Cover 的 AI 問你幾個問題就報價，簡單的理賠按條款自動核准，用 PayPal Payouts 直接入帳。我們只收固定 20%，年底沒用完的理賠池捐給你選的公益。", "Cover's AI asks a few questions and prices you. Simple claims are approved by the policy's own clauses and paid straight to your PayPal. We take a flat 20%; what is left of the claims pool at the end of the year goes to a cause you pick.")}</p>
          <div className="row" style={{ marginTop: 28 }}>
            <Link to="/quote" className="btn accent">{t("開始投保", "Get a quote")} <Icon name="next" size={18} /></Link>
            <Link to="/transparency" className="btn ghost">{t("看錢去哪了", "See where the money goes")}</Link>
          </div>
        </div>
        <div className="stack">
          <div className="stat-row">
            <div className="stat"><b>{stats?.medianSecondsToPay != null ? secs(stats.medianSecondsToPay) : "—"}</b><span>{t("秒賠的中位數時間", "median time to pay an instant claim")}</span></div>
            <div className="stat"><b>{stats ? stats.claimsPaid : "—"}</b><span>{t("已理賠件數", "claims paid")}</span></div>
            <div className="stat"><b>{stats ? usd(stats.givenBack) : "—"}</b><span>{t("已捐給公益", "given to causes")}</span></div>
          </div>
          <MoneySplit />
        </div>
      </section>

      <section>
        <div className="section-title"><h2>{t("五種保險，一個流程", "Five kinds of cover, one way of working")}</h2></div>
        <div className="grid">
          {(products || []).map((p) => (
            <Link key={p.id} to={`/quote/${p.id}`} className="card link-card product-card">
              <span className="glyph"><Icon name={p.id} /></span>
              <h3>{p.name}</h3>
              <p className="small muted">{p.for}</p>
              <span className="small" style={{ color: "var(--accent)" }}>{t(`${p.questions.length} 個問題 · 報價`, `${p.questions.length} questions · get a price`)} →</span>
            </Link>
          ))}
        </div>
      </section>

      <section className="grid-2">
        <div className="card stack">
          <span className="glyph" style={{ color: "var(--accent)" }}><Icon name="bolt" size={28} /></span>
          <h3>{t("理賠：條款說了算，不是心情", "Claims: decided by the clauses, not by mood")}</h3>
          <p className="muted">{t("每件理賠都跑同一組檢查：保單當時有效嗎、過了等待期嗎、有這項保障嗎、文件讀得懂嗎、有沒有詐欺訊號。每一項都寫出依據的條款。全部通過又在秒賠額度內，就直接用 PayPal Payouts 付款；其他的交給真人，而且不會因為詐欺訊號就自動拒賠。", "Every claim runs the same checks: was the policy in force, is the waiting period over, does it have this cover, could the documents be read, any fraud signals. Each names its clause. When all pass and the amount is within the instant limit, PayPal Payouts sends the money; anything else goes to a person, and a fraud signal never refuses a claim by itself.")}</p>
        </div>
        <div className="card stack">
          <span className="glyph" style={{ color: "var(--agent)" }}><Icon name="agent" size={28} /></span>
          <h3>{t("你的 AI agent 也能幫你投保和理賠", "Your own AI agent can do it for you")}</h3>
          <p className="muted">{t("用 MCP 連上 Cover，你的 agent 可以報價、投保、報理賠。它每個月最多能幫你花多少、能不能退保、能不能直接用你存的 PayPal 付，都由你設定，agent 改不了。理賠款永遠只會進你自己的 PayPal。", "Connect over MCP and your agent can quote, buy and claim. How much it may add to your premiums each month, whether it may cancel, and whether it may pay from your saved PayPal are yours to set; the agent can't change them. Claims are only ever paid to your own PayPal.")}</p>
          <Link to="/connect" className="link small">{t("連接你的 agent", "Connect your agent")}</Link>
        </div>
      </section>
    </div>
  );
}

export function MoneySplit({ pool = 74, re = 6, fee = 20 }) {
  const t = useT();
  return (
    <div className="card stack-s">
      <p className="small"><b>{t("每 100 元保費", "Of every $100 of premium")}</b></p>
      <div className="split" role="img" aria-label={t(`理賠池 ${pool}%，再保 ${re}%，Cover 費用 ${fee}%`, `claims pool ${pool}%, reinsurance ${re}%, Cover's fee ${fee}%`)}><i className="pool" style={{ width: `${pool}%` }} /><i className="re" style={{ width: `${re}%` }} /><i className="fee" style={{ width: `${fee}%` }} /></div>
      <div className="legend"><span><i style={{ background: "var(--accent)" }} />{t("理賠池", "Claims pool")} {pool}%</span><span><i style={{ background: "color-mix(in srgb, var(--accent) 45%, var(--card))" }} />{t("再保險", "Reinsurance")} {re}%</span><span><i style={{ background: "var(--ink-3)" }} />{t("Cover 固定費用", "Cover's flat fee")} {fee}%</span></div>
      <p className="tiny muted">{t("理賠池沒用完的部分，年底捐給你選的公益，不會變成 Cover 的利潤。", "What the claims pool doesn't pay out goes to your cause at the end of the year, never to Cover's profit.")}</p>
    </div>
  );
}
