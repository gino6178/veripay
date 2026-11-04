// The shell: the header and its sections, sign-in, the language and theme, the demo panel, and the pages by address.
import { createContext, useContext, useEffect, useState } from "react";
import { api, Lang, Link, navigate, usePath, useT } from "./api.jsx";
import Icon from "./components/Icon.jsx";
import Home from "./pages/Home.jsx";
import Quote from "./pages/Quote.jsx";
import Policies, { PolicyPage } from "./pages/Policies.jsx";
import { NewClaim, ClaimPage } from "./pages/Claims.jsx";
import Activity from "./pages/Activity.jsx";
import Connect from "./pages/Connect.jsx";
import Transparency from "./pages/Transparency.jsx";
import Desk from "./pages/Desk.jsx";
import Carrier from "./pages/Carrier.jsx";
import SignIn from "./pages/SignIn.jsx";

export const Me = createContext({ me: null, reload: () => {}, info: null, toast: () => {} });
export const useMe = () => useContext(Me);

function routes(path) {
  const p = path.split("?")[0], m = (re) => p.match(re);
  let x;
  if (p === "/" || p === "") return <Home />;
  if ((x = m(/^\/quote(?:\/(\w+))?$/))) return <Quote product={x[1]} />;
  if (p === "/policies") return <Policies />;
  if ((x = m(/^\/policies\/([\w-]+)$/))) return <PolicyPage id={x[1]} />;
  if ((x = m(/^\/claim\/new\/([\w-]+)$/))) return <NewClaim policy={x[1]} />;
  if ((x = m(/^\/claims\/([\w-]+)$/))) return <ClaimPage id={x[1]} />;
  if (p === "/activity") return <Activity />;
  if (p === "/connect") return <Connect />;
  if (p === "/transparency") return <Transparency />;
  if (p === "/desk") return <Desk />;
  if (p === "/carrier") return <Carrier />;
  if (p === "/signin") return <SignIn />;
  return <div className="empty">Not found. <Link to="/">Cover</Link></div>;
}

export default function App() {
  const path = usePath();
  const [lang, setLang] = useState(() => { try { return localStorage.getItem("cover.lang") || "zh"; } catch { return "zh"; } });
  const [me, setMe] = useState(undefined), [info, setInfo] = useState(null), [msg, setMsg] = useState(null);
  const reload = () => api("/api/me").then(setMe).catch(() => setMe(null));
  useEffect(() => { reload(); api("/api/info").then(setInfo).catch(() => {}); const f = () => api("/api/info").then(setInfo).catch(() => {}); addEventListener("cover:refresh", f); return () => removeEventListener("cover:refresh", f); }, []);
  useEffect(() => { document.documentElement.lang = lang === "en" ? "en" : "zh-Hant"; try { localStorage.setItem("cover.lang", lang); } catch {} }, [lang]);
  const toast = (m) => { setMsg(m); setTimeout(() => setMsg(null), 3800); };
  return (
    <Lang.Provider value={{ lang, set: setLang }}>
      <Me.Provider value={{ me, reload, info, toast, setInfo }}>
        <Header path={path} />
        <main className={path.split("?")[0] === "/" ? "main bleed" : "main"}>{routes(path)}</main>
        <Footer />
        <Demo />
        {msg && <div className="toast" role="status">{msg}</div>}
      </Me.Provider>
    </Lang.Provider>
  );
}

function Header({ path }) {
  const t = useT(), { me } = useMe(), { lang, set } = useContext(Lang);
  const on = (p) => (path === p || (p !== "/" && path.startsWith(p)) ? "on" : undefined);
  return (
    <header className="top">
      <div className="top-in">
        <Link to="/" className="brand" aria-label="Cover"><svg className="brand-mark" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="square" aria-hidden="true"><path d="M19 7.5A8 8 0 1 0 19 16.5" /><path d="M12 9v6M9 12h6" strokeWidth="1.6" /></svg>Cover</Link>
        <nav className="nav" aria-label={t("主要", "Main")}>
          <Link to="/quote" className={on("/quote")}>{t("投保", "Get covered")}</Link>
          <Link to="/policies" className={on("/policies")}>{t("我的保單", "My policies")}</Link>
          <Link to="/activity" className={on("/activity")}>{t("紀錄", "Activity")}</Link>
          <Link to="/connect" className={on("/connect")}>{t("AI agent", "AI agent")}</Link>
          <Link to="/transparency" className={on("/transparency")}>{t("帳本", "Ledger")}</Link>
          <span className="sep" aria-hidden="true" />
          <Link to="/desk" className={`staff ${on("/desk") || ""}`}>{t("理賠審核", "Claims desk")}</Link>
          <Link to="/carrier" className={`staff ${on("/carrier") || ""}`}>{t("後台", "Back office")}</Link>
        </nav>
        <div className="row" style={{ gap: 8 }}>
          <button className="btn sm" onClick={() => set(lang === "en" ? "zh" : "en")} aria-label="Language">{lang === "en" ? "中文" : "EN"}</button>
          {me ? <Link to="/policies" className="btn sm">{me.name}</Link> : <Link to="/signin" className="btn sm accent">{t("登入", "Sign in")}</Link>}
        </div>
      </div>
    </header>
  );
}

function Footer() {
  const t = useT(), { info } = useMe();
  return (
    <footer className="foot"><div className="foot-in">
      <span>{t("Cover 是在 PayPal 沙盒上的示範，不是持牌保險公司，不販售真實保險。", "Cover is a demonstration on PayPal's sandbox. It is not a licensed insurer and sells no real insurance.")}</span>
      <span>{info ? `PAYPAL ${info.paypal === "mock" ? t("模擬", "SIMULATED") : "SANDBOX"}` : ""} · <a href="/llms.txt">LLMS.TXT</a> · <a href="/.well-known/mcp.json">MCP</a> · <a href="/.well-known/cover-receipts.json">{t("收據公鑰", "RECEIPT KEYS")}</a></span>
    </div></footer>
  );
}

// The demo panel: move Cover's clock forward (premiums fall due, waiting periods end, the year closes), make the
// next premium fail, and sign in as Cover's staff to see the claims desk and the back office.
function Demo() {
  const t = useT(), { info, setInfo, toast, me } = useMe(), [open, setOpen] = useState(false), [busy, setBusy] = useState(false);
  if (!info?.demoSignin) return null;
  const run = async (fn) => { setBusy(true); try { await fn(); } catch (e) { toast(e.message); } setBusy(false); };
  const skip = (days) => run(async () => { const r = await api("/api/demo/advance", { method: "POST", body: { days } }); setInfo((i) => ({ ...i, now: r.now, demoDaysSkipped: r.skipped })); toast(t(`時間快轉 ${days} 天：現在是 ${r.now.slice(0, 10)}`, `Skipped ${days} days: it is now ${r.now.slice(0, 10)}`)); dispatchEvent(new Event("cover:refresh")); });
  return (
    <div className="demo">
      {open && <div className="demo-pop stack">
        <div><b>{t("示範控制台", "Demo panel")}</b><p className="tiny muted">{t("Cover 的時鐘", "Cover's clock")}: {info.now?.slice(0, 10)}{info.demoDaysSkipped ? ` (+${Math.round(info.demoDaysSkipped)} ${t("天", "days")})` : ""}</p></div>
        <div className="row">{[1, 15, 31].map((d) => <button key={d} className="btn ghost sm" disabled={busy} onClick={() => skip(d)}>+{d} {t("天", "days")}</button>)}</div>
        {me && info.paypal === "mock" && <button className="btn ghost sm" disabled={busy} onClick={() => run(async () => { await api("/api/demo/fail-next-premium", { method: "POST" }); toast(t("下一期保費會扣款失敗", "The next premium will be declined")); })}>{t("讓下一期保費扣款失敗", "Make the next premium fail")}</button>}
        <button className="btn ghost sm" disabled={busy} onClick={() => run(async () => { await api("/api/auth/staff", { method: "POST", body: {} }); toast(t("已用 Cover 員工身分登入", "Signed in as Cover staff")); navigate("/desk"); })}>{t("以員工身分登入（審核台、後台）", "Sign in as staff (desk, back office)")}</button>
      </div>}
      <button className="demo-btn" onClick={() => setOpen(!open)} aria-expanded={open} aria-label={t("示範控制台", "Demo panel")}>{open ? t("關閉", "Close") : t("示範控制", "Demo")}</button>
    </div>
  );
}
