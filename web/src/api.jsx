// The website talks to the VeriPay server with the person's session cookie. Agents never use these routes; they use
// /mcp, /a2a or /api/agent with their own token. Also here: the router (plain history API) and formatting helpers.
import { useCallback, useEffect, useState } from "react";

export async function api(path, { method = "GET", body, form, retried } = {}) {
  const r = await fetch(path, { method, credentials: "same-origin", headers: body ? { "Content-Type": "application/json" } : {}, body: form || (body ? JSON.stringify(body) : undefined) });
  const j = scrub(await r.json().catch(() => ({})));
  // only the person may do this: confirm with the PIN in the page, then send the same request once more
  if (r.status === 403 && j.error === "step_up" && !retried && stepUpHandler) {
    if (await stepUpHandler({ path, method })) return api(path, { method, body, form, retried: true });
    throw Object.assign(new Error("Not done: it needs your PIN."), { status: 403, body: j, cancelled: true });
  }
  if (!r.ok) throw Object.assign(new Error(j.message || j.error || `HTTP ${r.status}`), { status: r.status, body: j });
  // a PIN sign-in, onboarding, link sign-in or step-up confirms the person for 10 minutes (the server doesn't say until when on /api/me)
  if (method === "POST" && (/^\/api\/auth\/(demo|link|step-up)$/.test(path) || path === "/api/pro/onboard")) markConfirmed(j.until ? Date.parse(j.until) : Date.now() + 10 * 60e3);
  if (method === "POST" && /^\/api\/auth\/signout$/.test(path)) markConfirmed(0);
  return j;
}
// the server still tags fictional names "(demo)", "(demo registry)"; the page shows one Demo badge instead
const TAG = /\s*\((?:demo(?: registry| pro| payout address)?|fictional(?: demo)?|simulated)\)/gi;
function scrub(x) {
  if (typeof x === "string") return x.replace(TAG, "").replace(/^Demo · /, "");
  if (Array.isArray(x)) { for (let i = 0; i < x.length; i++) x[i] = scrub(x[i]); return x; }
  if (x && typeof x === "object") { for (const k in x) x[k] = scrub(x[k]); return x; }
  return x;
}
export function markConfirmed(until) { try { localStorage.setItem("done.confirmedUntil", String(until || 0)); } catch {} dispatchEvent(new Event("done:confirmed")); }
export function confirmedUntil() { try { return +localStorage.getItem("done.confirmedUntil") || 0; } catch { return 0; } }
let stepUpHandler = null;
export const setStepUpHandler = (f) => { stepUpHandler = f; };
// a GET that loads on mount, again on reload(), whenever `tick` changes, and on the app-wide "done:refresh" event
export function useApi(path, tick = 0) {
  const [state, set] = useState({ data: null, error: null, loading: !!path });
  const load = useCallback(() => {
    if (!path) return;
    let off = false;
    api(path).then((data) => !off && set({ data, error: null, loading: false })).catch((error) => !off && set((s) => ({ ...s, error, loading: false })));
    return () => { off = true; };
  }, [path]);
  useEffect(load, [load, tick]);
  useEffect(() => { const f = () => load(); addEventListener("done:refresh", f); return () => removeEventListener("done:refresh", f); }, [load]);
  return { ...state, reload: load, set: (data) => set({ data, error: null, loading: false }) };
}
export const refresh = () => dispatchEvent(new Event("done:refresh"));

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

// ---- money and dates (Austin time for people; ids and amounts as the server gives them) ----
export const usd = (c) => (c == null ? "—" : `$${(c / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
export const m = (money) => money?.usd ?? "—"; // a money object { cents, usd }
export const dollars = (s) => { const n = parseFloat(String(s).replace(/[$,]/g, "")); return Number.isFinite(n) ? n : null; };
const TZ = "America/Chicago";
export const when = (iso) => (iso ? new Date(iso).toLocaleString("en-US", { timeZone: TZ, month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "—");
export const day = (iso) => (iso ? new Date(iso).toLocaleDateString("en-US", { timeZone: TZ, month: "short", day: "numeric" }) : "—");
export const clock = (iso) => (iso ? new Date(iso).toLocaleTimeString("en-US", { timeZone: TZ, hour: "numeric", minute: "2-digit", second: "2-digit" }) : "—");
export const secs = (n) => (n == null ? "—" : n < 60 ? `${n} s` : n < 3600 ? `${Math.round(n / 60)} min` : `${(n / 3600).toFixed(1)} h`);
export const inDays = (iso, now) => { if (!iso) return null; const d = (Date.parse(iso) - Date.parse(now || new Date().toISOString())) / 864e5; return d; };
export const plural = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`;
