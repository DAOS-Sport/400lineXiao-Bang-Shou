# 400LINE Replit Release / Rollback Checklist

這份清單用於 400LINE 上 Replit 前後檢查。目標是保護目前穩定運作的 LINE Bot，不在未驗證時啟用 LINE signature、DB migration、真實推播或 webhook 改址。

## 上線前 Gate

1. 確認工作範圍
   - 不修改 LINE Developers webhook URL。
   - 不啟用 `validateLineSignature` 的強制驗證。
   - 不執行 `npm run db:push` 或任何 production migration。
   - 不呼叫 LINE push/reply 測試真實群組。

2. 執行本地 gate
   - `npm run check`
   - `npm run preflight:replit`

3. 確認核心路由不變
   - `/webhook` 仍由 `server/routes.ts` 註冊。
   - `processWebhookEvent(event)` 仍由 `/webhook` handler 非同步呼叫。
   - GPS 轉發 URL 仍是 `https://smart-schedule-manager.replit.app/api/line/webhook`。
   - `/api/internal/monitoring/*` 只掛在 `INTERNAL_API_TOKEN` 保護下。

4. 確認 400QIAN 相容
   - 400QIAN 可讀 `/api/internal/monitoring/full-status` 時，顯示 `sourceMode=contract`。
   - full-status 不可用時，400QIAN 必須 fallback 到 legacy API，不可白屏或 500。

## Replit 上線後 Smoke

1. 開啟 Replit app 根路徑，確認 `/` 回 `ok`。
2. 呼叫 `/health`，確認回 JSON 且 status 為可讀狀態。
3. 用 internal token 呼叫：
   - `GET /api/internal/monitoring/routes`
   - `GET /api/internal/monitoring/dependencies`
   - `GET /api/internal/monitoring/capabilities/not-found`，應回 404 `CAPABILITY_NOT_FOUND`。
4. 在 400QIAN 的 `/system/linebot-management` 檢查：
   - 頁面可載入。
   - source 顯示 `contract` 或 `legacy_fallback`。
   - degraded/waiting 狀態可顯示，不造成白屏。

## Rollback

若 Replit 上線後出現 webhook error、LINE Bot 無回應、或 400QIAN 監控白屏：

1. 立即停止繼續改動 webhook、signature、DB、secrets。
2. 回到上一個已知可運行 commit 或 Replit deployment。
3. 保留 Replit logs，記錄：
   - 出錯時間。
   - HTTP status。
   - stack trace 第一個 application frame。
   - 是否與 `/webhook`、`/api/internal/monitoring/*`、或 400QIAN BFF 有關。
4. 若只有 400QIAN 讀取 full-status 失敗，不回滾 400LINE；先確認 fallback 是否顯示 `legacy_fallback`。
5. 若 `/webhook` 失敗，優先回滾 400LINE deployment，不做現場重構。

## 明確延後

- LINE signature 強制驗證。
- webhook handler 拆分。
- DB migration / capability_events 表。
- 真實 LINE push/reply 測試。
- production secret 旋轉。
