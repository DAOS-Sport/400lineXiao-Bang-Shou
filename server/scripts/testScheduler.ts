import { schedulerService } from '../services/schedulerService';

async function testScheduler() {
  console.log('📅 當前時間:', new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' }));
  console.log('📅 UTC 時間:', new Date().toISOString());
  
  console.log('\n🔧 測試手動觸發任務提醒...');
  await schedulerService.manualTriggerTaskSummary();
  
  console.log('\n✅ 測試完成');
}

testScheduler().catch(console.error);