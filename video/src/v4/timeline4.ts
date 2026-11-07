// Film v4: voice-led timing from the Kokoro v4 lines (vo/narration-v4.json → src/vo4-timings.json, af_heart 1.12×).
// Each shot = its VO + room for the picture to land. Shots without voice: the cover and the credits.
import VO from '../vo4-timings.json';
export const FPS = 30;
type Shot = { id: string; label: string; dur: number; voLead: number; noVo?: boolean };
const PLAN: Shot[] = [
  { id: 'cover', label: 'S0 Cover', dur: 2, voLead: 0, noVo: true },
  { id: 'problem', label: 'S1 Problem', dur: 7, voLead: 0.7 },
  { id: 'solution', label: 'S2 Solution + why PayPal', dur: 8.5, voLead: 0.8 },
  { id: 'ask', label: 'S3 Her words → work order', dur: 7.5, voLead: 0.6 },
  { id: 'offers', label: 'S4 Offers, counter, mandate', dur: 11.5, voLead: 0.5 },
  { id: 'hold', label: 'S5 Hold + change order + PIN', dur: 15.5, voLead: 0.5 },
  { id: 'phone', label: "S6 The pro's phone", dur: 5, voLead: 0.8 },
  { id: 'checks', label: 'S7 AI checks + injection', dur: 14, voLead: 1.5 },
  { id: 'paid', label: 'S8 Paid', dur: 11, voLead: 1.0 },
  { id: 'arch', label: 'S9 Architecture', dur: 12.5, voLead: 0.8 },
  { id: 'models', label: 'S10 Model design', dur: 19.5, voLead: 0.6 },
  { id: 'hood', label: 'S11 Under the hood: PayPal', dur: 11.5, voLead: 0.6 },
  { id: 'scale', label: 'S12 Scale + back office + tests', dur: 11.5, voLead: 0.5 },
  { id: 'end', label: 'S13 End card', dur: 4, voLead: 0.9 },
  { id: 'credits', label: 'S14 Credits', dur: 3, voLead: 0, noVo: true },
];
let at = 0, k = 0;
export const SHOTS4 = PLAN.map((s, i) => {
  const from = Math.round(at * FPS), duration = Math.round(s.dur * FPS);
  at += s.dur;
  const n = s.noVo ? -1 : k++;
  const vo = n >= 0 ? ((VO as any)[n] as { text: string; start: number; end: number }[] | undefined) : undefined;
  return { ...s, i, from, duration, voFrom: from + Math.round(s.voLead * FPS), vo: vo || null, voFile: vo ? `audio/vo4/k${n + 1}.wav` : null };
});
export const TOTAL4 = Math.round(at * FPS);
export const S4 = Object.fromEntries(SHOTS4.map((s) => [s.id, s])) as Record<string, (typeof SHOTS4)[number]>;
// a VO sentence's start / end inside its shot, in frames from the shot's start
export const voAt = (id: string, n: number, end = false) => { const s = S4[id]; return s.voFrom - s.from + Math.round((end ? s.vo![n].end : s.vo![n].start) * FPS); };
// captions: one per VO sentence (sentences split at ":" or ";" are joined back to the next one when short)
export const CAPTIONS4 = SHOTS4.flatMap((s) => {
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
