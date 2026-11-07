// What works on any host (Linux included): the image hash in plain JavaScript, Done-OCR over HTTP, and the typed
// fallback. DONE_IMAGE_HELPER=off makes this Windows machine behave like a Linux host (no PowerShell helper).
import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { dhashOf, hashGrid } from "../src/imagehash.js";
import { hamming } from "../src/exif.js";
import { images, ocrMode } from "../src/ocr.js";
import { readReceipt, setReader } from "../src/reader.js";
import { checkEvidence } from "../src/check/index.js";
import { clearPhotoRows } from "../src/check/history.js";
import { rulesScope } from "../src/scope.js";
import { setChat } from "../src/llm.js";
import { setVlm } from "../src/vlm.js";

const D = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures", "evidence");
const FX = JSON.parse(fs.readFileSync(path.join(D, "fixtures.json"), "utf8"));
const h = (f) => dhashOf(fs.readFileSync(path.join(D, f)));
let saved;
beforeEach(() => { saved = { ...process.env }; process.env.DONE_IMAGE_HELPER = "off"; delete process.env.DONE_OCR_URL; delete process.env.DONE_OCR; setReader(null); setChat(null); setVlm(null); clearPhotoRows(); });
afterEach(() => { for (const k of ["DONE_IMAGE_HELPER", "DONE_OCR_URL", "DONE_OCR"]) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; } });

test("dHash in plain JavaScript: JPEG (baseline, as phones and System.Drawing write it) and PNG; a resized copy is close, other photos far", () => {
  const a = h("earlier_job.jpg"), b = h("reused.jpg"), c = h("before.jpg"), d = h("new_part.jpg");
  for (const x of [a, b, c, d]) { assert.match(x.dhash, /^[0-9a-f]{16}$/); assert.equal(x.by, "js-jpeg-dc"); }
  assert.ok(hamming(a.dhash, b.dhash) <= 6, `resized copy: ${hamming(a.dhash, b.dhash)} bits`);
  assert.ok(hamming(c.dhash, d.dhash) > 12, `different photos: ${hamming(c.dhash, d.dhash)} bits`);
  assert.equal(c.w, 960); assert.equal(c.h, 720);
  const p = h("screenshot.png"), pal = h("palette.png");
  assert.equal(p.by, "js-png"); assert.equal(pal.by, "js-png"); assert.ok(hamming(pal.dhash, c.dhash) <= 8, "a palette PNG of the same photo is close");
  const g = h("make-assets/r-11-05-2026.jpg"); assert.match(g.dhash, /^[0-9a-f]{16}$/, "System.Drawing's JPEGs (the demo assets) decode");
  assert.match(h("progressive.jpg").error, /progressive/, "progressive JPEGs are reported, not guessed");
  assert.equal(hashGrid(new Float64Array(81).fill(5), 9, 9), "0000000000000000", "a flat picture hashes to ties (0)");
});

test("without the Windows helper: reuse is still caught by the JS hash; OCR says it isn't available", async () => {
  assert.equal(ocrMode(), "off");
  const m = await images([{ path: path.join(D, "reused.jpg") }, { path: path.join(D, "receipt_valve.jpg"), ocr: true }]);
  assert.equal(m.get(path.join(D, "reused.jpg")).dhashBy, "js-jpeg-dc");
  assert.match(m.get(path.join(D, "receipt_valve.jpg")).error, /no OCR on this host/);
  const scope = rulesScope({ text: "leaky faucet", now: Date.parse("2026-11-04T18:00:00Z") });
  const p = (id, f, checkId) => ({ id, kind: "photo", path: path.join(D, f), uploadedAt: "2026-11-05T18:00:00Z", checkId });
  await checkEvidence({ ...FX.job, id: "job_old", scope }, [p("o1", "earlier_job.jpg", "no_drip")], { model: false });
  const r = await checkEvidence({ ...FX.job, id: "job_new", scope }, [p("n1", "reused.jpg", "no_drip")], { model: false, remember: false });
  assert.ok(r.checks.find((c) => c.id === "no_drip").signals.some((s) => /photo_reused: n1 ~ job_old\/o1 \(same_picture/.test(s)));
});

test("Done-OCR over HTTP (DONE_OCR_URL) reads receipts on any host, labelled; down or absent -> the typed total, labelled", async () => {
  const got = [];
  const srv = http.createServer((req, res) => { let b = ""; req.on("data", (d) => { b += d; }); req.on("end", () => { got.push(JSON.parse(b)); res.writeHead(200, { "Content-Type": "application/json" }); res.end(JSON.stringify({ version: "done2", confidence: 0.93, lines: ["DEMO HARDWARE", "11/05/2026", "Faucet cartridge $8.47", "SUBTOTAL $8.47", "TAX 8.25% $0.70", "TOTAL $9.17"] })); }); });
  await new Promise((ok) => srv.listen(0, "127.0.0.1", ok));
  try {
    process.env.DONE_OCR_URL = `http://127.0.0.1:${srv.address().port}`;
    assert.equal(ocrMode(), "done-ocr");
    const r = await readReceipt({ path: path.join(D, "receipt_short.jpg") });
    assert.equal(r.total, 917); assert.equal(r.date, "2026-11-05"); assert.equal(r.by, "done-ocr (done2)");
    assert.ok(got[0].image.length > 1000, "the image goes as base64");
    srv.closeAllConnections?.(); srv.close();
    process.env.DONE_OCR_URL = "http://127.0.0.1:9";
    const t = await readReceipt({ path: path.join(D, "receipt_short.jpg"), text: "total $12.41" });
    assert.equal(t.by, "typed"); assert.equal(t.total, 1241); assert.match(t.tried.join(" "), /done-ocr/);
  } finally { srv.close(); }
  delete process.env.DONE_OCR_URL;
  const n = await readReceipt({ path: path.join(D, "receipt_short.jpg") });
  assert.equal(n.by, "none"); assert.match(n.error, /no OCR on this host/);
});
