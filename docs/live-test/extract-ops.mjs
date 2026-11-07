// Saves what every test agent actually did, step by step, from Claude Code's subagent transcripts: one JSON file per
// agent in docs/live-test/ops/ (each call, what it sent, what came back), with tokens, passes and local paths removed,
// and its screenshots as image files in a folder outside the repository (they can't be scrubbed).
//   node docs/live-test/extract-ops.mjs <subagents folder> [screenshots folder]
// Run again after each round: files are rewritten, nothing else is touched.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const [src, shots = "D:/paypal/video/done-agent-screens"] = process.argv.slice(2);
if (!src) { console.error("usage: node extract-ops.mjs <subagents folder> [screenshots folder]"); process.exit(1); }
const out = path.join(here, "ops");
fs.mkdirSync(out, { recursive: true });

// which round each agent belonged to: Done & Paid's test agents are started with a description "Done round N: ..."; every
// other agent in the folder (Join's and Cover's tests, the agents that built Done & Paid) is left out
function roundOf(desc) { const m = desc.match(/^Done round (\d+):/i); return m ? +m[1] : null; }

const scrub = (s) => String(s)
  .replace(/done_[A-Za-z0-9_-]{16,}/g, "done_<token>")
  .replace(/dpk_[A-Za-z0-9_-]{8,}/g, "dpk_<key>")
  .replace(/(code=|"code"\s*:\s*")[A-Za-z0-9_-]{12,}/g, "$1<code>")
  .replace(/(\\?"(?:pin|personPin|pinOnce)\\?"\s*:\s*\\?")\d{4,6}/gi, "$1<pin>")
  .replace(/(\bpin\b[^0-9\n]{0,12})\d{4,6}\b/gi, "$1<pin>")
  // the test rounds' own chosen PINs (the seeded demo PINs are public on the site and stay)
  .replace(new RegExp(`\\b(${(process.env.SCRUB_PINS || "4821,7350,5093").split(",").join("|")})\\b`, "g"), "<pin>")
  .replace(/(Bearer\s+)[A-Za-z0-9._~+/=-]{8,}/gi, "$1<token>")
  .replace(/("(?:token|pass|access_token|secret)"\s*:\s*")[^"]{8,}"/gi, '$1<hidden>"')
  .replace(/\/me\/[A-Za-z0-9_-]{8,}/g, "/me/<link>")
  .replace(/[A-Za-z]:[\\/]+Users[\\/]+[^\\/\s"']+[\\/]+AppData[\\/]+Local[\\/]+Temp[\\/]+claude[\\/]+[^\s"'`]*/gi, "<scratch>")
  .replace(/\/c\/Users\/[^/\s]+\/AppData\/Local\/Temp\/claude\/[^\s"'`]*/gi, "<scratch>")
  .replace(/[A-Za-z]:[\\/]+Users[\\/]+[^\\/\s"']+/gi, "~")
  .replace(/\/c\/Users\/[^/\s:"']+/gi, "~").replace(/AppData\/Local\/Temp\/claude\/[^\s"'`]*/g, "<scratch>")
  .replace(/[\w.+-]+@(?!example\.(?:com|org)\b|cover-demo\.example\b)[\w-]+(?:\.[\w-]+)+/gi, "<email>");
const clip = (s, n) => (s.length > n ? s.slice(0, n) + ` …(+${s.length - n} chars)` : s);
const text = (c) => typeof c === "string" ? c : Array.isArray(c) ? c.map((b) => b.type === "text" ? b.text : b.type === "image" ? "[screenshot]" : "").join("\n") : "";
// what a call did, in one line: the command, the page, the action
function what(name, input) {
  if (name === "Bash" || name === "PowerShell") return input.command;
  if (name === "Write") return `write ${input.file_path}\n${input.content}`;
  if (name === "Read") return `read ${input.file_path}`;
  if (name === "WebFetch") return `fetch ${input.url}`;
  if (/navigate/.test(name)) return `open ${input.url}`;
  if (/computer/.test(name)) return [input.action, input.text, input.coordinate && `at ${input.coordinate}`, input.action_summary].filter(Boolean).join(" ");
  if (/browser_batch/.test(name)) return input.actions.map((a) => `${a.name.split("__").pop()} ${what(a.name, a.input)}`).join("\n");
  return JSON.stringify(input);
}

const index = [];
for (const f of fs.readdirSync(src).filter((f) => f.endsWith(".meta.json"))) {
  const id = f.replace(".meta.json", ""), meta = JSON.parse(fs.readFileSync(path.join(src, f), "utf8"));
  const desc = meta.description || "";
  const lines = fs.readFileSync(path.join(src, id + ".jsonl"), "utf8").split("\n").filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  const first = lines.find((l) => l.type === "user");
  if (!first) continue;
  const brief = text(first.message.content), at = first.timestamp, round = roundOf(desc);
  if (round == null) continue;
  const model = lines.find((l) => l.attachment?.type === "model")?.attachment.identity.marketingName || meta.model || null;
  const steps = [], pending = new Map(); let n = 0, shot = 0, final = "";
  for (const l of lines) {
    const c = l.message?.content;
    if (!Array.isArray(c)) continue;
    for (const b of c) {
      if (l.type === "assistant" && b.type === "text" && b.text.trim()) final = b.text;
      if (l.type === "assistant" && b.type === "tool_use") {
        const s = { n: ++n, at: l.timestamp, tool: b.name.split("__").pop(), did: clip(scrub(what(b.name, b.input || {})), 4000) };
        steps.push(s); pending.set(b.id, s);
      }
      if (l.type === "user" && b.type === "tool_result") {
        const s = pending.get(b.tool_use_id); if (!s) continue;
        s.got = clip(scrub(text(b.content)), 3000);
        if (b.is_error) s.error = true;
        for (const img of Array.isArray(b.content) ? b.content.filter((x) => x.type === "image" && x.source?.data) : []) {
          const dir = path.join(shots, `round${round}-${id.slice(6, 14)}`); fs.mkdirSync(dir, { recursive: true });
          const ext = /png/.test(img.source.media_type) ? "png" : "jpg", name = `${String(s.n).padStart(3, "0")}-${++shot}.${ext}`;
          fs.writeFileSync(path.join(dir, name), Buffer.from(img.source.data, "base64"));
          (s.screens ||= []).push(name);
        }
      }
    }
  }
  const rec = { id: id.slice(6), round, title: desc, model, startedAt: at, endedAt: lines.at(-1)?.timestamp, calls: steps.length,
    brief: clip(scrub(brief), 4000), steps, finalMessage: clip(scrub(final), 4000), ...(shot ? { screenshots: `${shots}/round${round}-${id.slice(6, 14)}` } : {}) };
  const file = `round${String(round).padStart(2, "0")}-${desc.replace(/^Done round \d+:\s*/i, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40)}-${id.slice(6, 12)}.json`;
  fs.writeFileSync(path.join(out, file), JSON.stringify(rec, null, 1));
  index.push({ file, round, title: desc, model, startedAt: at, calls: steps.length, screenshots: shot });
}
index.sort((a, b) => a.startedAt.localeCompare(b.startedAt));
fs.writeFileSync(path.join(out, "index.json"), JSON.stringify({ about: "Every Done & Paid test agent's operations, one file each (from extract-ops.mjs).", agents: index.length, calls: index.reduce((t, x) => t + x.calls, 0), screenshots: index.reduce((t, x) => t + x.screenshots, 0), list: index }, null, 1));
console.log(`${index.length} agents, ${index.reduce((t, x) => t + x.calls, 0)} calls, ${index.reduce((t, x) => t + x.screenshots, 0)} screenshots`);
