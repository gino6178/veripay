#!/usr/bin/env bash
# Cover-OCR's US data: 5,000 training documents (five shards in parallel, at the lowest priority so Ollama keeps its
# CPU, then merged), 400 test documents, and 200 in fonts never trained on (IBM Plex Mono, Lato, TeX Gyre Cursor).
set -eu
cd "$(dirname "$0")/../.."
O=ml/ocr/out_us; P=~/venv/bin/python; export OMP_NUM_THREADS=1
for k in 0 1 2 3 4; do nice -n 19 $P ml/ocr/gen.py --out $O --split train$k --docs 1000 --seed $((100 + k)) --images 60 & done
nice -n 19 $P ml/ocr/gen.py --out $O --split test --docs 400 --seed 2 --images 400 &
nice -n 19 $P ml/ocr/gen.py --out $O --split test_font --docs 200 --seed 3 --fonts held_out --images 200 &
wait
cat $O/docs_train[0-4].jsonl > $O/docs_train.jsonl; cat $O/lines_train[0-4].tsv > $O/lines_train.tsv
wc -l $O/docs_*.jsonl $O/lines_*.tsv
echo OCR_GEN_DONE
