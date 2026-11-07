#!/usr/bin/env bash
# Done-Chat's teacher run, after Done-Audit's: the requests (scope step 1) and the negotiation messages, then the
# work orders written from those requests (scope step 2). Resumable.
set -u
cd "$(dirname "$0")/.."
while ! grep -q AUDIT_GEN_DONE ml/logs/teacher.log 2>/dev/null; do sleep 60; done
for d in ml/data/chat/gen/scope1/train ml/data/chat/gen/scope1/test ml/data/chat/gen/negotiate/test ml/data/chat/gen/negotiate/attack ml/data/chat/gen/negotiate/train; do node ml/teacher.mjs "$d" 96 >> ml/logs/teacher.log 2>&1; done
node ml/chat_gen.mjs gen2 >> ml/logs/teacher.log 2>&1
for d in ml/data/chat/gen/scope2/test ml/data/chat/gen/scope2/train; do node ml/teacher.mjs "$d" 96 >> ml/logs/teacher.log 2>&1; done
echo CHAT_GEN_DONE >> ml/logs/teacher.log
