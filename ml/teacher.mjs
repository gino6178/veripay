// Muse Glimmer as teacher, for every Cover data set: it answers the jobs in <dir>/jobs.jsonl, the way Serve's
// jev/teacher.mjs had it answer member decisions (Ollama's own chat API, thinking at "low", a JSON Schema as the
// format, temperature 0.3, a 900-token reasoning budget on top of the reply, many requests at once on one GPU).
// A job is { id, sample, messages, schema, max_tokens }; the builders (ml/build_audit.mjs, ml/build_1b.mjs) write them.
// Done answers are kept, so a run can be resumed (a spot VM can be taken back at any time); an answer that never came
// (an error, or no valid JSON) is asked again, each call up to 3 times.
//   node ml/teacher.mjs <dir> [par=96]
//   LLM_URL (default http://127.0.0.1:11434), LLM_MODEL (default muse-glimmer:30b-q4_K_M)
//   TEACHER_FORMAT=schema sends the JSON Schema as Ollama's format (grammar-constrained sampling). The default, "prompt",
//   puts the schema in the prompt and checks the reply in code instead: with 96 requests at once, the grammar is
//   sampled on the VM's 12 vCPUs and they, not the GPU, set the pace (measured: GPU about 30% busy with the schema).
//   A reply that is not JSON with every required field is asked again.
import fs from "node:fs";
import path from "node:path";
import http from "node:http";

const [DIR, PAR = "96"] = process.argv.slice(2);
const URL_ = new URL(process.env.LLM_URL || "http://127.0.0.1:11434"), MODEL = process.env.LLM_MODEL || "muse-glimmer:30b-q4_K_M";
const THINK_BUDGET = 900, TEMP = +(process.env.LLM_TEMP ?? 0.3), TRIES = 3;
const jobsFile = path.join(DIR, "jobs.jsonl"), outFile = path.join(DIR, "answers.jsonl");
const jobs = fs.readFileSync(jobsFile, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l));

const MODE = process.env.TEACHER_FORMAT || "prompt";
function withSchema(job) {
  if (MODE === "schema") return job.messages;
  const m = job.messages.map((x) => ({ ...x })), last = m[m.length - 1];
  last.content += `\n\n只輸出一個 JSON 物件，不要其他文字，符合這個 JSON Schema：${JSON.stringify(job.schema)}`;
  return m;
}
// the reply as JSON, with every required field (the schema's top level), or null
function parse(content, schema) {
  let t = String(content || "").trim().replace(/^```(?:json)?\s*|\s*```$/g, "");
  const a = t.indexOf("{"), b = t.lastIndexOf("}");
  if (a < 0 || b < a) return null;
  try { const j = JSON.parse(t.slice(a, b + 1)); return (schema?.required || []).every((k) => k in j) ? j : null; } catch { return null; }
}
// node:http rather than fetch: no header or body time limit (undici's own is five minutes, and a call queued behind
// many others on one GPU can take longer)
function chat(job) {
  const body = JSON.stringify({ model: MODEL, messages: withSchema(job), stream: false, think: "low", ...(MODE === "schema" ? { format: job.schema } : {}), keep_alive: "24h", options: { num_predict: (job.max_tokens || 400) + THINK_BUDGET, temperature: TEMP } });
  return new Promise((ok, bad) => {
    const q = http.request({ host: URL_.hostname, port: URL_.port || 80, path: "/api/chat", method: "POST", headers: { "content-type": "application/json", "content-length": Buffer.byteLength(body) } }, (res) => {
      let s = ""; res.setEncoding("utf8"); res.on("data", (x) => { s += x; }); res.on("end", () => { try { const j = JSON.parse(s); if (j.error) bad(new Error(j.error)); else ok(j); } catch (e) { bad(e); } });
    });
    q.on("error", bad); q.end(body);
  });
}

if (fs.existsSync(outFile)) {
  const kept = fs.readFileSync(outFile, "utf8").trim().split("\n").filter(Boolean).filter((l) => { const j = JSON.parse(l); return j.answer && !j.error; });
  fs.writeFileSync(outFile, kept.length ? kept.join("\n") + "\n" : "");
}
const done = new Set(fs.existsSync(outFile) ? fs.readFileSync(outFile, "utf8").trim().split("\n").filter(Boolean).map((l) => { const j = JSON.parse(l); return `${j.id}|${j.sample}`; }) : []);
const todo = jobs.filter((j) => !done.has(`${j.id}|${j.sample}`));
console.log(`${DIR}: ${jobs.length} jobs, ${todo.length} answers to get (${done.size} already done), ${PAR} at once`);

const t0 = Date.now(); let k = 0, n = 0, bad = 0;
const out = fs.openSync(outFile, "a");
await Promise.all(Array.from({ length: +PAR }, async () => {
  while (k < todo.length) {
    const job = todo[k++];
    const a = Date.now();
    let ans = null, err = null, j = null;
    for (let t = 0; t < TRIES && !ans; t++) {
      try { j = await chat(job); ans = parse(j.message?.content, job.schema); err = ans ? null : `not JSON with the required fields: ${String(j.message?.content || "").slice(0, 120)}`; }
      catch (e) { err = String(e.message || e).slice(0, 200); ans = null; }
    }
    if (!ans) bad++;
    const row = { id: job.id, sample: job.sample, answer: ans, error: err, tokens: j ? { prompt: j.prompt_eval_count || 0, output: j.eval_count || 0, thinking_chars: (j.message?.thinking || "").length } : null, seconds: +((Date.now() - a) / 1000).toFixed(2) };
    fs.writeSync(out, JSON.stringify(row) + "\n");
    if (++n % 100 === 0) console.log(`${n}/${todo.length} in ${((Date.now() - t0) / 1000).toFixed(0)} s (${(n / ((Date.now() - t0) / 3600000)).toFixed(0)}/h), ${bad} without an answer`);
  }
}));
console.log(`TEACHER_DONE ${DIR} ${n} answers in ${((Date.now() - t0) / 1000).toFixed(0)} s, ${bad} without an answer`);
