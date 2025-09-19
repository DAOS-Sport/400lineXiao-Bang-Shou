// 測試水質報告格式
async function testWaterQualityReports() {
  console.log('🧪 開始測試水質報告格式...\n');
  
  const hsinchuGroupId = 'C50c2a9623a78cc5f5e9f39557e3abfe6'; // 竹科戶外游泳池
  const songshanGroupId = 'C9b3c5dfe2e005adafd2ed914714a1930'; // 松山群組
  
  try {
    // 動態導入服務
    const { waterQualityService } = await import('./server/services/waterQualityService');
    
    // 測試竹科群組（應該包含天氣預報）
    console.log('🏊‍♂️ 測試竹科戶外游泳池群組報告 (應包含天氣預報):');
    console.log('=====================================');
    const hsinchuReport = await waterQualityService.generateDailyWaterQualityReport(hsinchuGroupId);
    console.log(hsinchuReport);
    console.log('\n');
    
    // 測試松山群組（應該不包含天氣預報）
    console.log('🏊‍♀️ 測試松山群組報告 (不應包含天氣預報):');
    console.log('=====================================');
    const songshanReport = await waterQualityService.generateDailyWaterQualityReport(songshanGroupId);
    console.log(songshanReport);
    console.log('\n');
    
    // 驗證結果
    const hsinchuHasWeather = hsinchuReport.includes('新竹科學園區天氣預報');
    const songshanHasWeather = songshanReport.includes('新竹科學園區天氣預報');
    
    console.log('📊 測試結果驗證:');
    console.log(`✅ 竹科群組包含天氣預報: ${hsinchuHasWeather ? '是' : '否'}`);
    console.log(`✅ 松山群組不包含天氣預報: ${!songshanHasWeather ? '是' : '否'}`);
    
    if (hsinchuHasWeather && !songshanHasWeather) {
      console.log('\n🎉 測試通過！修改成功生效！');
      return true;
    } else {
      console.log('\n❌ 測試失敗，需要檢查修改');
      return false;
    }
    
  } catch (error) {
    console.error('❌ 測試失敗:', error);
    return false;
  }
}

testWaterQualityReports();