// Latency and a quick accuracy check of a served model through its Ollama-style endpoint, one request at a time, as
// the app sends them (ml/client.mjs: the JSON Schema as format, temperature 0, logprobs for Done-Audit).
//   node ml/bench.mjs --url http://127.0.0.1:11480 --model done-audit --set ml/data/audit/sft/test.jsonl --n 40
// Prints p50/p95 latency, tokens read and written, and (audit) the verdicts right against code, (chat) JSON valid.
import fs from "node:fs";

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const url = arg("url", "http://127.0.0.1:11480"), model = arg("model", "done-audit"), set = arg("set"), n = +arg("n", 40), maxTokens = +arg("max", 600);
const rows = fs.readFileSync(set, "utf8").trim().split("\n").map((l) => JSON.parse(l)).slice(0, n);
const ms = [], pin = [], pout = [], by3 = []; let right = 0, total = 0, valid = 0, rowsRight = 0;
for (const r of rows) {
  const t0 = Date.now();
  const res = await fetch(`${url}/api/chat`, { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ model, messages: r.messages, stream: false, format: r.schema, options: { temperature: 0, num_predict: maxTokens }, logprobs: r.task === "audit", top_logprobs: 5 }) });
  const j = await res.json(); ms.push(Date.now() - t0); if (r.truth?.length === 3) by3.push(ms[ms.length - 1]); pin.push(j.prompt_eval_count); pout.push(j.eval_count);
  let out = null; try { out = JSON.parse(j.message?.content || ""); valid++; } catch {}
  if (r.task === "audit" && out) {
    const got = new Map((out.checks || []).map((c) => [c.id, c.v ?? c.verdict])); let all = true;
    for (const t of r.truth) { total++; const ok = got.get(t.id) === t.verdict; right += ok; all &&= ok; }
    rowsRight += all;
  }
}
const q = (xs, p) => [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor(p * xs.length))];
console.log(JSON.stringify({ model, n: rows.length, ms_p50: q(ms, 0.5), ms_p95: q(ms, 0.95), prompt_tokens_p50: q(pin, 0.5), output_tokens_p50: q(pout, 0.5), json_valid: valid,
  ...(by3.length ? { three_check_orders: by3.length, ms_p50_three_checks: q(by3, 0.5) } : {}), ...(total ? { verdicts_right: +(right / total).toFixed(4), checks: total, orders_all_right: rowsRight } : {}) }));
