// A 5-photo job sent at once to done-vlm: does every photo get described (no 503), and how long until the last one?
// node ml/vlm/burst_vlm.mjs [--url http://127.0.0.1:11480] [--k 5] [--offset 0]
import fs from "node:fs";
import { describeMessages } from "../prompts.mjs";
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const url = arg("--url", "http://127.0.0.1:11480"), k = +arg("--k", 5), off = +arg("--offset", 0), dir = "ml/vlm/photos";
const files = fs.readdirSync(dir).filter((f) => /\.jpg$/.test(f)).sort().filter((_, i) => i % 37 === off % 37).slice(0, k);
const t0 = Date.now();
const res = await Promise.all(files.map(async (f) => {
  const r = await fetch(`${url}/api/chat`, { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ model: "done-vlm", stream: false, messages: describeMessages([fs.readFileSync(`${dir}/${f}`).toString("base64")]).messages, options: { temperature: 0, num_predict: 70 } }) });
  return { status: r.status, ms: Date.now() - t0 };
}));
console.log(JSON.stringify({ photos: k, ok: res.filter((r) => r.status === 200).length, status: res.map((r) => r.status), done_ms: res.map((r) => r.ms), last_ms: Math.max(...res.map((r) => r.ms)) }));
