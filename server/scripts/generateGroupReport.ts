import { waterQualityService } from '../services/waterQualityService';
import dayjs from 'dayjs';
import timezone from 'dayjs/plugin/timezone.js';
import utc from 'dayjs/plugin/utc.js';

dayjs.extend(utc);
dayjs.extend(timezone);

async function generateGroupReport() {
  try {
    console.log('📊 生成松山國小館今日水質報告...');
    
    const groupId = 'C9b3c5dfe2e005adafd2ed914714a1930';
    const groupName = '松山國小館';
    const today = dayjs().tz('Asia/Taipei').format('YYYY-MM-DD');
    
    // 生成完整報告
    const report = await waterQualityService.generateDailyWaterQualityReport(groupId);
    
    console.log('\n' + '='.repeat(50));
    console.log(`📋 ${groupName} 水質報告 (${today})`);
    console.log('='.repeat(50));
    console.log(report);
    console.log('='.repeat(50));
    
    // 獲取詳細數據
    const records = await waterQualityService.getTodayWaterQualityRecords(groupId);
    
    if (records.length > 0) {
      console.log('\n📊 詳細數據分析:');
      console.log('-'.repeat(40));
      
      records.forEach((record, index) => {
        console.log(`第 ${index + 1} 筆記錄:`);
        console.log(`  時間: ${record.time}`);
        console.log(`  池子: ${record.poolType || '未指定'}`);
        console.log(`  氯含量: ${record.cl} ppm`);
        console.log(`  酸鹼值: ${record.ph}`);
        console.log(`  水溫: ${record.waterTemp}°C`);
        if (record.additionalInfo) {
          console.log(`  加藥量: ${record.additionalInfo.medicine || '無'}`);
          console.log(`  鍋爐狀態: ${record.additionalInfo.boiler || '無'}`);
        }
        console.log('');
      });
    }
    
  } catch (error) {
    console.error('❌ 報告生成失敗:', error);
  }
}

generateGroupReport();