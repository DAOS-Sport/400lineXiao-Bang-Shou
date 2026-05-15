/**
 * 公告白名單存取層
 * - 存取 announcement_whitelist_users 表
 * - 5 分鐘 in-memory cache
 * - announcementConfig.ts 的 VIP_USERS 常數作為 fallback seed
 */

import { db } from '../../db';
import { announcementWhitelistUsers, type AnnouncementWhitelistUser } from '@shared/schema';
import { eq } from 'drizzle-orm';

const CACHE_TTL_MS = 5 * 60 * 1000;

interface Cache {
  vipMap: Record<string, string>;
  loadedAt: number;
}

let _cache: Cache | null = null;

function isCacheValid(): boolean {
  return !!_cache && Date.now() - _cache.loadedAt < CACHE_TTL_MS;
}

export function invalidateWhitelistCache(): void {
  _cache = null;
}

export async function getVipUserMap(): Promise<Record<string, string>> {
  if (isCacheValid()) return _cache!.vipMap;

  try {
    const rows = await db.select()
      .from(announcementWhitelistUsers)
      .where(eq(announcementWhitelistUsers.isActive, true));

    const vipMap: Record<string, string> = {};
    for (const row of rows) {
      if (row.role === 'vip') vipMap[row.userId] = row.userName;
    }

    _cache = { vipMap, loadedAt: Date.now() };
    return vipMap;
  } catch (err) {
    console.error('[whitelistRepo] DB query failed, using empty map:', (err as Error).message);
    return {};
  }
}

export async function listWhitelistUsers(): Promise<AnnouncementWhitelistUser[]> {
  return db.select().from(announcementWhitelistUsers);
}

export async function addWhitelistUser(params: {
  userId: string;
  userName: string;
  role?: string;
  note?: string;
  addedBy?: string;
}): Promise<AnnouncementWhitelistUser> {
  const [created] = await db.insert(announcementWhitelistUsers).values({
    userId: params.userId,
    userName: params.userName,
    role: params.role ?? 'vip',
    note: params.note ?? null,
    addedBy: params.addedBy ?? null,
    isActive: true,
  }).returning();
  invalidateWhitelistCache();
  return created;
}

export async function updateWhitelistUser(
  userId: string,
  patch: Partial<{ userName: string; role: string; note: string; isActive: boolean }>,
): Promise<AnnouncementWhitelistUser | null> {
  const [updated] = await db.update(announcementWhitelistUsers)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(announcementWhitelistUsers.userId, userId))
    .returning();
  if (updated) invalidateWhitelistCache();
  return updated ?? null;
}

export async function deleteWhitelistUser(userId: string): Promise<boolean> {
  const [deleted] = await db.delete(announcementWhitelistUsers)
    .where(eq(announcementWhitelistUsers.userId, userId))
    .returning();
  if (deleted) invalidateWhitelistCache();
  return !!deleted;
}
