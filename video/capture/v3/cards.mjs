// Element captures of every message in an agent thread (customer or pro), at the page's device scale: each card becomes
// its own texture for the film. Writes <prefix>-NN.png and <prefix>.json (index: from, text, card kind, job, size).
import path from "node:path";
import fs from "node:fs";
import { OUT, settle, eager, log } from "./lib3.mjs";
export async function threadCards(p, prefix) {
  await p.addStyleTag({ content: ".composer, .sugg, .sugg-c { display: none !important; }" });
  await eager(p); await settle(p, 800);
  const n = await p.evaluate(() => document.querySelectorAll("article.msg-t").length);
  const idx = [];
  for (let i = 0; i < n; i++) {
    const h = await p.evaluateHandle((k) => document.querySelectorAll("article.msg-t")[k], i);
    const info = await h.evaluate((e) => ({ from: [...e.classList].find((c) => ["agent", "you", "system"].includes(c)) || "", text: (e.innerText || "").replace(/\s+/g, " ").slice(0, 160), w: Math.round(e.getBoundingClientRect().width), h: Math.round(e.getBoundingClientRect().height) }));
    await h.evaluate((e) => e.scrollIntoView({ block: "center" })); await settle(p, 250);
    const file = `${prefix}-${String(i).padStart(2, "0")}.png`;
    await h.screenshot({ path: path.join(OUT, file) });
    idx.push({ i, file, ...info });
  }
  fs.writeFileSync(path.join(OUT, `${prefix}.json`), JSON.stringify(idx, null, 1));
  log("cards", prefix, n);
  return idx;
}
