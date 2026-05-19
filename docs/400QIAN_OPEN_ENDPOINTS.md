# 400QIAN Open Endpoints Contract

本文件整理 400LINE 上線後開放給 400QIAN BFF 使用的端點。Browser 前端不直接呼叫 400LINE；前端只呼叫 400QIAN BFF，再由 400QIAN server-to-server 呼叫 400LINE。

## Connection Rule

```txt
400QIAN browser
  -> 400QIAN BFF /api/bff/system/linebot-management/*
    -> 400LINE /api/internal/monitoring/* and approved drill-down routes
```

必要環境變數：

```txt
LINE_BOT_BASE_URL=<400LINE Replit URL>
LINE_BOT_INTERNAL_TOKEN=<400LINE INTERNAL_API_TOKEN>
LINE_BOT_ADMIN_TOKEN=<400LINE ADMIN_TOKEN; legacy fallback only>
```

安全規則：

- `INTERNAL_API_TOKEN`、`ADMIN_TOKEN` 不進 browser。
- 400QIAN 前端只接 400QIAN BFF。
- 400LINE monitoring contract 只回 `configured: true/false`，不回 token、password、API key、secret value。
- `ADMIN_TOKEN` route 僅作 legacy fallback，不作第一優先來源。
- `write-governed` route 不屬於監控頁預設呼叫，必須由 400QIAN 另做 role/audit gate。

## 400QIAN Frontend BFF Routes

| Method | 400QIAN BFF endpoint | Purpose | Primary upstream |
|---|---|---|---|
| GET | `/api/bff/system/linebot-management/overview` | 總覽、overall、sourceMode | `/api/internal/monitoring/full-status` |
| GET | `/api/bff/system/linebot-management/services` | domain / capability 服務狀態 | `/api/internal/monitoring/full-status` |
| GET | `/api/bff/system/linebot-management/facilities` | 館別 / 群組狀態 | `/api/internal/monitoring/full-status` + `/api/facility-home/list` |
| GET | `/api/bff/system/linebot-management/whitelist-snapshot` | 白名單 / 權限 snapshot | `/api/internal/monitoring/full-status` + access-control drill-down |
| GET | `/api/bff/system/linebot-management/announcement-pipeline` | 重要公告管線 | `/api/internal/monitoring/full-status` + announcement health fallback |

### BFF Data Grants

| Endpoint | Granted data | Forbidden data |
|---|---|---|
| `/api/bff/system/linebot-management/overview` | `generatedAt`, `status`, `sourceMode`, `rawStatus`, summary cards, API readiness, notes | tokens, secrets, passwords, raw connection strings |
| `/api/bff/system/linebot-management/services` | service rows, capability raw status, last sync/error timestamps, API readiness | tokens, secrets, raw external API payloads |
| `/api/bff/system/linebot-management/facilities` | facility capability rows, group readiness, source route hints | tokens, secret headers |
| `/api/bff/system/linebot-management/whitelist-snapshot` | authority, sync mode, summary counts, safe whitelist rows, diff status | raw LINE profile payload, token values |
| `/api/bff/system/linebot-management/announcement-pipeline` | stages, counters, employee entry rule, API readiness | raw Gemini/OpenAI prompts or credentials |

## 400LINE Primary Contract Routes

全部使用 `INTERNAL_API_TOKEN`，只給 400QIAN BFF 呼叫。

| Method | Endpoint | Purpose | Granted data |
|---|---|---|---|
| GET | `/api/internal/monitoring/full-status` | 400LINE 總狀態契約，400QIAN primary source | overall, summary, domains, capabilities, events |
| GET | `/api/internal/monitoring/capabilities` | 所有 capability 狀態 | key, label, domain, status, configured, timestamps, dependencies, counters |
| GET | `/api/internal/monitoring/capabilities/:key` | 單一 capability 狀態 | one capability DTO |
| GET | `/api/internal/monitoring/events` | 近期 warn/error/info events | severity, domain, capabilityKey, message, occurredAt |
| GET | `/api/internal/monitoring/snapshots` | service health snapshots | snapshot id, snappedAt, overallStatus, services, webhookStatus |
| GET | `/api/internal/monitoring/routes` | 本文件的機器可讀版 route contract | route groups, dataGrant, auth tier, frontend mapping |
| GET | `/api/internal/monitoring/dependencies` | dependency configured state | dependency key, label, kind, configured, usedBy |

## Read-Only Drill-Down Routes

全部使用 `INTERNAL_API_TOKEN`，給 400QIAN BFF 在 full-status 不夠細時查詢。

| Method | Endpoint | Purpose | Granted data |
|---|---|---|---|
| GET | `/api/internal/facility-home/:groupId/home` | 單一館別首頁資料 | facility metadata, mustRead, announcements, campaigns, empty handover/todayShift placeholders |
| GET | `/api/internal/facility-home/:groupId/announcements` | 單一館別公告列表 | paginated announcement rows |
| GET | `/api/internal/facility-home/:groupId/announcements/:id` | 單一館別公告詳情 | one announcement row |
| GET | `/api/internal/facility-home/:groupId/today-shift` | 單一館別今日班表 placeholder / drill-down | `items[]` |
| GET | `/api/internal/facility-home/:groupId/handover` | 單一館別交接 placeholder / drill-down | `items[]` |
| GET | `/api/internal/interview-users` | 面試 / 慎用授權主控名單 | safe user flags and total |
| GET | `/api/internal/feature-whitelist` | 功能白名單主控 snapshot | authority, generatedAt, total, feature flags, sourceStatus |
| GET | `/api/internal/announcement-whitelist` | 公告 VIP 白名單 snapshot | whitelist rows returned by repo |
| GET | `/api/internal/ragic/authorization-candidates` | Ragic H01/H02 授權候選搜尋 | displayName, lineUserId, phone, department, employeeNumber, sourceTable, matchedBy |
| GET | `/api/internal/service-health` | 舊健康總覽 fallback | old health payload |
| GET | `/api/internal/service-health/snapshots` | 舊健康快照 fallback | snapshot rows and hours |

## Write-Governed Routes

這些不是監控頁預設呼叫。只有當 400QIAN 要做白名單治理頁，且 BFF 已有 role/audit gate，才允許呼叫。

| Method | Endpoint | Purpose |
|---|---|---|
| POST | `/api/internal/announcement-whitelist` | 新增公告 VIP 白名單 |
| PATCH | `/api/internal/announcement-whitelist/:userId` | 更新公告 VIP 白名單 |
| DELETE | `/api/internal/announcement-whitelist/:userId` | 停用公告 VIP 白名單，不實刪 |
| POST | `/api/internal/feature-whitelist` | 新增 / upsert 功能白名單 |
| PATCH | `/api/internal/feature-whitelist/:lineUserId` | 更新功能白名單 |

## Legacy Fallback Routes

這些使用 `ADMIN_TOKEN`。保留是為了 full-status 不可用時 400QIAN 不白屏；不應成為新功能第一來源。

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/admin/announcements/health` | 公告管線 health fallback |
| GET | `/api/admin/interview-users` | 舊 admin 授權名單 fallback |
| GET | `/api/admin/whitelist` | 舊 admin 公告 VIP 白名單 fallback |
| GET | `/api/admin/service-status` | 舊 admin 服務狀態 fallback |
| GET | `/api/admin/service-status/snapshots` | 舊 admin 服務狀態快照 fallback |

## Public Fallback Routes

仍建議由 400QIAN BFF 呼叫並正規化，不讓 browser 直接散打 400LINE。

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/facility-home/list` | 群組 / 館別清單 public read-only fallback |

## Machine-Readable Source

400QIAN 可以用這條路由讀取最新 route contract：

```txt
GET /api/internal/monitoring/routes
```

回傳內容已分組：

```txt
frontendBffRoutes
primaryContractRoutes
readOnlyDrilldownRoutes
writeGovernedRoutes
legacyFallbackRoutes
publicFallbackRoutes
allOpenRoutes
```

每個 route row 會附帶：

```txt
tier
auth
audience
browserDirect
bffEndpoint
dataGrant.scope
dataGrant.fields
dataGrant.forbidden
dataGrant.retention
```

## Release Notes

- 第一優先永遠是 `/api/internal/monitoring/full-status`。
- 若 full-status 失敗，400QIAN BFF 自動 fallback 到 legacy/scatter API。
- LINE signature 仍不啟用，只在 capability contract 中顯示為 disabled / monitoring-only。
- 上線前必跑 `npm run check` 與 `npm run preflight:replit`。

## 10/10 Readiness Definition

這份 contract 達到 10/10 的定義是：

- 端點分層清楚：frontend BFF、primary contract、read-only drill-down、write-governed、legacy fallback、public fallback。
- 每條 route 都標記 auth、audience、browserDirect 與 dataGrant。
- 前端不接觸任何 400LINE secret。
- 400QIAN 可用 `/api/internal/monitoring/routes` 自動讀取最新對接目錄。
- full-status 掛掉時，400QIAN 仍可 fallback，不白屏。
- 上線前 gate 已有 `npm run check` 與 `npm run preflight:replit`。
