// Accuracy and speed of a served GGUF, through its Ollama-style endpoint, the way the app calls it (JSON Schema as
// the format, temperature 0). One number per task, scored by code against the held-out truth:
//   audit      every check's verdict equals code's verdict (and the order's verdicts all right)
//   negotiate  the action, and the price when there is one, equal code's policy
//   scope      the trade, price ceiling and window equal code's (the fields the work order's money and dates rest on)
//   node ml/eval_gguf.mjs --url http://127.0.0.1:11480 --model done-audit --set ml/data/audit/sft/test.jsonl --n 100 [--conc 1]
import fs from "node:fs";

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const url = arg("url", "http://127.0.0.1:11480"), model = arg("model", "done-audit"), set = arg("set"), n = +arg("n", 100), conc = +arg("conc", 1);
const rows = fs.readFileSync(set, "utf8").trim().split("\n").map((l) => JSON.parse(l)).slice(0, n);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
// the target's key whose value is the truth's value (the compact schemas name fields with one or two letters)
const keyFor = (target, v) => Object.keys(target).find((k) => same(target[k], v));

const out = { model, set: set.split("/").slice(-2).join("/"), n: rows.length, json_valid: 0, right: 0, scored: 0, rows_all_right: 0, ms: [], tok_s: [] };
async function one(r) {
  const t0 = Date.now();
  const res = await fetch(`${url}/api/chat`, { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ model, messages: r.messages, stream: false, format: r.schema, options: { temperature: 0, num_predict: 600 } }) });
  const j = await res.json(); out.ms.push(Date.now() - t0);
  if (j.eval_count && j.total_duration) out.tok_s.push(j.eval_count / (j.total_duration / 1e9));
  let got = null; try { got = JSON.parse(j.message?.content || ""); out.json_valid++; } catch { got = null; }
  const truth = typeof r.truth === "string" ? null : r.truth, target = (() => { try { return JSON.parse(r.target); } catch { return null; } })();
  let all = true;
  const score = (ok) => { out.scored++; out.right += ok ? 1 : 0; all &&= !!ok; };
  if (r.task === "audit") {
    const m = new Map((got?.checks || []).map((c) => [c.id, c.v ?? c.verdict]));
    for (const t of r.truth) score(m.get(t.id) === t.verdict);
  } else if (r.task === "negotiate" && target) {
    score(got?.action === target.action);
    if (target.price != null) score(got?.price === target.price);
  } else if (r.task === "scope" && target) {
    for (const [k, v] of Object.entries(target)) if (typeof v !== "string" || v.length < 20) if (!Array.isArray(v)) score(same(got?.[k], v));
  } else score(!!got);
  out.rows_all_right += all ? 1 : 0;
}
const q = (xs, p) => [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor(p * xs.length))];
const t0 = Date.now();
for (let i = 0; i < rows.length; i += conc) await Promise.all(rows.slice(i, i + conc).map(one));
console.log(JSON.stringify({ model: out.model, set: out.set, n: out.n, json_valid: out.json_valid, field_acc: +(out.right / Math.max(1, out.scored)).toFixed(4), rows_all_right: +(out.rows_all_right / out.n).toFixed(4),
  ms_p50: q(out.ms, 0.5), ms_p95: q(out.ms, 0.95), tok_s_p50: Math.round(q(out.tok_s, 0.5) || 0), wall_s: +((Date.now() - t0) / 1000).toFixed(1) }));
