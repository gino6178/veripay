# VeriPay 影片分鏡 v7（已確認 2026-11-07）

**你的決定：** 開頭配旁白；動畫原本的配樂保留；片頭放 2 秒封面；全片統一 1.5 倍語速；鏡 10 改成新數字（GPU 約 0.3 秒）。
因為放了封面，全片多 2 秒，約 2:37.7。動畫配樂保留，所以鏡 1 這 13.4 秒全片 BGM 不進來，從鏡 2 起才接。

v6 的全部內容都留著（鏡 1 痛點動畫、鏡 2–13 的 v5 畫面與旁白），只做三件事：

1. **旁白語速 1.5 倍**：每一鏡跟著旁白縮短，時間 ≈ 原本 ÷ 1.5。鏡 1 的痛點動畫本身不加速（照原樣播完 13.4 秒），只有旁白變快。片尾卡維持 3.8 秒。
2. **依評分五項補內容**：新增 4 鏡（2a、8a、11a、12a），鏡 2 加一句「給誰用」，片尾卡加 repo 網址。
3. **更正過時的事實**（不是刪內容）：鏡 10 的「在 CPU 上約 3 秒」改成現在 L4 上實測的「約 0.3 秒」。

- **全片長度：** 2:35.7（v6 是 2:43.5），離 3:00 上限還有 24 秒，萬一 1.5 倍語速念出來比估的長也塞得下。
- **估算方式：** 1.5 倍語速約每秒 3.75 個英文字，每句多留 0.7 秒呼吸；實際以產生的語音長度為準，再微調。
- **確認後才動工：** 確認這份之後，才產生新旁白、截新畫面、渲染。

## 五項評分各在哪幾鏡

評分是五項同權重（規章第 6 條）。每一項至少有一鏡正面回答：

| 評分項 | 評審要看到什麼 | 對應的鏡 |
|---|---|---|
| 技術實作 | PayPal 和 AI 用得多深、真的能動 | 5、8、10、11，**新 11a**（219／188／91） |
| 設計 | 完整產品，不只是技術展示 | 3–8 整條流程，**新 12a**（28 頁、五種角色） |
| 潛在影響 | 真實的問題、真實的人，有數據 | 1（$1,405、59%），**新 2a**（市場與受害數據），鏡 2 加「給誰用」 |
| 創新 | 和現有東西差在哪 | 3b、4（代理人議價），**新 8a**（四個別處沒有的點） |
| 簡報 | 從頭到尾演一遍；問題、對象、為什麼重要 | 全片順序：問題 → 對象 → 解法 → 實機流程 → 為什麼重要 → 片尾試用方式 |

## 全片時間軸

| 鏡 | 時間 | 長度 | 內容 | 和 v6 比 |
|---|---|---|---|---|
| 1 | 0:00.0–0:13.4 | 13.4 | 痛點動畫：Maria 先付錢被跑了 → Luis 先做完收不到錢 | 動畫不變，旁白 1.5 倍 |
| 2 | 0:13.4–0:20.7 | 7.3 | 解法 + 為什麼用 PayPal | 1.5 倍；**加一句給誰用** |
| **2a** | 0:20.7–0:30.7 | 10.0 | **潛在影響：市場與受害數據** | **新** |
| 3 | 0:30.7–0:35.3 | 4.6 | Maria 用自己的話發案 → 工單 | 1.5 倍 |
| 3b | 0:35.3–0:42.9 | 7.6 | 找師傅、看評價、議價、行情 | 1.5 倍 |
| 4 | 0:42.9–0:49.6 | 6.7 | 報價、還價、授權上限 | 1.5 倍 |
| 4b | 0:49.6–0:55.7 | 6.1 | 在聊天軟體裡也能用 | 1.5 倍 |
| 5 | 0:55.7–1:05.0 | 9.3 | PayPal 凍結 + 變更單 + PIN | 1.5 倍 |
| 6 | 1:05.0–1:08.1 | 3.1 | 師傅的手機 | 1.5 倍 |
| 7 | 1:08.1–1:16.8 | 8.7 | AI 檢查 + 藏在備註裡的指令 | 1.5 倍 |
| 8 | 1:16.8–1:23.5 | 6.7 | 放款 | 1.5 倍 |
| **8a** | 1:23.5–1:33.5 | 10.0 | **創新：別處找不到的四件事** | **新** |
| 9 | 1:33.5–1:41.1 | 7.6 | 架構 | 1.5 倍 |
| 10 | 1:41.1–1:52.0 | 10.9 | 模型設計 | 1.5 倍；**更正延遲** |
| 11 | 1:52.0–1:59.0 | 7.0 | 底層全是 PayPal | 1.5 倍 |
| **11a** | 1:59.0–2:09.0 | 10.0 | **技術實作：219 項 PayPal 功能** | **新** |
| 12 | 2:09.0–2:18.3 | 9.3 | 規模、後台、測試 | 1.5 倍 |
| **12a** | 2:18.3–2:27.0 | 8.7 | **設計：完整產品，28 頁五種角色** | **新** |
| 12b | 2:27.0–2:31.9 | 4.9 | 願景（還沒做） | 1.5 倍 |
| 13 | 2:31.9–2:35.7 | 3.8 | 片尾卡 | **加 repo 網址與試用方式** |

---

## 旁白全文（英文照念；原有的一字不改，改動處標出）

| 鏡 | 旁白 |
|---|---|
| 1 | "Maria paid the plumber up front. He took the cash, and her faucet still drips." ／ "Luis fixed a leak first. The client said 'later,' and he's still waiting to get paid." |
| 2 | "VeriPay: PayPal holds the money without charging it, AI checks the work, and the pro is paid the moment it passes." **＋新：** "Built for homeowners and the small pros they hire." |
| **2a 新** | "Home repair is a 525-billion-dollar-a-year market, run mostly by 1.9 million one-person trade businesses. 69 percent of people targeted by a repair scam lose money, and PayPal already has 440 million accounts on both sides." |
| 3 | "Maria asks in her own words. Our model writes the definition of done, with a typical price range." |
| 3b | "Her agent finds the pros nearby and reads their reviews. The agents bargain in rounds, and VeriPay shows where each price sits in the market, and warns her when a deal isn't coming together." |
| 4 | "Eastside's agent comes down to $185, and hers hires inside a signed mandate capped at $200. A lower cap, or a replay, is refused." |
| 4b | "No new app needed: from a chat, she can post a job, compare offers and bargain. Hiring still comes back to VeriPay, and her PIN." |
| 5 | "PayPal authorizes $200: held, not charged. On site, a $47.05 valve is over her agent's limit, so only Maria's PIN can approve it, and PayPal re-holds $247.05 on her saved card." |
| 6 | "The plumber sends photos and the receipt from his phone." |
| 7 | "Our models read the photos and the receipt; code checks when and where each was taken. A note hiding an instruction is flagged, and the money waits for a person." |
| 8 | "Every check passed: code captures exactly $232.05, one Payouts batch pays the pro, and an agent reconciles both with PayPal." |
| **8a 新** | "What we did not find anywhere else: an open agent-to-agent platform for local work. Agents do it all by default, bargain in rounds, and AI checks every payment step, while only code moves the money." |
| 9 | "Any agent can drive it, over MCP, A2A or REST. But every money move passes one guard in our code: limits, PIN, signed mandates. The money itself runs on PayPal." |
| 10 | "We fine-tuned 0.6-billion-parameter models from a 30-billion open teacher. Code writes every label; the teacher only the wording. On held-out tests, the audit model gets 99.9% of verdicts right, and it runs ~~on a CPU in about three seconds~~ **on one GPU in about a third of a second**." |
| 11 | "Under the hood it's all PayPal: Orders authorizes, the Vault re-holds, a partial capture takes what's due, Payouts pays the pro, and the Agent Toolkit reconciles." |
| **11a 新** | "In all, we tracked 219 PayPal features one by one: 188 are built, and 91 are verified in the real sandbox, from Orders and the Vault to Invoicing, Subscriptions, Disputes and PayPal's own MCP server." |
| 12 | "It scales to materials, Pay Later, landlords and neighbors, with an AG Grid back office. AI agents tested it in forty-five runs over eleven rounds; every blocker was fixed." |
| **12a 新** | "And it's a complete product: 28 pages for five roles, from the customer's agent and the pro's phone, in English or Spanish, to landlords, inspectors and the back office." |
| 12b | "Next, our vision: Log in with PayPal, live payouts to every pro, and any job a photo can prove." |
| 13 | "VeriPay. The money waits for the proof." |

---

## 新增的鏡

### 鏡 2a　0:20.7–0:30.7　潛在影響（10.0 秒）

**畫面：** 白底 PayPal 藍，四個數字依序出現並往上跳到定值（和網站首頁同一種數字動畫），每個數字下方小字附出處。全部出自 `docs/IMPACT.md`。

| 時間 | 數字 | 說明 | 出處小字 |
|---|---|---|---|
| 0.0–2.6 | **$525B** | a year on US home improvement and repair | Harvard JCHS |
| 2.6–5.0 | **1.9M** | one-person trade businesses | NAHB 2025 |
| 5.0–7.4 | **69.1%** | of people targeted by a repair scam lost money | BBB 2025 |
| 7.4–10.0 | **440M** | PayPal accounts, on both sides of the job | PayPal Q3 2026 |

### 鏡 8a　1:23.5–1:33.5　創新（10.0 秒）

**畫面：** 四格依序點亮，每格一個圖示、一行字，下面配網站真實畫面的小窗：

1. **Open A2A platform** · 小窗：`/.well-known/agent-card.json` 和 Connect 頁「Bring any AI agent」
2. **Agent-only by default** · 小窗：Maria 只按了一次 Confirm 的聊天畫面
3. **Negotiation layer** · 小窗：報價頁的價格區間圖和還價過程
4. **AI at every payment step** · 小窗：一條時間線，凍結（風險模型）→ 變更單（OCR）→ 放款（視覺＋審核模型），最後一格「code moves the money」

右下小字："Not found in Angi, Thumbtack, TaskRabbit, Upwork or Escrow.com (docs/IMPACT.md)"

### 鏡 11a　1:59.0–2:09.0　技術實作（10.0 秒）

**畫面：** 三個大數字從 0 跳到定值：**219** features evaluated → **188** built → **91** verified in the sandbox（綠色）。數字下方排一圈 PayPal 產品名，隨旁白依序亮起：Orders · Payments · Vault · Payouts · Invoicing · Payment Links · Subscriptions · Disputes · Webhooks · Partner Referrals · Risk · Log in with PayPal · JS SDK v6 · Agent Toolkit · PayPal MCP。

右下小字："Item-by-item status: docs/PAYPAL-整合總表.md"

### 鏡 12a　2:18.3–2:27.0　設計（8.7 秒）

**畫面：** 網站真實畫面快速切換，每張約 1.4 秒，左上角標角色：

1. Customer：Agent 頁（右側工作面板）
2. Pro：手機上的工作流程，切到西班牙文
3. Landlord：Tenancy 頁
4. Inspector／Arbiter：爭議裁決頁
5. Back office：AG Grid 後台
6. Judges：/demo 頁的圖示列

### 鏡 13 片尾卡（3.8 秒，改）

原本的 "VeriPay. The money waits for the proof." 不變，下方加兩行小字：
- `github.com/gino6178/veripay`
- "Try it: Demo → Judge tour"

---

## 鏡 1 痛點動畫（照 v6）

畫面、聲音、字幕、兩張數據字卡（$1,405、59%）、轉場都照 v6。唯一的差別是旁白 1.5 倍後比較短：旁白 1 約在 0.6–3.6 秒，旁白 2 約在 7.0–10.0 秒，字幕跟著旁白。

## v6 留下來要你決定的（沿用建議）

1. **鏡 1 旁白：** 照上面念兩句（建議），還是只放字幕和字卡？
2. **動畫原本的聲音：** 關掉，全片 BGM 加音效重配（建議），還是保留原配樂？
3. **封面：** 片頭不放封面（建議），封面只當 YouTube 縮圖和 Devpost 封面。

## 這版新增要你決定的

4. **1.5 倍語速：** 全片統一 1.5 倍（照你說的），還是新增的 4 鏡也用 1.5 倍、舊的用 1.4 倍，讓舊鏡畫面多留一點時間？全片 1.4 倍約 2:42，一樣塞得下。
5. **鏡 10 的更正：** 把「在 CPU 上約 3 秒」改成現在 GPU 上的「約 0.3 秒」（建議），還是保留原句？

---

## 製作後的修正（2026-11-08，獨立審查之後）

成片做完後請一個沒參與製作的 agent 從頭審過一次，依它的意見改了這些：

| 問題 | 改法 |
|---|---|
| 鏡 11a 說「91 項已驗證，包括 Subscriptions、Disputes」，但這兩項只有部分實測 | 旁白改成 "…including Orders, the Vault, Payouts, Invoicing and PayPal's own MCP server"（都是 sandbox 實測通過的） |
| 鏡 11a 的產品標籤亮了 Log in with PayPal，但鏡 12b 說它還沒做 | 拿掉這個標籤 |
| 片尾字幕蓋住 repo 網址 | 片尾不放字幕，片尾卡放慢到約 5.2 秒 |
| 鏡 2a「1.9 million one-person businesses run the market」超出出處（它們只占 9% 營收） | 旁白改成 "where four in five trade businesses are one-person shops"，字卡改成 79% |
| 鏡 3b 出現兩家真實店家名稱和地址 | 名稱和地址加模糊 |
| 鏡 12a 角色標籤蓋住頁面標題、每頁太短 | 標籤移到左上角；全鏡加長到 9 秒 |
| 兩張數據字卡停留太短 | 各停約 2 秒 |
| 開頭旁白比後面小聲約 2.5 dB | 開頭旁白音量提高 2 dB |
| 鏡 8a 的說法沒有出處 | 加小字 "Compared with the leading home-services and freelance marketplaces · sources in docs/IMPACT.md"（不點名品牌） |
| docs/MODELS.md 還寫 CPU 2.9 秒 | 開頭加「現在的服務」一段：L4、約 0.3 秒 |

全片 2:37.5，響度 −16 LUFS。
