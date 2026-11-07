// S11 montage: a rail of real pages (shot-transitions · whip-pan / WhipBrakeReal grammar): a velocity curve integrated
// to position (3 f smooth start, exponential decay = whip then a long braking tail), directional speed blur, a fixed
// playhead; the AG Grid stop runs a short crane-rise (one row up close → the grid).
import React from 'react';
import { AbsoluteFill, Img, interpolate, staticFile, useCurrentFrame, Easing, Sequence } from 'remotion';
import { C, F, SHADOW_LG } from '../theme';
import { CaptionBand } from '../parts';
import { SHOTS } from '../timeline';
import { SpeedBlur } from '../fx/Polish';

const cl = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;
export type Stop = { src: string; pageW: number; crop: { x: number; y: number; w: number; h: number }; label: string; crane?: { x: number; y: number; zoom: number } };

const CARD_W = 1360, CARD_H = 700, GAP = 160, PITCH = CARD_W + GAP;
// WhipBrakeReal's speed profile, integrated (deterministic table): 3 f smoothstep start, then e^(-6u/60) decay over 60 f
const STEP = 0.05;
const TABLE = (() => {
  const n = Math.round(60 / STEP), out = new Float64Array(n + 1);
  const vel = (u: number) => { const r = Math.min(1, u / 3); return Math.exp((-6 * u) / 60) * r * r * (3 - 2 * r); };
  for (let i = 1; i <= n; i++) out[i] = out[i - 1] + ((vel((i - 1) * STEP) + vel(i * STEP)) / 2) * STEP;
  for (let i = 0; i <= n; i++) out[i] /= out[n];
  return out;
})();
const WHIP_LEN = 30; // the demo's 60 f curve, played in 40 f (five stops in 13.5 s)
const prog = (u0: number) => { const u = (u0 * 60) / WHIP_LEN; return u <= 0 ? 0 : u >= 60 ? 1 : TABLE[Math.round(u / STEP)]; };
export const WHIPS = [76, 154, 232, 310]; // frames where each whip starts (60 f each: ~12 f blur, then the brake)

export const Montage: React.FC<{ stops: Stop[] }> = ({ stops }) => {
  const f = useCurrentFrame();
  const d = SHOTS.montage.duration;
  const posAt = (fr: number) => WHIPS.reduce((a, w) => a + prog(fr - w), 0) * PITCH;
  const x = posAt(f), v = posAt(f + 0.5) - posAt(f - 0.5);
  const cur = Math.min(stops.length - 1, Math.round(x / PITCH));
  const out = interpolate(f, [d - 10, d], [1, 0], cl);
  return (
    <AbsoluteFill style={{ background: C.ground, opacity: out }}>
      {/* index counter + label of the stop under the playhead */}
      <div style={{ position: 'absolute', left: 240, top: 44, display: 'flex', alignItems: 'baseline', gap: 26 }}>
        <span style={{ font: `800 64px/1 ${F.display}`, color: C.primary, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.03em' }}>{String(cur + 1).padStart(2, '0')}<span style={{ color: C.ink3, fontSize: 34 }}> / {String(stops.length).padStart(2, '0')}</span></span>
        <span style={{ font: `600 34px/1.2 ${F.text}`, color: C.ink, opacity: Math.abs(v) > 20 ? 0.25 : 1 }}>{stops[cur].label}</span>
      </div>
      <SpeedBlur vx={-v} amount={0.06} max={16}>
        {stops.map((s, i) => {
          const left = 960 - CARD_W / 2 + i * PITCH - x;
          if (left > 1920 || left + CARD_W < 0) return null;
          const k = CARD_W / s.crop.w;
          // the crane on a stop: from one row up close to the whole crop, during the hold after its brake
          let z = 1, fx = s.crop.w / 2, fy = s.crop.h / 2;
          if (s.crane) {
            const arrive = WHIPS[i - 1] ?? 0;
            const e = interpolate(f, [arrive + 34, arrive + 92], [0, 1], { ...cl, easing: Easing.bezier(0.2, 0, 0.25, 1) });
            z = s.crane.zoom + (1 - s.crane.zoom) * e;
            fx = s.crane.x + (s.crop.w / 2 - s.crane.x) * e; fy = s.crane.y + (s.crop.h / 2 - s.crane.y) * e;
          }
          const scale = k * z;
          const tx = CARD_W / 2 - fx * scale, ty = Math.min(0, Math.max(CARD_H - s.crop.h * scale, CARD_H / 2 - fy * scale));
          const dim = i === cur ? 1 : 0.55;
          return (
            <div key={i} style={{ position: 'absolute', left, top: 160, width: CARD_W, height: CARD_H, borderRadius: 14, overflow: 'hidden', background: C.panel, border: `1px solid ${C.line}`, boxShadow: SHADOW_LG, opacity: dim }}>
              <Img src={staticFile(s.src)} style={{ position: 'absolute', left: tx - s.crop.x * scale, top: ty - s.crop.y * scale, width: s.pageW * scale }} />
            </div>
          );
        })}
      </SpeedBlur>
      {/* the fixed playhead */}
      <div style={{ position: 'absolute', left: 959, top: 150, width: 2, height: 20, background: C.signal }} />
      <svg width={28} height={16} style={{ position: 'absolute', left: 946, top: 136 }}><path d="M0 0 H28 L14 16 Z" fill={C.signal} /></svg>
      <Sequence from={6} durationInFrames={190}><CaptionBand duration={190} text="Eleven rounds of AI agents tried to break it, as customers, pros and attackers." /></Sequence>
      <Sequence from={200} durationInFrames={d - 200}><CaptionBand duration={d - 200} text="Every path that moves money goes through one guard." /></Sequence>
    </AbsoluteFill>
  );
};
