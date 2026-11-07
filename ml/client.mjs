// Done & Paid's own models, as the app calls them. The prompts come from ml/prompts.mjs (the ones the models were
// trained on), and every call goes to an Ollama-style /api/chat endpoint (Ollama itself, or ml/serve.mjs in front of
// llama-server on the CPU). The models answer in short codes; code expands them into the agreed shapes.
//   DONE_MODEL_URL (default http://127.0.0.1:11471), DONE_MODEL (default done-chat): Done-Chat
//   DONE_AUDIT_URL (default DONE_MODEL_URL), DONE_AUDIT_MODEL (default done-audit): Done-Audit
//   writeScope(request, { today, address })  -> { title, trade, items, checks: [{ id, what, evidence, rule }], priceCeiling, window } + by, model, ms
//   reviewScope(scope)                       -> { gaps: [{ id, kind, says }], evidencePlan: [{ id, shoot }], disputeRisk } + by, model, ms
//   negotiate({ role, job, limits, history }) -> { action, price, message } + guarded, by, model, ms
//   checkEvidence({ job, evidence })          -> { checks: [{ id, verdict, code, evidence, reason, confidence }] } + by, model, ms
//   describePhoto(base64Jpeg)                 -> { sees } + by, model, ms   (DONE_VLM_URL, default DONE_MODEL_URL; DONE_VLM, default done-vlm):
//                                                the text goes into checkEvidence as that photo's evidence text
// The models give fields and verdicts; code decides money. A move outside the limits is flagged (guarded: true) for
// code to replace, and any failure throws, so the caller falls back to its rules and labels the result "rules".
import { scopeMessages, gapMessages, negotiateMessages, checkMessages, negotiationHints, expandScope, expandGaps, expandChecks, describeMessages, VERDICTS } from "./prompts.mjs";

const env = (k, d) => (typeof process !== "undefined" && process.env[k]) || d;
const chatUrl = () => env("DONE_MODEL_URL", "http://127.0.0.1:11471"), chatModel = () => env("DONE_MODEL", "done-chat");
const auditUrl = () => env("DONE_AUDIT_URL", chatUrl()), auditModel = () => env("DONE_AUDIT_MODEL", "done-audit");

async function call(url, model, { messages, schema }, { maxTokens = 400, logprobs = false, timeoutMs = 30000 } = {}) {
  const t0 = Date.now();
  const r = await fetch(`${url}/api/chat`, { method: "POST", headers: { "content-type": "application/json" }, signal: AbortSignal.timeout(timeoutMs),
    body: JSON.stringify({ model, messages, stream: false, format: schema, options: { temperature: 0, num_predict: maxTokens }, ...(logprobs ? { logprobs: true, top_logprobs: 5 } : {}) }) });
  if (!r.ok) throw new Error(`${model}: HTTP ${r.status}`);
  const j = await r.json(), text = j.message?.content || "";
  let out; try { out = JSON.parse(text); } catch { throw new Error(`${model}: not JSON`); }
  return { out, logprobs: j.logprobs || null, ms: Date.now() - t0, model };
}

export async function writeScope(request, { today = new Date().toISOString().slice(0, 10), address = null } = {}) {
  const { out, ms, model } = await call(chatUrl(), chatModel(), scopeMessages(request, { today, address }), { maxTokens: 400 });
  const s = expandScope(out);
  s.checks = s.checks.filter((c) => c && c.id && c.what && ["photo", "receipt", "note"].includes(c.evidence));
  if (!s.title || !Array.isArray(s.items) || !s.checks.length) throw new Error("done-chat: incomplete work order");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s.window.from || "") || !/^\d{4}-\d{2}-\d{2}$/.test(s.window.to || "")) s.window = null;
  if (!Number.isInteger(s.priceCeiling)) s.priceCeiling = null;
  return { ...s, by: "model", model, ms };
}

export async function reviewScope(scope) {
  const { out, ms, model } = await call(chatUrl(), chatModel(), gapMessages(scope), { maxTokens: 300 });
  return { ...expandGaps(out, scope), by: "model", model, ms };
}

export async function negotiate({ role, job, limits, history = [] }) {
  const { out, ms, model } = await call(chatUrl(), chatModel(), negotiateMessages({ role, job, limits, history }), { maxTokens: 160 });
  const move = { action: out.action, price: Number.isInteger(out.price) ? out.price : null, message: String(out.message || "").slice(0, 400) };
  // code's guard: never above the hirer's ceiling, never below the pro's floor, a price on every non-decline
  const bad = !["offer", "counter", "accept", "decline"].includes(move.action) || (move.action !== "decline" && move.price == null)
    || (role === "hirer" && move.price != null && move.price > limits.ceiling) || (role === "pro" && move.price != null && move.price < limits.floor);
  return { ...move, guarded: bad, ...(bad ? { note: `the model's move broke a limit; code's hint was: ${negotiationHints(role, limits, history)}` } : {}), by: "model", model, ms };
}

// the probability of each verdict where the model wrote it, from the top tokens it returned (Ollama-style logprobs:
// [{ token, logprob, top_logprobs: [{ token, logprob }] }])
export function verdictConfidences(logprobs) {
  if (!Array.isArray(logprobs)) return [];
  const out = []; let text = "";
  for (const t of logprobs) {
    if (/"v"\s*:\s*"$/.test(text)) {
      const ps = {};
      for (const c of t.top_logprobs || [{ token: t.token, logprob: t.logprob }]) {
        const tok = c.token.replace(/^\s+/, "");
        const v = tok && VERDICTS.find((x) => x.startsWith(tok) || tok.startsWith(x));
        if (v) ps[v] = (ps[v] || 0) + Math.exp(c.logprob);
      }
      const z = Object.values(ps).reduce((a, b) => a + b, 0);
      out.push(z ? Object.fromEntries(Object.entries(ps).map(([k, v]) => [k, v / z])) : null);
    }
    text += t.token;
  }
  return out;
}

export async function checkEvidence({ job, evidence }) {
  const { out, logprobs, ms, model } = await call(auditUrl(), auditModel(), checkMessages({ job, evidence }), { maxTokens: 40 + 24 * job.checks.length, logprobs: true, timeoutMs: 60000 });
  const conf = verdictConfidences(logprobs), order = (out.checks || []).map((c) => String(c?.id));
  const checks = expandChecks(out, job, evidence).map((c) => {
    const p = conf[order.indexOf(c.id)];
    return { ...c, confidence: c.code === "no_verdict" ? 0 : p && p[c.verdict] != null ? +p[c.verdict].toFixed(3) : null };
  });
  return { checks, by: "model", model, ms };
}

const vlmUrl = () => env("DONE_VLM_URL", chatUrl()), vlmModel = () => env("DONE_VLM", "done-vlm");
export async function describePhoto(base64Jpeg, { timeoutMs = 60000 } = {}) {
  const t0 = Date.now(), { messages } = describeMessages([base64Jpeg]);
  const r = await fetch(`${vlmUrl()}/api/chat`, { method: "POST", headers: { "content-type": "application/json" }, signal: AbortSignal.timeout(timeoutMs),
    body: JSON.stringify({ model: vlmModel(), messages, stream: false, options: { temperature: 0, num_predict: 70 } }) });
  if (!r.ok) throw new Error(`${vlmModel()}: HTTP ${r.status}`);
  const j = await r.json(), sees = String(j.message?.content || "").trim();
  if (!sees) throw new Error(`${vlmModel()}: empty description`);
  return { sees, by: "model", model: vlmModel(), ms: Date.now() - t0 };
}
