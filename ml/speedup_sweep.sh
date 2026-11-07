#!/usr/bin/env bash
# The serving settings tried for Done-Audit and Done-Chat on the L4, each scored on the held-out sets by eval_gguf.mjs:
# quantization (Q8_0, Q4_K_M, sub-4-bit Q3_K_M and Q2_K) and speculative decoding (the model's own Q2_K as the draft,
# n-gram lookup from the prompt, and a relaxed draft threshold). One JSON line per setting and set: ml/logs/sweep.jsonl.
#   bash ml/speedup_sweep.sh
set -u
cd "$(dirname "$0")/.."
M=~/models; N=${N:-120}; OUT=ml/logs/sweep.jsonl; mkdir -p ml/logs
NODE=~/node/bin/node; LS=~/llama.cpp/build/bin/llama-server
run() { # name auditGguf chatGguf extraArgsJson
  local name=$1
  cat > /tmp/sweep.json <<J
{ "port": 11499, "backendPort": 18201, "llamaServer": "$LS", "ctx": 8192, "maxWaitMs": 60000,
  "models": { "done-audit": { "gguf": "$2", "threads": 2, "args": $4 }, "done-chat": { "gguf": "$3", "threads": 2, "args": $5 } } }
J
  DONE_SERVE_CONFIG=/tmp/sweep.json $NODE ml/serve.mjs > /tmp/sweep-serve.log 2>&1 & local pid=$!
  for i in $(seq 1 120); do curl -s -m 2 -o /dev/null -w "%{http_code}" http://127.0.0.1:18201/health | grep -q 200 && curl -s -m 2 -o /dev/null -w "%{http_code}" http://127.0.0.1:18202/health | grep -q 200 && break; sleep 1; done
  for s in "done-audit ml/data/audit/sft/test.jsonl" "done-audit ml/data/audit/sft/attack.jsonl" "done-chat ml/data/chat/sft/scope_test.jsonl" "done-chat ml/data/chat/sft/negotiate_test.jsonl"; do
    set -- $s
    $NODE ml/eval_gguf.mjs --url http://127.0.0.1:11499 --model $1 --set $2 --n $N | sed "s/^{/{\"setting\":\"$name\",/" >> $OUT
  done
  kill $pid; wait $pid 2>/dev/null; sleep 2
}
FA='"-ngl","99","-fa","on"'
A=$M/done-audit-qwen06; C=$M/done-chat-qwen06v2
run q4      $A-Q4_K_M.gguf $C-Q4_K_M.gguf "[$FA]" "[$FA]"
run q8      $A-Q8_0.gguf   $C-Q8_0.gguf   "[$FA]" "[$FA]"
run q3km    $A-Q3_K_M.gguf $C-Q3_K_M.gguf "[$FA]" "[$FA]"
run q2k     $A-Q2_K.gguf   $C-Q2_K.gguf   "[$FA]" "[$FA]"
run q4+ngram $A-Q4_K_M.gguf $C-Q4_K_M.gguf "[$FA,\"--spec-type\",\"ngram-simple\"]" "[$FA,\"--spec-type\",\"ngram-simple\"]"
run q8+draftq2 $A-Q8_0.gguf $C-Q8_0.gguf "[$FA,\"--spec-type\",\"draft-simple\",\"-md\",\"$A-Q2_K.gguf\",\"-ngld\",\"99\",\"--spec-draft-n-max\",\"8\"]" "[$FA,\"--spec-type\",\"draft-simple\",\"-md\",\"$C-Q2_K.gguf\",\"-ngld\",\"99\",\"--spec-draft-n-max\",\"8\"]"
run q4+draftq2 $A-Q4_K_M.gguf $C-Q4_K_M.gguf "[$FA,\"--spec-type\",\"draft-simple\",\"-md\",\"$A-Q2_K.gguf\",\"-ngld\",\"99\",\"--spec-draft-n-max\",\"8\"]" "[$FA,\"--spec-type\",\"draft-simple\",\"-md\",\"$C-Q2_K.gguf\",\"-ngld\",\"99\",\"--spec-draft-n-max\",\"8\"]"
run q4+draftq2-relaxed $A-Q4_K_M.gguf $C-Q4_K_M.gguf "[$FA,\"--spec-type\",\"draft-simple\",\"-md\",\"$A-Q2_K.gguf\",\"-ngld\",\"99\",\"--spec-draft-n-max\",\"16\",\"--spec-draft-p-min\",\"0.3\"]" "[$FA,\"--spec-type\",\"draft-simple\",\"-md\",\"$C-Q2_K.gguf\",\"-ngld\",\"99\",\"--spec-draft-n-max\",\"16\",\"--spec-draft-p-min\",\"0.3\"]"
echo SWEEP_DONE >> $OUT
