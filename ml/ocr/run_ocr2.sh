#!/usr/bin/env bash
# Done-OCR round 2 on cover-a100 (cores 6-11, low priority): the generator with rating/serial plates, City of Austin
# permits and Texas lien waivers added; the recogniser fine-tuned from done1; scored on the new test sets, with the
# line positions and end to end with the existing detector (det1).
set -u
cd "$(dirname "$0")/../.."
export OMP_NUM_THREADS=1 PYTORCH_CUDA_ALLOC_CONF=expandable_segments:True
P=~/venv/bin/python; O=ml/ocr/out_done2; R=ml/ocr/runs
for k in 0 1 2 3 4; do [ -f $O/docs_train$k.jsonl ] || nice -n 19 $P ml/ocr/gen.py --out $O --split train$k --docs 1000 --seed $((400 + k)) --images 20 & done
[ -f $O/docs_test.jsonl ] || nice -n 19 $P ml/ocr/gen.py --out $O --split test --docs 400 --seed 22 --images 400 &
[ -f $O/docs_test_font.jsonl ] || nice -n 19 $P ml/ocr/gen.py --out $O --split test_font --docs 200 --seed 23 --fonts held_out --images 200 &
wait
cat $O/docs_train[0-4].jsonl > $O/docs_train.jsonl; cat $O/lines_train[0-4].tsv > $O/lines_train.tsv
export OMP_NUM_THREADS=2
[ -f $R/done2/model.pt ] || nice -n 10 $P ml/ocr/rec.py train --data $O --out $R/done2 --epochs 10 --lr 5e-4 --init $R/done1 >> ml/logs/ocr2.log 2>&1
for s in test test_font; do nice -n 10 $P ml/ocr/rec.py eval --data $O --run $R/done2 --split $s >> ml/logs/ocr2.log 2>&1; nice -n 10 $P ml/ocr/det.py eval --data $O --det $R/det1 --rec $R/done2 --split $s >> ml/logs/ocr2.log 2>&1; done
echo OCR2_DONE >> ml/logs/ocr2.log
