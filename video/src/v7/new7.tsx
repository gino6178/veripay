// Film v7's new shots (docs/VIDEO-分鏡-v7.md): the pain animation with its two data cards, and one shot per judging
// criterion the film did not answer on its own: impact (2a), what is new (8a), 219 PayPal features (11a), a complete
// product (12a). Same tokens as the rest of the film (theme.ts); every number is from docs/IMPACT.md or the PayPal docs.
import React from 'react';
import { AbsoluteFill, Img, OffthreadVideo, interpolate, staticFile, useCurrentFrame, Easing } from 'remotion';
import { C, F, SHADOW_LG } from '../theme';
import { Odo } from '../parts';
import { cl, snappy, rise } from '../v3/parts3';
import { S7, FPS, VOICE_SPANS } from './timeline7';

const sec = (s: number) => Math.round(s * FPS);
const fadeIO = (f: number, a: number, b: number) => interpolate(f, [a, a + 8, b - 8, b], [0, 1, 1, 0], cl);
// when the shot's voice reaches fraction t of its length (frames from the shot's start)
const voiceAt = (id: string, t: number) => { const s = S7[id]; return (s.voFrom! - s.from) + Math.round((s.vo!.at(-1)!.end * t) * FPS); };

// ── 1 the pain animation, as made; two sourced data cards, bottom right ─────────────────────────────────────────────
const DataCard: React.FC<{ from: number; to: number; big: string; text: string; source: string }> = ({ from, to, big, text, source }) => {
  const f = useCurrentFrame(), o = fadeIO(f, from, to), y = interpolate(f, [from, from + 12], [24, 0], { ...cl, easing: snappy });
  return (
    <div style={{ position: 'absolute', right: 64, bottom: 150, width: 560, padding: '26px 30px', borderRadius: 18, background: 'rgba(255,255,255,0.94)', boxShadow: SHADOW_LG, opacity: o, transform: `translateY(${y}px)` }}>
      <div style={{ font: `800 76px/1 ${F.display}`, color: C.primary, letterSpacing: '-0.03em' }}>{big}</div>
      <div style={{ font: `600 28px/1.3 ${F.text}`, color: C.ink, marginTop: 10 }}>{text}</div>
      <div style={{ font: `500 18px/1.3 ${F.mono}`, color: C.ink3, marginTop: 12 }}>{source}</div>
    </div>
  );
};
export const V7Pain: React.FC<{ music: boolean }> = ({ music }) => (
  <AbsoluteFill style={{ background: '#000' }}>
    <OffthreadVideo src={staticFile('v7/pain.mp4')} muted={!music} volume={(f) => (VOICE_SPANS.some(([a, b]) => f + S7.pain.from >= a - 6 && f + S7.pain.from <= b + 6) ? 0.2 : 0.55) * interpolate(f, [S7.pain.duration - 20, S7.pain.duration], [1, 0.4], cl)} style={{ width: 1920, height: 1080 }} />
    <DataCard from={sec(5.0)} to={sec(6.7)} big="$1,405" text="median loss to a home-improvement scam" source="BBB Scam Tracker Risk Report 2025" />
    <DataCard from={sec(11.5)} to={sec(13.35)} big="59%" text="of small businesses have invoices 30+ days overdue" source="Intuit QuickBooks, 2026" />
  </AbsoluteFill>
);

// ── 2a impact: four sourced numbers, each lands with the words that say it ───────────────────────────────────────────
const STATS = [
  { v: '$525B', l: 'a year on US home improvement and repair', s: 'Harvard JCHS', t: 0.0 },
  { v: '1.9M', l: 'one-person trade businesses do the work', s: 'NAHB, 2025', t: 0.24 },
  { v: '69.1%', l: 'of people targeted by a repair scam lost money', s: 'BBB Scam Tracker, 2025', t: 0.5 },
  { v: '440M', l: 'PayPal accounts, on both sides of the job', s: 'PayPal Q3 2026', t: 0.78 },
];
export const V7Impact: React.FC = () => {
  const f = useCurrentFrame();
  return (
    <AbsoluteFill style={{ background: C.ground, padding: '110px 120px' }}>
      <div style={{ font: `800 64px/1.1 ${F.display}`, color: C.ink, letterSpacing: '-0.03em', ...rise(f, 2, 24) }}>A real problem, <span style={{ color: C.signal }}>at real scale.</span></div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 28, marginTop: 90 }}>
        {STATS.map((x, i) => {
          const at = voiceAt('impact', x.t);
          return (
            <div key={x.v} style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 20, padding: '40px 34px', minHeight: 420, display: 'flex', flexDirection: 'column', ...rise(f, at, 36), boxShadow: i === 2 ? `0 0 0 3px ${C.signalLine}` : undefined }}>
              <div style={{ height: 112 }}><Odo value={x.v} delay={at + 4} size={96} color={i === 2 ? C.bad : C.primary} /></div>
              <div style={{ font: `600 32px/1.3 ${F.text}`, color: C.ink, marginTop: 26, flex: 1 }}>{x.l}</div>
              <div style={{ font: `500 20px/1.3 ${F.mono}`, color: C.ink3 }}>{x.s}</div>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

// ── 8a what is new: four tiles light in turn, each with the real screen behind it ────────────────────────────────────
const Ico: React.FC<{ d: string }> = ({ d }) => <svg width={44} height={44} viewBox="0 0 24 24" fill="none" stroke={C.signal} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>;
const NOVEL = [
  { t: 'Open agent-to-agent platform', d: 'Any agent joins over A2A or MCP. VeriPay is not the only agent here.', img: 'shot-connect', ico: 'M4 12h6m4 0h6M10 12a2 2 0 1 0 4 0 2 2 0 1 0-4 0M4 7v10M20 7v10', t0: 0.14 },
  { t: 'Agent-only by default', d: 'One sentence and one confirm. The agent does the rest, inside limits only the person sets.', img: 'shot-ask', ico: 'M12 3a4 4 0 0 1 4 4v1a4 4 0 0 1-8 0V7a4 4 0 0 1 4-4zM5 21a7 7 0 0 1 14 0', t0: 0.42 },
  { t: 'A negotiation layer', d: 'Price, time and extras bargained agent to agent, never over the ceiling.', img: 'shot-offers', ico: 'M4 7h12l-3-3M20 17H8l3 3', t0: 0.6 },
  { t: 'AI at every payment step', d: 'Risk sizes the hold, OCR matches the receipt, vision and audit release it. Code moves the money.', img: 'shot-needsfix', ico: 'M5 12l4 4 10-10', t0: 0.76 },
];
export const V7Novel: React.FC = () => {
  const f = useCurrentFrame();
  return (
    <AbsoluteFill style={{ background: C.ground, padding: '90px 110px' }}>
      <div style={{ font: `800 60px/1.1 ${F.display}`, color: C.ink, letterSpacing: '-0.03em', ...rise(f, 2, 24) }}>What we didn't find <span style={{ color: C.signal }}>anywhere else.</span></div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 26, marginTop: 64 }}>
        {NOVEL.map((x) => {
          const at = voiceAt('novel', x.t0), lit = interpolate(f, [at, at + 12], [0, 1], { ...cl, easing: snappy });
          return (
            <div key={x.t} style={{ background: C.panel, borderRadius: 20, overflow: 'hidden', border: `1px solid ${lit > 0.5 ? C.signalLine : C.line}`, boxShadow: lit > 0.5 ? SHADOW_LG : 'none', opacity: 0.35 + 0.65 * lit, transform: `translateY(${(1 - lit) * 18}px)` }}>
              <div style={{ height: 250, overflow: 'hidden', borderBottom: `1px solid ${C.line}` }}>
                <Img src={staticFile(`v7/${x.img}.jpg`)} style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top left', transform: `scale(${1.04 - 0.04 * lit})` }} />
              </div>
              <div style={{ padding: '28px 28px 34px' }}>
                <Ico d={x.ico} />
                <div style={{ font: `800 34px/1.15 ${F.display}`, color: C.ink, marginTop: 14, letterSpacing: '-0.02em' }}>{x.t}</div>
                <div style={{ font: `500 25px/1.35 ${F.text}`, color: C.ink2, marginTop: 12 }}>{x.d}</div>
              </div>
            </div>
          );
        })}
      </div>
      <div style={{ position: 'absolute', left: 110, bottom: 60, font: `500 20px/1.3 ${F.mono}`, color: C.ink3, opacity: interpolate(f, [voiceAt('novel', 0.8), voiceAt('novel', 0.8) + 10], [0, 1], cl) }}>
        Compared with Angi, Thumbtack, TaskRabbit, Upwork and Escrow.com · docs/IMPACT.md
      </div>
    </AbsoluteFill>
  );
};

// ── 11a 219 PayPal features: three numbers count up, the product names light in turn ────────────────────────────────
const PRODUCTS = ['Orders', 'Payments', 'Vault', 'Payouts', 'Invoicing', 'Payment Links', 'Subscriptions', 'Disputes', 'Webhooks', 'Partner Referrals', 'Risk', 'Log in with PayPal', 'JS SDK v6', 'Agent Toolkit', 'PayPal MCP'];
export const V7Features: React.FC = () => {
  const f = useCurrentFrame();
  const n = [{ v: '219', l: 'PayPal features evaluated', c: C.primary, t: 0.08 }, { v: '188', l: 'built in code', c: C.signal, t: 0.28 }, { v: '91', l: 'verified in the real sandbox', c: C.ok, t: 0.42 }];
  const chips0 = voiceAt('features', 0.55), chips1 = voiceAt('features', 0.97);
  return (
    <AbsoluteFill style={{ background: C.ground, padding: '100px 120px' }}>
      <div style={{ display: 'flex', gap: 34 }}>
        {n.map((x) => {
          const at = voiceAt('features', x.t);
          return (
            <div key={x.v} style={{ flex: 1, background: C.panel, border: `1px solid ${C.line}`, borderRadius: 22, padding: '38px 40px', ...rise(f, at, 30) }}>
              <div style={{ height: 150 }}><Odo value={x.v} delay={at + 3} size={140} color={x.c} /></div>
              <div style={{ font: `600 34px/1.25 ${F.text}`, color: C.ink, marginTop: 14 }}>{x.l}</div>
            </div>
          );
        })}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, marginTop: 70 }}>
        {PRODUCTS.map((p, i) => {
          const at = chips0 + Math.round(((chips1 - chips0) * i) / PRODUCTS.length), on = interpolate(f, [at, at + 8], [0, 1], cl);
          return <span key={p} style={{ font: `600 30px/1 ${F.text}`, padding: '16px 24px', borderRadius: 999, background: on > 0.5 ? C.signalSoft : C.panel, color: on > 0.5 ? C.signalHi : C.ink3, border: `1px solid ${on > 0.5 ? C.signalLine : C.line}`, opacity: 0.4 + 0.6 * on }}>{p}</span>;
        })}
      </div>
      <div style={{ position: 'absolute', left: 120, bottom: 56, font: `500 20px/1.3 ${F.mono}`, color: C.ink3, ...rise(f, chips0, 10) }}>Item-by-item status: docs/PAYPAL-整合總表.md · docs/PAYPAL-候選清單.md</div>
    </AbsoluteFill>
  );
};

// ── 12a a complete product: one real page per role, a hard cut each ─────────────────────────────────────────────────
const PAGES = [
  { img: 'customer', role: 'Customer · the agent, with the job beside it' },
  { img: 'pro', role: 'Pro · on a phone, in Spanish', phone: true },
  { img: 'landlord', role: 'Landlord · tenants and limits' },
  { img: 'dispute', role: 'Dispute · settled on the evidence' },
  { img: 'office', role: 'Back office · every hold and payout' },
  { img: 'demo', role: 'Judges · every step, one click away' },
];
export const PRODUCT_CUTS = PAGES.map((_, i) => i);
export const V7Product: React.FC = () => {
  const f = useCurrentFrame(), d = S7.product.duration, each = d / PAGES.length;
  const i = Math.min(PAGES.length - 1, Math.floor(f / each)), p = PAGES[i], lf = f - i * each;
  const push = interpolate(lf, [0, each], [1.0, 1.035], { ...cl, easing: Easing.out(Easing.quad) });
  return (
    <AbsoluteFill style={{ background: p.phone ? C.primary : C.ground }}>
      {p.phone
        ? <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center' }}><div style={{ width: 430, height: 930, borderRadius: 48, padding: 14, background: '#0B1533', boxShadow: SHADOW_LG, transform: `scale(${push})` }}><Img src={staticFile('v7/pro.jpg')} style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top', borderRadius: 36 }} /></div></AbsoluteFill>
        : <Img src={staticFile(`v7/${p.img}.jpg`)} style={{ width: 1920, height: 1080, objectFit: 'cover', objectPosition: 'top', transform: `scale(${push})`, transformOrigin: '50% 30%' }} />}
      <div style={{ position: 'absolute', left: 64, top: 110, padding: '16px 26px', borderRadius: 14, background: C.ink, color: '#fff', font: `700 32px/1 ${F.text}`, boxShadow: SHADOW_LG, ...rise(lf, 2, 14) }}>{p.role}</div>
      <div style={{ position: 'absolute', right: 64, top: 116, font: `700 26px/1 ${F.mono}`, color: p.phone ? '#fff' : C.ink3 }}>{i + 1} / {PAGES.length} · 28 pages</div>
    </AbsoluteFill>
  );
};
