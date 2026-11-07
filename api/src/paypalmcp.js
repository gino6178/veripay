// PayPal's own hosted MCP server (https://mcp.sandbox.paypal.com/http in the sandbox): the same PayPal tools the Agent
// Toolkit bundles, served by PayPal over MCP's Streamable HTTP transport and authorized with the app's OAuth access
// token (Bearer). VeriPay connects to it as an MCP client, lists its tools, and can run the read tools through it:
//   tools()      the tool list PayPal serves (name, description), cached for 10 minutes
//   call(n, a)   one tool call; the result's text is parsed as JSON when it is JSON
// Only with real sandbox keys (PAYPAL_MODE=sandbox): the stand-in has no MCP server, and status() says so.
// Read tools run at once (get_, list_, show_, search_); a few writes that move no money can be proposed and run after
// a staff approval (below); every other tool (create, pay, refund, accept, record_payment_for_...)
// is refused here, so money never moves and no PayPal record changes through this path.
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import crypto from "node:crypto";
import { pp, why } from "./pay/index.js";
import { store, stateFile } from "./store.js";

export const URL_SANDBOX = process.env.PAYPAL_MCP_URL || "https://mcp.sandbox.paypal.com/http";
const URL_SSE = URL_SANDBOX.replace(/\/http$/, "/sse");
const READ = /^(get|list|show|search)_/;
let conn = null, listed = null, lastError = null, via = null;

async function client() {
  if (conn) return conn;
  if (pp().mode !== "sandbox") throw new Error("PayPal's MCP server needs real sandbox keys (PAYPAL_MODE=sandbox); this server runs the stand-in.");
  const token = await pp().accessToken();
  const requestInit = { headers: { Authorization: `Bearer ${token}` } };
  // Streamable HTTP first; the sandbox answered 404 there on 2026-11-07 while its SSE endpoint worked, so SSE next
  let c = new Client({ name: "veripay", version: "1.0.0" });
  try { await c.connect(new StreamableHTTPClientTransport(new URL(URL_SANDBOX), { requestInit })); via = "streamable-http"; }
  catch { c = new Client({ name: "veripay", version: "1.0.0" }); await c.connect(new SSEClientTransport(new URL(URL_SSE), { requestInit, eventSourceInit: { fetch: (u, i) => fetch(u, { ...i, headers: { ...i?.headers, ...requestInit.headers } }) } })); via = "sse"; }
  conn = c;
  setTimeout(() => { conn?.close().catch(() => {}); conn = null; }, 25 * 60e3).unref(); // tokens last ~9h; reconnect well before
  return c;
}

export async function tools({ fresh = false } = {}) {
  if (!fresh && listed && Date.now() - listed.at < 10 * 60e3) return listed;
  try {
    const r = await (await client()).listTools();
    listed = { at: Date.now(), url: via === "sse" ? URL_SSE : URL_SANDBOX, via, tools: r.tools.map((t) => ({ name: t.name, says: String(t.description || "").split("\n")[0].slice(0, 160), read: READ.test(t.name), kind: kindOf(t.name) })) };
    lastError = null;
    return listed;
  } catch (e) { lastError = why(e); conn = null; return { url: URL_SANDBOX, tools: [], error: lastError }; }
}

export async function call(name, args = {}) {
  if (!READ.test(name)) return { error: { message: `${name} moves money or changes PayPal records; VeriPay runs only read tools through PayPal's MCP server.` } };
  try {
    const r = await (await client()).callTool({ name, arguments: args });
    const text = (r.content || []).filter((x) => x.type === "text").map((x) => x.text).join("\n");
    if (r.isError) return { error: { message: text.slice(0, 500) || "tool error" } };
    try { return JSON.parse(text); } catch { return { text: text.slice(0, 4000) }; }
  } catch (e) { conn = null; return { error: { message: why(e) } }; }
}

export const status = () => ({ url: via === "sse" ? URL_SSE : URL_SANDBOX, via, available: pp().mode === "sandbox", connected: !!conn, tools: listed?.tools?.length ?? null, lastError,
  note: pp().mode === "sandbox" ? null : "Runs with real sandbox keys only; the stand-in has no MCP server." });

// ---- writes through PayPal's MCP server: proposed, then approved by staff, one by one ------------------------------
// Only writes that move no money and touch no customer's payment are allowed, and each waits for a staff approval:
// tracking, invoice reminders and QR codes, invoice numbers, catalog products. Everything else that writes (refunds,
// orders, captures, subscriptions, invoices sent or paid, dispute claims) stays refused on this path.
export const APPROVABLE = ["create_shipment_tracking", "update_shipment_tracking", "send_invoice_reminder", "generate_invoice_qr_code", "generate_invoice_number", "setup_invoice_auto_reminders", "update_invoice_auto_reminder", "cancel_invoice_auto_reminder", "create_product", "update_product"];
export const kindOf = (name) => (READ.test(name) ? "read" : APPROVABLE.includes(name) ? "write_with_approval" : "refused");
const pdb = store(stateFile("paypal-mcp-proposals"), { items: [] });
export const proposals = () => pdb.data.items.slice(-50).reverse();
export function propose(name, args = {}, { by = "staff", why: reason = "" } = {}) {
  const k = kindOf(String(name));
  if (k === "read") return { error: "read", message: "A read tool runs at once (POST /api/staff/paypal-mcp/call)." };
  if (k === "refused") return { error: "refused", message: `${name} moves money or changes a customer's payment; it never runs through PayPal's MCP server here.` };
  const p = { id: `mcpw_${crypto.randomBytes(4).toString("hex")}`, tool: name, args: args && typeof args === "object" ? args : {}, by, why: String(reason).slice(0, 300), status: "proposed", at: new Date().toISOString() };
  pdb.data.items.push(p); if (pdb.data.items.length > 200) pdb.data.items.shift(); pdb.save();
  return p;
}
export async function decide(id, approve, by = "staff") {
  const p = pdb.data.items.find((x) => x.id === id);
  if (!p || p.status !== "proposed") return { error: "state", message: "Nothing waiting with that id." };
  if (!approve) { p.status = "rejected"; p.decidedAt = new Date().toISOString(); p.decidedBy = by; pdb.save(); return p; }
  if (kindOf(p.tool) !== "write_with_approval") return { error: "refused", message: "Not an approvable tool." };
  let r;
  try { r = await (await client()).callTool({ name: p.tool, arguments: p.args }); }
  catch (e) { conn = null; p.status = "failed"; p.result = { error: why(e) }; pdb.save(); return p; }
  const text = (r.content || []).filter((x) => x.type === "text").map((x) => x.text).join("\n");
  p.status = r.isError ? "failed" : "done"; p.decidedAt = new Date().toISOString(); p.decidedBy = by;
  try { p.result = JSON.parse(text); } catch { p.result = { text: text.slice(0, 2000) }; }
  pdb.save();
  return p;
}
