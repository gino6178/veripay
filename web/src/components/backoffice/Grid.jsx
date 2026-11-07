// One AG Grid as the back office uses it: the VeriPay theme, a toolbar (search, the agent's filters as removable chips,
// CSV, reset the layout), the column layout kept per person in this browser (AG Grid's grid state), and a handle the
// agents drive (registerGrid): their filters run as AG Grid's external filter, their sorts as column state.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AgGridReact } from "ag-grid-react";
import { gridTheme } from "./theme.js";
import { registerGrid, passes } from "./agent.js";
import { money } from "./cells.jsx";

const KEY = (name) => `done.grid.${name}.v1`;
const load = (name) => { try { return JSON.parse(localStorage.getItem(KEY(name)) || "null") || undefined; } catch { return undefined; } };
const keep = (name, s) => { try { localStorage.setItem(KEY(name), JSON.stringify(s)); } catch {} };
const forget = (name) => { try { localStorage.removeItem(KEY(name)); } catch {} };
const OPS = { equals: "=", eq: "=", notEqual: "≠", in: "in", contains: "has", greaterThan: ">", gt: ">", lessThan: "<", lt: "<", inRange: "between", blank: "is empty", notBlank: "is set" };

export default function Grid({ name, title, rows, columnDefs, agentColumns, height = 420, autoHeight = false, selected, onPick, getRowId, csv, pagination = false, pageSize = 20, extra, defaultColDef, onReady, context }) {
  const ref = useRef(null), plan = useRef({ filters: [], quick: "" });
  const [shown, setShown] = useState({ filters: [], quick: "" }), [quick, setQuick] = useState(""), [count, setCount] = useState(null);
  const initialState = useMemo(() => load(name), [name]);
  const cols = useMemo(() => Object.fromEntries((agentColumns || []).map((c) => [c.field, c])), [agentColumns]);

  const apply = useCallback((next) => {
    plan.current = { filters: next.filters || [], quick: next.quick ?? "" };
    setShown(plan.current); setQuick(plan.current.quick);
    ref.current?.api?.onFilterChanged();
  }, []);
  // the handle the agents drive
  useEffect(() => registerGrid(name, {
    setPlan: apply,
    sort: (sort) => ref.current?.api?.applyColumnState({ state: sort, defaultState: { sort: null } }),
    columns: () => (agentColumns || []).map((c) => ({ ...c, values: c.kind === "text" || c.kind === "enum" ? [...new Set((rows || []).map((r) => r[c.field]).flat().filter((v) => v != null && v !== ""))].slice(0, 60) : undefined })),
  }), [name, apply, agentColumns, rows]);
  useEffect(() => { ref.current?.api?.redrawRows(); }, [selected]);

  const label = (f) => {
    const c = cols[f.field], v = Array.isArray(f.value) ? f.value.join(", ") : c?.kind === "money" ? money(f.value) : f.value;
    return `${c ? c.header : f.field} ${OPS[f.op] || f.op} ${v}`;
  };
  const drop = (i) => apply({ ...plan.current, filters: plan.current.filters.filter((_, j) => j !== i) });
  const counted = () => { const a = ref.current?.api; if (a) setCount(a.getDisplayedRowCount()); };

  return (
    <div className="bo-grid">
      <div className="bo-bar">
        {title && <h3>{title}</h3>}
        <label className="bo-search"><span className="sr">{"Search"}</span>
          <input className="input" value={quick} placeholder={"Search this grid"} onChange={(e) => { setQuick(e.target.value); plan.current = { ...plan.current, quick: e.target.value }; }} />
        </label>
        {extra}
        <span className="bo-count num tiny">{count != null && rows ? `${count} / ${rows.length}` : ""}</span>
        <button className="btn ghost sm" onClick={() => ref.current?.api?.exportDataAsCsv({ fileName: `${csv || name}.csv`, processCellCallback: (p) => (Array.isArray(p.value) ? p.value.join(" ") : p.value) })}>CSV</button>
        <button className="btn ghost sm" title={"Column widths, order and sort back to default"} onClick={() => { forget(name); const a = ref.current?.api; a?.resetColumnState(); apply({ filters: [], quick: "" }); }}>{"Reset layout"}</button>
      </div>
      {shown.filters.length > 0 && <div className="bo-chips" aria-label={"Filters the agent applied"}>
        <span className="tiny muted mono">{"agent filter"}</span>
        {shown.filters.map((f, i) => <button key={i} className="bo-chip" onClick={() => drop(i)} title={"Remove"}>{label(f)} <span aria-hidden="true">×</span></button>)}
        <button className="link tiny" onClick={() => apply({ filters: [], quick: "" })}>{"Clear all"}</button>
      </div>}
      <div style={autoHeight ? undefined : { height }}>
        <AgGridReact
          ref={ref}
          theme={gridTheme}
          rowData={rows || null}
          columnDefs={columnDefs}
          defaultColDef={{ sortable: true, resizable: true, filter: true, floatingFilter: false, minWidth: 80, ...defaultColDef }}
          getRowId={getRowId}
          context={context}
          domLayout={autoHeight ? "autoHeight" : "normal"}
          initialState={initialState}
          onStateUpdated={(e) => { const { filter, rowSelection, scroll, focusedCell, pagination: pg, ...layout } = e.state; keep(name, layout); }}
          quickFilterText={quick}
          isExternalFilterPresent={() => plan.current.filters.length > 0}
          doesExternalFilterPass={(node) => passes(node.data, plan.current.filters)}
          rowClassRules={{ "bo-on": (p) => selected != null && getRowId && getRowId({ data: p.data }) === selected }}
          onRowClicked={onPick ? (e) => onPick(e.data) : undefined}
          onCellKeyDown={onPick ? (e) => { if (e.event?.key === "Enter") onPick(e.data); } : undefined}
          onModelUpdated={counted}
          onGridReady={(e) => { counted(); onReady?.(e.api); }}
          pagination={pagination}
          paginationPageSize={pageSize}
          paginationPageSizeSelector={pagination ? [10, 20, 50, 100] : false}
          tooltipShowDelay={300}
          enableCellTextSelection
          ensureDomOrder
          animateRows
          overlayNoRowsTemplate={`<span class="muted small">${"No rows match"}</span>`}
        />
      </div>
    </div>
  );
}
