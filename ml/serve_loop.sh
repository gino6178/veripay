#!/usr/bin/env bash
# Keep Done & Paid's model endpoint up on the VM: ml/serve.mjs (which restarts its own llama-servers) restarted 2 s
# after it exits. Start it once: setsid nohup bash ml/serve_loop.sh > /dev/null 2>&1 < /dev/null &
cd "$(dirname "$0")/.."
while true; do node ml/serve.mjs >> ml/logs/serve.log 2>&1; echo "$(date -u +%FT%TZ) serve.mjs exited ($?), restarting" >> ml/logs/serve.log; sleep 2; done
