/**
 * 公告歸納進入點 — 5 層商用管線
 *
 * Layer 0   hardExclude                  → 丟棄（短回覆/表情/指令）
 * Layer 0.5 classifyAnnouncementImportance → 排除任務/交接/異常
 * Layer 1   scoreMessage                 → 規則評分
 * Layer 2   makeDecision                 → drop / rule_matched / needs_ai_review
 * Layer 3   classifyAnnouncement         → 僅灰區訊息才送 AI（含 Pass 1 gate）
 * Layer 4   persist                      → 寫入 DB（含去重）
 */

import { db } from '../../db';
import { announcementCandidates } from '@shared/schema';
import { hardExclude, scoreMessage, makeDecision, type SpeakerType } from './announcementRuleEngine';
import { classifyAnnouncement } from './announcementClassifierService';
import { classifyAnnouncementImportance } from './announcementImportanceClassifier';
import { storage } from '../../storage';
import {
  incReceived, incHardExcluded, incRuleEngine,
  incDecision, incAiCall, incStored,
  recordIngestActivity, recordIngestError,
} from './pipelineStats';
import {
  FOCUS_GROUP_IDS, GROUP_FACILITY_MAP, GROUP_TIER_MAP,
  VIP_USERS, SUPERVISOR_KEYWORDS, NEEDS_ACK_TYPES,
} from './announcementConfig';
import { isSupervisor as resolveIsSupervisor } from '../supervisorResolver';
import { computeContentHash, checkAndDedup } from '../candidateDedup';

function isSupervisorByName(displayName: string | null | undefined): boolean {
  if (!displayName) return false;
  return SUPERVISOR_KEYWORDS.some(kw => displayName.includes(kw));
}

export { FOCUS_GROUP_IDS };

// ── 主進入點 ────────────────────────────────────────────────────────────────

export async function ingestMessageForAnnouncement(params: {
  messageId: string;
  groupId: string;
  userId: string;
  displayName: string | null;
  text: string;
}): Promise<void> {
  const { messageId, groupId, userId, displayName, text } = params;

  incReceived();
  recordIngestActivity(groupId);

  // Layer 0: 硬排除
  const excl = hardExclude(text);
  if (excl.excluded) {
    incHardExcluded();
    return;
  }

  // Layer 0.5: 公告重要性預分類 — 排除任務/交接/異常
  const importanceDecision = classifyAnnouncementImportance({
    text,
    groupId,
    displayName: displayName ?? undefined,
    createdAt: new Date(),
  });
  if (importanceDecision.importance === 'not_announcement') {
    console.log(`⏭️ [公告] not_announcement (${importanceDecision.reasonCodes.join(',')}) "${text.substring(0, 40)}"`);
    return;
  }

  // 身份判斷（supervisorResolver + fallback）
  const vipName = VIP_USERS[userId] ?? null;
  const isVip = vipName !== null;
  const isAdminInDb = await storage.isAdmin(userId);
  const isAdminByName = isSupervisorByName(displayName);

  // 非同步查詢 supervisorResolver（有快取，通常極快）
  const supInfo = await resolveIsSupervisor(userId);
  const isSup = isAdminInDb || isAdminByName || supInfo.isSupervisor;

  const speakerType: SpeakerType = isVip ? 'vip' : isSup ? 'supervisor' : 'member';

  // 只處理重點群組（含各 tier）
  const tier = GROUP_TIER_MAP[groupId] ?? null;
  if (!tier) return;

  incRuleEngine();

  // Layer 1 + 2: 規則評分 + 決策
  const score = scoreMessage(text);
  const decisionResult = makeDecision({ text, score, speakerType, tier });

  incDecision(decisionResult.decision, {
    groupId,
    speakerType,
    matchedRules: decisionResult.matchedRules,
  });

  if (decisionResult.decision === 'drop') {
    console.log(`⏭️ [公告] drop (${decisionResult.reason}) score=${score.total} "${text.substring(0, 40)}"`);
    return;
  }

  const facilityName = GROUP_FACILITY_MAP[groupId] ?? '未知場館';
  const isRuleMatched = decisionResult.decision === 'rule_matched';

  // ── rule_matched：不送 AI，直接寫入待審 ───────────────────────────
  if (isRuleMatched) {
    console.log(`✅ [公告] rule_matched (${decisionResult.reason}) "${text.substring(0, 50)}"`);

    const candidateType = inferTypeFromRules(decisionResult.matchedRules, score);
    const needsAck = NEEDS_ACK_TYPES.has(candidateType) || score.scopeType !== 'group';

    await persistCandidate({
      messageId, groupId, facilityName, userId, displayName,
      text, speakerType, isSupervisor: isSup, tier,
      candidateType,
      scopeType: score.scopeType,
      title: null,
      summary: null,
      confidence: '0.85',
      reasoningTags: decisionResult.matchedRules,
      status: 'rule_matched_pending_review',
      decisionSource: 'rule_engine',
      preFilterScore: score.total,
      matchedRules: decisionResult.matchedRules,
      needsAck,
      isTimeSensitive: score.hasTimeSensitivity,
      isCustomerFacing: score.hasExplicitAudience,
      isOperationallyRelevant: score.strongHits.length > 0,
      // rule_matched 暫無 AI 產出
      appliesToRoles: [],
      startAt: null,
      endAt: null,
      recommendedAction: null,
      recommendedReply: null,
      badExample: null,
      aiExtractedJson: null,
      priority: (isSup && score.scopeType !== 'group') ? 'must_read'
        : NEEDS_ACK_TYPES.has(candidateType) ? 'high' : 'normal',
    });
    return;
  }

  // ── needs_ai_review：送 GPT 分類（含 Pass 1 gate）─────────────────
  console.log(`🔍 [公告] AI 分類中 (${decisionResult.reason}) "${text.substring(0, 40)}"`);
  const t0 = Date.now();
  let aiResult: Awaited<ReturnType<typeof classifyAnnouncement>> = null;
  let isTimeout = false;

  try {
    aiResult = await classifyAnnouncement(text, `${facilityName}（${groupId.substring(0, 8)}…）`, isSup || isVip, {
      pass: true,
      detectedKeywords: score.strongHits,
      hintType: 'unknown',
      scopeHint: 'group',
      passReason: decisionResult.reason as any,
    });
  } catch (err: any) {
    if (err?.name === 'AbortError' || err?.message?.includes('abort')) isTimeout = true;
    console.error('❌ [公告] AI 分類失敗:', err?.message);
  }

  const latencyMs = Date.now() - t0;
  const isIgnore = !aiResult || aiResult.candidateType === 'ignore';
  incAiCall({ latencyMs, isIgnore, isTimeout });

  // AI 判斷為 ignore → 一律 drop（不寫入）
  if (!aiResult || aiResult.candidateType === 'ignore') {
    console.log(`⏭️ [公告] AI ignore (conf=${aiResult?.confidence ?? 'N/A'}) "${text.substring(0, 40)}"`);
    return;
  }

  const needsAck = NEEDS_ACK_TYPES.has(aiResult.candidateType) || aiResult.scopeType !== 'group' || !!aiResult.needsAck;

  await persistCandidate({
    messageId, groupId, facilityName, userId, displayName,
    text, speakerType, isSupervisor: isSup, tier,
    candidateType: aiResult.candidateType,
    scopeType: aiResult.scopeType,
    title: aiResult.title,
    summary: aiResult.summary,
    confidence: String(aiResult.confidence),
    reasoningTags: aiResult.reasoningTags ?? [],
    status: 'ai_pending_review',
    decisionSource: 'ai',
    preFilterScore: score.total,
    matchedRules: decisionResult.matchedRules,
    needsAck,
    isTimeSensitive: score.hasTimeSensitivity,
    isCustomerFacing: score.hasExplicitAudience,
    isOperationallyRelevant: aiResult.candidateType !== 'ignore',
    appliesToRoles: aiResult.appliesToRoles ?? [],
    startAt: aiResult.startAt ?? null,
    endAt: aiResult.endAt ?? null,
    recommendedAction: aiResult.recommendedAction ?? null,
    recommendedReply: aiResult.recommendedReply ?? null,
    badExample: aiResult.badExample ?? null,
    aiExtractedJson: aiResult.extractedJson ?? null,
    priority: aiResult.priority ?? 'normal',
  });
}

// ── 輔助：從規則推斷公告類型 ──────────────────────────────────────────────

function inferTypeFromRules(rules: string[], score: ReturnType<typeof scoreMessage>): string {
  const r = rules.join(' ');
  if (r.includes('SOP') || r.includes('禁止') || r.includes('不得') || r.includes('一律') || r.includes('務必')) return 'rule';
  if (r.includes('統一說法') || r.includes('禁止說詞')) return 'script';
  if (r.includes('休館') || r.includes('暫停開放') || r.includes('課程取消') || r.includes('時段調整')) return 'notice';
  if (r.includes('價格調整') || r.includes('優惠') || r.includes('折扣')) return 'discount';
  if (r.includes('活動') || r.includes('招生') || r.includes('報名')) return 'campaign';
  if (score.scopeType === 'multi_facility') return 'notice';
  return 'notice';
}

// ── 寫入 DB（含去重） ────────────────────────────────────────────────────────

async function persistCandidate(params: {
  messageId: string;
  groupId: string;
  facilityName: string;
  userId: string;
  displayName: string | null;
  text: string;
  speakerType: SpeakerType;
  isSupervisor: boolean;
  tier: string;
  candidateType: string;
  scopeType: string;
  title: string | null;
  summary: string | null;
  confidence: string;
  reasoningTags: string[];
  status: string;
  decisionSource: 'rule_engine' | 'ai';
  preFilterScore: number;
  matchedRules: string[];
  needsAck: boolean;
  isTimeSensitive: boolean;
  isCustomerFacing: boolean;
  isOperationallyRelevant: boolean;
  appliesToRoles: string[];
  startAt: string | null;
  endAt: string | null;
  recommendedAction: string | null;
  recommendedReply: string | null;
  badExample: string | null;
  aiExtractedJson: any;
  priority: string;
}): Promise<void> {
  try {
    const vipName = VIP_USERS[params.userId] ?? null;
    const tags = [...params.reasoningTags];
    if (vipName) tags.unshift(`⭐VIP:${vipName}`);
    if (params.isSupervisor) tags.unshift('主管');

    // 計算去重雜湊
    const contentHash = computeContentHash({
      title: params.title,
      summary: params.summary,
      groupId: params.groupId,
    });

    // 去重檢查
    const dedup = await checkAndDedup({
      contentHash,
      groupId: params.groupId,
      newConfidence: parseFloat(params.confidence),
      newMessageId: params.messageId,
    });
    if (dedup.isDuplicate) return;

    // 合併 extractedJson
    const extractedJson = {
      decisionSource: params.decisionSource,
      preFilterScore: params.preFilterScore,
      matchedRules: params.matchedRules,
      groupTier: params.tier,
      speakerType: params.speakerType,
      needsAck: params.needsAck,
      isTimeSensitive: params.isTimeSensitive,
      isCustomerFacing: params.isCustomerFacing,
      isOperationallyRelevant: params.isOperationallyRelevant,
      ...(params.aiExtractedJson ?? {}),
    };

    await db.insert(announcementCandidates).values({
      sourceMessageId: params.messageId,
      groupId: params.groupId,
      facilityName: params.facilityName,
      userId: params.userId,
      displayName: vipName ? `⭐ ${vipName}（特別關注）` : params.displayName,
      originalText: params.text,
      isFromSupervisor: (params.isSupervisor || params.speakerType === 'vip') ? 'true' : 'false',
      candidateType: params.candidateType,
      scopeType: params.scopeType,
      title: params.title,
      summary: params.summary,
      recommendedAction: params.recommendedAction,
      recommendedReply: params.recommendedReply,
      badExample: params.badExample,
      appliesToRoles: params.appliesToRoles,
      startAt: params.startAt ? new Date(params.startAt) : null,
      endAt: params.endAt ? new Date(params.endAt) : null,
      confidence: params.confidence,
      reasoningTags: tags,
      priority: params.priority,
      contentHash,
      status: params.status,
      extractedJson: extractedJson as any,
    });

    incStored(params.groupId);
    console.log(`💾 [公告] 已儲存 type=${params.candidateType} priority=${params.priority} src=${params.decisionSource}`);
  } catch (err: any) {
    console.error('❌ [公告] DB 寫入失敗:', err?.message);
    recordIngestError(`persist: ${err?.message ?? 'unknown'}`);
  }
}
