/**
 * 測試 RAGIC 認證格式
 * 調試認證問題，確保 API key 正確使用
 */

async function testRagicAuth() {
  console.log('🔐 開始測試 RAGIC 認證格式...');
  
  const ragicUsername = 'xinsheng';
  const ragicApiKey = process.env.RAGIC_API_KEY;
  
  if (!ragicApiKey) {
    console.error('❌ RAGIC_API_KEY 環境變數未設定');
    return;
  }
  
  console.log('🔧 認證設定:', {
    username: ragicUsername,
    hasApiKey: !!ragicApiKey,
    apiKeyLength: ragicApiKey?.trim().length,
    apiKeyPreview: ragicApiKey?.trim().substring(0, 8) + '...'
  });
  
  // 測試不同的認證格式
  const authFormats = [
    // 當前格式: username:apikey
    {
      name: 'username:apikey',
      auth: Buffer.from(`${ragicUsername}:${ragicApiKey.trim()}`).toString('base64')
    },
    // 只使用 API key
    {
      name: 'apikey only',
      auth: Buffer.from(ragicApiKey.trim()).toString('base64')
    },
    // API key as username with empty password
    {
      name: 'apikey as username',
      auth: Buffer.from(`${ragicApiKey.trim()}:`).toString('base64')
    },
    // 使用 Authorization: Bearer 格式
    {
      name: 'bearer token',
      auth: ragicApiKey.trim(),
      headerType: 'Bearer'
    }
  ];
  
  const testUrl = 'https://ap7.ragic.com/xinsheng/ragicforms4/20004?api&v=3&limit=1';
  
  for (const authFormat of authFormats) {
    try {
      console.log(`\n🔐 測試認證格式: ${authFormat.name}`);
      console.log(`🔐 Auth header preview: ${authFormat.auth.substring(0, 20)}...`);
      
      const headers: any = {
        'Content-Type': 'application/json'
      };
      
      if (authFormat.headerType === 'Bearer') {
        headers['Authorization'] = `Bearer ${authFormat.auth}`;
      } else {
        headers['Authorization'] = `Basic ${authFormat.auth}`;
      }
      
      const response = await fetch(testUrl, {
        method: 'GET',
        headers
      });
      
      console.log(`📡 回應狀態: ${response.status} ${response.statusText}`);
      
      if (response.ok) {
        const data = await response.json();
        
        if (data.status === 'ERROR') {
          console.log(`❌ API 錯誤: ${data.msg} (code: ${data.code})`);
          
          // 檢查是否還是訪客帳戶錯誤
          if (data.msg && data.msg.includes('guest account')) {
            console.log(`  ⚠️ 仍然被視為訪客帳戶`);
          } else if (data.msg && data.msg.includes('access right')) {
            console.log(`  ⚠️ 權限不足，但認證可能成功`);
          }
        } else if (Array.isArray(data)) {
          console.log(`✅ 成功取得資料陣列，記錄數: ${data.length}`);
          if (data.length > 0) {
            console.log(`✅ 第一筆記錄欄位: ${Object.keys(data[0]).slice(0, 10)}`);
            
            // 檢查是否有 RAGIC 格式欄位
            const numericFields = Object.keys(data[0]).filter(k => /^\d+$/.test(k));
            if (numericFields.length > 0) {
              console.log(`🎯 發現 RAGIC 欄位格式: ${numericFields.slice(0, 8)}`);
            }
          }
        } else {
          console.log(`📊 其他回應格式:`, typeof data, Object.keys(data || {}));
        }
      } else {
        const errorText = await response.text();
        console.log(`❌ HTTP 錯誤: ${errorText.substring(0, 200)}`);
      }
      
    } catch (error) {
      console.error(`❌ 測試失敗:`, error instanceof Error ? error.message : error);
    }
    
    await new Promise(resolve => setTimeout(resolve, 300));
  }
  
  // 測試一個已知存在且有權限的端點
  console.log('\n🔍 測試基本連線...');
  try {
    const basicUrl = 'https://ap7.ragic.com/xinsheng?api&v=3';
    const basicAuth = Buffer.from(`${ragicUsername}:${ragicApiKey.trim()}`).toString('base64');
    
    const response = await fetch(basicUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Basic ${basicAuth}`,
        'Content-Type': 'application/json'
      }
    });
    
    console.log(`📡 基本連線狀態: ${response.status}`);
    
    if (response.ok) {
      const data = await response.json();
      console.log(`📊 基本連線成功，回應類型: ${typeof data}`);
      if (typeof data === 'object' && data !== null) {
        console.log(`📊 基本連線欄位: ${Object.keys(data)}`);
      }
    }
    
  } catch (error) {
    console.error(`❌ 基本連線失敗:`, error);
  }
  
  console.log('\n🏁 RAGIC 認證格式測試完成');
}

// 執行測試
testRagicAuth().catch(console.error);

export { testRagicAuth };