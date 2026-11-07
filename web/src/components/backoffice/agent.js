// The back office's grid agent: a staff member asks in plain words ("holds expiring this week", "disputed jobs",
// "plumbing over $200, biggest first"); the server (POST /api/staff/ask) answers with a plan for one AG Grid (filters
// and a sort, written by the model when one is serving and valid, else by rules, and labelled). It never acts on a job.
// Each tab registers its AG Grid handle under a name; a plan for a grid that isn't on screen waits until it registers.
import { api } from "../../api.jsx";

const grids = new Map(), pending = new Map();
export function registerGrid(name, handle) {
  grids.set(name, handle);
  if (pending.has(name)) { const p = pending.get(name); pending.delete(name); setTimeout(() => apply(name, p), 0); }
  return () => grids.get(name) === handle && grids.delete(name);
}
function apply(name, plan) {
  const h = grids.get(name);
  if (!h) { pending.set(name, plan); return false; }
  h.setPlan({ filters: plan.filters || [], quick: "" });
  h.sort(plan.sort ? [{ colId: plan.sort.field, sort: plan.sort.dir }] : []);
  return true;
}

// ask the server; returns the plan and applies it (now, or when that grid's tab opens)
export async function ask(question) {
  const r = await api("/api/staff/ask", { method: "POST", body: { question } });
  apply(r.grid, r);
  return r;
}

// the predicate the grid's external filter runs (the server's ops)
export function passes(row, filters) {
  for (const f of filters) {
    const v = row[f.field];
    switch (f.op) {
      case "equals": case "eq": if (String(v ?? "") !== String(f.value)) return false; break;
      case "notEqual": if (String(v ?? "") === String(f.value)) return false; break;
      case "contains": if (!String(v ?? "").toLowerCase().includes(String(f.value).toLowerCase())) return false; break;
      case "greaterThan": case "gt": if (!(+v > +f.value) && !(Date.parse(v) > Date.parse(f.value))) return false; break;
      case "lessThan": case "lt": if (!(+v < +f.value) && !(Date.parse(v) < Date.parse(f.value))) return false; break;
      case "inRange": { const [a, b] = Array.isArray(f.value) ? f.value : [f.value?.from, f.value?.to]; const x = Number.isFinite(+v) && v !== "" && v != null ? +v : Date.parse(v); const lo = Number.isFinite(+a) ? +a : Date.parse(a), hi = Number.isFinite(+b) ? +b : Date.parse(b); if (!(x >= lo && x <= hi)) return false; break; }
      case "blank": if (!(v == null || v === "")) return false; break;
      case "notBlank": if (v == null || v === "") return false; break;
      case "in": if (!(Array.isArray(f.value) ? f.value : [f.value]).map(String).includes(String(v ?? ""))) return false; break;
      default: break;
    }
  }
  return true;
}
