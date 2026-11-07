// More parts of the work order: milestones, the fee on every release, the review window, retainage and the warranty
// (with the defect claim), the scope review at acceptance, before/after pairs, the rating, a photo picker that reads
// files to data URLs (camera on phones), a pro's verified badges, and a live countdown.
import { useEffect, useState } from "react";
import { m, when, day } from "../api.jsx";
import { Status, Stamp, Src, Evidence } from "./job.jsx";
import Icon from "./Icon.jsx";

const MS = { open: ["Open", ""], submitted: ["Evidence in", "signal"], checking: ["Checking", "signal"], needs_fix: ["Needs a fix", "warn"], review: ["Review", "warn"], passed: ["Passed", "good"], disputed: ["Disputed", "bad"], released: ["Paid", "good"], resolved: ["Settled", "good"] };
export const MsStatus = ({ s }) => { const [l, c] = MS[s] || [s, ""]; return <span className={`badge ${c}`}>{l}</span>; };

// time left until an ISO moment, ticking every 30 s
export function useLeft(iso, now) {
  const [t, setT] = useState(Date.now());
  useEffect(() => { const i = setInterval(() => setT(Date.now()), 30e3); return () => clearInterval(i); }, []);
  if (!iso) return null;
  const skew = now ? Date.parse(now) - Date.now() : 0; // the platform clock may be moved forward in the demo
  return Date.parse(iso) - (t + skew);
}
export const fmtLeft = (ms) => (ms == null ? "—" : ms <= 0 ? "due now" : ms < 3600e3 ? `${Math.round(ms / 60e3)} min` : ms < 48 * 3600e3 ? `${(ms / 3600e3).toFixed(1)} h` : `${Math.round(ms / 864e5)} days`);

export function Milestones({ job, onPick, pick }) {
  const ms = job.milestones || [];
  if (ms.length < 2) return null;
  return (
    <ol className="mss" aria-label="Milestones">
      {ms.map((x, i) => (
        <li key={x.id} className={`ms ${x.current ? "cur" : ""} ${["released", "resolved"].includes(x.status) ? "paid" : ""}`}>
          <button type="button" className="ms-btn" onClick={() => onPick?.(x.id)} aria-pressed={pick === x.id}>
            <span className="ms-n">{i + 1}</span>
            <span className="ms-t"><b>{x.title}</b><span className="data">{x.checkIds.length} conditions{x.inspect ? " · inspector confirms" : ""}{x.current ? " · CURRENT" : ""}</span></span>
            <span className="ms-a"><span className="mono">{x.due || x.amount ? m(x.due || x.amount) : `${Math.round((x.share || 0) * 100)}% of the price`}</span><MsStatus s={x.status} /></span>
          </button>
          {x.passed?.waiting && <p className="tiny warn ms-x">{x.passed.waiting === "inspector" ? "Waiting for the inspector to confirm." : `Review window: releases ${when(x.passed.until)} unless the customer disputes.`}</p>}
          {x.inspection && <p className="tiny ms-x"><span className={x.inspection.verdict === "pass" ? "ok" : "bad"}>Inspector {x.inspection.verdict === "pass" ? "confirmed" : "rejected"}</span> · {x.inspection.name}{x.inspection.note ? `: “${x.inspection.note}”` : ""}</p>}
          {x.earlyPay && <p className="tiny ms-x">Early pay taken: {m(x.earlyPay.amount)} (fee {m(x.earlyPay.fee)}) · batch <span className="mono">{x.earlyPay.batchId}</span></p>}
          {x.release && <p className="tiny ms-x ok">{m(x.release.release)} released · fee {m(x.release.fee)} ({Math.round((x.release.feeRate || 0.1) * 100)}%){x.release.retained?.cents ? ` · ${m(x.release.retained)} retained` : ""}{x.release.refunded?.cents ? ` · ${m(x.release.refunded)} refunded` : ""} · {day(x.release.at)}</p>}
        </li>
      ))}
    </ol>
  );
}

// the fee on every release: what was released, the 10% fee, where the rest went
export function Releases({ job }) {
  const r = job.money?.releases || [];
  if (!r.length) return null;
  return (
    <div className="stack-s">
      <span className="eyebrow">EVERY RELEASE AND ITS FEE</span>
      <ul className="spec">{r.map((x, i) => <li key={i}><span className="lead">{x.title || x.milestone}</span><span className="val">{m(x.release)} · fee {m(x.fee)}</span></li>)}</ul>
      {r.map((x, i) => <p key={i} className="tiny muted">{x.says}{x.payout ? ` Batch ${x.payout}.` : ""}</p>)}
      {job.money?.earlyPayFees?.cents > 0 && <p className="tiny muted">Early-pay fees paid by the pro: {m(job.money.earlyPayFees)}.</p>}
    </div>
  );
}

// how a scope review reads in one line: what must be settled, what is worth fixing
export function reviewSummary(r) {
  const g = r?.gaps || [], n = (x) => g.filter((y) => y.severity === x).length, hi = n("high"), md = n("medium"), lo = n("low");
  if (!g.length) return ["Nothing vague or uncheckable found.", "good"];
  const parts = [hi && `${hi} to settle before work`, md && `${md} worth fixing`, lo && `${lo} minor`].filter(Boolean).join(", ");
  return [hi ? `${parts}.` : `Nothing blocks the work; ${parts}.`, hi ? "bad" : "warn"];
}

export function ScopeReview({ r, job, busy, act, onApply, applyGap }) {
  if (!r) return null;
  const S = { high: "bad", medium: "warn", low: "" };
  const [line, tone] = reviewSummary(r);
  const editable = job ? ["draft", "scoped", "offered"].includes(job.status) : !!applyGap;
  return (
    <section className="panel stack-s" aria-labelledby="h-sr">
      <div className="panel-h"><h3 id="h-sr">{job ? "Scope review" : "Scope review before you post"}</h3><span className="row" style={{ gap: 6 }}><Src s={r.source} /><span className={`badge ${tone}`}>{line}</span></span></div>
      <p className="small ink2">Looks for words nobody can check: vague taste words, promises about the future, missing evidence, and permits or licences the job needs.</p>
      <ul className="gaps">{(r.gaps || []).map((g, i) => <li key={i}>
        <span className={`badge ${S[g.severity] || ""}`}>{g.severity}{g.kind ? ` · ${g.kind}` : ""}</span><span className="small">{g.what}</span>
        {g.suggestion && <span className="small ink2">Suggested: “{g.suggestion}” {applyGap && <button type="button" className="link" onClick={() => applyGap(g)}>{g.checkId ? "Use this wording" : "Add this condition"}</button>}</span>}
      </li>)}</ul>
      {r.disputeRisk && <p className="small">Chance of a dispute: {Math.round((r.disputeRisk.score ?? r.disputeRisk) * 100)}%{r.disputeRisk.points?.length ? ` (${r.disputeRisk.points.join("; ")})` : ""}</p>}
      {r.evidencePlan?.length > 0 && <details><summary>EVIDENCE PLAN ({r.evidencePlan.length})</summary><ul className="spec">{r.evidencePlan.map((p, i) => <li key={i}><span className="lead">{p.checkId}</span><span className="val">{[p.before && `before: ${p.before}`, p.after && `after: ${p.after}`, p.receipt && `receipt: ${p.receipt}`].filter(Boolean).join(" · ")}</span></li>)}</ul></details>}
      {onApply && r.revisedScope && <button type="button" className="btn sm" onClick={onApply}>Apply every suggestion</button>}
      {job && editable && r.revisedScope && <button className={`btn sm ${busy === "rev" ? "busy" : ""}`} disabled={!!busy} onClick={() => act("rev", `/api/jobs/${job.id}/scope/apply-revision`, { from: "review" })}>Apply the suggested rewrite{job.status === "offered" ? " (offers are asked for again)" : ""}</button>}
      {job && !editable && (r.gaps || []).length > 0 && <p className="tiny muted">The order is already agreed, so it can't be rewritten now. Settle a gap with the pro in the messages, as a change order, or with a note; the checks run on the agreed wording.</p>}
    </section>
  );
}

// before and after (and the customer's problem photo) for one condition
export function Pairs({ job, checkId }) {
  const ev = job.evidence.filter((e) => e.checkId === checkId);
  const before = ev.filter((e) => e.phase === "before"), after = ev.filter((e) => (!e.phase || e.phase === "after") && !e.forChange), other = ev.filter((e) => ["inspection", "defect"].includes(e.phase));
  if (!ev.length) return null;
  return (
    <div className="pairs">
      {before.length > 0 && <div><span className="eyebrow">BEFORE</span><Evidence items={before} job={job} /></div>}
      {after.length > 0 && <div><span className="eyebrow">AFTER</span><Evidence items={after} job={job} /></div>}
      {other.length > 0 && <div><span className="eyebrow">OTHER</span><Evidence items={other} job={job} /></div>}
    </div>
  );
}

// read files (a phone's camera or the file picker) to data URLs
export const readData = (f) => new Promise((ok, bad) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = bad; r.readAsDataURL(f); });
export function PhotoPicker({ files, setFiles, label = "Add photos", multiple = true, capture = true, small }) {
  return (
    <label className={`drop ${small ? "sm" : ""}`} style={{ position: "relative" }}>
      <Icon name="camera" />
      <span>{files?.length ? files.map((f) => f.name).join(", ") : label}</span>
      <input type="file" accept="image/jpeg,image/png,image/webp" multiple={multiple} capture={capture ? "environment" : undefined} onChange={(e) => setFiles([...e.target.files])} />
    </label>
  );
}

export function Warranty({ job, as, busy, act }) {
  const w = job.warranty, [reason, setReason] = useState(""), [files, setFiles] = useState([]);
  if (!w) return null;
  const open = w.status === "open" && Date.parse(w.until) > Date.now() - 864e5 * 365;
  const S = { open: ["Open", "signal"], claimed: ["Defect claimed", "warn"], released: ["Retainage paid", "good"], refunded: ["Refunded", ""], waiting_for_paypal: ["Waiting for the pro's PayPal", "warn"], payout_failed: ["Payout failed", "bad"] }[w.status] || [w.status, ""];
  const claim = async () => { const items = await Promise.all(files.map(async (f) => ({ dataUrl: await readData(f) }))); act("defect", `/api/jobs/${job.id}/defect`, { reason, items }, () => { setReason(""); setFiles([]); }); };
  return (
    <div className="panel marks stack-s">
      <div className="panel-h"><h3>Retainage and warranty</h3><span className={`badge ${S[1]}`}>{S[0]}</span></div>
      <ul className="spec">
        <li><span className="lead">Held back from the pro</span><span className="val">{m(w.retained)}</span></li>
        <li><span className="lead">Warranty window</span><span className="val">{w.days} days, until {when(w.until)}</span></li>
        {w.paid && <li><span className="lead">Paid</span><span className="val">{m(w.paid.amount || w.paid)}</span></li>}
      </ul>
      {w.claim && <div className="note warn small stack-s">
        <b>Defect claimed {when(w.claim.at)}</b><p>“{w.claim.reason}”</p>
        {w.claim.check && <p className="tiny"><Src s={w.claim.check.source} /> {w.claim.check.verdict}: {(w.claim.check.reasons || []).join("; ")}</p>}
        {w.claim.fix ? <p className="tiny">The pro sent a fix {when(w.claim.fix.at)}: {w.claim.fix.decision === "release" ? "it passed, the retainage is paid" : w.claim.fix.decision === "review" ? "a person (staff) decides" : w.claim.fix.decision}.</p> : <p className="tiny">Waiting for the pro to fix it and send photos.</p>}
        <Evidence items={job.evidence.filter((e) => e.phase === "defect")} />
      </div>}
      {as === "customer" && open && !w.claim && <div className="stack-s">
        <p className="small ink2">Something wrong with the work before {day(w.until)}? Claim a defect with photos: the retainage stays held until the pro fixes it.</p>
        <textarea className="input" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="What's wrong, where" aria-label="What's wrong" />
        <PhotoPicker files={files} setFiles={setFiles} label="Photos of the defect" small />
        <button className={`btn danger sm ${busy === "defect" ? "busy" : ""}`} disabled={!reason.trim() || !!busy} onClick={claim}>Claim a defect</button>
      </div>}
      {as !== "customer" && w.status === "open" && <p className="tiny muted">Paid to the pro with PayPal Payouts when the window ends, unless a defect is claimed.</p>}
    </div>
  );
}

export function Rating({ job, busy, act }) {
  const [stars, setStars] = useState(5), [text, setText] = useState(""), [share, setShare] = useState(true);
  if (!["released", "resolved"].includes(job.status)) return null;
  if (job.rating) return <div className="panel stack-s"><h3>Your rating</h3><p className="stars" aria-label={`${job.rating.stars} of 5`}>{"★".repeat(job.rating.stars)}<span className="muted">{"★".repeat(5 - job.rating.stars)}</span></p>{job.rating.text && <p className="small">“{job.rating.text}”</p>}<p className="tiny muted">Shown on the pro's public profile{job.rating.sharePhotos ? ", with this job's checked photos" : ""}. Ratings come only from paid jobs.</p></div>;
  return (
    <div className="panel stack-s">
      <h3>Rate the work</h3>
      <div className="row" role="radiogroup" aria-label="Stars">{[1, 2, 3, 4, 5].map((n) => <button key={n} type="button" role="radio" aria-checked={stars === n} className={`star ${n <= stars ? "on" : ""}`} onClick={() => setStars(n)} aria-label={`${n} star${n > 1 ? "s" : ""}`}>★</button>)}</div>
      <textarea className="input" rows={2} value={text} onChange={(e) => setText(e.target.value)} placeholder="What went well, what didn't (optional)" aria-label="Review" />
      <label className="check-row"><input type="checkbox" checked={share} onChange={(e) => setShare(e.target.checked)} /> Show this job's checked photos on the pro's profile (no address, no names)</label>
      <button className={`btn sm accent ${busy === "rate" ? "busy" : ""}`} disabled={!!busy} onClick={() => act("rate", `/api/jobs/${job.id}/rate`, { stars, text: text || undefined, sharePhotos: share })}>Post the rating</button>
    </div>
  );
}

export function Badges({ pro }) {
  const v = pro?.verified || [];
  if (!v.length) return null;
  const demoPay = pro?.payout?.demoAddress || pro?.verification?.paypal?.demoAddress || (pro?.demo && /done-demo\.example/.test(pro?.payout?.to || ""));
  return <span className="row" style={{ gap: 6 }}>{v.map((b) => b.id === "paypal" && demoPay ? null : <span key={b.id} className={`badge ${b.ok ? "good" : "warn"}`} title={b.label}>{b.ok ? "✓" : "!"} {b.label}</span>)}</span>;
}
export { Status, Stamp };
