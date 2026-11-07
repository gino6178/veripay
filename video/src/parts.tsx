// Shared film parts in the product's tokens: the narration caption band, the letterpress title card (paper-title-card),
// the honesty label, the registration ticks and the inspection/PAID stamp.
import React from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame, Easing } from 'remotion';
import { C, F, SHADOW_LG, rgba } from './theme';

const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;

// ── narration caption: a white band at the bottom (opaque: nothing semi-transparent over text) ──────────────────────
// Q11: 50px Schibsted (cap height well over 3% of the frame), at most 2 lines, held for its whole window.
export const CaptionBand: React.FC<{ text: string; duration: number; tone?: 'light' | 'ink' }> = ({ text, duration, tone = 'light' }) => {
  const f = useCurrentFrame();
  const inT = interpolate(f, [0, 10], [0, 1], { ...clamp, easing: Easing.bezier(0.16, 1, 0.3, 1) });
  const outT = interpolate(f, [duration - 8, duration], [1, 0], clamp);
  const ink = tone === 'ink';
  return (
    <div style={{ position: 'absolute', left: 0, right: 0, bottom: 34, display: 'flex', justifyContent: 'center', pointerEvents: 'none', opacity: inT * outT, transform: `translateY(${(1 - inT) * 14}px)` }}>
      <div style={{
        maxWidth: 1800, padding: '16px 40px 18px', borderRadius: 14, background: ink ? C.ink : C.panel,
        border: `1px solid ${ink ? C.ink : C.line}`, boxShadow: SHADOW_LG,
        font: `500 58px/1.2 ${F.text}`, letterSpacing: '-0.012em', color: ink ? '#FFFFFF' : C.ink, textAlign: 'center', textWrap: 'balance' as any,
      }}>{text}</div>
    </div>
  );
};

// ── letterpress title card (paper-title-card): words press in one by one; exactly one accent word; underline closes ──
export type Word = { t: string; accent?: boolean; br?: boolean };
export const words = (s: string): Word[] => s.split(' ').map((w) => {
  const br = w.endsWith('|'); w = br ? w.slice(0, -1) : w;
  const accent = w.startsWith('*'); w = accent ? w.slice(1).replace(/\*$/, '') : w;
  return { t: w.replace(/\*/g, ''), accent, br };
});
export const TitleCard: React.FC<{ text: string; sub?: React.ReactNode; size?: number; duration: number; fadeIn?: number; bg?: boolean; start?: number }> = ({ text, sub, size = 104, duration, bg = true, start = 0 }) => {
  const frame = useCurrentFrame() - start;
  const ws = words(text);
  const fadeOut = interpolate(frame, [duration - 8, duration], [1, 0], clamp);
  const last = 4 + (ws.length - 1) * 4 + 9;
  const underline = interpolate(frame, [last, last + 18], [0, 1], { ...clamp, easing: Easing.bezier(0.3, 0, 0.2, 1) });
  const subT = interpolate(frame, [last - 4, last + 10], [0, 1], clamp);
  return (
    <AbsoluteFill style={{
      justifyContent: 'center', alignItems: 'center', opacity: fadeOut,
      ...(bg ? { backgroundColor: C.ground, backgroundImage: `radial-gradient(1100px 760px at 50% 44%, ${C.panel} 0%, ${rgba(C.panel, 0)} 70%)` } : {}),
    }}>
      <div style={{ textAlign: 'center', maxWidth: 1600 }}>
        <div style={{ font: `800 ${size}px/1.1 ${F.display}`, letterSpacing: '-0.035em', color: C.ink, display: 'flex', flexWrap: 'wrap', justifyContent: 'center', columnGap: '0.24em' }}>
          {ws.map((w, i) => {
            const d = 4 + i * 4;
            const t = interpolate(frame, [d, d + 9], [0, 1], { ...clamp, easing: Easing.bezier(0.2, 0.75, 0.3, 1) });
            return (
              <React.Fragment key={i}>
                <span style={{ display: 'inline-block', opacity: t, transform: `scale(${1.28 - 0.28 * t})`, filter: `blur(${(1 - t) * 7}px)`, fontStyle: w.accent ? 'italic' : 'normal', color: w.accent ? C.signal : undefined }}>{w.t}</span>
                {w.br && <span style={{ flexBasis: '100%', height: 0 }} />}
              </React.Fragment>
            );
          })}
        </div>
        <div style={{ height: 6, width: 220, margin: '40px auto 0', borderRadius: 3, background: C.signal, transform: `scaleX(${underline})` }} />
        {sub && <div style={{ marginTop: 34, opacity: subT, font: `500 30px/1.4 ${F.mono}`, letterSpacing: '0.02em', color: C.ink3 }}>{sub}</div>}
      </div>
    </AbsoluteFill>
  );
};

// ── odometer for mono numbers on title cards (list-stack-press rule: settle well before the card fades) ─────────────
const DIG = '0123456789';
export const Odo: React.FC<{ value: string; delay: number; size: number; color: string; font?: string; weight?: number }> = ({ value, delay, size, color, font = F.display, weight = 800 }) => {
  const frame = useCurrentFrame();
  const lh = size * 1.12;
  return (
    <span style={{ display: 'inline-flex', overflow: 'hidden', height: lh, verticalAlign: 'bottom' }}>
      {value.split('').map((ch, i) => {
        const k = DIG.indexOf(ch);
        if (k < 0) return <span key={i} style={{ font: `${weight} ${size}px/${lh}px ${font}`, color }}>{ch}</span>;
        const t = interpolate(frame, [delay + i * 3, delay + i * 3 + 22], [0, 1], { ...clamp, easing: Easing.bezier(0.25, 0.8, 0.25, 1) });
        return (
          <span key={i} style={{ display: 'inline-block', height: lh }}>
            <span style={{ display: 'block', transform: `translateY(${-(10 + k) * t * lh}px)` }}>
              {(DIG + DIG).split('').map((d, j) => <span key={j} style={{ display: 'block', font: `${weight} ${size}px/${lh}px ${font}`, color, fontVariantNumeric: 'tabular-nums' }}>{d}</span>)}
            </span>
          </span>
        );
      })}
    </span>
  );
};

// ── honesty label: small mono pill, always opaque ────────────────────────────────────────────────────────────────────
export const Honest: React.FC<{ children: React.ReactNode; x?: number; y?: number; right?: number; top?: number; from?: number; dur?: number }> = ({ children, x, y, right, top, from = 0, dur = 9999 }) => {
  const f = useCurrentFrame();
  const o = interpolate(f, [from, from + 8, from + dur - 8, from + dur], [0, 1, 1, 0], clamp);
  return (
    <div style={{ position: 'absolute', left: x, bottom: top == null ? y : undefined, right, top, opacity: o, display: 'flex', alignItems: 'center', gap: 12, padding: '10px 20px', borderRadius: 8, background: C.panel, border: `1px solid ${C.lineStrong}`, font: `500 32px/1.2 ${F.text}`, color: C.ink2, letterSpacing: '-0.005em', boxShadow: '0 2px 8px rgba(0,28,100,0.08)' }}>
      <span style={{ width: 10, height: 10, borderRadius: 5, background: C.signal, flex: 'none' }} />
      {children}
    </div>
  );
};

// ── the inspection stamp language (DESIGN.md): double-ruled mono box, -2.5°. PAID is the site's status badge now: green,
// upright, rounded (no yellow anywhere since the VeriPay rename) ──────────────────────────────────────────────────────
export const Stamp: React.FC<{ kind: 'paid' | 'pass'; text: string; small?: string; size?: number; at: number; style?: React.CSSProperties }> = ({ kind, text, small, size = 40, at, style }) => {
  const f = useCurrentFrame();
  const t = interpolate(f, [at, at + 14], [0, 1], { ...clamp, easing: Easing.bezier(0.16, 1, 0.3, 1) });
  const op = interpolate(f, [at, at + 8], [0, 1], clamp);
  const paid = kind === 'paid';
  const col = C.ok, edge = paid ? C.okLine : C.ok;
  return (
    <div style={{
      position: 'absolute', display: 'inline-grid', justifyItems: 'center', gap: size * 0.1, padding: `${size * 0.35}px ${size * 0.65}px ${size * 0.28}px`,
      font: `600 ${size}px/1 ${paid ? F.text : F.mono}`, letterSpacing: paid ? '0' : '0.1em', color: col, background: paid ? C.okSoft : C.panel,
      border: `${Math.max(2, size * 0.075)}px solid ${edge}`, outline: paid ? 'none' : `${Math.max(1.5, size * 0.05)}px solid ${edge}`, outlineOffset: size * 0.13, borderRadius: paid ? size * 0.3 : 2,
      transform: `rotate(${paid ? 0 : -4}deg) scale(${(paid ? 1.25 : 1.6) - (paid ? 0.25 : 0.6) * t})`, opacity: op, boxShadow: paid ? '0 10px 28px rgba(23,112,58,0.18)' : undefined, ...style,
    }}>
      {text}{small && <span style={{ font: `500 ${size * 0.4}px/1 ${F.mono}`, letterSpacing: '0.04em' }}>{small}</span>}
    </div>
  );
};

export const Ticks: React.FC<{ x: number; y: number; w: number; h: number; size?: number; color?: string; o?: number }> = ({ x, y, w, h, size = 22, color = C.signal, o = 1 }) => (
  <>
    <i style={{ position: 'absolute', left: x - 14, top: y - 14, width: size, height: size, borderTop: `2px solid ${color}`, borderLeft: `2px solid ${color}`, opacity: o }} />
    <i style={{ position: 'absolute', left: x + w - size + 14, top: y + h - size + 14, width: size, height: size, borderBottom: `2px solid ${color}`, borderRight: `2px solid ${color}`, opacity: o }} />
  </>
);

export const SpedUp: React.FC<{ from: number; dur: number; text?: string }> = ({ from, dur, text = 'sped up' }) => {
  const f = useCurrentFrame();
  const o = interpolate(f, [from, from + 6, from + dur - 6, from + dur], [0, 1, 1, 0], clamp);
  return <div style={{ position: 'absolute', right: 56, top: 48, opacity: o, padding: '8px 14px', borderRadius: 6, background: C.ink, color: '#fff', font: `600 24px/1 ${F.mono}`, letterSpacing: '0.08em' }}>⏩ {text.toUpperCase()}</div>;
};
