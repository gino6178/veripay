import { Film5 } from './v5/Film5';
import { Film7 } from './v7/Film7';
import { TOTAL7 } from './v7/timeline7';
import { Pain15, TOTAL15, FPS15 } from './stick15/Pain15';
import { TOTAL5 } from './v5/timeline5';
import React from 'react';
import { Composition } from 'remotion';
import { Film } from './Film';
import { TOTAL, FPS } from './timeline';
import { Film3 } from './v3/Film3';
import { TOTAL3 } from './v3/timeline3';
import { Board4 } from './v4/Board4';
import { Film4 } from './v4/Film4';
import { TOTAL4 } from './v4/timeline4';

export const Root: React.FC = () => (
  <>
    <Composition id="DonePaidFilm" component={Film} durationInFrames={TOTAL} fps={FPS} width={1920} height={1080} defaultProps={{ bgm: true }} />
    <Composition id="FilmV3" component={Film3} durationInFrames={TOTAL3} fps={FPS} width={1920} height={1080} defaultProps={{ bgm: true, vo: true }} />
    <Composition id="FilmV4" component={Film4} durationInFrames={TOTAL4} fps={FPS} width={1920} height={1080} defaultProps={{ bgm: true, vo: true }} />
    <Composition id="FilmV7" component={Film7} durationInFrames={TOTAL7} fps={FPS} width={1920} height={1080} defaultProps={{ bgm: true }} />
    <Composition id="FilmV5" component={Film5} durationInFrames={TOTAL5} fps={FPS} width={1920} height={1080} defaultProps={{ bgm: true, vo: true }} />
    <Composition id="Board4" component={Board4} durationInFrames={TOTAL3} fps={FPS} width={1920} height={1080} defaultProps={{ id: 'arch:1' }} />
    <Composition id="Pain15" component={Pain15} durationInFrames={TOTAL15} fps={FPS15} width={1920} height={1080} />
  </>
);
