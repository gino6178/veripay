// Teacher data for Cover-Audit: Muse Glimmer auditing claim decisions (ml/cases.mjs), the way Serve's jev/teacher.mjs
// had it answer member decisions: Ollama's own chat API, thinking at "low", a JSON Schema as the format, temperature
// 0.3, a 900-token reasoning budget on top of the reply. Each case is asked `samples` times, so the labels are a
// distribution over the verdicts, and how often Glimmer agrees with itself is measured too. Done answers are kept, so a
// run can be resumed (a spot VM can be taken back at any time); an answer that never came is asked again.
//   node ml/teacher.mjs <dir> <seed> <n> [samples=2] [par=96] [products=renters,home,pet]
//   LLM_URL (default http://127.0.0.1:11434), LLM_MODEL (default muse-glimmer:30b-q4_K_M)
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { buildCases, PRODUCTS, VERDICTS } from "./cases.mjs";

const [DIR = "ml/data/train", SEED = "1", N = "100", SAMPLES = "2", PAR = "96", PRODS = "renters,home,pet"] = process.argv.slice(2);
const URL_ = new URL(process.env.LLM_URL || "http://127.0.0.1:11434"), MODEL = process.env.LLM_MODEL || "muse-glimmer:30b-q4_K_M";
const THINK_BUDGET = 900, MAX_TOKENS = 300, TEMP = 0.3, TRIES = 3;
fs.mkdirSync(DIR, { recursive: true });
const abs = (f) => path.resolve(DIR, f);

const casesFile = abs("cases.jsonl"), outFile = abs("teacher.jsonl");
let cases;
if (fs.existsSync(casesFile)) cases = fs.readFileSync(casesFile, "utf8").trim().split("\n").map((l) => JSON.parse(l));
else { cases = buildCases({ seed: +SEED, n: +N, products: PRODS.split(",") }); fs.writeFileSync(casesFile, cases.map((c) => JSON.stringify(c)).join("\n") + "\n"); }
const kinds = {}; cases.forEach((c) => { kinds[c.verdict] = (kinds[c.verdict] || 0) + 1; });
console.log(`${cases.length} cases`, JSON.stringify(kinds));

const SCHEMA = { type: "object", properties: { applies: { type: "array", items: { type: "string" } }, verdict: { type: "string", enum: VERDICTS }, why: { type: "string" } }, required: ["applies", "verdict", "why"] };
function messages(c) {
  const P = PRODUCTS[c.product], d = c.decision;
  const sys = `你是 Cover 保險的理賠稽核員。根據「${P.name.zh}」的條款，檢查一個理賠決定對不對。只能依條款判斷。\n` +
    `以 JSON 回答：applies（這件理賠中適用的除外、條件或加保條款編號，沒有就空陣列）、verdict（ok 決定正確；overpay 賠太多；underpay 賠太少；wrong_clause 金額對但引錯條款；human 應轉人工而不是即時賠付）、why（一句話）。\n\n` +
    `條款：\n${P.clauses.map((x) => `[${x.id}] ${x.zh}`).join("\n")}`;
  const route = d.route === "instant" ? "即時賠付" : "轉人工審核";
  return [{ role: "system", content: sys }, { role: "user", content: `${c.facts}\n決定：賠 $${(d.pay / 100).toLocaleString("en-US")}，依 ${d.clause}，${route}。` }];
}

// node:http rather than fetch: no header or body time limit (undici's own is five minutes, and a call queued behind
// many others on one GPU can take longer)
function chat(msgs) {
  const body = JSON.stringify({ model: MODEL, messages: msgs, stream: false, think: "low", format: SCHEMA, keep_alive: "24h", options: { num_predict: MAX_TOKENS + THINK_BUDGET, temperature: TEMP } });
  return new Promise((ok, bad) => {
    const q = http.request({ host: URL_.hostname, port: URL_.port || 80, path: "/api/chat", method: "POST", headers: { "content-type": "application/json", "content-length": Buffer.byteLength(body) } }, (res) => {
      let s = ""; res.setEncoding("utf8"); res.on("data", (x) => { s += x; }); res.on("end", () => { try { const j = JSON.parse(s); if (j.error) bad(new Error(j.error)); else ok(j); } catch (e) { bad(e); } });
    });
    q.on("error", bad); q.end(body);
  });
}

// an answer that never came (no verdict, or an error) is asked again: those rows are dropped first
if (fs.existsSync(outFile)) {
  const kept = fs.readFileSync(outFile, "utf8").trim().split("\n").filter(Boolean).filter((l) => { const j = JSON.parse(l); return j.answer && VERDICTS.includes(j.answer.verdict) && !j.error; });
  fs.writeFileSync(outFile, kept.length ? kept.join("\n") + "\n" : "");
}
const done = new Set(fs.existsSync(outFile) ? fs.readFileSync(outFile, "utf8").trim().split("\n").filter(Boolean).map((l) => { const j = JSON.parse(l); return `${j.id}|${j.sample}`; }) : []);
const todo = [];
for (let s = 0; s < +SAMPLES; s++) for (const c of cases) if (!done.has(`${c.id}|${s}`)) todo.push([c, s]);
console.log(`${todo.length} answers to get (${done.size} already done)`);

const t0 = Date.now(); let k = 0, n = 0;
const out = fs.openSync(outFile, "a");
await Promise.all(Array.from({ length: +PAR }, async () => {
  while (k < todo.length) {
    const [c, s] = todo[k++];
    const a = Date.now();
    let ans = null, err = null, j = null;
    for (let t = 0; t < TRIES && !ans; t++) {
      try { j = await chat(messages(c)); ans = JSON.parse(j.message?.content || ""); if (!VERDICTS.includes(ans.verdict)) { err = `no verdict: ${String(j.message?.content).slice(0, 120)}`; ans = null; } else err = null; }
      catch (e) { err = String(e.message || e).slice(0, 200); }
    }
    const row = { id: c.id, sample: s, verdict: c.verdict, answer: ans && { verdict: ans.verdict, applies: Array.isArray(ans.applies) ? ans.applies : [], why: String(ans.why || "").slice(0, 300) }, error: err,
      tokens: j ? { prompt: j.prompt_eval_count || 0, output: j.eval_count || 0, thinking_chars: (j.message?.thinking || "").length } : null, seconds: +((Date.now() - a) / 1000).toFixed(2) };
    fs.writeSync(out, JSON.stringify(row) + "\n");
    if (++n % 50 === 0) console.log(`${n}/${todo.length} in ${((Date.now() - t0) / 1000).toFixed(0)} s (${(n / ((Date.now() - t0) / 3600000)).toFixed(0)}/h)`);
  }
}));
console.log(`TEACHER_DONE ${n} answers in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
