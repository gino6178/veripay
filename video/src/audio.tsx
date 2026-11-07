// The film's sound: one central SFX table pinned relative to SHOTS (sound-design §4.5–4.6) and the BGM with its loop.
import React from 'react';
import { Audio, Sequence, interpolate, staticFile } from 'remotion';
import { SHOTS, BGM, DROP2, TOTAL } from './timeline';
import { WHIPS } from './shots/Montage';
import { POST_SEND } from './shots/Product';

// Remotion 4.0.484 + AAC 48 kHz mp4: measured on this film's own render (spec/AUDIO-SYNC.md), default until then
export const OUTPUT_AUDIO_OFFSET_F = 1.28;
// each file's energy peak from audio-manifest.json analysis (seconds → frames)
const PEAK_S: Record<string, number> = {
  'fs-470710.mp3': 0.565, 'fs-166325-gain.mp3': 0.325, 'fs-539146.mp3': 0.14, 'fs-678248.mp3': 0.485, 'fs-376205.mp3': 0.985,
  'fs-701104.mp3': 0.505, 'fs-683101.mp3': 0.225, 'fs-859482.mp3': 2.285, 'fs-560156.mp3': 0.055, 'fs-578803.mp3': 0.155,
};
const sfxFrom = (targetPeakF: number, src: string) => Math.max(0, Math.round(targetPeakF - (PEAK_S[src] ?? 0) * 30 - OUTPUT_AUDIO_OFFSET_F));
const STAMP = 'fs-470710.mp3', DRIP = 'fs-166325-gain.mp3', TYPE = 'fs-539146.mp3', CLICK = 'fs-678248.mp3', SHUTTER = 'fs-376205.mp3',
  SOFT = 'fs-701104.mp3', WHIP = 'fs-683101.mp3', RISER = 'fs-859482.mp3', IMPACT = 'fs-560156.mp3', SPARKLE = 'fs-578803.mp3';

type Cue = { from: number; src: string; volume: number; durationInFrames?: number; note: string };
const S = SHOTS;
export const SFX: Cue[] = [
  { from: sfxFrom(S.cover.from + 20, STAMP), src: STAMP, volume: 0.55, note: 'S0 PAID stamp lands on the cover' },
  { from: sfxFrom(S.split.from + 58, DRIP), src: DRIP, volume: 0.5, note: 'S1 drop hits the sink' },
  { from: sfxFrom(S.split.from + 100, DRIP), src: DRIP, volume: 0.4, note: 'S1 drop' },
  { from: sfxFrom(S.split.from + 132, STAMP), src: STAMP, volume: 0.42, note: 'S1 UNPAID stamp on the invoice' },
  { from: sfxFrom(S.split.from + 184, DRIP), src: DRIP, volume: 0.3, note: 'S1 drop' },
  { from: sfxFrom(S.problem.from + 6, SOFT), src: SOFT, volume: 0.5, note: 'S2 card 1 presses in' },
  { from: sfxFrom(S.problem.from + 111, SOFT), src: SOFT, volume: 0.48, note: 'S2 card 2 presses in' },
  { from: sfxFrom(S.problem.from + 218, SOFT), src: SOFT, volume: 0.6, note: 'S2 the two sides close' },
  { from: sfxFrom(S.problem.from + 250, STAMP), src: STAMP, volume: 0.55, note: 'S2 PAID stamp on the work order' },
  { from: S.post.from + 16, src: TYPE, volume: 1.0, durationInFrames: 100, note: 'S3 typing the sentence (cut to the typing window)' },
  { from: S.post.from + 116, src: TYPE, volume: 1.0, durationInFrames: POST_SEND - 12 - 116, note: 'S3 typing, second half' },
  { from: sfxFrom(S.post.from + POST_SEND, CLICK), src: CLICK, volume: 0.5, note: 'S3 Enter / send (ripple)' },
  { from: sfxFrom(S.offers.from + 12, SOFT), src: SOFT, volume: 0.55, note: 'S4 offers start rising' },
  { from: sfxFrom(S.offers.from + 186, SOFT), src: SOFT, volume: 0.5, note: 'S4 cut to the agents messages' },
  { from: sfxFrom(S.hold.from + 10, SOFT), src: SOFT, volume: 0.5, note: 'S5 push to the money panel' },
  { from: sfxFrom(S.pin.from + 64, CLICK), src: CLICK, volume: 0.5, note: 'S6 Approve +$47.05' },
  { from: sfxFrom(S.pin.from + 214, CLICK), src: CLICK, volume: 0.45, note: 'S6 Confirm (PIN)' },
  { from: sfxFrom(S.phone.from + 42, SHUTTER), src: SHUTTER, volume: 0.5, note: 'S7 chip 1 (after photo, faucet running)' },
  { from: sfxFrom(S.phone.from + 192, SHUTTER), src: SHUTTER, volume: 0.42, note: 'S7 chip 2 (after photo, faucet off)' },
  { from: sfxFrom(S.phone.from + 342, SOFT), src: SOFT, volume: 0.55, note: 'S7 chip 3 (receipt)' },
  { from: sfxFrom(S.checks.from + 8, SOFT), src: SOFT, volume: 0.5, note: 'S8 the scan begins' },
  { from: sfxFrom(S.checks.from + S.checks.duration - 105 + 6, SOFT), src: SOFT, volume: 0.5, note: 'S8 title card presses in' },
  { from: sfxFrom(DROP2, RISER), src: RISER, volume: 0.45, note: 'S9 riser into the release (peak on the drop)' },
  { from: sfxFrom(DROP2, STAMP), src: STAMP, volume: 0.6, note: 'S9 PAID stamp on the drop' },
  { from: sfxFrom(DROP2 + 2, IMPACT), src: IMPACT, volume: 0.35, durationInFrames: 90, note: 'S9 soft impact under the stamp' },
  { from: sfxFrom(S.sandbox.from + 26, TYPE), src: TYPE, volume: 1.0, durationInFrames: 100, note: 'S10 ids typed' },
  { from: sfxFrom(S.sandbox.from + 44, TYPE), src: TYPE, volume: 0.9, durationInFrames: 82, note: 'S10 ids typed (second layer, denser)' },
  ...WHIPS.map((w, i) => ({ from: sfxFrom(S.montage.from + w + 4, WHIP), src: WHIP, volume: 0.45 - i * 0.04, note: `S11 whip ${i + 1}` })),
  { from: sfxFrom(S.end.from + 42, RISER), src: RISER, volume: 0.4, note: 'S12 riser into the wordmark' },
  { from: sfxFrom(S.end.from + 44, IMPACT), src: IMPACT, volume: 0.5, durationInFrames: 120, note: 'S12 wordmark lands' },
  { from: sfxFrom(S.end.from + 70, SPARKLE), src: SPARKLE, volume: 0.3, note: 'S12 rule draws' },
];
export const sfxDuration = (c: Cue) => c.durationInFrames ?? 90;

export const Sound: React.FC<{ bgm: boolean }> = ({ bgm }) => (
  <>
    {bgm && (
      <Sequence from={BGM.startAt} durationInFrames={TOTAL - BGM.startAt}>
        <Audio src={staticFile(BGM.src)}
          volume={(f) => BGM.volume * interpolate(f, [0, 20, TOTAL - BGM.startAt - 75, TOTAL - BGM.startAt], [0, 1, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })} />
      </Sequence>
    )}
    {SFX.map((c, i) => (
      <Sequence key={i} from={c.from} durationInFrames={sfxDuration(c)}>
        <Audio src={staticFile('audio/sfx/' + c.src)} volume={c.volume} />
      </Sequence>
    ))}
  </>
);
