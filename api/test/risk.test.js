// Cover-Risk in quotes: the exported trees price only the products they still fit, every price is positive, and a
// higher hazard level never lowers it.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { PRODUCTS } from "../src/products/index.js";
import { quote, useRiskModel } from "../src/quote.js";
import { installRisk, fits, riskState, RISK_DIR, LEVEL } from "../src/risk.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const have = fs.existsSync(RISK_DIR) && fs.readdirSync(RISK_DIR).some((f) => /^risk_\w+\.json$/.test(f));
const mod = have ? await import(pathToFileURL(path.join(HERE, "../../ml/risk/risk.mjs")).href) : null;
const m = have ? mod.load(RISK_DIR) : null;
const checks = (id) => JSON.parse(fs.readFileSync(path.join(RISK_DIR, `check_${id}.json`), "utf8"));

test("the trees' prices are positive and monotone in every hazard level", { skip: !have && "no exported trees" }, () => {
  let compared = 0;
  for (const [id, spec] of Object.entries(m.specs)) {
    const kinds = spec.features.filter((f) => f.startsWith("z_")).map((f) => f.slice(2));
    for (const c of checks(id)) {
      const base = mod.predict(spec, c.answers, c.zone).claims;
      assert.ok(base > 0 && Number.isFinite(base), `${id}: a positive price`);
      for (const k of kinds) {
        let prev = 0;
        for (const lv of [1, 2, 3]) {
          const v = mod.predict(spec, c.answers, { ...c.zone, [k]: lv }).claims;
          assert.ok(v > 0, `${id} ${k}=${lv}: positive`);
          assert.ok(v >= prev * (1 - 1e-12), `${id}: ${k} ${lv - 1} -> ${lv} lowered the price (${prev} -> ${v})`);
          prev = v; compared++;
        }
      }
    }
  }
  assert.ok(compared > 0);
});

test("a product whose answers changed is not priced by trees that never saw them", { skip: !have && "no exported trees" }, () => {
  const spec = m.specs.home, p = structuredClone(PRODUCTS.home);
  p.questions = p.questions.filter((q) => q.id !== spec.features.find((f) => !f.startsWith("z_")));
  assert.ok(fits(spec, p).length > 0);
  const p2 = structuredClone(PRODUCTS.home); p2.price.zone = {};
  assert.ok(fits(spec, p2).some((w) => /zone level/.test(w)));
});

test("quotes: Cover-Risk where its trees fit, the product's factors where they don't, life on its mortality table", { skip: !have && "no exported trees" }, async () => {
  const st = await installRisk();
  try {
    assert.equal(st.products.life.live, false);
    assert.equal(LEVEL.home.times, 1.0795);
    for (const [id, s] of Object.entries(st.products)) {
      if (id === "life") continue;
      assert.equal(s.live, !s.why, `${id}: live exactly when nothing is said against it`);
      if (!s.live) continue;
      // a fitting product's check policies, as a quote: priced by Cover-Risk, positive, and its reasons are the model's
      const c = checks(id)[0];
      const answers = { ...c.answers };
      for (const q of PRODUCTS[id].questions) if (answers[q.id] === undefined) answers[q.id] = q.type === "place" ? "台北市大安區" : q.type === "number" ? q.min : q.type === "bool" ? false : q.type === "choice" ? q.options[0].v : "x";
      const q = quote(id, answers);
      if (q.error || q.decision === "refer") continue;
      assert.match(q.priced, /^Cover-Risk cover-risk-/);
      assert.ok(q.why.every((w) => w.by === "Cover-Risk"));
      assert.ok(parseFloat(q.annual.slice(1)) > 0);
    }
    assert.equal(quote("life", { ageYears: 50, sex: "m", smoker: false, health: "good", job: "office", amount: "250000", term: "20" }).priced, "product factors");
    assert.equal(riskState().live, Object.values(st.products).some((s) => s.live));
  } finally { useRiskModel(null); }
});
