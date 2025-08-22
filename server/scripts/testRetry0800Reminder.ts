#!/usr/bin/env tsx
// 重新測試 08:00 任務提醒推播

import { schedulerService } from '../services/schedulerService';
import { storage } from '../storage';

async function testRetry0800Reminder() {
  console.log('🔄 重新執行 08:00 任務提醒推播...');
  console.log('📊 測試升級後的配額是否正常');
  
  const startTime = Date.now();
  
  try {
    console.log('\n🚀 開始重新推播所有群組的 08:00 任務提醒...');
    
    // 手動觸發任務摘要，模擬 08:00 排程
    await schedulerService.manualTriggerTaskSummary();
    
    const duration = Date.now() - startTime;
    console.log(`⏱️ 推播完成，總耗時: ${Math.round(duration / 1000)} 秒`);
    
    // 檢查推播結果
    console.log('\n📊 檢查推播結果...');
    const recentLogs = await storage.getAuditLogs(30);
    const pushLogs = recentLogs.filter(log => 
      (log.category === 'scheduler' || log.category === 'line_api') && 
      log.timestamp > new Date(startTime)
    );
    
    const successCount = pushLogs.filter(log => 
      log.message.includes('任務提醒完成') || log.message.includes('推播成功')
    ).length;
    
    const errorCount = pushLogs.filter(log => 
      log.level === 'error' && log.message.includes('推送')
    ).length;
    
    console.log(`\n📈 推播統計：`);
    console.log(`✅ 成功: ${successCount} 個群組`);
    console.log(`❌ 失敗: ${errorCount} 個群組`);
    
    if (errorCount === 0) {
      console.log('\n🎉 太棒了！所有群組都推播成功！');
      console.log('✅ LINE Bot 升級已生效');
      console.log('✅ 新的限速機制運作正常');
    } else {
      console.log('\n⚠️ 部分群組推播失敗，檢查詳細錯誤：');
      const errorLogs = pushLogs.filter(log => log.level === 'error');
      errorLogs.forEach(log => {
        console.log(`❌ ${log.message}:`, log.details);
      });
    }
    
    console.log('\n✅ 08:00 任務提醒重新推播測試完成！');
    
  } catch (error) {
    console.error('❌ 推播測試失敗:', error);
  } finally {
    // 延遲確保所有異步操作完成
    await new Promise(resolve => setTimeout(resolve, 2000));
    process.exit(0);
  }
}

// 執行測試
testRetry0800Reminder();