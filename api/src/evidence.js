// Evidence files: a pro's photos and receipts, sent as multipart/form-data or as data: URLs in JSON, kept under
// api/data/uploads/<job>/<id>.<ext> (DONE_UPLOADS moves them; tests use a temporary folder). Each file gets its
// SHA-256 (to catch a file reused on another job) and what its camera wrote (EXIF time, zone and GPS, read here
// without a package). Nothing in a file is ever obeyed: its text is data for the checks.
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { stateDir } from "./store.js";

export const MAX_FILE = 8 * 1024 * 1024;
export const KINDS = ["photo", "receipt", "note"];
const MIME = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/heic": "heic", "application/pdf": "pdf", "text/plain": "txt" };
export const uploadsDir = () => process.env.DONE_UPLOADS || (stateDir() ? path.join(stateDir(), "../uploads") : path.join(os.tmpdir(), `done-uploads-${process.pid}`));

export const sniff = (buf) => (buf[0] === 0xff && buf[1] === 0xd8 ? "image/jpeg" : buf.slice(1, 4).toString() === "PNG" ? "image/png" : buf.slice(0, 4).toString() === "RIFF" && buf.slice(8, 12).toString() === "WEBP" ? "image/webp" : buf.slice(0, 4).toString() === "%PDF" ? "application/pdf" : buf.slice(4, 12).toString().startsWith("ftyphei") ? "image/heic" : null);

// data:image/jpeg;base64,...  ->  { mime, buf }
export function fromDataUrl(s) {
  const m = String(s || "").match(/^data:([\w/+.-]+)?(;base64)?,(.*)$/s);
  if (!m) return null;
  const buf = m[2] ? Buffer.from(m[3], "base64") : Buffer.from(decodeURIComponent(m[3]));
  return { mime: m[1] || sniff(buf) || "application/octet-stream", buf };
}

// multipart/form-data: the fields and the files (express.raw hands over the bytes)
export function parseMultipart(buf, contentType) {
  const b = String(contentType || "").match(/boundary=(?:"([^"]+)"|([^;]+))/i);
  if (!b || !Buffer.isBuffer(buf)) return null;
  const sep = Buffer.from(`--${b[1] || b[2]}`), fields = {}, files = [];
  let i = buf.indexOf(sep);
  while (i >= 0) {
    const start = i + sep.length;
    if (buf.slice(start, start + 2).toString() === "--") break;
    const next = buf.indexOf(sep, start);
    if (next < 0) break;
    const part = buf.slice(start + 2, next - 2), h = part.indexOf("\r\n\r\n");
    if (h > 0) {
      const head = part.slice(0, h).toString("utf8"), body = part.slice(h + 4);
      const name = head.match(/name="([^"]*)"/i)?.[1], filename = head.match(/filename="([^"]*)"/i)?.[1], type = head.match(/content-type:\s*([^\r\n;]+)/i)?.[1];
      if (filename !== undefined) files.push({ field: name, filename, mime: type || sniff(body) || "application/octet-stream", buf: body });
      else if (name) fields[name] = body.toString("utf8");
    }
    i = next;
  }
  return { fields, files };
}

// ---- EXIF: DateTimeOriginal, OffsetTimeOriginal and GPS, from a JPEG's APP1 ----------------------------------------
export function exifOf(buf) {
  if (!buf || buf[0] !== 0xff || buf[1] !== 0xd8) return { taken: null, lat: null, lng: null, camera: null };
  let i = 2;
  while (i + 4 < buf.length && buf[i] === 0xff) {
    const marker = buf[i + 1], len = buf.readUInt16BE(i + 2);
    if (marker === 0xe1 && buf.slice(i + 4, i + 10).toString("latin1") === "Exif\0\0") return tiff(buf.slice(i + 10, i + 2 + len));
    if (marker === 0xda) break;
    i += 2 + len;
  }
  return { taken: null, lat: null, lng: null, camera: null };
}
function tiff(t) {
  const out = { taken: null, lat: null, lng: null, camera: null };
  try {
    const le = t.toString("latin1", 0, 2) === "II", u16 = (o) => (le ? t.readUInt16LE(o) : t.readUInt16BE(o)), u32 = (o) => (le ? t.readUInt32LE(o) : t.readUInt32BE(o));
    const str = (e) => { const n = u32(e + 4), off = n > 4 ? u32(e + 8) : e + 8; return t.toString("latin1", off, off + n).replace(/\0+$/, ""); };
    const rat = (off, k) => { const r = []; for (let j = 0; j < k; j++) { const d = u32(off + j * 8 + 4); r.push(d ? u32(off + j * 8) / d : 0); } return r; };
    const ifd = (o, visit) => { if (!o || o + 2 > t.length) return; const n = u16(o); for (let k = 0; k < n; k++) { const e = o + 2 + k * 12; if (e + 12 > t.length) return; visit(u16(e), e); } };
    let exifIfd = null, gpsIfd = null, dt = null, offset = null;
    ifd(u32(4), (tag, e) => { if (tag === 0x8769) exifIfd = u32(e + 8); if (tag === 0x8825) gpsIfd = u32(e + 8); if (tag === 0x0110) out.camera = str(e); if (tag === 0x0132 && !dt) dt = str(e); });
    ifd(exifIfd, (tag, e) => { if (tag === 0x9003) dt = str(e); if (tag === 0x9011) offset = str(e); });
    const g = {};
    ifd(gpsIfd, (tag, e) => { if (tag === 1 || tag === 3) g[tag] = t.toString("latin1", e + 8, e + 9); if (tag === 2 || tag === 4) g[tag] = rat(u32(e + 8), 3); });
    if (g[2] && g[4]) { const dms = (v) => v[0] + v[1] / 60 + v[2] / 3600; out.lat = +(dms(g[2]) * (g[1] === "S" ? -1 : 1)).toFixed(6); out.lng = +(dms(g[4]) * (g[3] === "W" ? -1 : 1)).toFixed(6); }
    const m = dt?.match(/^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})/);
    // a camera keeps local time; without its offset, the photo is read as taken in Austin
    if (m) { const local = `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}`; out.taken = new Date(`${local}${/^[+-]\d{2}:\d{2}$/.test(offset || "") ? offset : austinOffset(local)}`).toISOString(); }
  } catch {}
  return out;
}
// America/Chicago's offset at a local time ("-06:00" or "-05:00")
function austinOffset(local) {
  const guess = new Date(`${local}Z`), parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", timeZoneName: "shortOffset" }).formatToParts(guess);
  const off = parts.find((p) => p.type === "timeZoneName")?.value.match(/GMT([+-]\d+)/)?.[1] || "-6";
  const h = +off;
  return `${h < 0 ? "-" : "+"}${String(Math.abs(h)).padStart(2, "0")}:00`;
}
// (tests and the demo) a JPEG carrying EXIF time, offset and GPS, around any JPEG
export function withExif(jpeg, { taken, offset = "-06:00", lat, lng, make, model } = {}) {
  jpeg = withoutExif(jpeg);
  const le = (n, b = 4) => { const x = Buffer.alloc(b); b === 2 ? x.writeUInt16LE(n) : x.writeUInt32LE(n); return x; };
  const ifdBlock = (list, base) => {
    // returns { head, data } with offsets relative to the TIFF start
    const headLen = 2 + list.length * 12 + 4;
    let dataOff = base + headLen; const head = [le(list.length, 2)], data = [];
    for (const [tag, type, count, val] of list) {
      head.push(le(tag, 2), le(type, 2), le(count));
      if (val.length <= 4) head.push(Buffer.concat([val, Buffer.alloc(4 - val.length)]));
      else { head.push(le(dataOff)); data.push(val); dataOff += val.length; }
    }
    head.push(le(0));
    return Buffer.concat([...head, ...data]);
  };
  const ascii = (s) => Buffer.from(`${s}\0`, "latin1");
  const rationals = (v) => Buffer.concat(v.flatMap((x) => [le(Math.round(x * 1e4)), le(1e4)]));
  const dms = (d) => { const a = Math.abs(d), deg = Math.floor(a), min = Math.floor((a - deg) * 60), sec = ((a - deg) * 60 - min) * 60; return [deg, min, sec]; };
  const local = taken ? new Date(Date.parse(taken) + (offset.startsWith("-") ? -1 : 1) * (+offset.slice(1, 3) * 60 + +offset.slice(4, 6)) * 60e3).toISOString().slice(0, 19).replace("T", " ").replace(/-/g, ":") : null;
  // IFD0 at 8: the camera's make and model (when given), then the ExifIFD and GPS pointers
  const cam = [make && [0x010f, 2, Buffer.byteLength(`${make}\0`, "latin1"), ascii(make)], model && [0x0110, 2, Buffer.byteLength(`${model}\0`, "latin1"), ascii(model)]].filter(Boolean);
  const ifd0Len = ifdBlock([...cam, [0x8769, 4, 1, le(0)], [0x8825, 4, 1, le(0)]], 8).length, exifStart = 8 + ifd0Len;
  const exifList = local ? [[0x9003, 2, 20, ascii(local)], [0x9011, 2, 7, ascii(offset)]] : [];
  const exifBlock = ifdBlock(exifList, exifStart), gpsStart = exifStart + exifBlock.length;
  const gpsList = lat != null ? [[1, 2, 2, ascii(lat < 0 ? "S" : "N")], [2, 5, 3, rationals(dms(lat))], [3, 2, 2, ascii(lng < 0 ? "W" : "E")], [4, 5, 3, rationals(dms(lng))]] : [];
  const gpsBlock = ifdBlock(gpsList, gpsStart);
  const ifd0 = ifdBlock([...cam, [0x8769, 4, 1, le(exifStart)], [0x8825, 4, 1, le(gpsStart)]], 8);
  const tiffBuf = Buffer.concat([Buffer.from("II"), le(42, 2), le(8), ifd0, exifBlock, gpsBlock]);
  const app1 = Buffer.concat([Buffer.from([0xff, 0xe1]), Buffer.from([(tiffBuf.length + 8) >> 8, (tiffBuf.length + 8) & 255]), Buffer.from("Exif\0\0", "latin1"), tiffBuf]);
  return Buffer.concat([jpeg.slice(0, 2), app1, jpeg.slice(2)]);
}
// a JPEG with its Exif APP1 segments taken out (the demo's real photos are re-dated with withExif, which writes its own)
export function withoutExif(jpeg) {
  if (jpeg[0] !== 0xff || jpeg[1] !== 0xd8) return jpeg;
  const parts = [jpeg.slice(0, 2)];
  let i = 2;
  while (i + 4 <= jpeg.length && jpeg[i] === 0xff) {
    const m = jpeg[i + 1];
    if (m === 0xda) break; // start of scan: the rest is image data
    const len = jpeg.readUInt16BE(i + 2), seg = jpeg.slice(i, i + 2 + len);
    if (!(m === 0xe1 && seg.slice(4, 10).toString("latin1") === "Exif\0\0")) parts.push(seg);
    i += 2 + len;
  }
  parts.push(jpeg.slice(i));
  return Buffer.concat(parts);
}
// the smallest JPEG there is (a 1x1 grey pixel), for tests and the demo's synthetic photos
export const TINY_JPEG = Buffer.from("/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAAIAAgDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD5/ooooA//2Q==", "base64");

// keep one file; returns the evidence item (path is absolute on this server; the API shows a URL instead)
export function saveFile(jobId, { buf, mime, kind, name, text, checkId, uploadedAt }) {
  if (!KINDS.includes(kind)) return { error: "kind", message: `kind is one of ${KINDS.join(", ")}` };
  if (kind === "note") return { id: `ev_${crypto.randomBytes(5).toString("hex")}`, kind, path: null, name: name ? String(name).slice(0, 80) : "note", text: String(text || "").slice(0, 4000), checkId: checkId || null, uploadedAt, sha: null, size: 0, mime: "text/plain", exif: null };
  if (!buf?.length) return { error: "file", message: "The file is empty." };
  if (buf.length > MAX_FILE) return { error: "too_large", message: `A file is at most ${MAX_FILE / 1024 / 1024} MB.` };
  const real = sniff(buf) || mime;
  if (real === "image/heic") return { error: "type", message: "HEIC photos can't be checked here: send JPEG (on iPhone: Settings > Camera > Formats > Most Compatible, or share as JPEG)." };
  if (!MIME[real] || real === "text/plain") return { error: "type", message: "Send a JPEG, PNG or WebP photo, or a PDF." };
  const id = `ev_${crypto.randomBytes(5).toString("hex")}`, dir = path.join(uploadsDir(), jobId);
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${id}.${MIME[real]}`);
  fs.writeFileSync(file, buf);
  return { id, kind, path: file, name: name ? String(name).slice(0, 80) : `${kind}.${MIME[real]}`, text: text ? String(text).slice(0, 4000) : undefined, checkId: checkId || null, uploadedAt,
    sha: crypto.createHash("sha256").update(buf).digest("hex"), size: buf.length, mime: real, exif: real === "image/jpeg" ? exifOf(buf) : null };
}
export const readFile = (e) => { try { return e?.path ? fs.readFileSync(e.path) : null; } catch { return null; } };
