// Connect your agent: the MCP config to paste, a token with the scopes the person picks, the limits in dollars that
// only the person can change, and what the agent has done (its steps are in the activity feed).
import { useEffect, useRef, useState } from "react";
import { loadSdk } from "../components/PayPalButtons.jsx";
import { api, Link, useApi, when, dollars } from "../api.jsx";
import { useMe } from "../App.jsx";
import { Mandates } from "../components/Mandates.jsx";
import { Src } from "../components/job.jsx";

const SC = { read: ["Read", "see your jobs, offers and limits; wait for news"], hire: ["Hire", "post jobs, counter, accept (which holds the money), approve change orders, cancel"], pay: ["Pay", "release, ask for a fix, open a dispute"] };
const usdIn = (s) => (s ? String(s).replace(/[$,]/g, "").replace(/\.00$/, "") : "");

export default function Connect() {
  const { me, toast, info, reload } = useMe(), signed = me?.person?.role === "customer";
  const cfg = useApi(signed ? "/api/mcp-config" : null), tokens = useApi(signed ? "/api/tokens" : null), limits = useApi(signed ? "/api/limits" : null), feed = useApi(signed ? "/api/activity" : null);
  const [label, setLabel] = useState("Claude"), [scopes, setScopes] = useState(["read", "hire"]), [made, setMade] = useState(null), [l, setL] = useState(null), [saving, setSaving] = useState(false);
  useEffect(() => { const x = limits.data; if (x) setL({ perJobMax: usdIn(x.perJobMax), monthlyMax: usdIn(x.monthlyMax), changeMax: usdIn(x.changeMax), materialsAdvanceMax: usdIn(x.materialsAdvanceMax), bufferPct: x.bufferPct, agentMayRelease: x.agentMayRelease, agentMayCancel: x.agentMayCancel }); }, [limits.data]);
  // a decision the agent asked for (askPerson link → /connect?ask=…#limits)
  const q = new URLSearchParams(location.search), [ask, setAsk] = useState(q.get("ask")), askWould = q.get("amount") ? `$${Number(q.get("amount")).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : (ask || "").match(/\$[\d,]+(\.\d\d)?/)?.[0];
  const LIM = [["per-job", { key: "perJobMax", label: "per-job limit" }], ["monthly", { key: "monthlyMax", label: "monthly limit" }], ["change-order", { key: "changeMax", label: "change-order limit" }], ["cancel", { key: "agentMayCancel", label: "cancel permission" }], ["release", { key: "agentMayRelease", label: "release permission" }]];
  const byKey = Object.fromEntries(LIM.map(([, v]) => [v.key, v])), qLimit = q.get("limit");
  const askLimit = ask ? (qLimit && byKey[qLimit]) || (LIM.find(([w]) => ask.includes(w)) || [])[1] : null;
  const approve = async () => { setSaving(true); try { await api("/api/limits", { method: "PUT", body: { [askLimit.key]: dollars(askWould) } }); toast(`Your ${askLimit.label} is now ${askWould}. Tell your agent to try again.`); setAsk(null); limits.reload(); reload(); } catch (e) { toast(e.message, true); } setSaving(false); };
  useEffect(() => { if (location.hash === "#limits" && l) document.getElementById("limits")?.scrollIntoView({ block: "start" }); }, [!!l]);
  const mcp = cfg.data?.url || info?.mcpUrl || `${location.origin}/mcp`;
  const tok = made?.token || "done_…";
  const json = JSON.stringify({ mcpServers: { "done-and-paid": { type: "http", url: mcp, headers: { Authorization: `Bearer ${tok}` } } } }, null, 2);
  const make = async () => { try { setMade(await api("/api/tokens", { method: "POST", body: { label, scopes } })); tokens.reload(); } catch (e) { toast(e.message, true); } };
  const save = async () => { setSaving(true); try { await api("/api/limits", { method: "PUT", body: { perJobMax: dollars(l.perJobMax), monthlyMax: dollars(l.monthlyMax), changeMax: dollars(l.changeMax), materialsAdvanceMax: dollars(l.materialsAdvanceMax), bufferPct: +l.bufferPct, agentMayRelease: l.agentMayRelease, agentMayCancel: l.agentMayCancel } }); toast("Limits saved. Your agent can't change them."); limits.reload(); reload(); } catch (e) { toast(e.message, true); } setSaving(false); };

  return (
    <div className="stack-l">
      <div className="page-head"><div><h1>Connect your agent</h1><p className="lede">Your own AI agent (Claude, or any MCP or A2A client) can post jobs, negotiate, hold the money and approve change orders for you. What it may spend is set here, in dollars, and only you can change it.</p></div></div>
      {me === null && <div className="empty"><p>Sign in to make a token and set your agent's limits. The setup below works the same for everyone.</p><Link className="btn accent" to="/signin?next=/connect">Sign in</Link></div>}
      {me?.person?.role === "pro" && <p className="note">You're signed in as a pro: your agent connects over A2A with a key from <Link to="/pro/payouts">Payouts</Link>.</p>}
      <div className="grid-2">
        <div className="stack">
          {signed && ask && <div className="panel marks stack-s ask" role="region" aria-label="Your agent asks">
            <span className="eyebrow">YOUR AGENT ASKS</span>
            <p><b>Your agent asks you to {ask}.</b></p>
            <p className="small ink2">{askLimit ? `It was refused at your ${askLimit.label} of ${limits.data?.[askLimit.key] || "—"}${askWould ? `; it needs ${askWould}` : ""}. ` : ""}Only you can change this, below. Nothing changes unless you save.</p>
            <div className="row">{askLimit && askWould && <button className={`btn accent sm ${saving ? "busy" : ""}`} disabled={saving} onClick={() => approve()}>Approve: set your {askLimit.label} to {askWould}</button>}<a className="btn sm" href="#limits">Change it myself</a><button className="btn sm" onClick={() => setAsk(null)}>Decline</button></div>
          </div>}
          {signed && <SavedPayment toast={toast} reload={reload} />}
          {signed && l && <div className={`panel marks stack ${askLimit ? "ask-target" : ""}`} id="limits">
            <div className="panel-h"><h3>Your agent's limits</h3><span className="tiny muted">{limits.data?.spentThisMonth} spent this month · {limits.data?.leftThisMonth} left</span></div>
            <div className="fields-3">
              <label className="field"><span>MOST FOR ONE JOB</span><span className="money-in"><input className="input" inputMode="decimal" value={l.perJobMax} onChange={(e) => setL({ ...l, perJobMax: e.target.value })} /></span></label>
              <label className="field"><span>MOST A MONTH</span><span className="money-in"><input className="input" inputMode="decimal" value={l.monthlyMax} onChange={(e) => setL({ ...l, monthlyMax: e.target.value })} /></span></label>
              <label className="field"><span>CHANGE ORDER IT MAY APPROVE</span><span className="money-in"><input className="input" inputMode="decimal" value={l.changeMax} onChange={(e) => setL({ ...l, changeMax: e.target.value })} /></span></label>
            </div>
            <label className="field" style={{ maxWidth: 320 }}><span>MATERIALS ADVANCE IT MAY APPROVE</span><span className="money-in"><input className="input" inputMode="decimal" value={l.materialsAdvanceMax ?? ""} onChange={(e) => setL({ ...l, materialsAdvanceMax: e.target.value })} /></span>
              <span className="tiny muted" style={{ marginTop: 4 }}>A pro who must buy materials mid-job can be paid for them now, out of your hold, once the invoice and a photo on site check out. Up to this amount it's paid without asking you; above it, or to a supplier directly, you approve with your PIN.</span></label>
            <label className="field"><span>EXTRA HOLD FOR CHANGE ORDERS</span><select className="input" value={l.bufferPct} onChange={(e) => setL({ ...l, bufferPct: e.target.value })}>{[0, 10, 20, 30, 50].map((p) => <option key={p} value={p}>{p}% of the price</option>)}</select></label>
            <label className="check-row"><input type="checkbox" checked={!!l.agentMayRelease} onChange={(e) => setL({ ...l, agentMayRelease: e.target.checked })} /><span>My agent may release money when the checks leave it to me <span className="muted">(off: only I release a job in review)</span></span></label>
            <label className="check-row"><input type="checkbox" checked={!!l.agentMayCancel} onChange={(e) => setL({ ...l, agentMayCancel: e.target.checked })} /><span>My agent may cancel a job and void its hold</span></label>
            <p className="tiny muted">{limits.data?.rule} Limits bind the agent; you on this website aren't limited by them. When the agent hits one, it gets a refusal saying which limit and by how much.</p>
            <button className={`btn ${saving ? "busy" : ""}`} onClick={save} disabled={saving}>Save limits</button>
          </div>}
          {signed && <div className="panel stack">
            <h3>Make a token</h3>
            <label className="field"><span>FOR WHICH AGENT</span><input className="input" value={label} onChange={(e) => setLabel(e.target.value)} /></label>
            <div className="stack-s">{Object.entries(SC).map(([k, [n, d]]) => <label key={k} className="check-row"><input type="checkbox" checked={scopes.includes(k)} onChange={() => setScopes(scopes.includes(k) ? scopes.filter((x) => x !== k) : [...scopes, k])} /><span><b>{n}</b> <span className="muted">· {d}</span></span></label>)}</div>
            <button className="btn accent" onClick={make} disabled={!scopes.length || !label.trim()}>Make the token</button>
            {made && <div className="note good stack-s"><b>Shown only this once. It is in the config on the right.</b><code className="mono wrap-any">{made.token}</code></div>}
            {(tokens.data || []).length > 0 && <div className="stack-s"><span className="eyebrow">YOUR TOKENS</span>{tokens.data.map((x) => <div key={x.id} className="row between small" style={{ borderTop: "1px solid var(--line)", paddingTop: 8 }}><span>{x.label} <span className="mono tiny muted">{x.hint}</span><br /><span className="tiny muted">{x.scopes.join(", ")} · last used {when(x.lastUsed)}{x.revoked ? " · revoked" : ""}</span></span>{!x.revoked && <button className="btn sm" onClick={async () => { await api(`/api/tokens/${x.id}`, { method: "DELETE" }); tokens.reload(); }}>Revoke</button>}</div>)}</div>}
          </div>}
        </div>
        <div className="stack">
          <div className="panel stack-s"><h3>Add it to your agent</h3>
            <p className="small ink2">MCP over Streamable HTTP. In Claude Desktop or any MCP client config:</p>
            <pre className="terminal">{json}</pre>
            <p className="small ink2">Or Claude Code:</p>
            <pre className="terminal">{`claude mcp add --transport http done-and-paid ${mcp} \\\n  --header "Authorization: Bearer ${tok}"`}</pre>
            <p className="tiny muted">Agent guide: <a href="/llms.txt">/llms.txt</a> · A2A card: <a href="/.well-known/agent-card.json">/.well-known/agent-card.json</a> · tools: <a href="/.well-known/mcp-tools.json">mcp-tools.json</a> · REST: <span className="mono">POST /api/agent/&lt;tool&gt;</span></p>
          </div>
          <div className="panel stack-s"><h3>Then say</h3>
            <pre className="terminal" style={{ whiteSpace: "pre-wrap" }}><span className="c"># to your agent</span>{"\n"}Our kitchen faucet drips even when it's off. Get it fixed this week, $200 max. Pay only when it's done.</pre>
            <p className="small ink2">It calls <span className="mono">post_job</span>, reads the offers, counters once, <span className="mono">accept_offer</span> (PayPal holds the money), approves a change order within your limit, and waits for the checks. It never chooses who gets paid: payouts go only to the pro's verified PayPal.</p>
          </div>
          {signed && <div className="panel stack-s"><h3>What happened on your account</h3>
            {!feed.data?.length && <p className="small muted">Nothing yet. Your agent's steps show here as it takes them.</p>}
            <ol className="feed">{(feed.data || []).slice(-12).reverse().map((a) => <li key={a.id}><time>{when(a.at)}</time><span>{a.summary} <Src s={a.actor?.kind === "agent" ? "customer's agent" : a.actor?.kind === "pro_agent" ? "pro's agent" : a.actor?.kind === "person" ? "customer" : null} /></span></li>)}</ol>
          </div>}
        </div>
      </div>
      {signed && <Mandates tokens={tokens.data || []} />}
    </div>
  );
}

// the saved payment method as PayPal's vault has it (Payment Method Tokens v3), and removing it there (PIN)
function SavedPayment({ toast, reload }) {
  const pm = useApi("/api/me/payment-methods"), [busy, setBusy] = useState(false), d = pm.data;
  if (!d) return null;
  const saved = new URLSearchParams(location.search).get("saved");
  // kind: "paypal" or "venmo" (approved at PayPal or Venmo, then back here), "testcard" (the sandbox test card, saved at once)
  const setup = async (kind = "paypal") => { setBusy(true); try { const r = await api("/api/me/payment-methods/setup", { method: "POST", body: { kind } }); if (r.saved) { toast(`Saved ${r.saved.label} in PayPal's vault.`); pm.reload(); reload(); setBusy(false); return; } location.href = r.url; } catch (e) { toast(e.message, true); setBusy(false); } };
  const remove = async () => { if (!confirm("Remove your saved payment method from PayPal's vault? Holds already placed stay; the next hold asks you to approve in PayPal again.")) return; setBusy(true); try { const r = await api("/api/me/payment-methods", { method: "DELETE" }); toast(`Removed (${r.paypalSays}).`); pm.reload(); reload(); } catch (e) { toast(e.message, true); } setBusy(false); };
  return (
    <div className="panel marks stack-s" id="saved-payment">
      <div className="panel-h"><h3>Saved payment method</h3><span className="tiny muted">{d.says}</span></div>
      {!d.saved && <><p className="small ink2">Nothing saved. Save your PayPal now (no payment), so your agent can hire within your limits without asking you on the first hold.</p>
        <div className="row"><button className={`btn sm ${busy ? "busy" : ""}`} disabled={busy} onClick={() => setup("paypal")}>Save PayPal now</button><button className="btn sm ghost" disabled={busy} onClick={() => setup("venmo")}>Save Venmo</button>{d.testCard !== false && <button className="btn sm ghost" disabled={busy} onClick={() => setup("testcard")}>Save the sandbox test card</button>}</div>
        <SaveInPage toast={toast} done={() => { pm.reload(); reload(); }} /></>}
      {saved && <p className="note small">{saved === "1" ? "Saved in PayPal's vault." : `PayPal: ${saved}`}</p>}
      {d.saved && <><p className="small"><b>{d.saved.label || d.saved.id}</b>{d.saved.expiry ? ` · expires ${d.saved.expiry}` : ""}{d.saved.paypalSays ? <span className="tiny bad"> · PayPal: {d.saved.paypalSays}</span> : null}</p>
        {d.all?.length > 1 && <p className="tiny muted">PayPal has {d.all.length} methods for you: {d.all.map((x) => x.label).join(", ")}.</p>}
        <div className="row"><button className={`btn sm ghost ${busy ? "busy" : ""}`} disabled={busy} onClick={remove}>Remove from PayPal</button></div></>}
    </div>
  );
}

// saving without leaving the page (JS SDK v6 save sessions): PayPal in PayPal's popup, or a card in PayPal's own card
// fields; the server makes the setup token, the SDK approves it, the server turns it into the saved method
function SaveInPage({ toast, done }) {
  const [sdk, setSdk] = useState(null), [card, setCard] = useState(false), box = useRef(null), cs = useRef(null);
  useEffect(() => { let off = false; (async () => { const c = await api("/api/paypal/sdk").catch(() => null); if (!c?.token || off) return; await loadSdk(c.sdk); const s = await window.paypal.createInstance({ clientToken: c.token, components: ["paypal-payments", "venmo-payments", "card-fields"], pageType: "checkout", locale: c.locale || "en-US" }); if (!off) setSdk(s); })().catch(() => {}); return () => { off = true; }; }, []);
  if (!sdk) return null;
  const token = (kind) => api("/api/me/payment-methods/setup", { method: "POST", body: { kind } }).then((r) => ({ vaultSetupToken: r.setupToken, setupToken: r.setupToken }));
  const finish = async (setupToken) => { try { const r = await api("/api/me/payment-methods/confirm", { method: "POST", body: { setupToken } }); toast(`Saved ${r.saved.label} in PayPal's vault.`); done(); } catch (e) { toast(e.message, true); } };
  const savePayPal = async () => { if (!sdk.createPayPalSavePaymentSession) return toast("This PayPal SDK has no save session.", true); const s = sdk.createPayPalSavePaymentSession({ onApprove: (d) => finish(d.vaultSetupToken), onCancel: () => toast("Closed PayPal: nothing saved."), onError: (e) => toast(String(e?.message || e), true) }); try { await s.start({ presentationMode: "auto" }, token("paypal")); } catch (e) { toast(String(e?.message || e), true); } };
  const saveVenmo = async () => { if (!sdk.createVenmoSavePaymentSession) return toast("Venmo save isn't offered here (PayPal shows it on a phone with Venmo).", true); const s = sdk.createVenmoSavePaymentSession({ onApprove: (d) => finish(d.vaultSetupToken), onCancel: () => toast("Closed Venmo: nothing saved."), onError: (e) => toast(String(e?.message || e), true) }); try { await s.start({ presentationMode: "auto" }, token("venmo")); } catch (e) { toast(String(e?.message || e), true); } };
  const openCard = () => { if (!sdk.createCardFieldsSavePaymentSession) return toast("This PayPal SDK has no card save session.", true); setCard(true); setTimeout(() => { const s = sdk.createCardFieldsSavePaymentSession(); cs.current = s; for (const [type, placeholder] of [["name", "Name on card"], ["number", "Card number"], ["expiry", "MM/YY"], ["cvv", "CVV"]]) { const d = document.createElement("div"); d.className = "pp-field"; d.appendChild(s.createCardFieldsComponent({ type, placeholder, ariaLabel: placeholder })); box.current?.appendChild(d); } }, 0); };
  const saveCard = async () => { try { const { setupToken } = await token("card"); const r = await cs.current.submit(setupToken); if (r?.state === "succeeded" || r?.data?.vaultSetupToken) return finish(r?.data?.vaultSetupToken || setupToken); toast(`PayPal: ${r?.data?.message || r?.state || "not saved"}`, true); } catch (e) { toast(String(e?.message || e), true); } };
  return (
    <div className="stack-s">
      <div className="row"><button className="btn sm ghost" onClick={savePayPal}>Save PayPal here (popup)</button><button className="btn sm ghost" onClick={saveVenmo}>Save Venmo here</button><button className="btn sm ghost" onClick={openCard}>Save a card here</button></div>
      {card && <><div ref={box} className="pp-fields" /><button className="btn sm" onClick={saveCard}>Save this card</button><span className="tiny muted">PayPal's own fields: the number goes to PayPal's vault, never to VeriPay.</span></>}
    </div>
  );
}
