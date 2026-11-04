#!/usr/bin/env bash
# Cover-Audit's worker on the server's CPU (no GPU), ported from Serve's jev/serve.sh: port 11448 (Serve's is 11447),
# models in ~/cover-ml/models. The CPU is shared, so the worker keeps to 8 threads at the lowest priority (nice 19).
# Safe to run again: a worker already listening is left alone.
#   ~/cover-ml/code/serve.sh [gguf name] [threads, default 8]
set -u
J=~/cover-ml
G="${1:-cover-audit-1b-r1-Q4_K_M.gguf}"; T="${2:-8}"
ss -ltn | grep -q ":11448 " && { echo "audit worker already on :11448"; exit 0; }
cd "$J" && setsid -f nice -n 19 env CUDA_VISIBLE_DEVICES="" "$J/env/bin/python" code/worker.py --gguf "models/$G" --tokenizer models/tokenizer --products code/products --port 11448 --threads "$T" >> "$J/worker.log" 2>&1 < /dev/null
for i in $(seq 1 60); do curl -s -m 2 127.0.0.1:11448/health && { echo; exit 0; }; sleep 1; done
echo "the worker did not come up: $J/worker.log"; exit 1
