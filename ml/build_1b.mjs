// Cover-1B's data, in two steps around the teacher (ml/teacher.mjs):
//   node ml/build_1b.mjs gen        code makes the facts; Muse Glimmer is asked to put them into people's words:
//     qa      for each clause of the five products, a policyholder's question that turns on it, with Glimmer's
//             answer citing a clause (kept only when it cites the clause the question was written for)
//     story   a claim's facts (type, date, place, amount, items) made by code; Glimmer tells it as the claimant would;
//             the label is code's facts (a story is kept only if it says the amount, the place and the items)
//     dialog  a product question and a true answer made by code; Glimmer writes how a person would say it; the label
//             is code's value (one in ten: a reply that doesn't answer, label understood: false)
//   node ml/build_1b.mjs assemble   filters by code and writes the SFT rows (ml/data/1b/sft/<task>_<split>.jsonl:
//     { id, task, messages, target, truth }), the injection sets (stories and documents with an instruction
//     inserted, target the clean label; the test set uses only held-out templates), and the jobs for the teacher
//     column of the evaluation (ml/data/1b/teacher_eval/jobs.jsonl: Glimmer answers the test prompts itself).
//     The ocr task's rows come from the receipt generator (ml/ocr/out/docs_{train,test}.jsonl), labels exact.
import fs from "node:fs";
import path from "node:path";
import * as T from "./tasks.mjs";
import { rng } from "./cases.mjs";

const here = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
const ROOT = path.join(here, "data", "1b");
const { PRODUCTS } = T;
const pick = (r, xs) => xs[Math.floor(r() * xs.length)];
const int = (r, a, b) => a + Math.floor(r() * (b - a + 1));
const W = (f, rows) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, rows.map((x) => JSON.stringify(x)).join("\n") + (rows.length ? "\n" : "")); };
const R = (f) => (fs.existsSync(f) ? fs.readFileSync(f, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l)) : []);
const SIMPLIFIED = /[们这险赔证医费发时说国对过还给让关图门问间电买卖钱单项补应该实际处认识读写选违规损坏宠货报经济务进连续条护满额质类变确资验检无产账属页么样东车请网历]/;
const STYLE = ["口語、很短", "口語，帶一點情緒", "有具體金額和日期", "描述得很長很囉嗦", "用英文問", "中英夾雜", "有點搞不清楚狀況", "很有禮貌、正式"];
const ymd = (t) => new Date(t).toISOString().slice(0, 10);

// ---------------------------------------------------------------- gen
function genQA() {
  for (const [split, per, seed] of [["train", 16, 101], ["test", 3, 202]]) {
    const r = rng(seed), items = [], jobs = [];
    for (const P of Object.values(PRODUCTS)) for (const c of P.clauses) for (let k = 0; k < per; k++) {
      const id = `qa-${split}-${c.id}-${k}`, style = pick(r, STYLE);
      const sys = `你在幫 Cover 保險準備客服訓練資料。下面是「${P.name.zh}」的全部條款。\n${P.clauses.map((x) => `[${x.id}] ${x.zh}`).join("\n")}`;
      const user = `寫一個保戶真的會問的問題，情境要剛好用到條款 ${c.id}（不要在問題裡寫條款編號，也不要照抄條款文字），風格：${style}。再以 Cover 客服的身分，只根據條款回答它（簡短，使用保戶的語言），並寫出最直接相關的一條條款編號，和 covered（yes 會賠、no 不賠、partly 部分賠、info 問題不是在問會不會賠）。以 JSON 回答：question、answer、clause、covered。`;
      items.push({ id, product: P.id, clause: c.id, kind: c.kind, style });
      jobs.push({ id, sample: 0, messages: [{ role: "system", content: sys }, { role: "user", content: user }], schema: { type: "object", properties: { question: { type: "string" }, answer: { type: "string" }, clause: { type: "string" }, covered: { type: "string", enum: ["yes", "no", "partly", "info"] } }, required: ["question", "answer", "clause", "covered"] }, max_tokens: 500 });
    }
    W(path.join(ROOT, "gen", "qa", split, "items.jsonl"), items); W(path.join(ROOT, "gen", "qa", split, "jobs.jsonl"), jobs);
    console.log("qa", split, items.length);
  }
}

const WHERE = ["臺北市大安區的租屋處", "捷運忠孝復興站出口", "家裡客廳", "公司停車場", "新北市板橋區", "臺中市西屯區逢甲夜市附近", "高雄市前鎮區", "宜蘭羅東的老家", "住處樓下", "信義區的咖啡店", "動物醫院門口", "淡水老街", "社區中庭", "租屋處浴室", "台南永康區的家"];
const ITEMS = { contents: ["MacBook Air", "腳踏車", "單眼相機", "沙發", "電視", "行李箱", "名錶", "iPad", "吸塵器"], building: ["落地窗", "天花板", "木地板", "熱水器管線", "鋁門窗"], liability: ["鄰居的天花板", "房東的冷氣", "樓下的衣櫃"], stay: ["旅館住宿"],
  medical: ["朋友的醫藥費"], vet: ["門診", "X光檢查", "住院", "結石手術", "血液檢查", "疫苗"], wellness: ["五合一疫苗", "健康檢查", "洗牙"], own_damage: ["前保險桿", "後照鏡", "車門烤漆", "機車車殼"], third_party: ["對方的機車", "路人的醫藥費"],
  theft: ["機車", "腳踏車"], death: [], terminal: [] };
function genStory() {
  const all = Object.values(PRODUCTS).filter((p) => p.id !== "life").flatMap((P) => P.claims.map((c) => [P, c]));
  for (const [split, n, seed] of [["train", 1300, 303], ["test", 220, 404]]) {
    const r = rng(seed), items = [], jobs = [];
    for (let i = 0; i < n; i++) {
      const [P, ct] = pick(r, all), today = ymd(Date.UTC(2026, int(r, 0, 10), int(r, 1, 28))), ago = int(r, 0, 20), date = ymd(Date.parse(today) - ago * 864e5);
      const where = pick(r, WHERE), usd = r() < 0.4, amount = usd ? int(r, 3, 300) * 10 : int(r, 6, 900) * 100;
      const voc = ITEMS[ct.coverage] || ITEMS.contents, its = [...new Set([pick(r, voc), ...(r() < 0.3 ? [pick(r, voc)] : [])])];
      const amountStr = usd ? pick(r, [`${amount} 美元`, `US$${amount.toLocaleString("en-US")}`, `${amount} 塊美金`]) : pick(r, [`${amount.toLocaleString("en-US")} 元`, `NT$${amount.toLocaleString("en-US")}`, `${amount} 塊`]);
      const id = `st-${split}-${i}`;
      const user = `幫 Cover 保險準備理賠訓練資料：用第一人稱、口語的繁體中文（偶爾可以中英夾雜）寫一段保戶在 App 裡報案的敘述，2 到 5 句。事件：${ct.zh}（${P.name.zh}）。` +
        `一定要原樣寫出這些字：金額「${amountStr}」、地點「${where}」、物品或項目「${its.join("」「")}」。今天是 ${today}，事情發生在 ${date}：${ago <= 7 && r() < 0.6 ? "用相對的說法（例如昨天、前天晚上、上週三）" : "直接寫出日期（任何常見寫法都可以，例如 10/3、10 月 3 日）"}。不要寫其他金額。以 JSON 回答：story。`;
      items.push({ id, product: P.id, today, truth: { type: ct.type, happenedAt: date, where, amount, currency: usd ? "USD" : "TWD", items: its }, amountStr });
      jobs.push({ id, sample: 0, messages: [{ role: "user", content: user }], schema: { type: "object", properties: { story: { type: "string" } }, required: ["story"] }, max_tokens: 400 });
    }
    W(path.join(ROOT, "gen", "story", split, "items.jsonl"), items); W(path.join(ROOT, "gen", "story", split, "jobs.jsonl"), jobs);
    console.log("story", split, items.length);
  }
}

const PLACES = ["臺北市大安區", "大安區", "台北市信義區", "新北市板橋區", "三重", "台中西屯", "臺南市東區", "高雄市苓雅區", "宜蘭市", "花蓮市", "新竹市東區", "桃園市中壢區"];
function valueFor(r, q) {
  if (q.type === "choice") { const o = pick(r, q.options); return [o.v, `${o.zh}（選項 ${o.v}）`]; }
  if (q.type === "number") { const v = Math.round(q.min + (q.max - q.min) * Math.pow(r(), 2)); return [v, `${v}${q.unit ? ` ${q.unit}` : ""}`]; }
  if (q.type === "bool") { const v = r() < 0.5; return [v, v ? "是／有" : "否／沒有"]; }
  if (q.type === "place") { const v = pick(r, PLACES); return [v, v]; }
  if (q.id === "petName") { const v = pick(r, ["豆豆", "咪咪", "阿福", "Lucky", "麻糬", "小黑", "Mochi"]); return [v, v]; }
  return null;
}
function genDialog() {
  const qs = Object.values(PRODUCTS).flatMap((P) => P.questions.filter((q) => q.type !== "text" || q.id === "petName").map((q) => [P, q]));
  for (const [split, n, seed] of [["train", 1600, 505], ["test", 260, 606]]) {
    const r = rng(seed), items = [], jobs = [];
    for (let i = 0; i < n; i++) {
      const [P, q] = pick(r, qs), off = r() < 0.1, [v, meaning] = valueFor(r, q), id = `dg-${split}-${i}`;
      const user = off ? `Cover 的投保助理 Lumi 問保戶：「${q.zh}」\n寫出保戶的一句回覆，但保戶沒有回答這一題（例如反問為什麼要問、說等一下再說、問別的事、說不知道）。口語繁體中文。以 JSON 回答：reply。`
        : `Cover 的投保助理 Lumi 問保戶：「${q.zh}」\n保戶真正的答案是：${meaning}。寫出保戶會怎麼口語回答（繁體中文，有時夾英文；不要說選項代碼，可以間接說，例如用幾樓說高低、用中文數字或「大概」說數量，${pick(r, ["很短", "順便多講一句自己的狀況", "很隨便", "很有禮貌"])}）。以 JSON 回答：reply。`;
      items.push({ id, product: P.id, qid: q.id, qtype: q.type, truth: { value: off ? null : v, understood: !off } });
      jobs.push({ id, sample: 0, messages: [{ role: "user", content: user }], schema: { type: "object", properties: { reply: { type: "string" } }, required: ["reply"] }, max_tokens: 200 });
    }
    W(path.join(ROOT, "gen", "dialog", split, "items.jsonl"), items); W(path.join(ROOT, "gen", "dialog", split, "jobs.jsonl"), jobs);
    console.log("dialog", split, items.length);
  }
}

// ---------------------------------------------------------------- assemble
const answers = (task, split) => new Map(R(path.join(ROOT, "gen", task, split, "answers.jsonl")).filter((a) => a.answer).map((a) => [a.id, a.answer]));
const row = (id, task, m, target, truth, extra = {}) => ({ id, task, messages: m.messages, schema: m.schema, target: JSON.stringify(target), truth, ...extra });
const digits = (s) => String(s).replace(/[,，\s]/g, "");

function assemble() {
  const out = {}, drop = {};
  const put = (k, x) => { (out[k] ||= []).push(x); }, no = (k, why) => { drop[k] ||= {}; drop[k][why] = (drop[k][why] || 0) + 1; };
  for (const split of ["train", "test"]) {
    // qa: kept when the answer cites the clause the question was written for, and is in Traditional Chinese
    const A = answers("qa", split);
    for (const it of R(path.join(ROOT, "gen", "qa", split, "items.jsonl"))) {
      const a = A.get(it.id); if (!a) { no(`qa_${split}`, "no answer"); continue; }
      const cl = (String(a.clause).match(/[A-Z]{2}-\d+\.\d+/) || [""])[0];
      if (cl !== it.clause) { no(`qa_${split}`, "cites another clause"); continue; }
      if (SIMPLIFIED.test(a.question + a.answer)) { no(`qa_${split}`, "simplified characters"); continue; }
      if (/[A-Z]{2}-\d+\.\d+/.test(a.question)) { no(`qa_${split}`, "the question names the clause"); continue; }
      put(`qa_${split}`, row(it.id, "qa", T.qa(it.product, a.question), { answer: a.answer, clause: cl, covered: a.covered }, { clause: cl, covered: a.covered }, { product: it.product }));
    }
    // story: kept when the story says the amount, the place and every item as given
    const S = answers("story", split);
    for (const it of R(path.join(ROOT, "gen", "story", split, "items.jsonl"))) {
      const a = S.get(it.id); if (!a?.story) { no(`story_${split}`, "no answer"); continue; }
      const s = a.story;
      if (!digits(s).includes(digits(String(it.truth.amount)))) { no(`story_${split}`, "amount not said"); continue; }
      if (!s.includes(it.truth.where)) { no(`story_${split}`, "place not said"); continue; }
      if (!it.truth.items.every((x) => s.includes(x))) { no(`story_${split}`, "an item not said"); continue; }
      put(`story_${split}`, row(it.id, "story", T.story(it.product, it.today, s), it.truth, it.truth, { product: it.product, today: it.today, text: s }));
    }
    // dialog: code's value is the label
    const D = answers("dialog", split);
    for (const it of R(path.join(ROOT, "gen", "dialog", split, "items.jsonl"))) {
      const a = D.get(it.id); if (!a?.reply) { no(`dialog_${split}`, "no answer"); continue; }
      if (it.truth.understood && it.qtype === "choice" && new RegExp(`\\b${PRODUCTS[it.product].questions.find((q) => q.id === it.qid).options.map((o) => o.v).join("|")}\\b`).test(a.reply)) { no(`dialog_${split}`, "says the option code"); continue; }
      put(`dialog_${split}`, row(it.id, "dialog", T.dialog(it.product, it.qid, a.reply), it.truth, it.truth, { product: it.product, qid: it.qid, qtype: it.qtype }));
    }
    // ocr: the generator's documents, labels exact
    for (const d of R(path.join(here, "ocr", "out", `docs_${split}.jsonl`)).slice(0, split === "train" ? 3000 : 300))
      put(`ocr_${split}`, row(d.id, "ocr", T.ocr(d.text), d.fields, d.fields, { kind: d.kind }));
  }
  // injections: an instruction inserted into a story or a document; the target is the clean label
  for (const [split, tpl, seed] of [["train", T.INJECT_TRAIN, 707], ["test", T.INJECT_HELD_OUT, 808]]) {
    const r = rng(seed);
    const src = [...(out[`story_${split}`] || []).slice(0, split === "train" ? 400 : 120), ...(out[`ocr_${split}`] || []).slice(0, split === "train" ? 300 : 80)];
    for (const x of src) {
      const N = pick(r, [99999, 88888, 50000, 123456]), line = pick(r, tpl).replaceAll("{N}", String(N));
      if (x.task === "story") {
        const parts = x.text.split(/(?<=[。！？!?])/); const at = int(r, 0, parts.length); parts.splice(at, 0, line);
        put(`inject_${split}`, row(`${x.id}-inj`, "story", T.story(x.product, x.today, parts.join("")), x.truth, x.truth, { product: x.product, injected: line, N, from: "story" }));
      } else {
        const text = x.messages[1].content, lines = text.split("\n"); lines.splice(int(r, 1, lines.length), 0, line);
        put(`inject_${split}`, row(`${x.id}-inj`, "ocr", T.ocr(lines.join("\n")), x.truth, x.truth, { injected: line, N, from: "ocr" }));
      }
    }
  }
  for (const [k, rows] of Object.entries(out)) W(path.join(ROOT, "sft", `${k}.jsonl`), rows);
  // the teacher column: Glimmer answers the test prompts itself (ocr and inject: a sample of 100 each)
  const jobs = [];
  for (const k of ["qa_test", "story_test", "dialog_test", "ocr_test", "inject_test"]) for (const x of (out[k] || []).slice(0, k.startsWith("ocr") || k.startsWith("inject") ? 100 : 1e9))
    jobs.push({ id: `${k}|${x.id}`, sample: 0, messages: x.messages, schema: x.schema, max_tokens: 500 });
  W(path.join(ROOT, "teacher_eval", "jobs.jsonl"), jobs);
  console.log(JSON.stringify(Object.fromEntries(Object.entries(out).map(([k, v]) => [k, v.length]))), "dropped", JSON.stringify(drop), "teacher_eval jobs", jobs.length);
  fs.writeFileSync(path.join(ROOT, "sft", "counts.json"), JSON.stringify({ kept: Object.fromEntries(Object.entries(out).map(([k, v]) => [k, v.length])), dropped: drop }, null, 1));
}

const step = process.argv[2];
if (step === "gen") { genQA(); genStory(); genDialog(); }
else if (step === "assemble") assemble();
else console.log("node ml/build_1b.mjs gen|assemble");
