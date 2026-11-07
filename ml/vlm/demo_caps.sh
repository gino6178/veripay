#!/usr/bin/env bash
# Done-VLM on the real demo photos (api/demo-assets/real, as the app sends them: full size): base vs v1 at image-token caps
# 64 / 128 / 256 / none, 4 threads on cores 2-5 (nice 10, so the live endpoint keeps priority).
cd ~/done/ml/vlm
python3 -c "import json; d=json.load(open('demo_real_attribution.json')); json.dump(sorted({p['original_file'] for p in d['photos']}), open('photos/demo_files.json','w'))"
for cap in 64 128 256 0; do
  nice -n 10 ~/venv/bin/python describe_eval.py --photos photos --models smolvlm2-500m,done-vlm-v1 --test_files photos/demo_files.json --side 1024 --cpus 2,3,4,5 --threads 4 --image_max_tokens $cap --out results_demo_cap$cap 2>&1 | grep -v DESCRIBE_DONE | sed "s/^/cap$cap /"
done
echo CAPS_DONE
