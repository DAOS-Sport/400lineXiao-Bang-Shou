/**
 * candidateDedup — 公告候選去重服務
 *
 * 在寫入 announcement_candidates 前計算 contentHash，
 * 若 24 小時內同 groupId + contentHash 已存在（非 rejected），
 * 升級該筆 confidence 並合併 sourceMessageId，不另建新筆。
 */

import crypto from 'crypto';
import { db } from '../db';
import { announcementCandidates } from '@shared/schema';
import { eq, and, gte, ne } from 'drizzle-orm';

/** 正規化文字：去空白、轉小寫 */
function normalize(text: string): string {
  return text.trim().replace(/\s+/g, '').toLowerCase();
}

/** 計算去重雜湊 */
export function computeContentHash(params: {
  title: string | null;
  summary: string | null;
  groupId: string;
  detectedAt?: Date;
}): string {
  const dateStr = (params.detectedAt ?? new Date()).toISOString().slice(0, 10); // YYYY-MM-DD
  const raw = normalize(
    (params.title ?? '') + (params.summary ?? '') + params.groupId + dateStr,
  );
  return crypto.createHash('sha256').update(raw).digest('hex').slice(0, 32);
}

export interface DedupResult {
  isDuplicate: boolean;
  existingId?: number;
}

/**
 * 檢查是否重複；若重複則升級信心分並合併 sourceMessageId，回傳 { isDuplicate: true }
 * 若不重複回傳 { isDuplicate: false }
 */
export async function checkAndDedup(params: {
  contentHash: string;
  groupId: string;
  newConfidence: number;
  newMessageId: string | null;
}): Promise<DedupResult> {
  const { contentHash, groupId, newConfidence, newMessageId } = params;

  if (!contentHash) return { isDuplicate: false };

  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);

  try {
    const existing = await db.select()
      .from(announcementCandidates)
      .where(
        and(
          eq(announcementCandidates.groupId, groupId),
          eq(announcementCandidates.contentHash, contentHash),
          gte(announcementCandidates.detectedAt, since24h),
          ne(announcementCandidates.status, 'rejected'),
        ),
      );

    if (existing.length === 0) return { isDuplicate: false };

    const dup = existing[0];
    const oldConf = parseFloat(dup.confidence ?? '0');
    const maxConf = Math.max(oldConf, newConfidence);

    // 合併 relatedMessageIds
    const ej = (dup.extractedJson as any) ?? {};
    const related: string[] = Array.isArray(ej.relatedMessageIds) ? ej.relatedMessageIds : [];
    if (newMessageId && !related.includes(newMessageId)) {
      related.push(newMessageId);
    }

    await db.update(announcementCandidates)
      .set({
        confidence: String(maxConf),
        extractedJson: { ...ej, relatedMessageIds: related },
      })
      .where(eq(announcementCandidates.id, dup.id));

    console.log(`🔁 [去重] 合併重複候選 id=${dup.id} conf: ${oldConf}→${maxConf}`);
    return { isDuplicate: true, existingId: dup.id };
  } catch (err: any) {
    console.error('❌ [去重] 查詢失敗:', err?.message);
    return { isDuplicate: false }; // 查詢失敗時安全放行
  }
}
