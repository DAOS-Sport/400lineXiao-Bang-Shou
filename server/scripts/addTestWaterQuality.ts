/**
 * 新增測試水質紀錄
 */

import { waterQualityService } from '../services/waterQualityService';

async function addTestWaterQualityRecord() {
  console.log('🧪 新增測試水質紀錄...\n');
  
  const testMessage = `114/8/21 14.30
CL 2.8
PH 7.6
水溫 29
氣溫 34`;

  console.log('📝 測試訊息:');
  console.log(testMessage);
  console.log('');
  
  // 模擬來自目標群組的訊息
  await waterQualityService.handleWaterQualityMessage(
    testMessage, 
    'test-msg-' + Date.now(), 
    'test-user-001',
    'C50c2a9623a78cc5f5e9f39557e3abfe6'  // 目標群組ID
  );
  
  console.log('✅ 測試紀錄已新增');
  
  // 檢查結果
  const records = await waterQualityService.getTodayWaterQualityRecords();
  console.log(`📊 現在有 ${records.length} 筆水質紀錄`);
  
  if (records.length > 0) {
    console.log('\n📋 最新紀錄:');
    const latest = records[records.length - 1];
    console.log(`⏰ ${latest.date} ${latest.time}`);
    console.log(`💧 CL: ${latest.cl}`);
    console.log(`🔵 PH: ${latest.ph}`);
    console.log(`🌡️ 水溫: ${latest.waterTemp}°C`);
    console.log(`🌡️ 氣溫: ${latest.airTemp}°C`);
  }
  
  // 生成報告
  const report = await waterQualityService.generateDailyWaterQualityReport();
  console.log('\n' + report);
}

addTestWaterQualityRecord().catch(console.error);