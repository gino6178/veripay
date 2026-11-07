// Done-Audit's system prompt and answer schema (ml/prompts.mjs), for scripts in other languages: audit_prompt.json
import fs from "node:fs";
const P = await import(new URL("../prompts.mjs", import.meta.url));
const m = P.checkMessages({ job: { title: "T", window: { from: "2026-11-06", to: "2026-11-08" }, checks: [{ id: "c", what: "W", evidence: "photo" }] }, evidence: [] });
fs.writeFileSync(new URL("./audit_prompt.json", import.meta.url), JSON.stringify({ sys: m.messages[0].content, schema: P.CHECK_SCHEMA }));
console.log("audit_prompt.json written");
