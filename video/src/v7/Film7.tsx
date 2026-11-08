// Film v7: the cover, the pain animation (its own music, the voice over it), v5's shots played 1.5x out of the
// picture-only v5 render (public/v7/v5-picture.mp4), and the four new shots. Voice 1.5x (vo9), captions from its
// timings, v5's SFX moved to where their pictures now play, the film BGM from shot 2 on, ducked under the voice.
// Versions: {bgm:true} · {bgm:false} (no film BGM; the pain animation's own music stays, it's part of that shot).
import React from 'react';
import { AbsoluteFill, Audio, Easing, OffthreadVideo, Sequence, interpolate, staticFile, useCurrentFrame } from 'remotion';
import { C, F } from '../theme';
import { FontsReady } from '../Fonts';
import { SFX5 } from '../v5/Film5';
import { SHOTS7, S7, CAPTIONS7, TOTAL7, PAIN_VO, VOICE_SPANS, fromV5, srcAt, FPS } from './timeline7';
import { V7Pain, V7Impact, V7Novel, V7Features, V7Product, GridLabels } from './new7';

type Shot = (typeof SHOTS7)[number];
const cl = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;

// 3b's list shows two real Austin businesses (not on VeriPay); in the film they become made-up names and addresses
const FakeNames: React.FC = () => (
  <div style={{ position: 'absolute', left: 240, top: 578, width: 326, height: 130, background: '#FFFFFF' }}>
    <div style={{ position: 'absolute', left: -40, right: -8, top: 65, height: 1, background: '#E6EAF0' }} />
    {[['Westside Plumbing', '2 mi · 1200 Example Ave, Austin'], ['Riverbend Pipe Co.', '3.8 mi · 45 Sample St, Austin']].map(([n, a], i) => (
      <div key={n} style={{ position: 'absolute', left: 7, top: 4 + i * 75 }}>
        <div style={{ font: `600 18px/1.25 ${F.text}`, color: C.ink2 }}>{n}</div>
        <div style={{ font: `400 15px/1.3 ${F.text}`, color: C.ink3, marginTop: 7 }}>{a}</div>
      </div>
    ))}
  </div>
);

// camera on v5's pictures: [fraction of the v5 shot, scale, origin x, origin y] — moves in and out of the cards that carry
// the story (the bargain, +$47.05 and the PIN, the flagged note, Paid and the Payouts line, the AG Grid back office)
const CAM: Record<string, [number, number, number, number][]> = {
  find: [[0, 1, 150, 40], [0.04, 1.3, 150, 40], [0.13, 1.3, 150, 40], [0.19, 1, 150, 40], [0.36, 1, 240, 50], [0.42, 1.3, 240, 50], [0.64, 1.3, 240, 50], [0.7, 1, 240, 50]],
  hold: [[0.1, 1, 40, 40], [0.18, 1.4, 40, 40], [0.84, 1.4, 40, 40], [0.92, 1, 40, 40]],
  checks: [[0.44, 1, 60, 60], [0.5, 1.35, 60, 60], [0.8, 1.35, 60, 60], [0.85, 1, 60, 60]],
  paid: [[0, 1, 40, 100], [0.06, 1.5, 40, 100], [0.38, 1.5, 40, 100], [0.46, 1, 40, 100], [0.48, 1, 1890, 20], [0.56, 1.3, 1890, 20]],
  scale: [[0.255, 1, 50, 600], [0.275, 1.3, 50, 600], [0.32, 1.3, 50, 600], [0.336, 1, 50, 600]],
};
const ease = Easing.bezier(0.45, 0, 0.2, 1);
const camAt = (k: [number, number, number, number][], t: number) => {
  if (t <= k[0][0]) return k[0];
  for (let i = 1; i < k.length; i++) if (t < k[i][0]) {
    const [t0, ...a] = k[i - 1], [t1, ...b] = k[i], u = ease((t - t0) / (t1 - t0));
    return [t, ...a.map((v, j) => v + (b[j] - v) * u)];
  }
  return k[k.length - 1];
};
const V5Shot: React.FC<{ s: Shot }> = ({ s }) => {
  const f = useCurrentFrame(), k = CAM[s.id];
  const [, sc, ox, oy] = k ? camAt(k, srcAt(s, f) / s.srcDur) : [0, 1, 0, 0];
  const video = (from: number, rate: number, dur: number, at = 0) => (
    <Sequence from={at} durationInFrames={dur}><OffthreadVideo src={staticFile('v7/v5-picture.mp4')} trimBefore={Math.round(s.srcFrom + from)} playbackRate={rate} muted style={{ width: 1920, height: 1080 }} /></Sequence>
  );
  const g = s.seg;
  return (
    <AbsoluteFill style={{ background: C.ground, overflow: 'hidden' }}>
      <AbsoluteFill style={{ transform: `scale(${sc})`, transformOrigin: `${ox}px ${oy}px` }}>
        {g ? <>{video(0, s.rate, g.a)}{video(g.from, (g.to - g.from) / g.b, g.b, g.a)}{video(g.to, s.rate, s.duration - g.a - g.b, g.a + g.b)}</> : video(0, s.rate, s.duration)}
        {s.id === 'find' && <Sequence durationInFrames={Math.round(140 / s.rate)}><FakeNames /></Sequence>}
      </AbsoluteFill>
      {s.id === 'scale' && g && <Sequence from={g.a + 24} durationInFrames={g.b - 30}><GridLabels dur={g.b - 30} /></Sequence>}
    </AbsoluteFill>
  );
};

// captions: one line on a thin translucent band
const Caption7: React.FC<{ text: string; duration: number }> = ({ text, duration }) => {
  const f = useCurrentFrame(), o = interpolate(f, [0, 6, duration - 6, duration], [0, 1, 1, 0], cl);
  return (
    <div style={{ position: 'absolute', left: 0, right: 0, bottom: 40, display: 'flex', justifyContent: 'center', opacity: o }}>
      <div style={{ padding: '8px 26px 10px', borderRadius: 10, background: 'rgba(0, 28, 100, 0.74)', color: '#fff', font: `500 42px/1.2 ${F.text}`, letterSpacing: '-0.005em', whiteSpace: 'nowrap' }}>{text}</div>
    </div>
  );
};
const NEW: Record<string, React.ReactNode> = { impact: <V7Impact />, novel: <V7Novel />, features: <V7Features />, product: <V7Product /> };

// v5's sound effects at their pictures' new times (the replaced S1 problem shot's are dropped), plus the new shots'
const F_SFX = [
  ...SFX5.map((x) => ({ ...x, from: fromV5(x.from) })).filter((x) => x.from != null),
  { from: S7.impact.from + 4, src: 'fs-701104.mp3', volume: 0.4, note: '2a title' },
  { from: S7.novel.from + 4, src: 'fs-701104.mp3', volume: 0.4, note: '8a title' },
  { from: S7.features.from + 4, src: 'fs-701104.mp3', volume: 0.4, note: '11a first number' },
  ...[0, 1, 2, 3, 4, 5].map((i) => ({ from: S7.product.from + 6 + Math.round(((S7.product.duration - 30) / 6) * i), src: 'fs-683101.mp3', volume: 0.32, note: `12a cut ${i + 1}` })),
] as { from: number; src: string; volume: number; durationInFrames?: number; note: string }[];

const BGM_FROM = S7.solution.from;
const voiceOn = (f: number) => VOICE_SPANS.some(([a, b]) => f >= a - 6 && f <= b + 6);

export const Film7: React.FC<{ bgm?: boolean; captions?: boolean; sfx?: boolean }> = ({ bgm = true, captions = true, sfx = true }) => (
  <AbsoluteFill style={{ background: C.ground }}>
    <FontsReady />
    {SHOTS7.map((s) => (
      <Sequence key={s.id} from={s.from} durationInFrames={s.duration} name={s.label}>
        {s.kind === 'pain' ? <V7Pain music /> : s.kind === 'new' ? NEW[s.id]
          : <V5Shot s={s} />}
      </Sequence>
    ))}
    {captions && CAPTIONS7.map((c, i) => <Sequence key={'c' + i} from={c.from} durationInFrames={c.duration}><Caption7 duration={c.duration} text={c.text} /></Sequence>)}
    {PAIN_VO.map((p) => <Sequence key={p.id} from={S7.pain.from + Math.round(p.at * FPS)} durationInFrames={S7.pain.duration}><Audio src={staticFile(`audio/vo9/${p.id}.wav`)} volume={1.26} /></Sequence>)}
    {SHOTS7.filter((s) => s.voFile && s.voFrom != null).map((s) => {
      if (!s.voDelay) return <Sequence key={'v' + s.id} from={s.voFrom!} durationInFrames={s.duration}><Audio src={staticFile(s.voFile!)} /></Sequence>;
      // a stretched shot: the voice in two parts, the second after the stretch
      const cut = Math.round((s.vo![s.voSplit].start - s.voDelay / FPS) * FPS) - 3;
      return <React.Fragment key={'v' + s.id}>
        <Sequence from={s.voFrom!} durationInFrames={cut}><Audio src={staticFile(s.voFile!)} /></Sequence>
        <Sequence from={s.voFrom! + cut + s.voDelay} durationInFrames={s.duration}><Audio src={staticFile(s.voFile!)} trimBefore={cut} /></Sequence>
      </React.Fragment>;
    })}
    {bgm && <Sequence from={BGM_FROM}><Audio src={staticFile('audio/bgm/bgm-film.mp3')} volume={(f) => (voiceOn(f + BGM_FROM) ? 0.04 : 0.1) * interpolate(f, [0, 20, TOTAL7 - BGM_FROM - 60, TOTAL7 - BGM_FROM], [0, 1, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })} /></Sequence>}
    {sfx && F_SFX.map((x, i) => <Sequence key={'s' + i} from={x.from} durationInFrames={x.durationInFrames ?? 90}><Audio src={staticFile('audio/sfx/' + x.src)} volume={x.volume} /></Sequence>)}
  </AbsoluteFill>
);
