#!/usr/bin/env bash
# The whole probe on the VM, one set after another (so each set's timing is its own), then the scores.
set -u
cd "$(dirname "$0")/../.."
for s in qa extract vision vision_app solo; do python3 ml/probe/run.py $s 2 50; done
python3 ml/probe/score.py
echo PROBE_ALL_DONE
