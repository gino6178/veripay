import { useEffect, useRef, useState } from "react";
import { api } from "../api.jsx";

// PayPal's JS SDK v6 on the page: the first time, the customer approves the hold in a PayPal popup (PayPal, Pay Later,
// PayPal Credit or Venmo where eligible) without leaving the job. The order already exists (the server made it, intent
// AUTHORIZE); the buttons only approve it, then the server authorizes it and saves the method in the vault, so later
// holds (and the customer's agent) need no approval. With the stand-in (no sandbox keys) or if the SDK can't load, it
// falls back to a link to the approval page, which is labelled as simulated.
// The buttons come in PayPal's recommended order, for this amount and a payment that's saved (VAULT_WITH_PAYMENT);
// "Continue" (commit: false), since nothing is charged yet. A blocked popup opens PayPal in a modal instead; after a
// redirect or the PayPal app (App Switch), resume() finishes the same session.
let sdkLoad = null;
export const loadSdk = (src) => (sdkLoad ||= new Promise((ok, bad) => { const s = document.createElement("script"); s.src = src; s.onload = ok; s.onerror = bad; document.head.appendChild(s); }));

// the stand-in's approval page lives on this server: keep it on this origin (the dev server proxies it)
const local = (u) => { try { const x = new URL(u, location.href); return /^\/(mock-paypal|paypal)\//.test(x.pathname) ? x.pathname + x.search : u; } catch { return u; } };

// method "venmo": the order's payment source is Venmo (saved in the vault when approved), so only the Venmo button fits;
// PayPal gives such an order no redirect link
export default function PayPalButtons({ jobId, orderId, approveUrl, simulated, onDone, method = null, amount = null }) {
  const box = useRef(null), sessions = useRef([]);
  const [state, setState] = useState("loading"), [err, setErr] = useState(null);
  useEffect(() => {
    let off = false;
    (async () => {
      const cfg = await api("/api/paypal/sdk").catch(() => null);
      if (!cfg?.token || !orderId) { setState("link"); return; }
      await loadSdk(cfg.sdk);
      const sdk = await window.paypal.createInstance({ clientToken: cfg.token, components: ["paypal-payments", "venmo-payments"], pageType: "checkout", locale: cfg.locale || "en-US", ...(cfg.partnerAttributionId ? { partnerAttributionId: cfg.partnerAttributionId } : {}) });
      const methods = await sdk.findEligibleMethods({ currencyCode: "USD", ...(amount ? { amount: (amount / 100).toFixed(2) } : {}), paymentFlow: "VAULT_WITH_PAYMENT" }).catch(() => sdk.findEligibleMethods({ currencyCode: "USD" }));
      const options = {
        commit: false,
        onApprove: async () => { try { await api(`/api/jobs/${jobId}/hold/confirm`, { method: "POST", body: { orderId } }); onDone?.(); } catch (e) { setErr(e.message); } },
        onCancel: () => setErr("You closed PayPal without approving. Nothing is held."),
        onError: (e) => setErr(`${String(e?.message || e)}${e?.isRecoverable ? " Try again." : ""}`),
        onComplete: (d) => { if (d?.paymentSessionState === "error") setErr((x) => x || "PayPal couldn't finish. Nothing is held."); },
      };
      const order = () => Promise.resolve({ orderId });
      const add = (tag, session, attrs = {}) => {
        const el = document.createElement(tag);
        for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
        el.addEventListener("click", async () => {
          try { await session.start({ presentationMode: "auto" }, order()); }
          catch (e) { if (/popup/i.test(String(e?.message || e?.code || ""))) { try { await session.start({ presentationMode: "modal" }, order()); return; } catch {} } setErr(String(e?.message || e)); }
        });
        sessions.current.push(session);
        return el;
      };
      if (off || !box.current) return;
      const rank = (k) => methods.getDetails?.(k)?.recommendedPriority ?? methods.getDetails?.(k)?.recommended_priority ?? 99;
      const els = [];
      if (method !== "venmo" && methods.isEligible("paypal")) els.push([rank("paypal"), add("paypal-button", sdk.createPayPalOneTimePaymentSession(options), { type: "continue" })]);
      if (method !== "venmo" && methods.isEligible("paylater") && sdk.createPayLaterOneTimePaymentSession) { const d = methods.getDetails("paylater"); els.push([rank("paylater"), add("paypal-pay-later-button", sdk.createPayLaterOneTimePaymentSession(options), { productCode: d.productCode, countryCode: d.countryCode })]); }
      if (method !== "venmo" && methods.isEligible("credit") && sdk.createPayPalCreditOneTimePaymentSession) { const d = methods.getDetails("credit"); els.push([rank("credit"), add("paypal-credit-button", sdk.createPayPalCreditOneTimePaymentSession(options), { ...(d?.countryCode ? { countryCode: d.countryCode } : {}) })]); }
      if (methods.isEligible("venmo") && sdk.createVenmoOneTimePaymentSession) els.push([rank("venmo"), add("venmo-button", sdk.createVenmoOneTimePaymentSession(options))]);
      for (const [, el] of els.sort((a, b) => a[0] - b[0])) box.current.appendChild(el);
      // back from a redirect or the PayPal app: the session picks up where it left off
      for (const s of sessions.current) if (s.hasReturned?.()) { s.resume?.(); break; }
      setState(box.current.children.length ? "buttons" : "link");
    })().catch(() => !off && setState("link"));
    return () => { off = true; for (const s of sessions.current) s.destroy?.(); sessions.current = []; if (box.current) box.current.innerHTML = ""; };
  }, [jobId, orderId]);
  return (
    <div className="pp-buttons stack-s">
      <div ref={box} className="pp-box" />
      {state === "loading" && <span className="small muted">Loading PayPal…</span>}
      {state === "link" && approveUrl && <a className="btn paypal" href={local(approveUrl)} data-tour="paypal">{simulated ? "Approve the hold with PayPal" : "Approve the hold in PayPal"}</a>}
      {state === "link" && !approveUrl && method === "venmo" && <span className="small ink2">Venmo approves in the Venmo button, which PayPal shows on a phone with Venmo. Not offered here: hold another way below.</span>}
      {err && <span className="small bad" role="alert">{err}</span>}
    </div>
  );
}
