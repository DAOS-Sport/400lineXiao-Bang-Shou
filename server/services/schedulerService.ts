import * as cron from 'node-cron';
import { storage } from "../storage";
import { lineService } from "./lineService";
import { taskService } from "./taskService";
import { llmService } from "./llmService";
import { simpleBackupService } from "./simpleBackupService";
import { waterQualityService } from "./waterQualityService";
import { getYesterday, formatDate } from "../utils/time";

export class SchedulerService {
  private cronJobs: cron.ScheduledTask[] = [];

  start(): void {
    // 先清除既有的排程
    this.stop();

    // 五個時段的任務提醒：06:30, 08:00, 11:00, 15:00, 20:00
    const taskSchedules = [
      { time: '30 6 * * *', name: '06:30' },
      { time: '0 8 * * *', name: '08:00' },
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

    // 每日 13:00 發送水質報告 (收集 00:00-12:50 數據)
    const morningWaterQualityReportJob = cron.schedule('0 13 * * *', async () => {
      console.log('13:00 水質報告開始執行 (00:00-12:50 數據)');
      await waterQualityService.sendDailyWaterQualityReport();
    }, {
      timezone: 'Asia/Taipei'
    });
    this.cronJobs.push(morningWaterQualityReportJob);

    // 每日 17:30 發送水質報告 (收集 00:00-17:20 數據)
    const afternoonWaterQualityReportJob = cron.schedule('30 17 * * *', async () => {
      console.log('17:30 水質報告開始執行 (00:00-17:20 數據)');
      await waterQualityService.sendDailyWaterQualityReport();
    }, {
      timezone: 'Asia/Taipei'
    });
    this.cronJobs.push(afternoonWaterQualityReportJob);

    // 每日 20:30 發送水質報告 (收集 00:00-20:20 數據)
    const eveningWaterQualityReportJob = cron.schedule('30 20 * * *', async () => {
      console.log('20:30 水質報告開始執行 (00:00-20:20 數據)');
      await waterQualityService.sendDailyWaterQualityReport();
    }, {
      timezone: 'Asia/Taipei'
    });
    this.cronJobs.push(eveningWaterQualityReportJob);

    console.log('排程服務已啟動 - 每日五次任務提醒 (06:30, 08:00, 11:00, 15:00, 20:00) + 每日02:00備份 + 每日13:00&17:30&20:30水質報告 (Asia/Taipei)');
  }

  stop(): void {
    this.cronJobs.forEach(job => job.destroy());
    this.cronJobs = [];
  }

  // 手動觸發任務推送
  async manualTriggerTaskSummary(): Promise<void> {
    console.log('🔧 手動觸發任務推送開始');
    await this.dailyTaskSummary();
    console.log('🔧 手動觸發任務推送完成');
  }

  // 手動補發特定群組的任務推送
  async manualPushToRemainingGroups(): Promise<void> {
    console.log('📤 開始補發剩餘群組的 11 點任務提醒');
    
    // 指定需要補發的群組（排除已推送的駿斯小幫手群組）
    const groupsToNotify = [
      'C2dd9a5fce7c276f2cbfdd02c2342661c', // 三民排班群組
      'C66a4b3bb3fbc3dcf52d42626ec512484', // 其他群組
      'C2dc6991e51074dd47d5d275d568318f7', // 未知群組
      'Ce936c6bebb59b8b5683ffbcf97bf20de'  // 原授權群組
    ];

    const now = new Date();
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(0, 0, 0, 0);
    
    const endDate = now;
    const startDate = yesterday;

    for (let i = 0; i < groupsToNotify.length; i++) {
      const groupId = groupsToNotify[i];
      try {
        console.log(`📋 補發群組 ${groupId.substring(0, 8)}... 的任務提醒 (${i + 1}/${groupsToNotify.length})`);
        
        // 檢查該群組是否有未完成任務
        const tasks = await storage.getTasksCreatedBetween(groupId, startDate, endDate, 'pending');
        if (tasks.length === 0) {
          console.log(`📝 群組 ${groupId.substring(0, 8)}... 沒有未完成任務，跳過`);
          continue;
        }

        await this.processGroupDailySummaryWithSuggestions(groupId, startDate, endDate);
        console.log(`✅ 群組 ${groupId.substring(0, 8)}... 補發完成`);
        
        // 群組間延遲 10 秒避免 API 限制
        if (i < groupsToNotify.length - 1) {
          console.log(`⏱️ 等待 10 秒避免 API 限制...`);
          await new Promise(resolve => setTimeout(resolve, 10000));
        }
        
      } catch (error: any) {
        console.error(`❌ 群組 ${groupId} 補發失敗:`, error);
        if (error.statusCode === 429) {
          console.log(`⚠️ API 限制錯誤，延遲 30 秒後繼續...`);
          await new Promise(resolve => setTimeout(resolve, 30000));
        }
      }
    }
    
    console.log('📤 補發任務完成');
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

      // 🔒 群組隔離處理：逐一處理每個群組，加入延遲避免 API 限制
      for (let i = 0; i < groupIds.length; i++) {
        const groupId = groupIds[i];
        try {
          console.log(`🔒 開始處理群組 ${groupId} 的專屬任務提醒 (${i + 1}/${groupIds.length})`);
          await this.processGroupDailySummaryWithSuggestions(groupId, startDate, endDate);
          console.log(`✅ 群組 ${groupId} 任務提醒完成`);
          
          // 🕐 避免 LINE API 頻率限制：群組間延遲 1000ms（加強）
          if (i < groupIds.length - 1) {
            console.log(`⏱️ 等待 1000ms 避免 API 限制...`);
            await new Promise(resolve => setTimeout(resolve, 1000));
          }
        } catch (error: any) {
          console.error(`❌ 群組 ${groupId} 任務整理失敗:`, error);
          // 如果是 API 限制錯誤，增加更長延遲並記錄失敗
          if (error.statusCode === 429) {
            console.log(`⚠️ API 限制錯誤，延遲 60 秒後繼續...`);
            await new Promise(resolve => setTimeout(resolve, 60000));
          }
          
          // 記錄推送失敗到 audit log
          await storage.insertAuditLog({
            id: crypto.randomUUID(),
            level: 'error',
            category: 'scheduler',
            message: '群組任務推送完全失敗',
            details: { 
              groupId, 
              originalError: error.message,
              fallbackError: error.message
            }
          });
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
    // 🔒 嚴格群組隔離：只查詢該群組的未完成任務
    console.log(`🔍 正在查詢群組 ${groupId.substring(0, 8)}... 的專屬任務`);
    const recentTasks = await storage.getTasksCreatedBetween(groupId, startDate, endDate, 'pending');
    
    if (recentTasks.length === 0) {
      console.log(`📝 群組 ${groupId.substring(0, 8)}... 從昨天到現在沒有未完成任務`);
      return;
    }

    console.log(`📋 群組 ${groupId.substring(0, 8)}... 找到 ${recentTasks.length} 個未完成任務`);

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
      
      let message = `🔔 系統提醒\n📌 近期交辦整理（${dateStr}）${currentTime}\n\n${organizedTasks}`;
      
      if (suggestions) {
        message += `\n\n💡 處理建議：${suggestions}`;
      }
      
      message += `\n\n—— 合計 ${recentTasks.length} 項（皆未完成）`;
      
      // 🔒 自動推播：直接推送到群組
      console.log(`📤 正在自動推播任務提醒到群組 ${groupId.substring(0, 8)}...`);
      await lineService.pushMessage(groupId, message);
      console.log(`✅ 群組 ${groupId.substring(0, 8)}... 任務提醒推播成功`);
      
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
      const fallbackMessage = `🔔 系統提醒\n📌 近期交辦整理（${dateStr}）${currentTime}\n\n${fallbackTasks}\n\n—— 合計 ${recentTasks.length} 項（皆未完成）`;
      
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