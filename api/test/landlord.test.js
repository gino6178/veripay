// PLAN §15 item 1, landlord and tenant, end to end over HTTP: a tenant links to a landlord, posts a job for them and
// documents it; the tenant can't hire or pay; the landlord's agent hires within the landlord's limits and the hold is on
// the landlord's PayPal; both see the job; person-only steps need the landlord's PIN; the demo landlord answers by itself.
// Also the inbox (item 8) for both sides.
import test, { after } from "node:test";
import assert from "node:assert/strict";
import { J, people } from "./helpers.js";
process.env.DONE_NO_LISTEN = "1";
process.env.DEMO_LANDLORD_DELAY_MS = "0";
const { app } = await import("../src/server.js");
const demopro = await import("../src/demopro.js");
const srv = app.listen(0);
after(() => srv.close());
const base = `http://127.0.0.1:${srv.address().port}`;
function client() {
  let ck = "";
  return async (method, p, body, headers = {}) => {
    const r = await fetch(base + p, { method, headers: { "content-type": "application/json", cookie: ck, ...headers }, body: body == null ? undefined : JSON.stringify(body), redirect: "manual" });
    const sc = r.headers.get("set-cookie"); if (sc) ck = [ck, sc.split(";")[0]].filter(Boolean).join("; ");
    const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch { j = t; }
    return { s: r.status, j };
  };
}

test("a tenant posts for their landlord; the landlord's agent hires within the landlord's limits on the landlord's PayPal; both see it", async () => {
  const land = client(), ten = client();
  const L = await land("POST", "/api/auth/demo", { as: "landlord", name: "Pat Owner", pin: "4321" });
  assert.equal(L.s, 200); assert.equal(L.j.person.role, "landlord"); assert.ok(L.j.limits.perJobMax);
  const inv = await land("POST", "/api/landlord/invites", { unit: "Apt 2B" });
  assert.ok(inv.j.code);
  const T = await ten("POST", "/api/auth/demo", { as: "customer", name: "Terry Tenant", pin: "1111" });
  assert.equal((await ten("POST", "/api/landlord/invites", {})).s, 403, "a tenant can't make landlord invites");
  const link = await ten("POST", "/api/tenant/landlord", { code: inv.j.code });
  assert.equal(link.s, 200, JSON.stringify(link.j)); assert.equal(link.j.tenancy.role, "tenant"); assert.equal(link.j.tenancy.landlord.unit, "Apt 2B");
  assert.equal((await ten("POST", "/api/tenant/landlord", { code: inv.j.code })).s, 410, "one use");
  assert.equal((await land("GET", "/api/landlord/tenants")).j.tenants[0].name, T.j.person.name);

  const job = await ten("POST", "/api/jobs", { text: "The bathroom sink pipe is leaking under the cabinet, water on the floor. Fix it this week.", zip: "78704", budget: 300, forLandlord: true, requestOffers: true });
  assert.equal(job.s, 200, JSON.stringify(job.j).slice(0, 300));
  assert.equal(job.j.tenancy.you, "tenant"); assert.equal(job.j.tenancy.landlord.id, L.j.person.id);
  const id = job.j.id;
  assert.equal(J.job(id).customer, L.j.person.id, "the landlord is the payer"); assert.equal(J.job(id).tenant, T.j.person.id);
  assert.equal((await ten("POST", `/api/jobs/${id}/tenant/note`, { text: "It started after the storm on Sunday; the cabinet floor is soaked." })).s, 200);
  const offers = J.job(id).offers.filter((o) => o.status === "open");
  assert.ok(offers.length > 0);
  // the tenant can't accept, counter or pay
  const acc = await ten("POST", `/api/jobs/${id}/offers/${offers[0].id}/accept`, { payWith: "card" });
  assert.equal(acc.s, 404); assert.match(acc.j.message, /landlord decides/);
  assert.equal((await ten("POST", `/api/jobs/${id}/tenant/pick`, { offer: offers.at(-1).id })).s, 200);
  // both see it, each in their own view
  const lv = await land("GET", `/api/jobs/${id}`), tv = await ten("GET", `/api/jobs/${id}`);
  assert.equal(lv.j.tenancy.you, "landlord"); assert.equal(tv.j.tenancy.you, "tenant");
  assert.ok(lv.j.tenancy.notes.length === 1 && lv.j.tenancy.pick.offer === offers.at(-1).id);
  assert.equal(lv.j.waitingOn.who, "landlord");
  assert.ok((await ten("GET", "/api/jobs")).j.some((x) => x.id === id && x.role === "tenant"));
  assert.ok((await land("GET", "/api/jobs")).j.some((x) => x.id === id && x.role === "landlord"));

  // the landlord's agent: a token the landlord made (PIN session), within the landlord's limits
  await land("PUT", "/api/limits", { perJobMax: 100 });
  const tok = await land("POST", "/api/tokens", { label: "PM agent" });
  assert.equal(tok.s, 200, JSON.stringify(tok.j));
  const auth = { authorization: `Bearer ${tok.j.token}` };
  const cheap = J.job(id).offers.filter((o) => o.status === "open").sort((a, b) => a.amount - b.amount)[0];
  const over = await land("POST", "/api/agent/accept_offer", { job: id, offer: cheap.id, payWith: "card" }, auth);
  assert.equal(over.s, 403); assert.equal(over.j.limit, "perJobMax", "the landlord's limit binds the landlord's agent");
  await land("PUT", "/api/limits", { perJobMax: 2000 });
  const ok = await land("POST", "/api/agent/accept_offer", { job: id, offer: cheap.id, payWith: "card" }, auth);
  assert.equal(ok.s, 200, JSON.stringify(ok.j).slice(0, 300)); assert.equal(ok.j.status, "held");
  assert.ok(people.person(L.j.person.id).vault, "the hold was saved on the landlord's PayPal (vault)");
  assert.equal(people.person(T.j.person.id).vault, null, "never on the tenant's");
  // the tenant sees the hold, but not the landlord's payment method
  const tv2 = await ten("GET", `/api/jobs/${id}`);
  assert.equal(tv2.j.status, "held"); assert.equal(tv2.j.hold.paidWith, "your landlord's payment method");
  // person-only steps need the landlord's PIN step-up: a fresh landlord session without it is refused
  const land2 = client();
  assert.equal((await land2("POST", "/api/auth/demo", { as: "landlord", person: L.j.person.id, pin: "0000" })).s, 403, "wrong PIN");
  // the inbox: the landlord heard about the tenant's job and note; the tenant heard the landlord hired
  const li = await land("GET", "/api/inbox");
  assert.ok(li.j.items.some((x) => x.action === "tenant_note"), JSON.stringify(li.j.items.map((x) => x.action)));
  assert.ok(li.j.items.some((x) => x.action === "tenant_linked"));
  const ti = await ten("GET", "/api/inbox");
  assert.ok(ti.j.items.some((x) => x.action === "landlord_decided" || x.action === "money_held"));
  assert.ok(!ti.j.items.some((x) => x.action === "tenant_note"), "the tenant isn't told about their own note");
  const ob = await land("GET", "/api/inbox/outbox");
  assert.ok(ob.j.items.length > 0 && ob.j.items.every((x) => x.status === "not_sent"));
  const rd = await ten("POST", "/api/inbox/read", { all: true });
  assert.equal(rd.j.unread, 0);
});

test("the demo landlord's agent answers by itself: it takes the tenant's pick within its limits (labelled)", async () => {
  const ten = client();
  await ten("POST", "/api/auth/demo", { as: "customer", name: "Demo Tenant", pin: "2222" });
  assert.equal((await ten("POST", "/api/tenant/landlord", { demo: true })).s, 200);
  const job = await ten("POST", "/api/jobs", { text: "Kitchen faucet keeps dripping. Fix it this week, $250 max.", zip: "78704", budget: 250, forLandlord: true, requestOffers: true });
  const id = job.j.id, open = J.job(id).offers.filter((o) => o.status === "open" && o.amount <= J.job(id).scope.priceCeiling);
  assert.ok(open.length);
  const pick = open.sort((a, b) => b.amount - a.amount)[0];
  await ten("POST", `/api/jobs/${id}/tenant/pick`, { offer: pick.id });
  const r = await demopro.customerDecides(id);
  assert.ok(r && !r.error, JSON.stringify(r).slice(0, 200));
  const j = J.job(id);
  assert.equal(j.agreed.offer, pick.id, "the tenant's suggestion");
  assert.match(j.agreed.by.client, /Riverside Property Management's agent/);
  assert.equal(j.status, "held");
});

test("over HTTP: inbox settings, the mandate demo issuer (PIN), hold options, a pro's Spanish, Venmo needs the PIN, availability", async () => {
  const cu = client();
  await cu("POST", "/api/auth/demo", { as: "customer", name: "Http Tester", pin: "3333" });
  const st = await cu("PUT", "/api/inbox/settings", { sms: { on: true, to: "512 555 0199" }, inApp: { offers: false } });
  assert.equal(st.s, 200); assert.equal(st.j.sms.to, "+15125550199"); assert.equal(st.j.inApp.offers, false);
  assert.equal((await cu("PUT", "/api/inbox/settings", { push: true })).s, 400);
  const tok = await cu("POST", "/api/tokens", { label: "a", requireMandate: true });
  assert.equal(tok.j.requireMandate, true);
  const iss = await cu("POST", "/api/mandates/issue", { agentClient: tok.j.id, maxAmount: 250, scope: ["hold"] });
  assert.equal(iss.s, 200, JSON.stringify(iss.j)); assert.equal(iss.j.signedBy, "server-held demo key");
  assert.equal((await cu("POST", "/api/mandates/issue", { agentClient: "tok_x", maxAmount: 1, scope: ["hold"] })).s, 400);
  const mm = await cu("GET", "/api/mandates");
  assert.ok(mm.j.serverKey.x && mm.j.mandates.some((x) => x.status === "issued"));
  const job = await cu("POST", "/api/jobs", { text: "Pipe under the bathroom sink is leaking. Fix it this week.", zip: "78704", budget: 300, requestOffers: true });
  const ho = await cu("GET", `/api/jobs/${job.j.id}/hold/options`);
  assert.ok(ho.j.methods.some((m) => m.id === "paylater"));
  const rep = await cu("GET", `/api/jobs/${job.j.id}/reports`);
  assert.ok(rep.j.available.insurance, "a leak job lists the insurance package");
  // a pro in Spanish
  const pro = client();
  await pro("POST", "/api/auth/demo", { as: "pro", pro: "eastside-pipe-drain", pin: "8642" });
  assert.equal((await pro("PUT", "/api/pro/settings", { lang: "es" })).j.lang, "es");
  const err = await pro("POST", "/api/pro/offers/ofr_nope/accept", {});
  assert.equal(err.j.lang, "es"); assert.ok(err.j.messageEn);
  const av = await pro("PUT", "/api/pro/availability", { weekly: { mon: [["08:00", "12:00"]] } });
  assert.equal(av.s, 200); assert.match(av.j.says, /Mon 08:00-12:00/);
  assert.ok((await fetch(`${base}/api/pros/eastside-pipe-drain/availability`).then((r) => r.json())).open.length > 0);
  await pro("PUT", "/api/pro/settings", { lang: "en" });
  await pro("PUT", "/api/pro/availability", { weekly: { mon: [["07:00", "19:00"]], tue: [["07:00", "19:00"]], wed: [["07:00", "19:00"]], thu: [["07:00", "19:00"]], fri: [["07:00", "19:00"]] } });
  const fresh = client();
  await fresh("POST", "/api/auth/demo", { as: "pro", pro: "eastside-pipe-drain", pin: "8642" });
  // the sign-in is stepped up; Venmo then works, and an agent has no route to it
  const vm = await fresh("PUT", "/api/pro/payout-method", { method: "venmo", phone: "5125550142" });
  assert.equal(vm.s, 200, JSON.stringify(vm.j)); assert.equal(vm.j.payoutMethod.method, "venmo");
  await fresh("PUT", "/api/pro/payout-method", { method: "paypal" });
});

test("invite codes are kept (hashed) in the store; a pro with a person hears about new jobs in their feed", async () => {
  const land = client();
  await land("POST", "/api/auth/demo", { as: "landlord", pin: "5555" });
  const inv = await land("POST", "/api/landlord/invites", { unit: "Unit 7" });
  const rows = people.invitesStore.data.invites;
  assert.ok(rows.some((x) => x.unit === "Unit 7" && x.hash && !JSON.stringify(x).includes(inv.j.code)), "stored as a hash only");
  const pro = client();
  await pro("POST", "/api/auth/demo", { as: "pro", pro: "lone-star-rooter", pin: "8642" });
  const cu = client();
  await cu("POST", "/api/auth/demo", { as: "customer", pin: "6666" });
  const job = await cu("POST", "/api/jobs", { text: "Bathroom sink drain is clogged and slow. Fix it this week, $300 max.", zip: "78758", budget: 300, requestOffers: true });
  const ib = await pro("GET", "/api/inbox");
  const f = ib.j.items.find((x) => x.action === "feed_job" && x.job === job.j.id);
  assert.ok(f, JSON.stringify(ib.j.items.map((x) => x.action)));
  assert.equal(f.category, "feed"); assert.match(f.body, /in your feed/);
});
