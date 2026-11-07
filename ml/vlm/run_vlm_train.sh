#!/usr/bin/env bash
# Done-VLM v1 on cover-a100, resumable stage by stage (after_boot.sh reruns it until VLM_TRAIN_DONE):
#   1. Glimmer describes every training photo (vlm/teach.py; the GPU; photos fetched after the split are training only)
#   2. LoRA on SmolVLM2-500M's language model (vlm/train_vlm.py; the GPU; CPU kept to cores 5,11 so serving is untouched)
#   3. merge -> GGUF f16 -> Q8_0, with the base projector, in ~/models/vlm/done-vlm-v1
#   4. base vs v1 on the 98 held-out photos (vlm/describe_eval.py --test_files; cores 5,11, 2 threads: accuracy only)
#   5. latency of both on 4 CPU threads (cores 2-5), 30 held-out photos
set -u
cd ~/done
export OMP_NUM_THREADS=2 MKL_NUM_THREADS=2 TOKENIZERS_PARALLELISM=false PYTORCH_CUDA_ALLOC_CONF=expandable_segments:True
P=~/venv/bin/python; V=ml/vlm; R=$V/runs/v1; D=~/models/vlm/done-vlm-v1; B=~/models/vlm/smolvlm2-500m; L=ml/logs/vlm_train.log
pgrep -f 'vlm/fetch.py' > /dev/null && { echo "waiting for fetch" >> $L; while pgrep -f 'vlm/fetch.py' > /dev/null; do sleep 30; done; }
grep -q TEACH_DONE ml/logs/vlm_teach.log 2>/dev/null && [ "$(grep -c TEACH_DONE ml/logs/vlm_teach.log)" -ge 2 ] || { pgrep -f 'teach.py' > /dev/null && while pgrep -f 'teach.py' > /dev/null; do sleep 30; done; (cd $V && taskset -c 5,11 $P teach.py --photos photos --out teach --samples 3 --par 24 >> ../../ml/logs/vlm_teach.log 2>&1); echo TEACH_DONE >> ml/logs/vlm_teach.log; }
[ -f $R/merged/model.safetensors ] || taskset -c 5,11 $P $V/train_vlm.py --base ~/models/vlm/smolvlm2-500m-hf --teach $V/teach/raw.jsonl --photos $V/photos --out $R --epochs 2 >> $L 2>&1
[ -f $R/merged/model.safetensors ] || { echo TRAIN_FAILED >> $L; exit 1; }
mkdir -p $D
[ -f $D/done-vlm-v1-Q8_0.gguf ] || { taskset -c 5,11 $P ~/llama.cpp/convert_hf_to_gguf.py $R/merged --outtype f16 --outfile $R/done-vlm-v1-f16.gguf >> $L 2>&1 && taskset -c 5,11 ~/llama.cpp/build/bin/llama-quantize $R/done-vlm-v1-f16.gguf $D/done-vlm-v1-Q8_0.gguf Q8_0 >> $L 2>&1; }
[ -f $D/mmproj-SmolVLM2-500M-Video-Instruct-Q8_0.gguf ] || cp $B/mmproj-SmolVLM2-500M-Video-Instruct-Q8_0.gguf $D/
(cd $V && $P describe_eval.py --photos photos --models smolvlm2-500m,done-vlm-v1 --test_files photos/test_files.json --cpus 5,11 --threads 2 --image_max_tokens 64 --out results_v1_test >> ../../$L 2>&1)
(cd $V && $P describe_eval.py --photos photos --models smolvlm2-500m,done-vlm-v1 --test_files photos/test_files_30.json --cpus 2,3,4,5 --threads 4 --image_max_tokens 64 --out results_v1_lat4 >> ../../$L 2>&1)
echo VLM_TRAIN_DONE >> $L
