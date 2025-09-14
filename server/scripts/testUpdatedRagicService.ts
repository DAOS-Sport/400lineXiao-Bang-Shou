/**
 * 測試更新後的 RAGIC 服務
 * 驗證是否能正確提取員工編號
 */

import { ragicService } from '../services/ragicService';

async function testUpdatedRagicService() {
  console.log('🧪 測試更新後的 RAGIC 服務...');
  
  // 測試目標資料
  const testLineId = 'U1377e3b691add6a9b93699eb02dea502';
  const expectedEmployeeId = '1305374';
  
  console.log('🎯 測試設定:');
  console.log(`  LINE ID: ${testLineId}`);
  console.log(`  預期員工編號: ${expectedEmployeeId}`);
  
  try {
    console.log('\n🔍 呼叫 RAGIC 服務查詢員工編號...');
    const startTime = Date.now();
    
    const result = await ragicService.getEmployeeByLineId(testLineId);
    
    const elapsed = Date.now() - startTime;
    console.log(`⏱️ 查詢耗時: ${elapsed}ms`);
    
    if (result) {
      console.log(`✅ 成功取得員工編號: ${result}`);
      
      if (result === expectedEmployeeId) {
        console.log('🎉 結果正確! 與預期員工編號一致');
      } else {
        console.log(`⚠️ 結果不符預期:`);
        console.log(`  實際值: ${result}`);
        console.log(`  預期值: ${expectedEmployeeId}`);
      }
      
    } else {
      console.log('❌ 查詢失敗，未找到員工編號');
    }
    
    // 測試連線功能
    console.log('\n🔗 測試 RAGIC 連線...');
    const connectionResult = await ragicService.testConnection();
    console.log(`📡 連線測試結果: ${connectionResult ? '成功' : '失敗'}`);
    
  } catch (error) {
    console.error('❌ 測試過程發生錯誤:', error);
  }
  
  // 額外測試一些邊界情況
  console.log('\n🧪 測試邊界情況...');
  
  // 測試不存在的 LINE ID
  try {
    const nonExistentLineId = 'U0000000000000000000000000000000';
    console.log(`🔍 測試不存在的 LINE ID: ${nonExistentLineId}`);
    
    const result2 = await ragicService.getEmployeeByLineId(nonExistentLineId);
    
    if (result2) {
      console.log(`⚠️ 意外取得結果: ${result2} (應該為 null)`);
    } else {
      console.log('✅ 正確回傳 null (查無資料)');
    }
    
  } catch (error) {
    console.log('✅ 正確處理不存在的 LINE ID 錯誤');
  }
  
  // 測試空字串
  try {
    console.log('🔍 測試空字串...');
    const result3 = await ragicService.getEmployeeByLineId('');
    
    if (!result3) {
      console.log('✅ 正確處理空字串');
    } else {
      console.log(`⚠️ 空字串意外取得結果: ${result3}`);
    }
    
  } catch (error) {
    console.log('✅ 正確處理空字串錯誤');
  }
  
  console.log('\n🏁 RAGIC 服務測試完成');
}

// 執行測試
testUpdatedRagicService().catch(console.error);

export { testUpdatedRagicService };