#!/usr/bin/env bash
# Done-OCR on cover-a100, after the documents are generated (gen_all.sh): photos for the detector, the recogniser
# fine-tuned from Cover's US run (us1) on Done's receipts and invoices, then the line detector, each scored.
set -u
cd "$(dirname "$0")/../.."
export OMP_NUM_THREADS=2 PYTORCH_CUDA_ALLOC_CONF=expandable_segments:True
P=~/venv/bin/python; O=ml/ocr/out_done; R=ml/ocr/runs
while ! grep -q OCR_GEN_DONE ml/logs/ocr_gen.log 2>/dev/null; do sleep 60; done
for k in 0 1; do [ -f $O/docs_det$k.jsonl ] || nice -n 19 $P ml/ocr/gen.py --out $O --split det$k --docs 1000 --seed $((300 + k)) --images 1000 >> ml/logs/ocr.log 2>&1 & done; wait
[ -f $R/done1/model.pt ] || nice -n 10 $P ml/ocr/rec.py train --data $O --out $R/done1 --epochs 12 --lr 5e-4 --init $R/us1 >> ml/logs/ocr.log 2>&1
for s in test test_font; do nice -n 10 $P ml/ocr/rec.py eval --data $O --run $R/done1 --split $s >> ml/logs/ocr.log 2>&1; done
[ -f $R/det1/det.pt ] || nice -n 10 $P ml/ocr/det.py train --data $O --splits det0,det1 --out $R/det1 --epochs 25 >> ml/logs/ocr.log 2>&1
for s in test test_font; do nice -n 10 $P ml/ocr/det.py eval --data $O --det $R/det1 --rec $R/done1 --split $s >> ml/logs/ocr.log 2>&1; done
echo OCR_DONE >> ml/logs/ocr.log
