// The platform's JSON stores on disk. A write goes to a temporary file that is renamed over the old one, so a crash
// mid-write leaves the old file or the new one, never half of one. A file that can't be read is moved aside as
// <file>.bad-<time> and the store starts from its default.
import fs from "node:fs";
import path from "node:path";

export function readJSON(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); }
  catch (e) {
    if (e.code !== "ENOENT") try { fs.renameSync(file, `${file}.bad-${Date.now()}`); } catch {}
    return structuredClone(fallback);
  }
}

export function writeJSON(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  const fd = fs.openSync(tmp, "w");
  try { fs.writeSync(fd, JSON.stringify(value)); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  fs.renameSync(tmp, file);
}

// Where the stores live: api/data/state/<name>.json, so a restart keeps every job, hold, token and payment.
// DONE_STATE_DIR moves them; DONE_STATE_DIR=memory (and the test runner) keeps them in memory only.
const STATE = process.env.DONE_STATE_DIR || path.join(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "../data/state");
export const stateDir = () => (STATE === "memory" || process.env.NODE_TEST_CONTEXT ? null : STATE);
export const stateFile = (name) => (STATE === "memory" || process.env.NODE_TEST_CONTEXT ? null : path.join(STATE, `${name}.json`));

// One store: a JSON object kept in memory. save() marks it changed and the file is written once the burst of changes
// settles (WRITE_MS, at most MAX_MS after the first change): one tour step changes a job dozens of times, and writing a
// 30 MB file each time held every request for seconds. Every pending write is flushed on exit (and SIGINT/SIGTERM).
// Tests pass file = null to keep it in memory only.
const WRITE_MS = +(process.env.DONE_SAVE_MS ?? 150), MAX_MS = 1000;
const pending = new Set();
const flushAll = () => { for (const s of [...pending]) s.flush(); };
let hooked = false;
function hook() {
  if (hooked) return; hooked = true;
  process.on("exit", flushAll);
  for (const sig of ["SIGINT", "SIGTERM", "SIGBREAK"]) process.on(sig, () => { flushAll(); process.exit(0); });
}
export function store(file, fallback) {
  let data = file ? readJSON(file, fallback) : structuredClone(fallback);
  let timer = null, first = 0;
  const s = {
    get data() { return data; },
    save() {
      if (!file) return;
      if (WRITE_MS <= 0) return writeJSON(file, data);
      hook(); pending.add(s);
      const now = Date.now(); if (!timer) first = now;
      clearTimeout(timer);
      timer = setTimeout(s.flush, Math.max(0, Math.min(WRITE_MS, first + MAX_MS - now)));
    },
    flush() { clearTimeout(timer); timer = null; if (!pending.delete(s)) return; writeJSON(file, data); },
    reset(value = fallback) { data = structuredClone(value); this.save(); },
  };
  return s;
}
export const flushStores = flushAll;
