# Cover ml: the model-training line

The models in PLAN-cover.md section 12, trained on a GCP VM (`cover-a100`: one A100 40 GB, spot, us-central1-a) and
served from GGUF files on the server's CPU. Muse Glimmer (Meta, open weights, Apache 2.0) is the only teacher. No Claude
or GPT outputs are used as training data, and no real personal data is used.

## Credit

This line is a port of Serve's decision-model distillation (`D:\COmp2\serve\jev\`, written up in Serve's
`docs/decision_model.md`). The structure, the teacher's call (Ollama chat, thinking "low", JSON Schema, temperature
0.3, 900-token reasoning budget, 96 requests at once), the resumable teacher runs, the losses at code-known positions,
the merge → GGUF → Q4_K_M export, the one-request-at-a-time CPU worker with prefix-cache reuse, and the report's rule
(Glimmer's agreement with itself is the ceiling) all come from Serve. Serve's repository is left untouched.

## What is here

| File | From Serve | What it does for Cover |
|---|---|---|
| `cases.mjs` | `jev/cases.mjs` | Cover-Audit cases from Cover's own claim engine, run in memory as `api/test/claims.test.js` runs it. Each case is a made-up person, a quote, a policy bought with PayPal's stand-in, the clock moved, and a claim filed with its evidence. `claims.js` `decide()`/`payable()` and `fraud.js` give the right decision, every check with its clause, and the signals. Most decisions are then spoiled one way: overpay, underpay, wrong clause, or paid where it should go to a person. |
| `build_audit.mjs` | `jev/run_teacher.sh` (sets) | Cover-Audit's sets (test 300 × 3 answers, val 200 × 2, train 2,000 × 1), with the jobs that ask Glimmer to audit each case. |
| `tasks.mjs` | | Cover-1B's four tasks as prompts: clause Q&A, claim story to fields, OCR text to the reader's JSON, and the quote dialogue. Also the injection templates (train, and held-out). |
| `build_1b.mjs` | | `gen`: code makes the facts and Glimmer puts them into people's words. `assemble`: filters by code, writes the SFT rows, the injection sets and the teacher-column jobs. |
| `teacher.mjs` | `jev/teacher.mjs` | Glimmer answers any `jobs.jsonl`. Resumable, 3 tries per call, 96 at once. The schema goes in the prompt and the reply is checked in code (grammar sampling on 12 vCPUs was the bottleneck). |
| `prompt.py` | `jev/prompt.py` | Cover-Audit's input as token ids: the facts, the decision, an `ok?` marker for each engine check and for "no fraud signal", and the five verdict letters. Llama 3 and Qwen3 formats. |
| `train.py` | `jev/train.py` | Cover-Audit: LoRA, losses only at known positions. The verdict is trained on Glimmer's votes (or `--target code`/`mix`), and each marker on the engine's result. `--eval base` scores the untuned model. |
| `train_sft.py` | | Cover-1B: LoRA SFT, with the loss (and the LM head) only on the answer's tokens. |
| `eval_1b.py` | `jev/report.py` (ideas) | Cover-1B: generates for the student and the untuned base, scores them and Glimmer's own answers by code, with Wilson intervals and McNemar. |
| `export.sh` | `jev/export.sh` | Merge, GGUF f16, then Q4_K_M and Q4_0 (optionally with an imatrix). |
| `worker.py`, `serve.sh`, `eval_gguf.py` | `jev/worker.py`, `serve.sh`, `eval_gguf.py` | Cover-Audit's GGUF on the CPU: one forward pass per decision, the prefix cache kept, busy and deadline handling. |
| `report.py` | `jev/report.py` | Cover-Audit: Glimmer's self-agreement and accuracy against the engine, and each student's agreement, verdict accuracy, planted errors caught and false alarms, check precision and recall, threshold and McNemar. |
| `run_teacher.sh`, `run_round1.sh` | `jev/run_teacher.sh`, `run_train*.sh` | The teacher runs in order, then round 1 (Cover-1B on Llama 3.2 1B and Qwen3-1.7B, then Cover-Audit), each step skipped once its output exists. |
| `ocr/` | | Cover-OCR: `gen.py` (synthetic receipts, invoices, quotes and police slips with photo damage, every field known), `rec.py` (SVTR-tiny-style recogniser and its evaluation), `parse.py` (lines to fields by rules), `gen_all.sh`. |
| `risk/` | | Cover-Risk: `fit.py` (the stated Poisson × Gamma generator, GLM, LightGBM with monotone constraints, Gini, calibration, SHAP, export), `risk.mjs` (the trees in Node, the shape of `quote.js` `useRiskModel`; not wired in), `zones_export.mjs`. |
| `vm/setup.sh`, `vm/ollama.env` | (Serve's VM was set up by hand) | Ollama 0.40.11 on 127.0.0.1:11434 with 96 parallel requests, Muse Glimmer, Node 22, a Python venv, llama.cpp. |
| `probe/` | | Muse Glimmer's Traditional Chinese on insurance work (`probe/RESULTS.md`). |
| `RESULTS.md` | | Round 1's numbers per model, with what failed. |

## Run (on the VM, from the repository root)

```bash
bash ml/vm/setup.sh                                   # once
node ml/build_1b.mjs gen && node ml/build_audit.mjs   # the teacher's jobs
bash ml/run_teacher.sh                                # resumable; PAR=96 by default
bash ml/ocr/gen_all.sh && python ml/ocr/rec.py train --data ml/ocr/out --out ml/ocr/runs/r1
python ml/risk/fit.py --out ml/risk/out && node ml/risk/risk.mjs ml/risk/out
bash ml/run_round1.sh                                 # Cover-1B (Llama and Qwen), then Cover-Audit
```

Ollama listens on 127.0.0.1 only. From this machine: `gcloud compute ssh cover-a100 --zone us-central1-a -- -N -L 11434:127.0.0.1:11434`.
Stop the VM when it is not in use: `gcloud compute instances stop cover-a100 --zone us-central1-a`.

## Limits

- Everything is synthetic. A student can only show that it learned Cover's own rules, the clauses and the generators'
  assumptions; that says nothing about real claims or real receipts.
- Glimmer is the reference for the verdict distribution and it varies: its agreement with itself is the ceiling.
- The probe cases in `probe/` are for evaluation only and are never used as training data.
