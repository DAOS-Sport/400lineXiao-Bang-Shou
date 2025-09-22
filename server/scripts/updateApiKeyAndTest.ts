/**
 * 使用新 API Key 測試正確的欄位名稱查詢
 */

async function testWithCorrectField() {
  const newApiKey = 'RHpUbW43Sjh2MU9BMUs5dklzVVZlN2tSRzRkS0ZlNk1SbUptOXh0bTBEb2I0VFViZjNmUldYVHpNeWRQNEFPZEFaTXU3cnBHblg0PQ==';
  const baseUrl = 'https://ap7.ragic.com/xinsheng/ragicforms4/20004';
  const testLineId = 'U1377e3b691add6a9b93699eb02dea502'; // 莊柏彥
  
  console.log('🔍 使用新 API Key 和正確欄位名稱測試...');
  console.log('');

  // 使用中文欄位名稱 "個人LINE ID" 進行查詢
  console.log('🎯 使用欄位名稱 "個人LINE ID" 查詢...');
  try {
    const queryUrl = `${baseUrl}?v=3&api&where=個人LINE ID,eq,${encodeURIComponent(testLineId)}`;
    console.log('🔗 查詢URL:', queryUrl);
    
    const response = await fetch(queryUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Basic ${newApiKey}`,
        'Accept': 'application/json'
      }
    });
    
    console.log(`📡 狀態: ${response.status}`);
    
    if (response.status === 200) {
      const data = await response.json();
      
      if (data.status === 'ERROR') {
        console.log(`❌ 錯誤: ${data.msg}`);
      } else if (typeof data === 'object' && !Array.isArray(data)) {
        // RAGIC 返回格式：{"recordId": {資料}}
        const recordIds = Object.keys(data);
        console.log(`✅ 查詢成功！找到 ${recordIds.length} 筆記錄`);
        
        if (recordIds.length > 0) {
          const firstRecordId = recordIds[0];
          const employee = data[firstRecordId];
          
          console.log('\n📋 員工完整資料:');
          console.log(`  記錄ID: ${firstRecordId}`);
          console.log(`  個人LINE ID: ${employee['個人LINE ID']}`);
          console.log(`  員工編號: ${employee['員工編號']}`);
          console.log(`  姓名: ${employee['姓名']}`);
          console.log(`  部門: ${employee['部門']}`);
          console.log(`  職稱: ${employee['職稱']}`);
          console.log(`  在職狀態: ${employee['在職狀態']}`);
          console.log(`  直屬主管: ${employee['直屬主管']}`);
          console.log(`  到職日期: ${employee['到職日期']}`);
          console.log(`  工作年資: ${employee['工作年資']}`);
          console.log(`  手機: ${employee['手機']}`);
          console.log(`  Email: ${employee['E-mail']}`);
          
          return true;
        }
      } else if (Array.isArray(data)) {
        console.log(`✅ 查詢成功！找到 ${data.length} 筆記錄（陣列格式）`);
        if (data.length > 0) {
          const employee = data[0];
          console.log('\n📋 員工資料:');
          console.log(`  個人LINE ID: ${employee['個人LINE ID']}`);
          console.log(`  員工編號: ${employee['員工編號']}`);
          console.log(`  姓名: ${employee['姓名']}`);
        }
        return true;
      } else {
        console.log('⚠️ 查無資料');
        return false;
      }
    } else {
      console.log(`❌ HTTP 錯誤: ${response.status}`);
      return false;
    }
  } catch (error) {
    console.log(`💥 查詢失敗: ${(error as Error).message}`);
    return false;
  }
  
  return false;
}

// 運行測試
testWithCorrectField().then((success) => {
  if (success) {
    console.log('\n🎉 新 API Key + 正確欄位名稱 = 查詢成功！');
    console.log('✅ 系統現在可以正常運作');
  } else {
    console.log('\n❌ 測試失敗');
  }
  process.exit(success ? 0 : 1);
}).catch((error) => {
  console.error('💥 測試過程發生錯誤:', error);
  process.exit(1);
});