// The single source of truth for the film's timing (30 fps). Captions, SFX and the workbench manifest derive from it.
export const FPS = 30;

export const SHOTS = {
  cover:   { from: 0,    duration: 106,  label: 'S0 Cover' },
  split:   { from: 106,  duration: 240,  label: 'S1 Two sides' },
  problem: { from: 346,  duration: 330,  label: 'S2 Numbers + tagline' },
  post:    { from: 676,  duration: 450,  label: 'S3 Post a job' },
  offers:  { from: 1126, duration: 405,  label: 'S4 Agents\' offers' },
  hold:    { from: 1531, duration: 315,  label: 'S5 PayPal holds' },
  pin:     { from: 1846, duration: 390,  label: 'S6 PIN' },
  phone:   { from: 2236, duration: 600,  label: 'S7 Pro\'s phone' },
  checks:  { from: 2836, duration: 1015, label: 'S8 Checks' },
  release: { from: 3851, duration: 465,  label: 'S9 Released' },
  sandbox: { from: 4316, duration: 300,  label: 'S10 Real sandbox' },
  montage: { from: 4616, duration: 405,  label: 'S11 Montage' },
  end:     { from: 5021, duration: 255,  label: 'S12 End card' },
  credits: { from: 5276, duration: 90,   label: 'S13 Credits' },
} as const;
export type ShotId = keyof typeof SHOTS;
export const TOTAL = 5366; // 2:58.9

// BGM: public/audio/bgm/bgm-film.mp3 = house-vibez.mp3 (122.0 BPM measured, first downbeat 0.471 s) edited once:
// source 0–95.031 s, then from source bar 16 (31.947 s) to the end, with a 4 f crossfade, so the jump lands on a
// downbeat (source bar 48 → bar 16) at file time 94.898 s. The file starts at film f106 (after the cover), so the jump
// is at film f2953 and the second "full" section (source bar 32, 63.422 s) at f2953 + 944 = f3897: the release's PAID.
export const BGM = {
  src: 'audio/bgm/bgm-film.mp3',
  startAt: 106,
  jumpAt: 106 + Math.round(94.898 * 30), // 2953
  volume: 0.32,
};
// The grid puts source bar 32 at f3897; on the edited file the first full-energy beat of that section is one beat
// (≈15 f) later (RMS per half-beat, spec/AUDIO-SYNC.md), so the PAID stamp is pinned there.
export const DROP2 = BGM.jumpAt + Math.round((63.422 - 31.947) * 30) + 15; // 3912
