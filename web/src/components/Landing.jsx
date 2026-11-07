// The signed-out home page: what VeriPay does in one picture (the money waits while the proof is checked), the live
// Austin map, and one real job's money from ask to payout. Photos: Wikimedia Commons (credits on /credits).
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { Link } from "../api.jsx";
import Icon from "./Icon.jsx";
import { useInView, drawLine, inTurn, countUp } from "./motion.js";
// the live map (Leaflet) loads after the page text: the first paint doesn't wait for it
const LiveCity = lazy(() => import("./LiveCity.jsx"));
import "./landing.css";

const reduced = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
const CHECKS = [
  ["Faucet runs, no drip", "photo model"],
  ["Taken at the job, 2:14 pm", "time and place"],
  ["Receipt $47.05 matches the change", "receipt reader"],
];

// the hero: a pro's proof photo being checked, then PayPal's hold turning into a payout
function Proof() {
  const [step, setStep] = useState(reduced() ? 5 : 0);
  useEffect(() => {
    if (reduced()) return;
    const t = setInterval(() => setStep((s) => (s + 1) % 8), 1100);
    return () => clearInterval(t);
  }, []);
  const paid = step >= 4;
  return (
    <figure className="proof" aria-label="A proof photo checked and the pro paid">
      <img src="/lp/proof-faucet.jpg" alt="The new faucet running into the sink" width="640" height="480" />
      <div className="scan" data-on={step > 0 && step < 4} aria-hidden="true" />
      <ul className="checks">
        {CHECKS.map(([t, by], i) => <li key={t} className={step > i ? "ok" : ""}><span className="tick" aria-hidden="true" /><b>{t}</b><small>{by}</small></li>)}
      </ul>
      <div className={`lp-money ${paid ? "paid" : ""}`}>
        <div className="m-row"><span>PayPal is holding</span><b>$247.05</b></div>
        <div className="m-bar"><i style={{ transform: `scaleX(${paid ? 0.94 : 1})` }} /></div>
        <div className="m-row out"><span>{paid ? "Pro paid · $15.00 back to Maria" : "Waiting for the proof"}</span><b>{paid ? "$232.05" : "—"}</b></div>
      </div>
      {paid && <div className="lp-paid" aria-hidden="true"><i />Paid to the pro</div>}
    </figure>
  );
}

const PATH = [
  { amt: "Budget $200", t: "Maria asks", d: "“Kitchen faucet drips. Fix it this week, under $200.”", img: "/lp/before-faucet.jpg", held: "—", owed: "—" },
  { amt: "Agreed $185", t: "Her agent hires", d: "Five pros' agents bid. PayPal holds her $200 budget, not charged.", held: "$200.00", owed: "$185.00" },
  { amt: "$185 + $47.05", t: "Scope grows, PIN required", d: "A $47.05 valve is over her agent's limit. Maria approves with her PIN and PayPal re-holds $200 + $47.05 on her saved card.", img: "/lp/receipt.jpg", held: "$247.05", owed: "$232.05" },
  { amt: "All pass", t: "AI checks the proof", d: "Vision and receipt models read the photos; code checks time and place. No money moves until every check passes.", img: "/lp/proof-faucet.jpg", held: "$247.05", owed: "$232.05" },
  { amt: "$232.05", t: "Captured and paid", d: "PayPal captures exactly $232.05, Payouts pays the pro, and the unused $15.00 of the hold is released.", paid: true, held: "$232.05", owed: "$15.00" },
];

// the same job two ways: today (the money moves first and everyone hopes) and with VeriPay (the money waits for the proof)
const TODAY = [
  ["chat", "Call five pros", "Explain the leak five times"],
  ["pay", "Pay a deposit", "Before anyone has looked"],
  ["clock", "Hope", "No record of what \"done\" means"],
  ["flag", "Argue", "Over whether it's really fixed"],
  ["clock", "Chase", "The pro waits weeks for the rest"],
];
const VERIPAY = [
  ["chat", "Say it once", "One sentence becomes the work order"],
  ["agent", "Agents agree", "Price and time, inside your limit"],
  ["lock", "PayPal holds", "Authorized, not charged"],
  ["camera", "Proof is checked", "Photos and receipt, condition by condition"],
  ["pay", "Pro is paid", "The moment every check passes"],
];
function Compare() {
  const ref = useRef(null);
  useInView(ref, (el) => {
    inTurn(el.querySelectorAll(".cmp-today .cmp-step"), { gap: 90 });
    drawLine(el.querySelector(".cmp-vp .cmp-line path"), { delay: 500, duration: 1500 });
    inTurn(el.querySelectorAll(".cmp-vp .cmp-step"), { delay: 650, gap: 260 });
  });
  const row = (steps, cls, label, foot) => (
    <div className={`cmp-row ${cls}`}>
      <h3>{label}</h3>
      <div className="cmp-track">
        <svg className="cmp-line" viewBox="0 0 1000 4" preserveAspectRatio="none" aria-hidden="true"><path d="M2 2 H998" /></svg>
        <ol>{steps.map(([ic, t, d], i) => <li key={t} className={`cmp-step ${i === steps.length - 1 ? "last" : ""}`}><span className="cmp-ic"><Icon name={ic} size={22} stroke={1.9} /></span><b>{t}</b><small>{d}</small></li>)}</ol>
      </div>
      {foot}
    </div>);
  return (
    <section className="compare" aria-label="The same job, today and with VeriPay" ref={ref}>
      <h2>The same faucet, two ways</h2>
      {row(TODAY, "cmp-today", "Today: the money moves first", <p className="lp-src">A median <b>$1,800</b> lost to a home-improvement scam in the US (<a href="https://keyt.com/stacker-crime-safety/2026/08/14/home-improvement-scams-are-heating-up-this-summer/" target="_blank" rel="noreferrer">Better Business Bureau, 2024</a>); <b>59%</b> of small businesses wait 30+ days on invoices (<a href="https://quickbooks.intuit.com/r/small-business-data/small-business-late-payments-report-2026/" target="_blank" rel="noreferrer">QuickBooks 2026</a>).</p>)}
      {row(VERIPAY, "cmp-vp", "With VeriPay: the money waits for the proof", null)}
    </section>
  );
}

export default function Landing({ tryIt, busy, reload, toast }) {
  const pathRef = useRef(null);
  useInView(pathRef, (el) => {
    drawLine(el.querySelector(".path-line path"), { duration: 1800 });
    inTurn(el.querySelectorAll("ol > li"), { gap: 220 });
    el.querySelectorAll(".ledger dd").forEach((dd, i) => countUp(dd, { delay: 300 + Math.floor(i / 2) * 220 }));
  });
  return (
    <div className="home">
      <section className="lp-hero">
        <div className="lp-hero-t">
          <h1>The money waits <span>for the proof.</span></h1>
          <p>Tell one agent what needs fixing. PayPal holds the money, VeriPay checks the finished work, and the pro is paid the moment it passes.</p>
          <div className="lp-hero-cta">
            <button className={`btn accent xl ${busy ? "busy" : ""}`} disabled={busy} onClick={tryIt}>Try it as a customer</button>
            <Link to="/signin">Create an account</Link>
          </div>
        </div>
        <Proof />
      </section>

      <Compare />

      <Suspense fallback={<div className="skel" style={{ height: 420 }} aria-busy="true" />}><LiveCity reload={reload} toast={toast} /></Suspense>

      <section className="path" aria-label="One job, from ask to payout" ref={pathRef}>
        <h2>One faucet, every dollar accounted for</h2>
        <svg className="path-line" viewBox="0 0 1000 4" preserveAspectRatio="none" aria-hidden="true"><path d="M2 2 H998" /></svg>
        <ol>
          {PATH.map((p) => (
            <li key={p.t} className={p.paid ? "is-paid" : ""}>
              <span className="amt">{p.amt}</span>
              {p.img ? <img src={p.img} alt="" /> : <div className={`ph ${p.paid ? "ph-paid" : "ph-hold"}`} aria-hidden="true"><span className="ph-ic" />{p.paid ? "Paid" : "Held"}</div>}
              <dl className="ledger"><div><dt>{p.paid ? "Captured" : "PayPal holds"}</dt><dd>{p.held}</dd></div><div><dt>{p.paid ? "Released" : "Owed"}</dt><dd>{p.owed}</dd></div></dl>
              <b>{p.t}</b><p>{p.d}</p>
            </li>))}
        </ol>
      </section>

      <section className="any" aria-label="Any job a photo can prove">
        <h2>Any job a photo can prove</h2>
        <div className="any-row">
          {[["/lp/tv.jpg", "TV mounted, level"], ["/lp/paint.jpg", "Wall patched and painted"], ["/lp/heater.jpg", "Water heater replaced"]].map(([src, t]) => (
            <figure key={t}><img src={src} alt={t} /><figcaption>{t}</figcaption></figure>))}
        </div>
      </section>

      <section className="story" aria-label="Try VeriPay">
        <div className="story-t">
          <h2>Trust shouldn't take a phone call.</h2>
          <p>The photo is the evidence, code is the referee, and the second the work passes, the pro is paid.</p>
          <button className={`btn xl story-cta ${busy ? "busy" : ""}`} disabled={busy} onClick={tryIt}>Try it as a customer</button>
        </div>
        <div className="story-stamp" aria-hidden="true"><span className="big-paid">Paid</span><small>$232.05 to the pro · $15.00 released</small></div>
      </section>

    </div>
  );
}
