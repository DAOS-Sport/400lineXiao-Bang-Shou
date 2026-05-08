/**
 * 公告管線健康監控 + 回補/Replay 工具
 *
 *   GET  /api/admin/announcements/health       — 24h webhook / candidate / 異常旗標
 *   POST /api/admin/announcements/replay       — 把現有 messages 重跑 5 層管線
 *   POST /api/admin/announcements/replay-mock  — 用 mock event 跑管線（不送 LINE）
 *
 * 全部 admin-only：authMiddleware（Bearer ADMIN_TOKEN / Basic Auth）
 * 不發送任何真實 LINE / Email；僅讀 messages 表 + 寫 announcement_candidates
 */

import { Router } from 'express';
import { db } from '../db';
import { messages, announcementCandidates } from '@shared/schema';
import { gte, desc, sql, inArray } from 'drizzle-orm';
import { authMiddleware } from '../middleware/auth';
import {
  ingestMessageForAnnouncement,
  FOCUS_GROUP_IDS,
} from '../services/announcement/announcementIngestService';
import {
  getIngestHealth,
  getPipelineStats,
} from '../services/announcement/pipelineStats';
import { announcementClassifierSystemPrompt } from '../prompts/announcementClassifier';

export const announcementHealthRouter = Router();

// 全部需 admin
announcementHealthRouter.use(authMiddleware);

// ── GET /health ─────────────────────────────────────────────────────────────
announcementHealthRouter.get('/health', async (_req, res) => {
  try {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const [msgRow, candRow, lastMsgRow, lastCandRow] = await Promise.all([
      db.select({ c: sql<number>`COUNT(*)::int` })
        .from(messages)
        .where(gte(messages.timestamp, since)),
      db.select({ c: sql<number>`COUNT(*)::int` })
        .from(announcementCandidates)
        .where(gte(announcementCandidates.detectedAt, since)),
      db.select({ ts: messages.timestamp, gid: messages.groupId })
        .from(messages)
        .orderBy(desc(messages.timestamp))
        .limit(1),
      db.select({ ts: announcementCandidates.detectedAt })
        .from(announcementCandidates)
        .orderBy(desc(announcementCandidates.detectedAt))
        .limit(1),
    ]);

    const messages24h   = Number(msgRow[0]?.c ?? 0);
    const candidates24h = Number(candRow[0]?.c ?? 0);
    const lastMessageAt = lastMsgRow[0]?.ts?.toISOString() ?? null;
    const lastCandidateAt = lastCandRow[0]?.ts?.toISOString() ?? null;

    const ingest = getIngestHealth();
    const pipeline = getPipelineStats();

    // 異常規則
    const issues: string[] = [];
    if (messages24h === 0) {
      issues.push('NO_WEBHOOK_24H: 24 小時內沒有任何 LINE webhook 訊息進來，請檢查 LINE Console webhook URL / Access Token / 部署是否在線。');
    }
    if (messages24h > 0 && candidates24h === 0) {
      issues.push('NO_CANDIDATE_24H: 有訊息進來但管線完全沒寫出候選，可能是規則太嚴或都被 hardExclude/importance 排除。');
    }
    if (ingest.lastError) {
      issues.push(`LAST_ERROR: ${ingest.lastError.message}（${ingest.lastError.at}）`);
    }
    if (lastMessageAt) {
      const ageMin = (Date.now() - new Date(lastMessageAt).getTime()) / 60000;
      if (ageMin > 60 * 24) {
        issues.push(`STALE_LAST_MESSAGE: 最後一筆 webhook 訊息已是 ${Math.round(ageMin / 60)} 小時前。`);
      }
    } else {
      issues.push('NO_MESSAGE_EVER: messages 表完全沒有資料。');
    }

    res.json({
      success: true,
      status: issues.length === 0 ? 'healthy' : 'degraded',
      checkedAt: new Date().toISOString(),
      window: '24h',
      counters: {
        messages24h,
        candidates24h,
        lastMessageAt,
        lastCandidateAt,
        lastIngestAt: ingest.lastIngestAt,
        lastIngestGroupId: ingest.lastIngestGroupId,
        ingestCallsAllTime: ingest.totalIngestCallsAllTime,
      },
      lastError: ingest.lastError,
      issues,
      pipelineToday: {
        date: pipeline.date,
        totalReceived: pipeline.totalReceived,
        hardExcluded: pipeline.hardExcluded,
        ruleMatched: pipeline.ruleMatched,
        aiCalls: pipeline.aiCalls,
        stored: pipeline.stored,
      },
      focusGroups: Array.from(FOCUS_GROUP_IDS),
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message ?? 'health check failed' });
  }
});

// ── POST /replay — 把現有 messages 重跑管線 ────────────────────────────────
// body: { messageIds?: string[], groupId?: string, limit?: number, dryRun?: boolean }
announcementHealthRouter.post('/replay', async (req, res) => {
  try {
    const {
      messageIds,
      groupId,
      limit = 10,
      dryRun = false,
    } = (req.body ?? {}) as {
      messageIds?: string[];
      groupId?: string;
      limit?: number;
      dryRun?: boolean;
    };

    const safeLimit = Math.min(Math.max(1, Number(limit) || 10), 100);

    // 撈訊息
    let rows;
    if (Array.isArray(messageIds) && messageIds.length > 0) {
      rows = await db.select().from(messages)
        .where(inArray(messages.messageId, messageIds.slice(0, safeLimit)));
    } else {
      const baseQuery = db.select().from(messages)
        .orderBy(desc(messages.timestamp))
        .limit(safeLimit);
      rows = groupId
        ? await db.select().from(messages)
            .where(sql`${messages.groupId} = ${groupId}`)
            .orderBy(desc(messages.timestamp))
            .limit(safeLimit)
        : await baseQuery;
    }

    if (rows.length === 0) {
      return res.json({
        success: true,
        message: '沒有符合條件的 messages 可重跑',
        attempted: 0, succeeded: 0, failed: 0, results: [],
      });
    }

    // 重跑前先記下候選數
    const beforeRow = await db.select({ c: sql<number>`COUNT(*)::int` })
      .from(announcementCandidates);
    const beforeCount = Number(beforeRow[0]?.c ?? 0);

    if (dryRun) {
      return res.json({
        success: true,
        dryRun: true,
        message: '僅列出將被重跑的訊息，未實際呼叫管線',
        attempted: rows.length,
        candidatesBefore: beforeCount,
        items: rows.map(r => ({
          messageId: r.messageId,
          groupId: r.groupId,
          textPreview: (r.text ?? '').substring(0, 80),
          timestamp: r.timestamp,
        })),
      });
    }

    const results: Array<{ messageId: string; groupId: string; status: 'ok' | 'error'; error?: string }> = [];
    let succeeded = 0;
    let failed = 0;

    for (const r of rows) {
      if (!r.text || !r.groupId) {
        results.push({ messageId: r.messageId, groupId: r.groupId ?? 'N/A', status: 'error', error: '缺 text 或 groupId' });
        failed++;
        continue;
      }
      try {
        await ingestMessageForAnnouncement({
          messageId: r.messageId,
          groupId: r.groupId,
          userId: r.userId,
          displayName: r.displayName ?? null,
          text: r.text,
        });
        results.push({ messageId: r.messageId, groupId: r.groupId, status: 'ok' });
        succeeded++;
      } catch (err: any) {
        results.push({ messageId: r.messageId, groupId: r.groupId, status: 'error', error: err?.message ?? 'unknown' });
        failed++;
      }
    }

    const afterRow = await db.select({ c: sql<number>`COUNT(*)::int` })
      .from(announcementCandidates);
    const afterCount = Number(afterRow[0]?.c ?? 0);

    res.json({
      success: true,
      attempted: rows.length,
      succeeded,
      failed,
      candidatesBefore: beforeCount,
      candidatesAfter: afterCount,
      candidatesAdded: afterCount - beforeCount,
      results,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message ?? 'replay failed' });
  }
});

// ── POST /test-gemini — 測試 Gemini 是否可作為 OpenAI 備援 ──────────────────
// body: { text, model?, isFromSupervisor? }
// 不寫入 DB，僅呼叫 Gemini 一次回傳結果 + 成本估算
//
// 預設模型 gemini-2.5-flash-lite：input $0.10 / output $0.40 per 1M tokens
// 比 OpenAI gpt-4o-mini（$0.15 / $0.60）便宜約 33%
announcementHealthRouter.post('/test-gemini', async (req, res) => {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ success: false, error: 'GEMINI_API_KEY 未設定' });
    }

    const {
      text,
      model = 'gemini-2.5-flash-lite',
      isFromSupervisor = false,
    } = (req.body ?? {}) as { text?: string; model?: string; isFromSupervisor?: boolean };

    if (!text || typeof text !== 'string') {
      return res.status(400).json({ success: false, error: 'text 為必填' });
    }
    if (text.length > 2000) {
      return res.status(400).json({ success: false, error: 'text 過長（>2000 字）' });
    }

    const safeModel = ['gemini-2.5-flash-lite', 'gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-2.0-flash-lite'].includes(model)
      ? model : 'gemini-2.5-flash-lite';

    const userContent = `訊息：${text}\n是否為主管：${isFromSupervisor ? '是' : '否'}\n\n請依系統提示回傳 JSON。`;

    const t0 = Date.now();
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${safeModel}:generateContent?key=${encodeURIComponent(apiKey)}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 18_000);

    let geminiResp: Response;
    try {
      geminiResp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: announcementClassifierSystemPrompt }] },
          contents: [{ role: 'user', parts: [{ text: userContent }] }],
          generationConfig: {
            temperature: 0.1,
            responseMimeType: 'application/json',
            maxOutputTokens: 800,
          },
        }),
        signal: controller.signal,
      });
    } catch (err: any) {
      clearTimeout(timer);
      return res.status(502).json({
        success: false,
        error: err?.name === 'AbortError' ? 'Gemini 逾時（18s）' : `Gemini 連線失敗：${err?.message}`,
      });
    }
    clearTimeout(timer);

    const latencyMs = Date.now() - t0;

    if (!geminiResp.ok) {
      const errText = await geminiResp.text().catch(() => '');
      return res.status(geminiResp.status).json({
        success: false,
        error: `Gemini API ${geminiResp.status}`,
        // 不洩漏 key，只回 body 前 300 字
        details: errText.substring(0, 300),
        latencyMs,
      });
    }

    const data: any = await geminiResp.json();
    const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
    const usage = data?.usageMetadata ?? {};
    const inputTokens  = Number(usage.promptTokenCount     ?? 0);
    const outputTokens = Number(usage.candidatesTokenCount ?? 0);

    let parsed: any = null;
    let parseError: string | null = null;
    try {
      parsed = rawText ? JSON.parse(rawText) : null;
    } catch (e: any) {
      parseError = e?.message ?? 'JSON parse error';
    }

    // 成本估算（USD，2025 公告價）
    const PRICING: Record<string, { in: number; out: number }> = {
      'gemini-2.5-flash-lite': { in: 0.10, out: 0.40 },
      'gemini-2.5-flash':      { in: 0.30, out: 2.50 },
      'gemini-2.0-flash':      { in: 0.10, out: 0.40 },
      'gemini-2.0-flash-lite': { in: 0.075, out: 0.30 },
    };
    const p = PRICING[safeModel] ?? PRICING['gemini-2.5-flash-lite'];
    const costUSD = (inputTokens * p.in + outputTokens * p.out) / 1_000_000;
    const costNTD = costUSD * 32; // 約略匯率

    res.json({
      success: true,
      model: safeModel,
      latencyMs,
      tokens: { input: inputTokens, output: outputTokens },
      cost: {
        usd: Number(costUSD.toFixed(8)),
        ntd: Number(costNTD.toFixed(6)),
        per1000Calls: {
          usd: Number((costUSD * 1000).toFixed(4)),
          ntd: Number((costNTD * 1000).toFixed(2)),
        },
      },
      classification: parsed,
      parseError,
      rawTextPreview: rawText.substring(0, 500),
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message ?? 'gemini test failed' });
  }
});

// ── POST /replay-mock — mock 一筆假訊息跑管線 ───────────────────────────────
// body: { groupId, userId?, displayName?, text }
announcementHealthRouter.post('/replay-mock', async (req, res) => {
  try {
    const {
      groupId,
      userId = 'U_MOCK_USER_FOR_REPLAY',
      displayName = '測試使用者',
      text,
    } = (req.body ?? {}) as {
      groupId?: string; userId?: string; displayName?: string; text?: string;
    };

    if (!groupId || !text) {
      return res.status(400).json({ success: false, error: 'groupId 與 text 皆為必填' });
    }
    if (text.length > 2000) {
      return res.status(400).json({ success: false, error: 'text 過長（>2000 字）' });
    }

    const beforeRow = await db.select({ c: sql<number>`COUNT(*)::int` })
      .from(announcementCandidates);
    const beforeCount = Number(beforeRow[0]?.c ?? 0);

    const mockMessageId = `MOCK_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    try {
      await ingestMessageForAnnouncement({
        messageId: mockMessageId,
        groupId,
        userId,
        displayName,
        text,
      });
    } catch (err: any) {
      return res.status(500).json({
        success: false,
        error: err?.message ?? 'ingest threw',
        mockMessageId,
      });
    }

    const afterRow = await db.select({ c: sql<number>`COUNT(*)::int` })
      .from(announcementCandidates);
    const afterCount = Number(afterRow[0]?.c ?? 0);
    const wrote = afterCount - beforeCount;

    res.json({
      success: true,
      mockMessageId,
      groupId,
      candidatesBefore: beforeCount,
      candidatesAfter: afterCount,
      candidatesAdded: wrote,
      verdict: wrote > 0
        ? '✅ 管線已寫出候選'
        : '⏭️ 管線未寫出候選（可能被 hardExclude / importance / drop 規則過濾，或群組不在白名單）',
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message ?? 'mock replay failed' });
  }
});
