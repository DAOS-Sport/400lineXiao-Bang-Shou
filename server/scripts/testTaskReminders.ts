import { schedulerService } from '../services/schedulerService';

async function testTaskReminders() {
  try {
    console.log('🧪 測試自動推播代辦事項功能...');
    
    // 手動觸發任務提醒
    await schedulerService.dailyTaskSummary();
    
    console.log('✅ 測試完成');
    
  } catch (error) {
    console.error('❌ 測試失敗:', error);
  }
}

testTaskReminders();