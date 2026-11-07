// The people who use VeriPay: customers (homeowners, renters) who hire, and the accounts pros sign in with.
// A customer's saved payment method (vault) is what holds are authorized on; their limits are what their agent may
// spend and approve (only they change them, on the website). A pro's payout PayPal lives with the pro (pros.js),
// verified, and is the only place their money goes.
import crypto from "node:crypto";
import { store, stateFile } from "./store.js";
import { nowIso } from "./clock.js";

const db = store(stateFile("people"), { people: {} });
export const peopleStore = db;
export const person = (id) => db.data.people[id] || null;
export const allPeople = () => Object.values(db.data.people);

// What an agent may do with a person's money, in cents. Shown on the website and to agents in dollars.
//   perJobMax        the most one job may cost (agreed price plus approved change orders)
//   monthlyMax       the most all jobs agreed in a calendar month may cost together
//   changeMax        the largest change order the agent may approve by itself; above it, the person approves it
//   bufferPct        how much is held on top of the price, to pay approved change orders without a new approval
//   agentMayRelease  whether the agent may release money when the checks didn't pass by themselves (review)
//   agentMayCancel   whether the agent may cancel a job (voiding its hold)
export const DEFAULT_LIMITS = { perJobMax: 50000, monthlyMax: 150000, changeMax: 7500, materialsAdvanceMax: 15000, bufferPct: 20, agentMayRelease: false, agentMayCancel: true, requireMandate: false };

export function makePerson({ name, email = null, zip = "78704", demo = true, via = "demo", role = "customer", address = null } = {}) {
  const id = `p_${crypto.randomBytes(5).toString("hex")}`;
  const p = { id, name: String(name || "").trim().slice(0, 60) || "Someone", email: email ? String(email).slice(0, 120) : null, role: ["pro", "inspector", "landlord"].includes(role) ? role : "customer", pro: null,
    zip: /^\d{5}$/.test(String(zip)) ? String(zip) : "78704", address, demo, via, vault: null, limits: { ...DEFAULT_LIMITS }, created: nowIso() };
  db.data.people[id] = p; db.save();
  return p;
}
export function updatePerson(id, patch) {
  const p = person(id);
  if (!p) return null;
  for (const k of ["name", "email", "zip", "address", "phone", "lang", "vault", "vaultLabel", "vaultFrom", "vaultCustomer", "vaultNtr", "pro", "role", "landlord", "tenants", "mandateKeys"]) if (patch[k] !== undefined) p[k] = patch[k];
  if (patch.limits !== undefined) p.limits = { ...DEFAULT_LIMITS, ...p.limits, ...patch.limits };
  db.save();
  return p;
}
// the demo's third-party inspector (fictional), always there
export function ensureDemoInspector() { return allPeople().find((x) => x.role === "inspector" && x.demo) || makePerson({ name: "Capitol Home Inspections", role: "inspector", zip: "78701" }); }
export const limitsOf = (p) => ({ ...DEFAULT_LIMITS, ...(p?.limits || {}) });
// the website's view of a person (the vault id itself stays on the server)
export const viewPerson = (p) => p && ({ id: p.id, name: p.name, email: p.email, role: p.role, pro: p.pro, zip: p.zip, address: p.address, demo: p.demo, savedPayment: p.vault ? { kind: String(p.vault).split(":")[0], label: p.vaultLabel || (String(p.vault).startsWith("card:") ? "Card (vaulted)" : "PayPal (vaulted)") } : null, created: p.created, tenancy: tenancyView(p) });
// Landlords and tenants (PLAN §15 item 1). A landlord (or property manager) is a person with role "landlord": their own
// PIN, their own limits, their own saved PayPal, their own agent tokens. A tenant is a customer linked to one landlord
// (person.landlord: { id, unit, linkedAt }); the landlord keeps the list (person.tenants: [{ person, unit, linkedAt }]).
// The demo's landlord (fictional) answers within minutes through a demo landlord agent, labelled (demopro.js).
export const DEMO_LANDLORD = "Riverside Property Management";
// names without demo markers (earlier stores had "Demo · Name" and "... (demo)"); p.demo still marks a demo person
export const plainName = (s) => String(s || "").replace(/^Demo · /, "").replace(/\s*\(demo\)/gi, "").trim();
for (const p of Object.values(db.data.people)) { const n = plainName(p.name); if (n && n !== p.name) p.name = n; }
export function ensureDemoLandlord() {
  return allPeople().find((x) => x.role === "landlord" && x.via === "demo_landlord") || makePerson({ name: DEMO_LANDLORD, role: "landlord", zip: "78704", via: "demo_landlord", email: null });
}
export function linkTenant(tenantId, landlordId, { unit = null } = {}) {
  const t = person(tenantId), l = person(landlordId);
  if (!t || !l || l.role !== "landlord" || t.role !== "customer") return null;
  const u = unit ? String(unit).slice(0, 60) : null, at = nowIso();
  t.landlord = { id: l.id, unit: u, linkedAt: at };
  l.tenants = [...(l.tenants || []).filter((x) => x.person !== t.id), { person: t.id, name: t.name, unit: u, linkedAt: at }];
  db.save();
  return { tenant: t, landlord: l };
}
export function unlinkTenant(tenantId) {
  const t = person(tenantId), l = t?.landlord ? person(t.landlord.id) : null;
  if (!t?.landlord) return false;
  if (l) l.tenants = (l.tenants || []).filter((x) => x.person !== t.id);
  t.landlord = null; db.save();
  return true;
}
export const tenancyView = (p) => (p?.role === "landlord" ? { role: "landlord", tenants: (p.tenants || []).map((x) => ({ person: x.person, name: person(x.person)?.name || x.name, unit: x.unit, linkedAt: x.linkedAt })), demo: p.via === "demo_landlord" } : p?.landlord ? { role: "tenant", landlord: { id: p.landlord.id, name: person(p.landlord.id)?.name || null, unit: p.landlord.unit, demo: person(p.landlord.id)?.via === "demo_landlord" }, linkedAt: p.landlord.linkedAt } : null);

// a landlord's invite codes for tenants: kept only as a SHA-256 hash, one use, 7 days, kept in the store (a restart keeps them)
const invitesDb = store(stateFile("invites"), { invites: [] });
export const invitesStore = invitesDb;
const shaHex = (s) => crypto.createHash("sha256").update(String(s)).digest("hex");
export function makeInvite(landlordId, { unit = null, days = 7 } = {}) {
  const code = crypto.randomBytes(9).toString("base64url"), expires = new Date(Date.now() + days * 864e5).toISOString();
  invitesDb.data.invites = invitesDb.data.invites.filter((i) => !i.used && Date.parse(i.expires) > Date.now());
  invitesDb.data.invites.push({ hash: shaHex(code), landlord: landlordId, unit: unit ? String(unit).slice(0, 60) : null, expires, used: false, created: nowIso() });
  invitesDb.save();
  return { code, unit: unit ? String(unit).slice(0, 60) : null, expires };
}
export function redeemInvite(code, byPerson) {
  const i = invitesDb.data.invites.find((x) => x.hash === shaHex(code || ""));
  if (!i || i.used || Date.parse(i.expires) < Date.now()) return null;
  i.used = true; i.usedBy = byPerson; i.usedAt = nowIso(); invitesDb.save();
  return i;
}
