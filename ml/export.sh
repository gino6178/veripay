#!/usr/bin/env bash
# A trained adapter to int4 GGUF for llama.cpp (on the VM), ported from Serve's jev/export.sh:
#   ml/export.sh <run dir> <base model dir> <out name> [calibration.txt]
# merges the LoRA into the base (bf16), converts it to GGUF (llama.cpp convert_hf_to_gguf.py, f16), and quantizes it to
# Q4_K_M and Q4_0 (llama-quantize). With a calibration file (real Cover prompts, one per line, PLAN-cover.md 12.4) it
# first computes an importance matrix (llama-imatrix) and quantizes with it, leaving output.weight and token_embd.weight
# alone as llama.cpp's imatrix README advises. llama.cpp is built in ~/llama.cpp (ml/vm/setup.sh).
# Cover-1B and Cover-Audit are exported separately: one GGUF each, no merged adapters (Serve's finding).
set -eu
RUN="$1"; BASE="$2"; NAME="$3"; CAL="${4:-}"; OUT="$HOME/export/$NAME"
mkdir -p "$OUT"
python3 - "$RUN" "$BASE" "$OUT/hf" <<'PY'
import sys, torch
from transformers import AutoModelForCausalLM, AutoTokenizer
from peft import PeftModel
run, base, out = sys.argv[1:4]
m = AutoModelForCausalLM.from_pretrained(base, dtype=torch.bfloat16)
m = PeftModel.from_pretrained(m, run).merge_and_unload()
m.save_pretrained(out, safe_serialization=True)
AutoTokenizer.from_pretrained(base).save_pretrained(out)
print("merged", out)
PY
python3 ~/llama.cpp/convert_hf_to_gguf.py "$OUT/hf" --outtype f16 --outfile "$OUT/$NAME-f16.gguf"
IM=()
if [ -n "$CAL" ]; then
  ~/llama.cpp/build/bin/llama-imatrix -m "$OUT/$NAME-f16.gguf" -f "$CAL" -o "$OUT/imatrix.gguf" -ngl 99 > "$OUT/imatrix.log" 2>&1
  IM=(--imatrix "$OUT/imatrix.gguf" --exclude-weights output.weight --exclude-weights token_embd.weight)
fi
for Q in Q4_K_M Q4_0; do ~/llama.cpp/build/bin/llama-quantize "${IM[@]}" "$OUT/$NAME-f16.gguf" "$OUT/$NAME-$Q.gguf" "$Q" > "$OUT/quantize-$Q.log" 2>&1; done
ls -la "$OUT"
echo EXPORT_DONE
