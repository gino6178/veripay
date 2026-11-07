#!/usr/bin/env bash
# Health watch for the model service on the L4 (cron, every 2 minutes). The loops in l4_up.sh restart a process that
# exits; this catches one that hangs: it makes a real call to each model through the public port, and after two failed
# rounds in a row it stops that process (serve.mjs, which takes its llama-servers with it, or the OCR worker) so its loop
# starts it again. It also starts the loops if they are gone. Log: ml/logs/watch.log
cd /home/Gino/done
LOG=ml/logs/watch.log STATE=ml/logs/watch.state
TOKEN=$(cat ml/secrets/token)
ml/l4_up.sh   # starts any loop that isn't running (no-op otherwise)

call() { # $1 = path, $2 = json body; ok if HTTP 200 and the body has text
  curl -sk -m 60 -o /tmp/watch.out -w '%{http_code}' -H "Authorization: Bearer $TOKEN" -H 'content-type: application/json' \
    --data-binary "$2" "https://127.0.0.1:8443$1" | grep -q '^200$' && grep -q '[A-Za-z]' /tmp/watch.out
}
ask() { printf '{"model":"%s","stream":false,"options":{"num_predict":8},"messages":[{"role":"user","content":"Say ok."}]}' "$1"; }

bad=""
for m in done-chat done-audit done-vlm; do call /api/chat "$(ask $m)" || bad="$bad $m"; done
[ -f ml/ocr/watch.jpg ] && { printf "{\"image\":\"%s\"}" "$(base64 -w0 ml/ocr/watch.jpg)" > /tmp/watch.read.json; call /read @/tmp/watch.read.json || bad="$bad done-ocr"; }

prev=$(cat $STATE 2>/dev/null)
echo "$bad" > $STATE
[ -z "$bad" ] && exit 0
echo "$(date -u +%FT%TZ) failed:$bad (previous round:${prev:- none})" >> $LOG
for m in $bad; do
  case " $prev " in *" $m "*) ;; *) continue ;; esac   # only after two rounds in a row
  if [ "$m" = done-ocr ]; then loop=l4_loop_ocr; else loop=l4_loop_serve; fi
  case " $done " in *" $loop "*) continue ;; esac; done="$done $loop"
  for p in $(pgrep -P "$(pgrep -f "^$loop" | head -1)"); do kill "$p"; echo "$(date -u +%FT%TZ) restarted $loop child $p ($m)" >> $LOG; done
done
