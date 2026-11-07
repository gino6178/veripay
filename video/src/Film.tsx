// The film: every shot in its SHOTS slot, the sound underneath.
import React from 'react';
import { AbsoluteFill, Sequence } from 'remotion';
import { SHOTS, DROP2, ShotId } from './timeline';
import { Sound } from './audio';
import { FontsReady } from './Fonts';
import { C } from './theme';
import { Cover, Split, Problem } from './shots/Opening';
import { Post, Offers, Hold, Pin, Phone, Checks, Release } from './shots/Product';
import { Sandbox, End, Credits, Piece, Credit } from './shots/Closing';
import { Montage, Stop } from './shots/Montage';


export const STOPS: Stop[] = [
  { src: 'textures/pages-final/livetest.png', pageW: 1920, crop: { x: 440, y: 30, w: 1040, h: 535 }, label: '/live-test: 11 rounds · 45 agent runs · 3,000 calls' },
  { src: 'textures/pages-final/office-jobs.png', pageW: 1920, crop: { x: 380, y: 1040, w: 860, h: 443 }, label: 'Back office: every job, hold and payout (AG Grid)', crane: { x: 160, y: 280, zoom: 1.8 } },
  { src: 'textures/pages-final/pro-verified.png', pageW: 1920, crop: { x: 300, y: 190, w: 1000, h: 515 }, label: "A pro's work record: signature verified" },
  { src: 'textures/pages-final/tenancy.png', pageW: 1920, crop: { x: 340, y: 70, w: 920, h: 474 }, label: 'Landlords and tenants' },
  { src: 'textures/pages-final/groups.png', pageW: 1920, crop: { x: 340, y: 70, w: 920, h: 474 }, label: 'Neighbors book one pro together' },
];
export const PIECES: Piece[] = [
  { src: 'textures/pieces/offer.png', w: 380, h: 321, x: 50, y: 50, rot: -3, from: [-420, -300] },
  { src: 'textures/pieces/stats.png', w: 560, h: 165, x: 680, y: 46, rot: 1.5, from: [0, -380] },
  { src: 'textures/pieces/pin.png', w: 340, h: 278, x: 1520, y: 56, rot: 3, from: [420, -320] },
  { src: 'textures/pieces/phone.png', w: 230, h: 334, x: 120, y: 430, rot: 2.5, from: [-460, 0] },
  { src: 'textures/pieces/receipt.png', w: 360, h: 170, x: 50, y: 840, rot: -2, from: [-300, 420] },
  { src: 'textures/pieces/grid.png', w: 330, h: 350, x: 1540, y: 400, rot: -2.5, from: [460, 0] },
  { src: 'textures/pieces/paid.png', w: 230, h: 339, x: 1610, y: 760, rot: 2, from: [300, 440] },
];
export const PHOTO_CREDITS: Credit[] = [
  { what: 'Faucet running (after)', who: 'Pinnacle Leeds', license: 'CC BY-SA 4.0' },
  { what: 'Faucet off, no drip (after)', who: 'Carsten R D', license: 'CC BY-SA 4.0' },
  { what: "The customer's photo and the change-order photo", who: 'Roy Zuo', license: 'CC BY-SA 4.0' },
];

export const renderShot = (id: ShotId) => {
  switch (id) {
    case 'cover': return <Cover />;
    case 'split': return <Split />;
    case 'problem': return <Problem homeHero="textures/pieces/home-sheet.png" heroW={550} heroH={590} />;
    case 'post': return <Post />;
    case 'offers': return <Offers />;
    case 'hold': return <Hold />;
    case 'pin': return <Pin />;
    case 'phone': return <Phone />;
    case 'checks': return <Checks />;
    case 'release': return <Release stampAt={DROP2 - SHOTS.release.from} />;
    case 'sandbox': return <Sandbox />;
    case 'montage': return <Montage stops={STOPS} />;
    case 'end': return <End pieces={PIECES} />;
    case 'credits': return <Credits photos={PHOTO_CREDITS} />;
  }
};

export const Film: React.FC<{ bgm?: boolean }> = ({ bgm = true }) => (
  <AbsoluteFill style={{ background: C.ground }}>
    <FontsReady />
    {(Object.keys(SHOTS) as ShotId[]).map((id) => (
      <Sequence key={id} from={SHOTS[id].from} durationInFrames={SHOTS[id].duration} name={SHOTS[id].label}>
        {renderShot(id)}
      </Sequence>
    ))}
    <Sound bgm={bgm} />
  </AbsoluteFill>
);
