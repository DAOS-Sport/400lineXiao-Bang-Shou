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

export function matchFacilityToGroupId(facility: string): string | null {
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

export function formatSurveyMessage(data: SurveyData): string {
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

function formatSurveySummary(surveys: SurveyData[]): string {
  if (surveys.length === 0) return '';

  const lines: string[] = [];
  lines.push(`📋 滿意度調查彙整（共 ${surveys.length} 筆新回饋）`);
  lines.push(`━━━━━━━━━━━━━━━`);

  surveys.forEach((survey, index) => {
    if (index > 0) lines.push(``);
    lines.push(`【第 ${index + 1} 筆】`);
    lines.push(`🏢 場館：${survey.facility}`);
    lines.push(`🎯 來訪目的：${survey.purpose || '未填寫'}`);
    lines.push(`📊 課程${survey.courseVariety || '-'} / 服務${survey.serviceAttitude || '-'} / 整潔${survey.cleanliness || '-'} / 設備${survey.equipment || '-'} / 師資${survey.teachingStaff || '-'}`);
    if (survey.suggestion && survey.suggestion.trim()) {
      lines.push(`💬 建議：${survey.suggestion}`);
    }
  });

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

      await storage.insertAuditLog({
        id: crypto.randomUUID(),
        level: 'info',
        category: 'pending_survey_feedback',
        message: `滿意度回饋已暫存，等待排程觸發推送`,
        details: {
          facility: data.facility,
          groupId,
          surveyData: data,
          status: 'pending',
          receivedAt: data.timestamp || new Date().toISOString()
        }
      });

      console.log(`✅ 滿意度回饋已暫存（群組 ${groupId.substring(0, 8)}...），等待排程觸發`);
      return { success: true, groupId };
    } catch (error) {
      console.error('❌ 處理滿意度調查回饋失敗:', error);
      return { success: false, error: (error as Error).message };
    }
  }

  async getPendingSurveys(groupId: string): Promise<SurveyData[]> {
    try {
      const pendingLogs = await storage.getAuditLogsByCategory('pending_survey_feedback');
      const sentLogs = await storage.getAuditLogsByCategory('survey_feedback_sent');

      const sentOriginalIds = new Set(
        sentLogs
          .filter(log => log.details && typeof log.details === 'object' && 'originalLogId' in log.details)
          .map(log => (log.details as any).originalLogId)
      );

      const pending = pendingLogs.filter(log =>
        log.details &&
        typeof log.details === 'object' &&
        'groupId' in log.details &&
        'status' in log.details &&
        log.details.groupId === groupId &&
        log.details.status === 'pending' &&
        !sentOriginalIds.has(log.id)
      );

      return pending.map(log => {
        const details = log.details as any;
        return details.surveyData as SurveyData;
      }).filter(Boolean);
    } catch (error) {
      console.error('❌ 取得待發送滿意度調查失敗:', error);
      return [];
    }
  }

  async markSurveysAsSent(groupId: string): Promise<void> {
    try {
      const pendingLogs = await storage.getAuditLogsByCategory('pending_survey_feedback');
      const sentLogs = await storage.getAuditLogsByCategory('survey_feedback_sent');

      const sentOriginalIds = new Set(
        sentLogs
          .filter(log => log.details && typeof log.details === 'object' && 'originalLogId' in log.details)
          .map(log => (log.details as any).originalLogId)
      );

      const pending = pendingLogs.filter(log =>
        log.details &&
        typeof log.details === 'object' &&
        'groupId' in log.details &&
        'status' in log.details &&
        log.details.groupId === groupId &&
        log.details.status === 'pending' &&
        !sentOriginalIds.has(log.id)
      );

      for (const log of pending) {
        await storage.insertAuditLog({
          id: crypto.randomUUID(),
          level: 'info',
          category: 'survey_feedback_sent',
          message: `滿意度回饋已透過排程觸發發送`,
          details: {
            originalLogId: log.id,
            groupId,
            facility: (log.details as any)?.facility,
            status: 'sent',
            sentAt: new Date().toISOString(),
            method: 'reply_trigger'
          }
        });
      }

      console.log(`🧹 已標記 ${pending.length} 筆滿意度調查為已發送 (群組 ${groupId.substring(0, 8)}...)`);
    } catch (error) {
      console.error('❌ 標記滿意度調查為已發送失敗:', error);
    }
  }

  async getSurveySummaryText(groupId: string): Promise<string | null> {
    const surveys = await this.getPendingSurveys(groupId);
    if (surveys.length === 0) return null;
    return formatSurveySummary(surveys);
  }
}

export const surveyService = new SurveyService();
