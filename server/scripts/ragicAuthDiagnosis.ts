/**
 * RAGIC API 認證診斷腳本
 * 測試各種不同的認證方式
 */

async function testRagicAuth() {
  const apiKey = process.env.RAGIC_API_KEY;
  const username = process.env.RAGIC_USERNAME;
  const baseUrl = 'https://ap7.ragic.com/xinsheng/ragicforms4/20004';
  
  console.log('🔍 RAGIC API 認證診斷開始...');
  console.log('🔧 配置信息:');
  console.log(`   API Key 長度: ${apiKey?.length || 0}`);
  console.log(`   用戶名: ${username || '未設置'}`);
  console.log(`   Base URL: ${baseUrl}`);
  console.log('');

  // 測試 1: 直接使用 API Key 作為 Basic Auth
  console.log('1️⃣ 測試：Authorization: Basic API_KEY');
  try {
    const url1 = `${baseUrl}?v=3&api&limit=1`;
    const response1 = await fetch(url1, {
      method: 'GET',
      headers: {
        'Authorization': `Basic ${apiKey}`,
        'Accept': 'application/json'
      }
    });
    
    console.log(`   狀態: ${response1.status}`);
    const data1 = await response1.json();
    console.log(`   回應: ${JSON.stringify(data1).substring(0, 200)}...`);
  } catch (error) {
    console.log(`   錯誤: ${(error as Error).message}`);
  }
  console.log('');

  // 測試 2: 使用 username:apikey 的 Base64 編碼
  if (username) {
    console.log('2️⃣ 測試：Authorization: Basic Base64(username:apikey)');
    try {
      const credentials = Buffer.from(`${username}:${apiKey}`).toString('base64');
      const url2 = `${baseUrl}?v=3&api&limit=1`;
      const response2 = await fetch(url2, {
        method: 'GET',
        headers: {
          'Authorization': `Basic ${credentials}`,
          'Accept': 'application/json'
        }
      });
      
      console.log(`   狀態: ${response2.status}`);
      const data2 = await response2.json();
      console.log(`   回應: ${JSON.stringify(data2).substring(0, 200)}...`);
    } catch (error) {
      console.log(`   錯誤: ${(error as Error).message}`);
    }
  } else {
    console.log('2️⃣ 跳過：無用戶名配置');
  }
  console.log('');

  // 測試 3: 使用 apikey: 作為用戶名（空密碼）
  console.log('3️⃣ 測試：Authorization: Basic Base64(apikey:)');
  try {
    const credentials = Buffer.from(`${apiKey}:`).toString('base64');
    const url3 = `${baseUrl}?v=3&api&limit=1`;
    const response3 = await fetch(url3, {
      method: 'GET',
      headers: {
        'Authorization': `Basic ${credentials}`,
        'Accept': 'application/json'
      }
    });
    
    console.log(`   狀態: ${response3.status}`);
    const data3 = await response3.json();
    console.log(`   回應: ${JSON.stringify(data3).substring(0, 200)}...`);
  } catch (error) {
    console.log(`   錯誤: ${(error as Error).message}`);
  }
  console.log('');

  // 測試 4: 在 URL 中加入 auth 參數
  console.log('4️⃣ 測試：URL 參數 &auth=API_KEY');
  try {
    const url4 = `${baseUrl}?v=3&api&limit=1&auth=${encodeURIComponent(apiKey!)}`;
    const response4 = await fetch(url4, {
      method: 'GET',
      headers: {
        'Accept': 'application/json'
      }
    });
    
    console.log(`   狀態: ${response4.status}`);
    const data4 = await response4.json();
    console.log(`   回應: ${JSON.stringify(data4).substring(0, 200)}...`);
  } catch (error) {
    console.log(`   錯誤: ${(error as Error).message}`);
  }
  console.log('');

  console.log('🏁 診斷完成');
}

// 運行診斷
testRagicAuth().then(() => {
  process.exit(0);
}).catch((error) => {
  console.error('💥 診斷失敗:', error);
  process.exit(1);
});