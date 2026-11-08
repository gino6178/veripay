// Film v7 (docs/VIDEO-分鏡-v7.md): v5's pictures played back 1.5x with the voice 1.5x (public/audio/vo9, src/vo9-timings.json),
// the pain animation after the cover, and four new shots for the judging criteria (impact, novel, features, product).
// A "v5" segment plays its shot out of out/v5-picture.mp4 (v5 rendered picture-only) at `rate`; a shot whose new voice
// is longer than its sped-up picture plays a little slower so the voice fits. The cover and end card play at 1x.
import VO9 from '../vo9-timings.json';
import { S5 } from '../v5/timeline5';

export const FPS = 30;
export const SPEED = 1.25; // v5 pictures and voice both play this much faster (vo/make-vo9.mjs: SPEED=1.25)
type Line = { text: string; start: number; end: number };
const VO = VO9 as Record<string, Line[]>;
const voEnd = (id: string) => VO[id]?.at(-1)?.end ?? 0;

// a stretch plays v5 source frames [from, to) of the shot over `sec` seconds (a slow look at one screen); the voice
// lines from `voSplit` on wait until the stretch has played
type Stretch = { from: number; to: number; sec: number; voSplit: number };
type Plan =
  | { id: string; label: string; kind: 'v5'; src: string; voLead: number; rate?: number; vo?: string; stretch?: Stretch }
  | { id: string; label: string; kind: 'new'; voLead: number; tail: number; vo?: string; minDur?: number }
  | { id: string; label: string; kind: 'pain' };
const PLAN: Plan[] = [
  { id: 'cover', label: 'Cover', kind: 'v5', src: 'cover', voLead: 0, rate: 1 },
  { id: 'pain', label: '1 Pain animation', kind: 'pain' },
  { id: 'impact', label: '2 Impact in numbers', kind: 'new', voLead: 0.5, tail: 0.8, vo: 'impact' },
  { id: 'solution', label: '2a Solution + who it is for', kind: 'v5', src: 'solution', voLead: 0.8, vo: 'solution' },
  { id: 'ask', label: '3 Her words → work order', kind: 'v5', src: 'ask', voLead: 0.6, vo: 'ask' },
  { id: 'find', label: '3b Find, reviews, bargain', kind: 'v5', src: 'find', voLead: 0.5, vo: 'find' },
  { id: 'chat', label: '4b In a chat', kind: 'v5', src: 'chat', voLead: 0.6, vo: 'chat' },
  { id: 'offers', label: '4 Offers, mandate', kind: 'v5', src: 'offers', voLead: 0.5, vo: 'offers' },
  { id: 'hold', label: '5 Hold + change order + PIN', kind: 'v5', src: 'hold', voLead: 0.5, vo: 'hold' },
  { id: 'phone', label: "6 The pro's phone", kind: 'v5', src: 'phone', voLead: 0.8, vo: 'phone' },
  { id: 'checks', label: '7 AI checks + injection', kind: 'v5', src: 'checks', voLead: 1.5, vo: 'checks' },
  { id: 'paid', label: '8 Paid', kind: 'v5', src: 'paid', voLead: 1.0, vo: 'paid' },
  { id: 'novel', label: '8a What is new', kind: 'new', voLead: 0.5, tail: 0.9, vo: 'novel' },
  { id: 'arch', label: '9 Architecture', kind: 'v5', src: 'arch', voLead: 0.8, vo: 'arch' },
  { id: 'models', label: '10 Model design', kind: 'v5', src: 'models', voLead: 0.6, vo: 'models' },
  { id: 'hood', label: '11 Under the hood: PayPal', kind: 'v5', src: 'hood', voLead: 0.6, vo: 'hood' },
  { id: 'features', label: '11a 219 PayPal features', kind: 'new', voLead: 0.5, tail: 1.0, vo: 'features' },
  { id: 'scale', label: '12 Scale + back office + tests', kind: 'v5', src: 'scale', voLead: 0.5, vo: 'scale', stretch: { from: 105, to: 140, sec: 4, voSplit: 1 } },
  { id: 'product', label: '12a A complete product', kind: 'new', voLead: 0.4, tail: 0.9, vo: 'product', minDur: 9.0 },
  { id: 'vision', label: '12b Next, our vision', kind: 'v5', src: 'vision', voLead: 0.6, vo: 'vision' },
  { id: 'end', label: '13 End card', kind: 'v5', src: 'end', voLead: 0.9, rate: 0.72, vo: 'end' },
];
export const PAIN_FRAMES = 402; // out/pain15-a5-1.5x.mp4, 13.385 s at 24 fps
export const PAIN_VO = [{ id: 'pain1', at: 0.6 }, { id: 'pain2', at: 7.0 }];

let at = 0;
export const SHOTS7 = PLAN.map((p) => {
  const from = at;
  let duration = 0, rate = 1, srcFrom = 0, srcDur = 0, voFrom: number | null = null;
  let seg: { a: number; b: number; from: number; to: number } | null = null, voDelay = 0, voSplit = 0;
  let vo = 'vo' in p && p.vo ? VO[p.vo] : null;
  if (p.kind === 'pain') duration = PAIN_FRAMES;
  else if (p.kind === 'new') {
    duration = Math.round(Math.max(p.minDur ?? 0, p.voLead + voEnd(p.vo!) + p.tail) * FPS);
    voFrom = from + Math.round(p.voLead * FPS);
  } else {
    const s = S5[p.src]; srcFrom = s.from; srcDur = s.duration;
    rate = p.rate ?? SPEED;
    const st = p.stretch;
    const extra = st ? Math.round(st.sec * FPS) - Math.round((st.to - st.from) / rate) : 0;
    duration = Math.round(srcDur / rate) + extra;
    // the voice starts where it started in v5's picture (scaled), and the shot keeps 0.5 s after it
    if (p.vo) {
      const need = Math.round((p.voLead / rate + voEnd(p.vo) + 0.5) * FPS) + extra;
      if (need > duration) { duration = need; rate = srcDur / (duration - extra); }
      voFrom = from + Math.round((p.voLead / rate) * FPS);
    }
    if (st) {
      seg = { a: Math.round(st.from / rate), b: Math.round(st.sec * FPS), from: st.from, to: st.to };
      // the lines after the split start 0.2 s after the stretch ends
      const lead = voFrom! - from, at2 = lead + Math.round(vo![st.voSplit].start * FPS);
      voDelay = Math.max(0, seg.a + seg.b + 6 - at2); voSplit = st.voSplit;
      vo = vo!.map((l, i) => (i < voSplit ? l : { ...l, start: l.start + voDelay / FPS, end: l.end + voDelay / FPS }));
    }
  }
  at += duration;
  return { ...p, from, duration, rate, srcFrom, srcDur, voFrom, vo, seg, voDelay, voSplit, voFile: 'vo' in p && p.vo ? `audio/vo9/${p.vo}.wav` : null };
});
type Shot = (typeof SHOTS7)[number];
// a v7 shot's local frame → the v5 source frame (from the shot's start) on screen
export const srcAt = (s: Shot, f: number) => {
  const g = s.seg;
  if (!g || f < g.a) return f * s.rate;
  if (f < g.a + g.b) return g.from + ((f - g.a) * (g.to - g.from)) / g.b;
  return g.to + (f - g.a - g.b) * s.rate;
};
export const TOTAL7 = at;
export const S7 = Object.fromEntries(SHOTS7.map((s) => [s.id, s])) as Record<string, (typeof SHOTS7)[number]>;

// a v5 frame (global, in v5's timeline) → the v7 frame where that picture now plays; null if that v5 shot isn't in v7
export const fromV5 = (f5: number) => {
  const s = SHOTS7.find((x) => x.kind === 'v5' && f5 >= x.srcFrom && f5 < x.srcFrom + x.srcDur);
  if (!s) return null;
  const x = f5 - s.srcFrom, g = s.seg;
  if (!g || x < g.from) return s.from + Math.round(x / s.rate);
  if (x < g.to) return s.from + g.a + Math.round(((x - g.from) * g.b) / (g.to - g.from));
  return s.from + g.a + g.b + Math.round((x - g.to) / s.rate);
};

// captions: one per sentence (a short sentence ending in ":" or ";" joins the next), from the voice timings
const group = (v: Line[]) => {
  const g: Line[] = [];
  for (const x of v) { const l = g[g.length - 1]; if (l && /[:;]$/.test(l.text) && l.end - l.start < 2.6) { l.text += ' ' + x.text; l.end = x.end; } else g.push({ ...x }); }
  return g;
};
// one line each: a long sentence is cut at commas or between words into pieces of at most MAXC characters, timed by length
const MAXC = 58;
const pieces = (t: string) => {
  const out: string[] = [];
  let rest = t;
  while (rest.length > MAXC) {
    const n = Math.ceil(rest.length / Math.ceil(rest.length / MAXC)); // even pieces
    const win = rest.slice(0, MAXC + 1);
    let cut = -1;
    for (const re of [/[,;:—] /g, / /g]) { let m; while ((m = re.exec(win))) if (m.index + 1 <= MAXC && Math.abs(m.index - n) < Math.abs(cut - n)) cut = m.index + 1; if (cut > n * 0.6) break; }
    if (cut < 1) cut = rest.lastIndexOf(' ', MAXC);
    out.push(rest.slice(0, cut).trim()); rest = rest.slice(cut).trim();
  }
  out.push(rest);
  return out;
};
const split = (g: Line[]) => g.flatMap((x) => {
  const ps = pieces(x.text), total = ps.reduce((a, p) => a + p.length, 0);
  let t = x.start;
  return ps.map((p) => { const d = ((x.end - x.start) * p.length) / total; const r = { text: p, start: t, end: t + d }; t += d; return r; });
});
const captionsOf = (voFrom: number, lines: Line[], endBy: number) => {
  const g = split(group(lines));
  return g.map((x, k) => {
    const from = voFrom + Math.round(x.start * FPS), next = g[k + 1];
    const to = next ? voFrom + Math.round(next.start * FPS) : Math.min(endBy, voFrom + Math.round(x.end * FPS) + 14);
    return { text: x.text, from, duration: Math.max(18, to - from) };
  });
};
export const CAPTIONS7 = [
  ...PAIN_VO.flatMap((p, i) => captionsOf(S7.pain.from + Math.round(p.at * FPS), VO[p.id], S7.pain.from + (i ? PAIN_FRAMES - 4 : Math.round(6.7 * FPS)))),
  ...SHOTS7.filter((s) => s.vo && s.voFrom != null && s.id !== 'end').flatMap((s) => captionsOf(s.voFrom!, s.vo!, s.from + s.duration - 4)),
];
// every frame where a voice is speaking (the music ducks under it)
export const VOICE_SPANS = [
  ...PAIN_VO.map((p) => [S7.pain.from + Math.round(p.at * FPS), S7.pain.from + Math.round((p.at + (VO[p.id].at(-1)?.end ?? 0)) * FPS)]),
  ...SHOTS7.filter((s) => s.vo && s.voFrom != null).flatMap((s) => {
    const span = (ls: Line[]) => [s.voFrom! + Math.round(ls[0].start * FPS), s.voFrom! + Math.round(ls.at(-1)!.end * FPS)];
    return s.voDelay ? [span(s.vo!.slice(0, s.voSplit)), span(s.vo!.slice(s.voSplit))] : [span(s.vo!)];
  }),
] as [number, number][];
