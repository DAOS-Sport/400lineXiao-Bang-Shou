/**
 * 檢查水質紀錄腳本
 */

import { waterQualityService } from '../services/waterQualityService';
import { waterQualityMemoryStore } from '../services/waterQualityMemoryStore';

async function checkWaterQualityRecords() {
  console.log('🔍 檢查目前水質紀錄...\n');
  
  try {
    // 獲取今日紀錄
    const todayRecords = await waterQualityService.getTodayWaterQualityRecords();
    
    console.log(`📊 今日水質紀錄總數: ${todayRecords.length}`);
    
    if (todayRecords.length > 0) {
      console.log('\n📋 詳細紀錄:');
      todayRecords.forEach((record, index) => {
        console.log(`${index + 1}. ${record.date} ${record.time}`);
        console.log(`   💧 CL: ${record.cl}`);
        console.log(`   🔵 PH: ${record.ph}`);
        console.log(`   🌡️ 水溫: ${record.waterTemp}°C`);
        console.log(`   🌡️ 氣溫: ${record.airTemp}°C`);
        console.log(`   📝 訊息ID: ${record.messageId}`);
        console.log('');
      });
      
      // 生成報告
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      const report = await waterQualityService.generateDailyWaterQualityReport();
      console.log(report);
    } else {
      console.log('\n❌ 目前沒有水質紀錄');
      console.log('💡 可以發送以下格式的訊息來測試:');
      console.log('114/8/21 12.10');
      console.log('CL 2.5');
      console.log('PH 7.8');
      console.log('水溫 31');
      console.log('氣溫 36');
    }
    
    // 檢查記憶體存儲狀態
    console.log('\n🧠 記憶體存儲狀態:');
    console.log(`總紀錄數: ${waterQualityMemoryStore.getRecordCount()}`);
    
  } catch (error) {
    console.error('❌ 檢查水質紀錄時發生錯誤:', error);
  }
}

// 執行檢查
checkWaterQualityRecords();