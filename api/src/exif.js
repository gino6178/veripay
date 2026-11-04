// What a photo says about itself: when it was taken (EXIF DateTimeOriginal) and on what camera, read straight from a
// JPEG's APP1 segment, no package needed. A claim photo taken before the event it shows is a fraud signal (fraud.js).
// PNGs and screenshots carry no such date, which is itself worth knowing: a screenshot of a photo proves less.
export function exifOf(buf) {
  if (!buf || buf[0] !== 0xff || buf[1] !== 0xd8) return { kind: buf?.slice(1, 4).toString() === "PNG" ? "png" : "other", taken: null };
  let i = 2;
  while (i + 4 < buf.length && buf[i] === 0xff) {
    const marker = buf[i + 1], len = buf.readUInt16BE(i + 2);
    if (marker === 0xe1 && buf.slice(i + 4, i + 10).toString("latin1") === "Exif\0\0") return { kind: "jpeg", ...tiff(buf.slice(i + 10, i + 2 + len)) };
    if (marker === 0xda) break;
    i += 2 + len;
  }
  return { kind: "jpeg", taken: null };
}
function tiff(t) {
  const le = t.toString("latin1", 0, 2) === "II", u16 = (o) => (le ? t.readUInt16LE(o) : t.readUInt16BE(o)), u32 = (o) => (le ? t.readUInt32LE(o) : t.readUInt32BE(o));
  const out = { taken: null, camera: null };
  const str = (e) => { const n = u32(e + 4), off = n > 4 ? u32(e + 8) : e + 8; return t.toString("latin1", off, off + n).replace(/\0+$/, ""); };
  const ifd = (o, visit) => { if (o + 2 > t.length) return; const n = u16(o); for (let k = 0; k < n; k++) { const e = o + 2 + k * 12; if (e + 12 > t.length) return; visit(u16(e), e); } };
  let exifIfd = null;
  try {
    ifd(u32(4), (tag, e) => { if (tag === 0x8769) exifIfd = u32(e + 8); if (tag === 0x0110) out.camera = str(e); if (tag === 0x0132 && !out.taken) out.taken = str(e); });
    if (exifIfd) ifd(exifIfd, (tag, e) => { if (tag === 0x9003) out.taken = str(e); });
  } catch {}
  // "2026:11:03 21:14:05" -> ISO, read as Taiwan time (cameras keep local time with no zone)
  if (out.taken) { const m = out.taken.match(/^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})/); out.taken = m ? `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}+08:00` : null; }
  return out;
}
// A difference hash of an image someone's browser computed (9x8 greyscale, 64 bits as 16 hex digits): two photos of
// the same picture are a few bits apart even after resizing or recompressing.
export const hamming = (a, b) => { if (!/^[0-9a-f]{16}$/.test(a || "") || !/^[0-9a-f]{16}$/.test(b || "")) return 64; let x = BigInt(`0x${a}`) ^ BigInt(`0x${b}`), n = 0; while (x) { n += Number(x & 1n); x >>= 1n; } return n; };
