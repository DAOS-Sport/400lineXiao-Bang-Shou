/**
 * 駿斯工作台 BFF 內部 API
 *
 * 專供 server-to-server 呼叫，不需要 LINE session / LIFF。
 * 認證：INTERNAL_API_TOKEN（constant-time compare）
 * 接受以下任一 header：
 *   Authorization: Bearer <token>
 *   X-Internal-Token: <token>
 *   X-API-Key: <token>
 *
 * 所有路由只回 JSON，永遠不會回 HTML。
 *
 * 路由清單：
 *   GET /api/internal/facility-home/:groupId/home
 *   GET /api/internal/facility-home/:groupId/announcements
 *   GET /api/internal/facility-home/:groupId/announcements/:id
 *   GET /api/internal/facility-home/:groupId/today-shift
 *   GET /api/internal/facility-home/:groupId/handover
 */

import { Router, Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { db } from '../db';
import { publishedAnnouncements, facilities } from '@shared/schema';
import { eq, and, or, gte, ilike, isNull, desc, sql } from 'drizzle-orm';

export const internalRouter = Router();

// ═══════════════════════════════════════════════════════════════════════════
// 認證中介層
// ═══════════════════════════════════════════════════════════════════════════

function extractToken(req: Request): string | null {
  const authHeader = req.headers['authorization'];
  if (authHeader?.startsWith('Bearer ')) return authHeader.slice(7);
  const xInternal = req.headers['x-internal-token'];
  if (xInternal) return Array.isArray(xInternal) ? xInternal[0] : xInternal;
  const xApiKey = req.headers['x-api-key'];
  if (xApiKey) return Array.isArray(xApiKey) ? xApiKey[0] : xApiKey;
  return null;
}

function constantTimeEqual(a: string, b: string): boolean {
  try {
    const bufA = Buffer.from(a);
    const bufB = Buffer.from(b);
    if (bufA.length !== bufB.length) {
      // still run timingSafeEqual to avoid timing leakage
      crypto.timingSafeEqual(Buffer.alloc(bufA.length), Buffer.alloc(bufA.length));
      return false;
    }
    return crypto.timingSafeEqual(bufA, bufB);
  } catch {
    return false;
  }
}

function internalAuth(req: Request, res: Response, next: NextFunction) {
  const expectedToken = process.env.INTERNAL_API_TOKEN;
  if (!expectedToken) {
    return res.status(503).json({ message: 'internal token not configured' });
  }
  const token = extractToken(req);
  if (!token || !constantTimeEqual(token, expectedToken)) {
    return res.status(401).json({ message: 'unauthorized' });
  }
  return next();
}

internalRouter.use(internalAuth);

// ═══════════════════════════════════════════════════════════════════════════
// 輔助函式
// ═══════════════════════════════════════════════════════════════════════════

async function resolveFacility(groupId: string) {
  const rows = await db
    .select()
    .from(facilities)
    .where(eq(facilities.lineGroupId, groupId))
    .limit(1);
  return rows[0] ?? null;
}

function buildActiveFilter(facility: { id: number; lineGroupId: string | null }) {
  const now = new Date();
  const inFacilityList = sql`${publishedAnnouncements.appliesToFacilityIdsJson} @> ${JSON.stringify([facility.id])}::jsonb`;

  return and(
    eq(publishedAnnouncements.status, 'published'),
    or(
      isNull(publishedAnnouncements.effectiveEndAt),
      gte(publishedAnnouncements.effectiveEndAt, now),
    ),
    or(
      eq(publishedAnnouncements.scopeType, 'global'),
      inFacilityList,
      ...(facility.lineGroupId
        ? [eq(publishedAnnouncements.facilityLineGroupId, facility.lineGroupId)]
        : []),
    ),
  );
}

/** 把 DB 行轉成 BFF 友好的扁平格式 */
function formatAnnouncement(row: typeof publishedAnnouncements.$inferSelect) {
  const isMustRead = row.priority === 'critical' || row.priority === 'high' || row.homeVisibility === 'pinned';

  let effectiveRange: string | null = null;
  if (row.effectiveStartAt || row.effectiveEndAt) {
    const start = row.effectiveStartAt ? new Date(row.effectiveStartAt).toISOString() : null;
    const end = row.effectiveEndAt ? new Date(row.effectiveEndAt).toISOString() : null;
    effectiveRange = [start, end].filter(Boolean).join(' - ');
  }

  return {
    id: row.id,
    title: row.title,
    summary: row.summary,
    body: row.body ?? null,
    priority: row.priority,
    candidateType: row.candidateType,
    scopeType: row.scopeType,
    homeVisibility: row.homeVisibility,
    needsAck: row.needsAck,
    isMustRead,
    recommendedAction: row.recommendedAction ?? null,
    recommendedReply: row.recommendedReply ?? null,
    badExample: row.badExample ?? null,
    appliesToRoles: (row.appliesToRolesJson as string[]) ?? [],
    effectiveRange,
    effectiveStartAt: row.effectiveStartAt ? new Date(row.effectiveStartAt).toISOString() : null,
    effectiveEndAt: row.effectiveEndAt ? new Date(row.effectiveEndAt).toISOString() : null,
    publishedAt: new Date(row.publishedAt).toISOString(),
    facilityLineGroupId: row.facilityLineGroupId ?? null,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// GET /api/internal/facility-home/:groupId/home
// BFF 整合首頁：公告（mustRead/normal 分區）+ handover + todayShift + campaigns
// ═══════════════════════════════════════════════════════════════════════════

internalRouter.get('/facility-home/:groupId/home', async (req, res) => {
  const { groupId } = req.params;

  let facility;
  try {
    facility = await resolveFacility(groupId);
  } catch (err: any) {
    console.error('❌ [internal/home] resolveFacility 失敗:', err?.message);
    return res.status(500).json({ message: '伺服器錯誤' });
  }

  if (!facility) {
    return res.status(404).json({ message: `找不到對應館別：${groupId}` });
  }

  try {
    const rows = await db
      .select()
      .from(publishedAnnouncements)
      .where(buildActiveFilter(facility))
      .orderBy(
        desc(sql`CASE home_visibility WHEN 'pinned' THEN 0 ELSE 1 END`),
        desc(sql`CASE priority WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END`),
        desc(publishedAnnouncements.publishedAt),
      );

    const formatted = rows.map(formatAnnouncement);
    const mustRead = formatted.filter(a => a.isMustRead);
    const normal = formatted.filter(a => !a.isMustRead);
    const campaigns = formatted.filter(a => a.candidateType === 'campaign');

    return res.json({
      facilityName: facility.name,
      facilityShortName: facility.shortName,
      groupId: facility.lineGroupId,
      mustRead,
      announcements: normal,
      campaigns,
      handover: [],
      todayShift: [],
      total: rows.length,
      generatedAt: new Date().toISOString(),
    });
  } catch (err: any) {
    console.error('❌ [internal/home] 查詢失敗:', err?.message);
    return res.status(500).json({ message: '伺服器錯誤' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// GET /api/internal/facility-home/:groupId/announcements
// Query: ?page=1&pageSize=20&q=&type=
// ═══════════════════════════════════════════════════════════════════════════

internalRouter.get('/facility-home/:groupId/announcements', async (req, res) => {
  const { groupId } = req.params;
  const q = (req.query.q as string | undefined)?.trim() || '';
  const type = req.query.type as string | undefined;
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  // BFF 用 pageSize；向後相容 limit
  const pageSize = Math.min(100, Math.max(1, parseInt((req.query.pageSize ?? req.query.limit) as string) || 20));
  const offset = (page - 1) * pageSize;

  let facility;
  try {
    facility = await resolveFacility(groupId);
  } catch (err: any) {
    console.error('❌ [internal/announcements] resolveFacility 失敗:', err?.message);
    return res.status(500).json({ message: '伺服器錯誤' });
  }

  if (!facility) {
    return res.status(404).json({ message: `找不到對應館別：${groupId}` });
  }

  try {
    const conditions: ReturnType<typeof and>[] = [buildActiveFilter(facility) as any];

    if (q) {
      conditions.push(
        or(
          ilike(publishedAnnouncements.title, `%${q}%`),
          ilike(publishedAnnouncements.summary, `%${q}%`),
        ) as any,
      );
    }

    if (type && ['rule', 'notice', 'campaign', 'discount', 'script'].includes(type)) {
      conditions.push(eq(publishedAnnouncements.candidateType, type) as any);
    }

    const where = and(...conditions);

    const [rows, countRows] = await Promise.all([
      db
        .select()
        .from(publishedAnnouncements)
        .where(where)
        .orderBy(desc(publishedAnnouncements.publishedAt))
        .limit(pageSize)
        .offset(offset),
      db
        .select({ count: sql<number>`COUNT(*)` })
        .from(publishedAnnouncements)
        .where(where),
    ]);

    const total = Number(countRows[0]?.count ?? 0);

    return res.json({
      items: rows.map(formatAnnouncement),
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
        hasNext: page * pageSize < total,
      },
    });
  } catch (err: any) {
    console.error('❌ [internal/announcements] 查詢失敗:', err?.message);
    return res.status(500).json({ message: '伺服器錯誤' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// GET /api/internal/facility-home/:groupId/announcements/:id
// ═══════════════════════════════════════════════════════════════════════════

internalRouter.get('/facility-home/:groupId/announcements/:id', async (req, res) => {
  const { groupId, id } = req.params;
  const annId = parseInt(id);
  if (isNaN(annId)) {
    return res.status(400).json({ message: 'id 格式錯誤，需為整數' });
  }

  let facility;
  try {
    facility = await resolveFacility(groupId);
  } catch (err: any) {
    console.error('❌ [internal/announcements/:id] resolveFacility 失敗:', err?.message);
    return res.status(500).json({ message: '伺服器錯誤' });
  }

  if (!facility) {
    return res.status(404).json({ message: `找不到對應館別：${groupId}` });
  }

  try {
    const rows = await db
      .select()
      .from(publishedAnnouncements)
      .where(and(eq(publishedAnnouncements.id, annId), buildActiveFilter(facility)))
      .limit(1);

    if (!rows[0]) {
      return res.status(404).json({ message: '公告不存在或不屬於此館別' });
    }

    return res.json({ data: formatAnnouncement(rows[0]) });
  } catch (err: any) {
    console.error('❌ [internal/announcements/:id] 查詢失敗:', err?.message);
    return res.status(500).json({ message: '伺服器錯誤' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// GET /api/internal/facility-home/:groupId/today-shift
// 今日班表（目前尚未建表，回空陣列）
// ═══════════════════════════════════════════════════════════════════════════

internalRouter.get('/facility-home/:groupId/today-shift', async (req, res) => {
  const { groupId } = req.params;

  let facility;
  try {
    facility = await resolveFacility(groupId);
  } catch (err: any) {
    return res.status(500).json({ message: '伺服器錯誤' });
  }

  if (!facility) {
    return res.status(404).json({ message: `找不到對應館別：${groupId}` });
  }

  return res.json({
    groupId: facility.lineGroupId,
    facilityName: facility.name,
    todayShift: [],
    note: 'today-shift 功能尚未建置，回傳空陣列',
    generatedAt: new Date().toISOString(),
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// GET /api/internal/facility-home/:groupId/handover
// 交接事項（目前尚未建表，回空陣列）
// ═══════════════════════════════════════════════════════════════════════════

internalRouter.get('/facility-home/:groupId/handover', async (req, res) => {
  const { groupId } = req.params;

  let facility;
  try {
    facility = await resolveFacility(groupId);
  } catch (err: any) {
    return res.status(500).json({ message: '伺服器錯誤' });
  }

  if (!facility) {
    return res.status(404).json({ message: `找不到對應館別：${groupId}` });
  }

  return res.json({
    groupId: facility.lineGroupId,
    facilityName: facility.name,
    handover: [],
    note: 'handover 功能尚未建置，回傳空陣列',
    generatedAt: new Date().toISOString(),
  });
});
