// The back office's agents, in the shape AG Studio's agent framework uses (an agent is an inert definition: id, name,
// description, instructions(), tools(), run), on a small harness of Cover's own with one primary agent that delegates.
// AG Studio's harness needs an AG Studio licence (ag-studio is commercial and bundles AG Grid Enterprise), so this one
// stands in for it: each definition here can be handed to Studio's createAiHarness({ agents, primary }) unchanged in
// shape once the hackathon's trial key is set, with the grid tools becoming Studio tools.
//   lead      the primary: reads the question and hands it to one of the two below
//   watcher   the anomaly-alert agent: polls /api/staff/alerts (rules over claims, people and the ledger), tells the
//             staff member about any alert it hasn't raised before, and on request shows an alert's rows in the grid
//   grid      the natural-language grid agent: posts the question and the grid's columns to /api/staff/ask, which
//             answers with tool calls (filter_grid, sort_grid, search_grid, say) written by the local model when it
//             is reachable and by rules when it isn't; the harness runs them here, against AG Grid's API, the way
//             Studio's clientToolRunner runs a server's tool calls in the browser
import { api } from "../../api.jsx";

// ---- the grids the agents can drive: each page registers its AG Grid api under a name ----------------------------------
const grids = new Map();
export function registerGrid(name, handle) { grids.set(name, handle); return () => grids.get(name) === handle && grids.delete(name); }
export const gridNames = () => [...grids.keys()];

// ---- tools ------------------------------------------------------------------------------------------------------------
const tool = (name, description, fn) => ({ name, description, run: fn });
const need = (g) => { const h = grids.get(g); if (!h) throw new Error(`No grid called ${g} on this page.`); return h; };
export const TOOLS = {
  filter_grid: tool("filter_grid", "Show only the rows that pass every filter: [{ field, op, value }]", ({ grid, filters }) => { need(grid).setPlan({ filters: filters || [] }); return `${filters?.length || 0} filter(s) on ${grid}`; }),
  sort_grid: tool("sort_grid", "Sort the grid: [{ colId, sort: asc|desc }]", ({ grid, sort }) => { need(grid).sort(sort || []); return `sorted ${grid} by ${(sort || []).map((s) => `${s.colId} ${s.sort}`).join(", ")}`; }),
  search_grid: tool("search_grid", "Search every column of the grid for some text", ({ grid, text }) => { need(grid).setPlan({ filters: [], quick: text }); return `searched ${grid} for "${text}"`; }),
  clear_grid: tool("clear_grid", "Remove the agent's filters", ({ grid }) => { need(grid).setPlan({ filters: [] }); return `cleared ${grid}`; }),
  say: tool("say", "Tell the staff member something", ({ text }) => text),
};

// ---- the agents -------------------------------------------------------------------------------------------------------
export const watcher = {
  id: "watcher",
  name: "Anomaly watcher",
  description: "Watches claims and the ledger for one PayPal behind several claimants, a burst of claims from one state or ZIP code (after a hurricane, say), a loss ratio over 80%, and payouts stuck unclaimed.",
  instructions: () => "Raise each alert once. Never decide a claim: an alert asks a person to look.",
  tools: () => [TOOLS.filter_grid, TOOLS.sort_grid, TOOLS.say],
  async *run({ alert }) {
    if (!alert) {
      const r = await api("/api/staff/alerts");
      const open = r.alerts.filter((a) => !a.acked);
      yield { type: "say", agent: "watcher", text: open.length ? `${open.length} open alert${open.length > 1 ? "s" : ""}: ${open.slice(0, 3).map((a) => a.title[1]).join("; ")}.` : "Nothing out of the ordinary right now." };
      return;
    }
    yield { type: "say", agent: "watcher", text: `${alert.title[1]}. ${alert.says[1]}` };
    for (const c of alert.plan || []) yield* call(c, "watcher");
  },
};

export const gridAgent = {
  id: "grid",
  name: "Grid agent",
  description: "Turns a question about the grid into filters and a sort.",
  instructions: () => `Grids on this page: ${gridNames().join(", ")}.`,
  tools: () => [TOOLS.filter_grid, TOOLS.sort_grid, TOOLS.search_grid, TOOLS.say],
  async *run({ question, grid }) {
    const h = need(grid);
    const r = await api("/api/staff/ask", { method: "POST", body: { grid, question, columns: h.columns() } });
    yield { type: "model", agent: "grid", by: r.by, fellBack: r.fellBack };
    for (const c of r.calls) yield* call(c, "grid");
  },
};

const ABOUT_ALERTS = /^\s*(alerts?|anomal\w*|what('s| is) (wrong|odd|up)|anything (odd|wrong)|警示|異常|有什麼問題)\b/i;
export const lead = {
  id: "lead",
  name: "Back office",
  description: "Hands a question to the watcher or the grid agent.",
  instructions: () => "Route: questions about alerts go to the watcher; questions about rows go to the grid agent.",
  tools: () => [delegateTo(["watcher", "grid"])],
  async *run(input) {
    const to = input.alert || ABOUT_ALERTS.test(input.question || "") ? "watcher" : "grid";
    yield { type: "delegate", agent: "lead", to };
    yield* AGENTS[to].run(input);
  },
};
const AGENTS = { lead, watcher, grid: gridAgent };
function delegateTo(ids) { return tool("delegate_to", `Hand the task to one of: ${ids.join(", ")}`, () => null); }

async function* call(c, agent) {
  const t = TOOLS[c.tool];
  if (!t) { yield { type: "error", agent, text: `unknown tool ${c.tool}` }; return; }
  try { const out = t.run(c.args || {}); yield c.tool === "say" ? { type: "say", agent, text: out } : { type: "tool", agent, tool: c.tool, args: c.args, text: out }; }
  catch (e) { yield { type: "error", agent, text: e.message }; }
}

// ---- the harness: one primary, a run is a stream of events ------------------------------------------------------------
export function createHarness({ agents = AGENTS, primary = "lead" } = {}) {
  return {
    agents: Object.values(agents).map(({ id, name, description }) => ({ id, name, description })),
    async run(input, onEvent) {
      const events = [];
      try { for await (const e of agents[primary].run(input)) { events.push(e); onEvent?.(e); } }
      catch (e) { const ev = { type: "error", agent: primary, text: e.message }; events.push(ev); onEvent?.(ev); }
      return events;
    },
  };
}

// ---- the watcher's loop: new alerts since the last look ---------------------------------------------------------------
export function watch(onUpdate, { every = 20e3 } = {}) {
  let known = null, off = false, timer;
  const look = async () => {
    try {
      const r = await api("/api/staff/alerts");
      const fresh = known ? r.alerts.filter((a) => !a.acked && !known.has(a.id)) : [];
      known = new Set(r.alerts.map((a) => a.id));
      if (!off) onUpdate(r, fresh);
    } catch (e) { if (!off) onUpdate(null, [], e); }
    if (!off) timer = setTimeout(look, every);
  };
  look();
  return { stop() { off = true; clearTimeout(timer); }, now() { clearTimeout(timer); look(); } };
}

// ---- the predicate the grid's external filter runs ---------------------------------------------------------------------
export function passes(row, filters) {
  for (const f of filters) {
    const v = row[f.field];
    switch (f.op) {
      case "eq": if (Array.isArray(v) ? !v.includes(f.value) : String(v ?? "") !== String(f.value)) return false; break;
      case "in": { const set = (Array.isArray(f.value) ? f.value : [f.value]).map(String); if (Array.isArray(v) ? !v.some((x) => set.includes(String(x))) : !set.includes(String(v ?? ""))) return false; break; }
      case "contains": if (!(Array.isArray(v) ? v.join(" ") : String(v ?? "")).toLowerCase().includes(String(f.value).toLowerCase())) return false; break;
      case "gt": if (!(+v > +f.value)) return false; break;
      case "gte": if (!(+v >= +f.value)) return false; break;
      case "lt": if (!(+v < +f.value)) return false; break;
      case "lte": if (!(+v <= +f.value)) return false; break;
      case "nonempty": if (Array.isArray(v) ? !v.length : v == null || v === "") return false; break;
      case "empty": if (Array.isArray(v) ? v.length : !(v == null || v === "")) return false; break;
      default: break;
    }
  }
  return true;
}
