# Route Map

Related: [[00-INDEX]], [[01-System-Overview]], [[03-Module-Map]], [[05-External-Integrations]], [[06-Operations-And-Stability]]

## Route Auth Legend

- `None`: no explicit auth middleware in the route.
- `LINE signature`: route calls `validateLineSignature`; current implementation bypasses actual validation.
- `Admin auth`: `authMiddleware`, accepts Bearer `ADMIN_TOKEN` or Basic `ADMIN_USER` / `ADMIN_PASS`.
- `Internal token`: `INTERNAL_API_TOKEN` via Authorization Bearer, `X-Internal-Token`, or `X-API-Key`.
- `Survey token`: `SURVEY_WEBHOOK_TOKEN` via `x-survey-token` or query token when configured.

## Express App and Middleware Surfaces

| Surface | Source | Purpose | Stability notes |
|---|---|---|---|
| `app.use(cors())` | `server/index.ts` | Allows cross-origin requests for dashboard/client use. | Broad CORS is current behavior. |
| `app.use(express.json())` / `urlencoded` | `server/index.ts` | Parses normal JSON and form bodies. | `/webhook` also installs raw body middleware later. |
| request logger | `server/index.ts`, `server/routes.ts` | Logs API and request activity. | Logs may include response previews. |
| error handler | `server/index.ts` | Returns JSON error and rethrows. | Re-throw can crash if uncaught by runtime. |
| `app.use('/webhook', express.raw(...))` | `server/routes.ts` | Preserves raw body for LINE signature validation. | Current signature middleware bypasses verification. |
| `app.use('/attached_assets', express.static(...))` | `server/routes.ts` | Serves images/videos for LINE-compatible HTTPS asset URLs. | Public static surface. |
| `app.use(helmet())` | `server/routes.ts` | Security headers. | Applied globally after static setup. |
| global rate limiter | `server/routes.ts` | 1000 requests per 15 minutes with proxy-safe fixed key. | Fixed key makes limit global, not per-client. |

## Core App Routes From `server/routes.ts`

| Method | Path | Source | Purpose | Auth | Services/data | External or LINE send |
|---|---|---|---|---|---|---|
| GET | `/` | `server/routes.ts` | Basic root probe returning `ok`. | None | none | No |
| GET | `/health` | `server/routes.ts` | Health probe with keep-alive status and uptime. | None | `keepAliveService` | No |
| GET | `/api/admin/webhook-ping` | `server/routes.ts` | Round-trip ping for frontend/admin latency checks. | None | in-memory timing only | No |
| GET | `/api/admin/webhook-stats` | `server/routes.ts` | Recent webhook latency and success-rate stats. | None | in-memory `webhookEvents` | No |
| GET | `/api/admin/dashboard/feature-stats` | `server/routes.ts` | Hardcoded group feature enablement stats. | None | static group config | No |
| GET | `/api/admin/tasks/stats` | `server/routes.ts` | Task totals, completion rate, recent task list. | None | `storage.getAllTasks()` | No |
| GET | `/api/admin/attendance/stats` | `server/routes.ts` | GPS attendance stats from messages/audit logs. | None | `storage`, audit logs | No |
| GET | `/api/admin/dashboard/global-apps` | `server/routes.ts` | Dashboard cards for global app status. | None | DB counts where available | No |
| GET | `/api/admin/dashboard/private-services` | `server/routes.ts` | Private service health cards. | None | static/service status | No |
| GET | `/api/admin/dashboard/venue-automations` | `server/routes.ts` | Venue automation feature and schedule overview. | None | static group config | No |
| GET | `/api/admin/dashboard/services-health` | `server/routes.ts` | Service status summary for dashboard. | None | static service notes | No |
| POST | `/api/survey-webhook` | `server/routes.ts` | Receives Google Apps Script/SurveyCake survey payloads. | Survey token if configured | `surveyService` | Not immediately; later reply-trigger can deliver |
| POST | `/webhook` | `server/routes.ts` | LINE webhook entrypoint; processes events asynchronously after `OK`. | LINE signature middleware, currently bypassed | `processWebhookEvent`, many services | Yes, via reply/push depending event |
| POST | `/api/admin/trigger-tasks` | `server/routes.ts` | Manually triggers task summary workflow. | Admin auth | `schedulerService.manualTriggerTaskSummary()` | Yes, LINE push/reply possible |
| POST | `/api/admin/trigger-combined-forecast` | `server/routes.ts` | Manually triggers combined forecast report. | Admin auth | `combinedForecastService` | Yes, LINE push possible |
| GET | `/api/admin/messages` | `server/routes.ts` | Query stored LINE inbound messages for monitoring/admin use. | Admin auth | `storage.getMessages` | No |
| GET | `/api/water-quality/test` | `server/routes.ts` | Runs development water quality tests and returns captured output. | None | `server/test/waterQualityTest.ts` | No |
| GET | `/api/water-quality/report` | `server/routes.ts` | Generates current water quality report JSON. | None | `waterQualityService` | No |
| GET | `/api/ragic/employee/line-id/:lineId` | `server/routes.ts` | Employee lookup by LINE ID. | Admin auth + webhook limiter | `ragicService` | Calls Ragic |
| GET | `/api/ragic/employee/employee-id/:employeeId` | `server/routes.ts` | Employee lookup by employee ID. | Admin auth + webhook limiter | `ragicService` | Calls Ragic |
| GET | `/api/ragic/test` | `server/routes.ts` | Ragic connectivity test. | Admin auth | `ragicService.testConnection()` | Calls Ragic |
| GET | `/api/admin/tasks` | `server/routes.ts` | List tasks with optional `groupId`, `status`, `limit`. | None | `storage` | No |
| GET | `/api/admin/tasks/history/:groupId` | `server/routes.ts` | Group task history. | None | `storage` | No |
| GET | `/api/admin/audit-logs` | `server/routes.ts` | Audit log list with optional category. | None | `storage.getAuditLogs()` | No |
| GET | `/api/admin/interview-users` | `server/routes.ts` | List interview-authorized users. | None | `interview_authorized_users` | No |
| POST | `/api/admin/interview-users` | `server/routes.ts` | Add interview-authorized user. | None | `interview_authorized_users` | No |
| PATCH | `/api/admin/interview-users/:userId` | `server/routes.ts` | Update interview-authorized user flags. | None | `interview_authorized_users` | No |
| DELETE | `/api/admin/interview-users/:userId` | `server/routes.ts` | Delete or disable interview-authorized user depending current implementation. | None | `interview_authorized_users` | No |
| GET | `/api/admin/overview` | `server/routes.ts` | Admin overview route inventory and counts. | None | storage/DB overview | No |
| GET | `/admin` | `server/routes.ts` | Server-rendered legacy admin HTML page. | None | tasks/audit stats | No |

## Mounted Routers

| Mount path | Router | Source | Auth at mount | Notes |
|---|---|---|---|---|
| `/api` | `announcementRouter` | `server/routes/announcementRoutes.ts` | None at mount | Public/admin-like announcement review routes. |
| `/api/admin/announcements` | `announcementHealthRouter` | `server/routes/announcementHealthRoutes.ts` | None at mount | File comments say admin-only, but mount has no `authMiddleware` in current code. |
| `/api/admin` | `adminConsoleRouter` | `server/routes/adminConsoleRoutes.ts` | Admin auth | Whitelist and service status. |
| `/api/facility-home` | `facilityHomeRouter` | `server/routes/facilityHomeRoutes.ts` | None | Public facility/duty homepage API. |
| `/api/internal` | `internalRouter` | `server/routes/internalRoutes.ts` | Internal token inside router | Server-to-server BFF/API surface. |

## Announcement Router Effective Routes

Mounted at `/api`.

| Method | Effective path | Purpose | Auth | Services/data | External or LINE send |
|---|---|---|---|---|---|
| GET | `/api/announcement-dashboard/summary` | Announcement candidate dashboard summary and pipeline stats. | None | `announcementCandidates`, `pipelineStats` | No |
| GET | `/api/announcement-dashboard/pipeline-stats` | Raw pipeline counters. | None | `pipelineStats` | No |
| GET | `/api/announcement-candidates` | List/filter/paginate announcement candidates. | None | `announcementCandidates` | No |
| GET | `/api/announcement-candidates/:id` | Candidate detail and review history. | None | `announcementCandidates`, `announcementReviews` | No |
| POST | `/api/announcement-candidates/:id/approve` | Approve candidate and publish to `published_announcements`. | None | `publishToAnnouncements`, DB writes | No direct LINE send |
| POST | `/api/announcement-candidates/:id/reject` | Reject candidate and write review row. | None | DB writes, `incApproval` | No |
| POST | `/api/announcement-candidates/batch/reclassify` | Re-run classifier for candidate IDs. | None | Gemini classifier, DB writes | Calls Gemini |
| GET | `/api/facility-home/:facilityId/announcements` | Legacy/alternate approved-announcement listing by facility/group ID. | None | `announcementCandidates` | No |
| GET | `/api/announcement-reports/weekly` | Weekly announcement report summary. | None | `announcementCandidates` | No |
| GET | `/api/published-announcements` | List published announcements. | None | `publishedAnnouncements`, `facilities` | No |
| POST | `/api/published-announcements/:id/unpublish` | Archive a published announcement. | None | DB write | No |

## Announcement Health Router Effective Routes

Mounted at `/api/admin/announcements`.

| Method | Effective path | Purpose | Auth | Services/data | External or LINE send |
|---|---|---|---|---|---|
| GET | `/api/admin/announcements/health` | 24h webhook/candidate health and abnormal flags. | None in current mount | `messages`, `announcementCandidates`, `pipelineStats` | No |
| POST | `/api/admin/announcements/replay` | Re-run announcement ingest from existing messages; supports `dryRun`. | None in current mount | `messages`, `ingestMessageForAnnouncement` | No LINE send |
| POST | `/api/admin/announcements/test-gemini` | Call Gemini once and return classification/cost estimate. | None in current mount | Gemini REST API | Calls Gemini |
| POST | `/api/admin/announcements/replay-mock` | Run mock message through ingest pipeline. | None in current mount | `ingestMessageForAnnouncement`, DB candidate count | No LINE send |

## Admin Console Router Effective Routes

Mounted at `/api/admin` with `authMiddleware`.

| Method | Effective path | Purpose | Auth | Services/data | External or LINE send |
|---|---|---|---|---|---|
| GET | `/api/admin/whitelist` | List announcement VIP whitelist users. | Admin auth | `whitelistRepo` | No |
| POST | `/api/admin/whitelist` | Add whitelist user. | Admin auth | `whitelistRepo` DB write | No |
| PATCH | `/api/admin/whitelist/:userId` | Update whitelist user. | Admin auth | `whitelistRepo` DB write | No |
| DELETE | `/api/admin/whitelist/:userId` | Disable whitelist user via `isActive=false`. | Admin auth | `whitelistRepo` DB write | No |
| GET | `/api/admin/service-status` | Aggregate service health. | Admin auth | `healthAggregator` | No |
| POST | `/api/admin/service-status/snapshot` | Store manual health snapshot. | Admin auth | `dashboardPusher.storeHealthSnapshot` | No |
| POST | `/api/admin/service-status/push` | Push health snapshot to dashboard webhook. | Admin auth | `dashboardPusher` | Calls dashboard webhook |
| GET | `/api/admin/service-status/history` | Recent health snapshots by hours. | Admin auth | `healthAggregator.getRecentSnapshots` | No |

## Facility Home Router Effective Routes

Mounted at `/api/facility-home`.

| Method | Effective path | Purpose | Auth | Services/data | External or LINE send |
|---|---|---|---|---|---|
| GET | `/api/facility-home/list` | Active facility list for duty selector. | None | `facilities` | No |
| GET | `/api/facility-home/:groupId/home` | Facility home with must-read and normal announcements. | None | `facilities`, `publishedAnnouncements` | No |
| GET | `/api/facility-home/:groupId/announcements` | Facility announcement list with query/type/pagination. | None | `publishedAnnouncements` | No |
| GET | `/api/facility-home/:groupId/announcements/:id` | Single visible announcement detail. | None | `publishedAnnouncements` | No |

## Internal Router Effective Routes

Mounted at `/api/internal`; all entries pass `requireInternalToken`.

| Method | Effective path | Purpose | Auth | Services/data | External or LINE send |
|---|---|---|---|---|---|
| GET | `/api/internal/facility-home/:groupId/home` | BFF facility home payload with mustRead/announcements/campaigns. | Internal token | `facilities`, `publishedAnnouncements` | No |
| GET | `/api/internal/facility-home/:groupId/announcements` | BFF paginated facility announcements. | Internal token | `publishedAnnouncements` | No |
| GET | `/api/internal/facility-home/:groupId/announcements/:id` | BFF single announcement detail. | Internal token | `publishedAnnouncements` | No |
| GET | `/api/internal/facility-home/:groupId/today-shift` | Stubbed shift list, returns empty items after facility validation. | Internal token | `facilities` | No |
| GET | `/api/internal/facility-home/:groupId/handover` | Stubbed handover list, returns empty items after facility validation. | Internal token | `facilities` | No |
| GET | `/api/internal/announcement-whitelist` | List announcement whitelist users. | Internal token | `whitelistRepo` | No |
| POST | `/api/internal/announcement-whitelist` | Add announcement whitelist user. | Internal token | `whitelistRepo` DB write | No |
| PATCH | `/api/internal/announcement-whitelist/:userId` | Update announcement whitelist user. | Internal token | `whitelistRepo` DB write | No |
| DELETE | `/api/internal/announcement-whitelist/:userId` | Disable announcement whitelist user. | Internal token | `whitelistRepo` DB write | No |
| GET | `/api/internal/service-health` | Internal service health payload. | Internal token | `healthAggregator` | No |
| GET | `/api/internal/service-health/snapshots` | Internal health snapshot history. | Internal token | `healthAggregator` | No |
| GET | `/api/internal/interview-users` | Read-only existing LINE feature authorization list. | Internal token | `interviewAuthorizedUsers` | No |
| GET | `/api/internal/feature-whitelist` | 400LINE feature whitelist master list. | Internal token | `interviewAuthorizedUsers` | No |
| POST | `/api/internal/feature-whitelist` | Upsert feature whitelist user. | Internal token | `interviewAuthorizedUsers` DB write | No |
| PATCH | `/api/internal/feature-whitelist/:lineUserId` | Update feature whitelist flags/status. | Internal token | `interviewAuthorizedUsers` DB write | No |
| GET | `/api/internal/ragic/authorization-candidates` | Search Ragic authorization candidates by query. | Internal token | `RagicService.searchAuthorizationCandidates` | Calls Ragic |

## Internal Monitoring Router Effective Routes

Mounted at `/api/internal/monitoring`; all entries pass `requireInternalToken`.

See also [[07-400QIAN-Open-Endpoints]].

| Method | Effective path | Purpose | Auth | Granted data | External or LINE send |
|---|---|---|---|---|---|
| GET | `/api/internal/monitoring/full-status` | 400LINE Capability Monitoring Contract. | Internal token | overall, summary, domain statuses, capability DTOs, events | No |
| GET | `/api/internal/monitoring/capabilities` | Full capability list. | Internal token | capability DTO rows | No |
| GET | `/api/internal/monitoring/capabilities/:key` | Single capability lookup. | Internal token | one capability DTO or 404 `CAPABILITY_NOT_FOUND` | No |
| GET | `/api/internal/monitoring/events` | Recent monitoring events. | Internal token | severity, domain, message, occurredAt | No |
| GET | `/api/internal/monitoring/snapshots` | Historical service health snapshots. | Internal token | snapshot rows | No |
| GET | `/api/internal/monitoring/routes` | Machine-readable 400QIAN endpoint contract. | Internal token | route tiers, auth, BFF mapping, data grants | No |
| GET | `/api/internal/monitoring/dependencies` | Dependency configured state. | Internal token | dependency rows and usedBy capabilities | No |

## LINE Webhook Message Commands

All commands enter through `POST /webhook` and branch inside `processWebhookEvent()` in `server/routes.ts`.

| Trigger | Purpose | Main handler/services | External or LINE send |
|---|---|---|---|
| LINE postback events | Handles postback actions, including clock-in help. | `handlePostbackEvent` | Replies to LINE |
| location message | GPS clock-in forwarding to schedule system. | fetch to `smart-schedule-manager.replit.app/api/line/webhook`, `lineService.replyMessage` | External schedule API + LINE reply |
| any group text | Async announcement ingest. | `ingestMessageForAnnouncement` | DB/Gemini depending classification |
| `打卡` | Reply with clock-in Flex/card instructions. | route helper + `lineService` | LINE reply |
| `打卡問題` | Reply with GPS clock-in FAQ. | route helper + `lineService` | LINE reply |
| `@小幫手 入職流程` | Static onboarding template/link. | `handleOnboardingQuery` | LINE reply |
| `查詢ID` / `我的ID` | Replies with LINE user/group identifiers. | `handleQueryMyId` | LINE reply |
| `@小幫手 ...` | AI assistant skill response. | `aiAgentService`, `skillRegistry`, Gemini/OpenAI | AI API + LINE reply |
| `面試 <ID>` | Interview/lifeguard/caution check. | `interviewCheckService`, Ragic, isports | External APIs + LINE reply |
| `群組ID` | Replies current group ID. | route helper | LINE reply |
| text containing `交辦` | Create group task, except completion command. | `taskService`, `storage`, optional LLM | LINE reply/push |
| `處理事項` | List pending group tasks. | `storage` | LINE reply/push |
| `交辦XX完成` / `任務XX完成` | Mark task complete. | `taskService`, `storage` | LINE reply/push |
| `查詢代辦事項` | Query open tasks in group. | `storage` | LINE reply |
| `查詢近期代辦事項` | Query recent pending tasks. | `storage` | LINE reply |
| admin text commands | Manual backup/history/task complete by number. | `handleAdminCommands`, backup/task services | LINE reply |
| `天氣` in supported group | Weather report for specific outdoor pool group. | `weatherService` | CWA/mock + LINE reply/push |
| water-quality text in supported groups | Parse and store water records. | `waterQualityService` | DB/audit, possible LINE response |
| fallback extraction | Attempts Junsi assistant extraction in some flows. | `handleJunsiAssistantExtraction` | AI + LINE reply |

## Frontend Wouter Routes

| Path | Component | Source | Purpose | Backend APIs commonly used |
|---|---|---|---|---|
| `/` | `DashboardPage` | `client/src/App.tsx`, `client/src/pages/dashboard.tsx` | Main dashboard. | `/api/admin/dashboard/services-health`, `/api/admin/tasks/stats`, `/api/admin/dashboard/feature-stats`, `/api/admin/audit-logs` |
| `/dashboard` | `DashboardPage` | same as above | Explicit dashboard alias. | same as above |
| `/admin` | `AdminPage` | `client/src/pages/admin.tsx` | Admin console with service, task, logs, user sections. | `/api/admin/*` routes |
| `/admin-dashboard` | `AdminPage` | `client/src/App.tsx` | Admin alias. | `/api/admin/*` routes |
| `/admin/announcements` | `AdminAnnouncementsPage` | `client/src/pages/admin-announcements.tsx` | Announcement review center. | `/api/announcement-candidates*`, `/api/admin/announcements/*` |
| `/announcements` | `AnnouncementsPage` | `client/src/pages/announcements.tsx` | Announcement candidates/listing. | `/api/announcement-candidates`, `/api/announcement-dashboard/*` |
| `/announcements/summary` | `AnnouncementsSummaryPage` | `client/src/pages/announcements-summary.tsx` | Announcement summary view. | `/api/announcement-dashboard/summary` |
| `/duty` | `DutyPage` | `client/src/pages/duty.tsx` | Facility selector. | `/api/facility-home/list` |
| `/duty/:groupId` | `DutyPage` | `client/src/pages/duty.tsx` | Facility duty homepage. | `/api/facility-home/:groupId/home`, announcement details |
| fallback | `NotFound` | `client/src/pages/not-found.tsx` | Unmatched route page. | No required API |
