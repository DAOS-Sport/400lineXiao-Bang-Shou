import { db } from '../../db';
import { announcementCandidates } from '@shared/schema';
import { preFilterMessage } from './announcementPreFilterService';
import { classifyAnnouncement } from './announcementClassifierService';
import { storage } from '../../storage';
import { inc } from './pipelineStats';

// ── 場館對照表 ────────────────────────────────────────────
const GROUP_FACILITY_MAP: Record<string, string> = {
  C66a4b3bb3fbc3dcf52d42626ec512484: '新北高中游泳池&運動中心',
  C6f6f163895d5b528a6ab044015e1a37b: '三重商工游泳池&籃球場',
  C2dc6991e51074dd47d5d275d568318f7: '三民高中游泳池',
  C9b3c5dfe2e005adafd2ed914714a1930: '松山國小室內溫水游泳池',
  C50c2a9623a78cc5f5e9f39557e3abfe6: '竹科戶外游泳池',
  C360be1fe6ea876a4df3ca0497bca4e3b: '竹科高爾夫/網球&籃球',
  C2dd9a5fce7c276f2cbfdd02c2342661c: '三民排班群',
  Ce936c6bebb59b8b5683ffbcf97bf20de: '原授權群組',
  Cf7ab973766c258e5b4b4f040d35b2175: '駿斯IT技術群',
  // TODO: 待補「駿斯-三蘆區櫃台」Group ID
  // 'C???': '駿斯-三蘆區櫃台',
};

/**
 * 重點群組（前台/服務台，門檻降至 ≥15 字）
 * ─ 駿斯IT技術群：Cf7ab973…（已加入）
 * ─ 駿斯-三蘆區櫃台：TODO 等候 Group ID
 */
export const FOCUS_GROUP_IDS = new Set([
  'C66a4b3bb3fbc3dcf52d42626ec512484', // 新北高中游泳池&運動中心
  'C6f6f163895d5b528a6ab044015e1a37b', // 三重商工游泳池&籃球場
  'C2dc6991e51074dd47d5d275d568318f7', // 三民高中游泳池
  'C9b3c5dfe2e005adafd2ed914714a1930', // 松山國小室內溫水游泳池
  'C50c2a9623a78cc5f5e9f39557e3abfe6', // 竹科戶外游泳池
  'C360be1fe6ea876a4df3ca0497bca4e3b', // 竹科高爾夫/網球&籃球
  'Cf7ab973766c258e5b4b4f040d35b2175', // ⭐ 駿斯IT技術群（重點群組）
  // TODO: 'C???': '駿斯-三蘆區櫃台',
]);

/**
 * VIP 特別關注人員
 * ─ 發話時：跳過預篩、直送 GPT、reasoningTags 標注 vip_user
 * ─ 新增人員：{ userId: 'U...', name: '姓名' }
 */
const VIP_USERS: Record<string, string> = {
  'U8fd0e4be4e44a1304f9fa2e9855f4559': '陳柏榮', // ⭐ 特別關注
};

// 主管職稱關鍵字（displayName 含以下字樣視為主管）
const SUPERVISOR_KEYWORDS = [
  '主任', '主管', '館長', '組長', '督導', '總監', '經理', '副理', '主席', '前台主管', '服務台',
];

function isSupervisorByDisplayName(displayName: string | null | undefined): boolean {
  if (!displayName) return false;
  return SUPERVISOR_KEYWORDS.some(kw => displayName.includes(kw));
}

// ── 主要進入點 ────────────────────────────────────────────
export async function ingestMessageForAnnouncement(params: {
  messageId: string;
  groupId: string;
  userId: string;
  displayName: string | null;
  text: string;
}): Promise<void> {
  const { messageId, groupId, userId, displayName, text } = params;

  if (!text || text.trim().length < 8) return;
  if (text.startsWith('@小幫手')) return;
  if (text.startsWith('交辦')) return;

  inc('totalChecked');

  try {
    // ── 身份判斷 ──────────────────────────────────────────
    const isAdminInDb       = await storage.isAdmin(userId);
    const isAdminByName     = isSupervisorByDisplayName(displayName);
    const isFromSupervisor  = isAdminInDb || isAdminByName;
    const isFocusGroup      = FOCUS_GROUP_IDS.has(groupId);

    const vipName = VIP_USERS[userId] ?? null;
    const isVip   = vipName !== null;

    if (isFromSupervisor) inc('supervisorChecked');
    if (isFocusGroup)     inc('focusGroupChecked');

    // ⭐ VIP 人員：完全跳過預篩，直接進 GPT
    let passReason: string;
    if (!isVip) {
      const preFilter = preFilterMessage(text, isFromSupervisor, isFocusGroup);
      if (!preFilter.pass) return;
      passReason = preFilter.passReason;
    } else {
      passReason = `vip_bypass:${vipName}`;
      console.log(`⭐ [公告歸納] VIP 用戶「${vipName}」訊息直接進入分析: "${text.substring(0, 40)}…"`);
    }

    inc('preFilterPass');

    const facilityName = GROUP_FACILITY_MAP[groupId] ?? '未知場館';
    const groupName    = `${facilityName}（${groupId.substring(0, 8)}…）`;

    console.log(
      `🔍 [公告歸納] GPT 分類中: "${text.substring(0, 40)}…" ` +
      `${facilityName} | ${passReason}` +
      (isVip ? ` | ⭐VIP:${vipName}` : '') +
      (isFromSupervisor ? ' | 主管' : '') +
      (isFocusGroup ? ' | 重點群組' : '')
    );

    const result = await classifyAnnouncement(text, groupName, isFromSupervisor || isVip, {
      pass: true,
      detectedKeywords: [],
      hintType: 'unknown',
      scopeHint: 'group',
      passReason: passReason as any,
    });
    if (!result) return;
    inc('gptClassified');

    if (result.candidateType === 'ignore' && result.confidence < 0.4) {
      inc('skippedLowConf');
      console.log(`⏭️ [公告歸納] 信心不足，跳過 (confidence=${result.confidence})`);
      return;
    }

    // ⭐ VIP 特別標注：加入 reasoningTags
    const finalReasoningTags: string[] = [...(result.reasoningTags ?? [])];
    if (isVip) {
      finalReasoningTags.unshift(`⭐特別關注:${vipName}`);
    }

    const status = result.candidateType === 'ignore' ? 'ignored' : 'pending_review';

    await db.insert(announcementCandidates).values({
      sourceMessageId:  messageId,
      groupId,
      facilityName,
      userId,
      displayName:      isVip ? `⭐ ${vipName}（特別關注）` : displayName,
      originalText:     text,
      isFromSupervisor: (isFromSupervisor || isVip) ? 'true' : 'false',
      candidateType:    result.candidateType,
      scopeType:        result.scopeType,
      title:            result.title,
      summary:          result.summary,
      recommendedAction: result.recommendedAction,
      badExample:       result.badExample,
      recommendedReply: result.recommendedReply,
      appliesToRoles:   result.appliesToRoles ?? [],
      startAt:          result.startAt ? new Date(result.startAt) : null,
      endAt:            result.endAt   ? new Date(result.endAt)   : null,
      confidence:       String(result.confidence),
      reasoningTags:    finalReasoningTags,
      extractedJson:    { ...result, passReason, isVip, vipName } as any,
      status,
    });

    inc('stored');
    console.log(
      `✅ [公告歸納] 已儲存 (type=${result.candidateType}, conf=${result.confidence}` +
      (isVip ? `, ⭐VIP=${vipName}` : '') + `)`
    );
  } catch (err: any) {
    console.error('❌ [公告歸納] ingest 失敗:', err.message || err);
  }
}
