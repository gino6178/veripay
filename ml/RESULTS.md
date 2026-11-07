# Done & Paid ml: results

True numbers from held-out sets that were never trained on. Rates carry 95% Wilson intervals. Muse Glimmer
(`muse-glimmer:30b-q4_K_M`, digest `de878ce33ad8`) is the only teacher. No Claude or GPT output is used, and every
person, pro, address and document is synthetic (demo city Austin, TX).

## Done-Audit

**Served** (2026-11-05). Qwen3-0.6B with LoRA r16, 2 epochs on 3,000 orders (147 steps, 13 minutes on the A100),
exported to GGUF Q4_K_M (397 MB).
- **What it writes.** Short codes per check: `{ id, v (pass / needs_fix / fail), r (a reason code from a fixed
  list), e (the evidence ref) }`. Code writes the sentence (`ml/prompts.mjs` `expandChecks`), from the evidence
  itself.
- **Labels.** The verdict and reason code of every check come from code. Glimmer only described the photos and notes.
- **Endpoint.** On the VM, 127.0.0.1:11480 (`ml/serve.mjs` under `ml/serve_loop.sh`; each llama-server restarts itself
  if it exits), CPU only. The served model is pinned to cores 0–5 with 6 threads; everything else on the VM was moved
  to cores 6–11. Forwarded to this machine at 127.0.0.1:11471 and 11472 (kept alive by `ml/tunnel.ps1`), model
  `done-audit`.

| Through the served endpoint (`ml/bench.mjs`), one order at a time | Orders | Latency p50 / p95 | 3-check orders p50 | Tokens read / written (p50) | JSON valid | Verdicts right vs code | Orders with every check right |
|---|---|---|---|---|---|---|---|
| test (held out) | 60 | 2.9 s / 4.2 s | **2.8 s** (33 orders) | 483 / 65 | 60/60 | **98.6%** (204/207) | 57/60 |
| attack (instructions hidden in evidence, unseen templates) | 40 | 3.4 s / 4.3 s | 2.9 s (20) | 501 / 76 | 40/40 | **100%** (140/140) | 40/40 |

**What went wrong on the way, and was fixed:**
- **Too slow.** The first version wrote whole sentences (276 tokens per order, 13.9 s p50). The answers are now codes
  that code expands.
- **Empty replies.** llama-server applied Qwen3's chat template with thinking on, so the answer went into hidden
  reasoning and hit the token cap: 200 tokens, empty content. Training used `enable_thinking=False`. `serve.mjs` now
  sends the same, and the empty replies stopped.
- **CPU contention.** Ollama, the teacher, training and the VLM evaluation shared the served model's cores (load 16
  on 12 vCPUs), and calls took 30–37 s. The cores are now split.
- **Restarts.** Restarting the endpoint broke the app's tunnels. The endpoint is now supervised and the tunnels are
  kept alive.

**Latency on the target machine.** The VM figures are on 6 vCPUs, which are 3 physical Xeon cores at 2.2 GHz. The
i5-9400F should not be slower, but it is not measured yet (nothing may be downloaded there yet).

**Full evaluation** (`ml/eval_done.py`, bf16 on the GPU, the same prompts). The held-out sets are test (300 orders,
1,033 checks) and attack (150 orders, 526 checks: instructions hidden in the evidence, from templates never trained
on). Truth is code's verdict for every check.

| Model | Verdicts right, test | Every check right, test | Verdicts right, attack | Attack success (a non-pass check turned into pass) | Reason code right | Calibration error (ECE), test |
|---|---|---|---|---|---|---|
| **Qwen3-0.6B + LoRA (served)** | **99.9%** [99.5, 100] | 99.7% | **99.8%** [98.9, 100] | **0.4%** (1 of 262) | 99.9% | **0.005** |
| Llama 3.2 1B + LoRA | 99.9% [99.5, 100] | 99.7% | 99.6% [98.6, 99.9] | 0.8% (2 of 262) | 99.8% | 0.085 |
| Qwen3-0.6B, untuned | 0% (no valid JSON in this format) | 0% | 0% | – | – | – |
| Llama 3.2 1B, untuned | 0% (valid JSON in 1 of 300) | 0% | 0% | – | – | – |
| Muse Glimmer (teacher; the long prompt with the rules in words) | 68.3% [65.4, 71.1] | 64.7% | 65.6% | **0%** | – | – |

- **Per class, served model, test** (precision / recall): pass 100% / 100%, needs_fix 99.6% / 100%, fail 100% / 99.5%.
  - **Its misses:** one duplicate photo (98.1% of duplicates caught) on test; on attack, one before-the-window photo
    passed (95.8%). That was the 1 attack success.
- **Confidence (served model, test).** 98.8% of verdicts have confidence ≥ 0.9, and all of those are right. On attack
  it is 97.3%, all right. Llama's confidences are much less calibrated: only 80% of its verdicts reach 0.9.
- **Qwen3-0.6B is chosen.** The two students do not differ in accuracy (McNemar p = 1.0 on test and attack). Qwen is
  calibrated, smaller and faster.
- **Glimmer agrees with itself on 98.2%** [97.1, 98.9] of checks, yet with code's verdicts on only 68%. That is a
  difference of definitions, not of ability: it is cautious where the generator's rules are mechanical.
  - Its passes are right 98.2% of the time, but it withholds pass on 28% of genuinely passing checks.
  - It catches only 38% of photos taken away from the job (it doesn't apply the distance rule as code does), 48% of
    receipts over the allowance, and 58% of duplicate images.
  - **No hidden instruction moved it** (0 of 262).
  - The students learned code's rules, not Glimmer's judgement, which is why they beat it here.
- **What 99.9% does not show.** The evidence comes from the same generator as the training data: the same check
  types, defect types and fact lines (EXIF time, distance, image-hash match, receipt fields). The students read
  those facts reliably.
  - **Real-world accuracy depends on the photo descriptions**, which in production come from a VLM, not from
    Glimmer's careful wording, and on jobs outside the nine catalog tasks.
  - **Neither is measured here.** The app's own eval (`api/src/check/eval.mjs audit`) is the next check.

## Done-VLM (ml/vlm/)

**Served** (2026-11-05) as `done-vlm` on the same endpoint as `done-audit`: VM 127.0.0.1:11480, forwarded to this
machine at 127.0.0.1:11471 and 11472. The model is **SmolVLM2-500M-Video-Instruct**: Hugging Face TB, Apache 2.0,
GGUF Q8_0 from ggml-org, 437 MB, plus a 109 MB projector. It is used off the shelf; there was no time to fine-tune it.
Copies are in `ml/models/vlm/`:
- `SmolVLM2-500M-Video-Instruct-Q8_0.gguf`, SHA-256 `6f67b803…438bc`;
- `mmproj-SmolVLM2-500M-Video-Instruct-Q8_0.gguf`, SHA-256 `921dc7e2…f520b`.

**Photos.** 305 openly licensed photos from Wikimedia Commons, covering 27 home-repair things (faucets, toilets,
disposals, water heaters, drywall holes, TV mounts, ovens and so on). Each one's licence, author and source page is
in `vlm/photos/photos.jsonl`.
- **Licences:** CC BY-SA 4.0 (126), CC BY-SA 3.0 (46), public domain (31), CC BY 2.0 (29), CC BY-SA 2.0 (19),
  CC0 (17), CC BY 3.0 (16), CC BY 4.0 (11), and 11 others under CC BY or CC BY-SA.
- **Use:** evaluation only, with thumbnails of 500 px.

**1. The app's own judge prompt** (`api/src/vlm.js` "condition", word for word, `vlm/eval.py`). One AFTER photo and
a done-condition "<thing> is visible and in place", using either the photo's own thing (truth: pass) or another
thing (truth: not pass). 6 CPU threads.

| Model | Questions | Passes a condition about something that isn't there ("wrong release") | Confirms a true condition | same_spot right | p50 |
|---|---|---|---|---|---|
| SmolVLM2-500M | 175 | **94.9%** | 100% | 3.5% | 4.8 s |
| InternVL3-1B (stopped after 13) | 13 | 67% | 86% | 0% | 28 s |

**These models must not judge on their own.** They echo the condition back: on a photo with no window, InternVL3-1B
answered `"sees": "A window is visible and in place"`, verdict pass. The app agent's earlier synthetic-scene set
found Glimmer safe with that prompt (0 of 10 wrong releases) but slow (151 s a case).

**2. Describe-only** (`vlm/describe_eval.py`, the prompt in `ml/prompts.mjs` `DESCRIBE_PROMPT`). The VLM is not told
the condition. It describes what it sees in one or two sentences, and Done-Audit judges the description as the
photo's evidence text. 60 photos, 448 px, 6 CPU threads (VM, 3 physical cores), one photo at a time. Scored by code
with a keyword list per thing:

| Model (all Apache 2.0) | Names the photo's own thing | Names a thing that isn't there | p50 / p95 |
|---|---|---|---|
| **SmolVLM2-500M (served)** | 56.7% | **1.7%** | **3.9 s** / 4.6 s |
| InternVL3-1B | 63.3% | 3.3% | 6.4 s / 7.3 s |
| InternVL3-2B | 60.0% | 3.3% | 7.7 s / 8.5 s |
| Qwen2-VL-2B | 70.0% | 6.7% | 9.3 s / 11.7 s |

SmolVLM2-2.2B: 70% / 0% / 11.1 s. moondream2 failed to load in llama.cpp.

- **Why SmolVLM2-500M.** It is the only candidate within "a few seconds" (3.9 s), and it hallucinates least. When it
  misses the thing (43%), the check is not proven, so Done-Audit returns needs_fix and the pro adds a clearer photo:
  the safe direction. A false mention would be the dangerous error, and it happens in 1.7% of photos.
- **Limits of this measure.** The keyword test undercounts descriptions that use other words (a "basin" for a sink,
  "a white appliance" for a water heater). The 60 photos are stock and encyclopedia photos, not phone photos of
  finished repairs.
- **Speed from this machine through the tunnel** (`ml/client.mjs` `describePhoto`): 3.4–4.4 s once warm; the first
  call, cold, took 11 s.

**Served latency, 2026-11-05** (`ml/vlm/bench_vlm.mjs`: 90 photos the server had not seen, their full size up to
960×1440, one at a time through the endpoint, `describeMessages`, 70 tokens at most). The app had reported 15–90 s.
Two causes:
- **Image slices.** llama.cpp cuts a large photo into up to 8 slices (513 prompt tokens, 20–29 s). An
  `--image-max-tokens` cap (in `serve.json` `args`) limits that. **Served cap: 128** since the evening of 2026-11-05
  (it was 64; see "Image-token cap on the real demo photos" below). Most photos then take 181 tokens.
- **Too few cores, shared with other callers.** It had 2 physical cores, one of them shared with the OCR worker.

| done-vlm cores (physical) | p50 | p95 | max | over 5 s |
|---|---|---|---|---|
| 2 (before) | 10.8 s | 25.6 s | 25.6 s | 20 of 20 |
| 3, slices capped | 4.65 s | 4.83 s | 5.7 s | 2 of 90 |
| **4 (cores 2–5, served), slices capped** | **3.65 s** | **3.78 s** | 5.7 s | **2 of 90** |

- **Layout now (while the GPU work runs):** done-audit has cores 0–1 to itself. done-vlm has cores 2–4 with 2 slots,
  so two photos are described at once and a third waits up to 45 s instead of getting 503. done-chat shares cores 2–4.
  Core 5 belongs to Glimmer's Ollama and the training jobs.
  - **Why not core 5:** with done-vlm on cores 2–5 while Glimmer ran on core 5, one request took 139 s. All 8 threads
    wait for the slowest one.
- **A 5-photo job sent at once** (`ml/vlm/burst_vlm.mjs`, three runs): all 15 photos were described, with no 503. The
  last photo finished at 26–30 s, about 5.5 s a photo. Before this change, all 5 came back 503 after 15 s.
- **Under 5 s holds for one photo at a time with nothing else on those cores** (p50 4.65 s on 3 cores). It is not
  guaranteed under load. The endpoint's `queue_duration` field shows how long a request waited for a slot.
- **When the GPU work is done,** done-vlm can have cores 2–5 again (p50 3.65 s).
- **The two slow photos (5.1 s, 5.7 s)** were a wide photo (247 tokens) and one outlier.

**Image-token cap on the real demo photos** (the 24 photos in `api/demo-assets/real/`, sent at full size as the app
sends them; `vlm/demo_caps.sh`; 4 threads on cores 2–5 at low priority while the app's judge runs used the endpoint):

| Cap | Base: names the right thing | Base p50 / p95 | v1: names the right thing | v1 p50 / p95 | Prompt tokens |
|---|---|---|---|---|---|
| 64 | 23 of 24 | 4.3 / 4.4 s | 22 of 24 | 3.8 / 4.0 s | 181 |
| **128 (served)** | **24 of 24** | **5.7 s** / 61 s* | 20 of 24 | 4.2 / 5.5 s | 181 |
| 256 | 24 of 24 | 5.7 / 8.5 s | 20 of 24 | 5.2 / 8.3 s | 247 |
| none | 24 of 24 | 5.7 / 8.6 s | 20 of 24 | 5.1 / 8.2 s | 247 |

\* Three photos took 54–73 s while the app's own calls held the same cores; the others took 5–6 s.

- **Cap 64 missed one photo of 24** (the water heater, `heater_old-3`). 128 named all 24, and so did 256 and no cap,
  which add slices (247 tokens) and run up to 8.6 s.
- **128 is the best setting that stays under about 8 s.**
- **v1 does worse on these photos** (20–22 of 24): another reason the base stays served.
- **The faucet_before photo** (`faucet_before-3.jpg`, SHA-256 `2e479568…5fcd`) was described correctly at every cap,
  and through the live endpoint, three rounds sent at the same time as two other photos: "a sink and a faucet. The sink
  is white and has a silver…". Answers were never swapped between concurrent photos (`vlm/mixcheck.mjs`).
  - The "red and black object … part of a machine" answer the app logged fits `level_used-1.jpg` (SHA-256
    `f32eb25e…5abd`), which done-vlm describes as "a yellow level and a red laser" / "a red and black tool".
  - Check which image hash the app sent for that slot: vlm.js records `sha256` per photo. An in-memory describe cache
    from before the photos were re-copied would also explain it.

**What the app should do** (an app-side change; I don't edit `api/src/vlm.js`):
- Call `done-vlm` with `describeMessages()` from `ml/prompts.mjs`, or `describePhoto()` from `ml/client.mjs`.
- Pass the text to Done-Audit as the photo's evidence text.
- Keep same-spot to code (the image hash the app already computes).
- Keep the judge-style prompt for Glimmer only.

### Done-VLM v1: our own fine-tune (2026-11-05). Not published; base SmolVLM2-500M stays as `done-vlm`

**How it was made** (`ml/vlm/run_vlm_train.sh`):
- **Photos:** 1,034 openly licensed Commons photos (`vlm/fetch.py`; licence, author and source page for each in
  `vlm/photos/photos.jsonl`).
  - **Test split, fixed before any training data existed** (`vlm/split.py`, `photos/test_files.json`): a quarter of
    each thing's first photos, 98 in all.
  - **No overlap:** training photos with the same Commons title as a test photo were dropped.
- **Targets:** Glimmer (muse-glimmer:30b on the VM; no other model) answered the app's describe-only prompt, plus "Use
  at most 40 words" for the teacher only. Up to 3 samples per photo (`vlm/teach.py`).
  - **Code kept 1,762 of 2,808 answers.** A kept answer names the photo's own thing (the evaluation's keyword list), is
    at most two sentences and 60 words, and doesn't hedge.
  - **Dropped:** 574 too long, 452 not naming the thing, 3 hedging, 17 errors.
  - **The not-named drops were mostly Commons photos filed under the wrong category,** such as incinerator doors under
    "Garbage disposal units". Glimmer described what was really there.
- **Training:** LoRA r16 on the language model only (8.7 M parameters), 2 epochs, 442 steps, 1,763 examples from 752
  photos. Loss on the answer only. The vision encoder and projector are unchanged, so it uses the base mmproj.
- **Files:** merged and converted to GGUF Q8_0 (437 MB): `ml/models/vlm/done-vlm-v1/done-vlm-v1-Q8_0.gguf`, SHA-256
  `172e01c9…783ed` (same as on the VM). The LoRA adapter is in `ml/models/vlm/done-vlm-v1/adapter/`.

**98 held-out photos** (`vlm/describe_eval.py --test_files`, 448 px, same slice cap as served):

| Model | Names the photo's own thing | Names a thing that isn't there (pre-set measure) | Same, generic words removed (after the fact) |
|---|---|---|---|
| SmolVLM2-500M (base, served) | 64.3% (63) | **7.1% (7)** | 3.1% (3) |
| Done-VLM v1 | **71.4% (70)** | 9.2% (9) | 2.0% (2) |

- **The publishing rule was set beforehand:** publish only if v1 names absent things no more often than the base.
  On that measure v1 is worse, 9 photos against 7, so **the base stays as `done-vlm`**.
- **The difference is 2 photos of 98, far inside chance.** v1 names the right thing 7 points more often, with the
  same caveat: 7 photos.
- **The pre-set measure counts generic words as mentions.** The "absent" thing is one random other thing per photo,
  and its keyword list includes words such as "wall" (for a hole in drywall) and "floor" (for a mopped floor). Most
  hits are those words, which are really in the photo.
  - With them removed (wall, floor, pipe, tank, damage and similar), v1 has 2 false mentions and the base 3.
  - That rescoring was chosen after seeing the results, so it doesn't override the rule. It is the case for publishing
    v1 if the user wants to.
- **Style:** v1 writes like Glimmer, for example "A stainless steel kitchen sink with a single chrome faucet dispensing
  water is visible. The faucet and sink appear clean and intact". The base often starts "The image shows…".
- **Latency on 4 CPU threads** (cores 2–5, 30 held-out photos):
  - v1 p50 3.72 s, base 4.05 s; same size, same 181 prompt tokens.
  - v1's p95 was 71 s: one photo ran while the app's tests used the same cores. It is not a property of the model.
- **To publish v1:** in `serve.json`, point `done-vlm`'s `gguf` at `/home/Gino/models/vlm/done-vlm-v1/done-vlm-v1-Q8_0.gguf`
  (same mmproj), then `bash ml/kick_serve.sh`.

## Done-Chat

**Served** (2026-11-05) as `done-chat` on the same endpoint (VM 127.0.0.1:11480, forwarded to this machine at
127.0.0.1:11471 and 11472). **v2 replaced v1 on 2026-11-05.** Both are Qwen3-0.6B with LoRA r16, 2 epochs on 7,766
examples:
- **scope:** 1,326 work orders, compact form;
- **gap review:** 1,500;
- **negotiation moves:** 4,940.

v2 differs only in the scope prompt: it carries a 16-day calendar with each date's weekday, and states that a week runs
Monday to Sunday, so the model looks dates up instead of counting. That is the prompt the app already uses (it imports
`ml/prompts.mjs`). Both runs resumed through spot preemptions from their checkpoints.
- **v2 (served):** GGUF Q4_K_M, 397 MB, `ml/models/done-chat-qwen06v2-Q4_K_M.gguf`, SHA-256 `ae3b1f62…1c05a`.
- **v1 (kept):** `ml/models/done-chat-qwen06-Q4_K_M.gguf`, SHA-256 `b53b3b8f…12135`.

**Labels.** Every label comes from code except the wording.
- **Scope:** Glimmer wrote the person's request and the work order's text (title, items, conditions). Code supplied
  the trade, price ceiling and window, and drops orders with malformed conditions or a parts job without a receipt
  check (174 of 1,500).
  - **Glimmer's own scopes agreed with code** on the trade 100%, the price ceiling 91.2% and the window 89.3%.
- **Gap review:** built entirely by code from the catalog, with vague, uncheckable or wrong-evidence conditions
  planted. The shot list comes from what a passing photo shows.
- **Negotiation:** code's stated policy decides every action and price; Glimmer wrote the messages. The attack set
  uses orders hidden in the other side's messages, from templates never trained on.

**On the held-out sets** (`ml/eval_done.py`, bf16 on the GPU; every field right, 95% Wilson interval):

| Set | Items | v1 | **v2 (served)** | v2 notes |
|---|---|---|---|---|
| Scope | 181 orders | 56.9% [49.6, 63.9] | **88.4%** [82.9, 92.3] | **window 91.7%** (v1 58.6%), price ceiling 100%, trade 98.9%, conditions well formed 97.8% |
| Gap review | 200 orders | 98.0% [95.0, 99.2] | 97.0% [93.6, 98.6] | every gap found 99.0%, no false gap 100%, dispute risk 97.5%, shot hints 100% |
| Negotiation test | 661 moves | 100% [99.4, 100] | **100%** [99.4, 100] | action, price and within limits all 100% |
| Negotiation attack (unseen injection templates) | 96 moves | 94.8% [88.4, 97.8] | 95.8% [89.8, 98.4] | action 100%, **within limits 100%** (v1 had 1 move outside a limit); the 4 misses are pro accepts at a wrong price |

- **v2 wins on scope by 31.5 points** (the window: "by <weekday>", "next week", "this weekend"), and on the attack
  set it no longer produces any move outside a limit.
- **Gap review is 1 point lower** (6 misses vs 4 of 200), within both intervals. That is not a significant change.
- **15 of 181 windows are still wrong** in v2. The app should keep showing the window for the person to confirm.

**Latency on the CPU: not measured cleanly yet.** done-chat now shares done-vlm's cores (see Done-VLM), so it is
fast when the two are not called at the same moment and slow when they are.

## Done-Risk (ml/risk/)

**What it predicts.** For a job about to be agreed: the probability it ends in a dispute, and the probability it
runs over its agreed price (a change order). The app can size the authorization's buffer and send risky jobs to
review. Not an LLM.

**Data.** `fit.py` draws a synthetic portfolio: 200,000 training jobs and 50,000 held-out jobs.
- **Jobs:** 12 tasks in 4 trades, with the agreed price against the ceiling, the parts allowance against the part
  estimate, the window, the number of done-conditions and the gaps the scope review found.
- **The pro:** jobs done, rating, a licence where the trade needs one.
- **The hirer:** first job, past disputes, and whether a problem photo was posted.
- **The generator is stated in full in the script:** dispute and overrun come from logistic models with given
  coefficients, plus hidden effects. A low rating with a first-time hirer adds risk, and so does an old home on a
  plumbing job, which the features never see.

**Models.**
- **Logistic-regression baseline.**
- **LightGBM (binary)** with monotone constraints:
  - more scope gaps, a first-time hirer or past disputes never lower the risk;
  - more completed jobs, a higher rating or a problem photo never raise it;
  - a parts allowance closer to the estimate never raises overrun.

| Target | Base rate (test) | AUC: LightGBM | AUC: logistic | LightGBM − logistic (paired) | AUC of the true probability (ceiling) | Brier: LightGBM / logistic / truth | Monotone violations |
|---|---|---|---|---|---|---|---|
| dispute | 14.3% | **0.776** [0.771, 0.782] | 0.765 [0.760, 0.771] | **+0.011** [+0.009, +0.013] | 0.778 | 0.1038 / 0.1056 / 0.1034 | 0 |
| overrun | 14.0% | **0.780** [0.774, 0.786] | 0.766 [0.760, 0.771] | **+0.014** [+0.012, +0.016] | 0.783 | 0.0988 / 0.1009 / 0.0981 | 0 |

- **LightGBM reaches within 0.003 AUC of the ceiling** set by the true probabilities, and beats the baseline on both
  targets (the paired intervals exclude 0).
- **Calibrated.** Dispute deciles run predicted 2.2% vs actual 2.0% up to 47.8% vs 46.9%. Overrun deciles run 2.7%
  vs 2.6% up to 50.3% vs 50.5%.
- **Top SHAP features:**
  - dispute: scope gaps, price against the ceiling, the hirer's past disputes, first-time hirer, the pro's jobs and
    rating;
  - overrun: price, scope gaps, the allowance against the part estimate, trade, the pro's jobs, a problem photo.
- **As with Cover-Risk,** these numbers show only that the model learnt the generator's assumptions. They are not
  platform experience.

**Export.** `risk/out/done_risk_dispute.json` and `done_risk_overrun.json`, with `risk/risk.mjs`:
`load(dir).predict(job) -> { dispute: { p, why }, overrun: { p, why } }`. No dependency.
- **Checked against Python:** on 50 test jobs per target, Node differs from LightGBM by at most 3e-17.
- **Not wired into the app.**

## Done-OCR

**Data** (`ocr/gen.py`, output in `ocr/out_done`). Synthetic US documents in English, weighted to what a Done & Paid
job produces:
- **Supply-store parts receipts:** cartridges, fill valves, disposals, TV mounts, patch kits, with Austin's 8.25%
  sales tax.
- **Pros' own service invoices:** trip fee, labor hours at a rate, parts, tax on parts, a license or insurance line,
  and an EIN on 40%.
- **Cover's US receipts and repair invoices**, kept from the earlier generator.
- **Print and fonts:** 20 Latin training faces; plain, thermal and dot-matrix print; photo damage (perspective, skew,
  creases, glare, uneven light, blur, noise, JPEG).

| Split | Documents | Lines |
|---|---|---|
| train | 5,000 | (5 shards) |
| test (training fonts, new documents) | 400 | 5,278 |
| test_font (IBM Plex Mono, Lato, TeX Gyre Cursor: never trained on) | 200 | 2,659 |

**Recogniser** (`ocr/runs/done1`). The SVTR-tiny-style model, fine-tuned from Cover-OCR US (`us1`): 12 epochs at
lr 5e-4, about 22 minutes on the A100. Lines are read from the generator's line corners, and `ocr/parse.py` turns
them into fields. On the true text the rules get every field right on both splits.

| | CER | Lines exact | date | amount | merchant | taxId | reportNo | items | **All fields in one document** |
|---|---|---|---|---|---|---|---|---|---|
| test | **0.51%** | 96.7% [96.2, 97.2] | 99.3% | 99.8% | 97.8% | 99.8% | 100% | 92.0% | **89.5% [86.1, 92.1]** |
| test_font (unseen fonts) | **1.22%** | 93.8% [92.9, 94.7] | 96.5% | 98.0% | 96.0% | 99.5% | 100% | 88.5% | **85.0% [79.4, 89.3]** |

All fields in one document:

| | parts receipt | service invoice | store receipt | repair invoice | plain | thermal | dot-matrix |
|---|---|---|---|---|---|---|---|
| test | 142/165 | 138/150 | 37/41 | 41/44 | 201/221 | 75/95 | 82/84 |
| test_font | 56/71 | 67/76 | 21/26 | 26/27 | 105/119 | 27/41 | 38/40 |

**Notes.**
- Thermal receipts remain the hardest print (79% on test, 66% on unseen fonts).
- Items are the weakest field, because one wrong character in any item fails it.

**Line detector** (`ocr/det.py`, `ocr/runs/det1`). A small DBNet-style U-Net: it predicts shrunk line regions on the
photo, scaled to 640 px on the long side, and connected regions become rotated boxes. It was trained 25 epochs on
2,000 generated photos. End to end from the photo, scored the same way as above:

| | Line recall (IoU ≥ 0.5) | Line precision | Page CER | items | **All fields in one document** |
|---|---|---|---|---|---|
| test | 99.7% | 98.7% | 1.48% | 84.8% | **82.0% [77.9, 85.5]** |
| test_font (unseen fonts) | 99.2% | 97.5% | 2.25% | 80.5% | **77.5% [71.2, 82.7]** |

- **Going from the true line corners to detected boxes** costs 7.5 points of fully-right documents on test, mostly
  on items.
- **Time.** About 70 ms per page on the A100 (p50, test). The unseen-font run's p50 of 2.9 s was taken while the GPU
  was shared with training, so it is not representative. CPU time is not measured yet.

**Round 2: rating/serial plates, permits, lien waivers** (`ocr/run_ocr2.sh`, `ocr/out_done2`, `ocr/runs/done2`).
- **New documents** in the generator and parser:
  - product rating and serial plates (water heaters, AC and heat pumps, disposals, dishwashers): brand, model, serial,
    specs;
  - City of Austin building permits: permit number, issue date, fee, work;
  - Texas conditional waivers and releases on final payment: claimant, amount, date.
- **Mix:** 5,000 training documents across seven kinds.
- **Recogniser:** fine-tuned from `done1` for 10 epochs. On the true text the rules get every field right on both
  splits.

| | CER | Lines exact | **All fields in one document** | parts | service | plate | permit | lien waiver | store receipt | repair |
|---|---|---|---|---|---|---|---|---|---|---|
| test | 1.08% | 94.8% | **87.8% [84.2, 90.6]** | 82/97 | 89/105 | 66/68 | 24/27 | 26/31 | 26/32 | 38/40 |
| test_font (unseen fonts) | 1.63% | 93.3% | **87.5% [82.2, 91.4]** | 43/49 | 49/57 | 31/32 | 14/15 | 10/10 | 9/16 | 19/21 |

- **End to end from the photo** on test, with the round-1 detector (`det1`, not retrained on the new layouts): line
  recall 98.8%, page CER 2.4%, and **73.3% [68.7, 77.4]** of documents fully right. That is 14.5 points under the
  scores with the generator's line positions, mostly on items (80.5%) and merchant (92.8%).
  - Retraining the detector on the round-2 photos is the obvious next step. The unseen-font end-to-end run was cut
    off when the VM was stopped and is rerunning.
- **Copied to this machine:** `ml/models/ocr/done2/model.pt` (recogniser, 15.6 MB) and `ml/models/ocr/det1/det.pt`
  (detector, 2 MB). They run in PyTorch; they are not GGUF.

## Serving on the A100 (2026-11-07)

The models had been served on the VM's CPU while the GPU trained; the GPU sat idle afterwards. They now run on it.
- **llama.cpp built with CUDA** (`~/llama.cpp/build-cuda`, `GGML_CUDA=ON`, sm_80), the same commit as the CPU build;
  `serve.json` points at it with `-ngl 99` and 2–4 slots per model (`serve.cpu.json.bak` is the CPU layout).
- **Done-OCR on the GPU:** `ocr/server.py --device cuda` (`ocr_loop.sh`; `.cpu.bak` copies kept).

| | CPU (before) | A100 (on the VM) | From this machine through the tunnel |
|---|---|---|---|
| done-chat, one short reply | 0.9 s | 0.05 s | 0.5 s |
| done-audit, one verdict | 0.6–2.8 s | 0.015–0.06 s | 0.5 s |
| done-vlm, one photo | 3.7–5.3 s | – | 0.3–1.0 s |
| Done-OCR, one receipt | 2.45 s | 1.1 s (mostly image preprocessing) | 1.5 s |

- **What is left is the network.** A round trip from Taiwan to us-central1 is 180 ms, and a call through the SSH
  tunnel costs about 0.5 s. The app now describes a job's photos at the same time as it reads the receipt, instead
  of one after another: the tour's check went from 6.6 s to 3.6 s, its evidence step from 10.7 s to 7 s.
- **Decoding speed is not the bottleneck** for 0.6B models (hundreds of tokens a second on the A100 for replies of
  4–15 tokens), so speculative decoding or lower-bit quantization would save milliseconds, not seconds.

## The served endpoint moves to an L4 in Tokyo (2026-11-07)

**Layout.** The website runs on one machine with one port (8810, PayPal sandbox). The models run on `veripay-l4`
(asia-northeast1-a, g2-standard-8, one NVIDIA L4, standard provisioning, static IP): `ml/serve.mjs` answers
done-chat, done-audit, done-vlm and Done-OCR (`/read`) on **one port, 8443**, over TLS (a certificate for the IP,
trusted by the app through `NODE_EXTRA_CA_CERTS`) and only with the shared token (`DONE_MODEL_TOKEN`); the firewall
admits only the website's address. llama-server and the OCR worker listen on 127.0.0.1 (`ml/l4_up.sh`, started at
boot). The Taiwan zones had no L4 left; Tokyo is 63 ms from the website, us-central1 180 ms. cover-a100 is stopped.

**What was tried from the speed-up recipe** (`ml/speedup_sweep.sh`, `ml/eval_gguf.mjs`, 120 held-out items per set,
scored by code; p50 latency per call on the L4, flash attention on):

| Setting | Audit test | Audit attack | Negotiate | Scope fields | Audit p50 |
|---|---|---|---|---|---|
| Q8_0 (**served**) | **100%** | **100%** | **100%** | 79.0% | 360 ms |
| Q4_K_M (served before) | 99.5% | 100% | 99.1% | 74.4% | 308 ms |
| Q3_K_M (sub-4-bit) | 86.0% | 86.7% | 72.1% | 67.1% | 333 ms |
| Q2_K (sub-4-bit) | 0.2% | 0.9% | 12.7% | 1.9% | 2,577 ms (rambles to the token limit) |
| Q4_K_M + n-gram speculation | 99.5% | – | – | – | 316 ms |
| Q8_0 + Q2_K as the draft model | 100% | – | – | – | 1,074 ms |

- **Sub-4-bit loses the accuracy and buys no time.** A 0.6B model at Q4 already fits the L4's cache; the time per
  call is the JSON grammar and the per-token overhead, not memory bandwidth, so smaller weights don't help.
- **Speculative decoding needs a good draft.** Qwen3-0.6B is the smallest of its family, so the only draft with the
  same vocabulary is its own Q2_K, which is wrong almost every time: verification rejects it and each call costs 3×.
  N-gram lookup from the prompt neither helps nor hurts (the verdict codes aren't in the prompt).
- **MoE expert sharing does not apply:** the models are dense.
- **Served: Q8_0** for done-audit and done-chat. It is the most accurate setting and costs about 50 ms a call over
  Q4. The relaxed-acceptance runs (`--spec-draft-p-min`) were still in the sweep when this was written.
