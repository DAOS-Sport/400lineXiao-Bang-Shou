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

  async pushMessage(to: string, text: string): Promise<void> {
    if (!client) {
      console.warn('LINE client 未初始化，無法推送訊息');
      return;
    }
    
    try {
      // 檢查是否為群組 ID (C開頭)
      if (to.startsWith('C')) {
        console.log('⚠️ 警告: 無法直接推送訊息到群組，群組 ID:', to);
        console.log('💡 建議: 使用 Reply API 或在群組中觸發機器人回覆');
        throw new Error('無法直接推送訊息到群組。LINE API 不支援推送到群組 ID。');
      }
      
      await client.pushMessage(to, {
        type: 'text',
        text: text
      });
    } catch (error) {
      console.error('LINE 推送訊息失敗:', error);
      throw error;
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
        
        if (new Date(lastMessage.timestamp) > fiveMinutesAgo && lastMessage.replyToken) {
          console.log('🎯 找到最近的訊息，嘗試回覆發送');
          await this.replyMessage(lastMessage.replyToken, text);
          
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
      
      // 查找該群組的待發送訊息
      const pendingLogs = await storage.getAuditLogs(10);
      console.log(`📋 查詢到 ${pendingLogs.length} 筆審計日誌`);
      
      const pendingMessage = pendingLogs.find(log => 
        log.category === 'pending_group_message' && 
        log.details?.groupId === groupId &&
        log.details?.status === 'pending'
      );
      
      console.log(`📤 找到待發送訊息:`, !!pendingMessage);
      
      if (pendingMessage) {
        console.log('📤 發現待發送的群組訊息，立即發送');
        await this.replyMessage(replyToken, pendingMessage.details.messageContent);
        
        // 標記為已發送
        await storage.insertAuditLog({
          id: crypto.randomUUID(),
          level: 'info',
          category: 'group_message_sent',
          message: '待發送的水質報告已發送',
          details: { 
            groupId, 
            originalLogId: pendingMessage.id,
            timestamp: new Date().toISOString() 
          }
        });
        
        console.log('✅ 待發送的水質報告已成功發送');
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
