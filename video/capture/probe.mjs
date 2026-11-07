// Quick look at the pages (1x, viewport only) to plan the storyboard. Not final captures.
import path from "node:path";
import fs from "node:fs";
import { launch, prep, settle, api, B, HERE } from "./lib.mjs";
const OUTP = path.join(HERE, "probe"); fs.mkdirSync(OUTP, { recursive: true });
const b = await launch();
const pg = await b.newPage(); await prep(pg);
await pg.setViewport({ width: 1920, height: 1080 });
const shot = async (name, url, full = false) => { await pg.goto(B + url, { waitUntil: "networkidle0" }); await settle(pg, 1200); await pg.screenshot({ path: path.join(OUTP, name + ".png"), fullPage: full }); console.log("ok", name); };
await shot("home", "/", true);
await shot("livetest", "/live-test/", false);
await shot("credits", "/credits", false);
const pros = await api(pg, "/api/pros"); console.log("pros", JSON.stringify(pros.body).slice(0, 300));
await shot("tenancy", "/tenancy");
await shot("groups", "/groups");
await b.close();
