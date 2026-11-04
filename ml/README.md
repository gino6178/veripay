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
| `cases.mjs` | `jev/cases.mjs` | Cover-Audit cases from `api/src/products/*.json`: a policy, a claim, and a decision on it. `judge()` makes the right decision and says which clauses apply; most decisions are then spoiled one way (overpay, underpay, wrong clause, should go to a person), so the right verdict is known by code. `judge()` is the reference until the app line's claim rules land; then swap them in. |
| `teacher.mjs` | `jev/teacher.mjs` | Muse Glimmer audits each case `samples` times. Resumable (done answers are kept; answers that never came are asked again), 3 tries per call, N calls at once, no fetch time limit. |
| `prompt.py` | `jev/prompt.py` | The student's input as token ids: the facts, the decision, an `applies?` marker after each clause the claim can turn on, and the five verdict letters. Llama 3 and Qwen3 chat formats. |
| `train.py` | `jev/train.py` | LoRA (r16, every projection). Losses only at known positions: the verdict letters (Glimmer's vote distribution, or `--target code`/`mix`), and ` yes`/` no` at each marker against the rule engine. `--eval` scores an adapter. |
| `export.sh` | `jev/export.sh` | Merge, convert to GGUF f16, quantize to Q4_K_M and Q4_0, optionally with an imatrix from real Cover prompts. |
| `worker.py` | `jev/worker.py` | The GGUF on the CPU through llama-cpp-python, `POST /audit`, one request at a time, logits only at the positions read, prefix cache kept, busy and deadline handling. |
| `serve.sh` | `jev/serve.sh` | Starts the worker on the server at 127.0.0.1:11448, nice 19, 8 threads. |
| `eval_gguf.py` | `jev/eval_gguf.py` | Scores the GGUF on held-out cases as the worker runs it, with latency. |
| `report.py` | `jev/report.py` | Glimmer's self-agreement and accuracy against code; each student's agreement with Glimmer, verdict accuracy, planted errors caught and false alarms, clause precision/recall, the threshold set on validation, latency; McNemar between students; 95% Wilson intervals. |
| `run_teacher.sh`, `run_train.sh` | `jev/run_teacher.sh`, `run_train*.sh` | The first round, in order: test (500 cases × 3), val (300 × 2), train (4,000 × 1); then Llama 3.2 1B and Qwen3-1.7B students. |
| `vm/setup.sh`, `vm/ollama.env` | (Serve's VM was set up by hand) | Ollama 0.40.11 on 127.0.0.1:11434 with 96 parallel requests, Muse Glimmer, Node 22, a Python venv, llama.cpp. |
| `probe/` | new | Muse Glimmer's Traditional Chinese on insurance work: 25 clause questions, 25 receipt and claim extractions, 5 receipt images. `probe/RESULTS.md` has the numbers and the verdict per task. |

## Run (on the VM, from the repository root)

```bash
bash ml/vm/setup.sh                                   # once
bash ml/run_teacher.sh                                # resumable; PAR=96 by default
bash ml/run_train.sh
bash ml/export.sh ml/runs/1b_r1 ~/models/meta-1b cover-audit-1b-r1
python3 ml/report.py --data ml/data/test --val-data ml/data/val --pred "1b_r1=ml/preds/1b_r1_test.jsonl,ml/preds/1b_r1_val.jsonl" --out ml/results.json
```

Ollama listens on 127.0.0.1 only. From this machine: `gcloud compute ssh cover-a100 --zone us-central1-a -- -N -L 11434:127.0.0.1:11434`.
Stop the VM when it is not in use: `gcloud compute instances stop cover-a100 --zone us-central1-a`.

## Limits

- The cases are synthetic. The student can only show that it learned the rules written in `judge()` and the clauses;
  that says nothing about real claims.
- Glimmer is the reference for the verdict distribution and it varies: its agreement with itself is the ceiling.
- The probe cases in `probe/` are for evaluation only and are never used as training data.
