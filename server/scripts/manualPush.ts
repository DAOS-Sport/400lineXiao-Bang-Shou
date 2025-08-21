import { schedulerService } from '../services/schedulerService';

async function manualPush() {
  try {
    console.log('📤 手動推播代辦事項...');
    
    // 手動觸發一次任務提醒
    await schedulerService.dailyTaskSummary();
    
    console.log('✅ 手動推播完成');
    
  } catch (error) {
    console.error('❌ 手動推播失敗:', error);
  }
}

manualPush();