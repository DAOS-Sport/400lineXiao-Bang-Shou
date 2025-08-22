#!/usr/bin/env tsx
// 測試任務完成的完整回覆流程

import { taskService } from '../services/taskService';
import { storage } from '../storage';
import crypto from 'crypto';

async function testCompleteTaskReply() {
  console.log('🧪 測試任務完成回覆流程...');
  
  const groupId = 'C2dd9a5fce7c276f2cbfdd02c2342661c';
  const userId = 'U_test_user';
  
  try {
    // 1. 重新創建一個測試任務
    console.log('📝 創建新的測試任務...');
    const testTask = {
      id: crypto.randomUUID(),
      groupId,
      taskIdSerial: '06',
      text: '測試任務：準備會議資料並發送給相關人員',
      status: 'pending' as const,
      createdBy: userId,
      createdAt: new Date(),
      completedAt: null,
      completedBy: null
    };
    
    // 手動插入測試任務
    await storage.insertTask(testTask);
    console.log(`✅ 測試任務已創建: 任務${testTask.taskIdSerial}`);
    
    // 2. 驗證任務存在
    const tasks = await storage.getTasksByGroupId(groupId, 'pending');
    const task = tasks.find(t => t.taskIdSerial === '06');
    
    if (!task) {
      console.error('❌ 測試任務創建失敗');
      return;
    }
    
    console.log(`📋 找到測試任務: ${task.text}`);
    
    // 3. 測試完成流程
    console.log('🚀 開始測試完成流程...');
    const text = '任務06完成';
    const completeTaskPattern = /^(交辦|任務)(\d+)(完成|已完成)$/i;
    const match = text.match(completeTaskPattern);
    
    if (match) {
      const taskType = match[1];
      const taskSerial = match[2].padStart(2, '0');
      console.log(`✅ 正則匹配成功: ${taskType}${taskSerial}完成`);
      
      // 4. 完成任務
      const success = await taskService.completeTaskBySerial(groupId, taskSerial, userId);
      
      if (success) {
        console.log(`✅ 任務標記完成成功`);
        
        // 5. 生成感謝訊息
        console.log('💝 生成感謝訊息...');
        const thankYouMessage = await taskService.generateCompletionMessage(task.text);
        console.log(`💝 感謝訊息: "${thankYouMessage}"`);
        
        // 6. 組合回覆訊息
        const replyText = `✅ ${taskType}${taskSerial}已完成！\n${thankYouMessage}`;
        console.log(`📤 完整回覆訊息:`);
        console.log('---');
        console.log(replyText);
        console.log('---');
        
        // 7. 驗證任務狀態
        const updatedTasks = await storage.getTasksByGroupId(groupId, 'pending');
        const completedTasks = await storage.getTasksByGroupId(groupId, 'completed');
        console.log(`📊 剩餘待辦: ${updatedTasks.length}, 已完成: ${completedTasks.length}`);
        
        console.log('✅ 任務完成回覆流程測試成功！');
      } else {
        console.log('❌ 任務完成失敗');
      }
    } else {
      console.log('❌ 正則匹配失敗');
    }
    
  } catch (error) {
    console.error('❌ 測試失敗:', error);
  } finally {
    // 清理測試數據
    try {
      const completedTasks = await storage.getTasksByGroupId(groupId, 'completed');
      const testTask = completedTasks.find(t => t.taskIdSerial === '06');
      if (testTask) {
        console.log('🧹 清理測試任務...');
        // 這裡可以添加刪除邏輯，但通常保留記錄更好
      }
    } catch (cleanupError) {
      console.warn('⚠️ 清理失敗:', cleanupError);
    }
    
    console.log('\n✅ 測試完成！');
    process.exit(0);
  }
}

testCompleteTaskReply();