# Design

VeriPay is drawn as a bright, white-led work order: white panels on a very light cool gray, near-navy ink, a blue
system for action, and measurement as the only ornament. Every job has a number, every condition a part tag, every
check an inspection stamp, every dollar a PayPal id. The palette is in PayPal's family because PayPal moves the money,
but the brand is ours: our own name and check mark, never PayPal's logo, wordmark or name as our brand, and nothing
that could pass for an official PayPal page. Buttons drawn by PayPal's SDK stay exactly as PayPal draws them.

## Scene

A renter in Austin at 7 pm, phone in one hand, the other under the kitchen sink, checking whether the pro's photos
passed and whether the money moved; a judge at a laptop in daylight. Bright, friendly, calm: high-contrast navy ink on
white, numbers big enough to read at arm's length. One theme (light).

## Color (`web/src/theme.css`)

| Token | Value | Role |
|---|---|---|
| `--ground` | `#F5F7FA` | the page, the header (opaque) |
| `--ground-2` / `-3` | `#FFFFFF` / `#EEF2F7` | panels, cards, the tour, inputs / insets, wells, table headers |
| `--line` / `--line-strong` | `#DCE3EC` / `#B7C3D3` | hairlines, rules, the status rail |
| `--ink` / `-2` / `-3` | `#001C64` / `#2E3F66` / `#56657F` | text: 16:1, 10:1 and 5.9:1 on white (5.5:1 on the page) |
| `--primary` / `-hi` | `#003087` / `#001C64` | primary buttons, the brand name, the job number |
| `--signal` / `-hi` | `#0070E0` / `#005BB8` | focus rings, the active tab and step, progress, badges, fills; text in blue uses `-hi` (4.5:1 or more everywhere) |
| `--signal-soft` | `#E6F0FC` | highlighted panels, the tour's head, selected rows |
| `--paid` | `#FFD140` | rare: the big PAID stamp only. Never an accent |
| `--ok` / `--warn` / `--bad` | `#17703A` / `#8A5300` / `#B42318`, each with a soft fill and a line | stamps and outcomes only (passed, fix or a person confirms, failed); all over 6:1 on white |
| `--agent` | `#5531B8` | anything an agent or a model did; staff badges |

Strategy: restrained. Deep blue carries the primary action on a screen; bright blue marks where you are; yellow
appears once, when money is paid. Light shadows (`--shadow`) lift panels; no glassmorphism, no gradient text, and
nothing semi-transparent sits over text: the header, the demo panel and the tour are opaque. AG Grid and AG Charts use
the same tokens (`web/src/components/backoffice/theme.js`, `tokens.js`).

## Type

- Display: **Plus Jakarta Sans** 700–800, sentence case, tight tracking, for page titles, headings and the numbers that
  matter (job number, held amount, offer prices, payout). Never for labels or buttons.
- Text: **Schibsted Grotesk** 400–700 for everything people read and press.
- Data: **Martian Mono** for ids (DP-1036, AUTH-…, PAYOUT-…), rules, signals, timestamps, table figures. Never prose.
- Fonts load with `display=swap`; the page paints its light ground from an inline style before any CSS or font arrives.
- Radii 6–10px (`--r` 8px); stamps keep a smaller 4px corner.

## One agent, graphical cards (PLAN §17)

- **The signed-in home is the conversation** (`web/src/pages/Agent.jsx`, `/` for customers, `/pro` for pros): a slim
  strip of active jobs with mini icon rails, the thread (agent bubbles on white, yours in deep blue), and a sticky
  composer with three suggestion chips. Messages are two short sentences; a card and at most three buttons carry the
  rest. Buttons with a lock open the PIN sheet. Signed out, `/` is one line, five icon steps and a big "Try it".
- **Shared cards** (`web/src/components/cards.jsx`), used by the thread and the job page: icon rail (Scope, Offers,
  Hold, Work, Checks, Paid), money bar (held, captured, paid to pro, fee, refunded, released hatched), price range
  (typical band, offer markers, best in green, dashed max line), checklist (an icon per evidence type, a mark per
  result), photo grid (a badge per photo: green a model judged it, blue code checked it, amber a person confirms, red
  failed), the yellow PAID stamp, and the pro chip (initials, stars, licence and insurance ticks, a demo chip).
- **Text diet:** every explanation, rule, legal or demo note sits behind a small "Why?" / "Details" disclosure; demo and
  source labels are small chips. Nav: Agent · Jobs · Home · More.
- **The tour on the agent page** is a small step counter with "Next ›"; its steps arrive in the conversation.

## Components (`web/src/components/job.jsx`, `web/src/app.css`)

- **Work-order head**: `#DP-1036` in display type (the `#` in bright blue), the title, a mono meta line (trade, address,
  window, ceiling), the status badge and the one-line "what happens next".
- **Status rail**: six ticks on a ruled line (Scope, Offers, Hold, Work, Checks, Paid); done in grey, the current one in
  bright blue, red when cancelled or expired.
- **Done-conditions**: a ruled list; each row has a checkbox, the condition, its part tag (`new_part`), evidence kind,
  the machine-checkable rule in mono, then after a check the reason and the signals (hot ones in red), the evidence
  thumbnails, and on the right the stamp.
- **Inspection stamp**: a double-ruled box in mono caps, rotated −2.5°, the one hand-made gesture in the system:
  PASSED (green), FIX (amber), FAILED (red), CODE PASSED · a person confirms (amber), OPEN (dashed grey, unrotated).
  Stamps land with a short scale-in; reduced motion shows them at once.
- **Source label** (`Src`): a small mono pill with a dot: MODEL · name (violet), RULES (grey), CUSTOMER'S AGENT,
  CUSTOMER, DECIDED BY CODE (square dot). Present wherever a model or an agent could have produced the thing.
- **Spec rows**: label, dotted leader, mono value; for the hold, the split, the pro's terms.
- **Hold meter**: a measured bar, blue for what's due, grey for the buffer left for change orders.
- **PayPal ids**: a ruled list of every id with a copy button.
- **Registration marks**: small blue corner crosses on panels that carry money or a decision.
- **Buttons**: 8px radius; primary solid deep blue (#003087) with white text; secondary 1px outline; danger red outline; busy shows a
  spinner in place of the label.
- **Messages**: the agents' thread; pros' agents left on the ground, the customer's side right on ground-3, the
  platform's check as a dashed full-width row.

- **Milestones**: a ruled list numbered in display type (bright blue for the current one, green once paid), each with its
  amount or share, status badge, and one line for what is waiting (review window with its release time, the inspector),
  early pay, and the release with its fee.
- **Before / after**: per condition, BEFORE and AFTER groups of thumbnails; phase tags in mono (BEFORE violet, AFTER
  green, REFERENCE blue for the customer's problem photo, DEFECT red, INSPECTION amber). When a vision model answered,
  a violet-outlined "MODEL · VLM saw" box under the condition says what it saw, same spot or not, and what changed.
- **Scope review**: gaps as rows with a severity badge, kind, part tag, the problem and the suggested rewrite; dispute
  risk as a percentage with its reasons.
- **Retainage and warranty**: a money panel with the held amount, the window's end, the defect claim (amber note) and
  its check, and the claim form (reason and photos).
- **Rating**: five yellow stars, the review, and whether the job's photos are shared on the pro's profile.
- **SLA countdown**: the expert queue's time left in display type (amber inside an hour, red when overdue).
- **Verified badges**: green outlined pills (PayPal, licence "(demo registry)", insurance, staff review).
- **Shot checklist**: per condition, the shots to take, each with its framing as a part tag (wide, close, label,
  context) and "required".

## Pages

- Home (brand register): one hero sheet that stamps a real paid job's conditions on this server, the six-step flow,
  the evidence photos, why PayPal, and the agent example. Grid-paper hero background, masked.
- App pages (product register): fixed type sizes inside panels, dense where it helps (offers, ledger), Schibsted for
  UI, Martian Mono for data.
- Inspector (`/inspect`), public pro profile (`/pros/:id`), arbiter (`/office/jobs/:id`, staff): same work-order parts.
- Back office: AG Grid 36 (`themeQuartz` with these tokens) and AG Charts 14, loaded only on `/office`.

## Motion

Exponential ease-out, 150–250 ms for state. The home sheet stamps its conditions one by one (520 ms apart). The rail
and stamps change state, nothing else moves on its own. `prefers-reduced-motion` removes all animation.

## Layout

Max width 1280 with a fluid gutter. The job page is two columns (work order and conversation; money and decision on a
sticky side) and one column under 1000 px, where the decision panel moves to the top. No horizontal page scroll at
375 px; wide tables and code scroll inside their own box.

## No small print (Nov 6)

The site is a demo and says so once: a small DEMO badge next to the logo links to /real ("What's real here"). No
per-item demo chips, "(demo)" suffixes, simulated labels, photo credits under photos (they live on /credits), or clock
banners. API strings still tagged "(demo)" are stripped in api.jsx. Functional labels stay: amounts, ids, statuses,
MODEL / CODE / PERSON judge badges, and the PIN requirement. The floating demo panel toggle reads CONTROLS.
Phones (≤600 px): the DEMO badge sits at the end of the nav row next to the controls icon; no floating tour tab (≤720 px),
the controls panel offers "Resume the judge tour". Agent pages from 721 px: the tour docks top-right and the page makes
room; the floating CONTROLS button shows only at ≥1100 px with no tour open, otherwise the nav icon opens the panel.
Phones: the tour is the slim bar under the measured header (--top-h) on both agent threads ("/" and "/pro"), and the thread is padded to start below it; never a bottom sheet over the composer.
