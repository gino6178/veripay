// A person's policies and claims, and one policy in full: what it covers, every payment with its PayPal id, and what
// they can do with it (claim, change, cancel with the refund shown first).
import { useEffect, useState } from "react";
import { api, Link, navigate, useApi, useT, useLang, day, when } from "../api.jsx";
import { useMe } from "../App.jsx";
import PayPalButtons from "../components/PayPalButtons.jsx";

const useRefresh = (reload) => useEffect(() => { const f = () => reload(); addEventListener("cover:refresh", f); return () => removeEventListener("cover:refresh", f); }, [reload]);
export function Status({ s }) {
  const t = useT();
  const L = { active: ["生效中", "Active", "good"], awaiting_payment: ["等待付款", "Awaiting payment", "warn"], grace: ["寬限期", "Grace period", "warn"], lapsed: ["停效", "Lapsed", "bad"], cancelled: ["已退保", "Cancelled", ""], expired: ["已到期", "Expired", ""], review: ["核保中", "Under review", "warn"], declined: ["未承保", "Declined", "bad"],
    paid: ["已理賠", "Paid", "good"], paying: ["付款中", "Paying", "warn"], referred: ["真人審核中", "With an adjuster", "warn"], needs_evidence: ["缺文件", "Needs evidence", "warn"], needs_info: ["需補件", "More info asked", "warn"], denied: ["不在保障內", "Not covered", "bad"], withdrawn: ["已撤回", "Withdrawn", ""], deciding: ["判斷中", "Deciding", "warn"] }[s] || [s, s, ""];
  return <span className={`badge ${L[2]}`}>{t(L[0], L[1])}</span>;
}

export default function Policies() {
  const t = useT(), { me } = useMe(), { lang } = useLang();
  const pol = useApi(me ? `/api/policies?lang=${lang}` : null), cl = useApi(me ? `/api/claims?lang=${lang}` : null);
  useRefresh(pol.reload); useRefresh(cl.reload);
  if (me === null) return <div className="empty"><p>{t("登入後就能看到你的保單。", "Sign in to see your policies.")}</p><Link className="btn" to="/signin?next=/policies" style={{ marginTop: 16 }}>{t("登入", "Sign in")}</Link></div>;
  return (
    <div className="stack-l">
      <div className="page-head" style={{ marginBottom: 0 }}><h1>{t("我的保單", "My policies")}</h1><Link to="/quote" className="btn accent">{t("再保一個", "Cover something else")} →</Link></div>
      {pol.data?.length === 0 && <div className="empty card">{t("還沒有保單。", "No policies yet.")} <Link to="/quote" className="link">{t("90 秒投保", "Get covered in 90 seconds")}</Link></div>}
      <div className="grid">{(pol.data || []).map((p) => (
        <Link key={p.policy} to={`/policies/${p.policy}`} className="card link-card stack-s">
          <div className="row between"><span className="data">{p.number}</span><Status s={p.status} /></div>
          <h3 style={{ fontSize: 26 }}>{p.name}</h3>
          <p className="big" style={{ fontSize: 40 }}>{p.plan === "trip" ? p.annual : p.monthly}<span className="data" style={{ marginLeft: 8 }}>{p.plan === "trip" ? t("/ 這趟", "FOR THE TRIP") : p.plan === "yearly" ? t(`年繳 ${p.annual}`, `${p.annual} / YEAR`) : t("/ 月", "/ MONTH")}</span></p>
          {p.trip && <p className="data">{(p.trip.flights || []).map((f) => `${f.flight} ${f.date}`).join(" · ")}</p>}
          {p.status === "grace" && <p className="tiny" style={{ color: "var(--warn)" }}>{t(`請在 ${day(p.graceUntil)} 前繳費`, `Pay by ${day(p.graceUntil)}`)}</p>}
        </Link>))}</div>
      {cl.data?.length > 0 && <section className="stack"><h2>{t("理賠", "Claims")}</h2>
        <div className="card scroll-x"><table className="table"><thead><tr><th>{t("編號", "Number")}</th><th>{t("內容", "What")}</th><th>{t("申請", "Claimed")}</th><th>{t("狀態", "Status")}</th><th className="r">{t("入帳", "Paid")}</th></tr></thead>
          <tbody>{cl.data.map((c) => <tr key={c.claim} style={{ cursor: "pointer" }} onClick={() => navigate(`/claims/${c.claim}`)}><td className="mono">{c.number}</td><td>{c.what}</td><td className="num">{c.claimed}</td><td><Status s={c.status} /></td><td className="r num">{c.payout?.amount || "—"}</td></tr>)}</tbody></table></div>
      </section>}
    </div>
  );
}

export function PolicyPage({ id }) {
  const t = useT(), { lang } = useLang(), { toast, info } = useMe();
  const { data: p, reload, error } = useApi(`/api/policies/${id}?lang=${lang}`);
  const { data: prod } = useApi(p ? `/api/products/${p.product}?lang=${lang}` : null);
  const { data: allClaims } = useApi(`/api/claims?lang=${lang}`);
  const [confirmCancel, setConfirmCancel] = useState(false), [busy, setBusy] = useState(false);
  useRefresh(reload);
  if (error) return <div className="empty">{t("找不到這張保單。", "No such policy.")}</div>;
  if (!p) return null;
  const act = async (path, body) => { setBusy(true); try { const r = await api(`/api/policies/${id}/${path}`, { method: "POST", body: body || {} }); if (r.error) throw new Error(r.message); toast(path === "cancel" ? t(`已退保，退款 ${r.refunded}`, `Cancelled; ${r.refunded} refunded`) : path === "pay-card" ? t("已用測試卡付款，保單生效", "Paid with the test card: the policy is active") : r.difference || t("完成", "Done")); reload(); } catch (e) { toast(e.message); } setBusy(false); setConfirmCancel(false); };
  const claims = (allClaims || []).filter((c) => c.policy === id);
  const cancelled = new URLSearchParams(location.search).get("cancelled");
  return (
    <div className="grid-2">
      <div className="stack">
        <div className="page-head" style={{ marginBottom: 8 }}><div><p className="data">{p.number}</p><h1>{p.name}</h1></div><Status s={p.status} /></div>
        {cancelled && p.status === "awaiting_payment" && <div className="note warn">{t("付款沒有完成。你可以再試一次。", "The payment wasn't completed. You can try again.")}</div>}
        {p.approveUrl && <div className="stack-s"><p className="small">{p.plan === "trip" ? t("在 PayPal 付這趟的保費（同時存好 PayPal，之後你的 agent 可以在你給的上限內付款）：", "Pay for the trip in PayPal (this also saves PayPal, so your agent can pay within your limit next time):")
          : t("在 PayPal 付第一期保費（同時存好 PayPal，之後的月繳不用再跳轉）：", "Pay the first premium in PayPal (this also saves PayPal for the monthly premiums):")}</p><PayPalButtons policyId={p.policy} orderId={p.payments[0]?.paypal?.startsWith("I-") ? null : p.payments[0]?.paypal} approveUrl={p.approveUrl} label={t("前往 PayPal 付款", "Pay in PayPal")} onDone={reload} />
          {info?.testCard && <button className="btn" disabled={busy} onClick={() => act("pay-card")}>{t("改用 PayPal 沙盒測試卡付款（評審不用登入）", "Or pay with PayPal's sandbox test card (no sign-in, for judges)")}</button>}</div>}
        {p.status === "grace" && <div className="note warn stack-s"><b>{t("這期保費扣款失敗", "This premium couldn't be charged")}</b><p>{t(`保障照常到 ${day(p.graceUntil)}。PayPal 已寄出繳費單，繳了就恢復正常。`, `You're still covered until ${day(p.graceUntil)}. PayPal sent an invoice; paying it puts things right.`)}</p>{p.invoice && <a className="btn paypal sm" href={p.invoice}>{t("繳費", "Pay the invoice")}</a>}</div>}
        {p.status === "lapsed" && <div className="note bad stack-s"><b>{t("保單已停效", "This policy has lapsed")}</b><p>{t("停效期間發生的事故不理賠。繳清就復效。", "Nothing that happens while it is lapsed is covered. Paying reinstates it.")}</p>{p.invoice && <a className="btn paypal sm" href={p.invoice}>{t("繳費復效", "Pay to reinstate")}</a>}</div>}
        <div className="card marks stack">
          <dl className="kv">
            <dt>{t("保費", "Premium")}</dt><dd className="num">{p.price}</dd>
            <dt>{t("期間", "Cover")}</dt><dd>{day(p.start)} → {day(p.end)}</dd>
            {p.waitingUntil && <><dt>{t("等待期到", "Waiting period until")}</dt><dd>{day(p.waitingUntil)}</dd></>}
            {p.nextPremium && <><dt>{t("下次扣款", "Next premium")}</dt><dd>{day(p.nextPremium)}</dd></>}
            <dt>{t("自負額", "Deductible")}</dt><dd>{p.deductible || "—"}</dd>
            {p.trip && <><dt>{t("航班", "Flights")}</dt><dd className="mono">{(p.trip.flights || []).map((f) => <div key={`${f.flight}${f.date}`}>{f.flight} · {f.date}</div>)}</dd>
              <dt>{t("旅客", "Travelers")}</dt><dd>{p.trip.travelers}</dd>
              <dt>{t("班機出事時", "If a flight goes wrong")}</dt><dd className="small">{t("延誤 2 小時以上每位 $100、6 小時以上 $300，取消 $300。Cover 從航班狀態看到就自動付款，不用申請。", "2 h late pays $100 a traveler, 6 h $300, cancelled $300. Cover sees it in the flight status and pays automatically; there's nothing to file.")}</dd></>}
            <dt>{t("付款方式", "Billing")}</dt><dd>{p.plan === "trip" ? t("這趟一次付清", "once, for the trip") : p.plan === "yearly" ? t("年繳", "yearly") : p.billing === "subscription" ? t("PayPal 訂閱", "PayPal subscription") : t("PayPal（Vault）月繳", "monthly, saved PayPal")}</dd>
          </dl>
          {/* covers and add-ons by their names (the policy itself only keeps the ids), once the product has loaded */}
          {prod && <ul className="why">{p.covers.map((c) => { const def = prod.covers.find((x) => x.id === c.id), add = prod.addons.find((x) => x.id === c.id); return <li key={c.id}><span>{(def || add)?.what || c.id}{add && !def ? <span className="badge" style={{ marginLeft: 8 }}>{t("加購", "ADD-ON")}</span> : null} <span className="mono muted">{c.clause}</span></span><span className="num">{c.limit && c.limit !== "$0.00" ? t(`最高 ${c.limit}`, `up to ${c.limit}`) : ""}</span></li>; })}</ul>}
          {p.beneficiaries && <p className="small">{t("受益人", "Beneficiaries")}: {p.beneficiaries.map((b) => `${b.name} ${b.share}%`).join("、")}</p>}
          {p.items && <p className="small">{t("逐項保", "Listed")}: {p.items.map((x) => `${x.what} ${x.value}`).join("、")}</p>}
        </div>
        {["active", "grace"].includes(p.status) && <div className="row">
          <Link className="btn accent" to={`/claim/new/${p.policy}`}>{t("報理賠", "Make a claim")} <span className="arrow">→</span></Link>
          {!confirmCancel ? <button className="btn ghost" onClick={() => setConfirmCancel(true)}>{t("退保", "Cancel")}</button>
            : <><button className="btn danger" disabled={busy} onClick={() => act("cancel")}>{t("確定退保（沒用到的天數會退款）", "Cancel now (unused days refunded)")}</button><button className="btn ghost" onClick={() => setConfirmCancel(false)}>{t("不要", "Keep it")}</button></>}
        </div>}
        {p.status === "awaiting_payment" && !p.approveUrl && <button className="btn ghost" disabled={busy} onClick={() => act("confirm")}>{t("檢查付款", "Check the payment")}</button>}
      </div>
      <div className="stack">
        <div className="card stack-s"><h3>{t("付款紀錄", "Payments")}</h3>
          <table className="table"><tbody>{p.payments.map((x, i) => <tr key={i}><td>{when(x.at)}</td><td className="num">{x.amount}{x.refunded ? <span className="muted"> ({t("退", "refunded")} {x.refunded})</span> : null}</td><td><span className="mono tiny muted">{x.paypal}</span></td></tr>)}</tbody></table>
          {p.status === "cancelled" && <p className="small">{t(`退保時退款 ${p.refunded}`, `Refunded ${p.refunded} on cancelling`)}</p>}
        </div>
        {claims.length > 0 && <div className="card stack-s"><h3>{t("這張保單的理賠", "Claims on this policy")}</h3>{claims.map((c) => <Link key={c.claim} to={`/claims/${c.claim}`} className="row between" style={{ textDecoration: "none", padding: "6px 0" }}><span>{c.what} <span className="mono tiny muted">{c.number}</span></span><Status s={c.status} /></Link>)}</div>}
      </div>
    </div>
  );
}
