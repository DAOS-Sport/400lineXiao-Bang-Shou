import { schedulerService } from '../services/schedulerService';
import { lineService } from '../services/lineService';
import { storage } from '../storage';

async function testWithExistingGroups() {
  console.log('📋 使用資料庫中已記錄的群組進行測試');
  
  // 從資料庫取得有待辦事項的群組
  const pendingTasks = await storage.getTasksByStatus('pending');
  const groupsWithTasks = [...new Set(pendingTasks.map(t => t.groupId))];
  
  console.log(`\n找到 ${groupsWithTasks.length} 個有待辦事項的群組：`);
  groupsWithTasks.forEach(gid => {
    const taskCount = pendingTasks.filter(t => t.groupId === gid).length;
    console.log(`- ${gid.substring(0, 20)}... (${taskCount} 項待辦)`);
  });
  
  // 選擇一個有待辦事項的群組來測試
  if (groupsWithTasks.length > 0) {
    const testGroupId = groupsWithTasks[0];
    console.log(`\n📤 測試推播到群組: ${testGroupId}`);
    
    try {
      const testMessage = `🧪 系統測試\n現在時間: ${new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' })}\n此群組有 ${pendingTasks.filter(t => t.groupId === testGroupId).length} 項待辦事項`;
      
      await lineService.pushMessage(testGroupId, testMessage);
      console.log('✅ 推播成功！');
      
    } catch (error: any) {
      if (error.statusCode === 429) {
        console.log('⚠️ API 頻率限制，請稍後再試');
      } else if (error.statusCode === 403) {
        console.log('❌ Bot 可能不在此群組中');
      } else {
        console.error('❌ 推播失敗:', error.message);
      }
    }
  }
  
  // 設定建議的 TARGET_GROUP_IDS
  const suggestedGroups = groupsWithTasks.slice(0, 5).join(',');
  console.log('\n💡 建議設定 TARGET_GROUP_IDS 環境變數：');
  console.log(`TARGET_GROUP_IDS=${suggestedGroups}`);
}

testWithExistingGroups();