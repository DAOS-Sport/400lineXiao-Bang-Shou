# 儀表板遷移指南：搬進 LINE Webhook 專案

## 遷移概覽

將此 React 儀表板整合到你的 LINE Webhook Express 專案 (`line-bot-assistant-ronchen2`)。
遷移後，儀表板和 LINE Bot 共用同一個 Express server，不再需要跨專案代理 API。

---

## 架構變化

```
遷移前：
  [LINE Webhook 專案] ←API代理← [儀表板專案(本專案)]
  
遷移後：
  [LINE Webhook 專案]
    ├── 原有 LINE Bot 邏輯
    ├── 原有 EJS 頁面
    ├── 新增: React 儀表板 (Vite build → 靜態檔案)
    ├── 新增: 打卡異常管理 API (本地 PostgreSQL)
    └── 新增: 通知收件者管理 API
```

---

## 步驟一：需要搬的檔案清單

### 1. 前端原始碼（整個 client/ 目錄）
```
client/
├── src/
│   ├── App.tsx                          # 路由主入口
│   ├── index.css                        # Tailwind + 主題色
│   ├── main.tsx                         # React 入口
│   ├── pages/
│   │   ├── dashboard.tsx                # 營運戰情總覽
│   │   ├── anomaly-reports.tsx          # 打卡異常管理
│   │   ├── announcements.tsx            # 公告審核中心
│   │   ├── announcement-summary.tsx     # 公告分析總覽
│   │   ├── analytics.tsx                # 決策與數據洞察
│   │   ├── operations.tsx               # 跨館資源監控
│   │   ├── hr-audit.tsx                 # HR 與權限稽核
│   │   ├── system-health.tsx            # 微服務健康監控
│   │   └── not-found.tsx                # 404
│   ├── components/
│   │   ├── app-sidebar.tsx              # 側邊欄導航
│   │   └── ui/                          # shadcn 元件（45 個檔案）
│   ├── types/
│   │   └── announcement.ts              # 公告類型定義
│   ├── hooks/
│   │   ├── use-toast.ts
│   │   └── use-mobile.tsx
│   └── lib/
│       ├── queryClient.ts               # TanStack Query 設定
│       └── utils.ts                     # Tailwind merge
├── index.html                           # Vite HTML 入口
```

### 2. 後端路由（需要整合進你的 Express app）

**只需要搬「本地路由」，代理路由不需要了（因為合併後同一個 server）：**

```
需要搬的本地 API 路由（從 server/routes.ts 擷取）：
├── POST   /api/anomaly-report           # 接收打卡異常 + 圖片上傳 + 寄 Email
├── GET    /api/anomaly-reports           # 查全部異常報告（本地 + 外部合併）
├── GET    /api/anomaly-reports/:id       # 查單一報告
├── PATCH  /api/anomaly-reports/:id/resolution   # 更新處理狀態
├── PATCH  /api/anomaly-reports/batch/resolution  # 批次更新
├── DELETE /api/anomaly-reports/:id       # 刪除報告
├── GET    /api/notification-recipients   # 通知收件者列表
├── POST   /api/notification-recipients   # 新增收件者
├── PATCH  /api/notification-recipients/:id  # 修改收件者
├── DELETE /api/notification-recipients/:id  # 刪除收件者
├── POST   /api/test-email               # 測試 Email
├── GET    /api/announcement-candidates/export/all  # 匯出全部公告資料
├── GET    /exports/:filename             # 靜態檔案下載
```

**不需要搬的代理路由（合併後直接呼叫本地）：**
```
以下路由在合併後，前端可直接呼叫你 LINE Webhook 專案已有的 API：
├── GET /api/announcement-dashboard/summary   → 你的專案已有此 API
├── GET /api/announcement-candidates          → 你的專案已有此 API
├── GET /api/announcement-candidates/:id      → 你的專案已有此 API
├── POST /api/announcement-candidates/:id/approve → 你的專案已有此 API
├── POST /api/announcement-candidates/:id/reject  → 你的專案已有此 API
├── GET /api/announcement-reports/weekly       → 你的專案已有此 API
```

### 3. 資料庫 Schema + Storage

```
shared/schema.ts      # Drizzle ORM 定義 (anomalyReports, notificationRecipients 兩張表)
server/storage.ts     # 資料庫操作層 (CRUD)
server/db.ts          # Drizzle 連線設定 (Neon PostgreSQL)
drizzle.config.ts     # Drizzle 設定檔
```

### 4. 設定檔

```
vite.config.ts        # Vite 設定（build 前端用）
tailwind.config.ts    # Tailwind 設定
tsconfig.json         # TypeScript 設定
components.json       # shadcn/ui 設定
postcss.config.js     # PostCSS 設定
```

### 5. 靜態資源

```
uploads/anomaly-reports/   # 異常報告圖片上傳目錄
exports/                   # 匯出 JSON 目錄
```

---

## 步驟二：需要安裝的 npm 套件

### 前端相關
```bash
npm install react react-dom @tanstack/react-query wouter framer-motion recharts lucide-react react-icons react-hook-form @hookform/resolvers react-day-picker date-fns input-otp embla-carousel-react react-resizable-panels vaul cmdk

npm install class-variance-authority clsx tailwind-merge tailwindcss-animate tw-animate-css

npm install @radix-ui/react-accordion @radix-ui/react-alert-dialog @radix-ui/react-aspect-ratio @radix-ui/react-avatar @radix-ui/react-checkbox @radix-ui/react-collapsible @radix-ui/react-context-menu @radix-ui/react-dialog @radix-ui/react-dropdown-menu @radix-ui/react-hover-card @radix-ui/react-label @radix-ui/react-menubar @radix-ui/react-navigation-menu @radix-ui/react-popover @radix-ui/react-progress @radix-ui/react-radio-group @radix-ui/react-scroll-area @radix-ui/react-select @radix-ui/react-separator @radix-ui/react-slider @radix-ui/react-slot @radix-ui/react-switch @radix-ui/react-tabs @radix-ui/react-toast @radix-ui/react-toggle @radix-ui/react-toggle-group @radix-ui/react-tooltip
```

### 後端相關（你可能已有部分）
```bash
npm install multer nodemailer drizzle-orm @neondatabase/serverless drizzle-zod zod ws
```

### 開發工具
```bash
npm install -D vite @vitejs/plugin-react tailwindcss @tailwindcss/vite @tailwindcss/typography autoprefixer postcss typescript drizzle-kit esbuild tsx
npm install -D @types/react @types/react-dom @types/node @types/express @types/multer @types/nodemailer @types/ws
```

---

## 步驟三：整合 Express 服務 React 靜態檔案

在你的 LINE Webhook 專案的 Express app 加入以下設定：

```javascript
// === 方法 A：開發模式（Vite dev server） ===
// 安裝 vite 後，在 Express 啟動時加入：

import { createServer as createViteServer } from 'vite';

const vite = await createViteServer({
  server: { middlewareMode: true },
  appType: 'spa'
});
app.use(vite.middlewares);


// === 方法 B：生產模式（build 後靜態檔案） ===
// 先 build: npx vite build
// 會產出 dist/public/ 目錄

import path from 'path';
import express from 'express';

// API 路由放在前面
app.use('/api', apiRouter);

// 靜態檔案
app.use(express.static(path.join(__dirname, 'dist/public')));

// SPA fallback — 所有非 API 路徑都回傳 index.html
app.get('*', (req, res) => {
  if (!req.path.startsWith('/api')) {
    res.sendFile(path.join(__dirname, 'dist/public/index.html'));
  }
});
```

---

## 步驟四：環境變數

確認你的 LINE Webhook 專案有這些環境變數：

```
DATABASE_URL=postgresql://...        # PostgreSQL（Neon 或其他）
GMAIL_USER=daos.ragic.system@gmail.com
GMAIL_APP_PASSWORD=你的Gmail應用程式密碼
```

---

## 步驟五：前端 API 路徑調整

合併後，前端的 `queryClient.ts` 中的 fetch 不需要改動，因為前後端在同一個 server：
- 前端呼叫 `/api/announcement-candidates` → 直接打到同一個 Express server
- 不再需要代理，所有 API 都是本地路由

唯一要注意的是：**前端 `dashboard.tsx` 裡的 `strictFetch` 和 `safeFetch` 呼叫的外部 URL 需要改成相對路徑**，因為合併後不需要跨 origin 了。

---

## 步驟六：資料庫遷移

```bash
# 在目標專案執行
npx drizzle-kit push
```

這會建立 `anomaly_reports` 和 `notification_recipients` 兩張表。

---

## 重要注意事項

1. **EJS 頁面不受影響** — React 儀表板走 SPA 路由（`/`, `/analytics` 等），你原有的 EJS 頁面如果走不同路徑就不會衝突
2. **路由優先順序** — 確保 API 路由 (`/api/*`) 和 EJS 路由在 SPA fallback 之前註冊
3. **圖片上傳** — `uploads/anomaly-reports/` 目錄需要在目標專案建立
4. **公告 API 代理移除** — 合併後這些 API 已經在同一個 server，前端直接呼叫即可
5. **Smart Schedule 代理** — 如果仍需要 `/api/admin/overview` 和 `/api/admin/interview-users`，保留對 `smart-schedule-manager` 的代理邏輯

---

## 檔案大小參考

| 檔案 | 大小 |
|------|------|
| dashboard.tsx | 63 KB（最大頁面）|
| anomaly-reports.tsx | 48 KB |
| announcements.tsx | 34 KB |
| analytics.tsx | 24 KB |
| server/routes.ts | 28 KB |
| shadcn ui/ 元件 | 45 個檔案 |
| 總前端程式碼 | ~250 KB |
| 總後端新增程式碼 | ~35 KB |
