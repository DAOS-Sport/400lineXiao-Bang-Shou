import { Router } from 'express';
import { db } from '../db';
import { announcementCandidates, announcementReviews } from '@shared/schema';
import { eq, gte, desc } from 'drizzle-orm';
import { getPipelineStats, incApproval } from '../services/announcement/pipelineStats';
import { FOCUS_GROUP_IDS, GROUP_FACILITY_MAP } from '../services/announcement/announcementConfig';

export const announcementRouter = Router();

function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(0, 0, 0, 0);
  return d;
}

// 從 extractedJson 讀取 meta 欄位
function getMeta(row: any) {
  const ej = (row.extractedJson ?? {}) as any;
  return {
    decisionSource: ej.decisionSource ?? 'ai',
    preFilterScore: ej.preFilterScore ?? 0,
    matchedRules: ej.matchedRules ?? [],
    groupTier: ej.groupTier ?? 'A',
    speakerType: ej.speakerType ?? 'member',
    needsAck: ej.needsAck ?? false,
    isTimeSensitive: ej.isTimeSensitive ?? false,
    isCustomerFacing: ej.isCustomerFacing ?? false,
    isOperationallyRelevant: ej.isOperationallyRelevant ?? false,
  };
}

// ── GET /api/announcement-dashboard/summary ──────────────────────────────────
announcementRouter.get('/announcement-dashboard/summary', async (_req, res) => {
  try {
    const todayStart = daysAgo(0);
    todayStart.setHours(0, 0, 0, 0);

    const [allRows, todayRows] = await Promise.all([
      db.select().from(announcementCandidates).orderBy(desc(announcementCandidates.detectedAt)),
      db.select().from(announcementCandidates).where(gte(announcementCandidates.detectedAt, todayStart)),
    ]);

    const PENDING_STATUSES = ['pending_review', 'rule_matched_pending_review', 'ai_pending_review'];
    const pendingCount  = allRows.filter(r => PENDING_STATUSES.includes(r.status)).length;
    const approvedCount = allRows.filter(r => r.status === 'approved').length;
    const rejectedCount = allRows.filter(r => r.status === 'rejected').length;

    const byType: Record<string, number> = {};
    const byFacility: Record<string, number> = {};
    const byGroup: Record<string, number> = {};
    const byDecisionSource: Record<string, number> = {};

    for (const r of allRows) {
      if (r.candidateType !== 'ignore') {
        byType[r.candidateType] = (byType[r.candidateType] ?? 0) + 1;
      }
      if (r.facilityName) byFacility[r.facilityName] = (byFacility[r.facilityName] ?? 0) + 1;
      byGroup[r.groupId] = (byGroup[r.groupId] ?? 0) + 1;
      const ds = getMeta(r).decisionSource;
      byDecisionSource[ds] = (byDecisionSource[ds] ?? 0) + 1;
    }

    const supervisorCount    = allRows.filter(r => r.isFromSupervisor === 'true').length;
    const nonSupervisorCount = allRows.filter(r => r.isFromSupervisor !== 'true').length;
    const todaySupervisor    = todayRows.filter(r => r.isFromSupervisor === 'true').length;

    const highConf = allRows.filter(r => parseFloat(r.confidence) >= 0.7).length;
    const midConf  = allRows.filter(r => parseFloat(r.confidence) >= 0.4 && parseFloat(r.confidence) < 0.7).length;
    const lowConf  = allRows.filter(r => parseFloat(r.confidence) < 0.4).length;

    const focusGroups = [...FOCUS_GROUP_IDS];

    res.json({
      success: true,
      totalMessagesToday: todayRows.length,
      analyzedMessagesToday: todayRows.length,
      todaySupervisorCount: todaySupervisor,
      pendingReviewCount: pendingCount,
      approvedCount,
      rejectedCount,
      totalCandidates: allRows.length,
      supervisorCount,
      nonSupervisorCount,
      confidenceDist: { high: highConf, mid: midConf, low: lowConf },
      byType,
      byFacility,
      byGroup,
      byDecisionSource,
      focusGroups,
      pipeline: getPipelineStats(),
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── GET /api/announcement-dashboard/pipeline-stats ────────────────────────────
announcementRouter.get('/announcement-dashboard/pipeline-stats', (_req, res) => {
  res.json({ success: true, stats: getPipelineStats() });
});

// ── GET /api/announcement-candidates ─────────────────────────────────────────
announcementRouter.get('/announcement-candidates', async (req, res) => {
  try {
    const {
      status,
      candidateType,
      facilityName: facilityQ,
      groupId,
      decisionSource,
      speakerType,
      needsAck,
      minScore,
      dateFrom,
      dateTo,
      keyword,
      vipOnly,
      page = '1',
      pageSize = '20',
    } = req.query as Record<string, string>;

    let rows = await db.select().from(announcementCandidates).orderBy(desc(announcementCandidates.detectedAt));

    if (status)        rows = rows.filter(r => r.status === status);
    if (candidateType) rows = rows.filter(r => r.candidateType === candidateType);
    if (facilityQ)     rows = rows.filter(r => r.facilityName?.includes(facilityQ));
    if (groupId)       rows = rows.filter(r => r.groupId === groupId);
    if (dateFrom)      rows = rows.filter(r => r.detectedAt >= new Date(dateFrom));
    if (dateTo)        rows = rows.filter(r => r.detectedAt <= new Date(dateTo));
    if (keyword)       rows = rows.filter(r =>
      r.originalText?.includes(keyword) || r.title?.includes(keyword) || r.summary?.includes(keyword)
    );
    if (decisionSource) rows = rows.filter(r => getMeta(r).decisionSource === decisionSource);
    if (speakerType)    rows = rows.filter(r => getMeta(r).speakerType === speakerType);
    if (needsAck === 'true') rows = rows.filter(r => getMeta(r).needsAck === true);
    if (minScore) {
      const min = parseInt(minScore);
      rows = rows.filter(r => getMeta(r).preFilterScore >= min);
    }
    if (vipOnly === 'true') rows = rows.filter(r =>
      r.status === 'vip_chat' || r.status === 'vip_raw' ||
      (Array.isArray(r.reasoningTags) && (r.reasoningTags as string[]).some(t =>
        t.startsWith('⭐VIP:') || t.startsWith('⭐特別關注:')
      ))
    );

    const total = rows.length;
    const pg  = Math.max(1, parseInt(page));
    const ps  = Math.min(100, Math.max(1, parseInt(pageSize)));
    const items = rows.slice((pg - 1) * ps, pg * ps).map(r => ({ ...r, _meta: getMeta(r) }));

    res.json({ success: true, total, page: pg, pageSize: ps, items });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── GET /api/announcement-candidates/:id ─────────────────────────────────────
announcementRouter.get('/announcement-candidates/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ success: false, error: 'invalid id' });

    const rows = await db.select().from(announcementCandidates).where(eq(announcementCandidates.id, id));
    if (rows.length === 0) return res.status(404).json({ success: false, error: 'not found' });

    const reviews = await db.select().from(announcementReviews).where(eq(announcementReviews.candidateId, id));
    res.json({ success: true, candidate: { ...rows[0], _meta: getMeta(rows[0]) }, reviews });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── POST /api/announcement-candidates/:id/approve ────────────────────────────
announcementRouter.post('/announcement-candidates/:id/approve', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ success: false, error: 'invalid id' });

    const rows = await db.select().from(announcementCandidates).where(eq(announcementCandidates.id, id));
    const src = rows[0] ? (getMeta(rows[0]).decisionSource as 'rule_engine' | 'ai') : 'ai';

    const { reviewerUserId, comment } = req.body ?? {};
    await db.update(announcementCandidates).set({ status: 'approved' }).where(eq(announcementCandidates.id, id));
    await db.insert(announcementReviews).values({ candidateId: id, reviewerUserId: reviewerUserId ?? null, action: 'approve', comment: comment ?? null });

    incApproval(src, 'approved');
    res.json({ success: true, message: '已核准' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── POST /api/announcement-candidates/:id/reject ─────────────────────────────
announcementRouter.post('/announcement-candidates/:id/reject', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ success: false, error: 'invalid id' });

    const rows = await db.select().from(announcementCandidates).where(eq(announcementCandidates.id, id));
    const src = rows[0] ? (getMeta(rows[0]).decisionSource as 'rule_engine' | 'ai') : 'ai';

    const { reviewerUserId, comment } = req.body ?? {};
    await db.update(announcementCandidates).set({ status: 'rejected' }).where(eq(announcementCandidates.id, id));
    await db.insert(announcementReviews).values({ candidateId: id, reviewerUserId: reviewerUserId ?? null, action: 'reject', comment: comment ?? null });

    incApproval(src, 'rejected');
    res.json({ success: true, message: '已退回' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── GET /api/facility-home/:facilityId/announcements ──────────────────────────
// 值班首頁可用 API：回傳已核准且適用於該館的公告
announcementRouter.get('/facility-home/:facilityId/announcements', async (req, res) => {
  try {
    const { facilityId } = req.params;
    const facilityName = GROUP_FACILITY_MAP[facilityId] ?? facilityId;

    const rows = await db.select().from(announcementCandidates)
      .where(eq(announcementCandidates.status, 'approved'))
      .orderBy(desc(announcementCandidates.detectedAt));

    const relevant = rows.filter(r => {
      const meta = getMeta(r);
      // 全館/多館公告所有人都看
      if (r.scopeType === 'multi_facility' || r.scopeType === 'global') return true;
      // 本館公告
      if (r.facilityName === facilityName) return true;
      if (r.groupId === facilityId) return true;
      return false;
    });

    // 排序：needsAck > isTimeSensitive > 信心分
    const sorted = relevant.sort((a, b) => {
      const ma = getMeta(a); const mb = getMeta(b);
      if (ma.needsAck !== mb.needsAck) return ma.needsAck ? -1 : 1;
      if (ma.isTimeSensitive !== mb.isTimeSensitive) return ma.isTimeSensitive ? -1 : 1;
      return parseFloat(b.confidence) - parseFloat(a.confidence);
    });

    res.json({
      success: true,
      facilityId,
      facilityName,
      total: sorted.length,
      items: sorted.map(r => ({
        id: r.id,
        candidateType: r.candidateType,
        scopeType: r.scopeType,
        title: r.title,
        summary: r.summary,
        originalText: r.originalText,
        detectedAt: r.detectedAt,
        ...getMeta(r),
      })),
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── GET /api/announcement-reports/weekly ─────────────────────────────────────
announcementRouter.get('/announcement-reports/weekly', async (_req, res) => {
  try {
    const sevenDaysAgo = daysAgo(7);
    const rows = await db.select().from(announcementCandidates)
      .where(gte(announcementCandidates.detectedAt, sevenDaysAgo));

    const daily: Record<string, { detected: number; classified: number }> = {};
    for (let i = 6; i >= 0; i--) {
      const d = daysAgo(i);
      const key = d.toISOString().slice(0, 10);
      daily[key] = { detected: 0, classified: 0 };
    }
    for (const r of rows) {
      const key = r.detectedAt.toISOString().slice(0, 10);
      if (daily[key]) {
        daily[key].detected++;
        if (r.candidateType !== 'ignore') daily[key].classified++;
      }
    }

    const byType: Record<string, number> = {};
    const byFacility: Record<string, number> = {};
    for (const r of rows) {
      if (r.candidateType !== 'ignore') {
        byType[r.candidateType] = (byType[r.candidateType] ?? 0) + 1;
      }
      if (r.facilityName) byFacility[r.facilityName] = (byFacility[r.facilityName] ?? 0) + 1;
    }

    const highConfidence = rows.filter(r => parseFloat(r.confidence) >= 0.7).length;
    const reviewed = rows.filter(r => r.status === 'approved' || r.status === 'rejected');
    const rejected = reviewed.filter(r => r.status === 'rejected').length;
    const errorRate = reviewed.length > 0 ? `${((rejected / reviewed.length) * 100).toFixed(1)}%` : 'N/A';

    res.json({
      success: true,
      period: { from: sevenDaysAgo.toISOString().slice(0, 10), to: new Date().toISOString().slice(0, 10) },
      daily,
      byType,
      byFacility,
      highConfidenceCount: highConfidence,
      errorRate,
      totalInPeriod: rows.length,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});
