// Real accounts: sign up with email, password and PIN (customer or pro), sign in again with email and password, and
// what a password sign-in may and may not do without the PIN.
import test, { after } from "node:test";
import assert from "node:assert/strict";
import "./helpers.js";
process.env.DONE_NO_LISTEN = "1";
const { app } = await import("../src/server.js");
const srv = app.listen(0);
after(() => srv.close());
const base = `http://127.0.0.1:${srv.address().port}`;
const client = () => { let ck = ""; return async (method, p, body) => { const r = await fetch(base + p, { method, headers: { "content-type": "application/json", cookie: ck }, body: body ? JSON.stringify(body) : undefined, redirect: "manual" }); for (const c of r.headers.getSetCookie?.() || []) ck = [...ck.split("; ").filter((x) => x && !x.startsWith(c.split("=")[0])), c.split(";")[0]].join("; "); const t = await r.text(); let j; try { j = JSON.parse(t); } catch { j = t; } return { s: r.status, j }; }; };
const uniq = () => `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}@veripay-test.example`;

test("a customer signs up, signs out and signs in again with email and password", async () => {
  const email = uniq(), c = client();
  const up = await c("POST", "/api/auth/signup", { role: "customer", name: "Dana Ortiz", email, password: "correct horse 1", pin: "4826", zip: "78751" });
  assert.equal(up.s, 201);
  assert.equal(up.j.person.role, "customer");
  assert.equal(up.j.person.demo, false);
  assert.equal(up.j.person.zip, "78751");
  assert.equal(up.j.password, undefined);
  assert.equal(JSON.stringify(up.j).includes("correct horse"), false);
  assert.equal((await c("GET", "/api/me")).j.person.email, email);
  await c("POST", "/api/auth/signout");
  assert.equal((await c("GET", "/api/me")).j.signedIn, false);
  const back = await c("POST", "/api/auth/login", { email: email.toUpperCase(), password: "correct horse 1" });
  assert.equal(back.s, 200);
  assert.equal(back.j.person.id, up.j.person.id);
  // signed in by password, not stepped up: a person-only change still asks for the PIN
  assert.equal((await c("PUT", "/api/auth/pin", { pin: "1111" })).j.error, "step_up");
  assert.equal((await c("POST", "/api/auth/step-up", { pin: "4826" })).s, 200);
});

test("sign-up checks its fields and refuses an email that already has an account", async () => {
  const c = client(), email = uniq(), ok = { role: "customer", name: "Lee", email, password: "longenough", pin: "1234" };
  assert.equal((await c("POST", "/api/auth/signup", { ...ok, email: "not-an-email" })).j.error, "email");
  assert.equal((await c("POST", "/api/auth/signup", { ...ok, password: "short" })).j.error, "password");
  assert.equal((await c("POST", "/api/auth/signup", { ...ok, pin: "12" })).j.error, "pin");
  assert.equal((await c("POST", "/api/auth/signup", { ...ok, name: " " })).j.error, "name");
  assert.equal((await c("POST", "/api/auth/signup", ok)).s, 201);
  const again = await client()("POST", "/api/auth/signup", { ...ok, email: email.toUpperCase() });
  assert.equal(again.s, 409);
  assert.equal(again.j.error, "email_taken");
});

test("a wrong password and an unknown email get the same answer", async () => {
  const c = client(), email = uniq();
  await c("POST", "/api/auth/signup", { name: "Kim", email, password: "rightpassword", pin: "2468" });
  const wrong = await client()("POST", "/api/auth/login", { email, password: "wrongpassword" });
  const nobody = await client()("POST", "/api/auth/login", { email: uniq(), password: "rightpassword" });
  assert.equal(wrong.s, 401); assert.equal(nobody.s, 401);
  assert.equal(wrong.j.message, nobody.j.message);
});

test("a pro signs up with their business: not hireable until their PayPal is verified", async () => {
  const c = client(), email = uniq();
  const up = await c("POST", "/api/auth/signup", { role: "pro", name: "Ana Flores", business: "Flores Plumbing", trade: "plumbing", zip: "78702", email, password: "pipes and valves", pin: "5791" });
  assert.equal(up.s, 201);
  assert.equal(up.j.person.role, "pro");
  assert.equal(up.j.pro.name, "Flores Plumbing");
  assert.equal(up.j.readiness.hireable, false);
  assert.equal(up.j.readiness.blockers[0].id, "paypal");
  assert.equal((await c("GET", "/api/me")).j.pro.id, up.j.pro.id);
  assert.equal((await client()("POST", "/api/auth/signup", { role: "pro", name: "X", trade: "roofing", email: uniq(), password: "longenough", pin: "1234" })).j.error, "trade");
});
