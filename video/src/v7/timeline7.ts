// Film v7 (docs/VIDEO-分鏡-v7.md): v5's pictures played back 1.5x with the voice 1.5x (public/audio/vo9, src/vo9-timings.json),
// the pain animation after the cover, and four new shots for the judging criteria (impact, novel, features, product).
// A "v5" segment plays its shot out of out/v5-picture.mp4 (v5 rendered picture-only) at `rate`; a shot whose new voice
// is longer than its sped-up picture plays a little slower so the voice fits. The cover and end card play at 1x.
import VO9 from '../vo9-timings.json';
import { S5 } from '../v5/timeline5';

export const FPS = 30;
type Line = { text: string; start: number; end: number };
const VO = VO9 as Record<string, Line[]>;
const voEnd = (id: string) => VO[id]?.at(-1)?.end ?? 0;

type Plan =
  | { id: string; label: string; kind: 'v5'; src: string; voLead: number; rate?: number; vo?: string }
  | { id: string; label: string; kind: 'new'; voLead: number; tail: number; vo?: string; minDur?: number }
  | { id: string; label: string; kind: 'pain' };
const PLAN: Plan[] = [
  { id: 'cover', label: 'Cover', kind: 'v5', src: 'cover', voLead: 0, rate: 1 },
  { id: 'pain', label: '1 Pain animation', kind: 'pain' },
  { id: 'solution', label: '2 Solution + who it is for', kind: 'v5', src: 'solution', voLead: 0.8, vo: 'solution' },
  { id: 'impact', label: '2a Impact in numbers', kind: 'new', voLead: 0.5, tail: 0.8, vo: 'impact' },
  { id: 'ask', label: '3 Her words → work order', kind: 'v5', src: 'ask', voLead: 0.6, vo: 'ask' },
  { id: 'find', label: '3b Find, reviews, bargain', kind: 'v5', src: 'find', voLead: 0.5, vo: 'find' },
  { id: 'offers', label: '4 Offers, mandate', kind: 'v5', src: 'offers', voLead: 0.5, vo: 'offers' },
  { id: 'chat', label: '4b In a chat', kind: 'v5', src: 'chat', voLead: 0.6, vo: 'chat' },
  { id: 'hold', label: '5 Hold + change order + PIN', kind: 'v5', src: 'hold', voLead: 0.5, vo: 'hold' },
  { id: 'phone', label: "6 The pro's phone", kind: 'v5', src: 'phone', voLead: 0.8, vo: 'phone' },
  { id: 'checks', label: '7 AI checks + injection', kind: 'v5', src: 'checks', voLead: 1.5, vo: 'checks' },
  { id: 'paid', label: '8 Paid', kind: 'v5', src: 'paid', voLead: 1.0, vo: 'paid' },
  { id: 'novel', label: '8a What is new', kind: 'new', voLead: 0.5, tail: 0.9, vo: 'novel' },
  { id: 'arch', label: '9 Architecture', kind: 'v5', src: 'arch', voLead: 0.8, vo: 'arch' },
  { id: 'models', label: '10 Model design', kind: 'v5', src: 'models', voLead: 0.6, vo: 'models' },
  { id: 'hood', label: '11 Under the hood: PayPal', kind: 'v5', src: 'hood', voLead: 0.6, vo: 'hood' },
  { id: 'features', label: '11a 219 PayPal features', kind: 'new', voLead: 0.5, tail: 1.0, vo: 'features' },
  { id: 'scale', label: '12 Scale + back office + tests', kind: 'v5', src: 'scale', voLead: 0.5, vo: 'scale' },
  { id: 'product', label: '12a A complete product', kind: 'new', voLead: 0.4, tail: 0.9, vo: 'product', minDur: 7.6 },
  { id: 'vision', label: '12b Vision (not built yet)', kind: 'v5', src: 'vision', voLead: 0.6, vo: 'vision' },
  { id: 'end', label: '13 End card', kind: 'v5', src: 'end', voLead: 0.9, rate: 1, vo: 'end' },
];
export const PAIN_FRAMES = 402; // out/pain15-a5-1.5x.mp4, 13.385 s at 24 fps
export const PAIN_VO = [{ id: 'pain1', at: 0.6 }, { id: 'pain2', at: 7.0 }];

let at = 0;
export const SHOTS7 = PLAN.map((p) => {
  const from = at;
  let duration = 0, rate = 1, srcFrom = 0, srcDur = 0, voFrom: number | null = null;
  if (p.kind === 'pain') duration = PAIN_FRAMES;
  else if (p.kind === 'new') {
    duration = Math.round(Math.max(p.minDur ?? 0, p.voLead + voEnd(p.vo!) + p.tail) * FPS);
    voFrom = from + Math.round(p.voLead * FPS);
  } else {
    const s = S5[p.src]; srcFrom = s.from; srcDur = s.duration;
    rate = p.rate ?? 1.5;
    duration = Math.round(srcDur / rate);
    // the voice starts where it started in v5's picture (scaled), and the shot keeps 0.5 s after it
    if (p.vo) {
      const need = Math.round((p.voLead / rate + voEnd(p.vo) + 0.5) * FPS);
      if (need > duration) { duration = need; rate = srcDur / duration; }
      voFrom = from + Math.round((p.voLead / rate) * FPS);
    }
  }
  at += duration;
  const vo = 'vo' in p && p.vo ? VO[p.vo] : null;
  return { ...p, from, duration, rate, srcFrom, srcDur, voFrom, vo, voFile: 'vo' in p && p.vo ? `audio/vo9/${p.vo}.wav` : null };
});
export const TOTAL7 = at;
export const S7 = Object.fromEntries(SHOTS7.map((s) => [s.id, s])) as Record<string, (typeof SHOTS7)[number]>;

// a v5 frame (global, in v5's timeline) → the v7 frame where that picture now plays; null if that v5 shot isn't in v7
export const fromV5 = (f5: number) => {
  const s = SHOTS7.find((x) => x.kind === 'v5' && f5 >= x.srcFrom && f5 < x.srcFrom + x.srcDur);
  return s ? s.from + Math.round((f5 - s.srcFrom) / s.rate) : null;
};

// captions: one per sentence (a short sentence ending in ":" or ";" joins the next), from the voice timings
const group = (v: Line[]) => {
  const g: Line[] = [];
  for (const x of v) { const l = g[g.length - 1]; if (l && /[:;]$/.test(l.text) && l.end - l.start < 2.6) { l.text += ' ' + x.text; l.end = x.end; } else g.push({ ...x }); }
  return g;
};
const captionsOf = (voFrom: number, lines: Line[], endBy: number) => {
  const g = group(lines);
  return g.map((x, k) => {
    const from = voFrom + Math.round(x.start * FPS), next = g[k + 1];
    const to = next ? voFrom + Math.round(next.start * FPS) : Math.min(endBy, voFrom + Math.round(x.end * FPS) + 14);
    return { text: x.text, from, duration: Math.max(18, to - from) };
  });
};
export const CAPTIONS7 = [
  ...PAIN_VO.flatMap((p, i) => captionsOf(S7.pain.from + Math.round(p.at * FPS), VO[p.id], S7.pain.from + (i ? PAIN_FRAMES - 4 : Math.round(6.7 * FPS)))),
  ...SHOTS7.filter((s) => s.vo && s.voFrom != null).flatMap((s) => captionsOf(s.voFrom!, s.vo!, s.from + s.duration - 4)),
];
// every frame where a voice is speaking (the music ducks under it)
export const VOICE_SPANS = [
  ...PAIN_VO.map((p) => [S7.pain.from + Math.round(p.at * FPS), S7.pain.from + Math.round((p.at + (VO[p.id].at(-1)?.end ?? 0)) * FPS)]),
  ...SHOTS7.filter((s) => s.vo && s.voFrom != null).map((s) => [s.voFrom!, s.voFrom! + Math.round((s.vo!.at(-1)?.end ?? 0) * FPS)]),
] as [number, number][];
