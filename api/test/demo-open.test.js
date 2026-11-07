// The judges' demo page: POST /api/demo/open signs the browser in as the demo person a feature belongs to.
import test, { after } from "node:test";
import assert from "node:assert/strict";
import "./helpers.js";
process.env.DONE_NO_LISTEN = "1";
const { app } = await import("../src/server.js");
const srv = app.listen(0);
after(() => srv.close());
const base = `http://127.0.0.1:${srv.address().port}`;
const open = async (feature) => { const r = await fetch(base + "/api/demo/open", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ feature }) }); return { s: r.status, j: await r.json(), ck: (r.headers.getSetCookie?.() || []).join(";") }; };

test("demo open: a feature signs in as its demo person and says where to go; an unknown one lists them", async () => {
  const ask = await open("ask");
  assert.equal(ask.s, 200); assert.equal(ask.j.to, "/"); assert.equal(ask.j.as.role, "customer"); assert.match(ask.ck, /done_session=/);
  assert.equal((await open("ask")).j.as.name, ask.j.as.name);
  const ll = await open("landlord");
  assert.equal(ll.j.to, "/tenancy"); assert.equal(ll.j.as.role, "landlord");
  const bad = await open("nope");
  assert.equal(bad.s, 400); assert.ok(bad.j.features.includes("paid"));
});
