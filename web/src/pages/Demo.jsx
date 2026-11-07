// The demo page for judges: every feature already running on the demo server, shown large and one click away. "Open"
// signs this browser in as the demo person it belongs to (POST /api/demo/open) and goes to the page that shows it.
import { useRef, useState } from "react";
import { api, navigate, Link } from "../api.jsx";
import { useMe } from "../App.jsx";
import { startTour } from "../components/Tour.jsx";
import Icon from "../components/Icon.jsx";
import { useInView, drawLine, inTurn } from "../components/motion.js";
import "./demo.css";

// the person only confirms; their agent asks, negotiates with the pros' agents (A2A) and checks the proof, and PayPal
// holds the money until code says the work is done
const JOB = [
  { id: "ask", short: "Ask", icon: "chat", who: "Maria", url: "veripay / agent", t: "Say it; the agent asks back", d: "Maria says her faucet drips. Before posting anything, her agent asks for a photo and checks it, asks which room and what the pro should do, then shows her the request.", look: ["A photo, checked by code (size, camera time, not reused)", "Room and service, asked once", "One Post it"] },
  { id: "negotiate", short: "Negotiate", icon: "agent", who: "Maria", url: "veripay / agent / negotiation", t: "Her agent negotiates with the pros' agents", d: "Offers come in from pros nearby. Her agent counters the best one, the pro's agent answers (A2A), and Maria gets one button. Every step shows in a process card that updates itself.", look: ["Counter toward the typical price, never over her max", "The process, node by node, with who's on it", "One Confirm"] },
  { id: "held", short: "Hold", icon: "lock", who: "the customer", url: "veripay / jobs / hold", t: "Confirm: PayPal holds, not charged", d: "Her one Confirm hires the pro and PayPal authorizes the money. It waits there; nobody can spend it yet.", look: ["Money held, not charged", "What the pro has to prove", "The visit window"] },
  { id: "working", short: "Work", icon: "wrench", who: "the pro", url: "veripay / pro", phone: true, t: "The pro's phone", d: "Step by step: the before photo, the work, the receipt, a materials invoice scanned with the camera. In English or Spanish.", look: ["One photo prompt at a time", "Scan the invoice: code reads store, items, total", "EN / ES switch"] },
  { id: "extra", short: "Extra cost", icon: "receipt", who: "Maria", url: "veripay / agent / extra cost", t: "Extra cost: negotiated, then confirmed", d: "The pro finds a seized shut-off valve and asks +$120. Maria's agent negotiates it with the pro's agent; within her limit it approves it itself, over it she confirms with her PIN.", look: ["Asked vs. negotiated, side by side", "Her limit decides who confirms", "A scanned invoice, read and matched"] },
  { id: "needsfix", short: "Check", icon: "camera", who: "the customer", url: "veripay / jobs / checks", t: "The proof is checked", d: "Vision and receipt models read the photos; code checks the time and the place. A miss goes back to the pro.", look: ["A verdict for every condition", "Who decided: model, code or a person", "Signed verdict with a receipt"] },
  { id: "paid", short: "Paid", icon: "pay", who: "the customer", url: "veripay / jobs / paid", t: "Paid, with the paperwork", d: "PayPal captures the exact amount, Payouts pays the pro, and the unused hold is released.", look: ["Paid, captured and released, to the cent", "The PayPal Payouts batch", "Lien waiver, retainage and warranty"] },
  { id: "dispute", short: "Dispute", icon: "flag", who: "the customer", url: "veripay / jobs / dispute", t: "A dispute, settled", d: "When the two sides disagree, the evidence decides and each side's share is paid out.", look: ["The settled split", "Who got what, and why"] },
];
const MORE = [
  { id: "landlord", who: "the landlord", url: "veripay / tenancy", t: "Landlords and tenants", d: "Tenants post repairs; the landlord's agent hires within the landlord's limits.", look: ["Tenants and invites", "The landlord's own PayPal and PIN"] },
  { id: "groups", who: "a customer", url: "veripay / groups", t: "Neighbors book together", d: "One pro, several houses on the same street, one trip and a group discount.", look: ["10% off with 2 homes, up to 20%", "Each home keeps its own hold"] },
  { id: "home", who: "a customer", url: "veripay / home", t: "Home records", d: "Every repair on file, warranties tracked, appliances read off their rating plates.", look: ["Warranty reminders", "Claim a fix at no charge"] },
  { id: "earnings", who: "the pro", url: "veripay / pro / earnings", t: "Pro earnings", d: "Every payout, fee and tip from the job ledgers, by month, ready to export.", look: ["Net, fees and tips", "Download as CSV"] },
  { id: "connect", who: "a customer", url: "veripay / connect", t: "Bring any AI agent", d: "MCP, A2A or REST. Each agent gets its own limits, in dollars, that only the person can change.", look: ["Per-job and monthly limits", "Copy-paste MCP setup"] },
];
const LINKS = [
  ["office", "/demo/office", "Back office", "The operator's view of every job, hold and payout, in AG Grid."],
  ["models", "/models", "Our models", "Fine-tuned audit and chat models, with held-out results."],
  ["tests", "/live-test/", "How we tested it", "AI agents used VeriPay as customers, pros and attackers, round after round."],
];

function Frame({ id, url, phone }) {
  return phone
    ? <div className="dm-phone"><img src={`/shots/${id}.jpg`} alt="" /></div>
    : <div className="dm-browser"><div className="dm-bar" aria-hidden="true"><i /><i /><i /><span>{url}</span></div><img src={`/shots/${id}.jpg`} alt="" /></div>;
}
// the index: the job's steps as one line of stops (each jumps to its row), then the rest of the page
function Rail() {
  const ref = useRef(null);
  useInView(ref, (el) => { drawLine(el.querySelector(".dm-rail-line path"), { duration: 1300 }); inTurn(el.querySelectorAll(".dm-stop"), { gap: 90, delay: 150 }); });
  return (
    <nav className="dm-rail" aria-label="On this page" ref={ref}>
      <div className="dm-rail-job">
        <svg className="dm-rail-line" viewBox="0 0 1000 4" preserveAspectRatio="none" aria-hidden="true"><path d="M2 2 H998" /></svg>
        <ol>{JOB.map((f, i) => <li key={f.id} className="dm-stop"><a href={`#s-${f.id}`}><span className="dm-stop-ic"><Icon name={f.icon} size={20} stroke={1.9} /></span><small>{i + 1}</small>{f.short}</a></li>)}</ol>
      </div>
      <div className="dm-rail-more"><a href="#more">{MORE.length} features beyond one job <span aria-hidden="true">↓</span></a><a href="#hood">Under the hood <span aria-hidden="true">↓</span></a></div>
    </nav>);
}
function Look({ items }) {
  return <ul className="dm-look" aria-label="Look for">{items.map((x) => <li key={x}>{x}</li>)}</ul>;
}

export default function Demo() {
  const { reload, toast } = useMe();
  const [busy, setBusy] = useState(null);
  const open = async (feature) => {
    setBusy(feature);
    try { const r = await api("/api/demo/open", { method: "POST", body: { feature } }); await reload(); navigate(r.to); }
    catch (e) { toast(e.message, true); }
    setBusy(null);
  };
  const Open = ({ f }) => <button className={`btn accent ${busy === f.id ? "busy" : ""}`} disabled={!!busy} onClick={() => open(f.id)}>Open as {f.who} <span aria-hidden="true">→</span></button>;
  return (
    <div className="dm">
      <header className="dm-head">
        <div className="dm-head-in">
          <h1>Everything VeriPay does, already running.</h1>
          <p>The customer only confirms. Their agent asks, negotiates with the pros' agents and checks the proof; PayPal holds the money until the work passes. Open any step and you see it as the person it belongs to: no sign-up, no setup.</p>
          <div className="dm-cta">
            <button className="btn xl dm-tour" onClick={startTour}>Take the 3-minute tour</button>
            <a href="#job" className="dm-skip">Or browse the features ↓</a>
          </div>
        </div>
        <Rail />
      </header>

      <section id="job" className="dm-sec" aria-labelledby="dm-job">
        <h2 id="dm-job">One job, start to finish</h2>
        <ol className="dm-rows">
          {JOB.map((f, i) => (
            <li key={f.id} id={`s-${f.id}`} className={`dm-row ${f.phone ? "is-phone" : ""}`}>
              <div className="dm-copy">
                <span className="dm-step">Step {i + 1} of {JOB.length}</span>
                <h3>{f.t}</h3>
                <p>{f.d}</p>
                <Look items={f.look} />
                <Open f={f} />
              </div>
              <button className="dm-shot" onClick={() => open(f.id)} disabled={!!busy} aria-label={`Open ${f.t}`}><Frame {...f} /></button>
            </li>))}
        </ol>
      </section>

      <section id="more" className="dm-sec" aria-labelledby="dm-more">
        <h2 id="dm-more">Beyond one job</h2>
        <ul className="dm-cards">
          {MORE.map((f) => (
            <li key={f.id} className="dm-card">
              <button className="dm-shot" onClick={() => open(f.id)} disabled={!!busy} aria-label={`Open ${f.t}`}><Frame {...f} /></button>
              <h3>{f.t}</h3><p>{f.d}</p><Look items={f.look} /><Open f={f} />
            </li>))}
        </ul>
      </section>

      <section id="hood" className="dm-sec" aria-labelledby="dm-hood">
        <h2 id="dm-hood">Under the hood</h2>
        <ul className="dm-links">{LINKS.map(([id, to, t, d]) => {
          const inner = <><img src={`/shots/${id}.jpg`} alt="" /><span><b>{t} <span aria-hidden="true">→</span></b><small>{d}</small></span></>;
          return <li key={id}>{to.endsWith("/") ? <a href={to}>{inner}</a> : <Link to={to}>{inner}</Link>}</li>;
        })}</ul>
      </section>
    </div>
  );
}
