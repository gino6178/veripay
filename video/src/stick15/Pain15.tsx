// "Pay first, or fix first?": a 15-second picture-only short (no voice) in the stickman B1 "Minimal Line Art" look
// (kaomei/stickman-video-director): fine black pen lines on faint-grid paper, slender expressive stick figures,
// warm red/yellow/green accents, large hand-lettered scene text and a quiet caption line. Everything is drawn here in
// SVG; no image generator. 1920x1080, 30 fps, 450 frames.
import React, { useEffect, useState } from 'react';
import { AbsoluteFill, continueRender, delayRender, Easing, interpolate, staticFile, useCurrentFrame } from 'remotion';

export const FPS15 = 30, TOTAL15 = 450;
const INK = '#1d1d1f', INK2 = '#55595f', PAPER = '#FDFDFC', RED = '#e0453a', YEL = '#f2c230', GRN = '#3f9b5a', BLUE = '#1f5fbf', CASH = '#cfe8c8';
const HAND = "'Caveat', 'Comic Sans MS', cursive";
const ease = Easing.bezier(0.22, 1, 0.36, 1);
const tw = (f: number, a: number, b: number, from = 0, to = 1) => interpolate(f, [a, b], [from, to], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: ease });
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

// ---- the font (OFL Caveat, from the stickman repo) -------------------------------------------------------------------
const FONT_CSS = `@font-face{font-family:'Caveat';font-weight:400 700;font-display:block;src:url('${staticFile('fonts/Caveat.ttf')}') format('truetype');}`;
const Font: React.FC = () => {
  const [h] = useState(() => delayRender('caveat', { timeoutInMilliseconds: 30000 }));
  useEffect(() => { let done = false; const fin = () => { if (!done) { done = true; continueRender(h); } }; document.fonts.load(`700 60px Caveat`).then(fin, fin); const t = setTimeout(fin, 15000); return () => clearTimeout(t); }, [h]);
  return <style>{FONT_CSS}</style>;
};

// ---- paper -----------------------------------------------------------------------------------------------------------
const Paper: React.FC = () => (
  <AbsoluteFill style={{ background: PAPER }}>
    <svg width={1920} height={1080} style={{ position: 'absolute' }}>
      <defs><pattern id="g" width="96" height="96" patternUnits="userSpaceOnUse"><path d="M96 0H0V96" fill="none" stroke="rgba(76,90,105,.045)" strokeWidth="1.2" /></pattern></defs>
      <rect width="1920" height="915" fill="url(#g)" />
    </svg>
  </AbsoluteFill>
);

// ---- the stick figure ------------------------------------------------------------------------------------------------
// Angles are absolute, in degrees from straight down (0), positive towards +x. One pose per limb, slender proportions
// (about 4.3 heads tall), small oval hands and feet.
type Pose = { lean: number; ua1: number; fa1: number; ua2: number; fa2: number; th1: number; sh1: number; th2: number; sh2: number; tilt?: number };
type Face = 'calm' | 'happy' | 'grin' | 'worried' | 'shock' | 'angry' | 'talk';
const D = (a: number) => [Math.sin((a * Math.PI) / 180), Math.cos((a * Math.PI) / 180)] as const;
const mix = (p: Pose, q: Pose, t: number): Pose => Object.fromEntries(Object.keys(p).map((k) => [k, lerp((p as any)[k] ?? 0, (q as any)[k] ?? 0, t)])) as Pose;
const STAND: Pose = { lean: 0, ua1: -14, fa1: -6, ua2: 14, fa2: 6, th1: -9, sh1: -4, th2: 9, sh2: 4 };

const Stick: React.FC<{ x: number; y: number; pose: Pose; face: Face; dir?: 1 | -1; s?: number; cap?: boolean; hair?: boolean; mouthOpen?: number; children?: React.ReactNode; handR?: React.ReactNode; handL?: React.ReactNode }> = ({ x, y, pose, face, dir = 1, s = 1, cap, hair, mouthOpen = 0, handR, handL }) => {
  const T = 132, R = 34, UA = 66, FA = 60, TH = 80, SH = 76;
  const [lx, ly] = D(180 + pose.lean); const neck = [lx * T, ly * T];
  const sh = [neck[0] * 0.9, neck[1] * 0.9];
  const head = [neck[0] + D(180 + pose.lean + (pose.tilt || 0))[0] * (R + 6), neck[1] + D(180 + pose.lean + (pose.tilt || 0))[1] * (R + 6)];
  const limb = (o: number[], a1: number, a2: number, l1: number, l2: number) => { const [a, b] = D(a1), [c, d] = D(a2); const j = [o[0] + a * l1, o[1] + b * l1]; return [j, [j[0] + c * l2, j[1] + d * l2]]; };
  const [e1, h1] = limb(sh, pose.ua1, pose.fa1, UA, FA), [e2, h2] = limb(sh, pose.ua2, pose.fa2, UA, FA);
  const [k1, f1] = limb([0, 0], pose.th1, pose.sh1, TH, SH), [k2, f2] = limb([0, 0], pose.th2, pose.sh2, TH, SH);
  const P = (a: number[]) => `${a[0].toFixed(1)} ${a[1].toFixed(1)}`;
  const st = { fill: 'none', stroke: INK, strokeWidth: 4.2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  const hx = head[0], hy = head[1], fx = dir * 9;
  const brow = { calm: [0, 0], happy: [-2, 2], grin: [-4, 4], worried: [6, -6], shock: [-8, -8], angry: [-6, 8], talk: [0, 0] }[face];
  const mouth = (() => {
    const mx = hx + fx, my = hy + 14;
    switch (face) {
      case 'happy': return <path d={`M${mx - 11} ${my - 2} Q${mx} ${my + 9} ${mx + 11} ${my - 2}`} {...st} strokeWidth={3.4} />;
      case 'grin': return <path d={`M${mx - 14} ${my - 4} Q${mx} ${my + 16} ${mx + 14} ${my - 4} Z`} fill="#fff" stroke={INK} strokeWidth={3.4} strokeLinejoin="round" />;
      case 'worried': return <path d={`M${mx - 10} ${my + 5} Q${mx} ${my - 5} ${mx + 10} ${my + 5}`} {...st} strokeWidth={3.4} />;
      case 'angry': return <path d={`M${mx - 12} ${my + 6} Q${mx} ${my - 4} ${mx + 12} ${my + 6} Q${mx} ${my + 1} ${mx - 12} ${my + 6}`} fill={INK} stroke={INK} strokeWidth={2.4} />;
      case 'shock': return <ellipse cx={mx} cy={my + 3} rx={7} ry={10} fill={INK} />;
      case 'talk': return <ellipse cx={mx} cy={my + 1} rx={8} ry={2 + 6 * mouthOpen} fill={INK} />;
      default: return <path d={`M${mx - 8} ${my} L${mx + 8} ${my}`} {...st} strokeWidth={3.4} />;
    }
  })();
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      {/* legs, torso, arms */}
      <path d={`M0 0 L${P(k1)} L${P(f1)} M0 0 L${P(k2)} L${P(f2)} M0 0 L${P(neck)}`} {...st} />
      <ellipse cx={f1[0] + 9 * dir} cy={f1[1] + 2} rx={13} ry={6} fill="#fff" stroke={INK} strokeWidth={3.4} />
      <ellipse cx={f2[0] + 9 * dir} cy={f2[1] + 2} rx={13} ry={6} fill="#fff" stroke={INK} strokeWidth={3.4} />
      <path d={`M${P(sh)} L${P(e1)} L${P(h1)} M${P(sh)} L${P(e2)} L${P(h2)}`} {...st} />
      {handL && <g transform={`translate(${h1[0]} ${h1[1]})`}>{handL}</g>}
      {handR && <g transform={`translate(${h2[0]} ${h2[1]})`}>{handR}</g>}
      <ellipse cx={h1[0]} cy={h1[1]} rx={7} ry={9} fill="#fff" stroke={INK} strokeWidth={3.2} />
      <ellipse cx={h2[0]} cy={h2[1]} rx={7} ry={9} fill="#fff" stroke={INK} strokeWidth={3.2} />
      {/* head */}
      {hair && <path d={`M${hx - dir * 30} ${hy - 14} q${-dir * 24} 6 ${-dir * 30} 34 q${dir * 14} -8 ${dir * 22} -22`} fill={INK} stroke={INK} strokeWidth={3} strokeLinejoin="round" />}
      <circle cx={hx} cy={hy} r={R} fill="#fff" {...{ stroke: INK, strokeWidth: 4.2 }} />
      {hair && <path d={`M${hx - 30} ${hy - 12} Q${hx - 6} ${hy - 44} ${hx + 30} ${hy - 14} Q${hx + 4} ${hy - 30} ${hx - 30} ${hy - 12}`} fill={INK} />}
      {cap && <g><path d={`M${hx - 33} ${hy - 6} Q${hx} ${hy - 50} ${hx + 33} ${hy - 6} Z`} fill={RED} stroke={INK} strokeWidth={3.4} strokeLinejoin="round" /><path d={`M${hx + dir * 8} ${hy - 7} L${hx + dir * 52} ${hy - 4}`} stroke={INK} strokeWidth={6} strokeLinecap="round" /></g>}
      <ellipse cx={hx + fx - 10} cy={hy - 2} rx={face === 'shock' ? 5 : 4} ry={face === 'shock' ? 8 : 6.5} fill={INK} />
      <ellipse cx={hx + fx + 10} cy={hy - 2} rx={face === 'shock' ? 5 : 4} ry={face === 'shock' ? 8 : 6.5} fill={INK} />
      <path d={`M${hx + fx - 17} ${hy - 13 - brow[0] * 0.5} L${hx + fx - 4} ${hy - 13 + brow[0] * 0.25}  M${hx + fx + 4} ${hy - 13 + brow[1] * 0.25} L${hx + fx + 17} ${hy - 13 - brow[1] * 0.5}`} {...st} strokeWidth={3} />
      {mouth}
      {(face === 'worried' || face === 'shock') && <path d={`M${hx - dir * 40} ${hy - 20} q-5 10 0 14 q5 -4 0 -14`} fill="#8fc3ea" stroke={INK} strokeWidth={2} />}
    </g>
  );
};

// ---- props -----------------------------------------------------------------------------------------------------------
const st = { fill: 'none', stroke: INK, strokeWidth: 4, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
const Cash: React.FC<{ w?: number }> = ({ w = 70 }) => (
  <g transform="translate(-6 -22) rotate(-8)"><rect x={0} y={0} width={w} height={w * 0.5} rx={4} fill={CASH} stroke={INK} strokeWidth={3} /><rect x={4} y={-6} width={w} height={w * 0.5} rx={4} fill={CASH} stroke={INK} strokeWidth={3} /><text x={4 + w / 2} y={w * 0.36} textAnchor="middle" fontFamily={HAND} fontWeight={700} fontSize={w * 0.42} fill={GRN}>$</text></g>
);
// the kitchen sink with a faucet that drips: `drip` 0 = stopped, 1 = dripping
const Sink: React.FC<{ f: number; drip: number; puddle?: number }> = ({ f, drip, puddle = 0 }) => {
  const drops = [0, 1, 2].map((k) => { const t = ((f + k * 11) % 33) / 33; return { y: 560 + t * 120, o: drip * (t < 0.92 ? 1 : 0) }; });
  return (
    <g>
      <path d="M210 680 L760 680 L760 690 L210 690 Z" fill="#f4efe6" stroke={INK} strokeWidth={4} strokeLinejoin="round" />
      <path d="M240 690 L240 860 M730 690 L730 860 M240 760 L730 760" {...st} />
      <path d="M380 680 Q385 740 480 742 Q575 740 580 680" fill="#eef4f8" stroke={INK} strokeWidth={4} />
      <path d="M470 680 L470 520 Q470 492 500 492 L560 492 Q580 492 580 512 L580 540" {...st} strokeWidth={9} stroke="#9aa3ad" />
      <path d="M470 680 L470 520 Q470 492 500 492 L560 492 Q580 492 580 512 L580 540" {...st} strokeWidth={3} />
      <rect x={448} y={600} width={44} height={14} rx={4} fill="#fff" stroke={INK} strokeWidth={3} />
      {drops.map((d, i) => <path key={i} opacity={d.o} d={`M580 ${d.y} q-7 12 0 16 q7 -4 0 -16`} fill="#8fc3ea" stroke={INK} strokeWidth={2} transform={`translate(0 ${-560 + 548})`} />)}
      {drip > 0 && <path d="M560 560 q-12 -6 -18 -16 M600 560 q12 -6 18 -16" stroke="#8fc3ea" strokeWidth={3} strokeLinecap="round" opacity={0.8 * drip} />}
      {puddle > 0 && <ellipse cx={600} cy={856} rx={20 + 70 * puddle} ry={6 + 6 * puddle} fill="#cfe5f5" stroke={INK} strokeWidth={2.5} />}
    </g>
  );
};
const Phone: React.FC<{ x: number; y: number; r?: number; s?: number; children?: React.ReactNode }> = ({ x, y, r = 0, s = 1, children }) => (
  <g transform={`translate(${x} ${y}) rotate(${r}) scale(${s})`}>
    <rect x={-46} y={-84} width={92} height={168} rx={14} fill="#fff" stroke={INK} strokeWidth={4} />
    <rect x={-36} y={-68} width={72} height={128} rx={6} fill="#f2f6fb" stroke={INK} strokeWidth={2} />
    <circle cx={0} cy={72} r={5} fill="none" stroke={INK} strokeWidth={2} />
    {children}
  </g>
);
const Check: React.FC<{ x: number; y: number; t: number; c?: string }> = ({ x, y, t, c = GRN }) => (
  <path d={`M${x} ${y} l14 14 l28 -32`} fill="none" stroke={c} strokeWidth={8} strokeLinecap="round" strokeLinejoin="round" pathLength={1} strokeDasharray={1} strokeDashoffset={1 - t} />
);
// a hand-drawn underline that draws itself
const Under: React.FC<{ x: number; y: number; w: number; t: number; c?: string }> = ({ x, y, w, t, c = RED }) => (
  <path d={`M${x} ${y} q${w / 2} 8 ${w} -2`} fill="none" stroke={c} strokeWidth={6} strokeLinecap="round" pathLength={1} strokeDasharray={1} strokeDashoffset={1 - t} />
);

// ---- text ------------------------------------------------------------------------------------------------------------
const Big: React.FC<{ x: number; y: number; t: number; size?: number; color?: string; children: React.ReactNode; anchor?: 'start' | 'middle' }> = ({ x, y, t, size = 118, color = INK, children, anchor = 'start' }) => (
  <text x={x} y={y + (1 - t) * 16} opacity={t} fontFamily={HAND} fontWeight={700} fontSize={size} fill={color} textAnchor={anchor} letterSpacing={1}>{children}</text>
);
const Caption: React.FC<{ text: string; t: number }> = ({ text, t }) => (
  <div style={{ position: 'absolute', left: 0, right: 0, top: 940, textAlign: 'center', fontFamily: HAND, fontWeight: 600, fontSize: 60, color: INK2, opacity: t }}>{text}</div>
);

// ---- scenes ----------------------------------------------------------------------------------------------------------
// 1 (0-3 s): she hands the plumber the money first; he walks off with it
const Scene1: React.FC<{ f: number }> = ({ f }) => {
  const give = tw(f, 12, 34), walk = tw(f, 44, 90);
  const maria = mix(STAND, { ...STAND, lean: 6, ua2: 70, fa2: 92, tilt: 6 }, give);
  const pro = mix({ ...STAND, ua1: -62, fa1: -88 }, { ...STAND, ua1: 20, fa1: 50, th1: -28, sh1: -8, th2: 22, sh2: 34 }, walk);
  const step = Math.sin(f / 3.2) * walk;
  const cashAt = give < 1 ? null : true;
  return (
    <svg width={1920} height={1080} style={{ position: 'absolute' }}>
      <Sink f={f} drip={1} />
      <path d="M140 862 L1800 862" stroke={INK} strokeWidth={2.5} strokeLinecap="round" opacity={0.5} />
      <Stick x={980} y={720} pose={maria} face={give < 0.6 ? 'calm' : 'happy'} hair handR={!cashAt ? <Cash /> : null} />
      <Stick x={1270 + walk * 700} y={720 - Math.abs(step) * 6} pose={{ ...pro, th1: pro.th1 + step * 22, th2: pro.th2 - step * 22 }} face={walk > 0.1 ? 'grin' : 'happy'} dir={walk > 0.05 ? 1 : -1} cap handL={cashAt ? <Cash /> : null} />
      <Big x={1010} y={250} t={tw(f, 4, 20)}>Pay first?</Big>
      <Under x={1010} y={278} w={330} t={tw(f, 22, 40)} c={YEL} />
    </svg>
  );
};
// 2 (3-6 s): it still drips, and the phone rings with a surprise bill
const Scene2: React.FC<{ f: number }> = ({ f }) => {
  const shock = tw(f, 28, 40), ring = f > 30 ? Math.sin(f * 1.6) * 6 * (1 - tw(f, 70, 90)) : 0;
  const maria = mix({ ...STAND, lean: -4, ua1: -40, fa1: -150, ua2: 40, fa2: 150, tilt: -6 }, { ...STAND, lean: -6, ua1: -112, fa1: 158, ua2: 112, fa2: -158, tilt: -6 }, shock);
  return (
    <svg width={1920} height={1080} style={{ position: 'absolute' }}>
      <Sink f={f + 90} drip={1} puddle={tw(f, 0, 90)} />
      <path d="M140 862 L1800 862" stroke={INK} strokeWidth={2.5} strokeLinecap="round" opacity={0.5} />
      <Stick x={960} y={720} pose={maria} face={shock < 0.5 ? 'worried' : 'shock'} dir={-1} hair />
      <g opacity={tw(f, 24, 32)} transform={`translate(0 ${(1 - tw(f, 24, 36)) * 30})`}>
        <Phone x={1310} y={600} r={ring}>
          <text x={0} y={-30} textAnchor="middle" fontFamily={HAND} fontWeight={700} fontSize={21} fill={INK2}>Plumber</text>
          <circle cx={-18} cy={30} r={12} fill={GRN} /><circle cx={18} cy={30} r={12} fill={RED} />
        </Phone>
        <path d="M1250 520 q-14 -10 -20 -24 M1370 520 q14 -10 20 -24" stroke={INK} strokeWidth={3} strokeLinecap="round" opacity={f > 30 && f < 80 ? 1 : 0} />
        <g transform={`translate(1440 430) scale(${tw(f, 34, 46, 0.6, 1)})`} opacity={tw(f, 34, 42)}>
          <path d="M-10 0 h250 a20 20 0 0 1 20 20 v70 a20 20 0 0 1 -20 20 h-200 l-40 26 l8 -26 h-18 a20 20 0 0 1 -20 -20 v-70 a20 20 0 0 1 20 -20 z" fill="#fff" stroke={INK} strokeWidth={4} strokeLinejoin="round" />
          <text x={120} y={78} textAnchor="middle" fontFamily={HAND} fontWeight={700} fontSize={72} fill={RED}>+$120</text>
        </g>
      </g>
      <Big x={1010} y={250} t={tw(f, 2, 16)}>Still drips.</Big>
      <Big x={1010} y={370} t={tw(f, 42, 56)} size={96} color={RED}>Surprise bill?!</Big>
      <Under x={1010} y={392} w={470} t={tw(f, 56, 74)} />
    </svg>
  );
};
// 3 (6-11 s): the agent negotiates, PayPal holds the money, the proof is checked: a list on the left that builds,
// one picture on the right per step
const Scene3: React.FC<{ f: number }> = ({ f }) => {
  const a = tw(f, 0, 14), b = tw(f, 50, 64), c = tw(f, 100, 114);
  const which = f < 50 ? 0 : f < 100 ? 1 : 2, pin = (k: number) => (which === k ? 1 : 0.45);
  const neg = tw(f, 18, 36), lock = tw(f, 66, 84), door = tw(f, 82, 92), fixed = tw(f, 108, 120);
  const talk = Math.abs(Math.sin(f / 2.4));
  return (
    <svg width={1920} height={1080} style={{ position: 'absolute' }}>
      <text x={150} y={190} fontFamily={HAND} fontWeight={700} fontSize={96} fill={INK} opacity={tw(f, 0, 10)}>With <tspan fill={BLUE}>VeriPay</tspan>:</text>
      {[['Your agent negotiates', a, 0], ['PayPal holds the money', b, 1], ['The proof gets checked', c, 2]].map(([txt, t, k]) => (
        <g key={k as number} opacity={(t as number) * pin(k as number)} transform={`translate(${(1 - (t as number)) * -30} 0)`}>
          <circle cx={190} cy={330 + (k as number) * 150} r={34} fill={k === which ? YEL : '#fff'} stroke={INK} strokeWidth={4} />
          <text x={190} y={346 + (k as number) * 150} textAnchor="middle" fontFamily={HAND} fontWeight={700} fontSize={46} fill={INK}>{(k as number) + 1}</text>
          <text x={250} y={350 + (k as number) * 150} fontFamily={HAND} fontWeight={700} fontSize={70} fill={INK}>{txt as string}</text>
          {(k as number) < which && <Check x={830} y={340 + (k as number) * 150} t={1} />}
        </g>
      ))}
      {/* step 1: Maria talks to her phone; two agents trade prices, $220 crossed to $205 */}
      {which === 0 && <g opacity={tw(f, 4, 14) * (1 - tw(f, 44, 50))}>
        <Stick x={1130} y={720} pose={{ ...STAND, ua2: 100, fa2: -148, lean: 4 }} face="talk" mouthOpen={talk} hair handR={<Phone x={6} y={-6} r={12} s={0.36} />} />
        <g transform="translate(1330 380)">
          <rect x={0} y={0} width={300} height={90} rx={22} fill="#fff" stroke={INK} strokeWidth={4} />
          <text x={150} y={60} textAnchor="middle" fontFamily={HAND} fontWeight={700} fontSize={44} fill={INK}>Pro's agent: <tspan fill={RED} textDecoration="line-through">$220</tspan></text>
          <rect x={60} y={130} width={330} height={90} rx={22} fill="#fff" stroke={INK} strokeWidth={4} opacity={neg} />
          <text x={225} y={190} textAnchor="middle" fontFamily={HAND} fontWeight={700} fontSize={44} fill={INK} opacity={neg}>Your agent: <tspan fill={GRN}>$205?</tspan></text>
          <path d="M330 60 q60 40 20 100" fill="none" stroke={INK} strokeWidth={3} strokeLinecap="round" strokeDasharray="10 9" opacity={neg} />
          <text x={150} y={300} textAnchor="middle" fontFamily={HAND} fontWeight={700} fontSize={60} fill={GRN} opacity={tw(f, 34, 44)}>Deal: $205 ✓</text>
        </g>
      </g>}
      {/* step 2: the money goes into a held vault and the lock snaps shut */}
      {which === 1 && <g opacity={tw(f, 50, 58) * (1 - tw(f, 94, 100))}>
        <g transform="translate(1320 360)">
          <rect x={0} y={0} width={340} height={300} rx={18} fill="#eef2f7" stroke={INK} strokeWidth={5} />
          <rect x={30} y={30} width={280} height={240} rx={10} fill="#fff" stroke={INK} strokeWidth={3} />
          <text x={170} y={-22} textAnchor="middle" fontFamily={HAND} fontWeight={700} fontSize={48} fill={BLUE}>PayPal hold</text>
          <g transform={`translate(${lerp(-330, 120, lock)} ${lerp(80, 120, lock)}) scale(1.4)`} opacity={1 - door}><Cash w={70} /></g>
          <g transform={`translate(170 150) scale(${door < 1 ? 1 : 1})`}>
            <rect x={-140} y={-120} width={280} height={240} rx={10} fill="#dfe6ef" stroke={INK} strokeWidth={3} opacity={door} />
            <circle cx={0} cy={0} r={46} fill="#fff" stroke={INK} strokeWidth={4} opacity={door} />
            <path d="M0 -46 L0 46 M-46 0 L46 0" stroke={INK} strokeWidth={3} opacity={door} transform={`rotate(${door * 90})`} />
          </g>
          <g transform={`translate(300 300) scale(${tw(f, 88, 96, 0.4, 1)})`} opacity={tw(f, 88, 94)}>
            <rect x={-30} y={-10} width={60} height={46} rx={8} fill={YEL} stroke={INK} strokeWidth={4} />
            <path d="M-18 -10 v-16 a18 18 0 0 1 36 0 v16" fill="none" stroke={INK} strokeWidth={5} />
          </g>
        </g>
        <text x={1490} y={760} textAnchor="middle" fontFamily={HAND} fontWeight={600} fontSize={48} fill={INK2}>held, not charged</text>
      </g>}
      {/* step 3: the faucet is fixed; its photo gets three checks */}
      {which === 2 && <g opacity={tw(f, 100, 108)}>
        <g transform="translate(1180 320) rotate(-3)">
          <rect x={0} y={0} width={300} height={240} rx={10} fill="#fff" stroke={INK} strokeWidth={4} />
          <defs><clipPath id="ph"><rect x={6} y={6} width={288} height={228} rx={6} /></clipPath></defs><g clipPath="url(#ph)"><g transform="translate(-92.5 -225) scale(0.5)"><Sink f={f} drip={1 - fixed} /></g></g>
          <circle cx={262} cy={36} r={18} fill={GRN} opacity={fixed} />
        </g>
        {['Faucet: no drip', 'Taken at the job', 'Receipt matches'].map((t, k) => (
          <g key={t} opacity={tw(f, 112 + k * 8, 118 + k * 8)}>
            <Check x={1530} y={400 + k * 70} t={tw(f, 112 + k * 8, 122 + k * 8)} />
            <text x={1590} y={412 + k * 70} fontFamily={HAND} fontWeight={700} fontSize={42} fill={INK}>{t}</text>
          </g>
        ))}
      </g>}
    </svg>
  );
};
// 4 (11-15 s): she taps Confirm, the hold opens and the pro is paid; then the title card
const Scene4: React.FC<{ f: number }> = ({ f }) => {
  const tap = tw(f, 10, 18), pressed = f > 18 && f < 28, fly = tw(f, 26, 52), end = tw(f, 66, 78);
  const maria = mix({ ...STAND, ua2: 60, fa2: 100 }, { ...STAND, ua2: 70, fa2: 120, lean: 5 }, tap);
  const pro = mix(STAND, { ...STAND, ua1: -112, fa1: -162 }, tw(f, 46, 56));
  return (
    <svg width={1920} height={1080} style={{ position: 'absolute' }}>
      <g opacity={1 - end}>
        <path d="M140 862 L1800 862" stroke={INK} strokeWidth={2.5} strokeLinecap="round" opacity={0.5} />
        <Stick x={520} y={720} pose={maria} face={f < 30 ? 'happy' : 'grin'} hair />
        <g transform={`translate(770 598) scale(${pressed ? 0.96 : 1})`}>
          <rect x={-150} y={-46} width={300} height={92} rx={46} fill={BLUE} stroke={INK} strokeWidth={4} />
          <text x={0} y={18} textAnchor="middle" fontFamily={HAND} fontWeight={700} fontSize={56} fill="#fff">Confirm ✓</text>
        </g>
        {pressed && <circle cx={640} cy={598} r={20 + (f - 18) * 6} fill="none" stroke={YEL} strokeWidth={5} opacity={1 - (f - 18) / 10} />}
        <g transform="translate(1080 380)">
          <rect x={0} y={0} width={220} height={200} rx={14} fill="#eef2f7" stroke={INK} strokeWidth={4} />
          <rect x={20} y={20} width={180} height={160} rx={8} fill="#fff" stroke={INK} strokeWidth={3} />
          <rect x={20} y={20} width={180} height={160} rx={8} fill="#dfe6ef" stroke={INK} strokeWidth={3} transform={`skewY(${-tw(f, 22, 32) * 30}) scale(${1 - tw(f, 22, 32) * 0.7} 1)`} />
          <text x={110} y={-16} textAnchor="middle" fontFamily={HAND} fontWeight={700} fontSize={38} fill={BLUE}>PayPal hold</text>
        </g>
        {[0, 1, 2].map((k) => <g key={k} transform={`translate(${lerp(1190, 1520, fly) + k * 18} ${lerp(480, 520, fly) - Math.sin(fly * Math.PI) * (140 + k * 30)}) scale(${0.8})`} opacity={fly > 0 && fly < 1 ? 1 : fly >= 1 ? 0 : 0}><Cash w={60} /></g>)}
        <Stick x={1600} y={720} pose={pro} face={fly > 0.8 ? 'grin' : 'happy'} dir={-1} cap handL={fly >= 1 ? <g><Cash w={60} /></g> : null} />
        {fly >= 1 && <text x={1650} y={420} fontFamily={HAND} fontWeight={700} fontSize={64} fill={GRN} opacity={tw(f, 52, 60)}>Paid!</text>}
        <Big x={960} y={210} t={tw(f, 2, 14)} anchor="middle">You just tap Confirm.</Big>
      </g>
      <g opacity={end}>
        <g transform="translate(960 470)">
          <rect x={-318} y={-62} width={84} height={84} rx={10} fill="none" stroke={BLUE} strokeWidth={9} />
          <path d="M-300 -24 l20 22 l38 -48" fill="none" stroke={BLUE} strokeWidth={10} strokeLinecap="round" strokeLinejoin="round" pathLength={1} strokeDasharray={1} strokeDashoffset={1 - tw(f, 72, 86)} />
          <text x={-210} y={14} fontFamily="'Plus Jakarta Sans', 'Segoe UI', sans-serif" fontWeight={800} fontSize={120} fill="#0b2a5b">VeriPay</text>
        </g>
        <text x={960} y={640} textAnchor="middle" fontFamily={HAND} fontWeight={700} fontSize={84} fill={INK}>The money waits for the proof.</text>
        <Under x={760} y={668} w={400} t={tw(f, 84, 104)} c={YEL} />
      </g>
    </svg>
  );
};

// ---- the film --------------------------------------------------------------------------------------------------------
const CUTS = [0, 90, 180, 330, 450];
const CAPS = [
  'Pay the plumber first…',
  '…and it still drips. Plus a surprise bill.',
  'Your agent negotiates, PayPal holds the money, and the proof gets checked.',
  "The pro gets paid when it's done.",
];
export const Pain15: React.FC = () => {
  const f = useCurrentFrame();
  const i = CUTS.findIndex((c, k) => f >= c && f < CUTS[k + 1]), lf = f - CUTS[i];
  const S = [Scene1, Scene2, Scene3, Scene4][i];
  const capT = tw(lf, 4, 14) * (1 - tw(lf, CUTS[i + 1] - CUTS[i] - 6, CUTS[i + 1] - CUTS[i]));
  return (
    <AbsoluteFill style={{ background: PAPER }}>
      <Font />
      <link rel="stylesheet" href={staticFile('fonts/fonts.css')} />
      <Paper />
      <S f={lf} />
      {!(i === 3 && lf > 66) && <Caption text={CAPS[i]} t={capT} />}
    </AbsoluteFill>
  );
};
