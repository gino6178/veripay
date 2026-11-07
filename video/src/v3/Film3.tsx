// Film v3: shots in their voice-led slots, captions from the Kokoro timings, VO + BGM (ducked under the voice) + SFX.
// Props: bgm (music), vo (voice). Versions: with BGM {bgm:true,vo:true}; no BGM {bgm:false,vo:true};
// captions only, no voice {bgm:true,vo:false}.
import React from 'react';
import { AbsoluteFill, Audio, Sequence, interpolate, staticFile } from 'remotion';
import { C } from '../theme';
import { FontsReady } from '../Fonts';
import { CaptionBand } from '../parts';
import { SHOTS3, S3, CAPTIONS3, TOTAL3 } from './timeline3';
import { Shot0, COVER_STAMP, Shot1, Shot2, Shot3, Shot4, Shot5, Shot6, Shot7, Shot8, Shot9, Shot10, Shot11, Shot12, Shot13, WHIPS3 } from './shots3';

export const STAMP3 = S3.paid.voFrom - S3.paid.from - 8; // the PAID stamp lands just before "Every check passed"
export const renderShot3 = (id: string) => ({
  cover: <Shot0 />, split: <Shot1 />, flow: <Shot2 />, ask: <Shot3 />, offers: <Shot4 />, hold: <Shot5 />, pin: <Shot6 />, phone: <Shot7 />,
  checks: <Shot8 />, paid: <Shot9 stampAt={STAMP3} />, depth: <Shot10 />, ops: <Shot11 />, end: <Shot12 />, credits: <Shot13 />,
} as Record<string, React.ReactNode>)[id];

// SFX (Freesound CC0, see public/audio/sfx): pinned relative to the shots; output offset 1.28 f and each file's peak
const OFF = 1.28;
const PEAK: Record<string, number> = { 'fs-470710.mp3': 0.565, 'fs-166325-gain.mp3': 0.325, 'fs-678248.mp3': 0.485, 'fs-376205.mp3': 0.985, 'fs-701104.mp3': 0.505, 'fs-683101.mp3': 0.225, 'fs-859482.mp3': 2.285, 'fs-560156.mp3': 0.055, 'fs-578803.mp3': 0.155, 'fs-539146.mp3': 0.14 };
const at = (peakF: number, src: string) => Math.max(0, Math.round(peakF - (PEAK[src] ?? 0) * 30 - OFF));
export const SFX3 = [
  { from: at(S3.cover.from + COVER_STAMP + 6, 'fs-470710.mp3'), src: 'fs-470710.mp3', volume: 0.55, note: 'S0 PAID stamp lands on the cover' },
  { from: at(S3.split.from + 58, 'fs-166325-gain.mp3'), src: 'fs-166325-gain.mp3', volume: 0.5, note: 'S1 drop' },
  { from: at(S3.split.from + 132, 'fs-470710.mp3'), src: 'fs-470710.mp3', volume: 0.35, note: 'S1 UNPAID stamp' },
  { from: at(S3.flow.from + 4, 'fs-701104.mp3'), src: 'fs-701104.mp3', volume: 0.5, note: 'S2 doors close' },
  { from: at(S3.ask.from + 44, 'fs-701104.mp3'), src: 'fs-701104.mp3', volume: 0.4, note: 'S3 work order rises' },
  { from: at(S3.offers.from + 6, 'fs-701104.mp3'), src: 'fs-701104.mp3', volume: 0.4, note: 'S4 offers card' },
  { from: at(S3.offers.from + 330, 'fs-470710.mp3'), src: 'fs-470710.mp3', volume: 0.3, note: 'S4 mandate card lands' },
  { from: at(S3.hold.from + 62, 'fs-701104.mp3'), src: 'fs-701104.mp3', volume: 0.4, note: 'S5 PayPal card' },
  { from: at(S3.pin.from + 140, 'fs-678248.mp3'), src: 'fs-678248.mp3', volume: 0.35, note: 'S6 PIN digit 1' },
  { from: at(S3.pin.from + 212, 'fs-678248.mp3'), src: 'fs-678248.mp3', volume: 0.45, note: 'S6 confirm' },
  { from: at(S3.phone.from + 30, 'fs-376205.mp3'), src: 'fs-376205.mp3', volume: 0.45, note: 'S7 chip 1' },
  { from: at(S3.phone.from + 110, 'fs-376205.mp3'), src: 'fs-376205.mp3', volume: 0.4, note: 'S7 chip 2' },
  { from: at(S3.checks.from + 20, 'fs-701104.mp3'), src: 'fs-701104.mp3', volume: 0.4, note: 'S8 scan' },
  { from: at(S3.checks.voFrom + Math.round(S3.checks.vo![2].start * 30) + 64, 'fs-470710.mp3'), src: 'fs-470710.mp3', volume: 0.35, note: 'S8 flagged card lands' },
  { from: at(S3.paid.from + STAMP3, 'fs-859482.mp3'), src: 'fs-859482.mp3', volume: 0.4, note: 'S9 riser into the stamp' },
  { from: at(S3.paid.from + STAMP3 + 6, 'fs-470710.mp3'), src: 'fs-470710.mp3', volume: 0.6, note: 'S9 PAID stamp' },
  { from: at(S3.paid.from + STAMP3 + 7, 'fs-560156.mp3'), src: 'fs-560156.mp3', volume: 0.3, durationInFrames: 90, note: 'S9 soft impact' },
  ...WHIPS3.map((w, i) => ({ from: at(S3.ops.from + w + 4, 'fs-683101.mp3'), src: 'fs-683101.mp3', volume: 0.45 - i * 0.05, note: `S11 whip ${i + 1}` })),
  { from: at(S3.end.from + 10, 'fs-560156.mp3'), src: 'fs-560156.mp3', volume: 0.45, durationInFrames: 120, note: 'S12 wordmark' },
  { from: at(S3.end.from + 34, 'fs-578803.mp3'), src: 'fs-578803.mp3', volume: 0.3, note: 'S12 rule' },
] as { from: number; src: string; volume: number; durationInFrames?: number; note: string }[];

const BGM_SRC = 'audio/bgm/bgm-film.mp3';
const voOn = (f: number) => SHOTS3.some((s) => s.vo && f >= s.voFrom - 6 && f <= s.voFrom + Math.round(s.vo.at(-1)!.end * 30) + 6);

export const Film3: React.FC<{ bgm?: boolean; vo?: boolean; captions?: boolean; sfx?: boolean }> = ({ bgm = true, vo = true, captions = true, sfx = true }) => (
  <AbsoluteFill style={{ background: C.ground }}>
    <FontsReady />
    {SHOTS3.map((s) => <Sequence key={s.id} from={s.from} durationInFrames={s.duration} name={s.label}>{renderShot3(s.id)}</Sequence>)}
    {captions && CAPTIONS3.map((c, i) => <Sequence key={'c' + i} from={c.from} durationInFrames={c.duration}><CaptionBand duration={c.duration} text={c.text} /></Sequence>)}
    {vo && SHOTS3.filter((s) => s.voFile).map((s) => <Sequence key={'v' + s.id} from={s.voFrom} durationInFrames={s.duration}><Audio src={staticFile(s.voFile!)} volume={1} /></Sequence>)}
    {bgm && <Audio src={staticFile(BGM_SRC)} volume={(f) => (vo ? (voOn(f) ? 0.04 : 0.1) : 0.28) * interpolate(f, [0, 20, TOTAL3 - 60, TOTAL3], [0, 1, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })} />}
    {sfx && SFX3.map((x, i) => <Sequence key={'s' + i} from={x.from} durationInFrames={x.durationInFrames ?? 90}><Audio src={staticFile('audio/sfx/' + x.src)} volume={x.volume} /></Sequence>)}
  </AbsoluteFill>
);
