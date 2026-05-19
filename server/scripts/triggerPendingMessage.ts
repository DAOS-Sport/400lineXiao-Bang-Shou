import { lineService } from '../services/lineService';

async function triggerPendingMessageCheck() {
  try {
    console.log('🔍 手動觸發待發送訊息檢查...');
    
    const groupId = 'C50c2a9623a78cc5f5e9f39557e3abfe6';
    const mockReplyToken = 'mock-reply-token-for-test';
    
    await lineService.checkAndSendPendingMessages(groupId, mockReplyToken);
    
    console.log('✅ 檢查完成');
    
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('❌ 檢查失敗:', message);
  }
}

triggerPendingMessageCheck();
