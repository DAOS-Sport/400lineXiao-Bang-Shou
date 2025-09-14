/**
 * 探索 RAGIC 表單，尋找員工資料表
 * 用於找出包含 LINE ID 和員工編號的正確表單
 */

async function exploreRagicForms() {
  console.log('🔍 開始探索 RAGIC 表單...');
  
  const baseUrl = 'https://ap7.ragic.com/xinsheng';
  const ragicUsername = 'xinsheng';
  const ragicApiKey = process.env.RAGIC_API_KEY;
  
  if (!ragicApiKey) {
    console.error('❌ RAGIC_API_KEY 環境變數未設定');
    return;
  }
  
  const basicAuth = Buffer.from(`${ragicUsername}:${ragicApiKey.trim()}`).toString('base64');
  
  // 從之前的分析中取得的可用表單路徑
  const possibleForms = [
    '/ragic-setup',
    '/group-class-regular', 
    '/ragicforms31',
    '/supplement-student-data'
  ];
  
  // 也嘗試一些常見的表單 ID 格式
  const additionalForms = [
    '/ragicforms1/1',
    '/ragicforms2/1', 
    '/ragicforms3/1',
    '/ragicforms4/1',
    '/ragicforms4/2',
    '/ragicforms4/3',
    '/ragicforms4/20004',  // 使用環境變數中的 database ID
    'ragicforms4/20004',   // 不帶開頭的 /
    '?PAGEID=20004',       // 直接使用 PAGEID
    '?sheet=20004'         // 使用 sheet 參數
  ];
  
  const allFormsToTest = [...possibleForms, ...additionalForms];
  
  for (const formPath of allFormsToTest) {
    try {
      console.log(`\n📋 測試表單: ${formPath}`);
      
      // 構建測試 URL
      let testUrl;
      if (formPath.startsWith('?')) {
        testUrl = `${baseUrl}${formPath}&api&v=3&limit=1`;
      } else if (formPath.startsWith('/')) {
        testUrl = `${baseUrl}${formPath}?api&v=3&limit=1`;
      } else {
        testUrl = `${baseUrl}/${formPath}?api&v=3&limit=1`;
      }
      
      console.log(`🔗 測試 URL: ${testUrl}`);
      
      const response = await fetch(testUrl, {
        method: 'GET',
        headers: {
          'Authorization': `Basic ${basicAuth}`,
          'Content-Type': 'application/json'
        }
      });
      
      console.log(`📡 回應狀態: ${response.status}`);
      
      if (response.ok) {
        const data = await response.json();
        console.log(`✅ 成功取得資料`);
        console.log(`📊 資料類型: ${typeof data}`);
        console.log(`📊 是否為陣列: ${Array.isArray(data)}`);
        
        if (typeof data === 'object') {
          console.log(`📊 主要欄位: ${Object.keys(data)}`);
          
          // 檢查是否有標準的記錄結構
          if (Array.isArray(data)) {
            console.log(`📊 記錄數量: ${data.length}`);
            if (data.length > 0 && typeof data[0] === 'object') {
              const firstRecord = data[0];
              const fieldIds = Object.keys(firstRecord);
              console.log(`📊 記錄欄位: ${fieldIds.slice(0, 10)} ${fieldIds.length > 10 ? '...' : ''}`);
              
              // 檢查是否包含可能的 LINE ID 或員工編號欄位
              const hasNumericFields = fieldIds.some(id => /^\d+$/.test(id));
              if (hasNumericFields) {
                console.log(`🎯 發現數字欄位 IDs (可能是 RAGIC 欄位): ${fieldIds.filter(id => /^\d+$/.test(id)).slice(0, 10)}`);
                
                // 檢查前幾個記錄的數據內容
                for (let i = 0; i < Math.min(3, data.length); i++) {
                  const record = data[i];
                  console.log(`\n📋 記錄 ${i + 1}:`);
                  const numericFields = fieldIds.filter(id => /^\d+$/.test(id));
                  for (const fieldId of numericFields.slice(0, 10)) {
                    const value = record[fieldId];
                    console.log(`  ${fieldId}: ${JSON.stringify(value)} (${typeof value})`);
                    
                    // 檢查是否包含 LINE ID 格式的資料
                    if (typeof value === 'string' && value.startsWith('U') && value.length > 30) {
                      console.log(`    🎯 可能的 LINE ID 欄位!`);
                    }
                    
                    // 檢查是否包含員工編號格式的資料
                    if (typeof value === 'string' && /^\d{4,}$/.test(value)) {
                      console.log(`    🎯 可能的員工編號欄位!`);
                    }
                  }
                }
              }
            }
          } else {
            // 非陣列的物件結構
            console.log(`📊 物件內容預覽:`, Object.keys(data).slice(0, 5));
          }
        }
      } else {
        const errorText = await response.text();
        console.log(`❌ 請求失敗: ${response.status} ${response.statusText}`);
        console.log(`❌ 錯誤內容: ${errorText.substring(0, 200)}...`);
      }
      
    } catch (error) {
      console.error(`❌ 表單 ${formPath} 測試失敗:`, error instanceof Error ? error.message : error);
    }
    
    // 短暫延遲避免 API 限制
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  
  console.log('\n🏁 RAGIC 表單探索完成');
}

// 執行探索
exploreRagicForms().catch(console.error);

export { exploreRagicForms };