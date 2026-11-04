// The people who hold policies. A demo person signs in with a name (DEMO_SIGNIN); their PayPal email is where claims
// and refunds are paid: with sandbox keys it is a sandbox personal account, so the payout lands somewhere real in
// PayPal's sandbox. A person's cause is where their pool's leftover goes at the end of the year (giveback.js).
import crypto from "node:crypto";
import { store, stateFile } from "./store.js";
import { nowIso } from "./clock.js";

const db = store(stateFile("people"), { people: {} });
export const peopleStore = db;
export const person = (id) => db.data.people[id] || null;
export const allPeople = () => Object.values(db.data.people);

export function makePerson({ name, email = null, lang = "zh", demo = true, via = "demo" }) {
  const id = `p_${crypto.randomBytes(5).toString("hex")}`;
  const p = { id, name: String(name || "").trim().slice(0, 40) || "Someone", email: email ? String(email).slice(0, 120) : null, lang: lang === "en" ? "en" : "zh", demo, via, cause: null, vault: null, created: nowIso() };
  db.data.people[id] = p; db.save();
  return p;
}
export function updatePerson(id, patch) {
  const p = person(id);
  if (!p) return null;
  for (const k of ["name", "email", "lang", "cause"]) if (patch[k] !== undefined) p[k] = patch[k];
  if (patch.vault !== undefined) p.vault = patch.vault;
  if (patch.limits !== undefined) p.limits = patch.limits;
  if (patch.devices !== undefined) p.devices = patch.devices;
  if (patch.causes !== undefined) { p.causes = patch.causes; p.cause = Object.entries(patch.causes).sort((a, b) => b[1] - a[1])[0]?.[0] || p.cause; }
  db.save();
  return p;
}
// where a person's money is sent: their own PayPal email, or (in a demo without one) a sandbox stand-in address
export const payoutAddress = (p) => p.email || `${p.id}@cover-demo.example`;
