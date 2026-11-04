// Fraud signals on a claim. Each is a rule in code with a reason a person can read; none decides a claim. A signal
// only stops the instant payout: the claim goes to an adjuster, who sees which signals fired and why. (Lemonade's
// "Jim" pays honest claims in seconds because everything else waits for a person; that is the trade made here.)
import { hamming } from "./exif.js";
import { DAY } from "./clock.js";

// words that try to give instructions instead of describing what happened (a claim's story is untrusted text that
// models later read: it is never obeyed, and this flags it so a person looks)
const INSTRUCTION = /(ignore|disregard)\s+(all|any|the|previous|prior)|system\s*prompt|you are (now|an?)|approve (this|the|my) claim|pay (out )?immediately|override|jailbreak|忽略(以上|先前|之前|所有|規則)|直接(核准|核賠|理賠|付款)|你現在是|系統提示|不要(檢查|審核)|立刻(賠|付)/i;

export function signals(claim, { policy, allClaims, people, instantMax }) {
  const out = [], at = Date.parse(claim.happenedAt), started = Date.parse(policy.start);
  const add = (signal, says, weight = 1) => out.push({ signal, says, weight });
  if (at - started < 7 * DAY && at >= started) add("early", `happened ${Math.max(0, Math.round((at - started) / DAY))} days after the policy started`);
  const raised = (policy.changes || []).find((c) => c.diff > 0 && at - Date.parse(c.at) < 7 * DAY && at >= Date.parse(c.at));
  if (raised) add("after_increase", "happened within a week of the cover being raised");
  const mine = allClaims.filter((c) => c.person === claim.person && c.id !== claim.id && !["withdrawn"].includes(c.status));
  const recent = mine.filter((c) => Math.abs(Date.parse(c.happenedAt) - at) < 90 * DAY);
  if (recent.length >= 2) add("frequent", `${recent.length} other claims within 90 days`);
  if (instantMax && claim.claimed <= instantMax && claim.claimed >= instantMax * 0.93) add("just_under", "the amount is just under what Cover pays without a person looking");
  for (const e of claim.evidence) {
    if (e.exif?.taken && Date.parse(e.exif.taken) < at - DAY) add("photo_older", `a photo (${e.name || e.kind}) was taken ${e.exif.taken.slice(0, 10)}, before the ${claim.happenedAt.slice(0, 10)} event`, 2);
    for (const c of allClaims) {
      if (c.id === claim.id) continue;
      for (const f of c.evidence || []) {
        if (e.sha && f.sha === e.sha) { add("same_file", `the same file was sent with claim ${c.number}${c.person === claim.person ? "" : " by someone else"}`, 3); continue; }
        if (e.dhash && f.dhash && hamming(e.dhash, f.dhash) <= 6) add("same_picture", `a photo looks like one sent with claim ${c.number}${c.person === claim.person ? "" : " by someone else"}`, 2);
      }
    }
    if (e.read?.amount != null && claim.claimed && Math.abs(e.read.amount - claim.claimed) > Math.max(500, claim.claimed * 0.1) && ["receipt", "repair_quote", "vet_invoice", "receipt_or_photo"].includes(e.kind)) add("amount_mismatch", `the ${e.kind.replace("_", " ")} reads ${(e.read.amount / 100).toFixed(2)}, the claim asks ${(claim.claimed / 100).toFixed(2)}`, 2);
  }
  // the graph: one PayPal or device behind more than one person
  const me = people.find((p) => p.id === claim.person);
  for (const p of people) {
    if (p.id === claim.person) continue;
    if (me?.email && p.email && p.email.toLowerCase() === me.email.toLowerCase()) add("shared_payout", "claims are paid to a PayPal another policyholder also uses", 3);
    if (claim.device && (p.devices || []).includes(claim.device)) add("shared_device", "filed from a device another policyholder also uses", 2);
  }
  if (INSTRUCTION.test(`${claim.story || ""} ${claim.evidence.map((e) => e.read?.text || "").join(" ")}`)) add("instructions", "the description or a document contains text that tries to instruct the claims system; it was not followed", 3);
  return out;
}
export const looksLikeInstructions = (s) => INSTRUCTION.test(String(s || ""));
