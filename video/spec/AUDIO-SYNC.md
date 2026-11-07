# Audio sync record (sound-design §4.6)

Pipeline: Remotion 4.0.484, `--codec=h264 --audio-codec=aac`, 48 kHz, mp4. Measured 2026-11-05 on `out/done-and-paid.mp4`
(v1 render) by normalized cross-correlation of the original SFX files against the rendered track (spec/render.raw):

| Probe | Cue start (frames) | Found | Output lag |
|---|---|---|---|
| fs-470710 stamp (S0 PAID) | f2 | +2064 samples | +1.29 f |
| fs-678248 click (S3 send) | f855 | +2064 samples | +1.29 f |
| fs-678248 click (S6 Approve) | f1895 | +2032 samples | +1.27 f |

Consistent ≈1.28 f (AAC encoder priming). `OUTPUT_AUDIO_OFFSET_F = 1.28` in `src/audio.tsx` is subtracted in `sfxFrom`,
together with each file's own energy-peak time from `audio-manifest.json` (PEAK_S), so the SFX peaks land on their
target frames. BGM: no strict beat sync claimed; the one structural alignment (the second "full" section on the
release's PAID stamp, f3897) comes from the measured 122.0 BPM grid (spec/beat.py), not from a post-render check.
