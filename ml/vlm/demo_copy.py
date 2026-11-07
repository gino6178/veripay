"""Copy the real demo photos that passed done-vlm + done-audit (vlm/demo_pick.json) into api/demo-assets/real/ with an
attribution file. python ml/vlm/demo_copy.py <demo_pick.json> <photos dir> <out dir> [selection.json]   (photos dir holds the picked files)
selection.json {slot: [1-based ranks among the slot's picks]}: the photos a person kept after looking at them (a model pass
alone let through diagrams, a dirty kitchen and a hot-water urn on a station platform); slots left out get no photo."""
import json, os, shutil, sys
pick, photos, out = sys.argv[1:4]; sel = json.load(open(sys.argv[4])) if len(sys.argv) > 4 else None
d = json.load(open(pick, encoding="utf8")); os.makedirs(out, exist_ok=True)
rows, summary = [], {}
for slot, s in d.items():
    summary[slot] = f"{s['passed']}/{s['candidates']}"
    for i, p in enumerate(s["picked"]):
        if sel is not None and i + 1 not in sel.get(slot, []): continue
        name = f"{slot}-{i + 1}.jpg"
        shutil.copyfile(os.path.join(photos, p["file"]), os.path.join(out, name))
        rows.append({"file": name, "slot": slot, "scene": s["scene"], "role": s["role"], "condition": s["condition"],
                     "author": p["author"], "license": p["license"], "license_url": p.get("license_url"), "source": p["source"], "title": p["title"],
                     "original_file": p["file"], "done_vlm_description": p["sees"],
                     "done_audit_verdict": p["verdict"], "done_audit_confidence": p["confidence"]})
missing = sorted({k for k in d} - {r["slot"] for r in rows})
note = {"rating_plate": "No real photo of a water-heater rating plate: the Commons 'water heater' photos show whole tanks, and no description named a plate or label. Keep the synthetic api/demo-assets/wh-label.jpg for that check.",
        "under_sink_dry": "The model-passed candidates were diagrams and drawings of a P-trap; keep the synthetic sink-dry.jpg.",
        "hole_before": "No candidate showed a hole in drywall (Commons 'Holes in walls' gave graffiti and tiled tunnels).",
        "kitchen_clean": "The two model-passed candidates were a window niche and a dirty kitchen; keep the synthetic clean-kitchen.jpg.",
        "oven_clean": "The only pass showed an oven from outside, not its inside."}
json.dump({"made_by": "ml/vlm/demo_pick.py (done-vlm describes the photo, done-audit judges the description); before photos pass when done-vlm names the thing",
           "photos": rows, "pass_counts": summary, "slots_without_a_real_photo": missing,
           "notes": {k: v for k, v in note.items() if k in missing}}, open(os.path.join(out, "attribution.json"), "w", encoding="utf8"), indent=1, ensure_ascii=False)
print(len(rows), "photos;", "missing:", missing)
