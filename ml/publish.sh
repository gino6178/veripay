#!/usr/bin/env bash
# Publish a trained adapter on the VM's endpoint: merge and export it to GGUF Q4_K_M (ml/export.sh), put it in
# ml/serve.json under the given model name, and restart ml/serve.mjs (ml/serve_loop.sh starts it again within 2 s; the
# other models come back with it).
#   bash ml/publish.sh <model name> <run dir> <base model dir> <export name>
#   bash ml/publish.sh done-chat ml/runs/chat_qwen06 ~/models/qwen3-0.6b done-chat-qwen06
set -eu
cd "$(dirname "$0")/.."
NAME="$1"; RUN="$2"; BASE="$3"; OUT="$4"
QUANTS=Q4_K_M nice -n 5 bash ml/export.sh "$RUN" "$BASE" "$OUT" > "ml/logs/export_$OUT.log" 2>&1
GGUF="$HOME/export/$OUT/$OUT-Q4_K_M.gguf"; test -f "$GGUF"
node -e 'const fs=require("fs"),f="ml/serve.json",c=JSON.parse(fs.readFileSync(f,"utf8"));c.models[process.argv[1]]=process.argv[2];fs.writeFileSync(f,JSON.stringify(c,null,1));' "$NAME" "$GGUF"
pkill -f '^node ml/serve.mjs' || true
for i in $(seq 1 60); do curl -s -m 2 127.0.0.1:11480/api/tags | grep -q "\"$NAME\"" && break; sleep 1; done
curl -s 127.0.0.1:11480/api/tags; echo
