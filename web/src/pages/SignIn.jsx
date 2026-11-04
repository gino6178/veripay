// Demo sign-in: a name, and the PayPal email claims are paid to (a sandbox personal account when Cover runs with keys)
import { useState } from "react";
import { api, navigate, useT, useLang } from "../api.jsx";
import { useMe } from "../App.jsx";

export default function SignIn() {
  const t = useT(), { lang } = useLang(), { reload, toast } = useMe();
  const [name, setName] = useState(""), [email, setEmail] = useState(""), [busy, setBusy] = useState(false);
  const back = new URLSearchParams(location.search).get("next") || "/quote";
  // each demo person gets their own device id, as if on their own phone (one browser plays many people in the demo,
  // and fraud.js flags one device behind several policyholders)
  const go = async (e) => { e.preventDefault(); setBusy(true); try { try { localStorage.removeItem("cover.device"); } catch {} await api("/api/auth/demo", { method: "POST", body: { name, email: email || null, lang } }); await reload(); navigate(back); } catch (err) { toast(err.message); } setBusy(false); };
  return (
    <form className="card marks stack" style={{ maxWidth: 480, margin: "48px auto" }} onSubmit={go}>
      <h1>{t("開始使用 Cover", "Start with Cover")}</h1>
      <p className="muted small">{t("這是示範：只要名字就能開始。理賠款會付到你填的 PayPal email。", "This is a demo: a name is enough. Claims are paid to the PayPal email you give.")}</p>
      <label className="field"><span>{t("你的名字", "Your name")}</span><input className="input" value={name} onChange={(e) => setName(e.target.value)} required autoFocus /></label>
      <label className="field"><span>{t("PayPal email（收理賠款，可之後再填）", "PayPal email (where claims are paid; you can add it later)")}</span><input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" /></label>
      <button className="btn accent" disabled={busy || !name.trim()}>{t("繼續", "Continue")}</button>
    </form>
  );
}
