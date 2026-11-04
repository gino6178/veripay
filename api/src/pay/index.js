// The PayPal client Cover uses: the sandbox (paypal.js) with keys, else the stand-in (mock.js). Set once at start.
let client = null, base = "http://localhost:8800";
export const setPay = (c, publicUrl) => { client = c; base = publicUrl; };
export const pp = () => client;
export const publicUrl = () => base;
export const usd = (c) => `$${(c / 100).toFixed(2)}`;
// a PayPal call's error in one line, without what PayPal echoed back
export const why = (e) => String(e?.message || e).slice(0, 200);
