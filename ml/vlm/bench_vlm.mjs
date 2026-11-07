// Done-VLM latency through the endpoint: describe N real photos one at a time, report p50/p95/max wall time.
// node ml/vlm/bench_vlm.mjs [--url http://127.0.0.1:11480] [--n 30] [--dir ml/vlm/photos]
import fs from "node:fs";
import path from "node:path";
import { describeMessages } from "../prompts.mjs";
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const url = arg("--url", "http://127.0.0.1:11480"), n = +arg("--n", 30), dir = arg("--dir", "ml/vlm/photos");
const files = fs.readdirSync(dir).filter((f) => /\.jpe?g$/i.test(f)).sort();
const step = Math.max(2, Math.floor(files.length / n));
const off = +arg("--offset", 0), pick = files.filter((_, i) => i % step === off % step).slice(0, n);   // a new --offset gives photos the server has not cached
const ms = [], svc = [];
for (const f of pick) {
  const b64 = fs.readFileSync(path.join(dir, f)).toString("base64");
  const t = Date.now();
  const r = await fetch(`${url}/api/chat`, { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ model: "done-vlm", stream: false, messages: describeMessages([b64]).messages, options: { temperature: 0, num_predict: 70 } }) });
  const j = await r.json().catch(() => ({}));
  const d = Date.now() - t; ms.push(r.ok ? d : Infinity); svc.push(r.ok ? d - (j.queue_duration || 0) / 1e6 : Infinity);   // service time: minus the wait for another caller's request
  if (!r.ok) console.error(f, r.status); else if (d > 5000) console.error("slow", f, d, "ms", "prompt", j.prompt_eval_count, "out", j.eval_count, "queue", Math.round((j.queue_duration || 0) / 1e6));
}
const stat = (a) => { const s = [...a].sort((x, y) => x - y), q = (p) => Math.round(s[Math.min(s.length - 1, Math.floor(p * s.length))]); return { p50_ms: q(0.5), p95_ms: q(0.95), max_ms: Math.round(s[s.length - 1]), over5s: a.filter((x) => x > 5000).length }; };
console.log(JSON.stringify({ n: ms.length, failed: ms.filter((x) => x === Infinity).length, wall: stat(ms), service: stat(svc) }));
