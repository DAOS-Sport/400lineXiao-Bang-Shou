import { lineService } from './lineService';
import { storage } from '../storage';
import crypto from 'crypto';

const FACILITY_GROUP_MAP: Record<string, string> = {
  '新北高中游泳池': 'C66a4b3bb3fbc3dcf52d42626ec512484',
  '運動中心': 'C66a4b3bb3fbc3dcf52d42626ec512484',
  '新北高中游泳池 & 運動中心': 'C66a4b3bb3fbc3dcf52d42626ec512484',
  '三重商工游泳池': 'C6f6f163895d5b528a6ab044015e1a37b',
  '籃球場': 'C6f6f163895d5b528a6ab044015e1a37b',
  '三重商工游泳池 & 籃球場': 'C6f6f163895d5b528a6ab044015e1a37b',
  '三民高中游泳池': 'C2dc6991e51074dd47d5d275d568318f7',
  '松山國小室內溫水游泳池': 'C9b3c5dfe2e005adafd2ed914714a1930',
  '竹科戶外游泳池': 'C50c2a9623a78cc5f5e9f39557e3abfe6',
  '竹科高爾夫球練習場': 'C360be1fe6ea876a4df3ca0497bca4e3b',
  '竹科網球場': 'C360be1fe6ea876a4df3ca0497bca4e3b',
  '竹科網球場 & 籃球場': 'C360be1fe6ea876a4df3ca0497bca4e3b',
};

export interface SurveyData {
  facility: string;
  purpose: string;
  courseVariety: string;
  serviceAttitude: string;
  cleanliness: string;
  equipment: string;
  teachingStaff: string;
  suggestion: string;
  timestamp?: string;
}

function matchFacilityToGroupId(facility: string): string | null {
  const trimmed = facility.trim();
  if (FACILITY_GROUP_MAP[trimmed]) {
    return FACILITY_GROUP_MAP[trimmed];
  }
  for (const [key, groupId] of Object.entries(FACILITY_GROUP_MAP)) {
    if (trimmed.includes(key) || key.includes(trimmed)) {
      return groupId;
    }
  }
  return null;
}

function formatSurveyMessage(data: SurveyData): string {
  const lines: string[] = [];
  lines.push(`📋 顧客滿意度回饋通知`);
  lines.push(`━━━━━━━━━━━━━━━`);
  lines.push(`🏢 場館：${data.facility}`);
  lines.push(`🎯 來訪目的：${data.purpose || '未填寫'}`);
  lines.push(``);
  lines.push(`📊 滿意度評分`);
  lines.push(`├ 課程豐富：${data.courseVariety || '未評'}`);
  lines.push(`├ 服務態度：${data.serviceAttitude || '未評'}`);
  lines.push(`├ 環境整潔：${data.cleanliness || '未評'}`);
  lines.push(`├ 硬體設備：${data.equipment || '未評'}`);
  lines.push(`└ 師資陣容：${data.teachingStaff || '未評'}`);

  if (data.suggestion && data.suggestion.trim()) {
    lines.push(``);
    lines.push(`💬 顧客建議`);
    lines.push(data.suggestion);
  }

  if (data.timestamp) {
    lines.push(``);
    lines.push(`🕐 ${data.timestamp}`);
  }

  return lines.join('\n');
}

class SurveyService {
  async handleSurveyWebhook(data: SurveyData): Promise<{ success: boolean; groupId?: string; error?: string }> {
    try {
      console.log(`📋 收到滿意度調查回饋 - 場館: ${data.facility}`);

      const groupId = matchFacilityToGroupId(data.facility);

      if (!groupId) {
        console.warn(`⚠️ 找不到場館「${data.facility}」對應的群組`);
        await storage.insertAuditLog({
          id: crypto.randomUUID(),
          level: 'warning',
          category: 'survey_feedback',
          message: `找不到場館對應群組: ${data.facility}`,
          details: { facility: data.facility, data }
        });
        return { success: false, error: `找不到場館「${data.facility}」對應的群組` };
      }

      const message = formatSurveyMessage(data);
      await lineService.pushMessage(groupId, message);

      await storage.insertAuditLog({
        id: crypto.randomUUID(),
        level: 'info',
        category: 'survey_feedback',
        message: `滿意度回饋已推送至群組`,
        details: {
          facility: data.facility,
          groupId,
          purpose: data.purpose,
          suggestion: data.suggestion,
          timestamp: data.timestamp || new Date().toISOString()
        }
      });

      console.log(`✅ 滿意度回饋已推送至群組 ${groupId}`);
      return { success: true, groupId };
    } catch (error) {
      console.error('❌ 處理滿意度調查回饋失敗:', error);
      return { success: false, error: (error as Error).message };
    }
  }
}

export const surveyService = new SurveyService();
