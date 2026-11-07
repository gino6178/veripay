// The person's PIN: proves an action comes from the person, not their agent (in production this is Log in with PayPal).
// askPin({ title, why, submit }) shows an in-page dialog; submit(pin) defaults to POST /api/auth/step-up. It resolves the
// submit's result, or null when the person cancels. Wrong PINs and the 15-minute lockout are shown in the dialog.
// showPinOnce(pin) shows a PIN the server made, once. <PinHost /> is mounted once in the app shell.
import { useEffect, useRef, useState } from "react";
import { confirmedUntil } from "../api.jsx";

let open = null;
export const PIN_WHY = "Your PIN proves it's you, not your agent (in production: Log in with PayPal).";
export const PIN_WINDOW = "Signing in with it confirms it's you for 10 minutes; after that we ask for your PIN again before paying, releasing, approving a change or changing limits.";

// a small chip while the person is confirmed: "Confirmed until 3:42 PM"
export function ConfirmedChip() {
  const [until, setUntil] = useState(confirmedUntil()), [, tick] = useState(0);
  useEffect(() => { const f = () => setUntil(confirmedUntil()); addEventListener("done:confirmed", f); const t = setInterval(() => tick((x) => x + 1), 30e3); return () => { removeEventListener("done:confirmed", f); clearInterval(t); }; }, []);
  if (!until || until < Date.now()) return null;
  return <span className="badge good confirmed-chip" title="You confirmed it's you with your PIN. Until then, paying, releasing and changing limits won't ask again; after it, they ask for your PIN.">PIN ✓<span className="chip-until"> until {new Date(until).toLocaleTimeString("en-US", { timeZone: "America/Chicago", hour: "numeric", minute: "2-digit" })}</span></span>;
}

async function stepUp(pin) {
  const r = await fetch("/api/auth/step-up", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pin }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(j.message || `HTTP ${r.status}`), { status: r.status, body: j });
  return j;
}
export const askPin = (o = {}) => new Promise((resolve) => (open ? open({ kind: "ask", submit: stepUp, ...o, resolve }) : resolve(null)));
export const showPinOnce = (pin, use) => new Promise((resolve) => (open ? open({ kind: "once", pin, use, resolve }) : resolve(true)));

export default function PinHost() {
  const [c, setC] = useState(null), [pin, setPin] = useState(""), [err, setErr] = useState(null), [busy, setBusy] = useState(false), input = useRef(null);
  useEffect(() => { open = (x) => { setPin(""); setErr(null); setBusy(false); setC(x); }; return () => { open = null; }; }, []);
  useEffect(() => { if (c) setTimeout(() => input.current?.focus(), 0); }, [c]);
  if (!c) return null;
  const done = (v) => { c.resolve(v); setC(null); };
  const ok = /^\d{4,6}$/.test(pin);
  const go = async (e) => {
    e.preventDefault(); if (!ok || busy) return;
    setBusy(true); setErr(null);
    try { done(await c.submit(pin)); }
    catch (x) { setPin(""); setErr(x.body?.locked || x.status === 429 ? `Locked: ${x.message}` : x.message); input.current?.focus(); }
    setBusy(false);
  };
  if (c.kind === "once") return (
    <div className="confirm-scrim" role="presentation">
      <div className="confirm panel marks stack-s" role="alertdialog" aria-modal="true" aria-labelledby="pin-t">
        <h3 id="pin-t">Your PIN: <span className="pin-once mono" aria-label={`PIN ${c.pin.split("").join(" ")}`}>{c.pin}</span></h3>
        <p className="small ink2">You'll need it to confirm payments.</p>
        <div className="row"><button className="btn accent" onClick={() => done(true)}>Got it</button></div>
      </div>
    </div>
  );
  return (
    <div className="confirm-scrim" role="presentation" onClick={(e) => e.target === e.currentTarget && done(null)} onKeyDown={(e) => e.key === "Escape" && done(null)}>
      <form className="confirm panel marks stack-s" role="dialog" aria-modal="true" aria-labelledby="pin-t" onSubmit={go}>
        <h3 id="pin-t">{c.title || "Confirm it's you"}</h3>
        <label className="field"><span>YOUR PIN (4–6 DIGITS)</span>
          <input ref={input} className="input mono pin-in" type="password" inputMode="numeric" autoComplete="off" maxLength={6} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} aria-invalid={!!err} aria-describedby={err ? "pin-err" : undefined} /></label>
        {err && <p id="pin-err" className="note bad small" role="alert">{err}</p>}
        {c.hint && <p className="tiny muted">{c.hint}</p>}
        <div className="row">
          <button className={`btn accent ${busy ? "busy" : ""}`} disabled={!ok || busy}>{c.ok || "Confirm"}</button>
          <button type="button" className="btn" onClick={() => done(null)}>Cancel</button>
        </div>
      </form>
    </div>
  );
}
