// submission/cover.html -> submission/cover.png (1920x1080) and the film's cover-nostamp.png
import path from "node:path";
import { launch } from "./lib.mjs";
const b = await launch(); const p = await b.newPage();
await p.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });
const url = "file:///D:/paypal/done/submission/cover.html";
for (const [q, out] of [["", "D:/paypal/done/submission/cover.png"], ["", "D:/paypal/done/video/out/cover.png"], ["?nostamp", "D:/paypal/done/video/public/textures/cover-nostamp.png"]]) {
  await p.goto(url + q, { waitUntil: "networkidle0" }); await p.evaluate(() => document.fonts.ready); await new Promise((r) => setTimeout(r, 800));
  await p.screenshot({ path: out }); console.log("saved", out);
}
await b.close();
