// Paperwork from data the platform already has (PLAN §14), written by code: no model wrote any of it (a model may later
// polish wording, labelled). Every number comes from the job's ledger, so the documents add up with the money.
//   progressReport(j, m)  a milestone's report for the customer: done, before/after photos, each check, money so far,
//                         next step (made at each milestone's release, kept on the job, an activity event)
//   closeout(j)           the close-out package: scope and evidence per condition, parts and materials with receipts,
//                         permit and inspection, warranty dates, Texas lien waivers prefilled from recorded payments,
//                         signed receipts. HTML, and a PDF written here in plain JS (no dependency)
//   dailyLog(j)           per day of a multi-day job: arrival, departure, photos, change orders, checks
//   books(proId, {month, year, format})  the pro's bookkeeping: QuickBooks-importable CSV, and a year summary
import { when } from "./human.js";
const said = (c) => c?.label || (c?.verdict === "pass" && (c?.needsPerson || (c?.signals || []).some((s) => /^needs_person/.test(String(s)))) ? "NEEDS_REVIEW" : c?.verdict); // a pass a person must confirm is NEEDS_REVIEW, never "pass"

const $ = (c) => `$${(Math.round(c || 0) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const dayOf = (iso) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
const sum = (L, k, f = () => true) => L.filter((l) => l.kind === k && f(l)).reduce((t, l) => t + l.amount, 0);
export const LABEL = "Written by code from the job's records (no model wrote it).";

// ---- what was paid, from the ledger -------------------------------------------------------------------------------
export function paidSoFar(j, uptoMs = null) {
  const L = j.money?.ledger || [], inMs = (l) => !uptoMs || !l.milestone || uptoMs.includes(l.milestone);
  return {
    captured: sum(L, "capture", inMs), refunded: sum(L, "refund", inMs),
    toPro: sum(L, "pro_payout", inMs) + sum(L, "retainage_paid", inMs) + sum(L, "materials_payout", (l) => inMs(l) && l.to !== "supplier"),
    toHelper: sum(L, "helper_payout", inMs), toSupplier: sum(L, "materials_payout", (l) => inMs(l) && l.to === "supplier"),
    fee: sum(L, "platform_fee", inMs) + sum(L, "early_pay_fee", inMs), retained: sum(L, "retainage_held", inMs) - sum(L, "retainage_paid", inMs) - sum(L, "retainage_refunded", inMs),
    materials: sum(L, "materials_payout", inMs),
  };
}

// ---- 1. the milestone progress report -----------------------------------------------------------------------------
export function progressReport(j, m, { view } = {}) {
  const r = j.checks.filter((x) => x.milestone === m.id && x.kind !== "defect").at(-1);
  const ev = (id) => j.evidence.find((e) => e.id === id);
  const conds = j.scope.checks.filter((c) => m.checkIds.includes(c.id)).map((c) => { const v = r?.checks.find((x) => x.id === c.id); return { id: c.id, what: c.what, verdict: v?.verdict || "not checked", reason: v?.reason || "", photos: (r?.evidence || []).map(ev).filter((e) => e && (e.checkId === c.id || (e.checkIds || []).includes(c.id)) && e.kind === "photo").map((e) => ({ id: e.id, taken: e.exif?.taken || e.uploadedAt })) }; });
  const before = j.evidence.filter((e) => e.phase === "before" && e.kind === "photo").map((e) => ({ id: e.id, taken: e.exif?.taken || e.uploadedAt }));
  const done = j.milestones.filter((x) => ["released", "resolved"].includes(x.status)).map((x) => x.id);
  const money = paidSoFar(j, done), next = j.milestones.find((x) => !["released", "resolved"].includes(x.status));
  const data = { kind: "progress", job: j.number, title: j.scope.title, milestone: { id: m.id, title: m.title, status: m.status, release: m.release?.release ?? null }, at: m.release?.at || new Date().toISOString(), conditions: conds, before, money, next: next ? `${next.title}: ${j.scope.checks.filter((c) => next.checkIds.includes(c.id)).map((c) => c.what).join("; ")}` : "Nothing: the job is finished. The warranty window is open.", label: LABEL };
  const img = (id) => `<img src="/api/jobs/${esc(j.id)}/evidence/${esc(id)}" alt="" style="width:120px;height:90px;object-fit:cover;border-radius:6px;margin:2px">`;
  const html = page(`${j.number}: ${m.title}`, `<p class="muted">${esc(j.scope.title)} · progress report · ${esc(when(data.at))}</p>
<h2>Done</h2><p>${esc(m.title)}: ${m.release ? `paid ${$(m.release.release)}` : esc(m.status)}.</p>
${before.length ? `<h2>Before</h2><div>${before.map((b) => img(b.id)).join("")}</div>` : ""}
<h2>Each condition</h2><table><tr><th>Condition</th><th>Result</th><th>Why</th><th>After</th></tr>${conds.map((c) => `<tr><td>${esc(c.what)}</td><td>${esc(c.verdict)}</td><td>${esc(c.reason)}</td><td>${c.photos.map((p) => img(p.id)).join("")}</td></tr>`).join("")}</table>
<h2>Money so far</h2><table><tr><td>Captured from your hold</td><td>${$(money.captured)}</td></tr><tr><td>Paid to the pro (incl. materials advances)</td><td>${$(money.toPro)}</td></tr>${money.toHelper ? `<tr><td>Paid to the helper</td><td>${$(money.toHelper)}</td></tr>` : ""}${money.toSupplier ? `<tr><td>Paid to the supplier</td><td>${$(money.toSupplier)}</td></tr>` : ""}<tr><td>Platform fee</td><td>${$(money.fee)}</td></tr>${money.retained ? `<tr><td>Retained until the warranty ends</td><td>${$(money.retained)}</td></tr>` : ""}${money.refunded ? `<tr><td>Refunded to you</td><td>${$(money.refunded)}</td></tr>` : ""}</table>
<h2>Next</h2><p>${esc(data.next)}</p>`);
  return { data, html };
}

// ---- 2. the close-out package, with Texas lien waivers ------------------------------------------------------------
// Texas Property Code §53.281-.287: a lien waiver must be in the statutory form (§53.284), one of four: conditional or
// unconditional, on a progress or the final payment. The forms below carry the statute's fields, prefilled from the
// payments the platform recorded; the exact statutory wording must be checked before real use (this is a demo).
export function lienWaivers(j, { owner = "the property owner", property = null, claimant = null } = {}) {
  const L = j.money?.ledger || [], paidBy = (ms) => sum(L, "pro_payout", (l) => l.milestone === ms) + sum(L, "helper_payout", (l) => l.milestone === ms) + sum(L, "platform_fee", (l) => l.milestone === ms) + sum(L, "materials_payout", (l) => l.milestone === ms) + sum(L, "retainage_held", (l) => l.milestone === ms);
  const prop = property || `${j.address?.line || "the job address"}, Austin, TX ${j.address?.zip || ""}`.trim(), who = claimant || j.agreed?.proName || "the contractor";
  const out = [];
  const done = (j.milestones || []).filter((m) => ["released", "resolved"].includes(m.status));
  for (const [i, m] of done.entries()) {
    const last = i === (j.milestones || []).length - 1 && j.milestones.every((x) => ["released", "resolved"].includes(x.status));
    const amount = m.release?.release ?? paidBy(m.id);
    const through = m.release?.at || j.paidAt;
    if (!last) for (const kind of ["conditional", "unconditional"]) out.push({ form: `${kind === "conditional" ? "Conditional" : "Unconditional"} Waiver and Release on Progress Payment`, statute: "Tex. Prop. Code §53.284(b)/(c)", kind, stage: "progress", milestone: m.id, claimant: who, owner, property: prop, job: `${j.number} ${j.scope.title}${j.milestones.length > 1 ? ` (${m.title})` : ""}`, amount, through, maker: "VeriPay (PayPal capture on the owner's authorization)" });
  }
  if (["released", "resolved"].includes(j.status)) {
    const total = done.reduce((t, m) => t + (m.release?.release || 0), 0); // each release already counts its materials advance
    for (const kind of ["conditional", "unconditional"]) out.push({ form: `${kind === "conditional" ? "Conditional" : "Unconditional"} Waiver and Release on Final Payment`, statute: "Tex. Prop. Code §53.284(d)/(e)", kind, stage: "final", claimant: who, owner, property: prop, job: `${j.number} ${j.scope.title}`, amount: total, through: j.paidAt, maker: "VeriPay (PayPal captures on the owner's authorization)", disputed: 0 });
  }
  return out;
}
const waiverText = (w) => w.stage === "progress"
  ? `On receipt by the signer of this document of a payment from ${w.maker} in the sum of ${$(w.amount)} payable to ${w.claimant}${w.kind === "conditional" ? ", and when the payment has been properly endorsed and has been paid by the bank on which it is drawn," : ","} this document becomes effective to release any mechanic's lien right, any right arising from a payment bond that complies with a state or federal statute, any common law payment bond right, any claim for payment, and any rights under any similar ordinance, rule, or statute related to claim or payment rights for persons in the signer's position that the signer has on the property of ${w.owner} located at ${w.property} to the following extent: ${w.job}. This release covers a progress payment for all labor, services, equipment, or materials furnished to the property or to ${w.owner} through ${w.through ? when(w.through, { date: true }) : "the date of payment"} only and does not cover any retention or items furnished after that date.`
  : `On receipt by the signer of this document of a payment from ${w.maker} in the sum of ${$(w.amount)} payable to ${w.claimant}${w.kind === "conditional" ? ", and when the payment has been properly endorsed and has been paid by the bank on which it is drawn," : ","} this document becomes effective to release any mechanic's lien right, any right arising from a payment bond that complies with a state or federal statute, any common law payment bond right, any claim for payment, and any rights under any similar ordinance, rule, or statute related to claim or payment rights for persons in the signer's position that the signer has on the property of ${w.owner} located at ${w.property} to the following extent: ${w.job}. This release covers the final payment to the signer for all labor, services, equipment, or materials furnished to the property or to ${w.owner}.`;

export function closeout(j, { receipts = [], view } = {}) {
  const L = j.money?.ledger || [], money = paidSoFar(j);
  const conds = j.scope.checks.map((c) => { const r = j.checks.filter((x) => x.checks.some((y) => y.id === c.id)).at(-1), v = r?.checks.find((y) => y.id === c.id); return { id: c.id, what: c.what, evidence: c.evidence, doc: c.doc || null, verdict: v ? said(v) : "not checked", reason: v?.reason || "", items: j.evidence.filter((e) => e.phase !== "before" && (e.checkId === c.id || (e.checkIds || []).includes(c.id))).map((e) => ({ id: e.id, kind: e.kind, taken: e.exif?.taken || e.uploadedAt, text: e.text ? String(e.text).slice(0, 160) : null })) }; });
  const parts = [...j.changeOrders.filter((c) => c.status === "approved").map((c) => ({ what: c.reason, kind: c.kind || "parts", approved: c.amount, advanced: c.advance?.status === "paid" ? c.advance.amount : 0, returned: c.returned || 0, invoice: c.advance?.check?.invoice || null })), ...(j.agreed?.parts ? [{ what: "parts in the agreed price", kind: "parts", approved: j.agreed.parts, advanced: 0, returned: 0, adjusted: sum(L, "parts_adjusted") }] : [])];
  const docs = conds.filter((c) => c.doc);
  const waivers = lienWaivers(j);
  const data = { kind: "closeout", job: j.number, title: j.scope.title, status: j.status, address: { zip: j.address?.zip, line: j.address?.line || null }, pro: j.agreed?.proName || null, price: j.agreed?.price ?? null, paidAt: j.paidAt || null, conditions: conds, parts, documents: docs, warranty: j.warranty ? { from: j.paidAt, until: j.warranty.until, days: j.warranty.days, status: j.warranty.status, retained: j.warranty.retained || 0 } : null, money, waivers, receipts: receipts.map((r) => ({ id: r.id, kind: r.kind, at: r.at })), label: LABEL };
  const html = page(`${j.number}: close-out package`, `<p class="muted">${esc(j.scope.title)} · ${esc(j.agreed?.proName || "")} · ${j.paidAt ? `paid ${esc(when(j.paidAt))}` : esc(j.status)}</p>
${(j.milestones || []).some((m) => m.acknowledgedFailed) ? `<p class="warn"><b>Released over conditions that didn't pass:</b> ${esc((j.milestones || []).filter((m) => m.acknowledgedFailed).map((m) => `${m.acknowledgedFailed.ids.join(", ")} (${m.acknowledgedFailed.note || "the customer acknowledged them and released anyway"})`).join("; "))}. The waivers below follow the payment that was made.</p>` : ""}
<h2>Scope and evidence, condition by condition</h2><table><tr><th>Condition</th><th>Result</th><th>Evidence</th></tr>${conds.map((c) => `<tr><td>${esc(c.what)}</td><td>${esc(c.verdict)}</td><td>${c.items.map((e) => `${esc(e.kind)} ${e.taken ? esc(when(e.taken)) : ""}`).join("<br>")}</td></tr>`).join("")}</table>
<h2>Parts and materials</h2><table><tr><th>What</th><th>Approved</th><th>Advanced</th><th>Returned</th><th>Invoice</th></tr>${parts.map((p) => `<tr><td>${esc(p.what)}</td><td>${$(p.approved)}</td><td>${$(p.advanced)}</td><td>${$(p.returned)}</td><td>${p.invoice ? esc(`${p.invoice.store || ""} ${p.invoice.total != null ? $(p.invoice.total) : ""} ${p.invoice.date || ""}`) : p.adjusted ? `paid at the receipt: ${$(p.approved - p.adjusted)}` : ""}</td></tr>`).join("") || "<tr><td colspan=5>None</td></tr>"}</table>
<h2>Permit and inspection</h2>${docs.length ? `<ul>${docs.map((d) => `<li>${esc(d.what)}: ${esc(d.verdict)}${d.items[0]?.text ? ` (${esc(d.items[0].text.split("\n").slice(0, 2).join(" "))})` : ""}</li>`).join("")}</ul>` : "<p>None required for this job.</p>"}
<h2>Warranty</h2><p>${data.warranty ? `From ${esc(when(data.warranty.from, { date: true }))} to ${esc(when(data.warranty.until, { date: true }))} (${data.warranty.days} days)${data.warranty.retained ? `; ${$(data.warranty.retained)} retained until then` : ""}.` : "Starts when the job is paid."}</p>
<h2>Money</h2><table><tr><td>Captured</td><td>${$(money.captured)}</td></tr><tr><td>To the pro (incl. materials)</td><td>${$(money.toPro)}</td></tr><tr><td>To the helper</td><td>${$(money.toHelper)}</td></tr><tr><td>Platform fee</td><td>${$(money.fee)}</td></tr><tr><td>Refunded</td><td>${$(money.refunded)}</td></tr></table>
<h2>Lien waivers (Texas)</h2><p class="muted">The four statutory forms of Tex. Prop. Code §53.284, prefilled from the payments recorded here. Check the wording against the statute before real use; this is a demo.</p>${waivers.map((w) => `<div class="waiver"><h3>${esc(w.form)}</h3><p class="muted">${esc(w.statute)}</p><p>Project: ${esc(w.job)}<br>Job location: ${esc(w.property)}<br>Owner: ${esc(w.owner)}<br>Claimant: ${esc(w.claimant)}<br>Amount: ${$(w.amount)}</p><p>${esc(waiverText(w))}</p><p>Claimant's signature: ______________________ Date: __________</p></div>`).join("") || "<p>None yet: waivers come with payments.</p>"}
<h2>Signed receipts</h2><p>${data.receipts.length ? data.receipts.map((r) => `${esc(r.kind)} ${esc(r.id)}`).join(", ") : "See /.well-known/done-receipts.json to verify."}</p>`);
  return { data, html, pdf: () => pdfOf(`${j.number} close-out package`, [
    `${j.scope.title} | ${j.agreed?.proName || ""} | ${j.paidAt ? `paid ${when(j.paidAt)}` : j.status}`, LABEL, "",
    "SCOPE AND EVIDENCE", ...conds.map((c) => `- ${c.what}: ${c.verdict}${c.items.length ? ` (${c.items.length} item${c.items.length > 1 ? "s" : ""})` : ""}`), "",
    "PARTS AND MATERIALS", ...(parts.length ? parts.map((p) => `- ${p.what}: approved ${$(p.approved)}${p.advanced ? `, advanced ${$(p.advanced)}` : ""}${p.returned ? `, returned ${$(p.returned)}` : ""}`) : ["- none"]), "",
    "PERMIT AND INSPECTION", ...(docs.length ? docs.map((d) => `- ${d.what}: ${d.verdict}`) : ["- none required"]), "",
    "WARRANTY", data.warranty ? `${when(data.warranty.from, { date: true })} to ${when(data.warranty.until, { date: true })} (${data.warranty.days} days)` : "starts when paid", "",
    "MONEY", `Captured ${$(money.captured)}; to the pro ${$(money.toPro)}; helper ${$(money.toHelper)}; fee ${$(money.fee)}; refunded ${$(money.refunded)}`, "",
    ...waivers.flatMap((w) => ["\f", w.form.toUpperCase(), w.statute, `Project: ${w.job}`, `Job location: ${w.property}`, `Owner: ${w.owner}`, `Claimant: ${w.claimant}`, `Amount: ${$(w.amount)}`, "", waiverText(w), "", "Claimant's signature: ______________________   Date: __________", "(Demo: check the wording against Tex. Prop. Code §53.284 before real use.)"]),
  ]) };
}

// ---- 4. the daily job log -----------------------------------------------------------------------------------------
export function dailyLog(j) {
  const days = new Map(), add = (iso, f) => { if (!iso) return; const d = dayOf(iso); if (!days.has(d)) days.set(d, { day: d, first: iso, last: iso, photos: [], changes: [], checks: [], payments: [] }); const x = days.get(d); if (iso < x.first) x.first = iso; if (iso > x.last) x.last = iso; f(x); };
  for (const e of j.evidence) add(e.exif?.taken || e.uploadedAt, (x) => x.photos.push({ id: e.id, kind: e.kind, phase: e.phase || "after", at: e.exif?.taken || e.uploadedAt }));
  for (const c of j.changeOrders) add(c.at, (x) => x.changes.push({ id: c.id, amount: c.amount, reason: c.reason, status: c.status, kind: c.kind || "parts" }));
  for (const r of j.checks) add(r.at, (x) => x.checks.push({ milestone: r.milestone, decision: r.decision, passed: r.checks.filter((c) => c.verdict === "pass").length, of: r.checks.length }));
  for (const l of j.money?.ledger || []) if (["capture", "pro_payout", "materials_payout", "refund"].includes(l.kind)) add(l.at, (x) => x.payments.push({ kind: l.kind, amount: l.amount }));
  const out = [...days.values()].sort((a, b) => a.day.localeCompare(b.day)).map((x) => ({ ...x, arrived: x.first, left: x.last, says: `${x.photos.length} photos${x.changes.length ? `, ${x.changes.length} change order${x.changes.length > 1 ? "s" : ""}` : ""}${x.checks.length ? `, checked ${x.checks.map((c) => `${c.passed}/${c.of}`).join(", ")}` : ""}` }));
  const html = page(`${j.number}: daily log`, out.map((d) => `<h2>${esc(d.day)}</h2><p>On site ${esc(when(d.arrived))} to ${esc(when(d.left))} · ${esc(d.says)}</p>${d.changes.length ? `<ul>${d.changes.map((c) => `<li>Change order ${$(c.amount)} (${esc(c.kind)}): ${esc(c.reason)}, ${esc(c.status)}</li>`).join("")}</ul>` : ""}`).join("") || "<p>Nothing yet.</p>");
  return { data: { kind: "daily", job: j.number, days: out, weather: null, label: LABEL }, html };
}

// ---- 3. the pro's books ---------------------------------------------------------------------------------------------
// Rows from the ledger of every job the pro was hired for: income (the customer's payment for the work), the platform
// fee (an expense), materials advances, refunds. QuickBooks Online bank upload: Date,Description,Amount (MM/DD/YYYY).
export function books(jobs, proId, { month = null, year = null } = {}) {
  const rows = [];
  for (const j of jobs.filter((x) => x.agreed?.pro === proId)) {
    for (const l of j.money?.ledger || []) {
      const d = dayOf(l.at), m = j.milestones?.find((x) => x.id === l.milestone);
      if (month && !d.startsWith(month)) continue;
      if (year && !d.startsWith(String(year))) continue;
      const desc = `${j.number} ${j.scope.title}${m && j.milestones.length > 1 ? ` (${m.title})` : ""}`;
      if (l.kind === "pro_payout" || l.kind === "retainage_paid") rows.push({ date: d, job: j.number, type: "income", account: "Sales: VeriPay", description: `${desc}: paid to you${l.note ? ` (${l.note})` : ""}`, amount: l.amount, ref: l.ref || null });
      else if (l.kind === "materials_payout" && l.to !== "supplier") rows.push({ date: d, job: j.number, type: "materials_advance", account: "Materials reimbursed: VeriPay", description: `${desc}: materials advance`, amount: l.amount, ref: l.ref || null });
      else if (l.kind === "platform_fee" || l.kind === "early_pay_fee") rows.push({ date: d, job: j.number, type: "fee", account: "Platform fees: VeriPay", description: `${desc}: ${l.kind === "early_pay_fee" ? "early-pay fee" : "platform fee (10%)"}`, amount: -l.amount, ref: null, grossUp: true });
      else if (l.kind === "helper_payout") rows.push({ date: d, job: j.number, type: "helper", account: "Contract labor: helper", description: `${desc}: paid to your helper directly`, amount: -l.amount, ref: null, grossUp: true });
      else if (l.kind === "materials_unrecovered") rows.push({ date: d, job: j.number, type: "owed", account: "Owed to VeriPay", description: `${desc}: materials advance above your settled share`, amount: -l.amount, ref: null });
    }
  }
  rows.sort((a, b) => a.date.localeCompare(b.date) || a.job.localeCompare(b.job));
  // gross receipts: what customers paid for the pro's work (the pro's share + their helper + the fee kept on it)
  const gross = rows.filter((r) => r.type === "income").reduce((t, r) => t + r.amount, 0) + rows.filter((r) => r.grossUp).reduce((t, r) => t - r.amount, 0);
  return { rows, totals: { income: rows.filter((r) => r.type === "income").reduce((t, r) => t + r.amount, 0), fees: -rows.filter((r) => r.type === "fee").reduce((t, r) => t + r.amount, 0), helpers: -rows.filter((r) => r.type === "helper").reduce((t, r) => t + r.amount, 0), materials: rows.filter((r) => r.type === "materials_advance").reduce((t, r) => t + r.amount, 0), gross } };
}
const csvCell = (v) => { const s = String(v ?? ""); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
export function booksCsv(b, { format = "detail" } = {}) {
  const mdY = (d) => `${d.slice(5, 7)}/${d.slice(8, 10)}/${d.slice(0, 4)}`;
  if (format === "qbo") return ["Date,Description,Amount", ...b.rows.filter((r) => !r.grossUp || r.type === "fee").map((r) => [mdY(r.date), r.description, (r.amount / 100).toFixed(2)].map(csvCell).join(","))].join("\r\n") + "\r\n";
  return ["Date,Job,Type,Account,Description,Amount,PayPal ref", ...b.rows.map((r) => [mdY(r.date), r.job, r.type, r.account, r.description, (r.amount / 100).toFixed(2), r.ref || ""].map(csvCell).join(","))].join("\r\n") + "\r\n";
}
export function yearSummary(b, year, pro) {
  const t = b.totals;
  return { year, pro: pro.name, gross: t.gross, income: t.income, fees: t.fees, helpers: t.helpers, materialsReimbursed: t.materials,
    notTaxAdvice: "Not tax advice. A summary of what VeriPay recorded, to give your tax preparer.",
    forms: "Context: payments sent with PayPal Payouts may be reported to the IRS by PayPal on Form 1099-K when they meet its thresholds; a platform paying you as a contractor may issue Form 1099-NEC. Your gross receipts are what customers paid for your work; the platform fee and what you paid your helper are business expenses. Materials advances reimburse what you bought for the customer's job. Keep your own records too.",
    byMonth: Object.values(b.rows.reduce((m, r) => { const k = r.date.slice(0, 7); (m[k] ||= { month: k, income: 0, fees: 0, materials: 0 }); if (r.type === "income") m[k].income += r.amount; if (r.type === "fee") m[k].fees -= r.amount; if (r.type === "materials_advance") m[k].materials += r.amount; return m; }, {})) };
}

// ---- a page, and a PDF in plain JS ------------------------------------------------------------------------------------
function page(title, body) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><style>:root{--bg:#fff;--ink:#001C64;--soft:#4A5568;--line:#DDE3EC;--link:#005BB8}a{color:var(--link)}h1,h2{color:#003087}body{background:var(--bg);color:var(--ink);font:15px/1.5 system-ui,sans-serif;max-width:860px;margin:0 auto;padding:24px 16px}h1{font-size:22px}h2{font-size:17px;margin-top:28px}table{border-collapse:collapse;width:100%}td,th{border-bottom:1px solid var(--line);padding:6px 8px;text-align:left;vertical-align:top}.muted{color:var(--soft);font-size:13px}.waiver{border:1px solid var(--line);border-radius:8px;padding:12px 16px;margin:12px 0}@media print{.waiver{page-break-before:always}}</style></head><body><h1>${esc(title)}</h1>${body}<p class="muted">${esc(LABEL)}</p></body></html>`;
}
// A minimal PDF 1.4: Letter pages, Helvetica 10 pt, wrapped lines; "\f" starts a new page. Text only (the HTML has the
// photos). Latin-1 text; anything else is replaced.
export function pdfOf(title, lines) {
  const W = 612, H = 792, M = 54, LH = 13, perLine = 95, pages = [[]];
  const wrap = (s) => { const out = []; let cur = ""; for (const w of String(s).split(/\s+/)) { if ((cur + " " + w).trim().length > perLine) { out.push(cur); cur = w; } else cur = (cur + " " + w).trim(); } out.push(cur); return out; };
  for (const ln of [title, "", ...lines]) {
    if (ln === "\f") { if (pages.at(-1).length) pages.push([]); continue; }
    for (const w of wrap(ln)) { if (pages.at(-1).length >= Math.floor((H - 2 * M) / LH)) pages.push([]); pages.at(-1).push(w); }
  }
  const pdfStr = (s) => s.replace(/[^\x20-\x7e\xa0-\xff]/g, (c) => (c === "§" ? "\xa7" : c === "’" || c === "‘" ? "'" : c === "“" || c === "”" ? '"' : c === "–" || c === "—" ? "-" : c === "•" ? "*" : "?")).replace(/[\\()]/g, (c) => `\\${c}`);
  const objs = [];
  const add = (s) => { objs.push(s); return objs.length; };
  const font = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
  const pagesId = objs.length + 1 + pages.length * 2; // placeholder index, fixed below
  const kids = [];
  for (const p of pages) {
    const body = `BT /F1 10 Tf ${LH} TL ${M} ${H - M} Td ` + p.map((l, i) => `${i ? "T* " : ""}(${pdfStr(l)}) Tj`).join(" ") + " ET";
    const content = add(`<< /Length ${Buffer.byteLength(body, "latin1")} >>\nstream\n${body}\nendstream`);
    kids.push(add(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /Font << /F1 ${font} 0 R >> >> /Contents ${content} 0 R >>`));
  }
  const pagesObj = add(`<< /Type /Pages /Kids [${kids.map((k) => `${k} 0 R`).join(" ")}] /Count ${kids.length} >>`);
  if (pagesObj !== pagesId) throw new Error("pdf: page tree index");
  const catalog = add(`<< /Type /Catalog /Pages ${pagesObj} 0 R >>`);
  const info = add(`<< /Title (${pdfStr(title)}) /Producer (VeriPay, written by code) >>`);
  let out = "%PDF-1.4\n%\xe2\xe3\xcf\xd3\n";
  const offs = [];
  objs.forEach((o, i) => { offs.push(Buffer.byteLength(out, "latin1")); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = Buffer.byteLength(out, "latin1");
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offs.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size ${objs.length + 1} /Root ${catalog} 0 R /Info ${info} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, "latin1");
}

// ---- weather for the daily log: the US National Weather Service (api.weather.gov, no key) -------------------------------
// Optional (DONE_WEATHER=off turns it off), cached, labelled. The nearest observation station to the job, that day's
// observations (7 am to 7 pm Austin), summarized: the description seen most, low and high in °F. The User-Agent names
// the app only.
const wxCache = new Map(), UA = "DoneAndPaid/1.0 (demo app)";
let wxFetch = (url) => fetch(url, { headers: { "User-Agent": UA, accept: "application/geo+json" }, signal: AbortSignal.timeout(8000) }).then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))));
export const setWeatherFetch = (f) => { wxFetch = f; wxCache.clear(); };
async function stationFor(lat, lng) {
  const k = `st:${lat.toFixed(2)},${lng.toFixed(2)}`;
  if (!wxCache.has(k)) wxCache.set(k, (async () => { const p = await wxFetch(`https://api.weather.gov/points/${lat.toFixed(4)},${lng.toFixed(4)}`); const s = await wxFetch(p.properties.observationStations); const f = s.features?.[0]; return f ? { id: f.properties.stationIdentifier, name: f.properties.name } : null; })().catch((e) => { wxCache.delete(k); throw e; }));
  return wxCache.get(k);
}
export async function weatherFor(lat, lng, day) {
  if (process.env.DONE_WEATHER === "off" || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const k = `wx:${lat.toFixed(2)},${lng.toFixed(2)}:${day}`;
  if (wxCache.has(k)) return wxCache.get(k);
  try {
    const st = await stationFor(lat, lng);
    if (!st) return null;
    const from = new Date(`${day}T12:00:00Z`).toISOString(), to = new Date(`${day}T23:59:00Z`).toISOString(); // 7 am to 7 pm in Austin (CDT/CST, near enough)
    const o = await wxFetch(`https://api.weather.gov/stations/${st.id}/observations?start=${encodeURIComponent(from)}&end=${encodeURIComponent(to)}`);
    const obs = (o.features || []).map((f) => f.properties), temps = obs.map((p) => p.temperature?.value).filter((v) => Number.isFinite(v)).map((c) => Math.round(c * 9 / 5 + 32));
    const words = obs.map((p) => p.textDescription).filter(Boolean), most = words.sort((a, b) => words.filter((x) => x === b).length - words.filter((x) => x === a).length)[0] || null;
    const w = obs.length ? { says: `${most || "no description"}${temps.length ? `, ${Math.min(...temps)}-${Math.max(...temps)} °F` : ""}`, lowF: temps.length ? Math.min(...temps) : null, highF: temps.length ? Math.max(...temps) : null, observations: obs.length, station: st.id, stationName: st.name, source: "US National Weather Service (api.weather.gov), observed" } : { says: "no observations on record for that day (the Weather Service keeps about the last 7 days)", observations: 0, station: st.id, stationName: st.name, source: "US National Weather Service (api.weather.gov)" };
    wxCache.set(k, w);
    return w;
  } catch (e) { return { error: String(e.message || e).slice(0, 80), source: "US National Weather Service (api.weather.gov)" }; }
}
export async function dailyLogWithWeather(j) {
  const d = dailyLog(j);
  for (const day of d.data.days) day.weather = await weatherFor(j.address?.lat, j.address?.lng, day.day);
  d.data.weather = process.env.DONE_WEATHER === "off" ? null : "US National Weather Service (api.weather.gov): observed at the nearest station, cached; optional";
  d.html = d.html.replace(/<h2>(\d{4}-\d{2}-\d{2})<\/h2><p>/g, (m0, day) => { const w = d.data.days.find((x) => x.day === day)?.weather; return w?.says ? `<h2>${day}</h2><p class="muted">Weather (NWS, ${esc(w.station)}): ${esc(w.says)}</p><p>` : m0; });
  return d;
}

// ---- 5. the insurance claim package (PLAN §15 item 6) ---------------------------------------------------------------
// For a water-damage or leak job: what the homeowner's insurer usually asks for, from the job's records only. The damage
// photos (the customer's or tenant's reference photos and the pro's BEFORE photos), the cause as written in the job's
// notes, the work done (the scope and each condition's result), receipts and materials, a timeline, and every payment
// with its PayPal id. It is prepared from the records; it is not an insurance claim filing.
export const INSURANCE_LABEL = "Prepared from the job's records by VeriPay (written by code, no model); not an insurance claim filing. The homeowner files the claim with their insurer.";
const WATER = /\b(leak|leaking|leaks|leaky|drip|drips|dripping|water damage|water[- ]damaged|flood|flooded|flooding|burst|pipe|pipes|water heater|overflow|overflowing|seep|seeping|moisture|mold|wet|soaked|ceiling stain)\b/i;
export const waterJob = (j) => WATER.test(`${j.text || ""} ${j.scope?.title || ""} ${(j.scope?.items || []).join(" ")} ${j.scope?.template || ""}`);
export function insuranceClaim(j, { base = "" } = {}) {
  if (!waterJob(j)) return { error: "not_eligible", message: "The insurance claim package is for water-damage and leak jobs (the job's text or scope doesn't name a leak, a burst pipe, a flood or water damage)." };
  const L = j.money?.ledger || [], money = paidSoFar(j), photoUrl = (e) => `${base}/api/jobs/${j.id}/evidence/${e.id}`;
  const damage = j.evidence.filter((e) => e.kind === "photo" && ["reference", "before"].includes(e.phase || "after")).map((e) => ({ id: e.id, phase: e.phase, label: e.label || null, taken: e.exif?.taken || null, uploadedAt: e.uploadedAt, gps: e.exif?.lat != null ? { lat: e.exif.lat, lng: e.exif.lng } : null, sha256: e.sha, url: photoUrl(e), by: e.phase === "reference" ? (j.tenant ? "the tenant or customer" : "the customer") : "the pro (before work)" }));
  const notes = [
    { from: "the job as posted", at: j.created, text: j.text },
    ...(j.tenantNotes || []).map((n) => ({ from: "the tenant", at: n.at, text: n.text })),
    ...j.evidence.filter((e) => e.kind === "note" && e.text).map((e) => ({ from: "the pro's note", at: e.uploadedAt, text: e.text })),
    ...j.changeOrders.map((c) => ({ from: `the pro's change order (${c.status})`, at: c.at, text: c.reason })),
  ].filter((n) => n.text);
  const work = j.scope.checks.map((c) => { const r = j.checks.filter((x) => x.checks.some((y) => y.id === c.id)).at(-1), v = r?.checks.find((y) => y.id === c.id); return { id: c.id, what: c.what, verdict: v ? said(v) : "not checked", reason: v?.reason || "", decidedBy: r?.decidedBy || null, checker: r?.checker || null, after: j.evidence.filter((e) => e.kind === "photo" && (e.phase || "after") === "after" && (e.checkId === c.id || (e.checkIds || []).includes(c.id))).map((e) => ({ id: e.id, taken: e.exif?.taken || null, url: photoUrl(e) })) }; });
  const receiptsIn = j.evidence.filter((e) => e.kind === "receipt").map((e) => ({ id: e.id, name: e.name, text: e.text ? String(e.text).slice(0, 400) : null, uploadedAt: e.uploadedAt, sha256: e.sha, url: e.path ? photoUrl(e) : null }));
  const materials = j.changeOrders.filter((c) => c.status === "approved").map((c) => ({ what: c.reason, kind: c.kind || "parts", approved: c.amount, advanced: c.advance?.status === "paid" ? c.advance.amount : 0, invoice: c.advance?.check?.invoice || null }));
  const PAY = ["hold", "rehold", "reauthorize", "void", "capture", "refund", "pro_payout", "helper_payout", "materials_payout", "platform_fee", "retainage_held", "retainage_paid", "retainage_refunded", "tip_capture", "tip_payout"];
  const payments = L.filter((l) => PAY.includes(l.kind)).map((l) => ({ at: l.at, kind: l.kind, amount: l.amount, paypal: l.ref || null, ...(l.order ? { order: l.order } : {}), note: l.note || null }));
  const ids = { order: j.hold?.order || null, authorization: j.hold?.authorization || null, captures: (j.money?.captures || []).map((c) => c.id), payouts: (j.money?.payouts || []).map((p) => p.batchId).filter(Boolean) };
  const timeline = [...j.timeline.map((t) => ({ at: t.at, what: `${t.from ? `${t.from} -> ` : ""}${t.to}${t.note ? `: ${t.note}` : ""}` })), ...(j.visit?.history || []).map((h) => ({ at: h.at, what: `visit ${h.event}${h.slot ? `: ${when(h.slot.from)}` : ""}` }))].sort((a, b) => String(a.at).localeCompare(String(b.at)));
  const addr = [j.address?.line, j.address?.city, j.address?.state, j.address?.zip].filter(Boolean).join(", ");
  const data = { kind: "insurance", job: j.number, title: j.scope.title, status: j.status, address: { line: j.address?.line || null, city: j.address?.city, state: j.address?.state, zip: j.address?.zip }, pro: j.agreed ? { name: j.agreed.proName, id: j.agreed.pro } : null,
    lossReported: j.created, damagePhotos: damage, cause: { notes, says: "In the words of the job's records (the post, the tenant's and the pro's notes); VeriPay doesn't determine the cause." }, workDone: { items: j.scope.items, conditions: work }, receipts: receiptsIn, materials, payments, paypalIds: ids,
    totals: { paidForTheWork: money.captured - money.refunded, captured: money.captured, refunded: money.refunded, toPro: money.toPro, fee: money.fee }, timeline, paidAt: j.paidAt || null, label: INSURANCE_LABEL, notAFiling: true };
  const html = page(`${j.number}: insurance claim package (water damage)`, `<p><b>${esc(INSURANCE_LABEL)}</b></p>
<p class="muted">${esc(j.scope.title)} · ${esc(addr)} · reported ${esc(when(j.created))}${j.agreed ? ` · ${esc(j.agreed.proName)}` : ""}</p>
<h2>Damage photos</h2>${damage.length ? `<table><tr><th>Photo</th><th>Taken</th><th>By</th></tr>${damage.map((d) => `<tr><td><a href="${esc(d.url)}"><img src="${esc(d.url)}" alt="${esc(d.label || d.phase)}" style="max-width:220px;border-radius:6px"></a></td><td>${d.taken ? esc(when(d.taken)) : "no camera time"}${d.gps ? `<br><span class="muted">GPS ${d.gps.lat.toFixed(5)}, ${d.gps.lng.toFixed(5)}</span>` : ""}</td><td>${esc(d.by)}<br><span class="muted">sha256 ${esc(String(d.sha256 || "").slice(0, 16))}</span></td></tr>`).join("")}</table>` : "<p>No damage photos on the job (reference or before photos).</p>"}
<h2>Cause (from the job's notes)</h2><p class="muted">${esc(data.cause.says)}</p><ul>${notes.map((n) => `<li><b>${esc(n.from)}</b>, ${esc(when(n.at))}: ${esc(n.text)}</li>`).join("")}</ul>
<h2>Work done</h2><ul>${(j.scope.items || []).map((x) => `<li>${esc(x)}</li>`).join("")}</ul><table><tr><th>Condition</th><th>Result</th><th>After photos</th></tr>${work.map((c) => `<tr><td>${esc(c.what)}</td><td>${esc(c.verdict)}${c.reason ? `<br><span class="muted">${esc(c.reason)}</span>` : ""}</td><td>${c.after.map((p) => `<a href="${esc(p.url)}">${p.taken ? esc(when(p.taken)) : "photo"}</a>`).join("<br>")}</td></tr>`).join("")}</table>
<h2>Receipts and materials</h2>${receiptsIn.length ? `<ul>${receiptsIn.map((r) => `<li>${esc(r.name || "receipt")} (${esc(when(r.uploadedAt))})${r.text ? `: <span class="muted">${esc(r.text.split("\n").slice(0, 3).join(" "))}</span>` : ""}</li>`).join("")}</ul>` : "<p>No receipts.</p>"}${materials.length ? `<table><tr><th>Change order</th><th>Approved</th><th>Advanced</th></tr>${materials.map((m) => `<tr><td>${esc(m.what)}</td><td>${$(m.approved)}</td><td>${$(m.advanced)}</td></tr>`).join("")}</table>` : ""}
<h2>Payments (PayPal)</h2><table><tr><th>When</th><th>What</th><th>Amount</th><th>PayPal id</th></tr>${payments.map((p) => `<tr><td>${esc(when(p.at))}</td><td>${esc(p.kind.replace(/_/g, " "))}</td><td>${$(p.amount)}</td><td>${esc(p.paypal || "")}</td></tr>`).join("") || "<tr><td colspan=4>None yet.</td></tr>"}</table><p>Paid for the work: <b>${$(data.totals.paidForTheWork)}</b> (captured ${$(money.captured)}, refunded ${$(money.refunded)}). PayPal order ${esc(ids.order || "-")}, authorization ${esc(ids.authorization || "-")}.</p>
<h2>Timeline</h2><ul>${timeline.map((t) => `<li>${esc(when(t.at))}: ${esc(t.what)}</li>`).join("")}</ul>`);
  return { data, html, pdf: () => pdfOf(`${j.number} insurance claim package (water damage)`, [
    INSURANCE_LABEL, "", j.scope.title, addr, `Reported ${when(j.created)}${j.agreed ? ` | pro: ${j.agreed.proName}` : ""}`, "",
    "DAMAGE PHOTOS", ...(damage.length ? damage.map((d) => `- ${d.phase} photo, ${d.taken ? `taken ${when(d.taken)}` : "no camera time"}${d.gps ? `, GPS ${d.gps.lat.toFixed(5)}, ${d.gps.lng.toFixed(5)}` : ""}, sha256 ${String(d.sha256 || "").slice(0, 16)} (${d.by})`) : ["- none"]), "(The photos are in the HTML version of this package.)", "",
    "CAUSE (FROM THE JOB'S NOTES)", data.cause.says, ...notes.map((n) => `- ${n.from}, ${when(n.at)}: ${n.text}`), "",
    "WORK DONE", ...(j.scope.items || []).map((x) => `- ${x}`), ...work.map((c) => `- ${c.what}: ${c.verdict}${c.after.length ? ` (${c.after.length} after photo${c.after.length > 1 ? "s" : ""})` : ""}`), "",
    "RECEIPTS AND MATERIALS", ...(receiptsIn.length ? receiptsIn.map((r) => `- ${r.name || "receipt"}, ${when(r.uploadedAt)}${r.text ? `: ${r.text.split("\n").slice(0, 2).join(" ")}` : ""}`) : ["- none"]), ...materials.map((m) => `- change order: ${m.what}, approved ${$(m.approved)}${m.advanced ? `, advanced ${$(m.advanced)}` : ""}`), "",
    "PAYMENTS (PAYPAL)", ...(payments.length ? payments.map((p) => `- ${when(p.at)}: ${p.kind.replace(/_/g, " ")} ${$(p.amount)}${p.paypal ? ` (PayPal ${p.paypal})` : ""}`) : ["- none yet"]), `Paid for the work: ${$(data.totals.paidForTheWork)}. PayPal order ${ids.order || "-"}, authorization ${ids.authorization || "-"}.`, "",
    "TIMELINE", ...timeline.map((t) => `- ${when(t.at)}: ${t.what}`),
  ]) };
}
