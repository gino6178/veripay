# Muse Glimmer on Traditional Chinese insurance work: probe results

PLAN-cover.md 11 flags Glimmer's Traditional Chinese as unmeasured. This probe measures it on the two text tasks
Cover-1B would learn from it (clause Q&A, receipt and claim extraction), plus its vision on receipt images. Run on
2026-11-04 on `cover-a100`.

## Setup

- **Model and server.** `muse-glimmer:30b-q4_K_M`, digest `de878ce33ad8` (model blob `sha256:71b5c9c9abbc…`), the
  same blob Serve used. Served by Ollama 0.40.11 on one A100 40 GB with 96 slots of 4,096 tokens each. All 53 layers
  are on the GPU, using 25.4 GB.
- **Teacher setting** (the qa, extract and vision sets). This is Serve's teacher call: Ollama chat, `think: "low"`, a
  JSON Schema as the format, temperature 0.3, and a 900-token reasoning budget on top of the reply.
- **App setting** (the vision_app set). The images are asked exactly as the app's reader asks them
  (`api/src/reader.js`): its English prompt, no system turn, temperature 0, and no thinking setting. Ollama's default
  thinking for this model is "high".
- **Samples and concurrency.** Each case was asked twice, with all of a set's requests sent at once (50 for qa and
  extract, 10 for vision). `solo` asked 10 cases one at a time on an idle GPU.
- **Cases.** `qa`: 25 questions (15 on 租屋險, 10 on 寵物險), written against the app line's real clauses
  (`api/src/products/{renters,pet}.json`, snapshot in `clauses.json`). The product's full clause list goes in the
  prompt. `extract`: 25 generated documents (8 統一發票, 6 vet receipts, 4 repair slips, 3 police report slips,
  4 claim stories) whose answers are known by code. The fields follow the app reader's schema: date, amount,
  currency, merchant, taxId, reportNo, items, text. `vision`: 5 of the 統一發票 rendered as clean images.
- **Scoring is all code** (`score.py`; raw answers in `out/`):
  - JSON is valid.
  - The cited clause exists in the product and is one of the accepted ids.
  - The answer contains no simplified-only characters.
  - Each field is exactly right: dates as YYYY-MM-DD with ROC years converted, the amount as a number, and taxId and
    reportNo exact or null.
- 95% Wilson intervals are in brackets.

## Results

| Task | Answers | JSON valid | The main score | Self-agreement (2 asks) | Seconds per answer, 50 at once (p50 / p95) | Alone |
|---|---|---|---|---|---|---|
| Clause Q&A | 50 | 100% | **cited clause right: 50/50, 100% [92.9, 100]**; the clause exists 100%; no simplified characters 100% | 96% (24/25) | 116 / 147 | 4.7–8.2 s |
| Extraction from text | 50 | 100% | **every field right: 94% [83.8, 97.9]**; date, amount, merchant, taxId, reportNo 100% each; item 94%; currency TWD 95.5% | 88% (22/25) | 133 / 155 | 8.2–9.4 s |
| Receipt images, teacher setting | 10 | 100% | date, amount, merchant, taxId 100%; item 0% exact (100% loose, see below); currency 70% | 100% (5/5) | 71 (10 at once) | 8.7 s |
| Receipt images, app's own call | 10 | 100% | date, amount, merchant 100%; **taxId 0%**; currency 0%; item 0% exact (100% loose); transcribed text exact | 100% (5/5) | 264 (10 at once) | 30.5 s |

Notes on the scores:
- **Covered or not (qa).** The yes/no/partly/info answer matched my label in 74% [60.4, 84.1]. Every one of the 13
  misses is "info" where I wrote "yes", on questions that ask how much, how long or how many. If "info" counts as
  "yes", it is 100%. Glimmer never said a case was covered when the clause excludes it, or the reverse. The fault is
  in the label set, not the model.
- **Item, exact versus loose.** All 13 item misses (3 from text, all 10 from images) are the same thing: on a 統一發票
  Glimmer copies the whole item line (`落地電風扇    1 x 6060    6060TX`) as the item. Counting an item that starts
  with the right name, every field is right in 50/50 text answers and 10/10 teacher-setting image answers.
- **Tokens.** Mean output per answer was 235 tokens for qa and 375 for extract (both counts include reasoning). The
  app's vision call averaged 1,342 tokens, with about 3,800 characters of reasoning per answer at the default "high"
  level.
- **Throughput.** Alone, Glimmer decodes about 47 tokens/s, or 5 to 9 s per answer. With 50 at once it decodes about
  3 tokens/s per request, about 150 to 170 tokens/s in all: 50 answers in 150 s, about 1,200 an hour.

## Failures, by example

- **Item line copied whole** (every item miss). The 統一發票 item line `平板電腦保護殼    1 x 2705    2705TX` comes back
  as the item `["平板電腦保護殼    1 x 2705    2705TX"]`. No document had a wrong item name.
- **The app's reader leaves out the optional fields.** With `api/src/reader.js`'s schema, only date, amount, merchant,
  items and text are `required`. On all 10 image answers Glimmer filled exactly those and left out taxId, currency and
  reportNo, even though `賣方 44716117` was in its own transcription (`"text": "...賣方 44716117..."`). With those fields
  in the schema and named in the prompt, the teacher setting got the seller's taxId on 10/10 images. It never gave the
  buyer's number, though 2 of the 5 images showed one.
- **Default thinking is slow.** The app's call reasons at "high" by default: 30.5 s alone and 264 s with 10 at once.
  The same image at `think: "low"` took 8.7 s alone, with the date, amount, merchant and taxId as right.
- **Clause Q&A had no wrong clause in 50 answers.** It cited a clause that does not exist 0 times. The answers are in
  Traditional Chinese and use the clause's own amounts (100 美元／日, 3,000 美元, 30 日, 兩次為限). The one self-disagreement
  (qa21) is "yes" against "info" with the same clause. Some answers add caveats from other clauses (qa16 lists the
  waiting period, pre-existing conditions and the 90-day limit). That is correct but longer than the question needs.

## Verdict per task

| Task | Verdict |
|---|---|
| **Clause Q&A, citing the clause** (Cover-1B) | **Good enough as teacher.** 100% right clause and 96% self-agreement on these 25 questions. Keep the plan's code filter anyway: drop any answer whose clause does not exist or is not in the case's accepted set. Replace "covered" with yes / no / partly only, or give "info" a narrow definition, before using it as a label. |
| **Text → JSON extraction** (Cover-1B, "OCR text → JSON") | **Good enough as teacher, but use code-known labels where the generator has them.** Date and ROC conversion, amount, merchant, seller taxId against a buyer taxId, and reportNo were 100%. For generated documents the generator already knows every field exactly, at no cost, so train on those. Use Glimmer for free-text claim narratives (story cases: 8/8 right), and add a rule to the prompt for items ("the item name only, without quantity or price"). |
| **Reading receipt images** (Cover-OCR, and the app's reader) | **Not as Cover-OCR's teacher: use code-known labels** (the synthetic receipt generator, as planned). On clean renders Glimmer's vision read every printed field, but this probe has no creases, glare or skew, and only 5 images. For the app's reader it works today, with two changes (app line, not done here): put taxId, currency and reportNo in `required` (nullable), and set `think: "low"`, which cut one image from 30.5 s to 8.7 s. |

## Limits

- **Small and written by us.** These are 50 cases plus 5 images. A 50/50 result still only puts the rate above about
  93%. The questions are clear and single-issue. Real users write longer questions, mix languages and ask about two
  clauses at once.
- **The clauses are in the prompt.** This measures reading the given clauses, not knowing them.
- **The images are clean renders** from a desktop font (Microsoft JhengHei). Photographed, creased or faded receipts
  are not tested.
- **The teacher-setting extraction prompt is in Chinese and names every field.** The app's English prompt was tried
  on images only.
- **Timings were taken on an otherwise idle A100.** "50 at once" is the latency a request sees inside a full batch,
  not the time one request takes alone.
- **These cases are for evaluation only** and must not be used as training data.

Reproduce, on the VM from the repository root: `python3 ml/probe/build.py` (needs `--font` to render the images), then
`bash ml/probe/run_all.sh`. Results land in `ml/probe/out/results.json`.
