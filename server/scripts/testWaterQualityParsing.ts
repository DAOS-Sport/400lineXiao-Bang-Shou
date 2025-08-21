import { waterQualityService } from '../services/waterQualityService';

async function testWaterQualityParsing() {
  try {
    console.log('🧪 測試水質數據解析功能...');
    
    // 測試原始格式 (點號分隔)
    const originalFormat = `114/8/21 12.10
CL 2.5
PH 7.8
水溫 31
氣溫 36`;

    // 測試新格式 (冒號分隔)
    const newFormat = `114/8/21 17:05
CL 1.5
PH 7.7
水溫 32
氣溫 32`;
    
    console.log('📊 測試原始格式 (點號)...');
    await waterQualityService.handleWaterQualityMessage(
      originalFormat,
      'test_original_format',
      'U_test',
      'C50c2a9623a78cc5f5e9f39557e3abfe6'
    );
    
    console.log('📊 測試新格式 (冒號)...');
    await waterQualityService.handleWaterQualityMessage(
      newFormat,
      'test_new_format', 
      'U_test',
      'C50c2a9623a78cc5f5e9f39557e3abfe6'
    );
    
    console.log('✅ 測試完成');
    
  } catch (error) {
    console.error('❌ 測試失敗:', error);
  }
}

testWaterQualityParsing();