#!/usr/bin/env tsx
// 測試任務完成功能

import { taskService } from '../services/taskService';
import { storage } from '../storage';

async function testTaskCompletion() {
  console.log('🧪 測試任務完成功能...');
  
  const testGroupId = 'C6f6f163895d5b528a6ab044015e1a37b';
  const testUserId = 'U_test_user';
  
  try {
    // 1. 檢查現有任務
    const tasks = await storage.getTasksByGroupId(testGroupId, 'pending');
    console.log(`📋 找到 ${tasks.length} 個待辦任務`);
    
    if (tasks.length === 0) {
      console.log('⚠️ 沒有待辦任務可測試');
      return;
    }
    
    const firstTask = tasks[0];
    console.log(`🎯 準備完成任務: ${firstTask.taskIdSerial} - ${firstTask.text.substring(0, 50)}...`);
    
    // 2. 測試任務完成
    console.log(`🚀 開始完成任務 ${firstTask.taskIdSerial}...`);
    const success = await taskService.completeTaskBySerial(testGroupId, firstTask.taskIdSerial, testUserId);
    
    if (success) {
      console.log(`✅ 任務完成標記成功！`);
      
      // 3. 測試生成溫馨訊息
      console.log('💝 測試生成感謝訊息...');
      const thankYouMessage = await taskService.generateCompletionMessage(firstTask.text);
      console.log(`💬 GPT 生成的感謝訊息: "${thankYouMessage}"`);
      
      // 4. 驗證任務狀態
      const updatedTasks = await storage.getTasksByGroupId(testGroupId, 'pending');
      console.log(`📊 完成後剩餘待辦任務: ${updatedTasks.length} 個`);
      
      const completedTasks = await storage.getTasksByGroupId(testGroupId, 'completed');
      console.log(`✅ 已完成任務總數: ${completedTasks.length} 個`);
      
      // 5. 檢查 audit logs
      console.log('\n📊 檢查完成記錄...');
      const recentLogs = await storage.getAuditLogs(5);
      const completionLogs = recentLogs.filter(log => log.message.includes('完成'));
      
      console.log(`📝 找到 ${completionLogs.length} 條完成記錄:`);
      completionLogs.forEach(log => {
        console.log(`  ${log.level.toUpperCase()}: ${log.message}`);
        console.log(`    時間: ${log.timestamp.toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' })}`);
      });
      
    } else {
      console.log('❌ 任務完成失敗');
    }
    
  } catch (error) {
    console.error('❌ 測試失敗:', error);
  } finally {
    console.log('\n✅ 任務完成功能測試結束！');
    process.exit(0);
  }
}

testTaskCompletion();