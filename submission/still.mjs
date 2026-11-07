// A still from a local HTML page at 1920x1080 (the submission cover): submission/cover.html -> submission/cover.png
//   PUPPETEER_FROM=<a folder with puppeteer-core in node_modules> node still.mjs [in.html] [out.png]
import { createRequire } from "node:module";
import path from "node:path";
const require = createRequire(process.env.PUPPETEER_FROM ? path.join(process.env.PUPPETEER_FROM, "package.json") : import.meta.url);
const puppeteer = require("puppeteer-core");

const HERE = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1"));
const [inp = path.join(HERE, "cover.html"), out = path.join(HERE, "cover.png"), query = ""] = process.argv.slice(2); // query e.g. "nostamp"
const browser = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: "new", args: ["--allow-file-access-from-files"] });
const page = await browser.newPage();
await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });
await page.goto("file:///" + path.resolve(inp).replace(/\\/g, "/") + (query ? "?" + query : ""), { waitUntil: "networkidle0" });
await page.screenshot({ path: out });
await browser.close();
console.log("saved", out);
