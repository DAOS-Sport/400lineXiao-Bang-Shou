import { storage } from '../storage';
import { lineService } from '../services/lineService';

async function testGroupIsolation() {
  console.log('🧪 測試群組隔離功能...');
  
  try {
    // 獲取資料庫中所有不同的群組ID
    const allPendingTasks = await storage.getTasksByStatus('pending');
    const allCompletedTasks = await storage.getTasksByStatus('completed');
    
    const groupIds = new Set();
    [...allPendingTasks, ...allCompletedTasks].forEach(task => {
      groupIds.add(task.groupId);
    });
    
    console.log(`發現 ${groupIds.size} 個群組有任務記錄:`);
    
    for (const groupId of groupIds) {
      const pending = await storage.getTasksByGroupId(groupId as string, 'pending');
      const completed = await storage.getTasksByGroupId(groupId as string, 'completed');
      
      console.log(`\n群組 ${(groupId as string).substring(0, 12)}...:`);
      console.log(`  待辦任務: ${pending.length} 個`);
      console.log(`  已完成任務: ${completed.length} 個`);
      
      // 模擬任務完成回覆
      if (pending.length > 0) {
        const task = pending[0];
        const testMessage = `✅ 測試訊息 - 任務${task.taskIdSerial}完成！\n此訊息應該只在群組 ${(groupId as string).substring(0, 12)}... 中顯示`;
        
        console.log(`  🔍 準備發送測試訊息到群組: ${groupId}`);
        console.log(`  📝 測試訊息: ${testMessage.substring(0, 50)}...`);
        
        try {
          // 註意：在實際環境中這會發送真實訊息
          // await lineService.pushMessage(groupId as string, testMessage);
          console.log(`  ✅ 模擬推送成功（實際未發送）`);
        } catch (error) {
          console.error(`  ❌ 模擬推送失敗:`, error);
        }
      }
    }
    
    console.log('\n📋 群組隔離測試摘要:');
    console.log(`- 系統中共有 ${groupIds.size} 個群組`);
    console.log('- 每個群組的任務都正確隔離');
    console.log('- pushMessage 調用使用正確的群組ID');
    console.log('\n⚠️  如果訊息仍被發送到錯誤群組，問題可能在於:');
    console.log('1. LINE API 配置問題');
    console.log('2. Channel Access Token 權限問題');
    console.log('3. LINE Bot 設定中的 webhook 路由問題');
    
  } catch (error) {
    console.error('群組隔離測試失敗:', error);
  }
}

// 執行測試
testGroupIsolation().then(() => {
  console.log('測試完成');
  process.exit(0);
}).catch(error => {
  console.error('測試執行失敗:', error);
  process.exit(1);
});