/**
 * 館別首頁 API
 *
 * GET /api/facility-home/:groupId/home         — 今日首頁（置頂 + 一般公告）
 * GET /api/facility-home/:groupId/announcements — 公告列表（搜尋 + 分頁）
 * GET /api/facility-home/:groupId/announcements/:id — 單筆詳情
 */

import { Router } from 'express';
import { db } from '../db';
import { publishedAnnouncements, facilities } from '@shared/schema';
import { eq, and, or, gte, ilike, isNull, desc, sql } from 'drizzle-orm';

export const facilityHomeRouter = Router();

// ═══════════════════════════════════════════════════════════════════════════
// GET /api/facility-home/list — 取得所有館別清單（供值班首頁選館）
// ═══════════════════════════════════════════════════════════════════════════
facilityHomeRouter.get('/list', async (_req, res) => {
  try {
    const rows = await db
      .select({
        id: facilities.id,
        lineGroupId: facilities.lineGroupId,
        name: facilities.name,
        shortName: facilities.shortName,
        tier: facilities.tier,
        isActive: facilities.isActive,
      })
      .from(facilities)
      .where(eq(facilities.isActive, true))
      .orderBy(facilities.tier, facilities.name);
    return res.json({ success: true, facilities: rows });
  } catch (err: any) {
    console.error('❌ [facility-home] list 查詢失敗:', err?.message);
    return res.status(500).json({ success: false, error: '伺服器錯誤' });
  }
});

// ── 輔助：取得 facility row（驗證 groupId 存在）─────────────────────────────

async function resolveFacility(groupId: string) {
  const rows = await db
    .select()
    .from(facilities)
    .where(eq(facilities.lineGroupId, groupId))
    .limit(1);
  return rows[0] ?? null;
}

// ── 輔助：基本可見過濾條件 ───────────────────────────────────────────────────
// 可見規則：
//   global          → 所有館別皆可見
//   single / multi_facility → 必須在 appliesToFacilityIdsJson 中包含本館 id，
//                             或來源館別的 facilityLineGroupId 相符（向後相容）

function buildActiveFilter(facility: { id: number; lineGroupId: string | null }) {
  const now = new Date();
  // JSONB containment: appliesToFacilityIdsJson @> '[id]'
  const inFacilityList = sql`${publishedAnnouncements.appliesToFacilityIdsJson} @> ${JSON.stringify([facility.id])}::jsonb`;

  return and(
    eq(publishedAnnouncements.status, 'published'),
    // 未過期（effectiveEndAt 為 null 或 >= now）
    or(
      isNull(publishedAnnouncements.effectiveEndAt),
      gte(publishedAnnouncements.effectiveEndAt, now),
    ),
    // 館別可見性判斷
    or(
      // global：全館可見
      eq(publishedAnnouncements.scopeType, 'global'),
      // single / multi_facility：facilityId 明確在適用清單中
      inFacilityList,
      // 向後相容：來源館別（facilityLineGroupId）永遠可見自己的公告
      ...(facility.lineGroupId
        ? [eq(publishedAnnouncements.facilityLineGroupId, facility.lineGroupId)]
        : []),
    ),
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// GET /api/facility-home/:groupId/home
// 館別今日首頁：分兩包回傳
//   mustRead   — priority=critical|high 或 homeVisibility=pinned
//   normal     — 其餘 published 公告
// ═══════════════════════════════════════════════════════════════════════════

facilityHomeRouter.get('/:groupId/home', async (req, res) => {
  const { groupId } = req.params;

  const facility = await resolveFacility(groupId);
  if (!facility) {
    return res.status(404).json({ success: false, error: '找不到對應館別，請確認 groupId 正確' });
  }

  try {
    const rows = await db
      .select()
      .from(publishedAnnouncements)
      .where(buildActiveFilter(facility))
      .orderBy(
        // pinned 優先，再依 priority 排序，再依發布時間
        desc(sql`CASE home_visibility WHEN 'pinned' THEN 0 ELSE 1 END`),
        desc(sql`CASE priority WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END`),
        desc(publishedAnnouncements.publishedAt),
      );

    const mustRead = rows.filter(
      r => r.priority === 'critical' || r.priority === 'high' || r.homeVisibility === 'pinned',
    );
    const normalList = rows.filter(
      r => r.priority !== 'critical' && r.priority !== 'high' && r.homeVisibility !== 'pinned',
    );

    return res.json({
      success: true,
      facility: {
        id: facility.id,
        lineGroupId: facility.lineGroupId,
        name: facility.name,
        shortName: facility.shortName,
        tier: facility.tier,
      },
      mustRead,
      announcements: normalList,
      total: rows.length,
      generatedAt: new Date().toISOString(),
    });
  } catch (err: any) {
    console.error('❌ [facility-home] home 查詢失敗:', err?.message);
    return res.status(500).json({ success: false, error: '伺服器錯誤' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// GET /api/facility-home/:groupId/announcements
// 公告列表 + 關鍵字搜尋 + 類型過濾 + 分頁
// Query: ?q=&type=rule&page=1&limit=20
// ═══════════════════════════════════════════════════════════════════════════

facilityHomeRouter.get('/:groupId/announcements', async (req, res) => {
  const { groupId } = req.params;
  const q = (req.query.q as string | undefined)?.trim() || '';
  const type = req.query.type as string | undefined;
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(req.query.limit as string) || 20));
  const offset = (page - 1) * limit;

  const facility = await resolveFacility(groupId);
  if (!facility) {
    return res.status(404).json({ success: false, error: '找不到對應館別' });
  }

  try {
    const conditions = [buildActiveFilter(facility)];

    // 關鍵字模糊搜尋（title + summary）
    if (q) {
      conditions.push(
        or(
          ilike(publishedAnnouncements.title, `%${q}%`),
          ilike(publishedAnnouncements.summary, `%${q}%`),
        ) as any,
      );
    }

    // 類型過濾
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
        .limit(limit)
        .offset(offset),
      db
        .select({ count: sql<number>`COUNT(*)` })
        .from(publishedAnnouncements)
        .where(where),
    ]);

    const total = Number(countRows[0]?.count ?? 0);

    return res.json({
      success: true,
      data: rows,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasNext: page * limit < total,
      },
    });
  } catch (err: any) {
    console.error('❌ [facility-home] announcements 查詢失敗:', err?.message);
    return res.status(500).json({ success: false, error: '伺服器錯誤' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// GET /api/facility-home/:groupId/announcements/:id
// 單筆公告完整詳情（含話術建議、壞範例）
// ═══════════════════════════════════════════════════════════════════════════

facilityHomeRouter.get('/:groupId/announcements/:id', async (req, res) => {
  const { groupId, id } = req.params;
  const annId = parseInt(id);
  if (isNaN(annId)) {
    return res.status(400).json({ success: false, error: 'id 格式錯誤' });
  }

  const facility = await resolveFacility(groupId);
  if (!facility) {
    return res.status(404).json({ success: false, error: '找不到對應館別' });
  }

  try {
    const rows = await db
      .select()
      .from(publishedAnnouncements)
      .where(
        and(
          eq(publishedAnnouncements.id, annId),
          buildActiveFilter(facility),
        ),
      )
      .limit(1);

    if (!rows[0]) {
      return res.status(404).json({ success: false, error: '公告不存在或不屬於此館別' });
    }

    return res.json({ success: true, data: rows[0] });
  } catch (err: any) {
    console.error('❌ [facility-home] 單筆查詢失敗:', err?.message);
    return res.status(500).json({ success: false, error: '伺服器錯誤' });
  }
});
