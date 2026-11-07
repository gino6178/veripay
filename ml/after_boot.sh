#!/usr/bin/env bash
# After cover-a100 starts again (a spot VM can be stopped at any time): bring Done & Paid's line back, in priority
# order. Every step resumes from what is on disk.
#   1. the model endpoint (ml/serve_loop.sh: ml/serve.mjs and its llama-servers, each on its own physical cores) and
#      Done-OCR's worker (ml/ocr_loop.sh)
#   2. everything else pinned to physical core 5 (vCPUs 5 and 11): Ollama once it is up, and the runs below
#   3. the training round (ml/run_done.sh: finished models are skipped), Done-OCR round 2's remainder, and the VLM
#      evaluation (which waits until Glimmer's labelling is over, so its CPU timings are clean)
#   bash ml/after_boot.sh
cd "$(dirname "$0")/.."
pgrep -f '^bash ml/serve_loop.sh' > /dev/null || setsid nohup bash ml/serve_loop.sh > /dev/null 2>&1 < /dev/null &
for i in $(seq 1 60); do curl -s -m 2 127.0.0.1:11434/api/version > /dev/null && break; sleep 2; done
# physical core k is vCPUs k and k+6: the served models have cores 0-4 (ml/serve.json); everything else gets core 5
for p in $(pgrep -f 'ollama'); do sudo taskset -apc 5,11 "$p" > /dev/null 2>&1; done
pgrep -f '^bash ml/ocr_loop.sh' > /dev/null || setsid nohup bash ml/ocr_loop.sh > /dev/null 2>&1 < /dev/null &
# the training round on one core (its work is on the GPU), so the VLM evaluation keeps cores 6-11 to itself
pgrep -f '^bash ml/run_done.sh' > /dev/null || setsid nohup taskset -c 5,11 bash ml/run_done.sh > /dev/null 2>&1 < /dev/null &
grep -q OCR2_DONE ml/logs/ocr2.log 2>/dev/null || pgrep -f 'run_ocr2.sh' > /dev/null || setsid nohup taskset -c 5,11 bash ml/ocr/run_ocr2.sh > /dev/null 2>&1 < /dev/null &
# Done-VLM, describe-only (vlm/describe_eval.py; models already scored are skipped)
grep -q DESCRIBE_DONE ml/logs/vlm_describe.log 2>/dev/null || pgrep -f 'describe_eval.py' > /dev/null || (cd ml/vlm && setsid nohup taskset -c 5,11 ~/venv/bin/python describe_eval.py --photos photos --models smolvlm2-500m,internvl3-1b,qwen2-vl-2b,internvl3-2b,smolvlm2-2.2b,moondream2 --n 60 --side 448 --out results_describe >> ../logs/vlm_describe.log 2>&1 < /dev/null &)
for i in $(seq 1 60); do curl -s -m 2 127.0.0.1:11480/api/tags > /dev/null && break; sleep 2; done
curl -s 127.0.0.1:11480/api/tags; echo
# Done-Chat v2 (the scope prompt with a calendar), until scored
grep -q CHAT_V2_SCORED ml/logs/chat_v2.log 2>/dev/null || pgrep -f 'run_chat_v2.sh' > /dev/null || setsid nohup taskset -c 5,11 bash ml/run_chat_v2.sh > /dev/null 2>&1 < /dev/null &
# real demo photos for the app (vlm/demo_pick.py, descriptions cached), until written; it waits behind the endpoint's other callers
grep -q PICK_DONE ml/logs/demo_pick.log 2>/dev/null || pgrep -f 'demo_pick.py' > /dev/null || (cd ml/vlm && setsid nohup taskset -c 5,11 ~/venv/bin/python demo_pick.py --photos photos --list photos_before_more.jsonl --url http://127.0.0.1:11480 --out demo_pick.json >> ../logs/demo_pick.log 2>&1 < /dev/null &)
# more openly licensed photos for Done-VLM's training (vlm/fetch.py skips files it has)
grep -q FETCH_DONE ml/logs/vlm_fetch_more.log 2>/dev/null || pgrep -f 'vlm/fetch.py' > /dev/null || (setsid nohup nice -n 15 taskset -c 5,11 python3 ml/vlm/fetch.py --out ml/vlm/photos --per 45 >> ml/logs/vlm_fetch_more.log 2>&1 < /dev/null &)
# Done-VLM v1 fine-tune (vlm/run_vlm_train.sh: Glimmer targets, LoRA, GGUF, held-out eval), until done
grep -q VLM_TRAIN_DONE ml/logs/vlm_train.log 2>/dev/null || pgrep -f 'run_vlm_train.sh' > /dev/null || setsid nohup bash ml/vlm/run_vlm_train.sh > /dev/null 2>&1 < /dev/null &
