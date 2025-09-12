/**
 * 再次測試 RAGIC API 權限
 */

console.log('🔄 再次測試 RAGIC API 權限狀況\n');

const RAGIC_DOMAIN = process.env.RAGIC_DOMAIN;
const RAGIC_DATABASE_ID = process.env.RAGIC_DATABASE_ID;
const RAGIC_API_KEY = process.env.RAGIC_API_KEY;

console.log('🔧 環境設定:');
console.log(`   Domain: ${RAGIC_DOMAIN}`);
console.log(`   Database ID: ${RAGIC_DATABASE_ID}`);
console.log(`   API KEY: ${RAGIC_API_KEY ? RAGIC_API_KEY.substring(0, 20) + '...' : '未設定'}`);
console.log('');

const baseUrl = `https://${RAGIC_DOMAIN}/${RAGIC_DATABASE_ID}`;
const lineId = 'U1377e3b691add6a9b93699eb02dea502'; // 莊柏彥的 LINE ID

async function quickTest() {
  try {
    console.log('🚀 快速權限檢測');
    console.log('=====================================');
    
    const testUrl = `${baseUrl}?api=true&limit=1`;
    console.log(`測試 URL: ${testUrl}`);
    
    const response = await fetch(testUrl, {
      method: 'GET',
      headers: {
        'Authorization': RAGIC_API_KEY,
        'Content-Type': 'application/json'
      }
    });

    console.log(`HTTP 狀態碼: ${response.status}`);
    
    const data = await response.json();
    console.log('API 回應:', JSON.stringify(data, null, 2));
    
    // 檢查是否仍有權限錯誤
    if (data && data.status === 'ERROR') {
      if (data.code === 106) {
        console.log('\n❌ 權限問題持續存在');
        console.log('🔍 錯誤分析:');
        console.log('   - 仍然以「訪客帳戶」存取');
        console.log('   - API KEY 權限設定可能未生效');
        console.log('   - 可能需要重新產生 API KEY');
        return { success: false, stillBlocked: true };
      } else {
        console.log(`\n❌ 其他 API 錯誤: ${data.msg}`);
        return { success: false, otherError: data.msg };
      }
    }
    
    // 權限正常，進行員工查詢
    console.log('\n✅ 基本權限檢測通過！');
    console.log('🎉 可以存取 RAGIC 資料庫！');
    
    console.log('\n🔍 查詢莊柏彥員工資料');
    console.log('=====================================');
    
    const queryUrl = `${baseUrl}?api=true&where=1003633,eq,${encodeURIComponent(lineId)}`;
    console.log(`查詢 URL: ${queryUrl}`);
    
    const queryResponse = await fetch(queryUrl, {
      method: 'GET',
      headers: {
        'Authorization': RAGIC_API_KEY,
        'Content-Type': 'application/json'
      }
    });

    console.log(`查詢狀態碼: ${queryResponse.status}`);
    
    const queryData = await queryResponse.json();
    
    if (queryData && queryData.status === 'ERROR') {
      console.log(`❌ 查詢失敗: ${queryData.msg}`);
      return { success: true, queryError: queryData.msg };
    }
    
    console.log('查詢結果:', JSON.stringify(queryData, null, 2));
    
    if (Array.isArray(queryData) && queryData.length > 0) {
      const employee = queryData[0];
      const employeeId = employee['3000935']; // 員工編號
      const lineIdField = employee['1003633']; // LINE ID
      
      console.log('\n🎯 查詢成功！');
      console.log(`   LINE ID: ${lineIdField}`);
      console.log(`   員工編號: ${employeeId}`);
      
      return {
        success: true,
        found: true,
        employeeId,
        lineId: lineIdField
      };
    } else {
      console.log('\n⚠️  查詢成功但沒有找到資料');
      return { success: true, found: false };
    }

  } catch (error) {
    console.log(`❌ 測試異常: ${error.message}`);
    return { success: false, error: error.message };
  }
}

async function main() {
  console.log('🚀 開始再次測試...\n');
  
  if (!RAGIC_API_KEY) {
    console.log('❌ 環境變數 RAGIC_API_KEY 未設定');
    return;
  }
  
  const result = await quickTest();
  
  console.log('\n📋 測試結果');
  console.log('=====================================');
  
  if (result.success) {
    if (result.found && result.employeeId) {
      console.log('🎉 完全成功！');
      console.log('   ✅ RAGIC 權限問題已解決');
      console.log('   ✅ 成功找到員工資料');
      console.log(`   ✅ 員工編號: ${result.employeeId}`);
      console.log('\n🚀 建議立即測試 LINE Bot 的 ID 指令！');
    } else if (result.found === false) {
      console.log('⚠️  API 正常，但查無員工資料');
      console.log('   ✅ 權限問題已解決');
      console.log('   ❌ 找不到對應的 LINE ID');
    } else if (result.queryError) {
      console.log('⚠️  權限正常，查詢時發生錯誤');
      console.log('   ✅ 基本權限已解決');
      console.log(`   ❌ 查詢錯誤: ${result.queryError}`);
    }
  } else {
    if (result.stillBlocked) {
      console.log('❌ 權限問題仍然存在');
      console.log('   💡 建議檢查 RAGIC 設定或重新產生 API KEY');
    } else {
      console.log('❌ 測試失敗');
      console.log(`   錯誤: ${result.error || result.otherError || '未知錯誤'}`);
    }
  }
  
  console.log('\n🏁 測試完成！');
}

main().catch(console.error);