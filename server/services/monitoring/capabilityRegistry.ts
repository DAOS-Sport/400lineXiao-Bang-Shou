export const CAPABILITY_STATUSES = [
  'healthy',
  'degraded',
  'failing',
  'disabled',
  'not_configured',
  'stale',
  'unknown',
] as const;

export type CapabilityStatus = typeof CAPABILITY_STATUSES[number];

export type CapabilityDomainKey =
  | 'runtime'
  | 'line-core'
  | 'facility-groups'
  | 'access-control'
  | 'ai-assistant'
  | 'announcement-pipeline'
  | 'tasks'
  | 'clock-in-gps'
  | 'water-quality'
  | 'weather-cwa'
  | 'survey'
  | 'ragic'
  | 'lifeguard-license'
  | 'admin-audit'
  | 'external-push';

export type CapabilityChecker =
  | 'static'
  | 'database'
  | 'lineBotInfo'
  | 'messageActivity'
  | 'outgoingMessages'
  | 'auditCategory'
  | 'tasks'
  | 'facilityList'
  | 'announcementPipeline'
  | 'serviceSnapshots';

export interface CapabilityDomainDefinition {
  key: CapabilityDomainKey;
  label: string;
}

export interface DependencyDefinition {
  key: string;
  label: string;
  kind: 'runtime' | 'database' | 'line' | 'ai' | 'external-api' | 'internal-service' | 'webhook';
  envKeys?: string[];
  envMode?: 'all' | 'any';
}

export interface CapabilityDefinition {
  key: string;
  label: string;
  domain: CapabilityDomainKey;
  checker: CapabilityChecker;
  enabled: boolean;
  dependencies: string[];
  staleAfterSeconds: number;
  envKeys?: string[];
  envMode?: 'all' | 'any';
  auditCategories?: string[];
  outgoingSendType?: 'reply' | 'push';
  sourceRoutes?: string[];
  notes?: string;
}

export type QianRouteTier =
  | 'primary-contract'
  | 'read-only-drilldown'
  | 'write-governed'
  | 'legacy-fallback'
  | 'public-fallback';

export type QianRouteAuth =
  | 'INTERNAL_API_TOKEN'
  | 'ADMIN_TOKEN'
  | 'public-readonly';

export interface QianRouteContract {
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  path: string;
  purpose: string;
  tier: QianRouteTier;
  auth: QianRouteAuth;
  audience: '400QIAN_BFF';
  browserDirect: false;
  bffEndpoint?: string;
  sourceOf?: string;
  notes?: string;
}

export interface QianRouteDataGrant {
  scope: string;
  fields: string[];
  forbidden: string[];
  retention: string;
}

export const capabilityDomains: CapabilityDomainDefinition[] = [
  { key: 'runtime', label: 'Runtime' },
  { key: 'line-core', label: 'LINE 核心' },
  { key: 'facility-groups', label: '群組 / 館別' },
  { key: 'access-control', label: '白名單 / 權限' },
  { key: 'ai-assistant', label: 'AI 小幫手' },
  { key: 'announcement-pipeline', label: '重要公告管線' },
  { key: 'tasks', label: '交辦 / 任務' },
  { key: 'clock-in-gps', label: 'GPS / 打卡' },
  { key: 'water-quality', label: '水質' },
  { key: 'weather-cwa', label: '天氣 / CWA' },
  { key: 'survey', label: '問卷' },
  { key: 'ragic', label: 'Ragic' },
  { key: 'lifeguard-license', label: 'Lifeguard / 證照' },
  { key: 'admin-audit', label: 'Admin / Audit' },
  { key: 'external-push', label: 'External Push' },
];

export const dependencyRegistry: DependencyDefinition[] = [
  { key: 'express', label: 'Express runtime', kind: 'runtime' },
  { key: 'database', label: 'PostgreSQL / Neon', kind: 'database', envKeys: ['DATABASE_URL'] },
  { key: 'scheduler', label: 'node-cron scheduler', kind: 'internal-service' },
  { key: 'replit', label: 'Replit runtime / keepalive', kind: 'runtime', envKeys: ['REPLIT_DOMAINS', 'REPL_ID', 'REPL_SLUG'], envMode: 'any' },
  { key: 'line.messaging-api', label: 'LINE Messaging API', kind: 'line', envKeys: ['CHANNEL_ACCESS_TOKEN'] },
  { key: 'line.channel-secret', label: 'LINE Channel Secret', kind: 'line', envKeys: ['CHANNEL_SECRET'] },
  { key: 'openai', label: 'OpenAI API', kind: 'ai', envKeys: ['OPENAI_API_KEY'] },
  { key: 'gemini', label: 'Gemini API', kind: 'ai', envKeys: ['GEMINI_API_KEY'] },
  { key: 'cwa', label: '中央氣象署 CWA API', kind: 'external-api', envKeys: ['CWA_API_KEY'] },
  { key: 'ragic', label: 'Ragic API', kind: 'external-api', envKeys: ['RAGIC_API_KEY'] },
  { key: 'google-apps-script', label: 'Google Apps Script webhook', kind: 'webhook', envKeys: ['SURVEY_WEBHOOK_TOKEN'] },
  { key: 'surveycake', label: 'SurveyCake payload source', kind: 'external-api' },
  { key: 'dashboard-webhook', label: 'Dashboard webhook', kind: 'webhook', envKeys: ['DASHBOARD_WEBHOOK_URL'] },
  { key: 'smart-schedule-manager', label: 'Smart Schedule Manager / LIFF', kind: 'webhook' },
  { key: 'isports-license', label: '體育署證照查詢', kind: 'external-api' },
  { key: '400qian', label: '400QIAN BFF consumer', kind: 'internal-service', envKeys: ['INTERNAL_API_TOKEN'] },
];

export const capabilityRegistry: CapabilityDefinition[] = [
  { key: 'runtime.express', label: 'Express runtime', domain: 'runtime', checker: 'static', enabled: true, dependencies: ['express'], staleAfterSeconds: 300, sourceRoutes: ['/health'] },
  { key: 'runtime.database', label: 'DB 連線', domain: 'runtime', checker: 'database', enabled: true, dependencies: ['database'], staleAfterSeconds: 300, envKeys: ['DATABASE_URL'] },
  { key: 'runtime.scheduler', label: '排程服務', domain: 'runtime', checker: 'auditCategory', enabled: true, dependencies: ['scheduler', 'database'], staleAfterSeconds: 86400, auditCategories: ['scheduler', 'pending_task_reminder', 'pending_water_quality', 'combined_forecast_error'] },
  { key: 'runtime.replit.keepalive', label: 'Replit keepalive', domain: 'runtime', checker: 'static', enabled: true, dependencies: ['replit'], staleAfterSeconds: 3600, envKeys: ['REPLIT_DOMAINS', 'REPL_ID', 'REPL_SLUG'], envMode: 'any' },
  { key: 'runtime.env-readiness', label: 'Env readiness', domain: 'runtime', checker: 'static', enabled: true, dependencies: ['database', '400qian'], staleAfterSeconds: 3600, envKeys: ['DATABASE_URL', 'INTERNAL_API_TOKEN'] },

  { key: 'line.messaging-api', label: 'LINE Messaging API', domain: 'line-core', checker: 'lineBotInfo', enabled: true, dependencies: ['line.messaging-api'], staleAfterSeconds: 300, envKeys: ['CHANNEL_ACCESS_TOKEN'] },
  { key: 'line.webhook.receive', label: 'LINE Webhook 接收', domain: 'line-core', checker: 'messageActivity', enabled: true, dependencies: ['express', 'database'], staleAfterSeconds: 86400, sourceRoutes: ['/webhook'] },
  { key: 'line.webhook.signature', label: 'LINE 簽章驗證', domain: 'line-core', checker: 'static', enabled: false, dependencies: ['line.channel-secret'], staleAfterSeconds: 3600, envKeys: ['CHANNEL_SECRET'], notes: '目前 middleware 明確跳過簽章驗證，第一批只監控不啟用。' },
  { key: 'line.reply', label: 'LINE reply', domain: 'line-core', checker: 'outgoingMessages', enabled: true, dependencies: ['line.messaging-api', 'database'], staleAfterSeconds: 86400, outgoingSendType: 'reply' },
  { key: 'line.push', label: 'LINE push', domain: 'line-core', checker: 'outgoingMessages', enabled: true, dependencies: ['line.messaging-api', 'database'], staleAfterSeconds: 86400, outgoingSendType: 'push' },
  { key: 'line.group.capture', label: 'groupId capture', domain: 'line-core', checker: 'messageActivity', enabled: true, dependencies: ['database'], staleAfterSeconds: 86400 },
  { key: 'line.outgoing-log', label: '傳出訊息紀錄', domain: 'line-core', checker: 'outgoingMessages', enabled: true, dependencies: ['database'], staleAfterSeconds: 86400 },

  { key: 'facility.group-list', label: 'groupId 清單', domain: 'facility-groups', checker: 'facilityList', enabled: true, dependencies: ['database'], staleAfterSeconds: 3600, sourceRoutes: ['/api/facility-home/list'] },
  { key: 'facility.home', label: 'facility home', domain: 'facility-groups', checker: 'facilityList', enabled: true, dependencies: ['database'], staleAfterSeconds: 3600, sourceRoutes: ['/api/internal/facility-home/:groupId/home'] },
  { key: 'facility.today-shift', label: '今日班表', domain: 'facility-groups', checker: 'static', enabled: true, dependencies: ['smart-schedule-manager'], staleAfterSeconds: 3600, sourceRoutes: ['/api/internal/facility-home/:groupId/today-shift'] },
  { key: 'facility.handover', label: 'handover', domain: 'facility-groups', checker: 'static', enabled: true, dependencies: ['database'], staleAfterSeconds: 3600, sourceRoutes: ['/api/internal/facility-home/:groupId/handover'] },
  { key: 'facility.announcements', label: '群組公告', domain: 'facility-groups', checker: 'auditCategory', enabled: true, dependencies: ['database'], staleAfterSeconds: 86400, auditCategories: ['announcement'], sourceRoutes: ['/api/internal/facility-home/:groupId/announcements'] },

  { key: 'access.interview-users', label: 'interview-users', domain: 'access-control', checker: 'static', enabled: true, dependencies: ['database'], staleAfterSeconds: 3600, sourceRoutes: ['/api/internal/interview-users'] },
  { key: 'access.feature-whitelist', label: 'feature-whitelist', domain: 'access-control', checker: 'static', enabled: true, dependencies: ['database'], staleAfterSeconds: 3600, sourceRoutes: ['/api/internal/feature-whitelist'] },
  { key: 'access.announcement-whitelist', label: '公告 VIP 白名單', domain: 'access-control', checker: 'static', enabled: true, dependencies: ['database'], staleAfterSeconds: 3600, sourceRoutes: ['/api/internal/announcement-whitelist'] },
  { key: 'access.ragic-authorization-candidates', label: 'Ragic H01/H02 candidate', domain: 'access-control', checker: 'static', enabled: true, dependencies: ['ragic'], staleAfterSeconds: 3600, sourceRoutes: ['/api/internal/ragic/authorization-candidates'] },

  { key: 'ai.task', label: 'AI task skill', domain: 'ai-assistant', checker: 'auditCategory', enabled: true, dependencies: ['openai', 'database'], staleAfterSeconds: 86400, auditCategories: ['task', 'llm'] },
  { key: 'ai.interview', label: 'AI interview skill', domain: 'ai-assistant', checker: 'auditCategory', enabled: true, dependencies: ['openai', 'ragic'], staleAfterSeconds: 86400, auditCategories: ['interview_check'] },
  { key: 'ai.water', label: 'AI water skill', domain: 'ai-assistant', checker: 'auditCategory', enabled: true, dependencies: ['openai', 'database'], staleAfterSeconds: 86400, auditCategories: ['water_quality_gpt', 'gpt_water_quality'] },
  { key: 'ai.weather', label: 'AI weather skill', domain: 'ai-assistant', checker: 'auditCategory', enabled: true, dependencies: ['cwa'], staleAfterSeconds: 86400, auditCategories: ['weather', 'combined_forecast_error'] },
  { key: 'ai.employee', label: 'AI employee skill', domain: 'ai-assistant', checker: 'auditCategory', enabled: true, dependencies: ['ragic'], staleAfterSeconds: 86400, auditCategories: ['employee_query_success', 'ragic'] },
  { key: 'ai.survey', label: 'AI survey skill', domain: 'ai-assistant', checker: 'auditCategory', enabled: true, dependencies: ['google-apps-script'], staleAfterSeconds: 86400, auditCategories: ['survey_feedback'] },
  { key: 'ai.clock-in', label: 'AI clock-in skill', domain: 'ai-assistant', checker: 'static', enabled: true, dependencies: ['smart-schedule-manager'], staleAfterSeconds: 3600 },
  { key: 'ai.system-summary', label: 'AI system summary', domain: 'ai-assistant', checker: 'auditCategory', enabled: true, dependencies: ['openai', 'database'], staleAfterSeconds: 86400, auditCategories: ['scheduler', 'llm'] },

  { key: 'announcement.ingest', label: '公告 ingest', domain: 'announcement-pipeline', checker: 'announcementPipeline', enabled: true, dependencies: ['database'], staleAfterSeconds: 86400 },
  { key: 'announcement.prefilter', label: '公告 prefilter', domain: 'announcement-pipeline', checker: 'announcementPipeline', enabled: true, dependencies: ['database'], staleAfterSeconds: 86400 },
  { key: 'announcement.rule-engine', label: '公告 rule engine', domain: 'announcement-pipeline', checker: 'announcementPipeline', enabled: true, dependencies: ['database'], staleAfterSeconds: 86400 },
  { key: 'announcement.gemini-classifier', label: 'Gemini classifier', domain: 'announcement-pipeline', checker: 'announcementPipeline', enabled: true, dependencies: ['gemini'], staleAfterSeconds: 86400, envKeys: ['GEMINI_API_KEY'] },
  { key: 'announcement.candidate', label: '公告 candidate', domain: 'announcement-pipeline', checker: 'announcementPipeline', enabled: true, dependencies: ['database'], staleAfterSeconds: 86400 },
  { key: 'announcement.review', label: '公告 review', domain: 'announcement-pipeline', checker: 'static', enabled: true, dependencies: ['database'], staleAfterSeconds: 3600, sourceRoutes: ['/api/admin/announcements/health'] },
  { key: 'announcement.publish', label: '公告 publish', domain: 'announcement-pipeline', checker: 'auditCategory', enabled: true, dependencies: ['line.messaging-api', 'database'], staleAfterSeconds: 86400, auditCategories: ['announcement'] },

  { key: 'tasks.create', label: '建立交辦', domain: 'tasks', checker: 'tasks', enabled: true, dependencies: ['database', 'line.messaging-api'], staleAfterSeconds: 86400 },
  { key: 'tasks.complete', label: '完成交辦', domain: 'tasks', checker: 'auditCategory', enabled: true, dependencies: ['database', 'line.messaging-api'], staleAfterSeconds: 86400, auditCategories: ['task'] },
  { key: 'tasks.group', label: '群組任務', domain: 'tasks', checker: 'tasks', enabled: true, dependencies: ['database'], staleAfterSeconds: 86400, sourceRoutes: ['/api/admin/tasks'] },
  { key: 'tasks.history', label: '歷史任務', domain: 'tasks', checker: 'tasks', enabled: true, dependencies: ['database'], staleAfterSeconds: 86400, sourceRoutes: ['/api/admin/tasks/history/:groupId'] },

  { key: 'clock-in.skill', label: 'clock-in skill', domain: 'clock-in-gps', checker: 'static', enabled: true, dependencies: ['smart-schedule-manager'], staleAfterSeconds: 3600 },
  { key: 'clock-in.gps-forward', label: 'GPS 轉發', domain: 'clock-in-gps', checker: 'auditCategory', enabled: true, dependencies: ['smart-schedule-manager', 'line.messaging-api'], staleAfterSeconds: 86400, auditCategories: ['gps_forward', 'webhook'] },
  { key: 'clock-in.ragic-employee-map', label: 'Ragic 員工對應', domain: 'clock-in-gps', checker: 'auditCategory', enabled: true, dependencies: ['ragic'], staleAfterSeconds: 86400, auditCategories: ['ragic', 'employee_query_success'] },

  { key: 'water.quality-test', label: 'water-quality test', domain: 'water-quality', checker: 'auditCategory', enabled: true, dependencies: ['database'], staleAfterSeconds: 86400, auditCategories: ['water_quality'], sourceRoutes: ['/api/water-quality/test'] },
  { key: 'water.quality-report', label: 'water-quality report', domain: 'water-quality', checker: 'auditCategory', enabled: true, dependencies: ['database', 'cwa'], staleAfterSeconds: 86400, auditCategories: ['water_quality_report', 'pending_water_quality'], sourceRoutes: ['/api/water-quality/report'] },
  { key: 'water.data-update', label: '水質資料更新', domain: 'water-quality', checker: 'auditCategory', enabled: true, dependencies: ['database'], staleAfterSeconds: 86400, auditCategories: ['water_quality', 'water_quality_gpt'] },
  { key: 'water.push', label: '水質推播狀態', domain: 'water-quality', checker: 'auditCategory', enabled: true, dependencies: ['line.messaging-api'], staleAfterSeconds: 86400, auditCategories: ['pending_water_quality', 'gpt_water_quality'] },

  { key: 'weather.cwa-api', label: 'CWA API', domain: 'weather-cwa', checker: 'static', enabled: true, dependencies: ['cwa'], staleAfterSeconds: 3600, envKeys: ['CWA_API_KEY'] },
  { key: 'weather.forecast', label: '天氣預報', domain: 'weather-cwa', checker: 'auditCategory', enabled: true, dependencies: ['cwa'], staleAfterSeconds: 86400, auditCategories: ['weather'] },
  { key: 'weather.uv', label: 'UV', domain: 'weather-cwa', checker: 'static', enabled: true, dependencies: ['cwa'], staleAfterSeconds: 3600 },
  { key: 'weather.wind', label: '風力', domain: 'weather-cwa', checker: 'auditCategory', enabled: true, dependencies: ['cwa'], staleAfterSeconds: 86400, auditCategories: ['weather'] },
  { key: 'weather.combined', label: 'combined forecast', domain: 'weather-cwa', checker: 'auditCategory', enabled: true, dependencies: ['cwa', 'line.messaging-api'], staleAfterSeconds: 86400, auditCategories: ['combined_forecast_error', 'weather'] },

  { key: 'survey.surveycake-webhook', label: 'SurveyCake webhook', domain: 'survey', checker: 'auditCategory', enabled: true, dependencies: ['surveycake'], staleAfterSeconds: 86400, auditCategories: ['survey_feedback'], sourceRoutes: ['/api/survey-webhook'] },
  { key: 'survey.google-apps-script', label: 'Google Apps Script webhook', domain: 'survey', checker: 'static', enabled: true, dependencies: ['google-apps-script'], staleAfterSeconds: 3600, envKeys: ['SURVEY_WEBHOOK_TOKEN'] },
  { key: 'survey.payload-receive', label: 'payload 收取', domain: 'survey', checker: 'auditCategory', enabled: true, dependencies: ['database'], staleAfterSeconds: 86400, auditCategories: ['survey_feedback'] },

  { key: 'ragic.employee-by-line-id', label: 'employee by LINE ID', domain: 'ragic', checker: 'auditCategory', enabled: true, dependencies: ['ragic'], staleAfterSeconds: 86400, auditCategories: ['ragic', 'employee_query_success'], sourceRoutes: ['/api/ragic/employee/line-id/:lineId'] },
  { key: 'ragic.employee-by-employee-id', label: 'employee by employeeId', domain: 'ragic', checker: 'auditCategory', enabled: true, dependencies: ['ragic'], staleAfterSeconds: 86400, auditCategories: ['ragic', 'employee_query_success'], sourceRoutes: ['/api/ragic/employee/employee-id/:employeeId'] },
  { key: 'ragic.h01-h02-readiness', label: 'H01/H02 readiness', domain: 'ragic', checker: 'static', enabled: true, dependencies: ['ragic'], staleAfterSeconds: 3600, sourceRoutes: ['/api/internal/ragic/authorization-candidates'] },

  { key: 'lifeguard.license-readiness', label: '救生員證照查詢服務 readiness', domain: 'lifeguard-license', checker: 'static', enabled: true, dependencies: ['isports-license'], staleAfterSeconds: 3600 },

  { key: 'admin.audit-logs', label: 'audit logs', domain: 'admin-audit', checker: 'auditCategory', enabled: true, dependencies: ['database'], staleAfterSeconds: 86400, auditCategories: ['webhook', 'task', 'ragic', 'scheduler'], sourceRoutes: ['/api/admin/audit-logs'] },
  { key: 'admin.messages', label: 'messages', domain: 'admin-audit', checker: 'messageActivity', enabled: true, dependencies: ['database'], staleAfterSeconds: 86400, sourceRoutes: ['/api/admin/messages'] },
  { key: 'admin.dashboard-stats', label: 'dashboard stats', domain: 'admin-audit', checker: 'static', enabled: true, dependencies: ['database'], staleAfterSeconds: 3600, sourceRoutes: ['/api/admin/dashboard/feature-stats', '/api/admin/dashboard/services-health'] },
  { key: 'admin.overview', label: 'admin overview', domain: 'admin-audit', checker: 'static', enabled: true, dependencies: ['database'], staleAfterSeconds: 3600, sourceRoutes: ['/api/admin/overview'] },

  { key: 'external.dashboard-webhook', label: 'dashboard webhook', domain: 'external-push', checker: 'serviceSnapshots', enabled: true, dependencies: ['dashboard-webhook', 'database'], staleAfterSeconds: 86400, envKeys: ['DASHBOARD_WEBHOOK_URL'] },
  { key: 'external.service-status-push', label: 'service-status push', domain: 'external-push', checker: 'serviceSnapshots', enabled: true, dependencies: ['dashboard-webhook', 'database'], staleAfterSeconds: 86400, envKeys: ['DASHBOARD_WEBHOOK_URL'] },
  { key: 'external.400qian-sync', label: '400QIAN sync', domain: 'external-push', checker: 'static', enabled: true, dependencies: ['400qian'], staleAfterSeconds: 3600, envKeys: ['INTERNAL_API_TOKEN'], sourceRoutes: ['/api/internal/monitoring/full-status'] },
];

export const qianFrontendBffRoutes: QianRouteContract[] = [
  {
    method: 'GET',
    path: '/api/bff/system/linebot-management/overview',
    purpose: '400QIAN 前端總覽 DTO',
    tier: 'primary-contract',
    auth: 'INTERNAL_API_TOKEN',
    audience: '400QIAN_BFF',
    browserDirect: false,
    sourceOf: '/api/internal/monitoring/full-status',
    notes: 'Browser 只打 400QIAN BFF；此列用於對照，不代表 400LINE 提供此路由。',
  },
  {
    method: 'GET',
    path: '/api/bff/system/linebot-management/services',
    purpose: '400QIAN 前端服務列表 DTO',
    tier: 'primary-contract',
    auth: 'INTERNAL_API_TOKEN',
    audience: '400QIAN_BFF',
    browserDirect: false,
    sourceOf: '/api/internal/monitoring/full-status',
    notes: 'Browser 只打 400QIAN BFF；此列用於對照，不代表 400LINE 提供此路由。',
  },
  {
    method: 'GET',
    path: '/api/bff/system/linebot-management/facilities',
    purpose: '400QIAN 前端館別 / 群組 DTO',
    tier: 'primary-contract',
    auth: 'INTERNAL_API_TOKEN',
    audience: '400QIAN_BFF',
    browserDirect: false,
    sourceOf: '/api/internal/monitoring/full-status + /api/facility-home/list',
    notes: 'Browser 只打 400QIAN BFF；此列用於對照，不代表 400LINE 提供此路由。',
  },
  {
    method: 'GET',
    path: '/api/bff/system/linebot-management/whitelist-snapshot',
    purpose: '400QIAN 前端白名單 / 權限 snapshot DTO',
    tier: 'primary-contract',
    auth: 'INTERNAL_API_TOKEN',
    audience: '400QIAN_BFF',
    browserDirect: false,
    sourceOf: '/api/internal/monitoring/full-status + access-control drill-down',
    notes: 'Person-level diff 在 legacy fallback / drill-down 階段處理。',
  },
  {
    method: 'GET',
    path: '/api/bff/system/linebot-management/announcement-pipeline',
    purpose: '400QIAN 前端重要公告管線 DTO',
    tier: 'primary-contract',
    auth: 'INTERNAL_API_TOKEN',
    audience: '400QIAN_BFF',
    browserDirect: false,
    sourceOf: '/api/internal/monitoring/full-status + /api/admin/announcements/health',
  },
];

export const monitoringRouteContracts: QianRouteContract[] = [
  {
    method: 'GET',
    path: '/api/internal/monitoring/full-status',
    purpose: '400LINE 總狀態契約；400QIAN primary source',
    tier: 'primary-contract',
    auth: 'INTERNAL_API_TOKEN',
    audience: '400QIAN_BFF',
    browserDirect: false,
    bffEndpoint: '/api/bff/system/linebot-management/overview',
  },
  {
    method: 'GET',
    path: '/api/internal/monitoring/capabilities',
    purpose: '功能狀態清單',
    tier: 'primary-contract',
    auth: 'INTERNAL_API_TOKEN',
    audience: '400QIAN_BFF',
    browserDirect: false,
    bffEndpoint: '/api/bff/system/linebot-management/services',
  },
  {
    method: 'GET',
    path: '/api/internal/monitoring/capabilities/:key',
    purpose: '單一功能狀態；drill-down by capability key',
    tier: 'primary-contract',
    auth: 'INTERNAL_API_TOKEN',
    audience: '400QIAN_BFF',
    browserDirect: false,
  },
  {
    method: 'GET',
    path: '/api/internal/monitoring/events',
    purpose: '近期監控事件',
    tier: 'primary-contract',
    auth: 'INTERNAL_API_TOKEN',
    audience: '400QIAN_BFF',
    browserDirect: false,
  },
  {
    method: 'GET',
    path: '/api/internal/monitoring/snapshots',
    purpose: '既有 service_health_snapshots',
    tier: 'primary-contract',
    auth: 'INTERNAL_API_TOKEN',
    audience: '400QIAN_BFF',
    browserDirect: false,
  },
  {
    method: 'GET',
    path: '/api/internal/monitoring/routes',
    purpose: '400QIAN 可依賴的路由契約',
    tier: 'primary-contract',
    auth: 'INTERNAL_API_TOKEN',
    audience: '400QIAN_BFF',
    browserDirect: false,
  },
  {
    method: 'GET',
    path: '/api/internal/monitoring/dependencies',
    purpose: '外部依賴 configured 狀態',
    tier: 'primary-contract',
    auth: 'INTERNAL_API_TOKEN',
    audience: '400QIAN_BFF',
    browserDirect: false,
  },
];

export const qianReadOnlyDrilldownRoutes: QianRouteContract[] = [
  { method: 'GET', path: '/api/internal/facility-home/:groupId/home', purpose: '單一館別首頁資料', tier: 'read-only-drilldown', auth: 'INTERNAL_API_TOKEN', audience: '400QIAN_BFF', browserDirect: false, bffEndpoint: '/api/bff/system/linebot-management/facilities' },
  { method: 'GET', path: '/api/internal/facility-home/:groupId/announcements', purpose: '單一館別公告列表', tier: 'read-only-drilldown', auth: 'INTERNAL_API_TOKEN', audience: '400QIAN_BFF', browserDirect: false },
  { method: 'GET', path: '/api/internal/facility-home/:groupId/announcements/:id', purpose: '單一館別公告詳情', tier: 'read-only-drilldown', auth: 'INTERNAL_API_TOKEN', audience: '400QIAN_BFF', browserDirect: false },
  { method: 'GET', path: '/api/internal/facility-home/:groupId/today-shift', purpose: '單一館別今日班表 placeholder / drill-down', tier: 'read-only-drilldown', auth: 'INTERNAL_API_TOKEN', audience: '400QIAN_BFF', browserDirect: false },
  { method: 'GET', path: '/api/internal/facility-home/:groupId/handover', purpose: '單一館別交接 placeholder / drill-down', tier: 'read-only-drilldown', auth: 'INTERNAL_API_TOKEN', audience: '400QIAN_BFF', browserDirect: false },
  { method: 'GET', path: '/api/internal/interview-users', purpose: '面試 / 慎用授權主控名單 read-only', tier: 'read-only-drilldown', auth: 'INTERNAL_API_TOKEN', audience: '400QIAN_BFF', browserDirect: false, bffEndpoint: '/api/bff/system/linebot-management/whitelist-snapshot' },
  { method: 'GET', path: '/api/internal/feature-whitelist', purpose: '功能白名單主控 snapshot', tier: 'read-only-drilldown', auth: 'INTERNAL_API_TOKEN', audience: '400QIAN_BFF', browserDirect: false, bffEndpoint: '/api/bff/system/linebot-management/whitelist-snapshot' },
  { method: 'GET', path: '/api/internal/announcement-whitelist', purpose: '公告 VIP 白名單 snapshot', tier: 'read-only-drilldown', auth: 'INTERNAL_API_TOKEN', audience: '400QIAN_BFF', browserDirect: false, bffEndpoint: '/api/bff/system/linebot-management/whitelist-snapshot' },
  { method: 'GET', path: '/api/internal/ragic/authorization-candidates', purpose: 'Ragic H01/H02 授權候選搜尋', tier: 'read-only-drilldown', auth: 'INTERNAL_API_TOKEN', audience: '400QIAN_BFF', browserDirect: false },
  { method: 'GET', path: '/api/internal/service-health', purpose: '舊健康總覽；full-status fallback source', tier: 'read-only-drilldown', auth: 'INTERNAL_API_TOKEN', audience: '400QIAN_BFF', browserDirect: false },
  { method: 'GET', path: '/api/internal/service-health/snapshots', purpose: '舊健康快照；full-status fallback source', tier: 'read-only-drilldown', auth: 'INTERNAL_API_TOKEN', audience: '400QIAN_BFF', browserDirect: false },
];

export const qianWriteGovernedRoutes: QianRouteContract[] = [
  { method: 'POST', path: '/api/internal/announcement-whitelist', purpose: '新增公告 VIP 白名單；僅限 dedicated governance flow', tier: 'write-governed', auth: 'INTERNAL_API_TOKEN', audience: '400QIAN_BFF', browserDirect: false, notes: '不屬於 monitoring page 預設呼叫；需 400QIAN BFF 額外做 role/audit gate。' },
  { method: 'PATCH', path: '/api/internal/announcement-whitelist/:userId', purpose: '更新公告 VIP 白名單；僅限 dedicated governance flow', tier: 'write-governed', auth: 'INTERNAL_API_TOKEN', audience: '400QIAN_BFF', browserDirect: false, notes: '不屬於 monitoring page 預設呼叫；需 400QIAN BFF 額外做 role/audit gate。' },
  { method: 'DELETE', path: '/api/internal/announcement-whitelist/:userId', purpose: '停用公告 VIP 白名單；相容 delete path，不實刪', tier: 'write-governed', auth: 'INTERNAL_API_TOKEN', audience: '400QIAN_BFF', browserDirect: false, notes: '不屬於 monitoring page 預設呼叫；需 400QIAN BFF 額外做 role/audit gate。' },
  { method: 'POST', path: '/api/internal/feature-whitelist', purpose: '新增 / upsert 功能白名單；僅限 dedicated governance flow', tier: 'write-governed', auth: 'INTERNAL_API_TOKEN', audience: '400QIAN_BFF', browserDirect: false, notes: '不屬於 monitoring page 預設呼叫；需 400QIAN BFF 額外做 role/audit gate。' },
  { method: 'PATCH', path: '/api/internal/feature-whitelist/:lineUserId', purpose: '更新功能白名單；僅限 dedicated governance flow', tier: 'write-governed', auth: 'INTERNAL_API_TOKEN', audience: '400QIAN_BFF', browserDirect: false, notes: '不屬於 monitoring page 預設呼叫；需 400QIAN BFF 額外做 role/audit gate。' },
];

export const qianLegacyFallbackRoutes: QianRouteContract[] = [
  { method: 'GET', path: '/api/admin/announcements/health', purpose: '公告管線 health fallback', tier: 'legacy-fallback', auth: 'ADMIN_TOKEN', audience: '400QIAN_BFF', browserDirect: false, bffEndpoint: '/api/bff/system/linebot-management/announcement-pipeline' },
  { method: 'GET', path: '/api/admin/interview-users', purpose: '舊 admin 授權名單 fallback', tier: 'legacy-fallback', auth: 'ADMIN_TOKEN', audience: '400QIAN_BFF', browserDirect: false, bffEndpoint: '/api/bff/system/linebot-management/whitelist-snapshot' },
  { method: 'GET', path: '/api/admin/whitelist', purpose: '舊 admin 公告 VIP 白名單 fallback', tier: 'legacy-fallback', auth: 'ADMIN_TOKEN', audience: '400QIAN_BFF', browserDirect: false, bffEndpoint: '/api/bff/system/linebot-management/whitelist-snapshot' },
  { method: 'GET', path: '/api/admin/service-status', purpose: '舊 admin 服務狀態 fallback', tier: 'legacy-fallback', auth: 'ADMIN_TOKEN', audience: '400QIAN_BFF', browserDirect: false },
  { method: 'GET', path: '/api/admin/service-status/snapshots', purpose: '舊 admin 服務狀態快照 fallback', tier: 'legacy-fallback', auth: 'ADMIN_TOKEN', audience: '400QIAN_BFF', browserDirect: false },
];

export const qianPublicFallbackRoutes: QianRouteContract[] = [
  { method: 'GET', path: '/api/facility-home/list', purpose: '群組 / 館別清單 public read-only fallback', tier: 'public-fallback', auth: 'public-readonly', audience: '400QIAN_BFF', browserDirect: false, bffEndpoint: '/api/bff/system/linebot-management/facilities', notes: '仍建議由 400QIAN BFF 呼叫後正規化，不讓 browser 直接散打 400LINE。' },
];

export const qianOpenRouteContracts: QianRouteContract[] = [
  ...monitoringRouteContracts,
  ...qianReadOnlyDrilldownRoutes,
  ...qianWriteGovernedRoutes,
  ...qianLegacyFallbackRoutes,
  ...qianPublicFallbackRoutes,
];

const DEFAULT_FORBIDDEN_FIELDS = [
  'token',
  'password',
  'secret',
  'apiKey',
  'authorization header',
  'raw LINE channel access token',
  'raw Ragic API key',
  'database connection string',
];

export const qianRouteDataGrants: Record<string, QianRouteDataGrant> = {
  '/api/bff/system/linebot-management/overview': {
    scope: '400QIAN 前端總覽 DTO',
    fields: ['generatedAt', 'status', 'sourceMode', 'rawStatus', 'cards[]', 'apiReadiness[]', 'notes[]'],
    forbidden: DEFAULT_FORBIDDEN_FIELDS,
    retention: 'Browser 經 400QIAN BFF 讀取；前端只保存 UI state。',
  },
  '/api/bff/system/linebot-management/services': {
    scope: '400QIAN 前端服務狀態 DTO',
    fields: ['generatedAt', 'status', 'sourceMode', 'rawStatus', 'services[]', 'apiReadiness[]'],
    forbidden: DEFAULT_FORBIDDEN_FIELDS,
    retention: 'Browser 經 400QIAN BFF 讀取；React Query 可短期快取。',
  },
  '/api/bff/system/linebot-management/facilities': {
    scope: '400QIAN 前端館別 / 群組 DTO',
    fields: ['generatedAt', 'status', 'sourceMode', 'rawStatus', 'items[]', 'apiReadiness[]'],
    forbidden: DEFAULT_FORBIDDEN_FIELDS,
    retention: 'Browser 經 400QIAN BFF 讀取；群組資料只作監控顯示。',
  },
  '/api/bff/system/linebot-management/whitelist-snapshot': {
    scope: '400QIAN 前端白名單 / 權限 snapshot DTO',
    fields: ['generatedAt', 'status', 'sourceMode', 'authority', 'syncMode', 'summary', 'items[]', 'apiReadiness[]', 'rules[]'],
    forbidden: DEFAULT_FORBIDDEN_FIELDS,
    retention: 'Browser 經 400QIAN BFF 讀取；shadow diff 由 400QIAN server 保存。',
  },
  '/api/bff/system/linebot-management/announcement-pipeline': {
    scope: '400QIAN 前端重要公告管線 DTO',
    fields: ['generatedAt', 'status', 'sourceMode', 'rawStatus', 'stages[]', 'employeeEntryRule', 'counters', 'apiReadiness[]'],
    forbidden: DEFAULT_FORBIDDEN_FIELDS,
    retention: 'Browser 經 400QIAN BFF 讀取；不保存 raw classifier payload。',
  },
  '/api/internal/monitoring/full-status': {
    scope: '總狀態、domain、capability、event 摘要',
    fields: ['generatedAt', 'overall', 'summary', 'domains[].status', 'domains[].capabilities[]', 'events[]'],
    forbidden: DEFAULT_FORBIDDEN_FIELDS,
    retention: '400QIAN 可快取 30-60 秒；不可保存 secret。',
  },
  '/api/internal/monitoring/capabilities': {
    scope: '所有 capability 狀態列',
    fields: ['key', 'label', 'domain', 'status', 'enabled', 'configured', 'lastSuccessAt', 'lastErrorAt', 'latencyMs', 'dependencies', 'counters', 'sourceRoutes'],
    forbidden: DEFAULT_FORBIDDEN_FIELDS,
    retention: '400QIAN 可快取 30-60 秒。',
  },
  '/api/internal/monitoring/capabilities/:key': {
    scope: '單一 capability 狀態列',
    fields: ['key', 'label', 'domain', 'status', 'enabled', 'configured', 'lastSuccessAt', 'lastErrorAt', 'lastError', 'dependencies', 'counters'],
    forbidden: DEFAULT_FORBIDDEN_FIELDS,
    retention: '400QIAN 可快取 30-60 秒。',
  },
  '/api/internal/monitoring/events': {
    scope: '近期監控事件',
    fields: ['items[].severity', 'items[].domain', 'items[].capabilityKey', 'items[].message', 'items[].occurredAt'],
    forbidden: DEFAULT_FORBIDDEN_FIELDS,
    retention: '400QIAN 可保留作短期 UI timeline；長期歷史以 400LINE snapshot 為準。',
  },
  '/api/internal/monitoring/snapshots': {
    scope: 'service_health_snapshots 歷史',
    fields: ['items[].id', 'items[].snappedAt', 'items[].overallStatus', 'items[].services', 'items[].webhookStatus'],
    forbidden: DEFAULT_FORBIDDEN_FIELDS,
    retention: '400QIAN 可用於趨勢圖；不要反向寫回 400LINE。',
  },
  '/api/internal/monitoring/routes': {
    scope: '400QIAN 對接端點目錄與資料授權',
    fields: ['contractVersion', 'rules', 'frontendBffRoutes', 'primaryContractRoutes', 'readOnlyDrilldownRoutes', 'writeGovernedRoutes', 'legacyFallbackRoutes', 'allOpenRoutes'],
    forbidden: DEFAULT_FORBIDDEN_FIELDS,
    retention: '400QIAN 可在啟動或管理頁載入時快取。',
  },
  '/api/internal/monitoring/dependencies': {
    scope: '外部依賴 configured 狀態',
    fields: ['items[].key', 'items[].label', 'items[].kind', 'items[].configured', 'items[].usedBy'],
    forbidden: DEFAULT_FORBIDDEN_FIELDS,
    retention: '400QIAN 可快取 30-60 秒。',
  },
  '/api/internal/facility-home/:groupId/home': {
    scope: '單一館別首頁資料',
    fields: ['facilityKey', 'facilityName', 'facilityShortName', 'groupId', 'mustRead[]', 'announcements[]', 'campaigns[]', 'handover[]', 'todayShift[]'],
    forbidden: DEFAULT_FORBIDDEN_FIELDS,
    retention: '400QIAN 可短期快取；公告顯示以 400LINE 為 source of truth。',
  },
  '/api/internal/facility-home/:groupId/announcements': {
    scope: '單一館別公告列表',
    fields: ['items[].id', 'items[].title', 'items[].summary', 'items[].priority', 'items[].publishedAt', 'page', 'pageSize', 'total'],
    forbidden: DEFAULT_FORBIDDEN_FIELDS,
    retention: '400QIAN 可分頁快取；不做權威編輯來源。',
  },
  '/api/internal/facility-home/:groupId/announcements/:id': {
    scope: '單一館別公告詳情',
    fields: ['data.id', 'data.title', 'data.summary', 'data.body', 'data.priority', 'data.scopeType', 'data.publishedAt'],
    forbidden: DEFAULT_FORBIDDEN_FIELDS,
    retention: '400QIAN 可短期快取。',
  },
  '/api/internal/facility-home/:groupId/today-shift': {
    scope: '單一館別今日班表 placeholder',
    fields: ['items[]'],
    forbidden: DEFAULT_FORBIDDEN_FIELDS,
    retention: '目前可視為 readiness placeholder。',
  },
  '/api/internal/facility-home/:groupId/handover': {
    scope: '單一館別交接 placeholder',
    fields: ['items[]'],
    forbidden: DEFAULT_FORBIDDEN_FIELDS,
    retention: '目前可視為 readiness placeholder。',
  },
  '/api/internal/interview-users': {
    scope: '面試 / 慎用授權主控名單',
    fields: ['items[].userId', 'items[].userName', 'items[].isActive', 'items[].canInterviewCheck', 'items[].canInternalQuery', 'items[].canUseAiAgent', 'total'],
    forbidden: [...DEFAULT_FORBIDDEN_FIELDS, 'LINE profile raw payload'],
    retention: '400QIAN 可保存 shadow snapshot 做 diff。',
  },
  '/api/internal/feature-whitelist': {
    scope: '功能白名單主控 snapshot',
    fields: ['authority', 'generatedAt', 'total', 'items[].lineUserId', 'items[].displayName', 'items[].status', 'items[].features', 'sourceStatus'],
    forbidden: [...DEFAULT_FORBIDDEN_FIELDS, 'private note not explicitly returned'],
    retention: '400QIAN 可保存 shadow snapshot 做 diff。',
  },
  '/api/internal/announcement-whitelist': {
    scope: '公告 VIP 白名單 snapshot',
    fields: ['items[].userId', 'items[].userName', 'items[].role', 'items[].note', 'items[].isActive'],
    forbidden: DEFAULT_FORBIDDEN_FIELDS,
    retention: '400QIAN 可保存 shadow snapshot 做 diff。',
  },
  '/api/internal/ragic/authorization-candidates': {
    scope: 'Ragic H01/H02 授權候選搜尋結果',
    fields: ['items[].displayName', 'items[].lineUserId', 'items[].phone', 'items[].department', 'items[].employeeNumber', 'items[].sourceTable', 'items[].matchedBy', 'sourceStatus'],
    forbidden: [...DEFAULT_FORBIDDEN_FIELDS, 'full Ragic row dump'],
    retention: '400QIAN 只保留操作結果或 shadow，不保存完整 Ragic dump。',
  },
  '/api/internal/service-health': {
    scope: '舊健康總覽 fallback',
    fields: ['overall', 'services[]', 'checkedAt', 'pipeline'],
    forbidden: DEFAULT_FORBIDDEN_FIELDS,
    retention: '僅 fallback；primary 請用 full-status。',
  },
  '/api/internal/service-health/snapshots': {
    scope: '舊健康快照 fallback',
    fields: ['items[]', 'hours'],
    forbidden: DEFAULT_FORBIDDEN_FIELDS,
    retention: '僅 fallback；primary 請用 monitoring snapshots。',
  },
  '/api/admin/announcements/health': {
    scope: '公告管線 health fallback',
    fields: ['status', 'counters', 'issues', 'checkedAt'],
    forbidden: DEFAULT_FORBIDDEN_FIELDS,
    retention: '僅 legacy fallback；primary 請用 full-status announcement domain。',
  },
  '/api/admin/interview-users': {
    scope: '舊 admin 授權名單 fallback',
    fields: ['users[]', 'items[]'],
    forbidden: DEFAULT_FORBIDDEN_FIELDS,
    retention: '僅 legacy fallback；primary 請用 internal read-only route。',
  },
  '/api/admin/whitelist': {
    scope: '舊 admin 公告 VIP 白名單 fallback',
    fields: ['items[]'],
    forbidden: DEFAULT_FORBIDDEN_FIELDS,
    retention: '僅 legacy fallback；primary 請用 internal read-only route。',
  },
  '/api/admin/service-status': {
    scope: '舊 admin 服務狀態 fallback',
    fields: ['services[]', 'items[]', 'overall'],
    forbidden: DEFAULT_FORBIDDEN_FIELDS,
    retention: '僅 legacy fallback；primary 請用 full-status。',
  },
  '/api/admin/service-status/snapshots': {
    scope: '舊 admin 服務狀態快照 fallback',
    fields: ['items[]'],
    forbidden: DEFAULT_FORBIDDEN_FIELDS,
    retention: '僅 legacy fallback；primary 請用 monitoring snapshots。',
  },
  '/api/facility-home/list': {
    scope: '群組 / 館別清單 public read-only fallback',
    fields: ['items[].id', 'items[].name', 'items[].shortName', 'items[].lineGroupId'],
    forbidden: DEFAULT_FORBIDDEN_FIELDS,
    retention: '400QIAN 可短期快取；仍建議由 BFF 正規化。',
  },
};

export function routeDataGrant(path: string): QianRouteDataGrant {
  return qianRouteDataGrants[path] ?? {
    scope: 'route contract only',
    fields: [],
    forbidden: DEFAULT_FORBIDDEN_FIELDS,
    retention: '未指定；預設只作 readiness 顯示。',
  };
}

export const monitoringSourceRoutes = qianOpenRouteContracts
  .filter((route) => route.tier !== 'primary-contract')
  .map((route) => route.path);

export function findCapabilityDefinition(key: string): CapabilityDefinition | undefined {
  return capabilityRegistry.find((capability) => capability.key === key);
}
