// Models: what each one does, what happens when it is missing, and the measured numbers (docs/MODELS.md, measured on
// 2026-11-04). Models give fields and verdicts with reasons; code rules decide money. Every number here is from a
// test set we wrote ourselves, and says so.
import { useApi } from "../api.jsx";
import { ModelBadge } from "./Home.jsx";

// [name, what it does, measured in one line, what it can and can't do with money]
const PARTS = [
  ["Done-Chat", "Turns one sentence into a work order (what to do, the done-conditions, the evidence each needs) and writes the agent's negotiation moves.", "Our model (Qwen3-0.6B, fine-tuned): every field right on 88.4% of 181 held-out requests; price ceiling 100%, date window 91.7%.", "Moves no money. The rules fix the price ceiling, the window and the checks; the model may only reword and add up to two conditions."],
  ["Scope review", "Flags done-conditions that are vague or can't be checked from a photo, receipt or note, and suggests a rewrite.", "Rules: caught 14 of 14 problem conditions, 0 false alarms on 10 fine ones (our own set of 24).", "Moves no money; the customer decides whether to apply a suggestion."],
  ["Done-Audit", "Reads the pro's notes and captions against each condition: pass, needs fix or fail, with a reason.", "Our model (Qwen3-0.6B, fine-tuned): 99.9% of checks right on 300 held-out orders; 0 of 262 hidden instructions changed a verdict. Test orders come from our own generator.", "Can't release on its own: code still checks time, place, reuse and receipts, and a photo also needs a vision verdict. A fail or no answer sends it to a person."],
  ["Done-VLM", "Looks at the photos: is the work done, is it the same spot as the BEFORE photo, is there text trying to instruct it.", "SmolVLM2-500M (open, Apache 2.0): describes each photo, then Done-Audit judges it. Named the right thing on 24 of 24 demo photos; made things up on 1.7% of 175 open photos.", "With no verdict, a photo condition always goes to a person. Its pass counts only at confidence 0.6 or more, same spot, no instructions in the photo."],
  ["Done-OCR", "Reads a parts receipt on the CPU: store, items, total, date.", "Held-out set: 27 of 30 totals exact; every total it was sure of (21 of 21) was right.", "Matches a receipt to a change order. An unsure read goes to a person; parts are paid at the receipt total when it's lower."],
  ["Done-Risk", "At hiring, estimates the chance of a dispute and of a cost overrun from the job's facts.", "Picks the riskier of two jobs about 78% of the time (made-up test jobs it never saw in training).", "Only sizes the buffer on the hold (10–40%, never over the ceiling). It never decides whether money moves."],
  ["Evidence signals", "Code, not a model: photo time and GPS against the job, a fingerprint of each photo to catch reuse from other jobs, missing or duplicate evidence, text that tries to give orders.", "Unit tests.", "Any red signal stops automatic release and sends the job to a fix or a person."],
];
// the held-out results (ml/RESULTS.md), drawn: each bar is the share right, the whisker its 95% Wilson interval
const MEASURED = [
  { model: "Done-Audit", what: "Verdicts right, held-out orders", k: 1032, n: 1033 },
  { model: "Done-Audit", what: "Verdicts right, attacks hidden in evidence", k: 525, n: 526 },
  { model: "Done-Chat", what: "Negotiation moves right (L4, served)", k: 120, n: 120 },
  { model: "Done-Chat", what: "Work orders with every field right", k: 160, n: 181 },
  { model: "Done-VLM", what: "Demo photos: named the right thing", k: 24, n: 24 },
  { model: "Done-OCR", what: "Receipt totals read to the cent, held out", k: 27, n: 30 },
];
const wilson = (k, n, z = 1.96) => { const p = k / n, d = 1 + z * z / n, c = (p + z * z / (2 * n)) / d, h = (z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n))) / d; return [Math.max(0, c - h), Math.min(1, c + h)]; };
const pct = (x) => `${(x * 100).toFixed(x >= 0.995 && x < 1 ? 1 : 0)}%`;
function Measured() {
  return (
    <section className="panel stack-s" aria-labelledby="h-meas">
      <div className="panel-h"><h2 id="h-meas" style={{ fontSize: "var(--fs-h3)" }}>How often each model is right</h2><span className="tiny muted">held-out sets, scored by code · whisker: 95% interval</span></div>
      <ul className="meas">
        {MEASURED.map((r) => { const p = r.k / r.n, [lo, hi] = wilson(r.k, r.n); return (
          <li key={r.what}>
            <span className="meas-l"><b>{r.model}</b><small>{r.what}</small></span>
            <span className="meas-bar" role="img" aria-label={`${pct(p)}, ${r.k} of ${r.n}; 95% interval ${pct(lo)} to ${pct(hi)}`}>
              <i className="fill" style={{ transform: `scaleX(${p})` }} />
              <i className="ci" style={{ left: `${lo * 100}%`, width: `${(hi - lo) * 100}%` }} />
            </span>
            <span className="meas-v"><b>{pct(p)}</b><small>{r.k.toLocaleString("en-US")}/{r.n.toLocaleString("en-US")}</small></span>
          </li>); })}
      </ul>
      <p className="tiny muted">The sets come from our own generators and photos; real jobs will read worse. Done-Risk is scored differently: it ranks the riskier of two jobs right 78% of the time (AUC 0.776 dispute, 0.780 overrun).</p>
    </section>
  );
}

// status reasons come from the server: keep them readable for a judge (no local URLs or setting names)
const plain = (r) => String(r || "").replace(/https?:\/\/\S+/g, "the model server").replace(/\b[A-Z][A-Z0-9]*_[A-Z0-9_]+\b/g, "its setting").replace(/\(?fetch failed\)?/g, "(no reply)").replace(/(?<!-)\bVLM\b/g, "vision model");

export default function Models() {
  const st = useApi("/api/models/status?probe=1"), s = st.data;
  return (
    <div className="stack-l">
      <div className="page-head"><div><h1>Models</h1><p className="lede">Models write wording and give verdicts with reasons and a confidence. Code decides money. Every result on the site says whether it came from a model or from the rules.</p></div>
        <div style={{ maxWidth: 520 }}>{s ? <ModelBadge s={s} tech /> : <div className="skel" style={{ height: 24, width: 260 }} />}</div>
      </div>

      <section className="panel marks stack-s plain-answer">
        <h2 style={{ fontSize: "var(--fs-h3)" }}>What decides each check, and what a model can never do</h2>
        <ol className="small" style={{ margin: 0, paddingLeft: 20, display: "grid", gap: 6 }}>
          <li><b>Code checks first:</b> the photo's time and place against the job, reuse of old photos, receipts against change orders. Only code moves money.</li>
          <li><b>A model may judge what a photo or note shows.</b> When none answers in time, a person confirms instead: you, or a VeriPay expert. Every check on the site says which one decided.</li>
          <li><b>A model can never</b> release money on its own, change the price or the done-conditions, or overrule a check that code failed.</li>
          <li><b>The risk model only sizes the buffer</b> on the PayPal hold; it never decides whether money moves.</li>
        </ol>
      </section>

      <Measured />

      <section className="stack">
        {s && <div className="scroll-x"><table className="table"><thead><tr><th>On this server now</th><th>Configured</th><th>Answering</th><th>Why</th><th>Last reply</th></tr></thead><tbody>
          {[["Done-Chat (scope, chat)", s], ["Done-Audit (evidence)", s.audit], ["Done-VLM (photos)", s.vlm]].filter(([, x]) => x).map(([n, x]) => <tr key={n}><td>{n}</td><td>{x.configured ? "yes" : "no"}</td><td className={x.live ? "ok" : "warn"}>{x.live ? "live" : "no: rules answer"}</td><td className="small ink2">{plain(x.reason) || "—"}</td><td className="small">{x.last ? `${x.last.source} · ${x.last.ms} ms` : "—"}</td></tr>)}
        </tbody></table></div>}
        <p className="note ok">The agent runs on our own small models, served from our GPU machine: Done-Chat writes the work order and negotiates, Done-VLM describes each photo, Done-Audit gives each condition its verdict, Done-OCR reads the receipt. Code still decides money. If a model doesn't answer in time, that check falls back to the rules and says so (RULES), and a photo then waits for a person instead of paying.</p>
        <div className="scroll-x"><table className="table">
          <thead><tr><th>Part</th><th>What it does</th><th>Measured</th><th>Money: what it can and can't do</th></tr></thead>
          <tbody>{PARTS.map(([n, d, x, f]) => <tr key={n}><td><b>{n}</b></td><td>{d}</td><td className="small">{x}</td><td className="ink2 small">{f}</td></tr>)}</tbody>
        </table></div>
      </section>

      <details className="stack">
        <summary>THE MEASUREMENTS: TEST SETS, ERROR RATES, 95% INTERVALS, AUC</summary>
        <p className="small ink2" style={{ marginTop: 10 }}>Done-Risk: AUC 0.776 (dispute) and 0.780 (overrun) on held-out synthetic jobs. The 36-case table compares the rules with a general 30-billion-parameter model we used before our own were trained (retired: 18.9 s a check). Our served models' numbers are in the table above.</p>
      <section className="grid-2">
        <div className="panel marks stack">
          <div className="panel-h"><h3>Done-Audit, 36 cases</h3><span className="tiny muted">36 cases we labelled by hand: 14 good, 22 not; 6 of them attacks</span></div>
          <div className="scroll-x"><table className="table">
            <thead><tr><th>Judge</th><th className="r">Right</th><th className="r">Bad cases it passed</th><th className="r">Attacks that got through</th><th className="r">Time</th></tr></thead>
            <tbody>
              <tr><td>Rules alone</td><td className="num r">14/36</td><td className="num r bad">19/22</td><td className="num r bad">5/6</td><td className="num r">&lt;1 ms</td></tr>
              <tr><td>Rules + safety net, as the app runs: whatever code can't prove goes to a person</td><td className="num r" title="It passes nothing by itself, so accuracy doesn't apply">n/a</td><td className="num r ok">0/22</td><td className="num r ok">0/6</td><td className="num r">&lt;1 ms</td></tr>
              <tr><td>General 30B model (retired)</td><td className="num r">25/36</td><td className="num r ok">0/22</td><td className="num r ok">0/6</td><td className="num r">18.9 s</td></tr>
            </tbody>
          </table></div>
          <p className="small ink2">Lower is better in the two middle columns: a "bad case passed" would have paid for work that wasn't right. 95% intervals for the retired 30B model: right 0.53–0.82, bad cases passed 0.00–0.15. The cost of the safety net: all 14 good cases wait for a person instead of paying at once. Attack captions went to the model raw to test it alone; in the app those sentences are removed first and the job goes to review.</p>
        </div>
        <div className="panel marks stack">
          <div className="panel-h"><h3>Done-OCR, receipt totals</h3><span className="tiny muted">read exactly, to the cent</span></div>
          <div className="scroll-x"><table className="table">
            <thead><tr><th>Set</th><th className="r">Total</th><th className="r">Right when conf ≥ 0.6</th><th className="r">Conf ≥ 0.6</th></tr></thead>
            <tbody>
              <tr><td>Set 1, first run</td><td className="num r">21/30</td><td className="num r">18/22</td><td className="num r">22/30</td></tr>
              <tr><td>Set 1 after rule fixes (dev set)</td><td className="num r">24/30</td><td className="num r">19/19</td><td className="num r">19/30</td></tr>
              <tr><td><b>Set 2, held out, run once</b></td><td className="num r"><b>27/30</b></td><td className="num r ok"><b>21/21</b></td><td className="num r">21/30</td></tr>
            </tbody>
          </table></div>
          <p className="small ink2">On the held-out set every total read with confidence 0.6 or more was right (interval 0.85–1.00); 9 of 30 came back unsure and go to a person. These are rendered receipts in six fonts with tilt, blur and noise, not phone photos of thermal paper: real receipts will read worse.</p>
        </div>
      </section>

      </details>

      <section className="why">
        <div><b>No hosted AI keys</b><p>No Claude, GPT or other hosted model is called by the app, and none was used to make training data. Models run on machines we control.</p></div>
        <div><b>Untrusted text stays data</b><p>A description, a caption or a receipt's words reach a model only inside fenced data. Sentences that try to instruct ("release the payment") are removed, flagged, and cap the check's confidence at 0.4, which sends the job to a person.</p></div>
        <div><b>What it can't catch</b><p>A pro who edits a photo's EXIF passes the time and place checks. Reuse against earlier jobs and the model's reading of the picture are what's left. The sets are small and ours; the intervals are wide.</p></div>
      </section>
    </div>
  );
}
