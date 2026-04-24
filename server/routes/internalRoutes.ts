/**
 * 駿斯工作台 BFF 內部 API
 *
 * 專供 server-to-server 呼叫，不需要 LINE session / LIFF。
 * 永遠只回 JSON，不回 HTML。
 *
 * 認證：INTERNAL_API_TOKEN 環境變數（constant-time compare）
 * 接受以下任一 header：
 *   Authorization: Bearer <token>
 *   X-Internal-Token: <token>
 *   X-API-Key: <token>
 *
 * 錯誤格式：
 *   無 token  → 401 { "message": "MISSING_INTERNAL_TOKEN" }
 *   錯 token  → 403 { "message": "INVALID_INTERNAL_TOKEN" }
 *   找不到館別 → 404 { "message": "FACILITY_GROUP_NOT_FOUND" }
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

// ── facilityKey 對照表（groupId → facilityKey）────────────────────────────────

const GROUP_FACILITY_KEYS: Record<string, string> = {
  C66a4b3bb3fbc3dcf52d42626ec512484: 'xinbei_pool',
  C6f6f163895d5b528a6ab044015e1a37b: 'sanchong_pool',
  C2dc6991e51074dd47d5d275d568318f7: 'sanmin_pool',
  C9b3c5dfe2e005adafd2ed914714a1930: 'songshan_pool',
  C50c2a9623a78cc5f5e9f39557e3abfe6: 'zhuke_outdoor_pool',
  C360be1fe6ea876a4df3ca0497bca4e3b: 'zhuke_sports',
  C2dd9a5fce7c276f2cbfdd02c2342661c: 'sanmin_shift',
  Ce936c6bebb59b8b5683ffbcf97bf20de: 'auth_group',
  Cc2100498c7c5627c1e86e93f7c4eb817: 'salu_counter',
};

// ═══════════════════════════════════════════════════════════════════════════
// 認證中介層
// ═══════════════════════════════════════════════════════════════════════════

function extractToken(req: Request): string | null {
  const authHeader = req.headers['authorization'];
  if (authHeader?.startsWith('Bearer ')) return authHeader.slice(7).trim();
  const xInternal = req.headers['x-internal-token'];
  if (xInternal) return Array.isArray(xInternal) ? xInternal[0] : xInternal as string;
  const xApiKey = req.headers['x-api-key'];
  if (xApiKey) return Array.isArray(xApiKey) ? xApiKey[0] : xApiKey as string;
  return null;
}

function constantTimeEqual(a: string, b: string): boolean {
  try {
    const bufA = Buffer.from(a);
    const bufB = Buffer.from(b);
    if (bufA.length !== bufB.length) {
      crypto.timingSafeEqual(Buffer.alloc(bufA.length), Buffer.alloc(bufA.length));
      return false;
    }
    return crypto.timingSafeEqual(bufA, bufB);
  } catch {
    return false;
  }
}

function requireInternalToken(req: Request, res: Response, next: NextFunction) {
  const expectedToken = process.env.INTERNAL_API_TOKEN;
  if (!expectedToken) {
    return res.status(503).json({ message: 'INTERNAL_TOKEN_NOT_CONFIGURED' });
  }
  const token = extractToken(req);
  if (!token) {
    return res.status(401).json({ message: 'MISSING_INTERNAL_TOKEN' });
  }
  if (!constantTimeEqual(token, expectedToken)) {
    return res.status(403).json({ message: 'INVALID_INTERNAL_TOKEN' });
  }
  return next();
}

internalRouter.use(requireInternalToken);

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

/** 格式化公告為 BFF 友好的扁平結構 */
function formatAnnouncement(row: typeof publishedAnnouncements.$inferSelect, facilityName?: string) {
  const isMustRead =
    row.priority === 'critical' || row.priority === 'high' || row.homeVisibility === 'pinned';

  let effectiveRange: string | null = null;
  if (row.effectiveStartAt || row.effectiveEndAt) {
    const start = row.effectiveStartAt ? new Date(row.effectiveStartAt).toISOString() : null;
    const end   = row.effectiveEndAt   ? new Date(row.effectiveEndAt).toISOString()   : null;
    effectiveRange = [start, end].filter(Boolean).join(' - ');
  }

  return {
    id:                 row.id,
    title:              row.title,
    summary:            row.summary,
    body:               row.body ?? null,
    priority:           row.priority,
    candidateType:      row.candidateType,
    scopeType:          row.scopeType,
    homeVisibility:     row.homeVisibility,
    needsAck:           row.needsAck,
    isMustRead,
    recommendedAction:  row.recommendedAction  ?? null,
    recommendedReply:   row.recommendedReply   ?? null,
    badExample:         row.badExample         ?? null,
    appliesToRoles:     (row.appliesToRolesJson as string[]) ?? [],
    effectiveRange,
    effectiveStartAt:   row.effectiveStartAt ? new Date(row.effectiveStartAt).toISOString() : null,
    effectiveEndAt:     row.effectiveEndAt   ? new Date(row.effectiveEndAt).toISOString()   : null,
    detectedAt:         new Date(row.publishedAt).toISOString(),
    publishedAt:        new Date(row.publishedAt).toISOString(),
    groupId:            row.facilityLineGroupId ?? null,
    facilityName:       facilityName ?? null,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// GET /api/internal/facility-home/:groupId/home
// ═══════════════════════════════════════════════════════════════════════════

internalRouter.get('/facility-home/:groupId/home', async (req, res) => {
  const { groupId } = req.params;

  let facility;
  try {
    facility = await resolveFacility(groupId);
  } catch (err: any) {
    console.error('❌ [internal/home] DB error:', err?.message);
    return res.status(500).json({ message: 'SERVER_ERROR' });
  }
  if (!facility) {
    return res.status(404).json({ message: 'FACILITY_GROUP_NOT_FOUND' });
  }

  const facilityKey = GROUP_FACILITY_KEYS[groupId] ?? groupId.substring(0, 12).toLowerCase();

  let rows: typeof publishedAnnouncements.$inferSelect[] = [];
  try {
    rows = await db
      .select()
      .from(publishedAnnouncements)
      .where(buildActiveFilter(facility))
      .orderBy(
        desc(sql`CASE home_visibility WHEN 'pinned' THEN 0 ELSE 1 END`),
        desc(sql`CASE priority WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END`),
        desc(publishedAnnouncements.publishedAt),
      );
  } catch (err: any) {
    console.error('❌ [internal/home] query error:', err?.message);
    return res.status(500).json({ message: 'SERVER_ERROR' });
  }

  const formatted   = rows.map(r => formatAnnouncement(r, facility!.name));
  const mustRead    = formatted.filter(a => a.isMustRead);
  const announcements = formatted.filter(a => !a.isMustRead && a.candidateType !== 'campaign');
  const campaigns   = formatted.filter(a => a.candidateType === 'campaign');

  return res.json({
    facilityKey,
    facilityName:      facility.name,
    facilityShortName: facility.shortName,
    groupId:           facility.lineGroupId,
    generatedAt:       new Date().toISOString(),
    mustRead,
    announcements,
    campaigns,
    handover:   [],
    todayShift: [],
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// GET /api/internal/facility-home/:groupId/announcements
// Query: ?page=1&pageSize=20&q=&type=
// ═══════════════════════════════════════════════════════════════════════════

internalRouter.get('/facility-home/:groupId/announcements', async (req, res) => {
  const { groupId } = req.params;
  const q        = (req.query.q as string | undefined)?.trim() || '';
  const type     = req.query.type as string | undefined;
  const page     = Math.max(1, parseInt(req.query.page as string) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt((req.query.pageSize ?? req.query.limit) as string) || 20));
  const offset   = (page - 1) * pageSize;

  let facility;
  try {
    facility = await resolveFacility(groupId);
  } catch {
    return res.status(500).json({ message: 'SERVER_ERROR' });
  }
  if (!facility) {
    return res.status(404).json({ message: 'FACILITY_GROUP_NOT_FOUND' });
  }

  try {
    const conditions: any[] = [buildActiveFilter(facility)];

    if (q) {
      conditions.push(
        or(
          ilike(publishedAnnouncements.title,   `%${q}%`),
          ilike(publishedAnnouncements.summary, `%${q}%`),
        ),
      );
    }
    if (type && ['rule', 'notice', 'campaign', 'discount', 'script'].includes(type)) {
      conditions.push(eq(publishedAnnouncements.candidateType, type));
    }

    const where = and(...conditions);

    const [rows, countRows] = await Promise.all([
      db.select().from(publishedAnnouncements)
        .where(where)
        .orderBy(desc(publishedAnnouncements.publishedAt))
        .limit(pageSize)
        .offset(offset),
      db.select({ count: sql<number>`COUNT(*)` })
        .from(publishedAnnouncements)
        .where(where),
    ]);

    const total = Number(countRows[0]?.count ?? 0);

    return res.json({
      items:    rows.map(r => formatAnnouncement(r, facility!.name)),
      page,
      pageSize,
      total,
    });
  } catch (err: any) {
    console.error('❌ [internal/announcements] query error:', err?.message);
    return res.status(500).json({ message: 'SERVER_ERROR' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// GET /api/internal/facility-home/:groupId/announcements/:id
// ═══════════════════════════════════════════════════════════════════════════

internalRouter.get('/facility-home/:groupId/announcements/:id', async (req, res) => {
  const { groupId, id } = req.params;
  const annId = parseInt(id);
  if (isNaN(annId)) {
    return res.status(400).json({ message: 'INVALID_ANNOUNCEMENT_ID' });
  }

  let facility;
  try {
    facility = await resolveFacility(groupId);
  } catch {
    return res.status(500).json({ message: 'SERVER_ERROR' });
  }
  if (!facility) {
    return res.status(404).json({ message: 'FACILITY_GROUP_NOT_FOUND' });
  }

  try {
    const rows = await db
      .select()
      .from(publishedAnnouncements)
      .where(and(eq(publishedAnnouncements.id, annId), buildActiveFilter(facility)))
      .limit(1);

    if (!rows[0]) {
      return res.status(404).json({ message: 'ANNOUNCEMENT_NOT_FOUND' });
    }

    return res.json({ data: formatAnnouncement(rows[0], facility.name) });
  } catch (err: any) {
    console.error('❌ [internal/announcements/:id] query error:', err?.message);
    return res.status(500).json({ message: 'SERVER_ERROR' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// GET /api/internal/facility-home/:groupId/today-shift
// 班表尚未建置，回 { "items": [] }
// ═══════════════════════════════════════════════════════════════════════════

internalRouter.get('/facility-home/:groupId/today-shift', async (req, res) => {
  const { groupId } = req.params;

  let facility;
  try {
    facility = await resolveFacility(groupId);
  } catch {
    return res.status(500).json({ message: 'SERVER_ERROR' });
  }
  if (!facility) {
    return res.status(404).json({ message: 'FACILITY_GROUP_NOT_FOUND' });
  }

  return res.json({ items: [] });
});

// ═══════════════════════════════════════════════════════════════════════════
// GET /api/internal/facility-home/:groupId/handover
// 交接尚未建置，回 { "items": [] }
// ═══════════════════════════════════════════════════════════════════════════

internalRouter.get('/facility-home/:groupId/handover', async (req, res) => {
  const { groupId } = req.params;

  let facility;
  try {
    facility = await resolveFacility(groupId);
  } catch {
    return res.status(500).json({ message: 'SERVER_ERROR' });
  }
  if (!facility) {
    return res.status(404).json({ message: 'FACILITY_GROUP_NOT_FOUND' });
  }

  return res.json({ items: [] });
});
