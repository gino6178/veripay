// Cover's icons: line drawings on a 24 x 24 grid, by name.
const G = {
  renters: <path d="M4 20V9.5L12 4l8 5.5V20M9 20v-6h6v6M4 20h16" />,
  home: <path d="M3 11 12 4l9 7M5.5 9.5V20h13V9.5M10 20v-5h4v5M16.5 6V4h2v3.5" />,
  pet: <><circle cx="7" cy="9" r="1.8" /><circle cx="17" cy="9" r="1.8" /><circle cx="10" cy="5.5" r="1.6" /><circle cx="14" cy="5.5" r="1.6" /><path d="M12 11.5c-3 0-5.5 3.2-5.5 5.6 0 1.9 1.6 2.9 3.2 2.4l2.3-.7 2.3.7c1.6.5 3.2-.5 3.2-2.4 0-2.4-2.5-5.6-5.5-5.6z" /></>,
  life: <path d="M12 20s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.2a4.3 4.3 0 0 1 7.5 2.6C19.5 15.4 12 20 12 20z" />,
  car: <><path d="M5 16.5h14v-4l-2-5H7l-2 5zM3.5 12.5h17" /><circle cx="8" cy="16.5" r="1.8" /><circle cx="16" cy="16.5" r="1.8" /></>,
  shield: <path d="M12 3.5 5 6v5.5c0 4.4 3 7.6 7 9 4-1.4 7-4.6 7-9V6zM9 12l2.2 2.2L15.5 10" />,
  bolt: <path d="M13 3 5.5 13.5H11L10 21l7.5-10.5H12z" />,
  heart: <path d="M12 20s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.2a4.3 4.3 0 0 1 7.5 2.6C19.5 15.4 12 20 12 20z" />,
  clock: <><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></>,
  agent: <><rect x="5" y="7" width="14" height="11" rx="3" /><path d="M12 3.5V7M9.5 12h.01M14.5 12h.01M9.5 15h5" /></>,
  camera: <><path d="M4 8.5h3l1.5-2h7l1.5 2h3V18H4z" /><circle cx="12" cy="13" r="3.2" /></>,
  doc: <path d="M7 3.5h7l4 4V20.5H7zM14 3.5v4h4M9.5 12h6M9.5 15.5h6" />,
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  x: <path d="M6.5 6.5l11 11M17.5 6.5l-11 11" />,
  flag: <path d="M6 20.5V4M6 4.5h11l-2.5 4 2.5 4H6" />,
  next: <path d="m9 5 7 7-7 7" />,
  back: <path d="M14.5 5.5 8 12l6.5 6.5" />,
  sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2.5v2.5M12 19v2.5M2.5 12H5M19 12h2.5M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M5.3 18.7l1.8-1.8M16.9 7.1l1.8-1.8" /></>,
  moon: <path d="M19 14.5A7.5 7.5 0 0 1 9.5 5a7.5 7.5 0 1 0 9.5 9.5z" />,
};
export default function Icon({ name, size = 22, stroke = 1.7, ...rest }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...rest}>{G[name] || G.shield}</svg>;
}
