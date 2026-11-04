// The five products, each one data file: what we ask, how it is priced, what it covers, the claims it pays and its
// clauses. The quote engine, the claim rules, the agents' tools and the model training all read these same files, so
// a clause is written once and cited by its id everywhere (RT-2.1, PT-3.1, ...).
import fs from "node:fs";
import path from "node:path";

const dir = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
export const PRODUCTS = Object.fromEntries(["renters", "home", "pet", "life", "car"].map((id) => [id, JSON.parse(fs.readFileSync(path.join(dir, `${id}.json`), "utf8"))]));
export const product = (id) => PRODUCTS[id] || null;
export const clause = (id) => { for (const p of Object.values(PRODUCTS)) { const c = p.clauses.find((x) => x.id === id); if (c) return { ...c, product: p.id }; } return null; };
export const claimType = (p, type) => product(p)?.claims.find((c) => c.type === type) || null;
export const coverage = (p, id) => product(p)?.coverages.find((c) => c.id === id) || null;

// Every clause a product's coverages, addons and claim types cite must exist (checked once at start, and by the tests)
export function check() {
  const bad = [];
  for (const p of Object.values(PRODUCTS)) {
    const ids = new Set(p.clauses.map((c) => c.id));
    for (const x of [...p.coverages, ...p.addons, ...p.claims]) if (!ids.has(x.clause)) bad.push(`${p.id}: ${x.id || x.type} cites ${x.clause}`);
    for (const c of p.claims) if (!p.coverages.some((v) => v.id === c.coverage) && !p.addons.some((a) => a.id === c.coverage)) bad.push(`${p.id}: claim ${c.type} has no coverage ${c.coverage}`);
  }
  return bad;
}

// A short public view for agents and the website: no pricing internals, the questions and what is covered
export const summary = (p, lang = "en") => ({ id: p.id, name: p.name[lang], for: p.for[lang],
  questions: p.questions.map((q) => ({ id: q.id, type: q.type, ask: q[lang], ...(q.options ? { options: q.options.map((o) => ({ value: o.v, label: o[lang] })) } : {}), ...(q.min != null ? { min: q.min, max: q.max } : {}), ...(q.unit ? { unit: q.unit } : {}) })),
  covers: p.coverages.map((c) => ({ id: c.id, what: c[lang], clause: c.clause })),
  addons: p.addons.map((a) => ({ id: a.id, what: a[lang], clause: a.clause })),
  claims: p.claims.map((c) => ({ type: c.type, what: c[lang], evidence: c.evidence })) });
