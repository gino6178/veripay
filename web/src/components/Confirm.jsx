// In-page confirmation (no native confirm(), which some browsers and embedded views suppress): askConfirm({ title,
// body, ok, cancel, danger }) resolves true or false. <ConfirmHost /> is mounted once in the app shell.
import { useEffect, useRef, useState } from "react";

let open = null;
export const askConfirm = (o) => new Promise((resolve) => (open ? open({ ...o, resolve }) : resolve(window.confirm(`${o.title}\n\n${o.body || ""}`))));

export default function ConfirmHost() {
  const [c, setC] = useState(null), ok = useRef(null);
  useEffect(() => { open = setC; return () => { open = null; }; }, []);
  useEffect(() => { if (c) ok.current?.focus(); }, [c]);
  if (!c) return null;
  const done = (v) => { c.resolve(v); setC(null); };
  return (
    <div className="confirm-scrim" role="presentation" onClick={(e) => e.target === e.currentTarget && done(false)} onKeyDown={(e) => e.key === "Escape" && done(false)}>
      <div className="confirm panel marks" role="alertdialog" aria-modal="true" aria-labelledby="cf-t" aria-describedby="cf-b">
        <h3 id="cf-t">{c.title}</h3>
        {c.body && <div id="cf-b" className="small ink2 stack-s">{Array.isArray(c.body) ? c.body.map((x, i) => <p key={i}>{x}</p>) : <p>{c.body}</p>}</div>}
        <div className="row">
          <button ref={ok} className={`btn ${c.danger ? "danger" : "accent"}`} onClick={() => done(true)}>{c.ok || "Yes"}</button>
          <button className="btn" onClick={() => done(false)}>{c.cancel || "Not now"}</button>
        </div>
      </div>
    </div>
  );
}
