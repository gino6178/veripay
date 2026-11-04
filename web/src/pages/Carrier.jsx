// Cover's back office: the year's numbers by product, the reinsurance, where the risk sits, a typhoon or earthquake
// scenario, rate filings and the regulator's answer, and the year's close (the giveback).
import { useState } from "react";
import { api, useApi, useT, usd, secs } from "../api.jsx";
import { useMe } from "../App.jsx";
import { StaffGate } from "./Desk.jsx";

const NAME = { renters: ["租屋險", "Renters"], home: ["房屋險", "Homeowners"], pet: ["寵物險", "Pet"], life: ["定期壽險", "Term life"], car: ["汽機車險", "Car and scooter"] };
const pct = (x) => (x == null ? "—" : `${Math.round(x * 100)}%`);
export default function Carrier() {
  const t = useT(), { toast } = useMe();
  const { data: causes } = useApi("/api/causes"), cname = (id) => { const c = causes?.find((x) => x.id === id); return c ? t(c.zh, c.en) : id; };
  const dash = useApi("/api/staff/dashboard"), exp = useApi("/api/staff/exposure"), rates = useApi("/api/staff/rates");
  const [sc, setSc] = useState(null), [peril, setPeril] = useState("typhoon"), [strength, setStrength] = useState(1), [rf, setRf] = useState({ product: "home", change: "0.15", why: "" }), [busy, setBusy] = useState(false);
  if (dash.error?.status === 401) return <StaffGate onIn={() => { dash.reload(); exp.reload(); rates.reload(); }} />;
  const d = dash.data;
  const run = async () => setSc(await api(`/api/staff/scenario?peril=${peril}&strength=${strength}`));
  const close = async () => { setBusy(true); try { const g = await api("/api/staff/close-year", { method: "POST" }); toast(t(`年度結算完成：捐出 ${usd(g.reduce((s, x) => s + (x.payout ? x.amount : 0), 0))}`, `Year closed: ${usd(g.reduce((s, x) => s + (x.payout ? x.amount : 0), 0))} given`)); dash.reload(); } catch (e) { toast(e.message); } setBusy(false); };
  return (
    <div className="stack-l">
      <div className="row between"><div><h1>{t("保險公司後台", "Back office")}</h1><p className="muted small">{t(`第 ${d?.year ?? "—"} 年 · 全部從帳本、保單和理賠算出來`, `Year ${d?.year ?? "—"} · all counted from the ledger, policies and claims`)}</p></div><a className="btn ghost sm" href="/api/staff/report">{t("下載監理報表 CSV", "Download the regulator's CSV")}</a></div>
      {d && <div className="stat-row" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))" }}>
        <div className="stat"><b>{usd(d.total.earned)}</b><span>{t("已收保費（扣退費）", "Premiums earned (less refunds)")}</span></div>
        <div className="stat"><b>{usd(d.total.claimsPaid)}</b><span>{t("理賠支出", "Claims paid")}</span></div>
        <div className="stat"><b style={{ color: d.total.lossRatio > 0.8 ? "var(--bad)" : undefined }}>{pct(d.total.lossRatio)}</b><span>{t("損失率（扣再保攤回）", "Loss ratio (net of reinsurance)")}</span></div>
        <div className="stat"><b>{pct(d.total.instantShare)}</b><span>{t("秒賠比例", "Paid instantly")}</span></div>
        <div className="stat"><b>{usd(d.total.fees)}</b><span>{t("Cover 的 20% 費用", "Cover's 20% fee")}</span></div>
      </div>}
      {d && <div className="card scroll-x"><table className="table">
        <thead><tr><th>{t("險種", "Product")}</th><th className="r">{t("有效保單", "In force")}</th><th className="r">{t("保費", "Earned")}</th><th className="r">{t("理賠", "Claims paid")}</th><th className="r">{t("再保攤回", "Recovered")}</th><th style={{ width: 160 }}>{t("損失率", "Loss ratio")}</th><th className="r">{t("件數", "Claims")}</th><th className="r">{t("秒賠", "Instant")}</th><th className="r">{t("轉真人", "Referred")}</th><th className="r">{t("拒賠", "Denied")}</th><th className="r">{t("秒賠中位時間", "Median to pay")}</th></tr></thead>
        <tbody>{d.products.map((r) => <tr key={r.product}><td>{t(...NAME[r.product])}</td><td className="r num">{r.inForce}</td><td className="r num">{usd(r.earned)}</td><td className="r num">{usd(r.claimsPaid)}</td><td className="r num">{usd(r.recoveries)}</td>
          <td>{r.lossRatio == null ? "—" : <div className="row" style={{ gap: 8, flexWrap: "nowrap" }}><div className={`bar ${r.lossRatio > 1 ? "bad" : r.lossRatio > 0.8 ? "warn" : ""}`} style={{ flex: 1 }}><i style={{ width: `${Math.min(100, r.lossRatio * 100)}%` }} /></div><span className="num small">{pct(r.lossRatio)}</span></div>}</td>
          <td className="r num">{r.claims}</td><td className="r num">{r.instant}</td><td className="r num">{r.referred}</td><td className="r num">{r.denied}</td><td className="r num">{secs(r.medianSecondsToPay)}</td></tr>)}</tbody></table>
        <p className="tiny muted" style={{ marginTop: 8 }}>{t(`再保合約：單一理賠 Cover 自留 ${usd(d.treaty.perClaimRetention)}，超過的由再保公司付；單一颱風或地震 Cover 自留 ${usd(d.treaty.catRetention)}，再保最高付 ${usd(d.treaty.catLimit)}。`, `Treaty: Cover keeps the first ${usd(d.treaty.perClaimRetention)} of any claim; for one typhoon or earthquake it keeps ${usd(d.treaty.catRetention)} and the reinsurer pays the rest up to ${usd(d.treaty.catLimit)}.`)}</p>
      </div>}

      <div className="grid-2">
        <div className="card stack">
          <h3>{t("風險集中在哪裡", "Where the risk sits")}</h3>
          <div className="scroll-x"><table className="table"><thead><tr><th>{t("地區", "District")}</th><th className="r">{t("保單", "Policies")}</th><th className="r">{t("保額", "Insured")}</th><th>{t("淹水", "Flood")}</th><th>{t("地震", "Quake")}</th><th>{t("颱風", "Typhoon")}</th></tr></thead>
            <tbody>{(exp.data || []).slice(0, 12).map((e) => <tr key={e.district}><td>{e.district}</td><td className="r num">{e.policies}</td><td className="r num">{usd(e.insured)}</td>{["flood", "quake", "typhoon"].map((k) => <td key={k}><span className={`lv l${e[k]}`}>{e[k]}</span></td>)}</tr>)}</tbody></table></div>
          {exp.data?.length === 0 && <p className="muted small">{t("還沒有有效保單。", "No policies in force yet.")}</p>}
        </div>
        <div className="card stack">
          <h3>{t("如果明天來一個颱風或地震", "If a typhoon or earthquake hit tomorrow")}</h3>
          <div className="chips"><button className={`chip ${peril === "typhoon" ? "on" : ""}`} onClick={() => setPeril("typhoon")}>{t("颱風", "Typhoon")}</button><button className={`chip ${peril === "quake" ? "on" : ""}`} onClick={() => setPeril("quake")}>{t("地震", "Earthquake")}</button></div>
          <label className="field"><span>{t(`強度 ×${strength}`, `Strength ×${strength}`)}</span><input type="range" min="0.5" max="3" step="0.5" value={strength} onChange={(e) => setStrength(+e.target.value)} /></label>
          <button className="btn" onClick={run}>{t("模擬", "Run it")}</button>
          {sc && <div className="stack-s">
            <dl className="kv"><dt>{t("總損失", "Gross loss")}</dt><dd className="num">{usd(sc.gross)}</dd><dt>{t("再保負擔", "Reinsurer pays")}</dt><dd className="num">{usd(sc.ceded)}</dd><dt>{t("Cover 自留", "Cover keeps")}</dt><dd className="num">{usd(sc.net)}</dd>
              <dt>{t("損失率", "Loss ratio")}</dt><dd className="num">{pct(sc.lossRatioNow)} → <b style={{ color: sc.lossRatioAfter > 1 ? "var(--bad)" : undefined }}>{pct(sc.lossRatioAfter)}</b></dd>
              <dt>{t("今年可捐", "Giveback this year")}</dt><dd className="num">{usd(sc.givebackNow)} → <b>{usd(sc.givebackAfter)}</b></dd></dl>
            <p className="tiny muted">{sc.assumption}. {t("這不是巨災模型，是用來看形狀：再保擋掉多少、會吃掉多少公益捐款。", "Not a catastrophe model: it shows the shape, how much the treaty takes and what it does to the giveback.")}</p>
          </div>}
        </div>
      </div>

      <div className="grid-2">
        <div className="card stack">
          <h3>{t("費率申請", "Rate filings")}</h3>
          <p className="small muted">{t("損失率太高就要漲價，但要主管機關核准。Lemonade 在加州就是申請被駁回，只好退出。示範時你扮演主管機關。", "When losses run high the price has to rise, and the regulator must agree. Lemonade's California filing was refused and it had to leave. In the demo, you play the regulator.")}</p>
          <div className="row"><select className="input" style={{ width: 150 }} value={rf.product} onChange={(e) => setRf({ ...rf, product: e.target.value })}>{Object.keys(NAME).map((k) => <option key={k} value={k}>{t(...NAME[k])}</option>)}</select><input className="input" style={{ width: 100 }} type="number" step="0.05" value={rf.change} onChange={(e) => setRf({ ...rf, change: e.target.value })} /><button className="btn ghost" onClick={async () => { const r = await api("/api/staff/rates", { method: "POST", body: { ...rf, change: +rf.change } }).catch((e) => toast(e.message)); if (r?.error) toast(r.message); rates.reload(); }}>{t("送出申請", "File it")}</button></div>
          {(rates.data || []).slice().reverse().map((f) => <div key={f.id} className="row between small"><span>{t(...NAME[f.product])} {f.change > 0 ? "+" : ""}{Math.round(f.change * 100)}% <span className="muted">{f.filed.slice(0, 10)}</span></span>{f.status === "filed" ? <span className="row" style={{ gap: 6 }}><button className="btn sm accent" onClick={async () => { await api(`/api/staff/rates/${f.id}`, { method: "POST", body: { approve: true } }); rates.reload(); }}>{t("核准", "Approve")}</button><button className="btn sm ghost" onClick={async () => { await api(`/api/staff/rates/${f.id}`, { method: "POST", body: { approve: false } }); rates.reload(); }}>{t("駁回", "Refuse")}</button></span> : <span className={`badge ${f.status === "approved" ? "good" : "bad"}`}>{f.status === "approved" ? t("已核准，新報價生效", "approved: new quotes use it") : t("被駁回", "refused")}</span>}</div>)}
        </div>
        <div className="card stack">
          <h3>{t("年度結算", "Close the year")}</h3>
          <p className="small muted">{t("每個公益池先付再保費，剩下的用 PayPal Payouts 捐給那個公益，並記進透明帳本。賠超過收的池子這年就沒有捐款。", "Each cause's pool pays its reinsurance, then what is left is given to the cause with PayPal Payouts and logged. A pool that paid out more than it took in gives nothing this year.")}</p>
          {d && <ul className="why">{d.pools.map((p) => <li key={p.cause}><span>{cname(p.cause)}</span><span className="num" style={{ color: p.balance < 0 ? "var(--bad)" : undefined }}>{usd(p.balance)}</span></li>)}</ul>}
          <button className="btn accent" disabled={busy} onClick={close}>{t("結算今年並捐出", "Close the year and give")}</button>
        </div>
      </div>
    </div>
  );
}
