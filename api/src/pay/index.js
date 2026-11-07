// The PayPal client VeriPay uses: the sandbox (paypal.js) with keys, else the stand-in (mock.js). Set once at start.
let client = null, base = "http://localhost:8810";
export const setPay = (c, publicUrl) => { client = c; if (publicUrl) base = publicUrl; };
export const pp = () => client;
export const publicUrl = () => base;
// money is cents everywhere inside; dollars only at the edges
export const usd = (c) => (c == null ? null : `${c < 0 ? "-" : ""}$${(Math.abs(c) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
export const toCents = (d) => (d == null || d === "" || !Number.isFinite(+d) ? null : Math.round(+d * 100));
// a PayPal call's error in one line, without what PayPal echoed back
export const why = (e) => String(e?.message || e).slice(0, 200);
// How a job's money is held (PLAN §12): "authorize" (Orders AUTHORIZE, captured at release; the default, and what the
// sandbox run showed works with vaulted cards) or "capture" (charged at once and kept at the platform until release,
// for an account where authorize isn't available). HOLD_MODE picks it.
let holdMode = "authorize";
export const setHoldMode = (m) => { holdMode = m === "capture" ? "capture" : "authorize"; };
export const getHoldMode = () => holdMode;
