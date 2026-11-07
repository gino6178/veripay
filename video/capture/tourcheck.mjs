// Does a fresh judge tour on 8840 end "released" automatically, with MODEL-judged conditions? (No pinOnce is printed.)
import { launch, prep, api, B } from "./lib.mjs";
const b = await launch(); const pg = await b.newPage(); await prep(pg);
await pg.goto(B + "/", { waitUntil: "networkidle0" });
let r = await api(pg, "/api/demo/tour", { step: "start" }); const id = r.body.id; console.log("start", id, r.body.number, r.body.status);
for (const s of ["hire", "start_work", "change", "approve_change", "overspend", "evidence"]) {
  const t0 = Date.now(); r = await api(pg, "/api/demo/tour", { step: s, job: id });
  console.log(s, r.status, r.body?.status, r.body?.error || "", Math.round((Date.now() - t0) / 1000) + "s");
}
const j = r.body;
console.log("FINAL", j.status, "| says:", j.tour?.ai?.says, "| autoReleased:", j.tour?.ai?.autoReleased);
console.log("checker", JSON.stringify(j.tour?.ai).slice(0, 900));
const checks = (j.checks?.checks || j.lastCheck?.checks || []);
console.log("checks", JSON.stringify(checks.map((c) => ({ id: c.id, v: c.verdict, by: c.by || c.source || c.checker, np: c.needsPerson }))).slice(0, 900));
console.log("JOBID", id);
await b.close();
