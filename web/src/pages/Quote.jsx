// Getting covered: talk to Lumi, Cover's advisor, in your own words. Lumi works out the one cover you need most, asks only
// for what the price can't be guessed without, says what it assumed, and shows the price, where the money goes and why
// it costs that (the same quote an agent gets). No questionnaire.
import { useEffect, useRef, useState } from "react";
import { api, Link, navigate, useApi, useT, useLang, cents, usd } from "../api.jsx";
import { useMe } from "../App.jsx";

export default function Quote({ product }) {
  const { lang } = useLang();
  return <Chat key={`${product || "any"}-${lang}`} hint={product} />;
}

function Chat({ hint }) {
  const t = useT(), { lang } = useLang(), { toast } = useMe();
  const { data: products } = useApi(`/api/products?lang=${lang}`);
  const hello = { role: "assistant", content: t("跟我說說你的狀況：最近要去旅行嗎？剛搬家、養了寵物、買了車，還是有人靠你生活？我會挑一個你最需要的保險，直接給你價格。", "Tell me what's going on: a trip coming up? A new place, a pet, a car, someone who depends on you? I'll pick the one cover you need most and give you the price.") };
  const [msgs, setMsgs] = useState([hello]), [state, setState] = useState(hint ? { product: hint, answers: {} } : {}), [text, setText] = useState(""), [busy, setBusy] = useState(false);
  const [q, setQ] = useState(null), [addons, setAddons] = useState([]), [sugg, setSugg] = useState(null);
  const end = useRef(null), t0 = useRef(Date.now());
  useEffect(() => { end.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [msgs, q]);
  const p = products?.find((x) => x.id === (q?.product || state.product));
  // ask Lumi about the conversation so far
  const send = async (words) => {
    const w = String(words ?? text).trim(); if (!w || busy) return;
    const next = [...msgs, { role: "user", content: w }]; setMsgs(next); setText(""); setBusy(true);
    try {
      const r = await api("/api/advisor", { method: "POST", body: { messages: next.filter((m) => m !== hello), state, lang } });
      setMsgs((m) => [...m, { role: "assistant", content: r.reply, via: r.via }]); setState(r.state || {}); setSugg(r.suggestions || null);
      if (r.quote) { setQ(r.quote); setAddons(r.quote.addons || []); } else setQ(null);
    } catch (e) { toast(e.message); }
    setBusy(false);
  };
  const reprice = async (adds) => { setBusy(true); try { setQ(await api("/api/quote", { method: "POST", body: { product: state.product, answers: state.answers, addons: adds, lang } })); } catch (e) { toast(e.message); } setBusy(false); };
  // the judge tour's "fill this for me": a whole set of answers for one product, priced at once
  useEffect(() => { const f = async (e) => { if (!e.detail?.answers) return; const prod = e.detail.product || state.product || hint; const st = { product: prod, answers: e.detail.answers }; setState(st); setAddons(e.detail.addons || []);
    try { setQ(await api("/api/quote", { method: "POST", body: { product: prod, answers: e.detail.answers, addons: e.detail.addons || [], lang } })); } catch (err) { toast(err.message); } }; addEventListener("cover:fill-quote", f); return () => removeEventListener("cover:fill-quote", f); }, [state.product]);
  const starters = sugg || t(["我和伴侶 12/20 搭 UA837 飛東京，12/30 搭 UA838 回來", "我在 Austin, TX 78704 租房子，東西大概 $9,000", "我剛領養一隻 2 歲的狗"], ["My partner and I fly UA837 to Tokyo on Dec 20, back on UA838 Dec 30", "I rent in Austin, TX 78704, about $9,000 of stuff", "I just adopted a 2-year-old dog"]);
  return (
    <div className="chat stack">
      <div className="page-head" style={{ marginBottom: 24 }}><div><h1>{t("跟 Lumi 聊聊", "Talk to Lumi")}</h1><p className="muted small">{t("用你自己的話說。Lumi 會挑一個你最需要的保險；條款和價格都由程式計算。", "In your own words. Lumi picks the one cover you need most; the clauses and the price are worked out by code.")}</p></div></div>
      <div className="msgs">
        {msgs.map((m, i) => m.role === "user" ? <div key={i} className="msg me">{m.content}</div> : <div key={i} className="msg bot"><span className="who">Lumi{m.via ? ` · ${m.via === "rules" ? t("規則", "rules") : t("模型＋規則", "model + rules")}` : ""}</span>{m.content}</div>)}
        {busy && <div className="msg bot"><span className="who">Lumi</span>{t("想一下…", "Thinking…")}</div>}
      </div>
      {!q && msgs.length <= 2 && <div className="chips">{starters.map((s) => <button key={s} className="chip" onClick={() => send(s)}>{s}</button>)}</div>}
      {q && !q.error && p && <Result p={p} q={q} answers={state.answers} addons={addons} seconds={Math.round((Date.now() - t0.current) / 1000)} busy={busy}
        toggle={(a) => { const n = addons.includes(a) ? addons.filter((x) => x !== a) : [...addons, a]; setAddons(n); reprice(n); }} />}
      <div className="composer"><form className="card row" onSubmit={(e) => { e.preventDefault(); send(); }}>
        <input className="input" style={{ flex: 1, minWidth: 200 }} autoFocus value={text} onChange={(e) => setText(e.target.value)} placeholder={q ? t("要改什麼就直接說，例如「我們其實是 3 個人」", "Change anything in words, e.g. \"there are actually 3 of us\"") : t("例如：下個月要飛東京", "e.g. flying to Tokyo next month")} />
        <button className="btn accent" disabled={busy || !text.trim()}>{t("送出", "Send")}</button>
      </form></div>
      <details><summary>{t("或直接看所有保險", "Or browse every kind of cover")}</summary>
        <ol className="partlist" style={{ marginTop: 12 }}>{(products || []).map((x) => <li key={x.id} style={{ gridTemplateColumns: "1fr auto" }}><span><b>{x.name}</b> <span className="muted small">{x.for}</span></span><button className="btn sm" onClick={() => send(t(`我想要${x.name}`, `I'd like ${x.name.toLowerCase()} cover`))}>{t("問 Lumi", "Ask Lumi")}</button></li>)}</ol>
      </details>
      <div ref={end} />
    </div>
  );
}

// units in the reader's language, whichever language the product file wrote them in
const UNIT = { 年: ["年", "years"], years: ["年", "years"], 歲: ["歲", "years old"], 坪: ["坪", "ping"], "sq ft": ["平方英尺", "sq ft"], miles: ["英里", "miles"] };
const unitName = (t, u) => (UNIT[u] ? t(...UNIT[u]) : u);
const FACTOR = { base: ["起始價", "Starting price"], rate: ["核准的費率調整", "Approved rate change"], "zone.flood": ["淹水風險", "Flood level"], "zone.wildfire": ["野火風險", "Wildfire level"], "zone.hurricane": ["颶風風險", "Hurricane level"], "zone.quake": ["地震風險", "Earthquake level"], "zone.theft": ["竊盜率", "Theft level"] };
// the place's five hazard levels, each with its name (1 low, 3 high)
const PERILS = [["flood", "淹水", "flood"], ["wildfire", "野火", "wildfire"], ["hurricane", "颶風", "hurricane"], ["quake", "地震", "quake"], ["theft", "竊盜", "theft"]];
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
          <div><p className="eyebrow">{p.name}</p>{q.trip ? <><div className="price">{q.trip}<small>{t("/ 這趟", "for the trip")}</small></div><p className="small muted">{(q.flights || []).map((f) => `${f.flight} ${f.date}`).join(" · ")}</p></>
            : <><div className="price">{q.monthly}<small>{t("/ 月", "/ month")}</small></div><p className="small muted">{t(`或 ${q.annual} / 年`, `or ${q.annual} a year`)}</p></>}</div>
          {q.zone && <div className="small" style={{ textAlign: "right" }}><b>{q.zone.area || q.zone.state}</b><div className="row" style={{ justifyContent: "flex-end", gap: 10, marginTop: 6 }}>{PERILS.filter(([k]) => q.zone[k] != null).map(([k, zh, en]) => <span key={k} title={t(...FACTOR[`zone.${k}`])} style={{ display: "grid", justifyItems: "center", gap: 4 }}><span className={`lv l${q.zone[k]}`}>{q.zone[k]}</span><span className="data" style={{ fontSize: 10 }}>{t(zh, en)}</span></span>)}</div></div>}
        </div>
        <div className="stack-s">
          <div className="split"><i className="pool" style={{ width: `${pct(w.claimsPool)}%` }} /><i className="re" style={{ width: `${pct(w.reinsurance)}%` }} /><i className="fee" style={{ width: `${pct(w.coverFee)}%` }} /></div>
          <div className="legend"><span><i className="pool" style={{ background: "repeating-linear-gradient(135deg, var(--signal) 0 2px, transparent 2px 5px)" }} />{t("理賠池", "Claims pool")} {w.claimsPool}</span><span><i style={{ background: "oklch(1 0 0 / 0.1)" }} />{t("再保險", "Reinsurance")} {w.reinsurance}</span><span><i style={{ background: "oklch(1 0 0 / 0.2)" }} />{t("Cover 費用 20%", "Cover's 20% fee")} {w.coverFee}</span></div>
          <p className="tiny muted">{q.trip ? t(`這趟預期理賠 ${w.ofWhichExpectedClaims}。理賠池沒用完的錢年底捐給你選的公益。`, `Expected claims ${w.ofWhichExpectedClaims} for this trip. What the pool doesn't pay out goes to your cause at the end of the year.`)
            : t(`預期理賠 ${w.ofWhichExpectedClaims} / 年。理賠池沒用完的錢年底捐給你選的公益。`, `Expected claims ${w.ofWhichExpectedClaims} a year. What the pool doesn't pay out goes to your cause at the end of the year.`)}</p>
        </div>
        <details><summary className="small" style={{ cursor: "pointer" }}>{t("為什麼是這個價格", "Why it costs this")} <span className="muted">({q.priced === "product factors" ? t("依產品因子", "product factors") : q.priced})</span></summary>
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
  const { data: causeList } = useApi("/api/causes");
  const [plan, setPlan] = useState("monthly"), [billing, setBilling] = useState("vault"), [causes, setCauses] = useState(() => me?.causes || (me?.cause ? { [me.cause]: 100 } : { disaster: 100 })), [busy, setBusy] = useState(false);
  const [bens, setBens] = useState([{ name: "", relation: "", share: 100 }]), [items, setItems] = useState([{ what: "", value: "" }]);
  const life = p.id === "life", listing = addons.includes("valuables"), trip = !!q.trip;
  const benOk = !life || (bens.every((b) => b.name.trim()) && bens.reduce((s, b) => s + (+b.share || 0), 0) === 100);
  const { info } = useMe();
  const buy = async (pay = "paypal") => {
    setBusy(true);
    try {
      const r = await api("/api/policies", { method: "POST", body: { quote: q.quote, plan, billing, causes, pay, ...(life ? { beneficiaries: bens.map((b) => ({ ...b, share: +b.share })) } : {}), ...(listing ? { items: items.filter((x) => x.what && +x.value > 0).map((x) => ({ what: x.what, value: +x.value })) } : {}) } });
      if (r.error) throw new Error(r.message);
      // the mock's approval page is Cover's own; with the sandbox, the policy page shows PayPal's buttons
      if (r.approveUrl && info?.paypal === "mock") location.href = r.approveUrl; else navigate(`/policies/${r.policy}`);
    } catch (e) { toast(e.message); setBusy(false); }
  };
  return (
    <div className="card stack">
      <h3>{t("購買", "Buy")}</h3>
      {/* a trip is paid once; a year's cover monthly or yearly */}
      {!trip && <div className="chips">
        <button className={`chip ${plan === "monthly" ? "on" : ""}`} onClick={() => setPlan("monthly")}>{t(`月繳 ${q.monthly}`, `Monthly ${q.monthly}`)}</button>
        <button className={`chip ${plan === "yearly" ? "on" : ""}`} onClick={() => setPlan("yearly")}>{t(`年繳 ${q.annual}`, `Yearly ${q.annual}`)}</button>
      </div>}
      {!trip && plan === "monthly" && <div className="chips">
        <button className={`chip ${billing === "vault" ? "on" : ""}`} onClick={() => setBilling("vault")}>{t("存好 PayPal，Cover 每月扣款", "Save PayPal; Cover charges monthly")}</button>
        <button className={`chip ${billing === "subscription" ? "on" : ""}`} onClick={() => setBilling("subscription")}>{t("PayPal 訂閱（PayPal 每月扣）", "PayPal subscription (PayPal bills monthly)")}</button>
      </div>}
      <div className="stack-s"><p className="small" style={{ fontWeight: 500 }}>{t("年底理賠池剩下的錢，要捐給（可以選好幾個）：", "At the end of the year, what's left of the pool goes to (pick one or several):")}</p>
        <CausePicker list={causeList} value={causes} onChange={setCauses} />
      </div>
      {life && <div className="stack-s"><p className="small" style={{ fontWeight: 500 }}>{t("受益人（比例合計 100%）", "Beneficiaries (shares add up to 100%)")}</p>
        {bens.map((b, i) => <div key={i} className="row"><input className="input" style={{ flex: 2, minWidth: 120 }} placeholder={t("姓名", "Name")} value={b.name} onChange={(e) => setBens(bens.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} /><input className="input" style={{ flex: 1, minWidth: 90 }} placeholder={t("關係", "Relation")} value={b.relation} onChange={(e) => setBens(bens.map((x, j) => (j === i ? { ...x, relation: e.target.value } : x)))} /><input className="input" style={{ width: 90 }} type="number" value={b.share} onChange={(e) => setBens(bens.map((x, j) => (j === i ? { ...x, share: e.target.value } : x)))} /><span>%</span></div>)}
        <button className="link small" onClick={() => setBens([...bens, { name: "", relation: "", share: 0 }])}>{t("+ 再加一位", "+ Add another")}</button>
      </div>}
      {listing && <div className="stack-s"><p className="small" style={{ fontWeight: 500 }}>{t("逐項列出貴重物品", "List your valuables")}</p>
        {items.map((x, i) => <div key={i} className="row"><input className="input" style={{ flex: 2 }} placeholder={t("物品（例如 Sony A7 相機）", "Item (e.g. Sony A7 camera)")} value={x.what} onChange={(e) => setItems(items.map((y, j) => (j === i ? { ...y, what: e.target.value } : y)))} /><input className="input" style={{ width: 130 }} type="number" placeholder="USD" value={x.value} onChange={(e) => setItems(items.map((y, j) => (j === i ? { ...y, value: e.target.value } : y)))} /></div>)}
        <button className="link small" onClick={() => setItems([...items, { what: "", value: "" }])}>{t("+ 再加一項", "+ Add another")}</button>
      </div>}
      {q.decision === "review" && <div className="note warn">{t("Cover 的核保人員會先看過，才能開始。", q.note)}</div>}
      {info?.testCard && q.decision !== "review" && <button className="btn" data-tour="pay-card" disabled={busy || !benOk} onClick={() => buy("card")}>{t("用 PayPal 沙盒測試卡付款（評審不用登入）", "Pay with PayPal's sandbox test card (no sign-in, for judges)")}</button>}
      <button className="btn paypal" data-tour="pay-paypal" disabled={busy || !benOk} onClick={() => buy("paypal")}>{q.decision === "review" ? t("送出核保", "Send for review") : trip ? t(`用 PayPal 付這趟 ${q.trip}`, `Pay for the trip with PayPal: ${q.trip}`) : t(`用 PayPal 付第一期 ${plan === "monthly" ? q.monthly : q.annual}`, `Pay the first premium with PayPal: ${plan === "monthly" ? q.monthly : q.annual}`)}</button>
      <p className="tiny muted">{trip ? t("班機延誤或取消時，Cover 從航班狀態看到就自動付款，不用申請。第一班起飛前取消，全額退款。", "If a flight is delayed or cancelled, Cover sees it in the flight status and pays automatically, with no claim to file. Cancel before the first flight for a full refund.")
        : t("第一次付款時 PayPal 會同時存好你的付款方式，之後的月繳就不用再跳轉。隨時可以退保，沒用到的天數全額退回。", "Your first payment also saves PayPal for the monthly premiums, so there's no redirect next time. Cancel any time and the unused days are refunded.")}</p>
    </div>
  );
}

// One cause or several: pick as many as you like; the shares start even and can be set (they always add up to 100,
// the last one picked takes what the others leave). At the year's close all of them are paid in one PayPal batch.
export function CausePicker({ list, value, onChange }) {
  const t = useT(), { lang } = useLang(), ids = Object.keys(value);
  const even = (keys) => { const n = keys.length, base = Math.floor(100 / n); return Object.fromEntries(keys.map((k, i) => [k, i === n - 1 ? 100 - base * (n - 1) : base])); };
  const toggle = (id) => { const keys = ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]; if (keys.length) onChange(even(keys)); };
  const setShare = (id, v) => { const n = Math.max(0, Math.min(100, Math.round(+v || 0))), others = ids.filter((x) => x !== id), rest = 100 - n;
    const per = others.length ? Math.floor(rest / others.length) : 0; onChange(Object.fromEntries([[id, others.length ? n : 100], ...others.map((k, i) => [k, i === others.length - 1 ? rest - per * (others.length - 1) : per])])); };
  return (
    <div className="stack-s">
      <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 200px), 1fr))", gap: 8 }}>{(list || []).map((c) => <button key={c.id} type="button" aria-pressed={ids.includes(c.id)} className={`cause ${ids.includes(c.id) ? "on" : ""}`} onClick={() => toggle(c.id)}>{lang === "zh" ? c.zh : c.en}</button>)}</div>
      {ids.length > 1 && <ul className="spec">{ids.map((id) => { const c = (list || []).find((x) => x.id === id); return <li key={id}><span className="lead">{c ? (lang === "zh" ? c.zh : c.en) : id}</span><input className="input" style={{ width: 84, minHeight: 34, padding: "4px 8px" }} type="number" min="0" max="100" value={value[id]} onChange={(e) => setShare(id, e.target.value)} aria-label={t(`${c?.zh} 的比例`, `share for ${c?.en}`)} /><span className="val">%</span></li>; })}</ul>}
      {ids.length > 1 && <p className="tiny muted">{t("每一筆保費都按這個比例分進各公益的池子；年底一次用 PayPal Payouts 全部捐出。", "Every premium is split across these causes' pools in these shares; at the year's end they are all paid in one PayPal Payouts batch.")}</p>}
    </div>
  );
}
