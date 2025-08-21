import { schedulerService } from '../services/schedulerService';
import { lineService } from '../services/lineService';

async function testDirectGroupPush() {
  console.log('🧪 測試直接推送到群組功能');
  console.log('✅ LINE API 支援 pushMessage(groupId)');
  console.log('✅ 已加入速率控制與重試機制');
  
  // 測試群組 ID（從你的實際群組）
  const testGroups = [
    'C7df140dbcf9b99cd7a4e8bff32849a06', // 測試群組
  ];
  
  try {
    console.log('\n📤 測試直接推送到群組...');
    
    for (const groupId of testGroups) {
      const testMessage = `🧪 測試訊息\n這是直接推送到群組的測試\n時間: ${new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' })}`;
      
      console.log(`推送到群組 ${groupId.substring(0, 8)}...`);
      await lineService.pushMessage(groupId, testMessage);
      
      // 群組間延遲 300ms
      if (testGroups.indexOf(groupId) < testGroups.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 300));
      }
    }
    
    console.log('\n✅ 直接群組推送測試完成！');
    console.log('如果群組收到訊息，表示功能正常');
    
  } catch (error) {
    console.error('❌ 測試失敗:', error);
  }
}

testDirectGroupPush();