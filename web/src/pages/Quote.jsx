// Getting covered: Lumi, Cover's assistant, asks the product's own questions one at a time (the same questions an
// agent gets from list_products), then shows the price, where the money goes and why it costs that, and buys it.
import { useEffect, useMemo, useRef, useState } from "react";
import { api, Link, navigate, useApi, useT, useLang, cents, usd } from "../api.jsx";
import { useMe } from "../App.jsx";
import Icon from "../components/Icon.jsx";

export default function Quote({ product }) {
  const t = useT(), { lang } = useLang();
  const { data: products } = useApi(`/api/products?lang=${lang}`);
  if (!product) return (
    <div>
      <div className="page-head"><div><h1>{t("保什麼", "Cover what")}</h1><p className="lede">{t("選一種。Lumi 照那張保單的條款問你幾個問題，大約 90 秒。", "Pick one. Lumi asks the questions that policy needs: about 90 seconds.")}</p></div></div>
      <ol className="partlist">{(products || []).map((p, i) => <li key={p.id} style={{ gridTemplateColumns: "56px 1fr auto" }}><span className="big" style={{ fontSize: 40, color: "var(--signal)" }}>{String(i + 1).padStart(2, "0")}</span><Link to={`/quote/${p.id}`} style={{ textDecoration: "none" }}><b style={{ fontSize: 20 }}>{p.name}</b><span className="muted" style={{ display: "block", marginTop: 4 }}>{p.for}</span></Link><Link to={`/quote/${p.id}`} className="btn sm">{t(`${p.questions.length} 題`, `${p.questions.length} questions`)} →</Link></li>)}</ol>
    </div>
  );
  return <Conversation key={`${product}-${lang}`} id={product} />;
}

function Conversation({ id }) {
  const t = useT(), { lang } = useLang(), { toast } = useMe();
  const { data: p } = useApi(`/api/products/${id}?lang=${lang}`);
  const [answers, setAnswers] = useState({}), [step, setStep] = useState(0), [addons, setAddons] = useState([]), [q, setQ] = useState(null), [busy, setBusy] = useState(false);
  const t0 = useRef(Date.now()), end = useRef(null);
  const qs = p?.questions || [], done = p && step >= qs.length;
  useEffect(() => { end.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [step, q]);
  const price = async (adds = addons) => { setBusy(true); try { setQ(await api("/api/quote", { method: "POST", body: { product: id, answers, addons: adds, lang } })); } catch (e) { toast(e.body?.bad?.join("; ") || e.message); } setBusy(false); };
  useEffect(() => { if (done && !q) price(); }, [done]);
  if (!p) return null;
  const answer = (v) => { setAnswers((a) => ({ ...a, [qs[step].id]: v })); setStep(step + 1); setQ(null); };
  const shown = (qq, v) => qq.options ? qq.options.find((o) => o.value === String(v))?.label : qq.type === "bool" ? (v ? t("是", "Yes") : t("否", "No")) : `${v}${qq.unit ? ` ${qq.unit}` : ""}`;
  return (
    <div className="chat stack">
      <div className="page-head" style={{ marginBottom: 24 }}><div><h1>{p.name}</h1><p className="muted small">{p.for}</p></div><Link to="/quote" className="btn sm">{t("換一種", "Change")}</Link></div>
      <div className="msgs">
        <div className="msg bot"><span className="who">Lumi</span>{t(`嗨！我是 Lumi。我會照 Cover ${p.name}的條款問你 ${qs.length} 個問題，答案由程式檢查，價格怎麼算的會全部攤開給你看。`, `Hi, I'm Lumi. I'll ask you the ${qs.length} questions Cover's ${p.name.toLowerCase()} policy needs. Code checks the answers, and you'll see exactly how the price is worked out.`)}</div>
        {qs.slice(0, step).map((qq, i) => (
          <div key={qq.id} style={{ display: "contents" }}>
            <div className="msg bot"><span className="who">Lumi</span>{qq.ask}</div>
            <button className="msg me" style={{ border: 0, cursor: "pointer", textAlign: "right" }} onClick={() => { setStep(i); setQ(null); }} title={t("修改", "Change")}>{shown(qq, answers[qq.id])}</button>
          </div>
        ))}
        {!done && <div className="msg bot"><span className="who">Lumi · {step + 1}/{qs.length}</span>{qs[step].ask}</div>}
        {done && !q && <div className="msg bot"><span className="who">Lumi</span>{t("算價格中…", "Working out your price…")}</div>}
      </div>
      {!done && <div className="composer"><div className="card"><Answer q={qs[step]} value={answers[qs[step].id]} onAnswer={answer} /></div></div>}
      {q && !q.error && <Result p={p} q={q} answers={answers} addons={addons} seconds={Math.round((Date.now() - t0.current) / 1000)} busy={busy}
        toggle={(a) => { const next = addons.includes(a) ? addons.filter((x) => x !== a) : [...addons, a]; setAddons(next); price(next); }} />}
      <div ref={end} />
    </div>
  );
}

function Answer({ q, value, onAnswer }) {
  const t = useT(), [v, setV] = useState(value ?? "");
  useEffect(() => setV(value ?? ""), [q.id]);
  if (q.options) return <div className="chips">{q.options.map((o) => <button key={o.value} className={`chip ${String(value) === o.value ? "on" : ""}`} onClick={() => onAnswer(o.value)}>{o.label}</button>)}</div>;
  if (q.type === "bool") return <div className="chips"><button className="chip" onClick={() => onAnswer(true)}>{t("是", "Yes")}</button><button className="chip" onClick={() => onAnswer(false)}>{t("否", "No")}</button></div>;
  const num = q.type === "number", ok = num ? v !== "" && +v >= q.min && +v <= q.max : String(v).trim().length > 0;
  return (
    <form className="row" onSubmit={(e) => { e.preventDefault(); if (ok) onAnswer(num ? +v : String(v).trim()); }}>
      <input className="input" style={{ flex: 1, minWidth: 160 }} autoFocus value={v} onChange={(e) => setV(e.target.value)} inputMode={num ? "decimal" : undefined} type={num ? "number" : "text"} min={q.min} max={q.max}
        placeholder={num ? `${q.min}–${q.max}${q.unit ? ` ${q.unit}` : ""}` : q.type === "place" ? t("例如：台北市大安區、捷運公館站", "e.g. Taipei Da'an, or a station") : ""} />
      <button className="btn" disabled={!ok}>{t("下一題", "Next")}</button>
    </form>
  );
}

const FACTOR = { base: ["起始價", "Starting price"], rate: ["核准的費率調整", "Approved rate change"], "zone.flood": ["淹水潛勢", "Flood level"], "zone.quake": ["地震風險", "Earthquake level"], "zone.typhoon": ["颱風", "Typhoon level"], "zone.theft": ["竊盜率", "Theft level"] };
function Result({ p, q, answers, addons, toggle, seconds, busy }) {
  const t = useT(), { me } = useMe();
  const w = q.whereYourMoneyGoes, total = cents(q.annual) || 1;
  const pct = (s) => Math.round((cents(s) / total) * 100);
  const label = (f) => FACTOR[f] ? t(...FACTOR[f]) : p.questions.find((x) => x.id === f)?.ask.replace(/[？?].*$/, "") || f;
  if (q.decision === "refer") return <div className="note warn">{q.why}. {t("這張保單需要由 Cover 的核保人員處理，無法線上購買。", "This needs Cover's underwriting desk; it can't be bought online.")}</div>;
  return (
    <div className="stack">
      <div className="msg bot"><span className="who">Lumi</span>{t(`好了，花了 ${seconds} 秒。這是你的價格，每一塊錢去哪裡都寫在下面。`, `Done in ${seconds} seconds. Here's your price, and where every dollar goes.`)}</div>
      <div className="card marks stack">
        <div className="row between" style={{ alignItems: "flex-end" }}>
          <div><p className="eyebrow">{p.name}</p><div className="price">{q.monthly}<small>{t("/ 月", "/ month")}</small></div><p className="small muted">{t(`或 ${q.annual} / 年`, `or ${q.annual} a year`)}</p></div>
          {q.zone && <div className="small" style={{ textAlign: "right" }}><b>{q.zone.district}</b><div className="row" style={{ justifyContent: "flex-end", gap: 4, marginTop: 4 }}>{["flood", "quake", "typhoon", "theft"].map((k) => <span key={k} title={t(...FACTOR[`zone.${k}`])} className={`lv l${q.zone[k]}`}>{q.zone[k]}</span>)}</div><p className="tiny muted">{t("淹水 · 地震 · 颱風 · 竊盜", "flood · quake · typhoon · theft")}</p></div>}
        </div>
        <div className="stack-s">
          <div className="split"><i className="pool" style={{ width: `${pct(w.claimsPool)}%` }} /><i className="re" style={{ width: `${pct(w.reinsurance)}%` }} /><i className="fee" style={{ width: `${pct(w.coverFee)}%` }} /></div>
          <div className="legend"><span><i className="pool" style={{ background: "repeating-linear-gradient(135deg, var(--signal) 0 2px, transparent 2px 5px)" }} />{t("理賠池", "Claims pool")} {w.claimsPool}</span><span><i style={{ background: "oklch(1 0 0 / 0.1)" }} />{t("再保險", "Reinsurance")} {w.reinsurance}</span><span><i style={{ background: "oklch(1 0 0 / 0.2)" }} />{t("Cover 費用 20%", "Cover's 20% fee")} {w.coverFee}</span></div>
          <p className="tiny muted">{t(`預期理賠 ${w.ofWhichExpectedClaims} / 年。理賠池沒用完的錢年底捐給你選的公益。`, `Expected claims ${w.ofWhichExpectedClaims} a year. What the pool doesn't pay out goes to your cause at the end of the year.`)}</p>
        </div>
        <details><summary className="small" style={{ cursor: "pointer" }}>{t("為什麼是這個價格", "Why it costs this")} <span className="muted">({q.priced})</span></summary>
          <ul className="why" style={{ marginTop: 8 }}>{q.why.map((x, i) => <li key={i}><span>{label(x.factor)}{x.value != null && x.factor !== "base" ? <span className="muted"> · {String(x.value)}</span> : null}</span><span className="num">{x.effect || `×${x.times}`}</span></li>)}</ul>
        </details>
        <div><p className="small" style={{ fontWeight: 500, marginBottom: 6 }}>{t("保障內容", "What it covers")}</p>
          <ul className="why">{q.covers.map((c) => <li key={c.id}><span>{c.what} <span className="mono muted">{c.clause}</span></span><span className="num">{c.limit ? t(`最高 ${c.limit}`, `up to ${c.limit}`) : ""}</span></li>)}</ul>
          {q.deductible && <p className="tiny muted" style={{ marginTop: 6 }}>{t(`自負額 ${q.deductible}`, `Deductible ${q.deductible}`)}</p>}
        </div>
        {p.addons.length > 0 && <div className="stack-s"><p className="small" style={{ fontWeight: 500 }}>{t("加購", "Add-ons")}</p><div className="chips">{p.addons.map((a) => <button key={a.id} className={`chip ${addons.includes(a.id) ? "on" : ""}`} disabled={busy} onClick={() => toggle(a.id)}>{addons.includes(a.id) ? "✓ " : "+ "}{a.what}</button>)}</div></div>}
      </div>
      {me ? <Buy p={p} q={q} addons={addons} answers={answers} /> : <div className="card row between"><span>{t("登入後就能購買這份報價（30 天內有效）。", "Sign in to buy this quote (valid 30 days).")}</span><Link className="btn accent" to={`/signin?next=${encodeURIComponent(location.pathname)}`}>{t("登入", "Sign in")}</Link></div>}
    </div>
  );
}

function Buy({ p, q, addons, answers }) {
  const t = useT(), { lang } = useLang(), { toast, me } = useMe();
  const { data: causes } = useApi("/api/causes");
  const [plan, setPlan] = useState("monthly"), [billing, setBilling] = useState("vault"), [cause, setCause] = useState(me?.cause || "disaster"), [busy, setBusy] = useState(false);
  const [bens, setBens] = useState([{ name: "", relation: "", share: 100 }]), [items, setItems] = useState([{ what: "", value: "" }]);
  const life = p.id === "life", listing = addons.includes("valuables");
  const benOk = !life || (bens.every((b) => b.name.trim()) && bens.reduce((s, b) => s + (+b.share || 0), 0) === 100);
  const buy = async () => {
    setBusy(true);
    try {
      const r = await api("/api/policies", { method: "POST", body: { quote: q.quote, plan, billing, cause, ...(life ? { beneficiaries: bens.map((b) => ({ ...b, share: +b.share })) } : {}), ...(listing ? { items: items.filter((x) => x.what && +x.value > 0).map((x) => ({ what: x.what, value: +x.value })) } : {}) } });
      if (r.error) throw new Error(r.message);
      if (r.approveUrl) location.href = r.approveUrl; else navigate(`/policies/${r.policy}`);
    } catch (e) { toast(e.message); setBusy(false); }
  };
  return (
    <div className="card stack">
      <h3>{t("購買", "Buy")}</h3>
      <div className="chips">
        <button className={`chip ${plan === "monthly" ? "on" : ""}`} onClick={() => setPlan("monthly")}>{t(`月繳 ${q.monthly}`, `Monthly ${q.monthly}`)}</button>
        <button className={`chip ${plan === "yearly" ? "on" : ""}`} onClick={() => setPlan("yearly")}>{t(`年繳 ${q.annual}`, `Yearly ${q.annual}`)}</button>
      </div>
      {plan === "monthly" && <div className="chips">
        <button className={`chip ${billing === "vault" ? "on" : ""}`} onClick={() => setBilling("vault")}>{t("存好 PayPal，Cover 每月扣款", "Save PayPal; Cover charges monthly")}</button>
        <button className={`chip ${billing === "subscription" ? "on" : ""}`} onClick={() => setBilling("subscription")}>{t("PayPal 訂閱（PayPal 每月扣）", "PayPal subscription (PayPal bills monthly)")}</button>
      </div>}
      <div className="stack-s"><p className="small" style={{ fontWeight: 500 }}>{t("年底理賠池剩下的錢，要捐給：", "At the end of the year, what's left of the pool goes to:")}</p>
        <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 200px), 1fr))", gap: 8 }}>{(causes || []).map((c) => <button key={c.id} className={`cause ${cause === c.id ? "on" : ""}`} onClick={() => setCause(c.id)}>{lang === "en" ? c.en : c.zh}</button>)}</div>
      </div>
      {life && <div className="stack-s"><p className="small" style={{ fontWeight: 500 }}>{t("受益人（比例合計 100%）", "Beneficiaries (shares add up to 100%)")}</p>
        {bens.map((b, i) => <div key={i} className="row"><input className="input" style={{ flex: 2, minWidth: 120 }} placeholder={t("姓名", "Name")} value={b.name} onChange={(e) => setBens(bens.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} /><input className="input" style={{ flex: 1, minWidth: 90 }} placeholder={t("關係", "Relation")} value={b.relation} onChange={(e) => setBens(bens.map((x, j) => (j === i ? { ...x, relation: e.target.value } : x)))} /><input className="input" style={{ width: 90 }} type="number" value={b.share} onChange={(e) => setBens(bens.map((x, j) => (j === i ? { ...x, share: e.target.value } : x)))} /><span>%</span></div>)}
        <button className="link small" onClick={() => setBens([...bens, { name: "", relation: "", share: 0 }])}>{t("+ 再加一位", "+ Add another")}</button>
      </div>}
      {listing && <div className="stack-s"><p className="small" style={{ fontWeight: 500 }}>{t("逐項列出貴重物品", "List your valuables")}</p>
        {items.map((x, i) => <div key={i} className="row"><input className="input" style={{ flex: 2 }} placeholder={t("物品（例如 Sony A7 相機）", "Item (e.g. Sony A7 camera)")} value={x.what} onChange={(e) => setItems(items.map((y, j) => (j === i ? { ...y, what: e.target.value } : y)))} /><input className="input" style={{ width: 130 }} type="number" placeholder="USD" value={x.value} onChange={(e) => setItems(items.map((y, j) => (j === i ? { ...y, value: e.target.value } : y)))} /></div>)}
        <button className="link small" onClick={() => setItems([...items, { what: "", value: "" }])}>{t("+ 再加一項", "+ Add another")}</button>
      </div>}
      {q.decision === "review" && <div className="note warn">{q.note}</div>}
      <button className="btn paypal" disabled={busy || !benOk} onClick={buy}>{q.decision === "review" ? t("送出核保", "Send for review") : t(`用 PayPal 付第一期 ${plan === "monthly" ? q.monthly : q.annual}`, `Pay the first premium with PayPal: ${plan === "monthly" ? q.monthly : q.annual}`)}</button>
      <p className="tiny muted">{t("第一次付款時 PayPal 會同時存好你的付款方式，之後的月繳就不用再跳轉。隨時可以退保，沒用到的天數全額退回。", "Your first payment also saves PayPal for the monthly premiums, so there's no redirect next time. Cancel any time and the unused days are refunded.")}</p>
    </div>
  );
}
