# Operations And Stability

Related: [[00-INDEX]], [[01-System-Overview]], [[02-Route-Map]], [[03-Module-Map]], [[05-External-Integrations]]

## Startup Sequence

1. `server/index.ts` imports `./utils/stableRunner`.
2. Express app installs CORS, JSON, urlencoded, API logging.
3. Startup checks PostgreSQL with `SELECT 1`.
4. Startup initializes:
   - `simpleBackupService.initializeBackupSystem()`
   - `initializeAuthorizedUsers()`
   - `initializeSupervisors()`
   - `keepAliveService.start()`
   - development `processManager.preventRestart()`
5. `registerRoutes(app)` mounts all API/webhook/static routes.
6. `schedulerService.start()` is called inside route registration.
7. `ensureFacilitiesSeeded()` runs asynchronously.
8. Vite dev middleware or production static serving is attached.
9. Server listens on `process.env.PORT || 5000`.

## Package Scripts

| Script | Command | Notes |
|---|---|---|
| `npm run dev` | `NODE_ENV=development tsx server/index.ts` | Replit/Linux-style env assignment; may not run directly in Windows PowerShell without adaptation. |
| `npm run build` | `vite build && esbuild server/index.ts ...` | Builds client and server bundle. |
| `npm start` | `NODE_ENV=production node dist/index.js` | Production bundle entry. |
| `npm run check` | `tsc` | TypeScript check. During earlier local inspection, `tsc` crashed in this Windows/Node environment without diagnostics. |
| `npm run db:push` | `drizzle-kit push` | Database-mutating; not run during documentation. |

## Scheduled Jobs

Defined in `server/services/schedulerService.ts`.

| Schedule | Purpose | Delivery mode |
|---|---|---|
| 06:30, 09:00, 11:00, 15:00, 17:00, 20:00 | Mark task reminder availability. | Reply-trigger/task summary flow. |
| 02:00 | Daily backup. | DB/backup side effects. |
| 13:00, 17:30, 20:30 | Mark water quality report availability. | Reply-trigger delivery. |
| 21:00 | GPT water quality analysis. | AI + possible storage/LINE behavior. |
| 06:30, 12:00, 17:00 | Combined weather/wind forecast. | Direct LINE push when invoked by job. |

## Health and Monitoring

| Surface | Purpose | Notes |
|---|---|---|
| `GET /health` | Basic service/keep-alive status. | Public. |
| `GET /api/admin/dashboard/services-health` | Dashboard service card health. | Public in current code. |
| `GET /api/admin/service-status` | Aggregated DB/LINE/Gemini/OpenAI/announcement health. | Admin auth due mount. |
| `POST /api/admin/service-status/snapshot` | Store manual health snapshot. | Admin auth; DB write. |
| `POST /api/admin/service-status/push` | Push health snapshot to external dashboard webhook. | Admin auth; external side effect. |
| `GET /api/internal/service-health` | Internal server-to-server health. | Internal token. |
| `GET /api/internal/service-health/snapshots` | Internal snapshot history. | Internal token. |
| `GET /api/admin/announcements/health` | Announcement pipeline health. | No auth in current mount. |

## Stability Rules For Future Work

- Treat route/auth docs as current-state documentation, not desired-state approval.
- Do not run LINE-send scripts or manual trigger endpoints unless explicitly requested.
- Do not run `db:push`, seed scripts, or write-heavy replay endpoints against production-like DB unless explicitly requested.
- Preserve group isolation when changing tasks, announcements, facility home, water, or survey logic.
- Keep `lineService` as the central outbound path so `outgoing_messages` remains complete.
- Before changing Ragic or identity code, inspect current working tree because this area already has local modifications.

## Known Risks Recorded But Not Fixed

| Risk | Current location | Impact | Suggested later fix |
|---|---|---|---|
| LINE signature verification bypassed. | `server/middleware/lineSignature.ts` | Webhook route accepts requests without real signature validation. | Re-enable HMAC validation and test against LINE payload/raw body. |
| Env var naming mismatch. | `.env.example`, `lineService.ts`, `lineSignature.ts` | Replit secrets may be configured with wrong names. | Align docs/example/runtime names after confirming deployment secrets. |
| Some admin-like endpoints lack auth. | `server/routes.ts`, announcement health/router mount | Sensitive data/control routes may be public. | Add auth deliberately after checking frontend/Replit access expectations. |
| Large mixed route file. | `server/routes.ts` | Hard to audit; route auth and side effects are scattered. | Extract feature routers in small batches with route parity tests. |
| Hardcoded group IDs. | routes, scheduler, announcement config, facility seeder | Facility changes require code edits in multiple places. | Centralize group/facility config in DB/admin surface. |
| External API fallbacks can hide degraded behavior. | weather/Ragic/AI services | Mock/fallback may look healthy to operators. | Distinguish `mock`, `degraded`, and `live` in health responses. |
| Windows local toolchain issue observed. | `npm ci`, `tsc` local run | Local check/build may fail independent of repo logic. | Investigate Node/esbuild/TypeScript crash separately. |

## Safe Validation Commands

These are read-only or documentation-only checks:

```powershell
git status --short
rg -n "app\.(get|post|patch|delete)|router\.(get|post|patch|delete)|<Route" server client/src
rg --files server/services server/routes server/middleware shared client/src/pages
rg -n "CHANNEL_ACCESS_TOKEN|CHANNEL_SECRET|LINE_CHANNEL" .env.example server docs
```

Avoid these unless explicitly authorized:

```powershell
npm run db:push
tsx scripts/seed_whitelist.ts
tsx server/scripts/manualPush.ts
tsx server/scripts/emergencyBroadcast.ts
curl -X POST /api/admin/trigger-tasks
curl -X POST /api/admin/trigger-combined-forecast
```
