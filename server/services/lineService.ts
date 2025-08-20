import { Client, middleware } from '@line/bot-sdk';

const config = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN || '',
  channelSecret: process.env.LINE_CHANNEL_SECRET || '',
};

// 開發模式下允許沒有憑證
const isDevMode = process.env.NODE_ENV === 'development';
if (!config.channelAccessToken || !config.channelSecret) {
  if (isDevMode) {
    console.warn('LINE 憑證未設定，部分功能將無法使用（開發模式）');
  } else {
    throw new Error('LINE_CHANNEL_ACCESS_TOKEN 和 LINE_CHANNEL_SECRET 必須設定');
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
      await client.pushMessage(to, {
        type: 'text',
        text: text
      });
    } catch (error) {
      console.error('LINE 推送訊息失敗:', error);
      throw error;
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
