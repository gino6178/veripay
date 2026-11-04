#!/usr/bin/env bash
# One-time setup of the training VM (cover-a100: GCP a2-highgpu-1g, one A100 40 GB, spot, Deep Learning VM image
# common-cu129-ubuntu-2204-nvidia-580), the way Serve's serve-jev-a100 was set up:
#   - Ollama 0.40.11 (Serve's version) as a systemd service on 127.0.0.1:11434 only (no firewall port is opened),
#     96 requests at once, with Muse Glimmer (muse-glimmer:30b-q4_K_M, Serve's tag);
#   - Node 22 for ml/teacher.mjs;
#   - ~/venv: torch, transformers, peft, accelerate, datasets, llama-cpp-python (CPU, as the worker runs on the server);
#   - ~/llama.cpp built (convert_hf_to_gguf.py and llama-quantize / llama-imatrix for ml/export.sh).
# Safe to run again: each step that is already done is skipped.
#   nohup bash ml/vm/setup.sh > ~/setup.log 2>&1 &
set -eux
export DEBIAN_FRONTEND=noninteractive
OLLAMA_VERSION=0.40.11
MODEL=muse-glimmer:30b-q4_K_M

sudo apt-get update -y
sudo apt-get install -y build-essential cmake git curl python3-venv python3-dev pkg-config libcurl4-openssl-dev fonts-noto-cjk

# --- Ollama
if ! ollama --version 2>/dev/null | grep -q "$OLLAMA_VERSION"; then
  curl -fsSL https://ollama.com/install.sh -o /tmp/ollama-install.sh
  OLLAMA_VERSION=$OLLAMA_VERSION sh /tmp/ollama-install.sh
fi
# 96 at once as on serve-jev-a100. OLLAMA_CONTEXT_LENGTH is per request; the runner holds NUM_PARALLEL of them, so the
# KV cache is kept at q8_0 with flash attention (ml/vm/ollama.env says how it was sized).
sudo mkdir -p /etc/systemd/system/ollama.service.d
sudo cp "$(dirname "$0")/ollama.env" /etc/systemd/system/ollama.service.d/override.conf
sudo systemctl daemon-reload
sudo systemctl enable ollama
sudo systemctl restart ollama
for i in $(seq 1 60); do curl -s -m 2 127.0.0.1:11434/api/version && break; sleep 1; done
ollama pull "$MODEL"
ollama list

# --- Node 22 (for ml/teacher.mjs)
if ! node --version 2>/dev/null | grep -q '^v22'; then
  curl -fsSL https://nodejs.org/dist/v22.11.0/node-v22.11.0-linux-x64.tar.xz -o /tmp/node.tar.xz
  sudo tar -xJf /tmp/node.tar.xz -C /usr/local --strip-components=1
fi
node --version

# --- Python
[ -d ~/venv ] || python3 -m venv ~/venv
. ~/venv/bin/activate
pip install -U pip wheel
pip install torch --index-url https://download.pytorch.org/whl/cu128
pip install transformers peft accelerate datasets safetensors sentencepiece tokenizers numpy pillow gguf protobuf
# CPU build, like the worker on the server (CUDA_VISIBLE_DEVICES="" there)
pip install llama-cpp-python
python -c "import torch, transformers, peft, accelerate, datasets, llama_cpp; print('torch', torch.__version__, torch.cuda.is_available(), torch.cuda.get_device_name(0)); print('transformers', transformers.__version__, 'peft', peft.__version__, 'accelerate', accelerate.__version__, 'datasets', datasets.__version__, 'llama_cpp', llama_cpp.__version__)"

# --- llama.cpp (convert and quantize; CPU tools are enough)
if [ ! -x ~/llama.cpp/build/bin/llama-quantize ]; then
  [ -d ~/llama.cpp ] || git clone --depth 1 https://github.com/ggml-org/llama.cpp ~/llama.cpp
  cmake -S ~/llama.cpp -B ~/llama.cpp/build -DCMAKE_BUILD_TYPE=Release -DLLAMA_CURL=OFF
  cmake --build ~/llama.cpp/build -j "$(nproc)" --target llama-quantize llama-imatrix llama-cli
fi
# (convert_hf_to_gguf.py needs only gguf, transformers, sentencepiece, protobuf, installed above; its own requirements file would pull a CPU torch)
git -C ~/llama.cpp rev-parse --short HEAD
echo SETUP_DONE
