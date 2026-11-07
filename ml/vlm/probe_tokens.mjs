// How many prompt tokens and how long does done-vlm's llama-server spend on one photo? node ml/vlm/probe_tokens.mjs <port> <jpg...>
import fs from "node:fs";
import { describeMessages } from "../prompts.mjs";
const [port, ...files] = process.argv.slice(2);
for (const f of files) {
  const m = describeMessages([fs.readFileSync(f).toString("base64")]).messages.map((x) => x.images ? { role: x.role, content: [...x.images.map((u) => ({ type: "image_url", image_url: { url: `data:image/jpeg;base64,${u}` } })), { type: "text", text: x.content }] } : x);
  const t = Date.now();
  const j = await (await fetch(`http://127.0.0.1:${port}/v1/chat/completions`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ messages: m, temperature: 0, max_tokens: 70, cache_prompt: false }) })).json();
  console.log(f.split("/").pop(), Date.now() - t, "ms", JSON.stringify({ prompt_n: j.timings?.prompt_n, prompt_ms: Math.round(j.timings?.prompt_ms), pred_n: j.timings?.predicted_n, pred_ms: Math.round(j.timings?.predicted_ms) }));
}
