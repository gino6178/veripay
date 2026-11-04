// Where the money is, for anyone: each cause's pool (premiums in, Cover's fee, claims and reinsurance out, what is
// left), counted from the ledger, and every giveback with its receipt.
import { useApi, useT, useLang } from "../api.jsx";
import { MoneySplit } from "./Home.jsx";

export default function Transparency() {
  const t = useT(), { lang } = useLang();
  const { data } = useApi("/api/transparency");
  return (
    <div className="stack-l">
      <div className="page-head" style={{ display: "block" }}><h1>{t("帳本", "The ledger")}</h1><p className="lede" style={{ maxWidth: "64ch" }}>{t("選同一個公益的保戶共用一個理賠池。保費進來先分出 Cover 固定的 20%，其餘進池子；理賠和再保險從池子出。年底池子剩下的錢，用 PayPal Payouts 捐給那個公益。下面每個數字都是從帳本算出來的。", "Everyone who picks the same cause shares one claims pool. Each premium gives Cover a flat 20% and the rest goes into the pool; claims and reinsurance are paid from it. At the end of the year, what is left is given to that cause with PayPal Payouts. Every number below is counted from the ledger.")}</p></div>
      <MoneySplit />
      <div className="scroll-x"><table className="table">
        <thead><tr><th>{t("公益池", "Cause pool")}</th><th className="r">{t("保單", "Policies")}</th><th className="r">{t("保費", "Premiums")}</th><th className="r">{t("Cover 費用", "Cover's fee")}</th><th className="r">{t("理賠", "Claims")}</th><th className="r">{t("再保險", "Reinsurance")}</th><th className="r">{t("已捐出", "Given")}</th><th className="r">{t("池子現有", "In the pool")}</th></tr></thead>
        <tbody>{(data?.pools || []).map((p) => <tr key={p.cause}><td><b>{lang === "en" ? p.name.en : p.name.zh}</b></td><td className="r">{p.policies}</td><td className="r">{p.premiums}</td><td className="r">{p.fees}</td><td className="r">{p.claims} ({p.claimCount})</td><td className="r">{p.reinsurance}</td><td className="r">{p.giveback}</td><td className="r"><span className="big" style={{ fontSize: 28, color: p.balance.startsWith("$-") ? "var(--bad)" : "var(--ink)" }}>{p.balance}</span></td></tr>)}</tbody>
      </table></div>
      {data?.givebacks?.length > 0 && <div className="card stack-s"><h3>{t("每年的捐贈", "Each year's giveback")}</h3>
        <table className="table"><thead><tr><th>{t("年度", "Year")}</th><th>{t("公益", "Cause")}</th><th className="r">{t("金額", "Amount")}</th><th>PayPal</th><th>{t("收據", "Receipt")}</th></tr></thead>
          <tbody>{data.givebacks.map((g) => <tr key={`${g.year}-${g.cause}`}><td>{g.year}</td><td>{lang === "en" ? g.name.en : g.name.zh}</td><td className="r num">{g.amount}</td><td className="mono tiny">{g.payout || "—"}</td><td className="mono tiny">{g.receipt}</td></tr>)}</tbody></table></div>}
    </div>
  );
}
