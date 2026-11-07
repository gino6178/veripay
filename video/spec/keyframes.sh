#!/usr/bin/env bash
# Key frames for QA and the independent review: per shot, entry (+12 f), middle, settled (end - 15 f).
# usage: bash spec/keyframes.sh out/done-and-paid.mp4 out/qa/final
set -e
IN=$1; OUT=$2; mkdir -p "$OUT"
SHOTS="cover:0:106 split:106:240 problem:346:330 post:676:450 offers:1126:405 hold:1531:315 pin:1846:390 phone:2236:600 checks:2836:1015 release:3851:465 sandbox:4316:300 montage:4616:405 end:5021:255 credits:5276:90"
SEL=""
for s in $SHOTS; do
  IFS=: read name from dur <<< "$s"
  for f in $((from + 12)) $((from + dur / 2)) $((from + dur - 15)); do SEL="$SEL+eq(n\,$f)"; NAMES="$NAMES ${name}-f$f"; done
done
SEL=${SEL#+}
ffmpeg -loglevel error -y -i "$IN" -vf "select='$SEL'" -vsync 0 "$OUT/k%02d.png"
i=1; for n in $NAMES; do mv "$OUT/k$(printf %02d $i).png" "$OUT/$n.png"; i=$((i + 1)); done
ls "$OUT" | wc -l
