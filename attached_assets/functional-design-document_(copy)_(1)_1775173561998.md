# DAOS 管理後台 — 功能設計書

> 版本：v2.1 | 更新日期：2026-04-02
> 產品名稱：LINE Bot 系統全局藍圖儀表板
> 客戶：駿斯運動事業 (DAOS)

---

## 一、系統總覽

### 1.1 產品定位

一套企業級 SaaS 管理後台，整合駿斯運動事業旗下的 LINE Bot 監控、打卡出勤管理、AI 公告歸納、場館營運監控等功能，提供即時資料視覺化與操作介面。

### 1.2 核心設計原則

| 原則 | 說明 |
|------|------|
| 零假資料 | 所有數據來自真實 API，無任何 mock/fake/hardcoded 資料 |
| 即時連線 | 前端直接呼叫後端 API，後端代理外部微服務 |
| 暗色/亮色模式 | CSS 變數驅動的完整雙主題支援 |
| 動畫流暢 | 使用 framer-motion 實現頁面級過渡動畫 |
| 國際化 | 全中文介面（繁體中文） |

### 1.3 技術架構

```
┌─────────────────────────────────────────────────────┐
│                      前端 (React + Vite)            │
│  wouter路由 │ TanStack Query │ shadcn/ui │ Tailwind │
└──────────────────────┬──────────────────────────────┘
                       │ HTTP API
┌──────────────────────┴──────────────────────────────┐
│                   後端 (Express)                     │
│  本地路由 (PostgreSQL)  │  代理路由 (外部微服務)     │
│  - 打卡異常 CRUD       │  - LINE Bot API            │
│  - 通知收件者 CRUD     │  - Smart Schedule API      │
│  - Email 通知          │  - 公告候選 API            │
│  - 圖片上傳            │                            │
└──────────────────────┬──────────┬────────────────────┘
                       │          │
              ┌────────┴──┐   ┌──┴────────────────┐
              │ PostgreSQL │   │ 外部微服務         │
              │ (Neon)     │   │ line-bot-assistant │
              │ 2 張資料表 │   │ smart-schedule-mgr │
              └────────────┘   └───────────────────┘
```

### 1.4 外部 API 端點

| 來源服務 | Base URL | 用途 |
|----------|----------|------|
| LINE Bot Assistant | `https://line-bot-assistant-ronchen2.replit.app` | 群組功能統計、任務引擎、打卡出勤、場館自動化、公告歸納 |
| Smart Schedule Manager | `https://smart-schedule-manager.replit.app` | 排班系統總覽、面試授權用戶 |

---

## 二、頁面功能規格

### 2.1 營運戰情總覽 (`/`)

**檔案**：`dashboard.tsx` (1389 行)

**功能概述**：系統級 KPI 總覽頁，匯聚所有微服務的關鍵指標。

**資料來源**（全部即時 API）：
| API | 說明 |
|-----|------|
| `/api/admin/dashboard/feature-stats` | 群組功能啟用統計 |
| `/api/admin/tasks/stats` | 任務引擎 KPI |
| `/api/admin/attendance/stats` | 打卡出勤統計 |
| `/api/admin/dashboard/global-apps` | 全局應用列表 |
| `/api/admin/dashboard/private-services` | 私有服務列表 |
| `/api/admin/dashboard/venue-automations` | 場館自動化 |
| `/api/admin/dashboard/services-health` | 服務健康度 |
| `/api/admin/tasks/history/{groupId}` | 群組任務歷史 |

**UI 區塊**：
1. **場館 ID 對應表** — 將 LINE groupId 對應到可讀場館名稱（`VENUE_NAME_MAP`，18 個場館）
2. **KPI 儀表板** — 打卡成功率、任務完成率、總群組數、功能滲透率
3. **群組功能啟用矩陣** — 各群組的功能開關狀態（表格形式，可展開查看任務歷史）
4. **全局應用程式列表** — 跨群組共用的 Bot 功能
5. **私有服務列表** — 群組專屬服務
6. **服務健康監控** — 各 API 端點即時狀態
7. **天氣資訊區塊** — 各場館即時天氣

**交互行為**：
- 重新整理按鈕：手動觸發所有 API 重新載入
- 群組列展開：點擊群組卡片展開任務歷史抽屜
- 複製 groupId：點擊群組 ID 複製到剪貼簿
- 導航連結：KPI 卡片可跳轉到對應子頁面

---

### 2.2 打卡異常管理 (`/anomaly-reports`)

**檔案**：`anomaly-reports.tsx` (979 行)

**功能概述**：接收並管理來自 LINE Bot 的打卡異常報告，支援合併本地 + 外部資料源。

**資料來源**：
| API | 方法 | 說明 |
|-----|------|------|
| `/api/anomaly-reports` | GET | 合併的異常報告列表（本地 DB + Smart Schedule 外部） |
| `/api/anomaly-reports/:id` | GET | 單一報告詳情 |
| `/api/anomaly-reports/:id/resolution` | PATCH | 更新處理狀態 |
| `/api/anomaly-reports/batch/resolution` | PATCH | 批次更新 |
| `/api/anomaly-reports/:id` | DELETE | 刪除報告 |
| `/api/notification-recipients` | GET/POST | 通知收件者管理 |
| `/api/notification-recipients/:id` | PATCH/DELETE | 編輯/刪除收件者 |
| `/api/test-email` | POST | 測試郵件 |

**UI 區塊**：
1. **統計 KPI 列** — 總報告數、待處理數、已處理數、來源分布
2. **搜尋與篩選** — 關鍵字搜尋、狀態篩選（待處理/已處理）
3. **報告卡片列表** — 可摺疊卡片，摘要顯示：
   - 員工姓名 + 編號
   - 打卡時間（`clockTime`）
   - 距離（`distance`）
   - 場館名稱
   - 處理狀態標籤
   - 資料來源標記（local/external）
4. **展開詳情** — 完整打卡記錄、錯誤訊息、圖片預覽
5. **批次操作** — 全選/反選、批次標記已處理
6. **通知設定面板** — 管理 Email 收件者（新增/啟停/刪除）、測試郵件

**報告欄位**：
```
id, employeeName, employeeCode, role, lineUserId, context,
clockStatus, clockType, clockTime, venueName, distance,
failReason, errorMsg, userNote, imageUrls[], reportText,
resolution (pending|resolved), resolvedNote, createdAt, source
```

**Email 通知觸發**：
- 新異常報告建立 → 發送至 `notifyNewReport=true` 的收件者
- 狀態變更 → 發送至 `notifyResolution=true` 的收件者
- 批次處理 → 發送匯總郵件

---

### 2.3 公告審核中心 (`/announcements`)

**檔案**：`announcements.tsx` (742 行)

**功能概述**：AI 公告歸納器的核心審核介面，管理 LINE 群組中 AI 識別出的公告候選訊息。

**資料來源**：
| API | 方法 | 說明 |
|-----|------|------|
| `/api/announcement-candidates` | GET | 候選列表（支援篩選 + 分頁） |
| `/api/announcement-candidates/:id` | GET | 候選詳情 + 審核歷史 |
| `/api/announcement-candidates/:id/approve` | POST | 核准 |
| `/api/announcement-candidates/:id/reject` | POST | 退回 |

**篩選參數（傳送至 API）**：
```
keyword, status, candidateType, facilityName, groupId,
dateFrom, dateTo, page, pageSize
```

**客戶端專用篩選**：
- `vipFocus` — 僅顯示 VIP 特別關注候選（不傳送至 API）

**候選類型**：
| 類型代碼 | 中文標籤 | Badge 顏色 |
|----------|----------|-----------|
| `rule` | 規則/SOP | 藍色 |
| `notice` | 通知公告 | 紫色 |
| `campaign` | 活動 | 琥珀色 |
| `discount` | 優惠折扣 | 翡翠色 |
| `script` | 標準說詞 | 紅色 |
| `ignore` | 閒聊 | 灰色 |

**候選狀態**：
| 狀態代碼 | 中文標籤 | Badge 顏色 | 可操作 |
|----------|----------|-----------|--------|
| `pending_review` | 待審核 | 琥珀色 | 核准/退回 |
| `approved` | 已核准 | 翡翠色 | - |
| `rejected` | 已退回 | 紅色 | - |
| `ignored` | 已忽略 | 灰色 | 核准/退回 |
| `vip_chat` | VIP 閒聊 | 黃色+邊框 | 核准/退回 |

**VIP 特別關注系統**：
- **辨識邏輯**：`reasoningTags` 包含 "特別關注" 字串 OR `status === "vip_chat"`
- **視覺呈現**：
  - VipTag 元件：黃色圓角標籤 + 星星圖示
  - 卡片外框：黃色光圈 (`ring-2 ring-yellow-400`)
  - "特別關注" 快速篩選按鈕
- **GroupNameBadge**：顯示來源群組名稱
- **來源群組區段**：詳情抽屜中顯示訊息來源群組 + VIP 發送者指示

**詳情抽屜**：
- 候選標題 + 類型/狀態 Badge
- AI 信心度（`confidence`，字串型需 `parseConfidence()` 轉換）
- 摘要（`summary`）
- 原始訊息文字（`originalText`）
- 推薦動作（`recommendedAction`）
- 推薦回覆（`recommendedReply`）
- 反面教材（`badExample`）
- 適用角色（`appliesToRoles[]`）
- 來源群組資訊
- 審核歷史（`reviews[]`）
- 核准/退回按鈕

**分頁控制**：
- 頁碼導航（上一頁/下一頁 + 頁碼按鈕）
- 顯示 `第 N 頁 / 共 M 頁 (T 筆)`

---

### 2.4 公告分析總覽 (`/announcements/summary`)

**檔案**：`announcement-summary.tsx` (338 行)

**功能概述**：公告歸納器的統計分析頁，包含 KPI 面板和圖表。

**資料來源**：
| API | 說明 |
|-----|------|
| `/api/announcement-dashboard/summary` | 今日統計 KPI |
| `/api/announcement-reports/weekly` | 七日趨勢資料 |

**UI 區塊**：
1. **KPI 面板**（5 項）：
   - 今日總訊息數
   - 今日分析數
   - 待審核數
   - 已核准數
   - 已退回數
2. **七日趨勢折線圖**（Recharts LineChart）：
   - X 軸：日期
   - Y 軸：訊息數 / 分析數 / 候選數
3. **類型分布圓餅圖**（Recharts PieChart）：
   - 各候選類型佔比
4. **場館分布長條圖**（Recharts BarChart）：
   - 各場館產生的候選數量

---

### 2.5 決策與數據洞察 (`/analytics`)

**檔案**：`analytics.tsx` (573 行)

**功能概述**：任務引擎深度分析，提供各群組的任務執行效率指標。

**資料來源**：
| API | 說明 |
|-----|------|
| `/api/admin/tasks/stats` | 全域任務統計（含 byGroup 分組） |
| `/api/admin/tasks/history/{groupId}` | 單一群組任務歷史 |

**UI 區塊**：
1. **全域 KPI**：總任務數、完成數、待處理數、完成率
2. **群組排行榜**：依完成率排序的群組列表
3. **群組任務詳情抽屜**：點擊群組後展開任務歷史時間線

---

### 2.6 跨館資源監控 (`/operations`)

**檔案**：`operations.tsx` (194 行)

**功能概述**：場館自動化功能一覽，顯示各場館啟用的功能和排程。

**資料來源**：
| API | 說明 |
|-----|------|
| `/api/admin/dashboard/venue-automations` | 場館自動化列表 |

**UI 區塊**：
1. **統計摘要**：場館總數、排程總數、功能總數
2. **場館卡片**：每個場館顯示啟用的功能列表和排程時間

---

### 2.7 HR 與權限稽核 (`/hr-audit`)

**檔案**：`hr-audit.tsx` (309 行)

**功能概述**：HR 人員查核介面（查黑名單 + 救生員資格），目前後端回傳 503（待體育署 API 接入）。

**資料來源**：
| API | 方法 | 說明 |
|-----|------|------|
| `/api/hr-audit` | POST | 查詢人員（目前回傳 503 佔位） |

**UI 區塊**：
1. **搜尋欄**：輸入姓名或身分證字號
2. **結果面板**（接入後顯示）：
   - 黑名單查核結果
   - 救生員資格驗證結果
3. **空狀態提示**：顯示 API 尚未接入的說明

---

### 2.8 微服務健康監控 (`/system-health`)

**檔案**：`system-health.tsx` (395 行)

**功能概述**：即時探測所有微服務 API 端點的回應狀態。

**監控端點**（6 個）：
| 端點名稱 | URL |
|----------|-----|
| LINE Bot 主服務 | `.../api/admin/dashboard/feature-stats` |
| 任務引擎 API | `.../api/admin/tasks/stats` |
| 打卡出勤 API | `.../api/admin/attendance/stats` |
| 場館自動化 API | `.../api/admin/dashboard/venue-automations` |
| 服務健康狀態 API | `.../api/admin/dashboard/services-health` |
| 公告歸納 API | `.../api/announcement-dashboard/summary` |

**UI 區塊**：
1. **總體狀態**：在線/離線計數
2. **端點卡片**：每個端點顯示
   - 狀態圖示（綠色打勾/紅色警告）
   - 回應時間（毫秒）
   - HTTP 狀態碼
   - 最後探測時間
3. **自動重新探測**：手動刷新按鈕

---

## 三、後端 API 規格

### 3.1 本地路由（PostgreSQL）

#### 打卡異常報告

| 方法 | 路徑 | 說明 |
|------|------|------|
| `POST` | `/api/anomaly-report` | 建立異常報告（multipart/form-data 支援圖片上傳） |
| `GET` | `/api/anomaly-reports` | 取得所有報告（合併本地 + 外部） |
| `GET` | `/api/anomaly-reports/:id` | 取得單一報告（支援 `ext-` 前綴的外部 ID） |
| `PATCH` | `/api/anomaly-reports/:id/resolution` | 更新處理狀態 (`pending` / `resolved`) |
| `PATCH` | `/api/anomaly-reports/batch/resolution` | 批次更新（`ids[]`, `resolution`, `resolvedNote`） |
| `DELETE` | `/api/anomaly-reports/:id` | 刪除報告 |

#### 通知收件者

| 方法 | 路徑 | 說明 |
|------|------|------|
| `GET` | `/api/notification-recipients` | 列出所有收件者 |
| `POST` | `/api/notification-recipients` | 新增收件者 |
| `PATCH` | `/api/notification-recipients/:id` | 修改收件者設定 |
| `DELETE` | `/api/notification-recipients/:id` | 刪除收件者 |

#### 其他

| 方法 | 路徑 | 說明 |
|------|------|------|
| `POST` | `/api/test-email` | 發送測試郵件 |
| `POST` | `/api/hr-audit` | HR 稽核查詢（503 佔位） |
| `GET` | `/api/announcement-candidates/export/all` | 全量匯出公告候選（分頁抓取寫入 JSON） |
| `GET` | `/exports/:filename` | 下載匯出檔案 |

### 3.2 代理路由（外部微服務）

| 方法 | 路徑 | 上游 | 說明 |
|------|------|------|------|
| `GET` | `/api/announcement-dashboard/summary` | LINE Bot | 公告摘要 |
| `GET` | `/api/announcement-candidates` | LINE Bot | 候選列表（透傳 query string） |
| `GET` | `/api/announcement-candidates/:id` | LINE Bot | 候選詳情 |
| `POST` | `/api/announcement-candidates/:id/approve` | LINE Bot | 核准候選 |
| `POST` | `/api/announcement-candidates/:id/reject` | LINE Bot | 退回候選 |
| `GET` | `/api/announcement-reports/weekly` | LINE Bot | 週報 |
| `GET` | `/api/admin/overview` | Smart Schedule | 排班總覽 |
| `GET` | `/api/admin/interview-users` | Smart Schedule | 面試授權 |

---

## 四、資料庫設計

### 4.1 anomaly_reports 表

| 欄位 | 類型 | 說明 |
|------|------|------|
| id | serial PK | 自動遞增 |
| employee_id | integer | 員工 ID |
| employee_name | text | 員工姓名 |
| employee_code | text | 員工編號 |
| role | text | 職位 |
| line_user_id | text | LINE 用戶 ID |
| context | text NOT NULL | 異常類型 |
| clock_status | text | 打卡狀態 |
| clock_type | text | 上班/下班 |
| clock_time | text | 打卡時間 |
| venue_name | text | 場館名稱 |
| distance | text | 打卡距離 |
| fail_reason | text | 失敗原因 |
| error_msg | text | 錯誤訊息 |
| user_note | text | 用戶備註 |
| image_urls | text[] | 圖片路徑陣列 |
| report_text | text | 報告全文 |
| resolution | text DEFAULT 'pending' | 處理狀態 |
| resolved_note | text | 處理備註 |
| created_at | timestamp NOT NULL DEFAULT now() | 建立時間 |

### 4.2 notification_recipients 表

| 欄位 | 類型 | 說明 |
|------|------|------|
| id | serial PK | 自動遞增 |
| email | text NOT NULL | 收件信箱 |
| label | text | 顯示名稱 |
| enabled | boolean DEFAULT true | 是否啟用 |
| notify_new_report | boolean DEFAULT true | 接收新異常通知 |
| notify_resolution | boolean DEFAULT true | 接收處理結果通知 |
| created_at | timestamp NOT NULL DEFAULT now() | 建立時間 |

---

## 五、UI/UX 設計規範

### 5.1 主題系統

- **亮色模式**：白色背景 (#FFFFFF)，淺灰卡片 (#FAFAFA)
- **暗色模式**：深灰背景 (hsl 220 5% 8%)，稍亮卡片 (hsl 220 5% 10%)
- **主色調**：藍色 (hsl 217 91% 60%) — 用於按鈕、側邊欄、超連結
- **破壞性操作**：紅色 (hsl 0 84% 60%) — 用於刪除、退回

### 5.2 字體

| 用途 | 字體 |
|------|------|
| 正文 | Inter |
| 程式碼 | JetBrains Mono |
| 襯線 | Georgia |

### 5.3 動畫

- **容器進場**：`staggerChildren: 0.04~0.08s`，子元素依序淡入
- **卡片進場**：`y: 20 → 0`, `opacity: 0 → 1`, `duration: 0.4~0.5s`
- **頁面切換**：framer-motion `AnimatePresence`
- **載入指示**：Loader2 旋轉動畫

### 5.4 元件庫

- **基礎**：shadcn/ui "new-york" 風格（47 個元件）
- **圖示**：Lucide React（主要）、react-icons/si（品牌 Logo）
- **圖表**：Recharts（折線圖、長條圖、圓餅圖）
- **路由**：wouter
- **狀態管理**：TanStack Query v5（伺服器狀態）

### 5.5 側邊欄

- 寬度：16rem（展開），3rem（收合）
- 三個群組：營運管理（4項）、公告歸納（2項）、系統管理（2項）
- 底部：深色/亮色模式切換按鈕

### 5.6 響應式設計

- `useIsMobile()` hook：768px 斷點
- 側邊欄在行動裝置自動收合
- 卡片佈局在窄螢幕堆疊

---

## 六、Email 通知系統

### 6.1 觸發條件

| 觸發事件 | 發送對象 | 郵件內容 |
|----------|----------|----------|
| 新異常報告 | `notifyNewReport=true` 的收件者 | 員工資訊 + 打卡詳情 + 失敗原因 |
| 單筆狀態變更 | `notifyResolution=true` 的收件者 | 報告 ID + 狀態變更 + 備註 |
| 批次狀態變更 | `notifyResolution=true` 的收件者 | 所有報告摘要 + 數量 |
| 測試郵件 | `notifyNewReport=true` 的收件者 | 測試內容 |

### 6.2 設定

- 發件信箱：`GMAIL_USER` 環境變數
- 應用密碼：`GMAIL_APP_PASSWORD` 環境變數
- 無設定收件者時，使用發件信箱作為預設收件者

---

## 七、匯出功能

### 7.1 公告候選全量匯出

- **端點**：`GET /api/announcement-candidates/export/all`
- **機制**：分頁抓取（100 筆/頁，最多 50 頁安全上限）
- **輸出**：`exports/announcement-candidates-export.json`
- **格式**：
```json
{
  "exportedAt": "ISO 8601",
  "exportedAtTaipei": "台北時間",
  "totalFromApi": 209,
  "totalExported": 209,
  "pagesfetched": 3,
  "candidates": [...]
}
```

---

## 八、圖片上傳系統

- **端點**：`POST /api/anomaly-report`（multipart/form-data）
- **欄位名稱**：`images`, `image`, `files`, `file`, `photo`, `photos`
- **限制**：單檔 10MB，最多 5 張
- **允許格式**：JPEG, PNG, GIF, WebP, HEIC/HEIF
- **儲存路徑**：`uploads/anomaly-reports/`
- **命名規則**：`anomaly-{timestamp}-{random}{ext}`

---

## 九、安全與 CORS

- 全域 CORS 開放（`Access-Control-Allow-Origin: *`）
- 代理呼叫超時：10 秒（`AbortSignal.timeout(10000)`）
- 匯出超時：15 秒
- 檔案上傳白名單過濾（MIME + 副檔名雙重驗證）

---

## 十、環境變數

| 變數名稱 | 用途 | 必填 |
|----------|------|------|
| `DATABASE_URL` | PostgreSQL 連線字串 | 是 |
| `GMAIL_USER` | Gmail 發件信箱 | 否（停用 Email） |
| `GMAIL_APP_PASSWORD` | Gmail 應用程式密碼 | 否（停用 Email） |

---

## 十一、場館 ID 對應表

系統內建 18 個場館的 LINE groupId 對應名稱：

| groupId | 場館名稱 |
|---------|---------|
| C66a4b... | DAOS-新北高中（工作群） |
| C6f6f1... | DAOS-三重商工館（工作群） |
| C2dc69... | DAOS-三民館（工作群） |
| C9b3c5... | 駿斯-松山國小館 |
| C50c2a... | 駿斯-竹科戶外游泳池 |
| C360be... | 駿斯-戶外運動園區 |
| C2dd9a... | 駿斯-社區&勞務業務群 |
| Ce936c... | 駿斯總部辦公室群 |
| Ce8fe6... | 駿斯社區回報群 |
| Cdfff8... | 駿斯松山營運小組 |
| Cc2100... | 駿斯-三蘆區櫃台 |
| C7df14... | 竹科泳池工作群 |
| Cf7ab9... | 駿斯IT技術群 |
| Cd3837... | 松山櫃檯 |
| C6bb64... | DAOS-松山館（工作群） |
| C7ae67... | 棒球練習場工作群 |

---

## 十二、npm 依賴清單

### 生產依賴（67 個）

**前端核心**：react, react-dom, wouter, @tanstack/react-query, framer-motion

**UI 元件**：class-variance-authority, clsx, tailwind-merge, cmdk, vaul, embla-carousel-react, react-resizable-panels, input-otp, react-day-picker, date-fns, lucide-react, react-icons, recharts

**Radix UI**（17 個 @radix-ui 套件）：accordion, alert-dialog, aspect-ratio, avatar, checkbox, collapsible, context-menu, dialog, dropdown-menu, hover-card, label, menubar, navigation-menu, popover, progress, radio-group, scroll-area, select, separator, slider, slot, switch, tabs, toast, toggle, toggle-group, tooltip

**後端**：express, multer, nodemailer, drizzle-orm, @neondatabase/serverless, drizzle-zod, zod, ws, pg

**表單**：react-hook-form, @hookform/resolvers

### 開發依賴（17 個）

vite, @vitejs/plugin-react, tailwindcss, @tailwindcss/vite, @tailwindcss/typography, autoprefixer, postcss, typescript, drizzle-kit, esbuild, tsx + 各 @types 套件
