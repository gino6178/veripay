// Graphical cards (PLAN §17), shared by the agent thread and the job page: numbers, names, photos and icons carry the
// meaning; words are a label at most. Every card draws from a small view-model (amounts in cents) so the thread's
// `card.data` and a job object can both feed it (see the `from*` helpers at the bottom).
import { useState } from "react";
import { Link, usd, when } from "../api.jsx";
import Icon from "./Icon.jsx";

const $ = (c) => (c == null ? "—" : usd(c));
const cents = (x) => (x == null ? null : typeof x === "number" ? x : x.cents ?? null);

// ---- "Why?" / "Details": every explanation sits behind one small toggle ----
export function Why({ label = "Why?", children }) {
  if (!children) return null;
  return <details className="why-t"><summary>{label}</summary><div className="why-b">{children}</div></details>;
}
// a small chip for demo / simulated / source labels
export function Chip({ tone = "", children, title }) {
  return <span className={`chip-s ${tone}`} title={title}>{children}</span>;
}

// ---- progress rail with icons ----
const STEPS = [["Scope", "doc", ["draft", "scoped"]], ["Offers", "people", ["offered", "agreed"]], ["Hold", "hold", ["held"]], ["Work", "wrench", ["working", "needs_fix"]], ["Checks", "check", ["submitted", "checking", "review", "passed", "disputed"]], ["Paid", "pay", ["released", "resolved"]]];
// the job's process, node by node (from the server: the chat's flow card and the job page draw the same nodes): what's
// done, what's happening now and who's on it, what's next; the steps that wait on the person say "you"
export function FlowNodes({ nodes }) {
  if (!nodes?.length) return null;
  return (
    <ol className="jflow" aria-label="The job, step by step">
      {nodes.map((n) => (
        <li key={n.key} className={`fl-${n.state}`} aria-current={n.state === "now" ? "step" : undefined}>
          <span className="fl-dot" aria-hidden="true">{n.state === "done" ? <Icon name="check" size={11} stroke={3.4} /> : null}</span>
          <div className="fl-body">
            <span className="fl-label">{n.label}{n.by && n.state !== "skip" ? <span className={`fl-by ${n.by === "you" && n.state === "now" ? "you" : ""}`}>{n.by === "you" && n.state === "now" ? "waiting for you" : n.by}</span> : null}</span>
            {n.detail ? <span className="fl-detail">{n.detail}</span> : null}
          </div>
        </li>
      ))}
    </ol>
  );
}
export function RailIcons({ status, compact = false }) {
  const at = STEPS.findIndex(([, , ss]) => ss.includes(status)), off = ["cancelled", "expired"].includes(status);
  return (
    <ol className={`irail ${compact ? "compact" : ""}`} aria-label={`Step ${at + 1} of ${STEPS.length}: ${STEPS[at]?.[0] || status}`}>
      {STEPS.map(([l, ic], i) => <li key={l} className={off ? "off" : i < at ? "done" : i === at ? "now" : ""} aria-current={i === at ? "step" : undefined} title={l}>
        <span className="dot"><Icon name={i < at ? "check" : ic} size={compact ? 12 : 16} stroke={2} /></span>{!compact && <span className="lbl">{l}</span>}</li>)}
    </ol>
  );
}

// ---- money bar: held / captured / paid to the pro / released (never charged) / refunded ----
const SEG = { paid: "Paid to pro", fee: "Fee", captured: "Captured", refunded: "Refunded", released: "Released", held: "Held" };
export function MoneyBar({ held, captured, paid, fee, released, refunded, segments }) {
  const h = cents(held) || 0, c = cents(captured) || 0, p = cents(paid) || 0, r = cents(released) || 0, f = cents(refunded) || 0, fe = cents(fee) || 0;
  // the backend's own segments when it sends them (held, captured, paid, fee, refunded), plus what was released unused
  const segs = (segments?.length ? [...segments.map((x) => [x.kind, cents(x.amount), SEG[x.kind] || x.kind]), ...(r ? [["released", r, SEG.released]] : [])]
    : [["paid", p, SEG.paid], ["fee", fe, SEG.fee], ["captured", Math.max(0, c - p - fe), SEG.captured], ["refunded", f, SEG.refunded], ["released", r, SEG.released], ["held", Math.max(0, h - c - r - f), SEG.held]]).filter(([, v]) => v > 0);
  return (
    <figure className="mbar" aria-label={segs.map(([, v, l]) => `${l} ${$(v)}`).join(", ") || "Nothing held yet"}>
      <div className="mbar-track">{segs.length ? segs.map(([k, v]) => <span key={k} className={`seg ${k}`} style={{ flexGrow: v }} />) : <span className="seg none" style={{ flexGrow: 1 }} />}</div>
      <figcaption className="mbar-key">{segs.length ? segs.map(([k, v, l]) => <span key={k}><i className={`sw ${k}`} />{l} <b>{$(v)}</b></span>) : <span className="muted">Nothing held yet</span>}</figcaption>
    </figure>
  );
}

// ---- price range: the fair range as a band, offers as markers, the ceiling as a line ----
export function PriceRange({ low, high, typical, offers = [], ceiling, picked }) {
  const vals = [cents(low), cents(high), cents(ceiling), ...offers.map((o) => cents(o.amount))].filter((v) => v != null);
  if (!vals.length) return null;
  const min = Math.min(...vals) * 0.85, max = Math.max(...vals) * 1.08, x = (v) => `${((v - min) / (max - min)) * 100}%`;
  const best = offers.length ? offers.reduce((a, o) => (cents(o.amount) < cents(a.amount) ? o : a), offers[0]) : null;
  return (
    <figure className="prange" aria-label={`${offers.length} offers from ${$(cents(best?.amount))}${low ? `; typical ${$(cents(low))} to ${$(cents(high))}` : ""}`}>
      <div className="prange-track">
        {low != null && high != null && <span className="band" style={{ left: x(cents(low)), width: `calc(${x(cents(high))} - ${x(cents(low))})` }} title={`Typical ${$(cents(low))}–${$(cents(high))}`} />}
        {ceiling != null && <span className="ceil" style={{ left: x(cents(ceiling)) }} title={`Your ceiling ${$(cents(ceiling))}`}><i>max</i></span>}
        {(() => { // each offer's price over its marker; a label too close to the one before it drops below the line
          let lastAt = -Infinity, up = true;
          return [...offers].sort((a, b) => cents(a.amount) - cents(b.amount)).map((o) => {
            const at = ((cents(o.amount) - min) / (max - min)) * 100;
            up = at - lastAt < 9 ? !up : true; lastAt = at;
            return <span key={o.id || o.name} className={`mk ${o === best ? "best" : ""} ${picked && picked === o.id ? "picked" : ""}`} style={{ left: `${at}%` }} title={`${o.name}: ${$(cents(o.amount))}`}><b className={`mk-l ${up ? "up" : "down"}`}>{$(cents(o.amount)).replace(/\.00$/, "")}</b></span>;
          });
        })()}
      </div>
      <figcaption className="prange-key">
        {best && <span><i className="sw best" />Best <b>{$(cents(best.amount))}</b>{best.name ? ` · ${best.name.replace(/ \(demo\)$/, "")}` : ""}</span>}
        {low != null && <span><i className="sw band" />Typical {$(cents(low))}–{$(cents(high))}</span>}
        {ceiling != null && <span><i className="sw ceil" />Max {$(cents(ceiling))}</span>}
      </figcaption>
    </figure>
  );
}

// ---- work-order checklist: one line per condition, an icon for its evidence, a mark for its result ----
const EV = { photo: "camera", receipt: "receipt", document: "doc", measurement: "ruler", note: "note" };
const MARK = { pass: ["check", "ok"], needs_fix: ["flag", "warn"], fail: ["x", "bad"], person: ["eye", "warn"] };
export function Checklist({ checks = [], max }) {
  const list = max ? checks.slice(0, max) : checks;
  return (
    <ul className="clist">
      {list.map((c) => { const st = c.judge === "person" && c.verdict === "pass" ? "person" : c.verdict; const mk = MARK[st];
        return <li key={c.id || c.what}><span className="ev" title={c.evidence}><Icon name={EV[c.evidence] || "camera"} size={16} /></span><span className="w">{c.what}</span>
          {mk ? <span className={`mk ${mk[1]}`} title={st === "person" ? "a person confirms" : c.verdict}><Icon name={mk[0]} size={14} stroke={2.4} /></span> : <span className="mk open" aria-label="not checked yet" />}</li>; })}
      {max && checks.length > max && <li className="more muted tiny">+{checks.length - max} more</li>}
    </ul>
  );
}

// ---- photo grid: a badge per photo (green tick: a model judged it; blue tick: code; amber: a person looks; red: failed) ----
const BADGE = { model: ["check", "model", "A model judged it"], code: ["check", "code", "Code checked it"], person: ["eye", "person", "A person confirms"], fail: ["x", "fail", "Failed"] };
export function PhotoGrid({ photos = [], max = 6 }) {
  const [open, setOpen] = useState(null);
  if (!photos.length) return null;
  const list = photos.slice(0, max);
  return (
    <>
      <ul className="pgrid">{list.map((p, i) => { const b = BADGE[p.badge] || BADGE.code; return (
        <li key={p.id || i}><button type="button" className="pg-b" onClick={() => setOpen(p)} aria-label={`${p.label || "photo"}: ${b[2]}`}>
          <img src={p.url} alt="" loading="lazy" onError={(e) => { e.currentTarget.style.visibility = "hidden"; }} />
          <span className={`pbadge ${b[1]}`} title={b[2]}><Icon name={b[0]} size={11} stroke={2.6} /></span>
          {p.phase && p.phase !== "after" && <span className="pphase">{p.phase === "before" ? "Before" : p.phase}</span>}</button></li>); })}
        {photos.length > max && <li className="pg-more">+{photos.length - max}</li>}</ul>
      {open && <div className="confirm-scrim" role="presentation" onClick={() => setOpen(null)}><figure className="pg-big" role="dialog" aria-modal="true" aria-label={open.label || "photo"} onClick={(e) => e.stopPropagation()}><img src={open.url} alt={open.label || ""} /><figcaption className="small">{open.label}{open.taken ? ` · ${when(open.taken)}` : ""} <button className="btn sm" onClick={() => setOpen(null)}>Close</button></figcaption></figure></div>}
    </>
  );
}

// ---- PAID stamp ----
export function PaidStamp({ amount, at, label = "Paid" }) {
  return <span className="stamp big pass land paid-stamp">{label}{amount != null ? ` ${$(cents(amount))}` : ""}{at && <small>{when(at)}</small>}</span>;
}

// ---- pro chip: initials avatar, stars, licence and insurance ticks ----
export function ProChip({ id, name, rating, licensed, insured, demo }) {
  if (!name) return null;
  const ini = name.replace(/\(demo\)/, "").trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
  const inner = <><span className="av" aria-hidden="true">{ini}</span><span className="pn">{name.replace(/ \(demo\)$/, "")}</span>
    {rating != null && <span className="pr"><Icon name="star" size={13} stroke={2} />{(+rating).toFixed(1)}</span>}
    {licensed && <span className="pt" title="Licence on file"><Icon name="shield" size={14} /></span>}
    {insured && <span className="pt" title="Insured"><Icon name="check" size={13} stroke={2.4} /></span>}
    </>;
  return id ? <Link className="prochip" to={`/pros/${id}`}>{inner}</Link> : <span className="prochip">{inner}</span>;
}

// ---- view-models from a job object (the job page, and the thread until the assistant API answers) ----
export const judgeOfCheck = (c) => (c.verdict !== "pass" ? "fail" : (c.signals || []).some((x) => /^needs_person/.test(x)) || c.needsPerson ? "person" : /model|vlm|done-audit/.test(String(c.by || "")) ? "model" : "code");
export function checksOf(j) {
  const r = j.lastCheck || (j.checks || []).at(-1), by = Object.fromEntries((r?.checks || []).map((c) => [c.id, c]));
  return (j.scope?.checks || []).map((c) => { const x = by[c.id]; return { id: c.id, what: c.what, evidence: c.evidence, verdict: x?.verdict || null, judge: x ? judgeOfCheck(x) : null }; });
}
export function photosOf(j) {
  const r = j.lastCheck || (j.checks || []).at(-1), by = Object.fromEntries((r?.checks || []).map((c) => [c.id, c]));
  return (j.evidence || []).filter((e) => e.kind === "photo" && e.url && !e.forChange).map((e) => { const c = by[e.checkId]; const b = !c ? "code" : c.verdict !== "pass" ? "fail" : judgeOfCheck(c); return { id: e.id, url: e.url, label: (j.scope?.checks || []).find((x) => x.id === e.checkId)?.what || e.label, phase: e.phase, taken: e.exif?.taken, badge: b }; });
}
export function moneyOf(j) {
  const mo = j.money || {}, h = j.hold;
  const captured = cents(mo.captured) || 0, paid = (cents(mo.split?.pro) || 0) + (cents(mo.split?.helper) || 0), refunded = cents(mo.refunded) || 0;
  const live = h && ["held", "partially_captured", "captured"].includes(h.status);
  const released = h?.status === "captured" ? Math.max(0, (cents(h.amount) || 0) - captured - refunded) : 0;
  return { held: live ? cents(h.amount) : 0, captured, paid, released, refunded };
}
export function offersOf(j) {
  return (j.offers || []).filter((o) => ["open", "countered", "accepted"].includes(o.status)).map((o) => ({ id: o.id, amount: o.amount, name: o.pro?.name, rating: o.pro?.rating }));
}
