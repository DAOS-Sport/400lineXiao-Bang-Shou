import { lineService } from '../services/lineService';

async function testDuplicationPrevention() {
  try {
    console.log('🧪 測試重複發送防護機制...');
    
    const groupId = 'C50c2a9623a78cc5f5e9f39557e3abfe6';
    const replyToken = 'test_reply_token_' + Date.now();
    
    console.log('🔍 模擬第一次群組互動...');
    await lineService.checkAndSendPendingMessages(groupId, replyToken + '_1');
    
    console.log('🔍 模擬第二次群組互動 (應該被防護機制阻止)...');
    await lineService.checkAndSendPendingMessages(groupId, replyToken + '_2');
    
    console.log('✅ 測試完成');
    
  } catch (error) {
    console.error('❌ 測試失敗:', error);
  }
}

testDuplicationPrevention();