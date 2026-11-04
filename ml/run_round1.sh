#!/usr/bin/env bash
# Round 1 of training (US, English data), on the A100 VM next to Ollama (which keeps Muse Glimmer loaded: about 25 GB of the 40),
# each model measured before the next (PLAN-cover.md 12.5):
#   1. Cover-1B: assemble the SFT rows (ml/build_1b.mjs assemble), then LoRA r16 on Llama 3.2 1B Instruct and on
#      Qwen3-1.7B; each scored on the held-out sets with its untuned base (ml/eval_1b.py)
#   2. Cover-Audit (after the teacher's audit answers are in): the decision model on Llama 3.2 1B, its untuned base,
#      and report.py against Glimmer and against the claim engine
# A step whose output is there is skipped, so the script can be run again after a stop.
set -u
cd "$(dirname "$0")/.."
export PYTORCH_CUDA_ALLOC_CONF=expandable_segments:True OMP_NUM_THREADS=2
PY=~/venv/bin/python; M1=~/models/meta-1b; MQ=~/models/qwen3-1.7b
mkdir -p ml/runs ml/logs ml/data/1b/preds
log() { echo "$(date -u +%FT%TZ) $*" >> ml/logs/round1.log; }
wait_for() { while ! grep -q "TEACHER_DONE $1 " ml/logs/teacher_us.log 2>/dev/null; do sleep 60; done; }
# 1. Cover-1B
for d in qa/train qa/test story/train story/test dialog/train dialog/test; do wait_for "ml/data/1b/gen/$d"; done
[ -f ml/data/1b/sft/counts.json ] || { node ml/build_1b.mjs assemble >> ml/logs/round1.log 2>&1; log assembled; }
# Glimmer's own answers to the test prompts (the teacher column), beside the training
grep -q "TEACHER_DONE ml/data/1b/teacher_eval " ml/logs/teacher_us.log 2>/dev/null || (node ml/teacher.mjs ml/data/1b/teacher_eval 96 >> ml/logs/teacher_us.log 2>&1 &)
sft() { name=$1; base=$2; [ -f ml/runs/$name/adapter_model.safetensors ] || { log "train $name"; nice -n 5 $PY ml/train_sft.py --base $base --out ml/runs/$name --tokens 6000 --accum 4 > ml/logs/$name.log 2>&1; }; }
gen() { name=$1; base=$2; adapter=$3; [ -f ml/data/1b/preds/${name}_inject.jsonl ] || { log "generate $name"; nice -n 5 $PY ml/eval_1b.py gen --base $base ${adapter:+--adapter $adapter} --name $name >> ml/logs/eval_1b.log 2>&1; }; }
sft c1b_llama $M1; gen llama_student $M1 ml/runs/c1b_llama; gen llama_base $M1 ""
$PY ml/eval_1b.py report --names llama_base,llama_student --out ml/results_1b.json >> ml/logs/round1.log 2>&1
sft c1b_qwen $MQ; gen qwen_student $MQ ml/runs/c1b_qwen; gen qwen_base $MQ ""
$PY ml/eval_1b.py report --names llama_base,llama_student,qwen_base,qwen_student --out ml/results_1b.json >> ml/logs/round1.log 2>&1
log "cover-1b done"
# 2. Cover-Audit
for d in test val train; do wait_for "ml/data/audit/$d"; done
A=ml/data/audit
[ -f ml/runs/audit_llama/adapter_model.safetensors ] || { log "train audit_llama"; nice -n 5 $PY ml/train.py --base $M1 --train $A/train --val $A/val --out ml/runs/audit_llama --bs 8 --accum 2 > ml/logs/audit_llama.log 2>&1; }
for d in test val; do
  [ -f ml/preds/audit_llama_$d.jsonl ] || $PY ml/train.py --base $M1 --eval ml/runs/audit_llama --test $A/$d --pred ml/preds/audit_llama_$d.jsonl >> ml/logs/audit_eval.log 2>&1
  [ -f ml/preds/audit_base_$d.jsonl ] || $PY ml/train.py --base $M1 --eval base --test $A/$d --pred ml/preds/audit_base_$d.jsonl >> ml/logs/audit_eval.log 2>&1
done
$PY ml/report.py --data $A/test --val-data $A/val --pred "llama_1b=ml/preds/audit_llama_test.jsonl,ml/preds/audit_llama_val.jsonl" --pred "llama_1b_untuned=ml/preds/audit_base_test.jsonl,ml/preds/audit_base_val.jsonl" --out ml/results_audit.json >> ml/logs/round1.log 2>&1
log "round 1 done"
echo ROUND1_DONE >> ml/logs/round1.log
