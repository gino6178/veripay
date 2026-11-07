// S0 cover, S1 the two sides (quad-split-parallel-scenes, 1×2), S2 the numbers (paper-title-card) + the paid work order.
import React from 'react';
import { AbsoluteFill, Img, interpolate, staticFile, useCurrentFrame, Easing, Sequence } from 'remotion';
import { C, F, SHADOW, SHADOW_LG, rgba } from '../theme';
import { CaptionBand, Odo, Stamp, TitleCard, Ticks, Honest } from '../parts';
import { SHOTS } from '../timeline';

const cl = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;
const snappy = Easing.bezier(0.16, 1, 0.3, 1);

// ── S0: the cover (rendered from submission/cover.html without its stamp), slow push, PAID lands ───────────────────
export const Cover: React.FC = () => {
  const f = useCurrentFrame();
  const d = SHOTS.cover.duration;
  const push = interpolate(f, [0, d], [1, 1.025], { ...cl, easing: Easing.bezier(0.4, 0, 0.2, 1) });
  const out = interpolate(f, [d - 10, d], [1, 0], cl);
  return (
    <AbsoluteFill style={{ background: C.ground }}>
      <AbsoluteFill style={{ transform: `scale(${push})`, transformOrigin: '30% 50%', opacity: out }}>
        <Img src={staticFile('textures/cover-nostamp.png')} style={{ width: 1920, height: 1080 }} />
        {/* same box as .paid in cover.html */}
        <Stamp kind="paid" text="PAID" small="every condition passed" size={40} at={14} style={{ left: 1010, top: 760 }} />
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

// ── S1: two panes, the same night from two sides. Events are off-beat (≥3 f apart) per quad-split. ───────────────
const PANE_W = 944;
const Faucet: React.FC<{ f: number }> = ({ f }) => {
  // a drop every 42 f: grows at the spout, falls, ripples (deterministic)
  const k = (f + 12) % 42, grow = Math.min(1, k / 18), fall = k > 18 ? (k - 18) / 10 : 0;
  const y = 236 + (fall > 0 ? Math.min(1, fall) ** 2 * 120 : 0);
  const ripple = k > 28 ? (k - 28) / 14 : 0;
  return (
    <svg width={420} height={420} viewBox="0 0 420 420" style={{ position: 'absolute', left: 60, top: 300 }}>
      <path d="M70 120 H250 Q290 120 290 160 V214" fill="none" stroke={C.ink} strokeWidth={22} strokeLinecap="round" />
      <rect x={120} y={84} width={70} height={24} rx={6} fill={C.ink} />
      <rect x={146} y={60} width={18} height={30} rx={4} fill={C.ink} />
      <rect x={270} y={206} width={40} height={22} rx={6} fill={C.ink} />
      {fall < 1 && <ellipse cx={290} cy={y} rx={7 * (0.6 + 0.4 * grow)} ry={10 * (0.6 + 0.4 * grow)} fill={C.signal} opacity={0.9} />}
      <ellipse cx={290} cy={372} rx={120} ry={16} fill={C.signalSoft} />
      {ripple > 0 && ripple < 1 && <ellipse cx={290} cy={372} rx={20 + 90 * ripple} ry={4 + 10 * ripple} fill="none" stroke={C.signal} strokeWidth={3} opacity={1 - ripple} />}
    </svg>
  );
};
const PhoneCard: React.FC<{ children: React.ReactNode; x: number; y: number; t: number }> = ({ children, x, y, t }) => (
  <div style={{ position: 'absolute', left: x, top: y + (1 - t) * 60, opacity: t, width: 380, borderRadius: 40, padding: 12, background: '#1B2433', boxShadow: SHADOW_LG }}>
    <div style={{ borderRadius: 30, background: C.panel, padding: '34px 26px 28px', minHeight: 420 }}>{children}</div>
  </div>
);
export const Split: React.FC<{ dur?: number; captions?: boolean }> = ({ dur, captions = true }) => {
  const f = useCurrentFrame();
  const d = dur ?? SHOTS.split.duration;
  const inL = interpolate(f, [0, 18], [0, 1], { ...cl, easing: snappy });
  const inR = interpolate(f, [5, 23], [0, 1], { ...cl, easing: snappy }); // off-beat by 5 f
  const cardL = interpolate(f, [20, 38], [0, 1], { ...cl, easing: snappy });
  const cardR = interpolate(f, [29, 47], [0, 1], { ...cl, easing: snappy });
  const headL = interpolate(f, [46, 60], [0, 1], { ...cl, easing: snappy });
  const headR = interpolate(f, [55, 69], [0, 1], { ...cl, easing: snappy });
  const days = Math.round(interpolate(f, [40, 120], [1, 45], { ...cl, easing: Easing.bezier(0.3, 0, 0.2, 1) }));
  const stampDue = interpolate(f, [126, 136], [0, 1], { ...cl, easing: snappy });
  const out = interpolate(f, [d - 10, d], [1, 0], cl);
  const pane = (side: 0 | 1, t: number): React.CSSProperties => ({
    position: 'absolute', top: 0, bottom: 0, left: side ? 960 + 8 : 0, width: PANE_W + 8, overflow: 'hidden',
    background: side ? C.panel : C.inset, transform: `translateX(${(1 - t) * (side ? 80 : -80)}px)`, opacity: t,
  });
  const head = (t: number): React.CSSProperties => ({ position: 'absolute', left: 64, top: 74, font: `800 72px/1.05 ${F.display}`, letterSpacing: '-0.035em', color: C.ink, opacity: t, transform: `translateY(${(1 - t) * 24}px)` });
  const who: React.CSSProperties = { position: 'absolute', left: 66, top: 256, font: `500 28px/1 ${F.mono}`, color: C.ink3, letterSpacing: '0.02em' };
  return (
    <AbsoluteFill style={{ background: C.ground, opacity: out }}>
      <div style={pane(0, inL)}>
        <div style={head(headL)}>Pay up front<br /><span style={{ color: C.signal }}>and hope.</span></div>
        <div style={{ ...who, opacity: headL }}>MARIA · HOMEOWNER · 2:14 AM</div>
        <Faucet f={f} />
        <PhoneCard x={500} y={300} t={cardL}>
          <div style={{ font: `600 22px/1 ${F.mono}`, color: C.ink3, letterSpacing: '0.04em' }}>QUOTE · FAUCET</div>
          <div style={{ font: `800 64px/1.1 ${F.display}`, color: C.ink, marginTop: 22, letterSpacing: '-0.03em' }}>$180.00</div>
          <div style={{ height: 1, background: C.line, margin: '22px 0' }} />
          <div style={{ font: `600 30px/1.3 ${F.text}`, color: C.bad }}>50% deposit due now</div>
          <div style={{ font: `500 26px/1.35 ${F.text}`, color: C.ink2, marginTop: 10 }}>Pay $90.00 to book.<br />Work starts next week.</div>
          <div style={{ marginTop: 26, height: 62, borderRadius: 10, background: C.primary, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', font: `700 28px ${F.text}` }}>Pay deposit</div>
        </PhoneCard>
      </div>
      <div style={pane(1, inR)}>
        <div style={head(headR)}>Finish the job<br /><span style={{ color: C.signal }}>and wait.</span></div>
        <div style={{ ...who, opacity: headR }}>LUIS · PLUMBER · IN THE TRUCK</div>
        <div style={{ position: 'absolute', left: 120, top: 310, width: 700, opacity: cardR, transform: `translateY(${(1 - cardR) * 60}px)`, borderRadius: 16, background: C.panel, border: `1px solid ${C.line}`, boxShadow: SHADOW_LG, padding: '36px 40px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', font: `600 24px/1 ${F.mono}`, color: C.ink3, letterSpacing: '0.04em' }}><span>INVOICE #1047</span><span>WATER HEATER</span></div>
          <div style={{ font: `800 76px/1.1 ${F.display}`, color: C.ink, marginTop: 24, letterSpacing: '-0.03em' }}>$1,240.00</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', rowGap: 14, marginTop: 26, font: `500 28px/1.2 ${F.text}`, color: C.ink2 }}>
            <span>Work finished</span><span style={{ fontFamily: F.mono, fontSize: 25 }}>Sep 21</span>
            <span>Payment received</span><span style={{ fontFamily: F.mono, fontSize: 25, color: C.ink3 }}>—</span>
          </div>
          <div style={{ marginTop: 30, display: 'flex', alignItems: 'baseline', gap: 16 }}>
            <span style={{ font: `800 96px/1 ${F.display}`, color: C.bad, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.04em' }}>{days}</span>
            <span style={{ font: `600 32px/1.2 ${F.text}`, color: C.bad }}>days overdue</span>
          </div>
          <div style={{ position: 'absolute', right: 40, bottom: 40, transform: `rotate(-4deg) scale(${1.5 - 0.5 * stampDue})`, opacity: stampDue, border: `3px solid ${C.bad}`, outline: `2px solid ${C.bad}`, outlineOffset: 4, padding: '10px 16px 8px', font: `600 30px/1 ${F.mono}`, color: C.bad, letterSpacing: '0.1em' }}>UNPAID</div>
        </div>
      </div>
      <div style={{ position: 'absolute', left: 952, top: 0, bottom: 0, width: 16, background: C.ground }} />
      {captions && <Sequence from={14} durationInFrames={104}><CaptionBand duration={104} text="Maria doesn't want to pay a plumber before the leak is fixed." /></Sequence>}
      {captions && <Sequence from={122} durationInFrames={d - 122}><CaptionBand duration={d - 122} text="Luis doesn't want to wait six weeks to get paid for fixing it." /></Sequence>}
    </AbsoluteFill>
  );
};

// ── S2: two numbers (letterpress cards), then the two sides close onto the paid work order + the line ─────────────
export const Problem: React.FC<{ homeHero: string; heroW: number; heroH: number }> = ({ homeHero, heroW, heroH }) => {
  const f = useCurrentFrame();
  const d = SHOTS.problem.duration;
  const M = 210; // merge starts
  const sub = (s: string) => <span>{s}</span>;
  const close = interpolate(f, [M, M + 22], [0, 1], { ...cl, easing: Easing.bezier(0.65, 0, 0.35, 1) });
  const sheet = interpolate(f, [M + 12, M + 34], [0, 1], { ...cl, easing: snappy });
  const s = Math.min(1.25, 980 / heroW, 760 / heroH);
  return (
    <AbsoluteFill style={{ background: C.ground }}>
      <Sequence durationInFrames={105}>
        <TitleCard duration={105} size={100} text="Home-repair scams: the median loss is *$1,405.*"
          sub={sub('BBB Scam Tracker, 2025 Risk Report (home improvement)')} />
      </Sequence>
      <Sequence from={105} durationInFrames={105}>
        <TitleCard duration={105} size={100} text="*59%* of small businesses have invoices 30+ days overdue."
          sub={sub('Intuit QuickBooks, 2026 Small Business Late Payments Report')} />
      </Sequence>
      {f >= M && (
        <AbsoluteFill>
          {/* the two sides close like doors onto the paid work order */}
          <div style={{ position: 'absolute', top: 0, bottom: 0, left: 0, width: 960, background: C.inset, transform: `translateX(${-960 * close}px)` }} />
          <div style={{ position: 'absolute', top: 0, bottom: 0, left: 960, width: 960, background: C.panel, transform: `translateX(${960 * close}px)` }} />
          <div style={{ position: 'absolute', left: 1000, top: 90 + (1 - sheet) * 40, opacity: sheet }}>
            <div style={{ width: heroW * s, height: heroH * s, borderRadius: 10, overflow: 'hidden', boxShadow: SHADOW_LG, border: `1px solid ${C.line}`, background: C.panel }}>
              <Img src={staticFile(homeHero)} style={{ width: heroW * s, height: heroH * s }} />
            </div>
            <Ticks x={0} y={0} w={heroW * s} h={heroH * s} />
            <Stamp kind="paid" text="PAID" size={44} at={M + 34} style={{ left: -60, bottom: 40 }} />
          </div>
          <div style={{ position: 'absolute', left: 110, top: 300, width: 820, opacity: sheet }}>
            <div style={{ font: `800 92px/1.02 ${F.display}`, letterSpacing: '-0.035em', color: C.ink }}>
              The money waits <span style={{ color: C.signal }}>for the proof.</span>
            </div>
          </div>
          <Sequence from={M} durationInFrames={d - M}><CaptionBand duration={d - M} text="PayPal holds the money, AI checks the proof, and the pro is paid the moment the proof passes." /></Sequence>
        </AbsoluteFill>
      )}
    </AbsoluteFill>
  );
};
