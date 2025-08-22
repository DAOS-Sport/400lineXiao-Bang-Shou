#!/usr/bin/env tsx
// 檢查最近的交辦任務

import { storage } from '../storage';

async function checkRecentTask() {
  try {
    const groupId = 'C6f6f163895d5b528a6ab044015e1a37b';
    console.log(`🔍 檢查群組 ${groupId} 的任務狀況...`);
    
    // 獲取該群組的任務
    const tasks = await storage.getTasksByGroupId(groupId, 'pending');
    console.log(`📋 找到 ${tasks.length} 個待辦任務`);
    
    // 顯示最近3個任務
    const recentTasks = tasks.slice(-3);
    recentTasks.forEach((task, index) => {
      console.log(`\n${index + 1}. 任務 ${task.taskIdSerial}`);
      console.log(`   內容: ${task.text.substring(0, 100)}${task.text.length > 100 ? '...' : ''}`);
      console.log(`   創建時間: ${task.createdAt.toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' })}`);
      console.log(`   狀態: ${task.status}`);
    });
    
    // 檢查最近的系統記錄
    console.log('\n📊 檢查最近的系統記錄...');
    const logs = await storage.getAuditLogs(10);
    const taskLogs = logs.filter(log => 
      log.message.includes('交辦') || 
      log.message.includes('任務') ||
      log.message.includes('建立')
    );
    
    console.log(`📝 找到 ${taskLogs.length} 條任務相關記錄:`);
    taskLogs.slice(0, 5).forEach(log => {
      console.log(`  ${log.level.toUpperCase()}: ${log.message}`);
      console.log(`    時間: ${log.timestamp.toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' })}`);
      if (log.details && typeof log.details === 'object' && 'groupId' in log.details) {
        console.log(`    群組: ${(log.details as any).groupId}`);
      }
    });
    
  } catch (error) {
    console.error('❌ 檢查失敗:', error);
  } finally {
    process.exit(0);
  }
}

checkRecentTask();