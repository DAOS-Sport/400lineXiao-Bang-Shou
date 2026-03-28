import { Router } from 'express';
import { db } from '../db';
import { announcementCandidates, announcementReviews } from '@shared/schema';
import { eq, gte, desc } from 'drizzle-orm';

export const announcementRouter = Router();

function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(0, 0, 0, 0);
  return d;
}

// ── GET /api/announcement-dashboard/summary ──────────────
announcementRouter.get('/announcement-dashboard/summary', async (_req, res) => {
  try {
    const todayStart = daysAgo(0);
    todayStart.setHours(0, 0, 0, 0);

    const [allRows, todayRows] = await Promise.all([
      db.select().from(announcementCandidates).orderBy(desc(announcementCandidates.detectedAt)),
      db.select().from(announcementCandidates).where(gte(announcementCandidates.detectedAt, todayStart)),
    ]);

    const pendingCount  = allRows.filter(r => r.status === 'pending_review').length;
    const approvedCount = allRows.filter(r => r.status === 'approved').length;
    const rejectedCount = allRows.filter(r => r.status === 'rejected').length;

    const byType: Record<string, number> = {};
    const byFacility: Record<string, number> = {};
    const byGroup: Record<string, number> = {};

    for (const r of allRows) {
      if (r.candidateType !== 'ignore') {
        byType[r.candidateType] = (byType[r.candidateType] ?? 0) + 1;
      }
      if (r.facilityName) byFacility[r.facilityName] = (byFacility[r.facilityName] ?? 0) + 1;
      byGroup[r.groupId] = (byGroup[r.groupId] ?? 0) + 1;
    }

    res.json({
      success: true,
      totalMessagesToday: todayRows.length,
      analyzedMessagesToday: todayRows.length,
      pendingReviewCount: pendingCount,
      approvedCount,
      rejectedCount,
      totalCandidates: allRows.length,
      byType,
      byFacility,
      byGroup,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── GET /api/announcement-candidates ────────────────────
announcementRouter.get('/announcement-candidates', async (req, res) => {
  try {
    const {
      status,
      candidateType,
      facilityName: facilityQ,
      groupId,
      dateFrom,
      dateTo,
      keyword,
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

    const total = rows.length;
    const pg  = Math.max(1, parseInt(page));
    const ps  = Math.min(100, Math.max(1, parseInt(pageSize)));
    const items = rows.slice((pg - 1) * ps, pg * ps);

    res.json({ success: true, total, page: pg, pageSize: ps, items });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── GET /api/announcement-candidates/:id ────────────────
announcementRouter.get('/announcement-candidates/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ success: false, error: 'invalid id' });

    const rows = await db.select().from(announcementCandidates).where(eq(announcementCandidates.id, id));
    if (rows.length === 0) return res.status(404).json({ success: false, error: 'not found' });

    const reviews = await db.select().from(announcementReviews).where(eq(announcementReviews.candidateId, id));
    res.json({ success: true, candidate: rows[0], reviews });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── POST /api/announcement-candidates/:id/approve ───────
announcementRouter.post('/announcement-candidates/:id/approve', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ success: false, error: 'invalid id' });
    const { reviewerUserId, comment } = req.body ?? {};
    await db.update(announcementCandidates).set({ status: 'approved' }).where(eq(announcementCandidates.id, id));
    await db.insert(announcementReviews).values({ candidateId: id, reviewerUserId: reviewerUserId ?? null, action: 'approve', comment: comment ?? null });
    res.json({ success: true, message: '已核准' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── POST /api/announcement-candidates/:id/reject ────────
announcementRouter.post('/announcement-candidates/:id/reject', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ success: false, error: 'invalid id' });
    const { reviewerUserId, comment } = req.body ?? {};
    await db.update(announcementCandidates).set({ status: 'rejected' }).where(eq(announcementCandidates.id, id));
    await db.insert(announcementReviews).values({ candidateId: id, reviewerUserId: reviewerUserId ?? null, action: 'reject', comment: comment ?? null });
    res.json({ success: true, message: '已退回' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── GET /api/announcement-reports/weekly ────────────────
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
