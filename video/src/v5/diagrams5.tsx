// Film v4 graphics in the product's tokens: the PayPal API call rail, the architecture diagram, the model design and
// "Under the hood: PayPal". Every PayPal id and call is from the film's sandbox run on 8840 (DP-1002: the job's ledger
// and hold history in api/data/state-film5, PayPal's GET answers in capture/v3/paypal-answers.json, the reconciliation
// report in state-film5/recon.json); every call shape is from api/src/pay/paypal.js. Every model number is from
// ml/RESULTS.md (held-out synthetic test sets). `t` (0..1) drives the animation so a storyboard can show any moment.
import React from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame, Easing } from 'remotion';
import { C, F, SHADOW, SHADOW_LG, rgba } from '../theme';

const cl = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;
const snappy = Easing.bezier(0.16, 1, 0.3, 1);
const ease = (f: number, a: number, b: number) => interpolate(f, [a, b], [0, 1], { ...cl, easing: snappy });

// ── the PayPal API call rail ───────────────────────────────────────────────────────────────────────────────────────
export type Call = { m: string; path: string; args?: string; out: string; ok?: boolean; tool?: boolean };
export const CALLS: Record<string, Call> = {
  hold: { m: 'POST', path: '/v2/checkout/orders', args: 'intent=AUTHORIZE · card, store_in_vault=ON_SUCCESS', out: 'COMPLETED · auth 4FE05308505220535 · $200.00 held' },
  rehold: { m: 'POST', path: '/v2/checkout/orders', args: 'intent=AUTHORIZE · card.vault_id · payment_initiator=MERCHANT', out: 'COMPLETED · auth 284463934K6757305 · $247.05 held' },
  void: { m: 'POST', path: '/v2/payments/authorizations/4FE05308505220535/void', out: 'VOIDED · the $200.00 hold released' },
  capture: { m: 'POST', path: '/v2/payments/authorizations/284463934K6757305/capture', args: 'amount=232.05 · final_capture=true', out: 'COMPLETED · 3E147340PR028970B · $15.00 never charged', ok: true },
  payout: { m: 'POST', path: '/v1/payments/payouts', args: '1 item · $208.84 to the pro', out: 'batch LEH3LNZTMY7G8 · SUCCESS', ok: true },
  recon: { m: 'TOOL', path: 'Agent Toolkit · list_transactions', args: '+ captures / payouts reads', out: '2 of 2 matched to the ledger', ok: true, tool: true },
};
export const Rail: React.FC<{ calls: (keyof typeof CALLS)[]; at?: number[]; x?: number; y?: number; w?: number }> = ({ calls, at, x = 1236, y = 36, w = 648 }) => {
  const f = useCurrentFrame();
  return (
    <div style={{ position: 'absolute', left: x, top: y, width: w, borderRadius: 16, overflow: 'hidden', background: rgba(C.primary, 0.97), boxShadow: SHADOW_LG, color: '#fff' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 20px', borderBottom: `1px solid ${rgba('#FFFFFF', 0.16)}` }}>
        <span style={{ width: 10, height: 10, borderRadius: 5, background: '#5BD08A', boxShadow: '0 0 0 4px rgba(91,208,138,0.25)' }} />
        <span style={{ font: `700 22px/1 ${F.display}` }}>PayPal API</span>
        <span style={{ marginLeft: 'auto', font: `500 16px/1 ${F.mono}`, opacity: 0.7, letterSpacing: '0.03em' }}>sandbox · this run</span>
      </div>
      {calls.map((k, i) => {
        const c = CALLS[k], t = at ? ease(f, at[i], at[i] + 12) : 1;
        if (t <= 0) return null;
        const last = i === calls.length - 1;
        return (
          <div key={k} style={{ opacity: t, transform: `translateY(${(1 - t) * 14}px)`, padding: '12px 20px 13px', borderTop: i ? `1px solid ${rgba('#FFFFFF', 0.1)}` : undefined, background: last ? rgba('#FFFFFF', 0.07) : undefined }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'baseline', font: `600 17px/1.3 ${F.mono}` }}>
              <span style={{ flex: 'none', padding: '3px 7px', borderRadius: 4, background: c.tool ? rgba('#C6B5F0', 0.3) : rgba('#9CC3F2', 0.28), fontSize: 14 }}>{c.m}</span>
              <span style={{ overflowWrap: 'anywhere' }}>{c.path}</span>
            </div>
            {c.args && <div style={{ font: `400 15px/1.35 ${F.mono}`, opacity: 0.72, marginTop: 4, paddingLeft: 2 }}>{c.args}</div>}
            <div style={{ font: `600 16px/1.35 ${F.mono}`, marginTop: 5, color: c.ok ? '#8BE0AC' : '#BFDBFF' }}>→ {c.out}</div>
          </div>
        );
      })}
    </div>
  );
};

// ── shared bits ────────────────────────────────────────────────────────────────────────────────────────────────────
const Title: React.FC<{ kicker: string; text: string; o?: number }> = ({ kicker, text, o = 1 }) => (
  <div style={{ position: 'absolute', left: 96, top: 64, opacity: o }}>
    <div style={{ font: `600 20px/1 ${F.mono}`, color: C.signalHi, letterSpacing: '0.08em', textTransform: 'uppercase' }}>{kicker}</div>
    <div style={{ font: `800 56px/1.05 ${F.display}`, color: C.ink, letterSpacing: '-0.03em', marginTop: 14 }}>{text}</div>
  </div>
);
const Box: React.FC<{ x: number; y: number; w: number; h?: number; head: string; sub?: string; tone?: 'ink' | 'pp' | 'model' | 'plain'; o?: number; glow?: number; children?: React.ReactNode }> = ({ x, y, w, h, head, sub, tone = 'plain', o = 1, glow = 0, children }) => {
  const edge = tone === 'pp' ? C.signal : tone === 'model' ? C.agent : tone === 'ink' ? C.primary : C.line;
  const bg = tone === 'ink' ? C.primary : C.panel;
  return (
    <div style={{ position: 'absolute', left: x, top: y, width: w, height: h, boxSizing: 'border-box', borderRadius: 18, background: bg, border: `2px solid ${edge}`, boxShadow: `${SHADOW_LG}${glow ? `, 0 0 0 ${8 * glow}px ${rgba(C.signal, 0.18)}` : ''}`, padding: '20px 24px', opacity: o, transform: `translateY(${(1 - o) * 18}px)`, color: tone === 'ink' ? '#fff' : C.ink }}>
      <div style={{ font: `800 28px/1.1 ${F.display}`, letterSpacing: '-0.02em' }}>{head}</div>
      {sub && <div style={{ font: `500 18px/1.3 ${F.mono}`, marginTop: 8, color: tone === 'ink' ? rgba('#FFFFFF', 0.75) : C.ink3 }}>{sub}</div>}
      {children}
    </div>
  );
};
const Item: React.FC<{ t: string; s?: string; dark?: boolean; dot?: string }> = ({ t, s, dark, dot }) => (
  <div style={{ display: 'flex', gap: 12, alignItems: 'baseline', padding: '9px 0', borderTop: `1px solid ${dark ? rgba('#FFFFFF', 0.14) : C.inset}` }}>
    <span style={{ width: 9, height: 9, borderRadius: 3, background: dot || (dark ? '#9CC3F2' : C.signal), flex: 'none', transform: 'translateY(-2px)' }} />
    <span style={{ font: `600 22px/1.25 ${F.text}` }}>{t}</span>
    {s && <span style={{ marginLeft: 'auto', font: `500 16px/1.25 ${F.mono}`, opacity: 0.7, textAlign: 'right' }}>{s}</span>}
  </div>
);
const Chip: React.FC<{ t: string; tone?: 'pp' | 'model' | 'ok' | 'plain' }> = ({ t, tone = 'plain' }) => {
  const col = tone === 'pp' ? C.signalHi : tone === 'model' ? C.agent : tone === 'ok' ? C.ok : C.ink2;
  const bg = tone === 'pp' ? C.signalSoft : tone === 'model' ? C.agentSoft : tone === 'ok' ? C.okSoft : C.inset;
  return <span style={{ display: 'inline-block', padding: '8px 13px', borderRadius: 8, background: bg, color: col, font: `600 18px/1 ${F.mono}`, letterSpacing: '0.02em' }}>{t}</span>;
};

// ── architecture ──────────────────────────────────────────────────────────────────────────────────────────────────
// Columns: people & their agents → the VeriPay API → our models (GCP VM) and PayPal. The money path (a hold, the
// checks, the capture and the payout) runs through the API's one capture guard; `t` draws it in.
export const Arch: React.FC<{ t?: number }> = ({ t = 1 }) => {
  const o = (a: number) => interpolate(t, [a, a + 0.12], [0, 1], cl);
  const path = interpolate(t, [0.55, 0.95], [0, 1], cl);
  return (
    <AbsoluteFill style={{ background: C.ground }}>
      <Title kicker="Architecture" text="Agents in. Code guards the money. PayPal moves it." />
      <Box x={96} y={250} w={430} h={600} head="People & their agents" sub="the same actions, any client" o={o(0)}>
        <div style={{ marginTop: 14 }}>
          <Item t="Customer + her agent" s="website" />
          <Item t="Pro + his agent" s="phone" />
          <Item t="Any agent" s="MCP · A2A · REST" />
          <Item t="Finds us by" s="llms.txt · agent card" />
        </div>
        <div style={{ marginTop: 18, padding: '14px 16px', borderRadius: 12, background: C.agentSoft, color: C.agent, font: `600 19px/1.35 ${F.text}` }}>Limits per agent: per job, per month, change orders. Over a limit, only the person's PIN.</div>
      </Box>
      <Box x={640} y={250} w={560} h={600} head="VeriPay API" sub="Node · one ledger" tone="ink" o={o(0.12)} glow={path > 0 && path < 1 ? 1 : 0}>
        <div style={{ marginTop: 14 }}>
          <Item dark t="One capture guard" s="every money path" dot="#FFD140" />
          <Item dark t="PIN step-up" s="over the agent's limit" />
          <Item dark t="Signed-mandate verifier" s="cap · expiry · replay" />
          <Item dark t="Signed receipts + ledger" s="to the cent" />
          <Item dark t="Done-Risk" s="LightGBM, in process" />
          <Item dark t="Time-travel clock" s="judges skip the waiting" />
        </div>
      </Box>
      <Box x={1314} y={250} w={510} h={290} head="Our models" sub="GCP VM · NVIDIA L4 GPU · llama.cpp, GGUF" tone="model" o={o(0.26)}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 18 }}>
          <Chip t="done-chat" tone="model" /><Chip t="done-audit" tone="model" /><Chip t="done-vlm" tone="model" /><Chip t="Done-OCR" tone="model" />
        </div>
        <div style={{ marginTop: 16, font: `500 19px/1.35 ${F.text}`, color: C.ink2 }}>scope · negotiation · verdicts · photo descriptions · receipts</div>
      </Box>
      <Box x={1314} y={570} w={510} h={280} head="PayPal" sub="sandbox REST + JS SDK v6" tone="pp" o={o(0.4)}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 9, marginTop: 16 }}>
          {['Orders v2', 'Authorizations', 'Vault', 'Payouts', 'Refunds', 'Disputes', 'Invoicing', 'Pay Later', 'Agent Toolkit'].map((x) => <Chip key={x} t={x} tone="pp" />)}
        </div>
      </Box>
      {/* connectors + the money path */}
      <svg width={1920} height={1080} style={{ position: 'absolute', inset: 0, overflow: 'visible' }}>
        <defs><marker id="ah" markerWidth="10" markerHeight="10" refX="8" refY="5" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill={C.lineStrong} /></marker></defs>
        <g stroke={C.lineStrong} strokeWidth={3} fill="none" markerEnd="url(#ah)" opacity={o(0.12)}>
          <path d="M526 470 H630" /><path d="M1200 395 H1304" /><path d="M1200 650 H1304" />
        </g>
        {path > 0 && (() => {
          // the money path: agent → API guard → PayPal (hold, capture, payout)
          const d = 'M420 690 C 560 690, 580 770, 700 770 L 1080 770 C 1200 770, 1210 720, 1314 720';
          return (
            <g>
              <path d={d} stroke={C.ok} strokeWidth={7} fill="none" strokeLinecap="round" pathLength={1} strokeDasharray={`${path} 1`} />
              <path d={d} stroke={C.ok} strokeWidth={2} fill="none" pathLength={1} strokeDasharray={`${path} 1`} opacity={0.6} />
            </g>
          );
        })()}
      </svg>
      <div style={{ position: 'absolute', left: 96, top: 196, font: `500 18px/1 ${F.mono}`, color: C.ink3, opacity: o(0.5) }}>green: the money path · hold → checks → capture → payout, each through the one capture guard</div>
    </AbsoluteFill>
  );
};

// ── model design ──────────────────────────────────────────────────────────────────────────────────────────────────
const Step: React.FC<{ x: number; w: number; head: string; sub: string; tone?: 'model' | 'plain' | 'code'; o: number }> = ({ x, w, head, sub, tone = 'plain', o }) => (
  <div style={{ position: 'absolute', left: x, top: 222, width: w, height: 150, boxSizing: 'border-box', borderRadius: 16, padding: '18px 20px', background: tone === 'code' ? C.primary : C.panel, color: tone === 'code' ? '#fff' : C.ink, border: `2px solid ${tone === 'model' ? C.agent : tone === 'code' ? C.primary : C.line}`, boxShadow: SHADOW, opacity: o, transform: `translateY(${(1 - o) * 16}px)` }}>
    <div style={{ font: `800 25px/1.12 ${F.display}`, letterSpacing: '-0.02em' }}>{head}</div>
    <div style={{ font: `500 17px/1.35 ${F.mono}`, marginTop: 10, opacity: 0.78 }}>{sub}</div>
  </div>
);
const Big: React.FC<{ x: number; n: string; label: string; vs?: string; o: number }> = ({ x, n, label, vs, o }) => (
  <div style={{ position: 'absolute', left: x, top: 430, width: 400, opacity: o, transform: `translateY(${(1 - o) * 20}px)` }}>
    <div style={{ font: `800 104px/1 ${F.display}`, letterSpacing: '-0.045em', color: C.signal }}>{n}</div>
    <div style={{ font: `700 26px/1.25 ${F.text}`, color: C.ink, marginTop: 12 }}>{label}</div>
    {vs && <div style={{ font: `500 18px/1.35 ${F.mono}`, color: C.ink3, marginTop: 8 }}>{vs}</div>}
  </div>
);
export const Models: React.FC<{ t?: number }> = ({ t = 1 }) => {
  const o = (a: number) => interpolate(t, [a, a + 0.1], [0, 1], cl);
  const arrow = (x: number, a: number) => <div style={{ position: 'absolute', left: x, top: 280, font: `700 34px/1 ${F.display}`, color: C.lineStrong, opacity: o(a) }}>→</div>;
  return (
    <AbsoluteFill style={{ background: C.ground }}>
      <Title kicker="Our models" text="Small models, fine-tuned to follow code's rules" />
      <Step x={96} w={330} head="Muse Glimmer 30B" sub="open teacher · writes the wording only" o={o(0)} />
      <div style={{ position: 'absolute', left: 96, top: 380, width: 330, font: `700 20px/1.3 ${F.mono}`, color: C.primary, opacity: o(0.08) }}>+ labels from CODE</div>
      {arrow(440, 0.1)}
      <Step x={490} w={360} head="Qwen3-0.6B + LoRA r16" sub="fine-tuned on an A100 · 13 min (audit)" tone="model" o={o(0.12)} />
      {arrow(864, 0.2)}
      <Step x={914} w={300} head="GGUF Q8 · 639 MB" sub="answers in short codes; code writes the sentence" o={o(0.22)} />
      {arrow(1228, 0.3)}
      <Step x={1278} w={546} head="done-chat · done-audit" sub="served on one L4 GPU · llama.cpp on our GCP VM · done-chat scope 88.4% (v1 56.9%)" tone="code" o={o(0.32)} />
      <Big x={96} n="99.9%" label="done-audit verdicts right" vs="its 30B teacher: 68.3%" o={o(0.45)} />
      <Big x={540} n="0.4%" label="attacks that turned a failing check into a pass" vs="1 of 262 · ~0.3 s per audit on the L4 GPU" o={o(0.55)} />
      <Big x={984} n="100%" label="negotiation moves within limits" vs="done-chat · incl. unseen injection attacks" o={o(0.65)} />
      <Big x={1428} n="0.51%" label="Done-OCR character error" vs="receipt amount field 99.8%" o={o(0.75)} />
      {/* the other models: not from the Glimmer → Qwen3 pipeline */}
      <div style={{ position: 'absolute', left: 96, top: 672, font: `600 17px/1 ${F.mono}`, color: C.ink3, letterSpacing: '0.06em', opacity: o(0.8) }}>AND THREE MORE, BUILT ANOTHER WAY</div>
      {[
        ['Done-OCR', 'SVTR-tiny + DBNet, trained on 5,000 generated receipts & invoices'],
        ['done-vlm', 'SmolVLM2-500M, off the shelf, describe-only'],
        ['Done-Risk', 'LightGBM on 200k synthetic jobs · AUC 0.78, calibrated'],
      ].map(([h, t], i) => (
        <div key={h} style={{ position: 'absolute', left: 96 + i * 584, top: 698, width: 560, boxSizing: 'border-box', padding: '14px 18px', borderRadius: 12, background: C.panel, border: `1px solid ${C.line}`, boxShadow: SHADOW, opacity: o(0.82 + i * 0.02) }}>
          <span style={{ font: `800 22px/1.2 ${F.display}`, color: C.agent }}>{h}</span>
          <span style={{ font: `500 17px/1.3 ${F.mono}`, color: C.ink2, marginLeft: 12 }}>{t}</span>
        </div>
      ))}
      <div style={{ position: 'absolute', left: 96, top: 776, font: `500 18px/1 ${F.mono}`, color: C.ink3, opacity: o(0.85) }}>held-out test sets (synthetic) · ml/RESULTS.md</div>
      <div style={{ position: 'absolute', left: 96, top: 806, font: `800 40px/1.1 ${F.display}`, letterSpacing: '-0.02em', color: C.ink, opacity: o(0.9) }}>Models give verdicts. <span style={{ color: C.signal }}>Code decides the money.</span></div>
    </AbsoluteFill>
  );
};

// ── under the hood: PayPal ────────────────────────────────────────────────────────────────────────────────────────
const NODES = [
  { k: 'Orders v2', what: 'AUTHORIZE: hold, not charge', id: 'order 77H43311C88250412', v: '$200.00' },
  { k: 'Vault', what: 'the saved card re-holds, merchant-initiated', id: 'auth 284463934K6757305', v: '$247.05' },
  { k: 'Authorizations', what: 'void the first hold', id: '4FE05308505220535', v: 'VOIDED' },
  { k: 'Capture', what: 'partial, final: exactly what\'s due', id: '3E147340PR028970B', v: '$232.05' },
  { k: 'Payouts', what: 'one batch to the pro', id: 'LEH3LNZTMY7G8', v: '$208.84 · SUCCESS' },
  { k: 'Agent Toolkit', what: 'an agent reconciles the ledger', id: 'list_transactions', v: '2 of 2 matched' },
];
export const Hood: React.FC<{ t?: number; hi?: number }> = ({ t = 1, hi = 0 }) => {
  const W = 268, G = 24, X0 = 96;
  return (
    <AbsoluteFill style={{ background: C.ground }}>
      <Title kicker="Under the hood" text="It's all PayPal" />
      {NODES.map((n, i) => {
        const o = interpolate(t, [0.05 + i * 0.12, 0.17 + i * 0.12], [0, 1], cl);
        const x = X0 + i * (W + G);
        return (
          <React.Fragment key={n.k}>
            <div style={{ position: 'absolute', left: x, top: 230, width: W, height: 370, boxSizing: 'border-box', borderRadius: 18, background: C.panel, border: `2px solid ${C.signal}`, boxShadow: SHADOW_LG, padding: '22px 20px', opacity: o, transform: `translateY(${(1 - o) * 20}px)` }}>
              <div style={{ font: `600 16px/1 ${F.mono}`, color: C.signalHi, letterSpacing: '0.06em' }}>{String(i + 1).padStart(2, '0')}</div>
              <div style={{ font: `800 32px/1.08 ${F.display}`, letterSpacing: '-0.02em', color: C.ink, marginTop: 14 }}>{n.k}</div>
              <div style={{ font: `500 21px/1.3 ${F.text}`, color: C.ink2, marginTop: 12, minHeight: 82 }}>{n.what}</div>
              <div style={{ position: 'absolute', left: 20, right: 20, bottom: 22 }}>
                <div style={{ font: `500 16px/1.3 ${F.mono}`, color: C.ink3, overflowWrap: 'anywhere' }}>{n.id}</div>
                <div style={{ font: `700 24px/1.2 ${F.mono}`, color: /SUCCESS|matched|232/.test(n.v) ? C.ok : C.ink, marginTop: 8 }}>{n.v}</div>
              </div>
            </div>
            {i < NODES.length - 1 && <div style={{ position: 'absolute', left: x + W + 1, top: 400, font: `700 24px/1 ${F.display}`, color: C.signal, opacity: o }}>›</div>}
          </React.Fragment>
        );
      })}
      {/* also wired in: in the code, not in this run. In the last seconds (hi 0..1) the row grows and lights up. */}
      <div style={{ position: 'absolute', left: 96, top: 640, transformOrigin: '0 50%', transform: `scale(${1 + 0.32 * hi})`, opacity: interpolate(t, [0.8, 0.9], [0, 1], cl),
        padding: `${14 * hi}px ${18 * hi}px`, borderRadius: 14, border: `${2.5 * hi}px solid ${rgba(C.signal, hi)}`, background: rgba(C.panel, hi), boxShadow: hi > 0 ? `0 0 0 ${6 * hi}px ${rgba(C.signal, 0.14 * hi)}, ${SHADOW_LG}` : 'none' }}>
        <div style={{ font: `600 18px/1 ${F.mono}`, color: hi > 0.5 ? C.signalHi : C.ink3, letterSpacing: '0.06em' }}>{hi > 0.5 ? '+5 MORE PAYPAL MODULES IMPLEMENTED' : 'ALSO WIRED IN'}</div>
        <div style={{ display: 'flex', gap: 12, marginTop: 14 }}>
          {['Refunds', 'Disputes + evidence', 'Invoicing', 'Reauthorize', 'JS SDK v6 · Pay Later'].map((x) => <Chip key={x} t={x} tone="pp" />)}
        </div>
      </div>
      <div style={{ position: 'absolute', left: 1180, top: 168, whiteSpace: 'nowrap', font: `500 18px/1.4 ${F.mono}`, color: C.ink3 }}>job DP-1002 · PayPal sandbox · ids from this run</div>
    </AbsoluteFill>
  );
};
