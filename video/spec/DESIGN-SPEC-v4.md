# Done & Paid film v4: design spec (video-shotcraft, autonomous mode)

Brief: the coordinator's v4 brief (tighter, tech explained, PayPal visible, simpler cover) plus the user's 5 page-by-page
fixes. Composition `FilmV4` (`src/v4/`). Storyboard: `storyboard4/Done-and-Paid-分鏡-v4.pdf` (approved; re-exported from
the rendered film). Review: `out/FINAL-REVIEW-v4.md`.

## Decisions

| Requirement | Execution |
|---|---|
| 2:15–2:30 | 4,320 frames = 2:24.0, voice-led (`src/v4/timeline4.ts`) |
| Faster, shorter VO | Kokoro 82M af_heart 1.12× on the GCP VM (`vo/narration-v4.json` → `src/vo4-timings.json`, `public/audio/vo4/`); v3 lines cut 300 → 205 words, 3 new tech lines |
| PayPal visible | the "PayPal API" rail (`diagrams4.tsx` `Rail`) in shots 5 and 8: only calls the run made, in `api/src/pay/paypal.js` shapes, ids from the DP-1002 ledger; shot 11 "Under the hood" with this run's ids; "also wired in" = what the code calls but this run didn't |
| Architecture | shot 9: agents (MCP, A2A, REST; llms.txt, agent card) → API (capture guard, PIN, mandates, receipts + ledger, Done-Risk, time-travel clock) → our models (GCP VM) and PayPal; the money path drawn through the guard |
| Model design | shot 10, numbers from `ml/RESULTS.md` (held-out synthetic sets); the Qwen3 pipeline only for done-chat + done-audit; Done-OCR, done-vlm (off the shelf), Done-Risk in their own row |
| Fix 1 (shot 7) | ~6 s on DP-1002 (scan, signals turn green, "All 3 checks passed") → ~6 s on DP-1009's flagged injection → the title in full |
| Fix 2 (shot 3) | DP-1002 throughout: Maria's request as stored on the job (the tour sent it, so it is drawn as a card, not a thread screenshot) + DP-1002's own work-order card from her thread |
| Fix 3 (shot 5) | the first authorization reads HELD until the new $247.05 one exists, then flips to VOIDED (with the rail's void row) |
| Fix 4 (shot 11) | the "also wired in" row grows 132% and lights as "+5 more PayPal modules implemented" for the last ~2.7 s |
| Fix 5 (shot 12) | three panels with 60 px titles on ink, each pushing to 120% on its key element |
| Delivery | `spec/finish.sh`: standard-range yuv420p H.264 (crf 14) + two-pass loudnorm −16 LUFS / −1.5 dBTP |

## Known limits

- Shot 3's request card is the job record's text, drawn in the product's style (no typed-message screenshot exists for
  the tour job). The work-order card shows the conditions as the model first wrote them; the tour later edited them, so
  shot 7's checks card lists the edited ones.
- "and the pro is paid the moment it passes": the ledger logs the payout 0.6 s after the capture; PayPal's own payout
  time is not shown.
- 99.9% is the full held-out evaluation; the served endpoint's 60-order bench is 98.6%.
