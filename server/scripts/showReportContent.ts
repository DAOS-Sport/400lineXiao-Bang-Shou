/**
 * 顯示實際會發送的水質報告內容
 */

import { waterQualityService } from '../services/waterQualityService';

async function showReportContent() {
  console.log('📋 這就是實際會發送到 LINE 群組的水質報告內容：\n');
  
  try {
    const report = await waterQualityService.generateDailyWaterQualityReport();
    
    console.log('┌' + '─'.repeat(50) + '┐');
    console.log('│' + ' '.repeat(18) + 'LINE 訊息內容' + ' '.repeat(18) + '│');
    console.log('├' + '─'.repeat(50) + '┤');
    
    // 將報告內容逐行顯示，模擬 LINE 的顯示效果
    const lines = report.split('\n');
    lines.forEach(line => {
      console.log('│ ' + line.padEnd(48) + ' │');
    });
    
    console.log('└' + '─'.repeat(50) + '┘');
    
    console.log('\n📝 訊息詳細資訊:');
    console.log(`   訊息長度: ${report.length} 字元`);
    console.log(`   訊息行數: ${lines.length} 行`);
    console.log(`   發送時間: 每日 22:00 (Asia/Taipei)`);
    console.log(`   目標群組: C50c2a9623a78cc5f5e9f39557e3abfe6`);
    
    console.log('\n💡 因為 LINE API 速率限制 (429 錯誤)，目前無法立即發送測試訊息');
    console.log('   不過系統會在每晚 22:00 自動發送這個報告到群組');
    console.log('   你也可以在群組中發送水質數據來測試識別功能！');
    
  } catch (error) {
    console.error('❌ 產生報告時發生錯誤:', error);
  }
}

showReportContent();