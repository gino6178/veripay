// A 64-bit difference hash (dHash) of a JPEG or PNG in plain JavaScript, so photo and receipt reuse is caught on any
// host (the PowerShell/System.Drawing helper in ocr-win.ps1 is Windows only). No dependency.
//   dhashOf(buf) -> { dhash: "16 hex digits", by: "js-jpeg-dc" | "js-png", w, h } | { error }
// JPEG: baseline and extended-sequential Huffman (what phones and cameras write) are decoded to the DC coefficient of
// every 8x8 luma block, i.e. the picture at 1/8 scale, which is all a 9x8 hash needs. Progressive and arithmetic-coded
// JPEGs return { error } (the caller falls back to the Windows helper, or reports the hash as unavailable).
// PNG: 8- and 16-bit grey, grey+alpha, RGB, RGBA and palette, not interlaced.
// Then: area-average the luma down to 9x8, and each bit says whether a pixel is brighter than its right neighbour
// (row by row, the same order as the browser's and the PowerShell helper's).
import zlib from "node:zlib";

export function dhashOf(buf) {
  try {
    if (!Buffer.isBuffer(buf) || buf.length < 8) return { error: "not an image" };
    if (buf[0] === 0xff && buf[1] === 0xd8) { const g = jpegLumaDC(buf); return g.error ? g : { dhash: hashGrid(g.data, g.w, g.h), by: "js-jpeg-dc", w: g.imgW, h: g.imgH }; }
    if (buf.toString("latin1", 1, 4) === "PNG") { const g = pngLuma(buf); return g.error ? g : { dhash: hashGrid(g.data, g.w, g.h), by: "js-png", w: g.w, h: g.h }; }
    return { error: "not a JPEG or PNG" };
  } catch (e) { return { error: `could not decode: ${String(e.message || e).slice(0, 80)}` }; }
}

// area-average a grey grid to 9x8, then compare neighbours
export function hashGrid(data, w, h) {
  const W = 9, H = 8, out = new Float64Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const x0 = (x * w) / W, x1 = ((x + 1) * w) / W, y0 = (y * h) / H, y1 = ((y + 1) * h) / H;
    let sum = 0, area = 0;
    for (let yy = Math.floor(y0); yy < Math.ceil(y1); yy++) {
      const wy = Math.min(yy + 1, y1) - Math.max(yy, y0);
      if (wy <= 0) continue;
      for (let xx = Math.floor(x0); xx < Math.ceil(x1); xx++) {
        const wx = Math.min(xx + 1, x1) - Math.max(xx, x0);
        if (wx <= 0) continue;
        sum += data[Math.min(h - 1, yy) * w + Math.min(w - 1, xx)] * wx * wy; area += wx * wy;
      }
    }
    out[y * W + x] = area ? Math.round(sum / area) : 0; // whole grey levels, as a canvas or an image library gives them: a flat area makes ties (0), not noise
  }
  let v = 0n;
  for (let y = 0; y < H; y++) for (let x = 0; x < 8; x++) v = (v << 1n) | (out[y * W + x] > out[y * W + x + 1] ? 1n : 0n);
  return v.toString(16).padStart(16, "0");
}

// ---- JPEG: the DC coefficient of each luma block -------------------------------------------------------------------------
function jpegLumaDC(b) {
  let i = 2, frame = null, restart = 0;
  const qt = [], dc = [], ac = [];
  while (i + 4 <= b.length) {
    if (b[i] !== 0xff) { i++; continue; }
    const m = b[i + 1];
    if (m === 0xd8 || (m >= 0xd0 && m <= 0xd7) || m === 0x01 || m === 0xff) { i += m === 0xff ? 1 : 2; continue; }
    if (m === 0xd9) break;
    const len = b.readUInt16BE(i + 2), seg = b.subarray(i + 4, i + 2 + len);
    if (m === 0xdb) { // DQT
      for (let p = 0; p < seg.length;) { const pq = seg[p] >> 4, tq = seg[p] & 15; p++; qt[tq] = pq ? seg.readUInt16BE(p) : seg[p]; p += pq ? 128 : 64; } // only the DC entry (first in zigzag) is kept
    } else if (m === 0xc4) { // DHT
      for (let p = 0; p < seg.length;) {
        const tc = seg[p] >> 4, th = seg[p] & 15, counts = seg.subarray(p + 1, p + 17); p += 17;
        const n = counts.reduce((a, x) => a + x, 0), vals = seg.subarray(p, p + n); p += n;
        (tc ? ac : dc)[th] = huff(counts, vals);
      }
    } else if (m === 0xc0 || m === 0xc1) { // SOF0/SOF1
      const h = seg.readUInt16BE(1), w = seg.readUInt16BE(3), nc = seg[5], comps = [];
      for (let k = 0; k < nc; k++) comps.push({ id: seg[6 + k * 3], h: seg[7 + k * 3] >> 4, v: seg[7 + k * 3] & 15, tq: seg[8 + k * 3] });
      frame = { w, h, comps };
    } else if (m === 0xc2 || m === 0xc3 || (m >= 0xc5 && m <= 0xcf && m !== 0xc8 && m !== 0xcc)) {
      return { error: "progressive or arithmetic JPEG" };
    } else if (m === 0xdd) restart = seg.readUInt16BE(0);
    else if (m === 0xda) { // SOS: entropy-coded data follows
      if (!frame) return { error: "no frame header" };
      const ns = seg[0], sc = [];
      for (let k = 0; k < ns; k++) sc.push({ id: seg[1 + k * 2], td: seg[2 + k * 2] >> 4, ta: seg[2 + k * 2] & 15 });
      return scan(b, i + 2 + len, frame, sc, qt, dc, ac, restart);
    }
    i += 2 + len;
  }
  return { error: "no image data" };
}
function huff(counts, vals) {
  // canonical Huffman: a map from (length, code) to value
  const map = new Map(); let code = 0, k = 0;
  for (let len = 1; len <= 16; len++) { for (let j = 0; j < counts[len - 1]; j++) map.set((len << 16) | code++, vals[k++]); code <<= 1; }
  return map;
}
function scan(b, start, frame, sc, qt, dct, act, restart) {
  const comps = sc.map((s) => ({ ...frame.comps.find((c) => c.id === s.id), ...s }));
  const hmax = Math.max(...frame.comps.map((c) => c.h)), vmax = Math.max(...frame.comps.map((c) => c.v));
  const mcuW = 8 * hmax, mcuH = 8 * vmax, mcusX = Math.ceil(frame.w / mcuW), mcusY = Math.ceil(frame.h / mcuH);
  const y0 = comps[0], bw = mcusX * y0.h, bh = mcusY * y0.v, grid = new Float64Array(bw * bh);
  let pos = start, bit = 0, cur = 0;
  const readBit = () => {
    if (bit === 0) {
      if (pos >= b.length) throw new Error("data ended");
      cur = b[pos++];
      if (cur === 0xff) { const nx = b[pos]; if (nx === 0) pos++; else if (nx >= 0xd0 && nx <= 0xd7) { /* a restart marker where data was expected */ } }
      bit = 8;
    }
    bit--; return (cur >> bit) & 1;
  };
  const decode = (map) => { let code = 0; for (let len = 1; len <= 16; len++) { code = (code << 1) | readBit(); const v = map.get((len << 16) | code); if (v !== undefined) return v; } throw new Error("bad Huffman code"); };
  const receive = (s) => { let v = 0; for (let k = 0; k < s; k++) v = (v << 1) | readBit(); return v < 1 << (s - 1) ? v - (1 << s) + 1 : v; };
  const pred = comps.map(() => 0);
  const q0 = qt[y0.tq] || 1;
  const total = mcusX * mcusY;
  for (let n = 0; n < total; n++) {
    if (restart && n > 0 && n % restart === 0) {
      bit = 0; // align, then step over RSTn
      while (pos + 1 < b.length && !(b[pos] === 0xff && b[pos + 1] >= 0xd0 && b[pos + 1] <= 0xd7)) pos++;
      pos += 2; pred.fill(0);
    }
    const mx = n % mcusX, my = Math.floor(n / mcusX);
    comps.forEach((c, ci) => {
      for (let by = 0; by < c.v; by++) for (let bx = 0; bx < c.h; bx++) {
        const s = decode(dct[c.td]); pred[ci] += s ? receive(s) : 0;
        for (let k = 1; k < 64;) { // skip the AC coefficients
          const rs = decode(act[c.ta]), r = rs >> 4, sz = rs & 15;
          if (sz === 0) { if (r === 15) { k += 16; continue; } break; }
          k += r; receive(sz); k++;
        }
        if (ci === 0) grid[(my * c.v + by) * bw + (mx * c.h + bx)] = (pred[ci] * q0) / 8 + 128;
      }
    });
  }
  // crop to the picture (blocks past the edge are padding)
  const w = Math.max(1, Math.ceil(frame.w / (8 * hmax / y0.h))), h = Math.max(1, Math.ceil(frame.h / (8 * vmax / y0.v)));
  const out = new Float64Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) out[y * w + x] = grid[y * bw + x];
  return { data: out, w, h, imgW: frame.w, imgH: frame.h };
}

// ---- PNG -----------------------------------------------------------------------------------------------------------------
function pngLuma(b) {
  let p = 8, w = 0, h = 0, depth = 8, ctype = 0, interlace = 0, palette = null;
  const idat = [];
  while (p + 8 <= b.length) {
    const len = b.readUInt32BE(p), type = b.toString("latin1", p + 4, p + 8), d = b.subarray(p + 8, p + 8 + len);
    if (type === "IHDR") { w = d.readUInt32BE(0); h = d.readUInt32BE(4); depth = d[8]; ctype = d[9]; interlace = d[12]; }
    else if (type === "PLTE") palette = d;
    else if (type === "IDAT") idat.push(d);
    else if (type === "IEND") break;
    p += 12 + len;
  }
  if (interlace) return { error: "interlaced PNG" };
  if (![8, 16].includes(depth)) return { error: `PNG bit depth ${depth}` };
  const ch = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[ctype];
  if (!ch) return { error: "PNG colour type" };
  const bpp = (ch * depth) / 8, stride = w * bpp, raw = zlib.inflateSync(Buffer.concat(idat)), px = Buffer.alloc(stride * h);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)], line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)), out = px.subarray(y * stride, (y + 1) * stride), prev = y ? px.subarray((y - 1) * stride, y * stride) : null;
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? out[x - bpp] : 0, up = prev ? prev[x] : 0, c = prev && x >= bpp ? prev[x - bpp] : 0;
      let v = line[x];
      if (f === 1) v += a; else if (f === 2) v += up; else if (f === 3) v += (a + up) >> 1;
      else if (f === 4) { const pp = a + up - c, pa = Math.abs(pp - a), pb = Math.abs(pp - up), pc = Math.abs(pp - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? up : c; }
      out[x] = v & 255;
    }
  }
  const data = new Float64Array(w * h), s = depth / 8;
  for (let i = 0; i < w * h; i++) {
    const o = i * bpp, g = (k) => px[o + k * s];
    let r, gg, bb;
    if (ctype === 3) { const k = px[o] * 3; r = palette[k]; gg = palette[k + 1]; bb = palette[k + 2]; }
    else if (ch <= 2) r = gg = bb = g(0);
    else { r = g(0); gg = g(1); bb = g(2); }
    data[i] = 0.299 * r + 0.587 * gg + 0.114 * bb;
  }
  return { data, w, h };
}
