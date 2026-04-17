/**
 * supervisorResolver — 主管身份解析
 *
 * 優先查 users 表 role='supervisor'；
 * 查不到再回退 SUPERVISOR_USER_IDS 環境變數。
 */

import { db } from '../db';
import { users } from '@shared/schema';
import { eq, inArray } from 'drizzle-orm';

export interface SupervisorInfo {
  isSupervisor: boolean;
  displayName?: string;
  facilityScope?: string[];
  priority?: 'high' | 'normal';
}

// 環境變數：逗號分隔的 supervisor LINE user ID 清單
const SUPERVISOR_IDS_FROM_ENV: Set<string> = new Set(
  (process.env.SUPERVISOR_USER_IDS ?? '').split(',').map(s => s.trim()).filter(Boolean),
);

// 記憶體快取（5 分鐘 TTL）
const cache = new Map<string, { info: SupervisorInfo; expiresAt: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000;

export async function isSupervisor(lineUserId: string): Promise<SupervisorInfo> {
  // 1. 快取命中
  const cached = cache.get(lineUserId);
  if (cached && cached.expiresAt > Date.now()) return cached.info;

  // 2. 查 users 表
  try {
    const rows = await db.select()
      .from(users)
      .where(eq(users.lineUserId, lineUserId));

    if (rows.length > 0) {
      const user = rows[0];
      const isSup = user.role === 'supervisor' || user.role === 'admin';
      const info: SupervisorInfo = {
        isSupervisor: isSup,
        displayName: user.displayName ?? undefined,
        priority: isSup ? 'high' : 'normal',
      };
      cache.set(lineUserId, { info, expiresAt: Date.now() + CACHE_TTL_MS });
      return info;
    }
  } catch (_err) {
    // DB 查詢失敗時回退環境變數
  }

  // 3. 回退：環境變數清單
  const isSup = SUPERVISOR_IDS_FROM_ENV.has(lineUserId);
  const info: SupervisorInfo = { isSupervisor: isSup, priority: isSup ? 'high' : 'normal' };
  cache.set(lineUserId, { info, expiresAt: Date.now() + CACHE_TTL_MS });
  return info;
}

/** 把 SUPERVISOR_USER_IDS 環境變數同步為 users.role = 'supervisor' */
export async function initializeSupervisors(): Promise<void> {
  if (SUPERVISOR_IDS_FROM_ENV.size === 0) return;

  console.log(`🔧 同步主管身份 (${SUPERVISOR_IDS_FROM_ENV.size} 人)...`);

  try {
    const ids = [...SUPERVISOR_IDS_FROM_ENV];
    const existing = await db.select().from(users).where(inArray(users.lineUserId, ids));
    const existingIds = new Set(existing.map(u => u.lineUserId).filter(Boolean) as string[]);

    for (const lineUserId of ids) {
      if (existingIds.has(lineUserId)) {
        // 更新為主管角色
        const user = existing.find(u => u.lineUserId === lineUserId);
        if (user && user.role !== 'supervisor' && user.role !== 'admin') {
          await db.update(users)
            .set({ role: 'supervisor', updatedAt: new Date() })
            .where(eq(users.lineUserId, lineUserId));
        }
      } else {
        // 建立主管用戶
        await db.insert(users).values({
          lineUserId,
          role: 'supervisor',
          isActive: true,
        }).onConflictDoNothing();
      }
    }
    console.log(`✅ 主管身份同步完成`);
  } catch (err: any) {
    console.error('❌ 主管身份同步失敗:', err?.message);
  }
}

/** 清除快取（用於測試或強制更新） */
export function clearSupervisorCache(): void {
  cache.clear();
}
