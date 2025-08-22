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

  // 發送訊息到群組的替代方案
  async sendToGroup(groupId: string, text: string): Promise<void> {
    console.log('🔍 準備群組訊息:', groupId);
    console.log('📝 訊息內容:', text.substring(0, 50) + '...');
    
    try {
      // 方案：將報告存儲為待發送訊息，並在下次群組互動時發送
      await storage.insertAuditLog({
        id: crypto.randomUUID(),
        level: 'info',
        category: 'pending_group_message',
        message: '水質報告等待發送到群組',
        details: {
          groupId,
          messageContent: text,
          timestamp: new Date().toISOString(),
          reportType: 'water_quality',
          status: 'pending'
        }
      });
      
      console.log('📊 水質報告已準備完成，等待群組互動時發送');
      
      // 嘗試立即發送（如果有最近的群組訊息可以回覆）
      await this.tryImmediateSend(groupId, text);
      
    } catch (error) {
      console.error('準備群組訊息失敗:', error);
    }
  }

  // 嘗試立即發送到群組的方法
  private async tryImmediateSend(groupId: string, text: string): Promise<void> {
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
          
          // 標記為已發送
          await storage.insertAuditLog({
            id: crypto.randomUUID(),
            level: 'info',
            category: 'group_message_sent',
            message: '水質報告已成功發送到群組',
            details: { groupId, method: 'reply', timestamp: new Date().toISOString() }
          });
          
          console.log('✅ 水質報告已通過回覆方式發送到群組');
          return;
        }
      }
      
      console.log('⏳ 無法立即發送，將在下次群組互動時發送');
      
    } catch (error) {
      console.log('⏳ 立即發送失敗，將在下次群組互動時發送');
    }
  }

  // 檢查並發送待發送的群組訊息
  async checkAndSendPendingMessages(groupId: string, replyToken: string): Promise<void> {
    try {
      console.log(`🔎 checkAndSendPendingMessages 被調用，群組: ${groupId}`);
      
      // 查找該群組的待發送訊息（增加查找範圍）
      const pendingLogs = await storage.getAuditLogs(50);
      console.log(`📋 查詢到 ${pendingLogs.length} 筆審計日誌`);
      
      const pendingMessage = pendingLogs.find(log => {
        const isMatch = log.category === 'pending_group_message' && 
                       log.details?.groupId === groupId &&
                       log.details?.status === 'pending';
        
        if (log.category === 'pending_group_message') {
          console.log(`🔍 檢查待發送訊息: 群組 ${log.details?.groupId} vs ${groupId}, 狀態: ${log.details?.status}`);
        }
        
        return isMatch;
      });
      
      // 檢查是否已經有已發送的記錄（避免重複發送）
      if (pendingMessage) {
        const sentMessages = pendingLogs.filter(log => 
          log.category === 'group_message_sent' && 
          log.details?.groupId === groupId &&
          log.details?.originalLogId === pendingMessage.id
        );
        
        if (sentMessages.length > 0) {
          console.log(`📭 群組 ${groupId} 的待發送訊息已經發送過了，跳過重複發送`);
          return;
        }
        
        // 同時檢查是否有相同內容的報告在近期已發送（額外防護）
        const recentSentMessages = pendingLogs.filter(log => 
          log.category === 'group_message_sent' && 
          log.details?.groupId === groupId &&
          new Date(log.timestamp).getTime() > (Date.now() - 60 * 60 * 1000) // 1小時內
        );
        
        if (recentSentMessages.length > 0) {
          console.log(`🕒 群組 ${groupId} 在 1 小時內已發送過報告，跳過重複發送`);
          return;
        }
      }
      
      console.log(`📤 找到待發送訊息:`, !!pendingMessage);
      
      if (pendingMessage) {
        console.log('📤 發現待發送的群組訊息，立即發送');
        console.log(`📤 訊息內容預覽: ${pendingMessage.details.messageContent?.substring(0, 50)}...`);
        
        await this.replyMessage(replyToken, pendingMessage.details.messageContent);
        
        // 標記為已發送 - 更新原記錄的狀態
        await storage.insertAuditLog({
          id: crypto.randomUUID(),
          level: 'info',
          category: 'group_message_sent',
          message: '待發送的水質報告已發送',
          details: { 
            groupId, 
            originalLogId: pendingMessage.id,
            timestamp: new Date().toISOString(),
            status: 'sent'
          }
        });
        
        // 同時更新原始待發送記錄的狀態（透過新增一筆狀態更新記錄）
        await storage.insertAuditLog({
          id: crypto.randomUUID(),
          level: 'info', 
          category: 'pending_group_message',
          message: '水質報告狀態更新',
          details: {
            ...pendingMessage.details,
            status: 'sent',
            sentAt: new Date().toISOString()
          }
        });
        
        console.log('✅ 待發送的水質報告已成功發送');
      } else {
        console.log(`📭 群組 ${groupId} 目前沒有待發送的訊息`);
      }
    } catch (error) {
      console.error('檢查待發送訊息失敗:', error);
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

  // 驗證簽章的中間件
  getMiddleware() {
    return middleware(config);
  }
}

export const lineService = new LineService();
