# 400QIAN Internal API Contract

這份文件定義 400QIAN / CMS 透過 server-to-server 方式讀取 400LINE 資料時應使用的 API。

## Auth

所有 `/api/internal/*` 端點都必須帶其中一種 header：

- `Authorization: Bearer <INTERNAL_API_TOKEN>`
- `X-Internal-Token: <INTERNAL_API_TOKEN>`
- `X-API-Key: <INTERNAL_API_TOKEN>`

錯誤固定回 JSON：

- `401 { "message": "MISSING_INTERNAL_TOKEN" }`
- `403 { "message": "INVALID_INTERNAL_TOKEN" }`
- `503 { "message": "INTERNAL_TOKEN_NOT_CONFIGURED" }`

## 400LINE 管理總覽

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/internal/service-health` | 即時健康：DB / LINE Bot / Gemini / OpenAI / 公告管線 |
| GET | `/api/internal/service-health/snapshots?hours=24` | 健康歷史快照 |
| GET | `/api/facility-home/list` | 公開館別 / LINE group 清單 |
| GET | `/api/internal/facility-home/:groupId/home` | 單一館別首頁資料 |
| GET | `/api/admin/announcements/health` | 公告管線健康狀態 |

## Feature Whitelist

400LINE 是授權主控；400QIAN 只做 shadow / diff。

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/internal/feature-whitelist` | 讀取所有可使用 LINE 官方功能的人員 |
| POST | `/api/internal/feature-whitelist` | 新增或更新授權人員 |
| PATCH | `/api/internal/feature-whitelist/:lineUserId` | 更新功能開關或停用 |

不提供 destructive DELETE。撤權請用：

```json
{
  "isActive": false
}
```

Response item shape：

```json
{
  "lineUserId": "Uxxxx",
  "displayName": "姓名",
  "phone": null,
  "department": null,
  "employeeNumber": null,
  "isActive": true,
  "status": "active",
  "features": {
    "interview": true,
    "cautionQuery": true,
    "employeeLookup": true,
    "miniAssistant": true,
    "aiAgent": false,
    "vipAnnouncement": false
  },
  "startsAt": null,
  "endsAt": null,
  "unlimited": true,
  "source": "interview_authorized_users"
}
```

目前 `startsAt / endsAt / phone / department / employeeNumber` 先保留為 DTO 欄位；若要正式支援授權期限與 Ragic 快照，需要下一階段補 DB 欄位或 shadow table。

## Ragic Authorization Candidates

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/internal/ragic/authorization-candidates?q=莊&limit=20` | 搜尋可加入白名單的人員候選 |

規則：

- H01 優先。
- H02 fallback 保留在 `sourceStatus.fallback`，目前尚未配置獨立 sheet 時回 `fallbackStatus: "not_configured"`。
- 回傳欄位：姓名、LINE userId、電話、部門、員工編號、來源表。

## Non-delete Compatibility Routes

以下舊 DELETE 路徑保留相容，但語意已改成停用：

- `DELETE /api/internal/announcement-whitelist/:userId`
- `DELETE /api/admin/whitelist/:userId`
- `DELETE /api/admin/interview-users/:userId`

回傳會包含 `action: "disabled"` 或 `message: "DISABLED"`。
