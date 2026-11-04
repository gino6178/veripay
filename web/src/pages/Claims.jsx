// Making a claim, and watching it decided: every check with the clause it applied, how the amount was worked out, and
// the PayPal payout. Photos get a difference hash in the browser (so a reused picture is noticed even resized); the
// file itself goes to Cover, which reads its date and, for documents, its fields.
import { useEffect, useRef, useState } from "react";
import { api, Link, navigate, useApi, useT, useLang, when, secs } from "../api.jsx";
import { useMe } from "../App.jsx";
import { Status } from "./Policies.jsx";
import Icon from "../components/Icon.jsx";

const KIND = { photo: ["照片", "Photo"], receipt: ["收據或發票", "Receipt"], receipt_or_photo: ["收據或照片", "Receipt or photo"], police_report: ["警方報案紀錄（含案號）", "Police report"], repair_quote: ["維修報價或發票", "Repair estimate or invoice"], vet_invoice: ["動物醫院收據", "Vet invoice"], diagnosis: ["診斷證明", "Diagnosis"], records: ["病歷", "Records"], fire_report: ["火災證明", "Fire report"], list: ["損失清單", "List of items"], statement: ["事故說明", "Statement"], medical: ["醫療單據", "Medical bills"], inspection: ["鑑定報告", "Inspection"], death_certificate: ["死亡證明書", "Death certificate"], id_beneficiary: ["受益人身分證明", "Beneficiary's ID"], specialist_statement: ["專科醫師證明", "Specialist's statement"], registration: ["車輛登記證", "Registration"], flight_record: ["航班紀錄", "Flight record"], pir: ["行李延誤報告（PIR）", "Baggage report (PIR)"], other: ["其他", "Other"] };
const kindName = (t, k) => t(...(KIND[k] || [k, k]));

// a 64-bit difference hash: the picture shrunk to 9 x 8 in grey, each pixel compared with its right neighbour
async function dhash(file) {
  try {
    const bmp = await createImageBitmap(file), c = new OffscreenCanvas(9, 8), g = c.getContext("2d");
    g.drawImage(bmp, 0, 0, 9, 8);
    const d = g.getImageData(0, 0, 9, 8).data, grey = (x, y) => { const i = (y * 9 + x) * 4; return d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114; };
    let bits = "";
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) bits += grey(x, y) > grey(x + 1, y) ? "1" : "0";
    return BigInt(`0b${bits}`).toString(16).padStart(16, "0");
  } catch { return null; }
}
const base64 = (file) => new Promise((ok, no) => { const r = new FileReader(); r.onload = () => ok(String(r.result).split(",")[1]); r.onerror = no; r.readAsDataURL(file); });
async function asEvidence(kind, file) { return { kind, name: file.name, data: await base64(file), dhash: file.type.startsWith("image/") ? await dhash(file) : null, preview: file.type.startsWith("image/") ? URL.createObjectURL(file) : null }; }

export function NewClaim({ policy }) {
  const t = useT(), { lang } = useLang(), { toast, me, info } = useMe();
  const { data: p } = useApi(`/api/policies/${policy}?lang=${lang}`);
  const { data: prod } = useApi(p ? `/api/products/${p.product}?lang=${lang}` : null);
  // now on Cover's clock (the demo may have moved it forward), as the browser's local time
  const local = () => { const d = new Date((info?.now ? Date.parse(info.now) : Date.now()) - new Date().getTimezoneOffset() * 6e4); return d.toISOString().slice(0, 16); };
  const [type, setType] = useState(null), [at, setAt] = useState(local), [where, setWhere] = useState(""), [story, setStory] = useState(""), [amount, setAmount] = useState("");
  const [touched, setTouched] = useState(false);
  useEffect(() => { if (info?.now && !touched) setAt(local()); }, [info?.now]);
  const [items, setItems] = useState([{ what: "", value: "" }]), [ev, setEv] = useState([]), [payee, setPayee] = useState("me"), [vet, setVet] = useState(""), [busy, setBusy] = useState(false);
  // the judge tour's "fill this for me": the kind of claim, the words, and its sample documents as real files
  useEffect(() => {
    const f = async (e) => { const d = e.detail || {}; if (d.type) setType(d.type); if (d.where) setWhere(d.where); if (d.story) setStory(d.story); if (d.amount) setAmount(String(d.amount));
      const list = []; for (const x of d.files || []) list.push(await asEvidence(x.kind, x.file)); if (list.length) setEv(list); };
    addEventListener("cover:fill-claim", f); return () => removeEventListener("cover:fill-claim", f);
  }, []);
  if (!p || !prod) return null;
  const ct = prod.claims.find((c) => c.type === type), contents = ["renters", "home"].includes(p.product) && ["theft", "water", "fire"].includes(type);
  const add = async (kind, files) => { const list = []; for (const f of files) { if (f.size > 6e6) { toast(t("檔案最大 6 MB", "Files can be at most 6 MB")); continue; } list.push(await asEvidence(kind, f)); } setEv((e) => [...e, ...list]); };
  const submit = async () => {
    setBusy(true);
    try {
      const r = await api("/api/claims", { method: "POST", body: { policy, type, happenedAt: new Date(at).toISOString(), where, story, amount: +amount, items: contents ? items.filter((x) => x.what && +x.value > 0).map((x) => ({ what: x.what, value: +x.value })) : [], payee, vetEmail: payee === "vet" ? vet : null, evidence: ev.map(({ preview, ...x }) => x) } });
      if (r.error) throw new Error(r.message);
      navigate(`/claims/${r.claim}?fresh=1`);
    } catch (e) { toast(e.message); setBusy(false); }
  };
  return (
    <div className="chat stack">
      <div><p className="eyebrow">{p.name} · {p.number}</p><h1>{t("發生了什麼事？", "What happened?")}</h1></div>
      <div className="msg bot"><span className="who">Lumi</span>{t("跟我說發生什麼事，附上需要的文件。我會照你的保單條款一項一項檢查，簡單的案件幾秒內就用 PayPal 付給你。", "Tell me what happened and add the documents it needs. I'll check it against your policy's clauses one by one; a simple claim is paid to your PayPal in seconds.")}</div>
      <div className="chips">{prod.claims.map((c) => <button key={c.type} className={`chip ${type === c.type ? "on" : ""}`} onClick={() => setType(c.type)}>{c.what}</button>)}</div>
      {ct && <div className="card stack">
        <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 220px), 1fr))" }}>
          <label className="field"><span>{t("什麼時候", "When")}</span><input className="input" type="datetime-local" value={at} onChange={(e) => { setTouched(true); setAt(e.target.value); }} /></label>
          <label className="field"><span>{t("在哪裡", "Where")}</span><input className="input" value={where} onChange={(e) => setWhere(e.target.value)} placeholder={t("例如：家裡、公司的停車場", "e.g. at home, the office parking garage")} /></label>
          <label className="field"><span>{t("金額（USD）", "Amount (USD)")}</span><input className="input" type="number" min="1" value={amount} onChange={(e) => setAmount(e.target.value)} /></label>
        </div>
        <label className="field"><span>{t("經過（用你自己的話）", "What happened, in your own words")}</span><textarea className="input" value={story} onChange={(e) => setStory(e.target.value)} /></label>
        {contents && <div className="stack-s"><span className="small" style={{ fontWeight: 500 }}>{t("損失的東西", "What was lost or damaged")}</span>
          {items.map((x, i) => <div key={i} className="row"><input className="input" style={{ flex: 2 }} placeholder={t("物品", "Item")} value={x.what} onChange={(e) => setItems(items.map((y, j) => (j === i ? { ...y, what: e.target.value } : y)))} /><input className="input" style={{ width: 130 }} type="number" placeholder="USD" value={x.value} onChange={(e) => setItems(items.map((y, j) => (j === i ? { ...y, value: e.target.value } : y)))} /></div>)}
          <button className="link small" onClick={() => setItems([...items, { what: "", value: "" }])}>{t("+ 再加一項", "+ Add another")}</button></div>}
        {p.product === "pet" && <div className="chips"><button className={`chip ${payee === "me" ? "on" : ""}`} onClick={() => setPayee("me")}>{t("付給我", "Pay me")}</button><button className={`chip ${payee === "vet" ? "on" : ""}`} onClick={() => setPayee("vet")}>{t("直接付給動物醫院", "Pay the vet directly")}</button>{payee === "vet" && <input className="input" style={{ maxWidth: 280 }} placeholder={t("動物醫院的 PayPal email", "The vet's PayPal email")} value={vet} onChange={(e) => setVet(e.target.value)} />}</div>}
        <div className="stack-s"><span className="small" style={{ fontWeight: 500 }}>{t("需要的文件", "Documents it needs")}</span>
          <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 200px), 1fr))" }}>{ct.evidence.filter((k) => !["list", "statement"].includes(k)).map((k) => <Drop key={k} label={kindName(t, k)} onFiles={(f) => add(k === "receipt_or_photo" ? "receipt" : k, f)} have={ev.filter((e) => e.kind === k || (k === "receipt_or_photo" && ["receipt", "photo"].includes(e.kind))).length} />)}</div>
          {ev.length > 0 && <div className="thumbs">{ev.map((e, i) => <figure key={i}>{e.preview ? <img src={e.preview} alt="" /> : <div className="doc"><Icon name="doc" /></div>}<figcaption>{kindName(t, e.kind)} · <button className="link tiny" onClick={() => setEv(ev.filter((_, j) => j !== i))}>{t("移除", "remove")}</button></figcaption></figure>)}</div>}
        </div>
        {!me?.email && <div className="note warn">{t("你還沒填 PayPal email，理賠核准後會等你補上才能入帳。", "You haven't added a PayPal email; an approved claim waits until you do.")}</div>}
        <button className="btn accent" disabled={busy || !(+amount > 0)} onClick={submit}>{busy ? t("Lumi 正在檢查…", "Lumi is checking…") : t("送出理賠", "Send the claim")}</button>
        <p className="tiny muted">{t("請只申請真的發生的事。不實申請會被拒賠，並可能終止保單。", "Only claim for what really happened. A false claim is refused and can end the policy.")}</p>
      </div>}
    </div>
  );
}

function Drop({ label, onFiles, have }) {
  const t = useT(), input = useRef(null), [over, setOver] = useState(false);
  return (
    <div className={`drop ${over ? "over" : ""}`} onClick={() => input.current.click()} onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)} onDrop={(e) => { e.preventDefault(); setOver(false); onFiles([...e.dataTransfer.files]); }} role="button" tabIndex={0} onKeyDown={(e) => e.key === "Enter" && input.current.click()}>
      <Icon name={/照片|Photo/.test(label) ? "camera" : "doc"} /><div className="small" style={{ marginTop: 6 }}>{label}</div><div className="tiny">{have ? t(`已加 ${have} 個`, `${have} added`) : t("點選或拖放", "Click or drop")}</div>
      <input ref={input} type="file" accept="image/*,application/pdf" multiple hidden onChange={(e) => onFiles([...e.target.files])} />
    </div>
  );
}

const CHECK = { in_force: ["保單當時有效", "Policy in force"], waiting: ["等待期", "Waiting period"], covered: ["有這項保障", "Covered"], reported: ["申請時限", "Reported in time"], police_24h: ["24 小時內報案", "Police within 24 h"], documents_read: ["文件判讀", "Documents read"],
  listed: ["保單上的航班", "An insured flight"], not_known: ["投保時未知", "Not known when bought"], threshold: ["航班狀態達到給付條件", "The flight status qualifies"], cap: ["這趟的上限", "The trip's cap"] };
export function ClaimPage({ id }) {
  const t = useT(), { toast } = useMe();
  const { lang } = useLang();
  const { data: c, reload } = useApi(`/api/claims/${id}?lang=${lang}`);
  // an add-on is named in a check by its id ("the devices add-on"): say its name instead (zh.js does it for Chinese)
  const { data: prod } = useApi(c ? `/api/products/${c.product}?lang=en` : null);
  const named = (s) => (lang === "en" && prod && typeof s === "string" ? s.replace(/\bthe (\w+) add-on\b/g, (m, a) => { const x = prod.addons.find((y) => y.id === a); return x ? `the add-on "${x.what.replace(/\s*\(.*\)$/, "")}"` : m; }) : s);
  const [shown, setShown] = useState(new URLSearchParams(location.search).get("fresh") ? 0 : 99), [why, setWhy] = useState("");
  useEffect(() => { if (shown < 99 && c?.decision) { const n = c.decision.checks.length + 1; const tm = setInterval(() => setShown((s) => (s >= n ? (clearInterval(tm), 99) : s + 1)), 450); return () => clearInterval(tm); } }, [c?.decision]);
  useEffect(() => { if (c && ["paying", "deciding"].includes(c.status)) { const tm = setTimeout(reload, 1500); return () => clearTimeout(tm); } }, [c]);
  useEffect(() => { const f = () => reload(); addEventListener("cover:refresh", f); return () => removeEventListener("cover:refresh", f); }, [reload]);
  if (!c) return null;
  const d = c.decision, done = shown >= 99;
  const addMore = async (kind, files) => { for (const f of files) { const e = await asEvidence(kind, f); delete e.preview; const r = await api(`/api/claims/${id}/evidence`, { method: "POST", body: e }).catch((x) => toast(x.message)); if (r?.error) toast(r.message); } reload(); };
  return (
    <div className="grid-2">
      <div className="stack">
        <div><p className="eyebrow mono">{c.number}</p><h1>{c.what}</h1><p className="small muted">{t("發生於", "Happened")} {when(c.happenedAt)} · {t("申請", "claimed")} {c.claimed}</p></div>
        {c.status === "needs_evidence" && <div className="card stack"><b>{t("還缺這些文件", "Still needed")}</b><div className="grid">{c.missing.map((k) => <Drop key={k} label={kindName(t, k)} onFiles={(f) => addMore(k === "receipt_or_photo" ? "receipt" : k, f)} have={0} />)}</div></div>}
        {c.status === "needs_info" && <div className="card stack"><div className="note warn">{t("理賠人員想知道：", "The adjuster asks:")} {c.asked}</div><Drop label={t("補上文件", "Add a document")} onFiles={(f) => addMore("other", f)} have={0} /></div>}
        {d && done && <div className={`big-result ${c.status === "paid" ? "paid" : c.status === "denied" ? "denied" : "referred"}`}>
          {c.status === "paid" ? <><span className="data" style={{ color: "var(--ok)" }}>{t("已入帳", "PAID")}</span><b className="num">{c.payout.amount}</b><p>{c.payout.to === "the vet" ? t("已用 PayPal 付給動物醫院", "Sent to the vet with PayPal") : t("已用 PayPal 付給你", "Sent to your PayPal")}{c.payout.secondsToPay != null && d.by === "rules" ? t(`，申請後 ${secs(c.payout.secondsToPay)}`, `, ${secs(c.payout.secondsToPay)} after you claimed`) : ""}</p><p className="tiny muted mono">PayPal Payouts {c.payout.paypal} · {c.payout.status}</p></>
            : c.status === "denied" ? <><b>{t("不在保障內", "Not covered")}</b><p>{named(d.reason)}</p></>
            : <><b>{t("交給真人", "With a person")}</b><p>{d.reason}</p><p className="tiny muted">{t("Cover 的理賠人員會看你的案件，不會因為這些訊號就自動拒賠。", "A Cover adjuster looks at it; nothing here refuses your claim by itself.")}</p></>}
        </div>}
        {c.status === "denied" && !c.appeal && done && <div className="card stack-s"><b>{t("覺得判斷錯了？", "Think this is wrong?")}</b><textarea className="input" placeholder={t("說明一下（選填）", "Tell us why (optional)")} value={why} onChange={(e) => setWhy(e.target.value)} /><button className="btn ghost" onClick={async () => { await api(`/api/claims/${id}/appeal`, { method: "POST", body: { why } }); toast(t("已送給真人重新審查", "Sent to a person to look again")); reload(); }}>{t("請真人再看一次", "Ask a person to look again")}</button></div>}
        {c.appeal === "open" && <div className="note">{t("已申請由真人重新審查。", "A person will look at this again.")}</div>}
      </div>
      <div className="stack">
        {d && <div className="card stack">
          <div className="row between"><h3>{t("Lumi 檢查了什麼", "What Lumi checked")}</h3><span className="tiny muted">{d.by === "rules" ? t("由規則判斷", "decided by rules") : d.by === "parametric" ? t("依航班狀態自動判斷，不用申請", "decided from the flight status, no claim filed") : t(`由理賠人員判斷（${d.by}）`, `decided by ${d.by}`)}</span></div>
          <ul className="checks">{d.checks.slice(0, shown).map((x) => <li key={x.check} className={`check ${x.ok ? "ok" : x.hard ? "no" : "flag"}`}><span className="dot">{x.ok ? "✓" : "!"}</span><span><b>{t(...(CHECK[x.check] || [x.check, x.check]))}</b><br /><span className="muted">{named(x.says)}</span></span><span className="clause">{x.clause}</span></li>)}
            {shown > d.checks.length && Array.isArray(d.signals) && d.signals.map((s, i) => <li key={i} className="check flag"><span className="dot">!</span><span><b>{t("需要真人看", "For a person to check")}</b><br /><span className="muted">{s.says}</span></span><span /></li>)}
            {shown > d.checks.length && typeof d.signals === "string" && <li className="check flag"><span className="dot">!</span><span>{d.signals}</span><span /></li>}
          </ul>
          {done && d.steps?.length > 0 && <div><p className="small" style={{ fontWeight: 500 }}>{t("金額怎麼算", "How the amount was worked out")}</p><ul className="why">{d.steps.map((s, i) => <li key={i}><span>{s.says} {s.clause && <span className="mono muted">{s.clause}</span>}</span><span className="num">{s.amount}</span></li>)}<li><b>{t("核定", "Decided")}</b><b className="num">{d.amount}</b></li></ul></div>}
          {done && <details><summary className="small" style={{ cursor: "pointer" }}>{t("依據的條款", "The clauses it rests on")}</summary><div className="stack-s" style={{ marginTop: 8 }}>{d.basis.map((b) => <p key={b.id} className="small"><span className="mono">{b.id}</span> <span className="muted">{b.text}</span></p>)}</div></details>}
        </div>}
        {c.evidence.length > 0 && <div className="card stack-s"><h3>{t("文件", "Documents")}</h3>
          <div className="thumbs">{c.evidence.map((e) => <figure key={e.id}>{e.kind === "flight_record" ? <div className="doc"><Icon name="doc" /></div> : <img src={`/api/claims/${id}/evidence/${e.id}`} alt="" onError={(x) => { x.currentTarget.replaceWith(Object.assign(document.createElement("div"), { className: "doc", textContent: "PDF" })); }} />}<figcaption>{kindName(t, e.kind)}{e.taken ? ` · ${t("拍攝", "taken")} ${e.taken.slice(0, 10)}` : ""}{e.read ? <><br />{t("讀到", "read")}: {[e.read.date, e.read.amount, e.read.merchant].filter(Boolean).join(" · ")}</> : null}</figcaption></figure>)}</div>
        </div>}
        {c.receipts?.length > 0 && <p className="tiny muted">{t("這個決定的收據已簽章並記進透明帳本：", "This decision's receipt is signed and in the transparency log:")} <span className="mono">{c.receipts.at(-1)}</span></p>}
        {!["paid", "paying", "withdrawn"].includes(c.status) && <button className="link small" onClick={async () => { await api(`/api/claims/${id}/withdraw`, { method: "POST" }); reload(); }}>{t("撤回理賠", "Withdraw the claim")}</button>}
        <Link to={`/policies/${c.policy}`} className="link small">{t("回到保單", "Back to the policy")}</Link>
      </div>
    </div>
  );
}
