// Cover inside someone else's checkout, from the customer's side: Skyway Travel's cart with the ticket, the "add
// flight-delay protection by Cover" line its agent negotiated with Cover's agent, every A2A message the two agents sent
// (as it happens, each one structured, the raw JSON-RPC one click away), one payment, and then what it made: the
// customer's policy, Cover's PayPal capture, the ledger lines and the seller's commission payout with their PayPal ids.
// The seller's agent runs on the server (api/src/skyway.js) with Skyway's partner key and talks to Cover's /a2a over
// HTTP; this page only asks it to make its next move (/api/demo/skyway), so no key is ever in the browser.
import { useEffect, useRef, useState } from "react";
import { api, Link, useT, usd, cents } from "../api.jsx";

const dataOf = (x) => x?.received?.result?.parts?.find((p) => p.kind === "data")?.data || null;
const textOf = (m) => m?.parts?.find((p) => p.kind === "text")?.text || "";
const PLAN = { flight: ["只保航班", "Flight only"], standard: ["標準", "Standard"], plus: ["加強", "Plus"] };

// the fields of a message worth a row each; the whole message is under "JSON-RPC"
function fields(d, sent) {
  if (!d) return [];
  if (sent) return Object.entries(d).filter(([k]) => k !== "trip").map(([k, v]) => [k, typeof v === "object" ? (k === "customer" ? `${v.name} <${v.email}>` : JSON.stringify(v)) : String(v)])
    .concat(d.trip ? [["trip", `${d.trip.destination} · ${d.trip.departure} → ${d.trip.return} · ${d.trip.travelers} travelers · ${d.trip.flights.map((f) => f.flight).join(", ")}`]] : []);
  if (d.error) return [["error", d.error], ...(d.floor ? [["lowest price", `${d.floor.plan} ${d.floor.price}`]] : [])];
  if (d.sale) return [["sale", d.sale], ["policy", `${d.policy?.number} · ${d.policy?.status}`], ["paypal order", d.payment?.paypalOrder || "—"], ["paypal capture", d.payment?.paypalCapture || "—"], ["commission", `${d.commission?.amount} · ${d.commission?.status}${d.commission?.paypalPayout ? ` · ${d.commission.paypalPayout}` : ""}`]];
  return [["offer", d.offer], ["plan", d.plan], ["price", d.price], ["covers", d.covers?.map((c) => c.clause).join(" ")], ...(d.dropped?.length ? [["dropped", d.dropped.map((c) => c.clause).join(" ")]] : []), ["expires", d.expires?.slice(11, 19) + " UTC"]];
}

function Message({ who, text, rows, raw, ms, mine }) {
  const t = useT();
  return (
    <div className={`msg ${mine ? "me" : "bot"}`} style={{ maxWidth: "94%", ...(mine ? { justifySelf: "end" } : {}) }}>
      <span className="who">{who}{ms != null ? ` · ${ms} ms` : ""}</span>
      <p className="small" style={{ margin: "0 0 8px" }}>{text}</p>
      <ul className="spec">{rows.map(([k, v]) => <li key={k}><span className="lead data">{k}</span><span className="val" style={{ whiteSpace: "normal", textAlign: "right", wordBreak: "break-word" }}>{v}</span></li>)}</ul>
      <details style={{ marginTop: 6 }}><summary className="data" style={{ cursor: "pointer" }}>{t("JSON-RPC 原文", "JSON-RPC")}</summary><pre className="terminal" style={{ whiteSpace: "pre-wrap", maxHeight: 280, marginTop: 6 }}>{JSON.stringify(raw, null, 1)}</pre></details>
    </div>
  );
}

export default function Partners() {
  const t = useT();
  const [cart, setCart] = useState(null), [log, setLog] = useState([]), [offer, setOffer] = useState(null), [refused, setRefused] = useState(null);
  const [add, setAdd] = useState(true), [countered, setCountered] = useState(false), [busy, setBusy] = useState(null), [err, setErr] = useState(null);
  const [customer, setCustomer] = useState({ name: "Mei Lin", email: `mei.lin+${Math.random().toString(36).slice(2, 7)}@example.com` });
  const [sale, setSale] = useState(null), [inbox, setInbox] = useState(null), [skipped, setSkipped] = useState(false);
  const ctx = useRef(null), started = useRef(false), end = useRef(null);

  // one move of Skyway's agent: what it sent and what Cover's agent answered, added to the conversation
  async function step(body, { quiet = false } = {}) {
    const r = await api("/api/demo/skyway", { method: "POST", body: { ...body, contextId: ctx.current } });
    const x = r.exchange, d = dataOf(x);
    if (x.received?.error) throw new Error(x.received.error.message);
    ctx.current = x.received?.result?.contextId || ctx.current;
    if (!quiet) setLog((l) => [...l, x]);
    if (r.inbox) setInbox(r.inbox);
    return { x, d };
  }
  const run = async (what, fn) => { setBusy(what); setErr(null); try { await fn(); } catch (e) { setErr(e.message); } setBusy(null); };

  // the cart loads, and Skyway's agent asks Cover for an offer straight away
  useEffect(() => {
    if (started.current) return; started.current = true;
    run("offer", async () => { const c = await api("/api/demo/skyway", { method: "POST", body: { step: "cart" } }); setCart(c); const { d } = await step({ step: "offer" }); if (!d.error) setOffer(d); });
  }, []);
  useEffect(() => { end.current?.scrollIntoView?.({ block: "nearest", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" }); }, [log.length]);

  const counter = (ask) => run("counter", async () => {
    setCountered(true);
    const { d } = await step({ step: "counter", offer: offer.offer, ...ask });
    if (d.error) setRefused(d); else { setOffer(d); setRefused(null); }
  });
  const pay = () => run("pay", async () => {
    if (!add) { setSkipped(true); return; }
    // without the test card the customer approves Cover's order in PayPal: the window opens on the click itself (so
    // the browser allows it) and goes to PayPal once Cover's agent has made the order
    const win = cart.testCard ? null : window.open("about:blank", "cover-paypal", "width=480,height=720");
    const { d } = await step({ step: "bind", offer: offer.offer, customer, payer: cart.testCard ? "test_card" : "paypal" });
    if (d.error) { win?.close(); throw new Error(d.message); }
    setSale(d);
    if (d.policy?.status === "active") { win?.close(); return; }
    if (d.payment?.approveUrl) { if (win) win.location = d.payment.approveUrl; else window.open(d.payment.approveUrl, "cover-paypal"); }
    // Skyway's agent asks Cover until the premium is captured (only the answer that changes things is shown)
    for (let i = 0; i < 90; i++) {
      await new Promise((ok) => setTimeout(ok, 2000));
      const quiet = i < 89;
      const s = await step({ step: "status", sale: d.sale }, { quiet: true });
      if (s.d.policy?.status === "active" && s.d.commission?.status !== "paying") { setLog((l) => [...l, s.x]); setSale(s.d); try { win?.close(); } catch {} return; }
      if (!quiet) throw new Error(t("還沒收到付款。", "The payment hasn't come through yet."));
    }
  });
  const restart = () => { ctx.current = null; setLog([]); setOffer(null); setRefused(null); setCountered(false); setSale(null); setInbox(null); setSkipped(false); setAdd(true); started.current = false; run("offer", async () => { const { d } = await step({ step: "offer" }); if (!d.error) setOffer(d); }); };

  const ticket = cart?.cart.ticket, premium = offer ? cents(offer.price) : 0, total = (ticket?.total || 0) + (add && offer ? premium : 0);
  const paid = sale?.policy?.status === "active";
  const premiumLine = sale?.ledger?.find((l) => l.kind === "premium"), comLine = sale?.ledger?.find((l) => l.kind === "commission");
  return (
    <div className="stack-l">
      <div className="page-head" style={{ marginBottom: 0 }}>
        <div><p className="eyebrow">{t("合作夥伴 · AGENT 對 AGENT", "PARTNERS · AGENT TO AGENT")}</p><h1>{t("在別人的結帳頁買 Cover", "Cover at a seller's checkout")}</h1>
          <p className="lede" style={{ maxWidth: "62ch" }}>{t("Skyway Travel（示範）的結帳 agent 透過 A2A 向 Cover 的 agent 詢價、議價一次、替客人投保。客人只付一次款；保單是客人的，航班出事時直接付到客人的 PayPal；Skyway 的佣金從 Cover 的 20% 費用裡用 PayPal Payouts 付出，不動理賠池。",
            "Skyway Travel's (demo) checkout agent asks Cover's agent for an offer over A2A, negotiates once and binds the cover for its customer. The customer pays once; the policy is theirs, and a late or cancelled flight pays their own PayPal. Skyway's commission is paid with PayPal Payouts out of Cover's 20% fee, never the claims pool.")}</p></div>
        {cart && <span className="badge">{`PAYPAL ${cart.paypal === "mock" ? t("模擬", "SIMULATED") : "SANDBOX"}${cart.testCard ? t(" · 測試卡", " · TEST CARD") : ""}`}</span>}
      </div>

      <div className="grid-2">
        {/* the customer's side: Skyway's checkout */}
        <section className="card marks stack" aria-labelledby="co-h">
          <div className="row between"><h2 id="co-h" style={{ fontSize: 28 }}>Skyway Travel <span className="data">(demo) · {t("結帳", "CHECKOUT")}</span></h2><span className="data">{t("客人看到的畫面", "WHAT THE CUSTOMER SEES")}</span></div>
          {!cart && <p className="small muted">{t("載入購物車…", "Loading the cart…")}</p>}
          {cart && <>
            <ul className="spec">
              <li><span className="lead"><b>{ticket.what}</b><br /><span className="data">{cart.cart.flights.map((f) => `${f.flight} ${f.from}→${f.to} ${f.date}`).join(" · ")}</span></span><span className="val">{usd(ticket.total)}</span></li>
              <li style={{ alignItems: "flex-start" }}>
                <span className="lead">
                  <label style={{ display: "flex", gap: 10, alignItems: "flex-start", cursor: offer && !sale ? "pointer" : "default" }}>
                    <input type="checkbox" checked={add} disabled={!offer || !!sale} onChange={(e) => setAdd(e.target.checked)} style={{ marginTop: 4, accentColor: "var(--signal)" }} />
                    <span><b>{t("加購 Cover 航班延誤保障", "Add flight-delay protection by Cover")}</b>
                      {offer ? <><br /><span className="small muted">{t(`${PLAN[offer.plan][0]}，${offer.travelers} 位旅客。延誤 2 小時以上每人 $100、6 小時 $300、取消 $300，自動付到你的 PayPal。`, `${PLAN[offer.plan][1]}, ${offer.travelers} travelers. 2 h late pays $100 each, 6 h $300, cancelled $300, straight to your PayPal.`)}</span><br />
                        <span className="row" style={{ gap: 6, marginTop: 6 }}>{offer.covers.map((c) => <span key={c.id} className="part" title={c.what}>{c.clause}</span>)}</span></>
                        : <><br /><span className="small muted">{busy === "offer" ? t("兩個 agent 正在談…", "The agents are talking…") : "—"}</span></>}</span>
                  </label>
                </span>
                <span className="val signal">{offer ? offer.price : "…"}</span>
              </li>
            </ul>
            {offer && !sale && !countered && <div className="stack-s">
              <p className="data">{t("保障預算（Skyway 的 agent 會替你去談一次）", "YOUR BUDGET FOR PROTECTION (SKYWAY'S AGENT ASKS COVER ONCE)")}</p>
              <div className="chips">
                <button className="chip" disabled={!!busy} onClick={() => counter({ budget: 120 })}>{t("最多 $120", "Up to $120")}</button>
                <button className="chip" disabled={!!busy} onClick={() => counter({ budget: 60 })}>{t("最多 $60", "Up to $60")}</button>
                <button className="chip" disabled={!!busy} onClick={() => counter({ plan: "flight" })}>{t("只要航班保障", "Flight cover only")}</button>
              </div>
            </div>}
            {refused && <div className="note warn small">{t(`Cover 不打折風險價格：這趟最低是 ${refused.floor?.price}（${PLAN[refused.floor?.plan]?.[0]}）。原本的報價仍然有效。`, `Cover doesn't discount the risk price: the least for this trip is ${refused.floor?.price} (${PLAN[refused.floor?.plan]?.[1]}). The first offer still stands.`)}</div>}
            {offer?.dropped?.length > 0 && <div className="note small">{t("為了符合預算，Cover 拿掉了：", "To fit the budget, Cover dropped: ")}{offer.dropped.map((d, i) => <span key={d.id}>{i ? "; " : ""}<span className="part">{d.clause}</span> {d.what.split(",")[0].split(" up to")[0]}</span>)}{t("。價格是剩下保障的風險價格，不是折扣。", ". The price is the risk price of what is left, not a discount.")}</div>}
            {!sale && <div className="stack-s">
              <div className="row" style={{ gap: 12 }}>
                <label className="field" style={{ flex: "1 1 160px" }}><span className="data">{t("姓名", "NAME")}</span><input className="input" value={customer.name} onChange={(e) => setCustomer({ ...customer, name: e.target.value })} /></label>
                <label className="field" style={{ flex: "2 1 220px" }}><span className="data">{t("EMAIL（保單和航班給付都到這裡）", "EMAIL (THE POLICY AND FLIGHT PAYOUTS GO HERE)")}</span><input className="input" type="email" value={customer.email} onChange={(e) => setCustomer({ ...customer, email: e.target.value })} /></label>
              </div>
            </div>}
            <div className="row between" style={{ borderTop: "1px solid var(--line-strong)", paddingTop: 16 }}>
              <span className="data">{t("合計", "TOTAL")}</span><span className="big" style={{ fontSize: 56 }}>{usd(total)}</span>
            </div>
            {!sale && !skipped && <div className="stack-s">
              <button className="btn accent" style={{ width: "100%" }} disabled={!offer || !!busy || !/@/.test(customer.email)} onClick={pay}>{busy === "pay" ? t("付款中…", "Paying…") : t(`付款 ${usd(total)}`, `Pay ${usd(total)}`)}</button>
              <p className="tiny muted">{cart.testCard ? t("一次付款：機票走 Skyway 自己的 PayPal（示範中為模擬），保費是 Cover 自己的 PayPal 訂單，用 PayPal 沙盒測試卡付（評審不用登入）。", "One payment: the ticket goes through Skyway's own PayPal checkout (simulated here); the premium is Cover's own PayPal order, paid with PayPal's sandbox test card (no sign-in, for judges).")
                : t("一次付款：機票走 Skyway 自己的 PayPal（示範中為模擬）；保費是 Cover 自己的 PayPal 訂單，會在新視窗請你同意。", "One payment: the ticket goes through Skyway's own PayPal checkout (simulated here); the premium is Cover's own PayPal order, approved in the window that opens.")}</p>
            </div>}
            {skipped && <div className="note small">{t("沒有加購保障，Cover 什麼都沒收。", "No protection added: Cover took nothing.")} <button className="link" onClick={restart}>{t("重來", "Start over")}</button></div>}
          </>}
          {err && <div className="note bad small" role="alert">{err}</div>}
        </section>

        {/* the two agents */}
        <section className="stack" aria-labelledby="a2a-h" aria-live="polite">
          <div className="row between"><h2 id="a2a-h" style={{ fontSize: 28 }}>{t("兩個 agent 的對話", "The agents, as they talk")}</h2><span className="data">A2A · JSON-RPC · /a2a</span></div>
          <p className="small muted">{t("左邊是 Skyway 的結帳 agent（用它的合作夥伴金鑰），右邊是 Cover 的 agent。每一則都是真的送出的訊息。", "Skyway's checkout agent (with its partner key) on the right, Cover's agent on the left. Every message here was really sent.")}</p>
          <div className="msgs">
            {log.map((x, i) => <div key={i} className="msgs">
              <Message mine who={t("SKYWAY 的 AGENT", "SKYWAY'S AGENT")} text={textOf(x.sent.params.message)} rows={fields(x.sent.params.message.parts.find((p) => p.kind === "data").data, true)} raw={x.sent} />
              {x.received.result ? <Message who={t("COVER 的 AGENT", "COVER'S AGENT")} ms={x.ms} text={textOf(x.received.result)} rows={fields(dataOf(x))} raw={x.received} />
                : <div className="note bad small">{x.received.error?.message}</div>}
            </div>)}
            {busy && busy !== "pay" && <p className="data">{t("等待回覆…", "WAITING FOR AN ANSWER…")}</p>}
            {busy === "pay" && sale && !paid && <p className="data">{t("等客人在 PayPal 同意 Cover 的保費…（Skyway 的 agent 每 2 秒問一次 cover_status）", "WAITING FOR THE CUSTOMER TO APPROVE COVER'S PREMIUM IN PAYPAL… (SKYWAY'S AGENT ASKS cover_status EVERY 2 S)")}</p>}
            <div ref={end} />
          </div>
        </section>
      </div>

      {paid && <section className="stack" aria-labelledby="done-h">
        <h2 id="done-h">{t("付款之後", "After the payment")}</h2>
        <div className="grid-2">
          <div className="card marks stack-s">
            <div className="row between"><span className="data">{sale.policy.number}</span><span className="badge good">{t("生效中", "ACTIVE")}</span></div>
            <h3>{t(`${customer.name} 的旅行險`, `${customer.name}'s travel policy`)}</h3>
            <ul className="spec">
              {sale.policy.covers.map((c) => <li key={c.id}><span className="lead"><span className="part">{c.clause}</span> <span className="small">{c.id.replace(/_/g, " ")}</span></span><span className="val">{c.limit}</span></li>)}
              <li><span className="lead data">{t("期間", "COVER")}</span><span className="val">{sale.policy.start?.slice(0, 10)} → {sale.policy.end?.slice(0, 10)}</span></li>
            </ul>
            {inbox && <div className="note small">{t(`Cover 寄給 ${inbox.to} 的信：`, `Cover's email to ${inbox.to}: `)}<a className="link" href={inbox.link}>{t("打開你的保單", "Open your policy")} →</a> <span className="tiny muted">{t("（一次性連結，示範頁代替客人的信箱）", "(a one-time link; this page stands in for the customer's inbox)")}</span></div>}
          </div>
          <div className="card marks stack-s">
            <h3>{t("錢怎麼走", "Where the money went")}</h3>
            <ul className="spec">
              <li><span className="lead">{t("保費（Cover 的 PayPal 訂單）", "Premium (Cover's own PayPal order)")}<br /><span className="mono muted">{sale.payment.paypalOrder} · {t("扣款", "capture")} {sale.payment.paypalCapture}</span></span><span className="val">{premiumLine?.amount}</span></li>
              <li><span className="lead">{t("進理賠池（80%）", "To the claims pool (80%)")}</span><span className="val">{premiumLine?.toPool}</span></li>
              <li><span className="lead">{t("Cover 的費用（20%）", "Cover's fee (20%)")}</span><span className="val">{premiumLine?.toCoverFee}</span></li>
              <li><span className="lead">{t(`Skyway 的佣金（${Math.round(sale.commission.rate * 100)}%，從 Cover 的費用出）`, `Skyway's commission (${Math.round(sale.commission.rate * 100)}%, from Cover's fee)`)}<br /><span className="mono muted">PayPal Payouts {sale.commission.paypalPayout || sale.commission.status}</span></span><span className="val signal">{sale.commission.amount}</span></li>
            </ul>
            {premiumLine && <div aria-hidden="true">
              <div className="split" style={{ marginTop: 8 }}><i className="pool" style={{ width: "80%" }} /><i className="fee" style={{ width: `${20 - sale.commission.rate * 100}%` }} /><i style={{ width: `${sale.commission.rate * 100}%`, background: "var(--signal)" }} /></div>
              <div className="row between data" style={{ marginTop: 6 }}><span>{t("理賠池", "POOL")} {premiumLine.toPool}</span><span>{t("Cover 留下", "COVER KEEPS")} {usd(cents(premiumLine.toCoverFee) - cents(sale.commission.amount))} · SKYWAY {sale.commission.amount}</span></div>
            </div>}
            <p className="tiny muted">{t("帳本上的兩行：", "The two ledger lines: ")}{sale.ledger.map((l) => `#${l.n} ${l.kind} ${l.amount} (${t("池", "pool")} ${l.toPool}, ${t("費用", "fee")} ${l.toCoverFee})`).join(" · ")}. <Link className="link" to="/transparency">{t("看帳本", "See the ledger")}</Link></p>
          </div>
        </div>
        <div className="row"><button className="btn ghost" onClick={restart}>{t("再結帳一次", "Check out again")}</button></div>
      </section>}
    </div>
  );
}
