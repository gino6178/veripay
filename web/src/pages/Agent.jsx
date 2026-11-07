// The signed-in home (PLAN §17): one conversation with "Your agent". The person types a sentence or taps a suggestion;
// everything else arrives in the thread as a short message, a graphical card and at most three buttons. Person-only
// buttons go through the PIN sheet (api() asks for the PIN on a 403 step_up). Until the assistant API answers, the thread
// is drawn from the person's real jobs, and a typed sentence posts a job.
import { useEffect, useMemo, useRef, useState } from "react";
import { api, Link, navigate, useApi, when, usd } from "../api.jsx";
import { useMe } from "../App.jsx";
import Icon from "../components/Icon.jsx";
import { readData } from "../components/parts.jsx";
import { FlowNodes, RailIcons, MoneyBar, PriceRange, Checklist, PhotoGrid, PaidStamp, ProChip, Chip, Why, checksOf, photosOf, moneyOf, offersOf } from "../components/cards.jsx";

const cents = (x) => (x == null ? null : typeof x === "number" ? x : x.cents ?? null);

// draws whatever a card's data carries (the backend's view-models, or the ones drawn from jobs): rail, money, offers,
// conditions, photos, the PAID stamp, the pro
const moneyIn = (mo) => (!mo ? null : { held: mo.held, captured: mo.captured, paid: mo.paidToPro ?? mo.paid, fee: mo.fee, released: mo.releasedBuffer ?? mo.released, refunded: mo.refunded, segments: mo.segments });
const condsIn = (cs) => (cs || []).map((c) => ({ id: c.id, what: c.what, evidence: c.icon === "ruler" ? "measurement" : c.icon === "doc" ? "document" : c.evidence, verdict: c.verdict ?? null, judge: c.judge ?? null }));
export function ThreadCard({ card, msg, rail = true }) {
  if (!card) return null;
  const d = card.data || {}, k = card.kind, jobId = d.job || msg?.job?.id;
  const status = d.rail?.status || d.status;
  const money = moneyIn(d.money) || (d.held != null || d.captured != null ? moneyIn(d) : null);
  const offers = (d.offers || []).map((o) => ({ id: o.id, amount: o.amount, name: o.pro?.name || o.name }));
  const conds = condsIn(d.conditions || d.checks);
  const photos = d.photos ? d.photos : (d.conditions || []).flatMap((c) => (c.photos || []).map((p) => ({ ...p, label: c.what, badge: p.verdict && p.verdict !== "pass" ? "fail" : p.judge || "code" })));
  const pro = d.pro && (typeof d.pro === "string" ? { name: d.pro } : d.pro);
  const number = d.number || msg?.job?.number, title = d.title || msg?.job?.title;
  return (
    <div className={`tcard k-${k}`}>
      {number && <div className="tc-head"><Link to={`/jobs/${jobId}`} className="tc-no">{number}</Link>{title && <span className="tc-title">{title}</span>}</div>}
      {k === "flow" && <FlowNodes nodes={d.nodes} />}
      {rail && status && !["work_order", "flow"].includes(k) && <RailIcons status={status} compact />}
      {k === "paid" && <PaidStamp amount={d.money?.paidToPro ?? d.amount} at={d.paidAt || d.at} />}
      {offers.length > 0 && <PriceRange offers={offers} low={d.range?.low ?? d.low} high={d.range?.high ?? d.high} typical={d.range?.typical} ceiling={d.ceiling} picked={d.bestId} />}
      {pro && <ProChip {...pro} />}
      {k === "change_order" && d.amount != null && <p className="tc-amt">+{usd(cents(d.amount))}{d.ask != null && cents(d.ask) !== cents(d.amount) ? <s className="muted small"> +{usd(cents(d.ask))}</s> : null}{d.reason ? <span className="muted small"> · {String(d.reason).split(/[;(]/)[0]}</span> : ""}</p>}
      {k === "change_order" && d.ask != null && cents(d.ask) !== cents(d.amount) && <p className="tiny muted">Asked +{usd(cents(d.ask))}; your agent negotiated it with the pro's agent.</p>}
      {k === "change_order" && d.invoice && <div className="tc-inv">
        <p className="small"><b>Invoice{d.invoice.store ? `: ${d.invoice.store}` : ""}</b>{d.invoice.total != null ? ` · ${usd(cents(d.invoice.total))}` : ""}{d.invoice.date ? ` · ${String(d.invoice.date).slice(0, 10)}` : ""}<span className="tiny muted">{d.invoice.readBy ? ` · read by ${d.invoice.readBy}` : ""}</span></p>
        {d.invoice.items?.length > 0 && <ul className="tiny">{d.invoice.items.map((x, i) => <li key={i}>{x}</li>)}</ul>}
        <p className="tiny"><Chip tone={d.invoice.verdict === "pass" ? "good" : d.invoice.verdict === "fail" ? "bad" : "warn"}>{d.invoice.verdict === "pass" ? "matches the approved extra" : d.invoice.verdict ? d.invoice.verdict.replace("_", " ") : "read"}</Chip>{d.invoice.amount ? <> pay now {usd(cents(d.invoice.amount))}</> : null}</p>
        {d.invoice.reasons?.length > 0 && d.invoice.verdict !== "pass" && <p className="tiny muted">{d.invoice.reasons.join("; ")}</p>}
        {d.invoice.photos?.length > 0 && <PhotoGrid photos={d.invoice.photos} max={4} />}
      </div>}
      {(k === "visit" || k === "reschedule") && (d.slot || d.proposal) && <p className="tc-slot"><Icon name="clock" size={16} /> {when((d.proposal || d.slot).from)}</p>}
      {money && <MoneyBar {...money} />}
      {photos.length > 0 && <PhotoGrid photos={photos} max={6} />}
      {conds.length > 0 && <Checklist checks={conds} max={6} />}
      {k === "work_order" && d.ceiling != null && <p className="small"><Chip tone="blue">max {usd(cents(d.ceiling))}</Chip>{d.estimate ? <> <Chip>typical {usd(cents(d.estimate.low))}–{usd(cents(d.estimate.high))}</Chip></> : null}</p>}
      {k === "fix" && d.reason && <p className="small ink2">“{d.reason}”</p>}
      {d.why && <Why>{d.why}</Why>}
    </div>
  );
}

// wide screens: the job the conversation is about, beside it (where it stands, the money, the pro), and the others
const STATUS = { draft: "Drafting", scoped: "Work order ready", offered: "Offers in", agreed: "Hired", held: "Money held", working: "Work under way", submitted: "Proof sent", checking: "Checking the proof", review: "Your call", needs_fix: "Back to the pro", passed: "Passed", released: "Paid", disputed: "Disputed", resolved: "Settled" };
function JobSide({ focus, others, pro, tick }) {
  const j = useApi(focus && !pro ? `/api/jobs/${focus.id}` : null, tick).data;
  const money = j && moneyIn(moneyOf(j)), to = (x) => (pro ? `/pro/jobs/${x.id}` : `/jobs/${x.id}`);
  return (
    <aside className="a-side" aria-label="This job">
      {focus && <section className="as-job">
        <p className="as-k">This job</p>
        <Link to={to(focus)} className="as-title"><span className="tc-no">{focus.number}</span> {focus.title || focus.scope?.title || ""}</Link>
        <RailIcons status={focus.status} />
        <p className="as-status"><Chip tone={["released", "resolved", "passed"].includes(focus.status) ? "good" : ["disputed", "needs_fix", "review"].includes(focus.status) ? "warn" : "blue"}>{STATUS[focus.status] || focus.status}</Chip></p>
        {money && (cents(money.held) > 0 || cents(money.captured) > 0) && <MoneyBar {...money} />}
        {j?.agreed && <ProChip id={j.agreed.pro?.id || j.agreed.pro} name={String(j.agreed.proName || "").replace(/ (demo)$/, "")} />}
        <Link to={to(focus)} className="btn sm as-open">Open the job <span aria-hidden="true">→</span></Link>
      </section>}
      {others.length > 0 && <section className="as-more"><p className="as-k">Also going on</p>
        <ul>{others.map((x) => <li key={x.id}><Link to={to(x)}><span className="tc-no">{x.number}</span><span className="as-t">{x.title || x.scope?.title || ""}</span><span className="as-s">{STATUS[x.status] || x.status}</span></Link></li>)}</ul></section>}
    </aside>);
}

// ---- the thread drawn from the person's jobs (used until /api/assistant/thread exists) ----
function deriveThread(jobs) {
  const out = [];
  let seq = 0;
  const push = (m) => out.push({ seq: ++seq, at: m.at, ...m });
  for (const j of [...jobs].sort((a, b) => String(a.created).localeCompare(String(b.created)))) {
    const job = { id: j.id, number: j.number, title: j.scope?.title };
    if (j.text) push({ id: `${j.id}-ask`, from: "you", text: j.text, at: j.created, job });
    const base = { job: j.id, number: j.number, title: j.scope?.title };
    push({ id: `${j.id}-wo`, from: "agent", at: j.created, job, text: `Work order ready: ${j.scope?.checks?.length || 0} checks, max ${usd(cents(j.scope?.priceCeiling))}.`, card: { kind: "work_order", data: { ...base, checks: checksOf(j), status: ["draft", "scoped", "offered"].includes(j.status) ? j.status : undefined } } });
    const offs = offersOf(j);
    if (offs.length && j.status === "offered") { const best = offs.reduce((a, o) => (cents(o.amount) < cents(a.amount) ? o : a), offs[0]);
      push({ id: `${j.id}-off`, from: "agent", at: j.updated, job, text: `${offs.length} offers. Best ${usd(cents(best.amount))} from ${String(best.name || "a pro").replace(/ \(demo\)$/, "")}.`, card: { kind: "offers", data: { ...base, offers: offs, low: j.estimate?.low, high: j.estimate?.high, ceiling: j.scope?.priceCeiling } }, actions: [{ id: `hire:${j.id}`, label: "Hire best", style: "primary" }, { id: `open:${j.id}`, label: "Compare", style: "secondary" }] }); }
    if (j.agreed) push({ id: `${j.id}-hold`, from: "agent", at: j.agreed.at, job, text: j.hold?.status === "pending_approval" ? "Approve the PayPal hold to start." : `Hired ${String(j.agreed.proName || "").replace(/ \(demo\)$/, "")}. PayPal holds the money; nothing charged.`, card: { kind: "hold", data: { ...base, pro: { name: j.agreed.proName, id: j.agreed.pro?.id || j.agreed.pro }, money: moneyOf(j) } }, actions: j.hold?.status === "pending_approval" ? [{ id: `open:${j.id}`, label: "Approve hold", style: "primary" }] : undefined });
    const photos = photosOf(j);
    if (photos.length && !["held", "agreed"].includes(j.status)) push({ id: `${j.id}-ev`, from: "agent", at: j.updated, job, text: `${photos.length} photos in. Checks done.`, card: { kind: "evidence", data: { ...base, photos, checks: checksOf(j) } } });
    if (j.status === "review") push({ id: `${j.id}-rev`, from: "agent", at: j.updated, job, text: "Your call: some checks need your eyes.", card: { kind: "checks", data: { ...base, checks: checksOf(j).filter((c) => c.verdict !== "pass" || c.judge === "person") } }, actions: [{ id: `open:${j.id}`, label: "Look now", style: "primary" }] });
    if (j.status === "needs_fix") push({ id: `${j.id}-fix`, from: "agent", at: j.updated, job, text: "Sent back to the pro to fix.", card: { kind: "fix", data: { ...base, status: j.status } } });
    if (["released", "resolved"].includes(j.status)) push({ id: `${j.id}-paid`, from: "agent", at: j.paidAt || j.updated, job, text: `Done and paid: ${usd(cents(j.money?.captured))}.`, card: { kind: "paid", data: { ...base, amount: j.money?.captured, at: j.paidAt, money: moneyOf(j) } }, actions: [{ id: `open:${j.id}`, label: "Receipt", style: "secondary" }] });
  }
  return out;
}

export default function Agent({ side = "customer" }) {
  const A = side === "pro" ? "/api/pro/assistant" : "/api/assistant", pro = side === "pro";
  const { me, toast } = useMe();
  const [sugg, setSugg] = useState(null), [typing, setTyping] = useState(null);
  const [real, setReal] = useState(null), [msgs, setMsgs] = useState(null), [text, setText] = useState(""), [busy, setBusy] = useState(false), [tick, setTick] = useState(0);
  const jobs = useApi(me ? (pro ? "/api/pro/jobs" : "/api/jobs") : null, tick), endRef = useRef(null), seqRef = useRef(0);
  // photos of the problem, sent with the next message (the customer's side only): up to 6
  const [pics, setPics] = useState([]), fileRef = useRef(null), askedRef = useRef(false);
  const pick = (list) => { const add = [...(list || [])].filter((f) => /^image\/(jpeg|png|webp)$/.test(f.type)); if (add.length < (list?.length || 0)) toast("Photos only: JPEG, PNG or WebP.", true); const got = add.map((f) => ({ f, url: URL.createObjectURL(f) }));
    // picked from the agent's "Take a photo" button: sent at once, with whatever is typed
    if (askedRef.current) { askedRef.current = false; if (got.length) send(null, [...pics, ...got].slice(0, 6)); return; }
    setPics((x) => [...x, ...got].slice(0, 6)); };
  const unpick = (i) => setPics((x) => { URL.revokeObjectURL(x[i]?.url); return x.filter((_, k) => k !== i); });
  const list = useMemo(() => { const d = jobs.data; return (Array.isArray(d) ? d : d?.jobs || d?.mine || d?.hired || []).filter(Boolean); }, [jobs.data]);

  // the real thread when the assistant API answers; else the one drawn from jobs
  useEffect(() => {
    let off = false;
    api(`${A}/thread`).then((r) => { if (off) return; setReal(true); setMsgs(r.messages || []); seqRef.current = r.seq || 0; if (r.suggestions) setSugg(r.suggestions); }).catch(() => { if (!off) setReal(false); });
    return () => { off = true; };
  }, [me?.person?.id]);
  const [full, setFull] = useState({});
  useEffect(() => { // the derived thread needs whole jobs (offers, checks, evidence)
    if (real === false && pro) { setMsgs([]); return; } // the pro's thread has no derived stand-in
    if (real !== false || !list.length) return;
    Promise.all(list.slice(0, 12).map((x) => full[x.id] && full[x.id].updated === x.updated ? full[x.id] : api(`/api/jobs/${x.id}`).catch(() => null))).then((js) => { const m = {}; js.filter(Boolean).forEach((j) => { m[j.id] = j; }); setFull(m); setMsgs(deriveThread(Object.values(m))); });
  }, [real, list]);
  // keep it live: poll the thread (or the jobs) every few seconds
  useEffect(() => {
    const t = setInterval(() => {
      if (document.hidden) return;
      if (real) api(`${A}/thread?after=${seqRef.current}`).then((r) => { if (r.messages?.length) { setMsgs((m) => { const mine = r.messages.filter((x) => x.from === "you").map((x) => x.text); return merge((m || []).filter((y) => !(y.pending && y.from === "you" && mine.includes(y.text))), r.messages); }); seqRef.current = r.seq || seqRef.current; } if (r.suggestions) setSugg(r.suggestions); }).catch(() => {});
      else setTick((x) => x + 1);
    }, real ? 4000 : 8000);
    return () => clearInterval(t);
  }, [real]);
  useEffect(() => { endRef.current?.scrollIntoView({ block: "end" }); }, [msgs?.length, !!typing]);

  const add = (m) => setMsgs((x) => merge(x, m));
  const send = async (t, withPics = null) => {
    const say = (t ?? text).trim(), sending = withPics || (t == null && real && !pro ? pics : []);
    if ((!say && !sending.length) || busy) return;
    setBusy(true); setText(""); if (sending.length) setPics([]);
    const mine = { id: `you-${Date.now()}`, from: "you", text: say, at: new Date().toISOString(), ...(sending.length ? { photos: sending.map((x, i) => ({ id: `p${i}`, url: x.url })) } : {}) };
    try {
      if (real) {
        add([{ ...mine, pending: true }]); setTyping({ since: Date.now(), at: seqRef.current, jobish: false });
        const photos = sending.length ? await Promise.all(sending.map(async (x) => ({ dataUrl: await readData(x.f) }))) : undefined;
        const r = await api(`${A}/message`, { method: "POST", body: { text: say, ...(photos ? { photos } : {}) } });
        // until the job exists the server keeps the photos to itself: the person's own message shows the ones just picked
        const back = r.messages || [], y = mine.photos && back.find((m) => m.from === "you" && m.photoCount && !m.photos?.length);
        if (y) y.photos = mine.photos;
        setMsgs((x) => (x || []).filter((m) => m.id !== mine.id)); add(back);
      }
      else {
        add([mine, { id: `typing-${Date.now()}`, from: "agent", text: "Writing the work order…", at: new Date().toISOString(), pending: true }]);
        const sc = await api("/api/scope", { method: "POST", body: { text: say } });
        const j = await api("/api/jobs", { method: "POST", body: { text: say, scope: sc.scope || sc, requestOffers: true } });
        setMsgs((x) => (x || []).filter((m) => !m.pending)); setTick((x) => x + 1);
        add([{ id: `${j.id}-posted`, from: "agent", at: new Date().toISOString(), job: { id: j.id, number: j.number }, text: `Posted ${j.number}. Pros are quoting now.`, card: { kind: "work_order", data: { job: j.id, number: j.number, title: j.scope?.title, checks: checksOf(j), status: j.status } } }]);
      }
    } catch (e) { setMsgs((x) => (x || []).filter((m) => !m.pending && m.id !== mine.id)); if (sending.length) setPics(sending); if (!e.cancelled) toast(e.message, true); }
    setTyping(null); setBusy(false);
  };
  const act = async (m, a) => {
    if (busy) return;
    const [kind, id] = String(a.id).split(":");
    if (!real) {
      if (kind === "open") return navigate(`/jobs/${id}`);
      if (kind === "hire") { setBusy(true); try { await api(`/api/jobs/${id}/auto-hire`, { method: "POST", body: { payWith: "card" } }); toast("Hired within your limits; PayPal is holding the money."); setTick((x) => x + 1); } catch (e) { if (!e.cancelled) toast(e.message, true); } setBusy(false); }
      return;
    }
    // the agent asks for a photo: the button opens the camera or the file picker; the photos go with the next message
    if (a.href === "#photo") { askedRef.current = true; fileRef.current?.click(); return; }
    if (a.href) { if (/^\/(?!api\/|paypal\/|mock-paypal)/.test(a.href)) navigate(a.href); else window.location.assign(a.href); return; }
    setBusy(true);
    if (a.label === "Post it") setTyping({ since: Date.now(), at: seqRef.current, jobish: true });
    try { const r = await api(`${A}/act`, { method: "POST", body: { action: a.id } }); setMsgs((x) => (x || []).map((y) => y.id === m.id ? { ...y, actions: (y.actions || []).map((z) => z.id === a.id ? { ...z, done: true } : z) } : y)); add(r.messages || []); }
    catch (e) { if (!e.cancelled) toast(e.message, true); }
    setTyping(null); setBusy(false);
  };

  const active = list.filter((x) => !["released", "resolved", "cancelled", "expired"].includes(x.status)).slice(0, 6);
  // a job's rail shows once: on its latest card
  const railAt = useMemo(() => { const last = new Map(); (msgs || []).forEach((m, i) => { const d = m.card?.data, j = d?.job || m.job?.id; if (j && (d?.rail?.status || d?.status)) last.set(j, i); }); return new Set(last.values()); }, [msgs]);
  const lastAgent = [...(msgs || [])].reverse().find((m) => m.from === "agent");
  // the job the thread is about: the latest message that names one of the active jobs, else the newest active job
  const focus = useMemo(() => { for (const m of [...(msgs || [])].reverse()) { const id = m.card?.data?.job || m.job?.id; const hit = id && active.find((x) => x.id === id); if (hit) return hit; } return active[0] || null; }, [msgs, list]);
  const chips = (sugg && sugg.length ? sugg : null) || lastAgent?.suggest || (pro ? ["Status", "I've arrived", "Payout"] : list.length ? ["What's happening?", "Fix a leaking faucet", "Clean my apartment Friday"] : ["My kitchen faucet drips, fix it this week under $200", "Deep clean a 2-bedroom on Friday", "Mount a TV on drywall"]);

  return (
    <div className={`agentwrap ${focus ? "has-side" : ""}`}>
    <div className="agentpage">
      {active.length > 0 && <nav className="jstrip" aria-label="Your active jobs">{active.map((x) => <Link key={x.id} to={pro ? `/pro/jobs/${x.id}` : `/jobs/${x.id}`} className="jchip"><span className="jn">{x.number}</span><span className="jt">{x.title || x.scope?.title || ""}</span><RailIcons status={x.status} compact /></Link>)}</nav>}
      <section className="athread" aria-label="Your agent" aria-live="polite">
        {msgs === null ? <div className="skel" style={{ height: 160 }} /> : !msgs.length ? <div className="t-empty"><span className="t-av"><Icon name="agent" size={22} /></span><p><b>Hi{me?.person?.name ? `, ${me.person.name.replace(/^Demo · /, "").split(" ")[0]}` : ""}.</b> Tell me what needs fixing.</p></div> :
          msgs.map((m, i) => <article key={m.id} className={`msg-t ${m.from} ${m.pending ? "pending" : ""}`}>
            {m.from === "agent" && <span className="t-av" aria-hidden="true"><Icon name="agent" size={18} /></span>}
            <div className="t-body">
              {m.text && <p className="t-text">{m.text}</p>}
              {m.from === "you" && m.photos?.length > 0 && <div className="t-photos">{m.photos.map((x) => <a key={x.id} href={x.url} target="_blank" rel="noreferrer"><img src={x.url} alt="Your photo of the problem" loading="lazy" /></a>)}</div>}
              {m.from === "you" && !m.photos?.length && m.photoCount > 0 && <p className="tiny muted"><Icon name="camera" size={14} /> {m.photoCount} photo{m.photoCount === 1 ? "" : "s"}</p>}
              <ThreadCard card={m.card} msg={m} rail={railAt.has(i)} />
              {m.actions?.length > 0 && <div className="t-acts">{m.actions.some((a) => a.outcome === "superseded" || a.outcome === "asked again") && <span className="tiny muted">{m.actions.find((a) => a.outcome)?.outcome === "asked again" ? "asked again below" : "no longer needed"}</span>}{m.actions.slice(0, 3).map((a) => <button key={a.id} className={`btn sm ${a.style === "primary" ? "accent" : a.style === "danger" ? "danger" : ""}`} disabled={busy || a.done} onClick={() => act(m, a)}>{a.needsPin && <Icon name="lock" size={14} />}{a.done && (a.outcome || "done") === "done" ? `${a.label} ✓` : a.label}</button>)}</div>}
              <span className="t-at">{m.at ? when(m.at) : ""}</span>
            </div>
          </article>)}
        {typing && <Typing t={typing} posted={(msgs || []).some((m) => m.seq > typing.at && m.card?.kind === "work_order")} />}
        <div ref={endRef} className="t-end" />
      </section>
      <form className="composer" onSubmit={(e) => { e.preventDefault(); send(); }} onDragOver={(e) => { if (!pro && real) e.preventDefault(); }} onDrop={(e) => { if (pro || !real) return; e.preventDefault(); pick(e.dataTransfer.files); }}>
        <div className="sugg" aria-label="Suggestions">{chips.slice(0, 3).map((c) => <button type="button" key={c} className="sugg-c" disabled={busy} onClick={() => send(c)}>{c}</button>)}</div>
        {pics.length > 0 && <div className="c-pics" aria-label="Photos to send">{pics.map((x, i) => <span key={x.url} className="c-pic"><img src={x.url} alt={`Photo ${i + 1} to send`} /><button type="button" className="c-x" aria-label={`Remove photo ${i + 1}`} onClick={() => unpick(i)}>×</button></span>)}</div>}
        <div className="c-row">
          {!pro && real && <><input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onChange={(e) => { pick(e.target.files); e.target.value = ""; }} />
            <button type="button" className="btn c-cam" disabled={busy || pics.length >= 6} onClick={() => { askedRef.current = false; fileRef.current?.click(); }} aria-label="Add photos of the problem" title="Add photos of the problem"><Icon name="camera" size={18} /></button></>}
          <textarea className="input" rows={1} value={text} aria-busy={busy} onChange={(e) => setText(e.target.value)} onPaste={(e) => { const f = [...(e.clipboardData?.files || [])]; if (f.length && !pro && real) { e.preventDefault(); pick(f); } }} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }} placeholder={pro ? "Status, arrived, send…" : pics.length ? "What's wrong in the photo? (or just send it)" : "Tell your agent what needs doing…"} aria-label="Message your agent" />
          <button className={`btn accent ${busy ? "busy" : ""}`} disabled={busy || (!text.trim() && !pics.length)} aria-label="Send"><Icon name="send" size={18} /></button>
        </div>
        {real === false && <p className="tiny muted c-note"><Chip tone="sim">preview</Chip> Drawn from your jobs while the agent's own thread is being connected.</p>}
      </form>
    </div>
    {focus && <JobSide focus={focus} others={active.filter((x) => x.id !== focus.id)} pro={pro} tick={`${tick}.${msgs?.length || 0}`} />}
    </div>
  );
}

// the agent is working: dots, and for a new job the two steps the server takes (about 16 s with the live models)
const STEPS = ["Writing the work order…", "Pricing it…"];
function Typing({ t, posted }) {
  const [, tick] = useState(0);
  useEffect(() => { const i = setInterval(() => tick((x) => x + 1), 1000); return () => clearInterval(i); }, []);
  const step = posted || Date.now() - t.since > 8000 ? 1 : 0;
  return (
    <article className="msg-t agent typing" role="status">
      <span className="t-av" aria-hidden="true"><Icon name="agent" size={18} /></span>
      <div className="t-body">
        <p className="t-text"><span className="dots" aria-hidden="true"><i /><i /><i /></span>{t.jobish ? STEPS[step] : "Working on it…"}</p>
        {t.jobish && <ol className="t-steps" aria-hidden="true">{["Work order", "Price"].map((s, i) => <li key={s} className={i < step ? "done" : i === step ? "on" : ""}>{s}</li>)}</ol>}
      </div>
    </article>
  );
}

// new messages append; one with an id already in the thread (the offers card updating) replaces it where it is
function merge(list, incoming) {
  const out = [...(list || [])];
  for (const m of incoming || []) { const i = out.findIndex((y) => y.id === m.id); if (i >= 0) out[i] = m; else out.push(m); }
  return out;
}
