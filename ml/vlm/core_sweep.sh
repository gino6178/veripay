#!/usr/bin/env bash
# Done-VLM CPU sweep on cover-a100: a throwaway llama-server on port 18100 per setting, 6 photos each, wall time per photo.
cd ~/done
M=$HOME/models/vlm/smolvlm2-500m; L=~/llama.cpp/build/bin/llama-server
G=$M/SmolVLM2-500M-Video-Instruct-Q8_0.gguf
P=ml/vlm/photos; F=$(ls $P/*.jpg | awk 'NR%60==1' | head -6)
run() { # name cpus threads extra...
  local name=$1 cpus=$2 t=$3; shift 3
  taskset -c $cpus $L -m $G --mmproj $M/mmproj-SmolVLM2-500M-Video-Instruct-Q8_0.gguf --host 127.0.0.1 --port 18100 -t $t -tb $t -c 8192 -np 1 --no-webui "$@" > /tmp/sweep_srv.log 2>&1 &
  local pid=$!
  for i in $(seq 1 60); do curl -s -m 1 127.0.0.1:18100/health | grep -q ok && break; sleep 1; done
  echo "== $name cpus=$cpus t=$t $*"; node ml/vlm/probe_tokens.mjs 18100 $F
  kill $pid; wait $pid 2>/dev/null
}
run three_max128 2,3,4,8,9,10 6 --image-max-tokens 128
run three_max64 2,3,4,8,9,10 6 --image-max-tokens 64
run four_max128 1,2,3,4,7,8,9,10 8 --image-max-tokens 128
echo SWEEP_DONE
