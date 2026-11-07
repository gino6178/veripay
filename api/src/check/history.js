// Evidence already seen with earlier jobs, so a pro can't send the same picture of a fixed faucet, or the same parts
// receipt, for every job. In memory here; the core store can persist rows() and give them back with load().
//   row: { jobId, evidenceId, kind: "photo"|"receipt", sha, dhash, store?, total?, date?, at }
let index = [];
export const photoRows = () => index.slice();
// a row is kept when something identifies it: a file hash, a picture hash, a receipt's total, or a document's number
export const loadPhotoRows = (rows) => { index = (rows || []).filter((r) => r && r.jobId && (r.sha || r.dhash || (r.kind === "receipt" && r.total != null) || (r.kind === "document" && r.number))).map((r) => ({ kind: "photo", ...r })); };
export const clearPhotoRows = () => { index = []; };
export function rememberPhotos(jobId, facts, extra = {}) {
  for (const f of facts) {
    if (!["photo", "receipt"].includes(f.kind)) continue;
    const rc = f.kind === "receipt" && f.receipt && !f.receipt.error ? { store: f.receipt.store || null, total: f.receipt.total ?? null, date: f.receipt.date || null } : {};
    if (!f.sha && !f.dhash && rc.total == null) continue;
    if (index.some((r) => r.jobId === jobId && r.evidenceId === f.id)) continue;
    index.push({ jobId, evidenceId: f.id, kind: f.kind, sha: f.sha, dhash: f.dhash, ...rc, ...extra, at: new Date().toISOString() });
  }
  if (index.length > 20000) index = index.slice(-20000);
}
// the same receipt by what it says: store, total and date all equal (the store compared on its letters only)
const storeKey = (s) => String(s || "").toUpperCase().replace(/[^A-Z]/g, "").slice(0, 20);
export function sameReceipt(a, b) {
  return a?.total != null && b?.total != null && a.total === b.total && !!a.date && a.date === b.date && !!storeKey(a.store) && storeKey(a.store) === storeKey(b.store);
}
// documents (permits, invoices, lien waivers) by file and number
export function rememberDocument(jobId, { evidenceId = null, sha = null, docKind, number = null }) {
  if (!jobId || (!sha && !number)) return;
  if (index.some((r) => r.jobId === jobId && r.kind === "document" && ((sha && r.sha === sha) || (number && r.number === number && r.docKind === docKind)))) return;
  index.push({ jobId, evidenceId, kind: "document", sha, docKind, number, at: new Date().toISOString() });
}
