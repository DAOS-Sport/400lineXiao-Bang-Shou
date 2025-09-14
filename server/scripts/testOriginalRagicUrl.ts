/**
 * 測試原始 RAGIC URL 格式
 * 使用原始的 PAGEID=x3D 格式，並嘗試其他解決方案
 */

async function testOriginalRagicUrl() {
  console.log('🔍 開始測試原始 RAGIC URL 格式...');
  
  const ragicUsername = 'xinsheng';
  const ragicApiKey = process.env.RAGIC_API_KEY;
  
  if (!ragicApiKey) {
    console.error('❌ RAGIC_API_KEY 環境變數未設定');
    return;
  }
  
  const basicAuth = Buffer.from(`${ragicUsername}:${ragicApiKey.trim()}`).toString('base64');
  
  // 測試不同的 URL 格式
  const testUrls = [
    // 原始格式 - 先不加 WHERE 條件
    'https://ap7.ragic.com/xinsheng?PAGEID=x3D&api&v=3&limit=5',
    
    // 原始格式 - 帶 WHERE 條件
    'https://ap7.ragic.com/xinsheng?PAGEID=x3D&api&v=3&where=1003633,eq,U1377e3b691add6a9b93699eb02dea502',
    
    // 嘗試解釋 x3D (可能是十六進制)
    'https://ap7.ragic.com/xinsheng?PAGEID=61&api&v=3&limit=5',  // x3D = 61 in decimal
    
    // 嘗試其他可能的格式
    'https://ap7.ragic.com/xinsheng?tab=x3D&api&v=3&limit=5',
    'https://ap7.ragic.com/xinsheng?sheet=x3D&api&v=3&limit=5',
    
    // 嘗試不同的基礎路徑
    'https://ap7.ragic.com/xinsheng/x3D?api&v=3&limit=5',
    
    // 嘗試檢查所有可用的表單
    'https://ap7.ragic.com/xinsheng?api&v=3&listing=1',
    'https://ap7.ragic.com/xinsheng?api&v=3&forms=1'
  ];
  
  for (const testUrl of testUrls) {
    try {
      console.log(`\n📋 測試: ${testUrl}`);
      
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
        
        console.log(`📊 資料類型: ${typeof data}, 陣列: ${Array.isArray(data)}`);
        
        if (Array.isArray(data)) {
          console.log(`📊 記錄數量: ${data.length}`);
          
          if (data.length > 0) {
            const firstRecord = data[0];
            const fieldIds = Object.keys(firstRecord);
            console.log(`📊 第一筆記錄欄位: ${fieldIds.slice(0, 15)}`);
            
            // 檢查 RAGIC 數字欄位
            const numericFields = fieldIds.filter(k => /^\d+$/.test(k));
            if (numericFields.length > 0) {
              console.log(`🎯 RAGIC 數字欄位: ${numericFields.slice(0, 10)}`);
              
              // 檢查是否有我們要找的欄位
              if (numericFields.includes('1003633') || numericFields.includes('3000935')) {
                console.log(`✅ 找到目標欄位!`);
                
                for (let i = 0; i < Math.min(3, data.length); i++) {
                  const record = data[i];
                  console.log(`\n📋 記錄 ${i + 1}:`);
                  
                  if (record['1003633']) {
                    console.log(`  LINE ID (1003633): ${record['1003633']}`);
                  }
                  if (record['3000935']) {
                    console.log(`  員工編號 (3000935): ${record['3000935']}`);
                  }
                  
                  // 檢查是否包含目標資料
                  for (const [fieldId, value] of Object.entries(record)) {
                    if (typeof value === 'string' && (
                      value.includes('U1377e3b691add6a9b93699eb02dea502') ||
                      value.includes('1305374')
                    )) {
                      console.log(`    🎯🎯 找到目標資料! 欄位 ${fieldId}: ${value}`);
                    }
                  }
                }
              }
              
              // 顯示前幾個欄位的內容以供分析
              for (const fieldId of numericFields.slice(0, 8)) {
                const value = firstRecord[fieldId];
                if (value !== null && value !== undefined && value !== '') {
                  console.log(`  ${fieldId}: ${JSON.stringify(value).substring(0, 50)} (${typeof value})`);
                }
              }
            }
          }
          
        } else if (data && typeof data === 'object') {
          console.log(`📊 物件欄位: ${Object.keys(data)}`);
          
          if (data.status === 'ERROR') {
            console.log(`❌ 錯誤: ${data.msg} (code: ${data.code})`);
          } else {
            // 檢查是否為目錄結構
            if (data.xinsheng && typeof data.xinsheng === 'object') {
              console.log(`📊 檢測到目錄結構`);
            }
          }
        }
        
      } else {
        const errorText = await response.text();
        console.log(`❌ HTTP 錯誤: ${errorText.substring(0, 200)}`);
      }
      
    } catch (error) {
      console.error(`❌ 測試失敗:`, error instanceof Error ? error.message : error);
    }
    
    await new Promise(resolve => setTimeout(resolve, 400));
  }
  
  console.log('\n🏁 原始 RAGIC URL 格式測試完成');
}

// 執行測試
testOriginalRagicUrl().catch(console.error);

export { testOriginalRagicUrl };