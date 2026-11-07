// The work order's parts, shared by the customer's job page, the pro's job page, the home page and the back office:
// the status and its rail, where a result came from (model, rules, an agent, a person), the done-conditions with an
// inspection stamp each, the agents' thread, the money (hold, split, every PayPal id), the timeline and the evidence.
import { useState } from "react";
import { m, when, clock, day, usd } from "../api.jsx";
import { useMe } from "../App.jsx";
import Icon from "./Icon.jsx";

export const STATUS = {
  draft: ["Draft", ""], scoped: ["Scoped", ""], offered: ["Offers in", "signal"], offered_none: ["Asking pros", "signal"], agreed: ["Agreed: hold pending", "warn"], agreed_nohold: ["Agreed: no hold yet", "bad"], released_sent: ["Released: payout sent", "signal"], released_unclaimed: ["Released: not claimed yet", "signal"], held: ["Money held", "signal"],
  working: ["Work under way", "signal"], submitted: ["Evidence in", "signal"], checking: ["Checking", "signal"], needs_fix: ["Needs a fix", "warn"],
  review: ["Customer decides", "warn"], passed: ["Passed: review window", "good"], released: ["Paid", "good"], disputed: ["Disputed", "bad"], resolved: ["Settled", "good"], cancelled: ["Cancelled", ""], expired: ["Expired", ""],
};
export function Status({ s, as }) {
  const [l, c] = STATUS[s] || [s, ""];
  return <span className={`badge ${c}`}>{s === "review" && as === "customer" ? "Your call" : l}</span>;
}

const RAIL = [["Scope", ["draft", "scoped"]], ["Offers", ["offered", "agreed"]], ["Hold", ["held"]], ["Work", ["working", "needs_fix"]], ["Checks", ["submitted", "checking", "review", "passed", "disputed"]], ["Paid", ["released", "resolved"]]];
export function Rail({ job }) {
  const off = ["cancelled", "expired"].includes(job.status);
  // how far a cancelled or expired job got: by its timeline
  const reached = (s) => RAIL.findIndex(([, ss]) => ss.includes(s));
  const at = off ? Math.max(0, ...job.timeline.map((t) => reached(t.to)).filter((i) => i >= 0)) : reached(job.status);
  return (
    <ol className="rail" aria-label="Where this job is">
      {RAIL.map(([l], i) => <li key={l} className={`${i < at ? "done" : i === at ? "now" : ""} ${off ? "off" : ""}`} aria-current={i === at ? "step" : undefined}><span>{i === at && off ? (job.status === "expired" ? "Expired" : "Cancelled") : l}</span></li>)}
    </ol>
  );
}

// where a result came from: a model (named), the rules, an agent, a person, or code
export function Src({ s, prefix }) {
  if (!s) return null;
  const v = String(s);
  let cls = "rules", label = v;
  if (/^rules/.test(v)) { cls = "rules"; label = v.replace(/^rules/, "RULES"); }
  else if (/agent/.test(v)) { cls = "agent"; label = v.toUpperCase(); }
  else if (/^(customer|person|staff)$/.test(v)) { cls = "person"; label = v === "staff" ? "STAFF" : "CUSTOMER"; }
  else if (/^code/.test(v)) { cls = "code"; label = "CODE"; }
  else if (/^(typed|none|given text)$/.test(v)) { cls = "rules"; label = v === "given text" ? "TYPED TEXT" : v.toUpperCase(); }
  else { cls = "model"; label = v === "model" ? "MODEL" : `MODEL · ${v}`; }
  return <span className={`src ${cls}`} title={`Source: ${v}`}>{prefix ? `${prefix} ` : ""}{label}</span>;
}

// a condition's machine rule, in words (the backend's ruleText when it gives one)
const RULE_WORDS = [
  [/^photo>=(\d+)$/, (n) => (+n === 1 ? "at least one photo" : `at least ${n} photos`)],
  [/^receipt>=(\d+)$/, (n) => (+n === 1 ? "a receipt" : `${n} receipts`)],
  [/^note>=(\d+)$/, () => "a written note"],
  [/^words>=(\d+)$/, (n) => `of ${n} words or more`],
  [/^in_window$/, () => "taken during the job's dates"],
  [/^near_job$/, () => "at the job's address"],
  [/^not_reused$/, () => "never used on another job"],
  [/^read$/, () => "readable"],
  [/^matches_change_orders$/, () => "matching the agreed parts and change orders"],
  [/^label$/, () => "with the label readable"],
  [/^code_only$/, () => "checked by code alone"],
  [/^progress>=(\d+)$/, (n) => `at least ${n}% complete`],
];
export function ruleWords(c) {
  if (c?.ruleText) return c.ruleText;
  const parts = String(c?.rule || "").split(";").map((t) => t.trim()).filter(Boolean);
  if (!parts.length || !/[>=_;]/.test(String(c?.rule || ""))) return c?.rule || "";
  return parts.map((t) => { for (const [re, f] of RULE_WORDS) { const x = t.match(re); if (x) return f(x[1]); } return t.replace(/_/g, " "); }).join(", ");
}

const HOT = /(far|reused|before|after_upload|outside|mismatch|injection|missing|duplicate|not_camera|no_verdict|unread|fail|dated_after)/i;
const KIND = { photo: "camera", receipt: "doc", note: "pen" };
const needsPerson = (c) => c?.needsPerson || (c?.signals || []).some((s) => /^needs_person|model_unavailable/.test(s));
const conf = (c) => (c.confidence != null ? `conf ${(+c.confidence).toFixed(2)}` : "");
export function stampOf(c, kind) {
  if (!c) return { cls: "open", word: "Open", sub: "not checked yet" };
  // a photo or note that code passed but no model looked at: say so rather than "passed"
  if (c.verdict === "pass" && !needsPerson(c) && judgeOf(c) === "code" && ["photo", "note"].includes(kind) && !(c.signals || []).some((x) => /^no_parts|code_only/.test(x))) return { cls: "person", word: "Code ✓", sub: "content not judged" };
  if (c.label === "NEEDS_REVIEW" || (c.verdict === "pass" && needsPerson(c))) return { cls: "person", word: c.verdict === "pass" ? "Code ✓" : "Needs review", sub: "a person confirms" };
  if (c.verdict === "pass" && kind === "receipt" && ((c.signals || []).some((x) => /^no_parts/.test(x)) || /no receipt is needed/i.test(c.reason || ""))) return { cls: "person", word: "Waived", sub: "no parts bought: passes by rule" };
  const retake = /^Retake after ([^:]+):/.exec(c.reason || "");
  if (retake && c.verdict !== "pass") return { cls: "needs_fix", word: "Retake", sub: `after ${retake[1]}` };
  if (c.label === "APPROVED" && c.verdict === "pass") return { cls: "pass", word: "Approved", sub: conf(c) };
  if (c.label === "NEEDS_MORE_EVIDENCE") return { cls: "needs_fix", word: "More evidence", sub: conf(c) };
  if (c.label === "REJECTED") return { cls: "fail", word: "Rejected", sub: conf(c) };
  if (c.verdict === "pass" && needsPerson(c)) return { cls: "person", word: "Code passed", sub: "a person confirms" };
  if (c.verdict === "pass") return { cls: "pass", word: "Passed", sub: c.confidence != null ? `conf ${c.confidence.toFixed(2)}` : "" };
  if (c.verdict === "needs_fix") return { cls: "needs_fix", word: "Fix", sub: c.confidence != null ? `conf ${c.confidence.toFixed(2)}` : "" };
  return { cls: "fail", word: "Failed", sub: c.confidence != null ? `conf ${c.confidence.toFixed(2)}` : "" };
}
export function Stamp({ c, big, land, kind }) {
  const s = stampOf(c, kind);
  return <span className={`stamp ${s.cls} ${big ? "big" : ""} ${land ? "land" : ""}`}>{s.word}{s.sub && <small>{s.sub}</small>}</span>;
}

// the done-conditions: the work order's contract, each with how it is checked and, once checked, its verdict
// the latest check round of the work itself (not a warranty defect round)
export const lastMain = (job) => [...(job.checks || [])].reverse().find((r) => r.kind !== "defect") || null;
export function Conditions({ job, evidenceFor, round, checkIds }) {
  const last = round !== undefined ? round : lastMain(job), byId = Object.fromEntries((last?.checks || []).map((c) => [c.id, c]));
  const all = job.scope?.checks || [], list = checkIds ? all.filter((c) => checkIds.includes(c.id)) : all;
  return (
    <ol className="conds">
      {list.map((c) => {
        const r = byId[c.id], st = stampOf(r, c.evidence);
        return (
          <li key={c.id} className={`cond ${r ? (st.cls === "person" ? "person" : r.verdict) : ""}`}>
            <span className="box" aria-hidden="true">{r?.verdict === "pass" && st.cls !== "person" ? <Icon name="check" size={14} stroke={3} /> : r?.verdict === "fail" ? <Icon name="x" size={12} stroke={3} /> : r?.verdict === "needs_fix" ? "!" : ""}</span>
            <div>
              <div className="what">{c.what}</div>
              <div className="how" title={`condition ${c.id}`}><span className="row" style={{ gap: 4 }}><Icon name={KIND[c.evidence] || "camera"} size={13} /> {c.doc ? `document · ${c.doc.replace("_", " ")}` : c.evidence}</span>{c.shots && <span title={c.shots.context}>{c.shots.min}–{c.shots.max} shots{c.shots.closeUps ? " · close-ups" : ""}</span>}{c.rule && <span className="rulew" title={`Machine rule: ${c.rule}`}>{ruleWords(c)}</span>}</div>
              {r && <p className="reason">{String(r.reason || "").replace(/Taken -(\d+) seconds after/g, "Taken $1 seconds before").replace(/\b(Photo|Note|Receipt) ev_[0-9a-f]+\b/g, (x, k) => `The ${k.toLowerCase()}`).replace(/\s*\(?ev_[0-9a-f]{6,}\)?/g, "")}{judgeOf(r) === "model" && <> <span className="src model">MODEL · {r.by}</span></>}</p>}
              {r?.vlm && <Saw v={r.vlm} />}
              {r?.plate && <p className="tiny ink2" style={{ marginTop: 6 }}>Rating plate read{r.plate.by ? ` by ${r.plate.by}` : ""}: {[r.plate.brand, r.plate.model, r.plate.serial && `serial ${r.plate.serial}`].filter(Boolean).join(" · ") || "nothing legible"}{r.plate.matchesOrder === false ? " · does not match the order" : r.plate.matchesOrder ? " · matches the order" : ""}</p>}
              {r?.progress && <p className="tiny ink2" style={{ marginTop: 6 }}>Progress estimate: {r.progress.percentComplete != null ? `${r.progress.percentComplete}% complete` : "none"}{r.progress.quantity != null ? ` · ${r.progress.quantity} ${r.progress.unit || ""}` : ""}{r.progress.need != null ? ` (needs ${r.progress.need}%)` : ""}</p>}
              {r?.signals?.length > 0 && (() => { const hot = (x) => HOT.test(x.split(":")[0]) && !/_ok/.test(x.split(":")[0]), red = r.signals.filter(hot), rest = r.signals.filter((x) => !hot(x)); return <>
                {red.length > 0 && <div className="signals">{red.map((x, i) => <span key={i} className="hot">{x}</span>)}</div>}
                {rest.length > 0 && <details className="sig-more"><summary>TECHNICAL SIGNALS ({rest.length})</summary><div className="signals">{rest.map((x, i) => <span key={i}>{x}</span>)}</div></details>}
              </>; })()}
              {evidenceFor?.(c.id)}
            </div>
            <div className="stamp-slot"><Stamp c={r} kind={c.evidence} /></div>
          </li>
        );
      })}
    </ol>
  );
}

// a check round's header: who checked, who decided, and the decision
// One vocabulary for every check, everywhere: what code checked, who judged what the photos and notes show (a model,
// or a person because no model answered), and that money moves only by code.
const CODE_BY = /^(rules|given text|none|code|typed)$/;
export function judgeOf(c) {
  if (!c) return null;
  if (needsPerson(c)) return "person";
  if (!c.by || CODE_BY.test(String(c.by))) return "code";
  return "model";
}
export function roundStory(round) {
  const cs = round?.checks || [], n = cs.length;
  const codeOk = cs.filter((c) => c.verdict === "pass").length, bad = cs.filter((c) => c.verdict !== "pass");
  const person = cs.filter((c) => judgeOf(c) === "person" || (c.verdict === "pass" && judgeOf(c) === "code" && /photo|note/i.test(`${c.what || ""}`) && !(c.signals || []).some((x) => /^no_parts|code_only|receipt/.test(x)))).length, model = cs.filter((c) => judgeOf(c) === "model").length;
  const models = [...new Set(cs.filter((c) => judgeOf(c) === "model").map((c) => c.by))];
  const df = round?.decidedFrom;
  const next = { release: "money moves now, by code", needs_fix: "back to the pro to fix", review: person && !bad.length ? "money moves by code once a person confirms" : "the customer decides; money moves by code after that" }[round?.decision] || round?.decision;
  if (df) {
    // the backend's single source: what this round actually used
    const who = [df.vlm === "model" ? "a vision model judged the photos" : null, df.model && df.model !== "none" ? `a model (${df.model}) read the notes and captions` : null, df.documents === "docs.js" ? "documents read by code" : null].filter(Boolean);
    return { n, codeOk, bad: bad.length, person, model: df.model !== "none" || df.vlm === "model" ? 1 : 0, models: [df.model, df.vlm === "model" ? "vlm" : null].filter((x) => x && x !== "none"), next, df,
      line: [settledLine(n, codeOk, person, bad.length), who.length ? who.join(", ") : "no model looked at the photos", next].filter(Boolean).join(" · ") };
  }
  return { n, codeOk, bad: bad.length, person, model, models, next,
    line: [settledLine(n, codeOk, person, bad.length), model ? `${model} judged by a model (${models.join(", ")})` : null, next].filter(Boolean).join(" · ") };
}
// one plain statement for a round: what code found, and who still has to look
const settledLine = (n, ok, person, bad) => [ok - person > 0 || !person ? `${Math.max(0, ok - person)} of ${n} settled by code` : null, person ? `${person} of ${n} waiting for a person to look` : null, bad ? `${bad} didn't pass` : null].filter(Boolean).join(", ");
export function headline(st) {
  const done = Math.max(0, st.codeOk - st.person);
  if (st.bad) return `${st.bad} of ${st.n} condition${st.n === 1 ? "" : "s"} didn't pass${st.person ? `; ${st.person} more wait for a person` : ""}.`;
  const wait = `${st.person} of ${st.n} condition${st.n === 1 ? "" : "s"} wait${st.person === 1 ? "s" : ""} for you${done ? ` (${done} settled by code)` : ""}.`;
  if (st.person && !st.model) return `${wait} Code found nothing wrong, but no model looked at the photos, so you confirm them.`;
  if (st.person) return `${wait} A model read the notes; the photos need you to confirm them.`;
  if (st.model) return "Code checks passed and a model judged the photos and notes.";
  return "Code checks passed.";
}
export function CheckHead({ round, job, ms }) {
  if (!round) return null;
  const st = roundStory(round);
  // after a person confirmed (or the money moved), the round's "waiting for you" is history: say what happened
  const m_ = ms || (job?.milestones || []).find((x) => x.id === round.milestone) || (job?.milestones?.length === 1 ? job.milestones[0] : null);
  const conf = m_?.confirmed || m_?.release?.confirmed, moved = ["released", "resolved"].includes(job?.status) || ["released", "paid"].includes(m_?.status);
  if (st.person && !st.bad && (conf || moved)) st.after = conf ? `Code found nothing wrong; ${conf.by?.kind === "person" || !conf.by ? "you" : conf.by.kind === "expert" ? "an expert" : conf.by.kind === "inspector" ? "the inspector" : conf.by.kind === "agent" ? "your agent" : "staff"} confirmed the photos${conf.at ? ` (${when(conf.at)})` : ""}.` : "Code found nothing wrong, and the money was released.";
  const tone = round.decision === "release" ? "good" : round.decision === "needs_fix" ? "warn" : "warn";
  return (
    <div className="stack-s">
      <p className="verdict-line"><b>{st.after || headline(st)}</b></p>
      {!st.after && <p className="small ink2">{st.line}.</p>}
      <p className="data">round {round.round}{round.milestone ? ` · ${round.milestone}` : ""} · {round.ms != null ? `${(round.ms / 1000).toFixed(1)} s` : ""} · {when(round.at)}{round.verdictHash ? ` · signed verdict ${round.verdictHash.slice(0, 12)}…` : ""}{round.receipt && <> · <a href={`/api/receipts/${round.receipt}`} target="_blank" rel="noreferrer">receipt</a></>}</p>
    </div>
  );
}

// PayPal ids: every one on the screen, copyable, labelled simulated when the stand-in made them
export function Ids({ rows }) {
  const { info } = useMe(), [copied, setCopied] = useState(null);
  const list = rows.filter((r) => r[1]);
  if (!list.length) return null;
  return (
    <div className="stack-s">
      
      <ul className="ids">
        {list.map(([k, v, extra]) => <li key={k + v}><span className="k">{k}</span><span className="v">{v}{extra && <span className="muted"> · {extra}</span>}</span>
          <button className="copy" onClick={() => { navigator.clipboard?.writeText(v); setCopied(v); setTimeout(() => setCopied(null), 1200); }} aria-label={`Copy ${k}`}>{copied === v ? "copied" : "copy"}</button></li>)}
      </ul>
    </div>
  );
}
export function paypalIds(job) {
  const h = job?.hold, p = job?.money?.payout;
  return [
    ["Order", h?.paypalOrder], ["Authorization", h?.authorization, h?.reauthorized ? "reauthorized" : h?.status],
    ...(h?.history || []).filter((x) => x.replaced).map((x) => ["Replaced auth", x.replaced, "voided for a re-hold"]),
    ["Capture", h?.capture], ["Payout batch", p?.batchId, p?.batchId ? "accepted by PayPal" : null],
    ...((p?.paypal || p?.items || []).filter(Boolean).map((i) => ["Payout item", i.transactionId || i.id, `${i.to || i.id?.split("-").pop()} · ${{ UNCLAIMED: "sent, not claimed yet", SUCCESS: "paid", PENDING: "processing" }[i.status] || String(i.status || "").toLowerCase()}`.trim()])),
    ...(job?.money?.ledger || []).filter((l) => l?.kind === "refund").map((l) => ["Refund", l.ref, l.amount?.usd]),
  ];
}

// the hold: how much PayPal is holding, what is due, the buffer for change orders, when the guarantee ends
export function Hold({ job }) {
  const h = job.hold;
  if (!h) return <p className="small muted">No money is held yet. It is held with a PayPal authorization the moment an offer is accepted, and nothing is charged until the checks pass.</p>;
  const amt = h.amount?.cents || 0, due = Math.min(job.due?.cents || 0, amt), pct = amt ? (due / amt) * 100 : 0;
  const live = h.status === "held" || h.status === "partially_captured", pending = ["pending_approval", "starting"].includes(h.status);
  if (pending) return (
    <div className="stack-s">
      <span className="eyebrow">NOTHING HELD YET</span>
      <div className="big-amt muted">{m(h.amount)}</div>
      <p className="small ink2">{h.explain ? `Once you approve: ${h.explain}` : `This is what PayPal will hold once you approve: the price ${m(h.price)} plus ${j_buf(h)} for change orders. It's an authorization, not a charge; nothing moves until the checks pass.`}</p>
    </div>
  );
  return (
    <div className="stack-s">
      <div className="row between"><span className="eyebrow">{h.status === "captured" ? "CAPTURED FROM A HOLD OF" : live ? "HELD WITH PAYPAL" : `HOLD ${String(h.status || "").replace(/_/g, " ").toUpperCase()}`}</span><span className="badge">{h.mode === "authorize" ? "authorize, capture later" : "captured, kept by the platform"}</span></div>
      <div className="big-amt">{m(h.amount)}</div>
      <div className="meter" role="img" aria-label={`${m(job.due)} due of ${m(h.amount)} held`}>
        <span className="cap">due {m(job.due)}</span>
        <i className="due" style={{ width: `${pct}%` }} /><i className="buf" style={{ flex: 1 }} />
      </div>
      <div className="meter-k"><span>price {m(h.price)} + change orders</span><span>buffer left {m(h.buffer)}</span></div>
      <ul className="spec">
        <li><span className="lead">Paid with</span><span className="val">{{ saved: "saved PayPal (vault)", card: "demo test card", paypal: "PayPal" }[h.payWith] || h.payWith}</span></li>
        {h.items?.length > 0 && <li><span className="lead">On the PayPal order</span><span className="val">{h.items.map((x) => `${x.name.split(":")[0].replace(/ \(.*/, "")} ${x.amount?.usd || ""}`).join(" · ")}</span></li>}
        {h.payerContact && <li><span className="lead">Contact from PayPal</span><span className="val">{[h.payerContact.email, h.payerContact.phone].filter(Boolean).join(" · ")}</span></li>}
        {h.sellerProtection && <li><span className="lead">PayPal Seller Protection</span><span className="val" title={h.sellerProtection.says}>{String(h.sellerProtection.status).replace(/_/g, " ").toLowerCase()}</span></li>}
        {h.statusReason && <li><span className="lead">PayPal's reason</span><span className="val">{String(h.statusReason).replace(/_/g, " ").toLowerCase()}</span></li>}
        {h.processor && <li><span className="lead">Card bank said</span><span className="val" title={`AVS ${h.processor.avs || "—"} · CVV ${h.processor.cvv || "—"} · response ${h.processor.response || "—"}`}>{h.processor.says || "—"}</span></li>}
        {h.risk && <li><span className="lead">PayPal risk</span><span className="val" title={h.risk.says}>{h.risk.trackingId ? `context sent${h.risk.highRisk ? " (flagged high risk)" : ""}` : "not sent"}</span></li>}
        {h.threeDS && <li><span className="lead">3-D Secure</span><span className="val" title={h.threeDS.says}>{h.threeDS.liabilityShift === "POSSIBLE" ? "passed (liability shift)" : `liability shift ${String(h.threeDS.liabilityShift || "unknown").toLowerCase()}`}</span></li>}
        {live && h.honorUntil && <li><span className="lead">PayPal guarantees it until</span><span className="val">{when(h.honorUntil)}</span></li>}
        {live && h.expiresAt && <li><span className="lead">Can't be held past</span><span className="val">{when(h.expiresAt)}</span></li>}
        {h.reauthorized && <li><span className="lead">Reauthorized</span><span className="val">yes, past the 3-day guarantee</span></li>}
      </ul>
      {h.explain && <p className="small ink2">{h.explain}</p>}
      {h.note && <p className="tiny warn">{h.note}</p>}
      {live && <p className="tiny muted">PayPal guarantees a hold for 3 days; after that it is renewed automatically (reauthorized), up to 29 days.</p>}
      {h.history?.length > 1 && <details><summary>HOLD HISTORY ({h.history.length})</summary><ul className="tl">{h.history.map((x, i) => <li key={i}><time>{day(x.at)} {clock(x.at)}</time><span><span className="to">{x.event}</span> <span className="mono tiny muted">{x.id}</span>{x.why && <span className="small muted"> · {x.why}</span>}</span></li>)}</ul></details>}
    </div>
  );
}

const j_buf = (h) => (h.amount?.cents != null && h.price?.cents != null ? usd(h.amount.cents - h.price.cents) : "a buffer");

// the split: what was captured, and where each cent went
export function Split({ job }) {
  const mo = job.money, s = mo?.split;
  if (!s) return null;
  return (
    <ul className="spec">
      <li><span className="lead">Captured</span><span className="val">{m(mo.captured)}</span></li>
      <li><span className="lead">To {job.agreed?.proName || "the pro"}</span><span className="val">{m(s.pro)}</span></li>
      {s.helper?.cents > 0 && <li><span className="lead">To {job.agreed?.helper?.name || "the helper"}</span><span className="val">{m(s.helper)}</span></li>}
      <li><span className="lead">Platform fee (10%)</span><span className="val">{m(s.fee)}</span></li>
      {mo.refunded?.cents > 0 && <li><span className="lead">Refunded to the customer</span><span className="val">{m(mo.refunded)}</span></li>}
      <li className="total"><span className="lead">Adds up to the capture</span><span className={`val ${mo.balanced ? "ok" : "bad"}`}>{mo.balanced ? "yes, to the cent" : "NO"}</span></li>
      <li><span className="lead">PayPal's fee (platform's cost)</span><span className="val">{m(mo.paypalFee)}</span></li>
    </ul>
  );
}

const WHO = (f) => (f.kind === "pro_agent" ? "pro's agent" : f.kind === "customer_agent" ? "customer's agent" : f.kind === "customer" ? "customer" : "platform");
export function Thread({ job }) {
  if (!job?.thread?.length) return <p className="small muted">No messages yet. Offers from the pros' agents appear here.</p>;
  return (
    <ol className="thread">
      {job.thread.filter(Boolean).map((t, i) => { const f = t.from || {}; return (
        <li key={t.id || i} className={`msg ${String(f.kind || "").startsWith("customer") ? "cust" : f.kind === "platform" ? "plat" : ""}`}>
          <span className="who"><b>{f.name || WHO(f)}</b><span>{WHO(f)}</span><span>{String(t.type || "").replace("_", " ")}</span><Src s={t.source} /><span>{clock(t.at)}</span></span>
          {t.amount && t.type !== "check" && <span className="amt">{m(t.amount)}</span>}
          <span>{t.text}</span>
        </li>
      ); })}
    </ol>
  );
}

const ACTOR = (b) => (!b ? "" : b.kind === "person" ? "customer" : b.kind === "agent" ? `customer's agent${b.client ? ` (${b.client})` : ""}` : b.kind === "pro_agent" ? "pro's agent" : ({ paypal: "PayPal", platform: "VeriPay (automatic)", staff: "VeriPay staff", expert: "VeriPay expert", pro: "the pro", inspector: "the inspector" })[b.kind] || b.kind);
export function Timeline({ job }) {
  return (
    <ol className="tl">
      {(job.timeline || []).map((t, i) => <li key={i}><time>{day(t.at)}<br />{clock(t.at)}</time><span><span className="to">{t.from ? `${STATUS[t.from]?.[0] || t.from} → ` : ""}{STATUS[t.to]?.[0] || t.to}</span> <span className="small muted">· {ACTOR(t.by)}{t.note ? ` · ${t.note}` : ""}</span></span></li>)}
    </ol>
  );
}

// what the vision model saw in the photos for one condition (only when a VLM answered)
export function Saw({ v }) {
  return (
    <div className="saw">
      <span className="src model">MODEL · what the photo model saw{v.confidence != null ? ` · conf ${(+v.confidence).toFixed(2)}` : ""}</span>
      <p className="small">{v.sees || "—"}</p>
      <p className="tiny muted">{v.sameSpot != null && `Same spot as BEFORE: ${v.sameSpot ? "yes" : "no"}. `}{v.changed && `Changed: ${v.changed}. `}{v.matchesReference != null && `Matches the customer's problem photo: ${v.matchesReference ? "yes" : "no"}.`}</p>
    </div>
  );
}

// when a photo was taken, relative to the job: before it was posted, before work started, or how long into the work
const rel = (ms) => { const a = Math.abs(ms) / 60e3; return a < 1 ? "under a minute" : a < 90 ? `${Math.round(a)} min` : a < 48 * 60 ? `${(a / 60).toFixed(1)} h` : `${Math.round(a / 1440)} days`; };
export function photoWhen(e, job) {
  const t = Date.parse(e?.exif?.taken || "");
  if (!t || !job) return null;
  const started = Date.parse(job.startedAt || (job.timeline || []).find((x) => x.to === "working")?.at || ""), posted = Date.parse(job.created || "");
  if (posted && t < posted) return { say: `taken ${rel(posted - t)} before the job was posted`, bad: e.phase !== "reference" };
  if (started && t < started) return { say: `taken ${rel(started - t)} before work started`, bad: !["before", "reference"].includes(e.phase) };
  if (started) return { say: `taken ${rel(t - started)} after work started`, bad: e.phase === "before" };
  return { say: `taken ${rel(t - posted)} after the job was posted`, bad: false };
}
const short = (t) => { const s = t.replace(/^(a )?photos? (of|showing) /i, ""); return s.length <= 60 ? s : `${s.slice(0, 60).replace(/\s+\S*$/, "")}…`; };
// a photo's caption: its own words, never a cut-off copy of the condition (which is printed right above it)
function photoCaption(e, job) {
  const body = String(e.label || "").replace(/^(before|after)[:\s]+/i, "").trim();
  const cond = (job?.scope?.checks || []).find((c) => c.id === e.checkId)?.what || "";
  const shared = body && new Set((job?.evidence || []).filter((x) => x.kind === "photo" && String(x.label || "").replace(/^(before|after)[:\s]+/i, "").trim() === body).map((x) => x.checkId)).size > 1;
  if (shared || !body) return cond ? short(cond) : "photo";
  // "bracket: the bracket on the wall with a" (a shot name, then the condition cut short): show the condition, uncut
  const rest = body.replace(/^[\w -]{1,24}:\s*/, "").toLowerCase();
  if (cond && rest && (cond.toLowerCase().includes(rest) || short(cond).toLowerCase().startsWith(rest))) return short(cond);
  if (cond && cond.toLowerCase().startsWith(body.toLowerCase())) return "photo";
  return body;
}
export function Evidence({ items, job }) {
  if (!items?.length) return null;
  return (
    <div className="thumbs">
      {items.map((e) => (
        <figure key={e.id}>
          {e.kind === "note" ? <div className="doc">{e.text}</div> : e.mime === "application/pdf" ? <a className="doc" href={e.url} target="_blank" rel="noreferrer">PDF · {e.name}</a> : <a href={e.url} target="_blank" rel="noreferrer"><img onError={(ev) => { ev.currentTarget.replaceWith(Object.assign(document.createElement("div"), { className: "doc", textContent: "This photo didn't load. Open it from the link." })); }} src={e.url} alt={`${e.kind}${e.checkId ? ` for ${e.checkId}` : ""}: ${e.name}`} loading="lazy" /></a>}
          <figcaption title={[e.kind === "photo" ? photoCaption(e, job) : e.kind, e.exif?.taken ? clock(e.exif.taken) : null, e.exif?.lat != null ? "GPS in the photo" : null].filter(Boolean).join(" · ")}>{(() => {
            // one short line: "Before · 2 min before work started" (the condition is printed above; details are in the tooltip)
            const ph = e.kind === "photo" ? ({ before: "Before", reference: "Your photo", inspection: "Inspection", defect: "Defect" })[e.phase] || "After" : e.kind === "note" ? "Note" : e.kind === "receipt" ? "Receipt" : e.kind;
            const w = e.exif?.taken ? photoWhen(e, job) : null, when_ = w ? w.say.replace(/^taken /, "").replace("under a minute", "<1 min") : e.exif?.taken ? clock(e.exif.taken) : e.kind === "photo" ? "no camera time" : null;
            return <><b className={`ph ${e.phase || "after"}`}>{ph}</b>{when_ && <> · <span className={w?.bad ? "bad" : ""}>{when_}</span></>}{e.kind === "photo" && e.exif?.lat == null ? " · no GPS" : ""}{e.forChange ? " · change order" : ""}</>;
          })()}</figcaption>
        </figure>
      ))}
    </div>
  );
}

export function Receipts({ job }) {
  if (!job.receipts?.length) return null;
  return <details><summary>SIGNED RECEIPTS ({job.receipts.length})</summary><ul className="ids" style={{ marginTop: 8 }}>{job.receipts.map((r) => <li key={r.id}><span className="k">{r.event}</span><a className="v" href={`/api/receipts/${r.id}`} target="_blank" rel="noreferrer">{r.id}</a><span className="tiny muted">{clock(r.at)}</span></li>)}</ul><p className="tiny muted" style={{ marginTop: 6 }}>Each event is signed and logged; check one at <a href="/.well-known/done-receipts.json">/.well-known/done-receipts.json</a>.</p></details>;
}

// who has to act next, from the job's waitingOn
const ME = { customer: "customer", pro: "pro", inspector: "inspector" };
function WaitingOn({ w, as }) {
  const yours = w.who === ME[as] || (w.who === "customer and pro" && (as === "customer" || as === "pro"));
  const who = { customer: "the customer", pro: "the pro", platform: "the platform", inspector: "the inspector", "customer and pro": "the customer and the pro", nobody: "nobody" }[w.who] || w.who;
  return <p className={`waiting ${yours ? "yours" : ""}`}><span className="eyebrow">{yours ? "WAITING ON YOU" : `WAITING ON ${String(who).toUpperCase()}`}</span>{w.what && <span className="small">{(w.what[0].toUpperCase() + w.what.slice(1)).replace(/\s*\([a-z]+_[a-z_]+\)/g, "").replace(/\d{4}-\d\d-\d\dT[\d:.]+Z/g, (t) => when(t))}</span>}{w.also && <span className="tiny muted">{w.also}</span>}</p>;
}

// the work order's header
export function WoHead({ job, as, children }) {
  return (
    <div className="wo-head">
      <div>
        <div className="wo-no"><span className="hash">#</span>{job.number}</div>
        <div className="wo-title">{job.scope?.title}</div>
        <div className="wo-meta">{job.scope?.trade && <span>{job.scope.trade}</span>}<span>{job.address?.line ? `${job.address.line}, ` : ""}{job.address?.city || "Austin"}, {job.address?.state || "TX"} {job.address?.zip}</span>{job.scope?.window && <span>window {day(job.scope.window.from)} – {day(job.scope.window.to)}</span>}<span>ceiling {m(job.scope?.priceCeiling)}</span></div>
      </div>
      <div className="wo-state"><Status s={job.status === "agreed" && job.hold?.status !== "pending_approval" ? "agreed_nohold" : ["released", "resolved"].includes(job.status) && job.payoutState && job.payoutState.state !== "paid" ? (job.payoutState.state === "sent_unclaimed" ? "released_unclaimed" : "released_sent") : ["released", "resolved"].includes(job.status) && !job.payoutState && job.money?.payout && !["SUCCESS", "paid_as_payee"].includes(String(job.money.payout.status)) ? "released_sent" : job.status === "offered" && !(job.offers || []).length ? "offered_none" : job.status} as={as} />{job.status === "offered" && !(job.offers || []).length && as !== "pro" ? <p className="waiting"><span className="eyebrow">WAITING ON THE PROS' AGENTS</span><span className="small">Their first offers usually arrive within 1–2 minutes.</span></p> : job.waitingOn && <WaitingOn w={job.waitingOn} as={as} />}{["held", "agreed"].includes(job.status) && job.scope?.window?.from && Date.parse(job.scope.window.from) > Date.parse(job.now || new Date().toISOString()) && <p className="tiny muted">The job's window opens {when(job.scope.window.from)}: the pro comes then.</p>}{!job.waitingOn && !(job.status === "offered" && !(job.offers || []).length) && !(job.waitingOn?.what && String(job.next || "").toLowerCase().replace(/\.$/, "") === job.waitingOn.what.toLowerCase().replace(/\.$/, "")) && <p className="wo-next">{job.status === "review" && as === "customer" ? "The checks left this to you: look at each condition, then release, ask for a fix or dispute." : job.next}</p>}{children}</div>
    </div>
  );
}
