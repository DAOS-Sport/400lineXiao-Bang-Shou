import { waterQualityService } from '../services/waterQualityService';

async function testNewGroupWaterQuality() {
  try {
    console.log('🧪 測試新群組水質監控系統...');
    
    // 模擬新群組的水質數據格式
    const testMessage = `114 08.21

大池 & 兒童
CL    0.8
PH    6.8
水溫  30
加藥量 1000ml
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

    const mockMessageId = 'test-message-id-12345';
    const mockUserId = 'Uf91aaf9eb68ae7d6a0924f24917c14dd';
    const targetGroupId = 'C9b3c5dfe2e005adafd2ed914714a1930';
    
    console.log('📝 測試訊息格式檢查...');
    const isValidMessage = (waterQualityService as any).isMultiPoolWaterQualityMessage(testMessage);
    console.log(`✅ 訊息格式檢查結果: ${isValidMessage}`);
    
    if (isValidMessage) {
      console.log('🔍 測試訊息解析...');
      const parsedData = (waterQualityService as any).parseMultiPoolWaterQualityMessage(testMessage, mockMessageId, mockUserId, targetGroupId);
      console.log('📊 解析結果:', parsedData);
      
      if (parsedData) {
        console.log('💾 測試儲存水質記錄...');
        await (waterQualityService as any).saveWaterQualityRecord(parsedData, targetGroupId);
        console.log('✅ 水質記錄儲存成功');
      }
    }
    
    console.log('📈 測試生成水質報告...');
    const report = await waterQualityService.generateDailyWaterQualityReport(targetGroupId);
    console.log('📋 生成的報告:', report);
    
    console.log('✅ 測試完成');
    
  } catch (error) {
    console.error('❌ 測試失敗:', error);
  }
}

testNewGroupWaterQuality();