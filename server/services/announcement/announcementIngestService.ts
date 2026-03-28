import { db } from '../../db';
import { announcementCandidates } from '@shared/schema';
import { preFilterMessage } from './announcementPreFilterService';
import { classifyAnnouncement } from './announcementClassifierService';
import { storage } from '../../storage';
import { inc } from './pipelineStats';

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
};

/**
 * 重點群組 — 前台/服務台性質的群組，門檻降低至 15 字即進分析
 * 可隨時新增群組 ID 到此 Set
 */
export const FOCUS_GROUP_IDS = new Set([
  'C66a4b3bb3fbc3dcf52d42626ec512484', // 新北高中游泳池&運動中心
  'C6f6f163895d5b528a6ab044015e1a37b', // 三重商工游泳池&籃球場
  'C2dc6991e51074dd47d5d275d568318f7', // 三民高中游泳池
  'C9b3c5dfe2e005adafd2ed914714a1930', // 松山國小室內溫水游泳池
  'C50c2a9623a78cc5f5e9f39557e3abfe6', // 竹科戶外游泳池
  'C360be1fe6ea876a4df3ca0497bca4e3b', // 竹科高爾夫/網球&籃球
]);

const SUPERVISOR_KEYWORDS = ['主任', '主管', '館長', '組長', '督導', '總監', '經理', '副理', '主席', '前台主管', '服務台'];

function isSupervisorByDisplayName(displayName: string | null | undefined): boolean {
  if (!displayName) return false;
  return SUPERVISOR_KEYWORDS.some(kw => displayName.includes(kw));
}

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
    const isAdminInDb = await storage.isAdmin(userId);
    const isAdminByName = isSupervisorByDisplayName(displayName);
    const isFromSupervisor = isAdminInDb || isAdminByName;
    const isFocusGroup = FOCUS_GROUP_IDS.has(groupId);

    if (isFromSupervisor) inc('supervisorChecked');
    if (isFocusGroup) inc('focusGroupChecked');

    const preFilter = preFilterMessage(text, isFromSupervisor, isFocusGroup);

    if (!preFilter.pass) return;
    inc('preFilterPass');

    const facilityName = GROUP_FACILITY_MAP[groupId] ?? '未知場館';
    const groupName = `${facilityName}（${groupId.substring(0, 8)}…）`;

    console.log(
      `🔍 [公告歸納] 進入 GPT: "${text.substring(0, 40)}…" ` +
      `來自 ${facilityName} | 原因: ${preFilter.passReason} | ` +
      `主管: ${isFromSupervisor} | 重點群組: ${isFocusGroup}`
    );

    const result = await classifyAnnouncement(text, groupName, isFromSupervisor, preFilter);
    if (!result) return;
    inc('gptClassified');

    if (result.candidateType === 'ignore' && result.confidence < 0.4) {
      inc('skippedLowConf');
      console.log(`⏭️ [公告歸納] 信心不足，跳過 (confidence=${result.confidence})`);
      return;
    }

    const status = result.candidateType === 'ignore' ? 'ignored' : 'pending_review';

    await db.insert(announcementCandidates).values({
      sourceMessageId: messageId,
      groupId,
      facilityName,
      userId,
      displayName,
      originalText: text,
      isFromSupervisor: isFromSupervisor ? 'true' : 'false',
      candidateType: result.candidateType,
      scopeType: result.scopeType,
      title: result.title,
      summary: result.summary,
      recommendedAction: result.recommendedAction,
      badExample: result.badExample,
      recommendedReply: result.recommendedReply,
      appliesToRoles: result.appliesToRoles ?? [],
      startAt: result.startAt ? new Date(result.startAt) : null,
      endAt: result.endAt ? new Date(result.endAt) : null,
      confidence: String(result.confidence),
      reasoningTags: result.reasoningTags ?? [],
      extractedJson: result as any,
      status,
    });

    inc('stored');
    console.log(`✅ [公告歸納] 已儲存 (type=${result.candidateType}, conf=${result.confidence}, reason=${preFilter.passReason})`);
  } catch (err: any) {
    console.error('❌ [公告歸納] ingest 失敗:', err.message || err);
  }
}
