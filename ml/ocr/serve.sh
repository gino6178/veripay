#!/usr/bin/env bash
# Cover-OCR's worker on the CPU, on 127.0.0.1 only (api/src/reader.js mode "cover-ocr").
#   bash ml/ocr/serve.sh                      # runs/r1 on port 11449, one torch thread
#   OCR_RUN=ml/ocr/runs/en1 bash ml/ocr/serve.sh   # another model: a run directory with model.pt and meta.json
# Then start Cover's server with READER_MODE=cover-ocr (and READER_URL=http://127.0.0.1:11449 if the port differs).
# Needs python with torch (CPU is enough), opencv-python and numpy.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PY="${PYTHON:-python}"
command -v "$PY" >/dev/null 2>&1 || PY=python3
RUN="${OCR_RUN:-$HERE/runs/r1}"
PORT="${OCR_PORT:-11449}"
export OCR_THREADS="${OCR_THREADS:-1}"
[ -f "$RUN/model.pt" ] && [ -f "$RUN/meta.json" ] || { echo "no model in $RUN (model.pt and meta.json; copy them from the VM's ~/cover/ml/ocr/runs/)" >&2; exit 1; }
exec "$PY" "$HERE/worker.py" serve --run "$RUN" --port "$PORT" --threads "$OCR_THREADS"
