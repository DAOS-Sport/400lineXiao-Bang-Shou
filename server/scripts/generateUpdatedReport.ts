import { waterQualityService } from '../services/waterQualityService';

async function generateUpdatedReport() {
  try {
    console.log('📊 重新生成包含遺漏數據的水質報告...');
    
    // 重新生成今日的水質報告（包含剛補錄的17:05數據）
    await waterQualityService.sendDailyWaterQualityReport();
    
    console.log('✅ 更新的水質報告已準備完成');
    
  } catch (error) {
    console.error('❌ 生成報告失敗:', error);
  }
}

generateUpdatedReport();