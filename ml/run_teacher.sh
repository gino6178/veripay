#!/usr/bin/env bash
# The teacher runs for Cover-Audit, in order (on the A100 VM, against its own Ollama with Muse Glimmer), ported from
# Serve's jev/run_teacher.sh:
#   test   500 audit cases (seed 7), 3 answers each (Glimmer's own agreement is the ceiling for the student)
#   val    300 cases (seed 19), 2 answers each (for the confidence threshold)
#   train  4000 cases (seed 11), 1 answer each
# A step whose answers are all there is quick (teacher.mjs resumes, and asks again for any answer that never came).
set -u
cd "$(dirname "$0")/.."
PAR="${PAR:-96}"
mkdir -p ml/data
node ml/teacher.mjs ml/data/test 7 500 3 "$PAR" > ml/data/test.log 2>&1
node ml/teacher.mjs ml/data/val 19 300 2 "$PAR" > ml/data/val.log 2>&1
node ml/teacher.mjs ml/data/train 11 4000 1 "$PAR" > ml/data/train.log 2>&1
echo ALL_TEACHER_DONE
