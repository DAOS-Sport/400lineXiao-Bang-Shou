# LINE 小秘書系統

## Overview
This LINE bot system, "駿斯小助理," acts as a group task management assistant with specialized monitoring features. It integrates with LINE's official API to offer automated task creation, AI-driven task extraction using GPT-4o-mini, reply-triggered scheduled responses for notifications, comprehensive message backup, dedicated water quality monitoring for swimming pools, and wind forecast services. The system employs a headless API architecture, ensuring strict group isolation and a cost-free notification strategy via reply triggers. It automatically identifies tasks from messages containing specific keywords, provides reply-triggered task summaries at defined intervals, includes admin controls, user identification, authorized group management for GPT functions, and permanent message backup. It also offers specialized water quality reports and wind forecasts, both delivered through reply-triggered mechanisms.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### Backend Architecture
- **Framework**: Express.js with TypeScript.
- **API Design**: RESTful headless API with endpoints for LINE webhook processing, health monitoring, and administrative message viewing.
- **Security**: Uses Helmet for security headers, express-rate-limit, and LINE webhook signature validation.

### Database Layer
- **ORM**: Drizzle ORM with PostgreSQL (Neon serverless) for type-safe operations and connection pooling.
- **Schema Design**: Tables for messages（傳入）, **outgoing_messages（Bot 傳出全紀錄：reply / push / quickReply / image / video）**, tasks (group-isolated, serial numbering), admins, authorized groups (for GPT), audit logs, message backups, and system settings. Water quality records are stored via audit logs.
- **完整對話雙向記錄**: `messages` 存所有傳入訊息（webhook event），`outgoing_messages` 存所有 Bot 傳出訊息（含 to / sendType / messageType / text / payload / status / errorMessage / triggeredBy）。lineService 統一在 `replyMessage` / `replyRawMessages` / `replyWithQuickReply` / `replyVideoMessage` / `replyImageMessage` / `pushMessage` / `pushVideoMessage` 內透過 private `logOutgoing()` 自動寫入，成功失敗皆紀錄，紀錄失敗不影響發送。查詢方法：`storage.getOutgoingMessages({ to, sendType, status, start, end })`。
- **Memory Storage**: In-memory caching for water quality data.
- **Indexing**: Strategic indexes on frequently queried fields.
- **Backup Strategy**: Permanent message retention with automated daily backups.

### Message Processing
- **Event Handling**: Asynchronous processing of LINE webhook events.
- **Task Detection**: Automatic task creation based on keywords ("交辦").
- **Water Quality Detection**: Automatic recognition of water quality data in various formats for different groups.
- **Multi-Group Processing**: Supports water quality monitoring for multiple groups with distinct facility types.
- **Storage Strategy**: Raw event preservation in JSONB format.
- **Push Notification**: Direct group push using LINE API's `pushMessage` with rate limiting and retry.

### AI Integration
- **LLM Service**: OpenAI GPT-4o-mini for natural language task extraction and processing suggestions.
- **Context Analysis**: Reviews recent messages for task identification.
- **JSON Output**: Structured task extraction with error handling.
- **Task Suggestions**: GPT-generated concise processing suggestions.

### Scheduling System
- **Cron Jobs**: `node-cron` for scheduling daily task reminders, message backups, water quality reports, and wind forecasts in Asia/Taipei timezone.
- **Reply Trigger System**: A cost-free notification strategy where schedulers mark time slots, and any group message after the scheduled time triggers an automatic, one-time reply. This applies to all notification types.
- **Group Isolation**: Strict per-group task processing.
- **Task Summarization**: AI-powered daily task summaries.
- **Time Range Logic**: Tasks within the past month specific to a group are summarized.
- **Backup Automation**: Automatic daily backup of LINE conversations.
- **Water Quality Monitoring**: Specialized monitoring for multiple swimming pool facilities, including temperature and equipment tracking.
- **Wind Forecast Service**: Dedicated wind and weather prediction for a specific golf driving range, with daily reports and golf course recommendations.

### Authentication & Authorization
- **Multi-layer Security**: Supports Basic Auth and Bearer Token.
- **Admin Controls**: Environment-variable defined admin user IDs.
- **Group Targeting**: Environment-configurable target group IDs.

### Frontend Architecture
- **Client Framework**: React with TypeScript and Vite.
- **UI Components**: shadcn/ui with Radix UI.
- **State Management**: TanStack Query.
- **Styling**: Tailwind CSS.
- **Routing**: Wouter for client-side routing.

### Development & Build System
- **Build Tool**: Vite for fast development and optimized builds.
- **TypeScript**: Strict type checking.
- **Module Resolution**: Path aliases.
- **Hot Reload**: Development server with HMR.

## External Dependencies

### LINE Platform Integration
- **LINE Bot SDK**: `@line/bot-sdk` for message handling, user profiles, and group management.
- **Webhook Processing**: Real-time event processing with signature validation.
- **Message API**: Supports text, replies, and push notifications.

### AI Services
- **OpenAI API**: GPT-4o-mini for task extraction and conversation analysis.
- **Prompt Engineering**: Structured prompts for consistent output.
- **Classifier Upgrade**: Two-pass design — Pass 1 (pure programmatic gate), Pass 2 (GPT-4o-mini with extended output: 5W1H, appliesToRoles, startAt/endAt, recommendedReply, badExample, priority).
- **Supervisor Resolver**: `server/services/supervisorResolver.ts` — queries `users` table with 5-min in-memory cache; falls back to `SUPERVISOR_USER_IDS` env var. `initializeSupervisors()` syncs env var to DB on startup.
- **Candidate Dedup**: `server/services/candidateDedup.ts` — sha256 contentHash (title+summary+groupId+date) prevents duplicate entries within 24h; upgrades confidence on merge.
- **Tests**: `server/__tests__/classifier.test.ts` (Vitest, 13 tests). Run: `npx vitest run server/__tests__/classifier.test.ts`

### Database Services
- **Neon Database**: Serverless PostgreSQL.
- **Drizzle ORM**: Type-safe database operations.

### Scheduling & Time Management
- **node-cron**: Timezone-aware task scheduling.
- **dayjs**: Date manipulation with timezone support.

### Security & Monitoring
- **Crypto Module**: HMAC signature validation.
- **Helmet**: Security headers.
- **Rate Limiting**: Express rate limiting.
- **Audit Logging**: System activity tracking.

### Water Quality Monitoring
- **Dual Recognition System**: RegEx-based parsing and GPT Intelligent Analysis for water quality data.
- **Memory Caching**: In-memory storage for daily data.
- **Data Validation**: Comprehensive validation for parameters.
- **Report Generation**: Automated daily summaries, AI-Generated Analysis Reports, and Real Weather Integration (Central Weather Administration API) for Hsinchu Science Park.
- **Smart Scheduling**: Daily GPT analysis for missed records.
- **Weather-Based Recommendations**: Recommendations influenced by real-time weather, UV index, temperature, and rainfall.

### Customer Satisfaction Survey Integration
- **Google Sheet Integration**: Receives survey data via Google Apps Script webhook (`/api/survey-webhook`), using `onSheetChange` trigger for SurveyCake compatibility.
- **Facility-to-Group Mapping**: Routes feedback to corresponding LINE groups based on facility name.
- **Cost-Free Delivery**: Survey data is stored upon receipt and delivered via reply-trigger mechanism (replyMessage), avoiding pushMessage costs. Surveys are appended to task reminder messages or sent independently when triggered by group messages.
- **Supported Facilities**: 新北高中游泳池&運動中心, 三重商工游泳池&籃球場, 三民高中游泳池, 松山國小室內溫水游泳池, 竹科戶外游泳池, 竹科高爾夫球練習場, 竹科網球場&籃球場.
- **Service File**: `server/services/surveyService.ts`
- **Google Apps Script**: `docs/google-apps-script.js` (uses `onSheetChange` trigger, sheet name `工作表1`)

### Group ID Reference（已同步至 `facilities` DB 表）
| Group ID | Facility | Tier |
|----------|----------|------|
| C66a4b3bb3fbc3dcf52d42626ec512484 | DAOS-新北高中（工作群） | A |
| C6f6f163895d5b528a6ab044015e1a37b | DAOS-三重商工館（工作群） | A |
| C2dc6991e51074dd47d5d275d568318f7 | DAOS-三民館（工作群） | A |
| C9b3c5dfe2e005adafd2ed914714a1930 | 駿斯-松山國小館 | A |
| C50c2a9623a78cc5f5e9f39557e3abfe6 | 駿斯-竹科戶外游泳池 | A |
| C360be1fe6ea876a4df3ca0497bca4e3b | 駿斯-戶外運動園區 | A |
| C2dd9a5fce7c276f2cbfdd02c2342661c | 駿斯-社區&勞務業務群 | B |
| Ce936c6bebb59b8b5683ffbcf97bf20de | 駿斯總部辦公室群 | B |

### Identity & User Architecture（身份分層設計）
- **`users`**：系統內部主鍵（serial id），對應 `employeeId`（員工編號）+ `lineUserId`（LINE UID），角色欄位 `role: admin | supervisor | staff`
- **`user_identity_mappings`**：外部 ID 對應表（provider: line | employee_system | portal），`externalId` 為外部系統實際 ID
- **`facilities`**：館別主表，`lineGroupId` 對應 LINE 工作群，自動 seeded at startup（`server/services/facilitySeeder.ts`）
- **`published_announcements`**：Step 2 已發布公告池，`publishedByUserId` 關聯 `users.id`（非 LINE UID 直連），支援 priority / homeVisibility / effectiveEndAt / needsAck

### Internal API（駿斯工作台 BFF 專用）
- **Router**: `server/routes/internalRoutes.ts`，掛載於 `/api/internal`
- **Auth**: `INTERNAL_API_TOKEN` 環境變數，接受 `Authorization: Bearer <token>`、`X-Internal-Token: <token>`、`X-API-Key: <token>`（constant-time compare）
- **只回 JSON**，不做 LIFF / LINE session 檢查，不做 CORS，適合 server-to-server 呼叫
- `GET /api/internal/facility-home/:groupId/home` — 整合首頁（mustRead + announcements + campaigns + todayShift[] + handover[]）
- `GET /api/internal/facility-home/:groupId/announcements` — 公告列表（支援 ?page=&pageSize=&q=&type=）
- `GET /api/internal/facility-home/:groupId/announcements/:id` — 單筆公告詳情
- `GET /api/internal/facility-home/:groupId/today-shift` — 班表（stub，目前回空陣列）
- `GET /api/internal/facility-home/:groupId/handover` — 交接事項（stub，目前回空陣列）
- 錯誤格式統一為 `{ "message": "..." }`；401 / 404 / 500 皆為 JSON

### Facility Home API
- `GET /api/facility-home/list` — 取得所有啟用中的館別清單（供值班首頁選館用）
- `GET /api/facility-home/:groupId/home` — 館別今日首頁（mustRead 置頂包 + 一般公告包）
- `GET /api/facility-home/:groupId/announcements` — 公告列表（?q= 關鍵字, ?type=, ?page=, ?limit=）
- `GET /api/facility-home/:groupId/announcements/:id` — 單筆詳情（含話術建議、壞範例）

### Duty Page（值班首頁）
- **Route**: `/duty` — 館別選擇頁（列出所有 Tier A/B 館別，點擊進入值班首頁）
- **Route**: `/duty/:groupId` — 館別值班首頁（已核准公告展示）
- **Frontend File**: `client/src/pages/duty.tsx`（館別選擇器 + 值班公告板合一）
- **Layout**: 手機/平板優先，sticky header 顯示館名與更新時間，底部固定導覽列
- **mustRead 區塊**: 紅色邊框卡片，預設展開，顯示話術建議（綠色）與壞範例（紅色）
- **一般公告**: 可摺疊卡片，展開後顯示補充資訊
- **自動刷新**: 每 60 秒背景重新查詢
- **連結**: 管理後台側邊欄底部有「值班首頁」快捷連結

### Interview Check Module (面試檢核)
- **Service File**: `server/services/interviewCheckService.ts`, `server/services/lifeguardLicenseService.ts`, `server/services/cautionListService.ts`
- **Authorized Users**: 7 人（蔣碩仁、夏凱莉、莊嘉郡、陳柏榮、夏鈺婷、莊嘉容、莊柏彥），定義於 `server/services/initializeAuthorizedUsers.ts`
- **Lifeguard License Query**: 使用 Node.js 原生 `https` 模組 + cheerio 查詢 `isports.sa.gov.tw`（體育署救生員證照查詢系統）
- **SSL Note**: `isports.sa.gov.tw` 的 SSL 證書鏈不完整，目前使用 `rejectUnauthorized: false` 繞過。如果 Node.js 版本有問題，備選方案是改為只更新 SSL 憑證（CA bundle）而非跳過驗證。原本使用 Python 腳本 (`scripts/lifeguard_query.py`) 也有相同 SSL 問題，且 Nix store 路徑在部署後會失效，已棄用。
- **Caution List Query**: 透過 RAGIC API 查詢慎用名單（`RAGIC_CAUTION_API_KEY`）
- **Parallel Queries**: 救生員證照和慎用名單使用 `Promise.all` 並行查詢，各自有獨立錯誤處理

### Development Tools
- **ESBuild**: Fast bundling.
- **PostCSS**: CSS processing.
- **Replit Integration**: Development environment optimization.