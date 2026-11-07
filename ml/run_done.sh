#!/usr/bin/env bash
# Done & Paid's training round, on cover-a100 next to Ollama (Muse Glimmer keeps about 25 GB of the 40), each model
# measured before the next, in the coordinator's priority order:
#   1. Done-Audit: assemble (ml/audit_gen.mjs), Glimmer's own audit of the test and attack sets (the teacher column, in
#      the background), LoRA on Qwen3-0.6B and on Llama 3.2 1B, each scored with its untuned base (ml/eval_done.py)
#   2. Done-Chat: assemble (ml/chat_gen.mjs), the teacher column, LoRA on the same two bases, scored the same way
# A step whose output is there is skipped, so the script can be run again after a stop.
set -u
cd "$(dirname "$0")/.."
export PYTORCH_CUDA_ALLOC_CONF=expandable_segments:True OMP_NUM_THREADS=2
PY=~/venv/bin/python; Q=~/models/qwen3-0.6b; L=~/models/meta-1b
mkdir -p ml/runs ml/preds ml/logs
log() { echo "$(date -u +%FT%TZ) $*" >> ml/logs/run_done.log; }
wait_for() { while ! grep -q "$1" ml/logs/teacher.log 2>/dev/null; do sleep 60; done; }
teach() { grep -q "TEACHER_DONE $1 " ml/logs/teacher.log 2>/dev/null || pgrep -f "teacher.mjs $1" > /dev/null || (node ml/teacher.mjs "$1" 96 >> ml/logs/teacher.log 2>&1 &); }
sft() { name=$1; base=$2; shift 2; [ -f ml/runs/$name/adapter_model.safetensors ] || { log "train $name"; nice -n 5 $PY ml/train_sft.py --base $base --out ml/runs/$name --tokens 6000 --accum 4 "$@" > ml/logs/$name.log 2>&1; log "trained $name"; }; }
gen() { name=$1; base=$2; adapter=$3; set=$4; extra=${5:-}; [ -f ml/preds/${name}_$(basename $set .jsonl).jsonl ] || nice -n 5 $PY ml/eval_done.py gen --base $base ${adapter:+--adapter $adapter} --set $set --out ml/preds/${name}_$(basename $set .jsonl).jsonl $extra >> ml/logs/eval.log 2>&1; }

# 1. Done-Audit (compact answers: per check id, verdict, reason code, evidence ref; code writes the sentence)
wait_for AUDIT_GEN_DONE
A=ml/data/audit/sft
[ -f $A/counts.json ] || { node ml/audit_gen.mjs assemble >> ml/logs/run_done.log 2>&1; log "audit assembled"; }
teach ml/data/audit/teacher_eval
for m in "audit_qwen06 $Q" "audit_llama1b $L"; do set -- $m
  sft $1 $2 --files $A/train.jsonl --epochs 2
  for s in test attack; do gen $1 $2 ml/runs/$1 $A/$s.jsonl "--conf --max_new 200"; done
done
for s in test attack; do gen audit_qwen06_base $Q "" $A/$s.jsonl "--max_new 300"; gen audit_llama1b_base $L "" $A/$s.jsonl "--max_new 300"; done
$PY ml/eval_done.py report --kind audit --sets test=$A/test.jsonl,attack=$A/attack.jsonl \
  --preds "qwen06=ml/preds/audit_qwen06_{set}.jsonl,llama1b=ml/preds/audit_llama1b_{set}.jsonl,qwen06_base=ml/preds/audit_qwen06_base_{set}.jsonl,llama1b_base=ml/preds/audit_llama1b_base_{set}.jsonl" \
  --teacher ml/data/audit/teacher_eval/answers.jsonl --out ml/results_audit.json >> ml/logs/run_done.log 2>&1
log "audit done"

# 2. Done-Chat
wait_for CHAT_GEN_DONE
C=ml/data/chat/sft
[ -f $C/counts.json ] || { node ml/chat_gen.mjs assemble >> ml/logs/run_done.log 2>&1; log "chat assembled"; }
for m in "chat_qwen06 $Q" "chat_llama1b $L"; do set -- $m
  sft $1 $2 --files $C/scope_train.jsonl,$C/negotiate_train.jsonl,$C/gap_train.jsonl --epochs 2
  for s in scope_test gap_test negotiate_test negotiate_attack; do gen $1 $2 ml/runs/$1 $C/$s.jsonl; done
done
for s in scope_test gap_test negotiate_test negotiate_attack; do gen chat_qwen06_base $Q "" $C/$s.jsonl; gen chat_llama1b_base $L "" $C/$s.jsonl; done
# Glimmer's own answers to the chat test sets, once the VLM evaluation (whose CPU timings its sampling would disturb) is over
while ! grep -q DESCRIBE_DONE ml/logs/vlm_describe.log 2>/dev/null; do sleep 60; done
teach ml/data/chat/teacher_eval
# the audit's teacher column may still have been running when the audit report was written: write it again
$PY ml/eval_done.py report --kind audit --sets test=$A/test.jsonl,attack=$A/attack.jsonl \
  --preds "qwen06=ml/preds/audit_qwen06_{set}.jsonl,llama1b=ml/preds/audit_llama1b_{set}.jsonl,qwen06_base=ml/preds/audit_qwen06_base_{set}.jsonl,llama1b_base=ml/preds/audit_llama1b_base_{set}.jsonl" \
  --teacher ml/data/audit/teacher_eval/answers.jsonl --out ml/results_audit.json >> ml/logs/run_done.log 2>&1
while pgrep -f "teacher.mjs ml/data/chat/teacher_eval" > /dev/null; do sleep 60; done
$PY ml/eval_done.py report --kind chat --sets scope_test=$C/scope_test.jsonl,gap_test=$C/gap_test.jsonl,negotiate_test=$C/negotiate_test.jsonl,negotiate_attack=$C/negotiate_attack.jsonl \
  --preds "qwen06=ml/preds/chat_qwen06_{set}.jsonl,llama1b=ml/preds/chat_llama1b_{set}.jsonl,qwen06_base=ml/preds/chat_qwen06_base_{set}.jsonl,llama1b_base=ml/preds/chat_llama1b_base_{set}.jsonl" \
  --teacher ml/data/chat/teacher_eval/answers.jsonl --out ml/results_chat.json >> ml/logs/run_done.log 2>&1
log "chat done"
echo ROUND_DONE >> ml/logs/run_done.log
