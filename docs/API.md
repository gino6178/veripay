# VeriPay API

Server: `api/src/server.js`, port **8810** (`npm --prefix api start`). JSON in and out. Same-origin cookies:
`done_session` (customer or pro), `done_staff` (back office). Agents use bearer tokens (below).

**Money.** Inside the server everything is integer cents. Every amount in a response is a money object
`{ "cents": 18500, "usd": "$185.00" }` (`usd` has thousands separators: `"$1,500.00"`) (or `null`). Amounts you **send** (budget, counter, change order, settlement,
limits) are **US dollars** as numbers (`"amount": 165`).

**Errors.** `{ "error": "<code>", "message": "..." , ...extra }` with HTTP status: `not_found` 404; `forbidden`,
`scope`, `limit` 403; `state`, `pending`, `one_counter`, `offer`, `payee`, `no_saved_payment`, `test_card` 409;
`paypal` 502; anything else 400. `limit` errors add `limit` (which one), `limitUsd`, `wouldBe`.

**Where a result came from.** Every model-touched field is labelled: `scope.source` (`"rules"` or the model, kept
when the person posts back a previewed scope or edits it; `scope.editedBy: "person" | null` says they touched it), each `thread[].source` (`"model"`, `"rules"`, `"customer's agent"`, `"pro's own agent"`),
`checks[].checker` (the checker's `source`) and `checks[].decidedBy` (always code). Money moves only by code rules.

---

## The job object (`GET /api/jobs/:id`, and what most job actions return)

```jsonc
{
  "id": "job_ab12cd34ef", "number": "DP-1001",
  "status": "draft|scoped|offered|agreed|held|working|submitted|checking|needs_fix|review|passed|released|disputed|resolved|cancelled|expired" /* scoped → agreed directly only for a repeat visit */,
  "text": "Kitchen faucet keeps dripping…", "created": "ISO", "updated": "ISO",
  "address": { "line": "1400 S Congress Ave (demo)", "city": "Austin", "state": "TX", "zip": "78704", "lat": 30.243, "lng": -97.765, "precise": false },
  "budget": Money, "bufferPct": 20,
  "scope": { "title": "Fix the leaking faucet", "trade": "plumbing|cleaning|handyman", "items": ["…"],
    "checks": [{ "id": "c1", "what": "Photo of the new cartridge installed", "evidence": "photo|receipt|note", "rule": "…" }],
    "priceCeiling": Money, "window": { "from": "ISO", "to": "ISO" }, "estimate": { "hours": 1, "parts": 3500 }, "source": "rules", "editedBy": "person|null", "ms": 3 },
  "offers": [{ "id": "ofr_…", "pro": Pro, "amount": Money /* current price */, "ask": Money /* first price */, "parts": Money,
    "arrival": "ISO", "helper": { "name": "Marco Ruiz (apprentice)", "share": 0.2 } | null,
    "breakdown": { "callout": Money, "labor": Money, "hours": 1, "parts": Money, "travel": Money, "rush": 1 },
    "miles": 2.1, "status": "open|countered|accepted|declined|expired|withdrawn",
    "counter": { "amount": Money, "at": "ISO" } | null, "answer": { "kind": "accept|counter|decline", "amount": Money, "at": "ISO" } | null,
    "created": "ISO", "expires": "ISO", "agent": "demo|external" }],
  "thread": [{ "id": "msg_…", "at": "ISO", "from": { "kind": "pro_agent|customer_agent|customer|platform", "pro": "id?", "name": "…" },
    "type": "offer|pass|counter|accept|decline|change|change_approved|change_declined|fix|check", "offer": "ofr_…?", "change": "chg_…?",
    "amount": Money?, "text": "…", "source": "model|rules|customer's agent|customer|pro's own agent|<checker source>" }],
  "agreed": { "offer": "ofr_…", "pro": Pro, "proName": "…", "price": Money, "parts": Money, "helper": {…} | null, "arrival": "ISO", "at": "ISO",
    "by": Actor, "payee": { "verified": true, "to": "e•••@done-demo.example" } } | null,
  "flow": "platform_capture_then_payouts|multiparty_payee_with_platform_fee" | null,
  "hold": { "mode": "authorize|capture", "flow": "…", "status": "starting|pending_approval|held|captured|voided|refunded|expired|failed|abandoned",
    "amount": Money /* price + buffer */, "price": Money, "buffer": Money /* left for change orders */, "payWith": "saved|card|paypal",
    "paypalOrder": "PayPal order id", "authorization": "PayPal authorization id", "capture": "capture id|null",
    "createdAt": "ISO", "honorUntil": "ISO (3 days)", "expiresAt": "ISO (29 days)", "reauthorized": false,
    "approveUrl": "url|null", "history": [{ "at": "ISO", "event": "authorized|reauthorized|re-held|…", "id": "…", "why": "…" }] } | null,
  "due": Money /* price + approved change orders */,
  "changeOrders": [{ "id": "chg_…", "amount": Money, "reason": "…", "evidence": ["ev_…"], "status": "pending|approved|declined",
    "agentMayApprove": true, "needs": "the customer or their agent", "text": "…", "source": "rules|model|pro's own agent", "at": "ISO", "decided": {…} }],
  "evidence": [{ "id": "ev_…", "kind": "photo|receipt|note", "name": "…", "checkId": "c1|null", "text": "…|null", "url": "/api/jobs/:id/evidence/:eid|null",
    "mime": "image/jpeg", "size": 1234, "sha256": "…", "exif": { "taken": "ISO|null", "lat": 30.2, "lng": -97.7, "camera": null } | null,
    "uploadedAt": "ISO", "round": 1, "forChange": false }],
  "submissions": [{ "n": 1, "at": "ISO", "evidence": ["ev_…"] }],
  "checks": [CheckRound], "lastCheck": CheckRound | null,
  "dispute": { "id": "dsp_…", "by": "customer|pro", "reason": "…", "at": "ISO",
    "summary": { "facts": {…}, "suggestion": { "release": Money, "refund": Money, "why": "…", "source": "rules" }, "text": "…|null", "textSource": "model|none" },
    "proposals": [{ "id": "prp_…", "by": "customer|pro", "release": Money, "refund": Money, "status": "open|superseded|accepted", "at": "ISO" }],
    "resolution": { "release": Money, "refund": Money, "why": "…", "at": "ISO" } | null } | null,
  "money": { "captured": Money, "refunded": Money, "paypalFee": Money, "platformNet": Money /* fee - PayPal fee */, "balanced": true,
    "split": { "release": Money, "fee": Money, "pro": Money, "helper": Money } | null,
    "payout": { "batchId": "PayPal payout batch id", "status": "PENDING|SUCCESS|…|waiting_for_paypal|failed|paid_as_payee", "says": "one line, see Payout statuses", "ok": true,
      "items": [{ "id": "DP-1001-pro", "amount": 18900, "to": "pro|helper", "status": "PENDING|SUCCESS|UNCLAIMED|…", "transactionId": "…|null", "says": "…" }] } | null,
    "ledger": [{ "n": 1, "kind": "hold|rehold|reauthorize|void|capture|buffer_released|paypal_fee|platform_fee|pro_payout|helper_payout|refund", "amount": Money, "ref": "PayPal id", "flow": "…?", "note": "…", "at": "ISO" }] },
  "paypalDispute": PayPalDispute | null, "schedule": "sch_… (a repeat visit) | null",
  "receipts": [{ "id": "rcpt_…", "event": "agreed|held|re-held|reauthorized|change approved|checked|released|disputed|resolved|cancelled", "at": "ISO" }],
  "timeline": [{ "at": "ISO", "from": "status|null", "to": "status", "by": Actor, "note": "…" }],
  "paidAt": "ISO|null",
  "next": "One line: what happens next, for whoever is looking"
}
```

`CheckRound`: `{ "round": 1, "at": "ISO", "checks": [{ "id": "c1", "what": "…", "verdict": "pass|needs_fix|fail", "reason": "…", "confidence": 0.8, "signals": ["no_gps", "reused_file", "exif_before_job", "gps_far", "receipt_mismatch", "injection", "missing", …] }], "decision": "release|needs_fix|review", "decidedBy": "rules (code), over the checker's verdicts", "checker": "rules|<model>", "ms": 12, "note": "…?", "checkerSuggested": "…?" }`

`Pro`: `{ "id", "name", "owner", "trade", "zip", "rating", "jobs", "license", "demo": true, "agent": "demo|external", "agentNote", "rules": { "callout": "$75.00", "hourly": "$95.00", … }, "helper": { "name", "share", "paypalVerified" } | null, "payout": { "verified": true, "to": "r•••@…" } }` (the pro's own view adds full `payout`, helper PayPal and `keys`).

`Actor`: `{ "kind": "person|agent|pro|pro_agent|platform|staff|paypal", "person"?, "pro"?, "client"? }`.

**Pro view** (`/api/pro/jobs/:id`): the same object; before the pro is hired, `address` is `{ city, state, zip }` only.

### Payout statuses (`money.payout.says`, `items[].says`)
- `PENDING` / `PROCESSING`: sent to PayPal, being processed. `SUCCESS`: in the receiver's PayPal.
- **`UNCLAIMED`: sent, and not a failure.** There's no PayPal account with that email yet; the receiver claims it by
  signing up to PayPal with that email (within 30 days, after which PayPal returns it). Every demo pro is paid to a
  stand-in address (`…@done-demo.example`), so in the sandbox (and in the stand-in, which copies it) demo payouts end
  UNCLAIMED. Show it as "Sent: claim by signing up to PayPal with <email>". `ok` is true.
- `RETURNED` (unclaimed for 30 days), `ONHOLD`, `BLOCKED`, `FAILED`, `DENIED`: not paid; `ok` false.
- `waiting_for_paypal`: the pro hasn't verified a PayPal; sent when they do. `paid_as_payee`: the multiparty flow (no Payouts).
- Reconciliation rows say `sent_unclaimed` for these (matched in amount) with a `says` line.

`PayPalDispute` (a paid job escalated to PayPal): `{ status: "requested|open|answered|closed", reason, capture, amount: Money, at, paypal: { id, status, reason, amount } | null, evidence: { at, notes, receipt, paypal } | null, history: [{ at, event }], sandboxNote? }`.

### Money rules (what the numbers mean)
- hold = price + `bufferPct` of the price. A change order that doesn't fit what's left places a new hold first (the old one voided).
- due = price + approved change orders. On release the platform captures `due` with `final_capture` (the rest of the hold is released, never captured).
- capture = pro + helper + platform fee + refund, to the cent. Fee = 10% of what's released; helper = their share of the rest.
- PayPal's processing fee is the platform's cost (`money.paypalFee`, `platformNet`), never the pro's.
- Disputes: release R of `due`; the platform captures `due` and refunds `due - R` with PayPal Refunds, so the customer sees the refund in PayPal. R = 0 voids the hold.
- **Which money flow ran** is on every hold and every capture/fee/payout ledger line (`flow`):
  `platform_capture_then_payouts` (default: the platform captures, then one Payouts batch pays pro + helper; the platform
  briefly holds the pros' money) or `multiparty_payee_with_platform_fee` (behind `DONE_MULTIPARTY=1`: the pro is the
  order's payee and our fee is `payment_instruction.platform_fees`). In our sandbox the multiparty path is refused with
  `422 UNPROCESSABLE_ENTITY UNSUPPORTED_PAYMENT_INSTRUCTION` (the app isn't a PayPal Commerce Platform partner and the
  pro isn't onboarded; `docs/live-test/sandbox/multiparty-1.json`), so the server records that in `hold.history` and
  falls back to the platform flow. A helper's share in the multiparty flow would be the pro's to pay.

---

## Milestones, retainage, review windows, inspectors (multi-day jobs)

Every agreed job has **milestones** (`job.milestones`). An ordinary job has one (`m1`, the whole scope). A multi-day job
has 2–8, each with its own done-conditions, amount and required documents; the job's `status` follows the milestone
being worked on and returns to `working` between milestones.

- **Money:** one PayPal authorization for the whole job (price + buffer). Each milestone's release is a **partial
  capture** (`final_capture=false`); the last one is final (the unused buffer is released). One Payouts batch per
  milestone. Sandbox-verified (2026-11-05): two partial captures, a refund of one partial capture, a void of the rest
  of a partly captured hold, then a final capture (`docs/live-test/sandbox/milestones-1.json`).
- **Holds over time:** past the 3-day honor period a hold with nothing captured is reauthorized once; a partly captured
  one can't be, so a **new hold for what's left** (remaining milestones + buffer) is placed on the saved method and the
  rest of the old one is voided. Past 29 days the same; if that fails the job expires.
- **Where milestones come from:** the scope (`scope.milestones`: `[{ id, title, share, checkIds, inspect }]`), from
  the rules' multi-day templates (water heater replacement, bathroom remodel; `scope.note` says so when the model's
  scope had none), or the customer (`POST /api/jobs` `scope.milestones`, or `PATCH /api/jobs/:id/scope` `milestones`).
  Required documents become checks with `doc: "permit"|"lien_waiver"|"inspection"|"invoice"|"license"` and ids like
  `m1d1`; they're checked by `docs.js validateDocument` (permit, lien waiver, invoice) or the rules.

`Milestone`: `{ id, title, status: "open|submitted|checking|needs_fix|review|passed|disputed|released|resolved", share,
amount: Money, due: Money (+ its approved change orders), checkIds, inspect, current, passed: { at, waiting: "inspector"|
"review_window", until? } | null, inspection: { verdict, note, name, at } | null, earlyPay: { amount, fee, batchId, at } |
null, release: { release, due, fee, feeRate, pro, helper, retained, refunded, capture, at, outcome, why } | null,
payout: Payout | null, captures: [captureId], lastCheck: CheckRound | null }`.

**Job options** (`job.options`; set in `POST /api/jobs` `options` or `PATCH /api/jobs/:id/scope` `options`, before
offers): `{ releaseMode: "instant"|"review" (default instant), reviewHours: 1–168 (48), retainPct: 0–20 (0),
warrantyDays: 1–90 (14), inspector: personId|null (from GET /api/inspectors), requireBefore: bool (false) }`.

- **Review window:** with `releaseMode: "review"` a milestone whose checks all pass goes to `passed` with
  `passed.until`; it's released automatically then unless the customer disputes, or now if they release it. During the
  window the pro may take **early pay** (2% fee, min $1, paid by the platform with Payouts; the capture at release
  repays it; `money.earlyPayFees`).
- **Warranty (every paid job):** a warranty window (`warrantyDays`, 14 by default) opens when the last milestone is
  paid, with or without retainage. A defect claim is checked (check/defect.js; its attestation is signed into a
  receipt), the pro's fix is checked like any condition, and staff decide: `pay` (nothing back), `refund`/`partial`
  with `refund` (USD). A refund uses the retainage first, then the captures; beyond the retainage the pro was already
  paid, so the platform covers it (`platform_loss` in the ledger). `warranty.status`: open, claimed, fixed (no
  retainage, the fix passed), released, refunded, closed (the window ended), waiting_for_paypal, payout_failed.
- **Retainage:** `retainPct` of the pro's share of each milestone is held (`retainage_held`), paid with Payouts when the
  warranty window ends (`job.warranty: { until, status: "open|claimed|released|refunded|waiting_for_paypal|payout_failed",
  retained, open, claim, paid }`). The customer may **claim a defect** in the window (photos); the defect checker
  (`check/defect.js`) gives its view (`warranty.claim.check`), the pro fixes it and the fix is checked like any condition
  (the customer's photos are the "before"); a passing fix pays the retainage; staff can refund it instead (a PayPal
  refund on the capture).
- **Inspector:** milestones with `inspect: true` wait in `passed` (`waiting: "inspector"`) until the named inspector
  confirms; a rejection sends them to review.
- **Before photos:** the pro sends before photos of each spot (`checkId`) when starting (`requireBefore` makes them
  mandatory); the checker compares after with before (`stage: "before"`), and with the customer's reference photos of
  the problem (`POST /api/jobs/:id/photos`). Each photo condition carries a checklist (`scope.checks[].shots`:
  `{ min, max, labels, closeUps, context }`, and `scope.photoChecklist` from the scope writer when it gives one).
- **Expert queue:** a milestone that goes to review is queued for staff with an SLA of 4 business hours (Mon–Fri
  9–17 Austin); staff may release it, ask for a fix, or leave it to the customer. `job.queue` shows the open item.
- **Signed verdicts:** each check round has `verdictHash` (sha256 of `{ checker, model, promptHash, checkerHash
  (the checker's own attestation), evidence: [{ id, sha256 }], checks, decision }`) and `receipt` (a signed receipt
  whose `body.data.signed` is that JSON and `body.data.verdictHash` the hash).
- **Disputes, refunds** are scoped to one milestone (`dispute.milestone`): a settlement refunds from that milestone's
  capture only; the job goes on with the next milestone.
- **Fees:** every release lists its fee (`money.releases[]`: `{ milestone, title, release, fee, feeRate: 0.1, pro,
  helper, retained, refunded, capture, payout, at, says }`; the thread gets a "released: … fee $x (10%)" line).
- **Ledger balance** (`money.balanced`): captured = pro_payout + helper_payout + platform_fee + early_pay_fee + refund +
  retainage_held − advance_unrecovered − platform_loss. `retainage_paid` / `retainage_refunded` move held retainage out.

Job additions: `options`, `milestones: [Milestone]`, `currentMilestone`, `remaining: Money`, `hold.capturedOnThis`,
`warranty`, `queue`, `scopeReview: { gaps: [{ severity: "high|medium|low", kind?, checkId?, what, suggestion }], ok,
evidencePlan?, disputeRisk?, revisedScope?, changes?, source, at }` (run when the customer accepts an offer: `gap.js
reviewScope` or the rules), `rating`, `money: { …, retained, earlyPayFees, payouts: [Payout], releases }`. Evidence
items add `phase: "after"|"before"|"reference"|"defect"|"inspection"`, `label`, `milestone`. Check rows add `label`
(APPROVED / REJECTED / NEEDS_MORE_EVIDENCE / NEEDS_REVIEW), `by`, `vlm`, `plate`, `progress`, `needsPerson` when the
checker gives them; rounds add `milestone`, `kind: "milestone"|"defect"`, `evidence` (the ids it judged), `verdictHash`, `receipt` (its
`body.data.attestation` is the checker's own check/attest.js record, verifiable with `verifyRecord`), `checkerLabel`,
`attestation`. Document checks add `readBy` (what read the file: OCR, typed text, none). Every payout object, in
every view (job, milestone, staff list, pro earnings, invoices), has `says` and each item has `status` and `says`.

| Who | Method | Path | Body | Returns |
|---|---|---|---|---|
| customer | POST | `/api/jobs/:id/release` \| `/request-fix` \| `/dispute` | add `{ milestone? }` (default: the one waiting) | Job |
| customer | POST | `/api/jobs/:id/photos` | `{ items: [{ dataUrl, label? }] }` | Job: reference photos of the problem (before work) |
| customer | POST | `/api/jobs/:id/defect` | `{ reason, items?: [{ dataUrl }] }` | Job (`warranty.status: "claimed"`) |
| customer | POST | `/api/jobs/:id/rate` | `{ stars: 1–5, text?, sharePhotos? }` | Job: only once paid; the person only (not an agent) |
| anyone | GET | `/api/inspectors` | | `[{ id, name, demo, note }]` |
| pro | POST | `/api/pro/jobs/:id/start` | `{ before?: [{ dataUrl, checkId, label? }] }` | Job, or `409 before` with `missing` when `requireBefore` |
| pro | POST | `/api/pro/jobs/:id/before` | JSON `{ items: [{ dataUrl, checkId, label? }] }` or multipart (`checkId_i`, `label_i`) | Job |
| pro | POST | `/api/pro/jobs/:id/evidence` | as before, plus `milestone`, per-item `label`, `phase` | Job |
| pro | POST | `/api/pro/jobs/:id/submit` | `{ milestone? }` | Job after that milestone's check |
| pro | POST | `/api/pro/jobs/:id/scope-reply` | `{ text }` | Job + `reply: { id, pro, text, review: { gaps, changes, revisedScope, source } }`: the pro's words on the scope before agreeing, reviewed (gap.js with `proReply`); also the A2A action `scope_reply` |
| pro | POST | `/api/pro/jobs/:id/early-pay` | `{ milestone? }` | Job (`milestones[].earlyPay`) |
| pro | POST | `/api/pro/jobs/:id/defect-fix` | `{ items: [{ dataUrl }] }` or multipart | Job (`warranty.status` released if the fix passes) |
| pro | PUT | `/api/pro/verification` | `{ license?: { number: "M-41877" }, insurance?: { carrier, policy, limit (cents), expires }, insuranceDoc?: dataUrl }` | Pro self view |
| inspector | POST | `/api/auth/demo` | `{ "as": "inspector" }` | signs in as "Capitol Home Inspections (demo)" |
| inspector | GET | `/api/inspector/jobs`, `/api/inspector/jobs/:id` | | jobs naming them; Job |
| inspector | POST | `/api/inspector/jobs/:id/inspect` | `{ milestone, verdict: "pass"|"fail", note?, items? }` | Job |
| staff | GET | `/api/staff/queue` | | `{ slaHours: 4, businessHours, items: [{ id, job, number, title, milestone, milestoneTitle, pro, due, why, checks, at, slaDue, overdue, minutesLeft }] }` |
| staff | POST | `/api/staff/queue/:job/:qid` | `{ decision: "confirm" (alias "release")|"needs_fix"|"customer", note? }` | Job. "confirm" is a pass: the job's inspector and review window then apply |
| staff | GET | `/api/staff/jobs/:id/arbiter` | | one page: both sides, dispute(s), milestones, check rounds with verdict hashes, before/after `pairs`, change orders, thread, money, warranty, receipts, timeline |
| staff | GET | `/api/staff/jobs/:id/evidence-pack` | | a downloadable JSON pack: scope, every evidence item (sha256, EXIF, URL), every verdict with its signed receipt, ledger, receipts, how to verify |
| staff | POST | `/api/staff/jobs/:id/defect` | `{ outcome: "pay"|"refund"|"partial", refund? (USD), note? }` | Job |
| staff | POST | `/api/staff/pros/:id/review` | `{ ok, note? }` | Pro (adds the "Reviewed by staff" badge) |
| staff | GET | `/api/staff/pros/:id/insurance-doc` | | the uploaded certificate |
| public | GET | `/api/pros/:id/profile` | | `{ pro, paidJobs, paidTotal, rating (the mean, one decimal), ratingText ("4.5"), ratings, reviews: [{ job, title, stars, text, at, paid }], photos: [{ job, title, what, url, verified, at }], rule }` (ratings and photos only from paid jobs; photos only from the round each milestone was accepted on, never a rejected round, a before photo or a defect fix; `verified` says what decided: "every check passed (checker)", "released by the customer after reviewing it", "confirmed by a VeriPay expert reviewer", "confirmed by the inspector") |
| public | GET | `/api/pros/:id/photos/:eid` | | a profile photo |

**Verified pros** (`Pro.verified`: `[{ id: "paypal"|"license"|"insurance"|"reviewed", label, ok }]`, `Pro.verification`):
a verified PayPal; for plumbers a TSBPE-format licence (`M-#####`, `J-#####`, `T-#####`, `RMP-#####`) looked up in a
**demo registry** (fictional records, labelled; TSBPE's real database isn't queried); handyman and cleaning need no state
licence in Texas (said as such); insurance: carrier, policy, ≥ $300,000 general liability, not expired, with the
certificate file.

Agent tools add: customer `claim_defect {job, reason, items?}` and `confirm_checks {job, milestone?}` (pay scope; confirm needs `agentMayRelease`); `release`, `request_fix`, `open_dispute`
take `milestone`. Pro A2A adds `scope_reply {job, text}`, `add_before {job, items}`, `early_pay {job, milestone?}`, `fix_defect {job, items}`;
`start_work` takes `before`, `submit_evidence` takes `milestone`.

## Pros onboarding, demo pros at work, and other rules (agent test round 1)

- **Onboarding a real pro.** `POST /api/staff/pros` returns `{ pro, key: "dpk_…", onboarding: { link: "/pro/onboard?code=…",
  api, expires, oneUse }, readiness }`. The web page `/pro/onboard?code=…` calls `POST /api/pro/onboard { code }`: it
  signs the pro's person in (cookie) and returns `{ person, pro, readiness, next }` (410 if used or expired;
  `GET /api/pro/onboard?code=` does the same and redirects to `/pro`). Staff can mint a new link:
  `POST /api/staff/pros/:id/onboarding`. The pro's agent gets one too from `readiness`.
- **Readiness** (`GET /api/pro/readiness`, A2A `readiness` / `my_profile`): `{ hireable, blockers: [{ id: "paypal"|
  "helper_paypal", say, where: "website" }], recommended: [{ id: "license"|"insurance"|"signin", say, where }], badges,
  onboarding? }`. Only a verified PayPal blocks hiring. An offer from a pro who isn't hireable yet is accepted but
  flagged: the pro's answer carries `warning` and `readiness`; the customer's offer shows `hireable: false` and
  `blocked: [say]`; accepting it is refused (`409 payee`).
- **Tokens match the role:** `POST /api/tokens` is for customers (403 `role` for pros: they use `POST /api/pro/keys`);
  a token whose person isn't a customer doesn't authenticate.
- **Pros see only their own offers** (and their own side of the thread and scope replies) in every pro view, REST and
  A2A; customers and staff see all.
- **Posting over the per-job limit:** an agent's `post_job` with a budget over `perJobMax` is refused (`403 limit`,
  `limitUsd`, and how the person raises it); a person posting on the website gets `job.warnings`.
- **Demo pros take a realistic while** to offer: `DEMO_PRO_DELAY_MS` (default 60 s real), each a little later than the
  last, so a real pro's agent can compete; `job.demoOffers: [{ pro, at, done }]` says when. The judges' tour and the
  demo's built-in auto-hire get them at once. Nothing declines a real pro's offer except the customer accepting another.
- **Demo pros do hired jobs:** after the hold, a demo pro's agent starts (with before photos), then sends fresh
  synthetic after photos with correct EXIF, the receipt (dated today) and documents, and submits each milestone, every
  `DEMO_PRO_WORK_MS` (default 90 s real; a negative value turns it off). It picks up after a restart. On the job page,
  **"Have the demo pro finish now"**: `POST /api/jobs/:id/demo-finish` (demo only, a demo pro's job) → Job +
  `demo: { steps, note }`. Tour jobs (`tour: true`) are driven by the tour instead.
- **Back office:** `/api/staff/*` accepts only the staff cookie from `POST /api/auth/staff` (labelled `"Demo staff"`;
  `POST /api/auth/staff/signout`); a customer or pro session gets 401. For the tour, `GET /api/demo/office` is a
  read-only, anonymized back office: `{ demo, readOnly, jobs, byStatus, held, captured, fees, paidToPros, refunded,
  rows: [{ number, status, title, trade, zip, pro, due, captured, balanced, checker, created }], queue }` (no names).
- **The shared demo clock:** `POST /api/demo/advance` needs a person signed in on the website or demo staff (an
  `Authorization` header is refused: no agent tokens). `/api/info.clock: { skippedDays, lastAdvance: { at, days, by },
  note }` lets the web show "the demo clock was moved by …".
- **Offers always have a breakdown object:** `{ callout, labor, hours, parts, travel, rush, total, given }`; from a
  real pro's agent `given: false` (only `total`).
- **Checks carry `ruleText`:** the rule in words ("at least 1 photo, taken during the job, at the job's address, not
  used on another job").
- **The hold explained:** `hold.explain` ("$222.00 authorized (held, not charged): the price $185.00; $37.00 is buffer
  (20% of the price, …); only what's due is captured; the rest is released."), `hold.note` (e.g. "No saved payment
  method yet, so the sandbox test card was used instead."), `hold.bufferCapped`.
- **The hold stays within the budget:** buffer = min(`bufferPct` of the price, price ceiling − price). If the agreed
  price is the ceiling, there is no buffer and a change order asks for a new hold.
- **Holds that didn't happen:** `payWith: "saved"` with nothing saved falls back to an approval (the test card on the
  demo server, else a PayPal approval link) and says so; a failed hold leaves the job `agreed`:
  `POST /api/jobs/:id/hold/retry { payWith? }` (agent tool `retry_hold`) places it again.
- **Receipts only when there are parts:** with no parts in the price and no approved change orders, a receipt
  condition passes by itself ("no receipt is needed"). (The AI side keeps photo counts proportional to the job.)
- **Who acts next:** every job view has `waitingOn: { who: "customer"|"pro"|"platform"|"inspector"|"customer and pro"|
  "nobody", what, also? }`; `wait_for_news` returns `jobs: [{ job, number, status, waitingOn, next }]` with the events.
- **llms.txt** lists every tool with its arguments; `post_job` accepts `description` as another name for `text`.

## Agent test round 2 changes

**Customer agents**
- `post_job` takes `options` (`releaseMode`, `reviewHours`, `retainPct`, `warrantyDays`, `inspector`, `requireBefore`)
  and `milestones` (an array as in the scope, or `"none"`), on MCP, REST and A2A. New tools: `set_options {job, options}`
  (until an offer is accepted; milestones only before offers are asked for), `review_scope {job | scope, proReply?}`,
  `job_evidence {job, include?: "data"}` (every item with `exifSummary`, its URL, small images inline), `retry_hold`,
  `confirm_checks`. Website: `PATCH /api/jobs/:id/options` (same body as `options`).
- When options change after offers are in, the thread gets a `terms` message, open offers get `termsChanged`, pros are
  told, and a pro may send a new offer, which replaces (`superseded`) their open one.
- **askPerson shape (final):** `{ url: "/link?code=…" (the website page: it shows what was asked; approving there is the person's own click), api: "/api/auth/link?code=…" (plain redirect), what, to, limit, current, wouldBe, job: { id, number } | null, expires, oneUse, tell }`. `POST /api/auth/link { code }` returns `{ person, to, what, limit, current, wouldBe, job }` so the page can offer e.g. "Approve: set your per-job limit to $2,400".
- Offers in the customer's view carry `termsChanged: { at, changed } | null`. `next` and `waitingOn` say "Paid" only when `payoutState.state` is `paid`; before that, e.g. "Captured; the payout is sent and PayPal is processing it" (`waitingOn.who: "paypal"`).
- Demo pros stamp photo times to satisfy timed conditions (`after:<id>>=Nm`: the referenced photo is stamped earlier, never later than now) and don't work before the job's window opens: `demo-finish` then answers `waiting` with the window start (move the demo clock to see it). The tour's change order is $47.05, the receipt's total.
- **askPerson:** an error for a step only the person can take (`limit`: perJobMax, monthlyMax, changeMax, agentMayRelease,
  agentMayCancel, priceCeiling) carries `askPerson: { url: "/api/auth/link?code=…", what, to, expires, oneUse, tell }`.
  The person opens it: `GET /api/auth/link?code=` signs them in and redirects to `to` (`/connect#limits` or
  `/jobs/:id`); `POST /api/auth/link { code }` → `{ person, to, what }` for a web page. One use, 24 h. Nothing changes
  until the person changes it. In review without `agentMayRelease`, `job_status` carries `askPerson` (to the job page)
  and `next` tells the agent its person decides.
- The customer's agent can fetch its own job's evidence files with its token (read scope):
  `GET /api/jobs/:id/evidence/:eid` with `Authorization: Bearer done_…`.
- `accept_offer` returns `paidWith` ("saved PayPal", "saved card", "sandbox test card", "PayPal approval") and `note`
  when it fell back; every hold has `hold.paidWith`.
- Resuming a demo customer accepts `personId` as well as `person`.

**Checks**
- **Timed conditions** are checked by code from the cameras' times: a rule token `after:<checkId>>=<minutes>m` (or words
  like "at least 10 minutes after the repair photo") compares the newest photo of each condition. Too soon → `needs_fix`
  (`time_gap_short`); a missing camera time → `needs_fix` (`time_gap_unknown`). `ruleText` says it in words.
- **One source of truth per round:** `round.decidedFrom: { checker: rules|model|vlm|model+vlm, model: <name>|"none", vlm:
  "model"|"none", documents: "docs.js"|"rules"|null, label }`. `/api/models/status.lastCheck` is what the last check in
  the server actually used; a model or VLM is named only when its verdict came back.
- **Parts at what they cost:** change orders have `kind: "parts"|"labor"|"both"` (default parts). At release, approved
  parts change orders are paid at the matched receipt total when it's less (the checker's `parts.matchedTotal`, else
  the receipt's total read by code), never more: `release.partsAdjusted: { amount, receipt, approved, source }` and a
  `parts_adjusted` ledger line. The checker's `parts.padding: true` sends the receipt condition back (`parts_padding`).
- Evidence may name several conditions: `checkIds: [...]` (JSON) or `checkIds_i` "c1,c2" (multipart); shown as
  `evidence[].checkIds`.
- **The pro can resend while a milestone is in review** (a new round; the expert queue item closes), and make change
  orders then. Pro views carry `toFix: [{ checkId, what, verdict, reason, milestone }]`.

**Money shown**
- `payoutState: { state: "not_sent"|"sent"|"sent_unclaimed"|"paid"|"failed"|"waiting_for_paypal", says, batches }` on
  every job: "paid" only when PayPal says SUCCESS for every item; a pending batch is "sent".
- `tour.hold` (in the tour's answer) is `hold.explain`; use it, not a computed "price + 20%".

**Pros**
- **Feed:** `list_jobs {since?, radius?}` / `GET /api/pro/feed?since=&radius=` / `GET /api/pro/jobs`: every open job
  in the trade within the service radius (default the pro's `radius`, 25 miles), newest first, each with `miles`;
  `since` returns only jobs posted after it. (Round 2's missing job: Maria's agent accepted a demo offer about 110 seconds
  after posting, so the job had left the open list before Luis polled.)
- **`wait_for_news {after?, seconds?, since?}`** for pros: new jobs in the feed, counters, hires, change answers, fixes
  asked, check results, payouts; returns `events`, `last`, and the newest feed.
- **Rates:** `set_rates` / `PUT /api/pro/rates` `{ callout, hourly, perMile (USD), freeMiles, radius (miles), lead
  (hours), rush, floor, crew, partsPolicy: "at_cost"|"markup_10"|"included" }`.
- **`withdraw_offer {offer}`** / `POST /api/pro/offers/:offer/withdraw`.
- **Unknown fields** on `PUT /api/pro/paypal`, `/api/pro/verification`, `/api/pro/rates` → `400 fields` with the allowed
  list. **Insurance `limit` is US dollars** (like every amount sent).
- **Onboarding links survive previews:** `GET /api/pro/onboard?code=` shows a page with a button and doesn't use the code;
  only the POST (the button, or the web page's `POST /api/pro/onboard`) does. Several links can be valid at once (staff's
  and the agent's), each used once.

**Demo**
- The demo inspector always exists (startup and seed).
- Demo pros' evidence fits the job: drain, cleaning and handyman scenes (new synthetic images in `demo-assets/`), no parts
  receipt when there are no parts, notes per trade, the licence number when a condition asks for it, photos spaced 12
  minutes apart.
- Seeded customers (`via: "seed"`) have a demo customer agent: a few minutes after the first offer
  (`DEMO_CUSTOMER_DELAY_MS`, default 3 min) it accepts the cheapest hireable offer within the ceiling, whoever made it
  (labelled "Demo customer agent (seeded customer)"). Visitors' jobs are never touched. Offers expire after 2 days.

## Paperwork from the records (PLAN §14)

Code writes these documents from the job's records (`api/src/reports.js`). No model writes them, and each says so (`label`). The money figures come from the ledger, so they agree with the payments.

- **Progress report.** Made at each milestone's release: what was done, the before photos, each condition with its result, reason and after photos, the money so far (captured, paid to the pro including materials advances, helper, supplier, fee, retained, refunded) and the next step.
  - The job's `reports` list records it, and the customer gets a `report_ready` activity event.
  - `GET /api/jobs/:id/reports/progress/m1.html` (or `.json`).
- **Close-out package.**
  - Contents: scope and evidence per condition; parts and materials (approved, advanced, returned, the invoice as read, and parts paid at the receipt); permit and inspection; warranty dates and retainage; the money; the signed receipts.
  - **Texas lien waivers:** the four statutory forms of Tex. Prop. Code §53.284, prefilled from the recorded payments.
    - A conditional and an unconditional progress waiver for each milestone before the last, with the amount of that milestone's release.
    - A conditional and an unconditional final waiver for the total released (materials advances included).
  - The wording follows the statute's form. Check it before real use (demo).
  - `GET /api/jobs/:id/reports/closeout.html | .pdf | .json`. The pro gets the same at `/api/pro/jobs/:id/closeout.*`. The PDF is written in plain JS: Letter size, Helvetica, text only, one page per waiver; the HTML has the photos.
- **Daily log.** For each day of the job (Austin time): on site from/to, photos, change orders, checks and payments. `GET /api/jobs/:id/reports/daily.html | .json`. Weather is `null` (not wired).
- **The pro's books.** Rows from the ledger of every job the pro was hired for: income (paid to the pro), materials advances, platform and early-pay fees, the helper's share, and anything owed.
  - `GET /api/pro/books.csv?month=YYYY-MM | year=YYYY[&format=qbo]`.
  - `format=qbo` gives the QuickBooks Online bank-upload CSV: `Date,Description,Amount`, dates MM/DD/YYYY.
  - The default detailed CSV has `Date,Job,Type,Account,Description,Amount,PayPal ref`.
  - `GET /api/pro/books/summary?year=` gives the year summary: gross receipts, income, fees, helpers, materials reimbursed, by month, with a 1099-K / 1099-NEC note. It is not tax advice.
- **Tools.**
  - Customer agent: `get_report {job, kind: closeout | progress | daily, milestone?}`, with the `read` scope. It returns the data and the website links.
  - Pro agent (A2A): `export_books {month?, year?, format?: "qbo"}`. It returns the CSV text and the totals, plus the year summary when `year` is given.

## Materials advance (PLAN §13)

A pro who has to buy extra materials mid-job is paid for them now, out of the held money.

1. **The change order.** The pro asks for a change order with `kind: "materials"` (`POST /api/pro/jobs/:id/changes {amount, reason, kind}`, A2A `request_change`). The customer approves it as usual.
2. **The request.** The pro sends the supplier's invoice or receipt (`kind: "receipt"`) and a photo of the materials on site: `POST /api/pro/jobs/:id/changes/:cid/advance {items, supplierEmail?}`, A2A `request_materials_advance {job, change, items, supplierEmail?}`.
3. **The check.** `check/materials.js` (`checkMaterialsAdvance`) reads the store, items, total and date. It checks that the items fit the job, that the total is no more than the approved change order, that the photo was taken on site and inside the job's window, and that the invoice hasn't been used on another job. Code decides; an unsure result goes to a person. `changeOrders[].advance.check` keeps the verdict, the reasons and the invoice as read.
4. **Paid now, or the customer decides.** The advance is paid at once when the checks pass, no person is needed, no supplier was named, and it's within the customer's `materialsAdvanceMax` (default $150).
   - Otherwise its `status` is `awaiting_customer`, and `needs` says who decides.
   - The customer approves with `POST /api/jobs/:id/changes/:cid/advance/approve` (PIN step-up) or declines with `.../decline {note}`.
   - Their agent can use `approve_materials_advance` / `decline_materials_advance`, within `materialsAdvanceMax` and never for a supplier; otherwise the answer is `limit` with `askPerson`.
5. **The payment.** A partial capture of the authorization (`final_capture=false`, `capture` in the ledger), then a Payouts item `DP-xxxx-materials-...` to the pro (or to the supplier, with the person's approval), recorded as `materials_payout`.
   - `advance.status` moves `checked` → `paid`; it can also be `needs_fix`, `rejected`, `declined` or `failed`.
6. **At the milestone's release.**
   - The capture is less by what was advanced, and the pro's share is paid less the advance.
   - Materials returned unused (`POST /api/pro/jobs/:id/changes/:cid/return {amount, note}`, A2A `return_materials`) come off the release. So does any part of the approved amount the invoice didn't use. Both are recorded as `materials_returned`.
   - If the rest can't cover them, the customer is refunded from the advance capture. A shortfall on the pro's side is recorded as `materials_unrecovered`.
   - `release.materials` shows `{advanced, returned}`.
7. **The ledger** still adds up to the cent: `balance()` counts `materials_payout`, and `balance().materials` is the total.

The demo pro on a water heater asks for $87.03 of materials (a second expansion tank and a pressure-reducing valve) and then the advance. Seeded customers answer both. The sandbox run is `scripts/sandbox-materials-e2e.mjs`.

## Round 6 changes

Agent permissions
- **Releasing.** An agent releases money only with `agentMayRelease`. That now includes a milestone that passed and sits in its review window: releasing it early would end the person's window.
- **Settlements.** Proposing or accepting a dispute settlement also needs `agentMayRelease`.
- **Scope changes.** An agent may apply a review suggestion only when it makes the scope stricter or clearer (`looserFor` lists what would loosen it). Otherwise the answer is `limit: "scopeChange"` with `askPerson`, and nothing changes. `suggestion: "all"` is the person's.
- **Document conditions.** A suggestion never rewrites a document condition (permit, inspection, lien waiver): its wording is added as a new condition beside it. Milestones keep their `docs`, so re-cleaning a scope never loses the permit or inspection conditions. Older milestones without `docs` are rebuilt from their `m1d1`-style conditions.
- **`set_options`.** It refuses unknown keys inside `options` (400, listing the allowed ones). `agentMayRelease`, `priceCeiling`, `budget` and `bufferPct` answer `limit` with `askPerson`.

Pro agents
- **`early_pay`** checks that the job is the pro's own before answering `person_only`.
- **`ask_for_review {job, checkId, note}`** puts the condition in the expert queue with the pro's note.
- **`submit_evidence`** returns `warnings` when a photo that a timed condition refers to is resent without the dependent one. `dryRun: true` lists the warnings without storing anything.
- **News:** a pro whose offer a scope change withdrew gets a `terms_changed` event.

Checks
- **Timed conditions.** When the photo a timed condition refers to is retaken, the dependent condition says "Retake after <time>". Durations are never negative.
- **Reasons** name evidence as "photo 2" or "the before photo", never by raw id.
- **Parts at cost.** The parts in the agreed price (offer `parts`, `partsPolicy` at_cost or markup_10) are paid at the receipt's total when there are no parts change orders on that milestone (`release.partsAdjusted`).
- **Per-condition confirm.** `POST /api/jobs/:id/confirm {checkIds, fix?}` confirms some conditions. The answer lists every condition: `confirmed`, `toFix` (failed and unticked) and `waiting` (unticked, left to a person). Waiting ones stay waiting; when nothing needs a fix but some are still waiting, the milestone stays in review. If others still need a fix, `fix` (the reason) asks for one. Confirmed conditions carry into the next round as passed unless the pro sends new evidence for them. With nothing left to fix, it's a full confirm.
- **Counts.** `lastCheck.counts` gives `{total, passed, notPassed, round}` for those exact rows.

The tour, the clock and sessions
- **The judges' tour.** Its steps are idempotent: a step already done answers with the job. "Finish now" works on a tour job. Its checks give the models at most `DONE_TOUR_MODEL_MS` (12 s), then the labelled rules and a person decide.
- **Activity events** are stamped with the platform clock. `realAt` is added when it differs from real time by more than a minute.
- **`GET /api/me`** returns `steppedUpUntil` (ISO, or null).
- **Onboarding audit.** A redeemed onboarding code keeps `usedBy {route, ip, ua}`. A code presented after use keeps `lateAttempts`.

## Consent: the person's PIN and step-up (after Judge C)

An agent can't act as its person, a pro or the inspector.

- **The PIN.** A person proves it's them with a 4-6 digit PIN. It is stored only as a scrypt hash, and no API response or token carries it, except `pinOnce` the one time the server makes one up.
- **Customers.**
  - Sign up with `POST /api/auth/demo {as: "customer", pin?}`. Without `pin`, the response has `pinOnce` for the website to show once.
  - Resume with `{as: "customer", person, pin}`.
  - Seeded customers' PIN is `DONE_SEED_PIN` (default 2468). People made before PINs existed can only be resumed with `DONE_LEGACY_PIN`, if the operator sets one.
- **Pros.**
  - `POST /api/pro/onboard {code, pin?}` sets the PIN (without one: `pinOnce`). The HTML onboarding page asks for it.
  - An onboarding link sent again needs the PIN.
  - Demo pros sign in with `{as: "pro", pro, pin}`, using `DONE_DEMO_PRO_PIN` (default 8642).
  - A pro who onboarded can't come in through the demo button.
- **The demo inspector** signs in with `{as: "inspector", pin}`, using `DONE_INSPECTOR_PIN` (default 1357).
- **The judges' tour** makes a demo customer with a fresh PIN (`tour.pinOnce`). It only acts on that customer's own jobs.
- **Step-up.** `POST /api/auth/step-up {pin}` on the person's session lasts 10 minutes. Sign-up, onboarding, a PIN sign-in and a link sign-in start a session already stepped up. Five wrong PINs lock it for 15 minutes (429). `PUT /api/auth/pin {pin}` changes the PIN; it needs a step-up.
- **What needs a step-up** (otherwise 403 `step_up`):
  - Customers: `PUT /api/limits`, `POST /api/tokens`, confirm, release, approving a change order, applying a scope revision, accepting a dispute settlement.
  - Customers, only when the money terms change: `PATCH /api/jobs/:id/scope` with `priceCeiling` or `bufferPct`, and accepting an offer with `raiseCeiling`.
  - Pros: `PUT /api/pro/paypal` (payout and helper), `PUT /api/pro/verification` (licence, insurance), `POST /api/pro/keys`, early pay.
- **askPerson and pro `signIn` links.** `GET /api/auth/link?code=` only redirects to the page `/link?code=`; it creates no session. `GET /api/auth/link/info?code=` shows what was asked. `POST /api/auth/link {code, pin}` signs the person in.
- **Pro agents** (dpk keys) never change payout routing. No pro action takes a PayPal email, a helper or a share. `early_pay` returns `person_only` with a `signIn` link for the pro.
- **Unknown arguments.** Customer tools (MCP, REST, A2A) and pro actions (A2A) refuse arguments they don't take with a 400 (or JSON-RPC -32602). The error lists the allowed arguments.
- **Results.** MCP results are a job summary by default; `view: "full"` gives the whole job. Over REST and A2A, `view: "summary"` asks for the summary.

In production the step-up is Log in with PayPal, not a PIN.

## Round 5 changes

- `GET /live-test/` serves the test history from docs/live-test, read-only:
  - It serves `index.html`, the round reports (`*.md`), `rounds.json`, `ops/*.json`, and `sandbox/*.json|html`. Anything else returns 404 (no scripts, no screenshots).
  - Link codes, sign-in codes, `done_`/`dpk_` keys and bearer tokens are redacted as the files are served.
- Where a condition came from: `scope.checks[].by` is `"writer"` (the scope writer: rules or model) or `"customer"`.
  - A scope sent back from the preview keeps the writer's conditions as the writer's. Matching is by their words.
  - Conditions the customer added or rewrote count as the customer's, whether by hand, with a suggestion, or with a revision.
  - Only the writer's receipt conditions are waived when there are no parts. A customer's receipt condition stays required.
- Offers from a pro's own agent (`offer` / `counter`, REST `POST /api/pro/jobs/:id/offer`) take `parts` and `partsPolicy`:
  - `parts` is the parts estimate in USD, inside the price.
  - `partsPolicy` is `at_cost`, `markup_10` or `included`.
  - The customer's offer view shows `parts`, `partsPolicy` and `partsSays`.
  - `agreed.partsPolicy` is kept. With parts that aren't included, the hold's buffer is at least a quarter of the parts estimate (within the ceiling), and a receipt is required.
- A licence number in a valid format that the demo registry doesn't know:
  - It shows `status: "not_verified"` until the pro sends `licenseDoc` (a data URL) to `PUT /api/pro/verification`.
  - It then shows `"pending_review"`, with `says: "not yet verified (staff review pending)"`.
  - Staff decide with `POST /api/staff/pros/:id/licence {ok, note}`, which sets `verified_by_staff` or `rejected_by_staff`.
  - A live TSBPE public lookup is out of scope for the demo.
- The demo clock: `clock` appears on the job view whenever the clock is ahead of real time, and on a pro's `my_profile` and `wait_for_news` (`aheadMinutes`, `says`, `recent` moves with who made them).
- A pro's `wait_for_news` returns only events for their hired jobs, their open offers, and new jobs in their feed. Each event has `why`.
- Checks:
  - Before photos from `start_work` / `add_before` answer a "before" condition.
  - An after photo taken before the before photos (by camera time) needs a fix.
  - Each condition keeps the latest round of each kind of evidence, so a later note doesn't push out earlier photos or the receipt.
  - A document check's reason is the validator's own (`reason`).
- Change orders can be approved or declined while the job is in review.
- A pending change order over the agent's limit: `job_status` gives `askPerson`, and the person decides.
- Scope changes:
  - `apply_scope_suggestion` never drops a condition or a milestone document. It returns `changed` (added, rewritten, removed, kept; milestone documents before and after).
  - When the job had offers, it asks for offers again at once (`offersAgain`).
  - `request_offers` is an MCP tool.
  - `review_scope` leaves out gaps already applied (`alreadyApplied`).
- `confirm_checks` says what it paid (`paid`), and needs `agentMayRelease` (llms.txt says so).
- Staff:
  - In demo mode, staff sign-in is open and labelled "Demo staff (demo data only)".
  - With demo mode off, it needs `ADMIN_TOKEN` (compared in constant time).
- The simulated PayPal approval page names the job, the hired pro and the account that hired.
- Demo documents and receipts:
  - Each demo job gets its own permit number (`BP-2026-xxxxxx`) and its own store on the parts receipt, so cross-job reuse checks don't trip.
  - The permit is the issued permit document (number, issue date, site; inspection pending). The inspection is the green sticker.
  - The evidence history (photos, receipts, documents) is saved and reloaded whatever the checker mode.

## Round 4 changes (red team and agent test round 4)

Money and the capture guard
- `confirm` (`POST /api/jobs/:id/confirm`, MCP `confirm_checks`) only confirms checks that passed but needed a person. If any condition failed or needs a fix it returns `409 not_passed` with `failed: [{id, what, verdict, reason}]`, and nothing is captured.
- Every capture goes through one guard. A milestone is paid only when every condition of its last check passed, or when a person named the failures: `release` with `acknowledgeFailed: ["c2", ...]`, or the expert's `release_anyway` with a note of at least 6 characters (recorded in `milestone.acknowledgedFailed`). An inspector's pass, the end of a review window, and early pay all hit the same guard. Disputes and refunds are settled by their own decisions.
- Hold cap: a re-hold for a change order can go above the price ceiling only by the approved change orders themselves.
- Offers carry `overCeiling`, `acceptable` and `acceptableWhy`.
- `hold.explain` uses one buffer figure: the held amount over the price, rounded ("about 8% of the price: capped by your $200.00 ceiling, below the 20% you set"), or "raised from your 20% by the overrun risk". While a hold waits for PayPal approval it says "Waiting for approval: nothing is held yet". A failed or abandoned hold says "Nothing is held".
- `hold.paidWith` says what actually paid, e.g. "the sandbox test card, saved by an earlier hold" (`person.vaultFrom`: `test_card` | `card` | `paypal`).
- Payout views (`money.payout`, `money.payouts[]`, `milestones[].payout`): `status` now reflects the items (what reached the pro, e.g. `UNCLAIMED`). PayPal's status for the whole batch moved to `batchStatus`, and `statusNote` explains the difference.

Evidence and checks
- Sending a file (same sha256), or the same note, that a check already turned down for that condition returns `409 unchanged`, with `{checkId, reason}`. Nothing is stored.
- A receipt condition that the customer added or rewrote (`scope.checks[].by: "customer"`, set by `editScope`/`apply_scope_suggestion`) is never waived for "no parts". It stays required: `needs_fix` with "send the receipt, or ask the customer to drop the condition". A receipt condition written by the scope writer is still waived when there are no parts or change orders, and it says so.
- An agent's milestones are taken as given: their own conditions, or titles that split the scope's conditions.

Scope review
- `review_scope` gives every gap an `id` (`g1`, `g2`, ...) and `applicable: true`. `apply_scope_suggestion {job, suggestion: "g1" | "all"}` applies that gap: it rewrites the condition the gap names (`checkId`) or adds the missing condition, choosing receipt, note or photo from the gap's wording. Without `suggestion` it still takes the whole `revisedScope`. This works until an offer is accepted. On an `offered` job it moves back to `scoped`, withdraws open offers, and tells the pros. An unknown id returns `not_found` listing the ids.

Pros and the registry
- A licence number already registered to another pro on VeriPay fails verification: `license.valid: false`, `duplicateOf`, `signal: "licence_duplicate"`, and a `why` that names the other pro (a fraud signal for staff).
- Seeded demo pros use licence numbers in a demo range (M-904xx, J-904xx). Stored demo pros with the old numbers are re-verified on start.
- Demo pros' payout addresses (`@done-demo.example`) show `payout.demoAddress: true` and "payouts to it stay UNCLAIMED in the sandbox". `verification.paypal.demoAddress` says the same.

Demo behaviour
- The clock: demo pros never move it. A scheduled step waits in real time, for the window, the pro's stated arrival, and the visit's span. Only the demo panel, the judges' tour, and an explicit "finish now" (`POST /api/jobs/:id/demo-finish`) move it. Each move is logged in `/api/info` `clock.recent` with who asked (`finish now ("finish now" by <person>): ...`).
- Seeded customers, whoever the pro is (demo or a real pro's agent):
  - They answer every change order within about 90 s (`DEMO_CUSTOMER_CHANGE_MS`), and retry while one is pending. They approve within their limits and place a larger hold on the saved card when the change order exceeds the buffer. Otherwise they decline with the reason.
  - They look at a milestone left in review within about 2 min (`DEMO_CUSTOMER_CONFIRM_MS`): they confirm when nothing failed, else they ask for a fix that names the failures. The thread says it was the demo customer (a seeded demo account).
  - Pending ones are picked up again after a restart.
- Demo evidence:
  - Before photos are labelled `before c1: <short name>` (cut at a word).
  - After photos never show the unfixed scene unless the condition asks for the old part ("old heater before removal").
  - Work starts no later than the first before photo.
  - Water-heater scenes and receipts use the job's capacity (`gallonsOf`: the scope's spec, else "50 gallon" in the text).
  - A permit's text has its number, issue date and site.
- `/api/demo/office` rows include `releasedBy`. The note says what is anonymized.
- The seed leaves at most one recent expert-queue item open: the demo expert confirmed the older ones, or left them to the customer when something failed.

## Round 4 prep: times and risk factors for people

- Every human sentence (`next`, `waitingOn.what`, thread `text`, activity `summary`, error `message`, demo-pro `waiting`) writes times in Austin time, e.g. "Nov 7, 7:00 AM" (dates "Nov 21, 2026"); ISO stays in data fields (`waitingOn.at`, `passed.until`, `warranty.until`, …).
- `risk.dispute.why` / `risk.overrun.why`: `[{ factor, says, effect: "raises"|"lowers", logOdds }]`, e.g. "a first-time hirer raises the dispute risk"; factors at 0/false or with no effect are left out.

## Red team round 3 changes, and Done-Risk

**Releasing**
- **A required inspection is never skipped by `release`:** a milestone with `inspect: true` and a named inspector is
  refused (`409 inspection`) until the inspector passes it, unless the **person** sends `waiveInspection: true`
  (recorded: `milestones[].inspectionWaived`, a timeline note, activity). Agents can't waive it. "Release now" still skips
  the review window.
- **Releasing over failed checks needs them named:** if the last round has conditions that didn't pass, `release` is
  refused (`409 acknowledge` with `failed: [{ id, what, verdict, reason }]`) unless `acknowledgeFailed` lists every one
  (recorded as `milestones[].acknowledgedFailed`). Experts and staff aren't asked. Agents: `release {job,
  acknowledgeFailed}`.
- **`request_fix` needs a reason** (at least a few words).

**Holds**
- **No saved method and no `payWith`:** the person approves in PayPal (`approveUrl`); the test card is never picked
  implicitly. `payWith: "saved"` with nothing saved does the same, with `hold.note` listing the choices
  (`"paypal"`, or `"card"` on the demo server). `paidWith` says what was used.
- **Done-Risk sizes the buffer:** at agreement the job gets `risk: { dispute: { p, why }, overrun: { p, why }, source:
  "model: done-risk" | "rules", version, at }` (LightGBM trees in `ml/risk/out`, dispute AUC 0.776, overrun AUC 0.780 on
  held-out synthetic jobs; ml/RESULTS.md). Buffer % = max(the person's `bufferPct`, 10 + 60 × overrun probability), at
  most 40%, and the hold never exceeds the ceiling: `hold.bufferPct`, `hold.bufferWhy`. `GET /api/jobs/:id/risk?offer=`
  estimates it for an open job. Back-office rows add `riskDispute`, `riskOverrun`, `riskSource`; `/api/models/status.risk`
  says whether the trees are loaded. The gap review receives it (`opts.risk`) and keeps it as
  `scopeReview.modelRisk`. The rules stand in (labelled) when the files are missing.

**Offers and scope**
- **Re-offers keep the negotiation:** after withdrawing (or replacing) an offer, a pro's new offer on the same job can't be
  above their last price unless the customer changed the terms since (`400 amount`, `lastPrice`); it links `previous`;
  the customer's counter-once is per pro per job (`counterUsed`). Old offers stay in the list (withdrawn/superseded).
- **Declined offers say why:** `declinedWhy: "The customer chose another offer."` (or "revised the scope"), never other
  prices.
- **`apply_scope_suggestion {job, from?}`** (agent) takes the revised scope from the job's last `review_scope` (stored as
  `scopeSuggestion`) or a pro's scope reply; until an offer is accepted; open offers are withdrawn and pros are told.

**Pros**
- **Getting back in:** `readiness` and `my_profile` always return a way onto the website: `onboarding` (before anyone
  signed in) or `signIn` (a fresh one-time link for the pro's person, `/link?code=…`, landing on `/pro`). What happened
  to Shady's code this round: it was redeemed 82 s after it was made (19:02:38), together with Luis's 13 s earlier (the
  round's setup signing both pros in); the later use got 410.
- **Change orders:** `withdraw_change {job, change}` / `POST /api/pro/jobs/:id/changes/:cid/withdraw`. A submit refused
  because a change order is pending stores nothing and says who must act and what the pro can do. Seeded customers'
  agents answer a change order within `DEMO_CUSTOMER_CHANGE_MS` (90 s): approve within the change-order and per-job
  limits, else decline with the reason.
- **Identical files** sent for the same condition in the same round are stored once.
- **Before photos** don't need a checkId (the job's before set); `requireBefore` asks for at least one.

**Demo pros**
- They offer to come within 5–10 minutes when the job's window allows ("in about 7 minutes"; `DEMO_FAST_ARRIVAL=0` turns
  it off), start then, and `waitingOn` says when (`at`). Before the window opens they wait and say so.
- **Photo times:** BEFORE photos at the start; after photos inside [work started, now], 2 minutes apart, timed gaps met. If
  the visit needs more time than has passed, the demo pro waits; "finish now" and the tour move the demo clock by those
  minutes, logged as "demo: … works N more minutes …" (visible in `/api/info.clock`). `demo.note` / `demo.waiting` say
  when it's waiting.
- **Scenes by job type** (faucet, drain, toilet, water heater, cleaning, handyman; never another trade's), water-heater
  scenes (old tank, new tank, rating plate, venting, T&P valve, permit sticker) and receipt, and a fresh file every round
  (receipts included).

**Checker inputs:** the job sent to `checkEvidence` carries `created`, `agreedAt`, `startedAt` (and `window`) so it can
enforce "taken after work started". **Back office:** rows add `checkedBy` (`decidedFrom.label`) and `releasedBy` ("the
checks (no person)", "the customer", "an expert reviewer", "the inspector", "staff (arbiter)", "the review window ended").

## Sign-in and the person

| Method | Path | Body | Returns |
|---|---|---|---|
| POST | `/api/auth/demo` | `{ "as": "customer", "name"?, "zip"? }` | `{ person, limits }` + cookie (a new "Demo · …" customer) |
| POST | `/api/auth/demo` | `{ "as": "customer", "person": "p_…" }` | resumes that demo customer (their jobs kept); 404 if it isn't one. Keep the id in the browser to come back as them |
| GET | `/api/demo/customers` | | `[{ id, name, zip, jobs, lastJob, created }]`: recent demo customers, newest activity first (demo only) |
| POST | `/api/auth/demo` | `{ "as": "pro", "pro": "barton-creek-plumbing" }` | `{ person, pro }` + cookie (signs in as that demo pro) |
| POST | `/api/auth/signout` | | `{ ok }` |
| GET | `/api/me` | | signed out: `200 { signedIn: false }`. Signed in: `{ signedIn: true, person, limits|null, pro|null }`. `person`: `{ id, name, email, role: "customer|pro", pro, zip, address, demo, savedPayment: { kind: "card|paypal", label } | null, created }` |
| PATCH | `/api/me` | `{ name?, email?, zip?, address? }` | person |
| GET | `/api/limits` | | Limits (below) |
| PUT | `/api/limits` | `{ perJobMax?, monthlyMax?, changeMax? (USD), bufferPct?, agentMayRelease?, agentMayCancel? }` | Limits |
| GET | `/api/tokens` | | `[{ id, label, hint, created, lastUsed, revoked, scopes, expires, signed }]` |
| POST | `/api/tokens` | `{ label, scopes?: ["read","hire","pay"], days?, key? (Ed25519 JWK x) }` | the token object + `token: "done_…"` (shown once) |
| DELETE | `/api/tokens/:id` | | `{ ok }` |
| GET | `/api/mcp-config` | | `{ url, transport, scopes, llms, a2a, example }` (for "Connect your agent") |
| GET | `/api/activity?after=N` | | `[{ id, at, actor, action, summary, ref, data }]` what happened for this person (agents' steps included) |

Limits: `{ perJobMax: "$500.00", monthlyMax: "$1500.00", spentThisMonth, leftThisMonth, changeMax: "$75.00", bufferPct: 20, agentMayRelease: false, agentMayCancel: true, cents: {…}, rule }`. Limits bind the **agent**; the person acting on the website isn't limited by them.

## Customer: jobs

| Method | Path | Body | Returns |
|---|---|---|---|
| POST | `/api/scope` | `{ text, zip?, budget? }` | a scope preview `{ title, trade, items, checks, milestones: [{ id, title, share, checkIds, docs: [{ kind, what }], inspect }] | null, priceCeiling: Money, window, estimate, photoChecklist?, code?, spec?, note?, source, ms }` (nothing saved). Post it back as `POST /api/jobs { scope }` (with `priceCeiling` in USD): milestones and their documents are kept, `source` too, `editedBy: "person"` |
| POST | `/api/scope/review` | `{ scope, proReply? }` | the gap review before posting: `{ gaps: [{ severity, kind?, checkId?, what, suggestion }], ok, evidencePlan?, disputeRisk?, revisedScope?, changes?, source }` (gap.js, or the rules) |
| POST | `/api/jobs/:id/scope/apply-revision` | `{ from: "review" | <scope reply id> }` | Job: takes a suggested revised scope (from the agreed-scope review or a pro's reply); an `offered` job goes back to `scoped` and its open offers are withdrawn |
| POST | `/api/jobs/:id/confirm` | `{ milestone? }` | Job: the customer confirms checks the checker left to a person. It counts as a pass: the inspector (if any) and the review window (if chosen) apply as usual. `release` is "release now" and skips them |
| POST | `/api/jobs` | `{ text, zip, address?: { line, lat?, lng? }, budget? (USD), bufferPct?, scope?: {title, trade, items, checks, priceCeiling (USD), window}, requestOffers?: true }` | Job (`scoped`, or `offered` with `requestOffers`) |
| GET | `/api/jobs` | | `[{ id, number, status, title, trade, due, pro, offers, next, created, updated }]` |
| GET | `/api/jobs/:id` | | Job |
| GET | `/api/jobs/:id/activity` | | activity entries for the job |
| PATCH | `/api/jobs/:id/scope` | `{ title?, items?, checks?, priceCeiling? (USD), window?, bufferPct? }` | Job (only `draft`/`scoped`) |
| POST | `/api/jobs/:id/offers/request` | | Job (`offered`; demo pros' agents quote at once) |
| POST | `/api/jobs/:id/offers/:offer/counter` | `{ amount }` (USD) | Job + `offer`. Once per offer; a demo pro answers in `offers[].answer` and `thread` |
| POST | `/api/jobs/:id/offers/:offer/accept` | `{ payWith?: "saved"|"card"|"paypal", raiseCeiling?: true }` | Job. An offer over `scope.priceCeiling` is refused (`409 ceiling`, with `ceiling` and `offer`) unless `raiseCeiling: true` (the ceiling becomes the offer; noted in the timeline). Agents can never raise it. `held` at once with a saved method or the test card; else `agreed` + `approveUrl`, `orderId` |
| POST | `/api/jobs/:id/auto-hire` | `{ payWith? }` | Job + `steps`: the demo customer agent counters once (~88%) and accepts within the ceiling |
| POST | `/api/jobs/:id/hold/order` | | Job + `orderId`, `approveUrl`: a PayPal order for the JS SDK v6 buttons to approve |
| POST | `/api/jobs/:id/hold/confirm` | `{ orderId? }` | Job (`held` once PayPal says approved; authorizes and vaults) |
| POST | `/api/jobs/:id/hold/retry` | `{ payWith? }` | Job: places the hold again on an agreed job whose hold failed or wasn't approved |
| POST | `/api/jobs/:id/demo-finish` | | Job + `demo`: the demo pro does what's left now (demo, demo pro only) |
| POST | `/api/jobs/:id/hold/card` | | Job: hold with PayPal's sandbox test card (needs `PAYPAL_TEST_CARD=1`; always on with the stand-in) |
| POST | `/api/jobs/:id/changes/:cid/approve` | | Job + `change` (may re-hold first) |
| POST | `/api/jobs/:id/changes/:cid/decline` | `{ note? }` | Job + `change` |
| POST | `/api/jobs/:id/release` | | Job (`released`), from `review` or `needs_fix` |
| POST | `/api/jobs/:id/request-fix` | `{ reason }` | Job (`needs_fix`), from `review` |
| POST | `/api/jobs/:id/dispute` | `{ reason }` | Job (`disputed`) with `dispute.summary` |
| POST | `/api/jobs/:id/dispute/propose` | `{ release }` (USD to the pro) | Job |
| POST | `/api/jobs/:id/dispute/accept` | | Job (`resolved`): accepts the other side's open proposal |
| POST | `/api/jobs/:id/cancel` | `{ reason? }` | Job (`cancelled`; a hold is voided) — before work starts |
| POST | `/api/jobs/:id/escalate` | `{ reason }` | PayPalDispute: escalate a **paid** job (released/resolved) to PayPal Disputes, within 180 days |
| GET | `/api/jobs/:id/paypal-dispute` | | PayPalDispute or `null` |
| POST | `/api/jobs/:id/repeat` | `{ everyDays: 7–60, visits: 1–26, firstInDays? }` | Schedule: repeat a **released** job (same pro, price, done-conditions); needs a saved payment method |
| GET | `/api/schedules`, `/api/schedules/:id` | | `[Schedule]` / Schedule |
| POST | `/api/schedules/:id/pause` | `resume` | `cancel` | `run-now` (demo) | | Schedule (`run-now` returns the new visit's Job) |
| GET | `/api/jobs/:id/receipts` | | `[Receipt]` (signed, with your salt) |
| GET | `/api/jobs/:id/evidence/:eid` | | the file (customer, the hired pro, or staff) |
| GET | `/api/paypal/sdk` | | `{ mode, clientId, token, expiresIn, sdk }` for the JS SDK v6 (`token: null` with the stand-in) |

`Schedule`: `{ id, status: "active|paused|done|cancelled", from, pro, proName, price: Money, everyDays, visits, done, nextAt, title, checks, jobs: [{ id, number, status, due, paidAt }], history: [{ at, event, job?, why? }], created, rule }`.
Each visit is its own Job (`schedule` set, no offers): `scoped → agreed → held` on the saved method at once, then the
usual flow; paid only when **that visit's** checks pass. A declined hold is recorded on the visit and pauses the schedule.

PayPal Disputes in the sandbox: a PayPal dispute is opened by the buyer in PayPal's Resolution Center, which needs a
sandbox buyer login; the demo's card holds have none. So with real keys `escalate` records `requested` and staff
`sync` asks PayPal (`GET /v1/customer/disputes?disputed_transaction_id=<capture>`; the 2026-11-04 sandbox run found
0, as expected). With the stand-in, `escalate` opens the PayPal dispute itself (status `open`) so the whole path
(sync, evidence) can be shown. The `CUSTOMER.DISPUTE.CREATED` webhook also triggers a sync.

The first-time PayPal flow: accept with `payWith: "paypal"` (or `hold/order`) → show `approveUrl` (redirect) or approve
`orderId` with the JS SDK buttons → `hold/confirm`. PayPal saves the payment method with `store_in_vault`, so the next
holds (and an agent's `accept_offer`) need no approval. With the stand-in, `approveUrl` is the relative `/mock-paypal/approve?token=…` (same origin)
(a simulated page) and returns to `/paypal/return?job=…`, which redirects to `/jobs/:id`.

## Pro (signed in as a pro)

| Method | Path | Body | Returns |
|---|---|---|---|
| GET | `/api/pros?trade=plumbing` | | `[Pro]` (public directory) |
| GET | `/api/pros/:id` | | Pro |
| GET | `/api/pro/me` | | `{ pro (self view), earnings }` |
| PUT | `/api/pro/paypal` | `{ email?, helperName?, helperEmail?, helperShare? (0–0.5) }` | Pro self view (verifies; stands in for Log in with PayPal) |
| POST | `/api/pro/keys` | `{ label? }` | `{ key: "dpk_…" (once), note, a2a }` for the pro's own agent |
| DELETE | `/api/pro/keys/:id` | | `{ ok }` |
| GET | `/api/pro/jobs` | | `{ open: [OpenJob], mine: [{ id, number, status, title, due, zip, next, updated }] }` |
| GET | `/api/pro/jobs/:id` | | Job (pro view) |
| POST | `/api/pro/jobs/:id/offer` | `{ amount (USD), arrival?, helper?: true, note? }` | Job + `offer` |
| POST | `/api/pro/offers/:offer/accept` | | Job (accept the customer's counter) |
| POST | `/api/pro/offers/:offer/counter` | `{ amount }` | Job (once, between their counter and your ask) |
| POST | `/api/pro/offers/:offer/decline` | | Job |
| POST | `/api/pro/jobs/:id/start` | | Job (`working`) |
| POST | `/api/pro/jobs/:id/changes` | `{ amount (USD), reason, evidence?: [{ kind, dataUrl }] }` | Job + `change` |
| POST | `/api/pro/jobs/:id/evidence` | multipart/form-data, or JSON (below) | Job + `added: [ids]`; with `submit` the checked Job |
| POST | `/api/pro/jobs/:id/submit` | | Job after the check (`released`, `needs_fix` or `review`) |
| POST | `/api/pro/jobs/:id/dispute` (`/propose`, `/accept`) | as the customer's | Job |
| GET | `/api/pro/invoices` | | `[Invoice]` |
| POST | `/api/pro/invoices` | `{ customer: { name?, email }, title?, text, amount (USD), zip, checks?: [{ id, what, evidence }] }` | Invoice (`draft`; without `checks` Done writes them) |
| GET | `/api/pro/invoices/:id` | | Invoice |
| POST | `/api/pro/invoices/:id/evidence` | multipart or JSON, as job evidence (`submit: true` checks it) | Invoice |
| POST | `/api/pro/invoices/:id/submit` | | Invoice after the check: `sent`, `needs_fix` or `review` |
| POST | `/api/pro/invoices/:id/cancel`, `/sync` | | Invoice (`sync` asks PayPal whether it's paid) |
| GET | `/api/pro/payouts` | | `{ total: Money, helpers: Money, jobs: [{ job, number, title, at, release, pro, helper, fee, payout }] }` |

Evidence upload:
- **multipart/form-data**: one or more parts named `file`; fields `kind` (`photo|receipt|note`), `checkId` (`c1`…), `text`
  (a receipt's typed total or a note) apply to all files, or per file as `kind_0`, `checkId_0`, `text_0`…; `submit=true`
  sends everything to the check. A form with only `text` adds a note.
- **JSON**: `{ "items": [{ "kind": "photo", "dataUrl": "data:image/jpeg;base64,…", "checkId": "c1", "name"?, "text"? }, { "kind": "note", "text": "…", "checkId": "c3" }], "submit": true }`.
- 8 MB a file; JPEG (best: it carries the camera's time and GPS), PNG, WebP or PDF. HEIC is refused with a message (send JPEG). Files are stored under `api/data/uploads/<job>/`. The server reads EXIF
  (time, offset, GPS) and the SHA-256 itself; a file reused on another job, a photo taken before the job or far from
  the address fails its check; text that tries to instruct the checker sends the job to review.

`Invoice` (a pro's off-platform job billed through Done): `{ id, number: "INV-DP-101", status: "draft|checking|needs_fix|review|sent|paid|cancelled", pro, proName, customer: { name, email }, title, text, amount: Money, address, scope: { title, trade, items, checks, window, source }, evidence: [Evidence], checks: [CheckRound], lastCheck, paypal: { id: "INV2-…", url, status, at } | null, sentBecause, money: { split: { release, fee, pro, helper }, payout, ledger: [{ kind: "invoice_paid|platform_fee|pro_payout", amount }] }, receipts, created, updated, paidAt }`.
The invoice is created and sent with PayPal Invoicing v2 **only when the checks decide `release`** (or staff approve
it after `review`; the pro can't override). When the customer pays it, the platform keeps 10% and pays the pro with
one Payouts batch to their verified PayPal. With the stand-in, the invoice's `paypal.url` is a simulated pay page.

`OpenJob`: `{ id, number, status, title, items, checks, priceCeiling, window, zip, created, yourOffer: [{ id, amount, status, counter }] }`.

## Staff (back office)

`POST /api/auth/staff` (`{}` in the demo; `{ key }` = `ADMIN_TOKEN` otherwise) sets `done_staff`.

| Method | Path | Returns |
|---|---|---|
| GET | `/api/staff/overview` | `{ now, paypal, holdMode, jobs, byStatus: {status: n}, held, captured, fees, paypalFees, paidToPros, refunded, unbalanced, autoReleased, alerts }` |
| GET | `/api/staff/jobs` | rows for AG Grid: `{ id, number, status, title, trade, zip, customer, pro, price, due, hold, holdStatus, holdExpires, flow, captured, fee, refunded, balanced, checks, checker, created, updated }` (cents) |
| GET | `/api/staff/jobs/:id` | Job (staff view: offers include `floor`) + `customer`, `activity` |
| GET | `/api/staff/holds` | live holds, soonest expiry first: row + `authorization, order, createdAt, honorUntil, expiresAt, reauthorized` |
| GET | `/api/staff/payouts` | `[{ job, number, pro, batchId, status, items, split }]` |
| GET | `/api/staff/ledger` | every ledger line of every job (cents) |
| GET | `/api/staff/disputes` | row + `dispute` |
| POST | `/api/staff/disputes/:id/resolve` | `{ outcome: "release"|"refund"|"partial", release? (USD), note? }` → Job (`resolved`) |
| GET/POST | `/api/staff/pros` | list (self view + earnings) / `{ name, trade, zip, email, rules? }` → `{ pro, key: "dpk_…" }` for a real pro's agent |
| GET | `/api/staff/people` | people with limits and job counts |
| GET | `/api/staff/alerts`, POST `/api/staff/alerts/:id/ack` | `{ alerts: [{ id, kind, level, job, number, says, pro, acked }] }` |
| GET/POST | `/api/staff/recon` (`?wait=1` to wait) | `{ running, report: { at, paypal, toolkit, calls, rows: [{ kind, job, ref, ours, paypal, via, status: "matched|pending|sent_unclaimed|missing_in_paypal|amount_difference|paypal_…", says? }], counts, summary: { text, source } }, history }` |
| GET | `/api/staff/paypal-disputes` | `{ disputes: [{ job, number, pro, ...PayPalDispute }], sandboxNote }` |
| POST | `/api/staff/jobs/:id/paypal-dispute/sync` | `{ job, disputes: n, record }`: asks PayPal for disputes on the capture |
| GET | `/api/staff/jobs/:id/paypal-dispute/packet` | `{ notes, receipt }`: what would be sent to PayPal |
| POST | `/api/staff/jobs/:id/paypal-dispute/evidence` | `{ note? }` → PayPalDispute (`answered`): provide-evidence with the checks and the signed receipt |
| GET | `/api/staff/invoices`, POST `/api/staff/invoices/:id/review` | `[Invoice]` / `{ approve, note? }` → Invoice (`sent` or `cancelled`) |
| GET | `/api/staff/schedules` | `[Schedule]` |
| POST | `/api/staff/ask` | `{ question }` → `{ question, grid: "jobs|holds|payouts|disputes|ledger", filters: [{ field, op, value }], sort: { field, dir } | null, source: "model|rules", rules?, modelDropped? }`: a plan for the AG Grid (money values in cents; ops: equals, notEqual, contains, greaterThan, lessThan, inRange, blank, notBlank). A model plan is used only if every grid/column/op exists |
| GET | `/api/staff/webhooks` | `{ registered, events, recent }` |
| POST | `/api/staff/tick` | runs the hold/offer/payout tick now |

## Public, agents, PayPal

| Method | Path | Notes |
|---|---|---|
| GET | `/api/info` | `{ app, paypal: "sandbox|mock", testCard, holdMode, multiparty, demoSignin, publicUrl, mcpUrl, now, demoDaysSkipped, feeRate, ai: { mode, llm, scope, check, modelLive, modelReason, model }, city, defaultLimits }` |
| GET | `/api/example-job` | the latest paid demo job, in full, for the home page: no names, emails, street or person ids (ZIP only); `example: true`; photos at `/api/example-job/evidence/:eid`. 404 until one exists (run the tour) |
| GET | `/api/models/status?probe=0|1` | llm.js's `modelStatus()`: `{ configured, url, model, auditModel, timeoutMs, custom, live, reason, last, probe, mode, replies: { chat|scope|check: { at, source, ms } } }`; with `DONE_AI=rules`: `{ configured: false, live: false, reason }`. Truthful: `live` comes from a probe (default on, 1.5 s) |
| GET | `/api/stats` | `{ jobs, paid, paidToPros, medianSecondsSubmitToPaid, pros, last: { number, title, pro, checks, checker, release, payout, capture, at } }` (for the home page) |
| GET | `/llms.txt` | the agent guide |
| POST | `/mcp` | MCP Streamable HTTP, `Authorization: Bearer done_…` |
| POST | `/api/agent/:tool` | the same tools as REST |
| GET | `/.well-known/agent-card.json`, `/.well-known/mcp.json`, `/.well-known/mcp-tools.json` | |
| POST | `/a2a` | JSON-RPC `message/send`, one data part `{ action, … }`; `Bearer done_…` (customer tools) or `Bearer dpk_…` (pro tools) |
| GET | `/.well-known/done-receipts.json`, `/api/receipts/:id`, `POST /api/receipts/verify`, `/api/receipts/log/checkpoint` | signed receipts and the transparency log |
| GET | `/paypal/return?job=…` | PayPal's return URL: confirms the hold, redirects to `/jobs/:id` |
| POST | `/paypal/webhook` | verified with PayPal (`PAYPAL_WEBHOOK_ID`); registered only on a public https `PUBLIC_URL` (on local http it logs that it skipped) |
| GET/POST | `/mock-paypal/approve?token=…` | the stand-in's simulated approval page (mock mode only) |

Customer agent tools (scopes): `whoami`, `my_limits`, `my_jobs`, `job_status`, `list_offers`, `wait_for_news` (read);
`post_job {text, zip, budget?, bufferPct?}`, `request_offers`, `counter_offer {job, offer, amount}`, `accept_offer {job, offer, payWith?}`,
`approve_change {job, change}`, `decline_change`, `cancel_job` (hire); `release`, `request_fix {job, reason}`, `open_dispute {job, reason}` (pay).
Pro agent actions: `whoami`, `list_jobs`, `job_status`, `offer {job, amount, arrival?}`, `counter {offer, amount}`, `accept {offer}`,
`decline {offer}`, `start_work {job}`, `request_change {job, amount, reason, evidence?}`, `submit_evidence {job, items, submit?}`, `payout_status {job}`.
No tool takes a payee; payee-like fields (`payee`, `email`, `receiver`, `paypal`, …) are ignored and the answer carries `ignored` and `payeeRule`.

## Demo controls (`DEMO_SIGNIN` on)

| Method | Path | Body | Notes |
|---|---|---|---|
| POST | `/api/demo/advance` | `{ days }` or `{ hours }` | moves the platform clock and runs the tick (holds age; reauthorize past 3 days; expiry at 29) → `{ skipped, now, tick }` |
| POST | `/api/demo/tour` | `{ step, job? }` | judges' tour on one job. each run makes **new demo photos** (the synthetic scene re-drawn from a random seed by `demo-assets/make-assets.ps1`, ~25 of 64 dHash bits apart, EXIF stamped now at the address), so reuse detection stays fully on and a second tour isn't flagged. steps: `start` (creates the faucet job, offers) → `hire` (agent counters, accepts, holds with the test card) → `start_work` → `change` (+$45 valve, photo) → `approve_change` (by the agent, within limits) → `evidence` (photos stamped with EXIF at the address, a receipt dated today with TOTAL $47.05, a note → check → paid; or `review` when the checker leaves the photos to a person, e.g. no model is serving) → `release` (only in review: the customer looks and releases). `all` runs every step (release only when needed). Signs in a demo customer if needed. Returns Job + `tour: { steps, next }` |
| GET | `/api/demo/assets` (`/:file`) | | the synthetic demo photos and receipt |
| POST | `/api/demo/fail-next-hold` | | the stand-in declines the next hold on your saved method |

## Landlord and tenant (PLAN §15 item 1)

A tenant posts and documents a job; their landlord (or property manager, or the landlord's agent) decides and pays.

- **Who is who on the job.** `job.customer` is the **payer**: the landlord. `job.tenant` is the tenant's person id.
  Every money rule (limits, the hold on the saved PayPal, change orders, release, PIN step-up) is the landlord's, exactly
  as for a customer. The tenant can't accept, counter, approve, release, dispute or cancel (those routes answer 404
  `"Your landlord decides this (only the payer can)."`).
- **A landlord** is a person with `role: "landlord"`: own PIN, own limits (`/api/limits`), own saved PayPal, own agent
  tokens (`POST /api/tokens`, the same scopes; tokens work over MCP, REST and A2A like a customer's).
- **The demo landlord** "Riverside Property Management (demo)" always exists (`GET /api/demo/landlord`). Its demo
  agent answers within minutes (`DEMO_LANDLORD_DELAY_MS`, default 2 min): it hires the tenant's suggested offer if it's
  acceptable (within the ceiling, hireable), else the cheapest acceptable one, within the landlord's limits; it answers
  change orders and confirms checks left to a person like the seeded customers. Every step is labelled
  `"Demo landlord's agent (Riverside Property Management, demo)"` / `"The demo landlord (a demo account)"`.

| Who | Method | Path | Body | Returns |
|---|---|---|---|---|
| anyone (demo) | POST | `/api/auth/demo` | `{ as: "landlord", name?, pin? }` | a new demo landlord: `{ person, limits, pinOnce? }` + cookie (stepped up) |
| anyone (demo) | POST | `/api/auth/demo` | `{ as: "landlord", person, pin }` | resume a demo landlord (PIN required; 403 wrong PIN, 429 locked) |
| anyone (demo) | POST | `/api/auth/demo` | `{ as: "landlord", demo: true, pin }` | sign in as the demo landlord (PIN `DONE_DEMO_LANDLORD_PIN`, default 9753); `demoLandlord: true` |
| anyone (demo) | GET | `/api/demo/landlord` | | `{ id, name, demo, signIn, agent }` |
| landlord | POST | `/api/landlord/invites` | `{ unit? }` | `{ code, link: "/tenant/join?code=…", unit, expires (7 days), oneUse, tell }` (403 `role` for others). The code is kept only as a SHA-256 hash in the store (`invites`), so it survives a restart |
| landlord | GET | `/api/landlord/tenants` | | `{ role: "landlord", tenants: [{ person, name, unit, linkedAt }], demo }` |
| landlord | DELETE | `/api/landlord/tenants/:person` | | `{ ok }` |
| tenant (customer) | POST | `/api/tenant/landlord` | `{ code }` or `{ demo: true, unit? }` | `{ person, tenancy }` (410 `code` used/expired; 403 `role` if not a customer) |
| tenant | DELETE | `/api/tenant/landlord` | | `{ ok }` |
| tenant | POST | `/api/jobs` | as usual + `forLandlord: true` | Job (tenant view). 409 `landlord` if not linked. The landlord is the payer |
| tenant | POST | `/api/jobs/:id/tenant/note` | `{ text }` (4+ chars) | Job + `note` (thread message `type: "tenant_note"`, `source: "tenant"`) |
| tenant | POST | `/api/jobs/:id/tenant/pick` | `{ offer }` | Job: the tenant suggests an open offer (`tenancy.pick`); the landlord decides |
| tenant or landlord | GET | `/api/jobs/:id`, `/activity`, `/reports/*` | | Job as `"tenant"` or `"customer"` |
| tenant or landlord | POST | `/api/jobs/:id/photos`, `/offers/request` | as before | reference photos of the damage; asking for offers |

`person.tenancy` (in `/api/me` `person`, `viewPerson`): landlord `{ role: "landlord", tenants: [...], demo }`; tenant
`{ role: "tenant", landlord: { id, name, unit, demo }, linkedAt }`; otherwise `null`. `/api/me.limits` is set for
landlords too.

**Job additions** (every view): `tenancy: { tenant: { id, name }, landlord: { id, name, demo }, postedBy: "tenant", notes:
[{ id, text, at, by }], pick: { offer, pro, at, by } | null, you: "tenant"|"landlord"|"pro"|"staff", rule } | null`. On a
tenant's job `waitingOn.who` is `"landlord"` where it would be `"customer"`. The tenant's view (`as: "tenant"`): `next`
speaks to the tenant ("Your landlord (or their agent) picks an offer…"), `hold.paidWith` is `"your landlord's payment
method"`, `hold.payer: "your landlord's PayPal"`. `GET /api/jobs` rows add `role: "customer"|"landlord"|"tenant"` and
`tenant` (name, for the landlord) or `landlord` (name, for the tenant).

**Agents.** A tenant's agent: `post_job {…, forLandlord: true}`, `job_status`, `list_offers`, `get_report`,
`tenant_note {job, text}`, `suggest_offer {job, offer}` (it can't accept or pay). The landlord's agent uses the usual
tools on the landlord's jobs, within the landlord's limits. Events go to both: tenant notes and picks to the landlord,
hires (`landlord_decided`), holds, checks and payments to the tenant.

## Notifications: inbox and simulated outbox (PLAN §15 item 8)

Every person (customer, pro, landlord, tenant, inspector) has an inbox fed by the activity log: each event that names
them (their jobs, their offers as a pro, their tenant's job) becomes an item, except what they did themselves on the
website. Email and SMS copies go to an **outbox only**: nothing is ever sent; every outbox item has
`status: "not_sent"` and `label`. A pro whose `lang` is `"es"` gets Spanish titles and bodies (`titleEn`,
`bodyEn` beside them).

| Method | Path | Body | Returns |
|---|---|---|---|
| GET | `/api/inbox?unread=1&after=<n>&limit=&category=` | | `{ items: [Item] (newest first), unread, total, last, settings }` |
| POST | `/api/inbox/read` | `{ ids: [id] }` or `{ all: true }`, `read?: false` to mark unread | `{ changed, unread }` |
| GET | `/api/inbox/settings` | | Settings |
| PUT | `/api/inbox/settings` | `{ inApp?: { <category>: bool }, email?: { on?, to?, categories? }, sms?: { on?, to? (US phone), categories? } }` | Settings (400 `fields`, `category`, `email`, `phone`) |
| GET | `/api/inbox/outbox` | | `{ items: [Outbox], label }`: what would have been emailed or texted |
| GET | `/api/staff/outbox` (staff) | | `{ items, label, sent: 0 }` (addresses masked) |
| agent | `my_inbox {unread?, after?}` | | the same as `GET /api/inbox` (read scope) |

`Item`: `{ id: "ntf_…", n (increasing; use as after), person, at, action, category, title, body, job, number, activity
(the activity entry id), actor, read, readAt, channels: { inApp: true, email: "out_…"|null, sms: "out_…"|null }, lang?,
titleEn?, bodyEn?, untranslated? }`. `/api/me` adds `inbox: { unread }`.

Categories (and the actions in them): `offers`, `hire`, `changes`, `work`, `money`, `disputes`, `schedule`, `tenancy`,
`reports`, `mandates`, `feed`, `other`. **`feed`**: a pro with a person (signed in at least once) gets `action: "feed_job"`,
`title: "New job in your feed"`, `why: "new in your feed"` when a job in their trade and service radius starts asking for
offers (the body names the job number, title and miles). In-app only by default (not in the email defaults). Settings: `{ inApp: { <category>: bool } (all true by default), email: { on (true),
to (the person's email, else a labelled demo address <person>@inbox.done-demo.example; demoAddress: true), categories
(default hire, changes, money, disputes, schedule, tenancy, mandates) }, sms: { on (true once a phone is set), to
("+15125550123"), categories (default schedule, money, changes) }, categories, says }`.

`Outbox`: `{ id: "out_…", channel: "email"|"sms", person, to, toShown (masked), demoAddress, at, subject (email),
body, lang, notification, status: "not_sent" }`.

## Fair-price estimate wiring (PLAN §15 item 4; the module is `estimate.js`)

- `POST /api/scope` adds `estimate`: `{ low, high, typical: Money, basis: [string], source: "history"|"rules"|
  "model+history"|"model+rules", template, size, matched, seen?, label: "an estimate from similar jobs, not a quote",
  ms }` or `null`. History is every completed job's agreed price by type.
- At posting, the job keeps it: `job.estimate` (the same, plus `says`: "Typical $120.00-$250.00 (median $180.00): an
  estimate from similar jobs, not a quote (rules)." and `at`).
- Every offer in the customer's view adds `fair: { where: "below"|"within"|"above", typical: "$120.00-$250.00",
  says, source }` when the job has an estimate.
- The demo's auto-negotiating agent (`POST /api/jobs/:id/auto-hire`, the tour's hire step) counters at about 88% of the
  ask, kept inside the fair range: between the range's low end and its typical price (`fairRange`); no counter when
  that isn't below the ask. Its step says so:
  "countered … at $X (inside the fair range $L-$H: an estimate from similar jobs, not a quote, rules)".

## PayPal depth: Pay Later, Venmo payouts, tips (PLAN §15 item 3)

**Pay Later (JS SDK v6).** Offered on holds of **$300.00 or more** (`J.PAY_LATER_MIN`, 30000 cents). PayPal decides
who is eligible and the terms, at the button (`findEligibleMethods(...).isEligible("paylater")`); VeriPay holds and
captures exactly as with any PayPal approval.

| Method | Path | Body | Returns |
|---|---|---|---|
| GET | `/api/jobs/:id/hold/options` | | `{ job, amount: Money (the hold, or the price + buffer it would be), saved: { kind, label } \| null, methods: [{ id: "saved"\|"paypal"\|"paylater"\|"venmo"\|"card", offered, says, … }], button: "/paypal/button?job=…" }`. The `paylater` method adds `minimum: Money`, `sdk: { button: "paypal-pay-later-button", session: "createPayLaterOneTimePaymentSession", eligibility }`, `products: [{ code: "PAY_IN_4"\|"PAY_MONTHLY", range }]`, `sandbox` (honest note) |
| POST | `/api/jobs/:id/offers/:offer/accept` | `{ payWith: "paylater", … }` | as `payWith: "paypal"` (an approval: `approveUrl`, `orderId`), with `hold.payLater: { offered, says }` (offered only at $300+) |
| GET | `/paypal/button?job=` | | the button page now shows the Pay Later button next to the PayPal one when the hold is $300+ and PayPal says the buyer is eligible |

Agents: `hold_options {job}`, `accept_offer {…, payWith: "paylater"}`. **Sandbox, honestly:** not verified end to end.
Approving needs a sandbox buyer login (a manual step, docs/SANDBOX-BUTTON.md); whether PayPal allows Pay Later on an
AUTHORIZE (hold) order for this account is PayPal's call: if not, the SDK doesn't show the button.

**Venmo payouts for pros.** The pro chooses to be paid to Venmo (their US mobile number) on the website, with the PIN.
Payouts then sends the pro's item with `recipient_type: "PHONE"`, `recipient_wallet: "VENMO"`. The verified PayPal stays
required (it's what makes a pro hireable) and is the fallback. Helpers are always paid to their PayPal.

| Who | Method | Path | Body | Returns |
|---|---|---|---|---|
| pro (PIN) | PUT | `/api/pro/payout-method` | `{ method: "venmo", phone: "(512) 555-0142" }` or `{ method: "paypal" }` | Pro self view (400 `phone`, `method`, `paypal` (no verified PayPal), `fields`; 403 `step_up`) |

`Pro.payoutMethod`: `{ method: "paypal" }` or `{ method: "venmo", to: "+15125550142" (masked "+1 512-•••-0142" for
others), verified: true, says }`. No agent can set it (pro keys can't; there's no A2A action).

**What PayPal's sandbox does (our run, `docs/live-test/sandbox/venmo-tips-1.json`, runs.json n 14):** it refuses the
whole batch, `400 VALIDATION_ERROR "Recipient wallet not supported in sandbox."` So:
- the stand-in refuses Venmo items the same way (set `DONE_MOCK_VENMO=accept` to make it answer SUCCESS, as production
  would, for showing the flow);
- the platform then sends the same payout to the pro's verified PayPal and says so on the payout:
  `payout.via: "venmo"|"paypal"`, `payout.venmoFallback: { why, says } | null`. Every payout object (job, milestone,
  tips) has `via`.

**Tips after a paid job.** A separate PayPal order (intent CAPTURE), captured at once, not part of the job's hold.
100% goes to the pro with Payouts (to Venmo if they chose it); no platform fee. PayPal's processing fee on the tip is
the platform's cost.

| Who | Method | Path | Body | Returns |
|---|---|---|---|---|
| customer (PIN) | POST | `/api/jobs/:id/tip` | `{ amount (USD, 1-500), payWith?: "saved"\|"card"\|"paypal" }` | Job + `tip` (id); with no saved method or `payWith: "paypal"`: + `approveUrl` (the tip waits, `status: "pending_approval"`) |
| customer | POST | `/api/jobs/:id/tips/:tid/confirm` | | Job + `tip` (captured and paid once PayPal says APPROVED; `note` otherwise) |
| PayPal | GET | `/paypal/tip-return?job=&tip=` | | PayPal's return URL: confirms, redirects to `/jobs/:id` |
| agent | `tip {job, amount, payWith?, mandate?}` (pay scope) | | | within the person's `changeMax`; above it `403 limit` + `askPerson` |

Errors: `409 state` (the job isn't paid), `400 amount`, `409 no_saved_payment`, `502 paypal`.

`job.tips`: `{ items: [{ id, n, amount: Money, status: "starting"|"pending_approval"|"captured"|"paid"|"payout_failed"|
"failed", payWith, by, at, order, capture, payout: Payout, approveUrl? }], captured, toPro, paypalFee: Money, balanced
(tip_capture = tip_payout + failed payouts), rule }` or `null`. Ledger kinds: `tip_capture`, `tip_payout` (`to: "pro"`,
`via`), `tip_paypal_fee`. They are outside the job's own `money.balanced` (which is unchanged). A signed receipt
(`event: "tip"`) is issued; inbox action `tip_paid` (and `tip_pending`).

## Scheduling: hours, slots, moving the visit (PLAN §15 item 7)

A pro sets weekly hours (Austin time) and blocked dates. Offers propose visit **slots** inside those hours and the
job's window; accepting the offer accepts a slot; either side can move it before work starts. The pro's arrival is the
slot's start (`agreed.arrival = agreed.slot.from`; the demo pros start then).

`Availability`: `{ weekly: { sun|mon|tue|wed|thu|fri|sat: [["HH:MM", "HH:MM"], …] (Austin; "24:00" allowed as an end) },
blocked: ["YYYY-MM-DD"], visitMinutes: 30-720 | null, source: "the pro"|"demo hours (fictional)", at?, onCall?, onCallSays? }`.
Demo pros have fictional hours (plumbers Mon-Fri 7-19 and Sat 8-14, cleaners Mon-Fri 8-17 and Sat 9-13, handymen
Mon-Fri 8-18). For the demo they also come within minutes ("in about 7 minutes"); such a slot outside their hours is
labelled `source: "demo on-call"`, `onCall: true`. A visit's length: the pro's `visitMinutes`, else the scope's hours
estimate (at least 60 min, rounded to 30).

`Slot`: `{ from: ISO, to: ISO, minutes, source: "availability"|"demo on-call"|"the pro's own agent (no hours set)"|
"rescheduled", onCall?, says? }`.

| Who | Method | Path | Body | Returns |
|---|---|---|---|---|
| pro | GET | `/api/pro/availability` | | `{ availability, says ("Mon 07:00-19:00; …"), tz: "America/Chicago", next: [Slot] }` |
| pro | PUT | `/api/pro/availability` | `{ weekly, blocked?, visitMinutes? }` | `{ availability, says, tz }` (400 `weekly`, `blocked`, `visitMinutes`, `fields`) |
| anyone | GET | `/api/pros/:id/availability?days=14&count=6` | | `{ pro, says, tz, weekly, blocked, open: [Slot] }` |
| pro | POST | `/api/pro/jobs/:id/offer` | as before + `slots?: [ISO \| { from }]` (up to 3) | each checked against the pro's hours and the job's window (`400 slot` with `next` open slots). Without `slots`: `arrival` (checked when the pro has hours), else the first open slots |
| customer | POST | `/api/jobs/:id/offers/:offer/accept` | as before + `slot?: 0-2 \| ISO` | the chosen slot (default the first); `400 slot` lists the offer's slots |
| customer | POST | `/api/jobs/:id/reschedule` | `{ from: ISO, reason }` | Job + `rescheduled` (applied) or `proposal` (+ `answeredBy` when the demo pro's agent accepted at once) |
| customer | POST | `/api/jobs/:id/reschedule/:proposal` | `{ accept: bool, note? }` | Job (answers the pro's proposal) |
| pro | POST | `/api/pro/jobs/:id/reschedule` | `{ from, reason }` | Job (pro view) + `rescheduled` or `proposal` |
| pro | POST | `/api/pro/jobs/:id/reschedule/:proposal` | `{ accept, note? }` | Job (pro view) |

**Rules (code):** moves happen after hiring and before work starts (`agreed`, `held`; else `409 state`); `reason` is 4+
characters. The new slot must be inside the pro's hours (`400 slot`, with `next`); a pro's must also be inside the job's
window, a customer's may go past it (the window grows to fit; a timeline note says so). With **24 hours' notice or
more** before the booked slot, the move applies at once and the other side is told (`rescheduled`); with less, it's a
**proposal** the other side accepts or declines (`reschedule_proposed`, `reschedule_declined`). A demo pro's agent
accepts a customer's proposal at once when it fits their hours (labelled). A new proposal supersedes an open one.

Job additions: `offers[].slot`, `offers[].slots: [Slot]`, `agreed.slot`, `visit: { slot, proposal: { id, by: "customer"|
"pro", from, to, minutes, reason, at, noticeHours, status: "proposed"|"applied"|"declined"|"superseded" } | null, history:
[{ at, event: "booked"|"proposed"|"moved"|"declined", slot?, from?, by, reason?, how? }], noticeHours: 24, rule } | null`.
`Pro.availability`: the availability + `says`, `tz`. Agents: customer `accept_offer {…, slot}`, `reschedule {job, from,
reason}`, `answer_reschedule {job, proposal, accept, note?}`; pro A2A `set_availability {weekly, blocked?, visitMinutes?}`,
`my_availability`, `offer {…, slots?}` (the REST body's `slots`), `reschedule {job, from, reason}`,
`answer_reschedule {job, proposal, accept, note?}`. Inbox actions: `slot_booked`, `rescheduled`, `reschedule_proposed`,
`reschedule_declined`.

## AP2-style signed mandates (PLAN §15 item 2)

Before an agent moves its person's money, it can be made to show a **mandate the person signed**: what the agent may
do, up to how much, for which job, until when, once. Like AP2's intent mandate. The server verifies it, refuses
anything outside it, keeps every mandate used or refused, and puts each in a signed receipt, so it lands in the
transparency log (`/api/receipts/log/checkpoint`) and can be audited later.

**When it's required.** When the person turns it on (`PUT /api/limits { requireMandate: true }`, PIN), or the token was
made mandate-only (`POST /api/tokens { …, requireMandate: true }`). Off by default in this demo, so existing agent
clients keep working. A mandate an agent sends is always verified, required or not.

**Which tools** (the scope each needs): `accept_offer` (`hold`: the offer's price), `approve_change` (`approve_change`:
the change order), `confirm_checks` (`confirm`) and `release` (`release`): the milestone's due, `approve_materials_advance`
(`materials_advance`: the advance), `tip` (`tip`: the tip). Each takes `mandate: { payload, signature, kid? }` over MCP,
REST and A2A. `maxAmount` bounds what the action commits (for a hold, the agreed price: the buffer on top is bounded by
the job's ceiling, as always). The person's other limits still apply.

`payload` (signed exactly as sent): `{ type: "DoneMandate", version: 1, payer: <person id>, agentClient: <the agent's token
id, tok_… (whoami.you.agentClient)>, maxAmount: <USD>, currency: "USD", scope: ["hold"|"approve_change"|"confirm"|
"release"|"materials_advance"|"tip", …], merchant: "VeriPay", jobId: <job id> | null, expires: ISO (at most 30
days), nonce: <random, 8+ chars> }`. `signature`: Ed25519 over the UTF-8 bytes of the payload's canonical JSON (keys
sorted, no spaces; `proof/merkle.js canonical`), base64url.

**Refusals** are `403 mandate` with `reason`: `missing` (+ `needs: { action, scope, amount, job }`), `shape`, `type`,
`merchant`, `payer`, `agent`, `scope`, `expired`, `expires`, `job`, `amount`, `nonce`, `replay` (already used),
`signature`. A refused or used mandate is recorded; a mandate whose action then fails (e.g. `409 state`) isn't used up.
A successful answer adds `mandate: { id: "mdt_…", hash, signedBy: "the person's own key (<label>)"|"server-held demo
key", receipt: "rcpt_…", used: true }`; the job keeps `job.mandates: [{ id, action, amount, hash, signedBy, receipt, at }]`.

| Who | Method | Path | Body | Returns |
|---|---|---|---|---|
| person | GET | `/api/mandates` | | `{ keys: [{ kid, x, label, created }], serverKey: { kid, x, label }, requireMandate, scopes, merchant, mandates: [Record] }` |
| person (PIN) | POST | `/api/mandates/keys` | `{ x: <Ed25519 JWK x>, label? }` | `{ kid, x, label }`: the person's own public key |
| person (PIN) | DELETE | `/api/mandates/keys/:kid` | | `{ ok }` |
| person (PIN) | POST | `/api/mandates/issue` | `{ agentClient: tok_…, maxAmount (USD), scope: [...], jobId?, minutes? (default 60) }` | `{ mandate: { payload, signature, kid }, signedBy: "server-held demo key", label, hash }`: **the demo path** for agents without a key, signed by a per-person key the server holds, only after the PIN step-up. Give `mandate` to the agent |
| staff | GET | `/api/staff/mandates` | | `{ mandates: [Record] }` |
| agent | `mandate_template {action, maxAmount, job?, minutes?}` | | | `{ payload, sign (the exact string to sign), how, signedFor }` |
| agent | `whoami` | | | `you.agentClient` (the token id the payload names), `you.requireMandate` |

`Record`: `{ id, at, status: "issued"|"used"|"refused", payer, hash, payload, signature, kid, signedBy, action, amount
(cents), jobId, result, reason, note, receipt }`. `my_limits` / `/api/limits` add `requireMandate`; `GET /api/tokens`
rows add `requireMandate`. Inbox category `mandates`. `/llms.txt` explains it for agents.

## Spanish for pros (PLAN §15 item 5)

A pro's setting `lang: "en"|"es"`. With `"es"`, every pro-facing message from the API is in Spanish: errors (`message`;
the English in `messageEn`), the job's `next` (`nextEn`) and `waitingOn` (`what`, `whoEs`, `whatEn`), readiness
(`blockers[].say`, `recommended[].say`; `sayEn`), offer warnings (`warningEn`), A2A answers, `wait_for_news` events
(`title`, `summary`; `summaryEn`), inbox items and the simulated email/SMS. Answers carry `lang: "es"`. A line the
small, hand-written catalog (`api/src/i18n.js`) doesn't know stays in English with `untranslated: true`; nothing is
machine-translated. The customer side stays English.

| Who | Method | Path | Body | Returns |
|---|---|---|---|---|
| pro | PUT | `/api/pro/settings` | `{ lang: "en"\|"es" }` | Pro self view (`lang`); 400 `lang`, `fields` |
| pro's agent | A2A `set_language` | `{ lang }` | | `{ lang, says }` |

Every `/api/pro/*` answer (website) and every pro A2A answer is localized. `Pro.lang` is in every pro view.

## Insurance claim package (PLAN §15 item 6)

For a water-damage or leak job (its text or scope names a leak, drip, burst or broken pipe, flood, water damage, a
water heater, overflow, seepage, moisture or mold), a document for the homeowner's insurer, written by code from the
job's records like the close-out package. It says on every copy: **"Prepared from the job's records by VeriPay
(written by code, no model); not an insurance claim filing. The homeowner files the claim with their insurer."**

| Who | Method | Path | Returns |
|---|---|---|---|
| customer, landlord or tenant | GET | `/api/jobs/:id/reports/insurance.html \| .pdf \| .json` | the package; `409 not_eligible` for other jobs |
| agent | `get_report {job, kind: "insurance"}` | | the JSON + `html`, `pdf` links |

JSON: `{ kind: "insurance", job, title, status, address, pro: { name, id } | null, lossReported, damagePhotos: [{ id,
phase: "reference"|"before", label, taken, uploadedAt, gps, sha256, url, by }], cause: { notes: [{ from: "the job as
posted"|"the tenant"|"the pro's note"|"the pro's change order (…)", at, text }], says }, workDone: { items, conditions: [{
id, what, verdict, reason, decidedBy, checker, after: [{ id, taken, url }] }] }, receipts: [{ id, name, text, uploadedAt,
sha256, url }], materials: [{ what, kind, approved, advanced, invoice }], payments: [{ at, kind, amount (cents), paypal,
order?, note }], paypalIds: { order, authorization, captures, payouts }, totals: { paidForTheWork, captured, refunded,
toPro, fee } (cents), timeline: [{ at, what }], paidAt, label, notAFiling: true }`. The HTML shows the photos (served
to signed-in parties); the PDF is text (Letter, Helvetica) and points to the HTML for the photos. `GET /api/jobs/:id/reports` lists it in `available.insurance` (the two
links) when the job is eligible, else `null`.

## Home profile and maintenance agent (PLAN §16 item 1)

Each customer's home record, built from their jobs (code, no model):
- **Appliances:**
  - found in paid jobs: a water-heater replacement adds a water heater, with gallons from the scope's spec and brand,
    model and serial from the rating plate the checker read (`plateReadBy`);
  - or added by the person.
- **Service history:** every hired job.
- **Warranties:** each paid job's workmanship window, plus a *typical* manufacturer warranty by appliance kind
  (labelled "a rule of thumb, not read from your paperwork").
- **Suggestions:** the maintenance agent is rules on age, the last service and warranty dates, for example:
  - flush a tank water heater about yearly;
  - check the anode rod at 3–9 years;
  - plan a replacement past its usual life;
  - a check before a warranty ends (60 days for a manufacturer warranty, 30 for workmanship);
  - book the next clean after 28 days.

| Method | Path | Body | Returns |
|---|---|---|---|
| GET | `/api/home` | | Home |
| POST | `/api/home/appliances` | `{ kind, label?, brand?, model?, serial?, capacityGal?, installed? (YYYY-MM-DD), notes? }` | Appliance (400 `kind`, `installed`, `fields`) |
| DELETE | `/api/home/appliances/:id` | | `{ ok }` (only person-added ones) |
| GET | `/api/home/suggestions` | | `{ suggestions: [Suggestion] }` |
| POST | `/api/home/suggestions/:id/accept` | `{ budget? (USD) }` | Job (posted, offers asked for) + `suggestion`. 409 `state` for a suggestion that is an action on a job (see `action`) |
| POST | `/api/home/suggestions/:id/dismiss` | | `{ ok }` |
| agent | `my_home`, `maintenance_suggestions` (read); `accept_suggestion {suggestion, budget?}` (hire) | | the agent posts it within the person's `perJobMax` (else `403 limit` + `askPerson`) |

`Home`: `{ person, address: { zip, line }, appliances: [Appliance], history: [{ job, number, title, trade, status, pro,
agreedAt, paidAt, paid: Money, closeout (PDF url, paid jobs) }], warranties: [{ kind: "workmanship"|"manufacturer
(typical)", job?|appliance?, number?, label?, title?, pro?, until, status?, daysLeft, source }], suggestions, label }`.
`Appliance`: `{ id: "apl_…", kind: water_heater|faucet|toilet|drain|dishwasher|garbage_disposal|water_softener|hvac|other,
label, installed, capacityGal, brand, model, serial, plateReadBy?, source, job?, number?, pro?, ageYears, service:
[{ job, number, at, title }], warranty: { until, years, source } | null, expectedLifeYears }`.
`Suggestion`: `{ id: "sug_…" (stable), kind: flush|inspect|replace|warranty|repeat, appliance?|job?, title, why, due, trade,
text (the job it posts), budget: Money, action?: { claimDefect | repeat: url }, source: "rules", label }`. An accepted or
dismissed suggestion stops showing.

## Verified work record for pros (PLAN §16 item 2)

A portable record of every job a pro was paid for on its checks: status `released`, and not released over failed
conditions. Each entry carries **no customer data**: no names, addresses, job ids or exact amounts. It has the trade,
the month (Austin), the conditions passed, the milestones, an amount band and "PayPal". Each entry is signed by the
platform (Ed25519, the receipts key at `/.well-known/done-receipts.json`). It is tied to the job's signed release
receipt by that receipt's hash, the receipt's Merkle path to its batch root, and the batch's inclusion proof in the
signed transparency-log checkpoint. Anyone can check all of it with the public key alone, without seeing the receipt.

| Who | Method | Path | Returns |
|---|---|---|---|
| public | GET | `/api/pros/:id/record.json` | Record |
| public | GET | `/api/pros/:id/record.html` | a public page (months, trades, conditions passed, amount bands, log entries) |
| public | POST | `/api/work-record/verify` | `{ record }` (or the record itself) → `{ record: bool (its signature), entries: [{ receiptHash, hash, signature, proof, log, ok, inLog }], ok, allInLog }` |
| pro agent | A2A `my_work_record` | | Record |

`Record`: `{ type: "DoneWorkRecord", version: 1, pro: { id, name, trade, demo }, entries: [entry hash], issued, signature
(over { type, version, pro, entries, issued }), kid, publicKey, count, summary: { jobs, conditionsPassed, conditionsTotal,
byTrade, byBand, months }, records: [Entry], label, howToVerify }`.
`Entry`: `{ body: { type: "DoneWorkRecordEntry", version: 1, pro, trade, month, conditions: { passed, total }, milestones,
amountBand: "under $100"|"$100-$250"|"$250-$500"|"$500-$1,000"|"$1,000-$2,500"|"$2,500-$5,000"|"$5,000 and up", paidVia:
"PayPal", receiptHash, issued }, hash (sha256 of canonical body), signature (Ed25519 over canonical body, base64url), kid,
log: { receiptId, batch: { id, root, at, count, log }, proof: [hex], inclusion: { index, size, proof: [base64] }, entry,
checkpoint (the signed note), origin } | { receiptId, pending: true, says } }`. Receipts join the log every few minutes;
until then an entry is signed but `pending` (`inLog: false`).

## Neighborhood group jobs (PLAN §16 item 3)

Households in one ZIP with the same job type (the scope writer's template: drain, faucet, water heater, cleaning…)
join one group. The group's pro quotes each household its own price less a group discount, for one trip:
**10% with 2 households, 15% with 3, 20% with 4 or more** (the demo pros' rule, code). Every household's job stays its
own: its own offer (tagged with the group), its own PayPal hold, its own checks and payment. When someone joins, the
offers are priced again (the old ones become `superseded`). Agents may join for their person within the person's limits.
At most 8 households; a group is open 7 days.

| Method | Path | Body | Returns |
|---|---|---|---|
| GET | `/api/groups?zip=&type=` | | `{ groups: [Group] }` (default: the person's ZIP) |
| GET | `/api/groups/:id` | | Group |
| POST | `/api/groups` | `{ job }` (yours, scoped or offered) | Group (409 `state`, 404) |
| POST | `/api/groups/:id/join` | `{ job }` or `{ text, budget? (USD) }` (a job is posted in the group's ZIP) | Group + `job` (400 `group`: other ZIP or type, full, already in; 409 `state`; 403 `limit` for an agent over `perJobMax`) |
| agent | `list_groups {zip?, type?}`, `open_group {job}`, `join_group {group, job? \| text, budget?}` | | then `accept_offer` on the group offer, as usual |

`Group`: `{ id: "grp_…", zip, type, trade, title, status: "open"|"closed", created, closes, households, discountPct,
nextDiscountPct, pro: { id, name } | null, members: [{ you, job (yours only), status, joinedAt, by: "person"|"agent" }],
yourJob?, yourOffer?: { id, amount, solo, says }, rule, source: "rules" }`. Offers from a group add `group`, `groupSays`,
`discountPct`, `soloPrice` (Money). `job.group` is the group id. The seed has an open group (two households, drains,
78704) priced by a demo pro.

## Pro earnings dashboard (PLAN §16 item 4)

For AG Grid and AG Charts. Every figure comes from the jobs' ledgers, in cents; totals are also Money.

| Method | Path | Returns |
|---|---|---|
| GET | `/api/pro/dashboard?months=12&from=YYYY-MM&to=YYYY-MM` | Dashboard |
| GET | `/api/pro/dashboard.csv?months=12` | the rows as CSV (`columns` order; USD with 2 decimals) |
| A2A | `my_dashboard {months?}` | Dashboard |

`Dashboard`: `{ pro, currency, totals: { jobs, paidJobs, gross (captured - refunded), fees, earlyPayFees, net (to the pro
+ materials advances + tips), toPro, helpers, materialsAdvances, tips, refunded: Money, feeRate }, timeToPaid: {
medianMinutes, meanMinutes, n, says } (from the last evidence sent to the payout), fixRate: { rate (0-1), sentBack,
checked, says } (jobs where a check asked for a fix), ratings: { mean, n, byStars }, disputes, monthly: [{ month, jobs,
paidJobs, gross, fees, net, tips, materials, medianMinutesToPaid }] (oldest first, empty months included), rows: [{ job,
number, title, trade, zip, status, agreedAt, paidAt, month, price, gross, fee, earlyPayFee, toPro, helper, materials,
tips, net, refunded, checked, fixRounds, sentBack, minutesToPaid, rating, disputed, paid }], columns, export: { csv,
books }, label }`.

## Judging round 2 changes

**The judges' tour shows the AI and the money moving by itself.**
- **Photos:** the tour job uses the real demo photos (`demo-assets/real`, credited). Tour jobs share that library, so
  the same real photo appears on every tour job. Between tour jobs this isn't a reuse: the checker's reuse history leaves
  out the other tour jobs' photos, and the condition carries the signal `"demo library photo (tour)"`
  (`J.TOUR_LIBRARY_SIGNAL`) and `tourLibrary: n`. Real jobs keep full reuse detection: a tour photo sent on a real job
  still fails as reused.
- **Model budget:** tour checks give the models `DONE_TOUR_MODEL_MS` (default 30000).
- **Release:** the tour job is instant release. When every condition passes on the models and code, code releases at
  once.
- **Answer:** `tour.ai: { checker, decidedFrom, decision, decidedBy, conditions: [{ id, verdict, by, confidence,
  needsPerson, library }], autoReleased, modelBudgetMs, says }`.

**Mandates in the tour.** The tour customer has `requireMandate` on, and the tour's agent token is mandate-only
("Tour agent (demo, mandate-only)").
- Step `approve_change`: the agent approves the $47.05 change order with a mandate issued for it (maxAmount $48, scope
  `approve_change`, this job, 30 minutes) and **accepted**.
- New step `overspend`, between `approve_change` and `evidence`, also in `all`:
  - the same mandate is sent again and **refused**, `reason: "replay"`;
  - a $20 mandate for the $47.05 change order is **refused**, `reason: "amount"`.
- Nothing moves.
- `tour.mandates: [{ at, step, outcome: "accepted"|"refused", reason, says, mandate?, receipt?, maxAmount?, label: "signed by a key the server holds for you" }]`.
- `tour.next` adds `approve_change → overspend → evidence`.

**`GET /api/example-job` (the home hero).** It picks the paid demo job whose checks the models decided:
- first jobs with at least one model-judged condition;
- then the fewest conditions left to a person;
- then the most model-judged;
- then the newest.

It never picks a job where every photo or note condition passed on code alone ("content not judged"). With the rules
alone that leaves none: `404 not_found` with a message saying so. The answer adds `exampleWhy: { total, modelJudged,
personConfirmed, notJudged, allNotJudged: false, checker, says }`.

**Condition wording.** A change order's reason in the parts-receipt condition is its first clause (before ";" or "("),
else cut at a word with "…". It is never cut mid-phrase. Before: "Receipt for the parts and materials (the shut-off valve
… weeps; replacing it, with the ), dated during the job". Now: "Receipt for the parts and materials (the shut-off valve
under the sink is corroded and weeps), dated during the job". Jobs stored before the fix keep their old wording.

**The tour's work order (video fix).** The tour posts "Kitchen faucet keeps dripping even when it's off. Replace the
worn cartridge this week, $200 max. Send a photo of the faucet working after the repair, and the parts receipt."
- **The AI's draft:** the AI (done-chat) writes the work order, with up to `DONE_TOUR_MODEL_MS` (30 s) to answer.
- **The customer's edit:** the tour's customer then edits it, so `scope.editedBy` is `"person"` and `scope.tourEdit`
  says what changed and why. The photo conditions become two a photo can show:
  - "Photo of the faucet with the water running after the repair";
  - "Photo of the faucet turned off after the repair, with no water dripping".

  The AI's other conditions are kept.
- **Why:** a still photo can't show the cartridge inside or "no drip after 30 seconds", and those rightly go to a
  person. The demo library has no before/after pair of one faucet, so a pro BEFORE photo would fail "same spot" and go to
  a person too. Instead the customer's own photo of the dripping faucet (`phase: "reference"`) shows the problem, and the
  pro starts without BEFORE photos.
- **Photos:** each tour photo condition gets its own real library photo, picked by what the condition asks. The running
  faucet is `faucet_installed-1`, the faucet off is `faucet_installed-3`. The receipt is read by done-ocr.

Real jobs and the checker are unchanged. On a server with the models live, three tours in a row each ended released by
code with every condition APPROVED by the models (model+vlm, confidence 0.83 to 0.96).

## "Your agent": the one conversation (PLAN §17) — contract (stable)

One thread per signed-in person (customer, landlord or tenant), across all their jobs (`api/src/assistant.js`).

**Who writes what.**
- Agent messages are written by code templates from the job's real state, two short sentences at most (≤ 240
  characters; `textSource: "template"`).
- A model only reads the intent of what the person types (done-chat, JSON, `DONE_INTENT_TIMEOUT_MS` 2500 ms; the
  rules otherwise). The model never sets an amount: amounts come from the person's own words.

**Who acts.**
- The person's built-in agent acts within their limits, as `{ kind: "agent", client: "Your agent (built-in)" }`: post,
  ask for offers, counter, hire within the ceiling, ask for a fix, cancel if `agentMayCancel`.
- Actions only the person may take carry `needsPin: true` and are done as the person, after a PIN step-up: approve a
  change order or materials advance, confirm, dispute, tip, hire over the ceiling.

| Method | Path | Body | Returns |
|---|---|---|---|
| GET | `/api/assistant/thread?after=<seq>` | | `{ messages: [Msg] (seq > after, oldest first), seq (the latest), waitingOn: [{ job: { id, number, title }, ask }], suggestions: [string] }`. A first call on an empty thread makes the hello message |
| POST | `/api/assistant/message` | `{ text }` | `{ messages: [Msg] }`: every message added during the call (yours first, with `intent`), including the proactive ones the call caused. 400 `text` if empty |
| POST | `/api/assistant/act` | `{ action }` (an `Action.id`) | `{ messages: [Msg] }`. `403 { error: "step_up", stepUp: "/api/auth/step-up", action }` when `needsPin` and the session isn't stepped up (nothing happens); `404` unknown action; `409 state` already done. The web then shows the PIN sheet, calls `POST /api/auth/step-up {pin}` and repeats the `act` |

`Msg`: `{ id: "am_…", seq, at, from: "agent"|"you"|"system", text, textSource: "template"|"you", job?: { id, number,
title }, card?: { kind, data }, actions?: [Action], replyTo?: msgId, intent?: { intent, source: "model"|"rules" } (on
your messages), reminder?: true, key? }`.
`Action`: `{ id: "act_…", label (≤ 3 words), style: "primary"|"secondary"|"danger", needsPin, href? (open this URL,
e.g. PayPal's approval; no act call needed), done, outcome?: "done"|"superseded"|"asked again" }`. When an action is
done, its message's `actions[].done` turns true. When an answer makes a question moot (another offer hired, a change
order decided elsewhere), its buttons are closed: `outcome: "superseded"`.

**Intents of typed text:** `post_job` (describes work: posts it with the AI work order, budget from "$200" / "under
200", then asks for offers), `status` ("what's happening": a `job_summary` card per active job), `hire` ("yes",
"hire": the best offer), `counter` ("counter at $150"), `approve` (answers with the PIN button), `decline`, `cancel`
(asks first), `reschedule` (offers the pro's next open slots as buttons), `help`, `unclear` (one short question back).

**Proactive messages** come from one hook on the activity log, one message per event at most. Each is keyed by the event
id (`key: "ev:<id>:0"`), so a restart (`catchUp()`) or a replayed event never makes a second one:

| Event | Text (example) | Card | Actions |
|---|---|---|---|
| job posted | "I wrote the work order: 4 things to prove it's done, up to $200.00. I'm asking pros nearby now." | work_order | |
| offers in (the first, then once at 3) | "3 offers in; the best is Eastside Pipe & Drain at $185.00. Hire them?" | offers | Hire XX (or "Hire (PIN)" over the ceiling), Counter, Wait |
| hold placed | "… is hired. $222.00 is held with PayPal, not charged." | hold | |
| hold needs approval / failed | "Approve the $222.00 hold in PayPal…" | hold | Open PayPal (`href`) / Try again |
| visit booked, moved; pro arrived | "… comes Nov 7, 9:00 AM." / "… arrived and started." | visit | |
| pro proposes another time | "… asks to come … instead." | reschedule | Accept, Decline |
| change order | "… needs +$45.00: the shut-off valve is corroded." | change_order | Approve (PIN), Decline |
| materials advance asked | "… asks to be paid $87.03 for materials now." | change_order | Approve (PIN), Decline |
| checks done | "All 4 checks passed." / "2 of 4 need your look." / "1 of 4 didn't pass. Your call." / "1 of 4 needs a fix; I've sent … back." | checks | in review: Confirm (PIN; only when nothing failed), Ask a fix, Dispute (PIN) |
| paid | "Paid. … got $166.50 through PayPal." | paid | Tip $10 (PIN), Rate 5★ |
| fix asked, dispute opened/settled, cancelled, tip paid | one line each | fix / dispute / refund / job_summary / receipt | |
| tenant's note / pick (to the landlord); landlord hired (to the tenant) | | landlord / offers / hold | Hire them (landlord) |
| the tour's mandate steps | "I approved it with your signed mandate (up to $48)." / "…refused, it's single-use." / "…refused, over its limit." | mandate | |

Timed follow-ups run on the demo clock (the server's tick):
- **Reminder:** a question with an open primary button, unanswered for `DONE_ASSISTANT_REMIND_MIN` (30) demo-minutes,
  while the job still waits on the person, is asked again once: "Still waiting on you: …", with fresh buttons.
  `reminder: true`, `replyTo` the original, whose buttons close as "asked again".
- **Hold ending:** a hold ending within 3 days.
- **Warranty ending:** a warranty ending within 7 days.
- **Maintenance due:** from the home profile, with Book it and Not now.

**Cards** (`card.data`; every amount is integer cents; `rail` is `{ stages: ["posted","offers","hired","held","working",
"checking","paid"], current, index, status, ended }`):
- `hello`: `{ limits: { perJobMax, monthlyMax, changeMax }, suggestions }`
- `work_order`: `{ job, title, trade, source ("model"|"rules"|"person"), conditions: [{ id, what, evidence, icon:
  "camera"|"receipt"|"note"|"doc"|"ruler" }], ceiling, window: { from, to }, estimate: { low, high, typical, label } | null, rail }`
- `offers`: `{ job, ceiling, range: { low, high, typical } | null, bestId, offers: [{ id, pro: ProChip, amount, ask,
  status, eta, slot, best, overCeiling, group, counter }], rail }`. The price-range bar draws `range`, then a marker per
  offer `amount`, then the `ceiling` line.
- `ProChip`: `{ id, name, initials, rating, jobs, licensed, insured, demo }`
- `hold`: `{ job, pro, money: Money, buffer, honorUntil, expiresAt, approveUrl, paidWith, rail }`
- `Money` (the money bar): `{ currency, price, due, held, captured, paidToPro, fee, refunded, releasedBuffer, holdStatus,
  segments: [{ kind: "held"|"captured"|"paid"|"fee"|"refunded", amount }] (non-zero ones, in order), ids: { order,
  authorization, captures, payout } }`
- `visit`: `{ job, pro, slot, arrival, state: "booked"|"arrived", proposal, rail }`; `reschedule`: `{ job, proposal, slot }`
- `change_order`: `{ job, id, amount, reason, kind, status, agentMayApprove, photos: [Photo], dueAfter, money }`
- `checks`: `{ job, round, milestone, decision: "release"|"needs_fix"|"review", checker, counts: { total, passed,
  person, notPassed }, conditions: [{ id, what, evidence, verdict, label, judge: "model"|"code"|"person", confidence,
  reason, photos: [Photo + { judge, verdict }] }], rail }`. The photo badge is green for model, blue for code, amber for
  person, red x when the verdict isn't pass.
- `Photo`: `{ id, url: "/api/jobs/:id/evidence/:eid" (the person's session can fetch it), phase, taken, label }`
- `paid`: `{ job, stamp: "PAID", pro, money, payout: { batchId, status, via }, paidAt, rail }`
- `fix`: `{ job, reason }`; `dispute`: `{ job, dispute: { id, by, suggestion }, money }`; `refund`: `{ job, money,
  resolution }`; `receipt`: `{ job, tip, money }`; `landlord`: `{ job, notes, pick }`; `mandate`: `{ job, outcome, reason,
  maxAmount, receipt, label }`; `maintenance`: `{ suggestion, kind, title, due, budget, appliance }`; `job_summary`: `{ job,
  number, title, status, pro, money, waitingOn, rail }`

**The judges' tour** (`POST /api/demo/tour`, unchanged) plays out in the tour customer's thread, because every step is
a job event: work order, offers, hold, change order, the mandate steps, checks, paid. The website can show the tour as
the conversation by polling `GET /api/assistant/thread?after=` while it runs.

### The pro's agent: the same thread, camera-first

Signed in as a pro (`api/src/proAgent.js`), the shape is the same as the customer's (`Msg`, `Action`, cards). Text is
in Spanish when the pro's `lang` is `"es"` (`PUT /api/pro/settings`).

| Method | Path | Body | Returns |
|---|---|---|---|
| GET | `/api/pro/assistant/thread?after=<seq>` | | `{ messages, seq, lang, waitingOn: [{ job, ask }] }` (a hello on first call) |
| POST | `/api/pro/assistant/message` | `{ text }` | `{ messages }`. Words: "status"/"estado", "arrived"/"llegué" (I've arrived), "send"/"enviar" (camera + send), "payout"/"pago" (the last payouts as `paid` cards) |
| POST | `/api/pro/assistant/act` | `{ action }` | `{ messages }`; `403 step_up` for `needsPin` (early pay) |

| Event | Pro message | Card | Actions |
|---|---|---|---|
| a job in the pro's feed asks for offers | "New job near you: Clear the drain, 3.2 mi, up to $300.00. Offer?" (a demo pro's own agent already quoted: "…Your agent offered $175.00.") | work_order | Offer $X (the pro's own rules' price), Skip |
| the customer counters | "The customer counters $150.00." | offers | Accept, Decline |
| not chosen | "The customer chose another offer." | | |
| hired | "You're hired at $185.00. Arrive Nov 7, 9:00 AM." | visit | |
| money held | "The money is held. Start when you arrive." | visit | I've arrived |
| started | "Started. Take a photo for each condition." | work_order | Take photos (`href: /pro/jobs/:id?camera=1`: the camera page uploads with `POST /api/pro/jobs/:id/evidence`), Send for check |
| change order approved / declined | "Change order +$45.00 approved." | change_order | |
| a fix needed (check or customer) | "2 need a fix." | checks | Take photos, Send for check |
| in review / every check passed | "The customer is looking at it." / "Every check passed." | checks | |
| paid | "Paid $166.50 to your PayPal." (or Venmo) | paid | Early pay (PIN), while a milestone waits in its review window |
| the customer asks to move the visit | "The customer asks to move it to …" | reschedule | Accept, Decline |
| a tip | "A $10.00 tip, all yours." | paid | |

Actions with `href` are links (the web opens them; no act call). Nothing in the pro thread changes where a pro is paid.

## Display text without demo disclaimers (2026-11-06)

Display names and sentences carry no demo small print any more; machine flags still do.
- **Names:** pros, companies and people are shown by their plain names. There is no "(demo)" and no "Demo · ".
  Stored names are cleaned on start. `demo: true` stays on pros and people.
- **Agent labels:** "Barton Creek Plumbing's agent", "Customer's agent", "Riverside Property Management's agent".
- **Pros:** licence badges read "M M-90417" (no "(demo registry)"). `Pro.agentNote` is `null`.
  `payout.demoAddress: true` has no `says`.
- **Evidence:** library photos carry `libraryPhoto: true` instead of a credit caption. `/api/credits` is unchanged.
- **Views:** `clock.says` is `null`. `aheadMinutes` and `recent` stay.
- **The outbox:** status is `"not_sent"`, with no label.
- **Kept:** the DEMO marking on drawn receipts and permits, the README, and the notes in `/llms.txt` for agents.

**Assistant polish (after the 8810 check).**
- **One offers message per job.** The offers message is a live message, updated in place as offers come in. It keeps
  the same `id` and gets a higher `seq`, so a client polling `?after=` receives it again and redraws it; it carries
  `live: "offers:<job>"` and `updates: n`. Its earlier buttons close as `outcome: "updated"`.
- **Every offer over the ceiling.** The agent's own move leads: "All are over your $150.00; I can counter at
  $150.00." The buttons are **Counter $150** (primary, the agent's, no PIN), then Hire (PIN), then Wait.
- **Demo pros' agents meet the budget.** A counter at the job's price ceiling is accepted when it's at least 75% of
  their ask (`answerCounter({ atCeiling })`). The agent then offers "Hire at $150" with no PIN.
- **Tighter typical range.** Each demo band is the typical price −25% / +30%; the drain band is now $130–$230. With
  history, the middle half is kept within −25% / +35% of the median.
- **The money bar after release.** `held` is what the authorization still holds: 0 once the final capture has
  released the rest. `releasedBuffer` is what was held and never captured. Every captured cent sits in exactly one
  segment.
- **Hire button.** It names the pro by the first word of their business ("Hire Eastside").
- **Why this offer.** Within the ceiling, the offers text says why in a few words: "the best is Eastside at $150.00,
  best rated, under your max. Hire them?" (or "lowest price", "a typical price").
- **The pro's thread leads with an active job.** On an active job (held, working, needs_fix), the thread opens on its
  next step, even for a pro who signs in later:
  - held: the visit card with **I've arrived**;
  - working or needs a fix: the work order or checks card with **Take photos** and **Send for check**.

  This step is asked once (it isn't repeated while its button is still open).
- **"I've arrived" (pro).** Tapping it, or typing "arrived" / "llegué", starts the work (start_work, with its usual
  checks); the next message is the camera step, **Take photos** / **Send for check**. It is refused, in one line, in
  three cases:
  - **Too early:** more than an hour before the visit, or before the job's window opens. "Your visit is Nov 7, 9:25
    AM: tap again then, or move the visit." with buttons **I've arrived** and **Move visit**. Move visit lists the
    pro's next open slots, and picking one asks the customer.
  - **No hold yet:** the money isn't held. "The money isn't held yet; I'll tell you when it is."
  - **Before photos needed:** the customer asked for before photos first. **Take photos** (`?camera=before`) and
    **I've arrived**.

## Accounts, the demo page, nearby pros, the negotiation layer and pros over MCP

**Accounts.** `POST /api/auth/signup {role: customer|pro, name, email, password (8+), pin (4-6 digits), zip?, business?, trade?, paypalEmail?}` makes a real account (201, signed in); a pro also gets their business, unverified until they verify their PayPal. `POST /api/auth/login {email, password}` signs in again (not stepped up: person-only actions still ask for the PIN). Ten wrong passwords for one email lock it for 15 minutes; an unknown email and a wrong password get the same answer.

**Demo page.** `POST /api/demo/open {feature}` (demo servers only) signs the browser in as the demo person a feature belongs to and returns `{to}`: `ask, offers, held, working, needsfix, paid, dispute, earnings, landlord, groups, home, connect`. Jobs with real (library) photos are picked first.

**Nearby pros.** `GET /api/jobs/:id/nearby` (customer tool `find_nearby_pros {job, radius?, limit?}`): nearest first, the pros on VeriPay for the job's trade and the local businesses OpenStreetMap lists (a dated snapshot in `api/data/osm-austin-trades.json`, ODbL). `POST /api/jobs/:id/ask {to: [ids], question?}` (`ask_pros`): a pro on VeriPay is asked directly (the demo pros' agents answer from their rates; a real pro's agent sees it in `my_inquiries`); a listed business gets an invitation (`status: "draft"`, with its phone and website) for the person to send. VeriPay never contacts a business that isn't on it.

**The negotiation layer.** On an open offer, both sides' agents bargain in rounds that code enforces: turns alternate; the customer's side only goes up and never past the job's price ceiling; the pro's side only goes down and never under its floor (the customer never sees the floor); every move is strictly between the two sides' last prices; 3 moves per side. `accept` takes the other side's last price (the offer then stands at it; the customer's agent hires with `accept_offer`, inside the person's limits and mandate); `walk_away` ends it (the offer stays at the pro's last price). A demo pro's agent answers each move at once. Website: `GET /api/jobs/:id/offers/:offer/negotiation`, `POST .../negotiate {move: propose|accept|walk_away, amount (USD)?, note?}`. Customer tools: `negotiation`, `propose_price`, `accept_price`, `walk_away` ({job, offer, amount?}). Pro tools (MCP and A2A): the same four with `{offer, amount?}`. The job view carries `offers[].negotiation` (rounds, turn, moves left; the ceiling only on the customer's side).

**Where a price sits, and a stuck negotiation.** On the customer's side, `offers[].negotiation` also carries `market: {theirs, yours?}`: for the pro's last price and the customer's last bid, `where` (below, within or above the job's typical range from the estimate), `range`, raw `cents` (for drawing), and when at least 3 comparable jobs were paid here (same template, else same trade) `percentile`, `paidJobs`, `median`, plus a `says` sentence. The pro never sees it. When a negotiation stops converging (the pro walked away, the customer is out of moves, the pro made its last move, or the two sides closed less than 5% of the pro's price in the last round), the view carries `stuck: {why, gap, theirs, market, suggest}` and the customer is told once (`negotiation_stuck` in the inbox), with a next step: hire at it if it's within the range and the ceiling, else ask another pro near the job.

**Reviews.** `POST /api/jobs/:id/reviews {ids}` (customer tool `check_reviews {job, ids}`, ids from `find_nearby_pros`, at most 8): for a listed business, its Google rating, count, up to 5 reviews (author and link as Google returns them) and a code-made read (`verdict`, `praised`, `watch`, `ask`), through the Google Places API (New) `places:searchText` with the operator's `GOOGLE_PLACES_API_KEY` (cached for an hour); without a key, `available: false` and a Google Maps link. Reviews are never scraped. For a pro on VeriPay, its record here (ratings from paid jobs only); the demo pros are fictional and have no Google listing.

**Telegram.** With `TELEGRAM_BOT_TOKEN` set (a bot made with @BotFather), the server long-polls the Bot API (`getUpdates`), so it needs no public URL. A person links a chat from the website (Inbox → Settings → Telegram): `POST /api/telegram/link` makes a one-use code (15 minutes) and a `t.me/<bot>?start=<code>` link; `GET /api/telegram` says whether a chat is linked; `DELETE /api/telegram` unlinks it. The linked chat gets each inbox notification as it's made (with an Open button for the person's own jobs), and works their jobs with the customer tools: a message describing a job is posted after a "Post it" tap; a job card shows offers, each price against the typical range, the negotiation trail, market position and the stuck warning; "Propose a price" takes the amount as a reply; "Pros near the job", "Ask", "Check reviews". Hiring holds money, so the bot never hires: "Hire" sends a one-use link to the job on the website, where the person confirms with their PIN. `TELEGRAM_API_BASE` points the bot at another Bot API server (the tests use a fake one).

**Pros over MCP.** `POST /mcp` with a pro key (`Authorization: Bearer dpk_...`) serves the pro tools (`veripay-pro`): readiness, list_jobs, offer, the negotiation tools, start_work, request_change, submit_evidence, payout_status, my_inquiries and the rest of A2A's pro actions. Customers' agents keep using a person's token (`done_...`) on the same endpoint. Arguments a tool doesn't take are refused (payout routing is never one of them).

## More of PayPal (2026-11-07)

**Over-capture.** At release, an authorization hold may be captured above its amount, within PayPal's allowance: the lesser of 15% and $75 (`overAllowance` in jobs.js). An approved change order that fits the allowance needs no new hold (`change_in_allowance`). If PayPal refuses the over-capture, VeriPay makes a new hold and captures that, logged as "over-capture refused". `PAYPAL_OVERCAPTURE=0` turns this off.

**Changing a hold before approval (Orders v2 PATCH).**
- `POST /api/jobs/:id/hold/buffer {bufferPct: 0–30}` changes the amount of an order that's still waiting for the customer's approval.
- The customer tool is `set_hold_buffer`.

**Parts tracking.**
- `POST /api/pro/jobs/:id/tracking {carrier: UPS|USPS|FEDEX|DHL|ONTRAC|OTHER, trackingNumber, note}`; the pro tool is `add_parts_tracking`.
- After capture, the tracking is sent to PayPal with `POST /v2/checkout/orders/{id}/track`.
- The job view lists it under `tracking[]`, with `onPayPal` set once PayPal has it.

**Disputes agent (PayPal Agent Toolkit).**
- `POST /api/staff/paypal-disputes/triage {auto?, via?}` reads every PayPal dispute with `list_disputes` and `get_dispute`, matches each one to its job by capture, and proposes an action. Code makes the proposal, not a model.
- Possible actions: `send_evidence` (released after a passing check, with a signed receipt), `review`, `wait`, `closed`, `look` (not on a VeriPay capture).
- `auto: true` sends the evidence for `send_evidence` rows. This moves no money.
- `POST /api/staff/jobs/:id/paypal-dispute/accept {note}` accepts the buyer's claim, and PayPal refunds the buyer. It is staff only and never automatic. It calls REST directly, because the toolkit's `accept_dispute_claim` schema checks the note against the dispute-id pattern.
- `GET /api/staff/paypal-disputes/triage` returns the latest run.

**PayPal's hosted MCP server (sandbox keys only).**
- VeriPay connects as an MCP client with the app's access token, using Streamable HTTP and falling back to SSE.
- On 2026-11-07, `https://mcp.sandbox.paypal.com/http` answered 404 and `/sse` worked.
- Live check that day: 46 tools listed; `list_disputes` through PayPal's server returned the sandbox account's disputes (none).
- Only read tools are allowed (`get_`, `list_`, `show_`, `search_`; 16 of the 46). Every other tool is refused, including `record_payment_for_invoice`.
- `GET /api/staff/paypal-mcp` returns the status and tool list. `POST /api/staff/paypal-mcp/call {tool, args}` runs one read tool.
- Triage and the reconciliation session can run their tools this way with `via: "paypal-mcp"`.

**Log in with PayPal (payout account).**
- `POST /api/pro/paypal-login` (the person, PIN) returns PayPal's sign-in URL with a one-use state that lasts 10 minutes.
- `GET /api/pro/paypal-login/callback` exchanges the code (`authorization_code`) and reads `/v1/identity/oauth2/userinfo?schema=paypalv1.1`.
- The payout PayPal becomes that account's confirmed email and payer id, verified by PayPal. The Payouts page has the button.
- Sandbox setup: turn on Log in with PayPal for the app and add the return URL `<PUBLIC_URL>/api/pro/paypal-login/callback` in the developer dashboard.
- The stand-in signs the pro in at once with demo data.

## PayPal, round 3 (2026-11-07)

**Save after purchase.** This was already in place. A hold sends `store_in_vault: ON_SUCCESS`, the vault id comes back with the authorization, and later jobs and repeat visits are held on it without a new approval.

**Invoice extras** (a sent, checked invoice; pro routes):
- `GET /api/pro/invoices/:id/qr.png`: PayPal's QR code to pay (`/v2/invoicing/invoices/{id}/generate-qr-code`; PayPal answers multipart with base64 PNG). Cached on the invoice. The stand-in draws a real QR code of its own pay page.
- `POST /api/pro/invoices/:id/remind`: PayPal reminds the customer (`/remind`). At most one a day here; PayPal allows two.
- `POST /api/pro/invoices/:id/paid-outside {method: CASH|CHECK|BANK_TRANSFER|OTHER}` (PIN): records the payment in PayPal (`/payments`, invoice becomes `MARKED_AS_PAID`) and closes the invoice as `paid_outside`. No platform fee, no payout. The sync recognises a hand-recorded (EXTERNAL) payment and never pays it out.
- Page: `/pro/invoices`.
- Live check on 2026-11-07: QR (620-byte PNG), reminder, cash payment and MARKED_AS_PAID all worked in the sandbox.

**PayPal balance.** `GET /api/staff/paypal-balance` reads `/v1/reporting/balances`: available, withheld, and this server's authorized-but-not-captured holds. The sandbox account's balance includes every test the app ever ran.

**Maintenance plans (PayPal Subscriptions).**
- `POST /api/jobs/:id/plan {amount?}` (customer, PIN; from a released job): creates a catalog product (once), a monthly billing plan and a subscription, and returns PayPal's approve URL.
- Each month PayPal charges the plan. The payment is a cycle `waiting_for_proof`. The pro sends that month's evidence (`POST /api/pro/plans/:id/months/:n/evidence {items, submit}`), and the same checker and code decision pay the pro with Payouts (10% fee kept).
- Outcomes: `needs_fix` or `review`; staff `POST /api/staff/plans/:id/months/:n/decide {pay}`. No proof in 30 days refunds the month (`/v1/payments/sale/{id}/refund`).
- `POST /api/plans/:id/cancel` (customer, PIN) cancels the subscription.
- Pages: the job page's "Monthly plan" panel, and "Monthly plans" on `/pro/invoices`.
- Live check: product, plan and subscription are created in the sandbox (APPROVAL_PENDING with a real approve link). Approving needs a sandbox buyer login, which the demo doesn't have, so the monthly billing ran only in the stand-in.
- Before approval PayPal answers 404 on the subscription's transactions and cancel; sync waits for approval.

**Pay Later message.**
- `GET /api/paypal/messages` returns the app's public client id.
- Under an offer of $200 or more, PayPal's messages component (JS SDK `components=messages`, sandbox, buyer-country US, own namespace) renders PayPal's own Pay Later text, or nothing.
- Display only: PayPal decides at approval. Live check: PayPal rendered a Pay Monthly message for $450.

**Merchant insights.**
- `GET /api/staff/insights?type=SALES|ORDERS&interval=DAILY|WEEKLY|MONTHLY` tries the toolkit's `get_merchant_insights`.
- PayPal answers "not supported in sandbox mode" (2026-11-07, through the toolkit and through PayPal's MCP server). The same series is then computed by code from the ledger (captures, paid invoices, plan months), and the answer says so (`source: "ledger"`).

## PayPal, round 4 (2026-11-07)

**Plans: pause, resume, new price.**
- `POST /api/plans/:id/pause` and `/resume` (customer, PIN) call PayPal's subscription `suspend` / `activate`. A paused plan isn't charged.
- The pro proposes a new monthly price (`POST /api/pro/plans/:id/price {amount}`); the customer accepts it (`POST /api/plans/:id/price/accept`, PIN). The plan's own billing plan is repriced (`/v1/billing/plans/{id}/update-pricing-schemes`, checked live: 204).
- Suspend and activate need an approved subscription. Before approval the sandbox answers 404, so they ran only in the stand-in.

**Unclaimed payouts.**
- `GET /api/staff/payouts/unclaimed` lists them.
- `POST /api/staff/jobs/:id/payouts/:item/take-back` (staff) cancels the UNCLAIMED item (`/v1/payments/payouts-item/{id}/cancel`, checked live: RETURNED) and records `payout_returned`.
- A new payout then waits until the pro (or helper) verifies a different PayPal, and goes out under a new batch id (`-r1`), recorded as `payout_reissued`. The ledger still balances.

**PayPal fees in reconciliation.** Each capture row carries PayPal's fee from Transaction Search (`fee_amount`) against the ledger's `paypal_fee` line; a mismatch is `fee_difference`. Payout rows carry PayPal's Payouts fee. `report.fees` holds the totals.

**Dispute offer.**
- `POST /api/staff/jobs/:id/paypal-dispute/offer {amount, note}` (staff) calls `make-offer` with offer_type REFUND, for part of the disputed amount.
- Triage shows `wait` until the buyer answers. An accepted offer closes the record (`offer.status: accepted`).
- Not tested live: the sandbox can't create a dispute without a buyer login.

**3-D Secure on card holds.**
- `PAYPAL_3DS` = `SCA_WHEN_REQUIRED` (default), `SCA_ALWAYS` or `off`. It sets `payment_source.card.attributes.verification.method` on the test-card hold.
- When PayPal answers PAYER_ACTION_REQUIRED, the hold waits for PayPal's 3DS page (the hold's approve link), then is authorized. The hold shows the liability shift (`hold.threeDS`).
- Live checks: default authorized at once; SCA_ALWAYS returned the 3DS page. Completing the challenge wasn't run.

**Webhook simulator.**
- `POST /api/staff/webhooks/simulate {event_type, job?}` asks PayPal for its own sample event (`/v1/notifications/simulate-event`; checked live: 202) and hands it to the same handler, marked simulated and not signature-verified.
- With `job`, the sample points at that job. PayPal can't reach a local server, so the delivery URL is a reserved `.invalid` address.

**Venmo button.** Already in the JS SDK v6 buttons (`venmo-payments`, shown when PayPal says the buyer is eligible).

**Writes through PayPal's MCP server.**
- Every tool is classed `read` (runs at once), `write_with_approval`, or `refused`.
- Writes with approval are tracking, invoice reminders, QR codes and numbers, auto-reminders, and catalog products. They are proposed (`POST /api/staff/paypal-mcp/propose`) and run only on `.../proposals/:id/approve`.
- Refused tools never run on this path: refunds, orders, captures, subscriptions, invoices sent or paid, and dispute claims.
- Checked live: an approved `generate_invoice_number` returned an invoice number.

## PayPal, round 5 (2026-11-07)

**Pros as PayPal merchants (Partner Referrals v2).**
- `POST /api/pro/paypal-onboarding` (the pro, PIN) returns PayPal's onboarding link (`action_url`). The referral asks for PAYMENT, REFUND, PARTNER_FEE and DELAY_FUNDS_DISBURSEMENT.
- PayPal sends the pro back to `GET /api/pro/paypal-onboarding/return`. `GET /api/pro/paypal-onboarding[?sync=1]` reads the merchant status from PayPal (`/v1/customer/partners/{partner}/merchant-integrations`).
- Statuses: `started`, `linked`, `ready`. `ready` means payments receivable, email confirmed, and VeriPay granted permissions.
- The `MERCHANT.ONBOARDING.COMPLETED` and `MERCHANT.PARTNER-CONSENT.REVOKED` webhooks re-check the status.
- When a pro is `ready`, their holds name them as the payee by `merchant_id`, with VeriPay's fee as `platform_fees`, and no Payouts are made. If PayPal refuses the order, the hold falls back to the platform flow and records why.
- Checked live: the referral returns 201 with a sandbox.paypal.com onboarding link, and the status is "not found" until onboarding is done.
- Not completed in the sandbox: finishing onboarding needs a sandbox business login, and this app is not an approved Commerce Platform partner, so a multiparty order may still be refused. The stand-in onboards at once.

**PayPal's Risk API before every hold.** Set Transaction Context (`PUT /v1/risk/transaction-contexts/{merchant}/{tracking id}`) sends:
- the customer and the pro (account ids and created dates);
- the vertical;
- `highrisk_txn_flag`, from Done-Risk's dispute chance (≥30%).

The order then carries the same id as `PayPal-Client-Metadata-Id`, and the job shows `hold.risk`. The merchant id comes from `PAYPAL_MERCHANT_ID`, or is learned once from an order's payee. Checked live: the context returned 200, and an order with the header was authorized.

**More ways to approve the first hold (JS SDK v6).** A hold waiting for approval can instead be placed with `POST /api/jobs/:id/hold/with {method}`:
- `cardfields`: PayPal's hosted card fields. The order carries only vault and 3-D Secure instructions; the fields submit it.
- `googlepay`: an order with no payment source, confirmed by `confirmOrder` with Google Pay's data.
- `fastlane {token}`: Fastlane's single-use token. It authorizes at once.

Checked live:
- both order kinds were created in the sandbox;
- on a sandbox-mode server, PayPal reported card fields, Google Pay and Fastlane as eligible, and the four hosted card fields rendered.

Not checked: submitting a card through the fields, Google Pay, or Fastlane.

**Saved payment method from PayPal's vault.**
- `GET /api/me/payment-methods` reads the token from PayPal (`/v3/vault/payment-tokens/{id}`), plus the customer's list.
- `DELETE /api/me/payment-methods` (PIN) deletes the token at PayPal. Holds already placed stay.
- Checked live: get and delete work. The list by customer id returned 0 right after vaulting.

**Invoice templates (Invoicing v2 templates).**
- `POST /api/pro/invoice-templates` (from an invoice, or fields) and `DELETE /api/pro/invoice-templates/:id`.
- `POST /api/pro/invoices {template, customer}` makes a draft from a template, with `detail.template_id`. The checks still run.
- Checked live: create, get and delete; an invoice with `template_id` was created.

**Checked live and dropped:** Venmo payouts (`Recipient wallet not supported in sandbox`).
**Not done:** Apple Pay (needs a verified public domain).

## PayPal, round 6 (2026-11-07)

The full list of PayPal integrations, with what was checked live, is in `docs/PAYPAL-整合總表.md`.

**Delayed disbursement and Referenced Payouts.**
- A pro onboarded as a merchant is paid by a capture with `disbursement_mode: DELAYED`, with VeriPay's fee as `platform_fees`. The payout shows `held_at_paypal` until `DONE_DISBURSE_DAYS` have passed (default 2).
- After that, the tick releases the money with `POST /v1/payments/referenced-payouts-items` (status `disbursed`). It waits while a dispute is open.
- Checked live: the endpoint answers this app. On a capture that was not delayed it returns `422 TRANSACTION_NOT_VALID`.
- The full flow ran only on the stand-in, because it needs an onboarded pro.

**Payment Links.**
- Endpoints:
  - `GET /api/pro/paylinks`
  - `POST /api/pro/paylinks {title, amount, purpose}` (the pro, PIN), through the Pay Links API
  - `POST /api/pro/paylinks/:id/sync`
  - `POST /api/pro/paylinks/:id/close`
- A payment is found with Transaction Search, by the link's item name and amount. VeriPay keeps its fee and pays the pro with Payouts.
- Checked live: create and delete work. The sandbox's search had no data yet for the window (404), which counts as "no payments yet".

**Card bank's answers.** A card hold keeps the authorization's `processor_response` as `hold.processor {avs, cvv, response, says}`. Checked live: the sandbox test card returned CVV `M`, AVS empty, response `0000`.

**Returning payer.** `GET /api/paypal/sdk` mints the client token with `target_customer_id` when the person's PayPal is in the vault. Checked live: a token was issued for a vault customer.

**Partner attribution.** Every call sends `PayPal-Partner-Attribution-Id`: `PAYPAL_BN_CODE`, or a placeholder until PayPal issues one. Checked live: an order with it returned 201.

**Webhook catch-up.**
- `GET /api/staff/webhooks/paypal-events` lists the last 7 days of events from PayPal's webhooks-events and marks which this server handled.
- `POST …/:id/replay` fetches an event from PayPal and handles it here (marked replayed). `POST …/:id/resend` asks PayPal to deliver it again.
- Checked live: the list API works (0 events, since PayPal has no public URL to deliver to).

**Invoice search.** `GET /api/staff/paypal-invoices?status=SENT` uses PayPal's search-invoices and shows VeriPay's number for invoices that are ours. Checked live: 13 sent invoices.

**Disputes: message and appeal (staff).**
- `POST /api/staff/jobs/:id/paypal-dispute/message {message}` writes in PayPal's dispute thread.
- `POST …/appeal {notes}` appeals once after PayPal decides, with the job's evidence and signed receipt.
- Stand-in only: the sandbox can't open a dispute without a buyer login. A fake id returns 400.

## PayPal, round 7 (2026-11-07)

- **Refunds as an onboarded pro.** A refund on a multiparty capture to an onboarded pro is sent with `PayPal-Auth-Assertion` (`iss` = this app, `payer_id` = the pro's merchant id) and gives back VeriPay's fee on that part (`payment_instruction.platform_fees`). This is `refundCapture` in jobs.js. Stand-in only (needs an onboarded pro); in the sandbox, fake ids return 401.
- **A missed plan month.** `POST /api/plans/:id/pay-outstanding` (the customer, PIN) charges the subscription's outstanding balance (`/v1/billing/subscriptions/{id}/capture`, `OUTSTANDING_BALANCE`). The payment then waits for that visit's proof like any month. The plan view shows `paypal.outstanding`. Stand-in only.
- **Cancel a sent invoice.** `POST /api/pro/invoices/:id/cancel` on a sent, unpaid invoice withdraws it in PayPal (`/cancel`), and PayPal tells the customer. Checked live: the status became CANCELLED.
- **Payouts to a PayPal account id.** A pro whose PayPal was verified with Log in with PayPal is paid with `recipient_type: PAYPAL_ID` (their payer id) instead of their email.
- **Save PayPal without a purchase.** `POST /api/me/payment-methods/setup` (PIN) creates a Vault setup token. After the person approves at PayPal, `GET /paypal/vault-return` turns it into the saved PayPal. Checked live: the setup token returned 201 with an approval link; approving needs a buyer login.
- **More webhook events (25 in all).** Added `CUSTOMER.DISPUTE.UPDATED/RESOLVED`, `INVOICING.INVOICE.PAID/CANCELLED`, `BILLING.SUBSCRIPTION.ACTIVATED/SUSPENDED/CANCELLED/PAYMENT.FAILED`, `PAYMENT.SALE.COMPLETED` and `VAULT.PAYMENT-TOKEN.CREATED`. Each one syncs just that dispute, invoice or plan. Every name was checked against PayPal's webhooks-event-types list.

## PayPal, round 8 (2026-11-07)

- **Hold line items.** Every hold's order carries `items` (labor, the pro's parts estimate, the change-order buffer) with `amount.breakdown.item_total`, so PayPal's approval page and receipt show what is held. A buffer change before approval PATCHes the amount and the items together. The job view shows `hold.items`. Checked live: three lines created, then PATCHed to two.
- **Card Level 2.** Card holds send `supplementary_data.card.level_2` (`invoice_id` = job number + hold number, `tax_total` 0). Checked live: PayPal echoed it and the authorization was CREATED (then voided).
- **App Switch and contact preference.** PayPal approvals set `app_switch_preference.launch_paypal_app` and `contact_preference: UPDATE_CONTACT_INFO`. The email and phone the payer confirms come back on the authorized order: `hold.payerContact`, with the phone masked. PayPal accepted the order; App Switch itself needs a phone.
- **Venmo, saved.** `payWith: "venmo"` creates the order with `payment_source.venmo` and `store_in_vault`. PayPal gives a Venmo order no redirect link, so the job page shows only the Venmo button (JS SDK v6). After approval the person's saved method is `venmo:<token>`, and later holds use it with no approval.
- **Invoice tips and partial payments.** `POST /api/pro/invoices` takes `allowTip` and `minDue` (USD), sent as `configuration.allow_tip` and `partial_payment`. A partly paid invoice records `paidSoFar`. The pro is paid once it's paid in full, and the whole tip goes to the pro on top of their 90%. Checked live: PayPal echoed the configuration.
- **Plan setup fee.** `POST /api/jobs/:id/plan` takes `setupFee` (USD, $10–$2,000, not equal to the month), sent as `payment_preferences.setup_fee`. The setup payment becomes its own cycle (`setup: true`), held for the first visit's proof. `payment_failure_threshold` is now 2, so one missed month can be paid with pay-outstanding before PayPal suspends the plan. Checked live: the plan was created with both settings, then deactivated.
- **Returned item on a dispute.** `POST /api/staff/jobs/:id/paypal-dispute/acknowledge-return` (`note`) calls `/v1/customer/disputes/{id}/acknowledge-return-item` with `ITEM_RECEIVED`, once per dispute. The sandbox answered 404 on a made-up id, so the path is right; there is no real dispute to try it on.
- Tests: `test/paypal8.test.js` (6).

## PayPal, round 10 (2026-11-07): the 158-item sweep

Statuses for every item are in `docs/PAYPAL-候選清單.md` (section 五). What changed in the API:

- **Holds.** Each order carries the following, set by `J.holdCtx`:
  - `invoice_id` (the job number plus the hold number);
  - the job site as `shipping` with type `PICKUP_IN_PERSON` (`SET_PROVIDED_ADDRESS`);
  - `locale` `es-US` for a Spanish-speaking person;
  - `payment_method_preference: IMMEDIATE_PAYMENT_REQUIRED`;
  - `app_switch_context.mobile_web` for a phone's browser, which replaces the earlier `app_switch_preference`;
  - the customer's IP for risk;
  - line `sku`s, and card Level 3 data.

  Cards follow the stored-credential flow. The first save is `CUSTOMER`/`FIRST`. Later merchant-initiated holds send `previous_network_transaction_reference`, kept on the person as `vaultNtr`. Saved PayPal sends `stored_credential` with `UNSCHEDULED_POSTPAID`.

  - A `DENIED` authorization fails the hold with the bank's code. The sandbox trigger is `CCREJECT-*` as the cardholder name: `POST /api/jobs/:id/hold/card` with `{decline:true}`.
  - The view shows `hold.sellerProtection` (the sandbox says `NOT_ELIGIBLE`) and `hold.statusReason`.
  - `POST /api/jobs/:id/hold/card` on a pending PayPal order uses `confirm-payment-source`, so the order stays the same.
  - A buffer change before approval also PATCHes the description.
  - New hold methods `applepay` and `guest`.
  - The `/hold/with` route takes `cmid`, the FraudNet id.
- **Payments.**
  - Milestone captures set a `soft_descriptor`.
  - Refunds carry `custom_id`/`invoice_id`. A `PENDING` refund is followed in the tick (`GET /v2/payments/refunds/{id}`).
  - `GET /api/jobs/:id/hold/options` adds `paypalEligible` (`find-eligible-methods`).
- **Saved methods.**
  - `POST /api/me/payment-methods/setup` takes `kind`: `paypal`, `venmo`, `card` (a setup token for the SDK's card-fields save session) or `testcard` (approved at once, saved with no approval).
  - `POST /api/me/payment-methods/confirm` (`setupToken`) finishes a save approved in the page.
  - The setup token is read first (`GET /v3/vault/setup-tokens/{id}`).
  - `merchant_customer_id` is the person id.
  - `DONE_VAULT_ON_APPROVAL=1` adds `vault_instruction: ON_PAYER_APPROVAL`.
- **Invoices.**
  - Creating one takes `lines` (`name`, `qty`, `unit` HOURS/QUANTITY, `amount`, `taxPct`), `tripFee`, `payTerm` (NET_10…NET_90), `terms`, `cc` and `sendOn` (SCHEDULED).
  - PayPal's tax goes to the pro.
  - Each invoice carries the pro's `invoicer` block, the job reference, an `invoice_number` of at most 25 characters, and the email subject and note.
  - New routes:
    - `POST /api/pro/invoices/:id/undo-outside`
    - `POST /api/pro/invoices/:id/refund-outside`
    - `PATCH /api/pro/invoices/:id/scheduled`
    - `GET /api/pro/invoice-templates/paypal`
    - `PATCH /api/pro/invoice-templates/:id`
  - Cancelling a scheduled invoice deletes it in PayPal.
- **Plans.** `POST /api/jobs/:id/plan` takes:
  - `every` (1, 3, 6 or 12 months);
  - `visits`, `trial`, `taxPct`, `units` and `startOn`;
  - `payWith: "card"`: the test card as the subscriber's card, so the plan is ACTIVE with no approval page;
  - `shared`: one plan per cadence, with this price as an override. A price change PATCHes only that subscription. `DONE_SHARED_PLANS=1` makes it the default.

  Each trade has its own catalog product, looked up by name. Cancelling deactivates the plan. Other changes:
  - `POST /api/plans/:id/units` revises the units.
  - `POST /api/staff/plans/:id/failure-threshold` sets the failure threshold.
  - Refunding a month uses Payments v2 first.
- **Payouts.**
  - Each item carries `purpose: SERVICES`, and `notification_language` es-US for a Spanish-speaking pro.
  - `GET /api/staff/payout-items/:id` reads one item.
  - Several delayed payouts due together are released in one referenced-payouts batch. The sandbox answered 403 to that call.
- **Disputes.**
  - The evidence type matches the claim: `PROOF_FOR_SOFTWARE_OR_SERVICE_DELIVERED`, `COPY_OF_CONTRACT` or `PROOF_OF_REFUND` with refund ids.
  - An offer can take `kind: "redo"` (`REPLACEMENT_WITHOUT_REFUND`).
  - Accepting a claim can take `amount` (`PARTIAL_REFUND`).
  - New staff routes: `GET /api/staff/paypal-disputes/queue` and `POST …/paypal-dispute/supporting-info`, `/contact` and `/sandbox` (adjudicate, require-evidence).
  - The dispute record keeps `channel`.
- **Webhooks.**
  - VeriPay subscribes to 46 events, checked at startup against `webhooks-event-types`; unknown names are dropped.
  - New handlers cover:
    - captures that are declined, pending or reversed;
    - refunds that are pending or failed;
    - payout items that are failed, blocked, held, refunded, cancelled, returned or unclaimed;
    - deleted vault tokens;
    - `CUSTOMER.MERCHANT-INTEGRATION.*`;
    - `PAYMENT.SALE.*`.
  - An existing webhook gets the current list (PATCH).
  - `POST /api/staff/webhooks/move` changes the webhook's URL.
  - `GET /api/staff/webhooks?paypal=1` lists PayPal's webhooks and webhook lookups.
- **Reporting.**
  - `GET /api/staff/paypal-transactions` searches by `id`, with `payer_info`, `all=1` and `page`.
  - `GET /api/staff/balances?asOf=` returns the balance for a past date.
- **Onboarding.**
  - The referral asks for `READ_SELLER_DISPUTE` and `UPDATE_SELLER_DISPUTE`.
  - It prefills the business name and the language.
  - `PAYPAL_PARTNER_PRODUCTS` sets the products.
  - `GET /api/pro/paypal-onboarding/referral` reads the referral.
  - The view explains PayPal's 30-day pending rule for a pro whose onboarding isn't finished.
- **Pay Links.**
  - Each link asks the payer for a gate code or access notes (`customer_notes`) and takes `taxPct`.
  - `PATCH /api/pro/paylinks/:id` reprices a link in place.
  - `GET /api/pro/paylinks/paypal` lists the links in PayPal.
- **Address callback.** With `DONE_ADDRESS_CALLBACK=1` and a public https URL, the order sets `order_update_callback_config`, and `POST /api/paypal/order-update-callback` answers `ADDRESS_ERROR` outside Austin. This needs a public URL and was not tested.
- **Apple Pay.** `GET /.well-known/apple-developer-merchantid-domain-association` serves `APPLE_PAY_DOMAIN_FILE`. Apple Pay needs a domain and a device, and was not tested.
- **Negative tests.** `POST /api/staff/paypal-negative` (`code`) sends `PayPal-Mock-Response`.
- **`/api/paypal/sdk`** adds `partnerAttributionId`, `fraudnetSource`, `locale` and `testCard`.
- **Web.**
  - The buttons come in PayPal's recommended order, with `commit:false`. A blocked popup falls back to a modal. They handle resume after a return, `onComplete`, and `isRecoverable`. A PayPal Credit button is added.
  - Card fields get styles, ARIA labels, validity and card-type events, the billing ZIP, `update(amount)` and the liability shift.
  - New in the page: a PayPal guest card page, Apple Pay, the Google Pay payer-action step, the Fastlane address selector and FraudNet.
  - Save sessions in the page cover PayPal, Venmo and cards.
  - The v6 `<paypal-message>`, with a click event, a home-page banner and copy matched to the amount.
  - **None of the web changes were tried in a browser with sandbox keys.**
- **Live sandbox run** through `src/pay/paypal.js`: see section 五 of the candidate list. Tests: `test/paypal9.test.js` (10); 388 in all.
- **Fixes.**
  - `updatePerson` now keeps `phone`, `lang` and `vaultNtr`. Before this, the phone PayPal returned (round 8) was dropped.
  - PayPal limits `invoice_number` to 25 characters; numbers are now cut to fit.

