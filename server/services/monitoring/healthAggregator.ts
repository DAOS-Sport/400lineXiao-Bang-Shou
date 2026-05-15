/**
 * 健康聚合器
 * 彙整各子系統的健康狀態，供 /api/admin/service-status 端點使用
 */

import { db } from '../../db';
import { serviceHealthSnapshots } from '@shared/schema';
import { desc, gte } from 'drizzle-orm';
import { getIngestHealth } from '../announcement/pipelineStats';
import type { HealthPayload, ServiceStatusEntry } from './dashboardPusher';

async function checkDatabase(): Promise<ServiceStatusEntry> {
  try {
    await db.execute('SELECT 1' as any);
    return { service: 'database', status: 'healthy', note: 'PostgreSQL OK' };
  } catch (err: any) {
    return { service: 'database', status: 'unhealthy', note: err?.message?.substring(0, 60) };
  }
}

async function checkLineBot(): Promise<ServiceStatusEntry> {
  const token = process.env.CHANNEL_ACCESS_TOKEN;
  if (!token) return { service: 'line_bot', status: 'degraded', note: 'CHANNEL_ACCESS_TOKEN 未設定' };
  try {
    const r = await fetch('https://api.line.me/v2/bot/info', {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(5000),
    });
    return {
      service: 'line_bot',
      status: r.ok ? 'healthy' : 'degraded',
      note: r.ok ? 'LINE Bot API OK' : `HTTP ${r.status}`,
    };
  } catch (err: any) {
    return { service: 'line_bot', status: 'degraded', note: `連線失敗: ${err?.message?.substring(0, 40)}` };
  }
}

function checkGemini(): ServiceStatusEntry {
  const key = process.env.GEMINI_API_KEY;
  return {
    service: 'gemini_api',
    status: key ? 'healthy' : 'degraded',
    note: key ? 'API key 已設定' : 'GEMINI_API_KEY 未設定',
  };
}

function checkOpenAI(): ServiceStatusEntry {
  const key = process.env.OPENAI_API_KEY;
  return {
    service: 'openai_api',
    status: key ? 'healthy' : 'degraded',
    note: key ? 'API key 已設定' : 'OPENAI_API_KEY 未設定',
  };
}

function checkAnnouncementPipeline(): ServiceStatusEntry {
  try {
    const health = getIngestHealth();
    // lastIngestAt 超過 24h 視為 degraded（無訊息進入）
    const lastAt = health.lastIngestAt ? new Date(health.lastIngestAt).getTime() : 0;
    const stale = lastAt > 0 && Date.now() - lastAt > 24 * 3600 * 1000;
    const hasError = !!health.lastError;
    const status = (!lastAt || stale) ? 'degraded' : hasError ? 'degraded' : 'healthy';
    const note = !lastAt ? '尚無訊息進入'
      : stale ? `最後進入 > 24h 前 (${health.lastIngestAt})`
      : hasError ? `最後錯誤: ${health.lastError!.message.substring(0, 60)}`
      : `正常，最後進入 ${health.lastIngestAt}`;
    return {
      service: 'announcement_pipeline',
      status,
      note,
      checkedAt: health.lastIngestAt ?? undefined,
    };
  } catch {
    return { service: 'announcement_pipeline', status: 'degraded', note: '狀態無法讀取' };
  }
}

export async function aggregateHealth(): Promise<HealthPayload> {
  const checkedAt = new Date().toISOString();
  const [dbSvc, lineSvc] = await Promise.all([checkDatabase(), checkLineBot()]);
  const services: ServiceStatusEntry[] = [
    dbSvc,
    lineSvc,
    checkGemini(),
    checkOpenAI(),
    checkAnnouncementPipeline(),
  ];

  const healthyCount = services.filter(s => s.status === 'healthy').length;
  const unhealthyCount = services.filter(s => s.status === 'unhealthy').length;
  const overall = unhealthyCount >= 2 ? 'critical' : unhealthyCount === 1 ? 'degraded' : healthyCount === services.length ? 'healthy' : 'degraded';

  return { overall, healthyCount, totalCount: services.length, services, checkedAt };
}

export async function getRecentSnapshots(limitHours = 24): Promise<typeof serviceHealthSnapshots.$inferSelect[]> {
  const since = new Date(Date.now() - limitHours * 3600 * 1000);
  return db.select().from(serviceHealthSnapshots)
    .where(gte(serviceHealthSnapshots.snappedAt, since))
    .orderBy(desc(serviceHealthSnapshots.snappedAt))
    .limit(100);
}
