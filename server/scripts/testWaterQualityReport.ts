import { waterQualityService } from '../services/waterQualityService';
import { lineService } from '../services/lineService';

async function sendTestWaterQualityReport() {
  try {
    console.log('🚀 手動發送水質報告測試...');
    
    // 直接使用服務的發送方法
    await waterQualityService.sendDailyWaterQualityReport();
    console.log('✅ 水質報告發送完成!');
    
  } catch (error) {
    console.error('❌ 發送失敗:', error.message);
    if (error.response) {
      console.error('API 錯誤:', error.response.status, error.response.data);
    }
  }
}

sendTestWaterQualityReport();