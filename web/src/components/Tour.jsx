// The judge tour: on a first visit, a small guide walks through Cover's story in about three minutes — a person's AI
// agent insures a trip (or the tour plays the agent, calling the same REST tools with a token it makes), the person
// approves the payment, the demo flight feed delays the flight, the payout arrives with no claim filed, then the
// ledger and the back office. A second path does a renters claim with documents drawn here in the browser. Each step
// says what to do and why it matters, and a button does the typing. Kept in localStorage "cover.tour"; closing it is
// remembered, and the demo panel starts it again.
import { useEffect, useState } from "react";
import { api, navigate, usePath, useT, useLang } from "../api.jsx";
import { useMe } from "../App.jsx";

const KEY = "cover.tour";
const load = () => { try { return JSON.parse(localStorage.getItem(KEY) || "null"); } catch { return null; } };
const keep = (s) => { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch {} };
export function startTour() { keep({ step: 0, open: true }); dispatchEvent(new Event("cover:tour")); }

// The renters quote the tour fills in: an apartment in Austin, TX 78704 with $8,000 of belongings and the device add-on,
// so a dropped phone is covered. The answers are built from the product's own questions (whatever they are today):
// a preferred value where one is named and valid, else a plain middle answer.
const PLACE = "Austin, TX 78704";
const PREFER = { place: PLACE, address: PLACE, zip: "78704", state: "TX", contents: 8000, valuables: 0, claims3y: 0, deductible: "250", floor: "low", building: "managed", sqft: 750, size: 750 };
export function autofill(questions, prefer = PREFER) {
  return Object.fromEntries((questions || []).map((q) => {
    const want = prefer[q.id];
    if (q.options) return [q.id, (q.options.find((o) => o.value === String(want)) || q.options[Math.min(1, q.options.length - 1)]).value];
    if (q.type === "bool") return [q.id, !!want];
    if (q.type === "number") { const v = typeof want === "number" ? want : Math.round(q.min + (q.max - q.min) * 0.15); return [q.id, Math.max(q.min, Math.min(q.max, v))]; }
    return [q.id, want ?? (q.type === "place" ? PLACE : "none")];
  }));
}
const REPAIR = 180; // the invoice's total: $130 paid after the add-on's $50 deductible, well inside the instant limit

// ---- sample documents, drawn on a canvas: a US repair-shop invoice dated today on Cover's clock, a police report
// with a case number (for a claim type that needs one), and a photo of the damage. Every copy is its own file (the
// paper grain and numbers are random), so two judges never send "the same" document.
const asFile = (c, name) => new Promise((ok) => c.toBlob((b) => ok(new File([b], name, { type: "image/jpeg" })), "image/jpeg", 0.9));
const rand = (a, b) => a + Math.random() * (b - a);
function paper() {
  const c = Object.assign(document.createElement("canvas"), { width: 900, height: 1200 }), g = c.getContext("2d");
  g.fillStyle = "#fbfaf5"; g.fillRect(0, 0, 900, 1200);
  for (let i = 0; i < 1400; i++) { g.fillStyle = `rgba(120,110,90,${rand(0.02, 0.07)})`; g.fillRect(rand(0, 900), rand(0, 1200), 2, 2); }
  const text = (s, x, y, font, align = "left", color = "#1c1c1e") => { g.font = `${font} Arial, Helvetica, sans-serif`; g.textAlign = align; g.fillStyle = color; g.fillText(s, x, y); };
  const rule = (y, w = 1.5) => { g.fillStyle = "#1c1c1e"; g.fillRect(60, y, 780, w); };
  const stamp = (word, sub) => { g.save(); g.translate(680, 1030); g.rotate(rand(-0.3, -0.1)); g.strokeStyle = "rgba(196,32,32,.8)"; g.lineWidth = 5; g.strokeRect(-130, -48, 260, 96); text(word, 0, 8, "900 40px", "center", "rgba(196,32,32,.85)"); text(sub, 0, 36, "700 18px", "center", "rgba(196,32,32,.85)"); g.restore(); };
  return { c, g, text, rule, stamp };
}
function repairInvoice(date, amount, who) {
  const { c, text, rule, stamp } = paper(), no = `INV-${Math.floor(rand(10000, 99999))}`, labor = 30;
  text("FIXPOINT DEVICE REPAIR", 60, 110, "900 46px"); text("Demo shop · 1100 S Congress Ave, Austin, TX 78704 · (512) 555-0100", 60, 150, "400 20px", "left", "#444");
  text("REPAIR INVOICE", 840, 230, "800 34px", "right");
  rule(260);
  [["Date", date], ["Invoice #", no], ["Customer", who || "—"], ["Device", "iPhone 13, cracked screen"]].forEach(([k, v], i) => { text(k, 60, 316 + i * 48, "500 24px", "left", "#555"); text(v, 280, 316 + i * 48, "600 26px"); });
  rule(520); text("Description", 60, 560, "600 22px", "left", "#555"); text("Qty", 560, 560, "600 22px", "center", "#555"); text("Amount (USD)", 840, 560, "600 22px", "right", "#555"); rule(578, 1);
  [["Screen assembly replacement", amount - labor], ["Labor", labor], ["Sales tax", 0]].forEach(([k, v], i) => { const y = 628 + i * 56; text(k, 60, y, "500 26px"); text(i < 2 ? "1" : "", 560, y, "500 26px", "center"); text(`$${v.toFixed(2)}`, 840, y, "500 26px", "right"); });
  rule(800); text("TOTAL DUE", 60, 866, "900 36px"); text(`$${amount.toFixed(2)}`, 840, 866, "800 46px", "right");
  rule(894, 1);
  text("Estimate valid for 30 days. Parts carry a 90-day warranty.", 60, 950, "400 22px", "left", "#444");
  stamp("ESTIMATE", date);
  text("Cover demo sample: not a real business or invoice.", 60, 1150, "400 18px", "left", "#888");
  return asFile(c, "repair-invoice.jpg");
}
function policeReport(date, who, where) {
  const { c, text, rule, stamp } = paper(), caseNo = `DEMO-${date.slice(-2)}-${Math.floor(rand(100000, 999999))}`;
  text("DEMO CITY POLICE DEPARTMENT", 450, 110, "900 40px", "center"); text("Incident Report · Victim Copy", 450, 150, "500 22px", "center", "#444");
  rule(190);
  [["Case number", caseNo], ["Date reported", date], ["Reported by", who || "—"], ["Location", where || PLACE], ["Offense", "Theft (property)"], ["Reporting officer", `Ofc. J. Rivera #${Math.floor(rand(1000, 9999))}`]].forEach(([k, v], i) => { text(k, 60, 250 + i * 50, "500 24px", "left", "#555"); text(v, 330, 250 + i * 50, "600 26px"); });
  rule(560); text("Narrative", 60, 604, "700 24px");
  ["Reporting party states personal property was taken.", "No suspect information at this time.", "Victim advised to provide case number to insurer."].forEach((s, i) => text(s, 60, 650 + i * 40, "400 23px", "left", "#333"));
  stamp("FILED", date);
  text("Cover demo sample: not a real police department or report.", 60, 1150, "400 18px", "left", "#888");
  return asFile(c, "police-report.jpg");
}
function damagePhoto() {
  const c = Object.assign(document.createElement("canvas"), { width: 1200, height: 900 }), g = c.getContext("2d");
  // a desk (random wood and light, so no two photos hash alike), a phone at a random angle, a crack from a random point
  const h = rand(20, 40), bg = g.createLinearGradient(0, 0, 1200, 900);
  bg.addColorStop(0, `hsl(${h} ${rand(25, 45)}% ${rand(30, 45)}%)`); bg.addColorStop(1, `hsl(${h + rand(-8, 8)} ${rand(20, 40)}% ${rand(15, 28)}%)`);
  g.fillStyle = bg; g.fillRect(0, 0, 1200, 900);
  for (let i = 0; i < 40; i++) { g.strokeStyle = `rgba(0,0,0,${rand(0.03, 0.09)})`; g.lineWidth = rand(1, 4); g.beginPath(); const y = rand(0, 900); g.moveTo(0, y); g.bezierCurveTo(400, y + rand(-40, 40), 800, y + rand(-40, 40), 1200, y + rand(-30, 30)); g.stroke(); }
  g.save(); g.translate(rand(480, 720), rand(380, 520)); g.rotate(rand(-0.5, 0.5));
  g.shadowColor = "rgba(0,0,0,.5)"; g.shadowBlur = 40; g.shadowOffsetX = 12; g.shadowOffsetY = 18;
  g.fillStyle = "#202024"; g.beginPath(); g.roundRect(-200, -350, 400, 700, 48); g.fill();
  g.shadowColor = "transparent";
  g.fillStyle = "#0b0d12"; g.beginPath(); g.roundRect(-180, -330, 360, 660, 30); g.fill();
  const glare = g.createLinearGradient(-180, -330, 180, 330); glare.addColorStop(0, "rgba(255,255,255,.14)"); glare.addColorStop(0.5, "rgba(255,255,255,0)"); g.fillStyle = glare; g.fillRect(-180, -330, 360, 660);
  const ix = rand(-120, 120), iy = rand(-250, 250);
  g.strokeStyle = "rgba(235,240,255,.85)"; g.lineCap = "round";
  for (let i = 0; i < 14; i++) { let x = ix, y = iy, a = rand(0, Math.PI * 2); g.lineWidth = rand(1, 2.6); g.beginPath(); g.moveTo(x, y); for (let k = 0; k < 7; k++) { a += rand(-0.5, 0.5); x += Math.cos(a) * rand(20, 60); y += Math.sin(a) * rand(20, 60); g.lineTo(Math.max(-180, Math.min(180, x)), Math.max(-330, Math.min(330, y))); } g.stroke(); }
  g.fillStyle = "rgba(235,240,255,.6)"; g.beginPath(); g.arc(ix, iy, 10, 0, Math.PI * 2); g.fill();
  g.restore();
  return asFile(c, "cracked-phone.jpg");
}

// the trip the tour's agent insures: two flights a week out on Cover's clock, two travelers
const TRIP = { destination: "europe", tripCost: 1800, travelers: 2, oldest: 34, plan: "standard", cause: "ocean", out: "UA901", back: "UA900" };
const isoDay = (ms) => new Date(ms).toISOString().slice(0, 10);
// an agent's call, as an agent makes it: the REST twin of the MCP tool, with the person's agent token
const agentCall = async (token, tool, body) => { const r = await fetch(`/api/agent/${tool}`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify(body) }); return r.json(); };

export default function Tour() {
  const t = useT(), { lang } = useLang(), { me, info, setInfo, reload, toast } = useMe(), path = usePath();
  const [s, setS] = useState(() => load() || { step: 0, open: true }), [busy, setBusy] = useState(false), [cl, setCl] = useState(null);
  const set = (patch) => setS((x) => { const n = { ...x, ...patch }; keep(n); return n; });
  useEffect(() => { const f = () => setS(load() || { step: 0, open: true }); addEventListener("cover:tour", f); return () => removeEventListener("cover:tour", f); }, []);
  const here = path.split("?")[0], flow = s.flow === "renters" ? "renters" : "trip";
  const FLOWS = { trip: ["welcome", "signin", "agent", "approve", "delay", "payout", "ledger", "office"], renters: ["quote", "pay", "skip", "claim", "watch", "office"] };
  const ids = FLOWS[flow], n = Math.min(s.step || 0, ids.length - 1), id = ids[n];

  // steps finish themselves when the page shows they are done: signed in, the policy paid, the claim sent
  useEffect(() => { if (id === "signin" && me) set({ step: n + 1 }); }, [id, me]);
  useEffect(() => {
    const m = here.match(/^\/policies\/(pol_\w+)$/);
    if (!(id === "pay" || id === "approve") || !m) return;
    let off = false;
    const look = () => api(`/api/policies/${m[1]}`).then((p) => { if (!off && ["active", "grace"].includes(p.status)) { set({ step: n + 1, [flow === "trip" ? "trip" : "policy"]: m[1] }); dispatchEvent(new Event("cover:refresh")); } }).catch(() => {});
    look(); const tm = setInterval(look, 3000);
    return () => { off = true; clearInterval(tm); };
  }, [id, here]);
  useEffect(() => { const m = here.match(/^\/claims\/(clm_\w+)$/); if (id === "claim" && m) set({ step: n + 1, claim: m[1] }); }, [id, here]);
  // the claim being decided (or the automatic one being paid), as the person sees it
  useEffect(() => {
    const cid = id === "watch" ? s.claim : id === "payout" ? s.flightClaim : null;
    if (!cid) return;
    let off = false, tm;
    const look = () => api(`/api/claims/${cid}?lang=${lang}`).then((c) => { if (off) return; setCl(c); if (["paying", "deciding"].includes(c.status)) tm = setTimeout(look, 1500); }).catch(() => {});
    look();
    return () => { off = true; clearTimeout(tm); };
  }, [id, s.claim, s.flightClaim, lang]);

  if (!info?.demoSignin || s.done || s.dismissed) return null;
  const run = async (fn) => { setBusy(true); try { await fn(); } catch (e) { toast(e.message); } setBusy(false); };
  const myPolicy = async () => s.policy || (await api("/api/policies").catch(() => [])).filter((p) => p.product === "renters" && ["active", "grace"].includes(p.status)).at(-1)?.policy;
  const go = (step, extra = {}) => run(async () => {
    const f = extra.flow || flow, to = FLOWS[f][step] === "claim" ? await myPolicy() : null;
    set({ step, open: true, ...extra, ...(to ? { policy: to } : {}) });
    const where = STEP[FLOWS[f][step]]?.go?.(to || s.policy);
    if (where && where !== here) navigate(where);
  });
  const next = () => go(n + 1);
  const staff = async (to) => { await api("/api/auth/staff", { method: "POST", body: {} }); navigate(to); };
  const real = info?.paypal !== "mock";
  const coverToday = () => new Date(info?.now || Date.now()).toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "numeric" }); // MM/DD/YYYY on Cover's clock
  // the renters product as it is today: its questions (for the quote) and its claim types (for the documents needed)
  const renters = () => api("/api/products/renters?lang=en");
  const DOC = { repair_quote: () => repairInvoice(coverToday(), REPAIR, me?.name), receipt: () => repairInvoice(coverToday(), REPAIR, me?.name), receipt_or_photo: () => damagePhoto(), photo: () => damagePhoto(), police_report: (w) => policeReport(coverToday(), me?.name, w) };
  const flight = s.flight; // { flight, date } the tour's agent insured

  // play the agent: a token with the scopes a travel agent needs, limits that let it buy one trip, then insure_trip
  const playAgent = () => run(async () => {
    const tok = await api("/api/tokens", { method: "POST", body: { label: t("導覽的 agent", "Tour agent"), scopes: ["read", "buy", "claim"] } });
    await api("/api/limits", { method: "PUT", body: { monthlyMax: 50000, mayBuy: true, mayCancel: false, autopay: true } });
    const now = Date.parse(info?.now || new Date().toISOString()), dep = isoDay(now + 7 * 864e5), ret = isoDay(now + 14 * 864e5);
    const body = { destination: TRIP.destination, departure: dep, return: ret, flights: [{ flight: TRIP.out, date: dep }, { flight: TRIP.back, date: ret }], tripCost: TRIP.tripCost, travelers: TRIP.travelers, oldest: TRIP.oldest, plan: TRIP.plan, cause: TRIP.cause };
    const r = await agentCall(tok.token, "insure_trip", body);
    if (r.error || !r.policy?.policy) throw new Error(r.message || r.policy?.message || r.error || "insure_trip failed");
    const pol = r.policy;
    set({ trip: pol.policy, flight: { flight: TRIP.out, date: dep }, agentSaid: `insure_trip → ${pol.number} · ${r.quote?.trip || pol.annual} · ${pol.status}` });
    dispatchEvent(new Event("cover:refresh"));
    // without saved PayPal the person approves the first payment themselves; with it (and autopay) it is already paid
    set({ step: FLOWS.trip.indexOf(pol.status === "active" ? "delay" : "approve") }); navigate(`/policies/${pol.policy}`);
  });
  const delay = (status, delayMin) => run(async () => {
    if (!flight) throw new Error(t("先讓 agent 投保一趟旅程。", "Have the agent insure a trip first."));
    const r = await api("/api/demo/flight", { method: "POST", body: { ...flight, status, delayMin } });
    const c = r.paid?.[0];
    dispatchEvent(new Event("cover:refresh"));
    if (!c) throw new Error(t("這次延誤沒有觸發給付。", "That delay didn't trigger a payout."));
    set({ step: FLOWS.trip.indexOf("payout"), flightClaim: c.claim }); navigate(`/claims/${c.claim}`);
  });

  const STEP = {
    welcome: { title: t("評審導覽：3 分鐘看完 Cover", "Judge tour: Cover in 3 minutes"),
      body: t("你的 AI agent 幫你規劃旅行時，順便替你買旅遊險。班機延誤時，Cover 從航班狀態看到，幾分鐘內用 PayPal 自動付款，不用申請。剩下的保費年底捐給公益。", "Your AI agent buys travel insurance for you while it plans your trip. When the flight is delayed, Cover sees it in the flight status and pays you with PayPal in minutes, with no claim to file. What the pool doesn't need goes to causes."),
      why: real ? t("每一步都是真的：真的 agent 工具呼叫、真的 PayPal 沙盒、真的條款檢查。需要打字的地方，按按鈕就好。", "Nothing is staged: real agent tool calls, real PayPal sandbox calls, real clause checks. Wherever there's typing, a button does it.")
        : t("這台 Cover 沒有 PayPal 沙盒金鑰，用的是標明「模擬」的 PayPal 替身；其他都是真的：agent 工具、條款檢查、帳本。", "This Cover runs without PayPal sandbox keys, on a PayPal stand-in marked as simulated; the rest is real: the agent tools, the clause checks, the ledger."),
      primary: [t("開始", "Start"), () => go(me ? 2 : 1)], secondary: [t("不用了", "No thanks"), () => set({ dismissed: true })] },
    signin: { title: t("登入（只要名字）", "Sign in (just a name)"), go: () => "/signin?next=/connect",
      body: t("示範版只要一個名字就能開始。", "The demo needs only a name."),
      why: t("你是 agent 的主人：它能花多少、錢付到哪裡，只有你能改。", "You are the agent's person: only you can change what it may spend and where money is paid."),
      helper: [t("幫我登入", "Sign me in"), () => run(async () => { try { localStorage.removeItem("cover.device"); } catch {} await api("/api/auth/demo", { method: "POST", body: { name: t("評審", "Judge"), lang } }); await reload(); navigate("/connect"); })] },
    agent: { title: t("你的 agent 替旅程投保", "Your agent insures the trip"), go: () => "/connect",
      body: t(`這頁可以把你自己的 agent（例如 Claude）透過 MCP 連上 Cover。沒有的話，按「扮演 agent」：建一個 token，讓它呼叫 insure_trip，替兩個人 ${TRIP.out}/${TRIP.back} 往返歐洲的旅程投保。`, `This page connects your own agent (Claude, say) to Cover over MCP. No agent handy? "Play the agent" makes a token and calls insure_trip, as an agent would, for a round trip to Europe on ${TRIP.out}/${TRIP.back} for two.`),
      why: t("agent 用的是和網站一樣的規則，但花費上限、能不能自動付款、理賠付到哪，只有你能設定。", "The agent works under the same rules as the website, but the spending limit, autopay and where claims are paid are yours to set, never the agent's."),
      helper: [t("扮演 agent", "Play the agent"), playAgent] },
    approve: { title: t("核准付款", "Approve the payment"), go: () => (s.trip ? `/policies/${s.trip}` : "/policies"),
      body: real ? t("agent 不能替你花第一筆錢：在 PayPal 按鈕核准這趟的保費。之後存好的 PayPal 讓它在上限內自己付。", "Your agent can't spend your money the first time: approve the trip's premium with the PayPal button. After that, your saved PayPal lets it pay within your limit.")
        : t("agent 不能替你花第一筆錢：按 PayPal 付款，在模擬的 PayPal 頁面按同意。", "Your agent can't spend your money the first time: press the PayPal button and agree on the simulated PayPal page."),
      why: t("PayPal Orders 加 Vault：這次核准同時存好付款方式，之後 agent 在你給的上限內付款，不用再跳轉。", "PayPal Orders with the Vault: this one approval also saves the payment method, so later the agent pays within your limit with no redirect."),
      // with the sandbox, judges have no buyer login: PayPal's published test card pays instead (sandbox only)
      helper: real && info?.testCard && s.trip ? [t("用沙盒測試卡付款", "Pay with the sandbox test card"), () => run(async () => { const r = await api(`/api/policies/${s.trip}/pay-card`, { method: "POST" }); if (r.error) toast(r.message); dispatchEvent(new Event("cover:refresh")); })]
        : [t("打開 PayPal", "Open PayPal"), () => { const b = document.querySelector(".pp-buttons a.btn, .pp-buttons paypal-button"); if (b) b.click(); else toast(t("PayPal 按鈕還在載入。", "PayPal's button is still loading.")); }],
      ...(real && info?.testCard ? { extra: [t("或用 PayPal 帳號登入付款", "Or sign in to PayPal instead"), () => { const b = document.querySelector(".pp-buttons a.btn, .pp-buttons paypal-button"); if (b) b.click(); }] } : {}) },
    delay: { title: t("讓班機延誤", "Delay the flight"), go: () => (s.trip ? `/policies/${s.trip}` : "/policies"),
      body: t(`示範的航班資料：讓 ${flight?.flight || TRIP.out}（${flight?.date || ""}）晚 6 小時 20 分起飛。示範控制台也有同樣的按鈕。`, `The demo flight feed: make ${flight?.flight || TRIP.out} on ${flight?.date || "its date"} depart 6 h 20 min late. The Demo panel has the same control.`),
      why: t("參數型保險：條款寫好「晚 6 小時付每人 $300」，航班狀態一到，Cover 就自己開理賠、付款。沒有表格，沒有收據。", "Parametric cover: the clause says \"6 hours late pays $300 a traveler\", so when the flight status arrives Cover files and pays the claim itself. No form, no receipts."),
      helper: [t("延誤 6 小時 20 分", "Delay it 6 h 20 min"), () => delay("departed", 380)], extra: [t("改成取消", "Cancel it instead"), () => delay("cancelled", 0)] },
    payout: { title: t("錢自己來了", "The payout arrives"), go: () => (s.flightClaim ? `/claims/${s.flightClaim}` : "/policies"),
      body: !cl ? t("Cover 正在檢查航班紀錄…", "Cover is checking the flight record…")
        : cl.status === "paid" ? t(`已用 PayPal Payouts 付了 ${cl.payout.amount}，沒有人申請。每一項檢查都寫出條款編號。`, `${cl.payout.amount} sent with PayPal Payouts, and nobody filed anything. Every check names its clause.`)
        : t("看頁面上的每一項檢查和它依據的條款。", "Read each check on the page and the clause it rests on."),
      why: t("決定的收據已簽章，記進透明帳本，事後改不了。你的 agent 用 wait_for_news 也會收到通知。", "The decision's receipt is signed into the transparency log, so it can't be quietly changed later. Your agent hears about it too, through wait_for_news.") },
    ledger: { title: t("帳本和捐款", "The ledger and the giveback"), go: () => "/transparency",
      body: t("每個公益池收了多少保費、付了多少理賠和再保險、現在剩多少。", "Each cause pool: premiums in, claims and reinsurance out, and what's left."),
      why: t("保費一進來就分成 Cover 的 20% 和理賠池。年底池子剩下的錢，用 PayPal Payouts 捐出去，所以 Cover 少賠也不會多賺。", "Every premium splits at once: 20% to Cover, the rest to the pool. What the pool doesn't pay out is given to the cause with PayPal Payouts at year end, so Cover gains nothing by refusing claims.") },
    office: { title: t("後台", "The back office"),
      body: t("以 Cover 員工身分登入：損失率、自動給付、曝險，還有審核台上等著真人看的理賠。", "Sign in as Cover's staff: the loss ratio, the automatic payouts, the exposure, and the claims waiting for a person on the desk."),
      why: t("理賠人、審核員和後台看的是同一份帳本和同一套條款。種子資料是標明「Demo」的示範資料。", "The claimant, the adjuster and the back office read the same ledger and the same clauses. Seeded people are marked \"Demo\"."),
      helper: [t("以員工身分開啟後台", "Open it as staff"), () => run(() => staff("/carrier"))], primary: [t("完成", "Finish"), () => set({ done: true })],
      ...(flow === "trip" ? { extra: [t("再試：租屋險理賠", "Also try: a renters claim"), () => go(0, { flow: "renters" })] } : {}) },
    // the second path: a renters policy and a claim with documents, decided clause by clause
    quote: { title: t("報價：租屋險", "Get a price: renters"), go: () => "/quote/renters",
      body: t(`Lumi 照條款一題一題問。按「幫我填」：一間在 ${PLACE} 的公寓，東西值 8,000 美元，加購 3C 意外損壞。`, `Lumi asks the policy's questions one at a time. "Fill this for me" answers them: an apartment in ${PLACE}, $8,000 of belongings, with the device-damage add-on.`),
      why: t("價格拆成零件：多少進理賠池、多少付再保、Cover 固定拿 20%，還有每個因子讓價格變多少。", "The price comes apart: what goes to the claims pool, what pays reinsurance, Cover's flat 20%, and what each factor did to the price."),
      helper: [t("幫我填", "Fill this for me"), () => run(async () => {
        const p = await renters(), device = p.addons.find((a) => /device/.test(a.id));
        dispatchEvent(new CustomEvent("cover:fill-quote", { detail: { answers: autofill(p.questions), addons: device ? [device.id] : [] } })); set({ step: n + 1 });
      })] },
    pay: { title: t("付第一期保費", "Pay the first premium"), go: () => "/quote/renters",
      body: info?.testCard ? t("往下捲到「購買」，按「用 PayPal 沙盒測試卡付款」。不用登入 PayPal。", "Scroll down to Buy and press \"Pay with PayPal's sandbox test card\". No PayPal sign-in needed.") : real ? t("往下捲到「購買」，按 PayPal 付款，用 PayPal 沙盒的買家帳號同意。", "Scroll down to Buy, press the PayPal button and approve with a PayPal sandbox buyer account.")
        : t("往下捲到「購買」，按 PayPal 付款，在模擬的 PayPal 頁面按同意。", "Scroll down to Buy, press the PayPal button and agree on the simulated PayPal page."),
      why: t(`${real ? "這是真的 PayPal Orders 呼叫" : "這是 PayPal Orders 呼叫（這台用的是模擬的 PayPal）"}，同時把付款方式存進 Vault，之後的月繳由 Cover 直接扣。`, `That's ${real ? "a real" : "the (simulated here)"} PayPal Orders call, and it saves the payment method in the Vault so Cover charges the monthly premiums itself.`),
      helper: [t("幫我按", "Press it for me"), () => { const b = document.querySelector('[data-tour="pay-card"]') || document.querySelector('[data-tour="pay-paypal"]'); if (b && !b.disabled) b.click(); else toast(t("先拿到報價，再付款。", "Get the price first, then pay.")); }] },
    skip: { title: t("快轉時鐘，過等待期", "Skip the waiting period"),
      body: t("租屋險的意外損壞有等待期（日期寫在保單上）。把 Cover 的時鐘往後撥，跳過它。", "Accidental damage on renters has a waiting period (the policy shows its end date). Move Cover's clock forward past it."),
      why: t("保險要跑一整年：月繳、寬限期、年底捐款。示範時鐘讓你幾秒內看完；PayPal 自己的時間不動。", "Insurance runs over a year: monthly premiums, grace periods, the year-end giveback. The demo clock shows it in seconds; PayPal's own times stay real."),
      helper: [t("快轉到等待期之後", "Skip past it"), () => run(async () => {
        const pid = await myPolicy(), p = pid ? await api(`/api/policies/${pid}`).catch(() => null) : null;
        const days = p?.waitingUntil ? Math.max(1, Math.ceil((Date.parse(p.waitingUntil) - Date.parse(info.now)) / 864e5) + 1) : 15;
        const r = await api("/api/demo/advance", { method: "POST", body: { days } });
        setInfo((i) => ({ ...i, now: r.now, demoDaysSkipped: r.skipped })); dispatchEvent(new Event("cover:refresh"));
        toast(t(`時間快轉 ${days} 天：現在是 ${r.now.slice(0, 10)}`, `Skipped ${days} days: it is now ${r.now.slice(0, 10)}`));
        go(n + 1, { policy: pid });
      })] },
    claim: { title: t("報理賠：手機摔壞", "Claim: a cracked phone"), go: (pol) => (pol ? `/claim/new/${pol}` : "/policies"),
      body: t("選手機或筆電損壞，附上維修單和照片，然後送出。「幫我填」會畫一張今天日期的維修店發票（180 美元）和一張照片。", "Pick the device damage claim, add the repair invoice and a photo, then send it. \"Fill this for me\" draws a repair-shop invoice dated today ($180) and a photo."),
      why: t("Cover 的模型讀出發票上的日期和金額，條款決定要賠多少。理賠的文字只當資料，不會被當成指令。", "Cover's model reads the date and amount off the invoice; the clauses decide what's paid. Nothing written in a claim is ever taken as an instruction."),
      helper: [t("幫我填", "Fill this for me"), () => run(async () => {
        if (!/^\/claim\/new\//.test(here)) { const pol = await myPolicy(); if (!pol) throw new Error(t("先買一張租屋險。", "Buy a renters policy first.")); navigate(`/claim/new/${pol}`); await new Promise((ok) => setTimeout(ok, 400)); }
        // the device claim, and a sample of each document it needs (an invoice, a photo; a police report if it asks)
        const p = await renters(), ct = p.claims.find((c) => /device/.test(c.type)) || p.claims[0], where = t("我公寓樓下的樓梯", "The stairs outside my apartment building");
        const kinds = ct.evidence.filter((k) => DOC[k]), files = await Promise.all(kinds.map(async (k) => ({ kind: k === "receipt_or_photo" ? "photo" : k, file: await DOC[k](where) })));
        dispatchEvent(new CustomEvent("cover:fill-claim", { detail: { type: ct.type, amount: REPAIR, where, story: t("下樓梯時手機掉在水泥地上，螢幕整片裂開，觸控失靈。", "I dropped my phone on the concrete stairs; the whole screen cracked and touch stopped working."), files } }));
      })] },
    watch: { title: t("看它被決定", "Watch it decided"),
      body: !cl ? t("Lumi 正在逐條檢查…", "Lumi is checking, clause by clause…")
        : cl.status === "paid" ? t(`已入帳 ${cl.payout.amount}，申請後 ${cl.payout.secondsToPay ?? "—"} 秒。每一項檢查都寫出條款編號。`, `Paid ${cl.payout.amount}, ${cl.payout.secondsToPay ?? "—"} seconds after it was filed. Every check names its clause.`)
        : cl.status === "referred" ? t("這件交給了真人（原因寫在頁面上）。以員工身分到理賠審核台，就能核准並付款。", "This one went to a person (the page says why). Open the claims desk as staff to approve and pay it.")
        : t("看頁面上的每一項檢查和它依據的條款。", "Read each check on the page and the clause it rests on."),
      why: t("全部通過又在秒賠額度內，PayPal Payouts 直接付款，沒有人經手。", "All clear and inside the instant limit, PayPal Payouts pays with no person involved."),
      ...(cl?.status === "referred" ? { helper: [t("到審核台", "Open the claims desk"), () => run(() => staff("/desk"))] } : {}) },
  };
  const st = STEP[id], total = ids.length - (flow === "trip" ? 1 : 0), shown = flow === "trip" ? n : n + 1;
  const where = st.go?.(s.policy), there = where && where.split("?")[0] !== here && !((id === "pay" || id === "approve") && here.startsWith("/policies/"));
  const num = shown ? `${String(shown).padStart(2, "0")}/${String(total).padStart(2, "0")}` : "";
  const label = flow === "renters" ? t("評審導覽 · 租屋險", "JUDGE TOUR · RENTERS") : t("評審導覽", "JUDGE TOUR");

  if (!s.open) return <button className="tour-tab" onClick={() => set({ open: true })} aria-label={t("打開評審導覽", "Open the judge tour")}>{label} {num}</button>;
  return (
    <aside className="tour" aria-label={t("評審導覽", "Judge tour")}>
      <div className="tour-head">
        <span className="data">{label}{num ? ` · ${num}` : ""}</span>
        <span className="row" style={{ gap: 4 }}>
          <button className="tour-x" onClick={() => set({ open: false })} aria-label={t("收起", "Minimise")} title={t("收起", "Minimise")}>–</button>
          <button className="tour-x" onClick={() => { set({ dismissed: true }); toast(t("之後可以從「示範控制」再打開導覽。", "You can start the tour again from the Demo panel.")); }} aria-label={t("關閉導覽", "Close the tour")} title={t("關閉", "Close")}>×</button>
        </span>
      </div>
      {shown > 0 && <ol className="tour-ticks" aria-hidden="true">{Array.from({ length: total }, (_, i) => <li key={i} className={i + 1 < shown ? "done" : i + 1 === shown ? "now" : ""} />)}</ol>}
      <div className="tour-body" aria-live="polite">
        <h3>{st.title}</h3>
        <p>{st.body}</p>
        {id !== "welcome" && s.agentSaid && ["approve", "delay"].includes(id) && <p className="tour-said mono">{s.agentSaid}</p>}
        <div className="tour-why"><span className="eyebrow">{t("為什麼重要", "WHY IT MATTERS")}</span><p>{st.why}</p></div>
      </div>
      <div className="tour-actions">
        {there ? <button className="btn sm accent" onClick={() => navigate(where)}>{t("帶我去", "Take me there")} →</button>
          : st.helper && <button className="btn sm accent" disabled={busy} onClick={st.helper[1]}>{st.helper[0]}</button>}
        {st.primary ? <button className={`btn sm ${st.helper || there ? "" : "accent"}`} onClick={st.primary[1]}>{st.primary[0]}</button>
          : n < ids.length - 1 && <button className="btn sm" disabled={busy} onClick={next}>{t("下一步", "Next")}</button>}
        {st.extra && !there && <button className="btn sm ghost" disabled={busy} onClick={st.extra[1]}>{st.extra[0]}</button>}
        {st.secondary && <button className="link small" onClick={st.secondary[1]}>{st.secondary[0]}</button>}
        {n > (flow === "trip" ? 1 : 0) && <button className="link small" onClick={() => go(n - 1)}>{t("上一步", "Back")}</button>}
      </div>
    </aside>
  );
}
