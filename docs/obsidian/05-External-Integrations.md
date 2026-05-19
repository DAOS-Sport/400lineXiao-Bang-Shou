# External Integrations

Related: [[00-INDEX]], [[01-System-Overview]], [[02-Route-Map]], [[03-Module-Map]], [[06-Operations-And-Stability]]

## Integration Summary

| Service | Purpose | Code surface | Credentials/env | Failure behavior |
|---|---|---|---|---|
| LINE Messaging API | Webhook events, reply/push messages, loading indicator, group/user profile interactions. | `server/routes.ts`, `server/services/lineService.ts` | `CHANNEL_ACCESS_TOKEN`, `CHANNEL_SECRET` | Reply/push failures are logged to `outgoing_messages` where possible. |
| OpenAI | Task extraction, suggestions, water analysis, fallback/assistant support. | `server/services/llmService.ts`, `taskService.ts`, `waterQualityService.ts`, `ai-agent/aiAgentService.ts` | `OPENAI_API_KEY` | Missing key logs warning; feature-specific calls catch failures. |
| Google Gemini REST API | Announcement classification and AI assistant primary call path. | `server/services/announcement/announcementClassifierService.ts`, `server/services/ai-agent/aiAgentService.ts` | `GEMINI_API_KEY`, optional `ANNOUNCEMENT_CLASSIFIER_MODEL` | Timeout/error leads to classification failure/drop behavior or assistant fallback. |
| Central Weather Administration (CWA) | Weather/wind forecast, UV/rain/temperature advice. | `weatherService.ts`, `windForecastService.ts`, `combinedForecastService.ts` | `CWA_API_KEY` | Missing key uses mock/simulated weather/wind data in current services. |
| Ragic | Employee lookup, caution list, authorization candidate search. | `ragicService.ts`, `ragic-sdk.ts`, `cautionListService.ts`, internal/admin Ragic routes | `RAGIC_API_KEY`, `RAGIC_CAUTION_API_KEY`, `RAGIC_DOMAIN`, `RAGIC_DATABASE_ID`, `RAGIC_USERNAME` | Returns lookup errors or 502 in internal candidate search. |
| Sports Administration lifeguard site | Lifeguard license lookup. | `lifeguardLicenseService.ts` | none | Uses SSL workaround; failures are isolated from caution-list result. |
| Google Apps Script / SurveyCake | Survey webhook source. | `POST /api/survey-webhook`, `docs/google-apps-script.js`, `surveyService.ts` | `SURVEY_WEBHOOK_TOKEN` | Token mismatch returns 403 when expected token is configured. |
| External dashboard webhook | Push service-health snapshots. | `dashboardPusher.ts`, admin service-status routes | `DASHBOARD_WEBHOOK_URL`, `DASHBOARD_WEBHOOK_SECRET` | Empty URL disables push; failed push is stored as snapshot status. |
| Smart Schedule Manager | GPS location clock-in forwarding. | `server/routes.ts` location-message branch | forwards `x-forward-secret` from `CHANNEL_SECRET` | Failure replies to LINE with clock-in error. |

## Environment Variable Notes

Runtime code expects:

- `DATABASE_URL`
- `CHANNEL_ACCESS_TOKEN`
- `CHANNEL_SECRET`
- `OPENAI_API_KEY`
- `GEMINI_API_KEY`
- `CWA_API_KEY`
- `RAGIC_API_KEY`
- `RAGIC_CAUTION_API_KEY`
- `RAGIC_DOMAIN`
- `RAGIC_DATABASE_ID`
- `RAGIC_USERNAME`
- `ADMIN_TOKEN`
- `ADMIN_USER`
- `ADMIN_PASS`
- `INTERNAL_API_TOKEN`
- `SURVEY_WEBHOOK_TOKEN`
- `SUPERVISOR_USER_IDS`
- `DASHBOARD_WEBHOOK_URL`
- `DASHBOARD_WEBHOOK_SECRET`
- `DASHBOARD_HEARTBEAT_INTERVAL_MS`
- `ANNOUNCEMENT_CLASSIFIER_MODEL`
- `ANNOUNCEMENT_STRICT_STRONG_KEYWORDS`
- `ANNOUNCEMENT_STRICT_NORMAL_PHRASES`
- `ANNOUNCEMENT_AI_MIN_CONFIDENCE`
- `TZ`
- `PORT`

Known documentation/config drift:

- `.env.example` currently uses `LINE_CHANNEL_SECRET` and `LINE_CHANNEL_ACCESS_TOKEN`.
- `lineService.ts` and `lineSignature.ts` read `CHANNEL_SECRET` and `CHANNEL_ACCESS_TOKEN`.
- This pass records the mismatch but does not change it.

## LINE Integration Details

Inbound:

- LINE should POST events to `/webhook`.
- Route responds `200 OK` quickly, then processes events.
- Raw body middleware is installed for signature verification, but actual signature verification is currently bypassed in `validateLineSignature`.

Outbound:

- `replyMessage`, `replyRawMessages`, `replyWithQuickReply`, `replyImageMessage`, `replyVideoMessage`, `pushMessage`, and related helpers are centralized in `lineService`.
- Outgoing attempts are recorded in `outgoing_messages` with target, type, payload, status, error, and trigger source.

LINE send surfaces:

- task creation/completion/query,
- AI assistant,
- GPS clock-in response,
- weather/wind/combined forecast reports,
- water quality reports,
- survey pending delivery,
- manual admin triggers,
- interview check results,
- onboarding and ID helper responses.

## AI Integration Details

OpenAI:

- Used by `llmService`, `taskService`, `waterQualityService`, and assistant fallback logic.
- Intended model documented as GPT-4o-mini in project docs.

Gemini:

- Announcement classifier uses REST API with forced JSON style output.
- Health/test routes can call Gemini and estimate token/cost.
- Assistant code also has Gemini call path with timeout designed to fit LINE reply-token window.

## Ragic and Identity Integration

- Employee lookup endpoints use `ragicService`.
- Caution-list lookup uses `cautionListService`.
- Internal candidate search uses `RagicService.searchAuthorizationCandidates(q, limit)` from current `server/services/ragicService.ts`.
- Identity tables exist for future or adjacent-system mapping: `users`, `user_identity_mappings`, `interview_authorized_users`.

## External Calls That Should Not Be Run Casually

- Manual forecast/task trigger routes can send LINE messages.
- `server/scripts/manualPush.ts`, `sendReportNow.ts`, `emergencyBroadcast.ts`, and similar scripts can send real messages.
- `db:push`, seed scripts, and write APIs can mutate production-like database state.
