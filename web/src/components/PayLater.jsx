import { useEffect, useRef, useState } from "react";
import { api } from "../api.jsx";
import { loadSdk } from "./PayPalButtons.jsx";

// PayPal's Pay Later message (Pay in 4 / Pay Monthly) under a bigger price, rendered by PayPal for this amount, or
// nothing when PayPal shows none. Display only: whether Pay Later is offered is PayPal's call when the customer
// approves the hold in PayPal.
// Signed in, it's the JS SDK v6 messages component (<paypal-message>, the same SDK as the buttons); signed out, the v5
// messages script under its own namespace. variant "banner" is the flex banner for the home and directory pages.
// PayPal's US ranges: Pay in 4 for $10 to $2,000; Pay Monthly for $49 to $10,000 (pay-later/us).
let load = null;
const loadMessages = (clientId) => (load ||= new Promise((ok, bad) => {
  const s = document.createElement("script");
  s.src = `https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(clientId)}&components=messages&buyer-country=US&currency=USD`;
  s.setAttribute("data-namespace", "paypalMessages");
  s.onload = ok; s.onerror = bad; document.head.appendChild(s);
}));
let v6 = null;
const v6Messages = async () => (v6 ||= (async () => {
  const cfg = await api("/api/paypal/sdk");
  if (!cfg?.token) throw new Error("no SDK");
  await loadSdk(cfg.sdk);
  const sdk = await window.paypal.createInstance({ clientToken: cfg.token, components: ["paypal-messages"], pageType: "product-details", locale: cfg.locale || "en-US", ...(cfg.partnerAttributionId ? { partnerAttributionId: cfg.partnerAttributionId } : {}) });
  return sdk.createPayPalMessages ? sdk.createPayPalMessages() : null;
})().catch(() => null));

export const payLaterSays = (cents) => (cents > 1000000 ? null : cents > 200000 ? "Over $2,000: PayPal may offer Pay Monthly (up to $10,000), not Pay in 4." : cents >= 4900 ? "PayPal may offer Pay in 4 or Pay Monthly." : cents >= 1000 ? "PayPal may offer Pay in 4." : null);

export default function PayLater({ cents, min = 20000, variant = "text", signedIn = true }) {
  const box = useRef(null), [on, setOn] = useState(false), [clicked, setClicked] = useState(false);
  useEffect(() => {
    if (variant !== "banner" && !(cents >= min)) return;
    let off = false;
    (async () => {
      try {
        const m = signedIn && variant !== "banner" ? await v6Messages() : null;
        if (m && box.current && !off) {
          // the declarative message: PayPal fetches the content for this amount and renders it in the element
          const el = document.createElement("paypal-message");
          for (const [k, v] of Object.entries({ amount: (cents / 100).toFixed(2), "currency-code": "USD", "logo-type": "INLINE", "text-color": "BLACK", "auto-bootstrap": "true" })) el.setAttribute(k, v);
          el.addEventListener("paypal-message-click", () => setClicked(true));
          box.current.replaceChildren(el); setOn(true); return;
        }
        const cfg = await api("/api/paypal/messages");
        if (!cfg?.clientId || off) return;
        await loadMessages(cfg.clientId);
        if (off || !box.current || !window.paypalMessages?.Messages) return;
        const style = variant === "banner" ? { layout: "flex", color: "white-no-border", ratio: "20x1" } : { layout: "text", logo: { type: "inline" }, text: { size: 12 } };
        await window.paypalMessages.Messages({ ...(cents ? { amount: (cents / 100).toFixed(2) } : {}), placement: variant === "banner" ? "home" : "product", style, onClick: () => setClicked(true) }).render(box.current);
        setOn(true);
      } catch { /* no message: PayPal's call, or the SDK didn't load */ }
    })();
    return () => { off = true; };
  }, [cents, min, variant, signedIn]);
  if (variant !== "banner" && !(cents >= min)) return null;
  return <div className={`paylater ${variant === "banner" ? "paylater-banner" : ""}`} data-on={on || undefined}><div ref={box} />{on && <span className="tiny muted">{variant === "banner" ? "Pay Later offers are PayPal's, for eligible US buyers." : `Shown by PayPal; offered at PayPal when you approve the hold, if you're eligible. ${payLaterSays(cents) || ""}`}{clicked ? " You opened PayPal's details." : ""}</span>}</div>;
}
