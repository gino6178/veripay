// Film v5's new shots. Find + bargain: real captures of a fresh job on the demo server (capture/v3/p13-market.mjs). The
// chat: the VeriPay bot's own replies, word for word, from driving src/telegram.js (api/scripts/chat-transcript.mjs),
// drawn in a plain phone chat (no messaging app's branding). The vision card: things not built yet, labelled so.
import React from 'react';
import { AbsoluteFill, Img, interpolate, staticFile, useCurrentFrame } from 'remotion';
import { C, F, SHADOW_LG, rgba } from '../theme';
import { rise, cl, TX } from '../v3/parts3';
import { S5, voAt } from './timeline5';
import CHAT from './chat.json';

// a crop of a capture (CSS px of the page; textures are 3× device pixels), in a card that rises at `at`
const Crop: React.FC<{ src: string; w: number; crop: { x: number; y: number; w: number; h: number }; x: number; y: number; bw: number; bh: number; at: number; label?: string; tone?: string }> = ({ src, w, crop, x, y, bw, bh, at, label, tone }) => {
  const f = useCurrentFrame(), k = Math.min(bw / crop.w, bh / crop.h), cw = crop.w * k, ch = crop.h * k;
  return (
    <div style={{ position: 'absolute', left: x, top: y, ...rise(f, at) }}>
      {label && <div style={{ font: `700 28px/1 ${F.text}`, color: tone || C.ink2, marginBottom: 14 }}>{label}</div>}
      <div style={{ position: 'relative', width: cw + 36, height: ch + 36, borderRadius: 16, overflow: 'hidden', background: C.panel, boxShadow: `${SHADOW_LG}, 0 0 0 1px ${rgba(C.ink, 0.06)}` }}>
        <Img src={staticFile(TX + src)} style={{ position: 'absolute', left: 18 - crop.x * k, top: 18 - crop.y * k, width: w * k }} />
      </div>
    </div>
  );
};

// ── S3b find the pros near the job, read what's said about them, bargain, see the market, hear when it stalls ─────────
export const V5Find: React.FC = () => {
  const f = useCurrentFrame(), B = voAt('find', 1) - 6;
  const warn = voAt('find', 1) + Math.round(4.4 * 30);
  return (
    <AbsoluteFill style={{ background: C.ground }}>
      {f < B + 12 && (
        <div style={{ position: 'absolute', inset: 0, opacity: interpolate(f, [B, B + 12], [1, 0], cl) }}>
          <Crop src="n-near.png" w={484} crop={{ x: 0, y: 0, w: 484, h: 462 }} x={150} y={70} bw={600} bh={680} at={0} label="Pros near the job · on VeriPay, and listed nearby" />
          <Crop src="n-reviews.png" w={426} crop={{ x: 0, y: 46, w: 426, h: 372 }} x={960} y={150} bw={780} bh={600} at={40} label="The review agent's read" />
        </div>
      )}
      {f >= B && (
        <>
          <Crop src="n-market.png" w={484} crop={{ x: 0, y: 192, w: 250, h: 272 }} x={240} y={56} bw={700} bh={600} at={B + 2} label="Eastside: $195 → you $166 → $180" />
          <Crop src="n-stuck.png" w={484} crop={{ x: 0, y: 138, w: 335, h: 304 }} x={960} y={56} bw={760} bh={600} at={warn} label="Another pro holds at $255" tone={C.bad} />
        </>
      )}
    </AbsoluteFill>
  );
};

// ── S4b the same agent, in a chat: post, an offer comes in, bargain by replying, hire back on VeriPay ──────────────────
type Msg = { from: 'you' | 'bot' | 'tap'; text: string; buttons?: string[][] };
const clean = (t: string, max = 7) => {
  const lines = t.split('\n').filter((x, i, a) => !(x === '' && a[i - 1] === ''));
  return (lines.length > max ? [...lines.slice(0, max), '…'] : lines).join('\n');
};
const html = (t: string) => ({ __html: t.replace(/\n/g, '<br/>') });
const PHONE_W = 520, PHONE_H = 820;
export const V5Chat: React.FC = () => {
  const f = useCurrentFrame(), d = S5.chat.duration;
  const msgs = (CHAT as Msg[]).filter((m) => m.text);
  const t0 = 14, t1 = d - 50, step = (t1 - t0) / msgs.length;
  const shown = msgs.map((m, i) => ({ m, at: Math.round(t0 + i * step) })).filter((x) => f >= x.at);
  const hire = voAt('chat', 2);
  return (
    <AbsoluteFill style={{ background: C.ground }}>
      <div style={{ position: 'absolute', left: 250, top: 40, width: PHONE_W, height: PHONE_H, borderRadius: 56, background: '#0B1530', padding: 14, boxShadow: SHADOW_LG }}>
        <div style={{ position: 'relative', width: '100%', height: '100%', borderRadius: 44, overflow: 'hidden', background: '#EDF1F6', display: 'flex', flexDirection: 'column' }}>
          <div style={{ height: 92, background: C.panel, borderBottom: `1px solid ${C.line}`, display: 'flex', alignItems: 'center', gap: 14, padding: '26px 22px 0' }}>
            <div style={{ width: 44, height: 44, borderRadius: 22, background: C.primary, display: 'grid', placeItems: 'center' }}>
              <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="#fff" strokeWidth="2.6"><path d="m6.5 12.5 3.5 3.5 7.5-8" /></svg>
            </div>
            <div><div style={{ font: `700 24px/1.1 ${F.text}`, color: C.ink }}>VeriPay</div><div style={{ font: `500 16px/1.2 ${F.text}`, color: C.ink3 }}>bot</div></div>
          </div>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', gap: 10, padding: '12px 14px 18px', overflow: 'hidden' }}>
            {shown.map(({ m, at }, i) => {
              const r = rise(f, at, 24);
              if (m.from === 'tap') return <div key={i} style={{ alignSelf: 'center', font: `600 15px/1 ${F.mono}`, color: C.signalHi, background: C.signalSoft, border: `1px solid ${C.signalLine}`, borderRadius: 999, padding: '7px 14px', ...r }}>tapped · {m.text}</div>;
              const you = m.from === 'you';
              return (
                <div key={i} style={{ alignSelf: you ? 'flex-end' : 'flex-start', maxWidth: '86%', ...r }}>
                  <div style={{ background: you ? C.signal : C.panel, color: you ? '#fff' : C.ink, borderRadius: 18, borderBottomRightRadius: you ? 6 : 18, borderBottomLeftRadius: you ? 18 : 6, padding: '11px 15px', font: `500 18px/1.35 ${F.text}`, boxShadow: '0 1px 2px rgba(0,28,100,0.08)' }} dangerouslySetInnerHTML={html(clean(m.text))} />
                  {(m.buttons || []).slice(0, 2).map((row, k) => (
                    <div key={k} style={{ display: 'flex', gap: 6, marginTop: 6 }}>{row.slice(0, 2).map((b) => <div key={b} style={{ flex: 1, textAlign: 'center', background: rgba(C.primary, 0.08), color: C.primary, borderRadius: 10, padding: '8px 10px', font: `600 15px/1.2 ${F.text}`, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{b}</div>)}</div>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      </div>
      <div style={{ position: 'absolute', left: 900, top: 150, width: 860 }}>
        <div style={{ font: `800 64px/1.05 ${F.display}`, color: C.ink, letterSpacing: '-0.02em', ...rise(f, 10) }}>Works in the chat app you already use</div>
        {[['Post a job in one message', 30], ['Offers arrive as they come in', 70], ['Bargain by replying with a price', 120], ['Hiring holds money: back to VeriPay and the PIN', hire]].map(([t, at], i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: i ? 18 : 44, font: `600 32px/1.25 ${F.text}`, color: i === 3 ? C.primary : C.ink2, ...rise(f, at as number) }}>
            <span style={{ width: 14, height: 14, borderRadius: 7, background: i === 3 ? C.primary : C.signal, flex: 'none' }} />{t}
          </div>
        ))}
        <div style={{ marginTop: 40, font: `500 20px/1.4 ${F.mono}`, color: C.ink3, ...rise(f, 150) }}>the bot's own replies · demo data</div>
      </div>
    </AbsoluteFill>
  );
};

// ── S12b the vision: what comes next ────────────────────────────────────────────────
const NEXT = [
  { t: 'Log in with PayPal', d: 'one sign-in for customers and pros' },
  { t: 'Live payouts to every pro', d: 'out of the sandbox, to real PayPal accounts' },
  { t: 'Any job a photo can prove', d: 'cleaning, painting, moving, yard work' },
];
export const V5Vision: React.FC = () => {
  const f = useCurrentFrame(), b = voAt('vision', 1);
  return (
    <AbsoluteFill style={{ background: C.ground }}>
      <div style={{ position: 'absolute', left: 140, top: 90, display: 'flex', alignItems: 'center', gap: 22, ...rise(f, 4) }}>
        <div style={{ font: `800 76px/1 ${F.display}`, color: C.ink, letterSpacing: '-0.02em' }}>Next, our vision</div>
      </div>
      <div style={{ position: 'absolute', left: 140, right: 140, top: 260, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 30 }}>
        {NEXT.map((x, i) => (
          <div key={x.t} style={{ background: C.panel, border: `2px dashed ${C.agentLine}`, borderRadius: 20, padding: '38px 34px', minHeight: 300, ...rise(f, b + i * 22) }}>
            <div style={{ font: `600 22px/1 ${F.mono}`, color: C.agent }}>{String(i + 1).padStart(2, '0')}</div>
            <div style={{ font: `800 44px/1.1 ${F.display}`, color: C.ink, marginTop: 22, letterSpacing: '-0.015em' }}>{x.t}</div>
            <div style={{ font: `500 26px/1.35 ${F.text}`, color: C.ink3, marginTop: 18 }}>{x.d}</div>
          </div>
        ))}
      </div>
    </AbsoluteFill>
  );
};

// ── the test lab: a wall of computers, each one a real test agent: its own screenshots (the site header cropped off)
// and the actions it took, scrolling in its terminal (docs/live-test/ops, scrubbed). Not a re-enactment: replayed. ──────
import LAB from './lab.json';
type Agent = { dir: string; round: number; who: string; calls: number; pics: string[]; lines: string[] };
const SCR_W = 400, SCR_H = 190;
const Monitor: React.FC<{ a: Agent; i: number; x: number; y: number; at: number }> = ({ a, i, x, y, at }) => {
  const f = useCurrentFrame(), t = Math.max(0, f - at);
  const pic = a.pics[Math.floor((t + i * 13) / 38) % a.pics.length];
  const N = 12, off = Math.floor((t + i * 9) / 5);
  const lines = Array.from({ length: N }, (_, k) => a.lines[(off + k) % a.lines.length]);
  const calls = Math.min(a.calls, Math.round(a.calls * Math.min(1, t / 200)));
  const on = interpolate(f, [at, at + 8], [0, 1], cl);
  const phoneW = Math.round(SCR_H * 375 / 752);
  return (
    <div style={{ position: 'absolute', left: x, top: y, width: SCR_W + 16, opacity: on, transform: `translateY(${(1 - on) * 20}px)` }}>
      <div style={{ background: '#0B1530', borderRadius: 12, padding: 8, boxShadow: '0 14px 30px rgba(0,28,100,.22)' }}>
        <div style={{ position: 'relative', width: SCR_W, height: SCR_H, borderRadius: 4, overflow: 'hidden', background: '#07101F', display: 'flex' }}>
          <div style={{ width: phoneW, height: SCR_H, overflow: 'hidden', position: 'relative', flex: 'none', borderRight: '1px solid #1C2A48' }}>
            <Img src={staticFile(`textures/lab/${a.dir}/${pic}`)} style={{ position: 'absolute', left: 0, top: -Math.round(60 * phoneW / 375), width: phoneW }} />
          </div>
          <div style={{ flex: 1, padding: '7px 9px', font: `500 10.5px/1.42 ${F.mono}`, color: '#9CC3F2', overflow: 'hidden', whiteSpace: 'nowrap' }}>
            {lines.map((l, k) => <div key={k} style={{ overflow: 'hidden', textOverflow: 'ellipsis', color: l.startsWith('$') ? '#7FD6A0' : k === N - 1 ? '#FFFFFF' : '#9CC3F2', opacity: 0.45 + 0.55 * (k / (N - 1)) }}>{l}{k === N - 1 && (Math.floor(f / 8) % 2 ? '▍' : '')}</div>)}
          </div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, font: `600 12px/1 ${F.mono}`, color: '#C9D6EA' }}>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 290 }}>R{a.round} · {a.who}</span>
          <span style={{ color: '#7FD6A0' }}>● {calls} calls</span>
        </div>
      </div>
    </div>
  );
};
export const LabWall: React.FC<{ at?: number }> = ({ at = 0 }) => {
  const f = useCurrentFrame();
  const agents = (LAB as Agent[]).filter((a) => a.lines.length >= 16).slice(0, 12);
  const tilt = interpolate(f, [at, at + 240], [10, 4], cl);
  return (
    <div style={{ position: 'absolute', inset: 0, perspective: 2200 }}>
      <div style={{ position: 'absolute', inset: 0, transform: `rotateX(${tilt}deg)`, transformOrigin: '960px 0px' }}>
        {agents.map((a, i) => <Monitor key={a.dir} a={a} i={i} x={70 + (i % 4) * 455} y={18 + Math.floor(i / 4) * 228} at={at + i * 3} />)}
      </div>
      <div style={{ position: 'absolute', left: 0, right: 0, textAlign: 'center', top: 716, font: `500 20px/1 ${F.mono}`, color: C.ink3, opacity: interpolate(f, [at + 30, at + 45], [0, 1], cl) }}>recorded test runs, Nov 4–6 · before the name VeriPay · replayed, not re-enacted</div>
    </div>
  );
};
