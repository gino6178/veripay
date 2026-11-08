// The v8 storyboard as a PDF: two frames per shot from the final cut (out/veripay-v8-final.mp4), with the shot's
// time, what's on screen and the narration as spoken. node storyboard7/make.mjs → storyboard7/VeriPay-分鏡-v8.pdf
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { launch } from "../capture/lib.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const shots = JSON.parse(fs.readFileSync(path.join(HERE, "shots.json"), "utf8"));
const PAIN = ["Maria paid the plumber up front. He took the cash, and her faucet still drips.", "Luis fixed a leak first. The client said “later,” and he's still waiting to get paid."];
const INFO = {
  cover: ["封面", "VeriPay 封面圖，PAID 章在 1 秒時蓋下。沒有旁白。", "原速"],
  pain: ["1 痛點動畫", "Maria 先付錢被跑了 → Luis 先做完收不到錢。動畫原本的配樂保留。數據卡：$1,405 home-improvement scam 中位損失（BBB 2025）；59% 小企業有逾期 30 天以上的帳款（QuickBooks 2026）。", "原速"],
  impact: ["2 市場有多大", "三張數字卡，隨旁白落下：$525B 美國居家修繕年支出（Harvard JCHS）· 79% 專業工程行是一人經營（NAHB 2025）· 440M PayPal 帳戶（PayPal Q3 2026）。詐騙數據已在痛點卡上，不再重複。", "原速"],
  solution: ["2a 解法＋給誰用", "PayPal 凍結、AI 檢查、檢查通過就付款。", "0.96 倍"],
  ask: ["3 她的話 → 工單", "Maria 用自己的話發案，模型寫出完工定義和行情區間。", "1.25 倍"],
  find: ["3b 找師傅、議價", "鏡頭推近名單（1.3 倍）→ 拉回看評價 → 再推近議價卡。名單裡兩家真實店家換成虛構名稱 Westside Plumbing、Riverbend Pipe Co.。", "1.25 倍"],
  chat: ["4b 在聊天軟體裡", "從聊天發案、比價、議價；雇用仍回到 VeriPay 和她的 PIN。移到 3b 之後，讓授權→凍結→追加這條金流線不中斷。", "1.25 倍"],
  offers: ["4 報價、授權上限", "Eastside 降到 $185，在簽章授權上限 $200 內雇用；更低上限或重放被拒。", "1.25 倍"],
  hold: ["5 凍結、追加、PIN", "先看 PayPal API 面板的 HELD → 鏡頭推近左側卡片（1.4 倍）：+$47.05 超過代理人額度 → PIN → 重新凍結 $247.05 → 拉回看 API 面板。", "1.25 倍"],
  phone: ["6 師傅的手機", "師傅用手機傳照片和收據。", "1.25 倍"],
  checks: ["7 AI 檢查", "模型讀照片和收據，程式核對時間地點；藏指令的備註出現時鏡頭推近（1.35 倍），紅色警示和 captured $0.00 放大。", "1.25 倍"],
  paid: ["8 放款", "推近 Paid $208.84 卡（1.5 倍）→ 拉回 → 推近 PayPal API 面板的 Payouts 和 Agent Toolkit 對帳（1.3 倍）。", "1.25 倍"],
  novel: ["8a 創新：agentic commerce", "標題「Not found anywhere else in agentic commerce.」四格依序亮起：開放的代理人對代理人平台 · 預設全由代理人處理 · 議價層 · 每個付款節點都有 AI 檢查（錢只由程式移動）。間距加大。", "原速"],
  arch: ["9 架構", "任何代理人都能透過 MCP、A2A、REST 操作；每次動錢都經過同一道程式關卡。", "1.25 倍"],
  models: ["10 模型設計", "30B 開源老師 → 0.6B 學生 → GGUF Q8 · 639 MB → L4 GPU。99.9% 判對、0.4% 攻擊得逞、100% 議價在上限內、0.51% OCR 錯字率。", "1.25 倍"],
  hood: ["11 底層全是 PayPal", "Orders 授權、Vault 重新凍結、部分請款、Payouts 付款、Agent Toolkit 對帳。", "1.25 倍"],
  features: ["11a 219 項 PayPal 功能", "219 評估 · 188 寫了程式 · 91 在真實 sandbox 驗證；14 個產品標籤依序亮起。旁白縮短，不再重複 11 的內容。", "原速"],
  scale: ["12 規模、AG Grid 後台、測試", "材料款、Pay Later、房東、鄰居團購 → AG Grid 後台停留 4 秒、推近 1.3 倍，右側列出功能 → 45 次代理人測試。", "1.25 倍＋AG Grid 慢放"],
  product: ["12a 完整產品", "3×2 便當格：客戶 · 師傅手機（西班牙文）· 房東 · 爭議 · 後台 · 評審 /demo，大角色標籤，依序亮起，最後全亮。", "原速"],
  vision: ["12b 下一步願景", "標題「Next, our vision」：Log in with PayPal、即時付款給每位師傅、任何能用照片證明的工作。虛線框表示是下一步。", "1.25 倍"],
  end: ["13 片尾卡", "VeriPay、The money waits for the proof、PayPal 與 AI 清單、github.com/gino6178/veripay、Try it: Demo → Judge tour。不放字幕，避免蓋住網址。", "0.72 倍"],
};
const NEW = new Set(["impact", "novel", "features", "product"]);
const fmt = (s) => `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, "0")}`;
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
const img = (id, k) => pathToFileURL(path.join(HERE, "frames", `${id}-${k}.jpg`)).href;
const total = shots.at(-1).from + shots.at(-1).dur;

const rows = shots.map((s) => {
  const [title, pic, speed] = INFO[s.id];
  const vo = s.id === "pain" ? PAIN.join(" ") : s.vo;
  return `<section class="shot${NEW.has(s.id) ? " new" : ""}">
    <div class="frames"><img src="${img(s.id, "a")}"><img src="${img(s.id, "b")}"></div>
    <div class="text">
      <div class="head"><h2>${esc(title)}</h2><span class="time">${fmt(s.from)}–${fmt(s.from + s.dur)} · ${s.dur.toFixed(1)} 秒 · ${speed}</span></div>
      <p class="pic"><b>畫面</b>${esc(pic)}</p>
      ${vo ? `<p class="vo"><b>旁白</b>${esc(vo)}</p>` : `<p class="vo muted"><b>旁白</b>（無）</p>`}
    </div>
  </section>`;
}).join("\n");

const html = `<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+TC:wght@400;500;700;900&family=JetBrains+Mono:wght@500&display=swap" rel="stylesheet">
<style>
@page { size: A4 landscape; margin: 10mm 12mm; }
:root { --ink:#001C64; --ink2:#2E3F66; --ink3:#56657F; --line:#DCE3EC; --signal:#0070E0; --soft:#E6F0FC; --paid:#FFD140; }
* { box-sizing: border-box; }
body { margin: 0; font: 10pt/1.55 "Noto Sans TC", "Microsoft JhengHei", sans-serif; color: var(--ink); }
.cover { height: 186mm; display: flex; flex-direction: column; justify-content: center; gap: 6mm; page-break-after: always; }
.cover h1 { margin: 0; font: 900 30pt/1.15 "Noto Sans TC", sans-serif; }
.cover h1 span { color: var(--signal); }
.facts { display: grid; grid-template-columns: repeat(4, 1fr); gap: 4mm; }
.facts div { border: 1px solid var(--line); border-radius: 3mm; padding: 4mm 5mm; }
.facts b { display: block; font: 900 18pt/1.1 "Noto Sans TC", sans-serif; color: var(--signal); }
.facts span { color: var(--ink2); font-size: 9.5pt; }
table { border-collapse: collapse; width: 100%; font-size: 9.5pt; }
th, td { text-align: left; padding: 2mm 3mm; border-bottom: 1px solid var(--line); vertical-align: top; }
th { color: var(--ink3); font-weight: 700; }
.shot { display: grid; grid-template-columns: 196mm 1fr; gap: 5mm; height: 91mm; padding: 3mm 0; border-bottom: 1px solid var(--line); break-inside: avoid; }
.shot:nth-of-type(2n) { page-break-after: always; border-bottom: 0; }
.frames { display: grid; grid-template-columns: 1fr 1fr; gap: 2.5mm; align-content: center; }
.frames img { width: 100%; aspect-ratio: 16 / 9; object-fit: cover; border-radius: 1.5mm; border: 1px solid var(--line); }
.text { display: flex; flex-direction: column; gap: 2.5mm; min-width: 0; }
.head { display: flex; flex-direction: column; gap: 1mm; }
h2 { margin: 0; font: 900 14pt/1.2 "Noto Sans TC", sans-serif; }
.new h2::after { content: "新"; margin-left: 2mm; padding: 0.3mm 2mm; border-radius: 99px; background: var(--paid); font-size: 8.5pt; vertical-align: middle; }
.time { font: 500 8.5pt/1.3 "JetBrains Mono", monospace; color: var(--ink3); }
p { margin: 0; }
p b { display: block; font-size: 8pt; color: var(--signal); letter-spacing: .04em; }
.pic { color: var(--ink2); }
.vo { font-style: italic; }
.muted { color: var(--ink3); }
</style></head><body>
<div class="cover">
  <h1>VeriPay 影片分鏡 v8 <span>依審稿意見修訂</span></h1>
  <div class="facts">
    <div><b>${fmt(total)}</b><span>全片長度（上限 3:00）</span></div>
    <div><b>21 鏡</b><span>順序調整：痛點 → 市場 → 解法</span></div>
    <div><b>1.25 倍</b><span>旁白統一語速，比 v7 慢</span></div>
    <div><b>−16.6 LUFS</b><span>響度；峰值 −2.6 dBFS</span></div>
  </div>
  <table>
    <tr><th>評分項</th><th>對應的鏡</th></tr>
    <tr><td>技術實作</td><td>5 凍結、7 AI 檢查、8 放款、10 模型、11 底層 PayPal、11a 219／188／91、12 AG Grid</td></tr>
    <tr><td>設計</td><td>3–8 整條實機流程、12a 五種角色的真實頁面</td></tr>
    <tr><td>潛在影響</td><td>1 痛點動畫與數據卡、2 市場數據、2a「給誰用」</td></tr>
    <tr><td>創新</td><td>3b、4 代理人議價、8a agentic commerce 裡別處找不到的四件事</td></tr>
    <tr><td>簡報</td><td>問題 → 市場 → 解法 → 實機流程 → 為什麼重要 → 片尾試用方式；單行字幕、關鍵卡片推近</td></tr>
  </table>
  <p class="muted">畫面取自成片 video/out/veripay-v8-final.mp4，每鏡兩格（約 35% 與 80% 處）。片中不出現模型名稱；名單裡兩家真實店家換成虛構名稱。</p>
</div>
${rows}
</body></html>`;
const htmlPath = path.join(HERE, "storyboard.html");
fs.writeFileSync(htmlPath, html);
const b = await launch();
const p = await b.newPage();
await p.goto(pathToFileURL(htmlPath).href, { waitUntil: "networkidle0", timeout: 120000 });
await p.evaluateHandle("document.fonts.ready");
const out = path.join(HERE, "VeriPay-分鏡-v8.pdf");
await p.pdf({ path: out, format: "A4", landscape: true, printBackground: true, preferCSSPageSize: true });
await b.close();
console.log(out, fs.statSync(out).size);
