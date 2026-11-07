// S3–S9: the job, from one sentence to the payout, on real captures of the film's own demo server (8840).
import React from 'react';
import { AbsoluteFill, Img, interpolate, staticFile, useCurrentFrame, Easing, Sequence, spring } from 'remotion';
import { C, F, SHADOW_LG, rgba } from '../theme';
import { CaptionBand, Honest, TitleCard, Stamp, Ticks } from '../parts';
import { PageCam, CamKey } from '../lib/PageCam';
import { SHOTS } from '../timeline';
import { softShadow, SpeedBlur, velocity, bezier } from '../fx/Polish';
import L from '../../public/textures/flow-final/layout.json';

const cl = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;
const snappy = Easing.bezier(0.16, 1, 0.3, 1);
const DIR = 'textures/flow-final/';
const ST: any = (L as any).states;
const F2 = ST.final2.desktop;

// a click ripple: two rings, 3 f apart (type-and-filter), in screen space
const Ripple: React.FC<{ x: number; y: number; at: number }> = ({ x, y, at }) => {
  const f = useCurrentFrame();
  return (
    <>
      {[0, 3].map((d) => {
        const t = interpolate(f, [at + d, at + d + 10], [0, 1], { ...cl, easing: Easing.out(Easing.quad) });
        if (t <= 0 || t >= 1) return null;
        const r = 14 + (d ? 64 : 40) * t;
        return <div key={d} style={{ position: 'absolute', left: x - r, top: y - r, width: r * 2, height: r * 2, borderRadius: '50%', border: `3px solid ${C.signal}`, opacity: 1 - t, boxShadow: `0 0 40px ${rgba(C.signal, 0.35 * (1 - t))}` }} />;
      })}
    </>
  );
};
// a single viewport-sized capture (1920×1080 CSS at 2x) under a simple camera
const Shot: React.FC<{ src: string; keys: CamKey[]; children?: React.ReactNode }> = ({ src, keys, children }) => (
  <PageCam src={src} pageH={1080} keys={keys}>{children}</PageCam>
);


// ── framing devices: every page view sits in a browser-like window (captions and labels stay outside it), and the
// narrow side-column panels are shown as real cutouts at readable scale, side by side, instead of a thin strip ──────
const WIN = { x: 100, y: 96, w: 1720, h: 760 };
export const InWindow: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div style={{ position: 'absolute', left: WIN.x, top: WIN.y, width: WIN.w, height: WIN.h, borderRadius: 16, overflow: 'hidden', background: C.ground, boxShadow: `${SHADOW_LG}, 0 0 0 1px ${rgba(C.ink, 0.08)}` }}>
    <div style={{ position: 'absolute', left: (WIN.w - 1920) / 2, top: (WIN.h - 1080) / 2, width: 1920, height: 1080 }}>{children}</div>
  </div>
);
// screen position of a page point under a flat PageCam key, inside the window
const winPt = (px: number, py: number, k: { cx: number; cy: number; zoom: number }) => ({ x: WIN.x + WIN.w / 2 + (px - k.cx) * k.zoom, y: WIN.y + WIN.h / 2 + (py - k.cy) * k.zoom });
type Box = { x: number; y: number; w: number; h: number };
// a region of a sliced page capture, scaled, as a card
export const Cutout: React.FC<{ slices: any[]; r: Box; k: number; style?: React.CSSProperties; children?: React.ReactNode }> = ({ slices, r, k, style, children }) => (
  <div style={{ position: 'absolute', width: r.w * k, height: r.h * k, overflow: 'hidden', borderRadius: 14, background: C.panel, boxShadow: `${SHADOW_LG}, 0 0 0 1px ${rgba(C.ink, 0.07)}`, ...style }}>
    {slices.filter((s) => s.y + s.h > r.y && s.y < r.y + r.h).map((s) => <Img key={s.file} src={staticFile(DIR + s.file)} style={{ position: 'absolute', left: -r.x * k, top: (s.y - r.y) * k, width: 1920 * k, height: s.h * k }} />)}
    <div style={{ position: 'absolute', left: 0, top: 0, width: r.w * k, height: r.h * k }}>{children}</div>
  </div>
);
const rise = (f: number, at: number) => { const t = interpolate(f, [at, at + 16], [0, 1], { ...cl, easing: snappy }); return { opacity: t, transform: `translateY(${(1 - t) * 40}px)` }; };

// ── S3 Post a job: type-and-filter's camera (close on the field while typing, a breath, then the result) ────────────
const TYPED = 'My kitchen faucet keeps dripping. Get it fixed this week, under $200.';
const typeFile = (n: number) => { const c = Math.max(0, Math.min(TYPED.length, n)); const k = c === TYPED.length ? c : c - (c % 2); return `${DIR}type/t${String(k).padStart(3, '0')}.png`; };
export const Post: React.FC = () => {
  const f = useCurrentFrame();
  const d = SHOTS.post.duration;
  const T0 = 16, CPF = 1 / 2.4; // 2.4 f per character
  const n = Math.floor((f - T0) * CPF);
  const say = ST.post.say; // {x,y,w,h}
  const SEND = T0 + Math.ceil(TYPED.length / CPF) + 12; // typed + a breath
  const WO = SEND + 12;
  const typeOut = interpolate(f, [WO, WO + 10], [1, 0], cl);
  const woIn = interpolate(f, [WO, WO + 10], [0, 1], cl);
  const conds = ST.postWo.fields.find((b: any) => /DONE WHEN/.test(b.text));
  const answer = ST.postWo.say[2];
  const K1 = { cx: 802, cy: say.y + 40, zoom: 2.0 };
  const send = winPt(say.x + say.w - 40, say.y + say.h - 24, K1);
  return (
    <AbsoluteFill style={{ background: C.ground }}>
      {typeOut > 0 && (
        <div style={{ opacity: typeOut }}><InWindow>
          <Shot src={typeFile(f < T0 ? 0 : n)} keys={[{ frame: 0, ...K1 }, { frame: SEND - 6, ...K1, zoom: 2.05 }, { frame: WO + 10, ...K1, zoom: 1.9 }]} />
        </InWindow></div>
      )}
      {typeOut > 0 && <Ripple x={send.x} y={send.y} at={SEND} />}
      {woIn > 0 && (
        <div style={{ opacity: woIn }}><InWindow>
          <PageCam slices={ST.postWo.slices} dir={DIR} pageH={ST.postWo.pageH} keys={[
            { frame: WO, cx: 802, cy: answer.y + 70, zoom: 2.0 },
            { frame: WO + 70, cx: 802, cy: answer.y + 70, zoom: 2.0 },
            { frame: WO + 130, cx: 802, cy: conds.y + conds.h / 2 + 30, zoom: 1.85 },
          ]} frame={f}>
            {f > WO + 136 && <Ticks x={conds.x} y={conds.y} w={conds.w} h={conds.h + 60} o={interpolate(f, [WO + 136, WO + 146], [0, 1], cl)} />}
          </PageCam>
        </InWindow></div>
      )}
      <Sequence from={T0} durationInFrames={WO - T0}><CaptionBand duration={WO - T0} text="Say what's wrong in one sentence." /></Sequence>
      <Sequence from={WO + 6} durationInFrames={124}><CaptionBand duration={124} text="VeriPay's model writes a definition of done:" /></Sequence>
      <Sequence from={WO + 130} durationInFrames={d - WO - 130}><CaptionBand duration={d - WO - 130} text="each condition names the photo, receipt or note that proves it." /></Sequence>
    </AbsoluteFill>
  );
};
export const POST_SEND = 16 + Math.ceil(TYPED.length * 2.4) + 12;

// ── S4 offers: list-stack-press on the five real offer cards (window, tight on the offers column), then the deal ──
const OFF = ST.offered.desktop;
const CUES = [8, 34, 60, 86, 112], DUR = 22, TILT = [2, -2, 2, -2, 2];
const FLY = Easing.bezier(0.45, 0.05, 0.25, 1.12);
export const Offers: React.FC = () => {
  const f = useCurrentFrame();
  const d = SHOTS.offers.duration;
  const cards = OFF.offer as Box[];
  const flyT = (i: number, fr: number) => interpolate(fr, [CUES[i], CUES[i] + DUR], [0, 1], { ...cl, easing: FLY });
  const flyY = (i: number, fr: number) => 600 * (1 - flyT(i, fr));
  const press = (i: number) => { let p = 0; for (let j = i + 1; j < 5; j++) p = Math.max(p, interpolate(f, [CUES[j], CUES[j] + 4, CUES[j] + 8], [0, 6, 0], { ...cl, easing: Easing.inOut(Easing.sin) })); return p; };
  // camera: one continuous curve that follows the stack down (fed per frame), front-on, tight on the offers column
  const ZM = 1.75, C0 = cards[0].y - 120, C1 = cards[4].y + cards[4].h - 170, CAM_END = CUES[4] + DUR + 6;
  const camAt = (fr: number) => { const u = Math.min(1, Math.max(0, (fr - 10) / (CAM_END - 10))); return { cx: 700, cy: C0 + (C1 - C0) * bezier(0.42, 0, 0.3, 1)(u), zoom: ZM }; };
  const keys: CamKey[] = Array.from({ length: 200 }, (_, fr) => ({ frame: fr, ...camAt(fr) }));
  const pos = CUES.reduce((a, c) => a + interpolate(f, [c + DUR, c + DUR + 8], [0, 1], { ...cl, easing: Easing.bezier(0.25, 0.8, 0.25, 1) }), 0);
  const B = 186; // part B: the deal, as real cutouts side by side
  const thread = ST.final2.desktop.msgs as Box[];
  const tr = { x: 392, y: thread[5].y - 8, w: 479, h: thread[7].y + thread[7].h + 8 - (thread[5].y - 8) };
  const offerBox = cards[1]; // Eastside Pipe & Drain (demo): $195.00 asked
  const bIn = interpolate(f, [B, B + 10], [0, 1], cl);
  return (
    <AbsoluteFill style={{ background: C.ground }}>
      {f < B + 10 && (
        <div style={{ opacity: 1 - bIn }}>
          <InWindow>
            <PageCam slices={OFF.slices} dir={DIR} pageH={OFF.pageH} keys={keys} ease={(t) => t} frame={Math.min(f, 199)}>
              {cards.map((c, i) => <div key={'p' + i} style={{ position: 'absolute', left: c.x - 6, top: c.y - 2, width: c.w + 12, height: c.h + 2, background: C.ground, opacity: f >= CUES[i] + DUR - 2 ? 0 : 1 }} />)}
              {cards.map((c, i) => {
                const t = flyT(i, f); if (t <= 0) return null;
                const settled = t >= 0.999, dy = flyY(i, f) + (settled ? press(i) : 0);
                const elev = settled ? 3 - press(i) * 0.3 : 3 + 53 * Math.max(0, 1 - t);
                return (
                  <div key={i} style={{ position: 'absolute', left: c.x - 6, top: c.y - 2, width: c.w + 12, height: c.h + 2, overflow: 'hidden', borderRadius: 8, background: C.ground,
                    transform: `translateY(${dy}px) rotate(${TILT[i] * (1 - t)}deg) scale(${1.06 - 0.06 * t})`, boxShadow: softShadow(elev, { color: '#001C64', strength: 1 }) }}>
                    {OFF.slices.map((s: any) => <Img key={s.file} src={staticFile(DIR + s.file)} style={{ position: 'absolute', left: -(c.x - 6), top: s.y - (c.y - 2), width: 1920, height: s.h }} />)}
                  </div>
                );
              })}
            </PageCam>
          </InWindow>
          <div style={{ position: 'absolute', right: 100, top: 14, height: 72, display: 'flex', alignItems: 'center', gap: 18, padding: '0 24px', borderRadius: 12, background: C.panel, boxShadow: SHADOW_LG, border: `1px solid ${C.line}` }}>
            <div style={{ font: `600 32px/1 ${F.mono}`, letterSpacing: '0.1em', color: C.ink3 }}>OFFERS</div>
            <div style={{ display: 'flex' }}>
              <span style={{ display: 'inline-flex', overflow: 'hidden', height: 64 }}>
                <span style={{ display: 'block', transform: `translateY(${-pos * 64}px)` }}>
                  {'0123456789'.split('').map((dd) => <span key={dd} style={{ display: 'block', font: `800 58px/64px ${F.display}`, color: C.primary, fontVariantNumeric: 'tabular-nums' }}>{dd}</span>)}
                </span>
              </span>
            </div>
          </div>
          <Honest x={100} top={28} from={10} dur={B - 10}>Demo pros and their agents are fictional (demo)</Honest>
        </div>
      )}
      {f >= B && (
        <AbsoluteFill style={{ opacity: bIn }}>
          <div style={{ position: 'absolute', left: 120, top: 70, font: `600 26px/1 ${F.mono}`, letterSpacing: '0.1em', color: C.ink3, ...rise(f, B + 2) }}>THE OFFER</div>
          <Cutout slices={OFF.slices} r={{ x: offerBox.x - 8, y: offerBox.y - 6, w: offerBox.w + 16, h: offerBox.h + 10 }} k={1.45} style={{ left: 120, top: 116, ...rise(f, B + 2) }} />
          <div style={{ position: 'absolute', left: 900, top: 70, font: `600 26px/1 ${F.mono}`, letterSpacing: '0.1em', color: C.ink3, ...rise(f, B + 14) }}>THE AGENTS' THREAD</div>
          <Cutout slices={ST.final2.desktop.slices} r={tr} k={1.85} style={{ left: 900, top: 116, ...rise(f, B + 14) }}>
            {[5, 6, 7].map((m, i) => {
              const at = B + 40 + i * 40;
              const g = interpolate(f, [at, at + 9], [0, 1], { ...cl, easing: Easing.bezier(0.3, 0, 0.2, 1) });
              const b = thread[m];
              return <div key={m} style={{ position: 'absolute', left: Math.max(4, (b.x - tr.x) * 1.85 - 14), top: (b.y - tr.y) * 1.85, width: 6, height: b.h * 1.85 * g, background: C.signal, borderRadius: 3 }} />;
            })}
          </Cutout>
        </AbsoluteFill>
      )}
      <Sequence from={8} durationInFrames={B - 8}><CaptionBand duration={B - 8} text="Five pros' agents send offers, each marked against the typical price." /></Sequence>
      <Sequence from={B + 6} durationInFrames={d - B - 6}><CaptionBand duration={d - B - 6} text="Maria's agent counters at $170. The pro's agent says $185, under her $200 ceiling. Her agent accepts." /></Sequence>
    </AbsoluteFill>
  );
};

// ── S5 the hold: the money panel and the PayPal ids, as real cutouts side by side (held state) ────────────────────
export const Hold: React.FC = () => {
  const f = useCurrentFrame();
  const d = SHOTS.hold.duration;
  const H = ST.held.desktop;
  const amt = H.amt[0], ids = H.ids[0];
  const money = { x: 903, y: 2967, w: 309, h: 382 }, idsR = { x: 903, y: 3737, w: 309, h: 300 };
  const K = 2.0;
  const push = 1 + 0.025 * interpolate(f, [0, d], [0, 1], cl);
  const line = (b: Box, r: Box, at: number) => { const g = interpolate(f, [at, at + 10], [0, 1], { ...cl, easing: Easing.bezier(0.3, 0, 0.2, 1) }); return <div style={{ position: 'absolute', left: Math.max(4, (b.x - r.x - 12) * K), top: (b.y - r.y) * K, width: 6, height: b.h * K * g, background: C.signal, borderRadius: 3 }} />; };
  return (
    <AbsoluteFill style={{ background: C.ground }}>
      <AbsoluteFill style={{ transform: `scale(${push})` }}>
        <Cutout slices={H.slices} r={money} k={K} style={{ left: 300, top: 84, ...rise(f, 4) }}>{line(amt, money, 40)}</Cutout>
        <Cutout slices={H.slices} r={idsR} k={K} style={{ left: 1000, top: 84, ...rise(f, 22) }}>{line({ x: ids.x, y: ids.y + 50, w: ids.w, h: 66 }, idsR, 150)}</Cutout>
      </AbsoluteFill>
      <Honest x={300} top={24} from={10} dur={d - 20}>This demo server uses a PayPal stand-in: its ids say SIMULATED</Honest>
      <Sequence from={8} durationInFrames={d - 8}><CaptionBand duration={d - 8} text="PayPal holds $200: an authorization, not a charge. Nothing moves until the work is proven." /></Sequence>
    </AbsoluteFill>
  );
};

// ── S6 the PIN: the change order, Approve, the PIN dialog (dots only), the approved order and the re-hold ──────────
export const Pin: React.FC = () => {
  const f = useCurrentFrame();
  const d = SHOTS.pin.duration;
  const A = ST.approve; // btn in viewport coords
  const CLICK = 64, DLG = 74, CONF = 214, CARD = 300;
  const dots = Math.max(0, Math.min(6, Math.floor((f - (DLG + 30)) / 14) + 1));
  const src = f < DLG ? `${DIR}approve-before.png` : `${DIR}pin-${f < DLG + 30 ? 0 : dots}.png`;
  const dlg = A.dialog; const dc = { x: dlg.x + dlg.w / 2, y: dlg.y - A.scrollY2 + dlg.h / 2 };
  const K0 = { cx: 600, cy: A.btn.y - 70, zoom: 2.6 };
  const keys: CamKey[] = [{ frame: 0, ...K0 }, { frame: CLICK, ...K0, cy: A.btn.y - 60 }, { frame: DLG + 10, cx: dc.x, cy: dc.y, zoom: 1.9 }, { frame: CONF, cx: dc.x, cy: dc.y, zoom: 1.95 }];
  const btn = winPt(A.btn.x + A.btn.w / 2, A.btn.y + A.btn.h / 2, { ...K0, cy: A.btn.y - 60 });
  const ap = ST.approved.desktop;
  const chg = ap.panels.find((p: any) => /approved/.test(p.text) && p.x < 900);
  const hold = { x: 903, y: 2250, w: 309, h: 520 };
  const after = f >= CONF + 16 && f < CARD;
  return (
    <AbsoluteFill style={{ background: C.ground }}>
      {f < CONF + 16 && <InWindow><Shot src={src} keys={keys} /></InWindow>}
      {f < CONF + 16 && <Ripple x={btn.x} y={btn.y} at={CLICK} />}
      {after && (
        <>
          <Cutout slices={ap.slices} r={{ x: chg.x - 6, y: chg.y - 6, w: chg.w + 12, h: chg.h + 12 }} k={1.6} style={{ left: 180, top: 120, ...rise(f, CONF + 16) }} />
          <Cutout slices={ap.slices} r={hold} k={1.4} style={{ left: 1100, top: 96, ...rise(f, CONF + 26) }} />
        </>
      )}
      {f >= CARD && <Sequence from={CARD} durationInFrames={d - CARD}><TitleCard duration={d - CARD} size={92} text="Your agent works inside your limits.| Only *your* PIN acts as you." /></Sequence>}
      {f < CARD && <Sequence from={6} durationInFrames={CARD - 6}><CaptionBand duration={CARD - 6} text="A $47.05 change order. Maria approves it herself, so the site asks for her PIN. Her agent never has it." /></Sequence>}
    </AbsoluteFill>
  );
};
export const PIN_TIMES = { CLICK: 64, CONF: 214 };

// ── S7 the pro's phone: radial-ripple-phone-chips, the real 390-px pro page scrolling, three chips ─────────────────
const RINGS = [{ size: 2240, color: '#DCE8F7' }, { size: 1760, color: '#E3EDF9' }, { size: 1280, color: '#EAF2FB' }, { size: 840, color: '#F1F6FD' }].map((r, i) => ({ ...r, phase: i * 1.7 }));
const PW = 430, PH = 900, PX = (1920 - PW) / 2, PY = (1080 - PH) / 2 - 20;
export const Phone: React.FC = () => {
  const f = useCurrentFrame();
  const d = SHOTS.phone.duration;
  const t = f / (d - 1);
  const P = ST.final2.phone;
  const rise = interpolate(f, [0, 26], [0, 1], { ...cl, easing: snappy });
  const scrW = PW - 2 * 21, k = scrW / 390; // screen width / CSS width
  const y0 = 2330, y1 = 4560; // Done when → past the receipt
  const sp = Math.min(1, Math.max(0, (t - 0.06) / 0.88));
  const scrollY = -(y0 + (y1 - y0) * sp) * k + 120;
  const chip = (t0: number, ph: number, side: -1 | 1): React.CSSProperties => {
    const s = spring({ frame: f - t0, fps: 30, config: { damping: 13, stiffness: 190 } });
    const slide = interpolate(f, [t0, t0 + 20], [0, 1], { ...cl, easing: snappy });
    const fin = interpolate(f, [t0 + 18, t0 + 42], [0, 1], { ...cl, easing: Easing.bezier(0.65, 0, 0.35, 1) });
    const fl = Math.sin(t * Math.PI * 2 * 2 + ph) * 8 * fin;
    return { opacity: Math.min(1, Math.max(0, (f - t0) / 5)), transform: `translateX(${side * (1 - slide) * -28}px) translateY(${fl}px) scale(${0.8 + 0.2 * s})`, transformOrigin: side < 0 ? 'right center' : 'left center' };
  };
  const chipBase: React.CSSProperties = { position: 'absolute', display: 'flex', alignItems: 'center', gap: 18, padding: '14px 32px 14px 14px', borderRadius: 999, background: C.panel, color: C.ink, whiteSpace: 'nowrap', font: `600 34px/1.15 ${F.text}`, letterSpacing: '-0.015em', boxShadow: `0 0 0 1px ${rgba(C.ink, 0.06)}, 0 3px 6px ${rgba(C.ink, 0.08)}, 0 26px 50px -16px ${rgba(C.ink, 0.3)}` };
  const icon = (glyph: string, bg: string) => <div style={{ width: 60, height: 60, borderRadius: 30, background: bg, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', font: `600 22px ${F.mono}`, flex: 'none' }}>{glyph}</div>;
  return (
    <AbsoluteFill style={{ background: C.ground, overflow: 'hidden' }}>
      {RINGS.map(({ size, color, phase }, i) => (
        <div key={i} style={{ position: 'absolute', left: 960 - size / 2, top: 540 - size / 2, width: size, height: size, borderRadius: '50%', background: color, boxShadow: `inset 0 2px 0 rgba(255,255,255,0.85), 0 0 0 1.5px rgba(255,255,255,0.6), 0 10px 40px ${rgba(C.ink, 0.04 + i * 0.012)}`, transform: `scale(${1 + 0.06 * Math.sin(t * Math.PI * 2 * 1.5 + phase)})` }} />
      ))}
      <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse 26% 44% at 50% 50%, rgba(255,255,255,0.75) 0%, rgba(255,255,255,0) 100%)' }} />
      <div style={{ position: 'absolute', left: PX, top: PY, width: PW, height: PH, transform: `translateY(${(1 - rise) * 90}px)`, opacity: Math.min(1, rise * 2.2) }}>
        <div style={{ position: 'absolute', inset: 0, borderRadius: 66, boxShadow: `0 4px 10px ${rgba(C.ink, 0.18)}, 0 ${40 + (1 - rise) * 30}px ${80 + (1 - rise) * 40}px -20px ${rgba(C.ink, 0.38)}` }} />
        <div style={{ position: 'absolute', inset: 0, borderRadius: 66, padding: 12, background: 'linear-gradient(145deg, #D5DCE6 0%, #8D97A6 30%, #C3CBD6 55%, #6F7988 80%, #AEB7C4 100%)' }}>
          <div style={{ position: 'relative', width: '100%', height: '100%', borderRadius: 54, background: '#0B1220', padding: 9, boxSizing: 'border-box' }}>
            <div style={{ position: 'relative', width: '100%', height: '100%', borderRadius: 46, background: C.ground, overflow: 'hidden' }}>
              <div style={{ position: 'absolute', left: 0, top: 0, width: scrW, transform: `translateY(${scrollY}px)` }}>
                {P.slices.map((s: any) => <Img key={s.file} src={staticFile(DIR + s.file)} style={{ position: 'absolute', left: 0, top: s.y * k, width: scrW, height: s.h * k }} />)}
              </div>
              <div style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 56, background: `linear-gradient(180deg, ${C.ground} 60%, ${rgba(C.ground, 0)})` }} />
              <div style={{ position: 'absolute', left: '50%', top: 12, width: 112, height: 32, marginLeft: -56, borderRadius: 16, background: '#0B1220' }} />
              <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', background: 'linear-gradient(118deg, rgba(255,255,255,0) 32%, rgba(255,255,255,0.12) 44%, rgba(255,255,255,0) 56%)' }} />
            </div>
          </div>
        </div>
      </div>
      <div style={{ ...chipBase, top: 250, right: 1920 - PX + 64, ...chip(40, 0, -1) }}>{icon('✓', C.ok)}Faucet running, on the job</div>
      <div style={{ ...chipBase, top: 470, left: PX + PW + 64, ...chip(190, 1.8, 1) }}>{icon('✓', C.ok)}Faucet off, no drip</div>
      <div style={{ ...chipBase, top: 690, right: 1920 - PX + 64, ...chip(340, 3.1, -1) }}>{icon('$', C.primary)}Parts receipt, $47.05</div>
      <Honest x={56} top={40} from={30} dur={d - 40}>Demo pro · real photos from Wikimedia Commons, re-dated to this job</Honest>
      <Sequence from={10} durationInFrames={d - 10}><CaptionBand duration={d - 10} text="From the job, the plumber sent the after photos and the parts receipt." /></Sequence>
    </AbsoluteFill>
  );
};

// ── S8 the checks: scanline-annotate-focus over the real "Done when" column ─────────────────────────────────────────
type Target = { key: string; x: number; y: number; w: number; h: number; head: string; detail: string; tag: 'right' | 'above' | 'below' };
const sig = F2.signals as any[], th = F2.thumbs as any[], cond = ST.final2.desktop.cond as any[];
const TARGETS: Target[] = [
  { key: 'saw', x: 420, y: sig[0].y - 128, w: 360, h: 118, head: 'MODEL', detail: 'done-vlm: water flowing from the faucet', tag: 'right' },
  { key: 'time', x: 420, y: sig[0].y - 2, w: 360, h: 64, head: 'CODE', detail: 'taken during the job, 51 m from the address', tag: 'right' },
  { key: 'photo', x: 420, y: th[0].y, w: 360, h: th[0].h, head: 'CODE', detail: 'a real photo, not used on another job', tag: 'right' },
  { key: 'saw2', x: 420, y: sig[1].y - 128, w: 360, h: 118, head: 'MODEL', detail: 'done-vlm: the sink and the faucet', tag: 'right' },
  { key: 'time2', x: 420, y: sig[1].y - 2, w: 360, h: 64, head: 'CODE', detail: 'photo 2: same job, same place', tag: 'right' },
  { key: 'receipt', x: 420, y: sig[2].y - 2, w: 360, h: sig[2].h + 4, head: 'MODEL', detail: 'done-ocr: Moen 1225 cartridge, $47.05', tag: 'right' },
  { key: 'stamp', x: cond[2].x + cond[2].w - 104, y: F2.stamp[2].y - 6, w: 100, h: 48, head: 'CODE', detail: 'decides: every condition passed', tag: 'right' },
];
export const Checks: React.FC = () => {
  const f = useCurrentFrame();
  const d = SHOTS.checks.duration;
  const TITLE = d - 105;
  // the scan: strictly uniform in page y (no easing: the machine's eye); the camera keeps the line at 58% of the window
  const SCAN0 = 20, SCAN1 = 860, Y0 = 940, Y1 = 2620;
  const scanY = (fr: number) => Y0 + (Y1 - Y0) * Math.min(1, Math.max(0, (fr - SCAN0) / (SCAN1 - SCAN0)));
  const frameAtY = (y: number) => SCAN0 + ((y - Y0) / (Y1 - Y0)) * (SCAN1 - SCAN0);
  let prev = -99; const ft = TARGETS.map((t) => { const v = Math.max(frameAtY(t.y + t.h), prev + 4); prev = v; return v; });
  const ly = scanY(f);
  const Z = 2.0, WX = 100, WY = 116, WW = 1000, WH = 730;
  const camY = Math.max(Y0 - 260, ly - 0.58 * WH / Z);
  const camX = 382;
  const toS = (x: number, y: number) => ({ x: (x - camX) * Z, y: (y - camY) * Z });
  const fired = ft.filter((v) => f >= v).length;
  const lineOn = interpolate(f, [SCAN0 - 4, SCAN0 + 1, SCAN1, SCAN1 + 8], [0, 1, 1, 0], cl);
  const done = f > Math.max(...ft) + 8;
  const MACHINE = C.signal;
  return (
    <AbsoluteFill style={{ background: C.ground }}>
      {f < TITLE && (
        <>
          <div style={{ position: 'absolute', left: WX, top: 40, width: 1720, height: 48, display: 'flex', alignItems: 'center', font: `600 30px ${F.mono}`, color: C.ink }}>
            <div style={{ width: 14, height: 14, borderRadius: 7, marginRight: 16, background: MACHINE, opacity: done ? 1 : 0.45 + 0.55 * (0.5 + 0.5 * Math.sin(f / 3)), boxShadow: `0 0 0 6px ${rgba(MACHINE, 0.12)}` }} />
            <span style={{ color: done ? MACHINE : C.ink, letterSpacing: '0.06em' }}>{done ? 'EVERY CONDITION PASSED' : 'CHECKING THE EVIDENCE'}</span>
            <span style={{ color: C.ink3, marginLeft: 18, fontWeight: 500 }}>#DP-1041</span>
            <span style={{ marginLeft: 'auto', letterSpacing: '0.04em' }}><span style={{ color: C.ink3, fontWeight: 500 }}>SIGNALS </span><span style={{ color: fired === TARGETS.length ? MACHINE : C.ink }}>{String(fired).padStart(2, '0')}</span><span style={{ color: C.ink3 }}> / {String(TARGETS.length).padStart(2, '0')}</span></span>
          </div>
          <div style={{ position: 'absolute', left: WX, top: WY, width: WW, height: WH, borderRadius: 20, overflow: 'hidden', background: C.ground, boxShadow: `${SHADOW_LG}, 0 0 0 1px ${rgba(C.ink, 0.08)}` }}>
            <div style={{ position: 'absolute', left: -camX * Z, top: -camY * Z, width: 1920 * Z, transformOrigin: '0 0' }}>
              {F2.slices.map((s: any) => (s.y + s.h > camY - 50 && s.y < camY + WH / Z + 50) && <Img key={s.file} src={staticFile(DIR + s.file)} style={{ position: 'absolute', left: 0, top: s.y * Z, width: 1920 * Z, height: s.h * Z }} />)}
            </div>
            {lineOn > 0.01 && (() => { const y = toS(0, ly).y; return (
              <>
                <div style={{ position: 'absolute', left: 0, width: WW, top: y - 140, height: 140, opacity: lineOn, background: `linear-gradient(180deg, ${rgba(MACHINE, 0)} 0%, ${rgba(MACHINE, 0.04)} 60%, ${rgba(MACHINE, 0.11)} 100%)` }} />
                <div style={{ position: 'absolute', left: 0, width: WW, top: y - 1.5, height: 3, opacity: lineOn, background: MACHINE, boxShadow: `0 0 10px ${rgba(MACHINE, 0.5)}, 0 0 26px ${rgba(MACHINE, 0.28)}` }} />
              </>
            ); })()}
          </div>
          <div style={{ position: 'absolute', left: WX, top: WY, width: WW, height: WH, overflow: 'hidden', borderRadius: 20 }}>
            {TARGETS.map((t, i) => {
              const s = toS(t.x, t.y), w = t.w * Z, h = t.h * Z;
              const fr = f - ft[i]; if (fr < 0) return null;
              const sp = spring({ frame: fr, fps: 30, config: { damping: 15, stiffness: 210 } });
              const pad = 76 * (1 - sp), op = Math.min(1, fr / 3);
              const arm = 40 - 14 * interpolate(f, [ft[i] + 3, ft[i] + 15], [0, 1], { ...cl, easing: snappy });
              const flash = interpolate(f, [ft[i] + 3, ft[i] + 6], [0, 1], cl) * (1 - interpolate(f, [ft[i] + 6, ft[i] + 18], [0, 1], cl));
              const x = s.x - pad, y = s.y - pad, W = w + pad * 2, H = h + pad * 2;
              const dpath = `M${x} ${y + arm}V${y}H${x + arm}M${x + W - arm} ${y}H${x + W}V${y + arm}M${x + W} ${y + H - arm}V${y + H}H${x + W - arm}M${x + arm} ${y + H}H${x}V${y + H - arm}`;
              const s0 = ft[i] + 5;
              const visible = s.y + h > -20 && s.y < WH + 20;
              return (
                <React.Fragment key={t.key}>
                  <div style={{ position: 'absolute', left: s.x, top: s.y, width: w, height: h, borderRadius: 6, background: rgba(MACHINE, 0.075 * flash), boxShadow: `inset 0 0 0 2px ${rgba(MACHINE, 0.4 * flash)}` }} />
                  <svg width={WW} height={WH} style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible', opacity: op }}><path d={dpath} fill="none" stroke={MACHINE} strokeWidth={3.5} strokeLinecap="round" strokeLinejoin="round" /></svg>
                  {f >= s0 && visible && (
                    <div style={{ position: 'absolute', left: Math.max(4, s.x - 22), top: Math.max(4, Math.min(WH - 44, s.y - 22)), width: 44, height: 44, borderRadius: 22, background: t.head === 'MODEL' ? C.agent : MACHINE, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', font: `700 20px ${F.mono}`, opacity: interpolate(f, [s0, s0 + 4], [0, 1], cl), transform: `scale(${0.6 + 0.4 * interpolate(f, [s0, s0 + 10], [0, 1], { ...cl, easing: snappy })})`, boxShadow: `0 8px 18px -8px ${rgba(C.ink, 0.55)}` }}>
                      {String(i + 1).padStart(2, '0')}
                    </div>
                  )}
                </React.Fragment>
              );
            })}
          </div>
          {/* the readout: what each bracketed signal says, written out by the machine (scanline card's label, moved
              beside the window so it reads at full size) */}
          <div style={{ position: 'absolute', left: 1140, top: WY, width: 680, height: WH, borderRadius: 20, background: C.panel, boxShadow: `${SHADOW_LG}, 0 0 0 1px ${rgba(C.ink, 0.08)}`, padding: '26px 30px', boxSizing: 'border-box' }}>
            <div style={{ font: `700 30px/1 ${F.text}`, letterSpacing: '0.02em', color: C.ink3 }}>What the check read</div>
            {TARGETS.map((t, i) => {
              const s0 = ft[i] + 5; if (f < s0) return null;
              const typed = Math.floor(Math.min(t.detail.length, (f - s0) * 2.4 + 1));
              const r = interpolate(f, [s0, s0 + 12], [0, 1], { ...cl, easing: snappy });
              return (
                <div key={t.key} style={{ display: 'flex', gap: 14, alignItems: 'baseline', marginTop: 18, opacity: r, transform: `translateY(${(1 - r) * 10}px)` }}>
                  <span style={{ flex: 'none', width: 196, padding: '7px 0', textAlign: 'center', borderRadius: 7, background: t.head === 'MODEL' ? C.agent : MACHINE, color: '#fff', font: `700 24px/1 ${F.mono}`, letterSpacing: '0.03em', whiteSpace: 'nowrap' }}>{String(i + 1).padStart(2, '0')} · {t.head}</span>
                  <span style={{ font: `500 32px/1.22 ${F.text}`, color: C.ink }}>{t.detail.slice(0, typed)}</span>
                </div>
              );
            })}
          </div>
          <Sequence from={10} durationInFrames={300}><CaptionBand duration={300} text="Our own models read the photos and the receipt: what each photo shows, what the receipt says." /></Sequence>
          <Sequence from={316} durationInFrames={300}><CaptionBand duration={300} text="Code checks when and where each photo was taken, and that it was never used on another job." /></Sequence>
          <Sequence from={622} durationInFrames={TITLE - 622}><CaptionBand duration={TITLE - 622} text="The models give verdicts with their reasons. Code decides." /></Sequence>
        </>
      )}
      {f >= TITLE && <Sequence from={TITLE} durationInFrames={d - TITLE}><TitleCard duration={d - TITLE} size={100} text="Models give verdicts.| *Code* decides the money." /></Sequence>}
    </AbsoluteFill>
  );
};

// ── S9 released: three real panels side by side; the page's PAID stamp lands on the beat; the money table assembles
// (product-card-progressive-assemble: skeleton rows, a fill cursor jumping row to row, rows rising into place) ─────────
export const Release: React.FC<{ stampAt: number }> = ({ stampAt }) => {
  const f = useCurrentFrame();
  const d = SHOTS.release.duration;
  const S = F2.slices;
  const paid = F2.stamp[3]; // the printed PAID stamp
  const money = F2.spec.find((b: any) => /Captured/.test(b.text));
  const K = 1.75;
  const paidR = { x: 903, y: 368, w: 309, h: 357 };
  const moneyR = { x: 903, y: money.y - 40, w: 309, h: 330 };
  const idsR = { x: 903, y: 4785, w: 309, h: 345 };
  const rows = [[8, 45], [45, 101], [101, 139], [139, 222]].map(([a, b]) => ({ x: money.x - moneyR.x, y: money.y + a - moneyR.y, w: money.w, h: b - a }));
  const A0 = 110, IDS = 290;
  const push = 1 + 0.02 * interpolate(f, [0, d], [0, 1], cl);
  const st = interpolate(f, [stampAt, stampAt + 14], [0, 1], { ...cl, easing: snappy });
  return (
    <AbsoluteFill style={{ background: C.ground }}>
      <AbsoluteFill style={{ transform: `scale(${push})` }}>
        <Cutout slices={S} r={paidR} k={K} style={{ left: 100, top: 96, ...rise(f, 0) }}>
          {/* the printed stamp is covered until it lands, then the page's own stamp scales in (its stamp language) */}
          {f < stampAt + 14 && <div style={{ position: 'absolute', left: 3, top: (paid.y - paidR.y - 14) * K, width: paidR.w * K - 6, height: (paid.h + 28) * K, background: C.panel }} />}
          {f >= stampAt && f < stampAt + 14 && (
            <div style={{ position: 'absolute', left: (paid.x - paidR.x - 12) * K, top: (paid.y - paidR.y - 12) * K, width: (paid.w + 24) * K, height: (paid.h + 24) * K, overflow: 'hidden', transform: `scale(${1.6 - 0.6 * st})`, opacity: Math.min(1, (f - stampAt) / 6) }}>
              {S.filter((s: any) => s.y <= paid.y && s.y + s.h >= paid.y).map((s: any) => <Img key={s.file} src={staticFile(DIR + s.file)} style={{ position: 'absolute', left: -(paid.x - 12) * K, top: (s.y - (paid.y - 12)) * K, width: 1920 * K, height: s.h * K }} />)}
            </div>
          )}
        </Cutout>
        {f >= A0 && (
          <Cutout slices={S} r={moneyR} k={K} style={{ left: 100 + 309 * K + 50, top: 96, ...rise(f, A0) }}>
            {rows.map((r, i) => {
              const arrive = A0 + 20 + i * 16;
              const land = interpolate(f, [arrive + 2, arrive + 16], [0, 1], { ...cl, easing: snappy });
              return (
                <div key={i} style={{ position: 'absolute', left: (r.x - 4) * K, top: r.y * K, width: (r.w + 8) * K, height: r.h * K, background: C.panel, opacity: 1 - land }}>
                  <div style={{ position: 'absolute', left: 4 * K, top: (r.h * K) / 2 - 8, width: r.w * K * 0.45, height: 16, borderRadius: 8, background: C.inset }} />
                  <div style={{ position: 'absolute', right: 4 * K, top: (r.h * K) / 2 - 8, width: r.w * K * 0.25, height: 16, borderRadius: 8, background: C.inset }} />
                </div>
              );
            })}
            {f >= A0 + 14 && f < A0 + 20 + rows.length * 16 + 24 && (() => {
              const swift = Easing.bezier(0.4, 0, 0.2, 1);
              let i = 0; for (let k = 0; k < rows.length; k++) if (f >= A0 + 20 + k * 16 - 6) i = k;
              const pr = rows[Math.max(0, i - 1)], r = rows[i];
              const t = i === 0 ? 1 : interpolate(f, [A0 + 20 + i * 16 - 6, A0 + 20 + i * 16], [0, 1], { ...cl, easing: swift });
              const y = pr.y + (r.y - pr.y) * t, h = pr.h + (r.h - pr.h) * t;
              const fade = interpolate(f, [A0 + 20 + rows.length * 16 + 10, A0 + 20 + rows.length * 16 + 18], [1, 0], cl) * interpolate(f, [A0 + 14, A0 + 18], [0, 1], cl);
              return (
                <div style={{ position: 'absolute', left: (r.x - 8) * K, top: y * K - 2, width: (r.w + 16) * K, height: h * K + 4, borderRadius: 6, border: `2.5px solid ${C.signal}`, boxShadow: `0 0 0 6px ${rgba(C.signal, 0.14)}`, opacity: fade }}>
                  <div style={{ position: 'absolute', right: -2, top: -34, padding: '6px 9px', borderRadius: 5, background: C.signal, color: '#fff', font: `600 20px/1 ${F.mono}`, letterSpacing: '0.06em' }}>WRITTEN BY CODE</div>
                </div>
              );
            })()}
          </Cutout>
        )}
        {f >= IDS && <Cutout slices={S} r={idsR} k={K} style={{ left: 100 + 2 * (309 * K + 50), top: 96, ...rise(f, IDS) }} />}
      </AbsoluteFill>
      <Honest x={100} top={24} from={IDS} dur={d - IDS - 10}>Stand-in ids (SIMULATED PAYPAL) on this demo server</Honest>
      <Sequence from={stampAt + 4} durationInFrames={A0 + 120 - stampAt}><CaptionBand duration={A0 + 120 - stampAt} text="Every condition passed, so code captured exactly what was due: $232.05 of the $247.05 hold." /></Sequence>
      <Sequence from={A0 + 124} durationInFrames={d - A0 - 124}><CaptionBand duration={d - A0 - 124} text="One Payouts batch paid the pro $208.84. No one pressed a button; the ledger adds up to the cent." /></Sequence>
    </AbsoluteFill>
  );
};
