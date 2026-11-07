// v3 building blocks: real card captures as big graphic cards (rise in, zoom, highlight), and data cards drawn in the
// product's tokens from real data (PayPal's own sandbox answers, the mandate records, the agents' thread).
import React from 'react';
import { AbsoluteFill, Img, interpolate, staticFile, useCurrentFrame, Easing } from 'remotion';
import { C, F, SHADOW_LG, rgba } from '../theme';

export const cl = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;
export const snappy = Easing.bezier(0.16, 1, 0.3, 1);
export const smooth = Easing.bezier(0.65, 0, 0.35, 1);
export const TX = 'textures/v3/';
export const rise = (f: number, at: number, dy = 40) => { const t = interpolate(f, [at, at + 18], [0, 1], { ...cl, easing: snappy }); return { opacity: t, transform: `translateY(${(1 - t) * dy}px)` }; };

// a captured card (element screenshot at 3× device pixels: CSS size = pixels / 3), drawn at scale k, optionally cropped
// to `cropH` CSS px; children are page-space overlays (CSS px of the card)
export const Card: React.FC<{ src: string; w: number; h: number; k: number; x: number; y: number; cropH?: number; at?: number; style?: React.CSSProperties; children?: React.ReactNode; shadow?: boolean }> = ({ src, w, h, k, x, y, cropH, at = 0, style, children, shadow = true }) => {
  const f = useCurrentFrame();
  const H = cropH ?? h;
  return (
    <div style={{ position: 'absolute', left: x, top: y, width: w * k, height: H * k, borderRadius: 14 * k, overflow: 'hidden', background: C.panel, boxShadow: shadow ? `${SHADOW_LG}, 0 0 0 1px ${rgba(C.ink, 0.06)}` : undefined, ...rise(f, at), ...style }}>
      <Img src={staticFile(TX + src)} style={{ position: 'absolute', left: 0, top: 0, width: w * k, height: h * k }} />
      <div style={{ position: 'absolute', inset: 0, transform: `scale(${k})`, transformOrigin: '0 0' }}>{children}</div>
    </div>
  );
};
// a highlight on a card: a marker bar at the left of a row plus a soft tint, drawn in CSS px of the card
export const Mark: React.FC<{ x: number; y: number; w: number; h: number; at: number; color?: string; box?: boolean }> = ({ x, y, w, h, at, color = C.signal, box }) => {
  const f = useCurrentFrame();
  const g = interpolate(f, [at, at + 10], [0, 1], { ...cl, easing: Easing.bezier(0.3, 0, 0.2, 1) });
  if (g <= 0) return null;
  return box ? (
    <div style={{ position: 'absolute', left: x - 4, top: y - 4, width: w + 8, height: h + 8, borderRadius: 8, border: `2px solid ${color}`, boxShadow: `0 0 0 4px ${rgba(color, 0.15)}`, opacity: g, transform: `scale(${1.04 - 0.04 * g})` }} />
  ) : (
    <>
      <div style={{ position: 'absolute', left: x, top: y, width: w * g, height: h, borderRadius: 4, background: rgba(color, 0.1) }} />
      <div style={{ position: 'absolute', left: x - 8, top: y, width: 3, height: h * g, borderRadius: 2, background: color }} />
    </>
  );
};
// the whole stage's camera: scale + focus point keyframes in screen px, eased
export type Key = { f: number; s: number; x: number; y: number };
export const Cam: React.FC<{ keys: Key[]; children: React.ReactNode }> = ({ keys, children }) => {
  const f = useCurrentFrame();
  let a = keys[0], b = keys[keys.length - 1];
  for (let i = 0; i < keys.length - 1; i++) if (f >= keys[i].f && f <= keys[i + 1].f) { a = keys[i]; b = keys[i + 1]; break; }
  const t = a.f === b.f ? 1 : interpolate(f, [a.f, b.f], [0, 1], { ...cl, easing: smooth });
  const s = a.s + (b.s - a.s) * t, x = a.x + (b.x - a.x) * t, y = a.y + (b.y - a.y) * t;
  return <AbsoluteFill style={{ transform: `translate(${960 - x * s}px, ${540 - y * s}px) scale(${s})`, transformOrigin: '0 0' }}>{children}</AbsoluteFill>;
};

// a data card in the product's tokens
export const DataCard: React.FC<{ title: string; tag?: string; rows: { k: string; v: string; ok?: boolean; dim?: boolean; note?: string }[]; x: number; y: number; w: number; at: number; step?: number; z?: number; style?: React.CSSProperties }> = ({ title, tag, rows, x, y, w, at, step = 8, z = 1, style }) => {
  const f = useCurrentFrame();
  return (
    <div style={{ position: 'absolute', left: x / z, top: y / z, width: w / z, zoom: z, borderRadius: 16, background: C.panel, boxShadow: `${SHADOW_LG}, 0 0 0 1px ${rgba(C.ink, 0.06)}`, padding: '24px 30px 18px', boxSizing: 'border-box', ...rise(f, at), ...style } as React.CSSProperties}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 12 }}>
        <span style={{ font: `800 32px/1.1 ${F.display}`, color: C.ink, letterSpacing: '-0.02em' }}>{title}</span>
        {tag && <span style={{ marginLeft: 'auto', padding: '6px 12px', borderRadius: 6, background: C.signalSoft, color: C.signalHi, font: `600 20px/1 ${F.mono}`, letterSpacing: '0.04em' }}>{tag}</span>}
      </div>
      {rows.map((r, i) => {
        const t = interpolate(f, [at + 10 + i * step, at + 18 + i * step], [0, 1], { ...cl, easing: snappy });
        return (
          <div key={i} style={{ opacity: t, transform: `translateY(${(1 - t) * 10}px)`, padding: '12px 0', borderTop: `1px solid ${C.line}` }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 16 }}>
              <span style={{ font: `500 26px/1.25 ${F.text}`, color: r.dim ? C.ink3 : C.ink2, flex: 'none', width: '42%' }}>{r.k}</span>
              <span style={{ font: `600 25px/1.3 ${F.mono}`, color: r.ok ? C.ok : r.dim ? C.ink3 : C.ink, marginLeft: 'auto', textAlign: 'right', overflowWrap: 'anywhere' }}>{r.v}</span>
            </div>
            {r.note && <div style={{ font: `500 22px/1.3 ${F.text}`, color: C.ink3, marginTop: 4, textAlign: 'right' }}>{r.note}</div>}
          </div>
        );
      })}
    </div>
  );
};

// a chat bubble in the product's thread style (for the agents' negotiation, drawn from the job's real thread)
export const Bubble: React.FC<{ who: string; text: string; amount?: string; side: 'left' | 'right'; at: number; x: number; y: number; w?: number; tone?: 'agent' | 'pro' }> = ({ who, text, amount, side, at, x, y, w = 560, tone = 'pro' }) => {
  const f = useCurrentFrame();
  const t = interpolate(f, [at, at + 14], [0, 1], { ...cl, easing: snappy });
  const mine = side === 'right';
  return (
    <div style={{ position: 'absolute', left: x, top: y, width: w, opacity: t, transform: `translateY(${(1 - t) * 24}px) scale(${0.96 + 0.04 * t})`, transformOrigin: mine ? 'right bottom' : 'left bottom' }}>
      <div style={{ borderRadius: 18, padding: '16px 22px', background: mine ? C.primary : C.panel, color: mine ? '#fff' : C.ink, boxShadow: SHADOW_LG, border: mine ? 'none' : `1px solid ${C.line}` }}>
        <div style={{ font: `600 20px/1 ${F.mono}`, letterSpacing: '0.04em', opacity: 0.75, marginBottom: 8 }}>{who}</div>
        {amount && <div style={{ font: `800 46px/1.05 ${F.display}`, letterSpacing: '-0.02em' }}>{amount}</div>}
        <div style={{ font: `500 26px/1.3 ${F.text}`, marginTop: amount ? 6 : 0 }}>{text}</div>
      </div>
    </div>
  );
};

export const Label: React.FC<{ text: string; x: number; y: number; at: number; color?: string; size?: number }> = ({ text, x, y, at, color = C.ink3, size = 28 }) => {
  const f = useCurrentFrame();
  return <div style={{ position: 'absolute', left: x, top: y, font: `700 ${size}px/1.1 ${F.text}`, letterSpacing: '0.01em', color, ...rise(f, at, 16) }}>{text}</div>;
};
