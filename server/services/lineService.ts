import { Client, middleware } from '@line/bot-sdk';
import { storage } from '../storage';
import crypto from 'crypto';

const config = {
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN || '',
  channelSecret: process.env.CHANNEL_SECRET || '',
};

// 開發模式下允許沒有憑證
const isDevMode = process.env.NODE_ENV === 'development';
if (!config.channelAccessToken || !config.channelSecret) {
  if (isDevMode) {
    console.warn('LINE 憑證未設定，部分功能將無法使用（開發模式）');
  } else {
    throw new Error('CHANNEL_ACCESS_TOKEN 和 CHANNEL_SECRET 必須設定');
  }
}

const client = config.channelAccessToken && config.channelSecret 
  ? new Client(config) 
  : null;

export class LineService {
  async replyMessage(replyToken: string, text: string): Promise<void> {
    if (!client) {
      console.warn('LINE client 未初始化，無法發送回覆');
      return;
    }
    
    try {
      await client.replyMessage(replyToken, {
        type: 'text',
        text: text
      });
    } catch (error) {
      console.error('LINE 回覆訊息失敗:', error);
      throw error;
    }
  }

  async replyVideoMessage(replyToken: string, videoUrl: string, previewImageUrl: string): Promise<void> {
    if (!client) {
      console.warn('LINE client 未初始化，無法發送影片回覆');
      return;
    }
    
    try {
      await client.replyMessage(replyToken, {
        type: 'video',
        originalContentUrl: videoUrl,
        previewImageUrl: previewImageUrl
      });
      console.log('✅ 影片訊息回覆成功');
    } catch (error) {
      console.error('❌ LINE 影片回覆訊息失敗:', error);
      throw error;
    }
  }

  async replyImageMessage(replyToken: string, imageUrl: string, previewImageUrl?: string): Promise<void> {
    if (!client) {
      console.warn('LINE client 未初始化，無法發送圖片回覆');
      return;
    }
    
    try {
      await client.replyMessage(replyToken, {
        type: 'image',
        originalContentUrl: imageUrl,
        previewImageUrl: previewImageUrl || imageUrl
      });
      console.log('✅ 圖片訊息回覆成功');
    } catch (error) {
      console.error('❌ LINE 圖片回覆訊息失敗:', error);
      throw error;
    }
  }

  // 呼叫 LINE loading API
  async startLoading(userId: string, seconds: number = 8): Promise<void> {
    const channelAccessToken = process.env.CHANNEL_ACCESS_TOKEN;
    if (!channelAccessToken) {
      console.warn('CHANNEL_ACCESS_TOKEN 未設定，無法啟動 loading');
      return;
    }

    try {
      const loadingSeconds = Math.max(5, Math.min(seconds, 60)); // 介於 5~60 秒
      
      const response = await fetch("https://api.line.me/v2/bot/chat/loading/start", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${channelAccessToken}`,
        },
        body: JSON.stringify({
          chatId: userId,
          loadingSeconds: loadingSeconds,
        }),
      });

      if (response.ok) {
        console.log(`✅ LINE loading API 啟動成功 (${loadingSeconds}秒)`);
      } else {
        const errorText = await response.text();
        console.error(`❌ LINE loading API 失敗 (${response.status}):`, errorText);
      }
    } catch (error) {
      console.error('❌ LINE loading API 呼叫失敗:', error);
    }
  }

  async pushMessage(to: string, text: string, options: { maxRetries?: number } = {}): Promise<void> {
    if (!client) {
      console.warn('LINE client 未初始化，無法推送訊息');
      return;
    }
    
    const { maxRetries = 3 } = options;
    let attempt = 0;
    
    while (attempt < maxRetries) {
      try {
        // LINE API 支援推送到群組 ID (C開頭) 和用戶 ID (U開頭)
        await client.pushMessage(to, {
          type: 'text',
          text: text
        });
        
        if (to.startsWith('C')) {
          console.log(`✅ 成功推送訊息到群組 ${to.substring(0, 8)}...`);
        } else {
          console.log(`✅ 成功推送訊息到用戶 ${to.substring(0, 8)}...`);
        }
        return;
        
      } catch (error: any) {
        attempt++;
        const status = error?.statusCode || 0;
        const response = error?.originalError?.response;
        const headers = response?.headers || {};
        const responseData = response?.data || {};
        
        // 提取 Rate Limit 相關 headers
        const rateLimitLimit = headers['x-ratelimit-limit'] || headers['x-line-ratelimit-limit'] || 'unknown';
        const rateLimitRemaining = headers['x-ratelimit-remaining'] || headers['x-line-ratelimit-remaining'] || 'unknown';
        const rateLimitReset = headers['x-ratelimit-reset'] || headers['x-line-ratelimit-reset'] || 'unknown';
        const retryAfter = Number(headers['retry-after']) || 0;
        
        // 完整的錯誤詳情
        const errorDetails = {
          targetId: to,
          statusCode: status,
          errorMessage: error.message,
          retryAttempt: attempt,
          maxRetries: maxRetries,
          responseBody: responseData,
          rateLimitHeaders: {
            limit: rateLimitLimit,
            remaining: rateLimitRemaining,
            reset: rateLimitReset,
            retryAfter: retryAfter
          },
          timestamp: new Date().toISOString()
        };
        
        console.log(`📊 LINE API 詳細錯誤 (嘗試 ${attempt}/${maxRetries}):`, {
          statusCode: status,
          rateLimitLimit,
          rateLimitRemaining,
          rateLimitReset,
          retryAfter,
          responseBody: responseData
        });
        
        // 403/404 錯誤視為永久失敗，不重試
        if (status === 403 || status === 404) {
          console.error(`❌ 永久失敗 (${status}): Bot 不在群組中或 ID 錯誤 - ${to.substring(0, 8)}...`);
          
          // 記錄永久失敗到 audit logs
          await storage.insertAuditLog({
            id: crypto.randomUUID(),
            level: 'error',
            category: 'line_api',
            message: 'LINE 推送永久失敗',
            details: {
              ...errorDetails,
              reason: status === 403 ? 'Bot 被踢出群組或權限不足' : 'ID 不存在或無效'
            }
          });
          
          // 設置 retryAttempt 屬性供上層記錄
          error.retryAttempt = attempt;
          throw error;
        }
        
        // 429 (Too Many Requests) 或 5xx 錯誤時重試
        if ((status === 429 || (status >= 500 && status < 600)) && attempt < maxRetries) {
          // 記錄重試詳情
          await storage.insertAuditLog({
            id: crypto.randomUUID(),
            level: 'warn',
            category: 'line_api',
            message: `LINE 推送重試 ${attempt}/${maxRetries}`,
            details: errorDetails
          });
          
          // 指數退避策略，尊重 Retry-After header
          const baseBackoff = status === 429 ? 2000 : 1000; // 429 錯誤基礎延遲 2 秒
          const exponentialBackoff = baseBackoff * Math.pow(2, attempt - 1);
          const wait = Math.max(exponentialBackoff, retryAfter * 1000);
          
          console.log(`⏳ API 限制 (${status})，等待 ${wait}ms 後重試 (嘗試 ${attempt}/${maxRetries})`);
          console.log(`   Rate Limit: ${rateLimitRemaining}/${rateLimitLimit}, Reset: ${rateLimitReset}, Retry-After: ${retryAfter}s`);
          
          await new Promise(resolve => setTimeout(resolve, wait));
          continue;
        }
        
        // 其他錯誤或重試次數用盡
        console.error(`❌ LINE 推送失敗 (${status})，已重試 ${attempt} 次:`, error.message);
        
        // 記錄最終失敗到 audit logs
        await storage.insertAuditLog({
          id: crypto.randomUUID(),
          level: 'error',
          category: 'line_api',
          message: 'LINE 推送最終失敗',
          details: errorDetails
        });
        
        // 設置 retryAttempt 屬性供上層記錄
        error.retryAttempt = attempt;
        throw error;
      }
    }
  }

  async pushVideoMessage(to: string, videoUrl: string, previewImageUrl: string, options: { maxRetries?: number } = {}): Promise<void> {
    if (!client) {
      console.warn('LINE client 未初始化，無法推送影片');
      return;
    }
    
    const { maxRetries = 3 } = options;
    let attempt = 0;
    
    while (attempt < maxRetries) {
      try {
        // LINE API 支援推送影片到群組 ID (C開頭) 和用戶 ID (U開頭)
        await client.pushMessage(to, {
          type: 'video',
          originalContentUrl: videoUrl,
          previewImageUrl: previewImageUrl
        });
        
        if (to.startsWith('C')) {
          console.log(`✅ 成功推送影片到群組 ${to.substring(0, 8)}...`);
        } else {
          console.log(`✅ 成功推送影片到用戶 ${to.substring(0, 8)}...`);
        }
        return;
        
      } catch (error: any) {
        attempt++;
        console.error(`❌ 推送影片失敗 (嘗試 ${attempt}/${maxRetries}):`, error);
        
        if (attempt >= maxRetries) {
          throw error;
        }
        
        // 簡單重試策略，1秒後重試
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
  }

  // 發送訊息到群組的替代方案
  async sendToGroup(groupId: string, text: string, reportType: string = 'general'): Promise<void> {
    console.log('🔍 準備群組訊息:', groupId);
    console.log('📝 訊息內容:', text.substring(0, 50) + '...');
    
    try {
      // 判斷報告類型
      let messageType = 'general';
      let message = '報告等待發送到群組';
      
      if (text.includes('🏌️') || text.includes('風力預報')) {
        messageType = 'wind_forecast';
        message = '風力預報等待發送到群組';
      } else if (text.includes('💧') || text.includes('水質')) {
        messageType = 'water_quality';
        message = '水質報告等待發送到群組';
      } else if (text.includes('📋') || text.includes('任務')) {
        messageType = 'task_summary';
        message = '任務提醒等待發送到群組';
      }
      
      // 方案：將報告存儲為待發送訊息，並在下次群組互動時發送
      await storage.insertAuditLog({
        id: crypto.randomUUID(),
        level: 'info',
        category: 'pending_group_message',
        message: message,
        details: {
          groupId,
          messageContent: text,
          timestamp: new Date().toISOString(),
          reportType: messageType,
          status: 'pending'
        }
      });
      
      console.log(`📊 ${messageType === 'wind_forecast' ? '風力預報' : messageType === 'water_quality' ? '水質報告' : '訊息'}已準備完成，等待群組互動時發送`);
      
      // 嘗試立即發送（如果有最近的群組訊息可以回覆）
      await this.tryImmediateSend(groupId, text, messageType);
      
    } catch (error) {
      console.error('準備群組訊息失敗:', error);
    }
  }

  // 嘗試立即發送到群組的方法
  private async tryImmediateSend(groupId: string, text: string, messageType: string = 'general'): Promise<void> {
    try {
      // 檢查是否有最近的群組訊息可以用來回覆
      const recentMessages = await storage.getRecentMessages(groupId, 1);
      
      if (recentMessages.length > 0) {
        const lastMessage = recentMessages[0];
        // 檢查訊息是否在過去 5 分鐘內
        const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
        
        if (new Date(lastMessage.timestamp) > fiveMinutesAgo) {
          console.log('🎯 找到最近的訊息，嘗試直接推送到群組');
          await this.pushMessage(groupId, text);
          
          // 標記為已發送 - 根據訊息類型調整描述
          const messageDescription = messageType === 'wind_forecast' ? '風力預報' : 
                                   messageType === 'water_quality' ? '水質報告' : 
                                   messageType === 'task_summary' ? '任務提醒' : '訊息';
          
          await storage.insertAuditLog({
            id: crypto.randomUUID(),
            level: 'info',
            category: 'group_message_sent',
            message: `${messageDescription}已成功發送到群組`,
            details: { groupId, method: 'push', messageType, timestamp: new Date().toISOString() }
          });
          
          console.log(`✅ ${messageDescription}已通過推送方式發送到群組`);
          return;
        }
      }
      
      console.log('⏳ 無法立即發送，將在下次群組互動時發送');
      
    } catch (error) {
      console.log('⏳ 立即發送失敗，將在下次群組互動時發送');
    }
  }

  // 檢查並發送待發送的群組訊息 - 回覆觸發模式
  async checkAndSendPendingMessages(groupId: string, replyToken: string): Promise<void> {
    try {
      console.log(`🔎 檢查群組 ${groupId.substring(0, 8)}... 是否有待回覆的內容`);
      
      const today = new Date().toLocaleDateString('zh-TW', { timeZone: 'Asia/Taipei' });
      const now = new Date();
      
      // 檢查是否有待觸發的任務提醒
      const pendingTaskReminder = await this.checkAndTriggerTaskReminder(groupId, replyToken, today, now);
      if (pendingTaskReminder) return;
      
      // 檢查是否有待觸發的水質報告
      const pendingWaterQuality = await this.checkAndTriggerWaterQualityReport(groupId, replyToken, today);
      if (pendingWaterQuality) return;
      
      // 檢查是否有待觸發的風力預報
      const pendingWindForecast = await this.checkAndTriggerWindForecast(groupId, replyToken, today);
      if (pendingWindForecast) return;
      
      // 檢查是否有待觸發的竹科天氣預報
      const pendingSwimmingPoolWeather = await this.checkAndTriggerSwimmingPoolWeather(groupId, replyToken, today);
      if (pendingSwimmingPoolWeather) return;
      
      console.log(`📭 群組 ${groupId.substring(0, 8)}... 目前沒有待觸發的內容`);
      
    } catch (error) {
      console.error(`❌ 檢查待發送訊息失敗 (群組 ${groupId}):`, error);
    }
  }

  async getGroupSummary(groupId: string): Promise<any> {
    if (!client) {
      console.warn('LINE client 未初始化，無法獲取群組資訊');
      return null;
    }
    
    try {
      return await client.getGroupSummary(groupId);
    } catch (error) {
      console.error('獲取群組資訊失敗:', error);
      return null;
    }
  }

  async getProfile(userId: string): Promise<any> {
    if (!client) {
      console.warn('LINE client 未初始化，無法獲取用戶資訊');
      return null;
    }
    
    try {
      return await client.getProfile(userId);
    } catch (error) {
      console.error('獲取用戶資訊失敗:', error);
      return null;
    }
  }

  // 檢查並觸發任務提醒
  private async checkAndTriggerTaskReminder(groupId: string, replyToken: string, today: string, now: Date): Promise<boolean> {
    try {
      // 檢查是否有待觸發的任務提醒
      const currentTime = now.toLocaleTimeString('zh-TW', { 
        timeZone: 'Asia/Taipei', 
        hour: '2-digit', 
        minute: '2-digit',
        hour12: false 
      });
      
      // 檢查是否有待觸發的任務提醒
      const pendingLogs = await storage.getAuditLogsByCategory('pending_task_reminder');
      const todayPending = pendingLogs.filter(log => 
        log.details && 
        typeof log.details === 'object' &&
        'date' in log.details && 
        'status' in log.details &&
        log.details.date === today &&
        log.details.status === 'awaiting_trigger'
      );

      // 檢查是否已經發送過
      const sentLogs = await storage.getAuditLogsByCategory('task_reminder_sent');
      const todaySent = sentLogs.filter(log => 
        log.details && 
        typeof log.details === 'object' &&
        'date' in log.details &&
        log.details.date === today
      );

      // 如果有待觸發且尚未發送的時段
      const availableTimeSlots = todayPending.filter(pending => {
        const timeSlot = pending.details && typeof pending.details === 'object' && 'timeSlot' in pending.details ? pending.details.timeSlot : '';
        return !todaySent.some(sent => 
          sent.details && typeof sent.details === 'object' && 'timeSlot' in sent.details && sent.details.timeSlot === timeSlot
        );
      });
      
      if (availableTimeSlots.length > 0) {
        console.log(`⏰ 找到 ${availableTimeSlots.length} 個待觸發的任務提醒`);
        
        // 找最近的時間點
        const latestLog = availableTimeSlots[availableTimeSlots.length - 1];
        const timeSlot = latestLog.details && typeof latestLog.details === 'object' && 'timeSlot' in latestLog.details ? latestLog.details.timeSlot : '';
        
        // 生成任務提醒內容
        const summaryText = await this.generateTaskSummary(groupId);
        
        await this.replyMessage(replyToken, `⏰ ${timeSlot} 任務提醒\n${summaryText}`);
        
        // 標記為已發送
        await storage.insertAuditLog({
          id: crypto.randomUUID(),
          level: 'info',
          category: 'task_reminder_sent',
          message: `任務提醒已回覆發送 (${timeSlot})`,
          details: {
            groupId,
            timeSlot,
            date: today,
            method: 'reply_trigger'
          }
        });
        
        // 清除待觸發標記
        await this.clearPendingTriggers('pending_task_reminder', today);
        
        console.log(`✅ 任務提醒已通過回覆觸發發送 (${timeSlot})`);
        return true;
      }
      
    } catch (error) {
      console.error('檢查任務提醒觸發失敗:', error);
    }
    return false;
  }

  // 檢查並觸發水質報告
  private async checkAndTriggerWaterQualityReport(groupId: string, replyToken: string, today: string): Promise<boolean> {
    try {
      // 只有水質監測群組才觸發
      const waterQualityGroups = ['C50c2a9623a78cc5f5e9f39557e3abfe6', 'C9b3c5dfe2e005adafd2ed914714a1930'];
      if (!waterQualityGroups.includes(groupId)) {
        return false;
      }
      
      const pendingLogs = await storage.getAuditLogsByCategory('pending_water_quality');
      const todayPending = pendingLogs.filter(log => 
        log.details && 
        typeof log.details === 'object' &&
        'date' in log.details && 
        'status' in log.details &&
        log.details.date === today &&
        log.details.status === 'awaiting_trigger'
      );

      // 檢查是否已經發送過
      const sentLogs = await storage.getAuditLogsByCategory('water_quality_sent');
      const todaySent = sentLogs.filter(log => 
        log.details && 
        typeof log.details === 'object' &&
        'date' in log.details &&
        log.details.date === today &&
        log.details.groupId === groupId
      );

      // 如果有待觸發且尚未發送的時段
      const availableTimeSlots = todayPending.filter(pending => {
        const timeSlot = pending.details && typeof pending.details === 'object' && 'timeSlot' in pending.details ? pending.details.timeSlot : '';
        return !todaySent.some(sent => 
          sent.details && typeof sent.details === 'object' && 'timeSlot' in sent.details && sent.details.timeSlot === timeSlot
        );
      });
      
      if (availableTimeSlots.length > 0) {
        console.log(`💧 找到 ${availableTimeSlots.length} 個待觸發的水質報告`);
        
        const latestLog = availableTimeSlots[availableTimeSlots.length - 1];
        const timeSlot = latestLog.details && typeof latestLog.details === 'object' && 'timeSlot' in latestLog.details ? latestLog.details.timeSlot : '';
        
        // 使用 waterQualityService 生成報告
        const { waterQualityService } = await import('./waterQualityService');
        const reportText = await waterQualityService.generateWaterQualityReport(groupId);
        
        await this.replyMessage(replyToken, `💧 ${timeSlot} 水質檢測報告\n${reportText}`);
        
        // 標記為已發送
        await storage.insertAuditLog({
          id: crypto.randomUUID(),
          level: 'info',
          category: 'water_quality_sent',
          message: `水質報告已回覆發送 (${timeSlot})`,
          details: {
            groupId,
            timeSlot,
            date: today,
            method: 'reply_trigger'
          }
        });
        
        // 清除待觸發標記
        await this.clearPendingTriggers('pending_water_quality', today);
        
        console.log(`✅ 水質報告已通過回覆觸發發送 (${timeSlot})`);
        return true;
      }
      
    } catch (error) {
      console.error('檢查水質報告觸發失敗:', error);
    }
    return false;
  }

  // 檢查並觸發竹科游泳池天氣預報
  private async checkAndTriggerSwimmingPoolWeather(groupId: string, replyToken: string, today: string): Promise<boolean> {
    try {
      // 只有竹科游泳池群組才觸發
      const swimmingPoolGroup = 'C50c2a9623a78cc5f5e9f39557e3abfe6';
      if (groupId !== swimmingPoolGroup) {
        return false;
      }
      
      const pendingLogs = await storage.getAuditLogsByCategory('pending_swimming_pool_weather');
      const todayPending = pendingLogs.filter(log => 
        log.details && 
        typeof log.details === 'object' &&
        'date' in log.details && 
        'status' in log.details &&
        log.details.date === today &&
        log.details.status === 'awaiting_trigger'
      );

      // 檢查是否已經發送過
      const sentLogs = await storage.getAuditLogsByCategory('swimming_pool_weather_sent');
      const todaySent = sentLogs.filter(log => 
        log.details && 
        typeof log.details === 'object' &&
        'date' in log.details &&
        log.details.date === today &&
        log.details.groupId === groupId
      );

      // 如果有待觸發且尚未發送的時段
      const availableTimeSlots = todayPending.filter(pending => {
        const timeSlot = pending.details && typeof pending.details === 'object' && 'timeSlot' in pending.details ? pending.details.timeSlot : '';
        return !todaySent.some(sent => 
          sent.details && typeof sent.details === 'object' && 'timeSlot' in sent.details && sent.details.timeSlot === timeSlot
        );
      });
      
      if (availableTimeSlots.length > 0) {
        console.log(`🌤️ 找到 ${availableTimeSlots.length} 個待觸發的竹科天氣預報`);
        
        const latestLog = availableTimeSlots[availableTimeSlots.length - 1];
        const timeSlot = latestLog.details && typeof latestLog.details === 'object' && 'timeSlot' in latestLog.details ? latestLog.details.timeSlot : '';
        
        // 使用 weatherService 生成預報
        const { weatherService } = await import('./weatherService');
        const forecasts = await weatherService.getHsinchuWeatherForecast();
        const forecastText = await weatherService.formatDetailedSwimmingPoolForecast(forecasts);
        
        await this.replyMessage(replyToken, forecastText);
        
        // 標記為已發送
        await storage.insertAuditLog({
          id: crypto.randomUUID(),
          level: 'info',
          category: 'swimming_pool_weather_sent',
          message: `竹科天氣預報已回覆發送 (${timeSlot})`,
          details: {
            groupId,
            timeSlot,
            date: today,
            method: 'reply_trigger'
          }
        });
        
        // 清除待觸發標記
        await this.clearPendingTriggers('pending_swimming_pool_weather', today);
        
        console.log(`✅ 竹科天氣預報已通過回覆觸發發送 (${timeSlot})`);
        return true;
      }
      
    } catch (error) {
      console.error('檢查竹科天氣預報觸發失敗:', error);
    }
    return false;
  }

  // 檢查並觸發風力預報
  private async checkAndTriggerWindForecast(groupId: string, replyToken: string, today: string): Promise<boolean> {
    try {
      // 只有風力預報群組才觸發
      const windForecastGroup = 'C360be1fe6ea876a4df3ca0497bca4e3b';
      if (groupId !== windForecastGroup) {
        return false;
      }
      
      const pendingLogs = await storage.getAuditLogsByCategory('pending_wind_forecast');
      const todayPending = pendingLogs.filter(log => 
        log.details && 
        typeof log.details === 'object' &&
        'date' in log.details && 
        'status' in log.details &&
        log.details.date === today &&
        log.details.status === 'awaiting_trigger'
      );

      // 檢查是否已經發送過
      const sentLogs = await storage.getAuditLogsByCategory('wind_forecast_sent');
      const todaySent = sentLogs.filter(log => 
        log.details && 
        typeof log.details === 'object' &&
        'date' in log.details &&
        log.details.date === today &&
        log.details.groupId === groupId
      );

      // 如果有待觸發且尚未發送的時段
      const availableTimeSlots = todayPending.filter(pending => {
        const timeSlot = pending.details && typeof pending.details === 'object' && 'timeSlot' in pending.details ? pending.details.timeSlot : '';
        return !todaySent.some(sent => 
          sent.details && typeof sent.details === 'object' && 'timeSlot' in sent.details && sent.details.timeSlot === timeSlot
        );
      });
      
      if (availableTimeSlots.length > 0) {
        console.log(`🌬️ 找到 ${availableTimeSlots.length} 個待觸發的風力預報`);
        
        const latestLog = availableTimeSlots[availableTimeSlots.length - 1];
        const timeSlot = latestLog.details && typeof latestLog.details === 'object' && 'timeSlot' in latestLog.details ? latestLog.details.timeSlot : '';
        
        // 使用 windForecastService 生成預報
        const { windForecastService } = await import('./windForecastService');
        const forecastText = await windForecastService.generateWindForecastReport();
        
        await this.replyMessage(replyToken, `🌬️ ${timeSlot}\n${forecastText}`);
        
        // 標記為已發送
        await storage.insertAuditLog({
          id: crypto.randomUUID(),
          level: 'info',
          category: 'wind_forecast_sent',
          message: `風力預報已回覆發送 (${timeSlot})`,
          details: {
            groupId,
            timeSlot,
            date: today,
            method: 'reply_trigger'
          }
        });
        
        // 清除待觸發標記
        await this.clearPendingTriggers('pending_wind_forecast', today);
        
        console.log(`✅ 風力預報已通過回覆觸發發送 (${timeSlot})`);
        return true;
      }
      
    } catch (error) {
      console.error('檢查風力預報觸發失敗:', error);
    }
    return false;
  }

  // 生成任務提醒摘要
  private async generateTaskSummary(groupId: string): Promise<string> {
    try {
      const { taskService } = await import('./taskService');
      return await taskService.generateTaskSummaryForGroup(groupId);
    } catch (error) {
      console.error('生成任務摘要失敗:', error);
      return '⚠️ 無法生成任務摘要，請稍後再試';
    }
  }

  // 清除待觸發標記
  private async clearPendingTriggers(category: string, date: string): Promise<void> {
    try {
      // 獲取所有今天待觸發的記錄
      const pendingLogs = await storage.getAuditLogsByCategory(category);
      const todayPending = pendingLogs.filter(log => 
        log.details && 
        typeof log.details === 'object' &&
        'date' in log.details && 
        'status' in log.details &&
        log.details.date === date &&
        log.details.status === 'awaiting_trigger'
      );

      // 為每個待觸發記錄添加"已發送"標記
      for (const log of todayPending) {
        const timeSlot = log.details && typeof log.details === 'object' && 'timeSlot' in log.details ? log.details.timeSlot : 'unknown';
        
        await storage.insertAuditLog({
          id: crypto.randomUUID(),
          level: 'info',
          category: category.replace('pending_', '') + '_sent',
          message: `${category.includes('task') ? '任務提醒' : category.includes('water_quality') ? '水質報告' : category.includes('swimming_pool') ? '竹科天氣預報' : '風力預報'}已發送 - 清除待觸發狀態`,
          details: {
            originalLogId: log.id,
            timeSlot,
            date,
            status: 'sent',
            type: log.details && typeof log.details === 'object' && 'type' in log.details ? log.details.type : category,
            clearedAt: new Date().toISOString()
          }
        });
      }

      console.log(`🧹 已清除 ${todayPending.length} 個 ${category} 待觸發記錄`);
      
    } catch (error) {
      console.error('清除待觸發標記失敗:', error);
    }
  }

  // 驗證簽章的中間件
  getMiddleware() {
    return middleware(config);
  }
}

export const lineService = new LineService();
