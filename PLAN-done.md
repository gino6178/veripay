<!-- §17 also appended to D:/paypal/PLAN-done.md (the full plan). -->

## §17 One agent to talk to, a graphical website (user feedback, 2026-11-06)

The user: the website has too much text. A customer should only need to talk to ONE agent; everything else is the agent
asking and following up on its own. Pages should be as graphical as possible. (The video is redone after this.)

### Product shape
- **Signed-in home = the conversation with "Your agent"** (one thread per person, across all their jobs). The person types
  plain sentences ("my kitchen faucet drips, fix it this week under $200") or taps suggested replies. Everything else
  (posting, offers, counter, hire, change orders, evidence arriving, checks, release, fixes, disputes, reschedules,
  maintenance reminders, groups, landlord approvals) arrives IN the thread as a short agent message + a visual card +
  1–3 buttons.
- **Proactive**: the agent posts on events without being asked: offers in ("3 offers, best $185 — hire Eastside?"), hold
  placed, pro on the way / arrived, change order asked (photo + amount, Approve needs PIN), evidence arrived (thumbnails),
  checks done (ticks), paid (stamp), waiting on you (reminder after N demo-minutes), hold expiring, warranty ending,
  maintenance due. Follow-ups: if a question is unanswered it asks again once, later, shorter.
- **Text budget**: an agent message is at most 2 short sentences (~25 words). Numbers, names, photos and icons carry the
  rest. Explanations ("why", rules, legal, demo notes) sit behind a small "Why?" / "Details" toggle, never inline.
- **Person-only stays person-only**: buttons that move money beyond limits or act as the person (approve change order,
  confirm a person-check, release over failed checks, dispute) open the PIN sheet; the agent never holds the PIN. The
  agent's own actions within limits (counter, hire within ceiling, request fix) are shown as done, with an Undo where
  the API allows.
- **Graphical cards** (shared by thread and job page): work-order checklist (icon per evidence type: camera, receipt,
  ruler, note; one line each), price-range bar with offer markers, money bar (held / captured / paid / released
  segments with amounts), photo grid with a badge per photo (green tick model, blue tick code, amber person, red x),
  progress rail with icons, PAID stamp, pro chip (avatar initials, stars, license/insured ticks).
- **Job page** keeps the full record but leads with the graphics (rail, money bar, photo grid, checklist); every long
  paragraph moves behind Details. **Nav**: Agent · Jobs · Home · More (Groups, Renting, Office, Models, Connect, Live tests).
- **Pro side**: same diet: big buttons, camera-first, one line per step; the pro's agent also speaks in a short thread.
- **Honesty**: messages are written by code templates from real state (the model may only rephrase, never add facts —
  pros.js say() filter); demo labels stay but as small chips.

### API contract (backend)
- `GET /api/assistant/thread?after=<seq>` → `{ messages: [Msg], seq, waitingOn: [ {job, ask} ] }`
- `Msg = { id, seq, at, from: "agent"|"you"|"system", text, job?: {id, number, title}, card?: {kind, data}, actions?: [Action], replyTo? }`
- `card.kind` ∈ work_order, offers, hold, change_order, visit, evidence, checks, paid, refund, fix, dispute, reschedule,
  maintenance, group, landlord, receipt, mandate, job_summary. `data` is the view-model the card draws (amounts in cents,
  ids, photo urls, verdict per condition with `judge: model|code|person`).
- `Action = { id, label, style: "primary"|"secondary"|"danger", needsPin: bool, done?: bool }` (labels ≤ 3 words).
- `POST /api/assistant/message {text}` → `{ messages: [Msg] }`: intent from the text (done-chat JSON intent with a rules
  fallback: post job, ask status, approve/decline, counter at $X, reschedule, cancel, "what's happening"), acted on with
  the existing tool functions as the person's built-in agent within their limits; unclear → one short question back.
- `POST /api/assistant/act {action}` → `{ messages: [Msg] }`; needsPin actions return 403 step_up unless stepped up.
- Proactive messages are generated from job events/inbox items (one hook, idempotent per event), plus timed follow-ups
  on the demo clock. The judge tour runs through the thread too (each tour step appears as agent messages + cards).
