# Validation Report

Related: [[00-INDEX]], [[02-Route-Map]], [[03-Module-Map]], [[06-Operations-And-Stability]]

## Validation Date

- 2026-05-19 Asia/Taipei

## Commands Run

```powershell
git status --short
git diff --name-only
rg -n "app\.(get|post|patch|delete)|router\.(get|post|patch|delete)|<Route" server client/src
rg --files server/services server/routes server/middleware shared client/src/pages
rg -n "(announcementRouter|announcementHealthRouter|facilityHomeRouter|internalRouter|adminConsoleRouter)\.(get|post|put|patch|delete)" server\routes -g "*.ts"
rg -n "app\.(get|post|patch|delete)|<(Route)|adminConsoleRouter\.(get|post|patch|delete)|announcementRouter\.(get|post|patch|delete)|announcementHealthRouter\.(get|post|patch|delete)|facilityHomeRouter\.(get|post|patch|delete)|internalRouter\.(get|post|patch|delete)" server client/src
rg -n "^# " docs\obsidian -g "*.md"
rg -n "<common secret markers and token-like assignments>" docs\obsidian
git ls-files --others --exclude-standard docs/obsidian
```

## Results

| Check | Result |
|---|---|
| Obsidian docs created | Pass: 7 content docs plus this validation report under `docs/obsidian/`. |
| Runtime code untouched by this pass | Pass for intended scope: this pass only added `docs/obsidian/*.md`. |
| Pre-existing dirty files preserved | Pass: existing dirty files were not edited by this documentation pass. |
| Route scan | Pass: enhanced route scan found 85 route-like entries including app routes, named routers, and frontend Wouter routes; [[02-Route-Map]] documents the effective routes. |
| Module scan | Pass: service/router/middleware/shared/page file list was reviewed and summarized in [[03-Module-Map]]. |
| Headings | Pass: every Obsidian doc has a top-level heading. |
| Secret scan | Pass with false positives only: matches were generic text like `Bearer token` and `audit_logs`, not real credentials. |
| External docs comparison | Pass: repo `replit.md` and downloaded `replit (7).md` were used as background; code scan was used as route/module authority. |

## Current Working Tree Notes

`git status --short` showed these pre-existing or unrelated items in addition to the new Obsidian docs:

```text
 M docs/外部服務清單.md
 M server/routes.ts
 M server/routes/adminConsoleRoutes.ts
 M server/routes/internalRoutes.ts
 M server/services/ragicService.ts
?? docs/400QIAN_INTERNAL_API_CONTRACT.md
?? docs/obsidian/
```

These files were not changed by the Obsidian documentation pass except for the new `docs/obsidian/` directory.

## Coverage Summary

- Backend main routes in `server/routes.ts`: documented in [[02-Route-Map]].
- Mounted routers and effective paths:
  - `/api` -> `announcementRouter`
  - `/api/admin/announcements` -> `announcementHealthRouter`
  - `/api/admin` -> `adminConsoleRouter`
  - `/api/facility-home` -> `facilityHomeRouter`
  - `/api/internal` -> `internalRouter`
- Frontend routes from `client/src/App.tsx`: documented in [[02-Route-Map]].
- Major backend modules from `server/services`, `server/routes`, `server/middleware`, `shared`, and `client/src/pages`: documented in [[03-Module-Map]].
- Data tables from `shared/schema.ts` and `shared/waterQualitySchema.ts`: documented in [[04-Data-Model]].

## Remaining Risks

- Documentation now records current state, including security and env-name risks, but does not fix them.
- Some route auth behavior appears weaker than file comments imply; see [[02-Route-Map]] and [[06-Operations-And-Stability]].
- Local toolchain issues observed earlier (`npm ci` postinstall / `tsc` crash) were not re-tested here because this task is documentation-only and should not mutate runtime setup.

## 400QIAN Open Endpoint Validation

Added on 2026-05-19:

```powershell
npm run check
npm run preflight:replit
rg -n "qianOpenRouteContracts|frontendBffRoutes|primaryContractRoutes|writeGovernedRoutes|400QIAN Open Endpoints" server docs
```

Results:

| Check | Result |
|---|---|
| Typecheck | Pass: `npm run check`. |
| Replit preflight | Pass: `npm run preflight:replit`; webhook route, `processWebhookEvent(event)`, GPS forward URL, monitoring route smoke, and unknown capability 404 were verified. |
| Route contract registry | Pass: `qianOpenRouteContracts` and grouped route catalog are registered in `server/services/monitoring/capabilityRegistry.ts`. |
| Data grants | Pass: `qianRouteDataGrants` defines granted fields, forbidden data, and retention notes for 400QIAN-visible routes. |
| Obsidian registration | Pass: [[07-400QIAN-Open-Endpoints]] is linked from [[00-INDEX]], [[02-Route-Map]], and [[03-Module-Map]]. |
