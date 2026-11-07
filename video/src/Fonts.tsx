// The product's three families from public/fonts (downloaded once from Google Fonts, OFL): an @font-face sheet plus a
// component that holds the frame until each face used in the film has loaded.
import React, { useEffect, useState } from 'react';
import { continueRender, delayRender, staticFile } from 'remotion';

const FILES: [string, string, string, string][] = [
  ['Plus Jakarta Sans', 'PlusJakartaSans-500.woff2', '500', 'normal'],
  ['Plus Jakarta Sans', 'PlusJakartaSans-600.woff2', '600', 'normal'],
  ['Plus Jakarta Sans', 'PlusJakartaSans-700.woff2', '700', 'normal'],
  ['Plus Jakarta Sans', 'PlusJakartaSans-800.woff2', '800', 'normal'],
  ['Plus Jakarta Sans', 'PlusJakartaSans-700i.woff2', '700', 'italic'],
  ['Plus Jakarta Sans', 'PlusJakartaSans-800i.woff2', '800', 'italic'],
  ['Schibsted Grotesk', 'SchibstedGrotesk-400.woff2', '400', 'normal'],
  ['Schibsted Grotesk', 'SchibstedGrotesk-500.woff2', '500', 'normal'],
  ['Schibsted Grotesk', 'SchibstedGrotesk-600.woff2', '600', 'normal'],
  ['Schibsted Grotesk', 'SchibstedGrotesk-700.woff2', '700', 'normal'],
  ['Martian Mono', 'MartianMono-400.woff2', '400', 'normal'],
  ['Martian Mono', 'MartianMono-500.woff2', '500', 'normal'],
  ['Martian Mono', 'MartianMono-600.woff2', '600', 'normal'],
];
const CSS = FILES.map(([fam, file, w, st]) => `@font-face{font-family:'${fam}';font-style:${st};font-weight:${w};font-display:block;src:url('${staticFile('fonts/' + file)}') format('woff2');}`).join('\n');

export const FontsReady: React.FC = () => {
  const [h] = useState(() => delayRender('fonts', { timeoutInMilliseconds: 60000 }));
  useEffect(() => {
    let done = false;
    const finish = () => { if (!done) { done = true; continueRender(h); } };
    Promise.all(FILES.map(([fam, , w, st]) => document.fonts.load(`${st} ${w} 40px "${fam}"`).catch(() => null))).then(finish, finish);
    const t = setTimeout(finish, 20000);
    return () => clearTimeout(t);
  }, [h]);
  return <style>{CSS}</style>;
};
export const loadFonts = () => {};
