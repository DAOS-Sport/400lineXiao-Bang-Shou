import { schedulerService } from '../services/schedulerService';

async function testGroupPush() {
  console.log('🧪 測試修正後的群組推播功能...');
  console.log('現在會直接推播到群組，而不是個別用戶');
  
  try {
    await schedulerService.manualTriggerTaskSummary();
    console.log('✅ 測試完成');
  } catch (error) {
    console.error('❌ 測試失敗:', error);
  }
}

testGroupPush();