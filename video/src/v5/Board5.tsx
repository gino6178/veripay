// Storyboard v4 styleframes: any film-v3 shot frozen at a frame (no captions), with the new v4 graphics on top, and the
// new v4 diagrams at a given progress. Rendered with `remotion still ... Board4 --props='{"id":"..."}'`.
//   "film"                             film v3's picture (no captions, no sound) at the still's --frame
//   "rail:<calls>"                     the same, with the PayPal API rail (calls comma-separated, e.g. hold,rehold,void)
//   "arch:<t>" "models:<t>" "hood:<t>" the new diagrams at progress t (0..1)
import React from 'react';
import { AbsoluteFill } from 'remotion';
import { C } from '../theme';
import { FontsReady } from '../Fonts';
import { Film3 } from '../v3/Film3';
import { Rail, Arch, Models, Hood, CALLS } from './diagrams5';

export const Board4: React.FC<{ id: string }> = ({ id }) => {
  const [kind, a] = id.split(':');
  let body: React.ReactNode = null;
  if (kind === 'film' || kind === 'rail') body = (
    <>
      <Film3 bgm={false} vo={false} captions={false} sfx={false} />
      {kind === 'rail' && <Rail calls={a.split(',') as (keyof typeof CALLS)[]} />}
    </>
  );
  else if (kind === 'arch') body = <Arch t={+a} />;
  else if (kind === 'models') body = <Models t={+a} />;
  else if (kind === 'hood') body = <Hood t={+a} />;
  return <AbsoluteFill style={{ background: C.ground }}><FontsReady />{body}</AbsoluteFill>;
};
