import * as cron from 'node-cron';
import { storage } from "../storage";
import { lineService } from "./lineService";
import { taskService } from "./taskService";
import { llmService } from "./llmService";
import { getYesterday, formatDate, getYesterdayRange, getLast24HoursRange } from "../utils/time";

export class SchedulerService {
  private cronJob: cron.ScheduledTask | null = null;

  start(): void {
    if (this.cronJob) {
      this.cronJob.destroy();
    }

    // 每日 06:30 (Asia/Taipei) 執行
    this.cronJob = cron.schedule('30 6 * * *', async () => {
      await this.dailyTaskSummary();
    }, {
      timezone: 'Asia/Taipei'
    });

    console.log('排程服務已啟動 - 每日 06:30 (Asia/Taipei) 執行任務整理');
  }

  stop(): void {
    if (this.cronJob) {
      this.cronJob.destroy();
      this.cronJob = null;
    }
  }

  private async dailyTaskSummary(): Promise<void> {
    try {
      const targetGroupIds = (process.env.TARGET_GROUP_IDS || 'Cde9656c23b55a1b7bd5b8da147d51910').split(',').map(id => id.trim()).filter(Boolean);
      
      if (targetGroupIds.length === 0) {
        console.log('沒有設定目標群組，跳過每日任務整理');
        return;
      }

      await storage.insertAuditLog({
        id: crypto.randomUUID(),
        level: 'info',
        category: 'scheduler',
        message: '開始每日任務整理',
        details: { targetGroupIds }
      });

      const { start: startDate, end: endDate } = getLast24HoursRange();
      

      // 逐一處理每個群組
      for (const groupId of targetGroupIds) {
        try {
          await this.processGroupDailySummary(groupId, startDate, endDate);
        } catch (error: any) {
          console.error(`群組 ${groupId} 任務整理失敗:`, error);
          await storage.insertAuditLog({
            id: crypto.randomUUID(),
            level: 'error',
            category: 'scheduler',
            message: '群組任務整理失敗',
            details: { groupId, error: error.message }
          });
        }
      }

    } catch (error: any) {
      console.error('每日任務整理失敗:', error);
      await storage.insertAuditLog({
        id: crypto.randomUUID(),
        level: 'error',
        category: 'scheduler',
        message: '每日任務整理失敗',
        details: { error: error.message }
      });
    }
  }

  private async processGroupDailySummary(groupId: string, startDate: Date, endDate: Date): Promise<void> {
    // 查詢前一日建立的未完成任務
    const yesterdayTasks = await storage.getTasksCreatedBetween(groupId, startDate, endDate, 'pending');
    
    if (yesterdayTasks.length === 0) {
      console.log(`群組 ${groupId} 前一日沒有未完成任務`);
      return;
    }

    // 準備任務資料
    const taskData = yesterdayTasks.map(task => ({
      serial: task.taskIdSerial,
      description: task.text,
      creator: task.authorDisplayName || task.authorUserId
    }));

    try {
      // 使用 LLM 整理任務
      const organizedTasks = await llmService.organizeTasksForDailySummary(taskData);
      
      // 組合推送訊息
      const dateStr = formatDate(startDate);
      const message = `📌 昨日交辦整理（${dateStr}）\n${organizedTasks}\n—— 合計 ${yesterdayTasks.length} 項（皆未完成）`;
      
      // 推送到群組
      await lineService.pushMessage(groupId, message);
      
      await storage.insertAuditLog({
        id: crypto.randomUUID(),
        level: 'info',
        category: 'scheduler',
        message: '群組每日任務整理完成',
        details: {
          groupId,
          taskCount: yesterdayTasks.length,
          date: dateStr
        }
      });

    } catch (error: any) {
      console.error(`群組 ${groupId} 任務推送失敗:`, error);
      
      // 降級處理：直接推送原始任務列表
      const fallbackTasks = taskData.map(task => `${task.serial}. ${task.description}`).join('\n');
      const dateStr = formatDate(startDate);
      const fallbackMessage = `📌 昨日交辦整理（${dateStr}）\n${fallbackTasks}\n—— 合計 ${yesterdayTasks.length} 項（皆未完成）`;
      
      try {
        await lineService.pushMessage(groupId, fallbackMessage);
        
        await storage.insertAuditLog({
          id: crypto.randomUUID(),
          level: 'warning',
          category: 'scheduler',
          message: '群組任務整理降級處理完成',
          details: {
            groupId,
            taskCount: yesterdayTasks.length,
            error: error.message
          }
        });
      } catch (fallbackError: any) {
        await storage.insertAuditLog({
          id: crypto.randomUUID(),
          level: 'error',
          category: 'scheduler',
          message: '群組任務推送完全失敗',
          details: {
            groupId,
            originalError: error.message,
            fallbackError: fallbackError.message
          }
        });
      }
    }
  }

  // 手動觸發測試（可選）
  async triggerManualSummary(): Promise<void> {
    console.log('手動觸發每日任務整理...');
    await this.dailyTaskSummary();
  }
}

export const schedulerService = new SchedulerService();