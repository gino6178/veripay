// Cell renderers for the back office's grids, drawn the way DESIGN.md draws parts: a job's status is a badge, its
// number a part tag, money in mono, a hold's expiry as days left (amber inside 3 days, red inside 1).
import { Status, Src } from "../job.jsx";

export const money = (c) => (c == null ? "—" : `$${(c / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
export function MoneyCell({ value }) { return <span className="num">{money(value)}</span>; }
export function StatusCell({ value }) { return value ? <span className="bo-cell"><Status s={value} /></span> : null; }
export function NumberCell({ value }) { return <span className="part">{value}</span>; }
export function SourceCell({ value }) { return value ? <span className="bo-cell"><Src s={value} /></span> : <span className="muted">—</span>; }
export function BalancedCell({ value }) { return value ? <span className="ok mono tiny">to the cent</span> : <span className="badge bad">off</span>; }
export function DateCell({ value }) { return <span className="num tiny">{value ? new Date(value).toLocaleString("en-US", { timeZone: "America/Chicago", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "—"}</span>; }
export function IdCell({ value }) { return <span className="mono tiny">{value || "—"}</span>; }
export function ExpiryCell({ value, context }) {
  if (!value) return <span className="muted">—</span>;
  const d = (Date.parse(value) - Date.parse(context?.now || new Date().toISOString())) / 864e5;
  return <span className={`num ${d < 1 ? "bad" : d < 3 ? "warn" : ""}`}>{d < 0 ? "expired" : d < 1 ? `${Math.round(d * 24)} h` : `${d.toFixed(1)} d`}</span>;
}
