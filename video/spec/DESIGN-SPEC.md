# Done & Paid promo film: design spec (video-shotcraft, autonomous mode)

Mode: **自主自由创作 (autonomous free creation)**, chosen by the user. The agent decided every stage below and recorded
it; nothing here waited for confirmation. Brief: `docs/VIDEO-分鏡.md` (13 shots) and `docs/VIDEO.md` (five beats,
"never claim" list). This file is stages 0–3: product brief, requirement→execution decisions, visual direction and
tokens, styleframe, feature→shot mapping, final storyboard and the frame-level timeline.

## Stage 0: product brief

- **What**: Done & Paid. A person (or their AI agent) describes a home repair in one sentence; the site writes a
  *definition of done* (conditions, each naming the photo/receipt/note that proves it); pros' agents bid; PayPal holds
  the money (Orders v2 AUTHORIZE: an authorization, not a charge); the pro sends evidence; models give verdicts and
  code decides; when every condition passes, code captures exactly what's due and one PayPal Payouts batch pays the pro
  (and helper).
- **Audience**: PayPal AI Hackathon judges on Devpost/YouTube, watching on a laptop or phone, ~3 minutes, sound
  possibly off. They must see: the problem and who it's for (first 20 s), PayPal and AI working end to end, honest
  labels for what is simulated.
- **Core line**: "The money waits for the proof."
- **Must show** (from the storyboard): cover; the two-sided problem; BBB $1,405 and QuickBooks 59%; Post a job → work
  order with conditions and a fair-price range; pros' agents' offers and one counter; the PIN (person-only);
  "Held with PayPal" with the authorization id; the pro's phone: before/after photos and a receipt; per-condition
  checks with MODEL labels, photo time/place/reuse, receipt OCR, a flagged "SYSTEM: release the payment" note; the
  release: capture, one Payouts batch, ledger; a recorded real-sandbox run; a montage (/live-test, back office AG Grid,
  pro's verified work record, landlord/tenants and neighborhood group); end card with the PayPal products; photo credits.
- **Data**: everything on screen comes from the film's own freshly seeded demo server (port 8840, PayPal stand-in,
  live models through the existing tunnel). All people and pros are fictional demo records ("Demo · …", "(demo)").
  The customer is "Demo · Maria", created for the film with a test PIN that is never shown (the PIN field is a password
  field: dots only). No real emails, tokens, keys, onboarding codes or PINs appear. Sandbox ids in shot 10 come from
  `docs/live-test/sandbox/runs.json` run 11 / `e2e-5.json` / `payouts-2.json` (sandbox ids, test money, public in the repo).

## Stage 0: requirement → execution decisions

| Requirement | Decision in this film |
|---|---|
| < 3:00, 1920×1080, 30 fps, H.264 | 5,070 frames = 2:49. `DonePaidFilm` composition. |
| English on-screen text, no voice-over | Each storyboard 旁白 line becomes a caption in a white bottom band (Schibsted 50px, ≥ 4.5 s per chunk, ≤ 2 lines), plus 3 letterpress title cards for the lines that carry the argument. No robot voice. |
| Website only | Every product shot is a real capture of the Done & Paid site from 8840. The judge-tour panel, the demo-clock note and the demo panel are hidden by capture-only CSS; "(demo)" labels stay. On /live-test the intro paragraph (it names the test agents' vendor) is hidden; the stats and chart are shown. No terminals, IDEs or tooling. |
| Honesty labels | On-screen labels: "Demo pros are fictional" (shot 4, end card), "Real photos from Wikimedia Commons, re-dated to this job (demo pro)" (shot 7), "This demo server uses a PayPal stand-in" (shots 5, 9), "Recorded run on PayPal's sandbox" (shot 10), credits card at the end. "sped up" label wherever waiting is compressed. |
| Never claim | No PERSON-confirmed condition is described as AI-verified (labels are shown as the site shows them). No mandate signature on screen. No model test accuracy. No Venmo or multiparty. |
| Storyboard says "Money moves only with your PIN" | **Changed**: on this server the demo agent places the hold within the person's limits without a PIN, and the release is automatic by code. The accurate line is used instead: "Your agent works inside your limits. Saying yes to more takes your PIN." The PIN is shown where the site really asks for it: approving the $47.05 change order. |
| Storyboard shot order 5 (Hire + PIN) → 6 (hold) | **Reordered** to the real order of events: the agent hires and PayPal holds (shot 5), then the pro asks for a change order and Maria approves it with her PIN (shot 6). The website's "Let the demo agent negotiate and hire" path has no separate Hire dialog, so none is shown. |
| "47 agents, 3,000 calls" | **Corrected** to the files: 11 rounds, **45** agent and persona runs, 3,000 calls (`docs/live-test/index.html`, `rounds.json`). |
| Storyboard says capture `9Y225274PC3151649` | **Corrected**: in `payouts-2.json` that is the pro's Payouts item transaction; the capture is `8J703087NC2283128`. Both shown with the right labels. Run 11 ended in review and the customer released (not automatic); the card says so. |
| Shot 10 needs the PayPal dashboard | Not logged in (no credentials handled). Built as a card of the recorded run's ids labelled "Recorded run on PayPal's sandbox"; the user can swap in a dashboard screen recording. |
| Shots 6–9 must be real | Captured only after the tour ends "released" on its own with model-judged conditions on a fresh seed; never faked. |
| Audio | BGM: bundled `house-vibez.mp3` (Lily J, Mixkit Stock Music Free License per `assets/audio/ATTRIBUTION.md`), looped once at a bar boundary to cover 2:49; `bgm-tech-house.mp3` avoided because its source can't be traced. SFX: Freesound CC0 only via `sfx-source.py`. Two renders: with BGM and without (SFX kept). |
| Beat sync | `uv`/librosa not available; beat grid estimated with numpy onset analysis (BPM ≈123 from the attribution table). Cuts are placed near bars where it costs nothing; strict beat sync is **not** claimed. |
| Ports / processes | Own server on 8840 only; 8787/8800/8810 untouched. |

## Stage 1: visual direction

Three directions were considered:

1. **Work-order paper (chosen)**: the product's own white-led PayPal-blue system as the film's skin: #F5F7FA ground,
   white panels, navy ink, deep-blue primary, bright-blue "you are here", the inspection stamp as the one hand-made
   gesture, yellow only on PAID. Calm, measured, "professional trust" motion preset.
2. Night-to-day: a dark navy opening (the 2 a.m. drip) brightening into the white product. Rejected: the product is
   one light theme (DESIGN.md: "One theme (light)"), and a dark opening reads as a different brand.
3. Blueprint/HUD: grid paper and scan lines everywhere. Rejected as a film-wide skin (too techy, competes with real
   UI); kept only inside shot 8, where "a machine reading the evidence" is literally the subject.

### Tokens (from `web/src/theme.css`, DESIGN.md)

| Token | Value | Film use |
|---|---|---|
| ground / panel / inset | #F5F7FA / #FFFFFF / #EEF2F7 | stage background, caption band, cards |
| line / line-strong | #DCE3EC / #B7C3D3 | hairlines, phone and window frames |
| ink / ink-2 / ink-3 | #001C64 / #2E3F66 / #56657F | all text |
| primary | #003087 | wordmark, headings, card numerals |
| signal / signal-hi / signal-soft | #0070E0 / #005BB8 / #E6F0FC | the machine's line in shot 8, accent word, underline, ripple rings |
| paid / paid-ink | #FFD140 / #3D2E00 | **only** the PAID stamp (shots 0, 2, 9, end) |
| ok / warn / bad | #17703A / #8A5300 / #B42318 | stamps only (as on the site) |
| agent | #5531B8 | MODEL / agent labels (as on the site) |
| Display | Plus Jakarta Sans 700–800 (italic 800 for the one accent word) | titles, numbers |
| Text | Schibsted Grotesk 400–700 | captions, chips |
| Data | Martian Mono 400–600 | ids, amounts, counters, labels |
| Radii | 8 px (cards 10–16 at film scale), stamps 4 px | |
| Shadow | `0 1px 2px rgba(0,28,100,.06), 0 4px 14px rgba(0,28,100,.06)`; lifted: `0 12px 36px rgba(0,28,100,.16)` | |

No glassmorphism, no gradient text, nothing semi-transparent over text, no PayPal logo or wordmark as our brand, no
gold dust. Light effects: at most one sheen per shot, clipped to the radius (Q4).

### Motion personality

Preset "professional trust" (fintech): main duration ~21 f, entrance `bezier(0,0,0.2,1)` / product ease-out
`cubic-bezier(0.16,1,0.3,1)`, no overshoot on fades and pans; overshoot only where something lands (stamp scale-in,
cards seating, chip pop): y1 > 1. Camera: 2.5D PageCam push-ins, front-on for dense lists (Q6), no handheld shake.
Three words: **measured, exact, calm**. Holds: wordmark ≥ 30 f, batch landings 15 f rest.

### Styleframe

The styleframe is HTML, rendered with puppeteer before the shot code: `submission/cover.html` (the light-theme cover,
which is also frame 0 of the film: palette, type, stamp, registration ticks, the real paid work order and the pro's
phone), rendered to `out/cover.png`. It confirmed the palette, the type pairing and the density at 1920×1080. The other
key frames were checked as Remotion stills (`out/qa/v1/`) as each shot was built.

## Stage 2: feature → shot mapping (Gallery cards, exact demo source)

| Feature | Shot | Card · style-key | Demo TSX | Adaptation |
|---|---|---|---|---|
| Brand / cover | S0 | (none: the cover still, product stamp scale-in) | — | cover.html is the frame |
| Two-sided problem | S1 | quad-split-parallel-scenes · quad-split-parallel-scenes (1×2 variant) | demos/rhythm/quad-split-parallel-scenes/QuadSplitParallelScenes.tsx | two panes, off-beat events (≥3 f apart), equal-light panes instead of checkerboard (the product is one light theme) |
| Problem numbers, tagline | S2 | paper-title-card · paper-title-card | demos/typography/paper-title-card/PaperTitleCard.tsx | Plus Jakarta 800 instead of serif, bright-blue italic accent, DigitRoll subline; 3 cards |
| One sentence → work order | S3 | type-and-filter · type-and-filter | demos/interaction/type-and-filter/TypeAndFilter.tsx | real typed frames (captured per 2 chars) under a close camera (zoom 1.7), breath, pull-out, ripple click on Send; no grid filter (no grid on this page) |
| Pros' agents' offers | S4 | list-stack-press · list-stack-press | demos/ui-entrance/list-stack-press/ListStackPress.tsx | the 5 real offer cards (cut from the capture) rise into their real slots, press, counter "OFFERS 05" |
| PayPal hold | S5 | (custom) PageCam push + DigitRoll on the held amount | assets/lib/PageCam.tsx, DigitRoll.tsx | |
| PIN (person only) | S6 | (custom) real dialog frames, PageCam | — | |
| Pro's phone evidence | S7 | radial-ripple-phone-chips · radial-ripple-phone-chips | demos/effects/radial-ripple-phone-chips/RadialRipplePhoneChips.tsx | blue-tint rings (#E6F0FC family), graphite/silver phone, the real 390-px pro page scrolling uniformly, 3 chips |
| AI + code checks | S8 | scanline-annotate-focus · scanline-annotate-focus | demos/effects/scanline-annotate-focus/ScanlineAnnotateFocus.tsx | machine colour = #0070E0 (bright blue), brand content = the real page; 4 targets measured from layout.json |
| Release, capture, payout, ledger | S9 | product-card-progressive-assemble · product-card-progressive-assemble | demos/ui-entrance/product-card-progressive-assemble/ProductCardProgressiveAssemble.tsx | the real money panel's rows revealed one by one by a fill cursor, then the PAID stamp |
| Real sandbox | S10 | (custom) ids card typed in mono | — | |
| Montage | S11 | shot-transitions · whip-pan (WhipBrakeReal) | demos/transition/shot-transitions/WhipBrakeReal.tsx | a rail of 4 real pages; whip, brake, hold ~3.5 s each |
| Back office grid (inside S11) | S11b | crane-rise-reveal · crane-rise-reveal | demos/opening/crane-rise-reveal/CraneRiseReveal.tsx | start 2.4× on one AG Grid row, crane to the grid |
| End | S12 | outro-group-photo-launch · outro-group-photo-launch | demos/outro/outro-group-photo-launch/OutroGroupPhotoLaunch.tsx | representative real elements fly in around the wordmark; light stage, blue stage light, no gold dust |

## Stage 3: storyboard (final, as built)

Planned durations were re-cut once the music was measured (122.0 BPM): the second "full" section of the BGM lands on
the release's PAID stamp (f3897). Total 5,366 frames = 2:58.9.

| # | Time | Frames | Shot (what is on screen) | Key motion · card | Captions / labels |
|---|---|---|---|---|---|
| S0 | 0:00.0–0:03.5 | 0–106 | Cover (submission/cover.html): wordmark, "The money waits for the proof.", 3 points, the real paid DP-1041 and the pro's phone | slow push; PAID stamp scale-in at f14 | none |
| S1 | 0:03.5–0:11.5 | 106–346 | Split: Maria (homeowner, 2:14 AM, a "50% deposit" quote, a dripping faucet) / Luis (plumber, invoice "45 days overdue", UNPAID) | quad-split (1×2), events off-beat ≥3 f | 2 narration captions |
| S2 | 0:11.5–0:22.5 | 346–676 | Card: BBB median loss $1,405 · card: QuickBooks 59% · doors close onto the home page's real paid work order + PAID + the line | paper-title-card ×2, doors, stamp | source lines on the cards; 1 caption |
| S3 | 0:22.5–0:37.5 | 676–1126 | Post a job: the sentence typed (real frames every 2 chars) → the model's draft work order (MODEL) → its conditions + the "Typical $165–$180" estimate | type-and-filter camera, click ripple | 3 captions |
| S4 | 0:37.5–0:51.0 | 1126–1531 | DP-1041's five offers from demo pros' agents rise into their slots; then the agents' thread: counter $170 → pro's agent $185 → accept | list-stack-press (+ odometer "OFFERS 5"); marker bars | "Demo pros and their agents are fictional (demo)"; 2 captions |
| S5 | 0:51.0–1:01.5 | 1531–1846 | "The money": HELD WITH PAYPAL $200.00, authorize/capture later; PayPal ids (SIMULATED PAYPAL, AUTH-…) | PageCam push + underline | "This demo server uses a PayPal stand-in…"; 1 caption |
| S6 | 1:01.5–1:14.5 | 1846–2236 | Change order +$47.05 → Approve → "Confirm it's you to approve a change order" PIN dialog (dots only) → approved, re-held; title card | ripple, real dialog frames; paper-title-card | 1 caption + "Your agent works inside your limits. Saying yes to more takes your PIN." |
| S7 | 1:14.5–1:34.5 | 2236–2836 | The pro's 390-px page in a phone, scrolling through the AFTER photos and the receipt | radial-ripple-phone-chips (3 chips) | "Demo pro · real photos from Wikimedia Commons, re-dated to this job"; 1 caption |
| S8 | 1:34.5–2:08.4 | 2836–3851 | The checks on the real page: MODEL (done-vlm) description; CODE time/place signals; the real photo (not reused); MODEL done-ocr read of the receipt; the APPROVED stamp decided by code; title card | scanline-annotate-focus (5 targets, uniform scan, spring brackets, typed machine tags) | 3 captions + "Models give verdicts. Code decides the money." |
| S9 | 2:08.4–2:23.9 | 3851–4316 | Paid: the page's PAID stamp lands on the beat (f3897); the money table assembles (captured $232.05 · pro $208.84 · fee $23.21 · adds up to the cent); PayPal ids | product-card-progressive-assemble (skeleton rows, fill cursor) | "Stand-in ids (SIMULATED PAYPAL)…"; 2 captions |
| S10 | 2:23.9–2:33.9 | 4316–4616 | Recorded run on PayPal's sandbox (run 11, DP-1001): order, authorization, capture, Payouts batch, payout item; "the checks left the release to the customer, who released it" | ids typed | "RECORDED RUN ON PAYPAL'S SANDBOX"; 1 caption |
| S11 | 2:33.9–2:47.4 | 4616–5021 | /live-test stats → back office AG Grid (crane from one row) → pro's verified work record → tenants → neighborhood group | shot-transitions · whip-pan (WhipBrakeReal curve, 40 f), crane-rise-reveal | 2 captions |
| S12 | 2:47.4–2:55.9 | 5021–5276 | End card: elements of the film fly in; wordmark, the line, "Built on PayPal: …", "PayPal sandbox · demo pros are fictional" | outro-group-photo-launch (light stage, no gold dust) | — |
| S13 | 2:55.9–2:58.9 | 5276–5366 | Credits: photos (CC BY-SA 4.0 authors), music, SFX, "fictional / stand-in" | fade | — |

### Deviations from the brief, decided while capturing (all to stay true to what the site did)

- **No hidden-instruction beat in S8**: the tour's work order on this run has no pro note condition, so no "SYSTEM:
  release the payment" note was sent or flagged. Not faked; the beat is left out.
- **No apprentice**: the hired pro (Eastside Pipe & Drain (demo)) has no helper; the Payouts batch has one item. The
  captions say "paid the pro".
- **The job's conditions are the tour's**: the tour edits the AI's work order to photo conditions the models can check
  (the page shows "work order by MODEL · EDITED BY THE CUSTOMER"). The Post-a-job draft in S3 is the model's own draft
  for the typed sentence (a separate preview, not posted); DP-1041 was started by the tour with its own sentence.
- **Photo library reserved**: on a fresh server, a seeded warranty job's demo pro used the same library photos a few
  minutes after start, which made the tour's photos "reused" (a real check, correctly failing). For the film the three
  faucet photos were pre-listed in the film state's `demo-real-used.json` before the server started, so background demo
  jobs couldn't take them; the checks themselves ran unchanged.
- **Shot 10** is an ids card, not the PayPal dashboard (no PayPal login handled). Swap in a screen recording if wanted.

## Changes after the independent review (out/FINAL-REVIEW.md, v3 render)

| Review item | Fix |
|---|---|
| PIN caption contradicted the page ("your agent may approve it too") | Caption now: "A $47.05 change order. I approve it myself, so the site asks for my PIN. My agent never has it." Title card: "Your agent works inside your limits. Only your PIN acts as you." |
| Sandbox disclosure hidden under the caption | Moved under the title, in amber, visible for the whole shot; repo path removed from the subline |
| Demo side box ("Have the demo pro finish now… synthetic photos") visible in S6 | Camera re-framed (cx 555, zoom 2.4) so the side column is out of frame |
| White patch with yellow edges before PAID lands | Patch spans the whole panel width |
| Underlines through "due $185.00" and the authorization id | Replaced by a left-side marker bar |
| S8 tags cut off, covering the counter, right 40% empty, 15 s at 03/05 | Numbered badges in the window; a full-size "WHAT THE CHECK READ" readout beside it; 7 targets (condition 2 added) |
| S4 window mostly empty at the start; counter over page text | Starts on the real "Offers" heading; counter moved above the window; zoom 2.3 on the offers column |
| S7 phone showed the paid record while the caption said "sends" | Scroll starts below the paid header; caption in the past tense ("sent") |
| Caption 48 px, labels 26 px | Captions 58 px (Schibsted), labels 32 px (Schibsted, not mono), counters/tags ≥ 26 px bold mono; credits line-height fixed |
| Typing SFX inaudible under BGM | Typing cues at volume 1.0; soft whooshes raised |
| PAID beat one beat early (≈f3911) | DROP2 moved to f3912 (measured on the edited BGM file) |
| "paid the moment the work is done" | "…the moment the proof passes" |
| End card "PayPal sandbox" | "demo server with a PayPal stand-in" |
| AG Grid crane soft at 2.4× | 1.8× |

Not fixed (need the user's decision or a product change): the hidden-instruction beat and BEFORE photos (not in the
tour's evidence on this run), landlord/tenant and group flashes (the storyboard includes them, VIDEO.md says leave them
out; kept per the storyboard), S10 dashboard recording (needs the user's PayPal login).

## Changes after the re-review (v4 → final render)

- S4: zoom 1.75 so each offer card is shown whole as it lands (the five never fit one 16:9 frame legibly; the column is
  portrait). Sides of the window stay partly empty: accepted trade-off.
- S6: approve view lowered (button and its line in frame), dialog view at 1.9× so the whole dialog fits.
- S9: the stamp's scale-in box allows for its rotation; the mask stays inside the card border; "WRITTEN BY CODE" 20 px.
- S8: brackets clipped to the window; readout 32 px text, 24 px chips, 30 px heading.
- End card and credits: prose in Schibsted 30 px (mono only for ids).
- Montage: whips 30 f (≈1.6 s static per stop).
- S10 typing: a second, denser typing layer.
- Captions in the third person after S1 ("Maria's agent…", "Maria approves it herself…").
- Cover footer: "built on PayPal's sandbox API" (cover.png and the film's frame 0 re-rendered).

Left as is, reported: the page's own line "your agent may approve it too" next to the dialog's "your agent can't"
(product copy; accurate in context: agents approve within limits, the person's own approval needs the PIN); the missing
hidden-instruction and BEFORE-photo beats; credits on screen 3 s (the film is at 2:58.9).
