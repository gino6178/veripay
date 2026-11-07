#!/usr/bin/env bash
# Done-Audit's teacher run: Muse Glimmer puts the evidence into words (train, test, attack), 96 at once, resumable.
set -u
cd "$(dirname "$0")/.."
for d in ml/data/audit/gen/test ml/data/audit/gen/attack ml/data/audit/gen/train; do node ml/teacher.mjs "$d" 96 >> ml/logs/teacher.log 2>&1; done
echo AUDIT_GEN_DONE >> ml/logs/teacher.log
