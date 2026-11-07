// The facts each piece of evidence carries, before anyone judges it: its bytes' sha256, a photo's EXIF (capture time,
// GPS, camera) and dHash, a receipt's fields. The dHash is computed in JavaScript on any host (imagehash.js); the
// Windows helper (ocr.js) is used for OCR, and for a dHash only when the JPEG is one the JS decoder doesn't read.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { exifOf } from "../exif.js";
import { images, ocrMode } from "../ocr.js";
import { dhashOf } from "../imagehash.js";
import { readReceipt } from "../reader.js";

const resolve = (p) => (p ? path.resolve(p) : null);

export async function facts(evidence, { tz } = {}) {
  const t0 = Date.now();
  const rows = evidence.map((e) => {
    const p = resolve(e.path), exists = !!p && fs.existsSync(p);
    const buf = exists ? fs.readFileSync(p) : null;
    const jh = buf && (e.kind === "photo" || e.kind === "receipt") ? dhashOf(buf) : null;
    return { e, path: p, exists, sha: buf ? crypto.createHash("sha256").update(buf).digest("hex") : null, exif: buf && e.kind === "photo" ? exifOf(buf, { tz }) : null, bytes: buf?.length ?? 0, jh };
  });
  // photos need a dHash unless the browser sent one; receipts need OCR
  const ocrOn = ocrMode() !== "off";
  const want = rows.filter((r) => r.exists && ((r.e.kind === "photo" && !r.jh?.dhash && !/^[0-9a-f]{16}$/.test(r.e.dhash || "") && process.platform === "win32") || (r.e.kind === "receipt" && ocrOn)));
  const seen = want.length ? await images(want.map((r) => ({ path: r.path, ocr: r.e.kind === "receipt" }))) : new Map();
  const out = new Map();
  for (const r of rows) {
    const v = seen.get(r.path) || {};
    const f = { id: r.e.id, kind: r.e.kind, exists: r.exists, sha: r.sha, bytes: r.bytes, exif: r.exif, dhash: r.jh?.dhash || (/^[0-9a-f]{16}$/.test(r.e.dhash || "") ? r.e.dhash : v.dhash || null), dhashBy: r.jh?.dhash ? r.jh.by : r.e.dhash ? "client" : v.dhash ? "windows" : null, imageError: r.jh?.error && !v.dhash && !r.e.dhash ? r.jh.error : v.error || null };
    if (r.e.kind === "receipt") f.receipt = r.exists || r.e.text ? await readReceipt({ ...r.e, path: r.path }, { ocr: v.lines ? v : undefined }) : { error: "no file and no total typed", by: "none" };
    out.set(r.e.id, f);
  }
  return { facts: out, ms: Date.now() - t0 };
}
