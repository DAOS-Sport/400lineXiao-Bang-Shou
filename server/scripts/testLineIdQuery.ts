/**
 * 測試指定 LINE ID 的查詢
 */

import { ragicService } from '../services/ragicService';

async function testLineIdQuery() {
  const testLineId = 'U1377e3b691add6a9b93699eb02dea502';
  
  console.log('🔍 開始測試 LINE ID 查詢...');
  console.log('🆔 測試 LINE ID:', testLineId);
  console.log('');
  
  try {
    // 1. 測試完整員工資料查詢
    console.log('1️⃣ 測試 getEmployeeDetailsByLineId...');
    const employeeDetails = await ragicService.getEmployeeDetailsByLineId(testLineId);
    
    if (employeeDetails) {
      console.log('✅ 查詢成功！員工資料:');
      console.log('   員工編號:', employeeDetails.employeeId);
      console.log('   姓名:', employeeDetails.employeeName);
      console.log('   部門:', employeeDetails.department);
      console.log('   在職狀態:', employeeDetails.employmentStatus);
      console.log('   是否在職:', employeeDetails.isActive);
    } else {
      console.log('❌ 查詢失敗：未找到員工資料');
    }
    
    console.log('');
    
    // 2. 測試簡單員工編號查詢
    console.log('2️⃣ 測試 getEmployeeByLineId...');
    const employeeId = await ragicService.getEmployeeByLineId(testLineId);
    
    if (employeeId) {
      console.log('✅ 查詢成功！員工編號:', employeeId);
    } else {
      console.log('❌ 查詢失敗：未找到員工編號');
    }
    
  } catch (error) {
    console.error('❌ 測試過程中發生錯誤:', error);
  }
}

// 運行測試
testLineIdQuery().then(() => {
  console.log('🏁 測試完成');
  process.exit(0);
}).catch((error) => {
  console.error('💥 測試失敗:', error);
  process.exit(1);
});