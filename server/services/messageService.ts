import { type CreateMessageData } from "@shared/schema";
import { lineService } from "./lineService";
import crypto from 'crypto';

export class MessageService {
  async createMessageFromEvent(event: any): Promise<CreateMessageData> {
    const source = event.source;
    
    // 取得顯示名稱
    let displayName = '';
    try {
      if (source.type === 'user') {
        const profile = await lineService.getProfile(source.userId);
        displayName = profile?.displayName || '';
      } else {
        const profile = await lineService.getProfile(source.userId);
        displayName = profile?.displayName || '';
      }
    } catch (error) {
      console.error('獲取用戶顯示名稱失敗:', error);
    }

    return {
      id: crypto.randomUUID(), // 加入必要的 ID
      messageId: event.message.id,
      sourceType: source.type,
      groupId: source.groupId,
      roomId: source.roomId,
      userId: source.userId,
      displayName: displayName,
      type: event.message.type,
      text: event.message.text,
      timestamp: new Date(event.timestamp),
      rawEvent: event
    };
  }

  // 檢查訊息是否包含交辦關鍵字
  containsTaskKeyword(text: string): boolean {
    return text.includes('交辦');
  }

  // 清理任務文字，移除「交辦：」前綴
  cleanTaskText(text: string): string {
    return text.replace(/^交辦[：:]\s*/, '').trim();
  }
}

export const messageService = new MessageService();