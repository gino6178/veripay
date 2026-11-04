// The front page, around Cover's lead story: a person's own AI agent insures the trip it is planning, and when a flight
// leaves late or is cancelled, Cover sees it and pays every traveler with PayPal before anyone files anything. Then the
// premium measured into its parts, the agent's side of it, the cause pools, and the other kinds of cover.
// Every number is counted by the server (stats, transparency); a stand-in is labelled as one.
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

const CHECKS = { in_force: ["保單有效", "Policy in force"], listed: ["是保單上的航班", "An insured flight"], not_known: ["投保時還沒出事", "Not known before buying"], threshold: ["達到給付門檻", "Over the threshold"], cap: ["在本趟上限內", "Within the trip's cap"] };
const SAMPLE = { flight: "UA857", from: "SFO", to: "FRA", status: "departed", delayMin: 151, amount: 20000, travelers: 2, seconds: 4, checks: [{ id: "in_force", clause: "TR-6.1" }, { id: "listed", clause: "TR-1.1" }, { id: "not_known", clause: "TR-3.1" }, { id: "threshold", clause: "TR-2.1" }, { id: "cap", clause: "TR-2.2" }], payout: null, sample: true };
const hm = (m) => `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")} min`;

// The flight instrument: the departure board line turning late, Cover's checks lighting one by one, the payout
function Instrument({ f }) {
  const t = useT(), c = f || SAMPLE;
  const total = c.checks.length + 2, still = typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  const [p, setP] = useState(still ? 1 : 0);
  useEffect(() => {
    if (still) return;
    let raf, start = performance.now(), off = false;
    const run = 5200, hold = 4200;
    const frame = (now) => { if (off) return; const e = (now - start) % (run + hold); setP(Math.min(1, e / run)); raf = requestAnimationFrame(frame); };
    raf = requestAnimationFrame(frame);
    return () => { off = true; cancelAnimationFrame(raf); };
  }, [still]);
  const k = p >= 1 ? total : Math.floor(p * total), late = k >= 1, done = k >= total;
  return (
    <div className="instrument marks" role="img" aria-label={t(`航班 ${c.flight} 延誤 ${hm(c.delayMin)}，${c.travelers} 位旅客自動獲付 ${usd(c.amount)}`, `Flight ${c.flight} left ${hm(c.delayMin)} late; ${c.travelers} travelers were paid ${usd(c.amount)} automatically`)}>
      <header><span className="live"><i />{c.sample ? t("示意 · 依 Cover 的條款", "ILLUSTRATION · COVER'S CLAUSES") : t("最近一次自動給付 · 真實紀錄", "LATEST AUTOMATIC PAYOUT · REAL RECORD")}</span><span>{t(`${c.travelers} 位旅客`, `${c.travelers} TRAVELERS`)}</span></header>
      <div className="board">
        <b>{c.flight}</b><span>{c.from} → {c.to}</span>
        <em className={late ? (c.status === "cancelled" ? "bad" : "warn") : ""}>{late ? (c.status === "cancelled" ? t("取消", "CANCELLED") : `+${hm(c.delayMin)}`) : t("準時", "ON TIME")}</em>
      </div>
      <ol>{c.checks.map((x, i) => <li key={x.id} className={i + 1 < k ? "on" : i + 1 === k ? "now" : ""}><span className="tick" /><span>{t(...(CHECKS[x.id] || [x.id, x.id]))}</span><span className="part">{x.clause}</span></li>)}</ol>
      <footer>
        <span className="data">{done ? <>{t("沒有人申請理賠", "NO CLAIM FILED")}<br />PAYPAL PAYOUTS {c.payout || ""}</> : late ? t("檢查條款中…", "CHECKING THE CLAUSES…") : t("監看航班中…", "WATCHING THE FLIGHT…")}</span>
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
  const [pick, setPick] = useState("travel");
  const p = products?.find((x) => x.id === pick);
  const origin = typeof location !== "undefined" ? location.origin : "";
  return (
    <div ref={ref}>
      <section className="hero">
        <div>
          <h1>{lang === "en" ? <>Your agent books the trip.<br /><em>Cover pays</em> when the flight doesn't go.</> : <span className="zh"><span className="line">你的 agent 訂行程，</span><span className="line">航班出事，<em>Cover 先付</em>。</span></span>}</h1>
          <p className="lede">{t("你的 AI agent 規劃旅程時，透過 MCP 順手幫你買好旅行險。航班延誤 2 小時或取消，Cover 自己會知道，用 PayPal 幾分鐘內付給每位旅客，不用申請、不用等。我們只拿固定 20%，用不完的錢年底捐給公益。", "While your AI agent plans your trip, it buys the cover over MCP. If a flight leaves 2 hours late or is cancelled, Cover knows, and PayPal pays every traveler within minutes: nothing to file, nothing to wait for. We keep a flat 20%; what the claims pool doesn't need goes to a cause at the end of the year.")}</p>
          <div className="cta">
            <Link to="/connect" className="btn accent">{t("連接你的 agent", "Connect your agent")} <span className="arrow">→</span></Link>
            <Link to="/quote/travel" className="btn">{t("自己投保一趟旅程", "Cover a trip yourself")}</Link>
          </div>
          <p className="data" style={{ marginTop: 40 }}>{stats ? t(`自動給付 ${stats.autoPaid ?? 0} 次 · 已賠 ${stats.claimsPaid} 件 · 理賠池現有 ${usd(stats.poolsNow)}`, `${stats.autoPaid ?? 0} AUTOMATIC PAYOUTS · ${stats.claimsPaid} CLAIMS PAID · ${usd(stats.poolsNow)} IN THE POOLS`) : " "}</p>
        </div>
        <Instrument f={stats?.lastFlight} />
      </section>

      <section className="band"><div className="band-in grid-2" style={{ alignItems: "center" }}>
        <div className="stack reveal">
          <h2>{t("讓 agent 幫你買", "Let your agent buy it")}</h2>
          <p className="lede">{t("Cover 是為 agent 設計的：一個 MCP 工具就能報價加投保。它能花多少、能不能自己付款，由你在 Cover 上設定，agent 改不了。錢永遠只付到你自己的 PayPal。", "Cover is built for agents: one MCP tool prices and buys a trip. How much it may spend and whether it may pay on its own are set by you on Cover; the agent can't change them. Money only ever goes to your own PayPal.")}</p>
          <ul className="spec">
            <li><span className="lead">{t("給 agent 讀的說明", "What agents read first")}</span><a className="val" href="/llms.txt">/llms.txt</a></li>
            <li><span className="lead">MCP</span><span className="val">{origin}/mcp</span></li>
            <li><span className="lead">A2A</span><a className="val" href="/.well-known/agent-card.json">/.well-known/agent-card.json</a></li>
          </ul>
        </div>
        <pre className="terminal reveal">{[
          <span key="0" className="c">{t("# 你對 agent 說：", "# you tell your agent:")}</span>, "\n",
          t("> 幫我訂 12/20 去法蘭克福，兩個人，順便保險\n\n", "> book Frankfurt on Dec 20 for two, and insure it\n\n"),
          <span key="1" className="k">insure_trip</span>, ` { destination: "europe", travelers: 2, plan: "flight",\n              flights: [{ flight: "UA857", date: "2026-12-20" }] }\n`,
          <span key="2" className="c">  → policy CV-TR-… · TR-2.1 TR-2.2 · paid with PayPal</span>, "\n\n",
          <span key="3" className="k">wait_for_news</span>, "\n",
          <span key="4" className="c">  → UA857 departed 2 h 31 min late. Cover filed claim CL-… for you.</span>, "\n",
          <span key="5" className="c">  → paid $200.00 with PayPal Payouts, with no claim filed</span>,
        ]}</pre>
      </div></section>

      <section className="band"><div className="band-in">
        <div className="band-head reveal">
          <h2>{t("事實發生，錢就到", "The facts happen, the money arrives")}</h2>
          <p className="lede">{t("旅行險的航班保障是「參數型」的：不看收據、不審核，只看航班實際起飛的時間。航班紀錄就是證據，會簽章記進透明帳本。", "Flight cover is parametric: no receipts, no review, only the time the flight actually left. The flight's record is the evidence, signed into the transparency log.")}</p>
        </div>
        <div className="steps reveal">
          <div><span className="n">2 h</span><h3>{t("晚 2 小時起飛", "Leaves 2 hours late")}</h3><p>{t("每位旅客 $100，自動付款。", "$100 for each traveler, paid automatically.")}</p><p className="t">TR-2.1</p></div>
          <div><span className="n">6 h</span><h3>{t("晚 6 小時起飛", "Leaves 6 hours late")}</h3><p>{t("改為每位旅客 $300。", "$300 for each traveler instead.")}</p><p className="t">TR-2.1</p></div>
          <div><span className="n">✕</span><h3>{t("航班取消", "Cancelled")}</h3><p>{t("每位旅客 $300；一趟旅程每人最多 $600。", "$300 for each traveler; at most $600 each per trip.")}</p><p className="t">TR-2.2</p></div>
        </div>
      </div></section>

      <section className="band"><div className="band-in">
        <div className="band-head reveal">
          <h2>{t("每 100 元保費", "Every $100 of premium")}</h2>
          <p className="lede">{t("Cover 的收入只有固定的 20%。少賠不會讓我們多賺，所以我們沒有理由拒賠，也沒有理由拖。", "Cover's only income is a flat 20%. Paying less in claims earns us nothing more, so we have no reason to refuse or to delay.")}</p>
        </div>
        <div className="reveal"><MoneySplit /></div>
        <div className="legend-rows reveal">
          <div><b>{t("74 · 理賠池", "74 · The claims pool")}</b><p>{t("付理賠。選同一個公益的人共用一個池子。", "Pays the claims. Everyone who picks the same cause shares one pool.")}</p></div>
          <div><b>{t("6 · 再保險", "6 · Reinsurance")}</b><p>{t("一場颶風或一整天停飛同時打到很多人時，由再保公司扛超過的部分。", "When one hurricane or one day of grounded flights hits many people at once, a reinsurer carries what's over the limit.")}</p></div>
          <div><b>{t("20 · Cover 的固定費用", "20 · Cover's flat fee")}</b><p>{t("我們的全部收入。", "All we earn.")}</p></div>
        </div>
      </div></section>

      <section className="band"><div className="band-in">
        <div className="band-head reveal"><h2>{t("用不完的錢，捐出去", "What isn't needed, given away")}</h2><p className="lede">{t("年底每個公益池剩下的錢，用 PayPal Payouts 直接捐給那個公益，收據記進透明帳本，任何人都能查。下面是即時的帳。", "At the end of the year, what is left in each cause's pool is given to that cause with PayPal Payouts, and the receipt goes into the transparency log for anyone to check. Live, below.")}</p></div>
        <table className="ledger reveal"><tbody>
          {(tr?.pools || []).map((x) => <tr key={x.cause}><td>{x.name[lang]}</td><td className="r">{t(`${x.policies} 張保單 · 已賠 ${x.claims}`, `${x.policies} POLICIES · ${x.claims} PAID`)}</td><td className="amt" style={{ color: x.balance.startsWith("$-") ? "var(--bad)" : undefined }}>{x.balance}</td></tr>)}
        </tbody></table>
        <div style={{ marginTop: 32 }}><Link to="/transparency" className="link">{t("完整帳本", "The full ledger")}</Link></div>
      </div></section>

      <section className="band"><div className="band-in">
        <div className="band-head reveal">
          <h2>{t("條款就是零件", "The clauses are parts")}</h2>
          <p className="lede">{t("除了旅行，Cover 也保租屋、房屋、寵物、壽險和汽機車。每一項保障都有編號，判斷理賠時引用的就是這些編號。", "Beyond travel, Cover insures renters, homes, pets, lives and vehicles. Every cover has a number, and every claim decision cites them.")}</p>
        </div>
        <div className="tabs reveal" role="tablist">{(products || []).map((x) => <button key={x.id} role="tab" aria-selected={pick === x.id} className={pick === x.id ? "on" : ""} onClick={() => setPick(x.id)}>{x.name}</button>)}</div>
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
