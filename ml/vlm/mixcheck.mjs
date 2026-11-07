// Are concurrent done-vlm answers ever swapped between photos? Sends the given photos at once, N rounds, prints each answer.
// node ml/vlm/mixcheck.mjs <rounds> <jpg...>
import fs from "node:fs";
import { describeMessages } from "../prompts.mjs";
const [rounds, ...files] = process.argv.slice(2);
for (let r = 0; r < +rounds; r++) {
  const out = await Promise.all(files.map(async (f) => {
    const j = await (await fetch("http://127.0.0.1:11480/api/chat", { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ model: "done-vlm", stream: false, messages: describeMessages([fs.readFileSync(f).toString("base64")]).messages, options: { temperature: 0, num_predict: 70 } }) })).json();
    return `${f.split("/").pop()} -> ${(j.message?.content || j.error || "").slice(0, 110)}`;
  }));
  console.log(`round ${r + 1}\n  ` + out.join("\n  "));
}
