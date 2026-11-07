// Workbench manifest (film v4): shots, captions, VO, SFX and BGM as tracks for the shotcraft workbench
// (`node workbench/scripts/open.mjs D:/paypal/done/video`). Every table is imported from the film's own sources
// (v4/timeline4.ts SHOTS4 + CAPTIONS4, v4/Film4.tsx SFX4), so there is no second copy of the timing.
import { createElement, type FC } from 'react';
import { SHOTS4 as SHOTS3, CAPTIONS4 as CAPTIONS3, TOTAL4 as TOTAL3 } from './v4/timeline4';
import { Film4 as Film3, renderShot4 as renderShot3, SFX4 as SFX3 } from './v4/Film4';
import { CaptionBand } from './parts';
import { C } from './theme';

const unit = (id: string): FC => { const U: FC = () => createElement('div', { style: { position: 'absolute', inset: 0 } }, renderShot3(id)); U.displayName = `ShotV4_${id}`; return U; };
const CaptionUnit: FC<{ text?: string; duration?: number }> = ({ text = '', duration = 60 }) => createElement(CaptionBand, { text, duration });
CaptionUnit.displayName = 'CaptionBand';

export const WORKBENCH = {
  name: 'VeriPay · film v4',
  fps: 30, width: 1920, height: 1080,
  total: TOTAL3,
  background: C.ground,
  shots: SHOTS3.map((s) => ({ id: s.id, label: s.label, from: s.from, duration: s.duration, component: unit(s.id) })),
  captions: CAPTIONS3.map((c, i) => ({ id: `cap${i}`, label: c.text.slice(0, 40), from: c.from, duration: c.duration, component: CaptionUnit as FC<Record<string, unknown>>, props: { text: c.text }, schema: [{ type: 'textarea', key: 'text', label: 'Caption', default: c.text }], durationProp: 'duration', cardId: 'caption' })),
  sfx: [
    ...SHOTS3.filter((s) => s.voFile).map((s) => ({ from: s.voFrom, duration: s.duration, src: s.voFile!, volume: 1, label: `VO ${s.label}` })),
    ...SFX3.map((s) => ({ from: s.from, duration: s.durationInFrames ?? 90, src: `audio/sfx/${s.src}`, volume: s.volume, label: s.note })),
  ],
  bgm: [{ from: 0, duration: TOTAL3, src: 'audio/bgm/bgm-film.mp3', volume: 0.3, label: 'House Vibez (Lily J, Mixkit), loop baked in; ducked to 0.04 under the voice in the film' }],
  original: Film3,
};
