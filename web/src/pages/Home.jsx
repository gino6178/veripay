// The front page, drawn as an instrument: a real claim running its checks, the premium measured into its parts, each
// product as a numbered parts list, the claim as a three-step sequence, the agent's connection and the live ledger.
// Every number on it is counted by the server (stats, transparency); a stand-in is labelled as one.
import { useEffect, useRef, useState } from "react";
import { Link, useApi, useT, useLang, usd } from "../api.jsx";

export function useReveal() {
  const ref = useRef(null);
  useEffect(() => {
    const root = ref.current;
    if (!root || matchMedia("(prefers-reduced-motion: reduce)").matches || !("IntersectionObserver" in window)) return;
    const els = [...root.querySelectorAll(".reveal")].filter((el) => el.getBoundingClientRect().top > innerHeight);
    els.forEach((el) => el.classList.add("pre"));
    const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } }), { rootMargin: "0px 0px -12% 0px" });
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);
  return ref;
}

const CHECKS = { in_force: ["保單當時有效", "Policy in force"], waiting: ["等待期已過", "Waiting period over"], covered: ["有這項保障", "Covered"], reported: ["在申請時限內", "Reported in time"], police_24h: ["24 小時內報案", "Police within 24 h"], documents_read: ["文件已判讀", "Documents read"] };
const SAMPLE = { what: { zh: "手機或筆電摔壞、進水", en: "A phone or laptop dropped or wet" }, amount: 7000, seconds: 11, checks: [{ id: "in_force", clause: "RT-6.1" }, { id: "waiting", clause: "RT-3.4" }, { id: "covered", clause: "RT-5.2" }, { id: "reported", clause: "RT-4.1" }, { id: "documents_read", clause: null }], payout: null, sample: true };

function Instrument({ claim }) {
  const t = useT(), { lang } = useLang(), c = claim || SAMPLE;
  const total = c.checks.length + 1, still = typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  // one value drives the whole run: 0 to 1 while the checks go by, then it holds at 1 with the payout shown, then restarts
  const [p, setP] = useState(still ? 1 : 0);
  useEffect(() => {
    if (still) return;
    let raf, start = performance.now(), off = false;
    const run = 4200, hold = 4200;
    const frame = (now) => { if (off) return; const e = (now - start) % (run + hold); setP(Math.min(1, e / run)); raf = requestAnimationFrame(frame); };
    raf = requestAnimationFrame(frame);
    return () => { off = true; cancelAnimationFrame(raf); };
  }, [still]);
  const k = p >= 1 ? total : Math.floor(p * total), ms = Math.round(p * c.seconds * 1000);
  const done = k >= total;
  return (
    <div className="instrument marks" role="img" aria-label={t(`一件理賠：${c.checks.length} 項檢查全部通過，${c.seconds} 秒後用 PayPal 付了 ${usd(c.amount)}`, `A claim: ${c.checks.length} checks passed, ${usd(c.amount)} paid with PayPal ${c.seconds} seconds after it was filed`)}>
      <header><span className="live"><i />{c.sample ? t("示意 · 依 Cover 的規則", "ILLUSTRATION · COVER'S RULES") : t("最近一件秒賠 · 真實紀錄", "LATEST INSTANT CLAIM · REAL RECORD")}</span><span>{c.what[lang]}</span></header>
      <div className="clock"><b>{(ms / 1000).toFixed(1)}<small style={{ fontSize: ".45em", marginLeft: 6 }}>s</small></b><span>{t("從送出理賠", "since the claim")}<br />{t("到 PayPal 入帳", "to the PayPal payout")}</span></div>
      <ol>{c.checks.map((x, i) => <li key={x.id} className={i < k ? "on" : i === k ? "now" : ""}><span className="tick" /><span>{t(...(CHECKS[x.id] || [x.id, x.id]))}</span>{x.clause ? <span className="part">{x.clause}</span> : <span className="data">{t("模型", "MODEL")}</span>}</li>)}</ol>
      <footer>
        <span className="data">{done ? <>PAYPAL PAYOUTS<br />{c.payout || ""}</> : t("檢查條款中…", "checking the clauses…")}</span>
        <b style={{ opacity: done ? 1 : 0.15, transition: "opacity .4s" }}>{usd(c.amount)}</b>
      </footer>
    </div>
  );
}

export default function Home() {
  const t = useT(), { lang } = useLang(), ref = useReveal();
  const { data: stats } = useApi("/api/stats");
  const { data: products } = useApi(`/api/products?lang=${lang}`);
  const { data: tr } = useApi("/api/transparency");
  const [pick, setPick] = useState("renters");
  const p = products?.find((x) => x.id === pick);
  return (
    <div ref={ref}>
      <section className="hero">
        <div>
          <h1>{lang === "en" ? <>Insurance,<br /><em>opened up.</em></> : <span className="zh"><span className="line">保險，</span><span className="line"><em>攤開</em>給你看。</span></span>}</h1>
          <p className="lede">{t("價格拆成零件給你看，理賠照編號的條款一條一條檢查，錢由 PayPal 在幾秒內送到。Cover 只拿固定的 20%；理賠池用不完的，年底捐給你選的公益。", "The price shown as its parts, claims checked clause by numbered clause, money sent by PayPal in seconds. Cover keeps a flat 20%; what the claims pool doesn't need goes to a cause you pick at the end of the year.")}</p>
          <div className="cta">
            <Link to="/quote" className="btn accent">{t("90 秒拿到報價", "Get a price in 90 seconds")} <span className="arrow">→</span></Link>
            <Link to="/transparency" className="btn">{t("看帳本", "Read the ledger")}</Link>
          </div>
          <p className="data" style={{ marginTop: 40 }}>{stats ? t(`已賠 ${stats.claimsPaid} 件 · 已收保費 ${usd(stats.premiums)} · 理賠池現有 ${usd(stats.poolsNow)}`, `${stats.claimsPaid} CLAIMS PAID · ${usd(stats.premiums)} IN PREMIUMS · ${usd(stats.poolsNow)} IN THE POOLS`) : " "}</p>
        </div>
        <Instrument claim={stats?.last} />
      </section>

      <section className="band"><div className="band-in">
        <div className="band-head reveal">
          <h2>{t("每 100 元保費", "Every $100 of premium")}</h2>
          <p className="lede">{t("保險公司通常不告訴你保費怎麼分。我們把它量給你看，每一張報價都照這個比例拆開。", "Insurers rarely say how a premium is split. Here it is, measured; every quote is broken down the same way.")}</p>
        </div>
        <div className="measure reveal">
          <div className="dim" style={{ left: 0, width: "74%" }}><span>74</span></div>
          <div className="dim" style={{ left: "74%", width: "6%" }}><span style={{ fontSize: 18 }}>6</span></div>
          <div className="dim" style={{ left: "80%", width: "20%" }}><span>20</span></div>
          <div className="bar"><div className="pool" style={{ width: "74%" }}>{t("理賠池", "CLAIMS POOL")}</div><div className="re" style={{ width: "6%" }} /><div className="fee" style={{ width: "20%" }}>{t("COVER 費用", "COVER'S FEE")}</div></div>
        </div>
        <div className="legend-rows reveal">
          <div><b>{t("74 · 理賠池", "74 · The claims pool")}</b><p>{t("付理賠。選同一個公益的人共用一個池子。", "Pays the claims. Everyone who picks the same cause shares one pool.")}</p></div>
          <div><b>{t("6 · 再保險", "6 · Reinsurance")}</b><p>{t("颱風、地震一次打到很多人時，由再保公司扛超過的部分。", "When a typhoon or quake hits many at once, a reinsurer carries what's over the limit.")}</p></div>
          <div><b>{t("20 · Cover 的固定費用", "20 · Cover's flat fee")}</b><p>{t("我們的全部收入。少賠不會讓我們多賺，所以沒有理由拒賠。", "All we earn. Paying less in claims doesn't earn us more, so we have no reason to refuse one.")}</p></div>
        </div>
      </div></section>

      <section className="band"><div className="band-in">
        <div className="band-head reveal">
          <h2>{t("條款就是零件", "The clauses are parts")}</h2>
          <p className="lede">{t("每一項保障都有編號。理賠時 Cover 引用的就是這些編號，你也能在收據上看到。", "Every cover has a number. When Cover decides a claim it cites these numbers, and so does your receipt.")}</p>
        </div>
        <div className="tabs reveal" role="tablist">{["renters", "home", "pet", "life", "car"].map((id) => { const x = products?.find((y) => y.id === id); return <button key={id} role="tab" aria-selected={pick === id} className={pick === id ? "on" : ""} onClick={() => setPick(id)}>{{ renters: "Renters", home: "Home", pet: "Pet", life: "Life", car: "Car" }[id]}{lang === "zh" && x && <span className="zh">{x.name}</span>}</button>; })}</div>
        {p && <div className="parts">
          <div className="stack">
            <p className="lede" style={{ fontSize: 18 }}>{p.for}</p>
            <p className="data">{t(`${p.questions.length} 個問題 · ${p.covers.length} 項保障 · ${p.claims.length} 種理賠`, `${p.questions.length} QUESTIONS · ${p.covers.length} COVERS · ${p.claims.length} KINDS OF CLAIM`)}</p>
            <div><Link to={`/quote/${p.id}`} className="btn accent">{t(`報價：${p.name}`, `Price ${p.name}`)} <span className="arrow">→</span></Link></div>
          </div>
          <ol className="partlist">
            {p.covers.map((c) => <li key={c.id}><span className="part">{c.clause}</span><span>{c.what}</span><span className="lim" /></li>)}
            {p.addons.map((c) => <li key={c.id}><span className="part">{c.clause}</span><span>{c.what}</span><span className="lim">{t("加購", "ADD-ON")}</span></li>)}
          </ol>
        </div>}
      </div></section>

      <section className="band"><div className="band-in">
        <div className="band-head reveal"><h2>{t("一件理賠，三步", "A claim, in three steps")}</h2><p className="lede">{t("簡單的案件不經過人。複雜或有疑點的交給真人，而且不會因為疑點就自動拒賠。", "Simple claims never wait for a person. Anything complex or questionable goes to one, and a doubt never refuses a claim by itself.")}</p></div>
        <div className="steps reveal">
          <div><span className="n">01</span><h3>{t("說發生了什麼", "Say what happened")}</h3><p>{t("用你自己的話，附上照片和收據。Cover 的模型讀出收據上的日期和金額。", "In your own words, with photos and receipts. Cover's model reads the date and amount off the receipt.")}</p><p className="t">{t("約 1 分鐘", "ABOUT A MINUTE")}</p></div>
          <div><span className="n">02</span><h3>{t("逐條檢查", "Checked clause by clause")}</h3><p>{t("保單有效嗎、過了等待期嗎、有這項保障嗎、文件讀得懂嗎。每一項寫出依據的條款編號。", "In force? Past the waiting period? Covered? Documents readable? Each check names its clause.")}</p><p className="t">{t("幾秒", "SECONDS")}</p></div>
          <div><span className="n">03</span><h3>{t("PayPal 入帳", "Paid by PayPal")}</h3><p>{t("全部通過又在秒賠額度內，PayPal Payouts 直接付給你；寵物險可以直接付給動物醫院。", "All clear and within the instant limit: PayPal Payouts pays you, or for a pet, the vet directly.")}</p><p className="t">{stats?.medianSecondsToPay != null ? t(`中位數 ${stats.medianSecondsToPay} 秒`, `MEDIAN ${stats.medianSecondsToPay} S`) : t("目標 3 分鐘內", "UNDER 3 MINUTES")}</p></div>
        </div>
      </div></section>

      <section className="band"><div className="band-in grid-2" style={{ alignItems: "center" }}>
        <div className="stack reveal">
          <h2>{t("你的 AI agent 也能來", "Send your own AI agent")}</h2>
          <p className="lede">{t("透過 MCP，你的 agent 可以報價、投保、報理賠。它每月最多能花多少、能不能退保、能不能直接用你的 PayPal，由你決定，agent 改不了。理賠款只會進你自己的 PayPal。", "Over MCP your agent can quote, buy and claim. How much it may spend a month, whether it may cancel, and whether it may pay from your PayPal are yours to set; it can't change them. Claims only ever go to your own PayPal.")}</p>
          <div><Link to="/connect" className="btn">{t("連接 agent", "Connect an agent")} <span className="arrow">→</span></Link></div>
        </div>
        <pre className="terminal reveal">{[
          <span key="1" className="c">{t("# 把 Cover 加到 Claude Code", "# add Cover to Claude Code")}</span>, "\n",
          <span key="2" className="k">claude mcp add</span>, ` --transport http cover ${location.origin}/mcp \\\n    --header "Authorization: Bearer cover_…"\n\n`,
          <span key="3" className="c">{t("# 之後只要說", "# then just say")}</span>, "\n",
          t("> 幫我保租屋險，我住大安區，東西大概 8000 美元\n", "> cover my rented flat in Da'an, about $8,000 of stuff\n"),
          <span key="4" className="c">  get_quote → buy_policy → approveUrl</span>, "\n",
          t("> 筆電被咖啡潑到，修理估價 120 美元\n", "> coffee on my laptop, the repair quote says $120\n"),
          <span key="5" className="c">  file_claim → paid $70.00 · PAYOUT-…</span>,
        ]}</pre>
      </div></section>

      <section className="band"><div className="band-in">
        <div className="band-head reveal"><h2>{t("公益池，即時", "The cause pools, live")}</h2><p className="lede">{t("這些數字直接從帳本算出來。年底每個池子剩下的錢，用 PayPal Payouts 捐出，收據記進透明帳本。", "Counted straight from the ledger. At the end of the year what is left in each pool is given with PayPal Payouts, and the receipt goes into the transparency log.")}</p></div>
        <table className="ledger reveal"><tbody>
          {(tr?.pools || []).map((x) => <tr key={x.cause}><td>{x.name[lang]}</td><td className="r">{t(`${x.policies} 張保單 · 已賠 ${x.claims}`, `${x.policies} POLICIES · ${x.claims} PAID`)}</td><td className="amt" style={{ color: x.balance.startsWith("$-") ? "var(--bad)" : undefined }}>{x.balance}</td></tr>)}
        </tbody></table>
        <div style={{ marginTop: 32 }}><Link to="/transparency" className="link">{t("完整帳本", "The full ledger")}</Link></div>
      </div></section>
    </div>
  );
}

export function MoneySplit() {
  const t = useT();
  return (
    <div className="measure">
      <div className="dim" style={{ left: 0, width: "74%" }}><span>74</span></div>
      <div className="dim" style={{ left: "74%", width: "6%" }}><span style={{ fontSize: 18 }}>6</span></div>
      <div className="dim" style={{ left: "80%", width: "20%" }}><span>20</span></div>
      <div className="bar"><div className="pool" style={{ width: "74%" }}>{t("理賠池", "CLAIMS POOL")}</div><div className="re" style={{ width: "6%" }} /><div className="fee" style={{ width: "20%" }}>{t("COVER 費用", "COVER'S FEE")}</div></div>
    </div>
  );
}
