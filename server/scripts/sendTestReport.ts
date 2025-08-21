/**
 * 發送測試水質報告到群組
 */

import { waterQualityService } from '../services/waterQualityService';

async function sendTestReport() {
  console.log('📤 準備發送測試水質報告到群組...\n');
  
  try {
    // 直接調用發送水質報告的方法
    await waterQualityService.sendDailyWaterQualityReport();
    
    console.log('✅ 水質報告已發送到群組！');
    console.log('🎯 群組: C50c2a9623a78cc5f5e9f39557e3abfe6');
    console.log('📱 請到 LINE 群組中查看報告內容');
    
  } catch (error) {
    console.error('❌ 發送報告時發生錯誤:', error);
  }
}

sendTestReport();