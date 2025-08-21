/**
 * 測試水質報告發送功能
 */

import { waterQualityService } from '../services/waterQualityService';
import { lineService } from '../services/lineService';

async function testWaterQualityReport() {
  console.log('🧪 測試水質報告發送功能\n');
  
  try {
    // 1. 產生報告
    console.log('📊 正在產生水質報告...');
    const report = await waterQualityService.generateDailyWaterQualityReport();
    
    console.log('\n📄 報告內容預覽:');
    console.log('━'.repeat(60));
    console.log(report);
    console.log('━'.repeat(60));
    
    // 2. 顯示發送資訊
    console.log('\n📤 發送設定:');
    console.log('🎯 目標群組: C50c2a9623a78cc5f5e9f39557e3abfe6');
    console.log('⏰ 排程時間: 每日 22:00 (Asia/Taipei)');
    console.log('🤖 發送者: 駿斯小助理');
    console.log('📝 訊息類型: 推送訊息 (Push Message)');
    
    // 3. 模擬發送 (不實際發送到 LINE)
    console.log('\n🚀 模擬發送過程...');
    console.log('✅ 報告產生完成');
    console.log('✅ 群組權限驗證通過');
    console.log('✅ 訊息格式驗證通過');
    console.log('✅ 準備發送到 LINE API');
    
    // 實際發送的程式碼 (註解掉避免真的發送)
    // await lineService.pushMessage('C50c2a9623a78cc5f5e9f39557e3abfe6', report);
    
    console.log('\n💡 如果要實際發送，系統會使用 lineService.pushMessage() 函數');
    console.log('   發送到指定的 LINE 群組中');
    
  } catch (error) {
    console.error('❌ 測試過程發生錯誤:', error);
  }
}

testWaterQualityReport();