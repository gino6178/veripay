// The customer's jobs, and one job as its work order: where it is, the offers and both agents' messages, the hold and
// its expiry, change orders to approve, the evidence, every check with its verdict, reason and source, the decision
// (release, ask for a fix, dispute), and every PayPal id.
import { useEffect, useState } from "react";
import { api, Link, m, when, day, dollars, useApi, refresh, usd, navigate } from "../api.jsx";
import { useMe } from "../App.jsx";
import PayPalButtons from "../components/PayPalButtons.jsx";
import PayPalMore from "../components/PayPalMore.jsx";
import PayLater from "../components/PayLater.jsx";
import { lastMain, roundStory, stampOf, Status, Rail, Src, Conditions, CheckHead, Ids, paypalIds, Hold, Split, Thread, Timeline, Evidence, Receipts, WoHead } from "../components/job.jsx";
import Safe from "../components/Safe.jsx";
import { Why, Chip, RailIcons, FlowNodes, MoneyBar, ProChip, PhotoGrid, moneyOf, photosOf, PriceRange, offersOf } from "../components/cards.jsx";
import { Visit, slotSays } from "../components/Schedule.jsx";
import { JobMandates } from "../components/Mandates.jsx";
import { askConfirm } from "../components/Confirm.jsx";
import { Milestones, MsStatus, Releases, ScopeReview, Pairs, Warranty, Rating, Badges, PhotoPicker, readData, useLeft, fmtLeft } from "../components/parts.jsx";

export function NeedSignIn({ what = "your jobs", as = "customer" }) {
  return <div className="empty"><p>Sign in to see {what}.</p><Link className="btn accent" to={`/signin?as=${as}&next=${encodeURIComponent(location.pathname)}`}>Sign in</Link></div>;
}

export function Jobs() {
  const { me } = useMe(), list = useApi(me ? "/api/jobs" : null);
  if (me === null) return <NeedSignIn />;
  const jobs = list.data || [];
  return (
    <div>
      <div className="page-head"><div><h1>My jobs</h1><p className="lede">Every job is a work order: the money is held with PayPal and paid to the pro when its done-conditions pass.</p></div><Link className="btn accent" to="/post">Post a job</Link></div>
      {!list.data && !list.error && <div className="stack-s">{[1, 2, 3].map((i) => <div key={i} className="skel" style={{ height: 52 }} />)}</div>}
      {list.data && !jobs.length && <div className="empty"><p>No jobs yet. Describe one in a sentence and Done writes the work order, or connect your own agent and let it post.</p><div className="row" style={{ justifyContent: "center" }}><Link className="btn accent" to="/post">Post a job</Link><Link className="btn" to="/connect">Connect your agent</Link></div></div>}
      <div>{jobs.slice().reverse().map((j) => (
        <Link key={j.id} to={`/jobs/${j.id}`} className="jobrow">
          <span className="no">{j.number}</span>
          <span><b>{j.title}</b><div className="nx">{j.pro || (j.offers ? `${j.offers} open offers` : j.trade)} · {j.next}</div></span>
          <span className="amt"><Status s={j.status} as="customer" /><span>{j.due?.cents ? m(j.due) : ""}</span></span>
        </Link>
      ))}</div>
    </div>
  );
}

// run an action on the job: one at a time, the job comes back, errors as a toast
export function useAct(set) {
  const { toast } = useMe(), [busy, setBusy] = useState(null);
  const act = async (key, path, body, ok, method = "POST") => {
    setBusy(key);
    try { const r = await api(path, { method, body: body || {} }); if (r?.id) set(r); ok?.(r); refresh(); return r; }
    catch (e) { toast(e.message, true); }
    finally { setBusy(null); }
  };
  return [busy, act];
}
export const B = ({ busy, k, className = "", ...p }) => <button className={`btn ${className} ${busy === k ? "busy" : ""}`} disabled={!!busy} {...p} />;

export function JobPage({ id }) {
  const { me, info } = useMe(), job = useApi(me ? `/api/jobs/${id}` : null), narrow = useNarrow();
  const [busy, act] = useAct(job.set);
  const j = job.data;
  // while the platform is working (checking) or the pro may act, look again
  const settled = j && (["cancelled", "expired"].includes(j.status) || (["released", "resolved"].includes(j.status) && ["paid", "sent_unclaimed", "failed"].includes(j.payoutState?.state) && j.warranty?.status !== "claimed"));
  const fast = j && ["submitted", "checking"].includes(j.status);
  useEffect(() => {
    if (!j || settled) return;
    let last = Date.now();
    // a hidden page still looks, less often (a browser pane or background tab may be hidden while someone waits on it)
    const look = (gap) => { if (Date.now() - last < (document.hidden ? Math.max(gap, 15000) : gap)) return; last = Date.now(); job.reload(); };
    const t = setInterval(() => look(fast ? 1200 : 3500), fast ? 1500 : 4000);
    const vis = () => look(1000);
    document.addEventListener("visibilitychange", vis);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", vis); };
  }, [!!j, settled, fast, job.reload]);
  useChangeNotice(j);
  if (me === null) return <NeedSignIn what="this job" />;
  if (job.error) return <div className="empty"><p>{job.error.status === 404 ? "No such job on your account." : job.error.message}</p><Link className="btn" to="/jobs">My jobs</Link></div>;
  if (!j) return <div className="stack"><div className="skel" style={{ height: 90 }} /><div className="skel" style={{ height: 320 }} /></div>;
  const base = `/api/jobs/${j.id}`;
  const ev = j.evidence || [], cos = j.changeOrders || [];
  const loose = ev.filter((x) => !x.checkId && !x.forChange && !["reference", "defect", "inspection"].includes(x.phase));
  const tenantView = j.tenancy?.you === "tenant";
  // once a pro is hired, the negotiation, the scope review and the full log fold away (open them to read)
  const agreedYet = !["draft", "scoped", "offered"].includes(j.status);
  const decide = <Safe name="Next step">{tenantView ? <TenantPanel j={j} busy={busy} act={act} info={info} /> : <Decide j={j} busy={busy} act={act} info={info} me={me} reload={job.reload} />}</Safe>;
  const groupLine = j.tenancy?.you !== "tenant" && (j.group ? <p className="small"><span className="badge good">in a neighborhood group</span> <Link to="/groups">See the group</Link></p>
    : ["scoped", "offered"].includes(j.status) && <p className="small"><button className="linkish" onClick={() => act("grp", `/api/groups`, { job: j.id }, () => navigate("/groups"))}>Start a neighborhood group</button> <span className="tiny muted">neighbors in {j.address?.zip} with the same job get 10–20% off, one trip for the pro</span></p>);
  const tenancyBanner = j.tenancy && <p className="note small">{j.tenancy.you === "tenant" ? <>Posted by you for <b>{j.tenancy.landlord?.name}</b>: they (or their agent) hire, approve and pay. {j.tenancy.rule}</> : <>Posted by your tenant <b>{j.tenancy.tenant?.name?.replace(/^Demo · /, "")}</b>: you decide and pay. {j.tenancy.rule}</>}</p>;
  const offersFirst = j.status === "offered" && (j.offers || []).length > 0;
  const offers = <>{(j.offers || []).length > 0 && <Safe name="Offers"><Offers j={j} busy={busy} act={act} info={info} me={me} /></Safe>}{["scoped", "offered"].includes(j.status) && j.tenancy?.you !== "tenant" && <Safe name="Pros near you"><Nearby j={j} busy={busy} act={act} /></Safe>}</>;
  return (
    <div>
      <Safe name="Work order"><WoHead job={j} as="customer" />{tenancyBanner}{groupLine}
        <div className="jsum">
          <RailIcons status={j.status} />
          <div className="jsum-row">{j.agreed ? <ProChip id={j.agreed.pro?.id || j.agreed.pro} name={j.agreed.proName} rating={j.agreed.pro?.rating} licensed={!!j.agreed.pro?.license} insured={(j.agreed.pro?.verified || []).some((b) => b.id === "insurance" && b.ok)} demo={j.agreed.pro?.demo} /> : null}<div style={{ flex: 1, minWidth: 220 }}><MoneyBar {...moneyOf(j)} /></div></div>
          {photosOf(j).length > 0 && <PhotoGrid photos={photosOf(j)} max={8} />}
        </div></Safe>
      <div className="wo-body">
        <div className="stack-l">
          <AskBanner j={j} busy={busy} act={act} />
          {narrow && decide}
          {offersFirst && offers}
          {j.agreed && <Safe name="Pro"><Why label="Pro's licence, insurance and PayPal"><p className="small"><Link to={`/pros/${j.agreed.pro?.id || j.agreed.pro}`}>{j.agreed.proName}</Link> <Badges pro={j.agreed.pro} /></p></Why></Safe>}
          {["draft", "scoped", "offered"].includes(j.status) && <Safe name="Options"><Options j={j} busy={busy} act={act} /></Safe>}
          <Safe name="Done-conditions"><DoneWhen j={j} /></Safe>
          {loose.length > 0 && <Safe name="Evidence"><div className="stack-s"><span className="eyebrow">OTHER EVIDENCE</span><Evidence items={loose} /></div></Safe>}
          <Safe name="Your photos"><Reference j={j} busy={busy} act={act} /></Safe>
          {j.scopeReview && <Safe name="Scope review">{agreedYet ? <details className="panel fold"><summary>SCOPE REVIEW (BEFORE POSTING)</summary><ScopeReview r={j.scopeReview} job={j} busy={busy} act={act} /></details> : <ScopeReview r={j.scopeReview} job={j} busy={busy} act={act} />}</Safe>}

          {cos.length > 0 && <Safe name="Change orders"><section className="stack" aria-labelledby="h-chg">
            <h2 id="h-chg" style={{ fontSize: "var(--fs-h3)" }}>Change orders</h2>
            {cos.map((c) => (
              <div key={c.id} className="panel stack-s">
                <div className="row between"><span className="row" style={{ gap: 8 }}><span className="part">{c.id}</span><span className={`badge ${c.status === "approved" ? "good" : c.status === "declined" ? "bad" : "warn"}`}>{c.status}</span><Src s={c.source} /></span><span className="big-amt" style={{ fontSize: 36 }}>+{m(c.amount)}</span></div>
                <p>{c.text || c.reason}</p>
                <Evidence items={ev.filter((e) => (c.evidence || []).includes(e.id))} />
                {c.status === "pending" ? <>
                  <p className="tiny muted">{c.agentMayApprove ? "Within the limit you set, so your agent may approve it too." : "Over the limit you set for your agent: only you can approve it."} If it doesn't fit the hold's buffer, approving places a new, larger hold first (the old one is voided).</p>
                  <div className="row"><B busy={busy} k={`ok${c.id}`} className="accent" onClick={() => act(`ok${c.id}`, `${base}/changes/${c.id}/approve`)}>Approve +{m(c.amount)}</B><B busy={busy} k={`no${c.id}`} onClick={() => act(`no${c.id}`, `${base}/changes/${c.id}/decline`, { note: "Not now" })}>Decline</B></div>
                </> : c.decided && <><MaterialsAdvance c={c} j={j} busy={busy} act={act} base={base} /><p className="tiny muted">{c.status} {when(c.decided.at)} by {c.decided.by?.kind === "agent" ? `the customer's agent (${c.decided.by.client || "agent"})` : c.decided.by?.kind === "person" ? "the customer" : c.decided.by?.kind}</p></>}
              </div>
            ))}
          </section></Safe>}

          {!offersFirst && offers}

          <Safe name="Messages"><details className="fold" open={!agreedYet}><summary><h2 id="h-thread" style={{ fontSize: "var(--fs-h3)", display: "inline" }}>Agents' messages ({(j.thread || j.messages || []).length})</h2></summary>
            <Thread job={j} />
          </details></Safe>
          <Safe name="Timeline"><details className="fold" open={!agreedYet}><summary><h2 id="h-tl" style={{ fontSize: "var(--fs-h3)", display: "inline" }}>Timeline ({(j.timeline || []).length})</h2></summary><Timeline job={j} /></details></Safe>
        </div>

        <aside className="wo-side">
          {!narrow && decide}
          {j.processNodes?.length > 0 && <Safe name="Process"><div className="panel marks stack-s"><div className="panel-h"><h3>The process</h3><span className="tiny muted">your agent runs it; you confirm</span></div><FlowNodes nodes={j.processNodes} /></div></Safe>}
          <Safe name="Warranty"><Warranty job={j} as="customer" busy={busy} act={act} /></Safe>
          {!tenantView && <Safe name="Rating"><Rating job={j} busy={busy} act={act} /></Safe>}
          <Safe name="Visit"><Visit j={j} busy={busy} act={act} readOnly={tenantView} /></Safe>
          <Safe name="Mandates"><JobMandates j={j} /></Safe>
          {!tenantView && <Safe name="Tip"><Tips j={j} busy={busy} act={act} info={info} /></Safe>}
          {!tenantView && <Safe name="Plan"><MaintenancePlan j={j} /></Safe>}
          <Safe name="Reports"><Reports j={j} /></Safe>
          {j.risk && <Safe name="Risk"><RiskPanel r={j.risk} buffer={j.hold?.bufferWhy} /></Safe>}
          <Safe name="The money"><div className="panel marks stack"><h3>The money</h3><Hold job={j} /><AdvancedLine j={j} />{j.money?.split && <Split job={j} />}<Releases job={j} /></div></Safe>
          <Safe name="PayPal ids"><div className="panel stack-s"><h3>PayPal ids</h3>{paypalIds(j).some((r) => r[1]) ? <Ids rows={paypalIds(j)} /> : <p className="small muted">None yet: the first is the order made when you accept an offer.</p>}
            {j.money?.payout && <PayoutLine j={j} small />}
            {j.flow && <p className="tiny muted">Money flow: {j.flow === "platform_capture_then_payouts" ? "PayPal captures to the platform, then one Payouts batch pays the pro (and helper)." : j.flow}</p>}
            <Receipts job={j} />
          </div></Safe>
          {j.money?.ledger?.length > 0 && <Safe name="Ledger"><details className="panel"><summary>LEDGER ({j.money.ledger.length} LINES)</summary><table className="table" style={{ marginTop: 8 }}><tbody>{j.money.ledger.map((l, i) => <tr key={l.n ?? i}><td className="num">{l.n}</td><td>{LEDGER_WORD[l.kind] || String(l.kind || "").replace(/_/g, " ")}<div className="tiny muted">{l.note}</div></td><td className="num r">{m(l.amount)}</td></tr>)}</tbody></table></details></Safe>}
        </aside>
      </div>
    </div>
  );
}

// the done-conditions; for a multi-day job, one block per milestone with its own amount, status and last check
export function DoneWhen({ j, intro = "These conditions are the contract. The pro sends a photo, receipt or note for each, and each is checked against it." }) {
  const planned = !(j.milestones?.length) && j.scope.milestones?.length > 1;
  const ms = j.milestones?.length > 1 ? j.milestones : planned ? j.scope.milestones.map((x) => ({ ...x, status: "open", amount: null, current: false })) : null;
  const evFor = (cid) => <Pairs job={j} checkId={cid} />;
  return (
    <section className="stack" aria-labelledby="h-done">
      <div className="panel-h"><h2 id="h-done" style={{ fontSize: "var(--fs-h3)" }}>Done when</h2><span className="row" style={{ gap: 6 }}><Src s={j.scope.source} prefix="work order by" />{j.scope.editedBy && <span className="src person">EDITED BY THE CUSTOMER</span>}</span></div>
      {ms && <Milestones job={j} />}
      {j.scope.note && <p className="tiny muted">{j.scope.note}</p>}
      {!ms && (lastMain(j) ? <CheckHead round={lastMain(j)} job={j} /> : <p className="small ink2">{intro}</p>)}
      {!ms && <Conditions job={j} evidenceFor={evFor} />}
      {ms && ms.map((x, i) => (
        <div key={x.id} className="stack-s" style={{ marginTop: 16 }}>
          <div className="panel-h"><h3>{i + 1}. {x.title}</h3><span className="row" style={{ gap: 6 }}><span className="mono small">{m(x.due || x.amount)}</span><MsStatus s={x.status} /></span></div>
          {x.lastCheck && <CheckHead round={x.lastCheck} job={j} ms={x} />}
          <Conditions job={j} round={x.lastCheck || null} checkIds={x.checkIds} evidenceFor={evFor} />
        </div>
      ))}
      {j.checks.length > 1 && <details><summary>ALL CHECK ROUNDS ({j.checks.length})</summary><ul className="tl">{j.checks.map((r) => <li key={r.round}><time>round {r.round}</time><span>{r.milestone ? `${r.milestone} · ` : ""}{r.kind === "defect" ? "defect · " : ""}{r.decision} · {r.checks.filter((c) => c.verdict === "pass").length}/{r.checks.length} passed · {r.checker} · {when(r.at)}{r.verdictHash ? ` · ${r.verdictHash.slice(0, 10)}…` : ""}</span></li>)}</ul></details>}
    </section>
  );
}

// the customer's own photos of the problem (before work), which the checker compares the pro's after photos with
function Reference({ j, busy, act }) {
  const [files, setFiles] = useState([]);
  const ref = j.evidence.filter((e) => e.phase === "reference");
  const can = ["draft", "scoped", "offered", "agreed", "held"].includes(j.status);
  if (!ref.length && !can) return null;
  const send = async () => { const items = await Promise.all(files.map(async (f) => ({ dataUrl: await readData(f), label: "the problem" }))); act("ref", `/api/jobs/${j.id}/photos`, { items }, () => setFiles([])); };
  return (
    <section className="stack-s" aria-labelledby="h-ref">
      <h2 id="h-ref" style={{ fontSize: "var(--fs-h3)" }}>Your photos of the problem</h2>
      <p className="small ink2">The checker compares the pro's AFTER photos with these, so it can tell the work was done on your fixture.</p>
      {ref.length > 0 && <Evidence items={ref} job={j} />}
      {can && <div className="row top"><div style={{ flex: 1, minWidth: 200 }}><PhotoPicker files={files} setFiles={setFiles} label="Add photos of the problem" small /></div><B busy={busy} k="ref" className="sm" disabled={!files.length || !!busy} onClick={send}>Add {files.length || ""} photo{files.length === 1 ? "" : "s"}</B></div>}
    </section>
  );
}

// the negotiation on an offer: each side's moves as a trail of prices
function NegTrail({ n }) {
  return (
    <div className="negtrail" aria-label="Negotiation">
      <ol>{n.rounds.map((r, i) => <li key={i} className={`by-${r.by}`}><span>{r.by === "pro" ? (i === 0 ? "Offer" : "Pro") : "You"}</span><b>{r.amount}</b></li>)}</ol>
      <span className={`negstate ${n.status}`}>{n.status === "agreed" ? `Agreed at ${n.price}` : n.status === "ended" ? "No more rounds" : n.yourTurn ? `Your move · ${n.movesLeft.customer} left` : "Their move"}</span>
      {n.market && <Market m={n.market} />}
      {n.stuck && <div className="negstuck" role="status"><b>No price agreed yet: {n.stuck.why}</b><span>{n.stuck.suggest}</span></div>}
    </div>
  );
}
// where a price sits: a bar over the typical range, with their price and your last bid on it
function Market({ m }) {
  const { low, high, price } = m.theirs.cents, span = Math.max(1, high - low), from = low - span / 3, to = high + span / 3;
  const pos = (x) => `${Math.max(0, Math.min(100, ((x - from) / (to - from)) * 100)).toFixed(1)}%`;
  return (
    <div className="mkt">
      <div className="mkt-bar" aria-hidden="true">
        <i className="mkt-range" style={{ left: pos(low), right: `calc(100% - ${pos(high)})` }} />
        {m.yours && <b className="mkt-you" style={{ left: pos(m.yours.cents.price) }} />}
        <b className="mkt-them" style={{ left: pos(price) }} />
      </div>
      <div className="mkt-key tiny"><span><b className="mkt-them" /> Their {m.theirs.price}</span>{m.yours && <span><b className="mkt-you" /> Your bid {m.yours.price}</span>}<span className="muted">Typical {m.theirs.range.low}–{m.theirs.range.high}</span></div>
      <p className="tiny">{m.theirs.says}{m.yours && <><br />{m.yours.says}</>}</p>
    </div>
  );
}
// the review agent's read of each business: Google reviews for listed businesses, VeriPay's record for pros on it
function Reviews({ r }) {
  return (
    <div className="revs">
      {r.google !== "on" && <p className="tiny muted">Google reviews need a Google Places API key on this server; until then each business links to Google Maps.</p>}
      {r.results.filter((x) => x.name).map((x) => (
        <div key={x.id} className="rev">
          <div className="rev-h"><b>{x.name}</b>{x.rating != null && <span className="rev-stars">{Number(x.rating).toFixed(1)}★ <small>{x.count} {x.countOf || "review"}{x.count === 1 ? "" : "s"} · {x.source || "Google"}</small></span>}</div>
          {x.read && <p className="small">{x.read.verdict}</p>}
          {x.read?.praised?.length > 0 && <p className="tiny"><span className="ok">Praised:</span> {x.read.praised.join(", ")}</p>}
          {x.read?.watch?.length > 0 && <p className="tiny"><span className="warn">Watch:</span> {x.read.watch.join(", ")}</p>}
          {x.read?.ask?.length > 0 && <ul className="tiny rev-ask">{x.read.ask.map((a) => <li key={a}>{a}</li>)}</ul>}
          {(x.reviews || []).slice(0, 2).filter((v) => v.text).map((v, i) => <blockquote key={i} className="tiny">“{v.text.slice(0, 220)}{v.text.length > 220 ? "…" : ""}” <cite>{v.authorUrl ? <a href={v.authorUrl} target="_blank" rel="noreferrer">{v.author}</a> : v.author}{v.when ? `, ${v.when}` : ""}</cite></blockquote>)}
          {x.note && <p className="tiny muted">{x.note}</p>}
          {!x.available && x.why && !x.onVeriPay && r.google === "on" && <p className="tiny muted">{x.why}</p>}
          {x.mapsUrl && <a className="tiny" href={x.mapsUrl} target="_blank" rel="noreferrer">Open on Google Maps</a>}
        </div>))}
    </div>
  );
}
// who's near the job: pros on VeriPay (ask them directly) and listed local businesses (an invitation you send yourself)
function Nearby({ j, busy, act }) {
  const { data: d, reload } = useApi(`/api/jobs/${j.id}/nearby`);
  const [pick, setPick] = useState({}), [q, setQ] = useState("");
  const [rev, setRev] = useState(null), [revBusy, setRevBusy] = useState(false);
  if (!d || d.error) return null;
  const drafts = (j.inquiries || []).filter((x) => x.status === "draft"), answers = (j.inquiries || []).filter((x) => x.answer);
  const chosen = Object.keys(pick).filter((k) => pick[k]);
  const ask = () => act("ask", `/api/jobs/${j.id}/ask`, { to: chosen, question: q || undefined }, () => { setPick({}); reload(); });
  const check = async () => { setRevBusy(true); try { setRev(await api(`/api/jobs/${j.id}/reviews`, { method: "POST", body: { ids: chosen.length ? chosen : [...d.onVeriPay.slice(0, 2), ...d.local.slice(0, 3)].map((x) => x.id) } })); } catch (e) { setRev({ error: e.message }); } setRevBusy(false); };
  const row = (p) => (
    <li key={p.id} className={`nb ${p.onVeriPay ? "on" : "off"}`}>
      <label className="check-row"><input type="checkbox" disabled={p.asked || p.invited} checked={!!pick[p.id] || p.asked || p.invited} onChange={(e) => setPick({ ...pick, [p.id]: e.target.checked })} />
        <span className="nb-n"><b>{p.name}</b><small>{p.miles} mi{p.onVeriPay ? ` · ${p.rating != null ? `${p.rating}★ · ` : ""}${p.jobs} jobs${p.offered ? " · offered" : ""}` : `${p.address ? ` · ${p.address}` : ""}`}</small></span></label>
      {p.onVeriPay ? <span className="badge good">on VeriPay</span> : <span className="badge">not on VeriPay</span>}
    </li>);
  return (
    <section className="panel stack-s" aria-labelledby="h-near">
      <div className="panel-h"><h2 id="h-near" style={{ fontSize: "var(--fs-h3)" }}>Pros near you</h2><span className="tiny muted">{j.address?.zip} · {j.scope?.trade}</span></div>
      <ul className="nblist">{d.onVeriPay.map(row)}</ul>
      {d.local.length > 0 && <details className="nb-more"><summary>{Math.min(5, d.local.length)} more listed nearby, not on VeriPay</summary><ul className="nblist">{d.local.slice(0, 5).map(row)}</ul></details>}
      <div className="row">{chosen.length > 0 && <><input className="input sm" style={{ flex: 1, minWidth: 200 }} placeholder="Your question (optional): when can you come?" value={q} onChange={(e) => setQ(e.target.value)} /><B busy={busy} k="ask" className="accent sm" onClick={ask}>Ask {chosen.length}</B></>}<button className={`btn sm ${revBusy ? "busy" : ""}`} disabled={revBusy} onClick={check}>Check reviews{chosen.length ? ` (${chosen.length})` : ""}</button></div>
      {rev?.results && <Reviews r={rev} />}
      {answers.map((x) => <p key={x.id} className="small nb-a"><b>{x.to.name}:</b> {x.answer.text}</p>)}
      {drafts.map((x) => <div key={x.id} className="note small"><b>Invitation for {x.to.name}</b> (you send it: VeriPay never contacts businesses that aren't on it)<p style={{ margin: "6px 0" }}>{x.invite.message}</p><span className="row">{x.invite.phone && <a href={`tel:${x.invite.phone}`}>{x.invite.phone}</a>}{x.invite.website && <a href={x.invite.website} target="_blank" rel="noreferrer">Website</a>}<button className="linkish" onClick={() => navigator.clipboard?.writeText(x.invite.message)}>Copy message</button></span></div>)}
      <p className="tiny muted">Listed businesses: {d.source?.license}</p>
    </section>
  );
}
function Offers({ j, busy, act, info, me }) {
  const [counter, setCounter] = useState({}), [slotPick, setSlotPick] = useState({});
  const open = j.status === "offered";
  const saved = me?.person?.savedPayment, pays = [...(saved ? [["saved", `Saved: ${saved.label}`]] : []), ...(info?.testCard ? [["card", "Demo test card (holds at once, no PayPal screen)"]] : []), ["paypal", "PayPal (you approve once, as you would for real)"]];
  const opts = useApi(open && j.tenancy?.you !== "tenant" ? `/api/jobs/${j.id}/hold/options` : null).data;
  const payLater = (opts?.methods || []).find((x) => x.id === "paylater");
  if (payLater?.offered && !pays.some((p) => p[0] === "paylater")) pays.push(["paylater", "PayPal Pay Later (PayPal decides who's eligible)"]);
  if ((opts?.methods || []).some((x) => x.id === "venmo" && x.offered) && !pays.some((p) => p[0] === "venmo")) pays.push(["venmo", "Venmo (approve in Venmo; saved for the next holds)"]);
  const [payWith, setPay] = useState(pays[0][0]);
  const base = `/api/jobs/${j.id}`;
  const best = (j.offers || []).filter((o) => o && ["open", "countered"].includes(o.status) && o.hireable !== false).sort((a, b) => (a.amount?.cents ?? 0) - (b.amount?.cents ?? 0))[0]?.id;
  return (
    <section className="stack" aria-labelledby="h-off" id="offers">
      <div className="panel-h"><h2 id="h-off" style={{ fontSize: "var(--fs-h3)" }}>Offers</h2>{open && <span className="tiny muted">Ceiling {m(j.scope.priceCeiling)} · up to 3 rounds each side</span>}</div>
      {open && best && (j.offers || []).length > 2 && (() => { const b = j.offers.find((o) => o.id === best); return <p className="small">Lowest price: <a href={`#offer-${b.id}`}><b>{b.pro?.name}</b> at {m(b.amount)}</a> (offers stay in the order they arrived).</p>; })()}
      {open && <div className="row"><label className="field" style={{ minWidth: 220 }}><span>HOLD WITH (FOR WHICHEVER OFFER YOU TAKE)</span><select className="input sm" value={payWith} onChange={(e) => setPay(e.target.value)}>{pays.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label></div>}

      {open && (() => { const live = offersOf(j); if (live.length < 2) return null; const lo = live.reduce((a, o) => (o.amount.cents < a.amount.cents ? o : a), live[0]);
        return <div className="panel off-chart stack-s"><PriceRange offers={live} low={j.estimate?.low} high={j.estimate?.high} typical={j.estimate?.typical} ceiling={j.scope?.priceCeiling} picked={best} />{j.tenancy?.you !== "tenant" && <PayLater cents={lo.amount.cents} />}</div>; })()}
      {open && <Why label="How paying works"><p>You pay the offer price. The pro gets it minus the platform's 10% fee{j.options?.retainPct ? ` and ${j.options.retainPct}% retainage held for the warranty` : ""}. Accepting holds the price plus a buffer for change orders, never over your ceiling; the hold amount is shown on each offer (an authorization, not a charge). Hold with: “PayPal” is approved once on PayPal's page and saved for later holds; the demo test card holds at once with no PayPal screen.</p></Why>}
      {open && <Why label="Why this order"><p>Offers stay in the order they arrived; the lowest price is marked. More may still come{j.demoOffers?.some((d) => !d.done) ? ` (${j.demoOffers.filter((d) => !d.done).length} pro${j.demoOffers.filter((d) => !d.done).length === 1 ? "" : "s"} still quoting)` : ""}.</p></Why>}
      <div>{(j.offers || []).filter(Boolean).slice().sort((a, b) => String(a.created || "").localeCompare(String(b.created || ""))).map((o) => {
        const live = open && ["open", "countered"].includes(o.status), countered = !!o.counter, isBest = o.id === best;
        const price = o.amount?.cents || 0, holdFor = (raise) => Math.min(Math.round(price * (1 + (j.bufferPct || 0) / 100)), Math.max(price, raise ? price : (j.scope?.priceCeiling?.cents ?? Infinity)));
        const accept = async (raise) => { const hold = holdFor(raise); if (await askConfirm({ title: `Hire ${o.pro?.name || "this pro"} at ${m(o.amount)}?`, body: [`PayPal will hold ${usd(hold)}: the price ${m(o.amount)}${hold > price ? ` plus ${usd(hold - price)} for change orders` : ""}. It's an authorization, not a charge: you pay only what's due, when the checks pass, and the rest is released.`, ...(raise ? [`This raises your price ceiling to ${m(o.amount)}.`] : []), `Held with: ${({ saved: "your saved PayPal", card: "the demo test card (no PayPal screen)", paypal: "PayPal: you approve it once on the next screen" })[payWith] || payWith}.`], ok: `Hold ${usd(hold)}`, cancel: "Not yet" })) act(`acc${o.id}`, `${base}/offers/${o.id}/accept`, { payWith, ...(raise ? { raiseCeiling: true } : {}), ...((o.slots || []).length ? { slot: slotPick[o.id] || 0 } : {}) }, needsApproval); };
        return (
          <div key={o.id} id={`offer-${o.id}`} className={`offer ${!live && o.status !== "accepted" ? "dim" : ""} ${isBest && live ? "best" : ""}`}>
            <div>
              <div className="row" style={{ gap: 8 }}>{o.pro?.id ? <Link to={`/pros/${o.pro.id}`}><b>{o.pro.name}</b></Link> : <b>{o.pro?.name || "A pro"}</b>}<span className="badge">{({ open: "Open", countered: "Countered", accepted: "Hired", declined: "Not chosen", closed: "Closed", withdrawn: "Withdrawn", expired: "Expired" })[o.status] || o.status}</span>{o.termsChanged && live && <span className="badge warn" title="Your options changed after this offer; the pro may send a new one">terms changed since</span>}{isBest && live && <span className="badge good">lowest price</span>}{o.agent === "external" ? <span className="badge agent">the pro's own agent</span> : null}</div>
              <Why label="Price and pro"><p>{[o.pro?.rating != null && `${o.pro.rating}★`, o.pro?.jobs != null && `${o.pro.jobs} jobs`, o.pro?.license, o.miles != null && `${o.miles} mi`, o.arrival && `arrives ${when(o.arrival)}`, o.helper && `with ${o.helper.name} (${Math.round((o.helper.share || 0) * 100)}% share)`].filter(Boolean).join(" · ")}</p>
              {o.breakdown && o.breakdown.given !== false ? <p className="data">call-out {m(o.breakdown.callout)}{o.breakdown.hours != null ? ` + ${o.breakdown.hours} h labor ${m(o.breakdown.labor)}` : ""}{o.breakdown.parts?.cents ? ` + parts ${m(o.breakdown.parts)}` : ""}{o.breakdown.travel?.cents ? ` + travel ${m(o.breakdown.travel)}` : ""}{o.breakdown.rush > 1 ? ` × rush ${o.breakdown.rush}` : ""}{o.pro?.payout?.to ? ` · paid to ${o.pro.payout.to}${o.pro.payout.verified ? " (verified)" : ""}` : ""}</p>
                : <p className="data">No price breakdown given{o.breakdown?.total ? ` (total ${m(o.breakdown.total)})` : ""}{o.pro?.payout?.to ? ` · paid to ${o.pro.payout.to}${o.pro.payout.verified ? " (verified)" : ""}` : ""}</p>}</Why>
              {o.hireable === false ? <p className="tiny warn" style={{ marginTop: 4 }}>Can't be hired yet: {(o.blocked || []).map((b) => (/^Verify the PayPal/.test(b) ? "this pro hasn't verified the PayPal they're paid to. Payouts go only to a verified PayPal." : b)).join(" ") || "this pro hasn't verified a PayPal to be paid to."}</p>
                : o.pro?.payout && o.pro.payout.verified === false && <p className="tiny warn" style={{ marginTop: 4 }}>This pro hasn't verified a PayPal to be paid to yet, so they can't be hired until they do.</p>}
              {o.negotiation ? <NegTrail n={o.negotiation} /> : o.counter && <p className="tiny" style={{ marginTop: 4 }}>You countered {m(o.counter.amount)}{o.answer ? ` → ${o.answer.kind === "counter" ? `they came back at ${m(o.answer.amount)}` : o.answer.kind === "accept" ? "they accepted" : "they declined"}` : ""}</p>}
            </div>
            <div className="price">{o.ask && o.amount && o.ask.cents !== o.amount.cents && <s>{m(o.ask)}</s>}{m(o.amount)}</div>
            {o.group && <p className="small"><span className="badge good">neighborhood group · {o.discountPct}% off</span> {o.soloPrice ? <span className="tiny muted">alone {m(o.soloPrice)}</span> : ""}{o.groupSays ? <span className="tiny muted"> · {o.groupSays}</span> : ""}</p>}
            {o.fair && <p className={`fair ${o.fair.where}`} title={o.fair.says}>{o.fair.where === "below" ? "Below" : o.fair.where === "above" ? "Above" : "Within"} the typical range ({o.fair.typical}){o.fair.source ? ` · ${String(o.fair.source).toUpperCase()}` : ""}</p>}
            {j.tenancy?.pick?.offer === o.id && <p className="small"><span className="badge good">{j.tenancy.you === "tenant" ? "you suggested this one" : "your tenant suggests this one"}</span></p>}
            {(o.slots || []).length > 0 && (live && j.tenancy?.you !== "tenant" ? <fieldset className="slots"><legend className="tiny muted">VISIT TIME (AUSTIN)</legend>{o.slots.map((x, i) => <label key={x.from} className="check-row"><input type="radio" name={`slot-${o.id}`} checked={(slotPick[o.id] || 0) === i} onChange={() => setSlotPick({ ...slotPick, [o.id]: i })} /><span className="small">{slotSays(x)}</span></label>)}</fieldset>
              : <Why><p>Visit: {o.slots.map(slotSays).join(" · ")}</p></Why>)}
            {live && j.tenancy?.you === "tenant" && <div className="acts"><B busy={busy} k={`pick${o.id}`} className="sm" disabled={j.tenancy?.pick?.offer === o.id || !!busy} onClick={() => act(`pick${o.id}`, `${base}/tenant/pick`, { offer: o.id })}>Suggest this one to my landlord</B></div>}
            {live && o.hireable !== false && j.tenancy?.you !== "tenant" && <div className="acts">
              {(o.amount?.cents ?? 0) > (j.scope?.priceCeiling?.cents ?? Infinity) ? <B busy={busy} k={`acc${o.id}`} className="sm" onClick={() => accept(true)} title={`Over your ${m(j.scope.priceCeiling)} ceiling`}>Raise the ceiling: hold {usd(holdFor(true))} (you pay {m(o.amount)})</B>
                : <B busy={busy} k={`acc${o.id}`} className="accent sm" onClick={() => accept(false)}>Hire: hold {usd(holdFor(false))} (you pay {m(o.amount)})</B>}
              {(o.negotiation ? o.negotiation.status === "open" && o.negotiation.yourTurn && o.negotiation.movesLeft.customer > 0 : !countered) && <><span className="money-in" style={{ width: 100 }}><input className="input sm" inputMode="decimal" placeholder={o.amount ? `e.g. ${(o.amount.cents * 0.009).toFixed(0)}` : ""} value={counter[o.id] || ""} onChange={(e) => setCounter({ ...counter, [o.id]: e.target.value })} aria-label={`Counter offer to ${o.pro?.name || "the pro"}`} /></span>
                <B busy={busy} k={`ctr${o.id}`} className="sm" disabled={!dollars(counter[o.id]) || !!busy} onClick={() => act(`ctr${o.id}`, `${base}/offers/${o.id}/negotiate`, { move: "propose", amount: dollars(counter[o.id]) })}>Propose</B></>}
            </div>}
          </div>
        );
      })}</div>
      {open && <details className="panel">
        <summary>Or let an agent negotiate for you</summary>
        <div className="stack-s" style={{ marginTop: 10 }}>
          <p className="small ink2">You don't need an agent: pick an offer above. If you'd like one to do it, the demo's agent counters the best offer once (about 88% of its price), accepts within your ceiling and holds the money. Your own AI agent can do the same over MCP (Connect your agent).</p>
          <B busy={busy} k="auto" className="sm" onClick={() => act("auto", `${base}/auto-hire`, { payWith: "card" }, needsApproval)} data-tour="auto-hire">Let the demo agent negotiate and hire</B>
        </div>
      </details>}
    </section>
  );
}

// the one thing to do next, for the customer
function RetryHold({ j, busy, act, info, me }) {
  const saved = me?.person?.savedPayment, pays = [...(saved ? [["saved", `Saved: ${saved.label}`]] : []), ...(info?.testCard ? [["card", "PayPal sandbox test card"]] : []), ["paypal", "PayPal (approve once)"]];
  const [payWith, setPay] = useState(pays[0][0]);
  return <div className="row"><select className="input sm" style={{ width: "auto" }} value={payWith} onChange={(e) => setPay(e.target.value)} aria-label="Hold with">{pays.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select><B busy={busy} k="retry" className="accent sm" onClick={() => act("retry", `/api/jobs/${j.id}/hold/retry`, { payWith })}>Try the hold again</B></div>;
}

function Decide({ j, busy, act, info, me, reload }) {
  const [reason, setReason] = useState(""), [release, setRelease] = useState("");
  const base = `/api/jobs/${j.id}`, s = j.status, d = j.dispute;
  // the milestone waiting on the customer (review, needs_fix or passed), else the current one
  const wm = j.milestones?.find((x) => ["review", "needs_fix", "passed", "disputed"].includes(x.status)) || j.milestones?.find((x) => x.current);
  const multi = (j.milestones?.length || 0) > 1, mid = wm ? { milestone: wm.id } : {};
  const due = wm && multi ? (wm.due || wm.amount) : j.due;
  const left = useLeft(wm?.passed?.until, info?.now);
  const msName = multi && wm ? ` (milestone ${j.milestones.indexOf(wm) + 1}: ${wm.title})` : "";
  const box = (title, body, tone = "") => <div className={`panel marks stack ${tone}`} id="decide"><h3>{title}</h3>{body}</div>;
  if (s === "scoped") return box("Ask for offers", <><p className="small ink2">The pros' agents nearby quote against this work order.</p><div className="row"><B busy={busy} k="req" className="accent" onClick={() => act("req", `${base}/offers/request`)}>Ask for offers</B><B busy={busy} k="cx" onClick={() => act("cx", `${base}/cancel`, { reason: "not needed" })}>Cancel</B></div></>);
  if (s === "offered") return box("Pick an offer", <><p className="small ink2">Hire one below or propose a price: up to 3 rounds each side (or let an agent negotiate, below the offers). Accepting holds the price plus a buffer with PayPal (the amount is on each offer); nothing is charged until the checks pass.</p><Why><p>{(j.offers || []).length ? "More may come. " : "No offers yet: the first usually arrive within 1–2 minutes. "}This page looks again every few seconds, so they appear here without reloading.</p></Why>{(j.offers || []).length > 0 && <a className="btn sm" href="#offers">See the {j.offers.length} offer{j.offers.length === 1 ? "" : "s"}</a>}</>);
  // "starting": the server is making a new order for this hold (card fields, Fastlane…); keep the panel (and the card
  // fields in it) mounted until PayPal answers
  const waiting = ["pending_approval", "starting"].includes(j.hold?.status);
  if (s === "agreed" && waiting) return box("Approve the hold", <>
    <p className="small ink2">First time with PayPal: approve holding <b>{m(j.hold.amount)}</b> once. It's an authorization, not a charge, and it saves PayPal so later holds and your agent need no approval.</p>
    <PayPalButtons jobId={j.id} orderId={j.hold.paypalOrder} approveUrl={j.hold.approveUrl} simulated={info?.paypal === "mock"} onDone={reload} method={j.hold.payWith} amount={j.hold.amount?.cents ?? null} />
    {j.hold.items?.length > 0 && <ul className="tiny muted">{j.hold.items.map((x) => <li key={x.name}>{x.name}: {m(x.amount)}</li>)}<li>PayPal shows these lines when you approve.</li></ul>}
    <PayPalMore jobId={j.id} amount={j.hold.amount?.cents ?? j.hold.amount} zip={j.address?.zip || null} onDone={reload} />
    {info?.testCard && <div className="row"><B busy={busy} k="card" onClick={() => act("card", `${base}/hold/card`)}>Hold with the demo test card instead</B><B busy={busy} k="decline" className="ghost" onClick={() => act("decline", `${base}/hold/card`, { decline: true })}>Try a card the bank declines</B></div>}
  </>);
  if (s === "agreed" && !waiting) return box("The hold didn't go through", <>
    <p className="small ink2">The offer is agreed, but PayPal isn't holding the money{j.hold?.status ? ` (hold ${j.hold.status.replace(/_/g, " ")})` : ""}. Nothing was charged. Place the hold again to let the pro start.</p>
    {j.hold?.note && <Why><p>{j.hold.note}</p></Why>}
    <RetryHold j={j} busy={busy} act={act} info={info} me={me} />
  </>);
  if (["held", "working"].includes(s)) return box(s === "held" ? "Money held. Waiting for the pro" : multi ? `Work under way: milestone ${j.milestones.findIndex((x) => x.current) + 1} of ${j.milestones.length}` : "Work under way", <>
    <NextUp j={j} info={info} />
    {j.changeOrders.some((c) => c.status === "pending") && <p className="note warn small">A change order is waiting for you below.</p>}
    {s === "held" && <div className="danger-zone"><span className="eyebrow">CHANGED YOUR MIND?</span><B busy={busy} k="cx" className="danger sm" onClick={async () => { if (await askConfirm({ title: "Cancel this job?", body: "The PayPal hold is voided and nothing is charged. The pro is told.", ok: "Cancel the job", cancel: "Keep it", danger: true })) act("cx", `${base}/cancel`, { reason: "cancelled by the customer" }); }}>Cancel and void the hold</B></div>}
  </>);
  if (["submitted", "checking"].includes(s)) return box("Checking the evidence", <><p className="small ink2">Each done-condition is being checked against the pro's photos, receipt and note.</p><div className="skel" style={{ height: 8 }} /></>);
  if (s === "passed" && wm?.passed) return box(wm.passed.waiting === "inspector" ? "Waiting for the inspector" : "Passed: review window", <>
    {wm.passed.waiting === "inspector" ? <p className="small ink2">Every condition passed{msName}. The inspector you named confirms it before any money moves.</p> : <>
      <p className="small ink2">Every condition passed{msName}. You chose a review window: {m(due)} is released automatically in <b>{fmtLeft(left)}</b> ({when(wm.passed.until)}), unless you dispute. Or release it now.</p>
      <div className="row"><B busy={busy} k="rel" className="accent" onClick={() => act("rel", `${base}/release`, mid)}>Release {m(due)} now</B></div>
      <label className="field"><span>OR SAY WHAT'S WRONG</span><textarea className="input" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} /></label>
      <B busy={busy} k="dsp" className="danger sm" disabled={!reason.trim() || !!busy} onClick={() => act("dsp", `${base}/dispute`, { reason, ...mid })}>Dispute before it releases</B>
      <Why><p>Fee on release: 10% ({usd(Math.round((due?.cents || 0) * 0.1))}), kept by the platform; the rest goes to the pro{j.options?.retainPct ? `, minus ${j.options.retainPct}% retainage held for the ${j.options.warrantyDays}-day warranty` : ""}.</p></Why>
    </>}
  </>);
  if (s === "needs_fix") return box("Sent back to the pro", <>
    <NextUp j={j} info={info} />
    <ReleaseAnyway j={j} busy={busy} act={act} base={base} mid={mid} due={due} />
  </>);
  if (["review", "needs_fix"].includes(s)) return box(s === "review" ? "Your call" : "Sent back to the pro", <>
    <p className="small ink2">{s === "review" ? (lastMain(j) ? `${roundStory(lastMain(j)).line}. Look at each condition below, then confirm, release, ask for a fix or dispute.` : "Look at each condition, then decide.") : "A condition needs a fix; the pro has been told what. You can still release now if you're satisfied."}</p>
    {multi && wm && <p className="small">Milestone {j.milestones.indexOf(wm) + 1}: <b>{wm.title}</b></p>}
    <ul className="small ink2" style={{ margin: 0, paddingLeft: 18 }}>
      <li>The money is still only held, not charged.</li>
      <li>If you wait: {j.queue?.length ? `an expert at VeriPay answers by ${when(j.queue[0].slaDue)} (4 business hours): they may release it, ask the pro for a fix, or leave it to you. Whoever decides first decides.` : j.options?.releaseMode === "review" ? "nothing moves until you decide." : "nothing moves until you decide."}{j.hold?.expiresAt ? ` The hold lasts until ${when(j.hold.expiresAt)}.` : ""}</li>
      <li>If you disagree: ask for a fix (the pro resends and it's checked again) or open a dispute (part release, part refund).</li>
    </ul>
    <ReviewButtons j={j} busy={busy} act={act} base={base} mid={mid} due={due} wm={wm} reason={reason} />
    <Why><p>Fee on this release: 10%, kept by the platform{j.options?.retainPct ? `; ${j.options.retainPct}% of the pro's share is retained for the ${j.options.warrantyDays}-day warranty` : ""}.</p></Why>
    <label className="field"><span>OR SAY WHAT'S WRONG</span><textarea className="input" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="The drip came back after an hour." aria-describedby="why-help" /><span id="why-help" className="tiny muted" style={{ marginTop: 4 }}>Write what's wrong first: the pro sees it with a fix request or a dispute.</span></label>
    <div className="row">{s === "review" && <B busy={busy} k="fix" disabled={!reason.trim() || !!busy} onClick={() => act("fix", `${base}/request-fix`, { reason, ...mid })}>Ask for a fix</B>}<B busy={busy} k="dsp" className="danger" disabled={!reason.trim() || !!busy} onClick={() => act("dsp", `${base}/dispute`, { reason, ...mid })}>Open a dispute</B></div>
  </>, "");
  if (s === "disputed" && d) { const theirs = d.proposals.find((p) => p.status === "open" && p.by === "pro"), mine = d.proposals.find((p) => p.status === "open" && p.by === "customer");
    return box("Dispute", <>
      <p className="small">“{d.reason}”</p>
      {d.summary?.suggestion && <div className="note small"><Src s={d.summary.suggestion.source} prefix="suggested by" /> <p style={{ marginTop: 6 }}>Release {m(d.summary.suggestion.release)}, refund {m(d.summary.suggestion.refund)}. {d.summary.suggestion.why}</p></div>}
      {d.summary?.text && <p className="small ink2"><Src s={d.summary.textSource} /> {d.summary.text}</p>}
      {theirs && <div className="stack-s"><p className="small">The pro proposes: release <b>{m(theirs.release)}</b>, refund <b>{m(theirs.refund)}</b>.</p><B busy={busy} k="acc" className="accent" onClick={() => act("acc", `${base}/dispute/accept`)}>Accept the pro's split</B></div>}
      {mine && <p className="small muted">Your proposal: release {m(mine.release)}, refund {m(mine.refund)}. Waiting for the pro.</p>}
      <div className="row"><span className="money-in" style={{ width: 120 }}><input className="input sm" inputMode="decimal" value={release} onChange={(e) => setRelease(e.target.value)} placeholder={(d.summary?.suggestion?.release?.cents / 100 || 0).toFixed(0)} aria-label="Release to the pro, in dollars" /></span><B busy={busy} k="prp" className="sm" disabled={dollars(release) == null || !!busy} onClick={() => act("prp", `${base}/dispute/propose`, { release: dollars(release) })}>Propose this release</B></div>
      <Why><p>The platform captures what's due and refunds the rest with PayPal Refunds, so the refund shows in your PayPal. Staff can also settle it.</p></Why>
    </>); }
  if (["released", "resolved"].includes(s)) { const PS = j.payoutState, ps = String(proItem(j)?.status || j.money?.payout?.status || "");
    const done = PS ? PS.state === "paid" : ps === "SUCCESS" || ps === "paid_as_payee", sent = PS ? ["sent", "sent_unclaimed"].includes(PS.state) : !done && ps && j.money?.payout?.ok !== false;
    const word = done ? (s === "released" ? "Paid" : "Settled") : PS?.state === "sent_unclaimed" || ps === "UNCLAIMED" ? "Sent, not claimed" : sent ? "Payout sent" : PS?.state === "failed" ? "Payout failed" : PS?.state === "waiting_for_paypal" ? "Waiting for the pro's PayPal" : s === "released" ? "Released" : "Settled";
    const unclaimed = PS?.state === "sent_unclaimed" || ps === "UNCLAIMED";
    return box(done ? word : `${s === "released" ? "Released" : "Settled"}: ${unclaimed ? "sent, waiting for the pro to claim it" : sent ? "PayPal is paying the pro" : "payout to follow"}`, <>
    <div className="row"><span className={`stamp big ${done ? "pass" : "person"} land`}>{word}<small>{when(j.paidAt || j.updated)}</small></span></div>
    <PayoutLine j={j} />
    <p className="small ink2">{m(j.money.split?.pro)} to {j.agreed?.proName}{j.money.split?.helper?.cents ? ` and ${m(j.money.split.helper)} to ${j.agreed?.helper?.name}` : ""} in one PayPal Payouts batch{j.money.refunded?.cents ? `; ${m(j.money.refunded)} refunded to you` : ""}. {j.hold?.history?.length ? "The unused part of the hold was released, never captured." : ""}</p>
    {j.timeline.at(-1)?.by?.kind === "platform" && <Why><p>Released by the rules the moment every condition passed: no one pressed a button.</p></Why>}
  </>); }
  if (["cancelled", "expired"].includes(s)) return box(s === "cancelled" ? "Cancelled" : "Expired", <p className="small ink2">{j.hold ? `The hold was ${j.hold.status}; nothing was charged.` : "Nothing was held or charged."}</p>);
  return null;
}

// what happens next and when, after the money is held; in the demo, a control to have the demo pro do the job now
function NextUp({ j, info }) {
  const { toast } = useMe(), [busy, setBusy] = useState(false);
  const arrive = j.agreed?.arrival, s = j.status, demoPro = info?.demoSignin && (j.agreed?.pro?.agent === "demo" || j.agreed?.pro?.demo);
  const steps = s === "held" ? [
    [`${j.agreed?.proName || "The pro"} arrives`, arrive ? when(arrive) : "at the agreed time"],
    ["They do the work and send a photo, receipt or note for each condition", `by ${when(j.scope?.window?.to)}`],
    ["Each condition is checked", "seconds after they send it"],
    ["The money moves", j.options?.releaseMode === "review" ? `after your ${j.options.reviewHours}-hour review window` : "the moment every condition passes (or when you release it)"],
  ] : s === "working" ? [["The pro is working and sends evidence for each condition", `by ${when(j.scope?.window?.to)}`], ["Each condition is checked", "seconds after it arrives"]]
    : [["The pro fixes what didn't pass and sends it again", `by ${when(j.scope?.window?.to)}`], ["It's checked again", "seconds after it arrives"]];
  // demo only: the hired demo pro's agent plays its part now (starts, sends synthetic photos stamped at the address, the receipt and a note)
  const finish = async () => {
    const fix = s === "needs_fix";
    if (!(await askConfirm({ title: fix ? "Skip ahead: have the pro send the fix?" : "Skip ahead: have the pro finish?", body: [fix ? "Its agent answers your fix request: it sends new photos and a note, then the real check runs again." : "Its agent starts the work if needed and sends photos stamped with the time and your address, a receipt and a note. Then the real check runs.", "To make the photo times real, it moves the shared clock forward by the minutes the work takes (often 10–15), for everyone on this server."], ok: fix ? "Send the fix now" : "Finish now" }))) return;
    setBusy(true); toast(fix ? "The pro is sending the fix…" : "The pro is working: this takes up to 20 seconds…");
    try {
      const r = await api(`/api/jobs/${j.id}/demo-finish`, { method: "POST", body: {} });
      const wait = (r.demo?.steps || []).find((x) => x && x.waiting);
      refresh(); toast(wait ? `Not yet: ${wait.waiting}.` : r.demo?.note || `The pro did what was left${r.demo?.steps?.length ? `: ${r.demo.steps.join(", ")}` : ""}.`);
    } catch (e) { toast(e.message, true); }
    setBusy(false);
  };
  return (
    <div className="stack-s">
      <ol className="nextup">{steps.map(([what, t], i) => <li key={i}><span>{what}</span><span className="data">{t}</span></li>)}</ol>
      {demoPro && <div className="note agent small stack-s">
        <button className={`btn sm ${busy ? "busy" : ""}`} disabled={busy} onClick={finish}>{s === "needs_fix" ? "Skip ahead: pro sends the fix" : "Skip ahead: pro finishes"}</button>
      </div>}
    </div>
  );
}

// narrow screens get the decision first (rendered once: no duplicate controls in the page)
function useNarrow() {
  const q = "(max-width: 1000px)", [n, setN] = useState(() => typeof matchMedia !== "undefined" && matchMedia(q).matches);
  useEffect(() => { const mq = matchMedia(q), f = () => setN(mq.matches); mq.addEventListener("change", f); return () => mq.removeEventListener("change", f); }, []);
  return n;
}

// a decision the customer's agent asked its person to take (askPerson: the one-time link lands here with ?ask=)
function AskBanner({ j, busy, act }) {
  const q = new URLSearchParams(location.search), ask = q.get("ask");
  const review = ["review", "passed"].includes(j.status) && j.waitingOn?.who === "customer";
  const [gone, setGone] = useState(false);
  if (gone || (!ask && !q.has("agent"))) return null;
  const mid = j.milestones?.find((x) => ["review", "needs_fix", "passed"].includes(x.status));
  return (
    <div className="panel marks stack-s ask" role="region" aria-label="Your agent asks">
      <span className="eyebrow">YOUR AGENT ASKS</span>
      <p><b>{review ? `Your agent asks you to look at the photos for ${j.number} and confirm.` : `Your agent asks you to ${ask || "decide on this job"}${/DP-\d/.test(ask || "") ? "" : ` for ${j.number}`}.`}</b></p>
      <p className="small ink2">Only you can do this; your agent can't. Nothing changes unless you choose.</p>
      <div className="row">
        {review && <B busy={busy} k="askconf" className="accent sm" onClick={() => act("askconf", `/api/jobs/${j.id}/confirm`, mid ? { milestone: mid.id } : {}, () => setGone(true))}>The photos are right: confirm</B>}
        {!review && <a className="btn accent sm" href={j.status === "offered" ? "#offers" : "#main"}>Show me</a>}
        <button className="btn sm" onClick={() => setGone(true)}>Not now</button>
      </div>
    </div>
  );
}

// the job's options, editable until an offer is accepted (pros are told and may send new offers)
function Options({ j, busy, act }) {
  const o = j.options || {};
  const [f, setF] = useState({ releaseMode: o.releaseMode || "instant", reviewHours: o.reviewHours || 48, retainPct: o.retainPct || 0, warrantyDays: o.warrantyDays || 14, inspector: o.inspector || "", requireBefore: !!o.requireBefore });
  const [open, setOpen] = useState(false), [ins, setIns] = useState([]);
  useEffect(() => { if (open && !ins.length) api("/api/inspectors").then(setIns).catch(() => {}); }, [open]);
  const set = (p) => setF((x) => ({ ...x, ...p }));
  const save = () => act("opts", `/api/jobs/${j.id}/options`, { ...f, reviewHours: +f.reviewHours, retainPct: +f.retainPct, warrantyDays: +f.warrantyDays, inspector: f.inspector || null }, () => setOpen(false), "PATCH");
  const sum = `${o.releaseMode === "review" ? `release after a ${o.reviewHours}-hour review window` : "release the moment it passes"}${o.retainPct ? ` · ${o.retainPct}% retained for ${o.warrantyDays} days` : ""}${o.inspector ? " · inspector" : ""}${o.requireBefore ? " · BEFORE photos required" : ""}`;
  return (
    <details className="panel" open={open} onToggle={(e) => setOpen(e.target.open)}>
      <summary>JOB OPTIONS: {sum.toUpperCase()} · CHANGE UNTIL YOU ACCEPT AN OFFER</summary>
      <div className="stack-s" style={{ marginTop: 12 }}>
        <div className="seg" role="radiogroup" aria-label="Release">
          <button type="button" role="radio" aria-checked={f.releaseMode === "instant"} className={f.releaseMode === "instant" ? "on" : ""} onClick={() => set({ releaseMode: "instant" })}>The moment it passes</button>
          <button type="button" role="radio" aria-checked={f.releaseMode === "review"} className={f.releaseMode === "review" ? "on" : ""} onClick={() => set({ releaseMode: "review" })}>After a review window</button>
        </div>
        <div className="fields-3">
          {f.releaseMode === "review" && <label className="field"><span>REVIEW WINDOW</span><select className="input sm" value={f.reviewHours} onChange={(e) => set({ reviewHours: e.target.value })}>{[12, 24, 48, 72, 168].map((h) => <option key={h} value={h}>{h < 168 ? `${h} hours` : "7 days"}</option>)}</select></label>}
          <label className="field"><span>RETAINAGE</span><select className="input sm" value={f.retainPct} onChange={(e) => set({ retainPct: e.target.value })}>{[0, 5, 10, 15, 20].map((p) => <option key={p} value={p}>{p ? `${p}%` : "none"}</option>)}</select></label>
          <label className="field"><span>WARRANTY</span><select className="input sm" value={f.warrantyDays} onChange={(e) => set({ warrantyDays: e.target.value })}>{[7, 14, 30, 60, 90].map((d) => <option key={d} value={d}>{d} days</option>)}</select></label>
          <label className="field"><span>INSPECTOR</span><select className="input sm" value={f.inspector} onChange={(e) => set({ inspector: e.target.value })}><option value="">none</option>{ins.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
        </div>
        <label className="check-row"><input type="checkbox" checked={f.requireBefore} onChange={(e) => set({ requireBefore: e.target.checked })} /> The pro must photograph each spot BEFORE starting</label>
        {j.status === "offered" && <p className="tiny muted">The pros who already offered are told the terms changed and may send a new offer, which replaces their old one.</p>}
        <B busy={busy} k="opts" className="sm accent" onClick={save}>Save the options</B>
      </div>
    </details>
  );
}

// Done-Risk at agreement: the chance of a dispute and of an overrun, which sized the buffer; labelled with its source
function RiskPanel({ r, buffer }) {
  const pct = (x) => (x?.p != null ? `${(x.p * 100).toFixed(x.p < 0.1 ? 1 : 0)}%` : "—");
  const WORD = { gaps: "open gaps in the scope", pro_jobs: "the pro's finished jobs", price_to_ceiling: "price vs your ceiling", checks: "number of checks", hirer_past_disputes: "your past disputes", price: "the price", allowance_to_parts: "parts allowance", problem_photo: "a problem photo" };
  const why = (x) => (Array.isArray(x?.why) ? x.why.slice(0, 3).map((f) => typeof f === "string" ? f : `${WORD[f.factor] || String(f.factor).replace(/_/g, " ")} ${f.logOdds > 0 ? "raises" : "lowers"} it`).join(", ") : x?.why || "");
  return (
    <div className="panel stack-s">
      <div className="panel-h"><h3>Risk estimate</h3><Src s={r.source === "rules" ? "rules" : String(r.source || "").replace(/^model:\s*/, "") || "model"} /></div>
      <ul className="spec">
        <li><span className="lead">Chance of a dispute</span><span className="val">{pct(r.dispute)}</span></li>
        {why(r.dispute) && <li className="tiny muted">{why(r.dispute)}</li>}
        <li><span className="lead">Chance of an overrun</span><span className="val">{pct(r.overrun)}</span></li>
        {why(r.overrun) && <li className="tiny muted">{why(r.overrun)}</li>}
        {buffer && <li><span className="lead">Buffer on the hold</span><span className="val">{buffer}</span></li>}
      </ul>
      <Why><p>It sizes the buffer on the hold; it never decides whether money moves.</p></Why>
    </div>
  );
}

// a hold that needs the customer's PayPal approval: point at the approval step instead of leaving it below the fold
function needsApproval(r) {
  const j = r?.job || r, url = r?.approveUrl || j?.hold?.approveUrl;
  if (url || j?.hold?.status === "pending_approval") setTimeout(() => document.getElementById("decide")?.scrollIntoView({ behavior: "smooth", block: "start" }), 400);
}

// the pro's payout item: its status is what the pro sees (the batch can be SUCCESS while the item is UNCLAIMED)
export function proItem(j) { const items = j?.money?.payout?.items || []; return items.find((i) => i.to === "pro") || items[0] || null; }
export function PayoutLine({ j, small }) {
  const it = proItem(j), st = String(it?.status || j?.money?.payout?.status || "").toUpperCase(), cls = small ? "tiny muted" : "small";
  if (st === "UNCLAIMED" || j?.payoutState?.state === "sent_unclaimed") return <p className={cls}>Sent to the pro's PayPal email; PayPal holds it until they claim it.</p>;
  if (st === "SUCCESS") return <p className={cls}>In the pro's PayPal account.</p>;
  if (["PENDING", "PROCESSING"].includes(st)) return <p className={cls}>Sent to PayPal; PayPal is processing it.</p>;
  const says = j?.payoutState?.says || it?.says || j?.money?.payout?.says;
  return says ? <p className={cls}>{says}</p> : null;
}

const failedChecks = (j, wm) => { const r = lastMain(j); return (r?.checks || []).filter((c) => c.verdict !== "pass" && (!wm || !r.milestone || r.milestone === wm.id)); };

// the review decision: one primary action. Confirming counts as a pass (then the inspector / review window apply);
// releasing over a failed check is a separate, named action and only shown when a check didn't pass.
function ReviewButtons({ j, busy, act, base, mid, due, wm, reason = "" }) {
  const [refused, setRefused] = useState(null), [pick, setPick] = useState({}), [sending, setSending] = useState(false), [result, setResult] = useState(null);
  const failed = failedChecks(j, wm), st = lastMain(j) ? roundStory(lastMain(j)) : null;
  // conditions code passed but a person must look at: for each, "Looks right", "Needs a fix" or "Decide later" (the default)
  const round = lastMain(j), byId = Object.fromEntries((j.scope?.checks || []).map((c) => [c.id, c]));
  const waiting = (round?.checks || []).filter((c) => c.verdict === "pass" && stampOf(c, byId[c.id]?.evidence).cls === "person" && (!wm || !round.milestone || round.milestone === wm.id));
  const right = waiting.filter((c) => pick[c.id] === "right").map((c) => c.id), fixIt = waiting.filter((c) => pick[c.id] === "fix").map((c) => c.id), later = waiting.filter((c) => !pick[c.id]).map((c) => c.id);
  const toFix = [...failed.map((c) => c.id), ...fixIt], name = (id) => byId[id]?.what || id;
  const needReason = toFix.length > 0;
  const send = async () => {
    const groups = [right.length ? `Confirmed as right (${right.length}): ${right.map(name).join("; ")}.` : null, toFix.length ? `Back to the pro to fix (${toFix.length}): ${toFix.map(name).join("; ")}. They're told: “${reason.trim()}”` : null, later.length ? `Left for you to decide later (${later.length}): ${later.map(name).join("; ")}. Nothing is sent about these.` : null].filter(Boolean);
    if (!(await askConfirm({ title: toFix.length ? "Send these decisions and the fix request?" : "Confirm these and leave the rest?", body: [...groups, "Nothing is captured yet: the money moves when every condition is settled."], ok: toFix.length ? "Send" : `Confirm ${right.length}`, cancel: "Not yet" }))) return;
    setSending(true); setRefused(null); setResult(null);
    // what the pro is told names the conditions the person marked for a fix (the server sends the failed ones by itself)
    try {
      // one call: confirmed (checkIds), marked for a fix (fixIds, with failed ones the server adds), the rest stay waiting
      const r = right.length || fixIt.length ? await api(`${base}/confirm`, { method: "POST", body: { ...(mid || {}), checkIds: right, fixIds: fixIt, ...(toFix.length ? { fix: reason.trim() } : {}) } })
        : await api(`${base}/request-fix`, { method: "POST", body: { ...(mid || {}), reason: reason.trim() } });
      setResult({ confirmed: r?.confirmed || right, toFix: r?.toFix || toFix, waiting: (r?.waiting || later).filter((x) => !fixIt.includes(x)) }); setPick({}); refresh();
    } catch (e) { if (!e.cancelled) setRefused({ message: e.message, failed: e.body?.failed || [] }); }
    setSending(false);
  };
  const after = j.options?.inspector && wm?.inspect !== false ? "The inspector you named confirms it before any money moves." : j.options?.releaseMode === "review" ? `Your review window (${j.options.reviewHours || 48} h) runs first; then ${m(due)} is captured.` : `PayPal captures ${m(due)} from the hold now; the pro gets it minus the 10% fee, and the unused part of the hold is released.`;
  const confirm = async () => {
    if (!(await askConfirm({ title: `Pay ${m(due)} now?`, body: [`Code found nothing wrong${st?.person ? `; you're confirming the ${st.person} photo${st.person === 1 ? "" : "s"} and note${st.person === 1 ? "" : "s"} no model judged` : ""}.`, after], ok: `Pay ${m(due)}`, cancel: "Not yet" }))) return;
    setRefused(null);
    try { await api(`${base}/confirm`, { method: "POST", body: { ...(mid || {}), ...(waiting.length ? { checkIds: waiting.map((c) => c.id) } : {}) } }); refresh(); }
    catch (e) { if (e.status === 409 || e.body?.failed) setRefused({ message: e.message, failed: e.body?.failed || [] }); else setRefused({ message: e.message, failed: [] }); }
  };
  return (
    <div className="stack-s">
      {waiting.length > 0 && <fieldset className="looks stack-s">
        <legend className="eyebrow">YOUR CALL ON EACH: CODE FOUND NOTHING WRONG; NO MODEL JUDGED THESE</legend>
        {waiting.map((c) => <div key={c.id} className="cond-pick"><span className="small">{name(c.id)}</span>
          <span className="pick3" role="radiogroup" aria-label={name(c.id)}>{[["right", "Looks right"], ["fix", "Needs a fix"], ["", "Decide later"]].map(([v, l]) => <label key={v || "later"}><input type="radio" name={`pick-${c.id}`} checked={(pick[c.id] || "") === v} onChange={() => setPick({ ...pick, [c.id]: v })} />{l}</label>)}</span></div>)}
        {waiting.length > 1 && <div><button type="button" className="btn sm" onClick={() => setPick(Object.fromEntries(waiting.map((c) => [c.id, "right"])))}>All look right</button></div>}
        <p className="tiny muted">Anything left on "Decide later" stays waiting: nothing is sent about it.</p>
      </fieldset>}
      {failed.length > 0 && <p className="small">Didn't pass, so it goes back to the pro with any fix request: {failed.map((c) => name(c.id)).join("; ")}.</p>}
      {!failed.length && (!waiting.length || right.length === waiting.length) && <div className="row"><B busy={busy} k="conf" className="accent" onClick={confirm} data-tour="release">The photos look right: pay {m(due)}</B></div>}
      {(right.length > 0 || fixIt.length > 0) && !(right.length === waiting.length && !failed.length) && <div className="stack-s">
        <p className="small">{[right.length && `${right.length} confirmed`, toFix.length && `${toFix.length} to fix`, later.length && `${later.length} left for later`].filter(Boolean).join(" · ")}</p>
        <button className={`btn ${sending ? "busy" : ""}`} disabled={sending || (needReason && !reason.trim())} onClick={send}>{toFix.length ? "Send these decisions" : `Confirm these ${right.length}`}</button>
        {needReason && !reason.trim() && <p className="tiny muted">Say what the pro should fix in the box below first.</p>}</div>}
      {result && <p className="note small">Done: {result.confirmed.length} confirmed{result.toFix.length ? `, ${result.toFix.length} sent back to fix` : ""}{result.waiting.length ? `, ${result.waiting.length} still waiting for you` : ""}.</p>}
      {refused && <div className="note bad small"><b>Not confirmed.</b> {refused.failed.length ? "These conditions didn't pass, so confirming isn't enough:" : refused.message}
        {refused.failed.length > 0 && <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>{refused.failed.map((c) => <li key={c.id}>{c.what || c.id}{c.reason ? `: ${c.reason}` : ""}</li>)}</ul>}
        <p className="tiny" style={{ marginTop: 6 }}>Ask the pro for a fix below, or release anyway naming them.</p></div>}
      {(failed.length > 0 || refused?.failed?.length > 0) && <ReleaseAnyway j={j} busy={busy} act={act} base={base} mid={mid} due={due} failed={refused?.failed?.length ? refused.failed : failed} />}
    </div>
  );
}
function ReleaseAnyway({ j, busy, act, base, mid, due, failed }) {
  const list = failed || failedChecks(j);
  const go = async () => {
    if (!(await askConfirm({ title: `Release ${m(due)} anyway?`, body: [list.length ? `${list.length} condition${list.length === 1 ? "" : "s"} didn't pass: ${list.map((c) => c.what || c.id).join("; ")}.` : "Not every condition was confirmed.", `PayPal captures ${m(due)} from the hold now and the pro is paid (minus the 10% fee). You can't take this back with a fix request; only a dispute or warranty claim.`], ok: `Release ${m(due)}`, cancel: "Keep it held", danger: true }))) return;
    act("rel", `${base}/release`, { ...(mid || {}), ...(list.length ? { acknowledgeFailed: list.map((c) => c.id) } : {}) });
  };
  return <div><B busy={busy} k="rel" className="sm" onClick={go}>Release {m(due)} anyway</B></div>;
}

// a background look found something new: say so, and bring the next step into view when it needs the person
function useChangeNotice(j) {
  const { toast } = useMe();
  const [prev, setPrev] = useState(null);
  useEffect(() => {
    if (!j) return;
    const now = { id: j.id, status: j.status, offers: (j.offers || []).length, hold: j.hold?.status };
    if (prev && prev.id === now.id) {
      if (now.offers > prev.offers && now.status === "offered") toast(`${now.offers - prev.offers} new offer${now.offers - prev.offers === 1 ? "" : "s"}`);
      if (now.status !== prev.status || now.hold !== prev.hold) {
        const msg = { review: "The pro sent the work: your call", needs_fix: "Sent back to the pro to fix", working: "The pro started", passed: "Every condition passed", released: "Released: the pro is being paid", held: "Money held" }[now.status];
        if (msg) toast(msg);
        if (now.status === "review" || (now.status === "agreed" && now.hold === "pending_approval")) {
          const el = document.getElementById("decide"), r = el?.getBoundingClientRect();
          if (el && (r.top < 0 || r.top > innerHeight - 80)) el.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      }
    }
    if (!prev || prev.id !== now.id || prev.status !== now.status || prev.offers !== now.offers || prev.hold !== now.hold) setPrev(now);
  }, [j]);
}

const LEDGER_WORD = { materials_payout: "materials advance paid", materials_returned: "materials returned (off the release)", materials_unrecovered: "materials advance not recovered", parts_adjusted: "parts paid at the receipt", buffer_released: "unused hold released", platform_fee: "platform fee", paypal_fee: "PayPal's fee", pro_payout: "paid to the pro", helper_payout: "paid to the helper" };
const ADV_WORD = { checked: "checked, paying", paying: "paying", paid: "paid", awaiting_customer: "waiting for you", needs_fix: "the pro must send more", rejected: "refused by the checks", declined: "declined", failed: "payment failed" };

// a materials advance on an approved change order: the pro is paid for materials now, out of the held money
function MaterialsAdvance({ c, j, busy, act, base }) {
  const a = c.advance, [note, setNote] = useState("");
  if (!a) return c.kind === "materials" && c.status === "approved" ? <p className="tiny muted">Materials: the pro may ask to be paid for them now (a materials advance), with the invoice and a photo on site.</p> : null;
  const inv = a.check?.invoice;
  const approve = async () => { if (await askConfirm({ title: `Pay ${m(a.amount)} for materials now?`, body: [`PayPal captures ${m(a.amount)} from your hold and pays it to ${a.supplier ? `the supplier (${a.supplier})` : j.agreed?.proName || "the pro"} now.`, "It comes off what the pro is paid at the end, so the total you pay doesn't change."], ok: `Pay ${m(a.amount)} now`, cancel: "Not yet" })) act(`adv${c.id}`, `${base}/changes/${c.id}/advance/approve`); };
  return (
    <div className="note small stack-s">
      <p><b>Materials advance: {m(a.amount)}</b> · <span className={`badge ${a.status === "paid" ? "good" : ["rejected", "failed", "declined"].includes(a.status) ? "bad" : "warn"}`}>{ADV_WORD[a.status] || a.status}</span>{a.supplier && <span className="tiny muted"> · to the supplier {a.supplier}</span>}</p>
      {inv && <p className="tiny ink2">Invoice read by code: {[inv.store, inv.total != null ? usd(inv.total) : null, inv.date].filter(Boolean).join(" · ")}{inv.readBy ? ` (${inv.readBy})` : ""}</p>}
      {(a.check?.reasons || []).length > 0 && <ul className="tiny ink2" style={{ margin: 0, paddingLeft: 18 }}>{a.check.reasons.map((r, i) => <li key={i}>{String(r).replace(/\bev_[0-9a-f]{6,}\b/g, "a photo")}</li>)}</ul>}
      {a.status === "paid" && <p className="tiny muted">Paid out of your hold; it's taken off the pro's final payment, and anything returned unused comes off too.</p>}
      {a.status === "awaiting_customer" && <>
        <p className="tiny">Needs {a.needs || "you"}.</p>
        <div className="row"><B busy={busy} k={`adv${c.id}`} className="accent sm" onClick={approve}>Pay {m(a.amount)} for materials now</B></div>
        <div className="row"><input className="input sm" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Why not (optional)" aria-label="Why you decline" style={{ maxWidth: 260 }} /><B busy={busy} k={`advno${c.id}`} className="sm" onClick={() => act(`advno${c.id}`, `${base}/changes/${c.id}/advance/decline`, { note: note || "Not now" })}>Decline</B></div>
      </>}
    </div>
  );
}
function AdvancedLine({ j }) {
  const paid = (j.changeOrders || []).filter((c) => c.advance?.status === "paid"), cents = paid.reduce((t, c) => t + (c.advance.amount?.cents || 0), 0);
  if (!cents) return null;
  return <p className="small ink2">Materials advanced to the pro: <b>{usd(cents)}</b>, captured from the hold when paid. It comes off the pro's payment at the end, so your total doesn't change.</p>;
}

// documents code writes from the job's records (no model): progress reports, the close-out package with lien waivers, daily log
function Reports({ j }) {
  const reps = j.reports || [], prog = reps.filter((r) => r.kind === "progress"), close = reps.find((r) => r.kind === "closeout") || (["released", "resolved"].includes(j.status) ? { kind: "closeout" } : null);
  const base = `/api/jobs/${j.id}/reports`, started = !["draft", "scoped", "offered", "agreed", "cancelled", "expired"].includes(j.status);
  if (!started) return null;
  return (
    <div className="panel stack-s">
      <div className="panel-h"><h3>Reports</h3><span className="src code">WRITTEN BY CODE FROM THE RECORDS</span></div>
      <ul className="spec">
        <li><span className="lead">Daily log</span><span className="val"><a href={`${base}/daily.html`} target="_blank" rel="noreferrer">open</a></span></li>
        <Weather url={`${base}/daily.json`} />
        <Insurance url={`/api/jobs/${j.id}/reports`} />
        {prog.map((r) => <li key={r.milestone}><span className="lead">Progress report{prog.length > 1 ? `, ${r.milestone}` : ""}</span><span className="val"><a href={r.url} target="_blank" rel="noreferrer">open</a></span></li>)}
        {close ? <li><span className="lead">Close-out package and Texas lien waivers</span><span className="val"><a href={`${base}/closeout.html`} target="_blank" rel="noreferrer">HTML</a> · <a href={`${base}/closeout.pdf`} target="_blank" rel="noreferrer">PDF</a></span></li>
          : <li><span className="lead">Close-out package</span><span className="val muted">when the last payment is made</span></li>}
      </ul>
      <Why><p>The money in them comes from the ledger, so it matches the payments. The lien waivers follow Tex. Prop. Code §53.284 (demo: check before real use).</p></Why>
    </div>
  );
}

// the weather on each day of the job, from the daily log (the US National Weather Service, no key)
function Weather({ url }) {
  const d = useApi(url).data, days = d?.days || [];
  if (!days.length) return null;
  return <li className="wx" style={{ display: "block" }}><span className="lead">Weather on site <span className="tiny muted">(US National Weather Service)</span></span>
    <ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>{days.map((x) => <li key={x.day} className="tiny">{day(`${x.day}T18:00:00Z`)}: {!x.weather ? <span className="muted">no observations recorded</span> : x.weather.error ? <span className="muted">not available ({x.weather.error})</span> : `${x.weather.says}${x.weather.stationName ? ` · ${x.weather.stationName}` : ""}`}</li>)}</ul></li>;
}

// the tenant's side of a landlord's job: what's happening, notes for the landlord; money is the landlord's
function TenantPanel({ j, busy, act, info }) {
  const [note, setNote] = useState(""), base = `/api/jobs/${j.id}`;
  return (
    <div className="panel marks stack" id="decide">
      <h3>{j.status === "offered" ? "Offers in: your landlord decides" : ["released", "resolved"].includes(j.status) ? "Done and paid by your landlord" : "Your landlord is handling the money"}</h3>
      <p className="small ink2">{j.next || "Your landlord (or their agent) picks an offer, approves changes and pays. You can add notes and suggest an offer."}</p>
      {["held", "working", "needs_fix"].includes(j.status) && <NextUp j={j} info={info} />}
      {(j.tenancy?.notes || []).length > 0 && <ul className="small" style={{ margin: 0, paddingLeft: 18 }}>{j.tenancy.notes.map((n) => <li key={n.id}>{n.text} <span className="tiny muted">{when(n.at)}</span></li>)}</ul>}
      <label className="field"><span>A NOTE FOR YOUR LANDLORD</span><textarea className="input" rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="The leak is worse when the dishwasher runs. I'm home after 5 pm." /></label>
      <div><B busy={busy} k="tnote" className="sm" disabled={note.trim().length < 4 || !!busy} onClick={() => act("tnote", `${base}/tenant/note`, { text: note.trim() }, () => setNote(""))}>Send the note</B></div>
    </div>
  );
}

// a monthly maintenance plan (PayPal Subscriptions) from a paid job: each month's payment waits for that visit's proof
const PLAN_MONTH = { waiting_for_proof: "waiting for proof", needs_fix: "pro to send more", review: "staff review", paid: "proven · pro paid", refunded: "refunded to you" };
function MaintenancePlan({ j }) {
  const { toast } = useMe(), list = useApi(j.status === "released" ? "/api/plans" : null), [amt, setAmt] = useState(""), [setup, setSetup] = useState(""), [opt, setOpt] = useState({ every: 1, visits: 0, trial: false, taxPct: "", units: "", startOn: "", card: false });
  if (j.status !== "released") return null;
  const p = (list.data || []).find((x) => x.job === j.id && x.status !== "cancelled") || (list.data || []).find((x) => x.job === j.id);
  const start = async () => { try { const r = await api(`/api/jobs/${j.id}/plan`, { method: "POST", body: { ...(amt ? { amount: amt } : {}), ...(setup ? { setupFee: setup } : {}), every: +opt.every, visits: +opt.visits || 0, trial: opt.trial, ...(opt.taxPct ? { taxPct: +opt.taxPct } : {}), ...(opt.units ? { units: +opt.units } : {}), ...(opt.startOn ? { startOn: opt.startOn } : {}), ...(opt.card ? { payWith: "card" } : {}) } }); if (r.paypal?.approveUrl) location.href = r.paypal.approveUrl; else list.reload(); } catch (e) { toast(e.message, true); } };
  const go = async (path, ok) => { try { await api(`/api/plans/${p.id}/${path}`, { method: "POST", body: {} }); toast(ok); list.reload(); } catch (e) { toast(e.message, true); } };
  const cancel = async () => { if (!(await askConfirm({ title: `Cancel ${p.number}?`, body: "PayPal stops charging the plan. Months already charged still wait for their proof.", ok: "Cancel the plan", danger: true }))) return; try { await api(`/api/plans/${p.id}/cancel`, { method: "POST", body: {} }); list.reload(); } catch (e) { toast(e.message, true); } };
  return (
    <section className="panel stack-s" aria-labelledby="h-plan">
      <h3 id="h-plan">Monthly plan</h3>
      {!p || p.status === "cancelled" && !p.cycles.length ? <>
        <p className="small ink2">Have {j.agreed?.proName || "the pro"} come back every month with the same done-conditions. PayPal charges it monthly; each month is paid to the pro only when that visit is proven.</p>
        <div className="row"><input className="input" style={{ maxWidth: 120 }} inputMode="decimal" placeholder={m(j.agreed?.price)} value={amt} onChange={(e) => setAmt(e.target.value)} aria-label="Monthly amount" /><input className="input" style={{ maxWidth: 160 }} inputMode="decimal" placeholder="First-visit setup fee" value={setup} onChange={(e) => setSetup(e.target.value)} aria-label="One-time setup fee for the first visit (optional)" /><button className="btn sm" onClick={start}>Start with PayPal</button></div>
        <div className="row small" style={{ flexWrap: "wrap", gap: "var(--s2)" }}>
          <label>Every <select className="input sm" value={opt.every} onChange={(e) => setOpt({ ...opt, every: e.target.value })} aria-label="How often">{[[1, "month"], [3, "3 months"], [6, "6 months"], [12, "year"]].map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
          <label>Visits <input className="input sm" style={{ maxWidth: 70 }} inputMode="numeric" placeholder="until cancelled" value={opt.visits || ""} onChange={(e) => setOpt({ ...opt, visits: e.target.value })} aria-label="Number of visits (empty: until cancelled)" /></label>
          <label><input type="checkbox" checked={opt.trial} onChange={(e) => setOpt({ ...opt, trial: e.target.checked })} /> First visit free</label>
          <label>Tax % <input className="input sm" style={{ maxWidth: 60 }} inputMode="decimal" value={opt.taxPct} onChange={(e) => setOpt({ ...opt, taxPct: e.target.value })} aria-label="Sales tax percent" /></label>
          <label>Units <input className="input sm" style={{ maxWidth: 60 }} inputMode="numeric" placeholder="—" value={opt.units} onChange={(e) => setOpt({ ...opt, units: e.target.value })} aria-label="Priced per unit, e.g. AC units" /></label>
          <label>Start <input className="input sm" type="date" value={opt.startOn} onChange={(e) => setOpt({ ...opt, startOn: e.target.value })} aria-label="First charge on" /></label>
          <label><input type="checkbox" checked={opt.card} onChange={(e) => setOpt({ ...opt, card: e.target.checked })} /> Pay with the sandbox test card (no PayPal page)</label>
        </div>
        <p className="tiny muted">A setup fee is charged once when you approve, for the first visit's extra work, and held for that visit's proof like a month. After two failed months in a row PayPal pauses the plan itself.</p>
      </> : <>
        <p className="data">{p.number} · {m(p.amount)} {({ 3: "every 3 months", 6: "every 6 months", 12: "a year" })[p.every] || "a month"}{p.trial ? " (first visit free)" : ""} · {p.status.replace("_", " ")}{p.paypal?.nextBilling ? ` · next charge ${when(p.paypal.nextBilling)}` : ""}</p>
        {p.status === "pending_approval" && p.paypal?.approveUrl && <a className="btn sm" href={p.paypal.approveUrl}>Approve at PayPal</a>}
        {p.cycles.length > 0 && <ol className="tl">{p.cycles.map((c) => <li key={c.n}><time>{c.setup ? "Setup fee" : `Month ${c.n - (p.cycles.some((y) => y.setup && y.n < c.n) ? 1 : 0)}`}</time><span>{m(c.amount)} · <b>{PLAN_MONTH[c.status] || c.status}</b>{c.because ? <span className="tiny muted"> · {c.because}</span> : null}</span></li>)}</ol>}
        {p.lastFailed && <p className="tiny bad">PayPal's last failed charge: {m(p.lastFailed.amount)}{p.lastFailed.reason ? ` (${String(p.lastFailed.reason).replace(/_/g, " ").toLowerCase()})` : ""}{p.lastFailed.at ? `, ${when(p.lastFailed.at)}` : ""}</p>}
        {p.units > 0 && p.status === "active" && <div className="row small"><span>{p.units} unit{p.units === 1 ? "" : "s"}</span><button className="btn sm ghost" onClick={async () => { const u = prompt("How many units now?", String(p.units)); if (!u) return; try { const r = await api(`/api/plans/${p.id}/units`, { method: "POST", body: { units: +u } }); if (r.approveUrl) location.href = r.approveUrl; } catch (e) { toast(e.message, true); } }}>Change units (approve at PayPal)</button></div>}
        {p.paypal?.outstanding && <div className="note small stack-s"><span>PayPal couldn't charge {m(p.paypal.outstanding)} (the card declined). Charge it now? It's held for that month's visit like any other.</span><button className="btn sm" onClick={() => go("pay-outstanding", "PayPal charged the missed month.")}>Pay the missed month</button></div>}
        {p.priceChange && <div className="note small stack-s"><span>{p.proName} asks {m(p.priceChange.amount)} a month instead of {m(p.amount)}.</span><button className="btn sm" onClick={() => go("price/accept", "New price set at PayPal.")}>Accept the new price</button></div>}
        <div className="row">{p.status === "active" && <button className="btn ghost sm" onClick={() => go("pause", "Paused: PayPal won't charge it.")}>Pause</button>}
          {p.status === "paused" && <button className="btn sm" onClick={() => go("resume", "Resumed.")}>Resume</button>}
          {["pending_approval", "active", "paused"].includes(p.status) && <button className="btn ghost sm" onClick={cancel}>Cancel the plan</button>}</div>
      </>}
    </section>
  );
}

// a tip after a paid job: a separate PayPal payment, all of it to the pro (no platform fee)
function Tips({ j, busy, act, info }) {
  const [amt, setAmt] = useState(""), t = j.tips, paid = ["released", "resolved"].includes(j.status);
  if (!paid && !t) return null;
  const send = async (v) => { const d = dollars(v); if (!d) return; if (!(await askConfirm({ title: `Tip ${j.agreed?.proName || "the pro"} ${usd(Math.round(d * 100))}?`, body: [`A separate PayPal payment, captured now. All of it goes to the pro${j.agreed?.pro?.payoutMethod?.method === "venmo" ? " (to their Venmo)" : ""}; no platform fee.`], ok: "Send the tip", cancel: "Not now" }))) return; act("tip", `/api/jobs/${j.id}/tip`, { amount: d }, (r) => { setAmt(""); if (r?.approveUrl) window.location.assign(r.approveUrl); }); };
  return (
    <div className="panel stack-s">
      <h3>Tip the pro</h3>
      {paid && <><p className="small ink2">Optional. 100% goes to {j.agreed?.proName || "the pro"}, paid with PayPal Payouts; PayPal's fee is ours.</p>
        <div className="row" style={{ gap: 6 }}>{[5, 10, 20].map((v) => <B key={v} busy={busy} k="tip" className="sm" onClick={() => send(String(v))}>${v}</B>)}
          <span className="money-in" style={{ width: 90 }}><input className="input sm" inputMode="decimal" value={amt} onChange={(e) => setAmt(e.target.value)} aria-label="Another amount" placeholder="other" /></span><B busy={busy} k="tip" className="sm" disabled={!dollars(amt) || !!busy} onClick={() => send(amt)}>Tip</B></div></>}
      {t?.items?.length > 0 && <ul className="spec">{t.items.map((x) => <li key={x.id}><span className="lead">{when(x.at)}</span><span className="val">{m(x.amount)} · {({ paid: "paid to the pro", captured: "captured, paying the pro", pending_approval: "waiting for your PayPal approval", starting: "starting", payout_failed: "captured; the payout failed", failed: "failed" })[x.status] || x.status}{x.payout?.venmoFallback ? ` · ${x.payout.venmoFallback.says}` : x.payout?.via === "venmo" ? " · to Venmo" : ""}{x.status === "pending_approval" && x.approveUrl ? <> · <a href={x.approveUrl}>approve</a></> : ""}</span></li>)}</ul>}
    </div>
  );
}

// the insurance claim package, for water-damage and leak jobs (written by code; not a filing)
function Insurance({ url }) {
  const d = useApi(url).data, ins = d?.available?.insurance;
  if (!ins) return null;
  const h = ins.html || ins[0] || `${url}/insurance.html`, p = ins.pdf || ins[1] || `${url}/insurance.pdf`;
  return <li style={{ display: "block" }}><span className="lead">Insurance claim package</span> <span className="val"><a href={h} target="_blank" rel="noreferrer">HTML</a> · <a href={p} target="_blank" rel="noreferrer">PDF</a></span>
    <p className="tiny muted" style={{ margin: "4px 0 0" }}>Prepared from the job's records by code (no model); not an insurance claim filing. You file the claim with your insurer.</p></li>;
}
