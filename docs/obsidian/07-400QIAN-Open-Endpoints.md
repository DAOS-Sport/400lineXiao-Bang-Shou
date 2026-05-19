# 400QIAN Open Endpoints

Related: [[00-INDEX]], [[02-Route-Map]], [[03-Module-Map]], [[05-External-Integrations]], [[06-Operations-And-Stability]]

Source files:

- `server/services/monitoring/capabilityRegistry.ts`
- `server/services/monitoring/monitoringAggregator.ts`
- `server/routes/monitoringRoutes.ts`
- `server/routes/internalRoutes.ts`
- `docs/400QIAN_OPEN_ENDPOINTS.md`

## Contract Rule

```txt
400QIAN browser
  -> 400QIAN BFF /api/bff/system/linebot-management/*
    -> 400LINE approved server-to-server endpoints
```

400QIAN browser must not call 400LINE directly. Tokens stay on the 400QIAN server side.

## Environment Mapping

| 400QIAN env | 400LINE value | Purpose |
|---|---|---|
| `LINE_BOT_BASE_URL` | 400LINE Replit URL | Upstream base URL. |
| `LINE_BOT_INTERNAL_TOKEN` | `INTERNAL_API_TOKEN` | Primary monitoring/read-only token. |
| `LINE_BOT_ADMIN_TOKEN` | `ADMIN_TOKEN` | Legacy fallback only. |

## Frontend BFF

These are the only endpoints the 400QIAN frontend should call.

| Method | Endpoint | Purpose | Upstream |
|---|---|---|---|
| GET | `/api/bff/system/linebot-management/overview` | Total overview. | `/api/internal/monitoring/full-status` |
| GET | `/api/bff/system/linebot-management/services` | Service/capability rows. | `/api/internal/monitoring/full-status` |
| GET | `/api/bff/system/linebot-management/facilities` | Facility/group monitoring. | `/api/internal/monitoring/full-status`, `/api/facility-home/list` |
| GET | `/api/bff/system/linebot-management/whitelist-snapshot` | Whitelist/access snapshot. | full-status plus access-control drill-down |
| GET | `/api/bff/system/linebot-management/announcement-pipeline` | Announcement pipeline status. | full-status plus announcement health fallback |

## 400LINE Primary Contract

| Endpoint | Data granted | Notes |
|---|---|---|
| `/api/internal/monitoring/full-status` | generatedAt, overall, summary, domains, capabilities, events | First source for all monitoring views. |
| `/api/internal/monitoring/capabilities` | capability DTO rows | Use for detailed services table. |
| `/api/internal/monitoring/capabilities/:key` | one capability DTO | Unknown key returns 404 `CAPABILITY_NOT_FOUND`. |
| `/api/internal/monitoring/events` | recent severity/domain/message events | UI timeline. |
| `/api/internal/monitoring/snapshots` | service health snapshots | Trend/history. |
| `/api/internal/monitoring/routes` | route catalog plus data grants | Machine-readable source for this page. |
| `/api/internal/monitoring/dependencies` | dependency configured states | Dependency graph. |

## Drill-Down

| Endpoint | Data granted | Usage |
|---|---|---|
| `/api/internal/facility-home/:groupId/home` | facility metadata, mustRead, announcements, campaigns | Facility detail view. |
| `/api/internal/facility-home/:groupId/announcements` | paginated announcement rows | Facility announcement drill-down. |
| `/api/internal/facility-home/:groupId/announcements/:id` | one announcement row | Detail modal/page. |
| `/api/internal/facility-home/:groupId/today-shift` | `items[]` placeholder | Readiness placeholder. |
| `/api/internal/facility-home/:groupId/handover` | `items[]` placeholder | Readiness placeholder. |
| `/api/internal/interview-users` | safe user flags and total | Access-control diff. |
| `/api/internal/feature-whitelist` | authority, feature flags, sourceStatus | Primary whitelist snapshot. |
| `/api/internal/announcement-whitelist` | whitelist rows | VIP announcement snapshot. |
| `/api/internal/ragic/authorization-candidates` | safe candidate fields | Search only; do not store raw Ragic dumps. |
| `/api/internal/service-health` | old health payload | Legacy fallback. |
| `/api/internal/service-health/snapshots` | old snapshots | Legacy fallback. |

## Write-Governed

These are not part of the monitoring page. They require a dedicated 400QIAN role/audit flow.

| Endpoint | Purpose |
|---|---|
| `POST /api/internal/announcement-whitelist` | Add VIP announcement whitelist user. |
| `PATCH /api/internal/announcement-whitelist/:userId` | Update VIP announcement whitelist user. |
| `DELETE /api/internal/announcement-whitelist/:userId` | Disable VIP announcement whitelist user; not a hard delete. |
| `POST /api/internal/feature-whitelist` | Add/upsert feature whitelist user. |
| `PATCH /api/internal/feature-whitelist/:lineUserId` | Update feature whitelist user. |

## Legacy Fallback

These use `ADMIN_TOKEN` and exist only to prevent 400QIAN from white-screening if full-status is unavailable.

| Endpoint | Usage |
|---|---|
| `/api/admin/announcements/health` | Announcement health fallback. |
| `/api/admin/interview-users` | Old authorization list fallback. |
| `/api/admin/whitelist` | Old VIP whitelist fallback. |
| `/api/admin/service-status` | Old service status fallback. |
| `/api/admin/service-status/snapshots` | Old service snapshot fallback. |

## Forbidden Data

No endpoint should grant:

- raw token values
- passwords
- API keys
- LINE channel access token
- Ragic API key
- database connection string
- raw authorization headers

The contract exposes only `configured: true/false`, readiness status, counters, timestamps, and safe display fields.

## Maintenance Rule

When adding a new 400QIAN-visible 400LINE route:

1. Register it in `qianOpenRouteContracts`.
2. Add a `qianRouteDataGrants` entry.
3. Decide its tier: `primary-contract`, `read-only-drilldown`, `write-governed`, `legacy-fallback`, or `public-fallback`.
4. Keep browser access false.
5. Run `npm run check` and `npm run preflight:replit`.
