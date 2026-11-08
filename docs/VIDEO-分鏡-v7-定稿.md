# VeriPay 影片分鏡 v7 定稿

和成片一致的版本（`video/out/veripay-v7-final.mp4`）。時間從 Remotion 時間軸（`video/src/v7/timeline7.ts`）直接算出，旁白是實際念的句子。

- **全長：** 2:46.4（Devpost 上限 3:00，還有 13.6 秒）
- **語速：** 旁白比 v5 快 1.4 倍，v5 的畫面也一起快 1.4 倍，動畫和旁白保持同步；封面、痛點動畫、新鏡照原速
- **聲音：** 旁白（Kokoro af_heart，和前幾版同一個聲音）；痛點動畫保留它原本的配樂，旁白時壓低；從鏡 2 起接全片背景音樂，旁白時壓低；音效沿用 v5（Freesound CC0）
- **響度：** −16 LUFS，峰值 −1.6 dBFS
- **另一版：** `veripay-v7-nobgm-final.mp4` 沒有全片背景音樂（痛點動畫自己的配樂還在）
- **片中不出現任何模型名稱**；兩家真實店家的名稱和地址已模糊

## 五項評分在哪幾鏡

| 評分項 | 對應的鏡 |
|---|---|
| 技術實作 | 5 凍結、7 AI 檢查、8 放款、10 模型、11 底層 PayPal、**11a 219／188／91** |
| 設計 | 3–8 整條實機流程、**12a 五種角色的真實頁面** |
| 潛在影響 | 1 痛點動畫＋兩張數據卡、**2a 市場與受害數據**、2「給誰用」 |
| 創新 | 3b、4 代理人議價、**8a 別處找不到的四件事** |
| 簡報 | 全片順序：問題 → 對象 → 解法 → 實機流程 → 為什麼重要 → 片尾試用方式 |

## 時間軸

| 鏡 | 時間 | 長度 | 畫面 | 速度 |
|---|---|---|---|---|
| 封面 | 0:00.0–0:02.0 | 2.0 | VeriPay 封面，PAID 章蓋下 | 原速 |
| 1 | 0:02.0–0:15.4 | 13.4 | 痛點動畫：Maria 先付錢被跑了 → Luis 先做完收不到錢；兩張數據卡 | 原速 |
| 2 | 0:15.4–0:22.7 | 7.3 | 解法：PayPal 凍結、AI 檢查、檢查通過就付款 | 1.06 倍 |
| **2a** | 0:22.7–0:33.9 | 11.2 | **新：四個數字卡** | 原速 |
| 3 | 0:33.9–0:38.9 | 5.0 | Maria 用自己的話發案 → 工單和行情 | 1.4 倍 |
| 3b | 0:38.9–0:47.0 | 8.1 | 附近師傅、評價、議價、行情條、談不攏的警告 | 1.4 倍 |
| 4 | 0:47.0–0:54.1 | 7.1 | 報價、還價、簽章授權上限 $200 | 1.4 倍 |
| 4b | 0:54.1–1:00.7 | 6.5 | 在聊天軟體裡發案、比價、議價 | 1.4 倍 |
| 5 | 1:00.7–1:10.7 | 10.0 | PayPal 凍結 $200 → 追加 $47.05 → PIN → 重新凍結 $247.05 | 1.4 倍 |
| 6 | 1:10.7–1:14.1 | 3.4 | 師傅的手機：照片和收據 | 1.4 倍 |
| 7 | 1:14.1–1:23.4 | 9.3 | 模型讀照片和收據；藏在備註裡的指令被抓出來 | 1.4 倍 |
| 8 | 1:23.4–1:30.6 | 7.2 | 放款：收 $232.05、Payouts 付給師傅、PAID 章 | 1.4 倍 |
| **8a** | 1:30.6–1:39.4 | 8.9 | **新：四格「別處找不到的」** | 原速 |
| 9 | 1:39.4–1:47.6 | 8.1 | 架構圖：任何代理人都能接，錢只過一道程式關卡 | 1.4 倍 |
| 10 | 1:47.6–1:59.2 | 11.6 | 模型設計：30B 開源老師 → 0.6B 學生 → Q8 · 639 MB → L4 GPU；99.9%、0.4%、100%、0.51% | 1.4 倍 |
| 11 | 1:59.2–2:06.7 | 7.5 | 底層全是 PayPal 的 API 軌道 | 1.4 倍 |
| **11a** | 2:06.7–2:17.0 | 10.3 | **新：219／188／91＋產品標籤** | 原速 |
| 12 | 2:17.0–2:26.9 | 9.9 | 規模：材料款、Pay Later、房東、鄰居團購、AG Grid 後台、測試牆 | 1.4 倍 |
| **12a** | 2:26.9–2:35.9 | 9.0 | **新：六張真實頁面快切** | 原速 |
| 12b | 2:35.9–2:41.2 | 5.2 | 願景（還沒做，畫面有標示） | 1.4 倍 |
| 13 | 2:41.2–2:46.4 | 5.2 | 片尾卡：VeriPay、The money waits for the proof、github.com/gino6178/veripay、Try it: Demo → Judge tour | 放慢到 0.72 倍 |

---

## 每鏡細節

### 封面　0:00–0:02
VeriPay 封面圖，PAID 章在 1 秒時蓋下（蓋章音效）。沒有旁白。

### 鏡 1　0:02–0:15.4　痛點動畫
動畫照原樣播，配樂保留，旁白時壓低。

| 旁白 | 字幕 |
|---|---|
| "Maria paid the plumber up front. He took the cash, and her faucet still drips." | 分兩句跟著旁白 |
| "Luis fixed a leak first. The client said "later," and he's still waiting to get paid." | 分兩句跟著旁白 |

數據卡（右下，各停約 2 秒）：
- **$1,405** median loss to a home-improvement scam · BBB Scam Tracker Risk Report 2025
- **59%** of small businesses have invoices 30+ days overdue · Intuit QuickBooks, 2026

### 鏡 2　0:15.4–0:22.7　解法＋給誰用
> "VeriPay: PayPal holds the money without charging it, AI checks the work, and the pro is paid the moment it passes. Built for homeowners and the small pros they hire."

### 鏡 2a　0:22.7–0:33.9　潛在影響（新）
標題 "A real problem, at real scale."，四張卡跟著旁白依序出現、數字往上跳：

| 數字 | 說明 | 出處 |
|---|---|---|
| $525B | a year on US home improvement and repair | Harvard JCHS |
| 79% | of specialty trade businesses are one-person shops | NAHB, 2025 |
| 69.1% | of people targeted by a repair scam lost money | BBB Scam Tracker, 2025 |
| 440M | PayPal accounts, on both sides of the job | PayPal Q3 2026 |

> "Home repair is a $525 billion a year market, where four in five trade businesses are one-person shops. 69 percent of people targeted by a repair scam lose money, and PayPal already has 440 million accounts on both sides."

### 鏡 3　0:33.9–0:38.9　她的話 → 工單
> "Maria asks in her own words. Our model writes the definition of done, with a typical price range."

### 鏡 3b　0:38.9–0:47.0　找師傅、議價
> "Her agent finds the pros nearby and reads their reviews. The agents bargain in rounds, and VeriPay shows where each price sits in the market, and warns her when a deal isn't coming together."

「Pros near you」卡片最後兩列是真實的 Austin 店家（不在 VeriPay 上），名稱和地址加了模糊。

### 鏡 4　0:47.0–0:54.1　報價、授權上限
> "Eastside's agent comes down to $185, and hers hires inside a signed mandate capped at $200. A lower cap, or a replay, is refused."

### 鏡 4b　0:54.1–1:00.7　在聊天軟體裡
> "No new app needed: from a chat, she can post a job, compare offers and bargain. Hiring still comes back to VeriPay, and her PIN."

### 鏡 5　1:00.7–1:10.7　凍結、追加、PIN
> "PayPal authorizes $200: held, not charged. On site, a $47.05 valve is over her agent's limit, so only Maria's PIN can approve it, and PayPal re-holds $247.05 on her saved card."

### 鏡 6　1:10.7–1:14.1　師傅的手機
> "The plumber sends photos and the receipt from his phone."

### 鏡 7　1:14.1–1:23.4　AI 檢查
> "Our models read the photos and the receipt; code checks when and where each was taken. A note hiding an instruction is flagged, and the money waits for a person."

### 鏡 8　1:23.4–1:30.6　放款
> "Every check passed: code captures exactly $232.05, one Payouts batch pays the pro, and an agent reconciles both with PayPal."

### 鏡 8a　1:30.6–1:39.4　創新（新）
標題 "What we didn't find anywhere else."，四格跟著旁白依序點亮，每格上方是網站真實畫面：
1. **Open agent-to-agent platform**：Any agent joins over A2A or MCP. VeriPay is not the only agent here.
2. **Agent-only by default**：One sentence and one confirm. The agent does the rest, inside limits only the person sets.
3. **A negotiation layer**：Price, time and extras bargained agent to agent, never over the ceiling.
4. **AI at every payment step**：Risk sizes the hold, OCR matches the receipt, vision and audit release it. Code moves the money.

左下小字：Compared with the leading home-services and freelance marketplaces · sources in docs/IMPACT.md

> "What we did not find anywhere else: an open agent-to-agent platform for local work. Agents do it all by default, bargain in rounds, and AI checks every payment step, while only code moves the money."

### 鏡 9　1:39.4–1:47.6　架構
> "Any agent can drive it, over MCP, A2A or REST. But every money move passes one guard in our code: limits, PIN, signed mandates. The money itself runs on PayPal."

### 鏡 10　1:47.6–1:59.2　模型設計
流程圖：30B open teacher（只寫措辭）＋ labels from CODE → 0.6B student + LoRA r16 → GGUF Q8 · 639 MB → done-chat · done-audit（served on one L4 GPU）。數字：99.9% 判對、0.4% 攻擊得逞（~0.3 s per audit on the L4 GPU）、100% 議價步驟在上限內、0.51% OCR 字元錯誤率。

> "We fine-tuned 0.6-billion-parameter models from a 30-billion open teacher. Code writes every label; the teacher only the wording. On held-out tests, the audit model gets 99.9% of verdicts right, and it runs on one GPU in about a third of a second."

### 鏡 11　1:59.2–2:06.7　底層全是 PayPal
> "Under the hood it's all PayPal: Orders authorizes, the Vault re-holds, a partial capture takes what's due, Payouts pays the pro, and the Agent Toolkit reconciles."

### 鏡 11a　2:06.7–2:17.0　219 項 PayPal 功能（新）
三個大數字往上跳：**219** PayPal features evaluated、**188** built in code、**91** verified in the real sandbox（綠色）。下方 14 個 PayPal 產品標籤依序亮起：Orders · Payments · Vault · Payouts · Invoicing · Payment Links · Subscriptions · Disputes · Webhooks · Partner Referrals · Risk · JS SDK v6 · Agent Toolkit · PayPal MCP。左下小字：docs/PAYPAL-整合總表.md · docs/PAYPAL-候選清單.md。

> "In all, we tracked 219 PayPal features one by one: 188 are built, and 91 are verified in the real sandbox, including Orders, the Vault, Payouts, Invoicing and PayPal's own MCP server."

### 鏡 12　2:17.0–2:26.9　規模、後台、測試
> "It scales to materials, Pay Later, landlords and neighbors, with an AG Grid back office. AI agents tested it in forty-five runs over eleven rounds; every blocker was fixed."

### 鏡 12a　2:26.9–2:35.9　完整產品（新）
六張網站真實畫面，每張 1.5 秒，左上角標角色，右上角「n / 6 · 28 pages」：
1. Customer · the agent, with the job beside it（Agent 頁＋右側工作面板）
2. Pro · on a phone, in Spanish（手機框，西班牙文介面）
3. Landlord · tenants and limits
4. Dispute · settled on the evidence
5. Back office · every hold and payout
6. Judges · every step, one click away（/demo 頁的圖示列）

> "And it's a complete product: 28 pages for five roles, from the customer's agent and the pro's phone, in English or Spanish, to landlords, inspectors and the back office."

### 鏡 12b　2:35.9–2:41.2　願景（還沒做）
> "Next, our vision: Log in with PayPal, live payouts to every pro, and any job a photo can prove."

### 鏡 13　2:41.2–2:46.4　片尾卡
VeriPay 字標、"The money waits for the proof."、PayPal 用到的 API 一行、AI 一行（done-chat · done-audit (0.6B, fine-tuned) · Done-OCR · Done-Risk · done-vlm (open 500M vision model) · signed mandates · MCP · A2A）、最下方 **github.com/gino6178/veripay** 和 "Try it: Demo → Judge tour"。旁白 "VeriPay. The money waits for the proof."，這鏡不放字幕，避免蓋住網址。
