// Scheduling (PLAN §15 item 7): the pro's weekly hours, slot choice on offers, and moving a booked visit.
import { useEffect, useState } from "react";
import { api, useApi, when } from "../api.jsx";
import { useMe } from "../App.jsx";
import { t } from "../i18n.js";

const DAYS = [["mon", "Monday"], ["tue", "Tuesday"], ["wed", "Wednesday"], ["thu", "Thursday"], ["fri", "Friday"], ["sat", "Saturday"], ["sun", "Sunday"]];
export const slotSays = (s) => (s ? `${when(s.from)}–${new Date(s.to).toLocaleTimeString("en-US", { timeZone: "America/Chicago", hour: "numeric", minute: "2-digit" })}${s.onCall ? " (demo on-call)" : ""}` : "");

// the pro's hours: one range a day (or off), blocked dates, the usual visit length
export function Availability() {
  const { toast } = useMe(), a = useApi("/api/pro/availability"), [w, setW] = useState(null), [blocked, setBlocked] = useState(""), [mins, setMins] = useState(""), [busy, setBusy] = useState(false);
  useEffect(() => { const v = a.data?.availability; if (!v) return; setW(Object.fromEntries(DAYS.map(([k]) => [k, (v.weekly?.[k] || [])[0] || null]))); setBlocked((v.blocked || []).join(", ")); setMins(v.visitMinutes || ""); }, [a.data]);
  if (!w) return <div className="panel"><div className="skel" style={{ height: 120 }} /></div>;
  const save = async () => { setBusy(true); try { await api("/api/pro/availability", { method: "PUT", body: { weekly: Object.fromEntries(DAYS.map(([k]) => [k, w[k] ? [w[k]] : []])), blocked: blocked.split(/[\s,]+/).filter(Boolean), visitMinutes: mins ? +mins : null } }); toast(t("Saved.")); a.reload(); } catch (e) { toast(e.message, true); } setBusy(false); };
  return (
    <section className="panel stack-s" aria-labelledby="h-hours">
      <h3 id="h-hours">{t("Your hours")}</h3>
      <p className="small ink2">{t("Offers propose visit times inside these hours (Austin time) and the job's window. Customers pick one when they hire you.")}{a.data?.availability?.source === "demo hours (fictional)" ? ` ${t("These are fictional demo hours.")}` : ""}</p>
      <div className="hours">{DAYS.map(([k, name]) => <div key={k} className="hours-row"><label className="check-row"><input type="checkbox" checked={!!w[k]} onChange={(e) => setW({ ...w, [k]: e.target.checked ? ["08:00", "17:00"] : null })} /><span>{t(name)}</span></label>
        {w[k] && <span className="row" style={{ gap: 6 }}><input className="input sm" type="time" value={w[k][0]} onChange={(e) => setW({ ...w, [k]: [e.target.value, w[k][1]] })} aria-label={`${name} from`} /><span>–</span><input className="input sm" type="time" value={w[k][1] === "24:00" ? "23:59" : w[k][1]} onChange={(e) => setW({ ...w, [k]: [w[k][0], e.target.value] })} aria-label={`${name} to`} /></span>}</div>)}</div>
      <div className="fields-3">
        <label className="field"><span>{t("DAYS OFF (YYYY-MM-DD, COMMAS)")}</span><input className="input" value={blocked} onChange={(e) => setBlocked(e.target.value)} placeholder="2026-11-26, 2026-12-25" /></label>
        <label className="field"><span>{t("USUAL VISIT (MINUTES, OPTIONAL)")}</span><input className="input" inputMode="numeric" value={mins} onChange={(e) => setMins(e.target.value.replace(/\D/g, ""))} placeholder="90" /></label>
      </div>
      {a.data?.next?.length > 0 && <p className="tiny muted">{t("Next open:")} {a.data.next.slice(0, 3).map(slotSays).join(" · ")}</p>}
      <div><button className={`btn sm ${busy ? "busy" : ""}`} disabled={busy} onClick={save}>{t("Save hours")}</button></div>
    </section>
  );
}

// the booked visit on a job, and moving it: ≥ 24 h notice applies at once; less is a proposal the other side answers
export function Visit({ j, as = "customer", busy, act, readOnly = false }) {
  const v = j.visit, [from, setFrom] = useState(""), [reason, setReason] = useState(""), [open, setOpen] = useState(false);
  if (!v && !j.agreed?.slot) return null;
  const slot = v?.slot || j.agreed?.slot, p = v?.proposal, canMove = !readOnly && ["agreed", "held"].includes(j.status);
  const base = as === "pro" ? `/api/pro/jobs/${j.id}` : `/api/jobs/${j.id}`, mine = p && p.by === (as === "pro" ? "pro" : "customer");
  const fromIso = from ? new Date(from).toISOString() : "";
  return (
    <div className="panel stack-s">
      <h3>{t("The visit")}</h3>
      {slot && <p className="small"><b>{slotSays(slot)}</b>{slot.source && !slot.onCall ? <span className="tiny muted"> · {slot.source}</span> : ""}</p>}
      {p?.status === "proposed" && <div className="note small stack-s"><p>{mine ? t("You asked to move it to") : p.by === "pro" ? t("The pro asks to move it to") : t("The customer asks to move it to")} <b>{slotSays(p)}</b>: “{p.reason}”.</p>
        {!mine && !readOnly && <div className="row"><button className="btn sm accent" disabled={!!busy} onClick={() => act("rsy", `${base}/reschedule/${p.id}`, { accept: true })}>{t("Accept the new time")}</button><button className="btn sm" disabled={!!busy} onClick={() => act("rsn", `${base}/reschedule/${p.id}`, { accept: false, note: "Doesn't work for me" })}>{t("Keep the old time")}</button></div>}
        {mine && <p className="tiny muted">{t("Waiting for an answer.")}</p>}</div>}
      {canMove && <details open={open} onToggle={(e) => setOpen(e.target.open)}><summary>{t("MOVE THE VISIT")}</summary>
        <div className="stack-s" style={{ marginTop: 8 }}>
          <p className="tiny muted">{v?.rule || t("With 24 hours' notice or more it moves at once and the other side is told; with less, they're asked.")}</p>
          <div className="fields-3"><label className="field"><span>{t("NEW START")}</span><input className="input" type="datetime-local" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
            <label className="field" style={{ gridColumn: "span 2" }}><span>{t("WHY")}</span><input className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder={as === "pro" ? "Parts arrive Thursday" : "I have to work late that day"} /></label></div>
          <div><button className="btn sm" disabled={!!busy || !fromIso || reason.trim().length < 4} onClick={() => act("rsc", `${base}/reschedule`, { from: fromIso, reason: reason.trim() }, () => { setFrom(""); setReason(""); setOpen(false); })}>{t("Move it")}</button></div>
          <p className="tiny muted">{t("Times are Austin time; the new time must be inside the pro's hours.")}</p>
        </div></details>}
      {(v?.history || []).length > 1 && <ul className="tiny muted" style={{ margin: 0, paddingLeft: 18 }}>{v.history.map((h, i) => <li key={i}>{when(h.at)}: {h.event}{h.slot ? ` → ${slotSays(h.slot)}` : ""}{h.reason ? ` (“${h.reason}”)` : ""}</li>)}</ul>}
    </div>
  );
}
