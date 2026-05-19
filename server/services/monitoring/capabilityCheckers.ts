import { sql } from 'drizzle-orm';
import { db } from '../../db';
import { getIngestHealth } from '../announcement/pipelineStats';
import type {
  CapabilityDefinition,
  CapabilityStatus,
  DependencyDefinition,
} from './capabilityRegistry';
import { dependencyRegistry } from './capabilityRegistry';

export interface CapabilityCounters {
  todaySuccess: number;
  todayError: number;
}

export interface CapabilityRuntimeState {
  status: CapabilityStatus;
  configured: boolean;
  lastSuccessAt: string | null;
  lastErrorAt: string | null;
  lastError: string | null;
  latencyMs: number | null;
  counters: CapabilityCounters;
}

export interface DependencyRuntimeState {
  key: string;
  label: string;
  kind: DependencyDefinition['kind'];
  configured: boolean;
}

interface Evidence {
  lastSuccessAt?: string | null;
  lastErrorAt?: string | null;
  lastError?: string | null;
  latencyMs?: number | null;
  todaySuccess?: number;
  todayError?: number;
}

function todayStart(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function configuredFromEnv(keys?: string[], mode: 'all' | 'any' = 'all'): boolean {
  if (!keys || keys.length === 0) return true;
  const checks = keys.map((key) => Boolean(process.env[key]));
  return mode === 'any' ? checks.some(Boolean) : checks.every(Boolean);
}

function toIso(value: unknown): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function truncateError(value: unknown): string | null {
  if (!value) return null;
  return String(value).replace(/\s+/g, ' ').slice(0, 180);
}

function secondsSince(iso: string | null): number | null {
  if (!iso) return null;
  const time = new Date(iso).getTime();
  if (Number.isNaN(time)) return null;
  return Math.floor((Date.now() - time) / 1000);
}

function numberFromDb(value: unknown): number {
  if (typeof value === 'number') return value;
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

async function queryRows<T>(query: any): Promise<T[]> {
  const result = await db.execute(query);
  return ((result as any).rows ?? []) as T[];
}

function evaluateStatus(
  definition: CapabilityDefinition,
  configured: boolean,
  evidence: Evidence,
): CapabilityStatus {
  if (!definition.enabled) return 'disabled';
  if (!configured) return 'not_configured';

  const lastSuccessAt = evidence.lastSuccessAt ?? null;
  const lastErrorAt = evidence.lastErrorAt ?? null;
  const todayError = evidence.todayError ?? 0;

  if (lastErrorAt && (!lastSuccessAt || new Date(lastErrorAt) > new Date(lastSuccessAt))) {
    return 'failing';
  }

  const ageSeconds = secondsSince(lastSuccessAt);
  if (ageSeconds !== null && ageSeconds > definition.staleAfterSeconds) {
    return 'stale';
  }

  if (lastSuccessAt) {
    return todayError > 0 ? 'degraded' : 'healthy';
  }

  if (lastErrorAt) return 'failing';
  if (definition.checker === 'static') return 'healthy';
  return 'unknown';
}

function stateFromEvidence(
  definition: CapabilityDefinition,
  configured: boolean,
  evidence: Evidence,
): CapabilityRuntimeState {
  return {
    status: evaluateStatus(definition, configured, evidence),
    configured,
    lastSuccessAt: evidence.lastSuccessAt ?? null,
    lastErrorAt: evidence.lastErrorAt ?? null,
    lastError: evidence.lastError ?? null,
    latencyMs: evidence.latencyMs ?? null,
    counters: {
      todaySuccess: evidence.todaySuccess ?? 0,
      todayError: evidence.todayError ?? 0,
    },
  };
}

async function checkDatabase(definition: CapabilityDefinition, configured: boolean): Promise<CapabilityRuntimeState> {
  const startedAt = Date.now();
  try {
    await db.execute(sql`SELECT 1`);
    return stateFromEvidence(definition, configured, {
      lastSuccessAt: new Date().toISOString(),
      latencyMs: Date.now() - startedAt,
      todaySuccess: 1,
      todayError: 0,
    });
  } catch (err: any) {
    return stateFromEvidence(definition, configured, {
      lastErrorAt: new Date().toISOString(),
      lastError: truncateError(err?.message),
      latencyMs: Date.now() - startedAt,
      todaySuccess: 0,
      todayError: 1,
    });
  }
}

async function checkLineBotInfo(definition: CapabilityDefinition, configured: boolean): Promise<CapabilityRuntimeState> {
  if (!configured) return stateFromEvidence(definition, configured, {});

  const startedAt = Date.now();
  try {
    const response = await fetch('https://api.line.me/v2/bot/info', {
      headers: { Authorization: `Bearer ${process.env.CHANNEL_ACCESS_TOKEN}` },
      signal: AbortSignal.timeout(5000),
    });
    const latencyMs = Date.now() - startedAt;
    if (response.ok) {
      return stateFromEvidence(definition, configured, {
        lastSuccessAt: new Date().toISOString(),
        latencyMs,
        todaySuccess: 1,
      });
    }
    return stateFromEvidence(definition, configured, {
      lastErrorAt: new Date().toISOString(),
      lastError: `HTTP ${response.status}`,
      latencyMs,
      todayError: 1,
    });
  } catch (err: any) {
    return stateFromEvidence(definition, configured, {
      lastErrorAt: new Date().toISOString(),
      lastError: truncateError(err?.message),
      latencyMs: Date.now() - startedAt,
      todayError: 1,
    });
  }
}

async function checkAuditCategory(definition: CapabilityDefinition, configured: boolean): Promise<CapabilityRuntimeState> {
  const categories = definition.auditCategories ?? [];
  if (categories.length === 0) return stateFromEvidence(definition, configured, {});

  const categoryList = sql.join(categories.map((category) => sql`${category}`), sql`, `);
  const [row] = await queryRows<{
    last_success_at: unknown;
    last_error_at: unknown;
    last_error: unknown;
    today_success: unknown;
    today_error: unknown;
  }>(sql`
    SELECT
      MAX(timestamp) FILTER (WHERE level <> 'error') AS last_success_at,
      MAX(timestamp) FILTER (WHERE level = 'error') AS last_error_at,
      (ARRAY_AGG(message ORDER BY timestamp DESC) FILTER (WHERE level = 'error'))[1] AS last_error,
      COUNT(*) FILTER (WHERE timestamp >= ${todayStart()} AND level <> 'error') AS today_success,
      COUNT(*) FILTER (WHERE timestamp >= ${todayStart()} AND level = 'error') AS today_error
    FROM audit_logs
    WHERE category IN (${categoryList})
  `);

  return stateFromEvidence(definition, configured, {
    lastSuccessAt: toIso(row?.last_success_at),
    lastErrorAt: toIso(row?.last_error_at),
    lastError: truncateError(row?.last_error),
    todaySuccess: numberFromDb(row?.today_success),
    todayError: numberFromDb(row?.today_error),
  });
}

async function checkMessages(definition: CapabilityDefinition, configured: boolean): Promise<CapabilityRuntimeState> {
  const [row] = await queryRows<{
    last_success_at: unknown;
    today_success: unknown;
  }>(sql`
    SELECT
      MAX(created_at) AS last_success_at,
      COUNT(*) FILTER (WHERE created_at >= ${todayStart()}) AS today_success
    FROM messages
  `);

  return stateFromEvidence(definition, configured, {
    lastSuccessAt: toIso(row?.last_success_at),
    todaySuccess: numberFromDb(row?.today_success),
  });
}

async function checkOutgoingMessages(definition: CapabilityDefinition, configured: boolean): Promise<CapabilityRuntimeState> {
  const sendType = definition.outgoingSendType;
  const sendTypeFilter = sendType ? sql`AND send_type = ${sendType}` : sql``;
  const [row] = await queryRows<{
    last_success_at: unknown;
    last_error_at: unknown;
    last_error: unknown;
    today_success: unknown;
    today_error: unknown;
  }>(sql`
    SELECT
      MAX(created_at) FILTER (WHERE status = 'sent') AS last_success_at,
      MAX(created_at) FILTER (WHERE status = 'failed') AS last_error_at,
      (ARRAY_AGG(error_message ORDER BY created_at DESC) FILTER (WHERE status = 'failed'))[1] AS last_error,
      COUNT(*) FILTER (WHERE created_at >= ${todayStart()} AND status = 'sent') AS today_success,
      COUNT(*) FILTER (WHERE created_at >= ${todayStart()} AND status = 'failed') AS today_error
    FROM outgoing_messages
    WHERE 1 = 1 ${sendTypeFilter}
  `);

  return stateFromEvidence(definition, configured, {
    lastSuccessAt: toIso(row?.last_success_at),
    lastErrorAt: toIso(row?.last_error_at),
    lastError: truncateError(row?.last_error),
    todaySuccess: numberFromDb(row?.today_success),
    todayError: numberFromDb(row?.today_error),
  });
}

async function checkTasks(definition: CapabilityDefinition, configured: boolean): Promise<CapabilityRuntimeState> {
  const [row] = await queryRows<{
    last_success_at: unknown;
    last_completed_at: unknown;
    today_success: unknown;
    today_completed: unknown;
  }>(sql`
    SELECT
      MAX(created_at) AS last_success_at,
      MAX(completed_at) AS last_completed_at,
      COUNT(*) FILTER (WHERE created_at >= ${todayStart()}) AS today_success,
      COUNT(*) FILTER (WHERE completed_at >= ${todayStart()}) AS today_completed
    FROM tasks
  `);

  const lastCreatedAt = toIso(row?.last_success_at);
  const lastCompletedAt = toIso(row?.last_completed_at);
  const lastSuccessAt =
    lastCompletedAt && (!lastCreatedAt || new Date(lastCompletedAt) > new Date(lastCreatedAt))
      ? lastCompletedAt
      : lastCreatedAt;

  return stateFromEvidence(definition, configured, {
    lastSuccessAt,
    todaySuccess: numberFromDb(row?.today_success) + numberFromDb(row?.today_completed),
  });
}

async function checkFacilityList(definition: CapabilityDefinition, configured: boolean): Promise<CapabilityRuntimeState> {
  const [row] = await queryRows<{ total: unknown }>(sql`SELECT COUNT(*) AS total FROM facilities`);
  const total = numberFromDb(row?.total);
  return stateFromEvidence(definition, configured, {
    lastSuccessAt: total > 0 ? new Date().toISOString() : null,
    todaySuccess: total,
  });
}

async function checkAnnouncementPipeline(definition: CapabilityDefinition, configured: boolean): Promise<CapabilityRuntimeState> {
  try {
    const health = getIngestHealth();
    return stateFromEvidence(definition, configured, {
      lastSuccessAt: toIso(health.lastIngestAt),
      lastErrorAt: toIso(health.lastError?.at),
      lastError: truncateError(health.lastError?.message),
      todaySuccess: health.totalIngestCallsAllTime ?? 0,
      todayError: health.lastError ? 1 : 0,
    });
  } catch (err: any) {
    return stateFromEvidence(definition, configured, {
      lastErrorAt: new Date().toISOString(),
      lastError: truncateError(err?.message),
      todayError: 1,
    });
  }
}

async function checkServiceSnapshots(definition: CapabilityDefinition, configured: boolean): Promise<CapabilityRuntimeState> {
  const [row] = await queryRows<{
    snapped_at: unknown;
    overall_status: unknown;
    webhook_status: unknown;
  }>(sql`
    SELECT snapped_at, overall_status, webhook_status
    FROM service_health_snapshots
    ORDER BY snapped_at DESC
    LIMIT 1
  `);

  const webhookStatus = String(row?.webhook_status ?? '');
  const failed = webhookStatus.startsWith('failed') || webhookStatus.startsWith('error');

  return stateFromEvidence(definition, configured, {
    lastSuccessAt: failed ? null : toIso(row?.snapped_at),
    lastErrorAt: failed ? toIso(row?.snapped_at) : null,
    lastError: failed ? truncateError(webhookStatus) : null,
    todaySuccess: row ? (failed ? 0 : 1) : 0,
    todayError: failed ? 1 : 0,
  });
}

export async function checkCapability(definition: CapabilityDefinition): Promise<CapabilityRuntimeState> {
  const configured = configuredFromEnv(definition.envKeys, definition.envMode);

  if (!definition.enabled || !configured || definition.checker === 'static') {
    return stateFromEvidence(definition, configured, {
      lastSuccessAt: definition.enabled && configured ? new Date().toISOString() : null,
    });
  }

  try {
    switch (definition.checker) {
      case 'database':
        return checkDatabase(definition, configured);
      case 'lineBotInfo':
        return checkLineBotInfo(definition, configured);
      case 'messageActivity':
        return checkMessages(definition, configured);
      case 'outgoingMessages':
        return checkOutgoingMessages(definition, configured);
      case 'auditCategory':
        return checkAuditCategory(definition, configured);
      case 'tasks':
        return checkTasks(definition, configured);
      case 'facilityList':
        return checkFacilityList(definition, configured);
      case 'announcementPipeline':
        return checkAnnouncementPipeline(definition, configured);
      case 'serviceSnapshots':
        return checkServiceSnapshots(definition, configured);
      default:
        return stateFromEvidence(definition, configured, {});
    }
  } catch (err: any) {
    return stateFromEvidence(definition, configured, {
      lastErrorAt: new Date().toISOString(),
      lastError: truncateError(err?.message),
      todayError: 1,
    });
  }
}

export function getDependencyStates(): DependencyRuntimeState[] {
  return dependencyRegistry.map((dependency) => ({
    key: dependency.key,
    label: dependency.label,
    kind: dependency.kind,
    configured: configuredFromEnv(dependency.envKeys, dependency.envMode),
  }));
}
