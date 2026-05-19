/**
 * Water Quality Service Test - 測試水質監控功能
 */

import { waterQualityService } from '../services/waterQualityService';

// 測試水質訊息解析
async function testWaterQualityParsing() {
  console.log('\n🧪 開始測試水質訊息解析...');
  
  const testMessage = `114/8/21 12.10
CL 2.5
PH 7.8
水溫 31
氣溫 36`;

  const result = waterQualityService.parseWaterQualityMessage(testMessage, 'test-msg-001', 'test-user-001');
  
  if (result) {
    console.log('✅ 水質訊息解析成功:');
    console.log(`   日期: ${result.date}`);
    console.log(`   時間: ${result.time}`);
    console.log(`   氯濃度: ${result.cl}`);
    console.log(`   酸鹼值: ${result.ph}`);
    console.log(`   水溫: ${result.waterTemp}°C`);
    console.log(`   氣溫: ${result.airTemp}°C`);
    
    // 測試儲存功能
    await waterQualityService.saveWaterQualityRecord(result, 'test-group-001');
    console.log('✅ 水質紀錄已儲存');
    
    // 測試報告生成
    const report = await waterQualityService.generateDailyWaterQualityReport();
    console.log('\n📊 水質報告:');
    console.log(report);
  } else {
    console.log('❌ 水質訊息解析失敗');
  }
}

// 測試是否為水質訊息
function testWaterQualityDetection() {
  console.log('\n🔍 測試水質訊息檢測...');
  
  const testCases = [
    {
      text: `114/8/21 12.10
CL 2.5
PH 7.8
水溫 31
氣溫 36`,
      expected: true,
      description: '正確格式的水質訊息'
    },
    {
      text: '今天天氣很好',
      expected: false,
      description: '一般聊天訊息'
    },
    {
      text: `114/8/21 12.10
CL 2.5
PH 7.8`,
      expected: false,
      description: '不完整的水質資料'
    }
  ];
  
  testCases.forEach(({ text, expected, description }) => {
    const result = waterQualityService.isWaterQualityMessage(text);
    const status = result === expected ? '✅' : '❌';
    console.log(`${status} ${description}: ${result} (期望: ${expected})`);
  });
}

// 執行測試
export async function runWaterQualityTests() {
  console.log('🚀 開始水質監控系統測試');
  
  testWaterQualityDetection();
  await testWaterQualityParsing();
  
  console.log('\n✨ 水質監控系統測試完成');
}

// ES模組版本的直接執行檢查
if (import.meta.url === `file://${process.argv[1]}`) {
  runWaterQualityTests().catch(console.error);
}
