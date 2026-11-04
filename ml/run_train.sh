#!/usr/bin/env bash
# The first round of Cover-Audit students (PLAN-cover.md 12.2: Llama 3.2 1B, which Serve's whole line already ran, and
# Qwen3-1.7B, stronger in Chinese; the evaluation picks one), on the A100 VM, after ml/run_teacher.sh:
#   1b_r1    Llama 3.2 1B Instruct, LoRA r16, verdict distillation + applies, 3 epochs
#   q17_r1   Qwen3-1.7B, the same
# Each is scored in bf16 on the held-out sets whose teacher run has finished.
set -u
cd "$(dirname "$0")/.."
export PYTORCH_CUDA_ALLOC_CONF=expandable_segments:True
M1=$HOME/models/meta-1b; MQ=$HOME/models/qwen3-1.7b   # meta-llama/Llama-3.2-1B-Instruct, Qwen/Qwen3-1.7B
mkdir -p ml/runs ml/preds
train() { name=$1; shift; [ -f ml/runs/$name/adapter_model.safetensors ] || python3 ml/train.py --train ml/data/train --val ml/data/val --out ml/runs/$name --bs 8 --accum 2 "$@" > ml/runs/$name.log 2>&1; }
score() { name=$1; base=$2; for d in test val; do
  grep -q TEACHER_DONE ml/data/$d.log 2>/dev/null && [ ! -f ml/preds/${name}_${d}.jsonl ] && python3 ml/train.py --base $base --eval ml/runs/$name --test ml/data/$d --pred ml/preds/${name}_${d}.jsonl >> ml/preds/$name.scores 2>&1; done; }
train 1b_r1 --base $M1; score 1b_r1 $M1
train q17_r1 --base $MQ; score q17_r1 $MQ
echo TRAIN_ALL_DONE
