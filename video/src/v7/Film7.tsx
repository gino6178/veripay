// Film v7: the cover, the pain animation (its own music, the voice over it), v5's shots played 1.5x out of the
// picture-only v5 render (public/v7/v5-picture.mp4), and the four new shots. Voice 1.5x (vo9), captions from its
// timings, v5's SFX moved to where their pictures now play, the film BGM from shot 2 on, ducked under the voice.
// Versions: {bgm:true} · {bgm:false} (no film BGM; the pain animation's own music stays, it's part of that shot).
import React from 'react';
import { AbsoluteFill, Audio, OffthreadVideo, Sequence, interpolate, staticFile } from 'remotion';
import { C } from '../theme';
import { FontsReady } from '../Fonts';
import { CaptionBand } from '../parts';
import { SFX5 } from '../v5/Film5';
import { SHOTS7, S7, CAPTIONS7, TOTAL7, PAIN_VO, VOICE_SPANS, fromV5, FPS } from './timeline7';
import { V7Pain, V7Impact, V7Novel, V7Features, V7Product } from './new7';

const NEW: Record<string, React.ReactNode> = { impact: <V7Impact />, novel: <V7Novel />, features: <V7Features />, product: <V7Product /> };

// v5's sound effects at their pictures' new times (the replaced S1 problem shot's are dropped), plus the new shots'
const F_SFX = [
  ...SFX5.map((x) => ({ ...x, from: fromV5(x.from) })).filter((x) => x.from != null),
  { from: S7.impact.from + 4, src: 'fs-701104.mp3', volume: 0.4, note: '2a title' },
  { from: S7.novel.from + 4, src: 'fs-701104.mp3', volume: 0.4, note: '8a title' },
  { from: S7.features.from + 4, src: 'fs-701104.mp3', volume: 0.4, note: '11a first number' },
  ...[0, 1, 2, 3, 4, 5].map((i) => ({ from: S7.product.from + Math.round((S7.product.duration / 6) * i), src: 'fs-683101.mp3', volume: 0.32, note: `12a cut ${i + 1}` })),
] as { from: number; src: string; volume: number; durationInFrames?: number; note: string }[];

const BGM_FROM = S7.solution.from;
const voiceOn = (f: number) => VOICE_SPANS.some(([a, b]) => f >= a - 6 && f <= b + 6);

export const Film7: React.FC<{ bgm?: boolean; captions?: boolean; sfx?: boolean }> = ({ bgm = true, captions = true, sfx = true }) => (
  <AbsoluteFill style={{ background: C.ground }}>
    <FontsReady />
    {SHOTS7.map((s) => (
      <Sequence key={s.id} from={s.from} durationInFrames={s.duration} name={s.label}>
        {s.kind === 'pain' ? <V7Pain music /> : s.kind === 'new' ? NEW[s.id]
          : <OffthreadVideo src={staticFile('v7/v5-picture.mp4')} trimBefore={Math.round(s.srcFrom)} playbackRate={s.rate} muted style={{ width: 1920, height: 1080 }} />}
      </Sequence>
    ))}
    {captions && CAPTIONS7.map((c, i) => <Sequence key={'c' + i} from={c.from} durationInFrames={c.duration}><CaptionBand duration={c.duration} text={c.text} /></Sequence>)}
    {PAIN_VO.map((p) => <Sequence key={p.id} from={S7.pain.from + Math.round(p.at * FPS)} durationInFrames={S7.pain.duration}><Audio src={staticFile(`audio/vo9/${p.id}.wav`)} /></Sequence>)}
    {SHOTS7.filter((s) => s.voFile && s.voFrom != null).map((s) => <Sequence key={'v' + s.id} from={s.voFrom!} durationInFrames={s.duration}><Audio src={staticFile(s.voFile!)} /></Sequence>)}
    {bgm && <Sequence from={BGM_FROM}><Audio src={staticFile('audio/bgm/bgm-film.mp3')} volume={(f) => (voiceOn(f + BGM_FROM) ? 0.04 : 0.1) * interpolate(f, [0, 20, TOTAL7 - BGM_FROM - 60, TOTAL7 - BGM_FROM], [0, 1, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })} /></Sequence>}
    {sfx && F_SFX.map((x, i) => <Sequence key={'s' + i} from={x.from} durationInFrames={x.durationInFrames ?? 90}><Audio src={staticFile('audio/sfx/' + x.src)} volume={x.volume} /></Sequence>)}
  </AbsoluteFill>
);
