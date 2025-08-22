#!/usr/bin/env tsx
// 測試詳細錯誤記錄功能

import { lineService } from '../services/lineService';
import { storage } from '../storage';

async function testDetailedErrorLog() {
  console.log('🧪 測試 LINE API 詳細錯誤記錄...');
  
  try {
    // 嘗試推送一個測試訊息到有任務的群組
    const testGroupId = 'C66a4b3bb3fbc3dcf52d42626ec512484'; // 使用一個有任務的群組
    const testMessage = '🧪 測試訊息 - 檢查詳細錯誤記錄功能';
    
    console.log(`📤 嘗試推送測試訊息到群組 ${testGroupId.substring(0, 8)}...`);
    
    await lineService.pushMessage(testGroupId, testMessage);
    console.log('✅ 推送成功！');
    
  } catch (error) {
    console.log('❌ 推送失敗，這是預期的，讓我們檢查詳細錯誤記錄...');
    
    // 查看最新的錯誤記錄
    const recentLogs = await storage.getAuditLogs(10);
    const errorLogs = recentLogs.filter(log => 
      log.category === 'line_api' && 
      log.timestamp > new Date(Date.now() - 60000) // 最近1分鐘
    );
    
    console.log(`\n📊 找到 ${errorLogs.length} 條 LINE API 相關記錄：`);
    
    errorLogs.forEach((log, index) => {
      console.log(`\n${index + 1}. [${log.level.toUpperCase()}] ${log.message}`);
      console.log('   詳細資訊：', JSON.stringify(log.details, null, 2));
    });
  }
  
  console.log('\n✅ 詳細錯誤記錄測試完成！');
  
  // 延遲確保所有異步操作完成
  await new Promise(resolve => setTimeout(resolve, 2000));
  process.exit(0);
}

// 執行測試
testDetailedErrorLog();