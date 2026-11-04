# Cover ml: results

**Cover is now a US product** (the judges are American). The models are being rebuilt for it:
- English US documents for Cover-OCR;
- English teacher data with US framing for Cover-1B;
- a US-shaped portfolio for Cover-Risk;
- Cover-Audit cases from the US products.

US results go in the sections below as they are measured.

**Round 1 (Traditional Chinese / Taiwan) is superseded.** Its numbers are kept at the end of this file as history,
under "History: round 1 (Taiwan, superseded)". They describe models that will not ship.
- Cover-1B and Cover-Audit never reached training in that round. They were stopped when the direction changed.

All numbers come from held-out sets that were never trained on. Intervals are 95% intervals: Wilson for rates, and
bootstrap (200 resamples) for Gini. Muse Glimmer (`muse-glimmer:30b-q4_K_M`, digest `de878ce33ad8`) is the only
teacher model. No Claude or GPT outputs are used, and every person, number and document is synthetic.

## Cover-OCR (US)

(in progress)

## Cover-1B (US)

(waiting for the US products' English clauses)

## Cover-Risk (US)

(waiting for the US zones.js)

## Cover-Audit (US)

(waiting for the US products)

---

# History: round 1 (Taiwan, superseded)

## Round 1 Cover-Risk (Taiwan districts, superseded)

**What it is.** Each policy's expected yearly claims, for pricing, with the reasons. It is not an LLM.

**Data.** `fit.py` generates a synthetic portfolio per product: 200,000 training policies and 50,000 test policies.
The generator is stated in full in the script:
- **Frequency.** Poisson, with exposure drawn from 0.25 to 1 year.
- **Severity.** Gamma, with a shape per product.
- **True premium.** The product's own factor table (`api/src/products/*.json`) times hidden effects the tables don't
  have:
  - curved ages;
  - ground floor × flood level 3;
  - brick × age over 40;
  - street parking × theft level 3;
  - telematics.
- **Districts.** Each district's hazard levels come from `api/src/zones.js`, exported to `zones.json`.
- Life is not modelled; it is priced from a mortality table.

**Models.**
- **GLM baseline.** Poisson frequency with an exposure offset, times Gamma severity, both with a log link.
- **LightGBM.** Tweedie loss with power 1.5. Monotone constraints: hazard levels, past claims, home age, sums
  insured and vehicle value never lower the price; a higher deductible, copay or more driving years never raise it.
- **Product tables.** The current pricing, as a reference row.

| Product | Train claims | Gini: LightGBM | Gini: GLM | LightGBM − GLM | Product tables | True premium (ceiling) | Predicted / actual total (LightGBM / GLM) | Error vs the true premium, RMSE $ (LightGBM / GLM / tables) | Monotone violations |
|---|---|---|---|---|---|---|---|---|---|
| renters | 8,945 | 0.318 [0.284, 0.344] | 0.317 [0.283, 0.346] | [−0.008, +0.008] | 0.320 | 0.332 | 0.986 / 1.028 | 47.4 / 47.5 / 50.3 | 0 |
| home | 6,706 | 0.401 [0.364, 0.442] | 0.407 [0.371, 0.449] | [−0.017, +0.004] | 0.407 | 0.417 | **0.931** / 1.003 | 500 / 466 / 575 | 0 |
| pet | 58,353 | 0.311 [0.297, 0.323] | 0.311 [0.297, 0.323] | [−0.002, +0.003] | 0.305 | 0.313 | 0.991 / 0.992 | 21.6 / 19.6 / 34.3 | 0 |
| car | 17,542 | **0.621** [0.599, 0.641] | 0.615 [0.592, 0.635] | **[+0.003, +0.010]** | 0.600 | 0.624 | 0.975 / 1.016 | **211** / 303 / 378 | 0 |

**What these numbers say.**
- **Both models nearly reach the ceiling.** On renters, home and pet, LightGBM and the GLM are within the noise of
  each other (the paired difference interval contains 0), and both are within about 0.01–0.02 Gini of the true
  premium. The generator's hidden effects are small next to Poisson-Gamma noise at these claim counts.
- **Car is the exception.** LightGBM is ahead of the GLM, and its error against the true premium is 30% lower, because
  car has the strongest curved effects (the experience curve, √km).
- **Both beat the product tables** on error against the true premium for every product.
- **Calibration.** By decile, LightGBM follows actual losses (`out/results.json` has every decile).
  - **Home is under-predicted:** 93% of the actual total. Home has few claims for its heavy severity tail, and the
    held-out total is driven by a few large losses. Before pricing home with it, recalibrate the level, for example
    by scaling to the training total.
- **Strongest SHAP features** (mean |TreeSHAP| on the log scale):
  - renters: contents, past claims, floor;
  - home: contents, rebuild cost, typhoon level, past claims, age;
  - pet: age, breed size, species;
  - car: vehicle, km a month, cover level, past accidents.
- **These numbers show only that the model learnt the generator's assumptions.** They are not claims experience and
  must not be quoted as such.

**Export.** `out/risk_<product>.json` holds the trees, the answer encodings, the link and the monotone directions.
`risk.mjs` evaluates them in plain Node. It has the shape `quote.js` `useRiskModel()` expects
(`estimate(p, answers, zone)` → `{ claims, why, version }`), and it is not wired into the app.
- **Checked against Python:** on 50 test policies per product, Node's prediction differs from LightGBM's by at most
  2.2e-16 (relative).
- **The reasons are path (Saabas) attributions,** expressed as multiplying factors. They are close to SHAP but not
  equal to it.

## Round 1 Cover-OCR (Traditional Chinese documents, superseded)

**Data** (`gen.py`). Synthetic documents: 統一發票 proof copies, vet invoices, repair quotes and police report slips
(受理案件證明單). Every field and every line's text is known exactly.
- **Fonts.** Six Traditional Chinese faces: Noto Sans CJK TC (regular and bold), Noto Serif CJK TC, AR PL UMing TW,
  and WenQuanYi Zen Hei and Micro Hei.
- **Photo damage.** Each page is photographed onto a background:
  - perspective and up to ±6° rotation;
  - 0–2 creases;
  - glare in 60% of photos, and uneven light;
  - Gaussian or motion blur;
  - noise;
  - JPEG at quality 25–80.
- **Line crops.** Each line is cut along its corners after the warp, so the crops are what a detector would hand over.
  (Correction: the round-1 training crops were not jittered as intended. The shards were named `train0`–`train4` and
the jitter applied only to a split named `train`. The US generator jitters every `train*` split.)

| Split | Documents | Lines |
|---|---|---|
| train | 5,000 | 50,129 |
| test (the same fonts, new documents) | 400 | 4,000 |
| test_font (AR PL UKai TW, a font never trained on) | 200 | 2,007 |

**Model** (`rec.py`). An SVTR-tiny-style recogniser in PyTorch, trained from scratch:
- a convolutional stem, then local mixing (depthwise convolutions), then global mixing (self-attention), with the
  height merged between stages and a CTC head;
- 4.0M parameters and 396 characters;
- 30 epochs, AdamW, bf16, on the A100 beside Ollama, about 27 minutes in all.

PaddleOCR's pretrained PP-OCR recogniser was not fine-tuned. Installing PaddlePaddle on this VM's CUDA 12.9 was the
riskier path, so this round uses the SVTR-style model the coordinator allowed as the fallback.

**Scores.** Fields are scored end to end:
- **Lines.** The recogniser reads each line from the photo, using the true line corners (there is no detector yet;
  see below).
- **Fields.** `parse.py` turns the lines into the reader's fields by rules. On the true text the rules get every
  field right (100% on both splits), so every field error below comes from recognition.

| | CER | Lines exact | date | amount | merchant | taxId | reportNo | items | **All fields in one document** |
|---|---|---|---|---|---|---|---|---|---|
| test | **0.88%** | 93.2% [92.4, 93.9] | 98.5% | 98.8% | 82.0% | 99.3% | 99.3% | 89.8% | **75.3% [70.8, 79.2]** |
| test_font (unseen font) | 15.2% | 33.8% [31.8, 35.9] | 65% | 87% | 4% | 87% | 87% | 3.5% | **0% [0, 1.9]** |

All fields in one document, by kind on test: vet 69/77, repair 56/72, invoice 121/164, police 55/87.

**What failed:**
- **A decoding bug, fixed and measured again.** The first evaluation read each line past its own end, into the
  batch's padding. It gave tails such as `電子發票證明聯聯` and `NP-805653420`, a CER of 3.96%, and 53% of documents
  fully right. Training used the right lengths, so only decoding changed: each line is now cut at its width. The
  table above is after the fix; the same model went from 3.96% to 0.88% CER.
- **Merchant is the weakest field** (82%). Merchants are long names, and police station names are printed small
  (18 px). One wrong character fails the field.
- **No generalisation to an unseen font.** On AR PL UKai TW (a brush-style kai face) CER is 15% and no document is
  fully right. With six fonts, the model learned those fonts, not the characters. Round 2 needs:
  - many more faces, including handwriting-like and receipt-printer (dot-matrix and thermal) fonts;
  - or starting from a pretrained recogniser (PP-OCRv4's Chinese model) rather than from scratch;
  - and a few real photographed receipts as a check, as the plan says.
- **There is no detector.** These scores use the generator's true line corners, so they are recognition scores, not
  a full photo-to-fields pipeline. A text-line detector (DBNet in the plan) is still to do; the generator already
  writes every line's quad, which is a detector's training label.
- **Speed.** About 13 ms per line, batched on the GPU. CPU speed is not measured yet.

## Round 1 Cover-1B and Cover-Audit (Taiwan)

These were not trained. The Chinese teacher data had been generated (clause Q&A 1,425, stories 1,520, the dialogue's
training set of 1,600 with its test set unfinished, and 0 to 3 failed calls per set; the Cover-Audit jobs had not
started) when the direction changed to a US product. Both models were stopped before training.
- The pipeline's smoke tests did pass on that data: the SFT trainer, generation, scoring, and the audit cases from the
  real claim engine.
