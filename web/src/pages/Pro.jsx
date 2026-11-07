// The pro's side: jobs in their trade asking for offers, their own jobs, one job (quote, answer a counter, start,
// change order, send evidence from the camera or a file, see each check), and payouts with where they are paid.
import { useEffect, useState } from "react";
import { api, Link, m, when, dollars, useApi, navigate, day, usd } from "../api.jsx";
import { useMe } from "../App.jsx";
import { t } from "../i18n.js";
import { NeedSignIn, useAct, B } from "./Jobs.jsx";
import { Status, Rail, Ids, paypalIds, Thread, Timeline, Evidence, WoHead, Src, Split } from "../components/job.jsx";
import { DoneWhen } from "./Jobs.jsx";
import Safe from "../components/Safe.jsx";
import { askConfirm } from "../components/Confirm.jsx";
import { Readiness } from "./Extra.jsx";
import { Releases, ScopeReview, Warranty, PhotoPicker, readData, Badges } from "../components/parts.jsx";
import Icon from "../components/Icon.jsx";
import { Why } from "../components/cards.jsx";
import { Availability, Visit, slotSays } from "../components/Schedule.jsx";

const notPro = (me) => me && me.person.role !== "pro";
function NotPro() { return <div className="empty"><p>{t("This is the pro's side. You're signed in as a customer.")}</p><Link className="btn" to="/signin?as=pro">{t("Sign in as a demo pro")}</Link></div>; }

export function ProHome() {
  const [radius, setRadius] = useState("");
  const { me } = useMe(), list = useApi(me?.person?.role === "pro" ? "/api/pro/jobs" : null), ready = useApi(me?.person?.role === "pro" ? "/api/pro/readiness" : null), feed = useApi(me?.person?.role === "pro" ? `/api/pro/feed${radius ? `?radius=${radius}` : ""}` : null);
  if (me === null) return <NeedSignIn what="incoming jobs" as="pro" />;
  if (notPro(me)) return <NotPro />;
  const d = list.data, pro = me?.pro;
  return (
    <div className="stack-l">
      <div className="page-head"><div><h1>{t("Incoming jobs")}</h1><p className="lede">{pro?.name ? `${pro.name}: ` : ""}{pro?.trade ? `${pro.trade} jobs` : "Jobs"} in Austin asking for offers, and the ones you're hired for. You're paid by PayPal{pro?.payout?.to || pro?.payout?.email ? ` to ${pro.payout.to || pro.payout.email}` : ""} the moment the customer's conditions pass.</p></div><Link className="btn" to="/pro/payouts">{t("Payouts")}</Link></div>
      <Readiness r={ready.data} />
      {pro?.agent === "demo" && <p className="note agent small">Your demo agent (run by VeriPay from your price rules: {pro.rules?.callout} call-out, {pro.rules?.hourly}/h) quotes new jobs for you at once. You can quote by hand here, or connect your own agent over A2A with a key from Payouts.</p>}
      <section className="stack-s"><h2 style={{ fontSize: "var(--fs-h3)" }}>{t("Asking for offers")}</h2>
        {!d && <div className="skel" style={{ height: 60 }} />}
        <div className="row"><span className="small ink2">{feed.data ? `${feed.data.jobs.length} ${feed.data.trade} job${feed.data.jobs.length === 1 ? "" : "s"} within ${feed.data.radiusMiles} miles of ${feed.data.from}, newest first` : "Loading…"}</span>
          <select className="input sm" style={{ width: "auto" }} value={radius} onChange={(e) => setRadius(e.target.value)} aria-label="Radius">{[["", "my service radius"], ["5", "5 miles"], ["10", "10 miles"], ["25", "25 miles"], ["50", "50 miles"]].map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
        {feed.data && !feed.data.jobs.length && <div className="empty"><p className="small">No {pro?.trade} jobs are asking for offers within {feed.data.radiusMiles} miles right now. Post one as a customer from the Demo panel and it shows up here.</p></div>}
        {(feed.data?.jobs || []).map((j) => <Link key={j.id} to={`/pro/jobs/${j.id}`} className="jobrow"><span className="no">{j.number}</span><span><b>{j.title}</b><div className="nx">{j.miles != null ? `${j.miles} mi · ` : ""}ZIP {j.zip} · {(j.checks || []).length} done-conditions · by {day(j.window?.to)} · ceiling {m(j.priceCeiling)}{j.termsChanged ? " · terms changed" : ""}</div></span><span className="amt">{j.yourOffer?.length ? <><span className="badge">{j.yourOffer[0].status}</span><span>{m(j.yourOffer[0].amount)}</span>{j.yourOffer[0].counter && <span className="warn">counter {j.yourOffer[0].counter}</span>}</> : <span className="badge signal">quote it</span>}</span></Link>)}
      </section>
      <section className="stack-s"><h2 style={{ fontSize: "var(--fs-h3)" }}>{t("Hired")}</h2>
        {d && !d.mine.length && <p className="small muted">{t("No jobs yet.")}</p>}
        {d?.mine.slice().sort((a, b) => b.updated.localeCompare(a.updated)).map((j) => <Link key={j.id} to={`/pro/jobs/${j.id}`} className="jobrow"><span className="no">{j.number}</span><span><b>{j.title}</b><div className="nx">{j.next}</div></span><span className="amt"><Status s={j.status} /><span>{m(j.due)}</span></span></Link>)}
      </section>
    </div>
  );
}

export function ProJob({ id }) {
  const { me, toast } = useMe(), job = useApi(me?.person?.role === "pro" ? `/api/pro/jobs/${id}` : null);
  const [busy, act] = useAct(job.set);
  const j = job.data;
  useEffect(() => { if (!j) return; const fast = ["submitted", "checking"].includes(j.status); const t = setTimeout(job.reload, fast ? 1500 : 8000); return () => clearTimeout(t); }, [j]);
  if (me === null) return <NeedSignIn what="this job" as="pro" />;
  if (notPro(me)) return <NotPro />;
  if (job.error) return <div className="empty"><p>{job.error.message}</p><Link className="btn" to="/pro">{t("Incoming jobs")}</Link></div>;
  if (!j) return <div className="skel" style={{ height: 320 }} />;
  const mine = j.agreed?.pro?.id === me.pro?.id || j.agreed?.pro === me.pro?.id, base = `/api/pro/jobs/${j.id}`;
  const myOffers = (j.offers || []).filter((o) => o && (o.pro?.id || o.pro) === me.pro?.id);
  const early = mine && j.milestones?.find((x) => x.status === "passed" && x.passed?.waiting === "review_window" && !x.earlyPay);
  const claim = mine && j.warranty?.status === "claimed" && j.warranty.claim && j.warranty.claim.fix?.decision !== "release";
  const camera = new URLSearchParams(location.search).get("camera") === "1";
  if (camera && mine) return (
    <div className="stack" style={{ maxWidth: 560, margin: "0 auto" }}>
      <div className="row between"><Link className="btn sm" to="/pro"><Icon name="back" size={16} />{t("Back to the thread")}</Link><span className="mono small">{j.number}</span></div>
      <h1 style={{ fontSize: "var(--fs-h2)" }}>{j.scope?.title}</h1>
      {j.status === "held" && <BeforeForm j={j} busy={busy} act={act} />}
      {(["working", "needs_fix"].includes(j.status) || (j.status === "review" && (j.toFix || []).length > 0)) && <EvidenceForm j={j} busy={busy} setJob={(x) => { job.set(x); if (x && ["submitted", "checking"].includes(x.status)) navigate("/pro"); }} toast={toast} />}
      {!["held", "working", "needs_fix", "review"].includes(j.status) && <p className="note small">{t("Nothing to photograph right now.")}</p>}
    </div>
  );
  const T = { held: "You're hired", working: "Working", needs_fix: "Fix and resend", submitted: "Checking", checking: "Checking", review: "Customer is deciding", passed: "Passed", released: "Paid", resolved: "Settled", disputed: "Disputed" };
  return (
    <div>
      <WoHead job={j} as="pro"><Link className="btn sm" to="/pro">{t("All jobs")}</Link></WoHead>
      <Rail job={j} />
      <div className="wo-body">
        <div className="stack-l">
          {mine && j.status === "held" && <BeforeForm j={j} busy={busy} act={act} />}
          {mine && j.status === "review" && (j.toFix || []).length > 0 && <div className="panel marks stack-s"><h3>{t("What the checks want")}</h3><Why><p>{t("The customer is deciding, and you can still resend for these (a new check runs; it closes the expert's queue item):")}</p></Why><ul className="small" style={{ margin: 0, paddingLeft: 18 }}>{j.toFix.map((x, i) => <li key={i}><b>{x.what}</b>: {x.reason}</li>)}</ul></div>}
          {mine && (["working", "needs_fix"].includes(j.status) || (j.status === "review" && (j.toFix || []).length > 0)) && <EvidenceForm j={j} busy={busy} setJob={job.set} toast={toast} />}
          {claim && <DefectFix j={j} busy={busy} act={act} />}
          <Safe name="Done-conditions"><DoneWhen j={j} intro="You're paid when each of these passes. Photos must be taken during the window at the address (your phone's camera records both), never reused from another job." /></Safe>
          {j.scope.items?.length > 0 && <div className="stack-s"><span className="eyebrow">{t("THE JOB")}</span><ul className="small" style={{ margin: 0, paddingLeft: 18 }}>{j.scope.items.map((x, i) => <li key={i}>{x}</li>)}</ul></div>}
          {j.scopeReview && mine && <ScopeReview r={j.scopeReview} />}
          {mine && ["held", "working"].includes(j.status) && <ChangeForm j={j} busy={busy} act={act} toast={toast} />}
          {j.changeOrders.length > 0 && <section className="stack-s"><h2 style={{ fontSize: "var(--fs-h3)" }}>{t("Change orders")}</h2>{j.changeOrders.map((c) => <div key={c.id} className="panel stack-s"><div className="row between"><span>{c.reason}{c.kind === "materials" && <span className="badge" style={{ marginLeft: 6 }}>materials</span>}</span><span className="row"><span className={`badge ${c.status === "approved" ? "good" : c.status === "declined" ? "bad" : "warn"}`}>{c.status}</span><b className="mono">+{m(c.amount)}</b></span></div>{mine && <AdvanceAsk j={j} c={c} busy={busy} act={act} toast={toast} />}</div>)}</section>}
          <Safe name="Messages"><section className="stack"><h2 style={{ fontSize: "var(--fs-h3)" }}>{t("Messages")}</h2><Thread job={j} /></section></Safe>
          <section className="stack-s"><h2 style={{ fontSize: "var(--fs-h3)" }}>{t("Timeline")}</h2><Timeline job={j} /></section>
        </div>
        <aside className="wo-side first">
          {!mine && ["scoped", "offered"].includes(j.status) && <Quote j={j} me={me} mine={myOffers} busy={busy} act={act} />}
          {mine && <div className="panel marks stack">
            <h3>{T[j.status] || "This job"}</h3>
            <Why><p>{j.next}</p></Why>
            <ul className="spec"><li><span className="lead">{t("Price")}</span><span className="val">{m(j.agreed.price)}</span></li><li><span className="lead">{t("Due with change orders")}</span><span className="val">{m(j.due)}</span></li>{j.remaining && <li><span className="lead">{t("Still to be paid")}</span><span className="val">{m(j.remaining)}</span></li>}<li><span className="lead">{t("Held by PayPal")}</span><span className="val">{j.hold ? `${m(j.hold.amount)} · ${j.hold.status}` : "—"}</span></li><li><span className="lead">{t("Address")}</span><span className="val">{j.address.line || "—"}</span></li><li><span className="lead">{t("Paid to")}</span><span className="val">{j.agreed.payee?.to} {j.agreed.payee?.verified ? "(verified)" : ""}</span></li>
              {j.options?.retainPct > 0 && <li><span className="lead">{t("Retainage")}</span><span className="val">{j.options.retainPct}% until the {j.options.warrantyDays}-day warranty ends</span></li>}
              {j.options?.releaseMode === "review" && <li><span className="lead">{t("Review window")}</span><span className="val">{j.options.reviewHours} h after passing</span></li>}</ul>
            {early && <div className="note good stack-s">
              <p className="small">Milestone “{early.title}” passed. It releases {when(early.passed.until)}. Want it now?</p>
              <B busy={busy} k="early" className="accent sm" onClick={() => act("early", `${base}/early-pay`, { milestone: early.id })}>Get {m(early.due || early.amount)} now (2% fee, min $1)</B>
              <Why><p>{t("Paid by the platform with PayPal Payouts; the capture at release repays it.")}</p></Why>
            </div>}
            {j.money?.split && <Split job={j} />}
            <Visit j={j} as="pro" busy={busy} act={act} />
            <Releases job={j} />
            {((j.reports || []).some((r) => r.kind === "closeout") || ["released", "resolved"].includes(j.status)) && <p className="small">{t("Close-out package with lien waivers: ")}<a href={`/api/pro/jobs/${j.id}/closeout.html`} target="_blank" rel="noreferrer">HTML</a> · <a href={`/api/pro/jobs/${j.id}/closeout.pdf`} target="_blank" rel="noreferrer">PDF</a></p>}
          </div>}
          {mine && <Warranty job={j} as="pro" />}
          {(mine || myOffers.length > 0) && paypalIds(j).some((r) => r[1]) && <div className="panel stack-s"><h3>{t("PayPal ids")}</h3><Ids rows={paypalIds(j)} /></div>}
        </aside>
      </div>
    </div>
  );
}

// the shot checklist for one condition (from the scope writer's photo checklist, else the condition's own)
function shotsFor(j, cid, when) {
  const pc = j.scope.photoChecklist?.perCheck?.find((x) => x.checkId === cid);
  if (pc) return pc.shots.filter((s) => s.when === when);
  const c = j.scope.checks.find((x) => x.id === cid), s = c?.shots;
  if (!s) return [];
  return when === "before" ? [{ id: `${cid}.before`, say: "Before work starts: the same spot, from where the after photo will be taken", framing: "wide", required: true }]
    : [...(s.labels || []).map((l, i) => ({ id: `${cid}.${i}`, say: l, framing: /close/.test(l) ? "close" : /label/.test(l) ? "label" : "wide", required: i < (s.min || 1) })), ...(s.context ? [{ id: `${cid}.ctx`, say: s.context, framing: "context", required: false }] : [])];
}
function Shots({ list }) {
  if (!list.length) return null;
  return <ul className="shots">{list.map((s) => <li key={s.id}><span className="part">{s.framing}</span><span className="small">{s.say}</span>{s.required && <span className="tiny muted">required</span>}</li>)}</ul>;
}

// before work: a photo of each spot from where the after photo will be taken (the checker compares them)
function BeforeForm({ j, busy, act }) {
  const [files, setFiles] = useState({});
  const photoChecks = j.scope.checks.filter((c) => c.evidence === "photo" && !c.doc);
  const need = !!j.options?.requireBefore, have = j.evidence.filter((e) => e.phase === "before").map((e) => e.checkId);
  const go = async () => {
    const before = [];
    for (const c of photoChecks) for (const f of files[c.id] || []) before.push({ dataUrl: await readData(f), checkId: c.id, label: `before ${c.id}` });
    act("start", `/api/pro/jobs/${j.id}/start`, before.length ? { before } : {});
  };
  const missing = photoChecks.filter((c) => !(files[c.id]?.length) && !have.includes(c.id));
  return (
    <section className="panel marks stack" aria-labelledby="h-before">
      <div className="panel-h"><h2 id="h-before" style={{ fontSize: "var(--fs-h3)" }}>{t("Before you start: photograph each spot")}</h2>{need ? <span className="badge warn">the customer requires these</span> : <span className="badge">recommended</span>}</div>
      <Why><p>Stand where you'll take the AFTER photo. The checker compares after with before (and with the customer's own photos of the problem), so the same spot proves the work was done here.</p></Why>
      {photoChecks.map((c) => (
        <div key={c.id} className="stack-s">
          <div className="row" style={{ gap: 8 }}><b className="small">{c.what}</b>{have.includes(c.id) && <span className="badge good">before sent</span>}</div>
          <Shots list={shotsFor(j, c.id, "before")} />
          <PhotoPicker files={files[c.id] || []} setFiles={(f) => setFiles({ ...files, [c.id]: f })} label="Take the BEFORE photo" small />
        </div>
      ))}
      <div className="row">
        <B busy={busy} k="start" className="accent" disabled={!!busy || (need && missing.length > 0)} onClick={go}>{Object.values(files).some((f) => f.length) ? "Send the before photos and start" : "I'm on site: start the work"}</B>
        {need && missing.length > 0 && <span className="tiny warn">Still needed: {missing.map((c) => c.id).join(", ")}</span>}
      </div>
    </section>
  );
}

// a defect the customer claimed under warranty: send photos of the fix; it's checked like any condition
function DefectFix({ j, busy, act }) {
  const [files, setFiles] = useState([]), c = j.warranty.claim;
  const go = async () => act("fix", `/api/pro/jobs/${j.id}/defect-fix`, { items: await Promise.all(files.map(async (f) => ({ dataUrl: await readData(f) }))) }, () => setFiles([]));
  return (
    <section className="panel marks stack-s" aria-labelledby="h-defect">
      <h2 id="h-defect" style={{ fontSize: "var(--fs-h3)" }}>{t("Defect claimed under warranty")}</h2>
      <p className="small">“{c.reason}”</p>
      <Evidence items={j.evidence.filter((e) => e.phase === "defect")} />
      <p className="small ink2">{m(j.warranty.retained)} retainage stays held until it's fixed. Photograph the fix from the same spot as the customer's photo.</p>
      {c.fix && <p className="tiny warn">Fix sent {when(c.fix.at)}: {c.fix.decision === "review" ? "staff decide" : c.fix.decision}.</p>}
      <PhotoPicker files={files} setFiles={setFiles} label="Photos of the fix" small />
      <B busy={busy} k="fix" className="accent sm" disabled={!files.length || !!busy} onClick={go}>{t("Send the fix")}</B>
    </section>
  );
}

function Quote({ j, me, mine, busy, act }) {
  const open = mine.find((o) => ["open", "countered"].includes(o.status));
  const [amount, setAmount] = useState(""), [helper, setHelper] = useState(!!me.pro?.helper), [note, setNote] = useState(""), [ctr, setCtr] = useState(""), [slots, setSlots] = useState([]);
  const av = useApi(open ? null : "/api/pro/availability").data, next = (av?.next || []).slice(0, 6);
  return (
    <div className="panel marks stack">
      <h3>{open ? "Your offer" : "Quote this job"}</h3>
      <Why><p>Ceiling {m(j.scope.priceCeiling)}. The customer (or their agent) may propose prices in up to 3 rounds; you answer in yours.</p></Why>
      {open ? <>
        <div className="big-amt">{m(open.amount)}</div>
        <Why><p>status {open.status}{open.agent === "demo" ? " · quoted by your demo agent" : ""}</p></Why>
        {open.counter && !open.answer && <div className="stack-s">
          <p className="note warn small">{t("They countered ")}<b>{m(open.counter.amount)}</b>.</p>
          <div className="row"><B busy={busy} k="ya" className="accent" onClick={() => act("ya", `/api/pro/offers/${open.id}/accept`)}>Accept {m(open.counter.amount)}</B><B busy={busy} k="nd" onClick={() => act("nd", `/api/pro/offers/${open.id}/decline`)}>{t("Decline")}</B></div>
          <div className="row"><span className="money-in" style={{ width: 110 }}><input className="input sm" inputMode="decimal" value={ctr} onChange={(e) => setCtr(e.target.value)} aria-label="Your counter, dollars" /></span><B busy={busy} k="cc" className="sm" disabled={!dollars(ctr) || !!busy} onClick={() => act("cc", `/api/pro/offers/${open.id}/counter`, { amount: dollars(ctr) })}>{t("Counter")}</B></div>
        </div>}
        {open.answer && <p className="small muted">You answered: {open.answer.kind} {open.answer.amount ? m(open.answer.amount) : ""}. Waiting for the customer.</p>}
        {open.termsChanged && <p className="note warn small">{t("The customer changed the job's options after your offer. Send a new offer below to replace it, or keep it.")}</p>}
        <B busy={busy} k="wd" className="danger sm" onClick={async () => { if (await askConfirm({ title: "Withdraw your offer?", body: "The customer can't accept it after this. You can send a new one.", ok: "Withdraw", danger: true })) act("wd", `/api/pro/offers/${open.id}/withdraw`); }}>{t("Withdraw my offer")}</B>
      </> : <>
        <label className="field"><span>{t("YOUR PRICE (LABOR + CALL-OUT; PARTS AS A CHANGE ORDER)")}</span><span className="money-in"><input className="input" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder={j.scope?.priceCeiling ? (j.scope.priceCeiling.cents * 0.009).toFixed(0) : ""} /></span></label>
        {me.pro?.helper && <label className="check-row"><input type="checkbox" checked={helper} onChange={(e) => setHelper(e.target.checked)} /> {me.pro.helper.name} comes along ({Math.round(me.pro.helper.share * 100)}% of the pro's share, paid in the same batch)</label>}
        <label className="field"><span>{t("NOTE (OPTIONAL)")}</span><input className="input" value={note} onChange={(e) => setNote(e.target.value)} /></label>
        {next.length > 0 && <fieldset className="looks"><legend className="eyebrow">{t("VISIT TIMES TO OFFER (UP TO 3; NONE: THE FIRST OPEN ONES)")}</legend>{next.map((x) => <label key={x.from} className="check-row"><input type="checkbox" checked={slots.includes(x.from)} disabled={!slots.includes(x.from) && slots.length >= 3} onChange={(e) => setSlots(e.target.checked ? [...slots, x.from] : slots.filter((y) => y !== x.from))} /><span>{slotSays(x)}</span></label>)}</fieldset>}
        <B busy={busy} k="off" className="accent" disabled={!dollars(amount) || !!busy} onClick={() => act("off", `/api/pro/jobs/${j.id}/offer`, { amount: dollars(amount), helper, note: note || undefined, ...(slots.length ? { slots } : {}) })}>{t("Send the offer")}</B>
      </>}
    </div>
  );
}

// one file (or a note) per done-condition, then send them all to the check. On a phone the camera opens directly.
// one or more files (or a note) per done-condition of the milestone being worked on, then send them to the check.
// On a phone the camera opens directly; the shot checklist says what to photograph.
function EvidenceForm({ j, busy, setJob, toast }) {
  const [files, setFiles] = useState({}), [notes, setNotes] = useState({}), [typed, setTyped] = useState({}), [sending, setSending] = useState(false);
  const ms = j.milestones?.find((x) => ["needs_fix", "review"].includes(x.status)) || j.milestones?.find((x) => x.current) || null;
  const multi = (j.milestones?.length || 0) > 1;
  const fixing = ["needs_fix", "review"].includes(ms ? ms.status : j.status);
  const fixIds = (j.toFix || []).map((x) => x.checkId);
  const round = ms?.lastCheck || j.lastCheck, last = Object.fromEntries((round?.checks || []).map((c) => [c.id, c]));
  const scopeChecks = ms ? j.scope.checks.filter((c) => ms.checkIds.includes(c.id)) : j.scope.checks;
  const want = scopeChecks.filter((c) => (fixIds.length ? fixIds.includes(c.id) : !fixing || last[c.id]?.verdict !== "pass" || last[c.id]?.needsPerson));
  const has = (c) => (c.evidence === "note" ? (notes[c.id] || "").trim() : files[c.id]?.length);
  const send = async (submit) => {
    setSending(submit ? "submit" : "save");
    try {
      const noteItems = want.filter((c) => c.evidence === "note" && (notes[c.id] || "").trim()).map((c) => ({ kind: "note", text: notes[c.id], checkId: c.id }));
      const fileChecks = want.filter((c) => c.evidence !== "note" && files[c.id]?.length);
      let r;
      if (fileChecks.length) {
        const f = new FormData(); let k = 0;
        if (ms) f.append("milestone", ms.id);
        for (const c of fileChecks) for (const file of files[c.id]) { f.append("file", file, file.name); f.append(`kind_${k}`, c.evidence); f.append(`checkId_${k}`, c.id); if (typed[c.id] && c.evidence === "receipt") f.append(`text_${k}`, `TOTAL ${typed[c.id]}`); k++; }
        if (!noteItems.length && submit) f.append("submit", "true");
        r = await api(`/api/pro/jobs/${j.id}/evidence`, { method: "POST", form: f });
      }
      if (noteItems.length) r = await api(`/api/pro/jobs/${j.id}/evidence`, { method: "POST", body: { items: noteItems, submit, ...(ms ? { milestone: ms.id } : {}) } });
      else if (submit && !fileChecks.length) r = await api(`/api/pro/jobs/${j.id}/submit`, { method: "POST", body: ms ? { milestone: ms.id } : {} });
      if (r?.id) setJob(r);
      setFiles({}); setNotes({}); setTyped({});
      toast(submit ? "Sent to the check." : "Saved. Submit when everything is in.");
    } catch (e) { toast(e.message, true); }
    setSending(false);
  };
  return (
    <section className="panel marks stack" aria-labelledby="h-ev">
      <div className="panel-h"><h2 id="h-ev" style={{ fontSize: "var(--fs-h3)" }}>{fixing ? "Send what needs fixing" : "Send the evidence"}{multi && ms ? `: milestone ${j.milestones.indexOf(ms) + 1}, ${ms.title}` : ""}</h2><span className="tiny muted">{t("JPEG from the phone's camera keeps the time and place. 8 MB a file.")}</span></div>
      {j.scope.photoChecklist?.target && <p className="tiny ink2">Aim for {j.scope.photoChecklist.target} in all: wide shots with the room around them, close-ups, and readable labels on new parts.</p>}
      {want.map((c) => (
        <div key={c.id} className="stack-s">
          <div className="row" style={{ gap: 8 }}><b className="small">{c.what}</b>{c.doc && <span className="badge">document: {c.doc.replace("_", " ")}</span>}{fixing && last[c.id] && <span className="tiny warn">{last[c.id].reason}</span>}</div>
          {c.evidence === "photo" && !c.doc && <Shots list={shotsFor(j, c.id, "after")} />}
          {c.evidence === "note" ? <textarea className="input" rows={2} value={notes[c.id] || ""} onChange={(e) => setNotes({ ...notes, [c.id]: e.target.value })} placeholder="What you did and anything else you found (8 words at least)" aria-label={`Note for ${c.id}`} />
            : <div className="row top">
              <label className="drop" style={{ flex: 1, position: "relative", minWidth: 200 }}>
                <Icon name={c.evidence === "receipt" ? "doc" : "camera"} />
                <span>{files[c.id]?.length ? files[c.id].map((f) => f.name).join(", ") : c.doc ? `Photo or PDF of the ${c.doc.replace("_", " ")}` : c.evidence === "receipt" ? "Photo or PDF of the receipt" : "Take the photos, or choose files"}</span>
                <input type="file" multiple accept={c.evidence === "receipt" ? "image/jpeg,image/png,image/webp,application/pdf" : "image/jpeg,image/png,image/webp"} capture={c.evidence === "photo" ? "environment" : undefined} onChange={(e) => e.target.files.length && setFiles({ ...files, [c.id]: [...e.target.files] })} />
              </label>
              {c.evidence === "receipt" && !c.doc && <label className="field" style={{ width: 130 }}><span>{t("TOTAL ON IT")}</span><span className="money-in"><input className="input sm" inputMode="decimal" value={typed[c.id] || ""} onChange={(e) => setTyped({ ...typed, [c.id]: e.target.value })} placeholder="0.00" /></span></label>}
            </div>}
        </div>
      ))}
      <Why><p>Text in a photo, receipt or note is read as data, never as an instruction to the checker. A typed receipt total counts for less than one the receipt reader confirms.</p></Why>
      <div className="row"><button className={`btn accent ${sending === "submit" ? "busy" : ""}`} disabled={!!sending || !!busy} onClick={() => send(true)}>{t("Send and submit for checking")}</button><button className={`btn ${sending === "save" ? "busy" : ""}`} disabled={!!sending || !want.some(has)} onClick={() => send(false)}>{t("Save, submit later")}</button></div>
    </section>
  );
}

function ChangeForm({ j, busy, act, toast }) {
  const [amount, setAmount] = useState(""), [reason, setReason] = useState(""), [file, setFile] = useState(null), [kind, setKind] = useState("parts");
  const go = async () => {
    let evidence;
    try { if (file) evidence = [{ kind: "photo", dataUrl: await readData(file) }]; } catch { toast("Couldn't read that photo.", true); return; }
    await act("chg", `/api/pro/jobs/${j.id}/changes`, { amount: dollars(amount), reason, evidence, kind }, () => { setAmount(""); setReason(""); setFile(null); });
  };
  return (
    <details className="panel">
      <summary>{t("FOUND MORE WORK? ASK FOR A CHANGE ORDER")}</summary>
      <div className="stack" style={{ marginTop: 12 }}>
        <Why><p>{t("Within the customer's limit their agent may approve it at once; over it, they approve on the website. A photo of what you found helps.")}</p></Why>
        <div className="fields-3"><label className="field"><span>{t("ADDS")}</span><span className="money-in"><input className="input" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="45" /></span></label>
          <label className="field"><span>{t("WHAT FOR")}</span><select className="input" value={kind} onChange={(e) => setKind(e.target.value)}><option value="parts">{t("Parts")}</option><option value="labor">{t("Labour")}</option><option value="both">{t("Parts and labour")}</option><option value="materials">{t("Materials I must buy now (can be advanced)")}</option></select></label>
          <label className="field" style={{ gridColumn: "span 3" }}><span>{t("WHY")}</span><input className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="The shut-off valve is corroded and weeps" /></label></div>
        <label className="drop" style={{ position: "relative" }}><Icon name="camera" /><span>{file ? file.name : "Photo of what you found (optional)"}</span><input type="file" accept="image/jpeg,image/png,image/webp" capture="environment" onChange={(e) => setFile(e.target.files[0] || null)} /></label>
        <B busy={busy} k="chg" className="accent" disabled={!dollars(amount) || !reason.trim() || !!busy} onClick={go}>{t("Send the change order")}</B>
      </div>
    </details>
  );
}

// checked invoices (jobs taken outside VeriPay, billed through PayPal Invoicing once the checks pass): a QR to pay on
// site, a reminder from PayPal, or cash recorded (closed with no fee and no payout)
export function ProInvoices() {
  const { me, toast } = useMe(), list = useApi(me?.person?.role === "pro" ? "/api/pro/invoices" : null), [qr, setQr] = useState({});
  if (me === null) return <NeedSignIn what="invoices" as="pro" />;
  if (notPro(me)) return <NotPro />;
  const act = async (x, path, body = {}, ok) => { try { await api(`/api/pro/invoices/${x.id}/${path}`, { method: "POST", body }); toast(ok); list.reload(); } catch (e) { toast(e.message, true); } };
  const cash = async (x) => { if (await askConfirm({ title: `Paid in cash: ${x.number}`, body: `Close ${x.number} as paid outside PayPal? No money moves in PayPal: no platform fee, and no payout (you already have the money).`, ok: "Mark as paid" })) act(x, "paid-outside", { method: "CASH" }, "Marked as paid in cash."); };
  const rows = list.data || [];
  return (
    <div className="stack-l">
      <div className="page-head"><div><h1>{t("Invoices")}</h1><p className="lede">Jobs you took outside VeriPay, billed with PayPal Invoicing once the same checks pass.</p></div></div>
      {list.data && !rows.length && <div className="empty"><p className="small">{t("No invoices yet. Your agent makes one with create_invoice.")}</p></div>}
      <PlanMonths />
      <Templates onMade={list.reload} />
      <PayLinks />
      <div className="stack">{rows.map((x) => <section key={x.id} className="panel stack-s">
        <div className="row between"><div><b>{x.number}</b> · {x.title}<div className="tiny muted">{x.customer?.name} · {x.paypal?.id || "not in PayPal yet"}{x.paypal?.status === "SCHEDULED" ? ` · PayPal sends it on ${x.paypal.scheduledFor || x.sendOn}` : ""}{x.payTerm && x.payTerm !== "DUE_ON_RECEIPT" ? ` · ${x.payTerm.replace("_", " ").toLowerCase()}` : ""}{x.salesTax ? ` · ${m(x.salesTax)} sales tax (yours to remit)` : ""}{x.allowTip ? " · tips on" : ""}{x.minDue ? ` · parts from ${m(x.minDue)}` : ""}{x.paidSoFar && x.status === "sent" ? ` · ${m(x.paidSoFar)} paid so far` : ""}{x.tip ? ` · ${m(x.tip)} tip (all yours)` : ""}</div></div><div className="row"><b className="num">{m(x.amount)}</b><span className="badge">{String(x.status).replace("_", " ")}</span></div></div>
        {x.status === "sent" && <div className="row" style={{ alignItems: "flex-start", gap: "var(--s4)" }}>
          {qr[x.id] ? <img src={`/api/pro/invoices/${x.id}/qr.png`} width="150" height="150" alt={`QR code to pay ${x.number} with PayPal`} /> : <button className="btn sm" onClick={() => setQr({ ...qr, [x.id]: true })}>{t("Show QR to pay")}</button>}
          <div className="stack-s"><button className="btn sm ghost" onClick={() => act(x, "remind", {}, "PayPal sent the customer a reminder.")}>{t("Send a reminder")}</button>
            <button className="btn sm ghost" onClick={() => cash(x)}>{t("Paid in cash")}</button>
            {x.paypal?.status === "SCHEDULED" && <button className="btn sm ghost" onClick={async () => { const d = prompt("Send it on (YYYY-MM-DD):", x.sendOn || ""); if (!d) return; try { await api(`/api/pro/invoices/${x.id}/scheduled`, { method: "PATCH", body: { sendOn: d } }); toast("PayPal will send it then."); list.reload(); } catch (e) { toast(e.message, true); } }}>{t("Change send date")}</button>}
            <button className="btn sm ghost" onClick={async () => { if (await askConfirm({ title: `Cancel ${x.number}?`, body: "PayPal withdraws the invoice and tells the customer it's cancelled. Nothing was paid on it.", ok: "Cancel invoice" })) act(x, "cancel", {}, "Cancelled in PayPal."); }}>{t("Cancel")}</button>
            {(x.reminders || []).length > 0 && <span className="tiny muted">Reminded {when(x.reminders.at(-1))}</span>}</div>
        </div>}
        {x.status === "paid_outside" && <p className="small muted">Paid outside PayPal: no platform fee, no payout.</p>}
        {x.status !== "cancelled" && <div className="row"><button className="btn sm ghost" onClick={async () => { try { await api("/api/pro/invoice-templates", { method: "POST", body: { from: x.id } }); toast("Saved as a template in PayPal."); dispatchEvent(new Event("templates")); } catch (e) { toast(e.message, true); } }}>{t("Save as template")}</button>{x.template && <span className="tiny muted">From template {x.template.paypal}</span>}</div>}
        {x.status === "paid" && x.money?.split && <p className="small">Paid in PayPal: {m(x.money.split.pro)} to you, {m(x.money.split.fee)} fee.</p>}
      </section>)}</div>
    </div>
  );
}

// a maintenance plan's months: each one PayPal charged waits here for the visit's proof (same checks as the first job)
function PlanMonths() {
  const { toast } = useMe(), list = useApi("/api/pro/plans"), [f, setF] = useState({}), [busy, setBusy] = useState(null);
  const rows = (list.data || []).filter((p) => p.cycles.length || p.status === "active");
  if (!rows.length) return null;
  const send = async (p, c) => {
    setBusy(`${p.id}-${c.n}`);
    try {
      const items = [];
      for (const k of p.scope.checks) { const v = f[`${p.id}-${c.n}-${k.id}`]; if (!v) continue; items.push(k.evidence === "note" ? { kind: "note", text: v, checkId: k.id } : { kind: "photo", dataUrl: await readData(v), name: v.name, checkId: k.id }); }
      const r = await api(`/api/pro/plans/${p.id}/months/${c.n}/evidence`, { method: "POST", body: { items, submit: true } });
      toast(`Month ${c.n}: ${r.cycles.find((x) => x.n === c.n)?.status.replace(/_/g, " ")}`); list.reload();
    } catch (e) { toast(e.message, true); }
    setBusy(null);
  };
  return (
    <section className="stack">
      <h2 style={{ fontSize: "var(--fs-h3)" }}>{t("Monthly plans")}</h2>
      <p className="small ink2">PayPal charges each month; the money waits with VeriPay until that month's visit is proven, then you're paid. No proof in 30 days: the month goes back to the customer.</p>
      {rows.map((p) => <div key={p.id} className="panel stack-s"><div className="row between"><b>{p.number} · {p.title}</b><span className="num">{m(p.amount)} / month{p.status === "paused" ? " · paused" : ""}</span></div>
        {["active", "paused"].includes(p.status) && <div className="row">{p.priceChange ? <span className="tiny muted">You asked {m(p.priceChange.amount)}; waiting for the customer.</span> : <><input className="input sm" style={{ maxWidth: 100 }} inputMode="decimal" placeholder="New price" value={f[`${p.id}-price`] || ""} onChange={(e) => setF({ ...f, [`${p.id}-price`]: e.target.value })} aria-label="New monthly price" /><button className="btn ghost sm" onClick={async () => { try { await api(`/api/pro/plans/${p.id}/price`, { method: "POST", body: { amount: f[`${p.id}-price`] } }); toast("Sent to the customer."); list.reload(); } catch (e) { toast(e.message, true); } }}>{t("Propose a new price")}</button></>}</div>}
        {p.cycles.map((c) => <div key={c.n} className="stack-s"><p className="data">Month {c.n} · {m(c.amount)} · {c.status.replace(/_/g, " ")}{["waiting_for_proof", "needs_fix"].includes(c.status) ? ` · proof due ${when(c.proofDue)}` : ""}</p>
          {c.lastCheck && c.status !== "paid" && <ul className="small">{c.lastCheck.checks.map((k) => <li key={k.id}>{k.what}: <b>{k.verdict}</b> · {k.reason}</li>)}</ul>}
          {["waiting_for_proof", "needs_fix"].includes(c.status) && <div className="stack-s">{p.scope.checks.map((k) => <label key={k.id} className="field"><span>{k.what}</span>{k.evidence === "note" ? <input className="input" onChange={(e) => setF({ ...f, [`${p.id}-${c.n}-${k.id}`]: e.target.value })} /> : <input type="file" accept="image/jpeg" capture="environment" onChange={(e) => setF({ ...f, [`${p.id}-${c.n}-${k.id}`]: e.target.files[0] })} />}</label>)}
            <button className={`btn sm ${busy === `${p.id}-${c.n}` ? "busy" : ""}`} disabled={!!busy} onClick={() => send(p, c)}>{t("Send and check")}</button></div>}
        </div>)}
      </div>)}
    </section>
  );
}

export function ProPayouts() {
  const { me, toast, reload } = useMe(), pay = useApi(me?.person?.role === "pro" ? "/api/pro/payouts" : null), self = useApi(me?.person?.role === "pro" ? "/api/pro/me" : null);
  const [key, setKey] = useState(null), [f, setF] = useState(null);
  useEffect(() => { const p = self.data?.pro; if (p) setF({ email: p.payout?.email || "", helperName: p.helper?.name || "", helperEmail: p.helper?.paypal?.email || "", helperShare: p.helper?.share ?? 0.2 }); }, [self.data]);
  if (me === null) return <NeedSignIn what="payouts" as="pro" />;
  if (notPro(me)) return <NotPro />;
  const d = pay.data, p = self.data?.pro;
  const save = async () => { try { await api("/api/pro/paypal", { method: "PUT", body: { ...f, helperShare: +f.helperShare } }); toast("Saved and verified."); self.reload(); reload(); } catch (e) { toast(e.message, true); } };
  const linked = new URLSearchParams(location.search).get("paypal");
  const login = async () => { try { const r = await api("/api/pro/paypal-login", { method: "POST", body: {} }); location.href = r.url; } catch (e) { toast(e.message, true); } };
  return (
    <div className="stack-l">
      <div className="page-head"><div>{p && <p className="row" style={{ marginBottom: 8 }}><Badges pro={p} /><Link className="small" to={`/pros/${p.id}`}>{t("Your public profile →")}</Link></p>}<h1>{t("Payouts")}</h1><p className="lede">Paid with PayPal Payouts when a job's conditions pass: you and your helper in one batch, each to their own verified PayPal. No agent can change where the money goes.</p></div></div>
      {d && <div className="stat-row"><div className="stat"><b>{m(d.total)}</b><span>{t("PAID TO YOU")}</span></div><div className="stat"><b>{m(d.helpers)}</b><span>{t("PAID TO HELPERS")}</span></div><div className="stat"><b>{d.jobs.length}</b><span>{t("JOBS PAID")}</span></div></div>}
      <div className="bo-split">
        <section className="stack-s"><h2 style={{ fontSize: "var(--fs-h3)" }}>{t("Each payout")}</h2>
          {d && !d.jobs.length && <div className="empty"><p className="small">{t("No payouts yet.")}</p></div>}
          <div className="scroll-x"><table className="table"><thead><tr><th>Job</th><th>{t("Paid")}</th><th className="r">{t("Released")}</th><th className="r">{t("You")}</th><th className="r">{t("Helper")}</th><th className="r">Fee</th><th>{t("Batch")}</th></tr></thead>
            <tbody>{(d?.jobs || []).map((x) => <tr key={x.job}><td><Link to={`/pro/jobs/${x.job}`}>{x.number}</Link><div className="tiny muted">{x.title}</div></td><td className="num">{when(x.at)}</td><td className="num r">{m(x.release)}</td><td className="num r">{m(x.pro)}</td><td className="num r">{m(x.helper)}</td><td className="num r">{m(x.fee)}</td><td className="num">{x.payout?.batchId || x.payout || "—"}<div className="tiny muted">{x.payout?.status}</div></td></tr>)}</tbody></table></div>
        </section>
        <aside className="stack">
          {f && <div className="panel marks stack"><h3>{t("Where you're paid")}</h3>
            <label className="field"><span>{t("YOUR PAYPAL EMAIL")}</span><input className="input" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></label>
            <label className="field"><span>{t("HELPER")}</span><input className="input" value={f.helperName} onChange={(e) => setF({ ...f, helperName: e.target.value })} /></label>
            <label className="field"><span>{t("HELPER'S PAYPAL EMAIL")}</span><input className="input" type="email" value={f.helperEmail} onChange={(e) => setF({ ...f, helperEmail: e.target.value })} /></label>
            <label className="field"><span>{t("HELPER'S SHARE OF YOURS (0–50%)")}</span><input className="input" type="number" min="0" max="0.5" step="0.05" value={f.helperShare} onChange={(e) => setF({ ...f, helperShare: e.target.value })} /></label>
            <p className="tiny muted">{p?.payout?.verified ? `Verified: ${p.payout.method}${p.payout.payerId ? ` · payer ${p.payout.payerId}` : ""}.` : "Not verified."} Typing an email verifies it in the demo; Log in with PayPal lets PayPal say which account it is.</p>
            {linked && <p className={`note small ${linked === "linked" ? "good" : "bad"}`}>{linked === "linked" ? t("Linked with Log in with PayPal.") : linked}</p>}
            <div className="row"><button className="btn" onClick={save}>{t("Save")}</button><button className="btn ghost" onClick={login}>{t("Log in with PayPal")}</button></div>
          </div>}
          {p && <p className="small"><Link to="/pro/earnings">{t("Earnings")} →</Link> · <Link to={`/pros/${p.id}`}>{t("Your verified work record")} →</Link></p>}
          {p && <Availability />}
          {p && <Merchant toast={toast} />}
          {p && <PayoutMethod pro={p} reload={() => { self.reload(); reload(); }} />}
          {p && <Rates pro={p} reload={() => { self.reload(); reload(); }} />}
          {p && <Verify pro={p} reload={() => { self.reload(); reload(); }} />}
          {p && <Books />}
          <div className="panel stack-s"><h3>{t("Your own agent (A2A)")}</h3>
            <p className="small ink2">{t("A key lets your agent quote, counter, ask for change orders and send evidence for you at ")}<span className="mono">/a2a</span>. It can't change where you're paid.</p>
            <button className="btn sm" onClick={async () => { try { setKey(await api("/api/pro/keys", { method: "POST", body: { label: "my agent" } })); self.reload(); } catch (e) { toast(e.message, true); } }}>{t("Make a key")}</button>
            {key && <div className="note good small stack-s"><b>{t("Shown once:")}</b><code className="mono wrap-any">{key.key}</code><span className="tiny">{key.note}</span></div>}
            {(p?.keys || []).map((k) => <div key={k.id} className="row between small"><span>{k.label} <span className="mono tiny muted">{k.hint}</span></span><button className="btn ghost sm" onClick={async () => { await api(`/api/pro/keys/${k.id}`, { method: "DELETE" }); self.reload(); }}>{t("Revoke")}</button></div>)}
          </div>
        </aside>
      </div>
    </div>
  );
}

// licence and insurance: checked against the demo registry (TSBPE's format, fictional records) and the certificate
function Verify({ pro, reload }) {
  const { toast } = useMe(), v = pro.verification || {};
  const [lic, setLic] = useState(v.license?.number || ""), [doc, setDoc] = useState(null), [busy, setBusy] = useState(false), [insDirty, setDirty] = useState(false);
  const [ins, setIns0] = useState({ carrier: v.insurance?.carrier || "", policy: v.insurance?.policy || "", limit: v.insurance?.limit ? String(v.insurance.limit).replace(/[$,]|\.00$/g, "") : "", expires: (v.insurance?.expires || "").slice(0, 10) });
  const setIns = (x) => { setIns0(x); setDirty(true); };
  const save = async () => {
    setBusy(true);
    try {
      const body = {};
      if (lic.trim() && lic.trim() !== v.license?.number) body.license = { number: lic.trim() };
      if (insDirty && ins.carrier.trim()) body.insurance = { carrier: ins.carrier.trim(), policy: ins.policy.trim() || undefined, limit: dollars(ins.limit) != null ? Math.round(dollars(ins.limit) * 100) : undefined, expires: ins.expires || undefined };
      if (doc) body.insuranceDoc = await readData(doc);
      await api("/api/pro/verification", { method: "PUT", body }); toast("Checked and saved."); reload();
    } catch (e) { toast(e.message, true); }
    setBusy(false);
  };
  return (
    <div className="panel stack-s">
      <h3>{t("Licence and insurance")}</h3>
      <ul className="spec">
        <li><span className="lead">{t("Licence")}</span><span className={`val ${v.license?.valid ? "ok" : v.license?.required ? "warn" : ""}`}>{v.license ? (v.license.valid ? `${v.license.class} ${v.license.number}, ${v.license.status}` : v.license.why || "not verified") : "—"}</span></li>
        <li><span className="lead">{t("Insurance")}</span><span className={`val ${v.insurance?.valid ? "ok" : "warn"}`}>{v.insurance?.valid ? `${v.insurance.carrier}, ${v.insurance.limit}, to ${day(v.insurance.expires)}` : (v.insurance?.problems || []).join("; ") || "not on file"}</span></li>
        <li><span className="lead">{t("Staff review")}</span><span className="val">{v.reviewed ? (v.reviewed.ok ? "reviewed" : "flagged") : "not yet"}</span></li>
      </ul>
      {v.registry && <p className="tiny muted">{v.registry}</p>}
      <label className="field"><span>{t("TSBPE LICENCE (M-, J-, T- OR RMP- AND 5 DIGITS)")}</span><input className="input sm" value={lic} onChange={(e) => setLic(e.target.value)} placeholder="M-41877" /></label>
      <div className="fields-3">
        <label className="field"><span>{t("INSURER")}</span><input className="input sm" value={ins.carrier} onChange={(e) => setIns({ ...ins, carrier: e.target.value })} /></label>
        <label className="field"><span>{t("POLICY")}</span><input className="input sm" value={ins.policy} onChange={(e) => setIns({ ...ins, policy: e.target.value })} /></label>
        <label className="field"><span>{t("GENERAL LIABILITY")}</span><span className="money-in"><input className="input sm" inputMode="decimal" value={ins.limit} onChange={(e) => setIns({ ...ins, limit: e.target.value })} placeholder="1000000" /></span></label>
        <label className="field"><span>{t("EXPIRES")}</span><input className="input sm" type="date" value={ins.expires} onChange={(e) => setIns({ ...ins, expires: e.target.value })} /></label>
      </div>
      <PhotoPicker files={doc ? [doc] : []} setFiles={(f) => setDoc(f[0] || null)} label="Certificate of insurance (photo)" multiple={false} capture={false} small />
      <p className="tiny muted">Insurance needs at least $300,000 general liability, not expired. Handyman and cleaning work needs no state licence in Texas.</p>
      <button className={`btn sm ${busy ? "busy" : ""}`} disabled={busy} onClick={save}>{t("Check and save")}</button>
    </div>
  );
}

// your price rules: what your agent (or the demo agent) quotes from. Dollars; PUT /api/pro/rates
function Rates({ pro, reload }) {
  const { toast } = useMe(), r = pro.rules || {}, num = (x) => (x == null ? "" : String(x).replace(/[^\d.]/g, ""));
  const per = String(r.perMileBeyond || "").match(/\$([\d.]+).*?past (\d+)/);
  const [f, setF] = useState({ callout: num(r.callout), hourly: num(r.hourly), perMile: per?.[1] || "", freeMiles: per?.[2] || "", radius: num(r.radiusMiles), lead: num(r.leadHours), rush: num(r.rushMultiplier), partsPolicy: r.partsPolicy || "at_cost" });
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try {
      const body = {};
      for (const k of ["callout", "hourly", "perMile", "freeMiles", "radius", "lead", "rush"]) if (f[k] !== "") body[k] = +f[k];
      body.partsPolicy = f.partsPolicy;
      await api("/api/pro/rates", { method: "PUT", body }); toast("Rates saved: your next quotes use them."); reload();
    } catch (e) { toast(e.message, true); }
    setBusy(false);
  };
  const F = (k, label, money) => <label className="field"><span>{label}</span>{money ? <span className="money-in"><input className="input sm" inputMode="decimal" value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} /></span> : <input className="input sm" inputMode="decimal" value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} />}</label>;
  return (
    <div className="panel stack-s">
      <h3>{t("Your rates")}</h3>
      <p className="small ink2">{t("Your agent quotes from these. Customers see the breakdown with every offer.")}</p>
      <div className="fields-3">{F("callout", "CALL-OUT", true)}{F("hourly", "HOURLY", true)}{F("perMile", "PER MILE", true)}{F("freeMiles", "FREE MILES")}{F("radius", "SERVICE RADIUS (MILES)")}{F("lead", "LEAD TIME (HOURS)")}{F("rush", "RUSH MULTIPLIER")}</div>
      <label className="field"><span>{t("PARTS")}</span><select className="input sm" value={f.partsPolicy} onChange={(e) => setF({ ...f, partsPolicy: e.target.value })}><option value="at_cost">at cost (receipt)</option><option value="markup_10">cost + 10%</option><option value="included">included in the price</option></select></label>
      <button className={`btn sm ${busy ? "busy" : ""}`} disabled={busy} onClick={save}>{t("Save rates")}</button>
    </div>
  );
}

// materials advance: an approved materials change order can be paid now, out of the customer's hold
const ADV = { checked: "Checked: paying now", paying: "Paying now", paid: "Paid", awaiting_customer: "Sent to the customer", needs_fix: "Send what's missing", rejected: "Refused by the checks", declined: "The customer declined", failed: "Payment failed" };
function AdvanceAsk({ j, c, busy, act, toast }) {
  const [inv, setInv] = useState(null), [photo, setPhoto] = useState(null), [supplier, setSupplier] = useState("");
  if (c.kind !== "materials" || c.status !== "approved") return null;
  const a = c.advance, again = !a || ["needs_fix", "rejected", "declined", "failed"].includes(a.status);
  const go = async () => {
    let items;
    try { items = [{ kind: "receipt", dataUrl: await readData(inv), name: inv.name }, { kind: "photo", dataUrl: await readData(photo), name: photo.name }]; } catch { toast("Couldn't read those files.", true); return; }
    act(`adv${c.id}`, `/api/pro/jobs/${j.id}/changes/${c.id}/advance`, { items, ...(supplier.trim() ? { supplierEmail: supplier.trim() } : {}) }, () => { setInv(null); setPhoto(null); });
  };
  return (
    <div className="stack-s">
      {a && <p className="small"><b>Materials advance {m(a.amount)}:</b> {ADV[a.status] || a.status}{a.status === "paid" ? " to your PayPal. It comes off your payment at the end." : a.status === "awaiting_customer" ? ` (needs ${a.needs || "the customer"}).` : "."}</p>}
      {a?.check?.reasons?.length > 0 && <ul className="tiny ink2" style={{ margin: 0, paddingLeft: 18 }}>{a.check.reasons.map((r, i) => <li key={i}>{String(r).replace(/\bev_[0-9a-f]{6,}\b/g, "a photo")}</li>)}</ul>}
      {again && <details className="stack-s" open={!a}>
        <summary>{t("NEED MONEY FOR MATERIALS NOW?")}</summary>
        <Why><p>Send the supplier's invoice and a photo of the materials on site. Code reads the invoice (store, items, total, date) and checks it fits the job, isn't over {m(c.amount)}, wasn't used on another job, and the photo is at the job. If it passes and it's within the customer's limit, PayPal pays you now; otherwise the customer decides. It comes off your final payment.</p></Why>
        <div className="fields-3">
          <label className="drop" style={{ position: "relative" }}><Icon name="camera" /><span>{inv ? inv.name : "Scan the invoice or receipt (camera, photo or PDF)"}</span><input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={(e) => setInv(e.target.files[0] || null)} /></label>
          <label className="drop" style={{ position: "relative" }}><Icon name="camera" /><span>{photo ? photo.name : "Photo of the materials on site"}</span><input type="file" accept="image/jpeg,image/png,image/webp" capture="environment" onChange={(e) => setPhoto(e.target.files[0] || null)} /></label>
          <label className="field"><span>{t("PAY THE SUPPLIER DIRECTLY (OPTIONAL)")}</span><input className="input" type="email" value={supplier} onChange={(e) => setSupplier(e.target.value)} placeholder="supplier's PayPal email" /><span className="tiny muted" style={{ marginTop: 4 }}>{t("Then the customer always decides.")}</span></label>
        </div>
        <div><button className={`btn accent sm ${busy === `adv${c.id}` ? "busy" : ""}`} disabled={!!busy || !inv || !photo} onClick={go}>Ask for {m(c.amount)} now</button></div>
      </details>}
    </div>
  );
}

// the pro's books, from the ledger of every job: monthly CSV (or QuickBooks' bank-upload format), the year summary
export function Books() {
  const now = new Date(), [month, setMonth] = useState(now.toISOString().slice(0, 7)), year = month.slice(0, 4);
  const sum = useApi(`/api/pro/books/summary?year=${year}`), s = sum.data;
  return (
    <section className="panel marks stack-s" aria-labelledby="h-books">
      <div className="panel-h"><h3 id="h-books">{t("Books")}</h3><span className="src code">{t("FROM THE LEDGER, BY CODE")}</span></div>
      <div className="row" style={{ alignItems: "end", gap: 10 }}>
        <label className="field"><span>{t("MONTH")}</span><input className="input sm" type="month" value={month} onChange={(e) => setMonth(e.target.value || month)} /></label>
        <a className="btn sm" href={`/api/pro/books.csv?month=${month}`}>{t("Download CSV")}</a>
        <a className="btn sm" href={`/api/pro/books.csv?month=${month}&format=qbo`}>{t("QuickBooks CSV")}</a>
        <a className="btn sm" href={`/api/pro/books.csv?year=${year}`}>Whole {year}</a>
      </div>
      <p className="tiny muted">QuickBooks CSV is the Online bank-upload format (Date, Description, Amount). The detailed CSV adds the job, account and PayPal reference.</p>
      {s && <ul className="spec">
        <li><span className="lead">{s.year}: gross receipts</span><span className="val">{usd(s.gross)}</span></li>
        <li><span className="lead">{t("Paid to you")}</span><span className="val">{usd(s.income)}</span></li>
        <li><span className="lead">{t("Fees")}</span><span className="val">{usd(s.fees)}</span></li>
        <li><span className="lead">{t("Paid to helpers")}</span><span className="val">{usd(s.helpers)}</span></li>
        <li><span className="lead">{t("Materials reimbursed")}</span><span className="val">{usd(s.materialsReimbursed)}</span></li>
      </ul>}
      {s?.notTaxAdvice && <p className="tiny muted">{s.notTaxAdvice}</p>}
    </section>
  );
}

// paid to PayPal (default) or to Venmo (a US mobile number); the verified PayPal stays the fallback. PIN step-up.
function PayoutMethod({ pro, reload }) {
  const { toast } = useMe(), cur = pro.payoutMethod || { method: "paypal" }, [method, setMethod] = useState(cur.method), [phone, setPhone] = useState(""), [busy, setBusy] = useState(false);
  const save = async () => { setBusy(true); try { await api("/api/pro/payout-method", { method: "PUT", body: method === "venmo" ? { method, phone } : { method: "paypal" } }); toast(t("Saved.")); reload(); } catch (e) { if (!e.cancelled) toast(e.message, true); } setBusy(false); };
  return (
    <section className="panel stack-s" aria-labelledby="h-pm">
      <h3 id="h-pm">{t("How you're paid")}</h3>
      <p className="small ink2">{cur.method === "venmo" ? `${t("Now")}: Venmo ${cur.to || ""}. ${cur.says || ""}` : t("Now: your verified PayPal.")}</p>
      <div className="row" style={{ gap: 12 }}>
        <label className="check-row"><input type="radio" name="pm" checked={method === "paypal"} onChange={() => setMethod("paypal")} /><span>PayPal</span></label>
        <label className="check-row"><input type="radio" name="pm" checked={method === "venmo"} onChange={() => setMethod("venmo")} /><span>Venmo</span></label>
      </div>
      {method === "venmo" && <label className="field" style={{ maxWidth: 260 }}><span>{t("YOUR VENMO MOBILE NUMBER (US)")}</span><input className="input" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(512) 555-0142" /></label>}
      <p className="tiny muted">{t("Your verified PayPal stays required and is the fallback. PayPal's sandbox refuses Venmo payouts, so in this demo a Venmo payout falls back to your PayPal, and the payout says so. Helpers are always paid to their PayPal.")}</p>
      <div><button className={`btn sm ${busy ? "busy" : ""}`} disabled={busy || (method === "venmo" && phone.replace(/\D/g, "").length < 10)} onClick={save}>{t("Save")}</button></div>
    </section>
  );
}

// the pro as a PayPal merchant of their own (Partner Referrals v2): PayPal's onboarding, then PayPal's status
function Merchant({ toast }) {
  const st = useApi("/api/pro/paypal-onboarding"), [busy, setBusy] = useState(false), d = st.data, back = new URLSearchParams(location.search).get("onboarding");
  if (!d) return null;
  const start = async () => { setBusy(true); try { const r = await api("/api/pro/paypal-onboarding", { method: "POST", body: {} }); location.href = r.url; } catch (e) { toast(e.message, true); setBusy(false); } };
  const check = async () => { setBusy(true); try { await api("/api/pro/paypal-onboarding?sync=1"); st.reload(); } catch (e) { toast(e.message, true); } setBusy(false); };
  return (
    <div className="panel marks stack-s">
      <h3>{t("Get paid as a PayPal merchant")}</h3>
      <p className="small ink2">{d.says}</p>
      {d.status !== "none" && <ul className="tiny muted"><li>Payments receivable: {d.receivable == null ? "—" : d.receivable ? "yes" : "no"}</li><li>Email confirmed at PayPal: {d.emailConfirmed == null ? "—" : d.emailConfirmed ? "yes" : "no"}</li><li>VeriPay permitted (payments, refunds, platform fee): {d.consented == null ? "—" : d.consented ? "yes" : "no"}</li>{d.paypalSays && <li className="bad">PayPal: {d.paypalSays}</li>}</ul>}
      {back && <p className="note small">{back === "ready" ? t("PayPal says you're ready.") : `PayPal: ${back}`}</p>}
      <div className="row">{d.status !== "ready" && <button className={`btn sm ${busy ? "busy" : ""}`} disabled={busy} onClick={start}>{d.status === "none" ? t("Set up with PayPal") : t("Continue at PayPal")}</button>}{d.status !== "none" && <button className="btn sm ghost" disabled={busy} onClick={check}>{t("Check with PayPal")}</button>}</div>
      <p className="tiny muted">PayPal's partner onboarding: customers' holds go straight to your PayPal and PayPal takes VeriPay's fee. Until then you're paid with Payouts.</p>
    </div>
  );
}

// invoice templates (PayPal Invoicing v2 templates): a pro's usual job, billed again to a new customer; the checks
// still run on every invoice made from one
function Templates({ onMade }) {
  const { toast } = useMe(), list = useApi("/api/pro/invoice-templates"), [to, setTo] = useState({}), [busy, setBusy] = useState(null);
  useEffect(() => { const f = () => list.reload(); addEventListener("templates", f); return () => removeEventListener("templates", f); }, []);
  const rows = list.data || [];
  if (!rows.length) return null;
  const bill = async (tp) => { const c = to[tp.id] || {}; setBusy(tp.id); try { await api("/api/pro/invoices", { method: "POST", body: { template: tp.id, customer: { name: c.name || "", email: c.email || "" }, allowTip: !!c.tip, ...(c.minDue ? { minDue: c.minDue } : {}) } }); toast(`Draft invoice from "${tp.name}": add the evidence to send it.`); setTo({ ...to, [tp.id]: {} }); onMade?.(); } catch (e) { toast(e.message, true); } setBusy(null); };
  const del = async (tp) => { setBusy(tp.id); try { await api(`/api/pro/invoice-templates/${tp.id}`, { method: "DELETE" }); list.reload(); } catch (e) { toast(e.message, true); } setBusy(null); };
  return (
    <section className="panel stack-s">
      <h3>{t("Templates")}</h3>
      <p className="tiny muted">Kept as templates in PayPal's invoicer. Each invoice made from one still waits for the evidence checks.</p>
      {rows.map((tp) => <div key={tp.id} className="row between" style={{ flexWrap: "wrap", gap: "var(--s2)" }}>
        <div><b>{tp.name}</b> · <span className="num">{m(tp.amount)}</span><div className="tiny muted">{tp.paypal.templateId} · {(tp.checks || []).length} done-conditions</div></div>
        <div className="row"><input className="input" placeholder="Customer name" value={to[tp.id]?.name || ""} onChange={(e) => setTo({ ...to, [tp.id]: { ...to[tp.id], name: e.target.value } })} /><input className="input" type="email" placeholder="Customer email" value={to[tp.id]?.email || ""} onChange={(e) => setTo({ ...to, [tp.id]: { ...to[tp.id], email: e.target.value } })} />
          <label className="tiny row"><input type="checkbox" checked={!!to[tp.id]?.tip} onChange={(e) => setTo({ ...to, [tp.id]: { ...to[tp.id], tip: e.target.checked } })} />{t("Allow a tip")}</label>
          <input className="input" style={{ maxWidth: 130 }} inputMode="decimal" placeholder={t("Pay in parts: min $")} title="PayPal lets the customer pay in parts, at least this much each time; you're paid once it's paid in full" value={to[tp.id]?.minDue || ""} onChange={(e) => setTo({ ...to, [tp.id]: { ...to[tp.id], minDue: e.target.value } })} />
          <button className={`btn sm ${busy === tp.id ? "busy" : ""}`} disabled={!!busy} onClick={() => bill(tp)}>{t("Bill again")}</button><button className="btn sm ghost" disabled={!!busy} onClick={() => del(tp)}>{t("Delete")}</button></div>
      </div>)}
    </section>
  );
}

// PayPal Payment Links: a deposit or a small extra, paid at PayPal; VeriPay keeps its fee and pays you with Payouts
function PayLinks() {
  const { toast } = useMe(), list = useApi("/api/pro/paylinks"), [f, setF] = useState({ title: "", amount: "", purpose: "deposit" }), [busy, setBusy] = useState(false);
  const reprice = async (l) => { const a = prompt(`New price for ${l.number} (USD):`, (l.amount.cents / 100).toFixed(2)); if (!a) return; try { await api(`/api/pro/paylinks/${l.id}`, { method: "PATCH", body: { amount: a } }); list.reload(); toast("Same link, new price in PayPal."); } catch (e) { toast(e.message, true); } };
  const make = async () => { setBusy(true); try { await api("/api/pro/paylinks", { method: "POST", body: f }); setF({ title: "", amount: "", purpose: "deposit" }); list.reload(); toast("Link made in PayPal."); } catch (e) { toast(e.message, true); } setBusy(false); };
  const act = async (l, path) => { try { await api(`/api/pro/paylinks/${l.id}/${path}`, { method: "POST" }); list.reload(); } catch (e) { toast(e.message, true); } };
  const copy = async (u) => { try { await navigator.clipboard.writeText(u); toast("Link copied."); } catch { prompt("Copy the link:", u); } };
  return (
    <section className="panel stack-s">
      <h3>{t("PayPal payment links")}</h3>
      <p className="tiny muted">For a deposit or a small extra agreed in advance: the customer pays at PayPal, no account with VeriPay. VeriPay keeps its fee and pays you with Payouts. A job's own payment always goes through the hold and the checks.</p>
      <div className="row" style={{ flexWrap: "wrap" }}><select className="input sm" value={f.purpose} onChange={(e) => setF({ ...f, purpose: e.target.value })} aria-label="For"><option value="deposit">Deposit</option><option value="extra">Extra work</option><option value="other">Other</option></select>
        <input className="input" placeholder="What it's for" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /><input className="input" style={{ width: 110 }} inputMode="decimal" placeholder="USD" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} />
        <button className={`btn sm ${busy ? "busy" : ""}`} disabled={busy} onClick={make}>{t("Make link")}</button></div>
      {(list.data || []).map((l) => <div key={l.id} className="row between small" style={{ flexWrap: "wrap" }}>
        <span><b>{l.number}</b> · {l.title} · <span className="num">{m(l.amount)}</span> · {l.status}{l.payments.length ? ` · paid ${l.payments.length}×` : ""}{l.paypalSays && <span className="tiny bad"> · PayPal: {l.paypalSays}</span>}</span>
        <span className="row">{l.url && <><button className="btn sm ghost" onClick={() => copy(l.url)}>{t("Copy link")}</button><button className="btn sm ghost" onClick={() => act(l, "sync")}>{t("Check payments")}</button><button className="btn sm ghost" onClick={() => reprice(l)}>{t("Change price")}</button><button className="btn sm ghost" onClick={() => act(l, "close")}>{t("Close")}</button></>}</span>
      </div>)}
    </section>
  );
}
