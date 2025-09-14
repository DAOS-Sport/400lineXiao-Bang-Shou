/**
 * 直接測試 RAGIC 員工表單存取
 * 嘗試不同的 URL 格式來找到正確的員工資料表
 */

async function testDirectRagicAccess() {
  console.log('🔍 開始直接測試 RAGIC 員工表單存取...');
  
  const baseUrl = 'https://ap7.ragic.com/xinsheng';
  const ragicUsername = 'xinsheng';
  const ragicApiKey = process.env.RAGIC_API_KEY;
  const databasePath = 'xinsheng/ragicforms4/20004';  // 從環境變數得到的路徑
  
  if (!ragicApiKey) {
    console.error('❌ RAGIC_API_KEY 環境變數未設定');
    return;
  }
  
  const basicAuth = Buffer.from(`${ragicUsername}:${ragicApiKey.trim()}`).toString('base64');
  
  // 測試不同的 URL 格式，不使用 WHERE 條件先看看能否取得任何記錄
  const testUrls = [
    // 當前使用的格式 (沒有 WHERE 條件)
    `${baseUrl}?PAGEID=x3D&api&v=3&limit=5`,
    
    // 使用資料庫路徑中的表單 ID
    `${baseUrl}?PAGEID=20004&api&v=3&limit=5`,
    
    // 完整的資料庫路徑格式
    `${baseUrl}/ragicforms4/20004?api&v=3&limit=5`,
    
    // 其他可能的格式
    `https://ap7.ragic.com/${databasePath}?api&v=3&limit=5`,
    `${baseUrl}/ragicforms4?PAGEID=20004&api&v=3&limit=5`,
    
    // 嘗試不同的 API 版本
    `${baseUrl}?PAGEID=20004&api&limit=5`,
    `${baseUrl}/ragicforms4/20004?api&limit=5`,
    
    // 嘗試直接以 ID 存取
    `${baseUrl}/20004?api&v=3&limit=5`,
    
    // 嘗試沒有 limit 參數
    `${baseUrl}?PAGEID=20004&api&v=3`,
    
    // 嘗試列出所有可用的表單
    `${baseUrl}?api&v=3`,
    `${baseUrl}/ragicforms4?api&v=3`
  ];
  
  console.log(`🔧 測試設定:`, {
    baseUrl,
    databasePath,
    testUrlsCount: testUrls.length
  });
  
  for (let i = 0; i < testUrls.length; i++) {
    const testUrl = testUrls[i];
    
    try {
      console.log(`\n📋 測試 ${i + 1}/${testUrls.length}: ${testUrl}`);
      
      const response = await fetch(testUrl, {
        method: 'GET',
        headers: {
          'Authorization': `Basic ${basicAuth}`,
          'Content-Type': 'application/json'
        }
      });
      
      console.log(`📡 回應狀態: ${response.status} ${response.statusText}`);
      
      if (response.ok) {
        const data = await response.json();
        console.log(`✅ 成功取得資料`);
        console.log(`📊 資料類型: ${typeof data}, 陣列: ${Array.isArray(data)}`);
        
        if (Array.isArray(data)) {
          console.log(`📊 記錄數量: ${data.length}`);
          
          if (data.length > 0) {
            const firstRecord = data[0];
            console.log(`📊 第一筆記錄欄位: ${Object.keys(firstRecord || {}).slice(0, 15)}`);
            
            // 檢查是否有數字欄位 ID (RAGIC 格式)
            const fieldIds = Object.keys(firstRecord || {});
            const numericFieldIds = fieldIds.filter(id => /^\d+$/.test(id));
            
            if (numericFieldIds.length > 0) {
              console.log(`🎯 發現 RAGIC 數字欄位: ${numericFieldIds.slice(0, 10)}`);
              
              // 檢查前幾筆記錄的內容
              for (let j = 0; j < Math.min(3, data.length); j++) {
                const record = data[j];
                console.log(`\n📋 記錄 ${j + 1}:`);
                
                for (const fieldId of numericFieldIds.slice(0, 8)) {
                  const value = record[fieldId];
                  const valueStr = JSON.stringify(value);
                  const truncated = valueStr.length > 50 ? valueStr.substring(0, 50) + '...' : valueStr;
                  
                  console.log(`  欄位 ${fieldId}: ${truncated} (${typeof value})`);
                  
                  // 檢查 LINE ID 格式
                  if (typeof value === 'string' && value.startsWith('U') && value.length > 30) {
                    console.log(`    🎯 可能是 LINE ID 欄位!`);
                  }
                  
                  // 檢查員工編號格式
                  if (typeof value === 'string' && /^\d{4,}$/.test(value)) {
                    console.log(`    🎯 可能是員工編號欄位! (值: ${value})`);
                  }
                  
                  // 檢查是否包含測試資料
                  if (typeof value === 'string' && (
                    value.includes('U1377e3b691add6a9b93699eb02dea502') ||
                    value.includes('1305374')
                  )) {
                    console.log(`    🎯🎯 包含測試目標資料! 欄位ID: ${fieldId}, 值: ${value}`);
                  }
                }
              }
              
              // 如果找到疑似正確的資料，嘗試搜尋特定記錄
              if (numericFieldIds.length > 0) {
                console.log(`\n🔍 嘗試在此表單搜尋測試 LINE ID...`);
                const searchUrl = testUrl.replace('&limit=5', '').replace('limit=5', '') + 
                  `${testUrl.includes('?') ? '&' : '?'}where=1003633,eq,U1377e3b691add6a9b93699eb02dea502`;
                
                const searchResponse = await fetch(searchUrl, {
                  method: 'GET',
                  headers: {
                    'Authorization': `Basic ${basicAuth}`,
                    'Content-Type': 'application/json'
                  }
                });
                
                if (searchResponse.ok) {
                  const searchData = await searchResponse.json();
                  console.log(`🔍 搜尋結果: ${Array.isArray(searchData) ? searchData.length + ' 筆記錄' : typeof searchData}`);
                  if (Array.isArray(searchData) && searchData.length > 0) {
                    console.log(`✅ 找到匹配記錄!`, searchData[0]);
                  }
                }
              }
            }
          }
        } else if (typeof data === 'object' && data !== null) {
          console.log(`📊 物件欄位: ${Object.keys(data)}`);
          
          // 檢查是否有錯誤訊息
          if (data.status || data.msg) {
            console.log(`📊 可能的錯誤訊息: ${JSON.stringify(data)}`);
          }
        }
        
      } else {
        const errorText = await response.text();
        console.log(`❌ 請求失敗: ${errorText.substring(0, 200)}`);
      }
      
    } catch (error) {
      console.error(`❌ 測試失敗:`, error instanceof Error ? error.message : error);
    }
    
    // 延遲避免 API 限制
    await new Promise(resolve => setTimeout(resolve, 300));
  }
  
  console.log('\n🏁 直接 RAGIC 表單存取測試完成');
}

// 執行測試
testDirectRagicAccess().catch(console.error);

export { testDirectRagicAccess };