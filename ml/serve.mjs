// An Ollama-compatible endpoint for Done & Paid's own models on this machine's CPU: it answers Ollama's /api/chat,
// /api/tags and /api/version, and forwards each call to a llama-server (llama.cpp) holding that model's GGUF, with
// the JSON Schema as the grammar, the shared prompt prefix cached, and the verdict tokens' probabilities passed back
// as Ollama-style logprobs. No dependency beyond Node.
//   POST /read { image } is passed to Done-OCR's worker (ml/ocr/server.py) on cfg.ocrPort, when set.
//   node ml/serve.mjs              reads ml/serve.json: { "port": 11470, "llamaServer": "<path to llama-server>", "threads": 6,
//                                  "cpus": "0-5" (optional: pin with taskset, Linux), "backendPort": 18001,
//                                  "models": { "done-chat": "<gguf>", "done-audit": "<gguf>", "done-vlm": { "gguf": "...", "mmproj": "..." } } }
// It starts one llama-server per model on 127.0.0.1 (backendPort, +1, ...) and listens on 127.0.0.1 only. A vision
// model gets Ollama's message "images" (base64) as image parts.
import fs from "node:fs";
import http from "node:http";
import https from "node:https";
import crypto from "node:crypto";
import path from "node:path";
import { spawn } from "node:child_process";

const here = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
const cfg = JSON.parse(fs.readFileSync(process.env.DONE_SERVE_CONFIG || path.join(here, "serve.json"), "utf8"));
const port = +(cfg.port || 11470), backends = {};
let next = +(cfg.backendPort || port + 1);
// each model's llama-server, restarted 2 s after it exits (a crash or an out-of-memory kill), so the endpoint stays up
function launch(name) {
  const b = backends[name];
  const threads = String(b.threads || cfg.threads || 6), cpus = b.cpus || cfg.cpus;   // each model can have its own cores
  const args = ["-m", b.gguf, ...(b.mmproj ? ["--mmproj", b.mmproj] : []), "--host", "127.0.0.1", "--port", String(b.port), "-t", threads, "-tb", threads, "-c", String((cfg.ctx || 8192) * (b.slots || 1)), "-np", String(b.slots || 1), "--no-webui", ...(Array.isArray(b.args) ? b.args.map(String) : [])];   // b.args: extra llama-server flags (e.g. --image-max-tokens)
  const child = cpus ? spawn("taskset", ["-c", cpus, cfg.llamaServer, ...args], { stdio: ["ignore", "ignore", "pipe"] }) : spawn(cfg.llamaServer, args, { stdio: ["ignore", "ignore", "pipe"] });
  child.stderr.on("data", () => {});
  child.on("exit", (c) => { if (stopping) return; console.error(`${new Date().toISOString()} ${name}: llama-server exited (${c}), restarting`); b.restarts++; setTimeout(() => launch(name), 2000); });
  b.child = child;
}
let stopping = false;
for (const [name, m] of Object.entries(cfg.models)) {
  const p = next++, gguf = typeof m === "string" ? m : m.gguf, mmproj = typeof m === "string" ? null : m.mmproj;
  backends[name] = { port: p, gguf, mmproj, vision: !!mmproj, restarts: 0, cpus: m.cpus || null, threads: m.threads || null, args: m.args || null, slots: Math.max(1, +m.slots || 1), maxWaitMs: +m.maxWaitMs || null, active: 0, busy: false, served: 0, refused: 0 };
  launch(name);
  console.log(`${name}: ${path.basename(gguf)} on 127.0.0.1:${p}`);
}
process.on("exit", () => { stopping = true; Object.values(backends).forEach((b) => b.child?.kill()); });
process.on("SIGTERM", () => process.exit(0));
process.on("SIGINT", () => process.exit(0));

// Ollama's { role, content, images: [base64] } as OpenAI-style content parts
const toParts = (m) => (Array.isArray(m.images) && m.images.length ? { role: m.role, content: [...m.images.map((x) => ({ type: "image_url", image_url: { url: `data:image/jpeg;base64,${x}` } })), { type: "text", text: m.content || "" }] } : { role: m.role, content: m.content });
function forward(b, body, onRequest) {
  // Qwen3 is trained (and served) without thinking: its template gets enable_thinking false, as in training
  const req = { messages: body.messages.map(toParts), temperature: body.options?.temperature ?? 0, max_tokens: body.options?.num_predict ?? 600, ...(body.options?.seed != null ? { seed: body.options.seed } : body.seed != null ? { seed: body.seed } : {}), cache_prompt: true, chat_template_kwargs: { enable_thinking: false },
    ...(body.format && typeof body.format === "object" ? { response_format: { type: "json_schema", json_schema: { name: "reply", schema: body.format } } } : body.format === "json" ? { response_format: { type: "json_object" } } : {}),
    ...(body.logprobs ? { logprobs: true, top_logprobs: body.top_logprobs || 5 } : {}) };
  return new Promise((ok, bad) => {
    const data = JSON.stringify(req);
    const q = http.request({ host: "127.0.0.1", port: b.port, path: "/v1/chat/completions", method: "POST", headers: { "content-type": "application/json", "content-length": Buffer.byteLength(data) } }, (res) => {
      let s = ""; res.setEncoding("utf8"); res.on("data", (x) => { s += x; }); res.on("end", () => { if (res.statusCode >= 500) return bad(new Error(`llama-server HTTP ${res.statusCode}`)); try { ok(JSON.parse(s)); } catch (e) { bad(e); } });  // 503 while loading: retried
    });
    q.on("error", bad); onRequest?.(q); q.end(data);
  });
}

// One port for every model and Done-OCR. On a machine the website reaches over the internet (cfg.host "0.0.0.0"), it
// answers only over TLS (cfg.tls: { key, cert }, a certificate for the machine's address) and only to a caller that
// sends the shared token (Authorization: Bearer <DONE_SERVE_TOKEN>); the firewall admits only the website's address.
const token = process.env.DONE_SERVE_TOKEN || cfg.token || null;
const tokenOk = (req) => { if (!token) return true; const h = String(req.headers.authorization || ""), want = `Bearer ${token}`; return h.length === want.length && crypto.timingSafeEqual(Buffer.from(h), Buffer.from(want)); };
const host = cfg.host || "127.0.0.1";
if (host !== "127.0.0.1" && (!token || !cfg.tls)) { console.error("serve.mjs: a public host needs cfg.tls and DONE_SERVE_TOKEN"); process.exit(1); }
const make = cfg.tls ? (h) => https.createServer({ key: fs.readFileSync(cfg.tls.key), cert: fs.readFileSync(cfg.tls.cert) }, h) : (h) => http.createServer(h);
make(async (req, res) => {
  if (!tokenOk(req)) { res.writeHead(401, { "content-type": "application/json" }); return res.end('{"error":"unauthorized"}'); }
  const send = (code, obj) => { const b = JSON.stringify(obj); res.writeHead(code, { "content-type": "application/json", "content-length": Buffer.byteLength(b) }); res.end(b); };
  try {
    if (req.method === "GET" && req.url === "/api/version") return send(200, { version: "done-serve 1 (llama.cpp)" });
    if (req.method === "GET" && req.url === "/api/tags") return send(200, { models: Object.entries(backends).map(([name, b]) => ({ name, model: name, details: { format: "gguf", file: path.basename(b.gguf), vision: b.vision, restarts: b.restarts, busy: b.busy, active: b.active, slots: b.slots, served: b.served, refused: b.refused, cpus: b.cpus || cfg.cpus || null } })) });
    // Done-OCR (ml/ocr/server.py) answers POST /read on cfg.ocrPort: passed through as it is
    if (req.method === "POST" && req.url === "/read" && cfg.ocrPort) {
      let body = ""; for await (const x of req) body += x;
      const r = await new Promise((ok, bad) => { const q = http.request({ host: "127.0.0.1", port: cfg.ocrPort, path: "/read", method: "POST", headers: { "content-type": "application/json", "content-length": Buffer.byteLength(body) } },
        (rs) => { let t = ""; rs.setEncoding("utf8"); rs.on("data", (c) => { t += c; }); rs.on("end", () => ok({ code: rs.statusCode, t })); }); q.on("error", bad); res.on("close", () => { if (!res.writableFinished) q.destroy(); }); q.end(body); });
      res.writeHead(r.code, { "content-type": "application/json" }); return res.end(r.t);
    }
    if (req.method !== "POST" || req.url !== "/api/chat") return send(404, { error: "not found" });
    let s = ""; for await (const x of req) s += x;
    const body = JSON.parse(s), b = backends[body.model];
    if (!b) return send(404, { error: `model "${body.model}" not found` });
    const t0 = Date.now();
    // at most `slots` requests at a time per model (llama-server's -np): a request that would wait longer than maxWaitMs
    // (per model, else the endpoint's) for a free slot is turned away (503 busy), so callers fall back to their rules
    const maxWait = +(b.maxWaitMs || cfg.maxWaitMs || 15000);
    while (b.active >= b.slots && Date.now() - t0 < maxWait) await new Promise((ok) => setTimeout(ok, 100));
    if (b.active >= b.slots) { b.refused++; return send(503, { error: `${body.model} is busy (${b.slots} at a time); try again or use the rules` }); }
    b.active++; b.busy = b.active >= b.slots; const tq = Date.now();   // queue_duration: time spent waiting for the request before this one
    let upstream = null, gone = false;
    // a caller that stops waiting cancels its request upstream, so abandoned calls don't pile up behind new ones
    res.on("close", () => { if (!res.writableFinished) { gone = true; upstream?.destroy(); } });
    let j = null;
    try {
      for (let tries = 0; ; tries++) {
        try { j = await forward(b, body, (q) => { upstream = q; }); break; } catch (e) { if (gone || tries >= 30) throw e; await new Promise((ok) => setTimeout(ok, 1000)); }  // loading or restarting: up to 30 s
      }
    } finally { b.active--; b.busy = b.active >= b.slots; }
    if (gone) return;
    b.served++;
    const c = j.choices?.[0] || {};
    send(200, { model: body.model, created_at: new Date().toISOString(), message: { role: "assistant", content: c.message?.content || "" }, done: true, done_reason: c.finish_reason || "stop",
      total_duration: (Date.now() - t0) * 1e6, queue_duration: (tq - t0) * 1e6, prompt_eval_count: j.usage?.prompt_tokens || 0, eval_count: j.usage?.completion_tokens || 0,
      ...(body.logprobs && c.logprobs?.content ? { logprobs: c.logprobs.content.map((t) => ({ token: t.token, logprob: t.logprob, top_logprobs: (t.top_logprobs || []).map((x) => ({ token: x.token, logprob: x.logprob })) })) } : {}) });
  } catch (e) { send(500, { error: String(e.message || e).slice(0, 200) }); }
}).listen(port, host, () => console.log(`done models on ${cfg.tls ? "https" : "http"}://${host}:${port} (Ollama-style /api/chat${token ? ", token required" : ""})`));
