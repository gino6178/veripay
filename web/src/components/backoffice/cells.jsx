// Cell renderers for the back office's grids: each part carries its id the way DESIGN.md draws parts. A claim's
// status is a badge, the clauses it was decided under are part tags, fraud signals are a count with their weight,
// and a loss ratio is a measured bar with the 80% line marked.
import { useT } from "../../api.jsx";
import { Status } from "../../pages/Policies.jsx";

export const NAME = { travel: ["旅遊險", "Travel"], renters: ["租屋險", "Renters"], home: ["房屋險", "Homeowners"], pet: ["寵物險", "Pet"], life: ["定期壽險", "Term life"], car: ["汽機車險", "Car and scooter"] };
export const nameOf = (p) => NAME[p] || [p, p];
export const pct = (x) => (x == null ? "—" : `${Math.round(x * 100)}%`);
export const money = (c) => (c == null ? "—" : `$${(c / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);

export function StatusCell({ value, data }) {
  return <span className="bo-cell">{value ? <Status s={value} /> : null}{data?.appeal === "open" && <span className="badge agent">appeal</span>}</span>;
}

export function ProductCell({ value }) {
  const t = useT();
  return NAME[value] ? <span>{t(...NAME[value])}</span> : <span>{value}</span>;
}

// the clauses a decision rests on, as part tags
export function ClauseCell({ value }) {
  const ids = Array.isArray(value) ? value : [];
  if (!ids.length) return <span className="muted">—</span>;
  return <span className="bo-cell">{ids.slice(0, 3).map((id) => <span key={id} className="part">{id}</span>)}{ids.length > 3 && <span className="tiny muted">+{ids.length - 3}</span>}</span>;
}

// fraud signals: how many fired, and their summed weight as ticks (each signal's weight is 1 to 3)
export function SignalCell({ value, data }) {
  const n = value || 0, w = (data?.signalList || []).reduce((s, x) => s + (x.weight || 1), 0);
  if (!n) return <span className="bo-sig zero">0</span>;
  return <span className={`bo-sig ${w >= 5 ? "hot" : ""}`} title={(data?.signalList || []).map((s) => `${s.signal} (w${s.weight}): ${s.says}`).join("\n")}>
    <b>⚑ {n}</b><span className="ticks" aria-hidden="true">{Array.from({ length: Math.min(9, w) }, (_, i) => <i key={i} />)}</span><span className="sr">weight {w}</span>
  </span>;
}

// which of the agent's alerts name this row
export function AlertCell({ value }) {
  const t = useT(), list = Array.isArray(value) ? value : [];
  if (!list.length) return null;
  const L = { shared_payout: t("同一 PayPal", "shared PayPal"), shared_device: t("同一裝置", "shared device"), area_burst: t("同區暴增", "area burst"), district_burst: t("同區暴增", "area burst"), flight_burst: t("航班大亂", "flight burst"), payout_stuck: t("款項卡住", "payout stuck"), queue_age: t("等太久", "waiting long") };
  return <span className="bo-cell">{[...new Set(list)].map((k) => <span key={k} className="badge bad">{L[k] || k}</span>)}</span>;
}

// who decided a claim: the flight data (parametric), the rules (paid in seconds) or a person
export function DeciderCell({ value }) {
  const t = useT();
  if (!value) return <span className="muted">—</span>;
  const L = { parametric: ["參數自動", "parametric", "agent"], rules: ["規則秒賠", "rules", "good"], adjuster: ["理賠員", "adjuster", ""] }[value] || [value, value, ""];
  return <span className={`badge ${L[2]}`}>{t(L[0], L[1])}</span>;
}

// a flight: its number and the airport, as parts
export function FlightCell({ data }) {
  if (!data?.flight && !data?.airport) return <span className="muted">—</span>;
  return <span className="bo-cell">{data.flight && <span className="part">{data.flight}</span>}{data.airport && <span className="mono tiny muted">{data.airport}</span>}</span>;
}

export function MoneyCell({ value }) { return <span className="num">{money(value)}</span>; }

// a loss ratio, measured: the bar, the 80% mark, the number
export function RatioCell({ value }) {
  if (value == null) return <span className="muted">—</span>;
  return <span className="bo-ratio">
    <span className={`bar ${value > 1 ? "bad" : value > 0.8 ? "warn" : ""}`}><i style={{ width: `${Math.min(100, value * 100)}%` }} /><em style={{ left: "80%" }} aria-hidden="true" /></span>
    <span className="num">{pct(value)}</span>
  </span>;
}

export function LevelCell({ value }) { return value ? <span className={`lv l${value}`}>{value}</span> : <span className="muted">—</span>; }

export function DateCell({ value }) { return <span className="num tiny">{value ? new Date(value).toLocaleString("sv-SE", { hour12: false }).slice(0, 16) : "—"}</span>; }
export function IdCell({ value }) { return <span className="mono tiny">{value}</span>; }
