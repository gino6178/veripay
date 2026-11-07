#!/usr/bin/env bash
# Done-Chat v2: the scope prompt now carries a two-week calendar (weekday arithmetic was the scope's weak point:
# "by Tuesday", "next week"). Re-assemble, retrain Qwen3-0.6B (checkpointed), score every set, and publish it as
# done-chat if its scope window and negotiation are at least as good as v1's. Resumable: each step is skipped when its
# output exists.
set -u
cd "$(dirname "$0")/.."
export PYTORCH_CUDA_ALLOC_CONF=expandable_segments:True OMP_NUM_THREADS=2
PY=~/venv/bin/python; Q=~/models/qwen3-0.6b; C=ml/data/chat/sft2
log() { echo "$(date -u +%FT%TZ) $*" >> ml/logs/chat_v2.log; }
if [ ! -f $C/counts.json ]; then
  rm -rf ml/data/chat/sft_v1_keep; cp -r ml/data/chat/sft ml/data/chat/sft_v1_keep
  node ml/chat_gen.mjs assemble >> ml/logs/chat_v2.log 2>&1 && rm -rf $C && cp -r ml/data/chat/sft $C
  rm -rf ml/data/chat/sft && mv ml/data/chat/sft_v1_keep ml/data/chat/sft   # v1's rows stay where run_done.sh reads them
  log "assembled v2"
fi
[ -f ml/runs/chat_qwen06v2/adapter_model.safetensors ] || { log "train"; nice -n 5 $PY ml/train_sft.py --base $Q --out ml/runs/chat_qwen06v2 --tokens 6000 --accum 4 --files $C/scope_train.jsonl,$C/negotiate_train.jsonl,$C/gap_train.jsonl --epochs 2 >> ml/logs/chat_v2.log 2>&1; log "trained"; }
for s in scope_test gap_test negotiate_test negotiate_attack; do
  [ -f ml/preds/chat_qwen06v2_$s.jsonl ] || nice -n 5 $PY ml/eval_done.py gen --base $Q --adapter ml/runs/chat_qwen06v2 --set $C/$s.jsonl --out ml/preds/chat_qwen06v2_$s.jsonl >> ml/logs/chat_v2.log 2>&1
done
$PY ml/eval_done.py report --kind chat --sets scope_test=$C/scope_test.jsonl,gap_test=$C/gap_test.jsonl,negotiate_test=$C/negotiate_test.jsonl,negotiate_attack=$C/negotiate_attack.jsonl \
  --preds "qwen06v2=ml/preds/chat_qwen06v2_{set}.jsonl" --out ml/results_chat_v2.json >> ml/logs/chat_v2.log 2>&1
log "scored"
echo CHAT_V2_SCORED >> ml/logs/chat_v2.log
