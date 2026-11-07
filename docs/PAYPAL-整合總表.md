# VeriPay × PayPal 整合總表

更新：2026-11-07。依程式碼（`api/src/pay/paypal.js` 等）和 sandbox 紀錄整理。

**狀態的意思**
- **sandbox 實測**：用真的 PayPal sandbox 打過，並得到預期結果。依據是 `docs/live-test/sandbox/runs.json` 的跑次，或 `docs/API.md` 各輪寫的實測結果。
- **部分實測**：API 打得通，但整條流程在 sandbox 走不完，原因寫在旁邊。
- **只在模擬**：只在 VeriPay 的 PayPal 模擬模式（stand-in）跑過。
- **sandbox 拒絕**：程式做好了，但 PayPal sandbox 不支援。

## 1. 收款：Orders v2 與 Payments v2

| # | 功能 | PayPal API | 在 VeriPay 做什麼 | 狀態 |
|---|---|---|---|---|
| 1 | 凍結款（授權，不扣款） | Orders `intent: AUTHORIZE` | 雇用師傅時先凍結「價格＋緩衝」 | sandbox 實測（run 1、3–13） |
| 2 | 分段收款 | authorizations capture，`final_capture=false` | 每個里程碑通過檢查才收那一段 | sandbox 實測（run 5、10） |
| 3 | 用已存的卡或 PayPal 重新凍結 | Orders，帶 `vault_id`，商家發起 | 追加費用超過緩衝時重新凍結 | sandbox 實測（run 3、7） |
| 4 | 延長授權 | authorizations reauthorize | 授權快到期時延長 | 部分實測：在 3 天內延長被 PayPal 拒絕（`REAUTHORIZATION_TOO_SOON`，和文件一致），程式改成重新凍結（run 1） |
| 5 | 取消凍結 | authorizations void | 取消工作時放掉凍結款 | sandbox 實測（run 1） |
| 6 | 退款（全額或部分） | captures refund | 爭議調解、瑕疵退款 | sandbox 實測（run 1、5） |
| 6a | 以師傅的名義退款，抽成一起退 | refund 加 header `PayPal-Auth-Assertion` 與 `platform_fees` | 開通商家帳號的師傅，收款後遇到退款或爭議 | 只在模擬：要有開通完成的師傅；sandbox 對假 ID 回 401 |
| 7 | 3-D Secure | 訂單的 `verification.method` 設 SCA | 刷卡時讓發卡行驗證持卡人 | 部分實測：sandbox 給出驗證頁，但驗證本身沒走完 |
| 8 | 發卡行的 AVS／CVV 回覆 | authorization 的 `processor_response` | 工作頁顯示「Card bank said」 | sandbox 實測（測試卡：CVV 回 M，AVS 空白） |
| 9 | 風險背景資料 | Risk API Set Transaction Context ＋ header `PayPal-Client-Metadata-Id` | 凍結前把付款人、收款人和高風險標記送給 PayPal | sandbox 實測（回 200） |
| 10 | 合作夥伴代碼 | header `PayPal-Partner-Attribution-Id` | 每次呼叫都帶上 | sandbox 實測；目前用的是暫代代碼，等 PayPal 發正式的 |
| 11 | 物流追蹤 | Orders 的 trackers | 師傅填追蹤單號，PayPal 通知買家 | 已整合，sandbox 沒有單獨紀錄 |
| 11a | 凍結款明細 | purchase_units 的 `items` ＋ `amount.breakdown.item_total`；改緩衝時 PATCH 一起改 | PayPal 核准頁和收據分開列工錢、零件、追加費用緩衝 | sandbox 實測（三行明細建立成功；PATCH 改成兩行也成功） |
| 11b | 卡片 Level 2 資料 | `supplementary_data.card.level_2`（invoice_id、tax_total） | 刷卡凍結時附上單號，稅額 0 | sandbox 實測（PayPal 回傳同樣的資料，授權 CREATED，之後已取消） |
| 11c | 手機直接跳 PayPal App | `experience_context.app_switch_preference` | 手機上核准凍結款時開 PayPal App | 部分實測：訂單接受了；實際跳 App 要手機和買家帳號 |
| 11d | 客戶在 PayPal 更新聯絡資料 | `experience_context.contact_preference: UPDATE_CONTACT_INFO` | 核准後把客戶確認的 email、電話帶回，師傅用這支電話聯絡 | 部分實測：訂單接受了；帶回聯絡資料要買家核准 |

## 2. 網頁付款：JS SDK v6

| # | 功能 | PayPal 元件 | 在 VeriPay 做什麼 | 狀態 |
|---|---|---|---|---|
| 12 | PayPal 按鈕 | `paypal-payments` | 第一次凍結款，不離開頁面就能核准 | 部分實測：按鈕會出現，但核准需要 sandbox 買家帳號 |
| 13 | Pay Later 按鈕與分期訊息 | `paylater`、messages | $300 以上的凍結款顯示分期，例如「Starting at $42.99/mo」 | 分期訊息 sandbox 實測；按鈕要不要出現由 PayPal 判斷 |
| 14 | Venmo 按鈕 | `venmo-payments` | 符合資格的買家可以用 Venmo | PayPal 判定資格，未驗證 |
| 15 | PayPal 代管的刷卡欄位 | `card-fields` | 卡號只送到 PayPal，不經過 VeriPay | 部分實測：4 個欄位都畫出來了，但沒有實際送出一張卡 |
| 16 | Google Pay | `googlepay-payments` | 透過 PayPal 用 Google Pay 凍結 | 部分實測：PayPal 判定可用，訂單也建好了，但沒有實際付款 |
| 17 | Fastlane 訪客結帳 | `fastlane` | 沒有 PayPal 帳號的客戶快速結帳 | 部分實測：PayPal 判定可用，沒有實際付款 |
| 18 | 回頭客 | client token 帶 `target_customer_id` | 按鈕直接顯示客戶存過的 PayPal 帳號 | sandbox 實測（token 產生成功） |

## 3. 存付款方式：Vault v3

| # | 功能 | PayPal API | 在 VeriPay 做什麼 | 狀態 |
|---|---|---|---|---|
| 19 | 付款時順便存 | `store_in_vault: ON_SUCCESS` | 之後的凍結款和客戶的 AI 代理都不必再核准 | sandbox 實測（run 1） |
| 19a | 不付款先存 PayPal | setup-tokens → payment-tokens | 「Save PayPal now」：AI 代理第一次雇人不用等核准 | 部分實測：setup token 回 201，核准要買家帳號 |
| 20a | 存 Venmo | `payment_source.venmo` ＋ `store_in_vault` | 用 Venmo 核准凍結款，之後的凍結款直接用存好的 Venmo | 部分實測：訂單接受了（PAYER_ACTION_REQUIRED）；PayPal 不給 Venmo 訂單轉址連結，只能在手機上按 Venmo 按鈕核准 |
| 20 | 查看與刪除已存的付款方式 | payment-tokens 的 GET、DELETE | 「Saved payment method」，刪除要 PIN | sandbox 實測；用客戶 ID 列出全部時回 0 筆 |

## 4. 付錢給師傅：Payouts

| # | 功能 | PayPal API | 在 VeriPay 做什麼 | 狀態 |
|---|---|---|---|---|
| 21 | 批次付款（師傅＋助手） | Payouts batch | 檢查通過就付款 | sandbox 實測（run 9–13，batch 狀態 SUCCESS） |
| 21a | 付到 PayPal 帳號 ID | Payouts `recipient_type: PAYPAL_ID` | 師傅用 Log in with PayPal 驗證後，付到 PayPal 給的帳號 ID，不用 email | 部分實測：PayPal 接受這個格式；真的付款沒試 |
| 22 | 收回沒人領的款 | payouts-item cancel | 退回 VeriPay，等師傅驗證新的帳號再重付 | sandbox 實測（RETURNED） |
| 23 | 付到 Venmo | `recipient_wallet: VENMO` | 師傅選擇收到 Venmo | sandbox 拒絕：`Recipient wallet not supported in sandbox`（run 14） |
| 24 | 延後撥款 | capture 的 `disbursement_mode: DELAYED` ＋ Referenced Payouts | 錢留在 PayPal，過了爭議期才撥給師傅 | 部分實測：API 有權限；完整流程只在模擬 |

## 5. 平台型產品：Multiparty

| # | 功能 | PayPal API | 在 VeriPay 做什麼 | 狀態 |
|---|---|---|---|---|
| 25 | 師傅開通 PayPal 商家帳號 | Partner Referrals v2 | 「Get paid as a PayPal merchant」 | 部分實測：開通連結回 201，開通本身沒走完 |
| 26 | 查開通狀態 | merchant-integrations | 判斷 started、linked 或 ready | sandbox 實測（開通前回「找不到」） |
| 27 | 師傅直接收款，平台抽成 | `payee` ＋ `platform_fees` | 不經過平台的帳戶 | 只在模擬：sandbox 回 422（run 2，因為 app 不是核准的平台夥伴） |

## 6. 帳單：Invoicing v2

| # | 功能 | PayPal API | 在 VeriPay 做什麼 | 狀態 |
|---|---|---|---|---|
| 28 | 檢查通過才寄出的帳單 | invoices create、send | 師傅接平台外的工作也走同一套檢查 | sandbox 實測（run 4） |
| 29 | 付款 QR、提醒、記錄現金付款 | generate-qr-code、remind、payments | 師傅端的帳單頁 | sandbox 實測 |
| 30 | 範本 | invoicing templates | 「Save as template」→「Bill again」 | sandbox 實測 |
| 30a | 取消已寄出的帳單 | invoices cancel | 帳單頁「Cancel」 | sandbox 實測（CANCELLED） |
| 31 | 搜尋帳單 | search-invoices | 後台「PayPal invoices」 | sandbox 實測 |
| 32a | 帳單可給小費、可分次付 | invoice `configuration.allow_tip`、`partial_payment.minimum_amount_due` | 「Allow a tip」「Pay in parts」；付清才付給師傅，小費全給師傅 | 部分實測：PayPal 回傳的設定與送出的一致（帳單之後已取消）；實際付款要買家帳號 |
| 32 | 付款連結 | Pay Links（payment-resources） | 師傅收訂金或小額追加 | 部分實測：建立和刪除成功；付款要等 Transaction Search 有資料才比對得到 |

## 7. 月保養：Subscriptions

| # | 功能 | PayPal API | 在 VeriPay 做什麼 | 狀態 |
|---|---|---|---|---|
| 33 | 商品、方案、訂閱 | catalogs、plans、subscriptions | 月保養方案；每月扣款後，等當次保養的證明才付給師傅 | 部分實測：做到 APPROVAL_PENDING，核准要買家帳號 |
| 33a | 首次到府設定費、連續失敗自動暫停 | plan `payment_preferences.setup_fee`、`payment_failure_threshold: 2` | 第一次保養多收一筆，一樣等證明才付；連續兩個月扣不到款 PayPal 自動暫停 | 部分實測：方案建立成功，PayPal 回傳 setup_fee 150 和 threshold 2（測試方案之後已停用）；扣款要買家核准 |
| 34 | 改價 | update-pricing-schemes | 師傅提出新價、客戶用 PIN 接受 | sandbox 實測 |
| 34a | 補扣沒扣到的月費 | subscriptions capture（OUTSTANDING_BALANCE） | 「Pay the missed month」，客戶要輸入 PIN | 只在模擬：要有核准過的訂閱 |
| 35 | 暫停、恢復、取消、退某月 | suspend、activate、cancel、sale refund | 客戶用 PIN 操作；30 天沒交證明就退款 | 只在模擬：要先有核准的訂閱 |

## 8. 爭議：Disputes

| # | 功能 | PayPal API | 在 VeriPay 做什麼 | 狀態 |
|---|---|---|---|---|
| 36 | 讀取與分類爭議 | list_disputes、get_dispute（Agent Toolkit） | 爭議 agent 判斷要送證據、人工看，還是等 | 部分實測：呼叫成功，但 sandbox 沒有爭議 |
| 37 | 送證據（附簽章收據） | provide-evidence | 用 VeriPay 的檢查紀錄答辯 | 只在模擬 |
| 38a | 確認收到退回的東西 | acknowledge-return-item | 後台「Item came back」 | 只在模擬：sandbox 對假爭議 ID 回 404（路徑正確），沒有真爭議可測 |
| 38 | 退一部分、接受、傳訊息、申訴 | make-offer、accept-claim、send-message、appeal | 後台按鈕 | 只在模擬：sandbox 沒有買家帳號，無法建立爭議 |

## 9. 通知：Webhooks

| # | 功能 | PayPal API | 在 VeriPay 做什麼 | 狀態 |
|---|---|---|---|---|
| 39 | 註冊與驗證簽章 | webhooks、verify-webhook-signature | 收到事件就去 PayPal 查最新狀態 | 未驗證：需要公開網址 |
| 40 | 模擬事件 | simulate-event | 後台「Simulate」 | sandbox 實測（回 202） |
| 40a | 更多事件類型（共 25 種） | 爭議更新與結案、invoice 付款與取消、訂閱、月費扣款、vault | 收到事件就去 PayPal 查那一筆 | 25 個事件名稱都對過 PayPal 的事件類型清單；實際投遞需要公開網址 |
| 41 | 補收漏掉的事件 | webhooks-events 列表、單筆、重送 | 後台「Check PayPal's event record」→「Replay here」 | sandbox 實測：列表 API 正常，但目前 0 筆 |

## 10. 對帳與報表：Reporting

| # | 功能 | PayPal API | 在 VeriPay 做什麼 | 狀態 |
|---|---|---|---|---|
| 42 | 交易對帳與手續費比對 | Transaction Search | 每筆扣款的手續費和帳本比對 | sandbox 實測 |
| 43 | 帳戶餘額 | balances | 後台「PayPal balance」 | sandbox 實測 |
| 44 | 營收分析 | get_merchant_insights | 後台「Insights」 | sandbox 不支援，改用 VeriPay 帳本計算，並標明來源 |

## 11. 身分

| # | 功能 | PayPal API | 在 VeriPay 做什麼 | 狀態 |
|---|---|---|---|---|
| 45 | Log in with PayPal | OpenID Connect、userinfo | 師傅的收款帳號由 PayPal 證明是誰 | 只在模擬：要在 PayPal 後台開啟這個功能並加上回傳網址 |

## 12. AI 代理

| # | 功能 | PayPal 工具 | 在 VeriPay 做什麼 | 狀態 |
|---|---|---|---|---|
| 46 | PayPal Agent Toolkit | `@paypal/agent-toolkit` | 對帳 agent、爭議 agent | sandbox 實測 |
| 47 | PayPal 官方 MCP 伺服器 | 46 個工具 | 唯讀工具直接用；不動錢的寫入要員工核准；動錢的一律拒絕 | sandbox 實測（核准後執行 `generate_invoice_number` 成功） |

## 13. 第 10 輪（2026-11-07）

第 9 輪掃描的 158 項候選，逐項狀態寫在 [PAYPAL-候選清單.md](PAYPAL-候選清單.md) 的「五、第 10 輪結果」。

| 狀態 | 項數 |
|---|---|
| 有寫程式（不含「其他」和「沒做」） | 127 |
| sandbox 實測通過 | 63 |
| 部分實測 | 19 |
| 網頁程式做好，瀏覽器還沒驗 | 29 |
| 只在模擬 | 8 |
| PayPal 擋下或需要核准 | 8 |

另外，「其他」6 項是文件、提示文字、本來就涵蓋的功能和開關；「沒做」25 項各附原因。

**對前面各項的更正**
- **11c App Switch**：改用規格裡的 `app_switch_context`，只在手機瀏覽器才帶。原本用的 `app_switch_preference` 已移除。
- **33、33a、34a、35 月保養**：用卡片訂閱，現在可以在 sandbox 實測（G1）。35 退某月改走 Payments v2 退款，sandbox 實測通過。
- **37 送證據**：改成到府服務適用的證據類型（I1）。
- **40a 事件**：補上 Orders v2 的 `PAYMENT.CAPTURE.DECLINED`。伺服器啟動時會對照 PayPal 的事件清單，剔除不認得的名稱（J1）。
- **工地地址（運送類型 PICKUP_IN_PERSON）**：瀏覽器實測發現，只有買家核准的 PayPal 錢包訂單接受這個運送類型。卡片訂單和已存 PayPal 訂單都回 UNSUPPORTED_SHIPPING_TYPE，所以這兩種訂單現在不帶工地地址。已存 PayPal 免核准凍結（A18）在 sandbox 實測通過。詳見候選清單「六」。

## 合計

（以下是第 1–8 輪的 61 項。第 10 輪的 158 項見第 13 節：有寫程式 127 項，其中 sandbox 實測通過 63 項。）

共 61 項（原本 47 項；2026-11-07 第 7 輪加 6a、19a、21a、30a、34a、40a；第 8 輪加 11a、11b、11c、11d、20a、32a、33a、38a）：

- sandbox 實測：28 項（加上第 8 輪的 11a、11b）
- 部分實測：18 項（加上第 8 輪的 11c、11d、20a、32a、33a）
- 只在模擬：8 項（加上第 8 輪的 38a）
- sandbox 拒絕：1 項（23）
- 已整合但沒有紀錄或沒驗證：3 項（11、14、39）
- 狀態不是單一分類：3 項（13 分期訊息實測過、按鈕沒有；44 PayPal 不支援，改用帳本計算；40a 事件名稱對過 PayPal 清單，實際投遞沒驗證）

**放進影片時**：只有「sandbox 實測」的項目可以直接說成「在 PayPal sandbox 跑過」；其他項目要照上面的狀態欄加字卡。
