import { schedulerService } from '../services/schedulerService';

async function manualPush() {
  try {
    console.log('📤 手動推播代辦事項...');
    
    // 手動觸發一次任務提醒（使用公開的排程入口，避免直接呼叫 private method）
    await schedulerService.manualTriggerTaskSummary();
    
    console.log('✅ 手動推播完成');
    
  } catch (error) {
    console.error('❌ 手動推播失敗:', error);
  }
}

manualPush();
