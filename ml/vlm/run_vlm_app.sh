#!/usr/bin/env bash
# Done-VLM on real photos with the app's prompt (60 photos: about 180 questions per model), once no teacher run is
# sampling on the same cores, so the latency is a 6-thread CPU's own; Glimmer (GPU) last, as the reference.
set -u
cd "$(dirname "$0")/../.."
while pgrep -f '^node ml/teacher.mjs' > /dev/null; do sleep 30; done
taskset -c 6-11 ~/venv/bin/python ml/vlm/eval.py --photos ml/vlm/photos --models smolvlm2-500m,internvl3-1b,qwen2-vl-2b,internvl3-2b,smolvlm2-2.2b,moondream2,glimmer --n 60 --out ml/vlm/results_app >> ml/logs/vlm_eval.log 2>&1
~/venv/bin/python ml/vlm/score.py --dir ml/vlm/results_app >> ml/logs/vlm_eval.log 2>&1
echo VLM_APP_DONE >> ml/logs/vlm_eval.log
