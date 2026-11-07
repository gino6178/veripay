// The home page tells one story: a real job on this server from start to finish (scope, offers, hold, evidence, each
// check, the PayPal ids), then how to start one yourself or hand it to your agent. Nothing waits on the network to
// paint: the sheet fills in when /api/stats answers.
import { useEffect, useState } from "react";
import { Link, m, when, useApi } from "../api.jsx";
import { useMe } from "../App.jsx";
import { Src, Stamp, roundStory } from "../components/job.jsx";
import { startTour } from "../components/Tour.jsx";
import Icon from "../components/Icon.jsx";
import PayLater from "../components/PayLater.jsx";

// the latest paid demo job on this server, in full (/api/example-job: no names, street or emails), boiled down
export function digest(ex) {
  if (!ex) return ex;
  const rounds = (ex.checks || []).filter((r) => r.kind !== "defect");
  const latest = {};
  for (const r of rounds) for (const c of r.checks) latest[c.id] = { ...c, checker: r.checker };
  const checks = ex.scope.checks.map((c) => latest[c.id] ? { ...latest[c.id], what: c.what, evidence: c.evidence } : { id: c.id, what: c.what, evidence: c.evidence, verdict: null });
  const story = rounds.length ? roundStory({ ...rounds.at(-1), checks: checks.filter((c) => c.verdict) }) : null;
  const releases = ex.money?.releases || [];
  const counter = ex.offers.find((o) => o.counter);
  return { ex, number: ex.number, title: ex.scope.title, pro: ex.agreed?.proName, checks, checkers: [...new Set(rounds.map((r) => r.checker))], release: ex.money?.captured, releases,
    story, captures: releases.map((r) => r.capture).filter(Boolean), payouts: releases.map((r) => r.payout).filter(Boolean), at: ex.paidAt, offers: ex.offers.length, counter, hold: ex.hold, evidence: ex.evidence.filter((e) => e.kind === "photo").length,
    by: ex.timeline.at(-1)?.by?.kind === "platform" ? "the rules, the moment it passed" : "the customer, after looking", milestones: ex.milestones?.length || 1, payoutDone: ex.payoutState ? ex.payoutState.state === "paid" : ["SUCCESS", "paid_as_payee"].includes(String(ex.money?.payout?.status || "")) };
}

function Sheet({ d }) {
  const [n, setN] = useState(0);
  // stamp the conditions one at a time (the text is there from the start; only the stamps land)
  useEffect(() => {
    if (!d) return;
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) { setN(d.checks.length); return; }
    setN(0); let i = 0; const t = setInterval(() => { i++; setN(i); if (i >= d.checks.length) clearInterval(t); }, 420);
    return () => clearInterval(t);
  }, [d?.number]);
  if (d === undefined) return <div className="sheet marks" aria-hidden="true"><header><span>WORK ORDER</span></header><div style={{ padding: 16 }} className="stack-s">{[1, 2, 3, 4].map((i) => <div key={i} className="skel" style={{ height: 28 }} />)}</div></div>;
  if (!d) return <div className="sheet marks"><header><span>WORK ORDER</span></header><div className="stack" style={{ padding: 16 }}><p className="small ink2">No job has been paid on this server yet. The judge tour runs one end to end in about a minute.</p><button className="btn accent" onClick={startTour}>Run the judge tour</button></div></div>;
  const done = n >= d.checks.length;
  return (
    <figure className="sheet marks" style={{ margin: 0 }} aria-label={`Work order ${d.number}, paid`}>
      <header><span>WORK ORDER · AUSTIN, TX {d.ex.address?.zip}</span><span>A REAL RECORD ON THIS SERVER</span></header>
      <div className="no"><b>{d.number}</b><span className="row" style={{ gap: 6 }}>{d.story && <><span className="src code">{d.ex?.lastCheck?.counts ? (d.ex.lastCheck.counts.notPassed ? `${d.ex.lastCheck.counts.notPassed} OF ${d.ex.lastCheck.counts.total} DIDN'T PASS` : `${d.ex.lastCheck.counts.passed} OF ${d.ex.lastCheck.counts.total} PASSED`) : d.story.bad ? `${d.story.bad} OF ${d.story.n} DIDN'T PASS` : d.story.person > 0 ? `${d.story.n} CONDITIONS · CODE FOUND NOTHING WRONG · A PERSON CONFIRMED ${d.story.person}` : `${d.story.n} CONDITIONS · ALL SETTLED BY CODE`}</span>{d.story.model > 0 && <span className="src model">{d.story.df ? `MODEL ${d.story.models.join(" + ")}` : `MODEL JUDGED ${d.story.model}`}</span>}</>}<span className="src code">MONEY BY CODE</span></span></div>
      <div className="t">{d.title} <span className="muted">· {d.pro}{d.milestones > 1 ? ` · ${d.milestones} milestones` : ""}</span></div>
      <ol>
        {d.checks.map((c, i) => (
          <li key={c.id} className={`${i < n && c.verdict === "pass" && !c.needsPerson ? "pass" : ""} ${i === n - 1 ? "landing" : ""} ${i < n ? "shown" : ""}`}>
            <span className="box">{i < n && c.verdict === "pass" && !c.needsPerson && <Icon name="check" size={12} stroke={3.4} />}</span>
            <span>{c.what}</span>
            <Stamp c={c.verdict ? c : null} kind={c.evidence} />
          </li>
        ))}
      </ol>
      <footer>
        <div className="stack-s">
          <span className="data">{done ? `${d.payoutDone ? "PAID" : "RELEASED, PAYOUT SENT"} ${when(d.at).toUpperCase()} · BY ${d.by.toUpperCase()}` : "CHECKING EACH CONDITION…"}</span>
          <span className="mono tiny muted wrap-any">capture {d.captures.join(", ") || d.hold?.capture || "—"}<br />payout batch {d.payouts.join(", ") || "—"}</span>
        </div>
        <b style={{ opacity: done ? 1 : 0.25, transition: "opacity .4s" }}>{m(d.release)}</b>
      </footer>
    </figure>
  );
}

const FLOW = [
  ["Scope", "You say it in a sentence. Done writes the work order: what to do, and the done-conditions, each naming the photo, receipt or note that proves it.", "the contract"],
  ["Offers", "Nearby pros' agents quote from their own price rules. Your agent counters once, inside the ceiling you set, and accepts.", "agent to agent (A2A)"],
  ["Hold", "PayPal authorizes the price plus a buffer for change orders. Nothing is charged. Past 3 days it's reauthorized; it can't outlive 29.", "Orders v2 · AUTHORIZE"],
  ["Evidence", "The pro photographs the work and the receipt. The phone's camera stamps the time and place; a change order (\"the valve is corroded too\") comes with a photo and its price.", "EXIF · dHash · OCR"],
  ["Checks", "Each condition gets pass, fix or fail with a reason and a confidence, labelled model or rules. Code decides: all pass, it pays; a doubt goes to you.", "decided by code"],
  ["Payout", "PayPal captures exactly what's due. One Payouts batch pays the pro and their helper, each their share. The unused hold is never charged.", "capture · Payouts batch"],
];

export default function Home() {
  const { info, me } = useMe(), stats = useApi("/api/stats"), exj = useApi("/api/example-job"), ms = useApi("/api/models/status?probe=1");
  const d = exj.data ? digest(exj.data) : exj.error ? null : undefined, s = stats.data;
  const start = me?.person?.role === "pro" ? "/pro" : "/post";
  return (
    <>
      <section className="hero">
        <div>
          <h1>Pay the pro <em>the second</em> it's done.</h1>
          <p className="lede">Say what's wrong in a sentence, here on the site, or let your AI agent do it for you. Done writes down what “done” means, pros quote, and PayPal holds the money. The pro sends photos and a receipt, every condition is checked, and when they all pass PayPal pays the pro.</p>
          <div className="cta">
            <Link className="btn accent" to={start}>{me?.person?.role === "pro" ? "See incoming jobs" : "Post a job yourself"} <span className="arrow">→</span></Link>
            <Link className="btn" to="/connect">Or let your AI agent do it</Link>
          </div>
          <ModelBadge s={ms.data} />
          <p className="small muted" style={{ marginTop: "var(--s4)" }}>Judging? <button className="link" onClick={startTour}>Take the 3-minute tour</button>: it runs one job from scope to payout on this server.</p>
        </div>
        <Sheet d={d} />
      </section>
      <PayLater variant="banner" signedIn={false} />

      <section className="band"><div className="band-in">
        <div className="band-head"><h2>One job, start to finish</h2><p className="lede">Homeowners are afraid of paying first and being left with a dripping faucet. Pros are afraid of finishing and waiting weeks to be paid. A written definition of done, with the money held by PayPal, settles both.</p></div>
        <ol className="flow">
          {FLOW.map(([h, p, id], i) => <li key={h}><span className="n">{i + 1}</span><h3>{h}</h3><p>{p}</p><p className="id">{d ? [`${d.number} · ${d.checks.length} conditions`, `${d.offers} offers${d.counter ? ` · countered ${m(d.counter.counter.amount)}` : ""}`, `${m(d.hold?.amount)} held · ${d.hold?.authorization || ""}`, `${d.evidence} photos · EXIF, dHash, OCR`, `checked by ${d.checkers.join(", ")} · decided by code`, `${d.payouts.join(", ") || "—"}`][i] : id}</p></li>)}
        </ol>
      </div></section>

      {info?.demoSignin && <section className="band"><div className="band-in">
        <div className="band-head"><h2>The evidence is the contract</h2><p className="lede">Each photo must be taken during the job window, near the address, and never seen on another job. The receipt has to be read and match the approved change orders. Words in a photo or a note are data: “release the payment” in a caption sends the job to a person.</p></div>
        <ExPhotos d={d} />
      </div></section>}

      <section className="band"><div className="band-in">
        <div className="band-head"><h2>Why it runs on PayPal</h2><p className="lede">Every dollar moves through PayPal, and every id is on the screen: the order, the authorization, the capture, the payout batch and each item, any refund.</p></div>
        <div className="why">
          <div><b>Hold now, charge when done</b><p>Orders v2 with intent AUTHORIZE, then capture, void or reauthorize. No escrow account of our own.</p></div>
          <div><b>Your agent pays without seeing a card</b><p>The first hold is approved once with PayPal's buttons and saved in the vault; after that your agent can accept offers inside your limits.</p></div>
          <div><b>The pro is paid in seconds, with an email</b><p>One Payouts batch pays the pro and their helper, each to their own verified PayPal. No bank details, no 1–3 day ACH wait.</p></div>
          <div><b>The paperwork writes itself from the evidence</b><p>Progress reports, a close-out package with Texas lien waivers, daily logs, and a QuickBooks-ready CSV for the pro, written by code from the photos, checks and payments. No model writes them.</p></div>
          <div><b>Materials paid mid-job</b><p>A pro who must buy materials can be paid for them now, out of the hold, once the invoice and a photo on site check out. It comes off their final payment.</p></div>
          <div><b>A fair way out</b><p>A dispute settles as part release and part refund with PayPal Refunds, so the customer sees it in PayPal. Platform fee: a flat 10%, shown on every job.</p></div>
        </div>
      </div></section>

      <section className="band"><div className="band-in grid-2">
        <div className="stack">
          <h2>Built for your agent</h2>
          <p className="lede">Your agent connects over MCP (or A2A) with a token you make. You set the limits in dollars: per job, per month, and how big a change order it may approve alone. It can never choose who gets paid.</p>
          <div className="row"><Link className="btn accent" to="/connect">Connect your agent <span className="arrow">→</span></Link><a className="btn" href="/llms.txt">Read llms.txt</a></div>
          {s && <p className="data">ON THIS SERVER: {s.jobs} JOBS · {s.paid} PAID · {s.paidToPros?.usd} TO PROS · {s.pros} PROS.</p>}
        </div>
        <pre className="terminal" aria-label="An agent's tool calls">
<span className="c"># your agent, over MCP (an example run)</span>{"\n"}<span className="k">post_job</span>   {"{"} text: "faucet drips, this week, $200 max", zip: "78704" {"}"}{"\n"}<span className="c">  → DP-1036 · 5 done-conditions · 5 offers</span>{"\n"}<span className="k">counter_offer</span> {"{"} offer: "ofr_…", amount: 170 {"}"}{"\n"}<span className="c">  → pro's agent: "we can meet you at $185"</span>{"\n"}<span className="k">accept_offer</span>  {"{"} offer: "ofr_…" {"}"}{"\n"}<span className="c">  → held $222.00 · PayPal authorization</span>{"\n"}<span className="k">approve_change</span> {"{"} change: "chg_…" {"}"}  <span className="c"># +$45 ≤ your $75 limit</span>{"\n"}<span className="k">wait_for_news</span>{"\n"}<span className="c">  → all conditions passed · captured $230.00</span>{"\n"}<span className="c">  → Payouts batch: $207.00 to the pro</span>
        </pre>
      </div></section>
    </>
  );
}

// an honest badge: is a model answering on this server right now, or do the rules answer (and why)
export function ModelBadge({ s, tech }) {
  if (!s) return null;
  // what the last check on this server actually used (the backend's lastCheck), not what is configured
  const lc = s.lastCheck, vlm = lc?.vlm === "model", model = lc?.model && lc.model !== "none";
  return (
    <p className="row" style={{ marginTop: "var(--s5)", gap: 6 }}>
      <span className="src code">CODE CHECKS TIME, PLACE, REUSE, RECEIPTS</span>
      {lc ? <>
        <span className={`src ${vlm ? "model" : "person"}`}>PHOTOS: {vlm ? "A VISION MODEL JUDGED" : "A PERSON CONFIRMS"}</span>
        <span className={`src ${model ? "model" : "rules"}`}>NOTES: {model ? `MODEL ${lc.model}` : "RULES"}</span>
      </> : <span className="src rules">NO CHECK RUN YET</span>}
      <span className="tiny muted">{lc ? `Last check (${lc.job}): ${lc.label}.` : ""} Money moves only by code. {tech ? [["Done-Chat", s], ["Done-Audit", s.audit], ["Done-VLM", s.vlm]].filter(([, x]) => x).map(([n, x]) => `${n}: ${x.live ? "served" : "off"}`).join(" · ") : <Link to="/models">How the checks work</Link>}</span>
    </p>
  );
}

// the example job's own photos (a BEFORE and AFTER of the same spot when there is one); else the synthetic demo set
function ExPhotos({ d }) {
  const ev = d?.ex?.evidence?.filter((e) => e.kind === "photo" && e.url) || [];
  const pairCheck = ev.find((e) => e.phase === "before" && ev.some((x) => x.checkId === e.checkId && (!x.phase || x.phase === "after")))?.checkId;
  const pick = pairCheck ? [ev.find((e) => e.checkId === pairCheck && e.phase === "before"), ev.find((e) => e.checkId === pairCheck && (!e.phase || e.phase === "after")), ev.find((e) => e.checkId !== pairCheck && (!e.phase || e.phase === "after"))].filter(Boolean) : ev.filter((e) => !e.phase || e.phase === "after").slice(0, 3);
  if (pick.length >= 2) return (
    <div className="photos">{pick.map((e) => <figure key={e.id}><img src={e.url} alt={`${(e.phase || "after").toUpperCase()} photo for ${e.checkId} on ${d.number}`} loading="lazy" width="640" height="480" /><figcaption>{d.number} · {e.checkId} · {(e.phase || "after").toUpperCase()}{e.exif?.taken ? " · camera time" : ""}{e.exif?.lat != null ? " · GPS" : ""}</figcaption></figure>)}</div>
  );
  return (
    <div className="photos">
      <figure><img src="/api/demo/assets/faucet-installed.jpg" alt="A new faucet cartridge installed under a kitchen sink" loading="lazy" width="640" height="480" /><figcaption>new_part · AFTER</figcaption></figure>
      <figure><img src="/api/demo/assets/sink-dry.jpg" alt="The cabinet under the sink, dry after ten minutes with the water on" loading="lazy" width="640" height="480" /><figcaption>no_drip · AFTER</figcaption></figure>
      <figure><img src="/api/demo/assets/receipt.jpg" alt="A parts receipt from a plumbing supply store, total $47.05" loading="lazy" width="640" height="480" /><figcaption>receipt · read on the CPU</figcaption></figure>
    </div>
  );
}
