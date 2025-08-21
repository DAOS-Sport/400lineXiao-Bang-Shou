import { Client, middleware } from '@line/bot-sdk';
import { storage } from '../storage';

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

  // 新增：發送訊息到群組（需要透過回覆或其他方式）
  async sendToGroup(groupId: string, text: string): Promise<void> {
    console.log('🔍 嘗試發送訊息到群組:', groupId);
    console.log('📝 訊息內容:', text.substring(0, 50) + '...');
    
    // 記錄到審計日誌，表示報告已生成
    try {
      await storage.saveAuditLog(
        'group_message_ready',
        '水質報告已準備就緒，等待群組中的觸發',
        'system',
        {
          groupId,
          messageContent: text,
          timestamp: new Date().toISOString(),
          reportType: 'water_quality'
        }
      );
      
      console.log('📊 水質報告已準備完成，已記錄到系統日誌');
      console.log('💡 下次在群組中觸發機器人時會看到報告');
    } catch (error) {
      console.error('記錄群組訊息失敗:', error);
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
