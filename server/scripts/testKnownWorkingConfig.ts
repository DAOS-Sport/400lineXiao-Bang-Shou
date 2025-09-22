/**
 * 使用已知有效配置測試 RAGIC API
 * 根據 replit.md 中的成功記錄重現
 */

async function testKnownConfig() {
  const apiKey = process.env.RAGIC_API_KEY;
  const testLineId = 'U1377e3b691add6a9b93699eb02dea502'; // 莊柏彥的 LINE ID
  
  console.log('🔍 測試已知有效配置...');
  console.log('📋 之前成功記錄: 莊柏彥 (員工編號: 1305374, 在職狀態: 在職)');
  console.log('🆔 測試 LINE ID:', testLineId);
  console.log('');

  // 測試 1: 完全按照之前成功的格式
  console.log('1️⃣ 測試原始成功配置...');
  
  const testUrls = [
    // 原始查詢格式
    `https://ap7.ragic.com/xinsheng/ragicforms4/20004?v=3&api&where=1003633,eq,${encodeURIComponent(testLineId)}`,
    
    // 基礎連線測試
    `https://ap7.ragic.com/xinsheng/ragicforms4/20004?v=3&api&limit=1`,
    
    // 試試其他可能的路徑
    `https://ap7.ragic.com/xinsheng/forms4/20004?v=3&api&limit=1`,
    
    // 試試不同的參數順序
    `https://ap7.ragic.com/xinsheng/ragicforms4/20004?api&v=3&where=1003633,eq,${encodeURIComponent(testLineId)}`
  ];

  for (let i = 0; i < testUrls.length; i++) {
    const url = testUrls[i];
    console.log(`\n🔗 測試 URL ${i + 1}:`);
    console.log(`   ${url}`);
    
    try {
      // 嘗試直接使用 API Key
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `Basic ${apiKey}`,
          'Accept': 'application/json'
        }
      });
      
      console.log(`   ✅ 狀態: ${response.status}`);
      const data = await response.json();
      
      if (response.status === 200) {
        if (data.status === 'ERROR') {
          console.log(`   ❌ API 錯誤: ${data.msg}`);
        } else if (Array.isArray(data) && data.length > 0) {
          console.log(`   🎯 成功！找到 ${data.length} 筆記錄`);
          console.log(`   📋 第一筆資料: ${JSON.stringify(data[0]).substring(0, 100)}...`);
          
          // 檢查是否有我們要的欄位
          const firstRecord = data[0];
          if (firstRecord['1003633']) {
            console.log(`   🆔 LINE ID 欄位: ${firstRecord['1003633']}`);
          }
          if (firstRecord['3000935']) {
            console.log(`   👤 員工編號: ${firstRecord['3000935']}`);
          }
          
          return; // 找到成功的配置就停止
        } else {
          console.log(`   📝 回應: ${JSON.stringify(data).substring(0, 150)}...`);
        }
      }
      
    } catch (error) {
      console.log(`   💥 錯誤: ${(error as Error).message}`);
    }
  }
  
  console.log('\n🏁 測試完成 - 所有配置都未成功');
}

// 運行測試
testKnownConfig().then(() => {
  process.exit(0);
}).catch((error) => {
  console.error('💥 測試失敗:', error);
  process.exit(1);
});