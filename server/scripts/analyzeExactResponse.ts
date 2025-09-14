/**
 * 分析確切 URL 的回應結構
 * 深入檢查原始 URL 的完整回應，尋找巢狀結構中的員工資料
 */

async function analyzeExactResponse() {
  console.log('🔍 分析確切 URL 的回應結構...');
  
  const ragicUsername = 'xinsheng';
  const ragicApiKey = process.env.RAGIC_API_KEY;
  
  if (!ragicApiKey) {
    console.error('❌ RAGIC_API_KEY 環境變數未設定');
    return;
  }
  
  const basicAuth = Buffer.from(`${ragicUsername}:${ragicApiKey.trim()}`).toString('base64');
  
  // 原始任務中提到的確切 URL
  const originalUrl = 'https://ap7.ragic.com/xinsheng?PAGEID=x3D&api&v=3&where=1003633,eq,U1377e3b691add6a9b93699eb02dea502';
  
  console.log('🔗 測試原始 URL:', originalUrl);
  
  try {
    const response = await fetch(originalUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Basic ${basicAuth}`,
        'Content-Type': 'application/json'
      }
    });
    
    console.log(`📡 回應狀態: ${response.status} ${response.statusText}`);
    
    if (response.ok) {
      const data = await response.json();
      
      console.log('\n📋 完整回應結構:');
      console.log(JSON.stringify(data, null, 2));
      
      console.log('\n🔍 深入分析回應結構...');
      console.log(`📊 頂層資料類型: ${typeof data}`);
      console.log(`📊 是否為陣列: ${Array.isArray(data)}`);
      
      if (typeof data === 'object' && data !== null) {
        console.log(`📊 頂層欄位: ${Object.keys(data)}`);
        
        // 遞迴分析所有巢狀結構
        analyzeNestedStructure(data, '', 0);
        
        // 搜尋目標資料
        console.log('\n🎯 搜尋目標資料...');
        const targetLineId = 'U1377e3b691add6a9b93699eb02dea502';
        const targetEmployeeId = '1305374';
        
        const found = searchInObject(data, targetLineId, targetEmployeeId);
        if (found.length > 0) {
          console.log('✅ 找到目標資料:');
          found.forEach((item, index) => {
            console.log(`  ${index + 1}. 路徑: ${item.path}`);
            console.log(`     值: ${JSON.stringify(item.value)}`);
            console.log(`     類型: ${typeof item.value}`);
          });
        } else {
          console.log('❌ 未找到目標資料');
        }
        
        // 搜尋包含數字欄位的物件（可能是 RAGIC 記錄）
        console.log('\n🔍 搜尋可能的 RAGIC 記錄結構...');
        const ragicStructures = findRagicStructures(data);
        if (ragicStructures.length > 0) {
          console.log(`✅ 找到 ${ragicStructures.length} 個可能的 RAGIC 記錄結構:`);
          ragicStructures.forEach((structure, index) => {
            console.log(`\n  ${index + 1}. 路徑: ${structure.path}`);
            console.log(`     數字欄位: ${structure.numericFields.slice(0, 10)}`);
            console.log(`     記錄數量: ${structure.recordCount}`);
            
            if (structure.numericFields.includes('1003633') || structure.numericFields.includes('3000935')) {
              console.log(`     🎯 包含目標欄位!`);
              
              // 檢查記錄內容
              if (Array.isArray(structure.data) && structure.data.length > 0) {
                const firstRecord = structure.data[0];
                console.log(`     第一筆記錄:`);
                if (firstRecord['1003633']) {
                  console.log(`       LINE ID (1003633): ${firstRecord['1003633']}`);
                }
                if (firstRecord['3000935']) {
                  console.log(`       員工編號 (3000935): ${firstRecord['3000935']}`);
                }
              }
            }
          });
        } else {
          console.log('❌ 未找到 RAGIC 記錄結構');
        }
      }
      
    } else {
      const errorText = await response.text();
      console.log(`❌ HTTP 錯誤: ${errorText}`);
    }
    
  } catch (error) {
    console.error('❌ 請求失敗:', error);
  }
  
  console.log('\n🏁 確切 URL 回應結構分析完成');
}

function analyzeNestedStructure(obj: any, path: string, depth: number): void {
  if (depth > 5) return; // 避免無限遞迴
  
  const indent = '  '.repeat(depth);
  
  if (Array.isArray(obj)) {
    console.log(`${indent}📊 [${path}] 陣列，長度: ${obj.length}`);
    if (obj.length > 0) {
      console.log(`${indent}   第一個元素類型: ${typeof obj[0]}`);
      if (typeof obj[0] === 'object' && obj[0] !== null) {
        const keys = Object.keys(obj[0]);
        console.log(`${indent}   第一個元素欄位: ${keys.slice(0, 10)}`);
        analyzeNestedStructure(obj[0], `${path}[0]`, depth + 1);
      }
    }
  } else if (typeof obj === 'object' && obj !== null) {
    const keys = Object.keys(obj);
    console.log(`${indent}📊 [${path}] 物件，欄位數: ${keys.length}`);
    console.log(`${indent}   欄位: ${keys.slice(0, 10)}`);
    
    for (const key of keys.slice(0, 5)) { // 只分析前5個欄位避免輸出過多
      const value = obj[key];
      if (typeof value === 'object' && value !== null) {
        analyzeNestedStructure(value, `${path}.${key}`, depth + 1);
      }
    }
  }
}

function searchInObject(obj: any, targetLineId: string, targetEmployeeId: string, path = ''): any[] {
  const results: any[] = [];
  
  if (typeof obj === 'string') {
    if (obj.includes(targetLineId) || obj.includes(targetEmployeeId)) {
      results.push({ path, value: obj, type: 'string' });
    }
  } else if (Array.isArray(obj)) {
    obj.forEach((item, index) => {
      results.push(...searchInObject(item, targetLineId, targetEmployeeId, `${path}[${index}]`));
    });
  } else if (typeof obj === 'object' && obj !== null) {
    Object.entries(obj).forEach(([key, value]) => {
      results.push(...searchInObject(value, targetLineId, targetEmployeeId, `${path}.${key}`));
    });
  }
  
  return results;
}

function findRagicStructures(obj: any, path = ''): any[] {
  const results: any[] = [];
  
  if (Array.isArray(obj)) {
    if (obj.length > 0 && typeof obj[0] === 'object' && obj[0] !== null) {
      const keys = Object.keys(obj[0]);
      const numericFields = keys.filter(k => /^\d+$/.test(k));
      
      if (numericFields.length > 5) { // 如果有多個數字欄位，可能是 RAGIC 結構
        results.push({
          path,
          data: obj,
          recordCount: obj.length,
          numericFields,
          allFields: keys
        });
      }
    }
    
    // 遞迴檢查陣列中的元素
    obj.forEach((item, index) => {
      results.push(...findRagicStructures(item, `${path}[${index}]`));
    });
  } else if (typeof obj === 'object' && obj !== null) {
    // 遞迴檢查物件的屬性
    Object.entries(obj).forEach(([key, value]) => {
      results.push(...findRagicStructures(value, `${path}.${key}`));
    });
  }
  
  return results;
}

// 執行分析
analyzeExactResponse().catch(console.error);

export { analyzeExactResponse };