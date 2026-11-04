// Where the money is, for anyone: each cause's pool (premiums in, Cover's fee, claims and reinsurance out, what is
// left), counted from the ledger, and every giveback with its receipt.
import { useApi, useT, useLang } from "../api.jsx";
import { MoneySplit } from "./Home.jsx";

export default function Transparency() {
  const t = useT(), { lang } = useLang();
  const { data } = useApi("/api/transparency");
  return (
    <div className="stack-l">
      <div className="stack-s"><h1>{t("錢去哪了", "Where the money goes")}</h1><p className="muted" style={{ maxWidth: "62ch" }}>{t("選同一個公益的保戶共用一個理賠池。保費進來先分出 Cover 固定的 20%，其餘進池子；理賠和再保險從池子出。年底池子剩下的錢，用 PayPal Payouts 捐給那個公益。下面每個數字都是從帳本算出來的。", "Everyone who picks the same cause shares one claims pool. Each premium gives Cover a flat 20% and the rest goes into the pool; claims and reinsurance are paid from it. At the end of the year, what is left is given to that cause with PayPal Payouts. Every number below is counted from the ledger.")}</p></div>
      <MoneySplit />
      <div className="grid">{(data?.pools || []).map((p) => (
        <div key={p.cause} className="card stack-s">
          <h3>{lang === "en" ? p.name.en : p.name.zh}</h3>
          <p className="tiny muted">{t(`${p.policies} 張保單`, `${p.policies} policies`)}</p>
          <dl className="kv">
            <dt>{t("保費", "Premiums")}</dt><dd className="num">{p.premiums}</dd>
            <dt>{t("Cover 費用", "Cover's fee")}</dt><dd className="num">{p.fees}</dd>
            <dt>{t("理賠", "Claims")}</dt><dd className="num">{p.claims} <span className="muted">({p.claimCount})</span></dd>
            <dt>{t("再保險", "Reinsurance")}</dt><dd className="num">{p.reinsurance}</dd>
            <dt>{t("已捐出", "Given")}</dt><dd className="num">{p.giveback}</dd>
          </dl>
          <p style={{ marginTop: 8 }}><span className="eyebrow">{t("池子目前", "In the pool now")}</span><br /><b style={{ font: "650 28px/1.2 var(--display)", color: p.balance.startsWith("$-") ? "var(--bad)" : "var(--accent)" }} className="num">{p.balance}</b></p>
        </div>))}</div>
      {data?.givebacks?.length > 0 && <div className="card stack-s"><h3>{t("每年的捐贈", "Each year's giveback")}</h3>
        <table className="table"><thead><tr><th>{t("年度", "Year")}</th><th>{t("公益", "Cause")}</th><th className="r">{t("金額", "Amount")}</th><th>PayPal</th><th>{t("收據", "Receipt")}</th></tr></thead>
          <tbody>{data.givebacks.map((g) => <tr key={`${g.year}-${g.cause}`}><td>{g.year}</td><td>{lang === "en" ? g.name.en : g.name.zh}</td><td className="r num">{g.amount}</td><td className="mono tiny">{g.payout || "—"}</td><td className="mono tiny">{g.receipt}</td></tr>)}</tbody></table></div>}
    </div>
  );
}
