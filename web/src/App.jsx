// The shell: the header (customer or pro sections only; staff pages are reached from the demo panel), sign-in, the demo
// panel (demo sign-in, the platform clock, the judge tour, the back office), and the pages by address.
import { createContext, lazy, Suspense, useContext, useEffect, useRef, useState } from "react";
import { api, Link, navigate, refresh, usePath } from "./api.jsx";
import Home from "./pages/Home.jsx";
import { Jobs, JobPage } from "./pages/Jobs.jsx";
import SignIn from "./pages/SignIn.jsx";
import { Onboard, DemoOffice, AgentLink , Credits, RealHere } from "./pages/Extra.jsx";
import Tour, { startTour, resumeTour, tourProgress } from "./components/Tour.jsx";
import Safe from "./components/Safe.jsx";
import ConfirmHost from "./components/Confirm.jsx";
import Icon from "./components/Icon.jsx";
import Landing from "./components/Landing.jsx";
import { Inbox, Bell } from "./pages/Inbox.jsx";
import PinHost, { askPin, showPinOnce, ConfirmedChip } from "./components/Pin.jsx";
import { setStepUpHandler, markConfirmed } from "./api.jsx";
import { getLang, setLang, t } from "./i18n.js";
import { Why, Chip } from "./components/cards.jsx";

// the pro side can be read in Spanish; the customer side stays English
function LangSwitch() {
  const [l, setL] = useState(getLang());
  useEffect(() => { const f = () => setL(getLang()); addEventListener("done:lang", f); return () => removeEventListener("done:lang", f); }, []);
  return <span className="lang-switch" role="group" aria-label="Language / Idioma">{[["en", "EN"], ["es", "ES"]].map(([k, lb]) => <button key={k} type="button" className={l === k ? "on" : ""} aria-pressed={l === k} onClick={() => { setLang(k); api("/api/pro/settings", { method: "PUT", body: { lang: k } }).catch(() => {}); }} lang={k}>{lb}</button>)}</span>;
}
export { LangSwitch };

// person-only actions answer 403 step_up: ask for the PIN in the page (the request is then sent again)
const STEP = [[/early-pay/, "take early pay"], [/\/limits/, "change your agent's limits"], [/\/tokens/, "manage your agent's keys"], [/\/release/, "release the money"], [/\/confirm$/, "confirm the work"], [/\/changes\/.*\/approve|\/change/, "approve a change order"], [/\/scope|\/revision|\/apply/, "change the work order"], [/\/dispute/, "settle the dispute"], [/\/options/, "change the job's options"], [/\/accept/, "hire this pro"], [/\/ceiling/, "raise the price ceiling"], [/\/pro\/paypal/, "change where you're paid"], [/\/pro\/verification/, "change your licence or insurance"], [/\/pro\/keys/, "make a key for your agent"], [/early-pay/, "take early pay"], [/\/pro\//, "change your business settings"]];
setStepUpHandler(async ({ path }) => { const w = STEP.find(([re]) => re.test(path))?.[1]; return !!(await askPin({ title: w ? `Confirm it's you to ${w}` : "Confirm it's you", why: "Only you can do this; your agent can't." })); });
// AG Grid and AG Charts load only for the back office
const Office = lazy(() => import("./pages/Office.jsx"));
// pages most visitors never open load on demand, so the first page parses less script
const named = (load, name) => lazy(() => load().then((m) => ({ default: m[name] })));
const pro = () => import("./pages/Pro.jsx"), insp = () => import("./pages/Inspector.jsx"), ten = () => import("./pages/Tenancy.jsx");
const ProHome = named(pro, "ProHome"), ProJob = named(pro, "ProJob"), ProPayouts = named(pro, "ProPayouts"), ProInvoices = named(pro, "ProInvoices");
const InspectorHome = named(insp, "InspectorHome"), InspectorJob = named(insp, "InspectorJob"), Tenancy = named(ten, "Tenancy"), TenantJoin = named(ten, "TenantJoin");
const Post = lazy(() => import("./pages/Post.jsx")), Connect = lazy(() => import("./pages/Connect.jsx")), Models = lazy(() => import("./pages/Models.jsx"));
const ProProfile = lazy(() => import("./pages/ProProfile.jsx")), DemoPage = lazy(() => import("./pages/Demo.jsx"));
const Arbiter = lazy(() => import("./pages/Arbiter.jsx"));
const Earnings = lazy(() => import("./pages/Earnings.jsx"));
const Agent = lazy(() => import("./pages/Agent.jsx"));
const MyHome = lazy(() => import("./pages/MyHome.jsx"));
const Groups = lazy(() => import("./pages/Groups.jsx"));

export const Me = createContext({ me: null, reload: () => {}, info: null, toast: () => {} });
export const useMe = () => useContext(Me);

function routes(path) {
  const p = path.split("?")[0], x = (re) => p.match(re);
  let r;
  if (p === "/" || p === "") return <HomeOrAgent />;
  if (p === "/how") return <Home />;
  if (p === "/demo" || p === "/demo/") return <DemoPage />;
  if (p === "/post") return <Post />;
  if (p === "/jobs") return <Jobs />;
  if ((r = x(/^\/jobs\/([\w-]+)$/))) return <JobPage id={r[1]} />;
  if (p === "/pro") return <Suspense fallback={<div aria-busy="true"><p className="small muted">Loading…</p><div className="skel" style={{ height: 320 }} /></div>}><Agent side="pro" /></Suspense>;
  if (p === "/pro/list") return <ProHome />;
  if (p === "/pro/payouts") return <ProPayouts />;
  if (p === "/pro/invoices") return <ProInvoices />;
  if ((r = x(/^\/pro\/jobs\/([\w-]+)$/))) return <ProJob id={r[1]} />;
  if (p === "/connect") return <Connect />;
  if (p === "/inspect") return <InspectorHome />;
  if (p === "/pro/onboard") return <Onboard />;
  if (p === "/demo/office") return <DemoOffice />;
  if (p === "/link") return <AgentLink />;
  if ((r = x(/^\/inspect\/([\w-]+)$/))) return <InspectorJob id={r[1]} />;
  if ((r = x(/^\/pros\/([\w-]+)$/))) return <ProProfile id={r[1]} />;
  if ((r = x(/^\/office\/jobs\/([\w-]+)$/))) return <Suspense fallback={<div aria-busy="true"><p className="small muted">Loading…</p><div className="skel" style={{ height: 320 }} /></div>}><Arbiter id={r[1]} /></Suspense>;
  if (p === "/office") return <Suspense fallback={<div aria-busy="true"><p className="small muted">Loading…</p><div className="skel" style={{ height: 320 }} /></div>}><Office /></Suspense>;
  if (p === "/models") return <Models />;
  if (p === "/signin") return <SignIn />;
  if (p === "/credits") return <Credits />;
  if (p === "/real") return <RealHere />;
  if (p === "/tenancy") return <Tenancy />;
  if (p === "/tenant/join") return <TenantJoin />;
  if (p === "/inbox") return <Inbox />;
  if (p === "/pro/earnings") return <Suspense fallback={<div aria-busy="true"><p className="small muted">Loading…</p><div className="skel" style={{ height: 420 }} /></div>}><Earnings /></Suspense>;
  if (p === "/home") return <Suspense fallback={<div aria-busy="true"><p className="small muted">Loading…</p><div className="skel" style={{ height: 320 }} /></div>}><MyHome /></Suspense>;
  if (p === "/groups") return <Suspense fallback={<div aria-busy="true"><p className="small muted">Loading…</p><div className="skel" style={{ height: 320 }} /></div>}><Groups /></Suspense>;
  return <div className="empty"><p>Nothing at this address.</p><Link className="btn" to="/">Back to VeriPay</Link></div>;
}

// each page its own tab title
const TITLES = [[/^\/$/, "Your agent"], [/^\/post/, "Post a job"], [/^\/jobs\/?$/, "My jobs"], [/^\/jobs\//, "Job"], [/^\/pro\/earnings/, "Earnings"], [/^\/pro\/payouts/, "Payouts and verification"], [/^\/pro\/onboard/, "Welcome, pro"], [/^\/pro\/jobs\//, "Job (pro)"], [/^\/pro$/, "Your agent"], [/^\/pro\/list/, "Jobs"], [/^\/connect/, "Your AI agent"], [/^\/office/, "Back office"], [/^\/demo\/office/, "Back office (read-only)"], [/^\/models/, "Models"], [/^\/signin/, "Sign in"], [/^\/inspect/, "Inspections"], [/^\/pros\//, "Pro profile"], [/^\/link/, "Your agent needs you"], [/^\/credits/, "Photo credits"], [/^\/real/, "What's real here"], [/^\/tenancy|^\/tenant/, "Landlord and tenants"], [/^\/inbox/, "Inbox"], [/^\/pro\/earnings/, "Earnings"], [/^\/home$/, "Your home"], [/^\/groups/, "Neighborhood groups"]];
export default function App() {
  const path = usePath();
  const [, relang] = useState(0);
  useEffect(() => { const f = () => relang((x) => x + 1); addEventListener("done:lang", f); return () => removeEventListener("done:lang", f); }, []);
  useEffect(() => { document.documentElement.lang = getLang() === "es" && (me?.person?.role === "pro" || path.startsWith("/pro")) ? "es" : "en"; });
  useEffect(() => { const t = TITLES.find(([re]) => re.test(path))?.[1]; document.title = t ? `${t} · VeriPay` : "VeriPay"; }, [path]);
  const [me, setMe] = useState(undefined), [info, setInfo] = useState(null), [msg, setMsg] = useState(null);
  const reload = () => api("/api/me").then((r) => { setMe(r && r.signedIn !== false && r.person ? r : null); if (r && "steppedUpUntil" in r) markConfirmed(r.steppedUpUntil ? Date.parse(r.steppedUpUntil) : 0); else if (r?.signedIn === false) markConfirmed(0); }).catch(() => setMe(null));
  const loadInfo = () => api("/api/info").then(setInfo).catch(() => {});
  useEffect(() => { reload(); loadInfo(); addEventListener("done:refresh", loadInfo); return () => removeEventListener("done:refresh", loadInfo); }, []);
  const toast = (text, bad) => { setMsg({ text: String(text), bad }); clearTimeout(toast.t); toast.t = setTimeout(() => setMsg(null), 4200); };
  const bleed = path.split("?")[0] === "/";
  return (
    <Me.Provider value={{ me, reload, info, toast, setInfo }}>
      <a href="#main" className="sr">Skip to content</a>
      <Header path={path} />
      <ClockNotice />
      <main id="main" className={bleed ? "main bleed" : "main"}><Safe name="This page" key={path}><Suspense fallback={<div aria-busy="true"><p className="small muted">Loading…</p><div className="skel" style={{ height: 320 }} /></div>}>{routes(path)}</Suspense></Safe></main>
      <Footer />
      <Demo />
      <Tour />
      <ConfirmHost />
      <PinHost />
      {msg && <div className={`toast ${msg.bad ? "bad" : ""}`} role="status">{msg.text}</div>}
    </Me.Provider>
  );
}

function Header({ path }) {
  const { me, reload, info } = useMe(), p = path.split("?")[0];
  const on = (x) => (p === x || (x !== "/" && p.startsWith(x + "/")) ? "on" : undefined);
  const role = me?.person?.role;
  // the header's real height (it wraps to 2–3 rows on phones): the tour bar and the controls panel sit below it
  const topRef = useRef(null);
  useEffect(() => {
    const el = topRef.current; if (!el) return;
    const set = () => document.documentElement.style.setProperty("--top-h", `${el.offsetHeight}px`);
    set(); addEventListener("resize", set);
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(set) : null; ro?.observe(el);
    return () => { removeEventListener("resize", set); ro?.disconnect(); };
  }, []);
  useEffect(() => { topRef.current && document.documentElement.style.setProperty("--top-h", `${topRef.current.offsetHeight}px`); });
  const out = async () => { await api("/api/auth/signout", { method: "POST" }).catch(() => {}); await reload(); navigate("/"); };
  return (
    <header className="top" ref={topRef}>
      <div className="top-in">
        <Link to="/" className="brand" aria-label="VeriPay, home"><svg className="brand-mark" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="square" aria-hidden="true"><rect x="3.5" y="3.5" width="17" height="17" /><path d="m7.5 12.5 3 3 6-7" /></svg>VeriPay</Link>
        <Link to="/real" className="demo-tag" title="What's real here">Demo</Link>
        <nav className="nav" aria-label="Main">
          {role === "inspector" ? <Link to="/inspect" className={on("/inspect") || (p === "/inspect" ? "on" : undefined)}>Inspections</Link> : role === "pro" ? <>
            <Link to="/pro" className={p === "/pro" ? "on" : undefined}><Icon name="chat" size={16} />{t("Agent")}</Link>
            <Link to="/pro/list" className={p === "/pro/list" || p.startsWith("/pro/jobs/") ? "on" : undefined}><Icon name="list" size={16} />{t("Jobs")}</Link>
            <Link to="/pro/earnings" className={on("/pro/earnings")}>{t("Earnings")}</Link>
            <Link to="/pro/payouts" className={on("/pro/payouts")}>{t("Payouts")}</Link>
            <Link to="/pro/invoices" className={on("/pro/invoices")}>{t("Invoices")}</Link>
          </> : me ? <>
            <Link to="/" className={p === "/" ? "on" : undefined}><Icon name="chat" size={16} />Agent</Link>
            <Link to="/jobs" className={on("/jobs") || (p.startsWith("/jobs/") ? "on" : undefined)}><Icon name="list" size={16} />{role === "landlord" ? "Tenants' jobs" : "Jobs"}</Link>
            {role === "customer" && <Link to="/home" className={on("/home")}><Icon name="home" size={16} />Home</Link>}
            <More role={role} me={me} p={p} />
          </> : <>
            <Link to="/demo" className={on("/demo")}>Demo</Link>
            <Link to="/how" className={on("/how")}>How it works</Link>
            <Link to="/models" className={on("/models")}>Models</Link>
            <a href="/live-test/">Live tests</a>
          </>}
          <Link to="/real" className="nav-demo" title="What's real here">Demo</Link>
          {info?.demoSignin && <button type="button" className="ctl-ic" aria-label="Demo controls" title="Demo controls" onClick={() => dispatchEvent(new Event("done:controls"))}><Icon name="bolt" size={16} /></button>}
        </nav>
        <div className="row" style={{ gap: 8 }}>
          {me ? <>
            <Bell /><span className="role">{role === "pro" ? "PRO · " : role === "inspector" ? "INSPECTOR · " : role === "landlord" ? "LANDLORD · " : ""}{me.person.name.replace(/^Demo · /, "")}</span><ConfirmedChip />{role === "pro" && <LangSwitch />}
            <button className="btn sm" onClick={out}>Sign out</button>
          </> : me === null && p !== "/signin" ? <Link to={`/signin?mode=signin&next=${encodeURIComponent(p === "/" ? "/post" : p + location.search)}`} className="btn sm accent">Sign in</Link> : null}
        </div>
      </div>
    </header>
  );
}

function Footer() {
  const { info } = useMe();
  return (
    <footer className="foot"><div className="foot-in">
      <span><Link to="/models">MODELS</Link> · <a href="/live-test">HOW WE TESTED IT</a> · <Link to="/credits">PHOTO CREDITS</Link> · <a href="/llms.txt">LLMS.TXT</a> · <a href="/.well-known/mcp.json">MCP</a> · <a href="/.well-known/agent-card.json">A2A</a> · <a href="/.well-known/done-receipts.json">RECEIPT KEYS</a></span>
    </div></footer>
  );
}

// The demo panel: sign in as a demo customer or pro, move the platform's clock (holds age; past 3 days they are
// reauthorized, at 29 they expire), make the next hold fail, start the judge tour, open the back office as staff.
// the last demo customer this browser was, so switching to a pro, the inspector or staff never strands their jobs
const LAST = "done.lastCustomer";
export const lastCustomer = () => { try { return JSON.parse(localStorage.getItem(LAST) || "null"); } catch { return null; } };
const keepCustomer = (me) => { try { if (me?.person?.role === "customer") localStorage.setItem(LAST, JSON.stringify({ id: me.person.id, name: me.person.name.replace(/^Demo · /, "") })); } catch {} };
const fmt = (iso) => new Date(iso).toLocaleString("en-US", { timeZone: "America/Chicago", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

// a thin notice when the shared platform clock runs ahead of real time (the demo panel or the tour moved it)
// a duration in days as plain words: "40 minutes", "1 hour", "5 hours", "4 days"
const span = (days) => { const min = Math.round(days * 1440); if (min < 60) return `${Math.max(1, min)} minute${min === 1 ? "" : "s"}`; const h = Math.round(min / 60); if (h < 24) return `${h} hour${h === 1 ? "" : "s"}`; const dd = Math.round(days * 10) / 10; return `${dd} day${dd === 1 ? "" : "s"}`; };
function ClockNotice() {
  const { info } = useMe();
  const d = info?.clock?.skippedDays ?? info?.demoDaysSkipped;
  if (!info?.demoSignin || !(d > 0.01)) return null;
  return null; // the clock still runs; no banner
  const la = info.clock?.lastAdvance;
  return <div className="clock-note" role="status"><Chip tone="sim">demo clock</Chip> {span(d)} ahead · {fmt(info.now)} Austin<Why label="Details"><p>{la ? `Last moved ${la.days != null ? `${span(la.days)} ` : ""}by ${la.by || "someone"} at ${fmt(la.at)}. ` : ""}The demo's clock is shared by everyone on this server; all times here are Austin time.</p></Why></div>;
}

function Demo() {
  const { info, setInfo, toast, me, reload } = useMe(), [open, setOpen] = useState(false), [busy, setBusy] = useState(false), [pros, setPros] = useState([]), [last, setLast] = useState(lastCustomer);
  useEffect(() => { if (open && !pros.length) api("/api/pros").then(setPros).catch(() => {}); }, [open]);
  const [tuck, setTuck] = useState(false);
  useEffect(() => { const f = () => setOpen((o) => !o); addEventListener("done:controls", f); return () => removeEventListener("done:controls", f); }, []);
  useEffect(() => {
    let y = scrollY;
    const f = () => { const ny = scrollY, end = ny + innerHeight >= document.documentElement.scrollHeight - 40; setTuck(ny > y + 4 && !end && ny > 120); if (Math.abs(ny - y) > 4) y = ny; };
    addEventListener("scroll", f, { passive: true }); return () => removeEventListener("scroll", f);
  }, []);
  useEffect(() => { if (me?.person?.role === "customer") { keepCustomer(me); setLast(lastCustomer()); } }, [me]);
  if (!info?.demoSignin) return null;
  const run = async (fn) => { setBusy(true); try { await fn(); } catch (e) { toast(e.message, true); } setBusy(false); };
  const skip = (body, label) => run(async () => { const r = await api("/api/demo/advance", { method: "POST", body }); setInfo((i) => ({ ...i, now: r.now, demoDaysSkipped: r.skipped })); toast(`Clock moved ${label} for everyone on this server: now ${fmt(r.now)} in Austin`); refresh(); });
  // switching away from a customer signs them out of this browser: say so, and how to come back
  const leaving = () => (me?.person?.role === "customer" ? me.person.name.replace(/^Demo · /, "") : null);
  const switchTo = (body, to, label) => run(async () => { const was = leaving();
    const needsPin = body.as === "pro" || body.as === "inspector" || (body.as === "landlord" && body.demo);
    const r = needsPin ? await askPin({ title: `Sign in as ${label}`, why: `Signing in as ${label} needs their PIN.`, hint: body.as === "pro" ? "Every demo pro's PIN is 8642." : body.as === "landlord" ? "The demo landlord's PIN is 9753." : "The demo inspector's PIN is 1357.", ok: "Sign in", submit: (pin) => api("/api/auth/demo", { method: "POST", body: { ...body, pin } }) }) : await api("/api/auth/demo", { method: "POST", body });
    if (!r) return; if (r.pinOnce) await showPinOnce(r.pinOnce); await reload(); setOpen(false); navigate(to); toast(was ? `Signed out of ${was}; now ${label}. Come back with “Back to ${was}” in the Demo panel.` : `Now ${label}.`); });
  const back = () => run(async () => { const r = await askPin({ title: `Back to ${last.name}`, why: `Coming back as ${last.name} needs their PIN.`, hint: "Demo customers made by the seed use 2468.", ok: "Sign in", submit: (pin) => api("/api/auth/demo", { method: "POST", body: { as: "customer", person: last.id, pin } }) }); if (!r) return; await reload(); setOpen(false); navigate("/jobs"); toast(`Back as ${last.name}.`); });
  const isMe = me?.person?.role === "customer" && me.person.id === last?.id;
  return (
    <div className={`demo ${tuck && !open ? "tucked" : ""}`}>
      {open && <div className="demo-pop stack" role="dialog" aria-label="Demo panel">
        <div><b>Demo panel</b><p className="tiny muted">Signed in as {me ? `${me.person.name.replace(/^Demo · /, "")} (${me.person.role})` : "nobody"}. Platform clock: {info.now ? fmt(info.now) : "…"} Austin{info.demoDaysSkipped ? ` (+${Math.round(info.demoDaysSkipped * 10) / 10} days)` : ""}.</p></div>
        {tourProgress() > 0 && <button className="btn sm accent" onClick={() => { setOpen(false); resumeTour(); }}>Resume the judge tour</button>}
        <button className={`btn sm ${tourProgress() > 0 ? "" : "accent"}`} onClick={() => { setOpen(false); startTour(); }}>{tourProgress() > 0 ? "Start the tour over" : "Judge tour (about 3 minutes)"}</button>
        <div className="stack-s"><span className="eyebrow">SWITCH WHO YOU ARE</span>
          {last && !isMe && <button className="btn sm accent" disabled={busy} onClick={back}>Back to {last.name} (customer)</button>}
          <button className="btn sm" disabled={busy} onClick={() => switchTo({ as: "customer" }, "/post", "a new demo customer")}>A new demo customer</button>
          <select className="input sm" disabled={busy} value="" onChange={(e) => e.target.value && switchTo({ as: "pro", pro: e.target.value }, "/pro", `a demo pro (${pros.find((p) => p.id === e.target.value)?.name || e.target.value})`)} aria-label="Switch to a demo pro"><option value="">A demo pro…</option>{pros.map((p) => <option key={p.id} value={p.id}>{p.name} · {p.trade}</option>)}</select>
          <button className="btn sm" disabled={busy} onClick={() => switchTo({ as: "landlord", demo: true }, "/tenancy", "the demo landlord")}>The demo landlord</button>
          <button className="btn sm" disabled={busy} onClick={() => switchTo({ as: "inspector" }, "/inspect", "the demo inspector")}>The demo inspector</button>
          {leaving() && <p className="tiny muted">Switching signs {leaving()} out of this browser; “Back to {leaving()}” returns with their jobs.</p>}
        </div>
        <div className="stack-s"><span className="eyebrow">DEMO STAFF</span>
          <button className="btn sm" disabled={busy} onClick={() => run(async () => { await api("/api/auth/staff", { method: "POST", body: {} }); setOpen(false); navigate("/office"); toast("Signed in as Demo staff: the back office. Your customer or pro sign-in stays as it was."); })}>Sign in as Demo staff (back office)</button>
          <button className="btn sm" disabled={busy} onClick={() => run(async () => { await api("/api/auth/staff/signout", { method: "POST", body: {} }); toast("Signed out of Demo staff."); if (location.pathname.startsWith("/office")) navigate("/"); })}>Sign out of Demo staff</button>
          <Link className="link small" to="/demo/office" onClick={() => setOpen(false)}>Or look without signing in: the read-only, anonymised back office</Link>
          <p className="tiny muted">Staff pages show every customer's jobs; in a real deployment only staff can open them.</p>
        </div>
        <div className="stack-s"><span className="eyebrow">MOVE THE CLOCK · AFFECTS EVERYONE ON THIS SERVER</span><div className="row" style={{ gap: 6 }}>
          <button className="btn sm" disabled={busy} onClick={() => skip({ hours: 6 }, "6 hours")}>+6 h</button>
          <button className="btn sm" disabled={busy} onClick={() => skip({ days: 4 }, "4 days")} title="Past the 3-day guarantee: holds are reauthorized">+4 days</button>
          <button className="btn sm" disabled={busy} onClick={() => skip({ days: 30 }, "30 days")} title="Past 29 days: holds expire and are voided">+30 days</button>
        </div></div>
        {me?.person?.role === "customer" && info.paypal === "mock" && <button className="btn sm" disabled={busy} onClick={() => run(async () => { await api("/api/demo/fail-next-hold", { method: "POST" }); toast("The next hold on your saved payment method will be declined."); })}>Make my next hold fail</button>}
      </div>}
      <button className="demo-btn" onClick={() => setOpen(!open)} aria-expanded={open}>{open ? "CLOSE" : "CONTROLS"}</button>
    </div>
  );
}

// "More": the rest of the site, one tap away (a real disclosure, closed when you pick something)
function More({ role, me, p }) {
  const [open, setOpen] = useState(false), ref = useRef(null);
  useEffect(() => { if (!open) return; const f = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); }; addEventListener("pointerdown", f); return () => removeEventListener("pointerdown", f); }, [open]);
  const items = [
    role === "customer" && ["/post", "Post a job (form)"],
    role === "customer" && ["/groups", "Neighborhood groups"],
    role === "landlord" ? ["/tenancy", "Tenants"] : role === "customer" && ["/tenancy", me?.person?.tenancy?.role === "tenant" ? "Your landlord" : "Renting?"],
    ["/inbox", "Inbox"],
    ["/connect", "Connect your own agent"],
    ["/demo/office", "Back office (read-only)"],
    ["/models", "Models"],
    ["/how", "How it works"],
    ["/live-test/", "Live tests", true],
  ].filter(Boolean);
  return (
    <div className="more" ref={ref}>
      <button type="button" className={`more-b ${items.some(([h]) => p === h) ? "on" : ""}`} aria-expanded={open} aria-haspopup="true" onClick={() => setOpen(!open)}><Icon name="more" size={16} />More</button>
      {open && <div className="more-m" role="menu">{items.map(([h, l, ext]) => ext ? <a key={h} role="menuitem" href={h}>{l}</a> : <Link key={h} role="menuitem" to={h} onClick={() => setOpen(false)}>{l}</Link>)}</div>}
    </div>
  );
}

// signed in: the conversation with your agent; signed out: one line and a big "Try it"
function HomeOrAgent() {
  const { me, reload, toast } = useMe();
  const [busy, setBusy] = useState(false);
  if (me === undefined) return <div className="skel" style={{ height: 320 }} />;
  if (me?.person?.role === "pro") { navigate("/pro", { replace: true }); return null; }
  if (me?.person?.role === "inspector") { navigate("/inspect", { replace: true }); return null; }
  if (me) return <Suspense fallback={<div aria-busy="true"><p className="small muted">Loading…</p><div className="skel" style={{ height: 320 }} /></div>}><Agent /></Suspense>;
  const tryIt = async () => { setBusy(true); try { const r = await api("/api/auth/demo", { method: "POST", body: { as: "customer" } }); if (r.pinOnce) await showPinOnce(r.pinOnce); await reload(); } catch (e) { toast(e.message, true); } setBusy(false); };
  return <Landing tryIt={tryIt} busy={busy} reload={reload} toast={toast} />;
}
