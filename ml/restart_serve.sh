#!/usr/bin/env bash
# Restart Done & Paid's model endpoint on the VM (ml/serve.mjs and its llama-servers), leaving every other server alone.
cd "$(dirname "$0")/.."
pkill -f '^node ml/serve.mjs'; pkill -f '^/home/Gino/llama.cpp/build/bin/llama-server -m /home/Gino/export/done-'; sleep 2
setsid nohup node ml/serve.mjs > ml/logs/serve.log 2>&1 < /dev/null &
for i in $(seq 1 30); do curl -s -m 2 127.0.0.1:11480/api/tags > /dev/null && break; sleep 1; done
curl -s 127.0.0.1:11480/api/tags; echo
