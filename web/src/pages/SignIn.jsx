// Demo sign-in: as a customer (a name is enough) or as one of the demo pros. No passwords in the demo.
import { useEffect, useState } from "react";
import { api, navigate } from "../api.jsx";
import { useMe } from "../App.jsx";
import { showPinOnce, PIN_WHY, PIN_WINDOW } from "../components/Pin.jsx";

function DemoForm() {
  const { reload, toast, info } = useMe();
  const q = new URLSearchParams(location.search), back = q.get("next") || "/post";
  const [as, setAs] = useState(["pro", "inspector"].includes(q.get("as")) ? q.get("as") : "customer"), [name, setName] = useState(""), [pin, setPin] = useState(""), [demoLL, setDemoLL] = useState(false), [zip, setZip] = useState("78704"), [pros, setPros] = useState([]), [pro, setPro] = useState(""), [busy, setBusy] = useState(false);
  useEffect(() => { api("/api/pros").then((p) => { setPros(p); setPro(p[0]?.id || ""); }).catch(() => {}); }, []);
  const go = async (e) => {
    e.preventDefault(); setBusy(true);
    try {
      const r = await api("/api/auth/demo", { method: "POST", body: as === "pro" ? { as: "pro", pro, pin } : as === "inspector" ? { as: "inspector", pin } : as === "landlord" ? (demoLL ? { as: "landlord", demo: true, pin } : { as: "landlord", name: name.trim() || undefined, ...(pin ? { pin } : {}) }) : { as: "customer", name: name.trim() || undefined, zip: /^\d{5}$/.test(zip) ? zip : undefined, ...(pin ? { pin } : {}) } });
      if (r.pinOnce) await showPinOnce(r.pinOnce);
      await reload(); navigate(as === "pro" ? "/pro" : as === "inspector" ? "/inspect" : as === "landlord" ? "/tenancy" : back.startsWith("/pro") || back.startsWith("/inspect") ? "/post" : back);
    } catch (err) { toast(err.message, true); }
    setBusy(false);
  };
  const sel = pros.find((p) => p.id === pro);
  if (info && !info.demoSignin) return <p className="small ink2">Demo sign-in is off on this server.</p>;
  return (
    <form className="stack" onSubmit={go}>
      <p className="small ink2">This makes a throwaway demo identity: no email and nothing real, just a short PIN that proves later actions are yours. It lives only on this demo server, and no real money moves.</p>
      <div className="seg" role="radiogroup" aria-label="Sign in as">
        <button type="button" role="radio" aria-checked={as === "customer"} className={as === "customer" ? "on" : ""} onClick={() => { setAs("customer"); setPin(""); }}>I need a job done</button>
        <button type="button" role="radio" aria-checked={as === "pro"} className={as === "pro" ? "on" : ""} onClick={() => { setAs("pro"); setPin(""); }}>I'm a pro</button>
        <button type="button" role="radio" aria-checked={as === "landlord"} className={as === "landlord" ? "on" : ""} onClick={() => { setAs("landlord"); setPin(""); }}>Landlord</button>
        <button type="button" role="radio" aria-checked={as === "inspector"} className={as === "inspector" ? "on" : ""} onClick={() => { setAs("inspector"); setPin(""); }}>Inspector</button>
      </div>
      {as === "landlord" ? <>
        <p className="small ink2">A landlord or property manager: your tenants post repairs, and you (or your agent, within your limits) hire, approve and pay with your own PayPal and PIN.</p>
        <label className="check-row"><input type="checkbox" checked={demoLL} onChange={(e) => { setDemoLL(e.target.checked); setPin(""); }} /><span>Sign in as the demo landlord, Riverside Property Management (its PIN is 9753)</span></label>
        {!demoLL && <div className="fields-3"><label className="field"><span>YOUR NAME OR COMPANY (OPTIONAL)</span><input className="input" value={name} onChange={(e) => setName(e.target.value)} /></label>
          <label className="field"><span>CHOOSE A PIN (4–6 DIGITS, OPTIONAL)</span><input className="input mono" type="password" inputMode="numeric" autoComplete="new-password" maxLength={6} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} /></label></div>}
        {demoLL && <label className="field"><span>THE DEMO LANDLORD'S PIN</span><input className="input mono pin-in" type="password" inputMode="numeric" autoComplete="off" maxLength={6} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} /></label>}
      </> : as === "inspector" ? <p className="small ink2">Capitol Home Inspections: a third-party inspector. Customers can name them on a job; milestones marked for inspection wait for their confirmation.</p> : as === "customer" ? <>
        <p className="small ink2">Any name will do (or none). Continue makes a new demo customer in Austin, TX. (If you later connect an AI agent, it's limited to $500 a job and $1,500 a month until you change that.)</p>
        <div className="fields-3"><label className="field"><span>YOUR NAME (OPTIONAL)</span><input className="input" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" placeholder="Jordan" /></label>
        <label className="field"><span>YOUR AUSTIN ZIP</span><input className="input" inputMode="numeric" maxLength={5} value={zip} onChange={(e) => setZip(e.target.value)} autoComplete="postal-code" /></label></div>
        <label className="field"><span>CHOOSE A PIN (4–6 DIGITS, OPTIONAL)</span><input className="input mono" type="password" inputMode="numeric" autoComplete="new-password" maxLength={6} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} aria-describedby="pin-help" />
          <span id="pin-help" className="tiny muted" style={{ marginTop: 4 }}>You'll need it to come back as this customer and to pay, change limits or approve changes. Leave it empty and we'll make one and show it once. {PIN_WHY} {PIN_WINDOW}</span></label>
      </> : <>
        <p className="small ink2">Pick one of the fictional Austin pros. Their PayPal is already verified, so payouts can only go there.</p>
        <label className="field"><span>DEMO PRO</span><select className="input" value={pro} onChange={(e) => setPro(e.target.value)}>{pros.map((p) => <option key={p.id} value={p.id}>{p.name} · {p.trade}</option>)}</select></label>
        {sel && <ul className="spec"><li><span className="lead">Owner</span><span className="val">{sel.owner}</span></li><li><span className="lead">Rating</span><span className="val">{sel.rating} · {sel.jobs} jobs</span></li><li><span className="lead">License</span><span className="val">{sel.license}</span></li><li><span className="lead">Call-out / hourly</span><span className="val">{sel.rules?.callout} / {sel.rules?.hourly}</span></li><li><span className="lead">Paid to</span><span className="val">{sel.payout?.to} {sel.payout?.verified ? "(verified)" : ""}</span></li></ul>}
      </>}
      {(as === "pro" || as === "inspector") && <label className="field"><span>{as === "pro" ? "THE PRO'S PIN" : "THE INSPECTOR'S PIN"}</span><input className="input mono pin-in" type="password" inputMode="numeric" autoComplete="off" maxLength={6} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} aria-describedby="pin-help2" />
        <span id="pin-help2" className="tiny muted" style={{ marginTop: 4 }}>{as === "pro" ? "Every demo pro's PIN is 8642." : "The demo inspector's PIN is 1357."} {PIN_WHY} A pro who onboarded signs in from their own link instead.</span></label>}
      <button className={`btn accent ${busy ? "busy" : ""}`} disabled={busy || (as === "pro" && !pro) || (as === "customer" || (as === "landlord" && !demoLL) ? pin !== "" && !/^\d{4,6}$/.test(pin) : !/^\d{4,6}$/.test(pin))}>Continue</button>
    </form>
  );
}

// Real accounts: make one (email, password, PIN), or sign in again with email and password. The demo stays a tab.
const TRADES = [["plumbing", "Plumbing"], ["handyman", "Handyman"], ["cleaning", "Cleaning"]];
function Field({ label, hint, ...rest }) {
  return <label className="field"><span>{label}</span><input className="input" {...rest} />{hint && <span className="tiny muted" style={{ marginTop: 4 }}>{hint}</span>}</label>;
}
function SignUp({ done }) {
  const { toast } = useMe();
  const [role, setRole] = useState("customer"), [f, setF] = useState({ name: "", email: "", password: "", pin: "", zip: "", business: "", trade: "plumbing", paypalEmail: "" }), [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: k === "pin" || k === "zip" ? e.target.value.replace(/\D/g, "") : e.target.value });
  const ok = f.name.trim() && /\S+@\S+\.\S+/.test(f.email) && f.password.length >= 8 && /^\d{4,6}$/.test(f.pin) && (!f.zip || /^\d{5}$/.test(f.zip)) && (role === "customer" || f.business.trim());
  const go = async (e) => {
    e.preventDefault(); setBusy(true);
    try { const r = await api("/api/auth/signup", { method: "POST", body: { role, ...f, zip: f.zip || undefined, paypalEmail: f.paypalEmail || undefined } }); await done(r, role); }
    catch (err) { toast(err.message, true); }
    setBusy(false);
  };
  return (
    <form className="stack" onSubmit={go}>
      <div className="seg" role="radiogroup" aria-label="Account type">
        <button type="button" role="radio" aria-checked={role === "customer"} className={role === "customer" ? "on" : ""} onClick={() => setRole("customer")}>I need work done</button>
        <button type="button" role="radio" aria-checked={role === "pro"} className={role === "pro" ? "on" : ""} onClick={() => setRole("pro")}>I'm a pro</button>
      </div>
      <Field label="YOUR NAME" value={f.name} onChange={set("name")} autoComplete="name" required />
      {role === "pro" && <div className="fields-3">
        <Field label="BUSINESS NAME" value={f.business} onChange={set("business")} autoComplete="organization" required />
        <label className="field"><span>TRADE</span><select className="input" value={f.trade} onChange={set("trade")}>{TRADES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
      </div>}
      <Field label="EMAIL" type="email" value={f.email} onChange={set("email")} autoComplete="email" required />
      <div className="fields-3">
        <Field label="PASSWORD" type="password" value={f.password} onChange={set("password")} autoComplete="new-password" minLength={8} required hint="At least 8 characters." />
        <Field label="PIN (4–6 DIGITS)" type="password" inputMode="numeric" maxLength={6} value={f.pin} onChange={set("pin")} autoComplete="off" required hint="Approves payments and changes. Your agent never gets it." />
      </div>
      <div className="fields-3">
        <Field label="ZIP CODE" inputMode="numeric" maxLength={5} value={f.zip} onChange={set("zip")} autoComplete="postal-code" placeholder="78704" />
        {role === "pro" && <Field label="PAYPAL EMAIL YOU'RE PAID TO" type="email" value={f.paypalEmail} onChange={set("paypalEmail")} placeholder="Same as above" hint="You verify it next; customers can hire you after that." />}
      </div>
      <button className={`btn accent ${busy ? "busy" : ""}`} disabled={busy || !ok}>Create account</button>
    </form>
  );
}
function LogIn({ done }) {
  const { toast } = useMe();
  const [email, setEmail] = useState(""), [password, setPassword] = useState(""), [busy, setBusy] = useState(false);
  const go = async (e) => {
    e.preventDefault(); setBusy(true);
    try { const r = await api("/api/auth/login", { method: "POST", body: { email, password } }); await done(r, r.person?.role); }
    catch (err) { toast(err.message, true); }
    setBusy(false);
  };
  return (
    <form className="stack" onSubmit={go}>
      <Field label="EMAIL" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
      <Field label="PASSWORD" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
      <button className={`btn accent ${busy ? "busy" : ""}`} disabled={busy || !email || !password}>Sign in</button>
    </form>
  );
}
export default function SignIn() {
  const { reload } = useMe();
  const q = new URLSearchParams(location.search), back = q.get("next") || "/";
  const [tab, setTab] = useState(["signin", "demo"].includes(q.get("mode")) ? q.get("mode") : q.get("as") ? "demo" : "signup");
  const done = async (r, role) => { await reload(); navigate(role === "pro" ? (r.readiness && !r.readiness.hireable ? "/pro/payouts" : "/pro") : role === "inspector" ? "/inspect" : role === "landlord" ? "/tenancy" : back.startsWith("/pro") ? "/" : back); };
  const TABS = [["signup", "Create account"], ["signin", "Sign in"], ["demo", "Quick demo"]];
  return (
    <div className="panel marks stack" style={{ maxWidth: 560, margin: "32px auto" }}>
      <h1 style={{ fontSize: "var(--fs-h2)" }}>{tab === "signin" ? "Welcome back" : tab === "demo" ? "Try it without an account" : "Create your account"}</h1>
      <div className="seg" role="tablist" aria-label="Sign in or create an account">
        {TABS.map(([k, l]) => <button key={k} type="button" role="tab" aria-selected={tab === k} className={tab === k ? "on" : ""} onClick={() => setTab(k)}>{l}</button>)}
      </div>
      {tab === "signup" ? <SignUp done={done} /> : tab === "signin" ? <LogIn done={done} /> : <DemoForm />}
    </div>
  );
}
