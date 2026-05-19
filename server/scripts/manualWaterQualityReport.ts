/**
 * 手動觸發水質報告（不透過 LINE API 發送，只顯示內容）
 */

import { waterQualityService } from '../services/waterQualityService';

async function manualReport() {
  console.log('📊 生成目前的水質報告內容：\n');
  
  try {
    const report = await waterQualityService.generateDailyWaterQualityReport();
    
    console.log('='.repeat(60));
    console.log(report);
    console.log('='.repeat(60));
    
    console.log('\n📝 這就是會在每晚 22:00 自動發送到群組的完整內容！');
    console.log('🎯 群組：C50c2a9623a78cc5f5e9f39557e3abfe6');
    
    // 檢查當前記錄數
    const records = await waterQualityService.getTodayWaterQualityRecords();
    console.log(`\n📈 目前統計：共 ${records.length} 筆水質檢測記錄`);
    
    if (records.length > 0) {
      console.log('\n🔍 詳細記錄：');
      records.forEach((record, index) => {
        console.log(`   ${index + 1}. ${record.time} - CL:${record.cl} PH:${record.ph} 水溫:${record.waterTemp}°C`);
      });
    }
    
  } catch (error) {
    console.error('❌ 生成報告失敗:', error);
  }
}

manualReport();
