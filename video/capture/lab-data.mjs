// Film v5, the test lab wall: 15 of the real test agents, each with its own screenshots (video/done-agent-screens) and
// the calls it made (docs/live-test/ops). Writes src/v5/lab.json and copies the screenshots to public/textures/lab/.
// Tokens, keys, PINs and e-mail addresses are scrubbed from the call lines.
import fs from "node:fs";
import path from "node:path";
const HERE = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1"));
const SHOTS = "D:/paypal/video/done-agent-screens", OPS = "D:/paypal/done/docs/live-test/ops";
const OUT = path.join(HERE, "../public/textures/lab"), DATA = path.join(HERE, "../src/v5/lab.json");
fs.rmSync(OUT, { recursive: true, force: true }); fs.mkdirSync(OUT, { recursive: true });
const ops = fs.readdirSync(OPS).filter((f) => f.endsWith(".json") && f !== "index.json");
const scrub = (s) => String(s || "")
  .replace(/\b(done|dpk|tok|sk|pk)_[A-Za-z0-9_-]{6,}/g, "$1_•••")
  .replace(/Bearer\s+\S+/gi, "Bearer •••")
  .replace(/("?(pin|password|secret|token|key)"?\s*[:=]\s*"?)[^",\s}]+/gi, "$1•••")
  .replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, "•••@•••")
  .replace(/\s+/g, " ").trim()
  // the command, not where it ran: drop leading "cd <dir> &&" / "cd <dir>;" and local paths
  .replace(/^(cd\s+("[^"]*"|\S+)\s*(&&|;)\s*)+/i, "").replace(/\b[A-Z]:\/[^\s"']*/g, "…").replace(/\/tmp\/\S*/g, "…");
const dirs = fs.readdirSync(SHOTS).filter((d) => fs.statSync(path.join(SHOTS, d)).isDirectory());
const agents = [];
for (const d of dirs) {
  const id = d.split("-").pop().slice(0, 6), op = ops.find((f) => f.includes(id));
  if (!op) continue;
  const j = JSON.parse(fs.readFileSync(path.join(OPS, op), "utf8"));
  const pics = fs.readdirSync(path.join(SHOTS, d)).filter((f) => /\.jpe?g$/.test(f)).sort();
  if (pics.length < 2) continue;
  fs.mkdirSync(path.join(OUT, d), { recursive: true });
  const keep = pics.filter((_, i) => i % Math.ceil(pics.length / 6) === 0).slice(0, 6);
  for (const p of keep) fs.copyFileSync(path.join(SHOTS, d, p), path.join(OUT, d, p));
  const who = j.title.replace(/^Done round \d+:\s*/i, "").replace(/Done & Paid/g, "VeriPay");
  const lines = (j.steps || []).filter((s) => s.tool && s.did).map((s) => `${s.tool === "Bash" ? "$" : "›"} ${scrub(s.did).replace(/Done & Paid/g, "VeriPay").slice(0, 64)}`)
    .filter((l) => !/anthropic|claude|skill|scratch|tabId|preset|foreground|mcp__|paypal\/join|^› \{/i.test(l) && /https?:|\/api\/|\/mcp|click|type|tap|fill|curl|post|get |^\$ /i.test(l)).slice(0, 40);
  agents.push({ dir: d, round: j.round, who, calls: j.calls, pics: keep, lines });
}
// 15 screens: spread over the rounds, the most screenshots first within a round
agents.sort((a, b) => b.pics.length - a.pics.length);
const pick = [];
for (let r = 1; r <= 11 && pick.length < 15; r++) { const a = agents.find((x) => x.round === r && !pick.includes(x)); if (a) pick.push(a); }
for (const a of agents) if (pick.length < 15 && !pick.includes(a)) pick.push(a);
pick.sort((a, b) => a.round - b.round);
fs.writeFileSync(DATA, JSON.stringify(pick, null, 1));
console.log(pick.map((a) => `R${a.round} ${a.who} · ${a.pics.length} pics · ${a.lines.length} lines`).join("\n"));
