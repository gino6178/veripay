#!/usr/bin/env bash
# Final delivery file: video re-encoded as standard-range yuv420p H.264 (Remotion writes full-range yuvj420p), audio by
# two-pass EBU R128 loudnorm (linear) to -16 LUFS / -1.5 dBTP.   usage: bash spec/finish.sh in.mp4 out.mp4
set -e
IN=$1; OUT=$2
J=$(ffmpeg -hide_banner -i "$IN" -af loudnorm=I=-16:TP=-1.5:LRA=11:print_format=json -f null - 2>&1 | sed -n '/^{/,/^}/p')
get() { echo "$J" | grep "\"$1\"" | sed 's/.*: "\(.*\)".*/\1/'; }
ffmpeg -loglevel error -y -i "$IN" -vf "scale=in_range=pc:out_range=tv,format=yuv420p" -c:v libx264 -preset slow -crf 14 -profile:v high -color_range tv -colorspace bt709 -color_primaries bt709 -color_trc bt709 -movflags +faststart \
  -af "loudnorm=I=-16:TP=-1.5:LRA=11:measured_I=$(get input_i):measured_TP=$(get input_tp):measured_LRA=$(get input_lra):measured_thresh=$(get input_thresh):offset=$(get target_offset):linear=true" -ar 48000 -c:a aac -b:a 256k "$OUT"
echo "$OUT: input $(get input_i) LUFS -> -16"
