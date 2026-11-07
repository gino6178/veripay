import { useEffect, useId, useRef, useState } from "react";
import { api } from "../api.jsx";
import { loadSdk } from "./PayPalButtons.jsx";

// Other ways PayPal offers to approve the first hold, all from PayPal's JS SDK v6 (patterns from PayPal's
// v6-web-sdk-sample-integration and the paypal-js v6 typings): the card in PayPal's own card fields (the number never
// reaches VeriPay; 3-D Secure when the bank asks), a card on PayPal's own guest page, Google Pay and Apple Pay through
// PayPal, and Fastlane for a guest's card. Each makes a new order for the same hold (POST /api/jobs/:id/hold/with), the
// browser completes it with PayPal, and the server authorizes it as usual. Only with sandbox keys (a client token);
// PayPal decides what's eligible, so a method PayPal doesn't offer isn't shown.
let gpay = null, apay = null, fnet = null;
const loadScript = (src) => new Promise((ok, bad) => { const s = document.createElement("script"); s.src = src; s.onload = ok; s.onerror = bad; document.head.appendChild(s); });
const loadGooglePay = () => (gpay ||= loadScript("https://pay.google.com/gp/p/js/pay.js"));
const loadApplePay = () => (apay ||= loadScript("https://applepay.cdn-apple.com/jsapi/1.latest/apple-pay-sdk.js"));
// FraudNet (PayPal's browser risk script): its "f" value is the id the order carries as PayPal-Client-Metadata-Id. Only
// with the source id PayPal issues the merchant (PAYPAL_FRAUDNET_SOURCE); else a random id, as before.
const fraudnet = (source) => (fnet ||= (() => {
  const f = crypto.randomUUID().replace(/-/g, "");
  if (!source) return f;
  const cfg = document.createElement("script"); cfg.type = "application/json"; cfg.setAttribute("fncls", "fnparams-dede7cc5-15fd-4c75-a9f4-36c430ee3a99"); cfg.textContent = JSON.stringify({ f, s: source, sandbox: true }); document.head.appendChild(cfg);
  loadScript("https://c.paypal.com/da/r/fb.js").catch(() => {});
  return f;
})());

export default function PayPalMore({ jobId, amount, zip = null, onDone }) {
  const [cfg, setCfg] = useState(null), [sdk, setSdk] = useState(null), [elig, setElig] = useState(null);
  const [open, setOpen] = useState(null), [err, setErr] = useState(null), [busy, setBusy] = useState(false);
  useEffect(() => {
    let off = false;
    (async () => {
      const c = await api("/api/paypal/sdk").catch(() => null);
      if (!c?.token || off) return;
      setCfg(c);
      await loadSdk(c.sdk);
      const s = await window.paypal.createInstance({ clientToken: c.token, components: ["card-fields", "googlepay-payments", "fastlane", "paypal-guest-payments", "applepay-payments"], pageType: "checkout", locale: c.locale || "en-US", clientMetadataId: fraudnet(c.fraudnetSource), ...(c.partnerAttributionId ? { partnerAttributionId: c.partnerAttributionId } : {}), ...(new URLSearchParams(location.search).get("buyerCountry") ? { testBuyerCountry: new URLSearchParams(location.search).get("buyerCountry") } : {}) });
      // eligibility for this amount, for a payment that's saved for the next holds
      const m = await s.findEligibleMethods({ currencyCode: "USD", ...(amount ? { amount: (amount / 100).toFixed(2) } : {}), paymentFlow: "VAULT_WITH_PAYMENT" }).catch(() => s.findEligibleMethods({ currencyCode: "USD" }));
      if (off) return;
      const card = m.isEligible("advanced_cards"), cd = card ? m.getDetails?.("advanced_cards") : null;
      setSdk(s); setElig({ card, vendors: (cd?.vendors || []).filter((v) => v.eligible !== false).map((v) => (typeof v === "string" ? v : v.network || v.name || "")).filter(Boolean), guest: m.isEligible?.("basic_cards") && typeof s.createPayPalGuestOneTimePaymentSession === "function", googlepay: m.isEligible("googlepay") ? m.getDetails("googlepay") : null, applepay: m.isEligible?.("applepay") && window.ApplePaySession?.canMakePayments?.() ? m.getDetails("applepay") : null, fastlane: typeof s.createFastlane === "function" });
    })().catch(() => {});
    return () => { off = true; };
  }, [jobId]);
  if (!cfg || !sdk || !elig || !(elig.card || elig.googlepay || elig.fastlane || elig.guest || elig.applepay)) return null;
  // a new order for this hold, made the way the method needs (the server answers with the job); it carries the same
  // client metadata id as FraudNet and the risk context
  const order = async (method, token) => { const j = await api(`/api/jobs/${jobId}/hold/with`, { method: "POST", body: { method, cmid: fraudnet(cfg.fraudnetSource), ...(token ? { token } : {}) } }); if (j.error) throw new Error(j.message); return j; };
  const confirm = async (orderId) => { const j = await api(`/api/jobs/${jobId}/hold/confirm`, { method: "POST", body: { orderId } }); if (j.error) throw new Error(j.message); onDone?.(); };
  // retry only what PayPal says can be retried
  const run = async (f) => { setBusy(true); setErr(null); try { await f(); } catch (e) { setErr(`${String(e?.message || e)}${e?.isRecoverable === false ? " (PayPal says this can't be retried: try another way)" : ""}`); } finally { setBusy(false); } };
  const props = { sdk, amount, zip, run, busy, order, confirm, setErr, onDone };
  return (
    <div className="stack-s pp-more">
      <p className="tiny muted">Or, through PayPal:</p>
      <div className="row">
        {elig.card && <button className={`btn sm ${open === "card" ? "accent" : "ghost"}`} onClick={() => setOpen("card")}>Card</button>}
        {elig.guest && <button className={`btn sm ${open === "guest" ? "accent" : "ghost"}`} onClick={() => setOpen("guest")}>Card on PayPal's page</button>}
        {elig.googlepay && <button className={`btn sm ${open === "gpay" ? "accent" : "ghost"}`} onClick={() => setOpen("gpay")}>Google Pay</button>}
        {elig.applepay && <button className={`btn sm ${open === "apay" ? "accent" : "ghost"}`} onClick={() => setOpen("apay")}>Apple Pay</button>}
        {elig.fastlane && <button className={`btn sm ${open === "fastlane" ? "accent" : "ghost"}`} onClick={() => setOpen("fastlane")}>Guest checkout (Fastlane)</button>}
      </div>
      {elig.vendors?.length > 0 && <span className="tiny muted">Cards PayPal accepts here: {elig.vendors.join(", ")}</span>}
      {open === "card" && <CardFields {...props} />}
      {open === "guest" && <GuestCard {...props} />}
      {open === "gpay" && <GooglePay {...props} details={elig.googlepay} />}
      {open === "apay" && <ApplePay {...props} details={elig.applepay} />}
      {open === "fastlane" && <Fastlane {...props} />}
      {err && <span className="small bad" role="alert">{err}</span>}
    </div>
  );
}

// PayPal's card fields, styled like the site and labelled for screen readers; "Hold" waits until every field is valid
const FIELD_STYLE = { input: { "font-size": "15px", "font-family": "system-ui, sans-serif", color: "#1b1f24", padding: "8px" }, "input.invalid": { color: "#b42318" }, ":focus": { color: "#1b1f24" } };
function CardFields({ sdk, amount, zip, run, busy, order, confirm, setErr }) {
  const box = useRef(null), sess = useRef(null), [valid, setValid] = useState(false), [brand, setBrand] = useState(null), [shift, setShift] = useState(null);
  useEffect(() => {
    const s = sdk.createCardFieldsOneTimePaymentSession({ style: FIELD_STYLE });
    sess.current = s;
    // PayPal cuts ariaLabel and ariaInvalidErrorMessage at 20 characters
    for (const [type, placeholder, label, bad] of [["name", "Name on card", "Name on card", "Check the name"], ["number", "Card number", "Card number", "Check the number"], ["expiry", "MM/YY", "Expiry month/year", "Check the expiry"], ["cvv", "CVV", "Security code (CVV)", "Check the CVV"]]) {
      const d = document.createElement("div"); d.className = "pp-field";
      d.appendChild(s.createCardFieldsComponent({ type, placeholder, ariaLabel: label, ariaInvalidErrorMessage: bad }));
      box.current?.appendChild(d);
    }
    // the event's data has each field's state ({ number: { isValid }, expiry, cvv, name }) and the card types it matches
    s.on?.("validitychange", (st) => { const d = st?.data || st || {}; setValid(["number", "expiry", "cvv"].every((k) => d[k]?.isValid) && d.name?.isValid !== false); });
    s.on?.("cardtypechange", (st) => { const c = (st?.data || st)?.cards?.[0]; setBrand(c?.niceType && c.niceType !== "--" ? c.niceType : null); });
    return () => { s.destroy?.(); if (box.current) box.current.innerHTML = ""; };
  }, [sdk]);
  useEffect(() => { if (amount) sess.current?.update?.({ amount: { currencyCode: "USD", value: (amount / 100).toFixed(2) } }); }, [amount]);
  const pay = () => run(async () => {
    const j = await order("cardfields");
    // the job's ZIP as the billing ZIP: the bank's AVS check has something to match
    const { data, state } = await sess.current.submit(j.hold.paypalOrder, { billingAddress: { countryCode: "US", ...(zip ? { postalCode: zip } : {}) } });
    if (data?.liabilityShift) setShift(data.liabilityShift);
    if (state === "succeeded") return confirm(j.hold.paypalOrder);
    if (state === "canceled") return setErr("You closed the bank's check. Nothing is held.");
    throw Object.assign(new Error(`PayPal: ${data?.message || state}`), { isRecoverable: data?.isRecoverable });
  });
  return <div className="stack-s"><div ref={box} className="pp-fields" />{brand && <span className="tiny muted">{brand}</span>}<button className={`btn accent ${busy ? "busy" : ""}`} disabled={busy || (sess.current?.on && !valid)} onClick={pay}>Hold with this card</button>{shift && <span className="tiny muted">3-D Secure: liability shift {shift}</span>}<span className="tiny muted">PayPal's own fields: the card number goes to PayPal, never to VeriPay. Saved in PayPal's vault for the next holds.</span></div>;
}

// a card on PayPal's own guest page (paypal-guest-payments), started from PayPal's basic card button; the session
// needs that button as targetElement (else "targetElement must be a <paypal-basic-card-button>"), and where a popup
// can't open PayPal shows the card form in the page under it
function GuestCard({ sdk, run, order, confirm, setErr }) {
  const box = useRef(null);
  useEffect(() => {
    const s = sdk.createPayPalGuestOneTimePaymentSession({ onApprove: async (d) => { try { await confirm(d.orderId); } catch (e) { setErr(String(e?.message || e)); } }, onCancel: () => setErr("You closed PayPal's card page. Nothing is held."), onError: (e) => setErr(String(e?.message || e)), onComplete: () => {} });
    // the button shows only inside PayPal's container (as in PayPal's v6 sample); alone it stays display: none
    const wrap = document.createElement("paypal-basic-card-container"), b = document.createElement("paypal-basic-card-button");
    wrap.appendChild(b);
    b.addEventListener("click", () => run(async () => { const j = order("guest"); await s.start({ presentationMode: "auto", targetElement: b }, j.then((x) => ({ orderId: x.hold.paypalOrder }))); }));
    box.current?.appendChild(wrap);
    return () => { s.destroy?.(); if (box.current) box.current.innerHTML = ""; };
  }, [sdk]);
  return <div className="stack-s"><div ref={box} /><span className="tiny muted">PayPal's card page, no PayPal account needed.</span></div>;
}

function GooglePay({ sdk, amount, details, run, order, confirm, setErr }) {
  const box = useRef(null);
  useEffect(() => {
    let off = false;
    (async () => {
      await loadGooglePay();
      if (off || !window.google?.payments?.api) return;
      const s = sdk.createGooglePayOneTimePaymentSession(), conf = s.formatConfigForPaymentRequest(details.config);
      const total = (amount / 100).toFixed(2);
      const client = new window.google.payments.api.PaymentsClient({ environment: "TEST", paymentDataCallbacks: { onPaymentAuthorized: async (pd) => {
        try {
          const j = await order("googlepay"), id = j.hold.paypalOrder; const { status } = await s.confirmOrder({ orderId: id, paymentMethodData: pd.paymentMethodData });
          // the card's bank wants 3-D Secure: PayPal runs the step, then the hold is confirmed as usual
          if (status === "PAYER_ACTION_REQUIRED") { if (!s.initiatePayerAction) throw new Error("Google Pay needs another step at PayPal."); await s.initiatePayerAction({ orderId: id }); }
          await confirm(id); return { transactionState: "SUCCESS" };
        } catch (e) { setErr(String(e?.message || e)); return { transactionState: "ERROR", error: { message: String(e?.message || e) } }; } } } });
      const ready = await client.isReadyToPay({ allowedPaymentMethods: conf.allowedPaymentMethods, apiVersion: conf.apiVersion, apiVersionMinor: conf.apiVersionMinor });
      if (off || !ready.result) { if (!off) setErr("Google Pay isn't ready in this browser."); return; }
      box.current?.appendChild(client.createButton({ onClick: () => run(() => client.loadPaymentData({ apiVersion: conf.apiVersion, apiVersionMinor: conf.apiVersionMinor, allowedPaymentMethods: conf.allowedPaymentMethods, merchantInfo: conf.merchantInfo, callbackIntents: ["PAYMENT_AUTHORIZATION"], transactionInfo: { countryCode: conf.countryCode || "US", currencyCode: "USD", totalPriceStatus: "FINAL", totalPrice: total, totalPriceLabel: "Hold (not a charge)" } })) }));
    })().catch((e) => !off && setErr(String(e?.message || e)));
    return () => { off = true; if (box.current) box.current.innerHTML = ""; };
  }, [sdk]);
  return <div className="stack-s"><div ref={box} /><span className="tiny muted">Google Pay through PayPal: held, not charged, like any hold. Google Pay's test environment.</span></div>;
}

// Apple Pay through PayPal (applepay-payments): Safari on an Apple device, on a domain registered with Apple and PayPal
// (the association file is served at /.well-known/apple-developer-merchantid-domain-association)
function ApplePay({ sdk, amount, details, run, order, confirm, setErr }) {
  const start = () => run(async () => {
    await loadApplePay();
    const s = sdk.createApplePayOneTimePaymentSession(), conf = details?.config || (await s.config?.()) || {};
    const req = { countryCode: "US", currencyCode: "USD", merchantCapabilities: conf.merchantCapabilities || ["supports3DS"], supportedNetworks: conf.supportedNetworks || ["visa", "masterCard", "amex", "discover"], total: { label: "VeriPay hold (not a charge)", amount: (amount / 100).toFixed(2), type: "final" }, requiredBillingContactFields: ["postalAddress"] };
    const ap = new window.ApplePaySession(4, req);
    ap.onvalidatemerchant = async (ev) => { try { const r = await s.validateMerchant({ validationUrl: ev.validationURL }); ap.completeMerchantValidation(r.merchantSession); } catch (e) { setErr(String(e?.message || e)); ap.abort(); } };
    ap.onpaymentauthorized = async (ev) => { try { const j = await order("applepay"), id = j.hold.paypalOrder; await s.confirmOrder({ orderId: id, token: ev.payment.token, billingContact: ev.payment.billingContact }); await confirm(id); ap.completePayment(window.ApplePaySession.STATUS_SUCCESS); } catch (e) { setErr(String(e?.message || e)); ap.completePayment(window.ApplePaySession.STATUS_FAILURE); } };
    ap.begin();
  });
  return <div className="stack-s"><button className="btn sm" onClick={start}>Hold with Apple Pay</button><span className="tiny muted">Apple Pay through PayPal: held, not charged.</span></div>;
}

// Fastlane's components render into a CSS selector (an element fails: "FastlanePaymentComponent render failed")
function Fastlane({ sdk, run, busy, order, onDone, setErr }) {
  const [fl, setFl] = useState(null), [email, setEmail] = useState(""), [step, setStep] = useState("email"), [profile, setProfile] = useState(null), [addr, setAddr] = useState(null), comp = useRef(null);
  const uid = useId().replace(/[^A-Za-z0-9_-]/g, ""), wmId = `fl-wm-${uid}`, boxId = `fl-card-${uid}`;
  useEffect(() => { let off = false; sdk.createFastlane().then(async (f) => { if (off) return; f.setLocale?.("en_us"); setFl(f); (await f.FastlaneWatermarkComponent({ includeAdditionalInfo: true })).render(`#${wmId}`); }).catch(() => {}); return () => { off = true; }; }, [sdk]);
  const lookup = () => run(async () => {
    const { customerContextId } = await fl.identity.lookupCustomerByEmail(email);
    let p = null;
    if (customerContextId) { const r = await fl.identity.triggerAuthenticationFlow(customerContextId); if (r.authenticationState === "succeeded") p = r.profileData; }
    setProfile(p); setAddr(p?.shippingAddress || null);
    comp.current = await fl.FastlanePaymentComponent(p?.shippingAddress ? { options: {}, shippingAddress: p.shippingAddress } : {});
    setStep("card");
  });
  // once the card step is on the page (a timer can run before React has put the container there)
  useEffect(() => { if (step === "card" && comp.current) Promise.resolve(comp.current.render(`#${boxId}`)).catch((e) => setErr(String(e?.message || e))); }, [step]);
  // a member picks another of their saved addresses (the job site) in Fastlane's own selector
  const pickAddress = () => run(async () => { const r = await fl.profile.showShippingAddressSelector(); if (r?.selectionChanged) { setAddr(r.selectedAddress); comp.current?.setShippingAddress?.(r.selectedAddress); } });
  const pay = () => run(async () => { const { id } = await comp.current.getPaymentToken(); await order("fastlane", id); onDone?.(); });
  return (
    <div className="stack-s">
      {step === "email" && <div className="row"><input className="input" type="email" placeholder="Your email" aria-label="Your email" value={email} onChange={(e) => setEmail(e.target.value)} /><button className={`btn sm ${busy ? "busy" : ""}`} disabled={!fl || busy || !/@/.test(email)} onClick={lookup}>Continue</button></div>}
      {step === "card" && <>{profile && <div className="row small">{addr ? <span className="ink2">Job site: {[addr.address?.addressLine1, addr.address?.postalCode].filter(Boolean).join(", ")}</span> : null}<button className="btn sm ghost" onClick={pickAddress}>Use another saved address</button></div>}<div id={boxId} /><button className={`btn accent ${busy ? "busy" : ""}`} disabled={busy} onClick={pay}>Hold with this card</button></>}
      <div id={wmId} />
      <span className="tiny muted">Fastlane by PayPal: a guest's card, remembered by PayPal for next time if you choose.</span>
    </div>
  );
}
