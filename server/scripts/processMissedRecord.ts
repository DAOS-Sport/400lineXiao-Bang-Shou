import { waterQualityService } from '../services/waterQualityService';

async function processMissedRecord() {
  try {
    console.log('🔍 手動處理遺漏的水質記錄...');
    
    // 模擬 17:05 的水質數據
    const missedData = `114/8/21 17:05
CL 1.5
PH 7.7
水溫 32
氣溫 32`;
    
    const messageId = `manual_${Date.now()}`;
    const userId = 'U_manual_entry';
    const groupId = 'C50c2a9623a78cc5f5e9f39557e3abfe6';
    
    console.log('📊 處理水質數據:', missedData);
    
    await waterQualityService.handleWaterQualityMessage(
      missedData,
      messageId,
      userId,
      groupId
    );
    
    console.log('✅ 遺漏的水質記錄已成功補錄');
    
  } catch (error) {
    console.error('❌ 補錄失敗:', error);
  }
}

processMissedRecord();