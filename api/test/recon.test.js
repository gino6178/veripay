// The reconciliation agent on the PayPal stand-in: a year of premiums, a refund, an invoice, a claim paid to the vet,
// a dispute; then the ledger is made to disagree with PayPal (an amount, a line PayPal never saw, a capture Cover never
// recorded). And the agent loop with a scripted model: its tool calls go through the toolkit, a tool that moves money
// is refused, and its findings and numbers are checked before they are shown.
import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { mockPaypal } from "../src/pay/mock.js";
import { setPay, pp } from "../src/pay/index.js";
import { makePerson, person } from "../src/people.js";
import { quote } from "../src/quote.js";
import * as P from "../src/policy.js";
import * as C from "../src/claims.js";
import { setReader } from "../src/reader.js";
import { advance, now } from "../src/clock.js";
import { ledgerStore, post } from "../src/pool.js";
import * as R from "../src/recon.js";

setPay(mockPaypal({ file: null }), "http://test");
delete process.env.READER_OLLAMA; delete process.env.RECON_OLLAMA;
setReader((e, buf) => { const m = Object.fromEntries(buf.toString().split(";").map((x) => x.split("="))); return { amount: m.amount ? +m.amount / 100 : null, date: m.date || null, merchant: "Vet", items: [], text: "", confidence: 0.95 }; });
const doc = (s) => Buffer.from(s).toString("base64");
const renters = { place: "Austin, TX 78704", size: 650, floor: "low", building: "managed", contents: 8000, valuables: 0, claims3y: 0, deductible: "250" };
const pet = { species: "cat", petName: "Mochi", breedSize: "small", ageYears: 3, chipped: true, conditions: "none", limit: "6000", copay: "20" };

let firstCapture = null;
test("setup: premiums, a failed one invoiced and paid, a change refunded, a vet paid, a dispute", async () => {
  const me = makePerson({ name: "Rin", email: "rin@example.com" });
  let v = await P.buy(me.id, { quote: quote("renters", renters, { person: me.id }).quote, plan: "monthly", cause: "animals" });
  pp().approve({ token: v.payments[0].paypal }); await P.confirm(v.policy);
  advance(31); await P.tick();
  pp().failNextCharge(person(me.id).vault); advance(31); await P.tick();
  pp().approve({ invoice: P.policy(v.policy).invoice.id }); await P.tick();
  assert.equal(P.policy(v.policy).status, "active");
  const ch = await P.change(v.policy, { answers: { contents: 4000 } });
  assert.match(ch.difference, /^refunded/);
  firstCapture = P.policy(v.policy).payments[0].capture;
  // a pet policy, and a vet paid directly
  const q = quote("pet", pet, { person: me.id });
  const pv = await P.buy(me.id, { quote: q.quote, plan: "yearly" });
  assert.equal(pv.status, "active", "charged to the saved PayPal at once");
  advance(40);
  const today = new Date(now()).toISOString().slice(0, 10);
  const c = await C.file(me.id, { policy: pv.policy, type: "accident", happenedAt: new Date(now() - 864e5).toISOString(), story: "Mochi fell off the shelf and hurt a leg.", amount: 100, payee: "vet", vetEmail: "vet@example.com",
    evidence: [{ kind: "vet_invoice", data: doc(`amount=10000;date=${today}`) }, { kind: "diagnosis", data: doc(`date=${today}`) }] });
  assert.equal(c.status, "paid", JSON.stringify(c.decision?.reason));
  pp().openDispute(firstCapture);
});

test("the plain-code reconciliation: everything matches, and the dispute is open", async () => {
  const r = await R.run({ useModel: false });
  assert.equal(r.mode, "code"); assert.equal(r.paypal, "mock"); assert.equal(r.model.reachable, false);
  assert.ok(r.toolkit.version && r.toolkit.tools.includes("list_transactions"));
  const kinds = new Set(r.rows.map((x) => x.kind));
  for (const k of ["premium", "refund", "payout", "invoice", "dispute"]) assert.ok(kinds.has(k), `has ${k} rows`);
  const bad = r.rows.filter((x) => !["matched", "open"].includes(x.status));
  assert.deepEqual(bad, [], JSON.stringify(bad, null, 1));
  assert.equal(r.counts.open, 1);
  const vet = r.rows.find((x) => x.kind === "payout");
  assert.equal(vet.paypal.receiver, "vet@example.com"); assert.equal(vet.paypal.amount, vet.cover.amount);
  assert.ok(r.calls.every((c) => ["list_transactions", "list_invoices", "get_invoice", "list_disputes", "get_dispute", "get_refund", "show_subscription_details"].includes(c.tool)));
  assert.equal(R.latest().id, r.id);
});

test("disagreements: an amount, a line PayPal never saw, a capture Cover never recorded", async () => {
  const L = ledgerStore.data.lines, line = L.find((l) => l.kind === "premium" && l.ref === firstCapture);
  line.amount += 1;
  post({ kind: "premium", cause: "animals", amount: 999, policy: line.policy, product: "renters", ref: "CAP-NOSUCHCAPTURE" });
  const stray = await pp().createPayment({ amount: 1234, reference: line.policy, description: "x", vaultId: Object.values(ledgerStore.data.lines).length && person(P.policy(line.policy).person).vault, requestId: "stray" });
  const r = await R.run({ useModel: false });
  const of = (id) => r.rows.find((x) => x.cover?.id === id || x.paypal?.id === id);
  assert.equal(of(firstCapture).status, "amount_differs");
  assert.equal(of(firstCapture).paypal.amount, line.amount - 1);
  assert.equal(of("CAP-NOSUCHCAPTURE").status, "missing_in_paypal");
  assert.equal(of(stray.capture.id).status, "missing_in_cover");
  assert.equal(of(stray.capture.id).paypal.amount, 1234);
  line.amount -= 1;
});

test("only read-only toolkit tools run: a refund asked for is refused", async () => {
  const s = R.session();
  const j = await s.runTool("create_refund", { capture_id: firstCapture }, "agent");
  assert.match(j.error.message, /refused/);
  assert.equal(s.calls[0].refused, true);
});

test("the agent loop: a scripted model's tool calls run, and what it says is checked", async () => {
  const base = await R.run({ useModel: false });
  const cap = base.rows.find((x) => x.kind === "premium" && x.status === "matched");
  let turn = 0;
  const srv = http.createServer((req, res) => {
    let body = ""; req.on("data", (d) => (body += d)); req.on("end", () => {
      res.setHeader("Content-Type", "application/json");
      if (req.url === "/api/tags") return res.end(JSON.stringify({ models: [{ name: "test-model" }] }));
      const j = JSON.parse(body); turn++;
      if (turn === 1) { assert.ok(j.tools.some((t) => t.function.name === "list_transactions")); assert.ok(!j.tools.some((t) => t.function.name === "create_refund"));
        return res.end(JSON.stringify({ message: { role: "assistant", content: "", tool_calls: [{ function: { name: "list_transactions", arguments: {} } }, { function: { name: "create_refund", arguments: { capture_id: cap.cover.id } } }] } })); }
      return res.end(JSON.stringify({ message: { role: "assistant", content: JSON.stringify({ findings: [
        { kind: "premium", id: cap.cover.id, status: "matched", cover_amount: cap.cover.amount / 100, paypal_amount: cap.paypal.amount / 100 },
        { kind: "premium", id: cap.cover.id, status: "matched", cover_amount: 1, paypal_amount: 1 },
        { kind: "premium", id: "NOT-AN-ID", status: "missing_in_cover", cover_amount: null, paypal_amount: 5 }],
        summary: `I matched ${base.counts.matched} items. PayPal also holds 987654 unexplained dollars. Five premium captures are missing in PayPal.` }) } }));
    });
  });
  await new Promise((r) => srv.listen(0, r));
  process.env.RECON_OLLAMA = `http://127.0.0.1:${srv.address().port}`; process.env.RECON_MODEL = "test-model";
  try {
    const r = await R.run();
    assert.equal(r.mode, "agent", r.model.why);
    assert.ok(r.calls.some((c) => c.by === "agent" && c.tool === "list_transactions"));
    assert.ok(r.calls.some((c) => c.by === "agent" && c.tool === "create_refund" && c.refused));
    assert.equal(r.agent.verified, 1); assert.equal(r.agent.rejected, 2);
    assert.match(r.agent.summary, new RegExp(`matched ${r.counts.matched} items`), JSON.stringify(r.agent.dropped));
    assert.doesNotMatch(r.agent.summary, /987654/);
    assert.deepEqual(r.agent.dropped[0].unverified, ["987654"]);
    assert.deepEqual(r.agent.dropped[1]?.contradicted, ["missing_in_paypal"], "a status claim with the wrong count is dropped");
  } finally { srv.close(); delete process.env.RECON_OLLAMA; delete process.env.RECON_MODEL; }
});
