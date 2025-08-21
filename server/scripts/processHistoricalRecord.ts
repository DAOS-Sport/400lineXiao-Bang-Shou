import { waterQualityService } from '../services/waterQualityService';

async function processHistoricalRecord() {
  try {
    console.log('🔄 處理早上 11:55 的歷史水質記錄...');
    
    // 早上 11:55 的水質數據
    const morningMessage = `114 08.21

大池 & 兒童
CL    1.5
PH    6.8
水溫  30
加藥量 
鍋爐  關
———
SPA
CL  2.0
PH   7.8
水溫  30
加藥量 
鍋爐 關
———
熱水池
CL   2.0
PH   6.8
水溫 38
加藥量 
鍋爐    關
———
冷水池
CL 2.0
PH  6.8
水溫 23
加藥量`;

    const messageId = '575319599190114363';
    const userId = 'Ue1ccd92e37a8b7875cf01642d24d9ca4';
    const groupId = 'C9b3c5dfe2e005adafd2ed914714a1930';
    
    // 手動處理這筆記錄
    await waterQualityService.handleWaterQualityMessage(morningMessage, messageId, userId, groupId);
    
    console.log('✅ 歷史記錄處理完成');
    
    // 重新生成完整報告
    const report = await waterQualityService.generateDailyWaterQualityReport(groupId);
    console.log('\n📊 更新後的完整報告:');
    console.log('='.repeat(50));
    console.log(report);
    console.log('='.repeat(50));
    
  } catch (error) {
    console.error('❌ 處理歷史記錄失敗:', error);
  }
}

processHistoricalRecord();