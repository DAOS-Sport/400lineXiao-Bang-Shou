import * as cron from 'node-cron';
import { storage } from "../storage";
import { lineService } from "./lineService";
import { taskService } from "./taskService";
import { llmService } from "./llmService";
import { simpleBackupService } from "./simpleBackupService";
import { getYesterday, formatDate } from "../utils/time";

export class SchedulerService {
  private cronJobs: cron.ScheduledTask[] = [];

  start(): void {
    // 先清除既有的排程
    this.stop();

    // 四個時段的任務提醒：06:30, 11:00, 15:00, 20:00
    const taskSchedules = [
      { time: '30 6 * * *', name: '06:30' },
      { time: '0 11 * * *', name: '11:00' }, 
      { time: '0 15 * * *', name: '15:00' },
      { time: '0 20 * * *', name: '20:00' }
    ];

    taskSchedules.forEach(({ time, name }) => {
      const job = cron.schedule(time, async () => {
        console.log(`${name} 任務提醒開始執行`);
        await this.dailyTaskSummary();
      }, {
        timezone: 'Asia/Taipei'
      });
      this.cronJobs.push(job);
    });

    // 每日凌晨 02:00 執行備份
    const backupJob = cron.schedule('0 2 * * *', async () => {
      console.log('02:00 每日備份開始執行');
      await this.performDailyBackup();
    }, {
      timezone: 'Asia/Taipei'
    });
    this.cronJobs.push(backupJob);

    console.log('排程服務已啟動 - 每日四次任務提醒 (06:30, 11:00, 15:00, 20:00) + 每日02:00備份 (Asia/Taipei)');
  }

  stop(): void {
    this.cronJobs.forEach(job => job.destroy());
    this.cronJobs = [];
  }

  private async dailyTaskSummary(): Promise<void> {
    try {
      // 獲取所有有待辦任務的群組
      const allPendingTasks = await storage.getTasksByStatus('pending');
      const groupIds: string[] = [];
      allPendingTasks.forEach(task => {
        if (!groupIds.includes(task.groupId)) {
          groupIds.push(task.groupId);
        }
      });
      
      if (groupIds.length === 0) {
        console.log('目前沒有任何群組有待辦任務，跳過任務整理');
        return;
      }

      await storage.insertAuditLog({
        id: crypto.randomUUID(),
        level: 'info',
        category: 'scheduler',
        message: '開始每日任務整理',
        details: { groupCount: groupIds.length, groupIds }
      });

      // 改為從昨天00:00到現在的時間範圍
      const now = new Date();
      const yesterday = new Date(now);
      yesterday.setDate(yesterday.getDate() - 1);
      yesterday.setHours(0, 0, 0, 0); // 昨天00:00
      
      const endDate = now; // 現在時間
      const startDate = yesterday; // 昨天00:00

      // 逐一處理每個群組
      for (const groupId of groupIds) {
        try {
          await this.processGroupDailySummaryWithSuggestions(groupId, startDate, endDate);
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

  private async processGroupDailySummaryWithSuggestions(groupId: string, startDate: Date, endDate: Date): Promise<void> {
    // 查詢該群組從昨天到現在建立的未完成任務
    const recentTasks = await storage.getTasksCreatedBetween(groupId, startDate, endDate, 'pending');
    
    if (recentTasks.length === 0) {
      console.log(`群組 ${groupId} 從昨天到現在沒有未完成任務`);
      return;
    }

    // 準備任務資料
    const taskData = recentTasks.map(task => ({
      serial: task.taskIdSerial,
      description: task.text,
      creator: task.authorDisplayName || task.authorUserId
    }));

    try {
      // 使用 LLM 整理任務
      const organizedTasks = await llmService.organizeTasksForDailySummary(taskData);
      
      // 使用 LLM 生成處理建議
      const suggestions = await llmService.generateTaskSuggestions(taskData);
      
      // 組合推送訊息
      const dateStr = formatDate(startDate);
      const currentTime = new Date().toLocaleString('zh-TW', { 
        timeZone: 'Asia/Taipei',
        hour12: false,
        hour: '2-digit',
        minute: '2-digit'
      });
      
      let message = `📌 近期交辦整理（${dateStr}）${currentTime}\n${organizedTasks}`;
      
      if (suggestions) {
        message += `\n\n💡 處理建議：${suggestions}`;
      }
      
      message += `\n—— 合計 ${recentTasks.length} 項（皆未完成）`;
      
      // 推送到群組
      await lineService.pushMessage(groupId, message);
      
      await storage.insertAuditLog({
        id: crypto.randomUUID(),
        level: 'info',
        category: 'scheduler',
        message: '群組任務提醒完成（含建議）',
        details: {
          groupId,
          taskCount: recentTasks.length,
          time: currentTime,
          hasSuggestions: !!suggestions,
          date: dateStr
        }
      });

    } catch (error: any) {
      console.error(`群組 ${groupId} 任務推送失敗:`, error);
      
      // 降級處理：直接推送原始任務列表
      const fallbackTasks = taskData.map(task => `${task.serial}. ${task.description}`).join('\n');
      const dateStr = formatDate(startDate);
      const currentTime = new Date().toLocaleString('zh-TW', { 
        timeZone: 'Asia/Taipei',
        hour12: false,
        hour: '2-digit',
        minute: '2-digit'
      });
      const fallbackMessage = `📌 近期交辦整理（${dateStr}）${currentTime}\n${fallbackTasks}\n—— 合計 ${recentTasks.length} 項（皆未完成）`;
      
      try {
        await lineService.pushMessage(groupId, fallbackMessage);
        
        await storage.insertAuditLog({
          id: crypto.randomUUID(),
          level: 'warning',
          category: 'scheduler',
          message: '群組任務提醒降級處理完成',
          details: {
            groupId,
            taskCount: recentTasks.length,
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

  /**
   * 執行每日備份
   */
  private async performDailyBackup(): Promise<void> {
    try {
      console.log('🗄️ 開始執行每日消息備份...');
      
      const success = await simpleBackupService.performDailyBackup();
      
      if (success) {
        console.log('✅ 每日備份成功完成');
        await storage.insertAuditLog({
          id: crypto.randomUUID(),
          level: 'info',
          category: 'backup',
          message: '每日備份成功完成',
          details: { 
            backupTime: new Date().toISOString(),
            scheduledBy: 'scheduler_service'
          }
        });
      } else {
        console.error('❌ 每日備份失敗');
        await storage.insertAuditLog({
          id: crypto.randomUUID(),
          level: 'error',
          category: 'backup',
          message: '每日備份失敗',
          details: { 
            backupTime: new Date().toISOString(),
            scheduledBy: 'scheduler_service'
          }
        });
      }
    } catch (error) {
      console.error('備份服務過程中發生錯誤:', error);
      await storage.insertAuditLog({
        id: crypto.randomUUID(),
        level: 'error',
        category: 'backup',
        message: '備份服務執行失敗',
        details: { 
          error: error instanceof Error ? error.message : 'Unknown error',
          backupTime: new Date().toISOString()
        }
      });
    }
  }
}

export const schedulerService = new SchedulerService();