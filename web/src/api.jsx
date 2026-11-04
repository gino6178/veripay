// The website talks to the Cover server with the person's session cookie. Agents never use these routes; they use
// /mcp or /api/agent with their own token. Also here: the router (plain history API), the language and a device id.
import { createContext, useCallback, useContext, useEffect, useState } from "react";

export async function api(path, { method = "GET", body } = {}) {
  const r = await fetch(path, { method, credentials: "same-origin", headers: { ...(body ? { "Content-Type": "application/json" } : {}), "X-Cover-Device": device() }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(j.message || j.error || `HTTP ${r.status}`), { status: r.status, body: j });
  return j;
}
// a GET that loads on mount and again on reload() or whenever `tick` changes
export function useApi(path, tick = 0) {
  const [state, set] = useState({ data: null, error: null, loading: true });
  const load = useCallback(() => {
    if (!path) return;
    let off = false;
    api(path).then((data) => !off && set({ data, error: null, loading: false })).catch((error) => !off && set((s) => ({ ...s, error, loading: false })));
    return () => { off = true; };
  }, [path]);
  useEffect(load, [load, tick]);
  return { ...state, reload: load };
}
// a random id kept in this browser: fraud.js notices one device behind several policyholders
function device() { try { let d = localStorage.getItem("cover.device"); if (!d) { d = crypto.randomUUID(); localStorage.setItem("cover.device", d); } return d; } catch { return "unknown"; } }

// ---- routing ----
const listeners = new Set();
export function navigate(to, { replace = false } = {}) { history[replace ? "replaceState" : "pushState"](null, "", to); listeners.forEach((f) => f()); window.scrollTo(0, 0); }
export function usePath() {
  const [p, set] = useState(location.pathname + location.search);
  useEffect(() => { const f = () => set(location.pathname + location.search); listeners.add(f); addEventListener("popstate", f); return () => { listeners.delete(f); removeEventListener("popstate", f); }; }, []);
  return p;
}
export function Link({ to, children, ...rest }) {
  return <a href={to} {...rest} onClick={(e) => { if (e.metaKey || e.ctrlKey || e.shiftKey || e.button) return; e.preventDefault(); navigate(to); rest.onClick?.(e); }}>{children}</a>;
}

// ---- language: Chinese first, English for everything ----
export const Lang = createContext({ lang: "zh", set: () => {} });
export const useLang = () => useContext(Lang);
// t("中文", "English")
export function useT() { const { lang } = useLang(); return (zh, en) => (lang === "en" ? en : zh); }

// ---- money and dates ----
export const usd = (cents) => `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const cents = (s) => Math.round(parseFloat(String(s).replace(/[$,]/g, "")) * 100) || 0;
export const day = (iso) => (iso ? iso.slice(0, 10) : "—");
export const when = (iso) => (iso ? new Date(iso).toLocaleString("sv-SE", { hour12: false }).slice(0, 16) : "—");
export const secs = (n) => (n == null ? "—" : n < 60 ? `${n} s` : n < 3600 ? `${Math.round(n / 60)} min` : `${(n / 3600).toFixed(1)} h`);
