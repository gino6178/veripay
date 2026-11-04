// The claims engine writes its reasons in English, from the facts (claims.js, fraud.js). For a person reading in
// Chinese, each sentence is put into Chinese here by pattern, with the same numbers, dates and clause ids; a sentence
// with no pattern stays in English rather than being guessed at. Add-ons and covers are named, never shown by id.
import { PRODUCTS } from "./products/index.js";

const parts = Object.values(PRODUCTS).flatMap((p) => [...p.coverages, ...p.addons]);
// "devices" -> 3C 意外損壞加強, "own damage" -> that cover's Chinese name (without its parenthesis)
const named = (id) => { const x = parts.find((c) => c.id === String(id).replace(/ /g, "_")); return x?.zh ? x.zh.replace(/（.*）$/, "") : id; };
const R = [
  [/^the policy was in force when it happened$/, "事故發生時保單有效"],
  [/^it happened outside the policy's dates$/, "事故發生在保單期間以外"],
  [/^it happened after the policy was cancelled$/, "事故發生在退保之後"],
  [/^it happened while the policy was lapsed$/, "事故發生在保單停效期間"],
  [/^after the waiting period$/, "已過等待期"],
  [/^within the (\d+)-day waiting period \(it ends ([\d-]+)\)$/, "在 $1 天等待期內（$2 結束）"],
  [/^this needs the (\w+) add-on, which the policy doesn't have$/, (m, a) => `這需要「${named(a)}」加購保障，這張保單沒有`],
  [/^the policy has the (\w+) add-on$/, (m, a) => `保單有「${named(a)}」加購保障`],
  [/^the policy covers (.+)$/, (m, a) => `保單有這項保障（${named(a)}）`],
  [/^the policy doesn't include (.+) cover$/, (m, a) => `保單不含這項保障（${named(a)}）`],
  [/^reported (\d+) days after it happened \(over 90\)$/, "事故後 $1 天才申請（超過 90 天）"],
  [/^reported (\d+) days after it happened$/, "事故後 $1 天申請"],
  [/^a police report is attached \(its date wasn't read\)$/, "附有報案證明（未讀到日期）"],
  [/^no police report$/, "沒有報案證明"],
  [/^reported to the police on ([\d-]+)$/, "$1 已向警方報案"],
  [/^the police report is dated ([\d-]+), more than 24 hours after$/, "報案日期是 $1，超過事故後 24 小時"],
  [/^no document of a kind Cover reads$/, "沒有需要判讀的文件"],
  [/^documents read \(confidence ([\d.]+)\)$/, "文件已判讀（信心 $1）"],
  [/^the documents couldn't be read by Cover's reader, so a person checks them$/, "Cover 的模型讀不出文件內容，交給真人確認"],
  [/^this kind of claim is always decided by a person$/, "這類理賠一律由真人決定"],
  [/^(\$[\d,.]+) is over the (\$[\d,.]+) Cover pays without a person$/, "$1 超過秒賠上限 $2"],
  [/^the reader wasn't sure of the documents \(confidence ([\d.]+)\)$/, "模型對文件內容沒把握（信心 $1）"],
  [/^after the deductible nothing is due$/, "扣掉自負額後沒有可賠的金額"],
  [/^every check passed$/, "每一項檢查都通過"],
  [/^fraud signals: (.+)$/, (m, x) => `需要真人確認：${x.split("; ").map(tr).join("；")}`],
  [/^happened (\d+) days after the policy started$/, "保單生效後 $1 天就出事"],
  [/^happened within a week of the cover being raised$/, "調高保額後一週內就出事"],
  [/^(\d+) other claims within 90 days$/, "90 天內還有 $1 件其他理賠"],
  [/^the amount is just under what Cover pays without a person( looking)?$/,"金額剛好卡在秒賠上限下面"],
  [/^a photo \((.+)\) was taken ([\d-]+), before the ([\d-]+) event$/, "照片（$1）拍攝於 $2，早於 $3 的事故"],
  [/^the same file was sent with claim (\S+) by someone else$/, "另一位保戶的理賠 $1 用過同一個檔案"],
  [/^the same file was sent with claim (\S+)$/, "你的理賠 $1 用過同一個檔案"],
  [/^a photo looks like one sent with claim (\S+) by someone else$/, "照片和另一位保戶的理賠 $1 的照片很像"],
  [/^a photo looks like one sent with claim (\S+)$/, "照片和你的理賠 $1 的照片很像"],
  [/^the (.+) reads ([\d.]+), the claim asks ([\d.]+)$/, "文件上的金額是 $2，申請的是 $3"],
  [/^claims are paid to a PayPal another policyholder also uses$/, "理賠收款的 PayPal 也被另一位保戶使用"],
  [/^filed from a device another policyholder also uses$/, "從另一位保戶也用過的裝置送出"],
  [/^the description or a document contains text that tries to instruct the claims system; it was not followed$/, "描述或文件裡有試圖指揮理賠系統的文字（沒有照做）"],
  [/^the amount claimed$/, "申請金額"],
  [/^the documents read (\$[\d,.]+); the lower of that and the claim is used$/, "文件上是 $1，取它和申請金額較低的"],
  [/^(.+): over \$1,500 and not listed, paid up to \$1,500 each$/, "$1：單件超過 1,500 美元且未逐項加保，每件最高賠 1,500 美元"],
  [/^the (\w+) cover has (\$[\d,.]+) left this year$/, (m, a, b) => `「${named(a)}」今年只剩 ${b}`],
  [/^your (\d+)% share$/, "你自付 $1%"],
  [/^the deductible$/, "自負額"],
  [/^the add-on's (\$[\d,.]+) deductible$/, "加購保障的自負額 $1"],
  [/^the (\$[\d,.]+) deductible$/, "自負額 $1"],
  // travel: the parametric flight checks (claims.js parametric)
  [/^the policy was in force for this flight$/, "這班飛機在保單期間內"],
  [/^the flight was (?:it happened )?(.+)$/, (m, x) => `這班飛機${tr(`it happened ${x}`).replace(/^事故發生/, "")}`],
  [/^(\S+) on ([\d-]+) is an insured flight on this policy$/, "$2 的 $1 是這張保單保的航班"],
  [/^the disruption was known \((.+)\) before the policy was bought$/, "投保前（$1）就已經知道延誤或取消"],
  [/^the disruption wasn't known when the policy was bought$/, "投保時還不知道會延誤或取消"],
  [/^the airline cancelled the flight$/, "航空公司取消了這班飛機"],
  [/^departed (\d+) h (\d+) min late \((.+)\)$/, "晚了 $1 小時 $2 分起飛（$3）"],
  [/^(\$[\d,.]+) paid on this trip so far; the cap is (\$[\d,.]+)$/, "這趟已付 $1，上限 $2"],
  [/^the trip's cap of (\$[\d,.]+) is reached$/, "已達這趟的上限 $1"],
  [/^(\$[\d,.]+) for each of (\d+) travelers?$/, "每位旅客 $1，共 $2 位"],
  [/^the trip's cap$/, "這趟的上限"],
];
export function tr(s) {
  if (typeof s !== "string") return s;
  for (const [re, to] of R) if (re.test(s)) return s.replace(re, to);
  if (s.includes("; ")) return s.split("; ").map(tr).join("；");
  return s;
}
