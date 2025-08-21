import { waterQualityService } from '../services/waterQualityService';
import dayjs from 'dayjs';
import timezone from 'dayjs/plugin/timezone';
import utc from 'dayjs/plugin/utc';

dayjs.extend(utc);
dayjs.extend(timezone);

async function testScheduler() {
  try {
    console.log('🧪 測試排程服務 - 手動觸發水質報告...');
    
    const now = dayjs().tz('Asia/Taipei');
    console.log(`⏰ 當前台灣時間: ${now.format('YYYY-MM-DD HH:mm:ss')}`);
    
    // 手動觸發水質報告發送
    console.log('📊 開始手動執行水質報告...');
    await waterQualityService.sendDailyWaterQualityReport();
    
    console.log('✅ 測試完成');
    
  } catch (error) {
    console.error('❌ 測試失敗:', error);
  }
}

testScheduler();