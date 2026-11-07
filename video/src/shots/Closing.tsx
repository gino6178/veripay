// S10 the recorded real-sandbox run (an ids card: the dashboard needs the user's PayPal login, which the film doesn't
// use), S12 the end card (outro-group-photo-launch grammar, light stage), S13 credits.
import React from 'react';
import { AbsoluteFill, Img, interpolate, staticFile, useCurrentFrame, Easing, Sequence } from 'remotion';
import { C, F, SHADOW, SHADOW_LG, rgba } from '../theme';
import { CaptionBand, Stamp, Ticks } from '../parts';
import { SHOTS } from '../timeline';
import { softShadow, SpeedBlur, velocity } from '../fx/Polish';

const cl = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;
const snappy = Easing.bezier(0.16, 1, 0.3, 1);

// docs/live-test/sandbox/runs.json run 11 → e2e-5.json (DP-1001) and payouts-2.json (read-back)
const RUN = [
  ['PayPal order', '8NH32642WM6787132', 'Orders v2 · intent AUTHORIZE'],
  ['Authorization', '14V86706TF351130H', 'held $247.05 (after a $47.05 change order)'],
  ['Capture', '8J703087NC2283128', '$232.05 captured: exactly what was due'],
  ['Payouts batch', 'UYBR5MJ2Y246G', 'SUCCESS'],
  ['Payout item → pro', '9Y225274PC3151649', '$208.84 · SUCCESS'],
] as const;

export const Sandbox: React.FC = () => {
  const f = useCurrentFrame();
  const d = SHOTS.sandbox.duration;
  const card = interpolate(f, [0, 20], [0, 1], { ...cl, easing: snappy });
  const out = interpolate(f, [d - 10, d], [1, 0], cl);
  return (
    <AbsoluteFill style={{ background: C.ground, opacity: out }}>
      <div style={{ position: 'absolute', left: 160, top: 56, opacity: card }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 12, padding: '10px 18px', borderRadius: 8, background: C.ink, color: '#fff', font: `600 26px/1 ${F.mono}`, letterSpacing: '0.06em' }}>RECORDED RUN ON PAYPAL'S SANDBOX</div>
        <div style={{ font: `800 66px/1.1 ${F.display}`, letterSpacing: '-0.03em', color: C.ink, marginTop: 24 }}>The same steps, with PayPal's real sandbox.</div>
        <div style={{ font: `500 28px/1.4 ${F.mono}`, color: C.ink3, marginTop: 14 }}>Run 11 · Nov 5, 2026 · job DP-1001 · sandbox test money</div>
      </div>
      <div style={{ position: 'absolute', left: 160, top: 360, width: 1600, borderRadius: 14, background: C.panel, border: `1px solid ${C.line}`, boxShadow: SHADOW_LG, padding: '14px 44px', opacity: card, transform: `translateY(${(1 - card) * 40}px)` }}>
        {RUN.map(([k, id, what], i) => {
          const at = 24 + i * 22; // one row at a time, ids typed like a machine writes them
          const t = interpolate(f, [at, at + 8], [0, 1], { ...cl, easing: snappy });
          const n = Math.floor(interpolate(f, [at + 2, at + 2 + id.length / 1.6], [0, id.length], cl));
          return (
            <div key={k} style={{ display: 'grid', gridTemplateColumns: '360px 520px 1fr', alignItems: 'baseline', padding: '20px 0', borderTop: i ? `1px solid ${C.line}` : 'none', opacity: t }}>
              <span style={{ font: `600 30px/1.2 ${F.text}`, color: C.ink2 }}>{k}</span>
              <span style={{ font: `600 34px/1.2 ${F.mono}`, color: C.ink, letterSpacing: '0.02em' }}>{id.slice(0, n)}{n < id.length && <span style={{ display: 'inline-block', width: 16, height: 30, background: C.signal, marginLeft: 2, verticalAlign: -4 }} />}</span>
              <span style={{ font: `500 28px/1.3 ${F.text}`, color: /SUCCESS/.test(what) ? C.ok : C.ink3 }}>{what}</span>
            </div>
          );
        })}
      </div>
      <div style={{ position: 'absolute', left: 160, top: 286, font: `600 32px/1.3 ${F.text}`, color: C.warn, opacity: interpolate(f, [12, 22], [0, 1], cl), width: 1600 }}>
        In this run the checks left the release to the customer, who released it. Sandbox test money only.
      </div>
      <Sequence from={10} durationInFrames={d - 10}><CaptionBand duration={d - 10} text="The demo server uses a PayPal stand-in. These ids are from a recorded run on PayPal's real sandbox." /></Sequence>
    </AbsoluteFill>
  );
};

// ── S12 end card: the film's representative elements fly in around the wordmark, then the lockup holds ─────────────
export type Piece = { src: string; w: number; h: number; x: number; y: number; rot: number; from: [number, number] };
export const End: React.FC<{ pieces: Piece[] }> = ({ pieces }) => {
  const f = useCurrentFrame();
  const d = SHOTS.end.duration;
  // crane: the whole group settles from a slight tilt
  const crane = interpolate(f, [0, 40], [0, 1], { ...cl, easing: Easing.bezier(0.2, 0, 0.25, 1) });
  const push = 1 + 0.03 * interpolate(f, [36, d], [0, 1], { ...cl, easing: Easing.bezier(0.45, 0, 0.55, 1) });
  const back = interpolate(f, [42, 50], [0, 1], cl);
  const fly = Easing.bezier(0.34, 1.4, 0.44, 1); // lands past 1 (the card's lesson: a landing must overshoot)
  const mark = interpolate(f, [38, 50], [0, 1], { ...cl, easing: snappy });
  const word = 'VeriPay'.split('');
  const rule = interpolate(f, [62, 74], [0, 1], { ...cl, easing: Easing.bezier(0.3, 0, 0.2, 1) });
  const lines = interpolate(f, [80, 96], [0, 1], { ...cl, easing: snappy });
  const stage = interpolate(f, [42, 50, 58], [0, 0.5, 0.25], cl);
  return (
    <AbsoluteFill style={{ background: C.ground, overflow: 'hidden' }}>
      <div style={{ position: 'absolute', inset: 0, background: `radial-gradient(ellipse 40% 46% at 50% 46%, ${rgba(C.signal, 0.10 * stage + 0.03)} 0%, ${rgba(C.signal, 0)} 70%)` }} />
      <AbsoluteFill style={{ transform: `perspective(1400px) rotateX(${4 * (1 - crane)}deg) scale(${(1.06 - 0.06 * crane) * push})`, transformOrigin: '50% 60%' }}>
        {pieces.map((p, i) => {
          const cue = 4 + i * 3;
          const posAt = (fr: number) => { const t = fly(Math.min(1, Math.max(0, (fr - cue) / 12))); return { x: p.x + p.from[0] * (1 - t), y: p.y + p.from[1] * (1 - t), t }; };
          const s = posAt(f);
          if (f < cue) return null;
          const v = velocity((fr) => posAt(fr).x, f), vy = velocity((fr) => posAt(fr).y, f);
          const press = interpolate(f, [cue + 9, cue + 12, cue + 16], [0, 1, 0], cl);
          const body = (
            <div style={{ position: 'absolute', left: s.x, top: s.y, width: p.w, height: p.h, borderRadius: 12, overflow: 'hidden', background: C.panel,
              transform: `rotate(${p.rot * (1 + (1 - s.t))}deg) scale(${(1.12 - 0.12 * s.t) * (1 - 0.015 * press)})`, opacity: (1 - 0.12 * back), filter: `saturate(${1 - 0.08 * back})`,
              boxShadow: softShadow(4 + 30 * (1 - s.t), { color: '#001C64', strength: 0.9 }), border: `1px solid ${C.line}` }}>
              <Img src={staticFile(p.src)} style={{ width: p.w, height: p.h, objectFit: 'cover' }} />
            </div>
          );
          return Math.hypot(v, vy) > 2 ? <SpeedBlur key={i} vx={v} vy={vy} amount={0.3} max={22}>{body}</SpeedBlur> : <React.Fragment key={i}>{body}</React.Fragment>;
        })}
        {/* the lockup */}
        <div style={{ position: 'absolute', left: 0, right: 0, top: 290, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <div style={{ padding: '44px 70px 40px', borderRadius: 18, background: C.panel, boxShadow: SHADOW_LG, border: `1px solid ${C.line}`, display: 'flex', flexDirection: 'column', alignItems: 'center', opacity: mark }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 22 }}>
              <svg width={92} height={92} viewBox="0 0 24 24" fill="none" stroke={C.signal} strokeWidth={2.4} strokeLinecap="square" style={{ transform: `scale(${1.4 - 0.4 * mark})` }}><rect x="3.5" y="3.5" width="17" height="17" /><path d="m7.5 12.5 3 3 6-7" /></svg>
              <div style={{ font: `800 112px/1 ${F.display}`, letterSpacing: '-0.035em', color: C.primary, display: 'flex' }}>
                {word.map((ch, i) => { const t = interpolate(f, [42 + i * 1.8, 50 + i * 1.8], [0, 1], { ...cl, easing: Easing.bezier(0.2, 0.75, 0.3, 1) }); return <span key={i} style={{ display: 'inline-block', whiteSpace: 'pre', opacity: t, transform: `scale(${1.28 - 0.28 * t})`, filter: `blur(${(1 - t) * 6}px)` }}>{ch}</span>; })}
              </div>
            </div>
            <div style={{ height: 5, width: 760, background: C.signal, borderRadius: 3, margin: '26px 0 22px', transform: `scaleX(${rule})` }} />
            <div style={{ font: `700 54px/1.1 ${F.display}`, letterSpacing: '-0.025em', color: C.ink, opacity: rule }}>The money waits <span style={{ color: C.signal }}>for the proof.</span></div>
          </div>
          <div style={{ marginTop: 34, opacity: lines, textAlign: 'center' }}>
            <div style={{ font: `700 30px/1 ${F.text}`, color: C.ink3, letterSpacing: '0.02em' }}>Built on PayPal</div>
            <div style={{ font: `500 30px/1.45 ${F.text}`, color: C.ink, marginTop: 12, width: 980 }}>Orders (authorize / capture) · Vault · Payouts · Refunds · Disputes · Invoicing · JS SDK v6 · Agent Toolkit</div>
            <div style={{ font: `500 30px/1.5 ${F.text}`, color: C.ink3, marginTop: 18 }}>PayPal AI Hackathon 2026 · demo server with a PayPal stand-in · demo pros are fictional</div>
          </div>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

export type Credit = { what: string; who: string; license: string };
export const Credits: React.FC<{ photos: Credit[] }> = ({ photos }) => {
  const f = useCurrentFrame();
  const d = SHOTS.credits.duration;
  const o = interpolate(f, [0, 10, d - 12, d], [0, 1, 1, 0], cl);
  return (
    <AbsoluteFill style={{ background: C.ground, opacity: o, padding: '90px 160px', fontFamily: F.text, color: C.ink }}>
      <div style={{ font: `800 54px/1 ${F.display}`, letterSpacing: '-0.03em' }}>Credits</div>
      <div style={{ font: `700 30px/1.35 ${F.text}`, color: C.ink3, marginTop: 34, letterSpacing: '0.04em' }}>Photos in the demo job: Wikimedia Commons, re-dated to the job (list at /api/credits)</div>
      {photos.map((p, i) => <div key={i} style={{ font: `500 30px/1.35 ${F.text}`, marginTop: 14, color: C.ink2 }}>{p.what} · {p.who} · {p.license}</div>)}
      <div style={{ font: `700 30px/1.35 ${F.text}`, color: C.ink3, marginTop: 40, letterSpacing: '0.04em' }}>Music · sound</div>
      <div style={{ font: `500 30px/1.35 ${F.text}`, marginTop: 14, color: C.ink2 }}>"House Vibez" by Lily J (Mixkit Stock Music Free License) · sound effects from Freesound, CC0</div>
      <div style={{ font: `500 30px/1.35 ${F.text}`, marginTop: 40, color: C.ink2 }}>People, pros and companies in the demo are fictional. The demo server uses a PayPal stand-in; the sandbox run is PayPal's sandbox with test money.</div>
    </AbsoluteFill>
  );
};
