/**
 * Dashboard Pusher
 * 將服務健康快照推送到外部儀表板 webhook
 * - DASHBOARD_WEBHOOK_URL：目標 URL（空白則停用）
 * - DASHBOARD_WEBHOOK_SECRET：HMAC-SHA256 簽名金鑰
 * - X-Hub-Signature-256 header（格式同 GitHub webhook）
 */

import { createHmac } from 'crypto';
import { db } from '../../db';
import { serviceHealthSnapshots } from '@shared/schema';

export interface ServiceStatusEntry {
  service: string;
  status: 'healthy' | 'degraded' | 'unhealthy';
  note?: string;
  checkedAt?: string;
}

export interface HealthPayload {
  overall: 'healthy' | 'degraded' | 'critical';
  healthyCount: number;
  totalCount: number;
  services: ServiceStatusEntry[];
  checkedAt: string;
  env?: string;
}

function signPayload(body: string, secret: string): string {
  return 'sha256=' + createHmac('sha256', secret).update(body).digest('hex');
}

export async function pushHealthSnapshot(
  payload: HealthPayload,
  triggeredBy: 'cron' | 'push' | 'manual' = 'cron',
): Promise<{ ok: boolean; status?: number; error?: string }> {
  const webhookUrl = process.env.DASHBOARD_WEBHOOK_URL;
  if (!webhookUrl) return { ok: true }; // 停用模式

  const body = JSON.stringify({ ...payload, triggeredBy });
  const secret = process.env.DASHBOARD_WEBHOOK_SECRET ?? '';
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Push-Source': 'line-secretary',
    'X-Triggered-By': triggeredBy,
  };
  if (secret) headers['X-Hub-Signature-256'] = signPayload(body, secret);

  let webhookSentAt: Date | undefined;
  let webhookStatus: string;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const resp = await fetch(webhookUrl, { method: 'POST', headers, body, signal: controller.signal });
    clearTimeout(timeout);
    webhookSentAt = new Date();
    webhookStatus = resp.ok ? 'success' : `failed_${resp.status}`;

    // 儲存快照
    await db.insert(serviceHealthSnapshots).values({
      overallStatus: payload.overall,
      servicesJson: payload.services as any,
      triggeredBy,
      webhookSentAt: webhookSentAt ?? null,
      webhookStatus,
    });

    return { ok: resp.ok, status: resp.status };
  } catch (err: any) {
    webhookStatus = `error:${err?.message?.substring(0, 40) ?? 'unknown'}`;
    try {
      await db.insert(serviceHealthSnapshots).values({
        overallStatus: payload.overall,
        servicesJson: payload.services as any,
        triggeredBy,
        webhookSentAt: null,
        webhookStatus,
      });
    } catch {}
    return { ok: false, error: err?.message };
  }
}

export async function storeHealthSnapshot(
  payload: HealthPayload,
  triggeredBy: 'cron' | 'push' | 'manual' = 'manual',
): Promise<void> {
  try {
    await db.insert(serviceHealthSnapshots).values({
      overallStatus: payload.overall,
      servicesJson: payload.services as any,
      triggeredBy,
      webhookSentAt: null,
      webhookStatus: null,
    });
  } catch (err: any) {
    console.error('[dashboardPusher] storeHealthSnapshot failed:', err?.message);
  }
}
