# VeriPay × PayPal：第 9 輪掃描的候選，與第 10 輪的結果

2026-11-07。對照的是 [PAYPAL-整合總表.md](PAYPAL-整合總表.md) 的 61 項。來源：

- PayPal 官方 OpenAPI 規格（github.com/paypal/paypal-rest-api-specifications，13 份）
- JS SDK v6 型別定義（github.com/paypal/paypal-js，`types/v6/components/`）
- developer.paypal.com 的說明頁

每一項都有出處。標「本輪實測」的，是今天用 sandbox 實際打過的結果。

**「需要」欄的代號**
- **K**：只要 sandbox 金鑰，可以自己測完
- **B**：要 sandbox 買家帳號登入
- **P**：要手機或實體裝置
- **D**：要公開 HTTPS 網域
- **A**：要 PayPal 核准、填申請表或聯絡業務

## 一、本輪實測的重點

| 項目 | 結果 | 影響 |
|---|---|---|
| 用卡片付月保養訂閱（`subscriber.payment_source.card`） | **201，訂閱直接 ACTIVE，已扣 $15** | 不用買家帳號也能測月保養。總表 33、33a、34a、35 可以改成 sandbox 實測 |
| 測試卡讓 PayPal 拒絕（持卡人姓名填 `CCREJECT-REFUSED`） | 授權 **DENIED**，回應碼 0500 | 可以真的測「凍結失敗」的流程 |
| 指定錯誤回應（header `PayPal-Mock-Response`） | 回 422 INSTRUMENT_DECLINED | 任何錯誤情況都能重現 |
| 卡片收款的 Seller Protection | **NOT_ELIGIBLE** | 到府服務沒有賣家保障，正好說明 VeriPay 為什麼要自己留證據 |
| 卡片收款的 `network_transaction_reference` | 有回傳（VISA） | 之後用存好的卡扣款時可以帶上 |
| sandbox 建測試爭議（`process-chargeback`） | 三種寫法都回 **500** | 這條路不通；爭議功能仍然只能在模擬模式測 |
| App Switch 正確欄位 `app_switch_context` | 200，有 payer-action 連結 | 見「三、總表要更正的」第 1 點 |
| 訂單附工地地址（`PICKUP_IN_PERSON`）、`invoice_id`、稅額、`locale: es-US`、`landing_page`、`payment_method_preference` | 200，PayPal 回傳的地址和單號正確 | 都能做 |
| 帳單：多行明細（工時 HOURS、零件含 8.25% 稅）、車馬費、NET_15、保固條款、下一個帳單號碼、刪除草稿 | 201，總額 $156.65 算對；草稿刪除回 204 | 都能做 |
| 試用期加每季收費的方案，加 8.25% 稅 | 201 | 都能做（測完已停用） |
| Pay Links 的客戶備註欄（例如大門密碼）、列出連結 | 201、200 | 都能做（測完已刪除） |
| 用卡片建 Vault setup token、查詢狀態 | 201、200 | 不付款先存卡 |
| 查退款狀態、退款帶 `custom_id` 和 `invoice_id` | 201、200 | 都能做 |
| 查某一天的餘額（`as_of_time`） | 200 | 月底對帳 |
| 伺服器端查可用付款方式（`find-eligible-methods`） | 200：paypal、venmo | 都能做 |
| Webhook 事件清單 | 205 種；`PAYMENT.CAPTURE.DECLINED`、`PAYMENT.REFUND.FAILED`、`PAYMENT.PAYOUTS-ITEM.FAILED` 都有 | 見第三節第 5 點 |

留在 sandbox 的東西：
- 卡片收款 2 筆，分別是 $12 和 $13。$12 那筆已退 $1。
- 一筆 $15 的訂閱已取消。
- 方案「zz r9」和「zz r9 trial」都已停用。
- 一個商品「zz r9 probe」（PayPal 不能刪商品）。
- 一筆 $20 的被拒授權。

## 二、候選清單（扣掉已經做的，共 158 項；第 9 輪寫成 112 項是算錯了）

**建議**欄：★ = 建議做（貼近 VeriPay、sandbox 測得到）；○ = 可以做，但價值普通；空白 = 只是列出來。

### A. 凍結款與訂單（Orders v2）

| # | 功能 | PayPal API / 欄位 | 在 VeriPay 的用法 | 需要 | 建議 |
|---|---|---|---|---|---|
| A1 | 訂單附工地地址 | `shipping.type: PICKUP_IN_PERSON` ＋ address，`SET_PROVIDED_ADDRESS` | 收據和爭議證據上出現服務地址 | K（本輪實測） | ★ |
| A2 | 訂單層的單號 | `purchase_units[].invoice_id` | 客戶在 PayPal 收據看到工作編號 | K（本輪實測） | ★ |
| A3 | 稅額、折扣、車馬費 | `amount.breakdown.tax_total`、`discount`、`handling` | 零件稅、優惠、車馬費分開列 | K（本輪實測稅額） | ★ |
| A4 | 明細的 sku、url、image_url、數量 | `items[].sku/url/image_url/quantity` | sku 放里程碑編號、url 放工作頁、數量放工時 | K | ○ |
| A5 | 核准頁語言 | `experience_context.locale` | 西語客戶用 `es-US` | K（本輪實測） | ★ |
| A6 | 指定落地頁 | `landing_page` LOGIN／GUEST_CHECKOUT | 沒有 PayPal 帳號的客戶直接看到刷卡頁 | K（本輪實測） | ○ |
| A7 | 不收 eCheck | `payment_method_preference: IMMEDIATE_PAYMENT_REQUIRED` | 避免款項慢慢才到的凍結 | K（本輪實測） | ★ |
| A8 | 正確的 App Switch 欄位 | `app_switch_context.mobile_web/native_app` | 取代目前用錯的 `app_switch_preference` | P | ★（修正） |
| A9 | 用 PATCH 改更多欄位 | `description`、`custom_id`、`invoice_id`、`soft_descriptor`、`platform_fees` | 工作範圍改了，同步更新訂單說明 | K | ○ |
| A10 | 伺服器端確認付款方式 | `POST /orders/{id}/confirm-payment-source` | 先建訂單，之後再補上存好的卡（3DS 回來後） | K | ○ |
| A11 | 修改或取消物流追蹤 | `PATCH /orders/{id}/trackers/{tid}` | 追蹤單號填錯可以改 | K | ○ |
| A12 | 地址不在服務區就擋 | order update callback | 核准時發現地址不在奧斯汀就拒絕 | D、B | |
| A13 | Level 3 卡片資料 | `supplementary_data.card.level_3` | 公司卡的零件明細 | A | |
| A14 | 訂單內附風險資料 | `supplementary_data.risk.customer` | 和 STC 同樣的資料改放在訂單裡 | ? | |
| A15 | 指定驗證方式 | `verification.method: 3D_SECURE / AVS_CVV` | 存卡時檢查地址和 CVV | K | ○ |
| A16 | 存卡時寫上自己的客戶 ID | `card.attributes.customer.merchant_customer_id` | 用 VeriPay 的使用者 ID 查已存的卡 | K | ★ |
| A17 | 正確的商家發起扣款標記 | `stored_credential` 的 FIRST/SUBSEQUENT 加 `previous_network_transaction_reference` | 第一次存卡標 FIRST，之後扣款連結第一次的交易 | K（NTR 本輪有回傳） | ★ |
| A18 | 存好的 PayPal 的商家發起扣款標記 | `paypal.stored_credential` | 平台自動重新凍結時正確標記 | B | ○ |
| A19 | 讀 Seller Protection | 回應裡的 `seller_protection` | 工作頁顯示「PayPal 賣家保障：不適用」 | K（本輪實測） | ★ |
| A20 | 存網路交易編號 | 回應裡的 `network_transaction_reference` | 帳本記下來，給 A17 用 | K（本輪實測） | ★ |
| A21 | 讀待處理或被拒的原因 | `status_details.reason` | 收款 PENDING 或被風控擋下時，告訴客戶和員工原因 | K | ★ |
| A22 | Apple Pay | `payment_source.apple_pay` | iPhone 客戶 | D、P、A | |

### B. 收款、退款（Payments v2）

| # | 功能 | API | 用法 | 需要 | 建議 |
|---|---|---|---|---|---|
| B1 | 查退款狀態 | `GET /v2/payments/refunds/{id}` | 退款還在 PENDING 的，等 PayPal 完成再記帳 | K（本輪實測） | ★ |
| B2 | 退款帶對帳編號 | refund 的 `custom_id`、`invoice_id` | 每筆退款註明爭議或里程碑編號 | K（本輪實測） | ★ |
| B3 | 每段收款自訂帳單文字 | capture 的 `soft_descriptor` | 卡片帳單上顯示「VERIPAY M2」 | K | ○ |
| B4 | 伺服器端查可用付款方式 | `POST /v2/payments/find-eligible-methods` | 先決定要顯示哪些按鈕；用 email 找已存的付款方式 | K（本輪實測） | ○ |

### C. JS SDK v6（網頁）

| # | 功能 | 元件／選項 | 用法 | 需要 | 建議 |
|---|---|---|---|---|---|
| C1 | 頁內存 PayPal | `createPayPalSavePaymentSession` | 「Save PayPal now」不用轉址；後端的 setup token 已經做好 | K、B | ★ |
| C2 | 頁內存卡 | `createCardFieldsSavePaymentSession` | 月保養先存卡 | K | ★ |
| C3 | 存 Venmo | `createVenmoSavePaymentSession` | 補上 Venmo 沒有轉址連結的問題 | P、B | ○ |
| C4 | 頁內訂閱按鈕 | `paypal-subscriptions` | 月保養在頁內核准 | K、B | ○ |
| C5 | 其他開啟方式 | `presentationMode` popup／modal／payment-handler／redirect | 手機 Safari 擋彈出視窗時改用 modal | K、B | ★ |
| C6 | 轉址回來後接續 | `hasReturned()`、`resume()` | 搭配 C5 的 redirect 和 App Switch | K、B | ○ |
| C7 | 按鈕文字 | `commit: false` | 凍結款按鈕顯示「Continue」，不是「Pay now」 | K | ★ |
| C8 | 依金額和流程查資格 | `findEligibleMethods({amount, paymentFlow})` | 依凍結金額決定要不要顯示 Pay Later；存付款方式另外查 | K | ★ |
| C9 | 依推薦排序、能不能存 | `recommended_priority`、`can_be_vaulted` | 按 PayPal 的建議排按鈕；不能存的隱藏「存起來」 | K | ○ |
| C10 | 實際收的卡別 | card `vendors[]` | 顯示收哪些卡的標誌 | K | ○ |
| C11 | PayPal Credit 按鈕 | `createPayPalCreditOneTimePaymentSession` | $300 以上的凍結多一個分期選項 | K、B | ○ |
| C12 | PayPal 代管的訪客刷卡 | `paypal-guest-payments` | 沒有帳號的客戶在 PayPal 頁面刷卡 | K | ○ |
| C13 | 單獨的刷卡按鈕 | `<paypal-basic-card-button>` | 另一種刷卡入口 | K | |
| C14 | 卡片欄位的樣式和無障礙 | `MerchantStyleObject`、`ariaLabel` 等 | 欄位樣式跟網站一致、螢幕閱讀器可用 | K | ★ |
| C15 | 卡片欄位事件 | `validitychange`、`cardtypechange` 等 | 填完整才能按「Hold」；顯示卡別 | K | ★ |
| C16 | 送出完整帳單地址 | `submit({billingAddress, name})` | 帶上郵遞區號，AVS 比對更準 | K | ★ |
| C17 | 改金額 | card fields `session.update({amount})` | 報價改了不用重新載入欄位 | K | ○ |
| C18 | 顯示 3DS 責任轉移 | submit 回傳的 `liabilityShift` | 工作頁顯示 3-D Secure 的結果 | K | ○ |
| C19 | 統一的結束和錯誤處理 | `onComplete`、`PayPalError.isRecoverable`、`destroy()` | 只在 PayPal 說可以重試時才重試；元件卸載時清掉 | K | ★ |
| C20 | 在 SDK 帶上合作夥伴代碼 | `createInstance({partnerAttributionId})` | 和伺服器帶的 BN 代碼一致 | A（要正式代碼） | ○ |
| C21 | 頁面類型和語言 | `pageType`、`locale` | 師傅頁用 `product-details`、報價頁用 `cart` | K | ○ |
| C22 | 模擬買家國家 | `testBuyerCountry` | 測試資格判斷的各種情況 | K | |
| C23 | 按鈕外觀 | button `type`、CSS 變數 | 外觀一致 | K | |
| C24 | Google Pay 的 3DS 步驟 | `initiatePayerAction` | Google Pay 遇到需要驗證的卡也能完成 | K、B | ○ |
| C25 | Fastlane 地址選擇 | `profile.showShippingAddressSelector()` | 用會員存的地址當工地地址 | K、B | ○ |
| C26 | 官方 React 套件 | `@paypal/react-paypal-js` v6 | 取代自己寫的 `loadSdk` | K | ○ |
| C27 | 付款方式標誌 | PayPal Marks | 選付款方式時顯示 PayPal、Venmo 圖示 | K | |
| C28 | 舊版訂閱改方案 | v5 `actions.subscription.revise` | 客戶在 PayPal 核准新月費 | B | |

### D. Pay Later 訊息

| # | 功能 | 元件 | 用法 | 需要 | 建議 |
|---|---|---|---|---|---|
| D1 | 改用 v6 訊息元件 | `paypal-messages`、`createPayPalMessages` | 不用再另外載一份 v5 script | K | ★ |
| D2 | 宣告式訊息 | `<paypal-message amount=…>` | 報價卡上直接放 | K | ○ |
| D3 | Learn More 視窗和點擊事件 | `createLearnMore`、`onApply`、`paypal-message-click` | 知道客戶有沒有點分期說明 | K | ○ |
| D4 | 橫幅樣式 | `layout: flex`、`ratio` | 首頁和師傅列表放 Pay Later 橫幅 | K | ○ |
| D5 | 依金額調整文字 | Pay in 4 $10–$2,000；Pay Monthly $49–$10,000 | 超過 $2,000 只提月付 | K | ★ |
| D6 | 訊息設定工具 | Messaging Configurator | 不寫程式調整訊息位置（限量開放） | A | |
| D7 | 說明存好的付款方式不能用 Pay Later | 官方限制 | 解釋重新凍結時為什麼沒有 Pay Later | — | ○（文件） |

### E. 存付款方式（Vault v3）

| # | 功能 | API | 用法 | 需要 | 建議 |
|---|---|---|---|---|---|
| E1 | 不付款先存卡 | setup-tokens `payment_source.card` | 月保養註冊時先存卡 | K（本輪實測） | ★ |
| E2 | 查 setup token 狀態 | `GET /v3/vault/setup-tokens/{id}` | 轉址回來時確認核准了沒 | K（本輪實測） | ★ |
| E3 | 核准後自動建付款憑證 | `vault_instruction: ON_PAYER_APPROVAL` | 回來時少打一支 API | K、B | ○ |
| E4 | 說明用途 | `usage_pattern: UNSCHEDULED_POSTPAID` | 告訴 PayPal 這是「不定期凍結」 | K | ○ |
| E5 | 不付款先存 Venmo（後端） | setup-tokens `venmo` | 「Save Venmo now」 | P、B | ○ |
| E6 | 用自己的客戶 ID | `customer.merchant_customer_id` | 用 VeriPay 的 ID 列出付款方式 | K | ★ |
| E7 | 分頁 | payment-tokens `page`／`total_required` | 客戶存了很多個時用 | K | |

### F. 帳單（Invoicing v2）

| # | 功能 | API | 用法 | 需要 | 建議 |
|---|---|---|---|---|---|
| F1 | 多行明細：工時、零件、稅 | `items[]`、`unit_of_measure: HOURS`、`tax` | 帳單上分開列工錢、零件、稅 | K（本輪實測） | ★ |
| F2 | 車馬費、整張折扣 | `breakdown.custom`、`discount` | 車馬費單獨一行 | K（本輪實測） | ★ |
| F3 | 付款期限 | `NET_15` 到 `NET_90`、指定日期 | 給物業管理公司 NET_15 | K（本輪實測） | ★ |
| F4 | 保固條款、內部備註、對應編號 | `terms_and_conditions`、`memo`、`reference` | 帳單寫上 90 天保固 | K（本輪實測） | ★ |
| F5 | 師傅的抬頭 | `invoicer`（公司名、電話、網站、稅號、logo） | 帳單上顯示師傅的商號 | K（本輪實測） | ★ |
| F6 | 收件人資料、副本 | `billing_info.address`、`additional_recipients` | 工地地址；副本給物業管理公司 | K | ○ |
| F7 | 依規則產生帳單號碼 | `generate-next-invoice-number` | 帳單號碼和工作編號對得起來 | K（本輪實測） | ○ |
| F8 | 刪除草稿 | `DELETE /invoices/{id}` | 師傅放棄的草稿 | K（本輪實測） | ★ |
| F9 | 修改草稿 | `PUT /invoices/{id}` | 寄出前修改 | K | ○ |
| F10 | 預約寄出 | 未來的 `invoice_date` → SCHEDULED | 完工隔天自動寄 | K | ○ |
| F11 | 記錄或刪除平台外的退款或付款 | `/refunds`、`DELETE /payments/{txn}` | 現金退款；刪掉記錯的現金付款 | K | ○ |
| F12 | 寄送信件的主旨和內文 | send 的 `subject`、`note` | VeriPay 的信件文字 | K | ○ |
| F13 | 更多搜尋條件 | `reference`、金額範圍、付款日 | 後台用工作編號找帳單 | K | ○ |
| F14 | 列出、修改範本 | `GET/PUT /templates` | 「My templates」可以編輯 | K | ○ |
| F15 | 帳單附件 | `detail.attachments` | 附上完工照片 | ? | ○ |
| F16 | 定期帳單 | Agent Toolkit `create_recurring_series` 等 | 月保養改用帳單方式收 | K | |
| F17 | 會計軟體連線 | accounting-sync connections | 師傅大多沒在用 | — | |

### G. 月保養（Subscriptions、Catalog）

| # | 功能 | API | 用法 | 需要 | 建議 |
|---|---|---|---|---|---|
| G1 | **用卡片直接訂閱** | `subscriber.payment_source.card` | 不用買家帳號，訂閱馬上 ACTIVE，月保養整條流程都能在 sandbox 跑 | K（本輪實測） | ★★ |
| G2 | 試用期 | `tenure_type: TRIAL` | 第一個月免費或打折 | K（本輪實測） | ★ |
| G3 | 每季、每年、固定期數 | `interval_unit`、`total_cycles` | 每季保養；12 個月的季節合約 | K（本輪實測） | ★ |
| G4 | 方案加稅 | plan `taxes` | 定期服務的銷售稅 | K（本輪實測） | ○ |
| G5 | 停用不用的方案 | `/plans/{id}/deactivate` | 訂閱結束就停用，方案不會越積越多 | K（本輪實測） | ★ |
| G6 | 共用方案，個別覆寫 | 建立訂閱時的 `plan` override | 不用每個訂閱都建一個方案 | K | ★ |
| G7 | 改個別訂閱的價格 | `PATCH /subscriptions/{id}` | 只調整一個客戶的月費 | K（G1 有 ACTIVE 訂閱） | ○ |
| G8 | 修改方案設定 | `PATCH /plans/{id}` | 改失敗次數上限，不用建新方案 | K | ○ |
| G9 | 指定開始日、預填客戶資料 | `start_time`、`subscriber` | 從第一次到府那天開始收 | K | ○ |
| G10 | 扣款紀錄細節 | `billing_info.last_failed_payment`、`cycle_executions` | 顯示哪個月扣不到、原因是什麼 | K | ★ |
| G11 | 依行業分類的商品 | product `category`，例如 HEATING_PLUMBING_AC | 每個行業一個商品 | K（本輪實測） | ○ |
| G12 | 列出和查詢商品 | `GET /catalogs/products` | 用查的，不用把商品 ID 存在記憶體 | K | ○ |
| G13 | 依數量計價 | `TIERED`／`VOLUME`、`quantity` | 依冷氣台數收費 | K | |
| G14 | 換方案 | `/subscriptions/{id}/revise` | 升級保養等級 | B | |

### H. 付錢給師傅（Payouts、Referenced Payouts）

| # | 功能 | API | 用法 | 需要 | 建議 |
|---|---|---|---|---|---|
| H1 | 查單一筆 payout | `GET /payouts-item/{id}` | 追蹤卡在 UNCLAIMED 或失敗的那一筆 | K | ★ |
| H2 | 標記付款用途 | item `purpose: SERVICES` | 付給師傅的款項標為服務費 | K | ★ |
| H3 | 通知語言 | item `notification_language` | 西語師傅收到西語通知 | K | ○ |
| H4 | 一次放款多筆延遲款項 | `POST /referenced-payouts` | 每週一次放款 | A（要 BN 代碼） | |
| H5 | 查延遲放款 | `GET /referenced-payouts-items/{id}` | 確認放款完成了 | A | |

### I. 爭議（Disputes）

| # | 功能 | API | 用法 | 需要 | 建議 |
|---|---|---|---|---|---|
| I1 | 用正確的證據類型 | `PROOF_FOR_SOFTWARE_OR_SERVICE_DELIVERED`、`COPY_OF_CONTRACT`、`PROOF_OF_REFUND` 等 | 到府服務不該用 PROOF_OF_FULFILLMENT（那是給出貨用的） | 模擬 | ★（修正） |
| I2 | 依 PayPal 要求的證據送 | `evidences[].source: REQUESTED_FROM_SELLER` | 照 PayPal 要的類型準備證據 | 模擬 | ★ |
| I3 | 其他和解方式 | make-offer `REPLACEMENT_WITHOUT_REFUND` | 「重做一次」當作和解方案 | 模擬 | ★ |
| I4 | 部分接受 | accept-claim `PARTIAL_REFUND` | 只退一部分並結案 | 模擬 | ○ |
| I5 | 依狀態列爭議 | list `dispute_state=REQUIRED_ACTION`、`update_time_after` | 定時抓需要處理的爭議 | K（本輪實測，0 筆） | ★ |
| I6 | 區分管道 | `dispute_channel` INTERNAL／EXTERNAL／ALERT | 信用卡退單（EXTERNAL）和 PayPal 內部爭議分開處理 | K（讀取） | ★ |
| I7 | 補充資料 | `provide-supporting-info` | PayPal 要求補件時回覆 | 模擬 | ○ |
| I8 | 更新聯絡方式 | `PATCH /disputes/{id}` communication_detail | 告訴 PayPal 師傅的聯絡方式 | 模擬 | ○ |
| I9 | sandbox 自動判決 | `adjudicate`、`require-evidence`（sandbox 專用） | 爭議跑完整個流程 | 要先有爭議 | ○ |
| I10 | sandbox 建爭議 | `process-chargeback`、買家建立 | 本輪實測：**500，不能用** | — | |

### J. 通知（Webhooks）

| # | 功能 | API | 用法 | 需要 | 建議 |
|---|---|---|---|---|---|
| J1 | 啟動時檢查事件名稱 | `GET /webhooks-event-types` | 程式自己核對訂閱的事件名稱，不用人工對 | K（本輪實測，205 種） | ★ |
| J2 | 收款被拒 | `PAYMENT.CAPTURE.DECLINED`（Orders v2 用這個） | 補上；目前只訂了 v1 的 DENIED | K（本輪實測，存在） | ★（修正） |
| J3 | 收款待處理或被撤回 | `PAYMENT.CAPTURE.PENDING`、`REVERSED` | 里程碑放款卡住或被撤回時通知 | K | ★ |
| J4 | 退款待處理或失敗 | `PAYMENT.REFUND.PENDING`、`FAILED` | 退款沒成功時通知員工 | K | ★ |
| J5 | 付給師傅失敗 | `PAYMENT.PAYOUTS-ITEM.FAILED`、`BLOCKED`、`HELD`、`REFUNDED` 等 | 付給師傅失敗時馬上處理 | K | ★ |
| J6 | 核准被撤回 | `CHECKOUT.PAYMENT-APPROVAL.REVERSED` | 客戶的核准失效時重新要求 | K | ○ |
| J7 | 帳單其他事件 | `INVOICING.INVOICE.REFUNDED`、`SCHEDULED`、`UPDATED` | 同步帳單狀態 | K | ○ |
| J8 | 訂閱其他事件 | `BILLING.SUBSCRIPTION.EXPIRED`、`PAYMENT.SALE.REFUNDED`、`REVERSED` | 同步月保養狀態 | K | ○ |
| J9 | 師傅開通進度 | `CUSTOMER.MERCHANT-INTEGRATION.*` | 師傅開通商家帳號時即時更新狀態 | K | ○ |
| J10 | 存好的付款方式被刪 | `VAULT.PAYMENT-TOKEN.DELETION-INITIATED` | 客戶在 PayPal 刪掉時同步 | K | ○ |
| J11 | 管理已註冊的 webhook | `GET/PATCH/DELETE /webhooks/{id}` | 網址改了就直接更新，不用重建 | K | ○ |
| J12 | 收開通商家的事件 | `/webhooks-lookup` | 收到已開通師傅帳號上的事件 | ? | |

### K. 對帳（Transaction Search、Balances）

| # | 功能 | API | 用法 | 需要 | 建議 |
|---|---|---|---|---|---|
| K1 | 用交易 ID 查 | `transaction_id` 篩選 | 付款連結的付款直接用 ID 對，不用比名稱和金額 | K | ★ |
| K2 | 回傳付款人資料 | `fields=payer_info` | 用 email 找到是哪位客戶 | K | ○ |
| K3 | 包含不影響餘額的紀錄、分頁 | `balance_affecting_records_only=N`、`page` | 凍結款也能對帳；超過 100 筆可以分頁 | K | ○ |
| K4 | 某一天的餘額 | `balances?as_of_time=` | 月底結帳 | K（本輪實測） | ○ |

### L. 平台與開通（Partner Referrals）

| # | 功能 | API | 用法 | 需要 | 建議 |
|---|---|---|---|---|---|
| L1 | 查邀請連結狀態 | `GET /v2/customer/partner-referrals/{id}` | 看師傅開了連結、做完了沒 | ? | ○ |
| L2 | 申請爭議相關權限 | features `READ_SELLER_DISPUTE`、`UPDATE_SELLER_DISPUTE` | 開通師傅帳號上的爭議也能代為處理 | K（建立連結），B | ★ |
| L3 | 預填開通表單 | `business_entity`、`individual_owners`、`preferred_language_code` | 用師傅資料預先填好 | K | ○ |
| L4 | 新版開通產品 | `PPCP`、`ADVANCED_VAULTING` | 走新的平台開通方式 | A | |
| L5 | 師傅沒有商業帳號也能開通 | PayPal Checkout 開通 | 降低師傅門檻 | A | |
| L6 | 給客戶看的限制說明 | 師傅 30 天內沒開通，第一筆款會退回 | 提醒客戶 | — | ○（文件） |
| L7 | 一張訂單付給多個收款人 | multi-seller | 師傅和助手在同一張訂單收款 | A | |

### M. 其他產品

| # | 功能 | 來源 | 用法 | 需要 | 建議 |
|---|---|---|---|---|---|
| M1 | Pay Links 客戶備註欄 | `line_items[].customer_notes` | 付訂金時填大門密碼或進門注意事項 | K（本輪實測） | ★ |
| M2 | 列出和修改 Pay Links | `GET/PUT /payment-resources` | 師傅看到所有連結、可以改價 | K（本輪實測） | ○ |
| M3 | Pay Links 稅和車馬費 | `line_items[].taxes/shipping` | 訂金連結含車馬費 | K | ○ |
| M4 | 獨立的物流追蹤 API | `/v1/shipping/trackers` | 帳單或訂閱付款也能加追蹤 | K | |
| M5 | FraudNet | 瀏覽器 JS | 用真的裝置 ID 取代目前隨機產生的 metadata ID | A（限量開放） | ○ |
| M6 | 進階詐欺防護 | Fraud Protection Advanced | 卡片風控 | A | |
| M7 | 卡片自動更新 | RTAU | 存好的卡過期或換卡時自動更新 | A | |
| M8 | ACH 銀行扣款 | `bank.ach_debit` | 大案子手續費比較低 | A | |
| M9 | 存 PayPal 時跳 App | Vaulted App Switch | 手機上「Save PayPal now」 | P、B、A | |

### N. AI 代理（Agent Toolkit、MCP）

| # | 功能 | 來源 | 用法 | 需要 | 建議 |
|---|---|---|---|---|---|
| N1 | Toolkit 的帳單寫入工具 | `create_invoice`、`send_invoice`、`send_invoice_reminder` | 師傅的 AI 代理直接用 PayPal 官方工具開帳單（仍要先通過檢查） | K | ○ |
| N2 | 定期帳單工具 | `create_recurring_series` 等 | 見 F16 | K | |
| N3 | 商品和訂閱工具 | catalog、subscription 共 7 個工具 | 讓代理查月保養狀態 | K | ○ |
| N4 | 物流追蹤工具 | `create/get/update_shipment_tracking` | 代理幫師傅填追蹤單號 | K | ○ |
| N5 | MCP 用 OAuth 登入 | 遠端 MCP 第一次連線時登入 | 員工用自己的 PayPal 帳號授權 | B | |
| N6 | 給 LLM 讀的文件 | `llms.txt`、`.md` 版文件 | 爭議 agent、對帳 agent 讀官方文件 | K | ○ |
| N7 | Store Sync、Agent Ready、Cart API | 代理商務方案 | 讓外部 AI 購物助理也能找到師傅、下單 | A、D | |
| N8 | 禮物卡購物工具 | `create_cart`、`checkout_cart` | 不適合 | A | |

### O. 測試工具（不算產品功能，但能把「只在模擬」變成實測）

| # | 功能 | 來源 | 用法 | 需要 | 建議 |
|---|---|---|---|---|---|
| O1 | 指定錯誤回應 | `PayPal-Mock-Response` | 重現收款失敗、退款失敗、重複單號等情況 | K（本輪實測） | ★ |
| O2 | 讓測試卡被拒 | 持卡人姓名填 `CCREJECT-*` | 凍結失敗、卡片被拒的流程 | K（本輪實測） | ★ |
| O3 | 批次建立 sandbox 帳號 | bulk account upload | 解決沒有買家帳號的問題 | K | ★ |
| O4 | 爭議時間的觸發金額 | 例如 $5.xx 在第 5 天升級 | 測爭議期限 | 要先有爭議 | |

## 三、總表要更正的

1. **11c App Switch。** 規格裡沒有 `app_switch_preference`，正確欄位是 `app_switch_context`。PayPal 會忽略不認得的欄位：本輪送一個亂取名的欄位也回 200，所以「訂單接受了」證明不了什麼。要改程式（A8），狀態改成「沒有驗證」。
2. **37 送證據。** `PROOF_OF_FULFILLMENT` 要搭配物流追蹤資料，不適合到府服務。改用 I1 的類型。
3. **33、33a、34a、35 月保養。** G1 證實用卡片訂閱不需要買家帳號。改程式之後，這幾項都可以實測。
4. **36–38a 爭議。** 本輪實測 `process-chargeback` 回 500，建不出測試爭議，維持「只在模擬」。原因改成「sandbox 的建爭議 API 回 500」。
5. **40a 事件。** Orders v2 收款被拒的事件是 `PAYMENT.CAPTURE.DECLINED`，目前只訂了 v1 的 `DENIED`。兩個都要訂（J2）。
6. **39 webhook 簽章。** PayPal 說模擬產生的事件不能驗簽章，要真的收到事件才能驗。原本的狀態正確，補上這個原因。
7. **35 退某月。** 用的是已淘汰的 Payments v1 `sale/{id}/refund`。要確認 v2 的 captures refund 能不能用在訂閱付款上（G1 有 ACTIVE 訂閱可以測）。
8. **45 Log in with PayPal。** 程式打的是 `/v1/identity/oauth2/userinfo`，文件寫的是 `/v1/identity/openidconnect/userinfo`。要用真的登入確認舊路徑還能用。
9. **9 Risk API、24 延遲放款。** 文件說 Risk API 是限量開放，Referenced Payouts 要正式 BN 代碼。sandbox 回 200 是真的，但正式上線要 PayPal 開通，應該註明。

## 四、不列入的

- 加密貨幣、穩定幣。
- 非美國或非美元的付款方式：iDEAL、Bancontact、BLIK、Klarna、Afterpay、Alipay、Pix、SEPA、Pay upon invoice 等 50 多種，以及外幣匯率欄位。
- 只有 Braintree 才有的：Drop-in、Hosted Fields、GraphQL。
- 已淘汰的：Payments v1、NVP/SOAP、Payflow、IPN、Billing Agreements、Web Profiles。
- 不適合的：原生 App SDK（iOS/Android、Magnes），VeriPay 是網頁；Zettle（實體店收款）；Hyperwallet。
- 找不到開發文件的：Smart Receipts、upstream presentment、managed accounts（只有限量開放頁）、network token 自帶。

## 五、第 10 輪結果（2026-11-07，158 項全部處理）

每項都附上狀態。「實測」是用 VeriPay 自己的 PayPal 程式（`api/src/pay/paypal.js`）打 sandbox 的結果，不是另外寫的測試呼叫。測試共 388 個，全部通過；其中 `api/test/paypal9.test.js` 是這輪新加的 10 個。

| 狀態 | 項數 | 項目 |
|---|---|---|
| sandbox 實測通過 | 63 | A1 A2 A4 A7 A9 A10 A16 A17 A19 A20；B1–B4；E1 E2 E4–E7；F1–F5 F7–F14；G1–G13；H1 H2；I5；J1 J11 J12；K2–K4；L1–L3；M1–M3；O1 O2 |
| 部分實測：PayPal 接受了，效果要買家、手機或真的事件才看得到 | 19 | A5 A8 A13 A14 A18 A21；F6；G14；H3；K1；J2–J10 |
| 網頁程式做好了，但還沒在瀏覽器實際操作 | 29 | C1–C3 C5–C25；D1–D5 |
| 只在模擬模式測過：sandbox 沒有爭議可測 | 8 | A11；I1 I3 I4 I6–I9 |
| 程式做好了，但 PayPal 擋下，或需要核准、公開網域 | 8 | A12 A22 H4 H5 I10 L4 M4 M5 |
| 其他（文件、提示文字、本來就涵蓋、只加開關） | 6 | D7 L6 N3 N4 N6 E3 |
| 沒做 | 25 | A3 A6 A15 C4 C26–C28 D6 F15–F17 I2 L5 L7 M6–M9 N1 N2 N5 N7 N8 O3 O4 |

**本輪實測的重點結果**
- **同一張訂單改用測試卡（A10）**：還沒核准的 PayPal 訂單，用 confirm-payment-source 改成測試卡，訂單 ID 不變，授權 CREATED。Seller Protection 是 NOT_ELIGIBLE，也拿到了網路交易編號。
- **第一次存卡和之後扣款（A17）**：第一次存卡標 FIRST，回傳網路交易編號和 PayPal 客戶 ID。下一次凍結帶上那個編號，授權 CREATED。
- **卡片被拒（O2）**：持卡人姓名填 CCREJECT-REFUSED，授權 DENIED；AVS 回 G、CVV 回 P、回應碼 0500。凍結會標成失敗，並寫明原因。
- **每段收款的帳單文字、退款對帳編號、查退款（B1–B3）**：收款 COMPLETED，退款 COMPLETED，查詢也是 COMPLETED。
- **不付款先存卡（E1）**：setup token 直接 APPROVED，轉成卡片 token（VISA •••• 1881），之後刪除。
- **不付款先存 Venmo（E5）**：PayPal 回了核准連結。
- **多行明細的帳單（F1–F5、F7）**：送出成功。PayPal 算的總額是 $205.36：$200，加上零件 $65 的 8.25% 稅 $5.36。
  - 記錄現金付款、記錄現金退款、刪除這兩筆紀錄，全部成功。
  - 用工作編號搜尋找到 1 筆。
  - 第一次跑被拒：帳單號碼超過 PayPal 的 25 字上限。已改成限 25 字。
- **預約寄出的帳單（F8–F10）**：狀態 SCHEDULED，寄出前可以修改，也可以刪除。
- **帳單範本（F14）**：改名、改價、列出都成功，測完已刪。
- **月保養（G1–G13）**：全部用測試卡訂閱，**不用買家帳號就 ACTIVE**。
  - 每季收、依行業分類的商品（HEATING_PLUMBING_AC）：通過。
  - 試用期加稅加 2 單位：quantity 回 2。
  - 共用方案，個別訂閱改價：通過。
  - 延後開始：下次扣款日 11/12。
  - 失敗次數上限改成 3、方案改價：通過。
  - 退一筆訂閱付款：**Payments v2 退款可以用**（via v2），不再需要已淘汰的 v1。
  - 方案停用：3 個方案都回 INACTIVE。
- **查單筆 payout（H1）**：上一輪留下的 $1 payout 查到是 UNCLAIMED（RECEIVER_UNREGISTERED），已取消，狀態變 RETURNED，錢退回。
- **Webhook 事件名稱（J1）**：對照 PayPal 的清單，我們 47 個裡有 1 個 PayPal 不認得（CHECKOUT.PAYMENT-APPROVAL.REVERSED）。已移除；伺服器啟動時也會自動檢查並剔除。
- **合作夥伴開通（L1–L3）**：連結建立成功，查回來的權限有 7 項，包含爭議的讀寫。
- **指定錯誤回應（O1）**：INSTRUMENT_DECLINED 回 422。

**PayPal 擋下的**
- 一次放款多筆（H4）：403 NOT_AUTHORIZED，要 PayPal 開通平台夥伴和正式 BN 代碼。
- Tracking v1（M4）：403，要額外權限。
- sandbox 建爭議（I10）：仍然回 500。
- 改單位數（G14）：PayPal 沒有回核准連結，原因還不確定。

**沒做的原因**
- **A3**：凍結款是服務費，沒有稅；帳單和月保養的稅已經用 F1、G4 做了。
- **A6**：沒有適合用「訪客落地頁」的情境。
- **A15**：sandbox 拒絕訂單上的 AVS_CVV（INVALID_PARAMETER_VALUE）。
- **C4**：頁內訂閱按鈕；月保養改用卡片直接訂閱（G1），不需要核准頁。
- **C26**：換成官方 React 套件等於重寫已經能用的程式，離截止只剩 5 天，風險太高。
- **C27、C28**：v6 的 Marks API 沒有確認；v5 的 revise 不適用。
- **D6、L5、L7、M6–M8、N7**：要填 PayPal 的申請表或找業務。
- **F15**：附件要一個公開的網址，目前沒有。
- **F16、F17**：和月保養功能重複，或者不適合。
- **I2**：要先有真的爭議，才知道 PayPal 要哪種證據。
- **M9**：要手機、買家帳號和 PayPal 核准。
- **N1、N2**：故意不做。透過 MCP 直接開帳單會跳過 VeriPay 的完工檢查。
- **N5**：要員工的 PayPal 登入。
- **N8**：禮物卡，不適合。
- **O3**：批次建 sandbox 帳號要在 PayPal 後台上傳，必須你本人操作。
- **O4**：要先有爭議。

**留在 sandbox 的測試資料**
- 卡片授權：都已取消。
- 卡片收款：3 筆，$12（退 $1）、$13（沒退）、$12（退 $2）。
- 訂閱：4 筆，都已取消；3 個方案已停用。共用方案本來就要留著用，保持啟用。
- 帳單：都已取消或刪除。
- 合作夥伴邀請連結：1 個。
- 商品：依行業分類的 1 個，以及之前的「zz r9 probe」。

## 六、瀏覽器與 sandbox 實測（2026-11-07 晚，8812 sandbox 伺服器）

你登入 sandbox 買家帳號、在 PayPal 視窗按了核准；其餘由我在瀏覽器面板裡操作。上面「網頁程式做好，瀏覽器還沒驗」的項目，這次驗了下列幾項；表格裡的項數沒有重算。

**畫面上出現且能用的**
- Pay Later v6 訊息（`<paypal-message>`）：工作頁顯示「As low as $21.02/mo」。
- PayPal 按鈕（v6、commit:false）：按下後開 PayPal 視窗，核准後伺服器授權成功。
- 訂單明細：PayPal 視窗顯示「Labor: Fix a leaking faucet $220」。
- 卡片欄位、PayPal 的卡片頁（訪客卡）、Google Pay、Fastlane 都有載入。卡號沒有在 PayPal 的欄位裡實際輸入。
- 「試一張銀行會拒絕的卡」按鈕。
- 可用付款方式清單（findEligibleMethods）：原本顯示「[object Object]」，已修正為讀取 `network` 欄位。

**實際授權的結果**
| 工作 | 付款方式 | 結果 |
|---|---|---|
| job_e03ce40885（$220） | PayPal，買家在視窗核准 | 授權成功；Seller Protection ELIGIBLE（ITEM_NOT_RECEIVED、UNAUTHORIZED_TRANSACTION）；PayPal 存進 vault，附 customer id |
| job_f5d50f6844（$220） | 剛存好的 PayPal，買家不在場（A18） | 授權成功，不用核准；stored_credential `UNSCHEDULED_POSTPAID` 被接受；Seller Protection ELIGIBLE |
| job_13efc49af4（$165） | sandbox 測試卡，持卡人名 CCREJECT-REFUSED | 如預期被拒：DENIED，處理代碼 0500 |
| 同上 | sandbox 測試卡 | 授權成功；CVV 符合（M）、代碼 0000；Seller Protection NOT_ELIGIBLE（卡片付款本來就不適用） |

**發現並修正的問題**
- **UNSUPPORTED_SHIPPING_TYPE**：運送類型 `PICKUP_IN_PERSON`（工地地址）只有在買家核准的 PayPal 錢包訂單上被接受。卡片訂單和已存 PayPal 訂單都回 422。現在只在 PayPal 錢包訂單上帶工地地址。Venmo 訂單改成 `NO_SHIPPING`，避免要求地址卻沒給。測試仍然 388 項全過。

**觀察到的**
- 買家聯絡資訊（payerContact）是空的。因為訂單用 `SET_PROVIDED_ADDRESS`，PayPal 沒有回傳買家填的聯絡方式。
- $220 的凍結款，PayPal 沒有顯示 Pay Later、PayPal Credit 或 Venmo 按鈕。這些按鈕只在符合資格時才出現，桌面瀏覽器沒有 Venmo 是正常的。

**Connect 頁的頁內儲存（JS SDK v6 存付款方式）**
- **頁內存 PayPal**（`createPayPalSavePaymentSession`）：你按按鈕、在 PayPal 視窗核准後，PayPal 存進 vault。存進去的是 paypal token，綁在同一個 PayPal customer id 上。
- **頁內存卡片**（`createCardFieldsSavePaymentSession`）：我在 PayPal 的卡片欄位裡輸入 sandbox 測試卡 4012…1881，送出後存成 VISA •••• 1881（card token，同一個 customer id）。卡號只經過 PayPal 的 iframe，VeriPay 沒有碰到。前後存了兩次，都成功。
- **修正：卡片欄位太高。** PayPal 的欄位是 shadow DOM 裡的 iframe，高度設成 100%，會撐滿外框，原本每格大約 158px。現在由外框 `.pp-field` 固定 52px，凍結頁和 Connect 頁都適用。
- **頁內存 Venmo**：沒有測。桌面瀏覽器上 PayPal 不顯示 Venmo。

**凍結頁的其他付款方式（第二批，同一晚）**
| 工作 | 方式 | 結果 |
|---|---|---|
| job_978a83f8b4（$192） | PayPal 卡片欄位（C14–C17）：我輸入測試卡 | 授權成功 3NK23850N65802145；CVV 符合（M）、代碼 0000；卡片別顯示「Visa」；四格都有效之前「Hold with this card」不能按 |
| job_8b696c54e6（$192） | Fastlane（C25），新 email 走訪客流程 | 授權成功 29F07996NE1935422；CVV 符合、代碼 0000 |
| job_236d15aa82（$250） | 誤點到「demo 測試卡」按鈕：同一張訂單改用卡片（A10） | 授權成功 79486585AY1419610，之後完工放款，收款 $220 |
| 同上，完工後 | 網頁建立月保養：用測試卡、每 3 個月、第一次免費、2 個單位（G1、G2、G6） | 訂閱 I-G2F8HVDCHHJK 直接 ACTIVE，不用核准頁；測完已取消 |

**這次在瀏覽器裡發現並修好的問題**
1. **卡片欄位送出到一半被拆掉。** 伺服器建立新訂單時，凍結狀態會先變成 `starting`。頁面輪詢到這個狀態，就把整個「核准凍結」區塊換成「凍結失敗」，PayPal 的卡片欄位因此被移除，送出中斷，訂單一直停在等待核准。現在 `starting` 也算在等待核准，區塊不會被換掉。Fastlane 和訪客刷卡原本也會遇到同樣的問題。
2. **四格還沒填完，卡片欄位的按鈕就能按。** 事件資料放在 `data` 底下（`data.number.isValid` 等），舊程式讀錯了位置。現在要卡號、到期日、CVV 都有效才能按，卡別也讀 `data.cards[0].niceType`。
3. **無障礙文字被截斷。** PayPal 規定 ariaLabel 和錯誤訊息最多 20 個字元，已經全部縮短。
4. **Fastlane 的卡片元件沒有顯示。** `render()` 只接受 CSS selector 字串，傳 DOM 元素會失敗（「FastlanePaymentComponent render failed」），而且舊程式把錯誤吞掉了。現在改用 id selector，並等 React 把容器放上頁面之後才 render。Fastlane 的浮水印也是同一個原因沒出現，一起修好了。
5. **訪客刷卡的按鈕不顯示。** `<paypal-basic-card-button>` 必須放在 `<paypal-basic-card-container>` 裡面，單獨放會是 `display:none`。session 也要傳 `targetElement`。兩個都補上之後，按鈕顯示為「Debit or Credit Card」，按下後 PayPal 在頁面內展開刷卡表單。
6. **月保養顯示「$90 a month」，但其實是每 3 個月扣一次。** 現在依週期顯示「every 3 months / every 6 months / a year」，有免費第一次的也會標出來。
7. **取消月保養後，本地記錄仍是 ACTIVE。** PayPal 那邊已經取消，只是本地沒有更新。現在取消後會記成 CANCELLED，並清掉下次扣款日。

**其他驗證**
- **Pay Later 橫幅（D4）**：「Buy now, pay later. Learn more」在 /how 頁顯示。
- **頁內視窗（C5）**：`presentationMode: "modal"` 會在頁面裡開出 PayPal 的登入畫面，關掉時觸發 onCancel。訪客刷卡用 `"auto"` 時，新視窗被擋掉，PayPal 會自己改在頁面內顯示。
- **PayPal 按鈕的新視窗被擋時**：瀏覽器面板擋掉新視窗，但頁面收不到任何錯誤，所以我們「被擋就改用 modal」的程式在這裡測不到；要在真的瀏覽器裡才看得到。

**還沒驗的**
- 訪客刷卡實際付款：表單打開了，但當時瀏覽器面板一直重排，打的字進不去欄位。
- Pay Later「Learn more」說明視窗（D3）：我點下去被當成開新視窗擋掉，要你本人點。
- PayPal 按鈕在頁內視窗裡完成核准：需要你登入 sandbox 買家帳號。
- Google Pay：要 Google 帳號。
- Apple Pay：要 Safari 和已驗證的網域。
- Venmo：要手機。
- PayPal Credit、Pay Later 按鈕：PayPal 對 $192–$250 的凍結沒有提供。

**留在 sandbox 的新測試資料**
- 3 筆授權沒有取消：55B645936S1284712、6EG4300654358011N、96816957E1305634W。授權會自動過期。
- vault：目前存的是一張測試卡 VISA 1881。測試過程中存過、又刪掉的有 PayPal 2 個、卡片 2 張。
- 第二批：授權 3NK23850N65802145、29F07996NE1935422 還在凍結中，會自動過期。79486585AY1419610 已收款 $220，也已付給師傅（payout batch 2CARPR7FEMG2Q）。訂閱 I-G2F8HVDCHHJK 已取消。job_7d5694dcd9 還在等待核准。
