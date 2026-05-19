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
 *   GET  /api/internal/facility-home/:groupId/home
 *   GET  /api/internal/facility-home/:groupId/announcements
 *   GET  /api/internal/facility-home/:groupId/announcements/:id
 *   GET  /api/internal/facility-home/:groupId/today-shift
 *   GET  /api/internal/facility-home/:groupId/handover
 *
 *   GET    /api/internal/announcement-whitelist
 *   POST   /api/internal/announcement-whitelist
 *   PATCH  /api/internal/announcement-whitelist/:userId
 *   DELETE /api/internal/announcement-whitelist/:userId  (相容路徑：停用，不實刪)
 *
 *   GET   /api/internal/feature-whitelist
 *   POST  /api/internal/feature-whitelist
 *   PATCH /api/internal/feature-whitelist/:lineUserId
 *   GET   /api/internal/ragic/authorization-candidates?q=
 *
 *   GET  /api/internal/service-health
 *   GET  /api/internal/service-health/snapshots
 *
 *   GET  /api/internal/monitoring/*
 */

import { Router, Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { db } from '../db';
import { publishedAnnouncements, facilities } from '@shared/schema';
import { eq, and, or, gte, ilike, isNull, desc, sql } from 'drizzle-orm';
import {
  listWhitelistUsers,
  addWhitelistUser,
  updateWhitelistUser,
} from '../services/admin/whitelistRepo';
import { aggregateHealth, getRecentSnapshots } from '../services/monitoring/healthAggregator';
import { monitoringRouter } from './monitoringRoutes';
import { interviewAuthorizedUsers } from '@shared/schema';
import { RagicService } from '../services/ragicService';

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
internalRouter.use('/monitoring', monitoringRouter);

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

function featureWhitelistRow(row: typeof interviewAuthorizedUsers.$inferSelect) {
  const isActive = row.isActive === 'true';
  return {
    lineUserId: row.userId,
    userId: row.userId,
    displayName: row.userName,
    userName: row.userName,
    phone: null,
    department: null,
    employeeNumber: null,
    isActive,
    status: isActive ? 'active' : 'disabled',
    features: {
      interview: row.canInterviewCheck === 'true',
      cautionQuery: row.canInternalQuery === 'true',
      employeeLookup: row.canInternalQuery === 'true',
      miniAssistant: true,
      aiAgent: row.canUseAiAgent === 'true',
      vipAnnouncement: false,
    },
    startsAt: null,
    endsAt: null,
    unlimited: true,
    source: 'interview_authorized_users',
    createdAt: row.createdAt?.toISOString?.() ?? row.createdAt,
    updatedAt: row.updatedAt?.toISOString?.() ?? row.updatedAt,
  };
}

function featurePatchFromBody(body: any) {
  const features = body?.features && typeof body.features === 'object' ? body.features : {};
  const patch: Record<string, any> = {};
  if (body?.displayName !== undefined || body?.userName !== undefined) {
    patch.userName = String(body.displayName ?? body.userName);
  }
  if (body?.isActive !== undefined || body?.status !== undefined) {
    patch.isActive = body.isActive === false || body.status === 'disabled' ? 'false' : 'true';
  }
  if (features.interview !== undefined) patch.canInterviewCheck = features.interview ? 'true' : 'false';
  if (features.cautionQuery !== undefined) patch.canInternalQuery = features.cautionQuery ? 'true' : 'false';
  if (features.employeeLookup !== undefined) patch.canInternalQuery = features.employeeLookup ? 'true' : 'false';
  if (features.aiAgent !== undefined) patch.canUseAiAgent = features.aiAgent ? 'true' : 'false';
  patch.updatedAt = new Date();
  return patch;
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

// ═══════════════════════════════════════════════════════════════════════════
// 公告 VIP 白名單管理
// GET    /api/internal/announcement-whitelist         — 列表
// POST   /api/internal/announcement-whitelist         — 新增
// PATCH  /api/internal/announcement-whitelist/:userId — 更新
// DELETE /api/internal/announcement-whitelist/:userId — 刪除
// ═══════════════════════════════════════════════════════════════════════════

internalRouter.get('/announcement-whitelist', async (_req, res) => {
  try {
    const rows = await listWhitelistUsers();
    return res.json({ items: rows });
  } catch (err: any) {
    console.error('❌ [internal/whitelist] list error:', err?.message);
    return res.status(500).json({ message: 'SERVER_ERROR' });
  }
});

internalRouter.post('/announcement-whitelist', async (req, res) => {
  const { userId, userName, role, note, addedBy } = req.body ?? {};
  if (!userId || typeof userId !== 'string') {
    return res.status(400).json({ message: 'MISSING_USER_ID' });
  }
  if (!userName || typeof userName !== 'string') {
    return res.status(400).json({ message: 'MISSING_USER_NAME' });
  }
  try {
    const created = await addWhitelistUser({ userId, userName, role, note, addedBy });
    return res.status(201).json({ data: created });
  } catch (err: any) {
    const isDuplicate = err?.message?.includes('unique') || err?.code === '23505';
    if (isDuplicate) {
      return res.status(409).json({ message: 'USER_ALREADY_EXISTS' });
    }
    console.error('❌ [internal/whitelist] add error:', err?.message);
    return res.status(500).json({ message: 'SERVER_ERROR' });
  }
});

internalRouter.patch('/announcement-whitelist/:userId', async (req, res) => {
  const { userId } = req.params;
  const { userName, role, note, isActive } = req.body ?? {};
  const patch: Record<string, any> = {};
  if (userName !== undefined) patch.userName = userName;
  if (role    !== undefined) patch.role    = role;
  if (note    !== undefined) patch.note    = note;
  if (isActive !== undefined) patch.isActive = Boolean(isActive);

  if (Object.keys(patch).length === 0) {
    return res.status(400).json({ message: 'NO_FIELDS_TO_UPDATE' });
  }

  try {
    const updated = await updateWhitelistUser(userId, patch);
    if (!updated) return res.status(404).json({ message: 'USER_NOT_FOUND' });
    return res.json({ data: updated });
  } catch (err: any) {
    console.error('❌ [internal/whitelist] update error:', err?.message);
    return res.status(500).json({ message: 'SERVER_ERROR' });
  }
});

internalRouter.delete('/announcement-whitelist/:userId', async (req, res) => {
  const { userId } = req.params;
  try {
    const updated = await updateWhitelistUser(userId, { isActive: false });
    if (!updated) return res.status(404).json({ message: 'USER_NOT_FOUND' });
    return res.json({ message: 'DISABLED', data: updated });
  } catch (err: any) {
    console.error('❌ [internal/whitelist] disable error:', err?.message);
    return res.status(500).json({ message: 'SERVER_ERROR' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// 服務健康狀態
// GET /api/internal/service-health           — 即時健康（DB / LINE / Gemini / OpenAI / 公告管線）
// GET /api/internal/service-health/snapshots — 最近 N 小時快照（?hours=24）
// ═══════════════════════════════════════════════════════════════════════════

internalRouter.get('/service-health', async (_req, res) => {
  try {
    const payload = await aggregateHealth();
    return res.json(payload);
  } catch (err: any) {
    console.error('❌ [internal/service-health] error:', err?.message);
    return res.status(500).json({ message: 'SERVER_ERROR' });
  }
});

internalRouter.get('/service-health/snapshots', async (req, res) => {
  const hours = Math.min(168, Math.max(1, parseInt(req.query.hours as string) || 24));
  try {
    const rows = await getRecentSnapshots(hours);
    return res.json({ items: rows, hours });
  } catch (err: any) {
    console.error('❌ [internal/service-health/snapshots] error:', err?.message);
    return res.status(500).json({ message: 'SERVER_ERROR' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// 面試檢核授權用戶（可使用 LINE 官方功能的 8 位名單）
// GET /api/internal/interview-users — 唯讀，供外部儀表板顯示
// ═══════════════════════════════════════════════════════════════════════════

internalRouter.get('/interview-users', async (_req, res) => {
  try {
    const rows = await db.select().from(interviewAuthorizedUsers);
    return res.json({
      items: rows.map(r => ({
        userId:           r.userId,
        userName:         r.userName,
        isActive:         r.isActive === 'true',
        canInterviewCheck: r.canInterviewCheck === 'true',
        canInternalQuery:  r.canInternalQuery  === 'true',
        canUseAiAgent:     r.canUseAiAgent     === 'true',
      })),
      total: rows.length,
    });
  } catch (err: any) {
    console.error('❌ [internal/interview-users] error:', err?.message);
    return res.status(500).json({ message: 'SERVER_ERROR' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// 功能白名單主控 API（400QIAN 讀取 / 比對 / 後續寫入用）
// GET   /api/internal/feature-whitelist
// POST  /api/internal/feature-whitelist
// PATCH /api/internal/feature-whitelist/:lineUserId
// DELETE 不提供；撤權請 PATCH isActive=false 或 endsAt 到期
// ═══════════════════════════════════════════════════════════════════════════

internalRouter.get('/feature-whitelist', async (_req, res) => {
  try {
    const rows = await db.select().from(interviewAuthorizedUsers);
    const items = rows.map(featureWhitelistRow);
    return res.json({
      authority: '400LINE',
      generatedAt: new Date().toISOString(),
      total: items.length,
      items,
      sourceStatus: {
        source: 'interview_authorized_users',
        status: 'ready',
      },
    });
  } catch (err: any) {
    console.error('❌ [internal/feature-whitelist] list error:', err?.message);
    return res.status(500).json({ message: 'SERVER_ERROR' });
  }
});

internalRouter.post('/feature-whitelist', async (req, res) => {
  const body = req.body ?? {};
  const lineUserId = String(body.lineUserId ?? body.userId ?? '').trim();
  const displayName = String(body.displayName ?? body.userName ?? '').trim();
  if (!lineUserId) return res.status(400).json({ message: 'MISSING_LINE_USER_ID' });
  if (!displayName) return res.status(400).json({ message: 'MISSING_DISPLAY_NAME' });

  try {
    const existing = await db.select().from(interviewAuthorizedUsers).where(eq(interviewAuthorizedUsers.userId, lineUserId)).limit(1);
    const patch = featurePatchFromBody(body);
    if (existing[0]) {
      const [updated] = await db.update(interviewAuthorizedUsers)
        .set({ ...patch, userName: displayName })
        .where(eq(interviewAuthorizedUsers.userId, lineUserId))
        .returning();
      return res.json({ data: featureWhitelistRow(updated), action: 'updated' });
    }

    const [created] = await db.insert(interviewAuthorizedUsers).values({
      userId: lineUserId,
      userName: displayName,
      isActive: patch.isActive ?? 'true',
      canInterviewCheck: patch.canInterviewCheck ?? 'true',
      canInternalQuery: patch.canInternalQuery ?? 'false',
      canUseAiAgent: patch.canUseAiAgent ?? 'false',
    }).returning();
    return res.status(201).json({ data: featureWhitelistRow(created), action: 'created' });
  } catch (err: any) {
    console.error('❌ [internal/feature-whitelist] upsert error:', err?.message);
    return res.status(500).json({ message: 'SERVER_ERROR' });
  }
});

internalRouter.patch('/feature-whitelist/:lineUserId', async (req, res) => {
  const { lineUserId } = req.params;
  const patch = featurePatchFromBody(req.body ?? {});
  if (Object.keys(patch).length <= 1) return res.status(400).json({ message: 'NO_FIELDS_TO_UPDATE' });

  try {
    const [updated] = await db.update(interviewAuthorizedUsers)
      .set(patch)
      .where(eq(interviewAuthorizedUsers.userId, lineUserId))
      .returning();
    if (!updated) return res.status(404).json({ message: 'USER_NOT_FOUND' });
    return res.json({ data: featureWhitelistRow(updated) });
  } catch (err: any) {
    console.error('❌ [internal/feature-whitelist] patch error:', err?.message);
    return res.status(500).json({ message: 'SERVER_ERROR' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// Ragic 授權候選搜尋
// GET /api/internal/ragic/authorization-candidates?q=姓名或LINEID
// ═══════════════════════════════════════════════════════════════════════════

internalRouter.get('/ragic/authorization-candidates', async (req, res) => {
  const q = String(req.query.q ?? '').trim();
  const limit = Math.min(50, Math.max(1, parseInt(String(req.query.limit ?? '20'), 10) || 20));
  if (!q) return res.json({ items: [], sourceStatus: { primary: 'H01', fallback: 'H02', status: 'empty_query' } });

  try {
    const service = new RagicService();
    const items = await service.searchAuthorizationCandidates(q, limit);
    return res.json({
      items,
      sourceStatus: {
        primary: 'H01',
        fallback: 'H02',
        status: 'ready',
        fallbackStatus: 'not_configured',
      },
    });
  } catch (err: any) {
    console.error('❌ [internal/ragic/authorization-candidates] error:', err?.message);
    return res.status(502).json({
      items: [],
      sourceStatus: {
        primary: 'H01',
        fallback: 'H02',
        status: 'error',
        errorMessage: err?.message ?? 'RAGIC_QUERY_FAILED',
      },
    });
  }
});
