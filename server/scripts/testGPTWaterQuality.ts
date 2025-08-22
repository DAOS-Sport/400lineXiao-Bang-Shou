/**
 * 測試 GPT 智能水質識別功能
 */

import { waterQualityService } from '../services/waterQualityService';

async function testGPTWaterQualityAnalysis() {
  console.log('🧪 開始測試 GPT 智能水質識別...\n');

  try {
    const testGroupId = 'C50c2a9623a78cc5f5e9f39557e3abfe6';
    
    console.log(`📊 對群組 ${testGroupId} 執行 GPT 智能水質分析...`);
    await waterQualityService.processWaterQualityWithGPT(testGroupId);
    
    console.log('\n✅ GPT 水質分析測試完成！');
    
  } catch (error) {
    console.error('❌ 測試失敗:', error);
  } finally {
    // 確保程式結束
    setTimeout(() => {
      process.exit(0);
    }, 2000);
  }
}

// 執行測試
testGPTWaterQualityAnalysis();