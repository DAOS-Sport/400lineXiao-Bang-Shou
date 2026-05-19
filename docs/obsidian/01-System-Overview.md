# System Overview

Related: [[00-INDEX]], [[02-Route-Map]], [[03-Module-Map]], [[04-Data-Model]], [[05-External-Integrations]], [[06-Operations-And-Stability]]

## Purpose

`400lineXiao-Bang-Shou` is the Replit-deployed backend and companion web UI for the company LINE bot "駿斯小助理". It receives LINE webhook events, stores message history, manages group tasks, runs announcement classification, supports water/weather/report workflows, and exposes admin/internal APIs for dashboards and adjacent systems.

## Main Runtime Shape

| Area | Current implementation | Source |
|---|---|---|
| Web server | Express + TypeScript | `server/index.ts`, `server/routes.ts` |
| Frontend | React + Vite + Wouter + TanStack Query + shadcn/ui | `client/src/App.tsx`, `client/src/pages/*` |
| Database | PostgreSQL through Drizzle ORM | `server/db.ts`, `shared/schema.ts` |
| LINE integration | `@line/bot-sdk`, reply/push helpers, webhook processing | `server/services/lineService.ts`, `server/routes.ts` |
| AI | OpenAI for tasks/assistant/water analysis; Gemini for announcement classification | `server/services/llmService.ts`, `server/services/ai-agent/aiAgentService.ts`, `server/services/announcement/*` |
| Scheduling | `node-cron` schedules task reminders, backups, water reports, and weather/forecast reports | `server/services/schedulerService.ts` |
| Admin/internal APIs | Admin routes, announcement review routes, facility-home routes, server-to-server internal routes | `server/routes.ts`, `server/routes/*` |

## High-Level Flow

1. `server/index.ts` creates the Express app, installs global JSON/urlencoded middleware, initializes the database-backed services, then calls `registerRoutes(app)`.
2. `server/routes.ts` registers global middleware, static assets, health/admin routes, LINE webhook, survey webhook, and mounted routers.
3. LINE text/location/postback events enter `processWebhookEvent()` and branch into task, GPS, announcement ingest, AI assistant, interview check, water quality, weather, and admin command flows.
4. Outgoing LINE messages go through `lineService`, which attempts to record sent/failed outbound messages in `outgoing_messages`.
5. React pages call `/api/*` routes for dashboard, admin console, announcement review, announcement listing, and duty/facility home views.
6. Internal server-to-server consumers use `/api/internal/*` with `INTERNAL_API_TOKEN`.

## Major User-Facing Capabilities

- LINE group task management: create tasks with `交辦`, mark tasks complete, query pending tasks.
- LINE AI assistant: `@小幫手` command surface with registered skills.
- Announcement classifier and review: group messages become candidate announcements, then can be approved/published.
- Duty/facility home: public-style pages and APIs for must-read and normal published announcements.
- Interview and employee checks: ID lookup, lifeguard license check, caution-list/Ragic lookup.
- Water quality and weather: water record parsing, scheduled reports, CWA-backed forecast logic with mock fallback when keys are missing.
- Survey feedback: Google Apps Script webhook stores customer survey feedback for later LINE delivery.
- Monitoring: service health snapshots and optional dashboard webhook push.

## Current Sources of Truth

- Route truth: `server/routes.ts`, `server/routes/*.ts`, `client/src/App.tsx`.
- Data truth: `shared/schema.ts`, `shared/waterQualitySchema.ts`.
- Operational context: `replit.md`, `docs/外部服務清單.md`, `.env.example`, `package.json`.
- Background snapshot: `C:\Users\ians0\Downloads\replit (7).md`; compared as a reference, not copied as authority.

## Stability Boundary

This documentation set records the current system. It intentionally does not:

- fix signature validation,
- rename environment variables,
- change route authentication,
- run migrations,
- call external services,
- send LINE messages,
- deploy to Replit.
