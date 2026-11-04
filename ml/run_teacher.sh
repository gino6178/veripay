#!/usr/bin/env bash
# The teacher runs, in order (on the A100 VM, against its own Ollama with Muse Glimmer, 96 requests at once), ported
# from Serve's jev/run_teacher.sh. Each step resumes where it stopped (ml/teacher.mjs keeps done answers).
#   1. Cover-1B generation: qa, story, dialog (train and test), from ml/build_1b.mjs gen
#   2. Cover-Audit: test (3 answers each), val (2), train (1), from ml/build_audit.mjs
#   3. Cover-1B teacher column (after ml/build_1b.mjs assemble): Glimmer answers the test prompts
set -u
cd "$(dirname "$0")/.."
PAR="${PAR:-96}"
mkdir -p ml/logs
for d in ml/data/1b/gen/qa/train ml/data/1b/gen/qa/test ml/data/1b/gen/story/train ml/data/1b/gen/story/test ml/data/1b/gen/dialog/train ml/data/1b/gen/dialog/test \
         ml/data/audit/test ml/data/audit/val ml/data/audit/train; do
  node ml/teacher.mjs "$d" "$PAR" >> ml/logs/teacher.log 2>&1
done
[ -f ml/data/1b/teacher_eval/jobs.jsonl ] && node ml/teacher.mjs ml/data/1b/teacher_eval "$PAR" >> ml/logs/teacher.log 2>&1
echo ALL_TEACHER_DONE >> ml/logs/teacher.log
