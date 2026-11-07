// The judge tour: about three minutes, one faucet job from a sentence to the PayPal payout, on the server's own tour
// routes (POST /api/demo/tour, one step at a time). Each step says what happens and why it matters, a button runs it,
// and the job page underneath shows the result. The pro's side is played by the hired demo pro's agent (run by us,
// labelled); the visitor's agent is the demo agent (rules). Kept in localStorage "done.tour".
import { useEffect, useState } from "react";
import { api, navigate, usePath, refresh, m, usd } from "../api.jsx";
import { useMe } from "../App.jsx";
import { showPinOnce } from "./Pin.jsx";

const KEY = "done.tour";
// v2 added the mandates step: a tour saved with the old step numbers starts over
const load = () => { try { const x = JSON.parse(localStorage.getItem(KEY) || "null"); return x && x.v === 2 ? x : null; } catch { return null; } };
const keep = (s) => { try { localStorage.setItem(KEY, JSON.stringify({ ...s, v: 2 })); } catch {} };
// a tour in progress (step past the welcome, not finished): the demo panel offers to resume it on phones
export function tourProgress() { const x = load(); return x && !x.done ? x.step || 0 : 0; }
export function resumeTour() { keep({ ...(load() || { step: 0 }), open: true, dismissed: false }); dispatchEvent(new Event("done:tour")); }
export function startTour() { keep({ step: 0, open: true }); dispatchEvent(new Event("done:tour")); }

const IDS = ["welcome", "offers", "hold", "work", "change", "mandates", "evidence", "decide", "paid", "office"];

// after the check: paid by itself, or the customer's call (and why: a failed check, or photos a person must confirm)
// one line per step, at most 20 words: the step's own `one`, else its first sentence, cut at 20 words
function oneLine(st) {
  const src = st.one || String(st.b || "").split(/(?<=[.!?])\s/)[0] || "";
  const w = src.split(/\s+/);
  return w.length <= 20 ? src : `${w.slice(0, 20).join(" ")}…`;
}
function decideStep(j, s, set, step) {
  if (s.outcome === "released" || j?.status === "released") return { t: "Every condition passed: paid",
    one: j?.tour?.ai?.autoReleased ? "Every check passed, so code released the money by itself: nobody pressed a button." : undefined,
    b: `${j?.tour?.ai?.says ? `${j.tour.ai.says} ` : "The rules released it with no one pressing a button: "}${m(j?.money?.captured)} captured and paid in one Payouts batch.`, w: "Code decided, over the checker's verdicts.", go: ["See the money", async () => set({ step: 8 })] };
  const cs = j?.lastCheck?.checks || [], failed = cs.filter((c) => c.verdict === "fail"), reused = failed.filter((c) => c.signals.some((x) => /reused/.test(x)));
  if (reused.length) return { t: "The check caught reused photos",
    b: `${reused.length} photo condition${reused.length > 1 ? "s" : ""} failed: the same pictures were sent with an earlier job (the demo pro sends the same demo photos on every tour run, and the reuse check compares every photo ever sent). A failed condition means the rules won't pay; it's the customer's call.`,
    w: "This is the fraud check working: a pro can't reuse last week's photos. On a first run the photos are new and only need a person (or a model) to confirm what they show. Release as the customer to finish the tour, or open a dispute on the job page.",
    go: ["Release it as the customer", step("release", 8)] };
  return { t: failed.length ? "A condition failed: the customer decides" : "A person confirms the photos",
    b: failed.length ? `${failed.map((c) => c.id).join(", ")} failed (see the reason under each). The rules won't release money over a failed condition.` : "Look at the stamps: the code checks passed (time, place, reuse, receipt), but no model verdict came back on what the photos and the note show, so they read “Code passed · a person confirms”. The rules never release money on what nobody judged: it's the customer's call.",
    w: "That is the fail-safe: no model verdict, no automatic release. With a fast model serving, these would be model verdicts with reasons, and a clean job pays itself.",
    go: ["Release it as the customer", step("release", 8)] };
}

export default function Tour() {
  const { info, reload, toast, me } = useMe(), path = usePath();
  const [s, setS] = useState(() => load() || { step: 0, open: false, first: true }), [busy, setBusy] = useState(false), [j, setJ] = useState(null), [more, setMore] = useState(false), _dock = useEffect(() => { const on = !!s.open && !s.done; document.body.classList.toggle("tour-open", on); return () => document.body.classList.remove("tour-open"); }, [s.open, s.done]), [stepErr, setStepErr] = useState(null);
  // phones: on the pro thread too, the tour is the slim bar under the header, never a sheet over the composer
  const [phone, setPhone] = useState(() => typeof matchMedia !== "undefined" && matchMedia("(max-width: 720px)").matches);
  useEffect(() => { const q = matchMedia("(max-width: 720px)"), f = () => setPhone(q.matches); q.addEventListener("change", f); return () => q.removeEventListener("change", f); }, []);
  const set = (patch) => setS((x) => { const n = { ...x, ...patch }; keep(n); return n; });
  useEffect(() => { const f = () => setS(load()); addEventListener("done:tour", f); return () => removeEventListener("done:tour", f); }, []);
  // a first visit opens the tour once (judges land on the home page)
  useEffect(() => { if (s.first && info?.demoSignin && path === "/" && innerWidth >= 720) set({ open: true, first: false }); }, [info]);
  // a tour left over from an earlier visit (another session or a reset server) starts again
  useEffect(() => {
    if (!s.job || j || me === undefined) return;
    if (me === null || me.person.role !== "customer") { if (me === null) set({ step: 0, job: null, outcome: null, open: false }); return; }
    api(`/api/jobs/${s.job}`).then((x) => setJ((old) => ({ ...x, tour: old?.tour }))).catch((e) => { if (e.status === 404) set({ step: 0, job: null, outcome: null }); });
  }, [s.job, me]);

  if (!info?.demoSignin || s.done || !s.open && s.dismissed) return null;
  const id = IDS[Math.min(s.step || 0, IDS.length - 1)], n = s.step || 0;
  const step = (name, next, extra = () => ({})) => async () => {
    if (busy) return;
    setBusy(true); setStepErr(null);
    try {
      const r = await api("/api/demo/tour", { method: "POST", body: { step: name, job: s.job } });
      setJ(r); set({ step: next, job: r.id, ...extra(r) });
      if (r?.tour?.pinOnce) await showPinOnce(r.tour.pinOnce);
      if (name === "start") await reload();
      // on the agent page the tour's steps arrive in the conversation: stay there
      if (path !== "/" && !path.startsWith(`/jobs/${r.id}`)) navigate(`/jobs/${r.id}`);
      refresh();
    } catch (e) {
      if (/Start the tour|No such tour job/.test(e.message)) { toast(`${e.message} Starting the tour over.`, true); set({ step: 0, job: null, outcome: null }); setJ(null); }
      else {
        // the demo pro's agent works by itself: if the job already moved past this step, catch up instead of failing
        const now = s.job ? await api(`/api/jobs/${s.job}`).catch(() => null) : null, at = { start_work: ["working", "submitted", "checking", "review", "needs_fix", "passed", "released"], change: ["working"], evidence: ["submitted", "checking", "review", "needs_fix", "passed", "released"] }[name] || [];
        if (now && at.includes(now.status) && !(name === "change" && (now.changeOrders || []).length === 0)) { setJ(now); set({ step: next, job: now.id }); toast("The demo pro had already done this step by itself; the tour moves on."); refresh(); }
        else if (e.status >= 400 && e.status < 500) setStepErr({ name, next, message: e.message, failed: e.body?.failed || [] });
        else toast(`${e.message} Try again in a moment; if it keeps failing, the server may be busy.`, true);
      }
    }
    setBusy(false);
  };
  // the job page's "Release anyway": name every condition that didn't pass (the person's PIN may be asked)
  const releaseAnyway = async () => {
    setBusy(true);
    try {
      const job = await api(`/api/jobs/${s.job}`), lc = job.lastCheck || (job.checks || []).at(-1);
      const ids = (stepErr?.failed?.length ? stepErr.failed.map((c) => c.id || c) : (lc?.checks || []).filter((c) => c.verdict !== "pass").map((c) => c.id));
      const ms = (job.milestones || []).find((x) => x.status === "review");
      const r = await api(`/api/jobs/${s.job}/release`, { method: "POST", body: { ...(ms ? { milestone: ms.id } : {}), acknowledgeFailed: ids } });
      setJ(r?.id ? r : await api(`/api/jobs/${s.job}`)); setStepErr(null); set({ step: 8, outcome: "released" }); refresh();
    } catch (e) { if (!e.cancelled) setStepErr({ ...stepErr, message: e.message }); }
    setBusy(false);
  };
  const real = info.paypal !== "mock", pp = real ? "PayPal sandbox" : "the PayPal stand-in";
  const accepted = j?.offers?.find((o) => o.status === "accepted");
  const tm = j?.tour?.mandates || j?.tourMandates || [];
  const co = j?.changeOrders?.at(-1), coAmt = co ? `+${m(co.amount)}` : "a change order", lim = me?.limits?.changeMax || "$75.00";
  const S = {
    welcome: { one: "One faucet job, end to end: work order, offers, a PayPal hold, a change, evidence, checks, payment.", t: "Judge tour: one job, about 3 minutes",
      b: "A customer types one sentence: “Kitchen faucet keeps dripping even when it's off. Fix it this week, $200 max.” You'll watch it become a work order, get quoted by five pros' agents, held with PayPal, changed, evidenced, checked and paid.",
      w: `${me?.person?.role === "customer" ? `It runs as you (${me.person.name.replace(/^Demo · /, "")}), on a new job. ` : ""}It uses a canned faucet job so you can see every step. Every step is the server's real code path against ${pp}.`,
      go: ["Start: write the work order", step("start", 1, () => ({ extra: null }))], skip: true },
    offers: { one: "Done wrote the work order and its done-conditions; five pros' agents quoted against it.", t: "The work order, and five offers",
      b: j ? `Done wrote ${j.scope.checks.length} done-conditions, each naming its evidence (${j.scope.source === "rules" ? "by the rules template; no model answered in time" : `by ${j.scope.source}`}). ${j.offers.length} pros' agents quoted, from ${m(j.offers.reduce((a, o) => (o.amount.cents < a.cents ? o.amount : a), j.offers[0]?.amount || { cents: 0 }))}.` : "The conditions are on the left; the offers below them.",
      w: "The conditions are the contract: the check later runs against these exact words, and the customer can edit them before anyone is hired.",
      go: ["Let the demo agent negotiate and hire for you", step("hire", 2)] },
    hold: { one: accepted ? `Hired at ${m(accepted.amount)}; PayPal holds ${m(j?.hold?.amount)}. Nothing is charged yet.` : "PayPal holds the price plus a buffer. Nothing is charged yet.", t: "Agreed, and the money is held",
      b: accepted ? `The demo agent acting for you (rules) countered once; ${accepted.pro?.name}'s agent met it at ${m(accepted.amount)}. ${j.tour?.hold || j.hold?.explain || `PayPal now holds ${m(j.hold?.amount)}. Nothing is charged.`}` : "PayPal now holds the price plus a buffer for change orders. Nothing is charged.",
      w: "Orders v2 with intent AUTHORIZE. The hold is guaranteed 3 days and reauthorized after that; it can never outlive 29 days. Its ids are in the PayPal panel.",
      go: ["The pro arrives and starts", step("start_work", 3)] },
    work: { one: "Under the sink the pro finds a corroded valve and asks for a change order.", t: "Something else is broken",
      b: "Under the sink the pro finds the shut-off valve corroded. Their agent asks for a change order for the new valve, with a photo.",
      w: `The customer set their agent's limit for change orders (${lim} here). Inside it the agent may approve alone; over it, only the person can, on the website.`,
      go: ["Send the change order", step("change", 4)] },
    change: { one: `The demo agent approves ${coAmt} within your ${lim} limit; the hold grows first if needed.`, t: "The demo agent decides for you",
      b: `The pro's agent asked for ${coAmt}${co?.text ? ` (“${co.text}”)` : ""}. ${co ? (co.agentMayApprove === false ? `That's over the ${lim} limit, so only you can approve it, on this page.` : `That's inside the ${lim} limit, so the demo agent acting for you (rules) approves it.`) : ""} If the buffer left can't cover it, a new, larger hold is placed first and the old one voided.`,
      w: `If the buffer left on the hold can't cover ${coAmt}, a new hold is placed first: the new price plus what's left of the buffer, and the old authorization is voided. Both ids stay on the page.`,
      go: ["Approve the change order", step("approve_change", 5)] },
    mandates: { one: tm.find((x) => x.step === "approve_change")?.outcome === "accepted" ? "Your agent approved it with a signed mandate. Now watch two misuses of mandates get refused." : "Your agent acts only with a mandate you signed. Watch two misuses get refused.", t: "Signed mandates: what your agent may do",
      b: [tm.find((x) => x.step === "approve_change")?.says, ...tm.filter((x) => x.step === "overspend").map((x) => `${x.outcome === "refused" ? "Refused" : "Unexpected"}: ${x.says}`)].filter(Boolean).join(" ") || "The tour's agent is mandate-only: before it moves money it must show a mandate you signed (what, up to how much, for which job, until when, once). Next it tries the same mandate again, and a mandate too small for the change.",
      w: "Like AP2's intent mandate: the server verifies the signature, the scope, the amount, the job, the expiry and that it's unused, and keeps each one in a signed receipt in the transparency log.",
      go: tm.some((x) => x.step === "overspend") ? ["Next: the pro sends the evidence", async () => set({ step: 6 })] : ["Try a replayed and an over-limit mandate", step("overspend", 5)] },
    evidence: { one: "Timed, located photos, a receipt and a note arrive; code checks each condition.", t: "The pro sends the evidence",
      b: "Photos of the old part, the new one and the dry sink, stamped by the pro's phone with the time and the job's address; the parts receipt (TOTAL $47.05); a note. Then the check runs, condition by condition.",
      w: "EXIF time and GPS against the job, reuse across every earlier job's photos, the receipt read on the CPU and compared with the change order, and text in the evidence treated as data.",
      go: ["Send it and run the check", step("evidence", 7, (r) => ({ outcome: r.status }))] },
    decide: decideStep(j, s, set, step),
    paid: { one: j?.money?.split ? `Captured ${m(j.money.captured)}; pro, helper and fee add up to the cent.` : "The capture, the split and the payout, to the cent.", t: "Paid, to the cent",
      b: j?.money?.split ? `Captured ${m(j.money.captured)}${j.hold?.amount ? ` of the ${m(j.hold.amount)} hold` : ""} (the rest released, never charged).${j.hold?.history?.some((x) => x.replaced) ? " The hold grew once: the change order didn't fit the buffer, so a new hold replaced the old one." : ""}${(() => { const ceil = j.scope?.priceCeiling?.cents, ch = (j.changeOrders || []).filter((c) => c.status === "approved").reduce((t, c) => t + (c.amount?.cents || 0), 0); return ceil && j.hold?.amount?.cents > ceil ? ` The hold is above the ${m(j.scope.priceCeiling)} ceiling because of the approved change order${ch ? ` (${usd(ch)})` : ""}: the ceiling caps the agreed price, and approved change orders are added on top.` : ""; })()}${j.hold?.explain ? ` PayPal's side: ${j.hold.explain}` : ""} ${m(j.money.split.pro)} to the pro${j.money.split.helper?.cents ? ` and ${m(j.money.split.helper)} to the helper` : ""}, ${m(j.money.split.fee)} platform fee. Payout batch ${j.money.payout?.batchId || "—"}.` : "The capture, the split and the payout batch are on the right.",
      w: "Pro + helper + fee + refund equals the capture exactly; PayPal's processing fee is the platform's cost. Each step is a signed receipt in a transparency log.",
      go: ["Next: who sees what", async () => set({ step: 9 })] },
    office: { one: "Staff see every hold, payout and dispute. You can look read-only, anonymised.", t: "The back office is for staff",
      b: "Staff see every job, the expert queue with its 4-hour SLA, holds that expire soonest, payouts, disputes, and reconcile the ledger against PayPal, on AG Grid. You're signed in as a customer, so you don't see it. Look at a read-only, anonymised copy, or sign in as Demo staff (your customer sign-in stays).",
      w: "Staff pages are never in a customer's menu. The seeded month of jobs is demo data, and every ledger adds up.",
      go: ["See it read-only (anonymised)", async () => { navigate("/demo/office"); }],
      fin: ["Finish the tour", async () => set({ done: true, open: false })],
      alt: ["Sign in as Demo staff", async () => { setBusy(true); try { await api("/api/auth/staff", { method: "POST", body: {} }); set({ done: true, open: false }); navigate("/office"); toast("Demo staff: the back office."); } catch (e) { toast(e.message, true); } setBusy(false); }] },
  };
  const st = S[id], total = IDS.length - 1;
  if (!s.open) return <button className="tour-tab" onClick={() => set({ open: true, dismissed: false })}>JUDGE TOUR {n ? `${String(n).padStart(2, "0")}/${String(total).padStart(2, "0")}` : ""}</button>;
  return (
    <aside className={`tour ${more ? "more" : ""} ${(path === "/" || (path === "/pro" && phone)) && !more ? "mini" : ""}`} aria-label="Judge tour">
      <div className="tour-head">
        <span className="data">{path === "/" && !more ? `Tour${n ? ` ${n}/${total}` : ""}${n ? ` · ${st.t}` : ""}` : `JUDGE TOUR${n ? ` · ${String(n).padStart(2, "0")}/${String(total).padStart(2, "0")}` : ""}`}</span>
        <span className="row" style={{ gap: 4 }}>
          <button className="tour-more" onClick={() => setMore(!more)} aria-expanded={more}>{more ? "Less" : "More"}</button>
          <button className="tour-x" onClick={() => set({ open: false })} aria-label="Minimise the tour" title="Minimise">–</button>
          <button className="tour-x" onClick={() => { set({ open: false, dismissed: true }); toast("Start the tour again from the Demo panel."); }} aria-label="Close the tour" title="Close">×</button>
        </span>
      </div>
      {n > 0 && <ol className="tour-ticks" aria-hidden="true">{Array.from({ length: total }, (_, i) => <li key={i} className={i + 1 < n ? "done" : i + 1 === n ? "now" : ""} />)}</ol>}
      <div className="tour-body" aria-live="polite">
        <h3>{st.t}</h3>
        <p>{more ? st.b : oneLine(st)}</p>
        {stepErr && <div className="note bad small stack-s" role="alert"><p><b>The server said no:</b> {stepErr.message}</p>
          {stepErr.name === "release" && <><p className="tiny">You can still release it as the customer, naming the conditions that didn't pass{stepErr.failed.length ? `: ${stepErr.failed.map((c) => c.what || c.id || c).join("; ")}` : ""}. That's the job page's "Release anyway".</p>
            <div><button className={`btn sm danger ${busy ? "busy" : ""}`} disabled={busy} onClick={releaseAnyway}>Release anyway</button></div></>}</div>}
        {more && <div className="tour-why"><span className="eyebrow">WHY IT MATTERS</span><p>{st.w}</p></div>}
      </div>
      <div className="tour-actions">
        {s.job && id !== "office" && id !== "welcome" && path !== "/" && !path.startsWith(`/jobs/${s.job}`) ? <button className="btn sm accent" onClick={() => navigate(`/jobs/${s.job}`)}>Back to the job →</button>
          : <button className={`btn sm accent ${busy ? "busy" : ""}`} disabled={busy} aria-busy={busy} onClick={st.go[1]} title={st.go[0]}>{busy ? <><span className="spin" aria-hidden="true" /> {path === "/" && !more ? "Working…" : "Working… (up to 20 s)"}</> : path === "/" && !more ? "Next ›" : st.go[0]}</button>}
        {st.alt && <button className="btn sm" disabled={busy} onClick={st.alt[1]}>{st.alt[0]}</button>}
        {st.fin && <button className="link small" onClick={st.fin[1]}>{st.fin[0]}</button>}
        {st.skip && <button className="link small" onClick={() => set({ open: false, dismissed: true })}>Not now</button>}
        {n > 0 && <button className="link small" disabled={busy} onClick={() => { set({ step: 0, job: null, outcome: null }); setJ(null); }}>Restart</button>}
      </div>
    </aside>
  );
}
