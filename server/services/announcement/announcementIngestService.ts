/**
 * 公告歸納進入點 — 5 層商用管線
 *
 * Layer 0  hardExclude         → 丟棄
 * Layer 1  scoreMessage        → 規則評分
 * Layer 2  makeDecision        → drop / rule_matched / needs_ai_review
 * Layer 3  classifyAnnouncement → 僅灰區訊息才送 AI
 * Layer 4  persist             → 寫入 DB
 */

import { db } from '../../db';
import { announcementCandidates } from '@shared/schema';
import { hardExclude, scoreMessage, makeDecision, type SpeakerType } from './announcementRuleEngine';
import { classifyAnnouncement } from './announcementClassifierService';
import { storage } from '../../storage';
import {
  incReceived, incHardExcluded, incRuleEngine,
  incDecision, incAiCall, incStored,
} from './pipelineStats';
import {
  FOCUS_GROUP_IDS, GROUP_FACILITY_MAP, GROUP_TIER_MAP,
  VIP_USERS, SUPERVISOR_KEYWORDS, NEEDS_ACK_TYPES,
} from './announcementConfig';

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

  // Layer 0: 硬排除
  const excl = hardExclude(text);
  if (excl.excluded) {
    incHardExcluded();
    return;
  }

  // 身份判斷
  const vipName = VIP_USERS[userId] ?? null;
  const isVip = vipName !== null;
  const isAdminInDb = await storage.isAdmin(userId);
  const isAdminByName = isSupervisorByName(displayName);
  const isSupervisor = isAdminInDb || isAdminByName;

  const speakerType: SpeakerType = isVip ? 'vip' : isSupervisor ? 'supervisor' : 'member';

  // 只處理重點群組（含各 tier）
  const tier = GROUP_TIER_MAP[groupId] ?? null;
  if (!tier) return; // 不在重點群組，靜默略過

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
  const decisionSource: 'rule_engine' | 'ai' = isRuleMatched ? 'rule_engine' : 'ai';

  // ── rule_matched：不送 AI，直接寫入待審 ───────────────────────────
  if (isRuleMatched) {
    console.log(`✅ [公告] rule_matched (${decisionResult.reason}) "${text.substring(0, 50)}"`);

    const candidateType = inferTypeFromRules(decisionResult.matchedRules, score);
    const needsAck = NEEDS_ACK_TYPES.has(candidateType) || score.scopeType !== 'group';

    await persistCandidate({
      messageId, groupId, facilityName, userId, displayName,
      text, speakerType, isSupervisor, tier,
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
    });
    return;
  }

  // ── needs_ai_review：送 GPT 分類 ─────────────────────────────────
  console.log(`🔍 [公告] AI 分類中 (${decisionResult.reason}) "${text.substring(0, 40)}"`);
  const t0 = Date.now();
  let aiResult: Awaited<ReturnType<typeof classifyAnnouncement>> = null;
  let isTimeout = false;

  try {
    aiResult = await classifyAnnouncement(text, `${facilityName}（${groupId.substring(0, 8)}…）`, isSupervisor || isVip, {
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
    text, speakerType, isSupervisor, tier,
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

// ── 寫入 DB ─────────────────────────────────────────────────────────────────

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
}): Promise<void> {
  try {
    const vipName = VIP_USERS[params.userId] ?? null;
    const tags = [...params.reasoningTags];
    if (vipName) tags.unshift(`⭐VIP:${vipName}`);
    if (params.isSupervisor) tags.unshift('主管');

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
      confidence: params.confidence,
      reasoningTags: tags,
      status: params.status,
      extractedJson: {
        decisionSource: params.decisionSource,
        preFilterScore: params.preFilterScore,
        matchedRules: params.matchedRules,
        groupTier: params.tier,
        speakerType: params.speakerType,
        needsAck: params.needsAck,
        isTimeSensitive: params.isTimeSensitive,
        isCustomerFacing: params.isCustomerFacing,
        isOperationallyRelevant: params.isOperationallyRelevant,
      } as any,
    });

    incStored(params.groupId);
    console.log(`💾 [公告] 已儲存 type=${params.candidateType} status=${params.status} src=${params.decisionSource}`);
  } catch (err: any) {
    console.error('❌ [公告] DB 寫入失敗:', err?.message);
  }
}
