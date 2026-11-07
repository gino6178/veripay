// Film v4: voice-led shots (timeline4.ts), captions from the Kokoro v4 timings, VO + BGM (ducked under the voice) + SFX.
// Versions: {bgm:true,vo:true} · {bgm:false,vo:true} (props-v4-nobgm.json) · {bgm:true,vo:false} captions only (props-v4-novo.json).
import React from 'react';
import { AbsoluteFill, Audio, Sequence, interpolate, staticFile } from 'remotion';
import { C } from '../theme';
import { FontsReady } from '../Fonts';
import { CaptionBand } from '../parts';
import { SHOTS4, S4, CAPTIONS4, TOTAL4, voAt } from './timeline4';
import { V4Cover, COVER_STAMP, V4Problem, V4Solution, V4Ask, V4Offers, V4Hold, V4Phone, V4Checks, V4Paid, PAID_STAMP4, V4Arch, V4Models, V4Hood, V4Scale, SCALE_CUTS, V4End, V4Credits } from './shots4';

export const renderShot4 = (id: string) => ({
  cover: <V4Cover />, problem: <V4Problem />, solution: <V4Solution />, ask: <V4Ask />, offers: <V4Offers />, hold: <V4Hold />, phone: <V4Phone />,
  checks: <V4Checks />, paid: <V4Paid />, arch: <V4Arch />, models: <V4Models />, hood: <V4Hood />, scale: <V4Scale />, end: <V4End />, credits: <V4Credits />,
} as Record<string, React.ReactNode>)[id];

// SFX (Freesound CC0, public/audio/sfx): pinned to picture events; output offset 1.28 f and each file's peak
const OFF = 1.28;
const PEAK: Record<string, number> = { 'fs-470710.mp3': 0.565, 'fs-166325-gain.mp3': 0.325, 'fs-678248.mp3': 0.485, 'fs-376205.mp3': 0.985, 'fs-701104.mp3': 0.505, 'fs-683101.mp3': 0.225, 'fs-859482.mp3': 2.285, 'fs-560156.mp3': 0.055, 'fs-578803.mp3': 0.155, 'fs-539146.mp3': 0.14 };
const at = (peakF: number, src: string) => Math.max(0, Math.round(peakF - (PEAK[src] ?? 0) * 30 - OFF));
const hold = S4.hold, B = voAt('hold', 2), L = voAt('hold', 2, true) - B, C0 = B + Math.round(0.4 * L), DN = B + Math.round(0.72 * L);
export const SFX4 = [
  { from: at(S4.cover.from + COVER_STAMP + 6, 'fs-470710.mp3'), src: 'fs-470710.mp3', volume: 0.55, note: 'S0 PAID stamp lands on the cover' },
  { from: at(S4.problem.from + 58, 'fs-166325-gain.mp3'), src: 'fs-166325-gain.mp3', volume: 0.5, note: 'S1 drop' },
  { from: at(S4.problem.from + 132, 'fs-470710.mp3'), src: 'fs-470710.mp3', volume: 0.35, note: 'S1 UNPAID stamp' },
  { from: at(S4.solution.from + 4, 'fs-701104.mp3'), src: 'fs-701104.mp3', volume: 0.5, note: 'S2 doors close' },
  { from: at(S4.ask.from + 32, 'fs-701104.mp3'), src: 'fs-701104.mp3', volume: 0.4, note: 'S3 work order rises' },
  { from: at(S4.offers.from + 6, 'fs-701104.mp3'), src: 'fs-701104.mp3', volume: 0.4, note: 'S4 offers card' },
  { from: at(S4.offers.from + voAt('offers', 2), 'fs-470710.mp3'), src: 'fs-470710.mp3', volume: 0.3, note: 'S4 mandate card lands' },
  { from: at(hold.from + 30, 'fs-701104.mp3'), src: 'fs-701104.mp3', volume: 0.4, note: 'S5 hold card' },
  { from: at(hold.from + C0 + 18, 'fs-678248.mp3'), src: 'fs-678248.mp3', volume: 0.35, note: 'S5 PIN digit 1' },
  { from: at(hold.from + DN, 'fs-678248.mp3'), src: 'fs-678248.mp3', volume: 0.45, note: 'S5 PIN confirmed' },
  { from: at(hold.from + DN + 40, 'fs-539146.mp3'), src: 'fs-539146.mp3', volume: 0.35, note: 'S5 first authorization flips to VOIDED' },
  { from: at(S4.phone.from + 10, 'fs-376205.mp3'), src: 'fs-376205.mp3', volume: 0.45, note: 'S6 chip 1' },
  { from: at(S4.phone.from + 44, 'fs-376205.mp3'), src: 'fs-376205.mp3', volume: 0.4, note: 'S6 chip 2' },
  { from: at(S4.checks.from + 12, 'fs-701104.mp3'), src: 'fs-701104.mp3', volume: 0.4, note: 'S7 scan' },
  { from: at(S4.checks.from + voAt('checks', 2) + 50, 'fs-470710.mp3'), src: 'fs-470710.mp3', volume: 0.35, note: 'S7 flagged card lands' },
  { from: at(S4.paid.from + PAID_STAMP4, 'fs-859482.mp3'), src: 'fs-859482.mp3', volume: 0.4, note: 'S8 riser into the stamp' },
  { from: at(S4.paid.from + PAID_STAMP4 + 6, 'fs-470710.mp3'), src: 'fs-470710.mp3', volume: 0.6, note: 'S8 PAID stamp' },
  { from: at(S4.paid.from + PAID_STAMP4 + 7, 'fs-560156.mp3'), src: 'fs-560156.mp3', volume: 0.3, durationInFrames: 90, note: 'S8 soft impact' },
  { from: at(S4.arch.from + 6, 'fs-701104.mp3'), src: 'fs-701104.mp3', volume: 0.35, note: 'S9 diagram builds' },
  { from: at(S4.models.from + 6, 'fs-701104.mp3'), src: 'fs-701104.mp3', volume: 0.35, note: 'S10 pipeline builds' },
  { from: at(S4.hood.from + S4.hood.duration - 55, 'fs-578803.mp3'), src: 'fs-578803.mp3', volume: 0.35, note: 'S11 "+5 more" row lights' },
  ...SCALE_CUTS.map((c, i) => ({ from: at(S4.scale.from + c + 2, 'fs-683101.mp3'), src: 'fs-683101.mp3', volume: 0.4 - i * 0.05, note: `S12 panel cut ${i + 1}` })),
  { from: at(S4.end.from + 8, 'fs-560156.mp3'), src: 'fs-560156.mp3', volume: 0.45, durationInFrames: 120, note: 'S13 wordmark' },
  { from: at(S4.end.from + 26, 'fs-578803.mp3'), src: 'fs-578803.mp3', volume: 0.3, note: 'S13 rule' },
] as { from: number; src: string; volume: number; durationInFrames?: number; note: string }[];

const BGM_SRC = 'audio/bgm/bgm-film.mp3';
const voOn = (f: number) => SHOTS4.some((s) => s.vo && f >= s.voFrom - 6 && f <= s.voFrom + Math.round(s.vo.at(-1)!.end * 30) + 6);

export const Film4: React.FC<{ bgm?: boolean; vo?: boolean; captions?: boolean; sfx?: boolean }> = ({ bgm = true, vo = true, captions = true, sfx = true }) => (
  <AbsoluteFill style={{ background: C.ground }}>
    <FontsReady />
    {SHOTS4.map((s) => <Sequence key={s.id} from={s.from} durationInFrames={s.duration} name={s.label}>{renderShot4(s.id)}</Sequence>)}
    {captions && CAPTIONS4.map((c, i) => <Sequence key={'c' + i} from={c.from} durationInFrames={c.duration}><CaptionBand duration={c.duration} text={c.text} /></Sequence>)}
    {vo && SHOTS4.filter((s) => s.voFile).map((s) => <Sequence key={'v' + s.id} from={s.voFrom} durationInFrames={s.duration}><Audio src={staticFile(s.voFile!)} volume={1} /></Sequence>)}
    {bgm && <Audio src={staticFile(BGM_SRC)} volume={(f) => (vo ? (voOn(f) ? 0.04 : 0.1) : 0.28) * interpolate(f, [0, 20, TOTAL4 - 60, TOTAL4], [0, 1, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })} />}
    {sfx && SFX4.map((x, i) => <Sequence key={'s' + i} from={x.from} durationInFrames={x.durationInFrames ?? 90}><Audio src={staticFile('audio/sfx/' + x.src)} volume={x.volume} /></Sequence>)}
  </AbsoluteFill>
);
