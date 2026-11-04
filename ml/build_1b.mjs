// Cover-1B's data (US, English), in two steps around the teacher (ml/teacher.mjs):
//   node ml/build_1b.mjs gen        code makes the facts; Muse Glimmer is asked to put them into people's words:
//     qa      for each clause of the five products, a policyholder's question that turns on it, with Glimmer's
//             answer citing a clause (kept only when it cites the clause the question was written for)
//     story   a claim's facts (type, date, place, amount, items) made by code; Glimmer tells it as the claimant would;
//             the label is code's facts (a story is kept only if it says the amount, the place and the items)
//     dialog  a product question and a true answer made by code; Glimmer writes how a person would say it; the label
//             is code's value (one in ten: a reply that doesn't answer, label understood: false)
//   node ml/build_1b.mjs assemble   filters by code and writes the SFT rows (ml/data/1b/sft/<task>_<split>.jsonl:
//     { id, task, messages, target, truth }), the injection sets (stories and documents with an instruction
//     inserted, target the clean label; the test set uses only held-out templates), and the jobs for the teacher
//     column of the evaluation (ml/data/1b/teacher_eval/jobs.jsonl: Glimmer answers the test prompts itself).
//     The ocr task's rows come from the US receipt generator (ml/ocr/out_us/docs_{train,test}.jsonl), labels exact.
import fs from "node:fs";
import path from "node:path";
import * as T from "./tasks.mjs";
// a seeded generator (the same one ml/cases.mjs uses), kept here so the data needs no claim engine
function rng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

const here = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
const ROOT = path.join(here, "data", "1b");
const { PRODUCTS } = T;
const pick = (r, xs) => xs[Math.floor(r() * xs.length)];
const int = (r, a, b) => a + Math.floor(r() * (b - a + 1));
const W = (f, rows) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, rows.map((x) => JSON.stringify(x)).join("\n") + (rows.length ? "\n" : "")); };
const R = (f) => (fs.existsSync(f) ? fs.readFileSync(f, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l)) : []);
const STYLE = ["casual and short", "a bit upset", "with concrete amounts and dates", "long and rambling", "unsure what is covered", "very polite and formal", "texting style, lowercase", "with a typo or two"];
const ymd = (t) => new Date(t).toISOString().slice(0, 10);

// ---------------------------------------------------------------- gen
function genQA() {
  for (const [split, per, seed] of [["train", 14, 101], ["test", 3, 202]]) {
    const r = rng(seed), items = [], jobs = [];
    for (const P of Object.values(PRODUCTS)) for (const c of P.clauses) for (let k = 0; k < per; k++) {
      const id = `qa-${split}-${c.id}-${k}`, style = pick(r, STYLE);
      const sys = `You are preparing training data for Cover, a US insurance company. These are all the clauses of its ${P.name.en} policy.\n${P.clauses.map((x) => `[${x.id}] ${x.en}`).join("\n")}`;
      const user = `Write a question a real US policyholder would ask, about a situation that turns on clause ${c.id} (don't name the clause or copy its wording). Style: ${style}. Then, as Cover's assistant, answer it only from the clauses (briefly), ` +
        `and give the one clause that applies most directly, and covered (yes = it pays, no = it doesn't, partly = it pays part, info = the question isn't about whether it pays). Reply in JSON: question, answer, clause, covered.`;
      items.push({ id, product: P.id, clause: c.id, kind: c.kind, style });
      jobs.push({ id, sample: 0, messages: [{ role: "system", content: sys }, { role: "user", content: user }], schema: { type: "object", properties: { question: { type: "string" }, answer: { type: "string" }, clause: { type: "string" }, covered: { type: "string", enum: ["yes", "no", "partly", "info"] } }, required: ["question", "answer", "clause", "covered"] }, max_tokens: 500 });
    }
    W(path.join(ROOT, "gen", "qa", split, "items.jsonl"), items); W(path.join(ROOT, "gen", "qa", split, "jobs.jsonl"), jobs);
    console.log("qa", split, items.length);
  }
}

const WHERE = ["my apartment in Austin", "the parking garage at work", "our living room", "Elm Street in Denver", "Brooklyn, NY", "outside a coffee shop in Seattle", "my house in Tampa", "the dog park on Maple Ave",
  "the airport in Chicago", "my driveway", "a grocery store parking lot", "my rental in Portland", "the vet's office", "Phoenix, AZ", "I-95 near Richmond", "the gym locker room", "our condo in Miami", "the hotel in Denver"];
const ITEMS = { contents: ["MacBook Air", "road bike", "Canon camera", "couch", "55-inch TV", "suitcase", "watch", "iPad", "Dyson vacuum", "iPhone 15"], building: ["roof shingles", "kitchen ceiling", "hardwood floor", "water heater", "garage door", "windows"],
  liability: ["neighbor's ceiling", "landlord's carpet", "downstairs unit's cabinets"], stay: ["hotel stay"], medical: ["my friend's ER bill"], vet: ["exam", "X-rays", "overnight stay", "bladder stone surgery", "bloodwork", "stitches"],
  wellness: ["rabies vaccine", "annual checkup", "dental cleaning"], own_damage: ["front bumper", "side mirror", "door paint", "tail light"], third_party: ["the other driver's car", "a cyclist's medical bills"], theft: ["car", "motorcycle"],
  flight_delay: ["delayed flight"], flight_cancelled: ["cancelled flight"], baggage_delay: ["checked bag", "toiletries and clothes"], trip_medical: ["urgent care visit", "ER visit"], trip_cancel: ["nonrefundable hotel", "flight tickets"] };
function genStory() {
  const all = Object.values(PRODUCTS).filter((p) => p.id !== "life").flatMap((P) => P.claims.map((c) => [P, c]));
  for (const [split, n, seed] of [["train", 1300, 303], ["test", 220, 404]]) {
    const r = rng(seed), items = [], jobs = [];
    for (let i = 0; i < n; i++) {
      const [P, ct] = pick(r, all), today = ymd(Date.UTC(2026, int(r, 0, 10), int(r, 1, 28))), ago = int(r, 0, 20), date = ymd(Date.parse(today) - ago * 864e5);
      const where = pick(r, WHERE), amount = r() < 0.5 ? int(r, 3, 300) * 10 : int(r, 20, 8000) + (r() < 0.2 ? 0.5 : 0);
      const voc = (ct.coverage === "contents" ? ITEMS.contents : ITEMS[ct.type] || ITEMS[ct.coverage]) || ITEMS.contents, its = [...new Set([pick(r, voc), ...(r() < 0.3 ? [pick(r, voc)] : [])])];
      const s = amount % 1 ? amount.toFixed(2) : amount.toLocaleString("en-US");
      const amountStr = pick(r, [`$${s}`, `${s} dollars`, `$${amount % 1 ? amount.toFixed(2) : amount}`]);
      const id = `st-${split}-${i}`;
      const user = `Preparing claims training data for Cover, a US insurer: write what a policyholder types into the app to report a claim, in the first person, casual American English, 2 to 5 sentences. What happened: ${ct.en} (${P.name.en}). ` +
        `Write these exactly as given: the amount "${amountStr}", the place "${where}", and "${its.join('", "')}". Today is ${today}; it happened on ${date}: ${ago <= 7 && r() < 0.6 ? "say it relatively (yesterday, last Tuesday, two nights ago)" : "give the date (any common US way, like 10/3 or Oct 3)"}. Don't mention any other amount. Reply in JSON: story.`;
      items.push({ id, product: P.id, today, truth: { type: ct.type, happenedAt: date, where, amount, currency: "USD", items: its }, amountStr });
      jobs.push({ id, sample: 0, messages: [{ role: "user", content: user }], schema: { type: "object", properties: { story: { type: "string" } }, required: ["story"] }, max_tokens: 400 });
    }
    W(path.join(ROOT, "gen", "story", split, "items.jsonl"), items); W(path.join(ROOT, "gen", "story", split, "jobs.jsonl"), jobs);
    console.log("story", split, items.length);
  }
}

const PLACES = ["78704", "Austin, TX 78704", "Brooklyn, NY 11215", "33139", "Miami, FL", "Seattle, WA 98103", "Denver, CO", "60614", "Chicago, IL 60614", "Portland, OR 97214", "Phoenix, AZ 85016", "Boston, MA 02116",
  "New Orleans, LA 70115", "94110", "San Francisco, CA", "Nashville, TN 37203", "Columbus, OH 43215", "Raleigh, NC 27601", "Houston, TX 77007", "Boise, ID"];
function valueFor(r, q, today) {
  if (q.type === "choice") { const o = pick(r, q.options); return [o.v, `${o.en} (option ${o.v})`]; }
  if (q.type === "number") { const v = Math.round(q.min + (q.max - q.min) * Math.pow(r(), 2)); return [v, `${v}${q.unit ? ` ${q.unit}` : ""}`]; }
  if (q.type === "bool") { const v = r() < 0.5; return [v, v ? "yes" : "no"]; }
  if (q.type === "place") { const v = pick(r, PLACES); return [v, v]; }
  if (q.type === "date") { const v = ymd(Date.parse(today) + int(r, 3, 200) * 864e5); return [v, `${v} (today is ${today}; they may say it as a US date or relatively)`]; }
  if (q.id === "petName") { const v = pick(r, ["Max", "Bella", "Charlie", "Luna", "Cooper", "Daisy", "Mochi"]); return [v, v]; }
  return null;
}
function genDialog() {
  const qs = Object.values(PRODUCTS).flatMap((P) => P.questions.filter((q) => ["choice", "number", "bool", "place", "date"].includes(q.type) || q.id === "petName").map((q) => [P, q]));
  for (const [split, n, seed] of [["train", 1600, 505], ["test", 260, 606]]) {
    const r = rng(seed), items = [], jobs = [];
    for (let i = 0; i < n; i++) {
      const [P, q] = pick(r, qs), today = ymd(Date.UTC(2026, int(r, 0, 10), int(r, 1, 28))), off = r() < 0.1, [v, meaning] = valueFor(r, q, today), id = `dg-${split}-${i}`;
      const user = off ? `Cover's quote assistant Lumi asks a customer: "${q.en}"\nWrite the customer's one-line reply, but they don't answer this question (they ask why it's needed, say later, ask something else, or say they don't know). Casual American English. Reply in JSON: reply.`
        : `Cover's quote assistant Lumi asks a customer: "${q.en}"\nThe customer's true answer is: ${meaning}. Write how they'd actually reply, casually, in American English (don't say the option code; they can say it indirectly, e.g. the floor number for high or low, round numbers or words for amounts; ${pick(r, ["very short", "adds a bit about their situation", "sloppy", "polite"])}). Reply in JSON: reply.`;
      items.push({ id, product: P.id, qid: q.id, qtype: q.type, today, truth: { value: off ? null : v, understood: !off } });
      jobs.push({ id, sample: 0, messages: [{ role: "user", content: user }], schema: { type: "object", properties: { reply: { type: "string" } }, required: ["reply"] }, max_tokens: 200 });
    }
    W(path.join(ROOT, "gen", "dialog", split, "items.jsonl"), items); W(path.join(ROOT, "gen", "dialog", split, "jobs.jsonl"), jobs);
    console.log("dialog", split, items.length);
  }
}

// ---------------------------------------------------------------- assemble
const answers = (task, split) => new Map(R(path.join(ROOT, "gen", task, split, "answers.jsonl")).filter((a) => a.answer).map((a) => [a.id, a.answer]));
const row = (id, task, m, target, truth, extra = {}) => ({ id, task, messages: m.messages, schema: m.schema, target: JSON.stringify(target), truth, ...extra });
const digits = (s) => String(s).replace(/[,，\s]/g, "");

function assemble() {
  const out = {}, drop = {};
  const put = (k, x) => { (out[k] ||= []).push(x); }, no = (k, why) => { drop[k] ||= {}; drop[k][why] = (drop[k][why] || 0) + 1; };
  for (const split of ["train", "test"]) {
    // qa: kept when the answer cites the clause the question was written for, and is in Traditional Chinese
    const A = answers("qa", split);
    for (const it of R(path.join(ROOT, "gen", "qa", split, "items.jsonl"))) {
      const a = A.get(it.id); if (!a) { no(`qa_${split}`, "no answer"); continue; }
      const cl = (String(a.clause).match(/[A-Z]{2}-\d+\.\d+/) || [""])[0];
      if (cl !== it.clause) { no(`qa_${split}`, "cites another clause"); continue; }
      if (/[A-Z]{2}-\d+\.\d+/.test(a.question)) { no(`qa_${split}`, "the question names the clause"); continue; }
      put(`qa_${split}`, row(it.id, "qa", T.qa(it.product, a.question), { answer: a.answer, clause: cl, covered: a.covered }, { clause: cl, covered: a.covered }, { product: it.product }));
    }
    // story: kept when the story says the amount, the place and every item as given
    const S = answers("story", split);
    for (const it of R(path.join(ROOT, "gen", "story", split, "items.jsonl"))) {
      const a = S.get(it.id); if (!a?.story) { no(`story_${split}`, "no answer"); continue; }
      const s = a.story;
      if (!digits(s).includes(digits(it.truth.amount % 1 ? it.truth.amount.toFixed(2) : String(it.truth.amount)))) { no(`story_${split}`, "amount not said"); continue; }
      if (!s.includes(it.truth.where)) { no(`story_${split}`, "place not said"); continue; }
      if (!it.truth.items.every((x) => s.includes(x))) { no(`story_${split}`, "an item not said"); continue; }
      put(`story_${split}`, row(it.id, "story", T.story(it.product, it.today, s), it.truth, it.truth, { product: it.product, today: it.today, text: s }));
    }
    // dialog: code's value is the label
    const D = answers("dialog", split);
    for (const it of R(path.join(ROOT, "gen", "dialog", split, "items.jsonl"))) {
      const a = D.get(it.id); if (!a?.reply) { no(`dialog_${split}`, "no answer"); continue; }
      if (it.truth.understood && it.qtype === "choice" && new RegExp(`\\b(${PRODUCTS[it.product].questions.find((q) => q.id === it.qid).options.map((o) => o.v).filter((v) => /_/.test(v)).join("|") || "$^"})\\b`).test(a.reply)) { no(`dialog_${split}`, "says the option code"); continue; }
      put(`dialog_${split}`, row(it.id, "dialog", T.dialog(it.product, it.qid, a.reply, it.qtype === "date" ? it.today : null), it.truth, it.truth, { product: it.product, qid: it.qid, qtype: it.qtype }));
    }
    // ocr: the generator's documents, labels exact
    for (const d of R(path.join(here, "ocr", "out_us", `docs_${split}.jsonl`)).slice(0, split === "train" ? 3000 : 300))
      put(`ocr_${split}`, row(d.id, "ocr", T.ocr(d.text), d.fields, d.fields, { kind: d.kind }));
  }
  // injections: an instruction inserted into a story or a document; the target is the clean label
  for (const [split, tpl, seed] of [["train", T.INJECT_TRAIN, 707], ["test", T.INJECT_HELD_OUT, 808]]) {
    const r = rng(seed);
    const src = [...(out[`story_${split}`] || []).slice(0, split === "train" ? 400 : 120), ...(out[`ocr_${split}`] || []).slice(0, split === "train" ? 300 : 80)];
    for (const x of src) {
      const N = pick(r, [99999, 8888, 50000, 123456]), line = pick(r, tpl).replaceAll("{N}", String(N));
      if (x.task === "story") {
        const parts = x.text.split(/(?<=[.!?])\s+/); const at = int(r, 0, parts.length); parts.splice(at, 0, line);
        put(`inject_${split}`, row(`${x.id}-inj`, "story", T.story(x.product, x.today, parts.join(" ")), x.truth, x.truth, { product: x.product, injected: line, N, from: "story" }));
      } else {
        const text = x.messages[1].content, lines = text.split("\n"); lines.splice(int(r, 1, lines.length), 0, line);
        put(`inject_${split}`, row(`${x.id}-inj`, "ocr", T.ocr(lines.join("\n")), x.truth, x.truth, { injected: line, N, from: "ocr" }));
      }
    }
  }
  for (const [k, rows] of Object.entries(out)) W(path.join(ROOT, "sft", `${k}.jsonl`), rows);
  // the teacher column: Glimmer answers the test prompts itself (ocr and inject: a sample of 100 each)
  const jobs = [];
  for (const k of ["qa_test", "story_test", "dialog_test", "ocr_test", "inject_test"]) for (const x of (out[k] || []).slice(0, k.startsWith("ocr") || k.startsWith("inject") ? 100 : 1e9))
    jobs.push({ id: `${k}|${x.id}`, sample: 0, messages: x.messages, schema: x.schema, max_tokens: 500 });
  W(path.join(ROOT, "teacher_eval", "jobs.jsonl"), jobs);
  console.log(JSON.stringify(Object.fromEntries(Object.entries(out).map(([k, v]) => [k, v.length]))), "dropped", JSON.stringify(drop), "teacher_eval jobs", jobs.length);
  fs.writeFileSync(path.join(ROOT, "sft", "counts.json"), JSON.stringify({ kept: Object.fromEntries(Object.entries(out).map(([k, v]) => [k, v.length])), dropped: drop }, null, 1));
}

const step = process.argv[2];
if (step === "gen") { genQA(); genStory(); genDialog(); }
else if (step === "assemble") assemble();
else console.log("node ml/build_1b.mjs gen|assemble");
