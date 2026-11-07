// VeriPay tokens (web/src/theme.css, DESIGN.md), the film's only palette and type.
export const C = {
  ground: '#F5F7FA', panel: '#FFFFFF', inset: '#EEF2F7',
  line: '#DCE3EC', lineStrong: '#B7C3D3',
  ink: '#001C64', ink2: '#2E3F66', ink3: '#56657F',
  primary: '#003087', signal: '#0070E0', signalHi: '#005BB8', signalSoft: '#E6F0FC', signalLine: '#9CC3F2',
  paid: '#FFD140', paidInk: '#3D2E00', paidEdge: '#C99A00',
  ok: '#17703A', okSoft: '#E7F5EC', okLine: '#9FD4B2',
  warn: '#8A5300', warnSoft: '#FFF4DB',
  bad: '#B42318', badSoft: '#FDECEA', badLine: '#F2ADA6',
  agent: '#5531B8', agentSoft: '#F0EBFC', agentLine: '#C6B5F0',
};
export const F = {
  display: '"Plus Jakarta Sans", "Schibsted Grotesk", sans-serif',
  text: '"Schibsted Grotesk", system-ui, sans-serif',
  mono: '"Martian Mono", ui-monospace, monospace',
};
export const SHADOW = '0 1px 2px rgba(0,28,100,0.06), 0 4px 14px rgba(0,28,100,0.06)';
export const SHADOW_LG = '0 12px 36px rgba(0,28,100,0.16)';
export const rgba = (hex: string, a: number) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
};
