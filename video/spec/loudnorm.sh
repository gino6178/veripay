#!/usr/bin/env bash
# Final audio level: two-pass EBU R128 loudnorm (linear) to -16 LUFS / -1.5 dBTP, video stream copied untouched.
# usage: bash spec/loudnorm.sh in.mp4 out.mp4
set -e
IN=$1; OUT=$2
J=$(ffmpeg -hide_banner -i "$IN" -af loudnorm=I=-16:TP=-1.5:LRA=11:print_format=json -f null - 2>&1 | sed -n '/^{/,/^}/p')
get() { echo "$J" | grep "\"$1\"" | sed 's/.*: "\(.*\)".*/\1/'; }
ffmpeg -loglevel error -y -i "$IN" -c:v copy -af "loudnorm=I=-16:TP=-1.5:LRA=11:measured_I=$(get input_i):measured_TP=$(get input_tp):measured_LRA=$(get input_lra):measured_thresh=$(get input_thresh):offset=$(get target_offset):linear=true" -ar 48000 -c:a aac -b:a 256k "$OUT"
echo "$OUT: input $(get input_i) LUFS -> -16"
