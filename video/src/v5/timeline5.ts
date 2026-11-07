// Film v5: voice-led timing from the Kokoro v7 lines (vo/narration-v7.json → src/vo7-timings.json, af_heart 1.12×). New vs v4:
// find + bargain (nearby pros, reviews, the market bar, the stuck warning), the chat, and the vision card.
// Each shot = its VO + room for the picture to land. Shots without voice: the cover and the credits.
import VO7 from '../vo7-timings.json';
import VO from '../vo8-timings.json';
// v8 voice: the v7 lines sped up 1.12× more (ffmpeg atempo, pitch kept; public/audio/vo8). Each shot gives back the
// seconds its voice saved, so the picture's room after the voice stays as it was.
const SAVED = (n: number) => ((VO7 as any)[n]?.at(-1)?.end ?? 0) - ((VO as any)[n]?.at(-1)?.end ?? 0);
export const FPS = 30;
type Shot = { id: string; label: string; dur: number; voLead: number; noVo?: boolean };
const PLAN: Shot[] = [
  { id: 'cover', label: 'S0 Cover', dur: 2, voLead: 0, noVo: true },
  { id: 'problem', label: 'S1 Problem', dur: 7, voLead: 0.7 },
  { id: 'solution', label: 'S2 Solution + why PayPal', dur: 8.5, voLead: 0.8 },
  { id: 'ask', label: 'S3 Her words → work order', dur: 7.5, voLead: 0.6 },
  { id: 'find', label: 'S3b Find, reviews, bargain, market', dur: 12.5, voLead: 0.5 },
  { id: 'offers', label: 'S4 Offers, counter, mandate', dur: 11, voLead: 0.5 },
  { id: 'chat', label: 'S4b In a chat', dur: 10, voLead: 0.6 },
  { id: 'hold', label: 'S5 Hold + change order + PIN', dur: 15.5, voLead: 0.5 },
  { id: 'phone', label: "S6 The pro's phone", dur: 5, voLead: 0.8 },
  { id: 'checks', label: 'S7 AI checks + injection', dur: 14, voLead: 1.5 },
  { id: 'paid', label: 'S8 Paid', dur: 11, voLead: 1.0 },
  { id: 'arch', label: 'S9 Architecture', dur: 12.5, voLead: 0.8 },
  { id: 'models', label: 'S10 Model design', dur: 18, voLead: 0.6 },
  { id: 'hood', label: 'S11 Under the hood: PayPal', dur: 11.5, voLead: 0.6 },
  { id: 'scale', label: 'S12 Scale + back office + tests', dur: 15, voLead: 0.5 },
  { id: 'vision', label: 'S12b Vision (not built yet)', dur: 8, voLead: 0.6 },
  { id: 'end', label: 'S13 End card', dur: 4, voLead: 0.9 },
];
let at = 0, k = 0;
export const SHOTS5 = PLAN.map((s, i) => {
  const n = s.noVo ? -1 : k++;
  const dur = n >= 0 ? s.dur - SAVED(n) : s.dur;
  const from = Math.round(at * FPS), duration = Math.round(dur * FPS);
  at += dur;
  const vo = n >= 0 ? ((VO as any)[n] as { text: string; start: number; end: number }[] | undefined) : undefined;
  return { ...s, i, from, duration, voFrom: from + Math.round(s.voLead * FPS), vo: vo || null, voFile: vo ? `audio/vo8/k${n + 1}.wav` : null };
});
export const TOTAL5 = Math.round(at * FPS);
export const S5 = Object.fromEntries(SHOTS5.map((s) => [s.id, s])) as Record<string, (typeof SHOTS5)[number]>;
// a VO sentence's start / end inside its shot, in frames from the shot's start
export const voAt = (id: string, n: number, end = false) => { const s = S5[id]; return s.voFrom - s.from + Math.round((end ? s.vo![n].end : s.vo![n].start) * FPS); };
// captions: one per VO sentence (sentences split at ":" or ";" are joined back to the next one when short)
export const CAPTIONS5 = SHOTS5.flatMap((s) => {
  const v = s.vo || [];
  const groups: { text: string; start: number; end: number }[] = [];
  for (const x of v) { const g = groups[groups.length - 1]; if (g && /[:;]$/.test(g.text) && (g.end - g.start) < 2.6) { g.text += ' ' + x.text; g.end = x.end; } else groups.push({ ...x }); }
  return groups.map((g, k2) => {
    const from = s.voFrom + Math.round(g.start * FPS);
    const next = groups[k2 + 1];
    const to = next ? s.voFrom + Math.round(next.start * FPS) : Math.min(s.from + s.duration - 4, s.voFrom + Math.round(g.end * FPS) + 18);
    return { text: g.text, from, duration: Math.max(20, to - from) };
  });
});
