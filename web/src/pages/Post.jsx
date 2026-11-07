// Post a job: say what's wrong in a sentence, Done writes the work order (what to do, the done-conditions and the
// evidence each one needs, a price ceiling and a window), the person edits anything, then posts it and the pros'
// agents quote. The work order is the contract: the checks run against these exact conditions.
import { useEffect, useRef, useState } from "react";
import { api, dollars, day, navigate, Link, usd, m } from "../api.jsx";
import { showPinOnce } from "../components/Pin.jsx";
import { useMe } from "../App.jsx";
import { Src } from "../components/job.jsx";
import Icon from "../components/Icon.jsx";
import { PhotoPicker, readData, ScopeReview } from "../components/parts.jsx";

// the scope writer's notes, for people: no environment variable names
const humanNote = (n) => (/DONE_[A-Z_]+|_URL|unset|not configured/.test(n) ? "No model is answering on this server right now, so the rules wrote this order." : /timed out|fell back|Model not used/i.test(n) ? "The model didn't answer in time, so the rules wrote this order. It's the same contract either way; you can edit it below." : n);

// milestones for a multi-day job: a title, a share of the price, which conditions belong to it, whether an inspector confirms it
function Milestones2({ wo, mss, setMss, shareSum }) {
  const ids = wo.checks.map((c) => c.id);
  const add = () => setMss(mss.length ? [...mss, { title: "", share: 0, checkIds: [], inspect: false }] : [{ title: "First part", share: 50, checkIds: ids.slice(0, Math.ceil(ids.length / 2)), inspect: false }, { title: "Finished", share: 50, checkIds: ids.slice(Math.ceil(ids.length / 2)), inspect: false }]);
  const upd = (i, patch) => setMss(mss.map((x, k) => (k === i ? { ...x, ...patch } : x)));
  const toggle = (i, id) => setMss(mss.map((x, k) => ({ ...x, checkIds: k === i ? (x.checkIds.includes(id) ? x.checkIds.filter((c) => c !== id) : [...x.checkIds, id]) : x.checkIds.filter((c) => c !== id) })));
  const drop = (i) => { const n = mss.filter((_, k) => k !== i); setMss(n.length > 1 ? n : []); };
  return (
    <div className="field"><span>MILESTONES · EACH PAID ON ITS OWN CONDITIONS</span>
      {!mss.length ? <p className="tiny muted">One payment for the whole job{/water_heater|remodel/.test(wo.template || "") ? ". This job type has a multi-day template (permit and removal, then installed and inspected): post it unedited and the server adds it, or split it yourself" : ""}. <button type="button" className="link" onClick={add}>Split into milestones</button></p> : <>
        {mss.map((x, i) => (
          <div key={i} className="ms-edit">
            <div className="row" style={{ gap: 8 }}>
              <span className="part">m{i + 1}</span>
              <input className="input sm" style={{ flex: "1 1 160px" }} value={x.title} onChange={(e) => upd(i, { title: e.target.value })} placeholder="What's done at this point" aria-label={`Milestone ${i + 1} title`} />
              <label className="row" style={{ gap: 4 }}><input className="input sm" style={{ width: 64 }} inputMode="numeric" value={x.share} onChange={(e) => upd(i, { share: e.target.value })} aria-label={`Milestone ${i + 1} share, percent`} /><span className="tiny">%</span></label>
              <label className="check-row tiny"><input type="checkbox" checked={x.inspect} onChange={(e) => upd(i, { inspect: e.target.checked })} /> inspector</label>
              <button type="button" className="btn sm" onClick={() => drop(i)} aria-label={`Remove milestone ${i + 1}`}>×</button>
            </div>
            <div className="chips" style={{ marginTop: 6 }}>{ids.map((id) => <button type="button" key={id} className={`chip tiny ${x.checkIds.includes(id) ? "on" : ""}`} onClick={() => toggle(i, id)}>{id}</button>)}</div>
          </div>
        ))}
        <div className="row between"><button type="button" className="link small" onClick={add}>+ Add a milestone</button><span className={`tiny mono ${shareSum === 100 ? "ok" : "bad"}`}>shares add to {shareSum}%{shareSum !== 100 ? " (must be 100)" : ""}</span></div>
      </>}
    </div>
  );
}

// what the rules already know before posting: permits and licences this job needs in Texas, and the photo checklist
function Prescreen({ wo }) {
  const c = wo.code, pc = wo.photoChecklist;
  if (!c && !pc) return null;
  const P = { required: "required", likely: "likely", not_usually: "not usually", unknown: "unknown" };
  return (
    <div className="note stack-s">
      <div className="row between"><b className="small">Before you post: what the rules see</b><Src s="rules" /></div>
      {c && <>
        <p className="small">Permit: <b>{P[c.permit] || c.permit}</b>{c.licence?.needed ? ` · licence: ${c.licence.who}` : " · no state licence needed"}</p>
        {c.rules?.map((r) => <p key={r.id} className="tiny">{r.says} <span className="muted">({r.cite})</span></p>)}
        {c.addChecks?.length > 0 && <p className="tiny">Added as conditions: {c.addChecks.map((x) => x.id).join(", ")}.</p>}
        <p className="tiny muted">{c.disclaimer}</p>
      </>}
      {pc && <p className="tiny">Photo checklist: {pc.total} shots ({pc.target}){pc.big ? ", a big job" : ""}: a BEFORE of each spot, a wide AFTER with the room around it, close-ups, and readable labels on new parts. The pro sees it shot by shot.</p>}
      <p className="tiny muted">The scope review below runs again when you accept an offer, on the order both sides agree to.</p>
    </div>
  );
}

const EXAMPLES = [
  "Kitchen faucet keeps dripping even when it's off. Fix it this week, $200 max.",
  "Toilet keeps running after every flush. Fix it tomorrow, under $180.",
  "Mount a 55 inch TV on drywall and hide the cables this weekend, $200.",
  "Deep clean of a 2-bedroom apartment before move-out, this weekend, $400 max.",
];
const RULE = { photo: "photo>=1;in_window;near_job;not_reused", receipt: "receipt>=1;read;in_window;matches_change_orders", note: "note>=1;words>=8" };
const isoDay = (iso) => (iso ? new Date(iso).toLocaleDateString("en-CA", { timeZone: "America/Chicago" }) : "");
// a day in Austin, 8 am to 8 pm (CST is UTC-6; close enough for a demo window, and the server allows an hour's slack)
const fromDay = (d) => `${d}T14:00:00.000Z`;
const toDay = (d) => new Date(Date.parse(`${d}T02:00:00.000Z`) + 864e5).toISOString();

export default function Post() {
  const { me, reload, toast } = useMe();
  const [msgs, setMsgs] = useState([]), [text, setText] = useState(""), [said, setSaid] = useState([]), [busy, setBusy] = useState(false);
  const [forLL, setForLL] = useState(true);
  const [wo, setWo] = useState(null), [budget, setBudget] = useState(""), [zip, setZip] = useState("78704"), [line, setLine] = useState(""), [buffer, setBuffer] = useState(20), [edited, setEdited] = useState(false);
  const end = useRef(null);
  const [opt, setOpt] = useState({ releaseMode: "instant", reviewHours: 48, retainPct: 0, warrantyDays: 14, inspector: "", requireBefore: false });
  const [mss, setMss] = useState([]), [photos, setPhotos] = useState([]), [inspectors, setInspectors] = useState([]);
  useEffect(() => { api("/api/inspectors").then(setInspectors).catch(() => {}); }, []);
  const setO = (patch) => setOpt((o) => ({ ...o, ...patch }));
  const shareSum = mss.reduce((t, x) => t + (+x.share || 0), 0);
  const [review, setReview] = useState(null);
  // the gap review before posting (POST /api/scope/review): vague or uncheckable conditions, missing evidence, permits
  const runReview = async (scope) => { try { setReview(await api("/api/scope/review", { method: "POST", body: { scope: { ...scope, priceCeiling: scope.priceCeiling?.cents != null ? scope.priceCeiling.cents / 100 : dollars(scope.priceCeiling) } } })); } catch { setReview(null); } };
  const applyGap = (g) => {
    if (g.checkId && wo.checks.some((c) => c.id === g.checkId)) upd({ checks: wo.checks.map((c) => (c.id === g.checkId ? { ...c, what: g.suggestion } : c)) });
    else { const ev = /receipt/i.test(g.suggestion) ? "receipt" : /note|licen[cs]e number|write/i.test(g.suggestion) ? "note" : "photo"; upd({ checks: [...wo.checks, { id: `c${wo.checks.length + 1}`, what: g.suggestion, evidence: ev, rule: RULE[ev] }] }); }
    setReview((r) => r && { ...r, gaps: r.gaps.filter((x) => x !== g) });
  };
  const applyAll = () => { const v = review?.revisedScope; if (!v) return; upd({ title: v.title || wo.title, items: v.items || wo.items, checks: v.checks || wo.checks }); setReview((r) => r && { ...r, gaps: [], revisedScope: null }); };
  useEffect(() => { if (me?.person?.zip) setZip(me.person.zip); if (me?.limits?.bufferPct != null) setBuffer(me.limits.bufferPct); }, [me]);
  useEffect(() => { end.current?.scrollIntoView({ block: "nearest", behavior: "smooth" }); }, [msgs.length]);

  if (me?.person?.role === "pro") return <div className="empty"><p>You're signed in as a pro. Jobs are posted by customers.</p><Link className="btn" to="/pro">See incoming jobs</Link></div>;

  const send = async (raw) => {
    const s = (raw ?? text).trim();
    if (!s || busy) return;
    if (!me) { toast("Sign in first: a name is enough.", true); return; }
    const all = [...said, s], b = budget || (s.match(/\$\s?(\d{2,5})/)?.[1] ?? "");
    if (b !== budget) setBudget(b);
    setMsgs((x) => [...x, { who: "me", text: s }]); setText(""); setBusy(true);
    try {
      const t0 = performance.now();
      const sc = await api("/api/scope", { method: "POST", body: { text: all.join(" "), zip, budget: dollars(b) ?? undefined } });
      setSaid(all); setEdited(false); setReview(null);
      setMss((sc.milestones || []).length > 1 ? sc.milestones.map((x) => ({ title: x.title, share: Math.round((x.share || 0) * 100), checkIds: x.checkIds || [], inspect: !!x.inspect, docs: x.docs })) : []);
      runReview(sc);
      setWo({ ...sc, priceCeiling: (sc.priceCeiling.cents / 100).toFixed(0), from: isoDay(sc.window?.from), to: isoDay(new Date(Date.parse(sc.window?.to) - 3600e3).toISOString()), dayFrom0: isoDay(sc.window?.from), dayTo0: isoDay(new Date(Date.parse(sc.window?.to) - 3600e3).toISOString()) });
      setMsgs((x) => [...x, { who: "done", source: sc.source, ms: Math.round(performance.now() - t0), notes: (sc.notes || []).map(humanNote), flags: sc.flags || [], text: `Here's the work order: ${sc.items.length} things to do and ${sc.checks.length} done-conditions. Each condition names the evidence the pro sends; the money is released only when they pass. Change anything below, or tell me more.` }]);
    } catch (e) { setMsgs((x) => [...x, { who: "done", source: "error", text: `I couldn't write that one: ${e.message}` }]); }
    setBusy(false);
  };
  const signIn = async () => { try { const r = await api("/api/auth/demo", { method: "POST", body: { as: "customer" } }); if (r.pinOnce) await showPinOnce(r.pinOnce); await reload(); } catch (e) { toast(e.message, true); } };
  const upd = (patch) => { setWo((w) => ({ ...w, ...patch })); setEdited(true); };
  const updCheck = (i, patch) => upd({ checks: wo.checks.map((c, j) => (j === i ? { ...c, ...patch, ...(patch.evidence ? { rule: RULE[patch.evidence] } : {}) } : c)) });
  const post = async () => {
    setBusy(true);
    try {
      // the order as shown (and edited): the server keeps its milestones and its source, and marks it edited by the person
      const scope = { title: wo.title, trade: wo.trade, items: wo.items.filter((x) => x.trim()), checks: wo.checks.filter((c) => c.what.trim()), priceCeiling: dollars(wo.priceCeiling), // the server's exact window unless the person changed the days
        window: wo.from && wo.to && (wo.from !== wo.dayFrom0 || wo.to !== wo.dayTo0) ? { from: fromDay(wo.from), to: toDay(wo.to) } : wo.window, source: wo.source,
        ...(mss.length > 1 ? { milestones: mss.map((x, i) => ({ id: `m${i + 1}`, title: x.title || `Milestone ${i + 1}`, share: (+x.share || 0) / 100, checkIds: x.checkIds, inspect: !!x.inspect, ...(x.docs ? { docs: x.docs } : {}) })) } : {}) };
      const options = { releaseMode: opt.releaseMode, reviewHours: +opt.reviewHours, retainPct: +opt.retainPct, warrantyDays: +opt.warrantyDays, inspector: opt.inspector || null, requireBefore: !!opt.requireBefore };
      const j = await api("/api/jobs", { method: "POST", body: {
        text: said.join(" "), zip, address: line.trim() ? { line: line.trim() } : undefined, budget: dollars(budget) ?? undefined, bufferPct: +buffer, requestOffers: true, scope, options, ...(forLL && me?.person?.tenancy?.role === "tenant" ? { forLandlord: true } : {}),
      } });
      if (photos.length) { try { await api(`/api/jobs/${j.id}/photos`, { method: "POST", body: { items: await Promise.all(photos.map(async (f) => ({ dataUrl: await readData(f), label: "the problem" }))) } }); } catch (e) { toast(`Posted, but the photos didn't upload: ${e.message}`, true); } }
      navigate(`/jobs/${j.id}`);
    } catch (e) { toast(e.message, true); setBusy(false); }
  };

  return (
    <div className="stack-l">
      <div className="page-head">
        <div><h1>Post a job</h1><p className="lede">Say what's wrong in one sentence; no AI agent needed. Done writes the work order: what to do, and what counts as done, with the evidence each condition needs.</p></div>
        <Link className="btn sm" to="/connect">Or let your own agent post it</Link>
      </div>
      <div className="grid-2">
        <section className="stack" aria-label="Chat with Done">
          <div className="chat" aria-live="polite">
            <div className="say done"><span className="who">DONE</span>What needs doing, by when, and for how much at most? Plumbing, cleaning and handyman jobs in Austin.</div>
            {msgs.map((x, i) => x.who === "me" ? <div key={i} className="say me">{x.text}</div> : (
              <div key={i} className="say done">
                <span className="who">DONE {x.source !== "error" && <Src s={x.source} />}{x.ms != null && <span className="data">{(x.ms / 1000).toFixed(1)} s</span>}</span>
                <p>{x.text}</p>
                {x.flags?.length > 0 && <p className="note warn small" style={{ marginTop: 8 }}>Some of your text reads like instructions to the system ({x.flags.join(", ")}). It's kept as data; the price and window come from the rules.</p>}
                {x.notes?.length > 0 && <ul className="tiny muted" style={{ margin: "6px 0 0", paddingLeft: 16 }}>{x.notes.map((n, k) => <li key={k}>{n}</li>)}</ul>}
              </div>
            ))}
            {busy && !wo && <div className="say done"><span className="who">DONE</span><span className="skel" style={{ display: "block", width: 220 }} /></div>}
            <div ref={end} />
          </div>
          {me === null ? <div className="composer"><p className="small">Sign in to post. In the demo a name is enough.</p><div className="row"><button className="btn accent" onClick={signIn}>Continue as a demo customer</button><Link className="btn" to="/signin?next=/post">Choose a name</Link></div></div> : (
            <form className="composer" onSubmit={(e) => { e.preventDefault(); send(); }}>
              <label className="sr" htmlFor="say">Describe the job</label>
              <textarea id="say" className="input" rows={2} value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }} placeholder={wo ? "Add a detail, e.g. \"the valve under the sink looks rusty too\"" : "e.g. Kitchen faucet keeps dripping even when it's off. Fix it this week, $200 max."} />
              <div className="row between">
                <div className="row" style={{ gap: 8 }}>
                  {!wo && <label className="field" style={{ width: 120 }}><span>BUDGET MAX (OPTIONAL)</span><span className="money-in"><input className="input sm" inputMode="decimal" value={budget} onChange={(e) => setBudget(e.target.value)} placeholder="none" /></span></label>}
                  <label className="field" style={{ width: 90 }}><span>ZIP</span><input className="input sm" inputMode="numeric" maxLength={5} value={zip} onChange={(e) => setZip(e.target.value)} /></label>
                </div>
                <button className={`btn accent ${busy ? "busy" : ""}`} disabled={busy || !text.trim()}><Icon name="send" size={16} /> {wo ? "Rewrite" : "Write the work order"}</button>
              </div>
              {wo && edited && <p className="tiny warn">Rewriting replaces your edits below.</p>}
              {!wo && <div className="chips">{EXAMPLES.map((e) => <button type="button" key={e} className="chip small" onClick={() => send(e)} disabled={busy}>{e}</button>)}</div>}
            </form>
          )}
        </section>

        <section aria-label="The work order">
          {!wo ? <div className="empty"><p className="small">The work order appears here: the job, the done-conditions with the evidence for each, a price ceiling and a window. You can edit all of it before posting.</p></div> : (
            <div className="panel marks stack">
              <div className="panel-h"><span className="eyebrow">WORK ORDER · DRAFT</span><span className="row" style={{ gap: 6 }}><Src s={edited ? `${wo.source}, edited by you` : wo.source} /><span className="badge">{wo.trade}</span></span></div>
              <label className="field"><span>TITLE</span><input className="input" value={wo.title} onChange={(e) => upd({ title: e.target.value })} /></label>
              <label className="field"><span>WHAT TO DO (ONE PER LINE)</span><textarea className="input" rows={Math.max(3, wo.items.length)} value={wo.items.join("\n")} onChange={(e) => upd({ items: e.target.value.split("\n") })} /></label>
              <div className="field"><span>DONE WHEN · THE CONDITIONS THE CHECK RUNS</span>
                <div>{wo.checks.map((c, i) => (
                  <div key={c.id + i} className="edit-cond">
                    <span className="part">{i + 1}</span>
                    <textarea className="input sm" rows={2} aria-label={`Condition ${c.id}`} value={c.what} onChange={(e) => updCheck(i, { what: e.target.value })} />
                    <select className="input sm" aria-label={`Evidence for ${c.id}`} value={c.evidence} onChange={(e) => updCheck(i, { evidence: e.target.value })}><option value="photo">photo</option><option value="receipt">receipt</option><option value="note">note</option></select>
                    <button type="button" className="btn sm" aria-label={`Remove ${c.id}`} disabled={wo.checks.length < 2} onClick={() => upd({ checks: wo.checks.filter((_, j) => j !== i) })}>×</button>
                  </div>
                ))}</div>
                {wo.checks.length < 8 && <button type="button" className="link small" style={{ justifySelf: "start", marginTop: 6 }} onClick={() => upd({ checks: [...wo.checks, { id: `c${wo.checks.length + 1}`, what: "", evidence: "photo", rule: RULE.photo }] })}>+ Add a condition</button>}
                <p className="tiny muted">Photos must be taken during the window, near the address, and never seen on another job. Receipts must be read and match approved change orders. Notes need at least 8 words.</p>
              </div>
              <div className="fields-3">
                {wo.estimate && <p className="small" style={{ gridColumn: "1 / -1" }}><span className="src rules">{String(wo.estimate.source || "rules").toUpperCase().replace("+", " + ")}</span> Typical {m(wo.estimate.low)}–{m(wo.estimate.high)}{wo.estimate.typical ? ` (median ${m(wo.estimate.typical)})` : ""}{wo.estimate.matched ? `, from ${wo.estimate.matched} similar past job${wo.estimate.matched === 1 ? "" : "s"}` : ""}: {wo.estimate.label || "an estimate from similar jobs, not a quote"}.</p>}
                <label className="field"><span>PRICE CEILING</span><span className="money-in"><input className="input" inputMode="decimal" value={wo.priceCeiling} onChange={(e) => upd({ priceCeiling: e.target.value })} /></span><span className="tiny muted" style={{ marginTop: 4 }}>{budget && String(dollars(budget)) === String(dollars(wo.priceCeiling)) ? "Your budget. " : budget ? `You said ${usd(Math.round(dollars(budget) * 100))}; this is what's posted. ` : "You gave no budget, so this is a typical price for the job; change it here. "}No offer above it can be hired.</span></label>
                <label className="field"><span>FROM</span><input className="input" type="date" value={wo.from} onChange={(e) => upd({ from: e.target.value })} /></label>
                <label className="field"><span>BY</span><input className="input" type="date" value={wo.to} onChange={(e) => upd({ to: e.target.value })} /></label>
              </div>
              <div className="fields-3">
                <label className="field"><span>STREET (ZIP {zip})</span><input className="input" value={line} onChange={(e) => setLine(e.target.value)} placeholder="1400 S Congress Ave" autoComplete="address-line1" /></label>
                <label className="field"><span>EXTRA HOLD FOR CHANGE ORDERS</span><select className="input" value={buffer} onChange={(e) => setBuffer(e.target.value)}>{[0, 10, 20, 30, 50].map((p) => <option key={p} value={p}>{p}% of the price</option>)}</select></label>
              </div>
              <Milestones2 wo={wo} mss={mss} setMss={setMss} shareSum={shareSum} />
              <fieldset className="opts">
                <legend className="eyebrow">HOW THE MONEY IS RELEASED</legend>
                <div className="seg" role="radiogroup" aria-label="Release">
                  <button type="button" role="radio" aria-checked={opt.releaseMode === "instant"} className={opt.releaseMode === "instant" ? "on" : ""} onClick={() => setO({ releaseMode: "instant" })}>The moment it passes</button>
                  <button type="button" role="radio" aria-checked={opt.releaseMode === "review"} className={opt.releaseMode === "review" ? "on" : ""} onClick={() => setO({ releaseMode: "review" })}>After a review window</button>
                </div>
                <div className="fields-3">
                  {opt.releaseMode === "review" && <label className="field"><span>REVIEW WINDOW</span><select className="input" value={opt.reviewHours} onChange={(e) => setO({ reviewHours: e.target.value })}>{[12, 24, 48, 72, 168].map((h) => <option key={h} value={h}>{h < 168 ? `${h} hours` : "7 days"}</option>)}</select></label>}
                  <label className="field"><span>RETAINAGE (HELD FOR THE WARRANTY)</span><select className="input" value={opt.retainPct} onChange={(e) => setO({ retainPct: e.target.value })}>{[0, 5, 10, 15, 20].map((p) => <option key={p} value={p}>{p ? `${p}% of the pro's share` : "none"}</option>)}</select></label>
                  <label className="field"><span>WARRANTY WINDOW</span><select className="input" value={opt.warrantyDays} onChange={(e) => setO({ warrantyDays: e.target.value })}>{[7, 14, 30, 60, 90].map((d) => <option key={d} value={d}>{d} days</option>)}</select></label>
                  <label className="field"><span>INSPECTOR</span><select className="input" value={opt.inspector} onChange={(e) => setO({ inspector: e.target.value })}><option value="">none</option>{inspectors.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
                </div>
                <label className="check-row"><input type="checkbox" checked={opt.requireBefore} onChange={(e) => setO({ requireBefore: e.target.checked })} /> The pro must photograph each spot BEFORE starting</label>
                <p className="tiny muted">{opt.releaseMode === "review" ? `When every condition passes, the money waits ${opt.reviewHours} hours for you to look, then releases by itself unless you dispute. The pro may take early pay meanwhile (a 2% fee, paid by the pro).` : "When every condition passes, the money is released at once."}{+opt.retainPct ? ` ${opt.retainPct}% of the pro's share is held until the ${opt.warrantyDays}-day warranty ends; claim a defect with photos before then.` : ""}{opt.inspector ? " Milestones marked for inspection wait for the inspector." : ""}{!inspectors.length ? " (No demo inspector is registered yet: one appears after the inspector signs in once.)" : ""}</p>
              </fieldset>
              <div className="field"><span>YOUR PHOTOS OF THE PROBLEM (OPTIONAL)</span><PhotoPicker files={photos} setFiles={setPhotos} label="Add photos: the checker compares the pro's AFTER photos with these" small /></div>
              <Prescreen wo={wo} />
              {review && <ScopeReview r={review} applyGap={applyGap} onApply={review.revisedScope ? applyAll : null} />}
              {edited && <button type="button" className="link small" style={{ justifySelf: "start" }} onClick={() => runReview(wo)}>Review the edited order again</button>}
              <p className="small ink2">Posting asks the pros' agents in {zip} for offers. Nothing is charged: when you accept one, PayPal holds the price plus {buffer}% ({wo.from ? `work ${day(fromDay(wo.from))} – ${day(fromDay(wo.to))}` : "for the window"}), and pays the pro only when every condition passes.</p>
              {me?.person?.tenancy?.role === "tenant" && <label className="check-row"><input type="checkbox" checked={forLL} onChange={(e) => setForLL(e.target.checked)} /><span>For my landlord to approve and pay: {me.person.tenancy.landlord?.name}</span></label>}
              <button className={`btn accent ${busy ? "busy" : ""}`} disabled={busy || !wo.title.trim() || !dollars(wo.priceCeiling) || (mss.length > 1 && (shareSum !== 100 || mss.some((x) => !x.checkIds.length)))} onClick={post}>Post it and ask for offers <span className="arrow">→</span></button>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
