#!/usr/bin/env tsx
// 測試改進後的任務提醒機制

import { schedulerService } from '../services/schedulerService';
import { storage } from '../storage';

async function testImprovedReminder() {
  console.log('🧪 測試改進後的任務提醒機制...');
  console.log('📊 新機制特色：');
  console.log('  - 隨機抖動 0-20 秒避免同時請求');
  console.log('  - 群組間延遲 300-500ms');
  console.log('  - 指數退避重試機制');
  console.log('  - 詳細錯誤記錄');
  console.log('  - 跳過無任務群組');
  
  try {
    // 檢查有任務的群組數量
    const allPendingTasks = await storage.getTasksByStatus('pending');
    const groupTaskCounts = new Map<string, number>();
    
    allPendingTasks.forEach(task => {
      const count = groupTaskCounts.get(task.groupId) || 0;
      groupTaskCounts.set(task.groupId, count + 1);
    });
    
    console.log(`\n📋 發現 ${groupTaskCounts.size} 個群組有待處理任務：`);
    groupTaskCounts.forEach((count, groupId) => {
      console.log(`  - ${groupId.substring(0, 8)}...：${count} 個任務`);
    });
    
    console.log('\n🚀 開始執行改進後的任務提醒...');
    const startTime = Date.now();
    
    // 手動觸發任務摘要
    await schedulerService.manualTriggerTaskSummary();
    
    const duration = Date.now() - startTime;
    console.log(`⏱️ 執行完成，總耗時: ${Math.round(duration / 1000)} 秒`);
    
    // 檢查最近的錯誤記錄
    console.log('\n📊 檢查執行結果...');
    const recentLogs = await storage.getAuditLogs(20);
    const schedulerLogs = recentLogs.filter(log => 
      log.category === 'scheduler' && 
      log.timestamp > new Date(startTime)
    );
    
    console.log(`📝 本次執行產生 ${schedulerLogs.length} 條記錄：`);
    schedulerLogs.forEach(log => {
      const level = log.level === 'error' ? '❌' : '✅';
      console.log(`  ${level} ${log.message}`);
    });
    
    console.log('\n✅ 改進後任務提醒測試完成！');
    
  } catch (error) {
    console.error('❌ 測試失敗:', error);
  } finally {
    // 延遲 2 秒確保所有異步操作完成
    await new Promise(resolve => setTimeout(resolve, 2000));
    process.exit(0);
  }
}

// 執行測試
testImprovedReminder();