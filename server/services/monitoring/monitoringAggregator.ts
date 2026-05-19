import { sql } from 'drizzle-orm';
import { db } from '../../db';
import {
  capabilityDomains,
  capabilityRegistry,
  dependencyRegistry,
  findCapabilityDefinition,
  monitoringRouteContracts,
  monitoringSourceRoutes,
  qianFrontendBffRoutes,
  qianLegacyFallbackRoutes,
  qianOpenRouteContracts,
  qianPublicFallbackRoutes,
  qianReadOnlyDrilldownRoutes,
  routeDataGrant,
  qianWriteGovernedRoutes,
  type CapabilityDefinition,
  type CapabilityDomainKey,
  type CapabilityStatus,
} from './capabilityRegistry';
import {
  checkCapability,
  getDependencyStates,
  type CapabilityCounters,
} from './capabilityCheckers';

export interface CapabilityStatusDto {
  key: string;
  label: string;
  domain: CapabilityDomainKey;
  status: CapabilityStatus;
  enabled: boolean;
  configured: boolean;
  lastSuccessAt: string | null;
  lastErrorAt: string | null;
  lastError: string | null;
  latencyMs: number | null;
  staleAfterSeconds: number;
  dependencies: string[];
  counters: CapabilityCounters;
  sourceRoutes: string[];
  notes?: string;
}

export interface MonitoringDomainDto {
  key: CapabilityDomainKey;
  label: string;
  status: CapabilityStatus;
  capabilities: CapabilityStatusDto[];
}

export interface MonitoringEventDto {
  severity: 'info' | 'warn' | 'error';
  domain: CapabilityDomainKey;
  capabilityKey?: string;
  message: string;
  occurredAt: string;
}

export interface MonitoringSummaryDto {
  healthy: number;
  degraded: number;
  failing: number;
  disabled: number;
  notConfigured: number;
  stale: number;
  unknown: number;
}

export interface MonitoringFullStatusDto {
  generatedAt: string;
  overall: CapabilityStatus;
  summary: MonitoringSummaryDto;
  domains: MonitoringDomainDto[];
  events: MonitoringEventDto[];
}

const CACHE_TTL_MS = 30_000;
let fullStatusCache: { expiresAt: number; data: MonitoringFullStatusDto } | null = null;

function statusPriority(status: CapabilityStatus): number {
  switch (status) {
    case 'failing': return 6;
    case 'degraded': return 5;
    case 'stale': return 4;
    case 'not_configured': return 3;
    case 'unknown': return 2;
    case 'disabled': return 1;
    case 'healthy': return 0;
    default: return 2;
  }
}

function aggregateStatus(statuses: CapabilityStatus[]): CapabilityStatus {
  if (statuses.length === 0) return 'unknown';
  return statuses.reduce((worst, current) => (
    statusPriority(current) > statusPriority(worst) ? current : worst
  ), 'healthy' as CapabilityStatus);
}

function summarize(capabilities: CapabilityStatusDto[]): MonitoringSummaryDto {
  return {
    healthy: capabilities.filter((capability) => capability.status === 'healthy').length,
    degraded: capabilities.filter((capability) => capability.status === 'degraded').length,
    failing: capabilities.filter((capability) => capability.status === 'failing').length,
    disabled: capabilities.filter((capability) => capability.status === 'disabled').length,
    notConfigured: capabilities.filter((capability) => capability.status === 'not_configured').length,
    stale: capabilities.filter((capability) => capability.status === 'stale').length,
    unknown: capabilities.filter((capability) => capability.status === 'unknown').length,
  };
}

function toDto(definition: CapabilityDefinition, state: Awaited<ReturnType<typeof checkCapability>>): CapabilityStatusDto {
  return {
    key: definition.key,
    label: definition.label,
    domain: definition.domain,
    status: state.status,
    enabled: definition.enabled,
    configured: state.configured,
    lastSuccessAt: state.lastSuccessAt,
    lastErrorAt: state.lastErrorAt,
    lastError: state.lastError,
    latencyMs: state.latencyMs,
    staleAfterSeconds: definition.staleAfterSeconds,
    dependencies: definition.dependencies,
    counters: state.counters,
    sourceRoutes: definition.sourceRoutes ?? [],
    ...(definition.notes ? { notes: definition.notes } : {}),
  };
}

function eventSeverity(status: CapabilityStatus): MonitoringEventDto['severity'] {
  if (status === 'failing') return 'error';
  if (status === 'degraded' || status === 'stale' || status === 'not_configured') return 'warn';
  return 'info';
}

function buildCapabilityEvents(capabilities: CapabilityStatusDto[]): MonitoringEventDto[] {
  return capabilities
    .filter((capability) => ['failing', 'degraded', 'stale', 'not_configured'].includes(capability.status))
    .map((capability) => ({
      severity: eventSeverity(capability.status),
      domain: capability.domain,
      capabilityKey: capability.key,
      message: capability.lastError
        ? `${capability.label}: ${capability.lastError}`
        : `${capability.label}: ${capability.status}`,
      occurredAt: capability.lastErrorAt ?? capability.lastSuccessAt ?? new Date().toISOString(),
    }));
}

function mapAuditCategoryToDomain(category: string): CapabilityDomainKey {
  if (category.includes('ragic') || category.includes('employee')) return 'ragic';
  if (category.includes('water')) return 'water-quality';
  if (category.includes('weather') || category.includes('forecast')) return 'weather-cwa';
  if (category.includes('survey')) return 'survey';
  if (category.includes('scheduler')) return 'runtime';
  if (category.includes('task')) return 'tasks';
  if (category.includes('announcement')) return 'announcement-pipeline';
  if (category.includes('webhook')) return 'line-core';
  if (category.includes('access')) return 'access-control';
  return 'admin-audit';
}

function toIso(value: unknown): string {
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

function sanitizeMessage(value: unknown): string {
  return String(value ?? 'unknown').replace(/\s+/g, ' ').slice(0, 180);
}

async function getRecentAuditEvents(limit: number): Promise<MonitoringEventDto[]> {
  const result = await db.execute(sql`
    SELECT level, category, message, timestamp
    FROM audit_logs
    ORDER BY timestamp DESC
    LIMIT ${limit}
  `);
  const rows = ((result as any).rows ?? []) as Array<{
    level: string;
    category: string;
    message: string;
    timestamp: unknown;
  }>;

  return rows.map((row) => ({
    severity: row.level === 'error' ? 'error' : row.level === 'warning' ? 'warn' : 'info',
    domain: mapAuditCategoryToDomain(row.category ?? ''),
    message: sanitizeMessage(row.message),
    occurredAt: toIso(row.timestamp),
  }));
}

export async function getMonitoringCapability(key: string): Promise<CapabilityStatusDto | null> {
  const definition = findCapabilityDefinition(key);
  if (!definition) return null;
  const state = await checkCapability(definition);
  return toDto(definition, state);
}

export async function getMonitoringCapabilities(): Promise<CapabilityStatusDto[]> {
  const checked = await Promise.all(
    capabilityRegistry.map(async (definition) => toDto(definition, await checkCapability(definition))),
  );
  return checked.sort((a, b) => a.domain.localeCompare(b.domain) || a.key.localeCompare(b.key));
}

export async function getMonitoringFullStatus(options: { force?: boolean } = {}): Promise<MonitoringFullStatusDto> {
  if (!options.force && fullStatusCache && fullStatusCache.expiresAt > Date.now()) {
    return fullStatusCache.data;
  }

  const capabilities = await getMonitoringCapabilities();
  const domains = capabilityDomains.map((domain) => {
    const domainCapabilities = capabilities.filter((capability) => capability.domain === domain.key);
    return {
      key: domain.key,
      label: domain.label,
      status: aggregateStatus(domainCapabilities.map((capability) => capability.status)),
      capabilities: domainCapabilities,
    };
  });

  const capabilityEvents = buildCapabilityEvents(capabilities);
  const auditEvents = await getRecentAuditEvents(20).catch(() => []);
  const data: MonitoringFullStatusDto = {
    generatedAt: new Date().toISOString(),
    overall: aggregateStatus(domains.map((domain) => domain.status)),
    summary: summarize(capabilities),
    domains,
    events: [...capabilityEvents, ...auditEvents]
      .sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime())
      .slice(0, 50),
  };

  fullStatusCache = { expiresAt: Date.now() + CACHE_TTL_MS, data };
  return data;
}

export async function getMonitoringEvents(limit = 50): Promise<{ items: MonitoringEventDto[]; limit: number }> {
  const fullStatus = await getMonitoringFullStatus();
  return { items: fullStatus.events.slice(0, limit), limit };
}

export async function getMonitoringSnapshots(hours = 24) {
  const safeHours = Math.min(168, Math.max(1, hours));
  const since = new Date(Date.now() - safeHours * 3600 * 1000);
  const result = await db.execute(sql`
    SELECT id, snapped_at, overall_status, services_json, triggered_by, webhook_sent_at, webhook_status
    FROM service_health_snapshots
    WHERE snapped_at >= ${since}
    ORDER BY snapped_at DESC
    LIMIT 100
  `);
  return {
    hours: safeHours,
    items: (((result as any).rows ?? []) as any[]).map((row) => ({
      id: row.id,
      snappedAt: toIso(row.snapped_at),
      overallStatus: row.overall_status,
      services: row.services_json ?? [],
      triggeredBy: row.triggered_by ?? null,
      webhookSentAt: row.webhook_sent_at ? toIso(row.webhook_sent_at) : null,
      webhookStatus: row.webhook_status ?? null,
    })),
  };
}

export function getMonitoringRoutes() {
  const withDataGrant = <T extends { path: string }>(routes: T[]) =>
    routes.map((route) => ({ ...route, dataGrant: routeDataGrant(route.path) }));

  return {
    contractVersion: '400line-qian-open-routes-v1',
    generatedAt: new Date().toISOString(),
    rules: [
      '400QIAN browser must call 400QIAN BFF only.',
      '400QIAN BFF calls 400LINE with INTERNAL_API_TOKEN for primary/read-only routes.',
      'ADMIN_TOKEN routes are legacy fallback only and should not become browser-visible.',
      'write-governed routes require a dedicated 400QIAN role/audit flow; monitoring pages must stay read-only.',
      'No route returns token, password, API key, or secret values.',
    ],
    frontendBffRoutes: withDataGrant(qianFrontendBffRoutes),
    monitoringRoutes: withDataGrant(monitoringRouteContracts),
    primaryContractRoutes: withDataGrant(monitoringRouteContracts),
    readOnlyDrilldownRoutes: withDataGrant(qianReadOnlyDrilldownRoutes),
    writeGovernedRoutes: withDataGrant(qianWriteGovernedRoutes),
    legacyFallbackRoutes: withDataGrant(qianLegacyFallbackRoutes),
    publicFallbackRoutes: withDataGrant(qianPublicFallbackRoutes),
    allOpenRoutes: withDataGrant(qianOpenRouteContracts),
    sourceRoutes: monitoringSourceRoutes,
    bffConsumers: [
      {
        method: 'GET',
        path: '/api/bff/system/linebot-management/overview',
        upstream: '/api/internal/monitoring/full-status',
      },
      {
        method: 'GET',
        path: '/api/bff/system/linebot-management/services',
        upstream: '/api/internal/monitoring/full-status',
      },
      {
        method: 'GET',
        path: '/api/bff/system/linebot-management/facilities',
        upstream: '/api/internal/monitoring/full-status + /api/facility-home/list',
      },
      {
        method: 'GET',
        path: '/api/bff/system/linebot-management/whitelist-snapshot',
        upstream: '/api/internal/feature-whitelist + /api/internal/interview-users + /api/internal/announcement-whitelist',
      },
      {
        method: 'GET',
        path: '/api/bff/system/linebot-management/announcement-pipeline',
        upstream: '/api/internal/monitoring/full-status + /api/admin/announcements/health',
      },
    ],
  };
}

export function getMonitoringDependencies() {
  const states = getDependencyStates();
  return {
    items: states.map((dependency) => ({
      key: dependency.key,
      label: dependency.label,
      kind: dependency.kind,
      configured: dependency.configured,
      usedBy: capabilityRegistry
        .filter((capability) => capability.dependencies.includes(dependency.key))
        .map((capability) => capability.key),
    })),
    registryCount: dependencyRegistry.length,
  };
}
