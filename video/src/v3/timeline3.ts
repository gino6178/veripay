// Film v3: voice-led timing. Each shot's length = its Kokoro VO (vo-timings.json) + room for the picture to land.
import VO from '../vo-timings.json';
export const FPS = 30;
type Shot = { id: string; label: string; dur: number; voLead: number; noVo?: boolean };
// seconds; voLead = when the VO starts inside the shot
const PLAN: Shot[] = [
  { id: 'cover', label: 'S0 Cover', dur: 3, voLead: 0, noVo: true }, // the competition cover, no voice; PAID lands, cut to S1
  { id: 'split', label: 'S1 Two sides', dur: 11.5, voLead: 0.8 },
  { id: 'flow', label: 'S2 The fix', dur: 10, voLead: 0.9 },
  { id: 'ask', label: 'S3 One sentence', dur: 12, voLead: 0.6 },
  { id: 'offers', label: 'S4 Offers + mandate', dur: 19, voLead: 0.6 },
  { id: 'hold', label: 'S5 PayPal holds', dur: 11, voLead: 0.6 },
  { id: 'pin', label: 'S6 Change order + PIN', dur: 16, voLead: 0.6 },
  { id: 'phone', label: "S7 The pro's phone", dur: 9, voLead: 1.2 },
  { id: 'checks', label: 'S8 Checks + injection', dur: 18, voLead: 0.6 },
  { id: 'paid', label: 'S9 Paid', dur: 15, voLead: 1.6 },
  { id: 'depth', label: 'S10 Depth', dur: 10, voLead: 0.6 },
  { id: 'ops', label: 'S11 Operators + tests', dur: 17, voLead: 0.6 },
  { id: 'end', label: 'S12 End card', dur: 8, voLead: 1.4 },
  { id: 'credits', label: 'S13 Credits', dur: 3, voLead: 0 },
];
let at = 0, k = 0; // k: index into vo-timings.json (shots with a voice, in order)
export const SHOTS3 = PLAN.map((s, i) => {
  const from = Math.round(at * FPS), duration = Math.round(s.dur * FPS);
  at += s.dur;
  const n = s.noVo ? -1 : k++;
  const vo = n >= 0 ? ((VO as any)[n] as { text: string; start: number; end: number }[] | undefined) : undefined;
  return { ...s, i, from, duration, voFrom: from + Math.round(s.voLead * FPS), vo: vo || null, voFile: vo ? `audio/vo/k${n + 1}.wav` : null };
});
export const TOTAL3 = Math.round(at * FPS);
export const S3 = Object.fromEntries(SHOTS3.map((s) => [s.id, s])) as Record<string, (typeof SHOTS3)[number]>;
// captions: one per VO sentence, timed from Kokoro's timings (absolute frames)
export const CAPTIONS3 = SHOTS3.flatMap((s) => (s.vo || []).map((v, k) => {
  const from = s.voFrom + Math.round(v.start * FPS);
  const next = s.vo![k + 1];
  const to = next ? s.voFrom + Math.round(next.start * FPS) : Math.min(s.from + s.duration - 4, s.voFrom + Math.round(v.end * FPS) + 18);
  return { text: v.text, from, duration: Math.max(20, to - from) };
}));
