/**
 * 立即發送水質報告（繞過速率限制）
 */

import { waterQualityService } from '../services/waterQualityService';

async function sendReportWithRetry() {
  console.log('📤 準備立即發送水質報告...');
  
  const maxRetries = 3;
  let retryCount = 0;
  
  while (retryCount < maxRetries) {
    try {
      console.log(`\n🔄 嘗試發送 (第 ${retryCount + 1} 次)...`);
      
      // 等待一下避免速率限制
      if (retryCount > 0) {
        console.log('⏳ 等待 10 秒避免速率限制...');
        await new Promise(resolve => setTimeout(resolve, 10000));
      }
      
      await waterQualityService.sendDailyWaterQualityReport();
      
      console.log('✅ 水質報告發送成功！');
      console.log('📱 請檢查 LINE 群組中的報告');
      break;
      
    } catch (error: any) {
      retryCount++;
      
      if (error.statusCode === 429) {
        console.log(`⚠️ 遇到速率限制 (429)，${retryCount < maxRetries ? '將重試' : '已達最大重試次數'}`);
        if (retryCount < maxRetries) {
          console.log('⏳ 等待 15 秒後重試...');
          await new Promise(resolve => setTimeout(resolve, 15000));
        }
      } else {
        console.error('❌ 其他錯誤:', error.message);
        break;
      }
    }
  }
  
  if (retryCount >= maxRetries) {
    console.log('\n🤔 暫時無法發送，但別擔心！');
    console.log('✅ 系統會在今晚 22:00 自動發送水質報告');
    console.log('🧪 你也可以在群組中發送水質數據測試識別功能');
  }
}

sendReportWithRetry();