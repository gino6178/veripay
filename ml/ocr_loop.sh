#!/usr/bin/env bash
# Keep Done-OCR's worker (ml/ocr/server.py, CPU, physical core 5) up: restarted 2 s after it exits.
cd "$(dirname "$0")/.."
while true; do CUDA_VISIBLE_DEVICES="" OMP_NUM_THREADS=2 taskset -c 5,11 ~/venv/bin/python ml/ocr/server.py --det ml/ocr/runs/det1 --rec ml/ocr/runs/done2 --port 11490 --threads 2 >> ml/logs/ocr_server.log 2>&1; sleep 2; done
