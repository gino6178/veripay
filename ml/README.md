# Done & Paid ml: the models

Done & Paid's own models. They are distilled only from Muse Glimmer (Meta, open weights, Apache 2.0), served by
Ollama on the GCP VM `cover-a100`. Every label is code's wherever code can know the answer. They run on the CPU
from GGUF files, behind an Ollama-style endpoint.

| Model | What it does | Base | Labels |
|---|---|---|---|
| **Done-Audit** | A work order and the pro's evidence (photo descriptions with EXIF facts and image-hash matches, receipts read by Done-OCR, notes) → for each done-condition `pass`, `needs_fix` or `fail`, with a reason; a confidence from the verdict token's probability | Qwen3-0.6B or Llama 3.2 1B (the evaluation picks), LoRA | Code draws each check's evidence and what is wrong with it, so the verdict and reason are code's. Glimmer only puts photos and notes into words. Instructions hidden in the evidence are in training; the attack set uses unseen templates. |
| **Done-Chat** | `writeScope` (one sentence → the work order JSON) and `negotiate` (one agent-to-agent move) | the same two | Scope: Glimmer writes the person's sentence and the work order's text; code's trade, price ceiling and window. Negotiate: code's policy decides each move and price, Glimmer writes the messages; orders hidden in the other side's messages are in training, unseen ones in the attack set. |
| **Done-OCR** | A receipt or invoice photo → lines → the reader's fields | SVTR-tiny-style recogniser (fine-tuned from Cover-OCR US) and a small U-Net line detector | The generator's exact text and fields |

Code decides money. The models give fields and verdicts with reasons and confidence, and the app labels every
result "model" or "rules".

## Files

- `catalog.mjs`: the jobs. These are US home-service tasks, each with work items, done-conditions (id, what, evidence, rule) and prices.
- `prompts.mjs`: the prompts the models were trained on and the app must send (`scopeMessages`, `negotiateMessages` with `negotiationHints`, `checkMessages`).
- `client.mjs`: what the app calls (`writeScope`, `negotiate`, `checkEvidence`) in the agreed shapes, through `DONE_MODEL_URL`, `DONE_MODEL`, `DONE_AUDIT_URL` and `DONE_AUDIT_MODEL`.
- `serve.mjs`: the Ollama-style `/api/chat` endpoint in front of llama-server on this machine's CPU (`serve.json`).
- `audit_gen.mjs`, `chat_gen.mjs`: the data, before and after the teacher (`gen`, then `assemble`).
- `teacher.mjs`: Glimmer answering any `jobs.jsonl`. It is resumable, makes 96 calls at once, and checks every reply in code. From Cover and Serve.
- `train_sft.py`: LoRA SFT, with the loss on the answer only. From Cover.
- `eval_done.py`: student, untuned base and Glimmer, scored by code, with Wilson intervals, McNemar and calibration.
- `run_done.sh`: the round on the VM, in priority order: Done-Audit, then Done-Chat.
- `export.sh`: merge, convert to GGUF, quantize to Q4_K_M.
- `ocr/`:
  - `gen.py` makes the documents: parts receipts and pros' invoices first, then the US receipts, invoices and reports.
  - `rec.py` is the recogniser, `det.py` the line detector, and `parse.py` turns lines into fields.
  - `gen_all.sh` and `run_ocr.sh` run it on the VM.
- `RESULTS.md`: the true numbers.

Reused from Cover (`D:\paypal\cover\ml`, left as it is): the teacher, the SFT trainer, the export, and the OCR
generator and recogniser.
