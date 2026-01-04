import * as cron from 'node-cron';
import { storage } from "../storage";
import { lineService } from "./lineService";
import { taskService } from "./taskService";
import { llmService } from "./llmService";
import { simpleBackupService } from "./simpleBackupService";
import { waterQualityService } from "./waterQualityService";
import { windForecastService } from "./windForecastService";
import { weatherService } from "./weatherService";
import { getYesterday, formatDate, getOneMonthRange } from "../utils/time";
import crypto from 'crypto';

export class SchedulerService {
  private cronJobs: cron.ScheduledTask[] = [];

  start(): void {
    // 先清除既有的排程
    this.stop();

    // 六個時段的任務提醒：06:30, 09:00, 11:00, 15:00, 17:00, 20:00
    const taskSchedules = [
      { time: '30 6 * * *', name: '06:30' },
      { time: '0 9 * * *', name: '09:00' },
      { time: '0 11 * * *', name: '11:00' }, 
      { time: '0 15 * * *', name: '15:00' },
      { time: '0 17 * * *', name: '17:00' },
      { time: '0 20 * * *', name: '20:00' }
    ];

    taskSchedules.forEach(({ time, name }) => {
      const job = cron.schedule(time, async () => {
        console.log(`${name} 任務提醒時間點標記 - 等待群組互動觸發`);
        await this.markTaskReminderAvailable(name);
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

    // 每日 13:00 水質報告標記 - 等待群組互動觸發
    const morningWaterQualityReportJob = cron.schedule('0 13 * * *', async () => {
      console.log('13:00 水質報告時間點標記 - 等待群組互動觸發');
      await this.markWaterQualityReportAvailable('13:00');
    }, {
      timezone: 'Asia/Taipei'
    });
    this.cronJobs.push(morningWaterQualityReportJob);

    // 每日 17:30 水質報告標記 - 等待群組互動觸發
    const afternoonWaterQualityReportJob = cron.schedule('30 17 * * *', async () => {
      console.log('17:30 水質報告時間點標記 - 等待群組互動觸發');
      await this.markWaterQualityReportAvailable('17:30');
    }, {
      timezone: 'Asia/Taipei'
    });
    this.cronJobs.push(afternoonWaterQualityReportJob);

    // 每日 20:30 水質報告標記 - 等待群組互動觸發
    const eveningWaterQualityReportJob = cron.schedule('30 20 * * *', async () => {
      console.log('20:30 水質報告時間點標記 - 等待群組互動觸發');
      await this.markWaterQualityReportAvailable('20:30');
    }, {
      timezone: 'Asia/Taipei'
    });
    this.cronJobs.push(eveningWaterQualityReportJob);

    // 🤖 每日 21:00 執行 GPT 智能水質分析 (補充識別遺漏的記錄)
    const gptWaterQualityAnalysisJob = cron.schedule('0 21 * * *', async () => {
      console.log('21:00 GPT 智能水質分析開始執行');
      await this.performGPTWaterQualityAnalysis();
    }, {
      timezone: 'Asia/Taipei'
    });
    this.cronJobs.push(gptWaterQualityAnalysisJob);

    // 🌬️ 風力預報排程 - 每日 06:00, 12:00, 17:00, 21:30 (群組 C360be1fe6ea876a4df3ca0497bca4e3b)
    const windForecastSchedules = [
      { time: '0 6 * * *', name: '06:00 風力預報' },
      { time: '0 12 * * *', name: '12:00 風力預報' },
      { time: '0 17 * * *', name: '17:00 風力預報' },
      { time: '30 21 * * *', name: '21:30 風力預報' }
    ];

    windForecastSchedules.forEach(({ time, name }) => {
      const job = cron.schedule(time, async () => {
        console.log(`🌬️ ${name} 時間點標記 - 等待群組互動觸發`);
        await this.markWindForecastAvailable(name);
      }, {
        timezone: 'Asia/Taipei'
      });
      this.cronJobs.push(job);
    });

    // 🌤️ 竹科游泳池天氣預報排程 - 每日 06:00, 12:00, 17:00, 21:30 (群組 C50c2a9623a78cc5f5e9f39557e3abfe6)
    const swimmingPoolWeatherSchedules = [
      { time: '0 6 * * *', name: '06:00 天氣預報' },
      { time: '0 12 * * *', name: '12:00 天氣預報' },
      { time: '0 17 * * *', name: '17:00 天氣預報' },
      { time: '30 21 * * *', name: '21:30 天氣預報' }
    ];

    swimmingPoolWeatherSchedules.forEach(({ time, name }) => {
      const job = cron.schedule(time, async () => {
        console.log(`🌤️ ${name} 時間點標記 - 等待群組互動觸發`);
        await this.markSwimmingPoolWeatherAvailable(name);
      }, {
        timezone: 'Asia/Taipei'
      });
      this.cronJobs.push(job);
    });

    console.log('排程服務已啟動 - 每日六次任務提醒 (06:30, 09:00, 11:00, 15:00, 17:00, 20:00) + 每日02:00備份 + 每日13:00&17:30&20:30水質報告 + 每日21:00 GPT智能水質分析 + 每日06:00&12:00&17:00&21:30風力預報 + 每日06:00&12:00&17:00&21:30竹科天氣預報 (Asia/Taipei)');
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

    const { start: startDate, end: endDate } = getOneMonthRange();

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
      // 🔒 修復：只獲取有未完成任務的群組 (排除已完成任務)
      const allPendingTasks = await storage.getTasksByStatus('pending');
      const groupIds: string[] = [];
      allPendingTasks.forEach(task => {
        if (task.status === 'pending' && !groupIds.includes(task.groupId)) {
          groupIds.push(task.groupId);
        }
      });
      
      if (groupIds.length === 0) {
        console.log('✅ 所有任務均已完成，無需任務提醒');
        return;
      }

      await storage.insertAuditLog({
        id: crypto.randomUUID(),
        level: 'info',
        category: 'scheduler',
        message: '開始每日任務整理',
        details: { groupCount: groupIds.length, groupIds }
      });

      // 改為從一個月前到現在的時間範圍
      const { start: startDate, end: endDate } = getOneMonthRange();

      // 🔒 群組隔離處理：逐一處理每個群組，加入隨機抖動和延遲
      for (let i = 0; i < groupIds.length; i++) {
        const groupId = groupIds[i];
        
        try {
          // 先檢查群組是否有待處理任務，避免不必要的推送
          const pendingTasks = await storage.getTasksByGroupId(groupId, 'pending');
          if (pendingTasks.length === 0) {
            console.log(`⏭️ 群組 ${groupId.substring(0, 8)}... 沒有待處理任務，跳過推送`);
            continue;
          }
          
          console.log(`🔒 開始處理群組 ${groupId.substring(0, 8)}... 的專屬任務提醒 (${i + 1}/${groupIds.length})，待處理任務: ${pendingTasks.length}`);
          
          // 加入隨機抖動 (0-20 秒) 避免同時打爆 API
          const jitter = Math.floor(Math.random() * 20000); // 0-20秒
          if (jitter > 0) {
            console.log(`⏱️ 隨機延遲 ${jitter}ms 避免同時請求...`);
            await new Promise(resolve => setTimeout(resolve, jitter));
          }
          
          await this.processGroupDailySummaryWithSuggestions(groupId, startDate, endDate);
          console.log(`✅ 群組 ${groupId.substring(0, 8)}... 任務提醒完成`);
          
          // 群組間固定延遲 300-500ms
          if (i < groupIds.length - 1) {
            const baseDelay = 300 + Math.floor(Math.random() * 200); // 300-500ms
            console.log(`⏱️ 群組間延遲 ${baseDelay}ms...`);
            await new Promise(resolve => setTimeout(resolve, baseDelay));
          }
        } catch (error: any) {
          const statusCode = error?.statusCode || 0;
          console.error(`❌ 群組 ${groupId.substring(0, 8)}... 任務整理失敗 (${statusCode}):`, error.message);
          
          // 記錄詳細錯誤信息
          await storage.insertAuditLog({
            id: crypto.randomUUID(),
            level: 'error',
            category: 'scheduler',
            message: '群組任務推送失敗',
            details: { 
              groupId,
              statusCode,
              errorMessage: error.message,
              timestamp: new Date().toISOString(),
              retryAttempt: error.retryAttempt || 0
            }
          });
          
          // 如果是 API 限制錯誤，增加更長延遲
          if (statusCode === 429) {
            console.log(`⚠️ API 限制錯誤，延遲 60 秒後繼續...`);
            await new Promise(resolve => setTimeout(resolve, 60000));
          }
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
    // 查詢近一個月建立的未完成任務
    const monthlyTasks = await storage.getTasksCreatedBetween(groupId, startDate, endDate, 'pending');
    
    if (monthlyTasks.length === 0) {
      console.log(`群組 ${groupId} 近一個月沒有未完成任務`);
      return;
    }

    // 準備任務資料  
    const taskData = monthlyTasks.map(task => ({
      serial: task.taskIdSerial,
      description: task.text,
      creator: task.authorDisplayName || task.authorUserId
    }));

    try {
      // 使用 LLM 整理任務
      const organizedTasks = await llmService.organizeTasksForDailySummary(taskData);
      
      // 組合推送訊息
      const dateStr = formatDate(startDate);
      const message = `📌 近一個月交辦整理（${dateStr}）\n${organizedTasks}\n—— 合計 ${monthlyTasks.length} 項（皆未完成）`;
      
      // 推送到群組
      await lineService.pushMessage(groupId, message);
      
      await storage.insertAuditLog({
        id: crypto.randomUUID(),
        level: 'info',
        category: 'scheduler',
        message: '群組每日任務整理完成',
        details: {
          groupId,
          taskCount: monthlyTasks.length,
          date: dateStr
        }
      });

    } catch (error: any) {
      console.error(`群組 ${groupId} 任務推送失敗:`, error);
      
      // 降級處理：直接推送原始任務列表
      const fallbackTasks = taskData.map(task => `${task.serial}. ${task.description}`).join('\n');
      const dateStr = formatDate(startDate);
      const fallbackMessage = `📌 近一個月交辦整理（${dateStr}）\n${fallbackTasks}\n—— 合計 ${monthlyTasks.length} 項（皆未完成）\n\n✅ 如果交辦已完成\n記得輸入 交辦XX完成\n\n💪 專注當下，每個小步驟都是進步的開始`;
      
      try {
        await lineService.pushMessage(groupId, fallbackMessage);
        
        await storage.insertAuditLog({
          id: crypto.randomUUID(),
          level: 'warning',
          category: 'scheduler',
          message: '群組任務整理降級處理完成',
          details: {
            groupId,
            taskCount: monthlyTasks.length,
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
      console.log(`📝 群組 ${groupId.substring(0, 8)}... 近一個月內沒有未完成任務`);
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
      
      // 使用 LLM 生成每日勵志語
      const motivationalQuote = await llmService.generateDailyMotivationalQuote();
      
      // 組合推送訊息
      const dateStr = formatDate(startDate);
      const currentTime = new Date().toLocaleString('zh-TW', { 
        timeZone: 'Asia/Taipei',
        hour12: false,
        hour: '2-digit',
        minute: '2-digit'
      });
      
      let message = `🔔 系統提醒\n📌 近一個月交辦整理（${dateStr}）${currentTime}\n\n${organizedTasks}`;
      
      if (suggestions) {
        message += `\n\n💡 處理建議：${suggestions}`;
      }
      
      message += `\n\n—— 合計 ${recentTasks.length} 項（皆未完成）`;
      message += `\n\n✅ 如果交辦已完成\n記得輸入 交辦XX完成`;
      
      if (motivationalQuote) {
        message += `\n\n💪 ${motivationalQuote}`;
      }
      
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
   * 🤖 執行 GPT 智能水質分析
   */
  private async performGPTWaterQualityAnalysis(): Promise<void> {
    try {
      console.log('🤖 開始執行 GPT 智能水質分析...');
      
      // 支援的水質監測群組
      const waterQualityGroups = ['C50c2a9623a78cc5f5e9f39557e3abfe6', 'C9b3c5dfe2e005adafd2ed914714a1930'];
      
      for (const groupId of waterQualityGroups) {
        try {
          console.log(`🔍 分析群組 ${groupId.substring(0, 8)}... 的水質對話`);
          await waterQualityService.processWaterQualityWithGPT(groupId);
          
          // 群組間延遲避免過載
          await new Promise(resolve => setTimeout(resolve, 2000));
          
        } catch (error) {
          console.error(`❌ 群組 ${groupId} GPT 水質分析失敗:`, error);
          
          await storage.insertAuditLog({
            id: crypto.randomUUID(),
            level: 'error',
            category: 'gpt_water_quality',
            message: 'GPT 水質分析失敗',
            details: { 
              groupId,
              error: (error as Error).message,
              scheduledBy: 'scheduler_service'
            }
          });
        }
      }
      
      console.log('✅ GPT 智能水質分析完成');
      
      await storage.insertAuditLog({
        id: crypto.randomUUID(),
        level: 'info',
        category: 'gpt_water_quality',
        message: 'GPT 智能水質分析完成',
        details: { 
          analysisTime: new Date().toISOString(),
          groupsProcessed: waterQualityGroups.length,
          scheduledBy: 'scheduler_service'
        }
      });
      
    } catch (error) {
      console.error('❌ GPT 水質分析總體處理失敗:', error);
      
      await storage.insertAuditLog({
        id: crypto.randomUUID(),
        level: 'error',
        category: 'gpt_water_quality',
        message: 'GPT 水質分析總體失敗',
        details: { 
          error: error instanceof Error ? error.message : 'Unknown error',
          analysisTime: new Date().toISOString()
        }
      });
    }
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

  // 標記任務提醒可用時間點
  private async markTaskReminderAvailable(timeSlot: string): Promise<void> {
    const today = new Date().toLocaleDateString('zh-TW', { timeZone: 'Asia/Taipei' });
    
    await storage.insertAuditLog({
      id: crypto.randomUUID(),
      level: 'info',
      category: 'pending_task_reminder',
      message: `任務提醒 ${timeSlot} 已標記為可觸發`,
      details: {
        timeSlot,
        date: today,
        status: 'awaiting_trigger',
        type: 'task_reminder'
      }
    });
  }

  // 標記水質報告可用時間點
  private async markWaterQualityReportAvailable(timeSlot: string): Promise<void> {
    const today = new Date().toLocaleDateString('zh-TW', { timeZone: 'Asia/Taipei' });
    
    await storage.insertAuditLog({
      id: crypto.randomUUID(),
      level: 'info',
      category: 'pending_water_quality',
      message: `水質報告 ${timeSlot} 已標記為可觸發`,
      details: {
        timeSlot,
        date: today,
        status: 'awaiting_trigger',
        type: 'water_quality_report'
      }
    });
  }

  // 標記風力預報可用時間點
  private async markWindForecastAvailable(timeSlot: string): Promise<void> {
    const today = new Date().toLocaleDateString('zh-TW', { timeZone: 'Asia/Taipei' });
    
    await storage.insertAuditLog({
      id: crypto.randomUUID(),
      level: 'info',
      category: 'pending_wind_forecast',
      message: `風力預報 ${timeSlot} 已標記為可觸發`,
      details: {
        timeSlot,
        date: today,
        status: 'awaiting_trigger',
        type: 'wind_forecast'
      }
    });
  }

  // 標記竹科游泳池天氣預報可用時間點
  private async markSwimmingPoolWeatherAvailable(timeSlot: string): Promise<void> {
    const today = new Date().toLocaleDateString('zh-TW', { timeZone: 'Asia/Taipei' });
    
    await storage.insertAuditLog({
      id: crypto.randomUUID(),
      level: 'info',
      category: 'pending_swimming_pool_weather',
      message: `竹科天氣預報 ${timeSlot} 已標記為可觸發`,
      details: {
        timeSlot,
        date: today,
        status: 'awaiting_trigger',
        type: 'swimming_pool_weather',
        targetGroupId: 'C50c2a9623a78cc5f5e9f39557e3abfe6'
      }
    });
  }
}

export const schedulerService = new SchedulerService();