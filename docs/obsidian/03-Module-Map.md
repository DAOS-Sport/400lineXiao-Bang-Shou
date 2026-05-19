# Module Map

Related: [[00-INDEX]], [[01-System-Overview]], [[02-Route-Map]], [[04-Data-Model]], [[05-External-Integrations]]

## Entry, Routing, and Server Infrastructure

| Module | Responsibility | Inputs/outputs | Depends on | Risk notes |
|---|---|---|---|---|
| `server/index.ts` | Express app bootstrap, DB connectivity check, startup service initialization, Vite/static setup. | Reads env, starts HTTP server. | `db`, `registerRoutes`, keep-alive/init services. | Exits process when DB check fails. |
| `server/routes.ts` | Main route registration and LINE webhook event dispatcher. | HTTP requests, LINE events; JSON/LINE responses. | most services, middleware, routers. | Large mixed-responsibility file; several admin routes have no auth in current code. |
| `server/routes/announcementRoutes.ts` | Announcement candidate dashboard, review, publish/unpublish, reports. | `/api/announcement-*` requests. | Drizzle DB, classifier, pipeline stats. | Routes are mounted without auth in current code. |
| `server/routes/announcementHealthRoutes.ts` | Announcement health, replay, Gemini test, mock replay. | `/api/admin/announcements/*` requests. | DB, ingest service, Gemini. | File comment says admin-only, but current mount has no `authMiddleware`. |
| `server/routes/adminConsoleRoutes.ts` | Admin whitelist and service-status routes. | `/api/admin/*` under admin auth. | whitelist repo, health aggregator, dashboard pusher. | Existing local modifications detected; this documentation pass does not alter it. |
| `server/routes/facilityHomeRoutes.ts` | Public facility/duty homepage APIs. | groupId, query filters; JSON facility home/list/detail. | `facilities`, `publishedAnnouncements`. | Public unauthenticated surface by design/current behavior. |
| `server/routes/internalRoutes.ts` | Server-to-server BFF APIs for 400QIAN/internal consumers. | `INTERNAL_API_TOKEN`; JSON only. | DB, whitelist repo, health aggregator, Ragic service. | Existing local modifications detected; current docs reflect current working tree. |
| `server/vite.ts` | Dev Vite middleware and production static serving. | Express app/server. | Vite, filesystem. | Dev-only catch-all can mask route issues if mounted incorrectly. |

## Middleware and Utilities

| Module | Responsibility | Inputs/outputs | Depends on | Risk notes |
|---|---|---|---|---|
| `server/middleware/auth.ts` | Admin auth via Bearer token or Basic auth. | HTTP headers. | env: `ADMIN_TOKEN`, `ADMIN_USER`, `ADMIN_PASS`. | Routes must explicitly use it; not all admin-looking routes do. |
| `server/middleware/lineSignature.ts` | Intended LINE HMAC signature validation. | `x-line-signature`, raw body. | env: `CHANNEL_SECRET`. | Current code calls `next()` before validation, so signature is effectively bypassed. |
| `server/utils/time.ts` | Taiwan-time helpers and date ranges. | Date/dayjs helpers. | `dayjs`. | Central for scheduling/report ranges. |
| `server/utils/processManager.ts` | Development restart/process guard helpers. | process signals/state. | Node process. | Development stability behavior only. |
| `server/utils/stableRunner.ts` | Runtime stability optimization import side effect. | Imported at startup. | Node runtime. | Document current behavior before changing. |

## Database and Storage

| Module | Responsibility | Inputs/outputs | Depends on | Risk notes |
|---|---|---|---|---|
| `server/db.ts` | Drizzle and Neon/Postgres pool setup. | `DATABASE_URL`; exports `db`, `pool`. | `@neondatabase/serverless`, `drizzle-orm`. | Throws if `DATABASE_URL` missing. |
| `server/storage.ts` | Repository-style DB operations for messages, tasks, audit logs, outgoing messages, backups/settings. | Typed method calls; DB rows. | `db`, `shared/schema.ts`. | Some methods log/skip errors to avoid blocking runtime. |
| `shared/schema.ts` | Main Drizzle schema and shared types. | Table definitions/types. | Drizzle, Zod. | Several tables model production contract. |
| `shared/waterQualitySchema.ts` | Water quality table schema. | Table definitions/types. | Drizzle. | Separate from audit-log based legacy water storage. |

## LINE and Messaging Services

| Module | Responsibility | Inputs/outputs | Depends on | Risk notes |
|---|---|---|---|---|
| `server/services/lineService.ts` | LINE reply/push/image/video/quick-reply helpers, loading API, outgoing logging, pending message checks. | LINE tokens, replyToken/group/user IDs, message payloads. | `@line/bot-sdk`, `storage`. | Runtime reads `CHANNEL_ACCESS_TOKEN` / `CHANNEL_SECRET`; `.env.example` currently names LINE vars differently. |
| `server/services/messageService.ts` | Store inbound LINE messages. | LINE event data. | `storage`. | Inbound persistence supports audit/announcement flows. |
| `server/services/taskService.ts` | Create, dedupe, complete, summarize tasks; optional OpenAI extraction/suggestions. | message/group/task input; task rows/replies. | `storage`, `OpenAI`. | Group isolation is important; OpenAI failures should not block basic task flows. |
| `server/services/schedulerService.ts` | Cron schedules, reminder marks, manual task summary, backups, water/weather jobs. | cron time slots, group IDs. | `storage`, `lineService`, task/water/weather/backup services. | Can send LINE messages; avoid running manually without intent. |
| `server/services/simpleBackupService.ts` | Daily/manual message backup support. | messages/audit data. | `storage`, filesystem/DB depending method. | Backup volume and retention should be monitored. |
| `server/services/keepAliveService.ts` | Replit/app keep-alive status and periodic behavior. | process/HTTP status. | runtime env. | Used during startup and health response. |

## AI Agent and Skills

| Module | Responsibility | Inputs/outputs | Depends on | Risk notes |
|---|---|---|---|---|
| `server/services/ai-agent/aiAgentService.ts` | `@小幫手` assistant, rate limit, Gemini-first/OpenAI fallback style flow, tool/function calls. | userId/question; LINE reply text/messages. | `skillRegistry`, Gemini/OpenAI env keys. | 20s Gemini timeout is designed around LINE reply token limits. |
| `server/services/ai-agent/skillRegistry.ts` | Registers skills and exposes skill prompt/tool/quick-reply metadata. | skill definitions. | `skills/*.ts`. | New skills should register here. |
| `server/services/ai-agent/types.ts` | Skill, tool, quick-reply TypeScript contracts. | types only. | none. | Public contract for skills. |
| `server/services/ai-agent/skills/taskSkill.ts` | Assistant knowledge/tooling for task system. | AI tool args. | `storage`. | Does not replace core `taskService`. |
| `server/services/ai-agent/skills/interviewSkill.ts` | Assistant guidance for interview check. | prompt context/quick replies. | static skill data. | Operational guidance only. |
| `server/services/ai-agent/skills/waterQualitySkill.ts` | Assistant guidance for water quality. | prompt context/quick replies. | static skill data. | Operational guidance only. |
| `server/services/ai-agent/skills/weatherSkill.ts` | Assistant guidance for weather. | prompt context/quick replies. | static skill data. | Operational guidance only. |
| `server/services/ai-agent/skills/employeeSkill.ts` | Assistant guidance for employee lookup. | prompt context/quick replies. | static skill data. | Operational guidance only. |
| `server/services/ai-agent/skills/surveySkill.ts` | Assistant guidance for survey system. | prompt context/quick replies. | static skill data. | Operational guidance only. |
| `server/services/ai-agent/skills/systemSkill.ts` | Assistant global feature overview. | prompt context/quick replies. | static skill data. | Default overview surface. |
| `server/services/ai-agent/skills/clockInSkill.ts` | Assistant guidance for external clock-in/scheduling system. | prompt context/quick replies. | static skill data. | References independent deployed system. |

## Announcement Pipeline

| Module | Responsibility | Inputs/outputs | Depends on | Risk notes |
|---|---|---|---|---|
| `server/services/announcement/announcementConfig.ts` | Group tier/facility maps, focus groups, VIP fallback, thresholds, keywords. | constants/env-aware behavior. | env for strict modes in related modules. | Hardcoded group IDs are a maintenance point. |
| `server/services/announcement/announcementImportanceClassifier.ts` | Early importance classification: must-read, normal, not announcement. | text/speaker metadata; classification result. | config and regexes. | Avoids sending obvious non-announcements to AI. |
| `server/services/announcement/announcementRuleEngine.ts` | Hard excludes, scoring, rule/AI/drop decisions. | text/group tier/speaker. | config. | Rule changes directly affect candidate volume. |
| `server/services/announcement/announcementClassifierService.ts` | Gemini classification and pass gate. | text/facility/supervisor/gate result. | Gemini REST API, prompt. | Requires `GEMINI_API_KEY`; classifier failures should fail closed. |
| `server/services/announcement/announcementIngestService.ts` | Main ingest pipeline from webhook/replay/mock into candidate DB. | messageId, groupId, userId, displayName, text. | importance, rules, classifier, dedup, DB. | Nonblocking from webhook; DB failures recorded via stats/logs. |
| `server/services/announcement/announcementPreFilterService.ts` | Legacy/compat prefilter wrapper. | text/group/user metadata. | rule engine. | Main logic moved to rule engine. |
| `server/services/announcement/pipelineStats.ts` | In-memory per-day pipeline counters and ingest health. | function calls from pipeline/routes. | none. | Resets in memory on restart. |
| `server/prompts/announcementClassifier.ts` | Gemini/OpenAI system prompt for announcement JSON classification. | prompt text. | classifier services. | Prompt shape is part of output contract. |
| `server/services/candidateDedup.ts` | Announcement content hash and duplicate merging within window. | title/summary/groupId. | DB. | Prevents duplicate candidates, can upgrade confidence. |
| `server/services/supervisorResolver.ts` | Resolve supervisor role from users table with env fallback. | LINE user ID. | `users`, env `SUPERVISOR_USER_IDS`. | Cache must be cleared when role changes. |
| `server/services/admin/whitelistRepo.ts` | Announcement VIP whitelist CRUD/cache. | user data. | `announcementWhitelistUsers`, fallback config. | DB failures fallback to config constants. |

## Interview, Employee, Ragic, and External Lookup

| Module | Responsibility | Inputs/outputs | Depends on | Risk notes |
|---|---|---|---|---|
| `server/services/interviewCheckService.ts` | Orchestrates interview check using lifeguard and caution-list checks. | ID card; formatted result. | lifeguard/caution services. | External lookups can partially fail independently. |
| `server/services/lifeguardLicenseService.ts` | Scrapes public Sports Administration lifeguard certificate site. | ID/name-like query data. | `https`, `cheerio`. | Uses SSL workaround noted in docs. |
| `server/services/cautionListService.ts` | Queries Ragic caution list. | ID/report data. | `RAGIC_API_KEY`, Ragic endpoint. | Requires correct Ragic fields/API key. |
| `server/services/ragicService.ts` | Employee lookup and authorization candidate search via newer SDK/service shape. | LINE ID, employee ID, search q. | `ragic-sdk`, env vars. | Existing local modifications detected; do not overwrite casually. |
| `server/services/ragicService-backup.ts` | Older/backup Ragic implementation. | lookup requests. | fetch/Ragic env vars. | Keep as reference unless intentionally retired. |
| `server/services/ragic-sdk.ts` | Low-level Ragic endpoint, field mapping, retries, timeout, parsing. | raw Ragic API records. | env vars. | Field mapping drift can break lookups. |
| `server/services/initializeAuthorizedUsers.ts` | Seeds default interview-authorized users. | startup call. | DB. | Production data assumptions live here. |

## Water, Weather, Survey, and Facility Services

| Module | Responsibility | Inputs/outputs | Depends on | Risk notes |
|---|---|---|---|---|
| `server/services/waterQualityService.ts` | Parse water quality messages, save records, generate reports, GPT analysis. | group text, groupId, records. | `storage`, `lineService`, `weatherService`, OpenAI. | Supported group IDs are hardcoded in places. |
| `server/services/waterQualityMemoryStore.ts` | In-memory water quality record cache. | record objects. | none. | Data resets on process restart. |
| `server/services/weatherService.ts` | Weather forecast and formatted weather/water advice. | CWA API key or mock fallback. | CWA REST API. | Without key uses simulated data. |
| `server/services/windForecastService.ts` | Wind/golf forecast reports. | CWA data or simplified fallback. | CWA REST API, `lineService`. | Can push LINE reports when invoked. |
| `server/services/combinedForecastService.ts` | Combined weather and wind report generation/push. | time slot/group config. | weather/wind logic, `lineService`. | Manual/scheduled invocation sends LINE messages. |
| `server/services/surveyService.ts` | Facility matching, survey formatting, pending survey storage/summary. | survey webhook payloads. | audit logs/storage, group maps. | Delivery is reply-trigger based. |
| `server/services/facilitySeeder.ts` | Seeds/ensures facility rows and resolves facility IDs by group ID. | startup or helper calls. | `facilities` table. | Group ID map must remain synchronized with docs/config. |

## Monitoring

| Module | Responsibility | Inputs/outputs | Depends on | Risk notes |
|---|---|---|---|---|
| `server/services/monitoring/healthAggregator.ts` | Aggregate DB, LINE, Gemini, OpenAI, and announcement pipeline status. | health payload. | DB/env/pipeline stats. | Key presence is not proof of external API success. |
| `server/services/monitoring/dashboardPusher.ts` | Store health snapshots and optionally POST to external dashboard with HMAC signature. | health payload, webhook URL/secret. | `serviceHealthSnapshots`, fetch. | External push is disabled when URL empty. |
| `server/services/monitoring/capabilityRegistry.ts` | Static 400LINE capability registry, dependency registry, 400QIAN open route catalog, and data grants. | capability definitions, route contracts, data grant metadata. | none. | New 400QIAN-visible routes must be registered here. |
| `server/services/monitoring/capabilityCheckers.ts` | Runtime checkers for database, LINE, messages, outgoing logs, audit categories, tasks, facilities, and snapshots. | capability definitions to status DTO state. | DB, storage tables, LINE bot info API. | Checkers must avoid sending LINE messages or mutating production data. |
| `server/services/monitoring/monitoringAggregator.ts` | Builds full-status, capabilities, events, snapshots, routes, and dependencies payloads. | monitoring route requests to normalized DTOs. | capability registry/checkers, DB audit logs/snapshots. | Cached 30s to avoid heavy polling; route contract must not leak secrets. |
| `server/routes/monitoringRoutes.ts` | Express router for `/api/internal/monitoring/*`. | Internal token requests; JSON monitoring responses. | monitoring aggregator. | Mounted behind `requireInternalToken` in `internalRoutes.ts`. |

## Client Pages

| Page | Purpose | Important API dependencies | Notes |
|---|---|---|---|
| `client/src/App.tsx` | Wouter route declarations and top-level query provider/toaster. | none directly. | Frontend route truth. |
| `client/src/pages/dashboard.tsx` | Main dashboard. | dashboard/task/audit endpoints. | Uses polling via React Query. |
| `client/src/pages/admin.tsx` | Admin console. | service health, task triggers, interview-users, audit logs. | Some API endpoints it uses are unauthenticated in backend current state. |
| `client/src/pages/admin-announcements.tsx` | Announcement review UI. | candidates, approve/reject, replay/Gemini tests. | Writes DB via approval/reject APIs. |
| `client/src/pages/announcements.tsx` | Candidate list. | announcement candidates/dashboard APIs. | Public/admin-style view. |
| `client/src/pages/announcements-summary.tsx` | Summary page. | announcement dashboard summary. | Read-only. |
| `client/src/pages/duty.tsx` | Facility selector and duty homepage. | facility-home APIs. | Mobile/tablet-first view. |
| `client/src/pages/not-found.tsx` | Fallback 404 page. | none. | Static page. |
| `client/src/components/ui/*` | shadcn/Radix UI component library. | client-only. | Not documented per component to avoid low-value duplication. |
| `client/src/lib/queryClient.ts` | API request helper and query client config. | fetch. | Shared by pages. |
| `client/src/hooks/*` | UI hooks for mobile/toast. | browser/client state. | Client-only. |

## Scripts and Operational Helpers

| Path group | Purpose | Notes |
|---|---|---|
| `server/scripts/*.ts` | Manual operational scripts for LINE quota, reports, Ragic exploration, water quality, emergency/manual pushes. | Treat as side-effect capable; inspect before running. |
| `scripts/seed_whitelist.ts` | Seeds announcement whitelist data. | DB-writing; do not run without migration/ops intent. |
| `scripts/lifeguard_query.py` | Legacy lifeguard query helper. | Documented as superseded due SSL/Nix path issues. |
| `test-water-quality.js`, `server/test/waterQualityTest.ts` | Water quality test utilities. | May not cover full production stack. |
