// Film v5 cover (no badge: the film draws it): VeriPay, the line, the pro's phone at "Paid $208.84" (current interface).
import path from "node:path";
import { launch, HERE } from "./lib3.mjs";
const b = await launch(); const p = await b.newPage(); await p.setViewport({ width: 1920, height: 1080 });
await p.goto("file:///" + path.join(HERE, "cover-v5.html").split(path.sep).join("/"), { waitUntil: "networkidle0" });
await new Promise((r) => setTimeout(r, 1200));
await p.screenshot({ path: path.join(HERE, "../../public/textures/cover-v5-nobadge.png") }); await b.close(); console.log("ok");
