#!/usr/bin/env tsx
// 測試任務提醒功能

import { schedulerService } from '../services/schedulerService';

async function testTaskReminder() {
  console.log('🧪 測試任務提醒功能...');
  
  try {
    console.log('📊 手動觸發任務摘要發送...');
    await schedulerService.manualTriggerTaskSummary();
    console.log('✅ 任務提醒測試完成！');
    
  } catch (error) {
    console.error('❌ 測試失敗:', error);
  } finally {
    // 給一點時間讓異步操作完成
    await new Promise(resolve => setTimeout(resolve, 2000));
    process.exit(0);
  }
}

// 執行測試
testTaskReminder();